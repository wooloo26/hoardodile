import type { Message } from "@hoardodile/plugin-sdk-web"
import { useEffect, useMemo, useRef, useState } from "react"

/**
 * CSS-keyframes scrolling comment overlay for the manga reader. Each
 * comment is laid out into one of N horizontal lanes and animated
 * right→left across the page. Unlike the video player's danmaku
 * engine this surface has no time axis (it is a static page), so we
 * recycle lanes round-robin and stagger the start offsets to avoid
 * everything piling up in lane 0.
 */
export function MangaPageCommentOverlay(props: {
	readonly comments: readonly Message[]
	readonly enabled: boolean
}) {
	const { comments, enabled } = props
	// When disabled the overlay does no work at all — no observers, no
	// memo invalidation, no DOM. Skipping the `useEffect`/`useMemo`
	// branches below would violate the rules of hooks, so we render a
	// static empty span instead. Each manga page in the scroll view
	// instantiates one of these, so trimming this path is the
	// difference between O(1) and O(pages) ResizeObservers.
	if (!enabled || comments.length === 0) return null
	return <ActiveOverlay comments={comments} />
}

function ActiveOverlay(props: { readonly comments: readonly Message[] }) {
	const { comments } = props
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [lanes, setLanes] = useState(8)
	useEffect(() => {
		const node = containerRef.current
		if (node === null) return
		const ro = new ResizeObserver(() => {
			const h = node.clientHeight
			// 26 px per lane → leaves enough vertical space for the text
			// without crowding; clamp so very short pages still get a
			// few lanes and very tall pages don't waste rows.
			setLanes(Math.max(4, Math.min(16, Math.floor(h / 26))))
		})
		ro.observe(node)
		return () => ro.disconnect()
	}, [])
	const items = useMemo(() => {
		// Round-robin lane assignment + staggered animation delay so a
		// burst of comments fans out across the page.
		return comments.map((c, i) => ({
			id: c.id,
			text: c.body,
			lane: i % lanes,
			delaySec: (i * 0.6) % 6,
		}))
	}, [comments, lanes])
	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 overflow-hidden"
			data-testid="manga-page-comment-overlay"
		>
			{items.map((it) => (
				<span
					key={it.id}
					className="absolute top-0 whitespace-nowrap text-sm font-medium text-white"
					style={{
						top: `${(it.lane / lanes) * 100}%`,
						textShadow:
							"0 0 1px #000, 0 0 1px #000, 0 0 1px #000, 0 0 1px #000",
						animation: `manga-comment-scroll 12s linear ${it.delaySec}s infinite`,
					}}
				>
					{it.text}
				</span>
			))}
			<style>{`
				@keyframes manga-comment-scroll {
					0% { transform: translateX(100vw); }
					100% { transform: translateX(-100%); }
				}
			`}</style>
		</div>
	)
}
