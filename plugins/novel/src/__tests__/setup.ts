import "@testing-library/jest-dom/vitest"

// jsdom does not implement matchMedia; stub it deterministically so the
// Sheet/Dialog components from @hoardodile/ui can mount during tests.
// Guarded: some suites (e.g. detect) run in the node environment.
if (typeof window !== "undefined") {
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
}
