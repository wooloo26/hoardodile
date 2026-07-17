import type { PluginSchema } from "@hoardodile/plugin-sdk-types"

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
}
