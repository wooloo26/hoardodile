import { createWriteStream } from "node:fs"
import { mkdir, rename, rm, stat } from "node:fs/promises"
import { dirname } from "node:path"
import type { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { notFound } from "@hoardodile/shared"
import {
	SOURCE_ARCHIVE_NAME,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { readFileRange, readZipRange } from "./archive.ts"
import type { ZipCdCache } from "./zip-cd-cache.ts"

/** Process-wide single-flight guard for zip-entry extraction. */
const globalExtractInflight = new Map<string, Promise<string>>()

function extractInflightKey(
	resId: string,
	fileVersion: number,
	relPath: string,
): string {
	return `${resId}@${fileVersion}:${relPath}`
}

async function statValidCache(
	cachePath: string,
	expectedSize: number,
): Promise<boolean> {
	const info = await stat(cachePath).catch(() => undefined)
	if (!info?.isFile()) return false
	if (info.size !== expectedSize) {
		await rm(cachePath, { force: true }).catch(() => {})
		return false
	}
	return true
}

/**
 * Read-side view over a resource's source artifact (the post-commit
 * shape on disk: a single STORED `source.hoard` zip). The view presents
 * a single interface so callers (plugin runtime, thumbnail pipeline,
 * HTTP read route) don't branch on storage shape at every step.
 *
 * All `relPath` arguments are entry names as they appear inside the
 * archive (may contain `/`).
 */
export type SourceArtifactView = {
	readonly resId: string
	readonly fileVersion: number
	readonly kind: "zip" | "empty"
	/**
	 * Absolute on-disk path of the canonical artifact. Empty string
	 * when `kind === "empty"` (no artifact committed yet).
	 */
	readonly artifactPath: string
	/** List every entry name in the artifact. Always flat. */
	listEntries(): Promise<readonly string[]>
	/** Stream-read `relPath` into a Buffer. */
	readEntry(relPath: string): Promise<Buffer>
	/**
	 * Read the byte range `[start, end)` of `relPath` (`end` exclusive).
	 * The range is clamped to the entry size; an out-of-range start
	 * resolves to an empty buffer.
	 */
	readEntrySlice(relPath: string, start: number, end: number): Promise<Buffer>
	/**
	 * Stream entry bytes directly from `source.hoard` without writing to
	 * the extracted cache. Prefer this for thumb/probe paths.
	 */
	openEntryStream(
		relPath: string,
	): Promise<{ readonly stream: Readable; readonly size: number }>
	/**
	 * Resolve `relPath` to an absolute path on disk and call `fn(path)`.
	 * For zip-backed entries the bytes are extracted once into a
	 * versioned cache under `local/resources/<id>/extracted/` and reused
	 * across calls until derived artifacts are cleared.
	 */
	withMaterializedEntry<T>(
		relPath: string,
		fn: (path: string) => Promise<T>,
	): Promise<T>
	/**
	 * Alias for {@link withMaterializedEntry} — use when the consumer
	 * requires a seekable filesystem path (e.g. ffmpeg mid-file seek).
	 */
	withSeekableEntry<T>(
		relPath: string,
		fn: (path: string) => Promise<T>,
	): Promise<T>
	/**
	 * Locate `relPath` inside the artifact and return its absolute byte
	 * range plus content length, suitable for `createReadStream` with a
	 * `{ start, end }` window. Returns `undefined` when `relPath` is not
	 * found.
	 */
	resolveByteRange(relPath: string): Promise<ResolvedByteRange | undefined>
}

export type ResolvedByteRange = {
	readonly path: string
	readonly start: number
	readonly end: number
	readonly size: number
	readonly mtimeMs: number
}

export type SourceArtifactSpec =
	| { readonly kind: "zip"; readonly archivePath: string }
	| { readonly kind: "empty" }

export type SourceViewDeps = {
	readonly paths: StoragePaths
	readonly zipCdCache: ZipCdCache
}

/**
 * Build a {@link SourceArtifactView} for `(resId, fileVersion, spec)`.
 * The view is cheap to construct — caches and file handles are
 * acquired lazily on first call.
 */
export function buildSourceArtifactView(
	deps: SourceViewDeps,
	resId: string,
	fileVersion: number,
	spec: SourceArtifactSpec,
): SourceArtifactView {
	if (spec.kind === "empty") {
		return buildEmptyView(resId, fileVersion)
	}
	return buildZipView(deps, resId, fileVersion, spec.archivePath)
}

function buildEmptyView(
	resId: string,
	fileVersion: number,
): SourceArtifactView {
	function fail(relPath: string): never {
		throw notFound(
			"resource.file_not_found",
			`resource ${resId} has no source artifact yet`,
			{ resId, relPath },
		)
	}

	async function listEntries(): Promise<readonly string[]> {
		return []
	}

	async function readEntry(relPath: string): Promise<Buffer> {
		return fail(relPath)
	}

	async function readEntrySlice(relPath: string): Promise<Buffer> {
		return fail(relPath)
	}

	async function openEntryStream(_relPath: string): Promise<{
		readonly stream: Readable
		readonly size: number
	}> {
		return fail(_relPath)
	}

	async function withMaterializedEntry<T>(
		relPath: string,
		_fn: (path: string) => Promise<T>,
	): Promise<T> {
		return fail(relPath)
	}

	async function withSeekableEntry<T>(
		relPath: string,
		fn: (path: string) => Promise<T>,
	): Promise<T> {
		return withMaterializedEntry(relPath, fn)
	}

	async function resolveByteRange(
		_relPath: string,
	): Promise<ResolvedByteRange | undefined> {
		return undefined
	}

	return {
		resId,
		fileVersion,
		kind: "empty",
		artifactPath: "",
		listEntries,
		readEntry,
		readEntrySlice,
		openEntryStream,
		withMaterializedEntry,
		withSeekableEntry,
		resolveByteRange,
	}
}

function buildZipView(
	deps: SourceViewDeps,
	resId: string,
	fileVersion: number,
	archivePath: string,
): SourceArtifactView {
	async function listEntries(): Promise<readonly string[]> {
		const records = await deps.zipCdCache.list(resId, fileVersion, archivePath)
		return records.map((r) => r.name)
	}

	async function readEntry(relPath: string): Promise<Buffer> {
		const range = await resolveByteRange(relPath)
		if (range === undefined) {
			throw notFound(
				"resource.file_not_found",
				`zip resource ${resId} has no entry ${relPath}`,
				{ resId, relPath },
			)
		}
		return readSlice(range.path, range.start, range.end)
	}

	async function readEntrySlice(
		relPath: string,
		start: number,
		end: number,
	): Promise<Buffer> {
		const range = await resolveByteRange(relPath)
		if (range === undefined) {
			throw notFound(
				"resource.file_not_found",
				`zip resource ${resId} has no entry ${relPath}`,
				{ resId, relPath },
			)
		}
		const clampedStart = Math.min(Math.max(0, start), range.size)
		const clampedEnd = Math.min(Math.max(clampedStart, end), range.size)
		if (clampedEnd <= clampedStart) return Buffer.alloc(0)
		return readSlice(
			range.path,
			range.start + clampedStart,
			range.start + clampedEnd - 1,
		)
	}

	async function materializeToCache(
		relPath: string,
		range: ResolvedByteRange,
	): Promise<string> {
		const cachePath = deps.paths.local.resExtractedEntry(
			resId,
			fileVersion,
			relPath,
		)
		if (await statValidCache(cachePath, range.size)) {
			return cachePath
		}

		const inflightKey = extractInflightKey(resId, fileVersion, relPath)
		let pending = globalExtractInflight.get(inflightKey)
		if (pending === undefined) {
			pending = (async () => {
				if (await statValidCache(cachePath, range.size)) {
					return cachePath
				}
				await mkdir(dirname(cachePath), { recursive: true })
				const partial = `${cachePath}.partial-${process.pid}-${Date.now()}`
				try {
					await pipeline(
						readZipRange(range.path, range.start, range.end),
						createWriteStream(partial),
					)
					const written = await stat(partial)
					if (written.size !== range.size) {
						throw new Error(
							`extracted ${relPath} size mismatch: expected ${range.size}, got ${written.size}`,
						)
					}
					await rename(partial, cachePath)
				} catch (err) {
					await rm(partial, { force: true }).catch(() => {})
					await rm(cachePath, { force: true }).catch(() => {})
					throw err
				}
				return cachePath
			})()
			globalExtractInflight.set(inflightKey, pending)
			void pending.finally(() => globalExtractInflight.delete(inflightKey))
		}
		return pending
	}

	async function openEntryStream(relPath: string): Promise<{
		readonly stream: Readable
		readonly size: number
	}> {
		const range = await resolveByteRange(relPath)
		if (range === undefined) {
			throw notFound(
				"resource.file_not_found",
				`zip resource ${resId} has no entry ${relPath}`,
				{ resId, relPath },
			)
		}
		return {
			stream: readZipRange(range.path, range.start, range.end),
			size: range.size,
		}
	}

	async function withMaterializedEntry<T>(
		relPath: string,
		fn: (path: string) => Promise<T>,
	): Promise<T> {
		const range = await resolveByteRange(relPath)
		if (range === undefined) {
			throw notFound(
				"resource.file_not_found",
				`zip resource ${resId} has no entry ${relPath}`,
				{ resId, relPath },
			)
		}
		const cachePath = await materializeToCache(relPath, range)
		return fn(cachePath)
	}

	async function withSeekableEntry<T>(
		relPath: string,
		fn: (path: string) => Promise<T>,
	): Promise<T> {
		return withMaterializedEntry(relPath, fn)
	}

	async function resolveByteRange(
		relPath: string,
	): Promise<ResolvedByteRange | undefined> {
		const entry = await deps.zipCdCache.resolve(
			resId,
			fileVersion,
			archivePath,
			relPath,
		)
		if (entry === undefined) return undefined
		if (entry.compressionMethod !== 0) {
			throw new Error(
				`${SOURCE_ARCHIVE_NAME} for ${resId} contains non-STORED entry ${relPath} (method ${entry.compressionMethod}). Re-upload to rewrite.`,
			)
		}
		const info = await stat(archivePath).catch(() => undefined)
		if (info === undefined) return undefined
		const size = entry.uncompressedSize
		const end = size === 0 ? entry.dataOffset : entry.dataOffset + size - 1
		return {
			path: archivePath,
			start: entry.dataOffset,
			end,
			size,
			mtimeMs: info.mtimeMs,
		}
	}

	return {
		resId,
		fileVersion,
		kind: "zip",
		artifactPath: archivePath,
		listEntries,
		readEntry,
		readEntrySlice,
		openEntryStream,
		withMaterializedEntry,
		withSeekableEntry,
		resolveByteRange,
	}
}

async function readSlice(
	path: string,
	start: number,
	end: number,
): Promise<Buffer> {
	return readFileRange(path, start, end)
}

/**
 * Resolve `(resId, fileVersion)` into a {@link SourceArtifactSpec} by
 * inspecting `paths.atVersion(fileVersion).resource(id)`.
 *
 * Returns `{ kind: "zip" }` when `source.hoard` exists,
 * `{ kind: "empty" }` otherwise.
 */
export async function locateSourceArtifact(
	paths: StoragePaths,
	id: string,
	fileVersion: number,
): Promise<SourceArtifactSpec> {
	const archivePath = paths.atVersion(fileVersion).resSourceArchive(id)
	const info = await stat(archivePath).catch(() => undefined)
	if (info?.isFile()) {
		return { kind: "zip", archivePath }
	}
	return { kind: "empty" }
}
