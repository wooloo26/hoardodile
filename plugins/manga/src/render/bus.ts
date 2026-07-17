import { useEffect } from "react"
import { create } from "zustand"

/**
 * Cross-component event bus for the mounted MangaReader. External
 * surfaces (the resource detail sidebar danmaku list) emit a jump
 * request keyed by `(resId, filename)`; the matching reader instance
 * picks the matching page and scrolls / pages to it.
 *
 * A nonce guarantees that jumping twice to the same target still
 * notifies subscribers.
 */

type JumpPayload = {
	readonly resId: string
	readonly filename: string
	readonly nonce: number
}

type MangaReaderBus = {
	readonly lastJump: JumpPayload | undefined
	readonly emitJump: (payload: Omit<JumpPayload, "nonce">) => void
}

const useBus = create<MangaReaderBus>()((set) => ({
	lastJump: undefined,
	emitJump(payload) {
		set((s) => ({
			lastJump: { ...payload, nonce: (s.lastJump?.nonce ?? 0) + 1 },
		}))
	},
}))

export function dispatchMangaReaderJump(detail: {
	readonly resId: string
	readonly filename: string
}): void {
	useBus.getState().emitJump(detail)
}

/**
 * Subscribes the mounted reader to incoming jump requests. The
 * callback receives the matching filename when a request arrives for
 * the active resource; the caller resolves the filename to a page
 * index against its live page list.
 */
export function useMangaReaderJumpBus(deps: {
	readonly resId: string
	readonly onJump: (filename: string) => void
}): void {
	const { resId, onJump } = deps
	const lastJump = useBus((s) => s.lastJump)
	useEffect(
		function consume() {
			if (lastJump === undefined) return
			if (lastJump.resId !== resId) return
			onJump(lastJump.filename)
		},
		[lastJump, resId, onJump],
	)
}
