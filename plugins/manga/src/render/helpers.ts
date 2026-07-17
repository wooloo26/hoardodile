import type { MangaPage, MangaSourceMeta } from "../shared"

/**
 * Natural-order comparator for filenames, so `page2.jpg` sorts before
 * `page10.jpg` (vs. lexical sort that puts `page10` first). Used by
 * the manga reader to lay pages out in a predictable order matching
 * how a human numbers files.
 */
export function compareFilenamesNatural(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

/**
 * Filter a resource's file list down to image pages (the manga reader
 * ignores side-cars, READMEs, etc.) and sort by natural filename
 * order so `02.jpg` precedes `10.jpg`.
 */
export function selectMangaPages(
	files: readonly MangaPage[],
): readonly MangaPage[] {
	const pages = files.filter((f) => f.type === "image")
	return [...pages].sort((a, b) =>
		compareFilenamesNatural(a.filename, b.filename),
	)
}

/**
 * First-paint preview hint written by `sourceMeta` into the
 * resource's `sourceMeta.previews`: up to 3 {@link MangaPage} entries
 * in natural sort order, available synchronously from `api.resource.sourceMeta`
 * before `api.useFileList()` resolves.
 */
export function readMangaPreviews(
	meta: MangaSourceMeta | undefined,
): readonly MangaPage[] | undefined {
	const raw = meta?.previews
	if (raw === undefined) return undefined
	return raw
}

/**
 * Aspect-ratio fallback used when a page record has no dimensions
 * yet. Matches a generic manga page (B5-ish, ~1:1.4); used by the
 * scroll virtualizer for placeholder slots whose `MangaPage` hasn't
 * arrived yet, as well as for the initial size estimate of loaded
 * pages — once the `<img>` mounts, the virtualizer's own measurement
 * supersedes this.
 */
export const FALLBACK_PAGE_ASPECT = 1.4

/**
 * Predict the rendered height of a manga page before any image has
 * loaded, so the scroll virtualizer can lay out a stable scrollbar
 * over the entire document. Uses the metadata `width` / `height`
 * captured at upload time when present, falling back to a generic
 * portrait aspect ratio otherwise.
 */
export function estimatePageHeight(
	page: MangaPage,
	renderWidth: number,
): number {
	if (renderWidth <= 0) return 0
	const w = page.width
	const h = page.height
	if (w !== undefined && h !== undefined && w > 0 && h > 0) {
		return Math.round((renderWidth * h) / w)
	}
	return Math.round(renderWidth * FALLBACK_PAGE_ASPECT)
}

/**
 * True when requesting the downscaled `preview` size for `page` would
 * meaningfully reduce bytes — the server's preview pipeline never
 * enlarges, so pages whose pixel area is already at or below
 * {@link RESOURCE_PREVIEW_MAX_AREA} round-trip back to the original
 * and waste a sharp encode on the first request. Pages without measured
 * dimensions are treated as "no preview" so the reader doesn't
 * pessimistically trigger encoding for files the upload probe couldn't size.
 */
