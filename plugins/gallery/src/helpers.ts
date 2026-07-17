import type { GalleryFile, GallerySourceMeta } from "./shared"

/**
 * First-paint preview hint written by the `sourceMeta` builder into the
 * resource's `sourceMeta.previews`: up to 3 {@link GalleryFile} entries
 * in natural sort order, available synchronously from `api.resource.sourceMeta`
 * before `api.useFileList()` resolves.
 */
export function readGalleryPreviews(
	meta: GallerySourceMeta | undefined,
): readonly GalleryFile[] | undefined {
	const raw = meta?.previews
	if (raw === undefined) return undefined
	return raw
}

export function readSourceMetaDimensions(meta: GallerySourceMeta | undefined): {
	readonly width?: number
	readonly height?: number
} {
	const width =
		meta?.width !== undefined && Number.isFinite(meta.width)
			? meta.width
			: undefined
	const height =
		meta?.height !== undefined && Number.isFinite(meta.height)
			? meta.height
			: undefined
	return { width, height }
}
