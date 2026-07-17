import { extname } from "node:path"
import type { Readable } from "node:stream"
import { IMAGE_EXTS } from "@hoardodile/consts/media-exts"
import type {
	AudioInfo,
	ImageInfo,
	Logger,
	ResourceAPI,
	VideoInfo,
} from "@hoardodile/plugin-sdk-server"
import type { PluginManifest } from "@hoardodile/schemas"
import type { SourceArtifactView } from "src/domain/res/source-view.ts"

/** Build a logger scoped to a plugin manifest. */
export function createPluginLogger(manifest: PluginManifest): Logger {
	return {
		info(msg: string, data?: Record<string, unknown>) {
			console.info(`[plugin:${manifest.id}] ${msg}`, data ?? "")
		},
		warn(msg: string, data?: Record<string, unknown>) {
			console.warn(`[plugin:${manifest.id}] ${msg}`, data ?? "")
		},
		error(msg: string, data?: Record<string, unknown>) {
			console.error(`[plugin:${manifest.id}] ${msg}`, data ?? "")
		},
	}
}

/**
 * Construct a {@link ResourceAPI} on top of a {@link SourceArtifactView}.
 * The view abstracts away the on-disk STORED `source.hoard` archive shape so
 * plugin code stays unaware of how source bytes are stored.
 */
export type CreatePluginResourceAPIDeps = {
	readonly view: SourceArtifactView
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
	readonly log?: Logger
}

export function createPluginResourceAPI(
	deps: CreatePluginResourceAPIDeps,
): ResourceAPI {
	const { view, log = silentLogger() } = deps

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
		logInfo: log.info.bind(log),
		logWarn: log.warn.bind(log),
		logError: log.error.bind(log),
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

function silentLogger(): Logger {
	return { info() {}, warn() {}, error() {} }
}
