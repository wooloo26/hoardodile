import type { AnchorData } from "@hoardodile/plugin-sdk-web"
import { useEffect, useRef } from "react"
import { usePluginAPI } from "./context.tsx"

/**
 * Subscribe to host-initiated anchor jumps (e.g. the user clicked a comment
 * anchor in the host UI). The anchor carries plugin-defined data only and
 * always targets the iframe's own resource.
 *
 * The latest callback is invoked without resubscribing on every render.
 */
export function useAnchorJump(cb: (anchor: AnchorData) => void): void {
	const api = usePluginAPI()
	const cbRef = useRef(cb)
	cbRef.current = cb

	useEffect(
		function subscribe() {
			return api.onAnchorJump(function handle(anchor) {
				cbRef.current(anchor)
			})
		},
		[api],
	)
}
