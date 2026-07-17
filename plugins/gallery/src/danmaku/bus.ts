import { useEffect } from "react"
import { create } from "zustand"

/**
 * Cross-component event bus for the DanmakuPlayer. Lets siblings on
 * the same page (sidebar danmaku list, route layout) coordinate with
 * the running player without prop-drilling. Backed by a zustand store;
 * the seek slot uses an incrementing nonce so repeated jumps to the
 * same timestamp still notify subscribers.
 */

type SeekPayload = {
	readonly resId: string
	readonly filename: string
	readonly timeMs: number
	readonly nonce: number
}

type EmitRequest = {
	readonly resId: string
	readonly filename: string
	readonly text: string
	readonly nonce: number
}

type DanmakuPlayerBus = {
	readonly lastSeek: SeekPayload | undefined
	readonly lastEmitRequest: EmitRequest | undefined
	readonly emitSeek: (payload: Omit<SeekPayload, "nonce">) => void
	readonly emitDanmakuRequest: (payload: Omit<EmitRequest, "nonce">) => void
}

const useBus = create<DanmakuPlayerBus>()((set) => ({
	lastSeek: undefined,
	lastEmitRequest: undefined,
	emitSeek(payload) {
		set((s) => ({
			lastSeek: { ...payload, nonce: (s.lastSeek?.nonce ?? 0) + 1 },
		}))
	},
	emitDanmakuRequest(payload) {
		set((s) => ({
			lastEmitRequest: {
				...payload,
				nonce: (s.lastEmitRequest?.nonce ?? 0) + 1,
			},
		}))
	},
}))

/**
 * Module-level registry of in-flight player playback heads. Each
 * mounted player publishes its `currentMs` here keyed by
 * `(resId, filename)` so external surfaces (the feed danmaku
 * popup, sidebar widgets) can read the latest playback time without
 * prop-drilling a ref. Kept off the zustand store because writes happen
 * on every video tick — broadcasting that frequency through a reactive
 * store would re-render every subscriber.
 */
const playerTimeRegistry = new Map<string, number>()

function playerTimeKey(resId: string, filename: string): string {
	return `${resId}\u0000${filename}`
}

export function publishPlayerTime(
	resId: string,
	filename: string,
	ms: number,
): void {
	playerTimeRegistry.set(playerTimeKey(resId, filename), ms)
}

export function clearPlayerTime(resId: string, filename: string): void {
	playerTimeRegistry.delete(playerTimeKey(resId, filename))
}

export function readPlayerTime(resId: string, filename: string): number {
	return playerTimeRegistry.get(playerTimeKey(resId, filename)) ?? 0
}

export function dispatchDanmakuPlayerSeek(detail: {
	readonly resId: string
	readonly filename: string
	readonly timeMs: number
}): void {
	useBus.getState().emitSeek(detail)
}

export function useSeekBus(deps: {
	readonly videoRef: React.RefObject<HTMLVideoElement | null>
	readonly resId: string
	readonly filename: string
}): void {
	const { videoRef, resId, filename } = deps
	const lastSeek = useBus((s) => s.lastSeek)
	useEffect(() => {
		if (lastSeek === undefined) return
		if (lastSeek.resId !== resId || lastSeek.filename !== filename) {
			return
		}
		const v = videoRef.current
		if (v === null) return
		// Preserve play/pause state when jumping from the danmaku list.
		const wasPlaying = !v.paused
		v.currentTime = Math.max(0, lastSeek.timeMs) / 1000
		if (wasPlaying) v.play()
	}, [lastSeek, videoRef, resId, filename])
}

/**
 * External surfaces (the feed danmaku popup) call this to ask the
 * matching mounted player to publish a danmaku at its current playback
 * time. Decoupled from the player's render tree so a Dialog rendered
 * outside the player subtree can still send danmaku.
 */
export function dispatchEmitDanmakuRequest(detail: {
	readonly resId: string
	readonly filename: string
	readonly text: string
}): void {
	useBus.getState().emitDanmakuRequest(detail)
}

export function useEmitDanmakuRequestBus(deps: {
	readonly resId: string
	readonly filename: string
	readonly onRequest: (text: string) => void
}): void {
	const { resId, filename, onRequest } = deps
	const last = useBus((s) => s.lastEmitRequest)
	useEffect(() => {
		if (last === undefined) return
		if (last.resId !== resId || last.filename !== filename) return
		onRequest(last.text)
		// `last.nonce` participates so repeated submits with the same
		// text still fire the callback.
	}, [last, resId, filename, onRequest])
}
