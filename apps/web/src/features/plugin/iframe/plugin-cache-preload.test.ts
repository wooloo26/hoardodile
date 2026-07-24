import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/trpc/factory", () => ({
	trpcQuery: vi.fn(async () => [
		{
			pluginId: "p-1",
			resId: "r-1",
			key: "position",
			value: "3",
			updatedAt: 1,
		},
	]),
	trpcMutate: vi.fn(async () => ({})),
}))

import {
	clearAllResCache,
	getCachedForPlugin,
	preloadCacheByResId,
	upsertResCacheEntry,
} from "./plugin-cache-preload"

async function flushPreload(): Promise<void> {
	// preloadCacheByResId is fire-and-forget; let its promise settle.
	await vi.waitFor(() => {
		expect(getCachedForPlugin("r-1", "p-1")).toBeDefined()
	})
}

describe("plugin-cache-preload", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		clearAllResCache()
	})

	it("serves preloaded entries per plugin", async () => {
		preloadCacheByResId("r-1")
		await flushPreload()
		expect(getCachedForPlugin("r-1", "p-1")).toEqual({ position: "3" })
	})

	it("upsert updates a preloaded snapshot", async () => {
		preloadCacheByResId("r-1")
		await flushPreload()
		upsertResCacheEntry("r-1", "p-1", "position", "7")
		expect(getCachedForPlugin("r-1", "p-1")).toEqual({ position: "7" })
	})

	it("upsert with an empty value deletes the key", async () => {
		preloadCacheByResId("r-1")
		await flushPreload()
		upsertResCacheEntry("r-1", "p-1", "position", "")
		expect(getCachedForPlugin("r-1", "p-1")).toEqual({})
	})

	it("upsert ignores resources that were never preloaded", () => {
		upsertResCacheEntry("r-unknown", "p-1", "position", "7")
		expect(getCachedForPlugin("r-unknown", "p-1")).toBeUndefined()
	})
})
