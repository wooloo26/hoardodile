import {
	AUDIO_EXTS,
	IMAGE_EXTS,
	PLUGIN_ANIMATION_SCAN_BATCH,
	PLUGIN_IMAGE_PROBE_CONCURRENCY,
	PLUGIN_VIDEO_PROBE_CONCURRENCY,
	SEARCH_META_VERSION,
	VIDEO_EXTS,
} from "@hoardodile/consts"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { definePlugin } from "@hoardodile/plugin-sdk-server"
import {
	extname,
	mapConcurrent,
	naturalSort,
	probeImageFile,
	probeVideoFile,
} from "@hoardodile/plugin-sdk-server/helpers"
import type {
	GalleryFile,
	GallerySchema,
	GallerySearchMeta,
	GallerySourceMeta,
} from "./shared"

export default definePlugin<GallerySchema>({
	detect: galleryDetect,
	sourceMeta: buildSourceMetaGallery,
	searchMeta,
	coverLocal: buildLocalCover,
	listFiles: buildFileList,
})

async function galleryDetect(api: ResourceAPI) {
	const files = await api.listFiles()
	const hasMedia = files.some((name) => {
		const ext = extname(name)
		return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)
	})
	return hasMedia
		? ({ ok: true } as const)
		: { ok: false, reasons: ["media-file"] }
}

async function buildSourceMetaGallery(
	resAPI: ResourceAPI,
): Promise<GallerySourceMeta | undefined> {
	const files = await resAPI.listFiles()
	const sorted = naturalSort(files)

	const previews: GalleryFile[] = []
	for (const filename of sorted) {
		const ext = extname(filename)
		if (IMAGE_EXTS.has(ext)) {
			const probed = await probeImageFile(resAPI, filename)
			previews.push({ filename, ...probed })
		} else if (VIDEO_EXTS.has(ext)) {
			const probed = await probeVideoFile(resAPI, filename)
			previews.push({ filename, ...probed })
		} else if (AUDIO_EXTS.has(ext)) {
			previews.push({ filename, type: "audio" as const })
		} else {
			continue
		}
		if (previews.length >= 3) break
	}

	const cached = previews[0]
	let result: GallerySourceMeta | undefined
	if (cached) {
		if (cached.type === "audio") {
			result = {}
		} else if (cached.width !== undefined && cached.height !== undefined) {
			result = {
				width: cached.width,
				height: cached.height,
				durationMs: cached.durationMs,
			}
		}
	}

	if (result === undefined || previews.length === 0) return result
	return { ...result, previews }
}

async function searchMeta(
	api: ResourceAPI,
): Promise<GallerySearchMeta | undefined> {
	const files = await api.listFiles()
	if (files.length === 0) return undefined
	const presence = {
		image: false,
		animation: false,
		video: false,
		audio: false,
	}
	// Batched fan-out: probes run concurrently within a batch, and the
	// early-exit check between batches keeps the "all facets found" short path.
	for (let i = 0; i < files.length; i += PLUGIN_ANIMATION_SCAN_BATCH) {
		const batch = files.slice(i, i + PLUGIN_ANIMATION_SCAN_BATCH)
		await Promise.all(
			batch.map(async (filename) => {
				const ext = extname(filename)
				if (IMAGE_EXTS.has(ext)) {
					presence.image = true
					if (!presence.animation && (await api.isAnimatedImage(filename))) {
						presence.animation = true
					}
				} else if (VIDEO_EXTS.has(ext)) {
					presence.video = true
				} else if (AUDIO_EXTS.has(ext)) {
					presence.audio = true
				}
			}),
		)
		if (
			presence.image &&
			presence.animation &&
			presence.video &&
			presence.audio
		)
			break
	}
	if (
		!presence.image &&
		!presence.video &&
		!presence.audio &&
		!presence.animation
	)
		return undefined
	return { v: SEARCH_META_VERSION, facets: presence }
}

async function buildLocalCover(api: ResourceAPI): Promise<string | undefined> {
	const files = await api.listFiles()
	for (const filename of naturalSort(files)) {
		const ext = extname(filename)
		if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) return filename
	}
	return undefined
}

async function buildFileList(
	api: ResourceAPI,
): Promise<readonly GalleryFile[]> {
	const files = await api.listFiles()
	const sorted = naturalSort(files)
	const entries = new Map<string, GalleryFile>()
	const images: string[] = []
	const videos: string[] = []
	for (const filename of sorted) {
		const ext = extname(filename)
		if (IMAGE_EXTS.has(ext)) images.push(filename)
		else if (VIDEO_EXTS.has(ext)) videos.push(filename)
		else if (AUDIO_EXTS.has(ext)) {
			entries.set(filename, { filename, type: "audio" as const })
		}
	}
	// Images and videos probe in parallel lanes (videos bound ffprobe spawns
	// tighter); results are reassembled in natural-sort order.
	await Promise.all([
		mapConcurrent(images, PLUGIN_IMAGE_PROBE_CONCURRENCY, async (filename) => {
			entries.set(filename, {
				filename,
				...(await probeImageFile(api, filename)),
			})
		}),
		mapConcurrent(videos, PLUGIN_VIDEO_PROBE_CONCURRENCY, async (filename) => {
			entries.set(filename, {
				filename,
				...(await probeVideoFile(api, filename)),
			})
		}),
	])
	const result: GalleryFile[] = []
	for (const filename of sorted) {
		const entry = entries.get(filename)
		if (entry !== undefined) result.push(entry)
	}
	return result
}
