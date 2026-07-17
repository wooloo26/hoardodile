// @vitest-environment node

import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"

function createFixture(
	files: readonly string[],
	probe?: { readonly width: number; readonly height: number },
) {
	const fixture = createResourceAPIFixture()
	fixture.setConfig({
		files,
		probes: probe === undefined ? undefined : { image: { "": probe } },
	})
	return fixture
}

describe("manga sourceMeta", () => {
	it("collects the first 3 image filenames sorted naturally", async () => {
		const fixture = createFixture(
			["10.jpg", "2.jpg", "01.jpg", "03.png", "readme.txt", "04.webp"],
			{ width: 800, height: 1200 },
		)
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			width: number
			height: number
			previews: readonly { filename: string; preview: boolean }[]
		}
		expect(result.width).toBe(800)
		expect(result.height).toBe(1200)
		expect(result.previews.map((f) => f.filename)).toEqual([
			"01.jpg",
			"2.jpg",
			"03.png",
		])
	})

	it("returns fewer than 3 paths when fewer images exist", async () => {
		const fixture = createFixture(["a.jpg", "b.png", "notes.txt"], {
			width: 1,
			height: 1,
		})
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			previews: readonly { filename: string }[]
		}
		expect(result.previews.map((f) => f.filename)).toEqual(["a.jpg", "b.png"])
	})

	it("places single image alone in previews", async () => {
		const fixture = createFixture(["only.png", "side.txt"], {
			width: 100,
			height: 100,
		})
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			previews: readonly { filename: string }[]
		}
		expect(result.previews.map((f) => f.filename)).toEqual(["only.png"])
	})

	it("returns undefined when no image probes successfully", async () => {
		const fixture = createFixture(["a.jpg", "b.jpg"], undefined)
		const result = await plugin.sourceMeta?.(fixture.api)
		expect(result).toBeUndefined()
	})

	it("returns undefined when no image files present", async () => {
		const fixture = createFixture(["readme.txt", "notes.md"])
		const result = await plugin.sourceMeta?.(fixture.api)
		expect(result).toBeUndefined()
	})

	it("ignores non-image extensions when collecting previews", async () => {
		const fixture = createFixture(
			["01.jpg", "02.txt", "03.jpg", "04.zip", "05.png", "06.jpg"],
			{ width: 1, height: 1 },
		)
		const result = (await plugin.sourceMeta?.(fixture.api)) as {
			previews: readonly { filename: string }[]
		}
		expect(result.previews.map((f) => f.filename)).toEqual([
			"01.jpg",
			"03.jpg",
			"05.png",
		])
	})
})
