import type { HostResponse, PluginMessage } from "@hoardodile/plugin-sdk-web"
import type { HandlerContext, HandlerEntry } from "./handlers/registry"
import { addSubscription, getIframeBySource } from "./iframe-pool"

export type { HandlerContext }

/**
 * Creates a `message` event handler that processes requests from sandboxed
 * plugin iframes. Uses a handler registry for request routing.
 *
 * Security: validates both `event.origin` (must be `"null"` since iframes are
 * sandboxed without `allow-same-origin`) and `event.source` (must be a
 * registered iframe window).
 */
export function createHostMessageHandler(
	handlers: readonly HandlerEntry[],
): (event: MessageEvent) => void {
	const registry = new Map<string, HandlerEntry["handler"]>()
	for (const entry of handlers) {
		if (registry.has(entry.method)) {
			throw new Error(`Duplicate handler method: ${entry.method}`)
		}
		registry.set(entry.method, entry.handler)
	}

	return function handleMessage(event: MessageEvent) {
		// Sandboxed iframes (no allow-same-origin) have the opaque origin "null".
		if (event.origin !== "null") return

		const source = event.source as Window | null
		if (source === null) return

		const iframeRecord = getIframeBySource(source)
		if (iframeRecord === undefined) return

		const msg = event.data as PluginMessage
		if (msg == null || typeof msg !== "object" || msg.type === undefined) {
			return
		}

		if (msg.type === "subscribe") {
			addSubscription(source, msg.key)
			return
		}

		if (msg.type !== "request") return

		const ctx: HandlerContext = {
			source,
			resId: iframeRecord.resId,
			pluginId: iframeRecord.pluginId,
		}

		const handler = registry.get(msg.method)
		if (handler === undefined) {
			const response: HostResponse = {
				type: "response",
				id: msg.id,
				ok: false,
				error: `Unknown method: ${msg.method}`,
			}
			source.postMessage(response, "*")
			return
		}

		handler(ctx, msg.params)
			.then((data) => {
				const response: HostResponse = {
					type: "response",
					id: msg.id,
					ok: true,
					data,
				}
				source.postMessage(response, "*")
			})
			.catch((err) => {
				const response: HostResponse = {
					type: "response",
					id: msg.id,
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				}
				source.postMessage(response, "*")
			})
	}
}
