import { useQueries, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { charListCardsQueryOptions } from "@/features/char/api"
import { resListCardsQueryOptions } from "@/features/res/api"
import { usageBatchEntityExposureQueryOptions } from "@/features/usage/api"
import { usePrefSync } from "@/hooks/usePrefSync"
import { prefKeys } from "@/lib/keys"
import { pinnedSectionListCodec } from "../pinned/pinnedSectionListCodec"
import type { PinnedSectionItem } from "../pinned/types"
import {
	compareStaleItems,
	type StaleItem,
} from "../sections/compareStaleItems"

const DEFAULT_PINNED_SIZE = 6
const STALE_SECTION_SIZE = 6
const STALE_CANDIDATE_SIZE = 50
export const STALE_NOT_VIEWED_DAYS = 30
const DAY_MS = 86_400_000

function staleRank(lastViewedAt: number | null, now: number): number {
	if (lastViewedAt === null) return Number.POSITIVE_INFINITY
	return now - lastViewedAt
}

function isStale(
	lastViewedAt: number | null,
	staleDays: number,
	now: number,
): boolean {
	if (lastViewedAt === null) return true
	return now - lastViewedAt > staleDays * DAY_MS
}

function buildCharInput(item: PinnedSectionItem) {
	return {
		query: item.query ?? "",
		page: 1,
		size: Math.max(item.size ?? DEFAULT_PINNED_SIZE, STALE_CANDIDATE_SIZE),
		sortBy: "created" as const,
		order: "asc" as const,
		random: false,
		tagIds: item.tagIds,
		tagMode: item.tagMode,
		traitFilters: item.traitFilters,
		searchIntro: item.searchIntro,
		relationshipTypeIds: item.relationshipTypeIds,
	}
}

function buildResInput(item: PinnedSectionItem) {
	return {
		query: item.query ?? "",
		page: 1,
		size: Math.max(item.size ?? DEFAULT_PINNED_SIZE, STALE_CANDIDATE_SIZE),
		sortBy: "created" as const,
		order: "asc" as const,
		random: false,
		tagIds: item.tagIds,
		tagMode: item.tagMode,
		noCharacters: item.noCharacters,
		contentPluginId:
			item.contentPluginId === "" ? undefined : item.contentPluginId,
		searchMetaFacets:
			item.searchMetaFacets && Object.keys(item.searchMetaFacets).length > 0
				? item.searchMetaFacets
				: undefined,
		searchIntro: item.searchIntro,
	}
}

export function useStalePinnedItems() {
	const [charItems] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedCharacters,
		[],
		pinnedSectionListCodec,
	)
	const [resItems] = usePrefSync<readonly PinnedSectionItem[]>(
		prefKeys.overviewPinnedResources,
		[],
		pinnedSectionListCodec,
	)

	const charPinned = charItems.length > 0
	const resPinned = resItems.length > 0
	const anyPinned = charPinned || resPinned

	const charQueries = useQueries({
		queries: charItems.map((item) => ({
			...charListCardsQueryOptions(buildCharInput(item)),
			enabled: charPinned,
		})),
	})
	const resQueries = useQueries({
		queries: resItems.map((item) => ({
			...resListCardsQueryOptions(buildResInput(item)),
			enabled: resPinned,
		})),
	})

	const charRows = useMemo(
		() => charQueries.flatMap((q) => q.data?.rows ?? []),
		[charQueries],
	)
	const resRows = useMemo(
		() => resQueries.flatMap((q) => q.data?.rows ?? []),
		[resQueries],
	)

	const entities = useMemo(() => {
		const rows: { entityType: "character" | "resource"; entityId: string }[] =
			[]
		for (const character of charRows) {
			rows.push({ entityType: "character", entityId: character.id })
		}
		for (const resource of resRows) {
			rows.push({ entityType: "resource", entityId: resource.id })
		}
		return rows
	}, [charRows, resRows])

	const exposureQuery = useQuery({
		...usageBatchEntityExposureQueryOptions({ entities }),
		enabled: anyPinned && entities.length > 0,
	})

	const staleItems = useMemo((): readonly StaleItem[] => {
		const now = Date.now()
		const exposureByKey = new Map(
			(exposureQuery.data ?? []).map((row) => [
				`${row.entityType}:${row.entityId}`,
				row,
			]),
		)
		const items: StaleItem[] = []

		for (const character of charRows) {
			const exposure = exposureByKey.get(`character:${character.id}`)
			if (
				exposure === undefined ||
				!isStale(exposure.lastViewedAt, STALE_NOT_VIEWED_DAYS, now)
			) {
				continue
			}
			items.push({
				kind: "character",
				card: character,
				staleRank: staleRank(exposure.lastViewedAt, now),
				createdAt: character.createdAt,
			})
		}

		for (const resource of resRows) {
			const exposure = exposureByKey.get(`resource:${resource.id}`)
			if (
				exposure === undefined ||
				!isStale(exposure.lastViewedAt, STALE_NOT_VIEWED_DAYS, now)
			) {
				continue
			}
			items.push({
				kind: "resource",
				card: resource,
				staleRank: staleRank(exposure.lastViewedAt, now),
				createdAt: resource.createdAt,
			})
		}

		return items.sort(compareStaleItems).slice(0, STALE_SECTION_SIZE)
	}, [charRows, resRows, exposureQuery.data])

	const listsPending =
		(charPinned && charQueries.some((q) => q.isPending)) ||
		(resPinned && resQueries.some((q) => q.isPending))
	const exposurePending = entities.length > 0 && exposureQuery.isPending
	const isPending = listsPending || exposurePending

	return {
		anyPinned,
		staleItems,
		isPending,
		isVisible: anyPinned && (isPending || staleItems.length > 0),
	}
}
