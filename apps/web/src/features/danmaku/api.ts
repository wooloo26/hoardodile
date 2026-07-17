import { queryOptions } from "@tanstack/react-query"
import { trpcQuery } from "@/trpc/factory"

export const danmakuKeys = {
	all: ["danmaku"] as const,
	list: (input: { anchor: { resId: string } }) =>
		[...danmakuKeys.all, "list", input] as const,
} as const

export function danmakuListQueryOptions(input: { anchor: { resId: string } }) {
	return queryOptions({
		queryKey: danmakuKeys.list(input),
		queryFn: () => trpcQuery("danmaku", "list", input),
		staleTime: 2_000,
	})
}
