import type { Comment } from "@hoardodile/plugin-sdk-web"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import type { NovelSettings } from "../prefs"
import { splitIntoChunks } from "./chunks"
import { NovelParagraphView } from "./NovelParagraphView"
import type { NovelDocument } from "./parse"

const LONG_PRESS_MS = 450
const TAP_MOVE_TOLERANCE_PX = 8

type PressTracker = {
	x: number
	y: number
	timer: number
	paragraph: number
	fired: boolean
	tappedBadge: boolean
}

/**
 * Bottom padding (px) reserved inside each column. Roughly matches
 * the top padding so pages feel symmetric while still leaving a
 * small gutter for the comment Badge to overflow into when a
 * paragraph splits across pages.
 */
const COLUMN_BOTTOM_PADDING = 24
/**
 * Horizontal inset (px) reserved on each side of every page. Applied
 * via half-as-padding-inline / half-as-column-gap so that one column
 * occupies exactly one viewport page wide (column-pitch === pageWidth)
 * while the visible text is centered with consistent gutters. See
 * `innerStyle` below for the exact column-width / column-gap math.
 */
const COLUMN_SIDE_PADDING = 32
/**
 * Top padding (px) inside each column. Mirrors the bottom padding so
 * the first and last lines sit at comparable distances from the
 * page edges.
 */
const COLUMN_TOP_PADDING = 24

export type NovelScrollAnchor = {
	readonly paragraphIndex: number
	readonly fraction: number
}

export function NovelBody(props: {
	readonly document: NovelDocument
	readonly settings: NovelSettings
	readonly onScrollAnchorChange: (anchor: NovelScrollAnchor) => void
	readonly onParagraphLongPress: (idx: number) => void
	readonly onParagraphCommentTap: (idx: number) => void
	readonly commentsByParagraph: ReadonlyMap<number, readonly Comment[]>
	readonly scrollToAnchor: NovelScrollAnchor | undefined
	readonly onScrollHandled: () => void
	readonly scrollToPage: number | undefined
	readonly onScrollToPageHandled: () => void
	readonly onPageStatsChange: (stats: {
		current: number
		total: number
	}) => void
}) {
	const {
		document,
		settings,
		onScrollAnchorChange,
		onParagraphLongPress,
		onParagraphCommentTap,
		commentsByParagraph,
		scrollToAnchor,
		onScrollHandled,
		scrollToPage,
		onScrollToPageHandled,
		onPageStatsChange,
	} = props
	const chunkIndex = useMemo(
		() => splitIntoChunks(document.paragraphs),
		[document.paragraphs],
	)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const pressRef = useRef<PressTracker | undefined>(undefined)
	// `chunkIdx` selects which slice of paragraphs is mounted; only that
	// slice contributes to the multi-column layout cost. Crossing a
	// chunk boundary remounts a new slice and resnaps `scrollLeft`.
	const [chunkIdx, setChunkIdx] = useState(0)
	const [pageInChunk, setPageInChunk] = useState(0)
	// Per-chunk measured page count, populated as the user (or jump
	// requests) cause each chunk to mount. Unmeasured chunks fall back
	// to the running average so the global page indicator stays
	// monotonic and the total estimate converges as more chunks are
	// visited.
	const [pagesByChunk, setPagesByChunk] = useState<ReadonlyMap<number, number>>(
		() => new Map(),
	)
	// Captures the desired post-layout target when remounting a chunk:
	// `first` / `last` for boundary navigation, an `anchor` for jump-to-
	// paragraph requests (paragraph + sub-paragraph fraction), or a
	// specific page within the chunk for jump-to-page requests. The
	// layout effect below drains it once measurement completes.
	const pendingRef = useRef<PendingChunkTarget | undefined>(undefined)
	const layoutRef = useRef<ChunkLayout | undefined>(undefined)
	const scrollAnchorRef = useRef<NovelScrollAnchor>({
		paragraphIndex: 0,
		fraction: 0,
	})
	// One-shot flag set by the layout effect on a pure resize / reflow:
	// the next `syncScrollWithinChunk` skips writing back the anchor so
	// the persisted fraction doesn't drift by `pageWidth / boxWidth`
	// every time the user resizes the window.
	const suppressAnchorSyncRef = useRef(false)
	const [pageSize, setPageSize] = useState<{
		width: number
		height: number
	}>({ width: 0, height: 0 })
	useEffect(function trackContainerSize() {
		const root = containerRef.current
		if (root === null) return
		function update() {
			if (root === null) return
			setPageSize({
				width: root.clientWidth,
				height: root.clientHeight,
			})
		}
		update()
		const observer = new ResizeObserver(update)
		observer.observe(root)
		return () => observer.disconnect()
	}, [])
	const reportScrollAnchor = useEventCallback(onScrollAnchorChange)
	// After every chunk swap, font/size change, or container resize we
	// have to re-measure the multi-column layout to map paragraphs back
	// to columns. We deliberately reset `scrollLeft` to 0 before
	// measuring so that paragraphs of the *new* chunk are read in
	// absolute layout coordinates (otherwise a stale scroll offset from
	// the previous chunk skews the math).
	useLayoutEffect(
		function measureChunkLayout() {
			const root = containerRef.current
			if (root === null) return
			const pageWidth = root.clientWidth
			if (pageWidth === 0) return
			root.scrollLeft = 0
			const containerLeft = root.getBoundingClientRect().left
			const paraEls = root.querySelectorAll<HTMLElement>("[data-pidx]")
			const paragraphBoxes = new Map<
				number,
				{ readonly left: number; readonly width: number }
			>()
			paraEls.forEach(function record(el) {
				const pidx = Number(el.dataset.pidx)
				if (Number.isNaN(pidx)) return
				const r = el.getBoundingClientRect()
				const left = r.left - containerLeft + root.scrollLeft
				if (!paragraphBoxes.has(pidx)) {
					paragraphBoxes.set(pidx, { left, width: r.width })
				}
			})
			const pagesInChunk = Math.max(1, Math.ceil(root.scrollWidth / pageWidth))
			layoutRef.current = {
				pagesInChunk,
				paragraphBoxes,
			}
			setPagesByChunk(function update(prev) {
				if (prev.get(chunkIdx) === pagesInChunk) return prev
				const next = new Map(prev)
				next.set(chunkIdx, pagesInChunk)
				return next
			})
			const pending = pendingRef.current
			pendingRef.current = undefined
			let targetPage: number
			if (pending === undefined) {
				targetPage = anchorToPage(
					scrollAnchorRef.current,
					paragraphBoxes,
					pageWidth,
					pagesInChunk,
				)
			} else if (pending.kind === "first") {
				targetPage = 0
			} else if (pending.kind === "last") {
				targetPage = pagesInChunk - 1
			} else if (pending.kind === "page") {
				targetPage = Math.max(0, Math.min(pending.page, pagesInChunk - 1))
			} else {
				targetPage = anchorToPage(
					{ paragraphIndex: pending.paragraph, fraction: pending.fraction },
					paragraphBoxes,
					pageWidth,
					pagesInChunk,
				)
			}
			setPageInChunk(targetPage)
			root.scrollTo({ left: targetPage * pageWidth, behavior: "auto" })
			// Pure resize / reflow path: keep the persisted anchor stable so
			// the fraction doesn't snap toward the page boundary on every
			// re-measure. Intentional navigation (`first` / `last` / `page` /
			// `anchor`) DOES reset the anchor to wherever we landed, because
			// the caller meant to move there.
			if (pending !== undefined) {
				const anchor = pageToAnchor(targetPage, paragraphBoxes, pageWidth)
				if (anchor !== undefined) {
					scrollAnchorRef.current = anchor
					reportScrollAnchor(anchor)
				}
			} else if (targetPage !== pageInChunk) {
				// `setPageInChunk` will trigger `syncScrollWithinChunk`; tell it
				// to skip the anchor write so the persisted fraction doesn't
				// drift on resize. Only arm the flag when pageInChunk will
				// actually change (otherwise React no-ops the setter and the
				// flag would survive into the next user navigation).
				suppressAnchorSyncRef.current = true
			}
		},
		// `pageInChunk` is intentionally excluded — the page-sync effect
		// below handles within-chunk page changes; remeasuring on every
		// page flip would be wasteful.
		[
			chunkIdx,
			pageSize.width,
			pageSize.height,
			settings.fontSize,
			settings.lineHeight,
			settings.letterSpacing,
			settings.bgColor,
			document.paragraphs,
			reportScrollAnchor,
		],
	)
	useEffect(
		function syncScrollWithinChunk() {
			const root = containerRef.current
			if (root === null) return
			const pageWidth = root.clientWidth
			if (pageWidth === 0) return
			const target = pageInChunk * pageWidth
			if (Math.abs(root.scrollLeft - target) > 1) {
				root.scrollTo({ left: target, behavior: "auto" })
			}
			if (suppressAnchorSyncRef.current) {
				suppressAnchorSyncRef.current = false
				return
			}
			const layout = layoutRef.current
			if (layout === undefined) return
			const anchor = pageToAnchor(pageInChunk, layout.paragraphBoxes, pageWidth)
			if (anchor !== undefined) {
				scrollAnchorRef.current = anchor
				reportScrollAnchor(anchor)
			}
		},
		[pageInChunk, reportScrollAnchor],
	)
	const goPrev = useCallback(
		function goPrev() {
			if (pageInChunk > 0) {
				setPageInChunk(pageInChunk - 1)
				return
			}
			if (chunkIdx > 0) {
				pendingRef.current = { kind: "last" }
				setChunkIdx(chunkIdx - 1)
			}
		},
		[chunkIdx, pageInChunk],
	)
	const goNext = useCallback(
		function goNext() {
			const layout = layoutRef.current
			if (layout !== undefined && pageInChunk + 1 < layout.pagesInChunk) {
				setPageInChunk(pageInChunk + 1)
				return
			}
			if (chunkIdx + 1 < chunkIndex.chunks.length) {
				pendingRef.current = { kind: "first" }
				setChunkIdx(chunkIdx + 1)
			}
		},
		[chunkIdx, pageInChunk, chunkIndex.chunks.length],
	)
	useEffect(
		function bindKeys() {
			function onKey(e: KeyboardEvent) {
				if (e.key === "ArrowRight") goNext()
				else if (e.key === "ArrowLeft") goPrev()
			}
			window.addEventListener("keydown", onKey)
			return () => window.removeEventListener("keydown", onKey)
		},
		[goNext, goPrev],
	)
	useEffect(
		function jumpExternal() {
			if (scrollToAnchor === undefined) return
			const target = scrollToAnchor.paragraphIndex
			const fraction = scrollToAnchor.fraction
			const targetChunk = chunkIndex.chunkOfParagraph(target)
			if (targetChunk !== chunkIdx) {
				pendingRef.current = {
					kind: "anchor",
					paragraph: target,
					fraction,
				}
				setChunkIdx(targetChunk)
			} else {
				const root = containerRef.current
				const layout = layoutRef.current
				if (root !== null && layout !== undefined) {
					const pageWidth = root.clientWidth
					const page = anchorToPage(
						{ paragraphIndex: target, fraction },
						layout.paragraphBoxes,
						pageWidth,
						layout.pagesInChunk,
					)
					setPageInChunk(page)
				}
			}
			onScrollHandled()
		},
		[scrollToAnchor, onScrollHandled, chunkIndex, chunkIdx],
	)
	// Estimated pages-per-chunk, used to fill in chunks the user has
	// not visited yet so the global page indicator stays useful before
	// every chunk has been measured. Once all chunks are measured the
	// estimate is unused.
	const estPagesPerChunk = useMemo(
		function estimate() {
			if (pagesByChunk.size === 0) return 1
			let sum = 0
			for (const v of pagesByChunk.values()) sum += v
			return Math.max(1, Math.round(sum / pagesByChunk.size))
		},
		[pagesByChunk],
	)
	const totalPages = useMemo(
		function computeTotal() {
			let total = 0
			for (let i = 0; i < chunkIndex.chunks.length; i++) {
				total += pagesByChunk.get(i) ?? estPagesPerChunk
			}
			return Math.max(1, total)
		},
		[chunkIndex.chunks.length, pagesByChunk, estPagesPerChunk],
	)
	const currentPage = useMemo(
		function computeCurrent() {
			let acc = 0
			for (let i = 0; i < chunkIdx; i++) {
				acc += pagesByChunk.get(i) ?? estPagesPerChunk
			}
			return acc + pageInChunk + 1
		},
		[chunkIdx, pageInChunk, pagesByChunk, estPagesPerChunk],
	)
	const reportPageStats = useEventCallback(onPageStatsChange)
	useEffect(
		function emitPageStats() {
			reportPageStats({ current: currentPage, total: totalPages })
		},
		[currentPage, totalPages, reportPageStats],
	)
	useEffect(
		function jumpToPage() {
			if (scrollToPage === undefined) return
			const target1 = Math.max(1, Math.min(totalPages, scrollToPage))
			let acc = 0
			for (let i = 0; i < chunkIndex.chunks.length; i++) {
				const pages = pagesByChunk.get(i) ?? estPagesPerChunk
				if (target1 - 1 < acc + pages) {
					const inChunk = target1 - 1 - acc
					if (i === chunkIdx) {
						setPageInChunk(Math.max(0, Math.min(pages - 1, inChunk)))
					} else {
						pendingRef.current = { kind: "page", page: inChunk }
						setChunkIdx(i)
					}
					break
				}
				acc += pages
			}
			onScrollToPageHandled()
		},
		// `pagesByChunk` and `estPagesPerChunk` are read for navigation but
		// updating them shouldn't retrigger the jump; the effect only
		// fires when the parent issues a new `scrollToPage` request.
		[scrollToPage],
	)
	const handlePointerDown = useCallback(
		function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
			// Ignore secondary buttons; only finger / pen / left-click open
			// page turns and long-press dialogs.
			if (e.pointerType === "mouse" && e.button !== 0) return
			const targetEl = e.target as HTMLElement
			const tappedBadge =
				targetEl.closest("[data-novel-comment-badge]") !== null
			const paraEl = targetEl.closest("[data-pidx]") as HTMLElement | null
			const paragraph =
				paraEl?.dataset.pidx !== undefined ? Number(paraEl.dataset.pidx) : -1
			const timer = window.setTimeout(function fire() {
				const tracker = pressRef.current
				if (tracker === undefined) return
				if (tracker.tappedBadge) return
				tracker.fired = true
				if (tracker.paragraph >= 0) onParagraphLongPress(tracker.paragraph)
			}, LONG_PRESS_MS)
			pressRef.current = {
				x: e.clientX,
				y: e.clientY,
				timer,
				paragraph,
				fired: false,
				tappedBadge,
			}
		},
		[onParagraphLongPress],
	)
	const handlePointerMove = useCallback(function handlePointerMove(
		e: React.PointerEvent<HTMLDivElement>,
	) {
		const tracker = pressRef.current
		if (tracker === undefined) return
		const dx = Math.abs(e.clientX - tracker.x)
		const dy = Math.abs(e.clientY - tracker.y)
		if (dx > TAP_MOVE_TOLERANCE_PX || dy > TAP_MOVE_TOLERANCE_PX) {
			window.clearTimeout(tracker.timer)
			pressRef.current = undefined
		}
	}, [])
	const handlePointerUp = useCallback(
		function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
			const tracker = pressRef.current
			if (tracker === undefined) return
			window.clearTimeout(tracker.timer)
			pressRef.current = undefined
			if (tracker.fired) return
			if (tracker.tappedBadge) {
				if (tracker.paragraph >= 0) {
					onParagraphCommentTap(tracker.paragraph)
				}
				return
			}
			const root = containerRef.current
			if (root === null) return
			const rect = root.getBoundingClientRect()
			if (e.clientX - rect.left < rect.width / 2) goPrev()
			else goNext()
		},
		[goNext, goPrev, onParagraphCommentTap],
	)
	const handlePointerCancel = useCallback(function handlePointerCancel() {
		const tracker = pressRef.current
		if (tracker === undefined) return
		window.clearTimeout(tracker.timer)
		pressRef.current = undefined
	}, [])
	// Column-pitch math: one viewport page must equal exactly one
	// column position (`pageWidth`). With `padding-inline = sidePad`
	// and `column-gap = 2 * sidePad`, column N is centered in page N
	// at offset `(N-1) * pageWidth + sidePad`. This keeps `scrollLeft
	// = N * pageWidth` on a clean page boundary regardless of viewport
	// width \u2014 fixing the cumulative drift the previous
	// `column-width = pageWidth, column-gap = 0, padding = sidePad`
	// combination produced (each column's content area was narrower
	// than `pageWidth`, so columns and viewport pages no longer
	// aligned and `pageOfParagraph` rounded to the wrong page).
	const innerStyle =
		pageSize.width > 0
			? ({
					height: `${pageSize.height}px`,
					columnWidth: `${Math.max(1, pageSize.width - 2 * COLUMN_SIDE_PADDING)}px`,
					columnGap: `${2 * COLUMN_SIDE_PADDING}px`,
					columnFill: "auto",
					paddingTop: `${COLUMN_TOP_PADDING}px`,
					paddingBottom: `${COLUMN_BOTTOM_PADDING}px`,
					paddingLeft: `${COLUMN_SIDE_PADDING}px`,
					paddingRight: `${COLUMN_SIDE_PADDING}px`,
					boxSizing: "border-box",
				} as const)
			: ({ height: "100%" } as const)
	const baseParagraphStyle = useMemo(
		() => ({
			fontSize: `${settings.fontSize}px`,
			lineHeight: settings.lineHeight,
			letterSpacing: `${settings.letterSpacing}em`,
		}),
		[settings.fontSize, settings.lineHeight, settings.letterSpacing],
	)
	const activeChunk = chunkIndex.chunks[chunkIdx]
	return (
		<div
			ref={containerRef}
			className="relative h-full w-full touch-pan-y overflow-x-hidden overflow-y-hidden select-none"
			data-testid="novel-body"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
		>
			<div style={innerStyle}>
				{activeChunk?.paragraphs.map(function renderParagraph(p) {
					return (
						<NovelParagraphView
							key={p.index}
							paragraph={p}
							baseStyle={baseParagraphStyle}
							commentCount={commentsByParagraph.get(p.index)?.length ?? 0}
						/>
					)
				})}
			</div>
		</div>
	)
}

type ChunkLayout = {
	readonly pagesInChunk: number
	readonly paragraphBoxes: ReadonlyMap<
		number,
		{ readonly left: number; readonly width: number }
	>
}

type PendingChunkTarget =
	| { readonly kind: "first" }
	| { readonly kind: "last" }
	| {
			readonly kind: "anchor"
			readonly paragraph: number
			readonly fraction: number
	  }
	| { readonly kind: "page"; readonly page: number }

/**
 * Map `pageInChunk` (the leftmost visible column index) to a stable
 * `{ paragraphIndex, fraction }` anchor: the paragraph whose layout box
 * contains the page's left edge, plus where along that box the edge lies.
 * Returns `undefined` when no paragraphs have been measured (e.g. empty
 * chunk). The anchor is reflow-invariant — `fraction` tracks roughly the
 * same text content even as `width` changes across font / viewport reflows.
 */
function pageToAnchor(
	pageInChunk: number,
	paragraphBoxes: ReadonlyMap<
		number,
		{ readonly left: number; readonly width: number }
	>,
	pageWidth: number,
): NovelScrollAnchor | undefined {
	if (paragraphBoxes.size === 0) return undefined
	const pageLeft = pageInChunk * pageWidth
	let containing:
		| { readonly pidx: number; readonly left: number; readonly width: number }
		| undefined
	let firstAfter:
		| { readonly pidx: number; readonly left: number; readonly width: number }
		| undefined
	let lastSeen:
		| { readonly pidx: number; readonly left: number; readonly width: number }
		| undefined
	for (const [pidx, box] of paragraphBoxes) {
		lastSeen = { pidx, left: box.left, width: box.width }
		if (box.left <= pageLeft && pageLeft < box.left + box.width) {
			containing = lastSeen
			break
		}
		if (box.left > pageLeft && firstAfter === undefined) {
			firstAfter = lastSeen
		}
	}
	const picked = containing ?? firstAfter ?? lastSeen
	if (picked === undefined) return undefined
	const width = Math.max(1, picked.width)
	const raw = (pageLeft - picked.left) / width
	const fraction = Math.max(0, Math.min(1, raw))
	return { paragraphIndex: picked.pidx, fraction }
}

/**
 * Invert {@link pageToAnchor}: given a persisted anchor, find the page in
 * the freshly-measured layout that contains `box.left + fraction * box.width`.
 * Falls back to page 0 when the paragraph is outside the current chunk.
 */
function anchorToPage(
	anchor: NovelScrollAnchor,
	paragraphBoxes: ReadonlyMap<
		number,
		{ readonly left: number; readonly width: number }
	>,
	pageWidth: number,
	pagesInChunk: number,
): number {
	const box = paragraphBoxes.get(anchor.paragraphIndex)
	if (box === undefined) return 0
	const fraction = Math.max(0, Math.min(1, anchor.fraction))
	const x = box.left + fraction * box.width
	const page = Math.floor(x / pageWidth)
	return Math.max(0, Math.min(page, pagesInChunk - 1))
}

/**
 * Latest-callback ref so layout effects can call user callbacks
 * without re-running every time the parent component reissues a new
 * function identity. The returned function is stable across renders;
 * its body always reads the most recent prop.
 */
function useEventCallback<TArgs extends readonly unknown[], TReturn>(
	cb: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
	const ref = useRef(cb)
	useEffect(() => {
		ref.current = cb
	}, [cb])
	return useCallback(function stable(...args: TArgs) {
		return ref.current(...args)
	}, [])
}
