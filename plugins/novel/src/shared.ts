/**
 * Novel plugin schema. Files are plain resource filenames (the plugin
 * does not provide a custom `listFiles` builder, so the host falls back
 * to bare filenames).
 */
export type NovelFile = string

export interface NovelSourceMeta {
	readonly title?: string
	readonly author?: string
}

export interface NovelSearchMeta {
	readonly v: number
	readonly facets?: Readonly<Record<string, boolean>>
}

export interface NovelSchema {
	file: NovelFile
	sourceMeta: NovelSourceMeta
	searchMeta: NovelSearchMeta
}
