import { useEffect, useRef } from "react"
import { encodeMangaPosition } from "../prefs"
import { usePluginAPI } from "./hooks"

const DEBOUNCE_MS = 500

/**
 * Persist a manga reader position to the server cache with a debounced
 * write and a flush on `pagehide` / `beforeunload` / unmount.
 */
export function useReaderPositionWriter(deps: {
	readonly pageIndex: number
	readonly disabled?: boolean
}): void {
	const api = usePluginAPI()
	const { pageIndex, disabled = false } = deps
	const latestRef = useRef(pageIndex)
	latestRef.current = pageIndex

	useEffect(() => {
		if (disabled) return
		const timer = setTimeout(() => {
			api.setCache(
				"position",
				encodeMangaPosition({ v: 1, pageIndex: latestRef.current }),
			)
		}, DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [api, pageIndex, disabled])

	useEffect(() => {
		if (disabled) return
		function flush() {
			api.setCache(
				"position",
				encodeMangaPosition({ v: 1, pageIndex: latestRef.current }),
			)
		}
		window.addEventListener("pagehide", flush)
		window.addEventListener("beforeunload", flush)
		return () => {
			window.removeEventListener("pagehide", flush)
			window.removeEventListener("beforeunload", flush)
			flush()
		}
		// api is structurally stable; flush reads latest pageIndex via ref.
	}, [api, disabled])
}
