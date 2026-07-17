import { randomUUID } from "node:crypto"
import { stat } from "node:fs/promises"
import { extname } from "node:path"
import { invalid } from "@hoardodile/shared"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import { SOURCE_ARCHIVE_EXT } from "src/infra/storage/paths.ts"
import {
	findStagedArchiveFile,
	findStagedPoolFile,
	removeStagedPoolFile,
	writeStagedArchiveFile,
	writeStagedPoolFile,
} from "./staging-dir.ts"

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidFileId(value: unknown): value is string {
	return typeof value === "string" && UUID_RE.test(value)
}

/**
 * Result of staging a single file. The server mints the `fileId`; the
 * client references it later in an ordered list at commit time, or
 * deletes it via {@link StagingService.discardStagedFile}.
 */
export type StagedFile = {
	readonly fileId: string
	readonly stagedPath: string
}

export type StagingService = {
	/**
	 * Stream a single ordered file into the global staging pool. The
	 * `.hoard` extension is reserved for the canonical multi-file source
	 * archive and is rejected here.
	 */
	stageSingleFile(
		filename: string,
		stream: NodeJS.ReadableStream,
	): Promise<StagedFile>
	/**
	 * Stream a single archive (zip) upload into the global staging pool
	 * as `<fileId>.zip`. Rejects empty uploads.
	 */
	stageArchive(stream: NodeJS.ReadableStream): Promise<StagedFile>
	/** Remove a single staged file (ordered or archive) by `fileId`. */
	discardStagedFile(fileId: string): Promise<boolean>
	/** Resolve the on-disk path of a staged ordered file by `fileId`. */
	resolveStagedFile(fileId: string): Promise<string | undefined>
	/** Resolve the on-disk path of a staged archive by `fileId`. */
	resolveStagedArchive(fileId: string): Promise<string | undefined>
}

export function buildStagingService(paths: StoragePaths): StagingService {
	async function stageSingleFile(
		filename: string,
		stream: NodeJS.ReadableStream,
	): Promise<StagedFile> {
		const ext = extname(filename).toLowerCase()
		if (ext === SOURCE_ARCHIVE_EXT) {
			throw invalid(
				"resource.upload_reserved_ext",
				`extension ${SOURCE_ARCHIVE_EXT} is reserved for the multi-file archive`,
				{ ext },
			)
		}
		const fileId = randomUUID()
		const stagedPath = await writeStagedPoolFile(
			paths,
			fileId,
			filename,
			stream,
		)
		return { fileId, stagedPath }
	}

	async function stageArchive(
		stream: NodeJS.ReadableStream,
	): Promise<StagedFile> {
		const fileId = randomUUID()
		const stagedPath = await writeStagedArchiveFile(paths, fileId, stream)
		const info = await stat(stagedPath).catch(() => undefined)
		if (info === undefined || info.size === 0) {
			await removeStagedPoolFile(paths, fileId).catch(() => {})
			throw invalid(
				"resource.upload_empty_archive",
				"archive upload must not be empty",
			)
		}
		return { fileId, stagedPath }
	}

	async function discardStagedFile(fileId: string): Promise<boolean> {
		if (!isValidFileId(fileId)) return false
		return removeStagedPoolFile(paths, fileId)
	}

	async function resolveStagedFile(
		fileId: string,
	): Promise<string | undefined> {
		if (!isValidFileId(fileId)) return undefined
		return findStagedPoolFile(paths, fileId)
	}

	async function resolveStagedArchive(
		fileId: string,
	): Promise<string | undefined> {
		if (!isValidFileId(fileId)) return undefined
		return findStagedArchiveFile(paths, fileId)
	}

	return {
		stageSingleFile,
		stageArchive,
		discardStagedFile,
		resolveStagedFile,
		resolveStagedArchive,
	}
}
