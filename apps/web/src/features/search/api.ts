import type { SearchGlobalInput, SearchGlobalResult } from "@hoardodile/schemas"
import { queryOptions } from "@tanstack/react-query"
import { trpcQuery } from "@/trpc/factory"

export const searchKeys = {
	all: ["search"] as const,
	global: (input: SearchGlobalInput) =>
		[...searchKeys.all, "global", input] as const,
} as const

export function globalSearchQueryOptions(input: SearchGlobalInput) {
	return queryOptions({
		queryKey: searchKeys.global(input),
		queryFn: () => trpcQuery("search", "global", input),
		staleTime: 2_000,
		enabled: input.query !== undefined && input.query.trim().length > 0,
	})
}

export type { SearchGlobalInput, SearchGlobalResult }
