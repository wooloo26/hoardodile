import { extname } from "node:path"
import type { Readable } from "node:stream"
import { buffer } from "node:stream/consumers"
import {
	extToFfmpegInputFormat,
	IMAGE_EXTS,
} from "@hoardodile/consts/media-exts"
import type { ImageInfo, VideoInfo } from "@hoardodile/plugin-sdk-server"
import sharp, {
	type Metadata,
	type Sharp,
	type SharpInput,
	type SharpOptions,
} from "sharp"
import { resolveFfmpegPaths } from "src/infra/thumb/ffmpeg.ts"
import { probeVideoMeta } from "./ffprobe.ts"

export type ImageSourceProbe = {
	readonly width: number
	readonly height: number
	readonly animated: boolean
}

const ANIMATED_EXT_HINTS = new Set([".gif", ".webp", ".avif"])

export type ImageMetadataInput =
	| string
	| Buffer
	| Readable
	| { readonly openStream: () => Promise<Readable> }

/** Narrow a Node stream into sharp's readable input type without assertion. */
export function sharpFromReadable(
	stream: Readable,
	options?: SharpOptions,
): Sharp {
	if (typeof stream.read !== "function") {
		throw new Error("expected a readable stream")
	}
	// sharp/libvips accepts Node Readable streams at runtime; SharpInput typedef is narrower.
	return sharp(stream as unknown as SharpInput, options)
}

function isReadable(input: unknown): input is Readable {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as Readable).pipe === "function" &&
		!("openStream" in input)
	)
}

function isReopenableImageStream(
	input: ImageMetadataInput,
): input is { readonly openStream: () => Promise<Readable> } {
	return (
		typeof input === "object" &&
		input !== null &&
		!Buffer.isBuffer(input) &&
		"openStream" in input &&
		typeof (input as { openStream: unknown }).openStream === "function"
	)
}

/**
 * Sharp options for image thumb/probe reads. Enables sequential read for
 * large JPEGs on disk so libvips can shrink-on-load during resize.
 */
export function sharpImageInputOpts(
	input: string | Buffer,
	ext: string,
	pages: number,
	animated?: boolean,
): SharpOptions {
	const opts: SharpOptions = { pages }
	if (animated === true) opts.animated = true
	if (
		typeof input === "string" &&
		(ext === ".jpg" || ext === ".jpeg" || ext === ".jfif")
	) {
		opts.sequentialRead = true
	}
	return opts
}

/**
 * True when a shallow `{ pages: 1 }` metadata read is not enough to
 * decide animation and the full multi-page scan is required.
 */
export function needsFullAnimationScan(
	meta: Pick<Metadata, "width" | "height" | "pages" | "pageHeight">,
	ext: string,
): boolean {
	if (ext === ".gif") return true
	if (ANIMATED_EXT_HINTS.has(ext) && (meta.pages ?? 1) > 1) return true
	if (
		meta.pageHeight !== undefined &&
		meta.height !== undefined &&
		meta.pageHeight !== meta.height
	) {
		return true
	}
	return false
}

/**
 * Read image metadata with layered animation detection: static sources
 * stop after a single-page read; animated containers escalate to
 * `{ pages: -1 }` only when the shallow probe signals multi-frame input.
 */
export async function readImageMetadata(
	input: ImageMetadataInput,
	ext: string,
): Promise<{ readonly meta: Metadata; readonly animated: boolean }> {
	if (isReopenableImageStream(input)) {
		const stream = await input.openStream()
		const shallow = sharpFromReadable(stream, { pages: 1 })
		const shallowMeta = await shallow.metadata()
		if (!needsFullAnimationScan(shallowMeta, ext)) {
			return { meta: shallowMeta, animated: false }
		}
		const fullStream = await input.openStream()
		const fullMeta = await sharpFromReadable(fullStream, {
			pages: -1,
			animated: true,
		}).metadata()
		return { meta: fullMeta, animated: (fullMeta.pages ?? 1) > 1 }
	}
	if (isReadable(input)) {
		const data = await buffer(input)
		return readImageMetadata(data, ext)
	}
	const shallow = sharp(input, sharpImageInputOpts(input, ext, 1))
	const shallowMeta = await shallow.metadata()
	if (!needsFullAnimationScan(shallowMeta, ext)) {
		return { meta: shallowMeta, animated: false }
	}
	const fullMeta = await sharp(
		input,
		sharpImageInputOpts(input, ext, -1, true),
	).metadata()
	return { meta: fullMeta, animated: (fullMeta.pages ?? 1) > 1 }
}

/**
 * Probe an image path or buffer and return pixel dimensions plus whether
 * the source is animated. Probe failures return `undefined`.
 */
export async function probeImageSource(
	input: ImageMetadataInput,
	extHint?: string,
): Promise<ImageSourceProbe | undefined> {
	const ext =
		extHint ?? (typeof input === "string" ? extname(input).toLowerCase() : "")
	if (ext.length > 0 && !IMAGE_EXTS.has(ext)) return undefined
	try {
		const { meta, animated } = await readImageMetadata(input, ext)
		const h = meta.pageHeight ?? meta.height
		if (meta.width === undefined || h === undefined) return undefined
		return { width: meta.width, height: h, animated }
	} catch {
		return undefined
	}
}

/**
 * Probe an image file with sharp and return its pixel dimensions.
 * Probe failures return `undefined` so callers can treat "not yet probed"
 * and "probe failed" the same way.
 */
export async function probeImage(
	source: string | Readable,
): Promise<ImageInfo | undefined> {
	const probe = await probeImageSource(source)
	if (probe === undefined) return undefined
	return { width: probe.width, height: probe.height }
}

let ffmpegCache: ReturnType<typeof resolveFfmpegPaths> | undefined

function getFfmpeg() {
	if (ffmpegCache === undefined) ffmpegCache = resolveFfmpegPaths()
	return ffmpegCache
}

/**
 * Probe a video file with ffprobe and return its pixel dimensions and
 * duration. Probe failures return `undefined` so callers can treat
 * "not yet probed" and "probe failed" the same way.
 */
export async function probeVideo(
	source: string | Readable,
	extHint?: string,
): Promise<VideoInfo | undefined> {
	try {
		const inputFormat =
			typeof source === "string" || extHint === undefined
				? undefined
				: extToFfmpegInputFormat(extHint)
		const probed = await probeVideoMeta(source, getFfmpeg(), inputFormat)
		if (
			probed.width === undefined &&
			probed.height === undefined &&
			probed.durationMs === undefined
		) {
			return undefined
		}
		return {
			width: probed.width,
			height: probed.height,
			durationMs: probed.durationMs,
		}
	} catch {
		return undefined
	}
}

/**
 * True when the image has more than one frame (animated GIF / WebP / APNG /
 * AVIF). Uses layered detection so static JPEG/PNG avoid a full-frame scan.
 * Errors are coerced to `false`.
 */
export async function probeAnimatedImage(
	source: string | Readable,
): Promise<boolean> {
	if (
		typeof source === "string" &&
		!IMAGE_EXTS.has(extname(source).toLowerCase())
	) {
		return false
	}
	try {
		const probe = await probeImageSource(source)
		return probe?.animated ?? false
	} catch (err) {
		const label = typeof source === "string" ? source : "stream"
		console.warn(
			`[probeAnimatedImage] sharp failed on ${label}: ${err instanceof Error ? err.message : String(err)}`,
		)
		return false
	}
}
