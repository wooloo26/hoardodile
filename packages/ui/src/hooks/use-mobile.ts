import { MOBILE_QUERY } from "@hoardodile/ui/viewport"
import { useMedia } from "react-use"

/**
 * One-shot check for viewports below the `md` breakpoint (< 768 px).
 *
 * Prefer {@link useBelowMd} in React components so they re-render when the
 * viewport crosses the breakpoint. Use this helper only in event handlers,
 * utility functions, or effects where a reactive hook is not appropriate.
 */
export function isBelowMd(): boolean {
	if (typeof window === "undefined") return false
	return window.matchMedia(MOBILE_QUERY).matches
}

export function useBelowMd(): boolean {
	return useMedia(MOBILE_QUERY, false)
}
