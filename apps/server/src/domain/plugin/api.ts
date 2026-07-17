import { readdir } from "node:fs/promises"
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path"
import type { Readable } from "node:stream"
import { IMAGE_EXTS } from "@hoardodile/consts/media-exts"
import type {
	AudioInfo,
	ImageInfo,
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
}

export function createPluginResourceAPI(
	deps: CreatePluginResourceAPIDeps,
): ResourceAPI {
	const { view } = deps

	async function readFileScoped(path: string): Promise<Uint8Array> {
		const buf = await view.readEntry(path)
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
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
export function createImportResourceAPI(dir: string): ResourceAPI {
	return {
		logInfo() {},
		logWarn() {},
		logError() {},
		async readFile(relPath) {
			const safe = resolveSafeImportPath(dir, relPath)
			const { readFile } = await import("node:fs/promises")
			const buf = await readFile(safe)
			return new Uint8Array(buf)
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
