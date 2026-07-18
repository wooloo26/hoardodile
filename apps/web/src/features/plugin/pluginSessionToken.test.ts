import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/trpc/factory", () => ({
	trpcQuery: vi.fn(
		async (_ns: string, _proc: string, input: { resId: string }) =>
			`tok-${input.resId}`,
	),
}))

import { trpcQuery } from "@/trpc/factory"

describe("fetchPluginSessionToken", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// The token cache lives in module state; reset it between tests.
		vi.resetModules()
	})

	it("caches tokens per resource id", async () => {
		const { fetchPluginSessionToken } = await import("./pluginSessionToken")

		await expect(fetchPluginSessionToken("r-1")).resolves.toBe("tok-r-1")
		await expect(fetchPluginSessionToken("r-2")).resolves.toBe("tok-r-2")
		await expect(fetchPluginSessionToken("r-1")).resolves.toBe("tok-r-1")

		expect(vi.mocked(trpcQuery).mock.calls.length).toBe(2)
	})

	it("dedupes concurrent fetches for the same resource", async () => {
		const { fetchPluginSessionToken } = await import("./pluginSessionToken")

		const [a, b] = await Promise.all([
			fetchPluginSessionToken("r-1"),
			fetchPluginSessionToken("r-1"),
		])

		expect(a).toBe("tok-r-1")
		expect(b).toBe("tok-r-1")
		expect(vi.mocked(trpcQuery).mock.calls.length).toBe(1)
	})
})
