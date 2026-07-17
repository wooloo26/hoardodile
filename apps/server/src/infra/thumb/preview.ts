import { extname } from "node:path"
import { IMAGE_EXTS, VIDEO_EXTS } from "@hoardodile/consts/media-exts"
import type { FfmpegPaths } from "src/infra/thumb/ffmpeg.ts"
import {
	AVIF_QUALITY,
	renderImageThumbOnce,
	renderVideoFrame,
	WEBP_QUALITY,
} from "src/infra/thumb/pipeline.ts"

/** Max pixel area for upload preview thumbnails (300 × 300). */
export const UPLOAD_PREVIEW_MAX_AREA = 90_000

export type PreviewRenderResult = {
	readonly path: string
	readonly contentType: string
}

/**
 * Generate a downscaled preview image from a source file path.
 *
 * - Still images → AVIF
 * - Animated images → WebP (keeps animation)
 * - Video → AVIF frame at 0s
 *
 * @param sourcePath Absolute path to the source file.
 * @param destPathBase Absolute base path for the output (extension will be appended).
 * @param ffmpeg Resolved ffmpeg paths.
 * @returns Path to the generated preview and its Content-Type.
 * @throws Error when the file type is unsupported or rendering fails.
 */
export async function generateUploadPreview(
	sourcePath: string,
	destPathBase: string,
	ffmpeg: FfmpegPaths,
): Promise<PreviewRenderResult> {
	const ext = extname(sourcePath).toLowerCase()
	const isImage = IMAGE_EXTS.has(ext)
	const isVideo = VIDEO_EXTS.has(ext)

	if (!isImage && !isVideo) {
		throw new Error(`unsupported file type: ${ext || "unknown"}`)
	}

	if (isImage) {
		const rendered = await renderImageThumbOnce({
			input: sourcePath,
			ext,
			resolveDest: (fmt) => `${destPathBase}.${fmt}`,
			maxArea: UPLOAD_PREVIEW_MAX_AREA,
			webpQuality: WEBP_QUALITY,
			avifQuality: AVIF_QUALITY,
		})
		return {
			path: rendered.path,
			contentType: rendered.format === "webp" ? "image/webp" : "image/avif",
		}
	}

	const result = await renderVideoFrame({
		source: sourcePath,
		destPath: `${destPathBase}.avif`,
		ffmpeg,
		maxArea: UPLOAD_PREVIEW_MAX_AREA,
		quality: AVIF_QUALITY,
		format: "avif",
		timeSeconds: 0,
	})
	return { path: result.path, contentType: "image/avif" }
}
