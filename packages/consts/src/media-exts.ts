/**
 * Canonical media-extension sets used across server (thumbnail
 * pipeline + source-meta probe), web (upload classifier), and
 * content plugins (gallery / manga detect + probe routing).
 *
 * Lower-case, with leading dot — match the output of
 * `path.extname(name).toLowerCase()`.
 *
 * Adding a new extension here widens classification everywhere at
 * once. Before adding, verify:
 * - sharp can extract width/height (image)
 * - ffprobe can read width/height/duration (video)
 * - apps/server/src/infra/covers/pipeline.ts handles the new ext
 */
export const IMAGE_EXTS: ReadonlySet<string> = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
	".bmp",
	".avif",
])

export const VIDEO_EXTS: ReadonlySet<string> = new Set([
	".mp4",
	".webm",
	".mov",
	".mkv",
	".m4v",
	".avi",
])

export const AUDIO_EXTS: ReadonlySet<string> = new Set([
	".mp3",
	".flac",
	".ogg",
	".m4a",
	".wav",
	".opus",
])

/**
 * Classify a file extension (with leading dot, lower-cased) into its
 * media type using the canonical extension sets. Unknown / image
 * extensions default to `"image"`.
 */
export function extToMediaType(ext: string): "image" | "video" | "audio" {
	const e = ext.toLowerCase()
	if (VIDEO_EXTS.has(e)) return "video"
	if (AUDIO_EXTS.has(e)) return "audio"
	return "image"
}

/**
 * Canonical extension-to-MIME mapping for all file types served by the
 * resource file pipeline. Shared between the HTTP file-serving layer and
 * the thumbnail/cover service so both produce consistent Content-Type
 * headers.
 */
export const DOWNLOAD_CONTENT_TYPES: Readonly<Record<string, string>> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".bmp": "image/bmp",
	".avif": "image/avif",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".mkv": "video/x-matroska",
	".m4v": "video/x-m4v",
	".avi": "video/x-msvideo",
	".mp3": "audio/mpeg",
	".flac": "audio/flac",
	".ogg": "audio/ogg",
	".m4a": "audio/mp4",
	".wav": "audio/wav",
	".opus": "audio/opus",
	".txt": "text/plain",
	".md": "text/markdown",
	".epub": "application/epub+zip",
}

export function extToContentType(ext: string): string {
	return DOWNLOAD_CONTENT_TYPES[ext.toLowerCase()] ?? "application/octet-stream"
}

/** ffmpeg `-f` container name for piped zip entry bytes (no filename hint). */
const FFMPEG_INPUT_FORMAT: Readonly<Record<string, string>> = {
	".mp4": "mp4",
	".m4v": "mp4",
	".webm": "webm",
	".mov": "mov",
	".mkv": "matroska",
	".avi": "avi",
}

export function extToFfmpegInputFormat(ext: string): string | undefined {
	return FFMPEG_INPUT_FORMAT[ext.toLowerCase()]
}
