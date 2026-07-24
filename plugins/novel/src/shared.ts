import { isRecord } from "@hoardodile/plugin-sdk-web"

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
	anchor: NovelParagraphAnchor
}

/** Comment anchor pinning a message to one paragraph of a text file. */
export type NovelParagraphAnchor = {
	readonly paragraphIndex: number
	readonly filename: string
}

/** Validate incoming anchor data against {@link NovelParagraphAnchor}. */
export function decodeNovelParagraphAnchor(
	data: unknown,
): NovelParagraphAnchor | undefined {
	if (!isRecord(data)) return undefined
	const { paragraphIndex, filename } = data
	if (typeof paragraphIndex !== "number" || typeof filename !== "string") {
		return undefined
	}
	return { paragraphIndex, filename }
}
