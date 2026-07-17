import { describe, expect, test } from "vitest"
import { buildResourceRouter } from "./router.ts"

describe("resource router contract", () => {
	test("commitUpload procedure is no longer exposed", () => {
		const router = buildResourceRouter({} as never)
		expect(
			(router as unknown as Record<string, unknown>).commitUpload,
		).toBeUndefined()
	})
})
