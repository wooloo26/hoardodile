// @vitest-environment node

import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"

describe("novel detect", () => {
	it("returns ok for a directory with epub file", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["book.epub"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: true })
	})

	it("returns ok for a directory with txt file", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["novel.txt"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: true })
	})

	it("returns fail for empty directory", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: [] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["text-file"] })
	})

	it("returns fail for directory with only images", async () => {
		const fixture = createResourceAPIFixture()
		fixture.setConfig({ files: ["photo.jpg", "image.png"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["text-file"] })
	})
})
