import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)
