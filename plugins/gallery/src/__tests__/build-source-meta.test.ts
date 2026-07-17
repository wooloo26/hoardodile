// @vitest-environment node

import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"

describe("gallery sourceMeta", () => {
	it("collects the first 3 media filenames sorted naturally", async () => {
		const fixture = createResourceAPIFixture({
			files: ["10.jpg", "2.jpg", "01.jpg", "03.mp4", "readme.txt", "04.webp"],
			probes: {
				image: { "": { width: 800, height: 1200 } },
				video: { "": { width: 640, height: 480 } },
			},
		})
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			width: number
			height: number
			previews: readonly { filename: string; type?: string }[]
		}
		expect(result.width).toBe(800)
		expect(result.height).toBe(1200)
		expect(result.previews.map((f) => f.filename)).toEqual([
			"01.jpg",
			"2.jpg",
			"03.mp4",
		])
	})

	it("returns fewer than 3 when fewer media files exist", async () => {
		const fixture = createResourceAPIFixture({
			files: ["a.jpg", "b.png", "notes.txt"],
			probes: { image: { "": { width: 1, height: 1 } } },
		})
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			previews: readonly { filename: string }[]
		}
		expect(result.previews.map((f) => f.filename)).toEqual(["a.jpg", "b.png"])
	})

	it("skips non-media files when collecting previews", async () => {
		const fixture = createResourceAPIFixture({
			files: ["01.jpg", "02.txt", "03.jpg", "04.zip", "05.png", "06.jpg"],
			probes: { image: { "": { width: 1, height: 1 } } },
		})
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			previews: readonly { filename: string }[]
		}
		expect(result.previews.map((f) => f.filename)).toEqual([
			"01.jpg",
			"03.jpg",
			"05.png",
		])
	})

	it("returns probe data for the first file regardless of type", async () => {
		const fixture = createResourceAPIFixture({
			files: ["00.mp4", "01.jpg", "02.jpg"],
			probes: {
				video: { "": { width: 1920, height: 1080, durationMs: 5_000 } },
				image: { "": { width: 800, height: 600 } },
			},
		})
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			width: number
			height: number
			durationMs: number
			previews: readonly { filename: string }[]
		}
		expect(result.width).toBe(1920)
		expect(result.height).toBe(1080)
		expect(result.durationMs).toBe(5_000)
		expect(result.previews.map((f) => f.filename)).toEqual([
			"00.mp4",
			"01.jpg",
			"02.jpg",
		])
	})

	it("returns undefined when the first file probe fails", async () => {
		const fixture = createResourceAPIFixture({
			files: ["a.jpg", "b.jpg"],
			probes: { image: undefined },
		})
		const result = await plugin.sourceMeta?.(fixture.api)
		expect(result).toBeUndefined()
	})

	it("returns undefined when no media files present", async () => {
		const fixture = createResourceAPIFixture({
			files: ["readme.txt", "notes.md"],
		})
		const result = await plugin.sourceMeta?.(fixture.api)
		expect(result).toBeUndefined()
	})
})
