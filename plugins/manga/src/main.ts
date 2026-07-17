import { IMAGE_EXTS, SEARCH_META_VERSION } from "@hoardodile/consts"
import {
	type Detection,
	definePlugin,
	type ImageInfo,
	type ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import {
	extname,
	naturalSort,
	probeImageFile,
} from "@hoardodile/plugin-sdk-server/helpers"
import type { MangaSchema, MangaSearchMeta, MangaSourceMeta } from "./shared"

const PREVIEW_COUNT = 3

export default definePlugin<MangaSchema>({
	detect,
	sourceMeta,
	searchMeta,
	coverLocal: localCover,
	listFiles: fileList,
})

async function detect(api: ResourceAPI): Promise<Detection> {
	const files = await api.listFiles()
	if (files.length < 2) {
		return { ok: false, reasons: ["page-image"] }
	}
	const allImages = files.every((name) => IMAGE_EXTS.has(extname(name)))
	return allImages ? { ok: true } : { ok: false, reasons: ["page-image"] }
}

async function sourceMeta(
	api: ResourceAPI,
): Promise<MangaSourceMeta | undefined> {
	const files = await api.listFiles()
	const sorted = naturalSort(files)
	const previews: MangaSchema["file"][] = []
	let firstProbe: ImageInfo | undefined
	for (const filename of sorted) {
		if (!IMAGE_EXTS.has(extname(filename))) continue
		if (previews.length < PREVIEW_COUNT) {
			const probed = await probeImageFile(api, filename)
			previews.push({ filename, ...probed })
			if (firstProbe === undefined) {
				firstProbe =
					probed.width !== undefined || probed.height !== undefined
						? { width: probed.width, height: probed.height }
						: await api.probeImage(filename)
			}
			continue
		}
		if (firstProbe !== undefined) break
		firstProbe = await api.probeImage(filename)
	}
	if (firstProbe === undefined) return undefined
	return { ...firstProbe, previews }
}

async function searchMeta(
	api: ResourceAPI,
): Promise<MangaSearchMeta | undefined> {
	const files = await api.listFiles()
	if (files.length === 0) return undefined
	const presence = { image: false, animation: false }
	for (const filename of files) {
		if (!IMAGE_EXTS.has(extname(filename))) continue
		presence.image = true
		if (!presence.animation && (await api.isAnimatedImage(filename))) {
			presence.animation = true
		}
		if (presence.image && presence.animation) break
	}
	if (!presence.image && !presence.animation) return undefined
	return { v: SEARCH_META_VERSION, facets: presence }
}

async function localCover(api: ResourceAPI): Promise<string | undefined> {
	const files = await api.listFiles()
	for (const filename of naturalSort(files)) {
		if (IMAGE_EXTS.has(extname(filename))) return filename
	}
	return undefined
}

async function fileList(
	api: ResourceAPI,
): Promise<readonly MangaSchema["file"][]> {
	const files = await api.listFiles()
	const result: MangaSchema["file"][] = []
	for (const filename of naturalSort(files)) {
		if (!IMAGE_EXTS.has(extname(filename))) continue
		const probed = await probeImageFile(api, filename)
		result.push({ filename, ...probed })
	}
	return result
}
