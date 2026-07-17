import "@testing-library/jest-dom/vitest"
import "@/i18n"
import "fake-indexeddb/auto"

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"
import { prefSyncStore } from "@/lib/prefSyncStore"

// jsdom does not implement matchMedia; stub it deterministically so theme and
// media-query code paths have something to consult during tests.
Object.defineProperty(window, "matchMedia", {
	writable: true,
	configurable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	}),
})

// jsdom does not implement ResizeObserver; stub it so virtual list libraries
// can measure the scroll container during tests.
class StubResizeObserver {
	private callback: ResizeObserverCallback

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback
	}

	observe(target: Element) {
		queueMicrotask(() => {
			this.callback(
				[
					{
						target,
						borderBoxSize: [{ inlineSize: 800, blockSize: 300 }],
						contentRect: {
							width: 800,
							height: 300,
							top: 0,
							left: 0,
							bottom: 300,
							right: 800,
							x: 0,
							y: 0,
						} as DOMRectReadOnly,
					} as unknown as ResizeObserverEntry,
				],
				this,
			)
		})
	}

	unobserve() {}
	disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
	writable: true,
	configurable: true,
	value: StubResizeObserver,
})

// jsdom does not implement IntersectionObserver; stub it so lazy-loading
// sentinel elements do not crash tests.
class StubIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

Object.defineProperty(window, "IntersectionObserver", {
	writable: true,
	configurable: true,
	value: StubIntersectionObserver,
})

// TanStack Router calls window.scrollTo after navigation; jsdom logs a noisy
// "Not implemented" warning unless we stub it.
Object.defineProperty(window, "scrollTo", {
	writable: true,
	configurable: true,
	value: () => undefined,
})

// jsdom does not implement HTMLCanvasElement#getContext; chart.js and image
// cropping code consult it during tests. Return a no-op 2D context so these
// components can mount without noisy "canvas npm package" warnings.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	writable: true,
	configurable: true,
	value: (contextId: string) => {
		if (contextId !== "2d") return null
		const noOp = () => undefined
		return new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === "canvas") return null
					if (prop === "getContextAttributes") return () => ({})
					if (prop === "measureText") return () => ({ width: 0 })
					if (prop === "getImageData") return () => ({ data: [] })
					if (prop === "createImageData")
						return () => ({ data: [], width: 0, height: 0 })
					if (prop === "isPointInPath") return () => false
					if (prop === "isPointInStroke") return () => false
					return noOp
				},
			},
		) as unknown as CanvasRenderingContext2D
	},
})

// jsdom does not implement EventSource; stub it so the SSE client in __root
// silently does nothing during unit tests.
class StubEventSource {
	static readonly CONNECTING = 0
	static readonly OPEN = 1
	static readonly CLOSED = 2
	readonly readyState = StubEventSource.CLOSED
	onopen: (() => void) | null = null
	onmessage: ((e: MessageEvent) => void) | null = null
	onerror: (() => void) | null = null
	close() {}
	addEventListener() {}
	removeEventListener() {}
	dispatchEvent() {
		return false
	}
}

Object.defineProperty(window, "EventSource", {
	writable: true,
	configurable: true,
	value: StubEventSource,
})

afterEach(() => {
	cleanup()
	prefSyncStore.clear()
	localStorage.clear()
})
