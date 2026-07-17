import { useEffect, useRef } from "react"
import { encodeNovelPosition, type NovelPosition } from "../prefs"
import { usePluginAPI } from "./hooks"

const DEBOUNCE_MS = 500

/**
 * Persist a novel reader position to the server cache with a debounced
 * write and a flush on `pagehide` / `beforeunload` / unmount.
 */
export function useReaderPositionWriter(deps: {
	readonly position: NovelPosition | undefined
	readonly disabled?: boolean
}): void {
	const api = usePluginAPI()
	const { position, disabled = false } = deps
	const latestRef = useRef(position)
	latestRef.current = position

	useEffect(() => {
		if (disabled) return
		if (position === undefined) return
		const timer = setTimeout(() => {
			const snap = latestRef.current
			if (snap === undefined) return
			api.setCache("position", encodeNovelPosition(snap))
		}, DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [api, position, disabled])

	useEffect(() => {
		if (disabled) return
		function flush() {
			const snap = latestRef.current
			if (snap === undefined) return
			api.setCache("position", encodeNovelPosition(snap))
		}
		window.addEventListener("pagehide", flush)
		window.addEventListener("beforeunload", flush)
		return () => {
			window.removeEventListener("pagehide", flush)
			window.removeEventListener("beforeunload", flush)
			flush()
		}
		// api is structurally stable; flush reads latest position via ref.
	}, [api, disabled])
}
