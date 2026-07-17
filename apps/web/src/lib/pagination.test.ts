import { describe, expect, it } from "vitest"
import { pageCountOf } from "./pagination"

describe("pageCountOf", () => {
	it("returns 1 when there are no rows so the UI never shows '1 / 0'", () => {
		expect(pageCountOf(0, 20)).toBe(1)
	})

	it("returns 1 when total fits exactly in one page", () => {
		expect(pageCountOf(20, 20)).toBe(1)
	})

	it("rounds up to cover the partial trailing page", () => {
		expect(pageCountOf(21, 20)).toBe(2)
		expect(pageCountOf(99, 10)).toBe(10)
	})

	it("returns 1 for negative or NaN input rather than 0 or NaN", () => {
		expect(pageCountOf(-5, 20)).toBe(1)
	})
})
