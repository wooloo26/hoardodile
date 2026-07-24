import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/trpc/factory", () => ({
	trpcQuery: vi.fn(async () => [
		{ key: "position", value: "3" },
		{ key: "empty", value: "" },
	]),
	trpcMutate: vi.fn(async () => ({})),
}))

import { trpcQuery } from "@/trpc/factory"
import { fetchPluginCache } from "./plugin-cache-fetch"

describe("fetchPluginCache", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns entries as an unprefixed record, skipping empty values", async () => {
		await expect(fetchPluginCache("r-1", "p-1")).resolves.toEqual({
			position: "3",
		})
		expect(trpcQuery).toHaveBeenCalledWith("pluginPreference", "cacheList", {
			pluginId: "p-1",
			resId: "r-1",
		})
	})

	it("deduplicates concurrent calls", async () => {
		const [a, b] = await Promise.all([
			fetchPluginCache("r-1", "p-1"),
			fetchPluginCache("r-1", "p-1"),
		])
		expect(a).toEqual(b)
		expect(trpcQuery).toHaveBeenCalledTimes(1)
	})

	it("fetches fresh once the previous call settled", async () => {
		await fetchPluginCache("r-1", "p-1")
		await fetchPluginCache("r-1", "p-1")
		expect(trpcQuery).toHaveBeenCalledTimes(2)
	})

	it("resolves to an empty record on failure", async () => {
		vi.mocked(trpcQuery).mockRejectedValueOnce(new Error("boom"))
		await expect(fetchPluginCache("r-1", "p-1")).resolves.toEqual({})
	})
})
