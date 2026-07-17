import type { CharCard, DocSearchRow, ResCard } from "@hoardodile/schemas"
import { SEARCH_PREVIEW_SIZE } from "@hoardodile/schemas"
import type { CharService } from "src/domain/char/service.ts"
import type { DocService } from "src/domain/doc/service.ts"
import type { ResService } from "src/domain/res/service.ts"
import { beforeEach, describe, expect, type Mock, test, vi } from "vitest"
import { createSearchService } from "./service.ts"

describe("search service", () => {
	let charService: { listCards: Mock<CharService["listCards"]> }
	let resService: { listCards: Mock<ResService["listCards"]> }
	let docService: { search: Mock<DocService["search"]> }
	let searchService: ReturnType<typeof createSearchService>

	beforeEach(() => {
		charService = { listCards: vi.fn() }
		resService = { listCards: vi.fn() }
		docService = { search: vi.fn() }

		searchService = createSearchService({
			charService: charService as unknown as CharService,
			resService: resService as unknown as ResService,
			docService: docService as unknown as DocService,
		})
	})

	test("scope=all aggregates characters, resources, and documents", async () => {
		charService.listCards.mockResolvedValue({
			rows: [{ id: "c1", name: "Char" } as CharCard],
			total: 1,
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
		})
		resService.listCards.mockResolvedValue({
			rows: [{ id: "r1", name: "Res" } as ResCard],
			total: 1,
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
		})
		docService.search.mockResolvedValue({
			rows: [{ id: "d1", title: "Doc" } as DocSearchRow],
			total: 1,
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
		})

		const result = await searchService.globalSearch({
			query: "foo",
			scope: "all",
		})

		expect(result.query).toBe("foo")
		expect(result.scope).toBe("all")
		expect(result.characters.total).toBe(1)
		expect(result.resources.total).toBe(1)
		expect(result.documents.total).toBe(1)
		expect(charService.listCards).toHaveBeenCalledWith({
			query: "foo",
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
			searchIntro: true,
		})
		expect(resService.listCards).toHaveBeenCalledWith({
			query: "foo",
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
			searchIntro: true,
		})
		expect(docService.search).toHaveBeenCalledWith({
			query: "foo",
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
			trashed: false,
		})
	})

	test("scope=characters only queries characters", async () => {
		charService.listCards.mockResolvedValue({
			rows: [{ id: "c1", name: "Char" } as CharCard],
			total: 1,
			page: 1,
			size: 20,
		})

		const result = await searchService.globalSearch({
			query: "bar",
			scope: "characters",
			page: 1,
			size: 20,
		})

		expect(result.characters.total).toBe(1)
		expect(result.resources.total).toBe(0)
		expect(result.documents.total).toBe(0)
		expect(charService.listCards).toHaveBeenCalledTimes(1)
		expect(resService.listCards).not.toHaveBeenCalled()
		expect(docService.search).not.toHaveBeenCalled()
	})

	test("empty query returns empty pages without calling services", async () => {
		const result = await searchService.globalSearch({
			query: "   ",
			scope: "all",
		})

		expect(result.characters.rows).toHaveLength(0)
		expect(result.resources.rows).toHaveLength(0)
		expect(result.documents.rows).toHaveLength(0)
		expect(charService.listCards).not.toHaveBeenCalled()
		expect(resService.listCards).not.toHaveBeenCalled()
		expect(docService.search).not.toHaveBeenCalled()
	})

	test("query is trimmed before searching", async () => {
		charService.listCards.mockResolvedValue({
			rows: [],
			total: 0,
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
		})
		resService.listCards.mockResolvedValue({
			rows: [],
			total: 0,
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
		})
		docService.search.mockResolvedValue({
			rows: [],
			total: 0,
			page: 1,
			size: SEARCH_PREVIEW_SIZE,
		})

		const result = await searchService.globalSearch({
			query: "  spaced  ",
			scope: "all",
		})

		expect(result.query).toBe("spaced")
		expect(charService.listCards).toHaveBeenCalledWith(
			expect.objectContaining({ query: "spaced" }),
		)
	})
})
