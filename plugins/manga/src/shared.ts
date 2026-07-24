import type { PluginSchema } from "@hoardodile/plugin-sdk-types"
import { isRecord } from "@hoardodile/plugin-sdk-web"

export type MangaPage = {
	readonly filename: string
	readonly type: "image"
	readonly width?: number
	readonly height?: number
	readonly preview: boolean
}

export type MangaSourceMeta = {
	readonly previews?: readonly MangaPage[]
	readonly width?: number
	readonly height?: number
}

export type MangaSearchMeta = {
	readonly v: number
	readonly facets?: {
		readonly image?: boolean
		readonly animation?: boolean
	}
}

export interface MangaSchema extends PluginSchema {
	readonly file: MangaPage
	readonly sourceMeta: MangaSourceMeta
	readonly searchMeta: MangaSearchMeta
	readonly anchor: MangaPageAnchor
}

/** Comment anchor pinning a message to one page of the manga. */
export type MangaPageAnchor = {
	readonly filename: string
	readonly page: number
}

/** Validate incoming anchor data against {@link MangaPageAnchor}. */
export function decodeMangaPageAnchor(
	data: unknown,
): MangaPageAnchor | undefined {
	if (!isRecord(data)) return undefined
	const { filename, page } = data
	if (typeof filename !== "string" || typeof page !== "number") {
		return undefined
	}
	return { filename, page }
}
