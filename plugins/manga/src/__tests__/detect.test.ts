// @vitest-environment node

import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"

describe("manga detect", () => {
	it("returns ok for a directory with only image files (2+)", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["page01.jpg", "page02.jpg"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: true })
	})

	it("returns ok for a directory with multiple png files", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["cover.png", "page01.png", "page02.png"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: true })
	})

	it("returns fail for a directory with only one image", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["page01.jpg"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["page-image"] })
	})

	it("returns fail for empty directory", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: [] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["page-image"] })
	})

	it("returns fail for directory with only text files", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["readme.txt", "notes.md"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["page-image"] })
	})

	it("returns fail for directory with mixed image and non-image files", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["page01.jpg", "page02.jpg", "readme.txt"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["page-image"] })
	})
})
