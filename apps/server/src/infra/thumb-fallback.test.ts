import { existsSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { thumbFallbackAvifPath } from "./thumb-fallback.ts"

describe("thumbFallbackAvifPath", () => {
	test("resolves to an existing AVIF next to the module layout", () => {
		const p = thumbFallbackAvifPath()
		expect(existsSync(p)).toBe(true)
		expect(p.endsWith("fallback.avif")).toBe(true)
	})
})
