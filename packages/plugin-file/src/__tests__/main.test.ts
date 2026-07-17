import { describe, expect, it } from "vitest"
import plugin from "../main"

describe("plugin-file main", () => {
	it("exports a plugin definition", () => {
		expect(plugin.detect).toBeDefined()
		expect(plugin.sourceMeta).toBeDefined()
		expect(plugin.searchMeta).toBeDefined()
		expect(plugin.listFiles).toBeDefined()
	})
})
