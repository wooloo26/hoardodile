import type { PluginSchema } from "@hoardodile/plugin-sdk-types"

export type GalleryFile = {
	readonly filename: string
	readonly type?: "image" | "video" | "audio"
	readonly width?: number
	readonly height?: number
	readonly durationMs?: number
	readonly preview?: boolean
}

export type GallerySourceMeta = {
	readonly previews?: readonly GalleryFile[]
	readonly width?: number
	readonly height?: number
	readonly durationMs?: number
}

export type GallerySearchMeta = {
	readonly v: number
	readonly facets?: {
		readonly image?: boolean
		readonly animation?: boolean
		readonly video?: boolean
		readonly audio?: boolean
	}
}

export interface GallerySchema extends PluginSchema {
	readonly file: GalleryFile
	readonly sourceMeta: GallerySourceMeta
	readonly searchMeta: GallerySearchMeta
}
