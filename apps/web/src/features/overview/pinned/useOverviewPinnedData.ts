import {
	type QueryKey,
	type UseQueryOptions,
	type UseQueryResult,
	useQueries,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"
import {
	type CharCardListResult,
	charListCardsQueryOptions,
} from "@/features/char/api"
import {
	type ResCardListResult,
	resListCardsQueryOptions,
} from "@/features/res/api"
import { usePrefSync } from "@/hooks/usePrefSync"
import { prefKeys } from "@/lib/keys"
import { randomUUID } from "@/lib/randomUUID"
import { pinnedSectionListCodec } from "./pinnedSectionListCodec"
import type { PinnedSectionItem } from "./types"
import {
	buildCharacterListInput,
	buildResourceListInput,
	isVisibleItem,
	type PinnedCharacterItemData,
	type PinnedResourceItemData,
} from "./usePinnedSectionData"

function usePinnedRandomSeed() {
	const [seed] = useState(() => randomUUID())
	return seed
}

function withPinnedQueryKey<TData>(
	base: UseQueryOptions<TData, Error, TData, QueryKey>,
	itemId: string,
	seed?: string,
): UseQueryOptions<TData, Error, TData, QueryKey> {
	return {
		...base,
		queryKey: [
			...base.queryKey,
			itemId,
			...(seed ? ["pinned", seed] : []),
		] as QueryKey,
	}
}

export function buildOverviewPinnedResourceQueryOptions(
	item: PinnedSectionItem,
	seed?: string,
) {
	const input = buildResourceListInput(item)
	const base = resListCardsQueryOptions({
		...input,
		trash: false,
	}) as UseQueryOptions<ResCardListResult, Error, ResCardListResult, QueryKey>
	return withPinnedQueryKey<ResCardListResult>(base, item.id, seed)
}

export function buildOverviewPinnedCharacterQueryOptions(
	item: PinnedSectionItem,
	seed?: string,
) {
	const input = buildCharacterListInput(item)
	const base = charListCardsQueryOptions({
		...input,
		trash: false,
	}) as UseQueryOptions<CharCardListResult, Error, CharCardListResult, QueryKey>
	return withPinnedQueryKey<CharCardListResult>(base, item.id, seed)
}

export function useOverviewPinnedResources() {
	const [items] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedResources,
		[],
		pinnedSectionListCodec,
	)
	const seed = usePinnedRandomSeed()

	const queries = useQueries({
		queries: items.map((item) =>
			buildOverviewPinnedResourceQueryOptions(item, seed),
		),
	})

	const itemsWithQueries = useMemo<PinnedResourceItemData[]>(
		() =>
			items.map((item, index) => ({
				item,
				query: queries[index] as UseQueryResult<ResCardListResult, Error>,
			})),
		[items, queries],
	)

	const visibleItems = useMemo(
		() =>
			itemsWithQueries.filter(({ item, query }) => isVisibleItem(item, query)),
		[itemsWithQueries],
	)
	const isPending = itemsWithQueries.some(({ query }) => query.isPending)

	return { visibleItems, isPending }
}

export function useOverviewPinnedCharacters() {
	const [items] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedCharacters,
		[],
		pinnedSectionListCodec,
	)
	const seed = usePinnedRandomSeed()

	const queries = useQueries({
		queries: items.map((item) =>
			buildOverviewPinnedCharacterQueryOptions(item, seed),
		),
	})

	const itemsWithQueries = useMemo<PinnedCharacterItemData[]>(
		() =>
			items.map((item, index) => ({
				item,
				query: queries[index] as UseQueryResult<CharCardListResult, Error>,
			})),
		[items, queries],
	)

	const visibleItems = useMemo(
		() =>
			itemsWithQueries.filter(({ item, query }) => isVisibleItem(item, query)),
		[itemsWithQueries],
	)
	const isPending = itemsWithQueries.some(({ query }) => query.isPending)

	return { visibleItems, isPending }
}
