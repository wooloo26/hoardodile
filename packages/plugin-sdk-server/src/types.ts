import type { PluginSchema } from "@hoardodile/plugin-sdk-types"

/** Server plugin detection result. */
export type Detection =
	| { readonly ok: true }
	| { readonly ok: false; readonly reasons: readonly string[] }

/** Structured logger scoped to a single plugin. */
export type Logger = {
	info(message: string, data?: Record<string, unknown>): void
	warn(message: string, data?: Record<string, unknown>): void
	error(message: string, data?: Record<string, unknown>): void
}

/** Image probe result. */
export type ImageInfo = {
	readonly width?: number
	readonly height?: number
}

/** Video probe result. */
export type VideoInfo = {
	readonly width?: number
	readonly height?: number
	readonly durationMs?: number
}

/** Audio probe result. */
export type AudioInfo = {
	readonly durationMs?: number
}

/**
 * Resource-scoped API available to every plugin hook. All paths are relative to
 * the resource's source directory; the host resolves absolute paths transparently.
 */
export type ResourceAPI = {
	/** Write an informational log entry. */
	readonly logInfo: (message: string, data?: Record<string, unknown>) => void
	/** Write a warning log entry. */
	readonly logWarn: (message: string, data?: Record<string, unknown>) => void
	/** Write an error log entry. */
	readonly logError: (message: string, data?: Record<string, unknown>) => void
	/** List all regular-file names (flat list), sorted. */
	readonly listFiles: () => Promise<readonly string[]>
	/** Read a regular file relative to the resource root. */
	readonly readFile: (path: string) => Promise<Uint8Array>
	/**
	 * Return the byte size of `path` without reading the file contents.
	 * Resolves to `undefined` when the file does not exist or the artifact
	 * is not yet committed.
	 */
	readonly statFile: (
		path: string,
	) => Promise<{ readonly sizeBytes: number } | undefined>
	/**
	 * Supported extensions (case-insensitive):
	 * `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.avif`.
	 * Other inputs resolve to `undefined`.
	 */
	readonly probeImage: (path: string) => Promise<ImageInfo | undefined>
	/**
	 * Supported extensions (case-insensitive):
	 * `.mp4`, `.webm`, `.mov`, `.mkv`, `.m4v`, `.avi`.
	 * Other inputs resolve to `undefined`.
	 */
	readonly probeVideo: (path: string) => Promise<VideoInfo | undefined>
	/**
	 * Supported extensions (case-insensitive):
	 * `.mp3`, `.flac`, `.ogg`, `.m4a`, `.wav`, `.opus`.
	 * Other inputs resolve to `undefined`.
	 */
	readonly probeAudio: (path: string) => Promise<AudioInfo | undefined>
	/**
	 * Returns `true` when the image at `path` is animated (multi-frame
	 * containers: GIF, animated WebP, APNG, animated AVIF). Errors are
	 * coerced to `false`, so callers can treat "probe failed" and "not
	 * animated" the same way.
	 */
	readonly isAnimatedImage: (path: string) => Promise<boolean>
	/** Write a cover image to the shared resource directory. Cover meta auto-generates. */
	readonly setCover: (data: Uint8Array, ext: string) => Promise<void>
	/** Remove the cover image from the shared resource directory. */
	readonly clearCover: () => Promise<void>
	/** Write a local cover image (machine-specific, not synced). Cover meta auto-generates. */
	readonly setLocalCover: (data: Uint8Array, ext: string) => Promise<void>
}

/**
 * Declarative description of a content plugin. Plugins export an instance of
 * this shape as their default export; the host injects the resource API at call
 * time and never invokes a factory function.
 */
export type PluginDefinition<TSchema extends PluginSchema = PluginSchema> = {
	/** Detect whether this plugin applies to the current resource. */
	readonly detect: (api: ResourceAPI) => Promise<Detection>
	/** Optional source metadata builder. */
	readonly sourceMeta?: (
		api: ResourceAPI,
	) => Promise<TSchema["sourceMeta"] | undefined>
	/** Optional search metadata builder. */
	readonly searchMeta?: (
		api: ResourceAPI,
	) => Promise<TSchema["searchMeta"] | undefined>
	/** Optional local cover source resolver. */
	readonly coverLocal?: (api: ResourceAPI) => Promise<string | undefined>
	/**
	 * Optional custom file list builder. Results are cached verbatim in a sidecar.
	 * When absent the host falls back to a bare list of source filenames.
	 */
	readonly listFiles?: (api: ResourceAPI) => Promise<readonly TSchema["file"][]>
}
