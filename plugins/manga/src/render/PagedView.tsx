import type { Message } from "@hoardodile/plugin-sdk-web"
import { useCallback, useEffect, useRef } from "react"
import {
	type ReactZoomPanPinchRef,
	TransformComponent,
	TransformWrapper,
} from "react-zoom-pan-pinch"
import type { MangaPage } from "../shared"
import { usePluginAPI } from "./hooks"
import { MangaPageCommentOverlay } from "./PageCommentOverlay"

const TAP_MOVE_TOLERANCE_PX = 8

/**
 * Width of the centre zoom strip, expressed as a fraction of the
 * viewport width. Tapping inside this strip toggles double-click
 * zoom; tapping outside it (left / right wings) is reserved for
 * page navigation. Two-finger pinch always works regardless of
 * which strip the gesture starts in because the pinch handler is
 * registered on the parent container.
 */
const CENTER_ZOOM_FRACTION = 1 / 3

/**
 * Single-page view. The `react-zoom-pan-pinch` wrapper handles
 * two-finger pinch on touch devices and mouse-wheel zoom. The
 * library's built-in double-click-zoom is disabled in favour of a
 * dedicated central strip: only double-clicks landing inside the
 * middle third of the viewport zoom; double-clicks on the left /
 * right wings turn the page like a single tap, so the user cannot
 * accidentally zoom while flipping pages quickly. Page navigation
 * is driven by tapping the left or right wing (with `direction`
 * deciding which side advances); arrow keys mirror the same intent.
 */
export function MangaPagedView(props: {
	readonly pages: readonly MangaPage[]
	readonly useOriginal: boolean
	readonly currentPageIndex: number
	readonly onChangePage: (index: number) => void
	readonly perPageComments: ReadonlyMap<string, readonly Message[]>
	readonly showComments: boolean
	readonly direction: "ltr" | "rtl"
}) {
	const {
		pages,
		useOriginal,
		currentPageIndex,
		onChangePage,
		perPageComments,
		showComments,
		direction,
	} = props
	const api = usePluginAPI()
	const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const pressRef = useRef<
		{ x: number; y: number; aborted: boolean } | undefined
	>(undefined)
	const page = pages[currentPageIndex]
	// Reset zoom whenever the active page changes so each page starts
	// fit-to-view; without this the panned offset of the previous page
	// would carry over.
	useEffect(() => {
		transformRef.current?.resetTransform(0)
	}, [currentPageIndex])
	// Eagerly fetch the immediate neighbours so flipping forward /
	// backward swaps the `<img>` src against an already-warm browser
	// cache. We only preload ±1 here; the user's intent on the next
	// keystroke is one neighbour away, anything farther is speculation
	// and would just waste bandwidth on huge volumes.
	useEffect(
		function preloadNeighbours() {
			const targets: number[] = []
			if (currentPageIndex + 1 < pages.length) {
				targets.push(currentPageIndex + 1)
			}
			if (currentPageIndex - 1 >= 0) targets.push(currentPageIndex - 1)
			const imgs = targets.map(function preload(idx) {
				const p = pages[idx]
				if (p === undefined) return undefined
				const img = new Image()
				img.decoding = "async"
				img.src = api.resolveFileUrl(
					p.filename,
					!useOriginal && p.type === "image" && p.preview
						? "preview"
						: "original",
				)
				return img
			})
			return function cancelPreload() {
				for (const img of imgs) {
					if (img !== undefined) img.src = ""
				}
			}
		},
		[pages, currentPageIndex, api, useOriginal],
	)
	const goPrev = useCallback(
		function goPrev() {
			if (currentPageIndex > 0) onChangePage(currentPageIndex - 1)
		},
		[currentPageIndex, onChangePage],
	)
	const goNext = useCallback(
		function goNext() {
			if (currentPageIndex < pages.length - 1) {
				onChangePage(currentPageIndex + 1)
			}
		},
		[currentPageIndex, pages.length, onChangePage],
	)
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "ArrowRight") {
				if (direction === "rtl") goPrev()
				else goNext()
			} else if (e.key === "ArrowLeft") {
				if (direction === "rtl") goNext()
				else goPrev()
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [goPrev, goNext, direction])
	const handlePointerDown = useCallback(function handlePointerDown(
		e: React.PointerEvent<HTMLDivElement>,
	) {
		if (e.pointerType === "mouse" && e.button !== 0) return
		pressRef.current = { x: e.clientX, y: e.clientY, aborted: false }
	}, [])
	const handlePointerMove = useCallback(function handlePointerMove(
		e: React.PointerEvent<HTMLDivElement>,
	) {
		const tracker = pressRef.current
		if (tracker === undefined || tracker.aborted) return
		const dx = Math.abs(e.clientX - tracker.x)
		const dy = Math.abs(e.clientY - tracker.y)
		if (dx > TAP_MOVE_TOLERANCE_PX || dy > TAP_MOVE_TOLERANCE_PX) {
			tracker.aborted = true
		}
	}, [])
	const handlePointerUp = useCallback(
		function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
			const tracker = pressRef.current
			pressRef.current = undefined
			if (tracker === undefined || tracker.aborted) return
			const root = containerRef.current
			if (root === null) return
			const rect = root.getBoundingClientRect()
			const xWithin = e.clientX - rect.left
			const centerHalf = (rect.width * CENTER_ZOOM_FRACTION) / 2
			const centerStart = rect.width / 2 - centerHalf
			const centerEnd = rect.width / 2 + centerHalf
			// Centre strip is reserved for click-to-zoom (double-click);
			// a single tap there is a no-op so the user can dwell to
			// double-click without page-flipping by accident.
			if (xWithin >= centerStart && xWithin <= centerEnd) return
			const isLeftHalf = xWithin < rect.width / 2
			const leftAction = direction === "rtl" ? goNext : goPrev
			const rightAction = direction === "rtl" ? goPrev : goNext
			if (isLeftHalf) leftAction()
			else rightAction()
		},
		[direction, goNext, goPrev],
	)
	const handleDoubleClick = useCallback(function handleDoubleClick(
		e: React.MouseEvent<HTMLDivElement>,
	) {
		const root = containerRef.current
		if (root === null) return
		const rect = root.getBoundingClientRect()
		const xWithin = e.clientX - rect.left
		const centerHalf = (rect.width * CENTER_ZOOM_FRACTION) / 2
		const centerStart = rect.width / 2 - centerHalf
		const centerEnd = rect.width / 2 + centerHalf
		if (xWithin < centerStart || xWithin > centerEnd) return
		const api = transformRef.current
		if (api === undefined || api === null) return
		// Toggle: if already zoomed in, reset; otherwise zoom toward
		// the click point so the gesture mirrors the library's old
		// `doubleClick.mode = "zoomIn"` behaviour but constrained to
		// the central strip.
		const scale = api.state.scale
		if (scale > 1.01) api.resetTransform()
		else api.zoomIn(2)
	}, [])
	if (page === undefined) return null
	return (
		<div
			ref={containerRef}
			className="relative h-full w-full bg-black"
			data-testid="manga-paged-view"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onDoubleClick={handleDoubleClick}
		>
			<TransformWrapper
				ref={transformRef}
				initialScale={1}
				minScale={1}
				maxScale={4}
				doubleClick={{ disabled: true }}
				wheel={{ step: 0.2 }}
				pinch={{ step: 5 }}
				panning={{ velocityDisabled: true }}
				centerOnInit
			>
				<TransformComponent
					wrapperClass="!h-full !w-full"
					contentClass="!flex !h-full !w-full !items-center !justify-center"
				>
					<div className="relative flex h-full w-full items-center justify-center">
						<img
							src={api.resolveFileUrl(
								page.filename,
								!useOriginal && page.type === "image" && page.preview
									? "preview"
									: "original",
							)}
							alt={page.filename}
							// At minScale=1 the image must fully fit inside the
							// viewport (no tiling, no spread). `object-contain`
							// inside a `h-full w-full` parent does that
							// uniformly for both portrait and landscape pages;
							// the user can still pinch / wheel-zoom past 1×.
							className="h-full w-full select-none object-contain"
							draggable={false}
						/>
						<MangaPageCommentOverlay
							comments={perPageComments.get(page.filename) ?? []}
							enabled={showComments}
						/>
					</div>
				</TransformComponent>
			</TransformWrapper>
		</div>
	)
}
