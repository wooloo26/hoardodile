/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	blockOffsetFromAnchor,
	docBlockPositionEntryEquals,
	READING_ANCHOR_FALLBACK_Y,
	READING_ANCHOR_GAP,
	readingAnchorY,
	scrollBlockToReadingAnchor,
} from "./docReadingAnchor"

function mockRect(el: Element, rect: Partial<DOMRect>) {
	vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		width: 0,
		height: 0,
		x: 0,
		y: 0,
		toJSON() {},
		...rect,
	})
}

function mockStickyTop(el: Element, top: number) {
	vi.spyOn(window, "getComputedStyle").mockImplementation((target) => {
		const isTarget = target === el
		return {
			getPropertyValue: (prop: string) => {
				if (isTarget && prop === "top") return `${top}px`
				return ""
			},
			top: isTarget ? `${top}px` : "auto",
		} as CSSStyleDeclaration
	})
}

function mockStickyChrome(el: Element, top: number, height: number) {
	mockRect(el, { height })
	mockStickyTop(el, top)
}

describe("readingAnchorY", () => {
	afterEach(() => {
		document.body.innerHTML = ""
		vi.restoreAllMocks()
	})

	it("uses static toolbar sticky bottom when present", () => {
		const toolbar = document.createElement("div")
		toolbar.setAttribute("data-testid", "document-static-toolbar")
		document.body.append(toolbar)
		mockStickyChrome(toolbar, 92, 40)

		expect(readingAnchorY()).toBe(92 + 40 + READING_ANCHOR_GAP)
	})

	it("falls back to doc detail header sticky bottom when toolbar is absent", () => {
		const layout = document.createElement("div")
		layout.setAttribute("data-doc-layout", "")
		const header = document.createElement("header")
		header.className = "doc-detail-header"
		layout.append(header)
		document.body.append(layout)
		mockStickyChrome(header, 48, 40)

		expect(readingAnchorY()).toBe(48 + 40 + READING_ANCHOR_GAP)
	})

	it("returns fallback when chrome is missing", () => {
		expect(readingAnchorY()).toBe(READING_ANCHOR_FALLBACK_Y)
	})
})

function appendDocHeader(stickyTop: number, height: number): void {
	const layout = document.createElement("div")
	layout.setAttribute("data-doc-layout", "")
	const header = document.createElement("header")
	header.className = "doc-detail-header"
	layout.append(header)
	document.body.append(layout)
	mockStickyChrome(header, stickyTop, height)
}

describe("blockOffsetFromAnchor", () => {
	afterEach(() => {
		document.body.innerHTML = ""
		vi.restoreAllMocks()
	})

	it("rounds block top minus anchor Y", () => {
		appendDocHeader(46, 50)

		const block = document.createElement("div")
		document.body.append(block)
		mockRect(block, { top: 250.4 })

		expect(blockOffsetFromAnchor(block)).toBe(
			Math.round(250.4 - (46 + 50 + READING_ANCHOR_GAP)),
		)
	})
})

describe("scrollBlockToReadingAnchor", () => {
	const scrollBy = vi.fn()

	beforeEach(() => {
		scrollBy.mockClear()
		vi.stubGlobal("scrollBy", scrollBy)
	})

	afterEach(() => {
		document.body.innerHTML = ""
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it("skips scroll when offset matches current block position", () => {
		appendDocHeader(46, 50)

		const block = document.createElement("div")
		document.body.append(block)
		mockRect(block, { top: 250 })

		const offset = Math.round(250 - (46 + 50 + READING_ANCHOR_GAP))
		scrollBlockToReadingAnchor(block, offset)

		expect(scrollBy).not.toHaveBeenCalled()
	})

	it("aligns to anchor when offset is zero", () => {
		appendDocHeader(46, 50)

		const block = document.createElement("div")
		document.body.append(block)
		mockRect(block, { top: 120 })

		scrollBlockToReadingAnchor(block, 0)

		expect(scrollBy).toHaveBeenCalledWith({
			top: 20,
			behavior: "instant",
		})
	})

	it("skips scroll when delta is negligible", () => {
		appendDocHeader(46, 50)

		const block = document.createElement("div")
		document.body.append(block)
		mockRect(block, { top: 100.5 })

		scrollBlockToReadingAnchor(block, 0)

		expect(scrollBy).not.toHaveBeenCalled()
	})
})

describe("docBlockPositionEntryEquals", () => {
	it("matches equal entries", () => {
		expect(
			docBlockPositionEntryEquals(
				{ blockId: "a", offset: 10 },
				{ blockId: "a", offset: 10 },
			),
		).toBe(true)
	})

	it("returns false when stored entry is missing", () => {
		expect(
			docBlockPositionEntryEquals(undefined, { blockId: "a", offset: 0 }),
		).toBe(false)
	})

	it("returns false when block id or offset differs", () => {
		expect(
			docBlockPositionEntryEquals(
				{ blockId: "a", offset: 10 },
				{ blockId: "b", offset: 10 },
			),
		).toBe(false)
		expect(
			docBlockPositionEntryEquals(
				{ blockId: "a", offset: 10 },
				{ blockId: "a", offset: 0 },
			),
		).toBe(false)
	})
})
