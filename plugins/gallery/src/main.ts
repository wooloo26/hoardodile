import {
	AUDIO_EXTS,
	IMAGE_EXTS,
	SEARCH_META_VERSION,
	VIDEO_EXTS,
} from "@hoardodile/consts"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { definePlugin } from "@hoardodile/plugin-sdk-server"
import {
	extname,
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
	for (const filename of files) {
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
	const result: GalleryFile[] = []
	for (const filename of naturalSort(files)) {
		const ext = extname(filename)
		if (IMAGE_EXTS.has(ext)) {
			const probed = await probeImageFile(api, filename)
			result.push({ filename, ...probed })
		} else if (VIDEO_EXTS.has(ext)) {
			const probed = await probeVideoFile(api, filename)
			result.push({ filename, ...probed })
		} else if (AUDIO_EXTS.has(ext)) {
			result.push({ filename, type: "audio" as const })
		}
	}
	return result
}
