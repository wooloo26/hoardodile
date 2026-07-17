import { SEARCH_META_VERSION } from "@hoardodile/consts"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { definePlugin } from "@hoardodile/plugin-sdk-server"
import { extname, naturalSort } from "@hoardodile/plugin-sdk-server/helpers"
import type { FileEntry, FileSchema } from "./shared"

export default definePlugin<FileSchema>({
	detect: async () => ({ ok: true }) as const,
	sourceMeta,
	searchMeta,
	listFiles,
})

async function sourceMeta(
	api: ResourceAPI,
): Promise<FileSchema["sourceMeta"] | undefined> {
	const files = await api.listFiles()
	if (files.length === 0) return undefined
	return { fileCount: files.length }
}

async function searchMeta(
	api: ResourceAPI,
): Promise<FileSchema["searchMeta"] | undefined> {
	const files = await api.listFiles()
	if (files.length === 0) return undefined
	return { v: SEARCH_META_VERSION }
}

async function listFiles(api: ResourceAPI): Promise<readonly FileEntry[]> {
	const files = await api.listFiles()
	const result: FileEntry[] = []
	for (const filename of naturalSort(files)) {
		const stat = await api.statFile(filename)
		result.push({
			filename,
			ext: extname(filename) || undefined,
			sizeBytes: stat?.sizeBytes,
		})
	}
	return result
}
