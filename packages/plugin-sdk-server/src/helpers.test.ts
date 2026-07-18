import { describe, expect, test } from "vitest"
import { mapConcurrent } from "./helpers.ts"

describe("mapConcurrent", () => {
	test("maps every item and preserves input order", async () => {
		const items = Array.from({ length: 20 }, (_, i) => i)
		const result = await mapConcurrent(items, 4, async (n) => {
			// Later items resolve faster — order must still follow the input.
			await new Promise((resolve) => setTimeout(resolve, 20 - n))
			return n * 10
		})
		expect(result).toEqual(items.map((n) => n * 10))
	})

	test("never exceeds the concurrency limit", async () => {
		let inFlight = 0
		let maxInFlight = 0
		const items = Array.from({ length: 30 }, (_, i) => i)
		await mapConcurrent(items, 5, async () => {
			inFlight++
			maxInFlight = Math.max(maxInFlight, inFlight)
			await new Promise((resolve) => setTimeout(resolve, 2))
			inFlight--
		})
		expect(maxInFlight).toBe(5)
	})

	test("runs fully in parallel when the limit covers all items", async () => {
		let inFlight = 0
		let maxInFlight = 0
		await mapConcurrent([1, 2, 3], 10, async () => {
			inFlight++
			maxInFlight = Math.max(maxInFlight, inFlight)
			await new Promise((resolve) => setTimeout(resolve, 2))
			inFlight--
		})
		expect(maxInFlight).toBe(3)
	})

	test("propagates the first rejection", async () => {
		await expect(
			mapConcurrent([1, 2, 3], 2, async (n) => {
				if (n === 2) throw new Error("boom")
				await new Promise((resolve) => setTimeout(resolve, 5))
				return n
			}),
		).rejects.toThrow("boom")
	})

	test("handles an empty input", async () => {
		await expect(mapConcurrent([], 4, async () => 1)).resolves.toEqual([])
	})
})
