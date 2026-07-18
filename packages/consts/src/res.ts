/**
 * Schema version stamped onto every `SearchMeta` payload. Plugins
 * that build search-meta MUST emit this exact value so the host can
 * detect format drift across plugin upgrades.
 */
export const SEARCH_META_VERSION = 1

export const RESOURCE_COVER_MAX_AREA = 300_000
export const RESOURCE_PREVIEW_MAX_AREA = 4_000_000
export const CHARACTER_AVATAR_MAX_AREA = 100_000
export const CHARACTER_FULLBODY_MAX_AREA = 500_000

/** Animated thumbnails use 1/3 the max area to keep animated WebP file sizes manageable. */
export const ANIMATED_AREA_DIVISOR = 3

/**
 * Byte-size threshold for preview eligibility. An image whose
 * area is at or below the cap may still qualify for preview when
 * its byte size exceeds this value.
 */
export const RESOURCE_PREVIEW_SIZE_THRESHOLD = 1_000_000

/**
 * Max zip entry size read into memory for thumb synthesis. Larger
 * entries are materialized to disk before sharp/ffmpeg runs.
 */
export const THUMB_BUFFER_MAX_BYTES = 32 * 1024 * 1024

/**
 * True when an image file should be served through the preview pipeline.
 * Preview is triggered when the image exceeds the pixel-area cap **or**
 * the byte-size threshold.
 */
export function fileNeedsPreview(check: {
	readonly type: "image" | "video" | "audio"
	readonly width: number | undefined
	readonly height: number | undefined
	readonly sizeBytes: number | undefined
}): boolean {
	if (check.type !== "image") return false
	const { width, height, sizeBytes } = check
	const exceedsArea =
		width !== undefined &&
		height !== undefined &&
		width * height > RESOURCE_PREVIEW_MAX_AREA
	const exceedsSize =
		sizeBytes !== undefined && sizeBytes > RESOURCE_PREVIEW_SIZE_THRESHOLD
	return exceedsArea || exceedsSize
}
