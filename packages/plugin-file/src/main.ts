import { PLUGIN_STAT_CONCURRENCY } from "@hoardodile/consts"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { definePlugin } from "@hoardodile/plugin-sdk-server"
import {
	extname,
	mapConcurrent,
	naturalSort,
} from "@hoardodile/plugin-sdk-server/helpers"
import type { FileEntry, FileSchema } from "./shared"

export default definePlugin<FileSchema>({
	detect: async () => ({ ok: true }) as const,
	sourceMeta,
	listFiles,
})

async function sourceMeta(
	api: ResourceAPI,
): Promise<FileSchema["sourceMeta"] | undefined> {
	const files = await api.listFiles()
	if (files.length === 0) return undefined
	return { fileCount: files.length }
}

async function listFiles(api: ResourceAPI): Promise<readonly FileEntry[]> {
	const files = await api.listFiles()
	return mapConcurrent(
		naturalSort(files),
		PLUGIN_STAT_CONCURRENCY,
		async (filename) => {
			const stat = await api.statFile(filename)
			return {
				filename,
				ext: extname(filename) || undefined,
				sizeBytes: stat?.sizeBytes,
			}
		},
	)
}
