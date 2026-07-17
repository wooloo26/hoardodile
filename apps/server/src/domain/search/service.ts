import { MAX_PAGE_SIZE } from "@hoardodile/consts"
import type {
	CharCard,
	DocSearchRow,
	ResCard,
	SearchGlobalInput,
	SearchGlobalResult,
	SearchScope,
} from "@hoardodile/schemas"
import { SEARCH_PREVIEW_SIZE } from "@hoardodile/schemas"
import type { ListPageResult } from "@hoardodile/shared"
import type { CharService } from "src/domain/char/service.ts"
import type { DocService } from "src/domain/doc/service.ts"
import type { ResService } from "src/domain/res/service.ts"
import { applyPageBounds } from "src/infra/service.ts"

export type SearchServiceDeps = {
	readonly charService: CharService
	readonly resService: ResService
	readonly docService: DocService
}

export type SearchService = {
	readonly globalSearch: (
		input: SearchGlobalInput,
	) => Promise<SearchGlobalResult>
}

function emptyPage<T>(page: number, size: number): ListPageResult<T> {
	return { rows: [], total: 0, page, size }
}

export function createSearchService(deps: SearchServiceDeps): SearchService {
	return { globalSearch }

	async function globalSearch(
		input: SearchGlobalInput,
	): Promise<SearchGlobalResult> {
		const { query = "", scope } = input
		const trimmed = query.trim()
		const { page, size } = applyPageBounds(
			{ page: input.page, size: input.size },
			MAX_PAGE_SIZE,
		)
		const isAll = scope === "all"
		const perDomainPage = isAll ? 1 : page
		const perDomainSize = isAll ? SEARCH_PREVIEW_SIZE : size

		if (trimmed.length === 0) {
			return {
				query: trimmed,
				scope,
				characters: emptyPage<CharCard>(perDomainPage, perDomainSize),
				resources: emptyPage<ResCard>(perDomainPage, perDomainSize),
				documents: emptyPage<DocSearchRow>(perDomainPage, perDomainSize),
			}
		}

		const [characters, resources, documents] = await Promise.all([
			shouldSearch(scope, "characters")
				? deps.charService.listCards({
						query: trimmed,
						page: perDomainPage,
						size: perDomainSize,
						searchIntro: true,
					})
				: emptyPage<CharCard>(perDomainPage, perDomainSize),
			shouldSearch(scope, "resources")
				? deps.resService.listCards({
						query: trimmed,
						page: perDomainPage,
						size: perDomainSize,
						searchIntro: true,
					})
				: emptyPage<ResCard>(perDomainPage, perDomainSize),
			shouldSearch(scope, "documents")
				? deps.docService.search({
						query: trimmed,
						page: perDomainPage,
						size: perDomainSize,
						trashed: false,
					})
				: emptyPage<DocSearchRow>(perDomainPage, perDomainSize),
		])

		return { query: trimmed, scope, characters, resources, documents }
	}
}

function shouldSearch(
	scope: SearchScope,
	kind: "characters" | "resources" | "documents",
): boolean {
	return scope === "all" || scope === kind
}
