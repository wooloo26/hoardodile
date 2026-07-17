import { randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { forbidden } from "@hoardodile/shared"
import { extractZipInto } from "./archive.ts"
import type { ResUploads } from "./upload.ts"

/**
 * One entry returned by {@link browseDirectory}. `kind` mirrors the
 * dirent shape so the frontend can distinguish navigable directories
 * from non-navigable files.
 */
export type DirEntry = {
	readonly name: string
	readonly kind: "dir" | "file"
}

/**
 * List the immediate children of `resolve(rootDir, subPath)`, filtering
 * out dotfiles and returning only directories and files. Used by the
 * folder-import UI to let the user navigate the shared folder or the
 * extracted contents of an uploaded zip.
 *
 * @throws `FORBIDDEN` when the resolved path escapes `guardRoot`.
 */
export async function browseDirectory(
	rootDir: string,
	subPath: string | undefined,
	guardRoot: string,
): Promise<readonly DirEntry[]> {
	const target = assertInsideGuard(rootDir, subPath, guardRoot)
	const entries = await readdir(target, { withFileTypes: true }).catch(
		() => [] as readonly never[],
	)
	const out: DirEntry[] = []
	for (const e of entries) {
		if (e.name.startsWith(".")) continue
		if (e.isDirectory()) {
			out.push({ name: e.name, kind: "dir" })
		} else if (e.isFile()) {
			out.push({ name: e.name, kind: "file" })
		}
	}
	return out.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, {
			sensitivity: "base",
			numeric: true,
		}),
	)
}

/**
 * Extract a previously uploaded zip (identified by `archiveFileId`) into a
 * temporary directory under `tmpBase`. The staged archive is discarded
 * after extraction — the extracted directory tree replaces it as the
 * import source.
 *
 * @returns The absolute path to the extraction directory, which the
 *   caller uses as `root` for subsequent browse/scan/import calls.
 */
export async function extractUploadedArchive(
	uploads: ResUploads,
	tmpBase: string,
	archiveFileId: string,
	maxExtractedBytes: number,
): Promise<string> {
	const incomingZip = await uploads.resolveStagedArchive(archiveFileId)
	if (incomingZip === undefined) {
		throw forbidden(
			"resource.upload_staging_not_found",
			`staged archive not found: ${archiveFileId}`,
			{ archiveFileId },
		)
	}
	const extractDir = resolve(tmpBase, `extract-${randomUUID()}`)
	await mkdir(extractDir, { recursive: true })
	try {
		await extractZipInto(
			createReadStream(incomingZip),
			extractDir,
			maxExtractedBytes,
		)
	} catch (err) {
		await rm(extractDir, { recursive: true, force: true }).catch(() => {})
		throw err
	} finally {
		await uploads.discardStagedFile(archiveFileId).catch(() => {})
	}
	return extractDir
}

/**
 * Remove extraction directories (`extract-*`) under `tmpBase` that are
 * older than `maxAgeMs`. Called at server startup to clean up abandoned
 * extractions from crashed imports. Best-effort — errors are swallowed.
 */
export async function cleanupOldExtractions(
	tmpBase: string,
	maxAgeMs: number,
): Promise<void> {
	const entries = await readdir(tmpBase, { withFileTypes: true }).catch(
		() => [] as readonly never[],
	)
	const now = Date.now()
	for (const e of entries) {
		if (!e.isDirectory()) continue
		if (!e.name.startsWith("extract-")) continue
		const dirPath = resolve(tmpBase, e.name)
		const info = await stat(dirPath).catch(() => undefined)
		if (info === undefined) continue
		if (now - info.mtimeMs > maxAgeMs) {
			await rm(dirPath, { recursive: true, force: true }).catch(() => {})
		}
	}
}

/**
 * Resolve `resolve(rootDir, subPath)` and verify the result stays within
 * `guardRoot`. The `guardRoot` is the outermost allowed ancestor — for
 * shared-folder browsing it is `SHARED_FOLDER_ROOT`, for zip extractions
 * it is the extraction directory itself.
 *
 * @throws `FORBIDDEN` when the resolved path escapes `guardRoot`.
 */
export function assertInsideGuard(
	rootDir: string,
	subPath: string | undefined,
	guardRoot: string,
): string {
	const target =
		subPath !== undefined ? resolve(rootDir, subPath) : resolve(rootDir)
	const base = resolve(guardRoot)
	if (target !== base && !target.startsWith(base + sep)) {
		throw forbidden(
			"resource.path_escape",
			`resolved path ${target} escapes allowed root ${base}`,
		)
	}
	return target
}

/**
 * Best-effort removal of everything under `tmpBase` on server startup.
 * Called once at boot to clear orphaned staging / extraction / preview
 * directories left behind by crashes or interrupted uploads. Errors are
 * swallowed so a single unremovable entry does not prevent startup.
 */
export async function cleanupTmpDir(tmpBase: string): Promise<void> {
	const entries = await readdir(tmpBase, { withFileTypes: true }).catch(
		() => [] as readonly never[],
	)
	await Promise.all(
		entries.map(async (e) => {
			const fullPath = resolve(tmpBase, e.name)
			if (e.isDirectory()) {
				await rm(fullPath, { recursive: true, force: true }).catch(() => {})
			} else {
				await rm(fullPath, { force: true }).catch(() => {})
			}
		}),
	)
}
