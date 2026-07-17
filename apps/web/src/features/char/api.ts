import type { TraitFilter } from "@hoardodile/schemas"
import type { SortBy, SortOrder, TagFilterMode } from "@hoardodile/shared"
import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query"
import { DEFAULT_TIME_ZONE } from "@/features/settings/datePrefs"
import { apiDelete, apiPutBlob } from "@/lib/http"
import { prefKeys } from "@/lib/keys"
import { makeInvalidator } from "@/lib/makeInvalidator"
import { apiPaths } from "@/lib/paths"
import { prefSync } from "@/lib/prefSync"
import {
	getCalendarMonthDay,
	normalizeTimeZonePref,
	resolveBrowserTimeZone,
} from "@/lib/timezone"
import {
	idMutation,
	toMutableArray,
	toMutableRecord,
	trpcMutation,
	trpcQuery,
} from "@/trpc/factory"
import { loadConnectedCharacterships } from "./utils/loadConnectedCharacterships"

export type CharListKeyInput = {
	readonly trash: boolean
	readonly query: string
	readonly page: number
	readonly size?: number
	readonly tagIds?: readonly string[]
	readonly tagMode?: TagFilterMode
	readonly sortBy?: SortBy
	readonly order?: SortOrder
	readonly random?: boolean
	readonly relationshipTypeIds?: readonly string[]
	readonly traitFilters?: readonly TraitFilter[]
	/** Resolved IANA zone for `dateMonthDayToday` cache keys when pref is `"local"`. */
	readonly calendarTimeZone?: string
	/** Calendar day (`YYYY-MM-DD`) for `dateMonthDayToday` cache invalidation at midnight. */
	readonly calendarDay?: string
}

export const charKeys = {
	all: ["character"] as const,
	list: (input: CharListKeyInput) => [...charKeys.all, "list", input] as const,
	listCards: (input: CharListKeyInput) =>
		[...charKeys.all, "listCards", input] as const,
	detail: (id: string) => [...charKeys.all, "detail", id] as const,
	detailCard: (id: string) => [...charKeys.all, "detailCard", id] as const,
	byIds: (ids: readonly string[]) =>
		[...charKeys.all, "byIds", [...ids].sort()] as const,
	thumb: (id: string, variant: string) =>
		[...charKeys.all, "thumb", id, variant] as const,
	relationshipTypes: () => [...charKeys.all, "relationship-types"] as const,
	relationshipTypesWithCounts: () =>
		[...charKeys.all, "relationship-types-with-counts"] as const,
	characterships: (charId: string) =>
		[...charKeys.all, "characterships", charId] as const,
	charactershipsBatch: (charIds: readonly string[]) =>
		[...charKeys.all, "characterships-batch", [...charIds].sort()] as const,
	charactershipGraph: (charId: string) =>
		[...charKeys.all, "charactership-graph", charId] as const,
} as const

export type CharListResult = import("@hoardodile/shared").ListPageResult<
	import("@hoardodile/schemas").Character
>
export type CharCardListResult = import("@hoardodile/shared").ListPageResult<
	import("@hoardodile/schemas").CharCard
>

export const CHARACTER_PAGE_SIZE = 30

type CharListOptions = {
	readonly query: string
	readonly page: number
	readonly size?: number
	readonly tagIds?: readonly string[]
	readonly tagMode?: TagFilterMode
	readonly sortBy?: SortBy
	readonly order?: SortOrder
	readonly random?: boolean
	readonly traitFilters?: readonly TraitFilter[]
	readonly searchIntro?: boolean
	readonly relationshipTypeIds?: readonly string[]
	readonly calendarTimeZone?: string
	readonly calendarDay?: string
}

function hasDateMonthDayTodayFilter(
	traitFilters: readonly TraitFilter[] | undefined,
): boolean {
	return (
		traitFilters?.some((filter) => filter.op === "dateMonthDayToday") ?? false
	)
}

/** Resolved IANA zone for char list cache keys when `dateMonthDayToday` is active. */
export function charListCalendarTimeZone(
	traitFilters: readonly TraitFilter[] | undefined,
	resolvedTimeZone: string,
): string | undefined {
	return hasDateMonthDayTodayFilter(traitFilters) ? resolvedTimeZone : undefined
}

/** Calendar day for char list cache keys when `dateMonthDayToday` is active. */
export function charListCalendarDay(
	traitFilters: readonly TraitFilter[] | undefined,
	calendarDay: string,
): string | undefined {
	return hasDateMonthDayTodayFilter(traitFilters) ? calendarDay : undefined
}

function normalizeTraitFilters(
	traitFilters: readonly TraitFilter[] | undefined,
): TraitFilter[] | undefined {
	if (traitFilters === undefined || traitFilters.length === 0) return undefined
	const timeZonePref = normalizeTimeZonePref(
		prefSync.get(prefKeys.timeZone) ?? DEFAULT_TIME_ZONE,
	)
	const { month, day } = getCalendarMonthDay(Date.now(), timeZonePref)
	const normalized = traitFilters.map((filter) => {
		if (filter.op === "dateMonthDayToday") {
			return {
				traitId: filter.traitId,
				op: "dateMonthDayOn" as const,
				value: { month, day },
			}
		}
		return filter
	})
	return [...normalized]
}

function effectiveTraitFilters(
	traitFilters: readonly TraitFilter[] | undefined,
): TraitFilter[] | undefined {
	if (traitFilters === undefined || traitFilters.length === 0) return undefined
	const effective = traitFilters.filter(
		(f) => !(f.op === "contains" && f.value.length === 0),
	)
	return effective.length > 0 ? [...effective] : undefined
}

function buildCharListKeyInput(
	trash: boolean,
	input: CharListOptions,
): CharListKeyInput {
	const {
		query,
		page,
		size,
		tagIds,
		tagMode,
		sortBy,
		order,
		random,
		traitFilters,
		relationshipTypeIds,
		calendarTimeZone,
		calendarDay,
	} = input
	return {
		trash,
		query,
		page,
		size,
		tagIds,
		tagMode,
		sortBy,
		order,
		random,
		traitFilters,
		relationshipTypeIds,
		...(calendarTimeZone !== undefined ? { calendarTimeZone } : {}),
		...(calendarDay !== undefined ? { calendarDay } : {}),
	}
}

function prepareCharListInput(input: CharListOptions): CharListOptions {
	const traitFilters = normalizeTraitFilters(input.traitFilters)
	if (traitFilters === undefined) return input
	return { ...input, traitFilters }
}

function buildCharacterListPayload(input: CharListOptions) {
	const {
		query,
		page,
		size,
		tagIds,
		tagMode,
		sortBy,
		order,
		random,
		traitFilters,
		searchIntro,
		relationshipTypeIds,
	} = input
	return {
		query: query || undefined,
		page,
		size: size ?? CHARACTER_PAGE_SIZE,
		tagIds: tagIds && tagIds.length > 0 ? [...tagIds] : undefined,
		tagMode,
		sortBy,
		order,
		random,
		traitFilters: effectiveTraitFilters(traitFilters),
		searchIntro: searchIntro === true ? true : undefined,
		relationshipTypeIds:
			relationshipTypeIds && relationshipTypeIds.length > 0
				? [...relationshipTypeIds]
				: undefined,
	}
}

export function charListQueryOptions(
	input: CharListOptions & { readonly trash: boolean },
) {
	const { trash, ...rest } = input
	return queryOptions({
		queryKey: charKeys.list(buildCharListKeyInput(trash, rest)),
		queryFn: () => {
			const prepared = prepareCharListInput(rest)
			const payload = buildCharacterListPayload(prepared)
			return trash
				? trpcQuery("character", "trashList", payload)
				: trpcQuery("character", "list", payload)
		},
		staleTime: 2_000,
	})
}

export function charListCardsQueryOptions(
	input: CharListOptions & { readonly trash?: boolean },
) {
	const { trash, ...rest } = input
	const random = rest.random === true
	return queryOptions({
		queryKey: charKeys.listCards(buildCharListKeyInput(trash ?? false, rest)),
		queryFn: () => {
			const prepared = prepareCharListInput(rest)
			const payload = buildCharacterListPayload(prepared)
			return trash === true
				? trpcQuery("character", "trashListCards", payload)
				: trpcQuery("character", "listCards", payload)
		},
		staleTime: random ? 0 : 2_000,
		gcTime: random ? 0 : undefined,
	})
}

export function charListCardsInfiniteQueryOptions(
	input: CharListOptions & { readonly trash?: boolean },
) {
	const { trash, ...rest } = input
	const random = rest.random === true
	const listKey = buildCharListKeyInput(trash ?? false, rest)
	return infiniteQueryOptions({
		queryKey: [...charKeys.listCards(listKey), "infinite"],
		queryFn: ({ pageParam }) => {
			const prepared = prepareCharListInput(rest)
			const payload = {
				...buildCharacterListPayload(prepared),
				page: pageParam,
			}
			return (
				trash === true
					? trpcQuery("character", "trashListCards", payload)
					: trpcQuery("character", "listCards", payload)
			) as Promise<CharCardListResult>
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage, allPages) => {
			const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0)
			return loaded < lastPage.total ? allPages.length + 1 : undefined
		},
		staleTime: random ? 0 : 2_000,
		gcTime: random ? 0 : undefined,
	})
}

export function charDetailQueryOptions(id: string) {
	return queryOptions({
		queryKey: charKeys.detail(id),
		queryFn: () => trpcQuery("character", "detail", { id }),
		staleTime: 2_000,
	})
}

export function charDetailCardQueryOptions(id: string) {
	return queryOptions({
		queryKey: charKeys.detailCard(id),
		queryFn: () => trpcQuery("character", "detailCard", { id }),
		staleTime: 2_000,
	})
}

export function charByIdsQueryOptions(ids: readonly string[]) {
	return queryOptions({
		queryKey: charKeys.byIds(ids),
		queryFn: async (): Promise<
			readonly import("@hoardodile/schemas").Character[]
		> => {
			if (ids.length === 0) return []
			return trpcQuery("character", "byIds", { ids: [...ids] })
		},
		staleTime: 2_000,
	})
}

export function relationshipTypesQueryOptions() {
	return queryOptions({
		queryKey: charKeys.relationshipTypes(),
		queryFn: () => trpcQuery("character", "listRelationshipTypes", undefined),
		staleTime: 30_000,
	})
}

export type RelationshipTypeWithCounts =
	import("@hoardodile/schemas").RelationshipType & {
		readonly edgeCount: number
	}

export function relationshipTypesWithCountsQueryOptions() {
	return queryOptions({
		queryKey: charKeys.relationshipTypesWithCounts(),
		queryFn: () =>
			trpcQuery("character", "listRelationshipTypesWithCounts", undefined),
		staleTime: 30_000,
	})
}

export function charactershipsQueryOptions(charId: string) {
	return queryOptions({
		queryKey: charKeys.characterships(charId),
		queryFn: () => trpcQuery("character", "listCharacterships", { charId }),
		staleTime: 5_000,
	})
}

export function charactershipsBatchQueryOptions(charIds: readonly string[]) {
	const sorted = [...charIds].sort()
	return queryOptions({
		queryKey: charKeys.charactershipsBatch(sorted),
		queryFn: () =>
			trpcQuery("character", "listCharactershipsForCharacters", {
				charIds: sorted,
			}),
		enabled: sorted.length > 0,
		staleTime: 5_000,
	})
}

export function charactershipGraphQueryOptions(charId: string) {
	return queryOptions({
		queryKey: charKeys.charactershipGraph(charId),
		queryFn: ({ client }) => loadConnectedCharacterships(charId, client),
		staleTime: 5_000,
	})
}

export const invalidateCharacters = makeInvalidator({
	all: charKeys.all,
	detail: charKeys.detail,
})

export async function invalidateCharacterships(
	qc: QueryClient,
	charId: string,
): Promise<void> {
	await Promise.all([
		qc.invalidateQueries({
			queryKey: charKeys.characterships(charId),
		}),
		qc.invalidateQueries({
			queryKey: charKeys.charactershipGraph(charId),
		}),
	])
}

export function createCharactershipMutation() {
	return trpcMutation("character", "createCharactership")
}

export function deleteCharactershipMutation() {
	return idMutation("character", "deleteCharactership")
}

export function createCharacterMutation() {
	return trpcMutation("character", "create", {
		transform: (input: {
			name?: string
			intro?: string
			tagIds?: readonly string[]
			traitValues?: Readonly<Record<string, string>>
			defaultNameTimeZone?: string
		}) => ({
			...input,
			defaultNameTimeZone:
				input.defaultNameTimeZone ??
				resolveBrowserTimeZone(
					normalizeTimeZonePref(
						prefSync.get(prefKeys.timeZone) ?? DEFAULT_TIME_ZONE,
					),
				),
			tagIds: toMutableArray(input.tagIds),
			traitValues: toMutableRecord(input.traitValues),
		}),
	})
}

export function updateCharacterMutation() {
	return trpcMutation("character", "update", {
		transform: (input: {
			id: string
			name?: string
			intro?: string
			tagIds?: readonly string[]
			traitValues?: Readonly<Record<string, string>>
		}) => ({
			...input,
			tagIds: toMutableArray(input.tagIds),
			traitValues: toMutableRecord(input.traitValues),
		}),
	})
}

export function setCharacterTraitValuesMutation() {
	return trpcMutation("character", "update", {
		transform: (input: {
			id: string
			traitValues: Readonly<Record<string, string>>
		}) => ({ id: input.id, traitValues: { ...input.traitValues } }),
	})
}

export function softDeleteCharacterMutation() {
	return idMutation("character", "softDelete")
}

export function restoreCharacterMutation() {
	return idMutation("character", "restore")
}

export function hardDeleteCharacterMutation() {
	return idMutation("character", "hardDelete")
}

export function createRelationshipTypeMutation(qc?: QueryClient) {
	return {
		...trpcMutation("character", "createRelationshipType"),
		onSuccess:
			qc === undefined ? undefined : () => invalidateRelationshipTypes(qc),
	}
}

export function updateRelationshipTypeMutation(qc?: QueryClient) {
	return {
		...trpcMutation("character", "updateRelationshipType"),
		onSuccess:
			qc === undefined ? undefined : () => invalidateRelationshipTypes(qc),
	}
}

export function deleteRelationshipTypeMutation() {
	return idMutation("character", "deleteRelationshipType")
}

export function forceDeleteRelationshipTypeMutation() {
	return trpcMutation("character", "forceDeleteRelationshipType")
}

export function reorderRelationshipTypesMutation(qc?: QueryClient) {
	return {
		...trpcMutation("character", "reorderRelationshipTypes"),
		onSuccess:
			qc === undefined ? undefined : () => invalidateRelationshipTypes(qc),
	}
}

export async function invalidateRelationshipTypes(
	qc: QueryClient,
): Promise<void> {
	await Promise.all([
		qc.invalidateQueries({ queryKey: charKeys.relationshipTypes() }),
		qc.invalidateQueries({ queryKey: charKeys.relationshipTypesWithCounts() }),
		qc.invalidateQueries({ queryKey: charKeys.all }),
	])
}

// ── Non-tRPC image endpoints ────────────────────────────────────────────────

export async function uploadCharImage(
	charId: string,
	variant: string,
	blob: Blob,
	filename: string,
): Promise<void> {
	const response = await apiPutBlob(
		apiPaths.characters.image(charId, variant),
		blob,
		filename,
	)
	if (!response.ok) {
		const text = await response.text().catch(() => "")
		throw new Error(text || `image upload failed (${response.status})`)
	}
}

export async function deleteCharImage(
	charId: string,
	variant: string,
): Promise<void> {
	const response = await apiDelete(apiPaths.characters.image(charId, variant))
	if (!response.ok) {
		const text = await response.text().catch(() => "")
		throw new Error(text || `image delete failed (${response.status})`)
	}
}
