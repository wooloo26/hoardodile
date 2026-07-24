import {
	keepPreviousData,
	type QueryKey,
	type UseQueryOptions,
	type UseQueryResult,
	useQueries,
	useQueryClient,
} from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef } from "react"
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

/** Auto-refresh interval options in seconds; 0 disables the timer. */
export const PINNED_REFRESH_INTERVALS = [0, 30, 60, 300] as const

function usePinnedSeeds() {
	return usePrefSync<Record<string, string>>(prefKeys.overviewPinnedSeeds, {})
}

/**
 * Seed for a pinned item's random ordering. Falls back to the item id so a
 * random section keeps the same result across mounts even before any seed
 * has been persisted; only an explicit refresh reshuffles.
 */
function seedForItem(
	seeds: Record<string, string>,
	item: PinnedSectionItem,
): string | undefined {
	if (item.random !== true) return undefined
	return seeds[item.id] ?? item.id
}

function withPinnedQueryKey<TData>(
	base: UseQueryOptions<TData, Error, TData, QueryKey>,
	seed: string | undefined,
): UseQueryOptions<TData, Error, TData, QueryKey> {
	// keepPreviousData keeps the previous rows on screen while a changed key
	// (seed reshuffle, filter edit) refetches, so sections never flash.
	if (seed === undefined) {
		// Non-random sections reuse the canonical listCards key, sharing the
		// cache with the list pages instead of refetching on every mount.
		return { ...base, placeholderData: keepPreviousData }
	}
	// Random sections: the seed in the key is the freshness token, so the
	// cached result is kept until the user refreshes (base random queries
	// force staleTime/gcTime 0 and would reshuffle on every mount).
	return {
		...base,
		queryKey: [...base.queryKey, "pinned", seed] as QueryKey,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: undefined,
		placeholderData: keepPreviousData,
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
	return withPinnedQueryKey<ResCardListResult>(base, seed)
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
	return withPinnedQueryKey<CharCardListResult>(base, seed)
}

export function useOverviewPinnedResources() {
	const [items] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedResources,
		[],
		pinnedSectionListCodec,
	)
	const [seeds] = usePinnedSeeds()

	const queries = useQueries({
		queries: items.map((item) =>
			buildOverviewPinnedResourceQueryOptions(item, seedForItem(seeds, item)),
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
	const [seeds] = usePinnedSeeds()

	const queries = useQueries({
		queries: items.map((item) =>
			buildOverviewPinnedCharacterQueryOptions(item, seedForItem(seeds, item)),
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

/**
 * Manual + scheduled refresh for the overview pinned sections. Refreshing
 * reshuffles persisted seeds for random sections (so their key changes and
 * they draw a new set) and invalidates the resource/character queries.
 */
export function useOverviewPinnedRefresh() {
	const qc = useQueryClient()
	const [seeds, setSeeds] = usePinnedSeeds()
	const [intervalSec, setIntervalSecRaw] = usePrefSync<number>(
		prefKeys.overviewPinnedRefreshSec,
		0,
	)
	const [resItems] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedResources,
		[],
		pinnedSectionListCodec,
	)
	const [charItems] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedCharacters,
		[],
		pinnedSectionListCodec,
	)

	const seedsRef = useRef(seeds)
	seedsRef.current = seeds
	const itemsRef = useRef({ resItems, charItems })
	itemsRef.current = { resItems, charItems }

	const refresh = useCallback(
		function refresh() {
			const { resItems: res, charItems: char } = itemsRef.current
			const randomItems = [...res, ...char].filter(
				(item) => item.random === true,
			)
			if (randomItems.length > 0) {
				const next = { ...seedsRef.current }
				for (const item of randomItems) {
					next[item.id] = randomUUID()
				}
				setSeeds(next)
			}
			void qc.invalidateQueries({ queryKey: ["resource"] })
			void qc.invalidateQueries({ queryKey: ["character"] })
		},
		[qc, setSeeds],
	)

	const setIntervalSec = useCallback(
		function setIntervalSec(next: number) {
			if (!Number.isFinite(next) || next < 0) return
			setIntervalSecRaw(next)
		},
		[setIntervalSecRaw],
	)

	const refreshRef = useRef(refresh)
	refreshRef.current = refresh
	useEffect(() => {
		if (intervalSec <= 0) return undefined
		const timer = setInterval(() => refreshRef.current(), intervalSec * 1000)
		return () => {
			clearInterval(timer)
		}
	}, [intervalSec])

	return { intervalSec, setIntervalSec, refresh }
}
