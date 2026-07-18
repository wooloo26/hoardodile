// @vitest-environment node

import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"

function createApiStub(
	files: readonly string[],
	overrides: Partial<ResourceAPI> = {},
): ResourceAPI {
	return {
		logInfo() {},
		logWarn() {},
		logError() {},
		listFiles: async () => files,
		readFile: async () => new Uint8Array(),
		statFile: async () => ({ sizeBytes: 100 }),
		probeImage: async () => ({ width: 800, height: 1200 }),
		probeVideo: async () => undefined,
		probeAudio: async () => undefined,
		isAnimatedImage: async () => false,
		...overrides,
	}
}

describe("manga listFiles", () => {
	it("returns natural-sorted pages with probe data, skipping non-images", async () => {
		const fixture = createResourceAPIFixture({
			files: ["10.jpg", "2.jpg", "01.jpg", "notes.txt"],
			probes: { image: { "": { width: 800, height: 1200 } } },
			stats: { sizeBytes: 100 },
		})
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual([
			"01.jpg",
			"2.jpg",
			"10.jpg",
		])
		expect(result?.[0]).toMatchObject({ type: "image", width: 800 })
	})

	it("probes pages concurrently but bounded", async () => {
		const files = Array.from(
			{ length: 30 },
			(_, i) => `${String(i + 1).padStart(3, "0")}.jpg`,
		)
		let inFlight = 0
		let maxInFlight = 0
		const api = createApiStub(files, {
			probeImage: async () => {
				inFlight++
				maxInFlight = Math.max(maxInFlight, inFlight)
				await new Promise((resolve) => setTimeout(resolve, 5))
				inFlight--
				return { width: 800, height: 1200 }
			},
		})
		const result = await plugin.listFiles?.(api)
		expect(result).toHaveLength(30)
		expect(maxInFlight).toBeGreaterThan(1)
		expect(maxInFlight).toBeLessThanOrEqual(8)
	})
})

describe("manga searchMeta", () => {
	it("stops scanning after the batch that finds an animation", async () => {
		const files = Array.from(
			{ length: 30 },
			(_, i) => `${String(i + 1).padStart(2, "0")}.jpg`,
		)
		const animated = new Set(["03.jpg"])
		let calls = 0
		const api = createApiStub(files, {
			isAnimatedImage: async (path) => {
				calls++
				return animated.has(path)
			},
		})
		const result = await plugin.searchMeta?.(api)
		expect(result).toMatchObject({
			facets: { image: true, animation: true },
		})
		// First batch of 8 finds the animation — later pages are never probed.
		expect(calls).toBeLessThanOrEqual(8)
	})

	it("scans everything when nothing is animated", async () => {
		const files = ["a.jpg", "b.jpg", "c.jpg"]
		const api = createApiStub(files)
		const result = await plugin.searchMeta?.(api)
		expect(result).toMatchObject({
			facets: { image: true, animation: false },
		})
	})
})
