import { createReadStream, createWriteStream, type ReadStream } from "node:fs"
import { readdir, stat, unlink } from "node:fs/promises"
import { join, normalize, relative, sep } from "node:path"
import { Transform } from "node:stream"
import { buffer } from "node:stream/consumers"
import { pipeline } from "node:stream/promises"
import { invalid } from "@hoardodile/shared"
import yauzl, { type Entry, type ZipFile } from "yauzl"
import yazl from "yazl"

/**
 * Pack progress reporter for {@link packDirToStoredZip}. Emitted once at
 * `started`, once per finished entry, once at `done`.
 */
export type PackProgressReporter = (event: PackProgressEvent) => void

export type PackProgressEvent =
	| { readonly phase: "started"; readonly totalEntries: number }
	| {
			readonly phase: "entry"
			readonly entriesDone: number
			readonly totalEntries: number
			readonly bytesDone: number
	  }
	| { readonly phase: "done" }

/**
 * Walk `srcDir` recursively and emit a STORED zip (no per-entry
 * compression) to `outZipPath`. Entry names use forward slashes and are
 * relative to `srcDir`. Symlinks and dotfiles starting with `.uploading-`
 * are skipped. Subdirectories are flattened into entry-name prefixes;
 * empty directories do not produce zip entries.
 *
 * STORED is mandatory because preview reads translate filename → byte
 * range against the produced zip. Adding compression would require
 * inflating per range request (~5x CPU) and break the "≈ direct IO"
 * guarantee.
 *
 * @throws DomainError `resource.archive_pack_failed` when the underlying
 *   pipeline rejects (disk full, permission denied, etc.).
 */
export async function packDirToStoredZip(
	srcDir: string,
	outZipPath: string,
	onProgress?: PackProgressReporter,
): Promise<void> {
	const entries = await collectFiles(srcDir)
	if (onProgress !== undefined) {
		onProgress({ phase: "started", totalEntries: entries.length })
	}
	const zip = new yazl.ZipFile()
	let entriesDone = 0
	let bytesDone = 0
	for (const ent of entries) {
		zip.addFile(ent.absPath, ent.relName, { compress: false })
	}
	zip.end()
	try {
		await pipeline(zip.outputStream, createWriteStream(outZipPath))
	} catch (err) {
		await unlink(outZipPath).catch(() => {})
		throw invalid(
			"resource.archive_pack_failed",
			err instanceof Error
				? err.message
				: "failed to write packed source archive",
			{ outZipPath },
		)
	}
	if (onProgress !== undefined) {
		for (const ent of entries) {
			entriesDone += 1
			bytesDone += ent.size
			onProgress({
				phase: "entry",
				entriesDone,
				totalEntries: entries.length,
				bytesDone,
			})
		}
		onProgress({ phase: "done" })
	}
}

export type OrderedZipFile = {
	readonly absPath: string
	readonly entryName: string
}

/**
 * Pack an explicitly ordered list of files into a STORED zip. The caller
 * controls both the entry order and the entry names; this is used when
 * committing an ordered upload whose staged files are named by stable
 * file IDs but must be packed as `1.ext`, `2.ext`, ... in the final
 * archive.
 */
export async function packOrderedFilesToStoredZip(
	files: readonly OrderedZipFile[],
	outZipPath: string,
): Promise<void> {
	const zip = new yazl.ZipFile()
	for (const file of files) {
		zip.addFile(file.absPath, file.entryName, { compress: false })
	}
	zip.end()
	try {
		await pipeline(zip.outputStream, createWriteStream(outZipPath))
	} catch (err) {
		await unlink(outZipPath).catch(() => {})
		throw invalid(
			"resource.archive_pack_failed",
			err instanceof Error
				? err.message
				: "failed to write ordered source archive",
			{ outZipPath },
		)
	}
}

/**
 * Transcode an uploaded zip into our canonical STORED form. Reads the
 * central directory of `inZipPath`; if every entry already uses STORED
 * (compression method 0) and every entry name passes our safety rules,
 * returns `{ rewrote: false }` so the caller can `rename(inZipPath,
 * outZipPath)` instead of paying for a stream-rewrite. Otherwise streams
 * each entry through yauzl's decompressor and re-encodes with yazl as a
 * STORED entry; the resulting zip is written to `outZipPath`.
 *
 * Defends against zip bombs via `maxExtractedBytes` (the cumulative
 * uncompressed byte budget across all entries).
 *
 * @throws DomainError `resource.archive_open_failed` when `inZipPath`
 *   cannot be parsed as a zip.
 * @throws DomainError `resource.archive_invalid_entry` when any entry
 *   name escapes or is otherwise unsafe.
 * @throws DomainError `resource.archive_too_large` when the cumulative
 *   uncompressed size exceeds `maxExtractedBytes`.
 */
export async function transcodeToStoredZip(
	inZipPath: string,
	outZipPath: string,
	maxExtractedBytes: number,
): Promise<{ readonly rewrote: boolean }> {
	const cd = await readCentralDirectory(inZipPath)
	let totalUncompressed = 0
	let needsRewrite = false
	for (const entry of cd) {
		if (entry.fileName.endsWith("/")) continue // skip directory entries
		assertSafeEntryName(entry.fileName)
		totalUncompressed += entry.uncompressedSize
		if (totalUncompressed > maxExtractedBytes) {
			throw invalid(
				"resource.archive_too_large",
				`archive uncompressed size exceeds ${maxExtractedBytes} bytes`,
				{ maxExtractedBytes },
			)
		}
		if (entry.compressionMethod !== 0) needsRewrite = true
	}
	if (!needsRewrite) return { rewrote: false }

	const zip = new yazl.ZipFile()
	const zipfile = await openZipFromFile(inZipPath)
	try {
		await new Promise<void>((resolveDone, rejectDone) => {
			zipfile.on("error", rejectDone)
			zipfile.on("end", () => {
				zip.end()
				resolveDone()
			})
			zipfile.on("entry", (entry: Entry) => {
				if (entry.fileName.endsWith("/")) {
					zipfile.readEntry()
					return
				}
				openZipEntryStream(zipfile, entry).then(
					(stream) => {
						zip.addReadStream(stream, entry.fileName, {
							compress: false,
							size: entry.uncompressedSize,
						})
						zipfile.readEntry()
					},
					(err) => rejectDone(err),
				)
			})
			zipfile.readEntry()
		})
	} finally {
		zipfile.close()
	}
	try {
		await pipeline(zip.outputStream, createWriteStream(outZipPath))
	} catch (err) {
		await unlink(outZipPath).catch(() => {})
		throw invalid(
			"resource.archive_pack_failed",
			err instanceof Error
				? err.message
				: "failed to write transcoded source archive",
			{ outZipPath },
		)
	}
	return { rewrote: true }
}

/**
 * Central directory entry shape exposed for the read-path cache. Mirrors
 * the fields yauzl surfaces, plus `dataOffset` resolved from the local
 * header. `dataOffset` and `dataSize` together pinpoint the entry's raw
 * bytes inside the zip file; for STORED entries those bytes are the file
 * itself and can be streamed via {@link createReadStream} with a
 * `{ start, end }` window.
 */
export type ZipEntryRecord = {
	readonly name: string
	readonly compressionMethod: number
	readonly uncompressedSize: number
	readonly compressedSize: number
	readonly crc32: number
	readonly localHeaderOffset: number
	/**
	 * Absolute byte offset of the entry's raw data inside the zip file.
	 * Computed as `localHeaderOffset + 30 + nameLen + extraLen` where
	 * nameLen and extraLen are read from the local file header (not the
	 * central directory) because they can differ between the two.
	 */
	readonly dataOffset: number
	readonly dataSize: number
	readonly modifiedAt: number
}

/**
 * Read the central directory of `zipPath`, plus enough of each local file
 * header to compute `dataOffset`. Returns a flat list of records ready
 * for caching. Directory entries (names ending in `/`) are excluded.
 *
 * @throws DomainError `resource.archive_open_failed` when the zip cannot
 *   be parsed.
 */
export async function readZipEntries(
	zipPath: string,
): Promise<readonly ZipEntryRecord[]> {
	const cd = await readCentralDirectory(zipPath)
	const fileSize = (await stat(zipPath)).size
	const records: ZipEntryRecord[] = []
	for (const entry of cd) {
		if (entry.fileName.endsWith("/")) continue
		const dataOffset = await resolveDataOffset(
			zipPath,
			entry.relativeOffsetOfLocalHeader,
			fileSize,
		)
		records.push({
			name: entry.fileName,
			compressionMethod: entry.compressionMethod,
			uncompressedSize: entry.uncompressedSize,
			compressedSize: entry.compressedSize,
			crc32: entry.crc32,
			localHeaderOffset: entry.relativeOffsetOfLocalHeader,
			dataOffset,
			dataSize: entry.compressedSize,
			modifiedAt:
				typeof (entry as { getLastModDate?: () => Date }).getLastModDate ===
				"function"
					? (entry as { getLastModDate: () => Date }).getLastModDate().getTime()
					: 0,
		})
	}
	return records
}

type CollectedFile = {
	readonly absPath: string
	readonly relName: string
	readonly size: number
}

async function collectFiles(root: string): Promise<readonly CollectedFile[]> {
	const out: CollectedFile[] = []
	await collectInto(root, root, out)
	out.sort((a, b) =>
		a.relName.localeCompare(b.relName, undefined, { numeric: true }),
	)
	return out
}

async function collectInto(
	root: string,
	here: string,
	out: CollectedFile[],
): Promise<void> {
	const entries = await readdir(here, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name.startsWith(".uploading-")) continue
		const abs = join(here, entry.name)
		if (entry.isDirectory()) {
			await collectInto(root, abs, out)
			continue
		}
		if (!entry.isFile()) continue
		const info = await stat(abs)
		const relName = relative(root, abs).split(sep).join("/")
		out.push({ absPath: abs, relName, size: info.size })
	}
}

function assertSafeEntryName(rawName: string): void {
	if (rawName.length === 0) {
		throw invalid(
			"resource.archive_invalid_entry",
			"archive entry has empty name",
			{ rawName },
		)
	}
	if (/^([a-zA-Z]:)?[\\/]/.test(rawName)) {
		throw invalid(
			"resource.archive_invalid_entry",
			`archive entry has absolute path: ${rawName}`,
			{ rawName },
		)
	}
	const normalised = normalize(rawName).replace(/\\/g, "/")
	if (normalised.startsWith("../") || normalised === "..") {
		throw invalid(
			"resource.archive_invalid_entry",
			`archive entry escapes destination: ${rawName}`,
			{ rawName },
		)
	}
}

function openZipFromFile(zipPath: string): Promise<ZipFile> {
	return new Promise<ZipFile>((res, rej) => {
		yauzl.open(
			zipPath,
			{ lazyEntries: true },
			(err: Error | null, zip: ZipFile) => {
				if (err !== null || zip === undefined) {
					rej(
						invalid(
							"resource.archive_open_failed",
							err?.message ?? "could not open archive",
							{ zipPath },
						),
					)
					return
				}
				res(zip)
			},
		)
	})
}

async function readCentralDirectory(
	zipPath: string,
): Promise<readonly Entry[]> {
	const zipfile = await openZipFromFile(zipPath)
	const entries: Entry[] = []
	try {
		await new Promise<void>((resolveDone, rejectDone) => {
			zipfile.on("error", rejectDone)
			zipfile.on("end", resolveDone)
			zipfile.on("entry", (entry: Entry) => {
				entries.push(entry)
				zipfile.readEntry()
			})
			zipfile.readEntry()
		})
	} finally {
		zipfile.close()
	}
	return entries
}

function openZipEntryStream(
	zipfile: ZipFile,
	entry: Entry,
): Promise<NodeJS.ReadableStream> {
	return new Promise((res, rej) => {
		zipfile.openReadStream(entry, (err, stream) => {
			if ((err !== null && err !== undefined) || stream === undefined) {
				rej(
					invalid(
						"resource.archive_entry_unreadable",
						err?.message ?? `could not read archive entry: ${entry.fileName}`,
						{ entry: entry.fileName },
					),
				)
				return
			}
			res(stream)
		})
	})
}

/**
 * Read the local file header at `localHeaderOffset` and compute the
 * absolute byte offset where the entry's raw data begins. The local
 * header stores its own filename and extra-field lengths (which can
 * differ from the central directory's copy); the spec is explicit about
 * using the LH-local lengths for data offset calculations.
 */
async function resolveDataOffset(
	zipPath: string,
	localHeaderOffset: number,
	fileSize: number,
): Promise<number> {
	if (localHeaderOffset + 30 > fileSize) {
		throw invalid(
			"resource.archive_open_failed",
			`truncated local file header at offset ${localHeaderOffset}`,
			{ zipPath, localHeaderOffset },
		)
	}
	const head = await readFileRange(
		zipPath,
		localHeaderOffset,
		localHeaderOffset + 29,
	)
	if (head.length < 30) {
		throw invalid(
			"resource.archive_open_failed",
			`truncated local file header at offset ${localHeaderOffset}`,
			{ zipPath, localHeaderOffset },
		)
	}
	const sig = head.readUInt32LE(0)
	if (sig !== 0x04034b50) {
		throw invalid(
			"resource.archive_open_failed",
			`bad local file header signature at offset ${localHeaderOffset}`,
			{ zipPath, localHeaderOffset, sig: sig.toString(16) },
		)
	}
	const nameLen = head.readUInt16LE(26)
	const extraLen = head.readUInt16LE(28)
	return localHeaderOffset + 30 + nameLen + extraLen
}

/**
 * Transform that subtracts each chunk's size from a shared byte budget
 * and destroys itself with a VALIDATION error once the budget would go
 * negative. Used to defend against zip bombs across all entries in a
 * single archive.
 */
export function makeByteBudgetCounter(budget: {
	remaining: number
	readonly max: number
}): Transform {
	return new Transform({
		transform(chunk, _enc, cb) {
			const len = Buffer.isBuffer(chunk)
				? chunk.length
				: Buffer.byteLength(chunk)
			budget.remaining -= len
			if (budget.remaining < 0) {
				cb(
					invalid(
						"resource.archive_too_large",
						`archive extracts to more than ${budget.max} bytes`,
						{ maxExtractedBytes: budget.max },
					),
				)
				return
			}
			cb(undefined, chunk)
		},
	})
}

/** Stream `zipPath` bytes in the range `[start, end]` (inclusive). */
export function readZipRange(
	zipPath: string,
	start: number,
	end: number,
): ReadStream {
	return createReadStream(zipPath, { start, end })
}

/**
 * Read an inclusive byte range from `path`. Uses a read stream so offsets
 * beyond 2 GiB work on Node versions where `fs.read` position must fit in
 * Int32 (older releases assert instead of throwing).
 */
export async function readFileRange(
	path: string,
	start: number,
	end: number,
): Promise<Buffer> {
	if (
		!Number.isFinite(start) ||
		!Number.isFinite(end) ||
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		end < start
	) {
		throw invalid(
			"resource.file_read_failed",
			`invalid byte range ${start}..${end}`,
			{ path, start, end },
		)
	}
	const length = end - start + 1
	if (length <= 0) return Buffer.alloc(0)
	return buffer(readZipRange(path, start, end))
}

/**
 * Extraction progress reporter for {@link extractZipInto}. Plugin
 * installs are still the one path that benefits from a directory layout
 * (manifest.json + main.js + assets imported at runtime), so the
 * extract helper survives the resource-source rewrite for that caller.
 */
export type ExtractProgressReporter = (event: ExtractProgressEvent) => void

export type ExtractProgressEvent =
	| {
			readonly phase: "started"
			readonly totalEntries: number
			readonly totalBytes: number
	  }
	| {
			readonly phase: "entry"
			readonly entriesDone: number
			readonly totalEntries: number
			readonly bytesDone: number
			readonly totalBytes: number
	  }
	| { readonly phase: "done" }

/**
 * Stream a zip archive into `destDir`. Used by plugin installation
 * (the one workflow that still needs a directory layout). Resource
 * source uploads do NOT use this — they go through
 * {@link transcodeToStoredZip} or {@link packDirToStoredZip} to
 * produce a single canonical `source.hoard` archive instead.
 *
 * Refuses any entry whose normalised path escapes `destDir` (zip-slip)
 * or contains an absolute path / drive letter. Defends against zip
 * bombs via `maxExtractedBytes`.
 *
 * @throws DomainError VALIDATION when the archive is malformed,
 *   contains an unsafe entry, exceeds `maxExtractedBytes`, or is not
 *   a zip at all.
 */
export async function extractZipInto(
	source: NodeJS.ReadableStream,
	destDir: string,
	maxExtractedBytes: number,
	onProgress?: ExtractProgressReporter,
): Promise<void> {
	const buffer = await readToBuffer(source)
	const zipfile = await openZipFromBuffer(buffer)
	const root = await resolveDir(destDir)
	const budget = { remaining: maxExtractedBytes, max: maxExtractedBytes }
	const totalEntries = zipfile.entryCount
	const counters = { entriesDone: 0, bytesDone: 0, totalBytes: 0 }
	if (onProgress !== undefined) {
		onProgress({ phase: "started", totalEntries, totalBytes: 0 })
	}
	try {
		await new Promise<void>((resolveDone, rejectDone) => {
			zipfile.on("error", rejectDone)
			zipfile.on("end", resolveDone)
			zipfile.on("entry", (entry: Entry) => {
				handleExtractEntry(zipfile, entry, root, budget).then(() => {
					counters.entriesDone += 1
					counters.bytesDone += entry.uncompressedSize
					counters.totalBytes += entry.uncompressedSize
					if (onProgress !== undefined) {
						onProgress({
							phase: "entry",
							entriesDone: counters.entriesDone,
							totalEntries,
							bytesDone: counters.bytesDone,
							totalBytes: counters.totalBytes,
						})
					}
					zipfile.readEntry()
				}, rejectDone)
			})
			zipfile.readEntry()
		})
	} finally {
		zipfile.close()
	}
	if (onProgress !== undefined) {
		onProgress({ phase: "done" })
	}
}

async function resolveDir(destDir: string): Promise<string> {
	const { resolve } = await import("node:path")
	return resolve(destDir)
}

async function handleExtractEntry(
	zipfile: ZipFile,
	entry: Entry,
	root: string,
	budget: { remaining: number; readonly max: number },
): Promise<void> {
	const { mkdir } = await import("node:fs/promises")
	const { dirname, normalize, resolve, sep } = await import("node:path")
	const safe = safeExtractEntryPath(
		entry.fileName,
		root,
		normalize,
		resolve,
		sep,
	)
	if (entry.fileName.endsWith("/")) {
		await mkdir(safe, { recursive: true })
		return
	}
	await mkdir(dirname(safe), { recursive: true })
	const stream = await openZipEntryStream(zipfile, entry)
	await pipeline(stream, makeByteBudgetCounter(budget), createWriteStream(safe))
}

function safeExtractEntryPath(
	rawName: string,
	root: string,
	normalize: (p: string) => string,
	resolve: (...p: readonly string[]) => string,
	sep: string,
): string {
	if (rawName.length === 0) {
		throw invalid(
			"resource.archive_invalid_entry",
			"archive entry has empty name",
			{ rawName },
		)
	}
	if (/^([a-zA-Z]:)?[\\/]/.test(rawName)) {
		throw invalid(
			"resource.archive_invalid_entry",
			`archive entry has absolute path: ${rawName}`,
			{ rawName },
		)
	}
	const normalised = normalize(rawName).replace(/\\/g, "/")
	if (normalised.startsWith("../") || normalised === "..") {
		throw invalid(
			"resource.archive_invalid_entry",
			`archive entry escapes destination: ${rawName}`,
			{ rawName },
		)
	}
	const candidate = resolve(root, normalised)
	if (candidate !== root && !candidate.startsWith(root + sep)) {
		throw invalid(
			"resource.archive_invalid_entry",
			`archive entry escapes destination: ${rawName}`,
			{ rawName },
		)
	}
	return candidate
}

async function readToBuffer(source: NodeJS.ReadableStream): Promise<Buffer> {
	const chunks: Buffer[] = []
	for await (const chunk of source) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
	}
	return Buffer.concat(chunks)
}

function openZipFromBuffer(buffer: Buffer): Promise<ZipFile> {
	return new Promise<ZipFile>((res, rej) => {
		yauzl.fromBuffer(
			buffer,
			{ lazyEntries: true },
			(err: Error | null, zip: ZipFile) => {
				if (err !== null || zip === undefined) {
					rej(
						invalid(
							"resource.archive_open_failed",
							err?.message ?? "could not open archive",
							{},
						),
					)
					return
				}
				res(zip)
			},
		)
	})
}
