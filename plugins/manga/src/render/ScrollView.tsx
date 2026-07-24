import type { Message } from "@hoardodile/plugin-sdk-web"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MangaPage } from "../shared"
import { estimatePageHeight, FALLBACK_PAGE_ASPECT } from "./helpers"
import { usePluginAPI } from "./hooks"
import { MangaPageCommentOverlay } from "./PageCommentOverlay"

/**
 * Vertical-scroll page layout with skeleton placeholders.
 *
 * The list is virtualised via `@tanstack/react-virtual` so that long
 * manga only mount the `<img>` elements inside the viewport (plus a
 * small overscan buffer). Each page gets a skeleton placeholder of a
 * fixed estimated height; when the image actually loads it expands
 * naturally. The scrollbar is therefore approximate — acceptable in
 * exchange for zero metadata dependency and minimal layout-shift.
 *
 * Zoom is delegated to ctrl+wheel.
 */

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
/** Hard cap for the page column width at zoom = 1, in CSS pixels. */
const MAX_RENDER_WIDTH = 900
/** Number of off-screen pages to keep mounted at each end of the window. */
const OVERSCAN = 3
/**
 * Upper bound for re-asserting a scroll target against measurement
 * corrections; generous enough for a full page-load cascade, small
 * enough to never spin forever.
 */
const MAX_SCROLL_ASSERTS = 60

export function MangaScrollView(props: {
	readonly pages: readonly MangaPage[]
	readonly useOriginal: boolean
	readonly currentPageIndex: number
	readonly onPageVisible: (index: number) => void
	readonly perPageComments: ReadonlyMap<string, readonly Message[]>
	readonly showComments: boolean
	/** Triggers a smooth scroll to a specific page; resets to undefined after. */
	readonly scrollToPage: number | undefined
	readonly onScrollHandled: () => void
	/**
	 * Pre-known total page count from `fileStats.count`. Used to size
	 * the virtualizer's scrollbar before all `pages` have loaded.
	 */
	readonly expectedCount?: number
}) {
	const {
		pages,
		useOriginal,
		onPageVisible,
		perPageComments,
		showComments,
		scrollToPage,
		onScrollHandled,
		expectedCount,
	} = props
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [zoom, setZoom] = useState(1)
	const [containerWidth, setContainerWidth] = useState(0)
	const activePageRef = useRef(0)
	const containerWidthRef = useRef(0)
	const pendingRestoreRef = useRef<number | undefined>(undefined)
	const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	)
	const isResizingRef = useRef(false)
	useEffect(function trackContainerWidth() {
		const root = containerRef.current
		if (root === null) return
		function update() {
			if (root === null) return
			// The iframe may have been hidden on mount; a pending scroll
			// target becomes reachable as soon as real dimensions arrive.
			assertScrollTarget()
			if (
				containerWidthRef.current > 0 &&
				root.clientWidth !== containerWidthRef.current
			) {
				if (pendingRestoreRef.current === undefined) {
					pendingRestoreRef.current = activePageRef.current
				}
				isResizingRef.current = true
				if (resizeTimeoutRef.current !== undefined)
					clearTimeout(resizeTimeoutRef.current)
				resizeTimeoutRef.current = setTimeout(() => {
					if (pendingRestoreRef.current === undefined) return
					const target = pendingRestoreRef.current
					pendingRestoreRef.current = undefined
					virtualizerRef.current.scrollToIndex(target, { align: "start" })
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							isResizingRef.current = false
						})
					})
				}, 150)
			}
			containerWidthRef.current = root.clientWidth
			setContainerWidth(root.clientWidth)
		}
		update()
		const ro = new ResizeObserver(update)
		ro.observe(root)
		return () => {
			ro.disconnect()
			if (resizeTimeoutRef.current !== undefined)
				clearTimeout(resizeTimeoutRef.current)
		}
	}, [])
	const renderWidth = useMemo(() => {
		if (containerWidth <= 0) return 0
		const base = Math.min(containerWidth, MAX_RENDER_WIDTH)
		return Math.min(containerWidth, base * zoom)
	}, [containerWidth, zoom])
	const virtualCount = Math.max(pages.length, expectedCount ?? 0)
	const estimateSize = useCallback(
		function estimateSize(index: number) {
			const page = pages[index]
			if (page !== undefined) {
				return estimatePageHeight(page, renderWidth)
			}
			return Math.round(renderWidth * FALLBACK_PAGE_ASPECT)
		},
		[pages, renderWidth],
	)
	const virtualizer = useVirtualizer({
		count: virtualCount,
		getScrollElement: () => containerRef.current,
		estimateSize,
		overscan: OVERSCAN,
		getItemKey: (index) => pages[index]?.filename ?? index,
		measureElement: (el) => Math.floor(el.getBoundingClientRect().height),
	})
	const virtualizerRef = useRef(virtualizer)
	virtualizerRef.current = virtualizer
	const onScrollHandledRef = useRef(onScrollHandled)
	onScrollHandledRef.current = onScrollHandled
	/**
	 * Scroll target (restore or manual jump) being converged on. Two
	 * hazards make a single `scrollToIndex` insufficient:
	 *  - the host keeps the iframe `display:none` until it finishes
	 *    positioning it, where any scroll is a silent no-op;
	 *  - images above the target load *after* the jump, and the
	 *    virtualizer applies the size corrections via `transform` — which
	 *    the browser's scroll anchoring does not compensate — so the
	 *    content drifts under a static scrollTop.
	 * The target is therefore re-asserted on every measurement pass
	 * until the visible page matches it, and page-visible reports stay
	 * suppressed meanwhile so a pending jump is never overwritten with
	 * whatever page the drift happens to show.
	 */
	const pendingScrollRef = useRef<number | undefined>(undefined)
	const scrollAssertsRef = useRef(0)

	function assertScrollTarget() {
		const target = pendingScrollRef.current
		if (target === undefined) return
		const root = containerRef.current
		if (root === null || root.clientHeight === 0) return
		// Bound the convergence loop; giving up is safe because reporting
		// resumes from the actually-visible page.
		if (scrollAssertsRef.current >= MAX_SCROLL_ASSERTS) {
			pendingScrollRef.current = undefined
			onScrollHandledRef.current()
			return
		}
		scrollAssertsRef.current += 1
		virtualizerRef.current.scrollToIndex(target, { align: "start" })
	}

	const virtualItems = virtualizer.getVirtualItems()
	const activePageIndex = useMemo(() => {
		if (virtualItems.length === 0) return 0
		const root = containerRef.current
		if (root === null) return virtualItems[0]?.index ?? 0
		const top = root.scrollTop
		for (const it of virtualItems) {
			if (top < it.end) return it.index
		}
		const last = virtualItems[virtualItems.length - 1]
		return last?.index ?? 0
	}, [virtualItems])
	useEffect(() => {
		activePageRef.current = activePageIndex
	}, [activePageIndex])
	useEffect(
		function settleScrollTarget() {
			const target = pendingScrollRef.current
			if (target === undefined) return
			if (activePageIndex === target) {
				pendingScrollRef.current = undefined
				onScrollHandledRef.current()
				return
			}
			assertScrollTarget()
		},
		[activePageIndex, virtualItems],
	)
	useEffect(
		function reportActive() {
			if (isResizingRef.current) return
			if (pendingScrollRef.current !== undefined) return
			onPageVisible(activePageIndex)
		},
		[activePageIndex, onPageVisible],
	)
	useEffect(
		function jumpToTarget() {
			if (scrollToPage === undefined) return
			pendingScrollRef.current = scrollToPage
			scrollAssertsRef.current = 0
			assertScrollTarget()
		},
		[scrollToPage],
	)
	useEffect(function bindCtrlWheelZoom() {
		const root = containerRef.current
		if (root === null) return
		function onWheel(e: WheelEvent) {
			if (!e.ctrlKey) return
			e.preventDefault()
			const step = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
			setZoom((z) => clampZoom(z + step))
		}
		root.addEventListener("wheel", onWheel, { passive: false })
		return () => root.removeEventListener("wheel", onWheel)
	}, [])
	const totalSize = virtualizer.getTotalSize()
	// Width starts at 0 before the first layout (and while the host keeps
	// the iframe hidden); rendering items then would size every estimate
	// from a bogus width and guarantee a correction wave once the real
	// width arrives.
	const showItems = renderWidth > 0
	return (
		<div
			ref={containerRef}
			className="manga-scrollbar relative h-full w-full overflow-y-auto bg-black"
			style={{ scrollbarGutter: "stable" }}
			data-testid="manga-scroll-view"
		>
			<div
				className="relative mx-auto"
				style={{
					height: `${totalSize}px`,
					width: renderWidth > 0 ? `${renderWidth}px` : "100%",
				}}
			>
				{showItems &&
					virtualItems.map((vi) => {
						const page = pages[vi.index]
						if (page === undefined) return null
						const isActive = vi.index === activePageIndex
						return (
							<div
								key={vi.key}
								data-index={vi.index}
								data-page-index={vi.index}
								ref={virtualizer.measureElement}
								className="absolute left-0 w-full"
								style={{
									transform: `translateY(${vi.start}px)`,
									lineHeight: 0,
								}}
							>
								<MangaPageImage
									page={page}
									useOriginal={useOriginal}
									renderWidth={renderWidth}
									loading={
										Math.abs(vi.index - activePageIndex) <= 3 ? "eager" : "lazy"
									}
								/>
								<MangaPageCommentOverlay
									comments={perPageComments.get(page.filename) ?? []}
									enabled={showComments && isActive}
								/>
							</div>
						)
					})}
			</div>
		</div>
	)
}

function MangaPageImage(props: {
	readonly page: MangaPage
	readonly useOriginal: boolean
	readonly renderWidth: number
	readonly loading?: "eager" | "lazy"
}) {
	const { page, useOriginal, renderWidth, loading } = props
	const api = usePluginAPI()
	const [loaded, setLoaded] = useState(false)
	const skeletonHeight = useMemo(
		() => estimatePageHeight(page, renderWidth),
		[page, renderWidth],
	)
	return (
		<div
			className="relative w-full"
			style={loaded ? undefined : { minHeight: skeletonHeight }}
		>
			{!loaded && (
				<div
					className="absolute inset-0 animate-pulse bg-neutral-800"
					data-testid="manga-page-skeleton"
				/>
			)}
			<img
				src={api.resolveFileUrl(
					page.filename,
					!useOriginal && page.type === "image" && page.preview
						? "preview"
						: "original",
				)}
				alt={page.filename}
				loading={loading ?? "lazy"}
				decoding="async"
				className="block w-full select-none"
				draggable={false}
				onLoad={() => setLoaded(true)}
			/>
		</div>
	)
}

function clampZoom(value: number): number {
	if (value < MIN_ZOOM) return MIN_ZOOM
	if (value > MAX_ZOOM) return MAX_ZOOM
	return value
}
