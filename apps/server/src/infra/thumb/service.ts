import { readdir, stat } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { IMAGE_EXTS, VIDEO_EXTS } from "@hoardodile/consts/media-exts"
import {
	CHARACTER_AVATAR_MAX_AREA,
	CHARACTER_FULLBODY_MAX_AREA,
	RESOURCE_COVER_MAX_AREA,
	RESOURCE_PREVIEW_MAX_AREA,
} from "@hoardodile/consts/res-consts"
import type { ResPreviewSource } from "src/domain/res/service.ts"
import type { SourceArtifactView } from "src/domain/res/source-view.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import type { AdaptiveConcurrency } from "../adaptive-concurrency.ts"
import { createKeyedQueue, type KeyedQueue } from "../queue.ts"
import type { FfmpegPaths } from "./ffmpeg.ts"
import { resolveFfmpegPaths } from "./ffmpeg.ts"
import {
	AVIF_QUALITY,
	cleanOrphanedTempFiles,
	type ImageThumbInput,
	PREVIEW_AVIF_QUALITY,
	PREVIEW_WEBP_QUALITY,
	renderImageThumbOnce,
	renderVideoFrame,
	WEBP_QUALITY,
} from "./pipeline.ts"
import {
	imageThumbSource,
	type ThumbInput,
	videoThumbSource,
	withThumbInput,
} from "./thumb-input.ts"

export const RESOURCE_LOCAL_COVER_VARIANT = "cover"
export const CHARACTER_AVATAR_VARIANT = "avatar"
export const CHARACTER_FULLBODY_VARIANT = "fullbody"

export type ThumbReady = {
	readonly kind: "ready"
	readonly path: string
	/**
	 * Image format actually written to disk. Always "avif" for non-animated
	 * sources; downgraded to "webp" when the source is animated (sharp
	 * cannot encode animated AVIF).
	 */
	readonly format: ThumbFormat
}

export type ThumbUnavailable = {
	readonly kind: "unavailable"
	readonly reason: "placeholder" | "custom-pin"
}

export type ThumbResult = ThumbReady | ThumbUnavailable

/** Image encoding: always "avif" unless the source is animated. */
export type ThumbFormat = "webp" | "avif"

export type ThumbServiceDeps = {
	readonly paths: StoragePaths
	readonly resources: ResPreviewSource
	/** Max parallel synth jobs. Defaults to 2. Pass an {@link AdaptiveConcurrency} for dynamic scaling. */
	readonly concurrency?: number | AdaptiveConcurrency
	/** Override for tests so they never shell out or touch sharp. */
	readonly ffmpeg?: FfmpegPaths
}

export type ThumbService = {
	getCover(
		id: string,
		/**
		 * When provided, renders the cover from this file instead of
		 * resolving via the content plugin. Used by the HTTP layer when a
		 * permanent cover exists.
		 */
		sourcePath?: string,
	): Promise<ThumbResult>
	getFilePreview(id: string, filename: string): Promise<ThumbResult>
	getCharacterThumb(
		id: string,
		variant: "avatar" | "fullbody",
		version: number,
	): Promise<ThumbResult>
	getVideoFrame(
		id: string,
		filename: string,
		timeMs: number,
	): Promise<ThumbResult>
	/**
	 * Expose the queue so tests can assert coalescing. Not part of the
	 * narrow {@link ThumbResult} contract the HTTP layer consumes.
	 */
	readonly queue: KeyedQueue<ThumbResult>
}

const DEFAULT_CONCURRENCY = 2

/** Build a {@link ThumbService} backed by the on-demand queue. */
export function createThumbService(deps: ThumbServiceDeps): ThumbService {
	const ffmpeg = deps.ffmpeg ?? resolveFfmpegPaths()
	const adaptive =
		typeof deps.concurrency === "object" ? deps.concurrency : undefined
	const queue = createKeyedQueue<ThumbResult>({
		concurrency: adaptive ?? deps.concurrency ?? DEFAULT_CONCURRENCY,
		onTaskComplete: adaptive ? (ms) => adaptive.recordDuration(ms) : undefined,
	})

	// Fire-and-forget: remove any temp files left by a previous crash.
	void cleanOrphanedTempFiles(deps.paths.local.root)

	async function renderVideoCoverFrame(
		view: SourceArtifactView,
		relPath: string,
		input: ThumbInput,
		ext: string,
		destPath: string,
		timeSeconds = 0,
	): Promise<void> {
		const renderOpts = {
			ext,
			destPath,
			ffmpeg,
			maxArea: RESOURCE_COVER_MAX_AREA,
			quality: AVIF_QUALITY,
			format: "avif" as const,
			timeSeconds,
		}
		try {
			await renderVideoFrame({
				...renderOpts,
				source: await videoThumbSource(input),
			})
		} catch (streamErr) {
			if (input.kind !== "stream") throw streamErr
			await view.withSeekableEntry(relPath, async (path) => {
				await renderVideoFrame({ ...renderOpts, source: path })
			})
		}
	}

	async function getCover(
		id: string,
		sourcePath?: string,
	): Promise<ThumbResult> {
		const resolveDest = (fmt: ThumbFormat) =>
			deps.paths.local.localCover(
				"resource",
				id,
				RESOURCE_LOCAL_COVER_VARIANT,
				fmt,
			)

		return withCacheAndQueue(
			queue,
			() => firstReadyDest(resolveDest),
			resolveDest("avif"),
			async () => {
				if (sourcePath !== undefined) {
					return renderImageThumbDowngrade({
						input: sourcePath,
						ext: extname(sourcePath).toLowerCase(),
						resolveDest,
						maxArea: RESOURCE_COVER_MAX_AREA,
						webpQuality: WEBP_QUALITY,
						avifQuality: AVIF_QUALITY,
					})
				}

				let view: SourceArtifactView
				try {
					view = await deps.resources.resolveSourceView(id)
				} catch {
					return { kind: "unavailable", reason: "placeholder" }
				}
				const localCoverFile = await deps.resources.resolveLocalCoverSource(id)
				if (localCoverFile === undefined) {
					return { kind: "unavailable", reason: "placeholder" }
				}
				try {
					return await withThumbInput(
						view,
						localCoverFile,
						IMAGE_EXTS.has(extname(localCoverFile).toLowerCase())
							? "image"
							: "video",
						async (input, ext) => {
							if (IMAGE_EXTS.has(ext)) {
								return renderImageThumbDowngrade({
									input: imageThumbSource(input),
									ext,
									resolveDest,
									maxArea: RESOURCE_COVER_MAX_AREA,
									webpQuality: WEBP_QUALITY,
									avifQuality: AVIF_QUALITY,
								})
							}
							if (VIDEO_EXTS.has(ext)) {
								const destPath = resolveDest("avif")
								await renderVideoCoverFrame(
									view,
									localCoverFile,
									input,
									ext,
									destPath,
								)
								return { kind: "ready", path: destPath, format: "avif" }
							}
							return { kind: "unavailable", reason: "placeholder" }
						},
					)
				} catch {
					return { kind: "unavailable", reason: "placeholder" }
				}
			},
		)
	}

	async function getFilePreview(
		id: string,
		filename: string,
	): Promise<ThumbResult> {
		const ext = extname(filename).toLowerCase()
		if (!IMAGE_EXTS.has(ext)) {
			return { kind: "unavailable", reason: "placeholder" }
		}
		const resolveDest = (fmt: ThumbFormat) =>
			deps.paths.local.resFilePreview(id, filename, fmt)

		return withCacheAndQueue(
			queue,
			() => firstReadyDest(resolveDest),
			resolveDest("avif"),
			async () => {
				let view: SourceArtifactView
				try {
					view = await deps.resources.resolveSourceView(id)
				} catch {
					return { kind: "unavailable", reason: "placeholder" }
				}
				try {
					return await withThumbInput(
						view,
						filename,
						"image",
						async (input, fileExt) =>
							renderImageThumbDowngrade({
								input: imageThumbSource(input),
								ext: fileExt,
								resolveDest,
								maxArea: RESOURCE_PREVIEW_MAX_AREA,
								webpQuality: PREVIEW_WEBP_QUALITY,
								avifQuality: PREVIEW_AVIF_QUALITY,
							}),
					)
				} catch {
					return { kind: "unavailable", reason: "placeholder" }
				}
			},
		)
	}

	async function getCharacterThumb(
		id: string,
		variant: "avatar" | "fullbody",
		version: number,
	): Promise<ThumbResult> {
		const variantName =
			variant === "avatar"
				? CHARACTER_AVATAR_VARIANT
				: CHARACTER_FULLBODY_VARIANT
		const keyedVariant = `v${version}-${variantName}`
		const resolveDest = (fmt: ThumbFormat) =>
			deps.paths.local.localCover("character", id, keyedVariant, fmt)

		return withCacheAndQueue(
			queue,
			() => firstReadyDest(resolveDest),
			resolveDest("avif"),
			async () => {
				const charDir = deps.paths.atVersion(version).character(id)
				const entries = await readdir(charDir).catch(() => [])
				const prefix = `${variant}.`
				const filename = entries.find((n) => {
					const base = basename(n)
					return (
						base.startsWith(prefix) &&
						IMAGE_EXTS.has(extname(base).toLowerCase())
					)
				})
				if (filename === undefined) {
					return { kind: "unavailable", reason: "placeholder" }
				}
				const sourcePath = join(charDir, filename)
				const maxArea =
					variant === "avatar"
						? CHARACTER_AVATAR_MAX_AREA
						: CHARACTER_FULLBODY_MAX_AREA
				return renderImageThumbDowngrade({
					input: sourcePath,
					ext: extname(filename).toLowerCase(),
					resolveDest,
					maxArea,
					webpQuality: WEBP_QUALITY,
					avifQuality: AVIF_QUALITY,
				})
			},
		)
	}

	async function getVideoFrame(
		id: string,
		filename: string,
		timeMs: number,
	): Promise<ThumbResult> {
		const destPath = deps.paths.local.resVideoFrame(id, filename, timeMs)
		const cachedResult = async (): Promise<ThumbResult | undefined> => {
			if (await fileExists(destPath)) {
				return { kind: "ready", path: destPath, format: "avif" }
			}
			return undefined
		}

		return withCacheAndQueue(queue, cachedResult, destPath, async () => {
			let view: SourceArtifactView
			try {
				view = await deps.resources.resolveSourceView(id)
			} catch {
				return { kind: "unavailable", reason: "placeholder" }
			}
			try {
				if (timeMs > 0) {
					return await view.withSeekableEntry(filename, async (path) => {
						await renderVideoFrame({
							source: path,
							destPath,
							ffmpeg,
							maxArea: RESOURCE_COVER_MAX_AREA,
							quality: AVIF_QUALITY,
							format: "avif",
							timeSeconds: timeMs / 1000,
						})
						return { kind: "ready", path: destPath, format: "avif" }
					})
				}
				return await withThumbInput(
					view,
					filename,
					"video",
					async (input, ext) => {
						await renderVideoCoverFrame(view, filename, input, ext, destPath, 0)
						return { kind: "ready", path: destPath, format: "avif" }
					},
				)
			} catch {
				return { kind: "unavailable", reason: "placeholder" }
			}
		})
	}

	return {
		getCover,
		getFilePreview,
		getCharacterThumb,
		getVideoFrame,
		queue,
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const info = await stat(path)
		return info.isFile() && info.size > 0
	} catch {
		return false
	}
}

async function firstReadyDest(
	resolveDest: (fmt: ThumbFormat) => string,
): Promise<ThumbReady | undefined> {
	const avifPath = resolveDest("avif")
	if (await fileExists(avifPath)) {
		return { kind: "ready", path: avifPath, format: "avif" }
	}
	const webpPath = resolveDest("webp")
	if (await fileExists(webpPath)) {
		return { kind: "ready", path: webpPath, format: "webp" }
	}
	return undefined
}

async function renderImageThumbDowngrade(opts: {
	input: ImageThumbInput
	ext?: string
	resolveDest: (fmt: ThumbFormat) => string
	maxArea: number
	webpQuality: number
	avifQuality: number
}): Promise<ThumbReady> {
	const rendered = await renderImageThumbOnce(opts)
	return {
		kind: "ready",
		path: rendered.path,
		format: rendered.format,
	}
}

async function withCacheAndQueue<T extends ThumbResult>(
	queue: KeyedQueue<T>,
	checkCache: () => Promise<T | undefined>,
	queueKey: string,
	job: () => Promise<T>,
): Promise<T> {
	const cached = await checkCache()
	if (cached !== undefined) return cached
	return queue.run(queueKey, async () => {
		const raced = await checkCache()
		if (raced !== undefined) return raced
		return job()
	})
}
