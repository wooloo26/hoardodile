import { describe, expect, it, vi } from "vitest"
import {
	addSubscription,
	broadcastToAll,
	broadcastToResource,
	broadcastToSubscribers,
	getIframeBySource,
	registerIframe,
	unregisterIframe,
} from "./iframe-pool"

function fakeWindow(): Window {
	return { postMessage: vi.fn() } as unknown as Window
}

describe("pluginIframeState", () => {
	describe("registerIframe / getIframeBySource / unregisterIframe", () => {
		it("registers and retrieves an iframe by source", () => {
			const source = fakeWindow()
			registerIframe(source, { pluginId: "p-1", resId: "r-1" })
			expect(getIframeBySource(source)).toEqual({
				pluginId: "p-1",
				resId: "r-1",
			})
		})

		it("returns undefined for unregistered source", () => {
			const source = fakeWindow()
			expect(getIframeBySource(source)).toBeUndefined()
		})

		it("unregisters and returns undefined after unregisterIframe", () => {
			const source = fakeWindow()
			registerIframe(source, { pluginId: "p-1", resId: "r-1" })
			unregisterIframe(source)
			expect(getIframeBySource(source)).toBeUndefined()
		})

		it("supports multiple iframes for the same resource", () => {
			const a = fakeWindow()
			const b = fakeWindow()
			registerIframe(a, { pluginId: "p-1", resId: "r-shared" })
			registerIframe(b, { pluginId: "p-1", resId: "r-shared" })
			expect(getIframeBySource(a)).toBeDefined()
			expect(getIframeBySource(b)).toBeDefined()
		})

		it("unregistering one iframe does not affect the other", () => {
			const a = fakeWindow()
			const b = fakeWindow()
			registerIframe(a, { pluginId: "p-1", resId: "r-shared" })
			registerIframe(b, { pluginId: "p-1", resId: "r-shared" })
			unregisterIframe(a)
			expect(getIframeBySource(a)).toBeUndefined()
			expect(getIframeBySource(b)).toBeDefined()
		})

		it("rebinds on re-register", () => {
			const source = fakeWindow()
			registerIframe(source, { pluginId: "p-1", resId: "r-1" })
			registerIframe(source, { pluginId: "p-1", resId: "r-2" })
			expect(getIframeBySource(source)).toEqual({
				pluginId: "p-1",
				resId: "r-2",
			})
		})
	})

	describe("broadcastToResource", () => {
		it("sends postMessage to every iframe for the resource", () => {
			const a = fakeWindow()
			const b = fakeWindow()
			const c = fakeWindow()
			registerIframe(a, { pluginId: "p-1", resId: "r-1" })
			registerIframe(b, { pluginId: "p-1", resId: "r-1" })
			registerIframe(c, { pluginId: "p-1", resId: "r-2" })

			broadcastToResource("r-1", {
				type: "push",
				key: "test",
				data: "hello",
			})

			expect(a.postMessage).toHaveBeenCalledWith(
				{ type: "push", key: "test", data: "hello" },
				"*",
			)
			expect(b.postMessage).toHaveBeenCalledWith(
				{ type: "push", key: "test", data: "hello" },
				"*",
			)
			expect(c.postMessage).not.toHaveBeenCalled()
		})

		it("is a no-op when no iframes are registered for the resource", () => {
			const source = fakeWindow()
			registerIframe(source, { pluginId: "p-1", resId: "r-2" })
			broadcastToResource("r-nonexistent", {
				type: "push",
				key: "test",
			})
			expect(source.postMessage).not.toHaveBeenCalled()
		})
	})

	describe("broadcastToAll", () => {
		it("sends postMessage to every registered iframe", () => {
			const a = fakeWindow()
			const b = fakeWindow()
			registerIframe(a, { pluginId: "p-1", resId: "r-1" })
			registerIframe(b, { pluginId: "p-2", resId: "r-2" })

			broadcastToAll({ type: "push", key: "theme:changed" })

			expect(a.postMessage).toHaveBeenCalledWith(
				{ type: "push", key: "theme:changed" },
				"*",
			)
			expect(b.postMessage).toHaveBeenCalledWith(
				{ type: "push", key: "theme:changed" },
				"*",
			)
		})

		it("is a no-op when no iframes are registered", () => {
			expect(() => broadcastToAll({ type: "push", key: "test" })).not.toThrow()
		})
	})

	describe("subscriptions", () => {
		it("broadcasts to subscribers only for the matching key", () => {
			const a = fakeWindow()
			const b = fakeWindow()
			registerIframe(a, { pluginId: "p-1", resId: "r-1" })
			registerIframe(b, { pluginId: "p-1", resId: "r-1" })
			addSubscription(a, "theme:changed")
			// b is NOT subscribed to any key

			broadcastToSubscribers("theme:changed", { dark: true })

			expect(a.postMessage).toHaveBeenCalledWith(
				{ type: "push", key: "theme:changed", data: { dark: true } },
				"*",
			)
			expect(b.postMessage).not.toHaveBeenCalled()
		})

		it("clears subscriptions when iframe is unregistered", () => {
			const source = fakeWindow()
			registerIframe(source, { pluginId: "p-1", resId: "r-1" })
			addSubscription(source, "theme:changed")
			unregisterIframe(source)

			broadcastToSubscribers("theme:changed")
			expect(source.postMessage).not.toHaveBeenCalled()
		})
	})
})
