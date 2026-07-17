import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	DRAFT_LIMITS,
	type DraftRecord,
	draftStore,
	type LocalDraftCacheEntry,
	selectEvictedDocIds,
} from "./draftStore"

beforeEach(async () => {
	await draftStore.__resetForTests()
})

function makeEntry(savedAt: number, sizeChars: number): LocalDraftCacheEntry {
	return {
		title: `draft-${savedAt}`,
		content: {
			blocks: [
				{
					type: "paragraph",
					content: "x".repeat(sizeChars),
				},
			],
		},
		savedAt,
	}
}

describe("draftStore", () => {
	it("stores and retrieves a draft", async () => {
		await draftStore.set("doc-1", {
			title: "Hello",
			content: { blocks: [] },
			savedAt: Date.now(),
		})
		const got = await draftStore.get("doc-1")
		expect(got?.title).toBe("Hello")
		expect(got?.content).toEqual({ blocks: [] })
	})

	it("clears a draft", async () => {
		await draftStore.set("doc-1", {
			title: "A",
			content: { blocks: [] },
			savedAt: Date.now(),
		})
		await draftStore.clear("doc-1")
		expect(await draftStore.get("doc-1")).toBeUndefined()
	})

	it("does not store drafts exceeding the single-entry size limit", async () => {
		const big = makeEntry(1000, DRAFT_LIMITS.maxDraftSizeBytes + 100)
		await draftStore.set("big", big)
		expect(await draftStore.get("big")).toBeUndefined()
	})

	it("evicts oldest drafts when count exceeds the limit", async () => {
		const base = Date.now()
		const limit = DRAFT_LIMITS.maxTotalCount
		for (let i = 0; i < limit + 5; i++) {
			await draftStore.set(`doc-${i}`, {
				title: String(i),
				content: { i },
				savedAt: base + i * 1000,
			})
		}
		expect(await draftStore.get("doc-0")).toBeUndefined()
		expect(await draftStore.get(`doc-${limit - 1}`)).toBeDefined()
		expect(await draftStore.get(`doc-${limit + 4}`)).toBeDefined()
	})

	it("evicts expired drafts by TTL", async () => {
		const now = Date.now()
		const expired = makeEntry(now - DRAFT_LIMITS.ttlMs - 1, 10)
		const fresh = makeEntry(now, 10)
		await draftStore.set("old-doc", expired)
		await draftStore.set("new-doc", fresh)
		expect(await draftStore.get("old-doc")).toBeUndefined()
		expect(await draftStore.get("new-doc")).toBeDefined()
	})

	it("falls back to memory when IndexedDB is unavailable", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		const originalIndexedDB = globalThis.indexedDB
		try {
			// @ts-expect-error simulate private-mode/no-IDB environment
			globalThis.indexedDB = undefined
			await draftStore.__resetForTests()

			await draftStore.set("mem-doc", {
				title: "Memory",
				content: { blocks: [] },
				savedAt: Date.now(),
			})
			const got = await draftStore.get("mem-doc")
			expect(got?.title).toBe("Memory")
		} finally {
			globalThis.indexedDB = originalIndexedDB
			warnSpy.mockRestore()
		}
	})

	it("stores and retrieves the single current draft", async () => {
		await draftStore.setCurrent("doc-1", {
			title: "Current",
			content: { blocks: [] },
			savedAt: Date.now(),
		})
		const got = await draftStore.getCurrent()
		expect(got?.docId).toBe("doc-1")
		expect(got?.title).toBe("Current")
	})

	it("overwrites the previous current draft", async () => {
		await draftStore.setCurrent("doc-1", {
			title: "First",
			content: { blocks: [] },
			savedAt: Date.now(),
		})
		await draftStore.setCurrent("doc-2", {
			title: "Second",
			content: { blocks: [{ type: "paragraph" }] },
			savedAt: Date.now(),
		})
		const got = await draftStore.getCurrent()
		expect(got?.docId).toBe("doc-2")
		expect(got?.title).toBe("Second")
	})

	it("clears the current draft", async () => {
		await draftStore.setCurrent("doc-1", {
			title: "Current",
			content: { blocks: [] },
			savedAt: Date.now(),
		})
		await draftStore.clearCurrent()
		expect(await draftStore.getCurrent()).toBeUndefined()
	})
})

describe("selectEvictedDocIds", () => {
	it("evicts expired records by TTL", () => {
		const now = 1_000_000
		const records: DraftRecord[] = [
			{
				docId: "old",
				title: "",
				content: {},
				savedAt: now - DRAFT_LIMITS.ttlMs - 1,
				size: 10,
			},
			{ docId: "fresh", title: "", content: {}, savedAt: now, size: 10 },
		]
		const ids = selectEvictedDocIds(records, DRAFT_LIMITS, now)
		expect(ids).toContain("old")
		expect(ids).not.toContain("fresh")
	})

	it("evicts oldest records when count exceeds limit", () => {
		const now = 1_000_000
		const records: DraftRecord[] = Array.from({ length: 5 }, (_, i) => ({
			docId: `d${i}`,
			title: "",
			content: {},
			savedAt: i * 1000,
			size: 10,
		}))
		const ids = selectEvictedDocIds(
			records,
			{ ...DRAFT_LIMITS, maxTotalCount: 3 },
			now,
		)
		expect(ids).toEqual(["d0", "d1"])
	})

	it("evicts oldest records when total size exceeds limit", () => {
		const now = 1_000_000
		const records: DraftRecord[] = [
			{ docId: "a", title: "", content: {}, savedAt: 0, size: 60 },
			{ docId: "b", title: "", content: {}, savedAt: 1000, size: 30 },
			{ docId: "c", title: "", content: {}, savedAt: 2000, size: 20 },
		]
		const ids = selectEvictedDocIds(
			records,
			{ ...DRAFT_LIMITS, maxTotalSizeBytes: 80, maxTotalCount: 100 },
			now,
		)
		expect(ids).toEqual(["a"])
	})
})
