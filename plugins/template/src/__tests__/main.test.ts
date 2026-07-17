import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import plugin from "../main"

describe("template plugin", () => {
	it("detects resources containing a .hdtpl file", async () => {
		const { api } = createResourceAPIFixture({ files: ["notes.hdtpl"] })
		const result = await plugin.detect(api)
		expect(result.ok).toBe(true)
	})

	it("misses resources without .hdtpl files", async () => {
		const { api } = createResourceAPIFixture({ files: ["photo.jpg"] })
		const result = await plugin.detect(api)
		expect(result.ok).toBe(false)
	})

	it("lists only .hdtpl files in sourceMeta", async () => {
		const { api } = createResourceAPIFixture({
			files: ["a.hdtpl", "photo.jpg", "b.hdtpl"],
		})
		const meta = await plugin.sourceMeta?.(api)
		expect(meta).toEqual({ files: ["a.hdtpl", "b.hdtpl"] })
	})
})
