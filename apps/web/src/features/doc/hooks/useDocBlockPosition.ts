import { produce } from "@hoardodile/shared/immer"
import { type RefObject, useCallback, useEffect, useRef } from "react"
import type { DocEditorHandle } from "@/features/doc/editor/DocEditor"
import type { DocBlock } from "@/features/doc/editor/schema"
import {
	blockOffsetFromAnchor,
	type DocBlockPositionEntry,
	type DocBlockPositions,
	docBlockPositionEntryEquals,
	readingAnchorY,
	scrollBlockToReadingAnchorAfterLayout,
} from "@/features/doc/lib/docReadingAnchor"
import { usePref } from "@/hooks/usePref"
import { prefKeys } from "@/lib/keys"

const SCROLL_DEBOUNCE_MS = 120
/** Ignore persist while restore scroll / cursor placement is settling. */
const RESTORE_SUPPRESS_MS = 400

function blockExistsInDoc(
	blocks: readonly DocBlock[],
	targetId: string,
): boolean {
	for (const block of blocks) {
		if (block.id === targetId) return true
		if (Array.isArray(block.children) && block.children.length > 0) {
			if (blockExistsInDoc(block.children as DocBlock[], targetId)) return true
		}
	}
	return false
}

function findTopmostVisibleBlock(
	editor: NonNullable<DocEditorHandle["editor"]>,
	visibleIds: ReadonlySet<string>,
): DocBlockPositionEntry | undefined {
	const root = editor.domElement
	if (root === null || root === undefined) return undefined

	const anchorY = readingAnchorY()
	let bestId: string | undefined
	let bestTop = Number.POSITIVE_INFINITY

	// Only measure blocks currently intersecting the viewport, avoiding a
	// full `querySelectorAll + getBoundingClientRect` scan on every scroll.
	for (const id of visibleIds) {
		const node = root.querySelector<HTMLElement>(`[data-id="${id}"]`)
		if (node === null) continue
		const rect = node.getBoundingClientRect()
		if (rect.bottom <= anchorY) continue
		if (rect.top < bestTop) {
			bestTop = rect.top
			bestId = id
		}
	}

	if (bestId === undefined) return undefined
	return { blockId: bestId, offset: Math.round(bestTop - anchorY) }
}

function restoreBlockPosition(
	editor: NonNullable<DocEditorHandle["editor"]>,
	entry: DocBlockPositionEntry,
) {
	editor.setTextCursorPosition(entry.blockId, "start")
	scrollBlockToReadingAnchorAfterLayout(
		entry.blockId,
		editor.domElement,
		entry.offset,
	)
}

function saveBlockPosition(
	docId: string,
	entry: DocBlockPositionEntry,
	positionsRef: RefObject<DocBlockPositions>,
	setPositions: (value: DocBlockPositions) => void,
) {
	if (docBlockPositionEntryEquals(positionsRef.current[docId], entry)) return
	setPositions(
		produce(positionsRef.current, (draft) => {
			draft[docId] = entry
		}),
	)
}

function debounce(fn: () => void, ms: number) {
	let timer: ReturnType<typeof setTimeout> | undefined
	function debounced() {
		if (timer !== undefined) clearTimeout(timer)
		timer = setTimeout(() => {
			timer = undefined
			fn()
		}, ms)
	}
	debounced.flush = () => {
		if (timer !== undefined) {
			clearTimeout(timer)
			timer = undefined
		}
		fn()
	}
	return debounced
}

/**
 * Persists the reading block per document via {@link prefSync} and
 * restores scroll position instantly (no animation) on re-entry.
 *
 * Tracks the topmost visible block on scroll (not only cursor position).
 * Returns an `onEditorReady` callback to pass to {@link DocEditor}.
 */
export function useDocBlockPosition(args: {
	readonly docId: string
	readonly editorHandleRef: RefObject<DocEditorHandle | null>
}): () => (() => void) | undefined {
	const { docId, editorHandleRef } = args
	const [positions, setPositions] = usePref<DocBlockPositions>(
		prefKeys.docBlockPositions,
		{},
	)
	const positionsRef = useRef(positions)
	positionsRef.current = positions
	const restoredDocIdRef = useRef<string | undefined>(undefined)
	const teardownRef = useRef<(() => void) | undefined>(undefined)
	const visibleBlockIdsRef = useRef<Set<string>>(new Set())
	const observerRef = useRef<IntersectionObserver | undefined>(undefined)

	useEffect(() => {
		return () => teardownRef.current?.()
	}, [])

	useEffect(() => {
		restoredDocIdRef.current = undefined
	}, [docId])

	return useCallback(
		function onEditorReady(): (() => void) | undefined {
			const instance = editorHandleRef.current?.editor
			if (instance === undefined) return undefined

			teardownRef.current?.()
			visibleBlockIdsRef.current.clear()
			observerRef.current?.disconnect()

			let suppressUntil = 0

			function persist(entry: DocBlockPositionEntry | undefined) {
				if (entry === undefined || Date.now() < suppressUntil) return
				saveBlockPosition(docId, entry, positionsRef, setPositions)
			}

			function observeBlocks() {
				const root = instance?.domElement
				if (root === null || root === undefined) return
				observerRef.current?.disconnect()
				visibleBlockIdsRef.current.clear()
				observerRef.current = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							const id = entry.target.getAttribute("data-id")
							if (id === null) continue
							if (entry.isIntersecting) {
								visibleBlockIdsRef.current.add(id)
							} else {
								visibleBlockIdsRef.current.delete(id)
							}
						}
					},
					{ threshold: 0 },
				)
				const nodes = root.querySelectorAll("[data-id]")
				for (const node of nodes) {
					observerRef.current.observe(node)
				}
			}

			const persistFromViewport = () => {
				persist(findTopmostVisibleBlock(instance, visibleBlockIdsRef.current))
			}

			const persistFromCursor = () => {
				const blockId = instance.getTextCursorPosition().block.id
				const el = instance.domElement?.querySelector(`[data-id="${blockId}"]`)
				if (el === null || el === undefined) return
				persist({ blockId, offset: blockOffsetFromAnchor(el) })
			}

			if (restoredDocIdRef.current !== docId) {
				const stored = positionsRef.current[docId]
				if (
					stored !== undefined &&
					blockExistsInDoc(instance.document, stored.blockId)
				) {
					suppressUntil = Date.now() + RESTORE_SUPPRESS_MS
					restoreBlockPosition(instance, stored)
				}
				restoredDocIdRef.current = docId
			}

			observeBlocks()

			const onScrollDebounced = debounce(
				persistFromViewport,
				SCROLL_DEBOUNCE_MS,
			)

			function flushViewport() {
				onScrollDebounced.flush()
			}

			function onScroll() {
				onScrollDebounced()
			}

			function onVisibilityChange() {
				if (document.visibilityState === "hidden") flushViewport()
			}

			function onPageHide() {
				flushViewport()
			}

			window.addEventListener("scroll", onScroll, { passive: true })
			document.addEventListener("visibilitychange", onVisibilityChange)
			window.addEventListener("pagehide", onPageHide)

			const offSelection = instance.onSelectionChange(persistFromCursor)
			const offChange = instance.onChange(() => {
				// Re-observe when the document mutates so new blocks are tracked
				// and removed blocks are cleaned up.
				observeBlocks()
			})

			let active = true
			function cleanup() {
				if (!active) return
				active = false
				flushViewport()
				window.removeEventListener("scroll", onScroll)
				document.removeEventListener("visibilitychange", onVisibilityChange)
				window.removeEventListener("pagehide", onPageHide)
				offSelection?.()
				offChange?.()
				observerRef.current?.disconnect()
				observerRef.current = undefined
				visibleBlockIdsRef.current.clear()
			}

			teardownRef.current = cleanup
			return cleanup
		},
		[docId, editorHandleRef, setPositions],
	)
}
