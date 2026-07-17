import { mkdir, rename, rm } from "node:fs/promises"
import { extname } from "node:path"
import { invalid } from "@hoardodile/shared"
import type { MutableRef } from "src/infra/runtime-context.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import { writeVersioned } from "src/infra/write-versioned.ts"
import { packOrderedFilesToStoredZip, transcodeToStoredZip } from "./archive.ts"
import { findStagedArchiveFile, findStagedPoolFile } from "./staging-dir.ts"

export type CommitResult = {
	readonly archivePath: string
}

export type CommitServiceOptions = {
	/**
	 * Hard cap on the cumulative uncompressed byte size an archive upload
	 * is allowed to write. Defends against zip bombs whose compressed size
	 * sits below `MAX_UPLOAD_BYTES` but whose uncompressed payload could
	 * still exhaust the disk.
	 */
	readonly maxArchiveExtractedBytes: number
}

export type CommitService = {
	/**
	 * Commit an ordered resource whose files live in the global staging
	 * pool. `fileIds` defines the final entry order; each id must resolve
	 * to a staged pool file. On success the consumed pool files are
	 * removed; on failure they are left in place so the client can retry.
	 */
	commitOrderedByIds(
		id: string,
		fileIds: readonly string[],
	): Promise<CommitResult>
	/**
	 * Commit a resource whose source is a single staged archive (zip).
	 * The archive is transcoded to the canonical STORED encoding and
	 * atomically installed as `source.hoard`. On success the staged
	 * archive is removed; on failure it is left in place.
	 */
	commitArchiveById(id: string, archiveFileId: string): Promise<CommitResult>
}

export function buildCommitService(
	paths: StoragePaths,
	options: CommitServiceOptions,
	readOnly: MutableRef<boolean>,
): CommitService {
	/**
	 * Commit an ordered resource from the global single-file staging pool.
	 * Each `fileId` in `fileIds` must resolve to a staged pool file; the
	 * array order defines the final entry order inside the produced
	 * `source.hoard` archive (entries are numbered `1.<ext>`, `2.<ext>`, …).
	 * Consumed pool files are removed on success. On failure the pool files
	 * are left in place so the client can retry the commit.
	 */
	async function commitOrderedByIds(
		id: string,
		fileIds: readonly string[],
	): Promise<CommitResult> {
		if (fileIds.length === 0) {
			throw invalid(
				"resource.upload_missing_file_order",
				"fileIds is required for ordered uploads",
			)
		}
		const seen = new Set<string>()
		const resolved: { absPath: string; ext: string }[] = []
		for (const fileId of fileIds) {
			if (seen.has(fileId)) {
				throw invalid(
					"resource.upload_duplicate_file_id",
					`fileIds contains duplicate file id: ${fileId}`,
					{ fileId },
				)
			}
			seen.add(fileId)
			const stagedPath = await findStagedPoolFile(paths, fileId)
			if (stagedPath === undefined) {
				throw invalid(
					"resource.upload_missing_file",
					`file ${fileId} missing from staging pool`,
					{ fileId },
				)
			}
			resolved.push({
				absPath: stagedPath,
				ext: extname(stagedPath).toLowerCase(),
			})
		}

		const stagedZip = `${paths.local.stagingPoolRoot()}.${id}.packed-${Date.now()}.zip`

		try {
			const zipFiles = resolved.map((entry, idx) => ({
				absPath: entry.absPath,
				entryName: `${idx + 1}${entry.ext}`,
			}))
			await packOrderedFilesToStoredZip(zipFiles, stagedZip)
			const archivePath = await writeVersioned(
				paths,
				readOnly.current,
				async (current) => {
					const archivePath = current.resSourceArchive(id)
					let asidePath: string | undefined
					const stamp = Date.now()
					try {
						const { stat } = await import("node:fs/promises")
						const archiveInfo = await stat(archivePath).catch(() => undefined)
						if (archiveInfo?.isFile()) {
							asidePath = `${archivePath}.replacing-${stamp}`
							await rename(archivePath, asidePath)
						}
						await mkdir(current.resource(id), { recursive: true })
						await rename(stagedZip, archivePath)
					} catch (err) {
						if (asidePath !== undefined) {
							await rename(asidePath, archivePath).catch(() => {})
						}
						throw err
					} finally {
						if (asidePath !== undefined) {
							await rm(asidePath, { force: true }).catch(() => {})
						}
					}
					return archivePath
				},
			)
			// Only remove pool files once the artifact is safely installed.
			await Promise.all(
				fileIds.map((fileId) =>
					findStagedPoolFile(paths, fileId).then(
						(p) =>
							p === undefined
								? undefined
								: rm(p, { force: true }).catch(() => {}), // write-local-only
					),
				),
			)
			return { archivePath }
		} finally {
			await rm(stagedZip, { force: true }).catch(() => {}) // write-local-only
		}
	}

	/**
	 * Commit a resource whose source is a single staged archive (zip).
	 * The archive is transcoded to the canonical STORED encoding (or
	 * fast-pathed when already STORED) and atomically installed as
	 * `source.hoard`. The staged archive is removed on success.
	 */
	async function commitArchiveById(
		id: string,
		archiveFileId: string,
	): Promise<CommitResult> {
		const incomingPath = await findStagedArchiveFile(paths, archiveFileId)
		if (incomingPath === undefined) {
			throw invalid(
				"resource.upload_missing_file",
				`archive ${archiveFileId} missing from staging pool`,
				{ fileId: archiveFileId },
			)
		}

		const stagedOutput = `${incomingPath}.transcoded-${Date.now()}`

		try {
			const result = await transcodeToStoredZip(
				incomingPath,
				stagedOutput,
				options.maxArchiveExtractedBytes,
			)
			const finalSource = result.rewrote ? stagedOutput : incomingPath
			const archivePath = await writeVersioned(
				paths,
				readOnly.current,
				async (current) => {
					const archivePath = current.resSourceArchive(id)
					let asidePath: string | undefined
					const stamp = Date.now()
					try {
						const { stat } = await import("node:fs/promises")
						const archiveInfo = await stat(archivePath).catch(() => undefined)
						if (archiveInfo?.isFile()) {
							asidePath = `${archivePath}.replacing-${stamp}`
							await rename(archivePath, asidePath)
						}
						await mkdir(current.resource(id), { recursive: true })
						await rename(finalSource, archivePath)
					} catch (err) {
						if (asidePath !== undefined) {
							await rename(asidePath, archivePath).catch(() => {})
						}
						throw err
					} finally {
						if (asidePath !== undefined) {
							await rm(asidePath, { force: true }).catch(() => {})
						}
					}
					return archivePath
				},
			)
			// write-local-only: staged archive lives in local/.tmp/staging.
			if (result.rewrote) {
				await rm(incomingPath, { force: true }).catch(() => {})
			}
			return { archivePath }
		} finally {
			await rm(stagedOutput, { force: true }).catch(() => {}) // write-local-only
			// Remove the staged archive regardless of transcode path so it
			// does not leak in the pool after commit.
			await rm(incomingPath, { force: true }).catch(() => {}) // write-local-only
		}
	}

	return { commitOrderedByIds, commitArchiveById }
}
