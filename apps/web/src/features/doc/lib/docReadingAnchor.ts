/** Gap below sticky chrome when computing the reading anchor line. */
export const READING_ANCHOR_GAP = 4

/** Fallback Y when sticky chrome is not in the DOM (e.g. tests). */
export const READING_ANCHOR_FALLBACK_Y = 96

export type DocBlockPositionEntry = {
	readonly blockId: string
	readonly offset: number
}

export type DocBlockPositions = Record<string, DocBlockPositionEntry>

/**
 * Y coordinate just below the lowest sticky chrome overlaying the editor.
 * Prefers the static toolbar (edit mode); falls back to the doc detail header.
 *
 * Computes the anchor from the element's *stuck* position (CSS `top` + height)
 * rather than its current viewport bottom. At `scrollY = 0` a sticky element
 * may still be in its natural (non-stuck) position, which would make the
 * anchor drift on every restore/refresh cycle.
 */
export function readingAnchorY(): number {
	const toolbar = document.querySelector(
		'[data-testid="document-static-toolbar"]',
	)
	if (toolbar !== null) {
		return stickyBottomY(toolbar)
	}
	const header = document.querySelector("[data-doc-layout] .doc-detail-header")
	if (header !== null) {
		return stickyBottomY(header)
	}
	return READING_ANCHOR_FALLBACK_Y
}

function stickyBottomY(el: Element): number {
	const style = window.getComputedStyle(el)
	const top = parseFloat(style.top)
	if (Number.isFinite(top)) {
		return top + el.getBoundingClientRect().height + READING_ANCHOR_GAP
	}
	return el.getBoundingClientRect().bottom + READING_ANCHOR_GAP
}

export function blockOffsetFromAnchor(el: Element): number {
	return Math.round(el.getBoundingClientRect().top - readingAnchorY())
}

/** Scroll so the block top sits at `readingAnchorY() + offsetFromAnchor`. */
export function scrollBlockToReadingAnchor(
	el: Element,
	offsetFromAnchor: number,
): void {
	const targetTop = readingAnchorY() + offsetFromAnchor
	const delta = el.getBoundingClientRect().top - targetTop
	if (Math.abs(delta) < 1) return
	window.scrollBy({ top: delta, behavior: "instant" })
}

export function scrollBlockToReadingAnchorAfterLayout(
	blockId: string,
	root: Element | null | undefined,
	offsetFromAnchor: number,
): void {
	function scrollOnce() {
		const el = root?.querySelector(`[data-id="${blockId}"]`)
		if (el === null || el === undefined) return false
		scrollBlockToReadingAnchor(el, offsetFromAnchor)
		return true
	}

	requestAnimationFrame(() => {
		if (!scrollOnce()) requestAnimationFrame(scrollOnce)
	})
}

export function docBlockPositionEntryEquals(
	stored: DocBlockPositionEntry | undefined,
	entry: DocBlockPositionEntry,
): boolean {
	if (stored === undefined) return false
	return stored.blockId === entry.blockId && stored.offset === entry.offset
}
