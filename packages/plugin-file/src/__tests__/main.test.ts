import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { naturalSort } from "@hoardodile/plugin-sdk-server/helpers"
import { describe, expect, it } from "vitest"
import plugin from "../main"

describe("plugin-file main", () => {
	it("exports a plugin definition", () => {
		expect(plugin.detect).toBeDefined()
		expect(plugin.sourceMeta).toBeDefined()
		expect(plugin.searchMeta).toBeDefined()
		expect(plugin.listFiles).toBeDefined()
	})

	it("listFiles returns natural-sorted entries with ext and size", async () => {
		const fixture = createResourceAPIFixture({
			files: ["10.zip", "2.PDF", "readme", "01.txt"],
			stats: { "10.zip": { sizeBytes: 500 }, "": { sizeBytes: 42 } },
		})
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual(
			naturalSort(["10.zip", "2.PDF", "readme", "01.txt"]),
		)
		const byName = new Map(result?.map((f) => [f.filename, f]))
		expect(byName.get("10.zip")).toEqual({
			filename: "10.zip",
			ext: ".zip",
			sizeBytes: 500,
		})
		expect(byName.get("2.PDF")).toEqual({
			filename: "2.PDF",
			ext: ".pdf",
			sizeBytes: 42,
		})
		expect(byName.get("readme")).toEqual({
			filename: "readme",
			ext: undefined,
			sizeBytes: 42,
		})
	})
})
