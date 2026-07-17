import { describe, expect, it } from "vitest"

describe("novel render", () => {
	it("module can be imported", async () => {
		const mod = await import("../render.tsx")
		expect(mod).toBeDefined()
	})
})
