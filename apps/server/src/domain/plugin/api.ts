import { open, readdir } from "node:fs/promises"
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path"
import type { Readable } from "node:stream"
import { IMAGE_EXTS } from "@hoardodile/consts/media-exts"
import { PLUGIN_READ_FILE_MAX_BYTES } from "@hoardodile/consts/plugin"
import type {
	AudioInfo,
	ImageInfo,
	ReadFileRange,
	ResourceAPI,
	VideoInfo,
} from "@hoardodile/plugin-sdk-server"

/**
 * Minimal structural view of a resource's source archive required by
 * {@link createPluginResourceAPI}. `SourceArtifactView` from the res domain
 * is a structural superset — declared here so the plugin domain never
 * imports resource-storage internals.
 */
export type PluginSourceView = {
	readonly listEntries: () => Promise<readonly string[]>
	readonly readEntry: (relPath: string) => Promise<Buffer>
	readonly readEntrySlice: (
		relPath: string,
		start: number,
		end: number,
	) => Promise<Buffer>
	readonly openEntryStream: (
		relPath: string,
	) => Promise<{ readonly stream: Readable; readonly size: number }>
	readonly resolveByteRange: (
		relPath: string,
	) => Promise<{ readonly size: number } | undefined>
}

/**
 * Construct a {@link ResourceAPI} on top of a {@link PluginSourceView}.
 * The view abstracts away the on-disk STORED `source.hoard` archive shape so
 * plugin code stays unaware of how source bytes are stored.
 */
export type CreatePluginResourceAPIDeps = {
	readonly view: PluginSourceView
	readonly probeImage: (
		source: string | Readable,
	) => Promise<ImageInfo | undefined>
	readonly probeVideo: (
		source: string | Readable,
		extHint?: string,
	) => Promise<VideoInfo | undefined>
	readonly probeAudio?: (
		source: string | Readable,
	) => Promise<AudioInfo | undefined>
	readonly isAnimatedImage: (source: string | Readable) => Promise<boolean>
	/** Per-call `readFile` byte cap. Defaults to {@link PLUGIN_READ_FILE_MAX_BYTES}. */
	readonly maxReadFileBytes?: number
}

export function createPluginResourceAPI(
	deps: CreatePluginResourceAPIDeps,
): ResourceAPI {
	const { view } = deps
	const maxReadFileBytes = deps.maxReadFileBytes ?? PLUGIN_READ_FILE_MAX_BYTES

	async function readFileScoped(
		path: string,
		range?: ReadFileRange,
	): Promise<Uint8Array> {
		if (range === undefined) {
			const size = (await view.resolveByteRange(path))?.size
			if (size !== undefined) assertReadSize(path, size, maxReadFileBytes)
			const buf = await view.readEntry(path)
			return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
		}
		const start = Math.max(0, range.start ?? 0)
		const size = (await view.resolveByteRange(path))?.size
		if (size === undefined) {
			// Unknown size (missing entry) — let the view raise its own error.
			return toUint8Array(
				await view.readEntrySlice(path, start, range.end ?? start),
			)
		}
		const end = Math.min(range.end ?? size, size)
		assertReadSize(path, Math.max(0, end - start), maxReadFileBytes)
		return toUint8Array(await view.readEntrySlice(path, start, end))
	}

	async function listFilesScoped(): Promise<readonly string[]> {
		return view.listEntries()
	}

	async function probeImageScoped(
		path: string,
	): Promise<ImageInfo | undefined> {
		const { stream } = await view.openEntryStream(path)
		return deps.probeImage(stream)
	}

	async function probeVideoScoped(
		path: string,
	): Promise<VideoInfo | undefined> {
		const { stream } = await view.openEntryStream(path)
		return deps.probeVideo(stream, extname(path).toLowerCase())
	}

	async function probeAudioScoped(
		path: string,
	): Promise<AudioInfo | undefined> {
		if (deps.probeAudio === undefined) return undefined
		const { stream } = await view.openEntryStream(path)
		return deps.probeAudio(stream)
	}

	async function isAnimatedImageScoped(path: string): Promise<boolean> {
		if (!IMAGE_EXTS.has(extname(path).toLowerCase())) return false
		try {
			const { stream } = await view.openEntryStream(path)
			return deps.isAnimatedImage(stream)
		} catch (err) {
			console.warn(
				`[isAnimatedImageScoped] path=${path} threw: ${err instanceof Error ? err.message : String(err)}`,
			)
			return false
		}
	}

	async function statFileScoped(
		path: string,
	): Promise<{ readonly sizeBytes: number } | undefined> {
		const range = await view.resolveByteRange(path)
		if (range === undefined) return undefined
		return { sizeBytes: range.size }
	}

	return {
		// No-ops: the sandbox host is the plugin log sink — it alone knows
		// which plugin emitted the line (see dispatchLog in sandbox/host.ts).
		logInfo() {},
		logWarn() {},
		logError() {},
		listFiles: listFilesScoped,
		readFile: readFileScoped,
		statFile: statFileScoped,
		probeImage: probeImageScoped,
		probeVideo: probeVideoScoped,
		probeAudio: probeAudioScoped,
		isAnimatedImage: isAnimatedImageScoped,
		setCover: async () => {},
		clearCover: async () => {},
		setLocalCover: async () => {},
	}
}

/**
 * Create a minimal {@link ResourceAPI} backed by a raw filesystem
 * directory. Used during import to run detectors before resources exist.
 */
export function createImportResourceAPI(
	dir: string,
	opts: { readonly maxReadFileBytes?: number } = {},
): ResourceAPI {
	const maxReadFileBytes = opts.maxReadFileBytes ?? PLUGIN_READ_FILE_MAX_BYTES
	return {
		// No-ops: the sandbox host is the plugin log sink — it alone knows
		// which plugin emitted the line (see dispatchLog in sandbox/host.ts).
		logInfo() {},
		logWarn() {},
		logError() {},
		async readFile(relPath, range) {
			const safe = resolveSafeImportPath(dir, relPath)
			const handle = await open(safe, "r")
			try {
				const { size } = await handle.stat()
				if (range === undefined) {
					assertReadSize(relPath, size, maxReadFileBytes)
					return new Uint8Array(await handle.readFile())
				}
				const start = Math.max(0, range.start ?? 0)
				const end = Math.min(range.end ?? size, size)
				const length = Math.max(0, end - start)
				assertReadSize(relPath, length, maxReadFileBytes)
				if (length === 0) return new Uint8Array()
				const buf = Buffer.alloc(length)
				await handle.read(buf, 0, length, start)
				return new Uint8Array(buf)
			} finally {
				await handle.close()
			}
		},
		async listFiles() {
			const out: string[] = []
			async function collect(current: string, prefix: string) {
				const entries = await readdir(join(dir, current), {
					withFileTypes: true,
				}).catch(() => [] as readonly never[])
				for (const e of entries) {
					if (e.name.startsWith(".")) continue
					if (e.name.includes(".uploading-")) continue
					const rel = prefix ? join(current, e.name) : e.name
					if (e.isDirectory()) {
						await collect(join(current, e.name), rel)
					} else if (e.isFile()) {
						out.push(rel)
					}
				}
			}
			await collect(".", "")
			return out.sort((a, b) =>
				a.localeCompare(b, undefined, {
					sensitivity: "base",
					numeric: true,
				}),
			)
		},
		async statFile(relPath) {
			resolveSafeImportPath(dir, relPath)
			return undefined
		},
		async probeImage() {
			return undefined
		},
		async probeVideo() {
			return undefined
		},
		async probeAudio() {
			return undefined
		},
		async isAnimatedImage() {
			return false
		},
		async setCover() {},
		async clearCover() {},
		async setLocalCover() {},
	}
}

/**
 * Resolve a plugin-supplied relative path against an import directory,
 * rejecting attempts to escape the directory or use absolute paths.
 */
export function resolveSafeImportPath(dir: string, relPath: string): string {
	if (relPath.length === 0) {
		throw new Error("path is empty")
	}
	if (relPath.includes("\0")) {
		throw new Error("path contains null byte")
	}
	if (isAbsolute(relPath)) {
		throw new Error("absolute paths are not allowed")
	}
	const normalized = normalize(relPath)
	if (normalized.startsWith("..") || normalized === "..") {
		throw new Error("path escapes import directory")
	}
	const root = resolve(dir)
	const candidate = resolve(root, normalized)
	if (candidate !== root && !candidate.startsWith(root + sep)) {
		throw new Error("path escapes import directory")
	}
	return candidate
}

function assertReadSize(path: string, sizeBytes: number, max: number): void {
	if (sizeBytes > max) {
		throw new Error(
			`readFile("${path}") requests ${sizeBytes} bytes, exceeding the per-call limit of ${max} bytes — pass a byte range or use readFileChunks()`,
		)
	}
}

function toUint8Array(buf: Buffer): Uint8Array {
	return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}
