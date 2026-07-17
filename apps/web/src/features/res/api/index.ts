import { DEFAULT_PAGE_SIZE } from "@hoardodile/consts/page"
import type { PluginManifestId, ResCard, Resource } from "@hoardodile/schemas"
import type {
	ListPageResult,
	SortBy,
	SortOrder,
	TagFilterMode,
} from "@hoardodile/shared"
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"
import { DEFAULT_TIME_ZONE } from "@/features/settings/datePrefs"
import { apiDelete, apiPutBlob } from "@/lib/http"
import { prefKeys } from "@/lib/keys"
import {
	nonEmptyArray,
	nonEmptyRecord,
	nonEmptyString,
	trueOrUndefined,
} from "@/lib/listPayload"
import { makeInvalidator } from "@/lib/makeInvalidator"
import { apiPaths } from "@/lib/paths"
import { prefSync } from "@/lib/prefSync"
import { normalizeTimeZonePref, resolveBrowserTimeZone } from "@/lib/timezone"
import { idMutation, trpcMutation, trpcQuery } from "@/trpc/factory"

export type ResListKeyInput = {
	readonly trash: boolean
	readonly query: string
	readonly page: number
	readonly charId?: string
	readonly noCharacters?: boolean
	readonly tagIds?: readonly string[]
	readonly tagMode?: TagFilterMode
	readonly sortBy?: SortBy
	readonly order?: SortOrder
	readonly random?: boolean
}

export const resKeys = {
	all: ["resource"] as const,
	list: (input: ResListKeyInput) => [...resKeys.all, "list", input] as const,
	listCards: (input: ResListKeyInput) =>
		[...resKeys.all, "listCards", input] as const,
	detail: (id: string) => [...resKeys.all, "detail", id] as const,
	detailCard: (id: string) => [...resKeys.all, "detailCard", id] as const,
	preview: (id: string) => [...resKeys.all, "preview", id] as const,
	files: (id: string) => [...resKeys.all, "files", id] as const,
	relatedByTags: (id: string, limit: number) =>
		[...resKeys.all, "relatedByTags", id, limit] as const,
} as const

export const importKeys = {
	all: ["import"] as const,
	config: () => [...importKeys.all, "config"] as const,
	browseDirectory: (root: string, subPath: string) =>
		[...importKeys.all, "browseDirectory", root, subPath] as const,
} as const

export type ResListResult = ListPageResult<Resource>
export type ResCardListResult = ListPageResult<ResCard>

export const RESOURCE_PAGE_SIZE = DEFAULT_PAGE_SIZE

type ResListOptions = {
	readonly query: string
	readonly page: number
	readonly size?: number
	readonly charId?: string
	readonly noCharacters?: boolean
	readonly tagIds?: readonly string[]
	readonly tagMode?: TagFilterMode
	readonly sortBy?: SortBy
	readonly order?: SortOrder
	readonly random?: boolean
	readonly contentPluginId?: PluginManifestId
	readonly searchMetaFacets?: Record<string, boolean>
	readonly searchIntro?: boolean
}

function buildResourceListPayload(input: ResListOptions) {
	const {
		query,
		page,
		size,
		charId,
		noCharacters,
		tagIds,
		tagMode,
		sortBy,
		order,
		random,
		contentPluginId,
		searchMetaFacets,
		searchIntro,
	} = input
	return {
		query: nonEmptyString(query),
		page,
		size: size ?? RESOURCE_PAGE_SIZE,
		charId,
		noCharacters: trueOrUndefined(noCharacters),
		tagIds: nonEmptyArray(tagIds),
		tagMode,
		sortBy,
		order,
		random,
		contentPluginId,
		searchMetaFacets: nonEmptyRecord(searchMetaFacets),
		searchIntro: trueOrUndefined(searchIntro),
	}
}

export function resListQueryOptions(
	input: ResListOptions & { readonly trash: boolean },
) {
	const { trash, ...rest } = input
	const random = rest.random === true
	return queryOptions({
		queryKey: resKeys.list({ trash, ...rest }),
		queryFn: () => {
			const payload = buildResourceListPayload(rest)
			return trash
				? trpcQuery("resource", "trashList", payload)
				: trpcQuery("resource", "list", payload)
		},
		staleTime: random ? 0 : 2_000,
		gcTime: random ? 0 : undefined,
	})
}

export function resListCardsQueryOptions(
	input: ResListOptions & { readonly trash?: boolean },
) {
	const { trash, ...rest } = input
	const random = rest.random === true
	return queryOptions({
		queryKey: resKeys.listCards({ trash: trash ?? false, ...rest }),
		queryFn: () => fetchResourceListCards(input),
		staleTime: random ? 0 : 2_000,
		gcTime: random ? 0 : undefined,
	})
}

export function resListCardsInfiniteQueryOptions(
	input: ResListOptions & { readonly trash?: boolean },
) {
	const { trash, ...rest } = input
	const basePayload = buildResourceListPayload(rest)
	const random = rest.random === true
	return infiniteQueryOptions({
		queryKey: [
			...resKeys.listCards({ trash: trash ?? false, ...rest }),
			"infinite",
		],
		queryFn: ({ pageParam }) => {
			const payload = { ...basePayload, page: pageParam }
			return (
				trash === true
					? trpcQuery("resource", "trashListCards", payload)
					: trpcQuery("resource", "listCards", payload)
			) as Promise<ResCardListResult>
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

export function fetchResourceListCards(
	input: ResListOptions & { readonly trash?: boolean },
): Promise<ResCardListResult> {
	const { trash, ...rest } = input
	const payload = buildResourceListPayload(rest)
	return trash === true
		? trpcQuery("resource", "trashListCards", payload)
		: trpcQuery("resource", "listCards", payload)
}

export function resDetailQueryOptions(id: string) {
	return queryOptions({
		queryKey: resKeys.detail(id),
		queryFn: () => trpcQuery("resource", "detail", { id }),
		staleTime: 2_000,
	})
}

export function resDetailCardQueryOptions(id: string) {
	return queryOptions({
		queryKey: resKeys.detailCard(id),
		queryFn: () => trpcQuery("resource", "detailCard", { id }),
		staleTime: 2_000,
	})
}

export const invalidateResources = makeInvalidator({
	all: resKeys.all,
	detail: resKeys.detail,
})

export function resFilesQueryOptions(id: string) {
	return queryOptions({
		queryKey: resKeys.files(id),
		queryFn: () => trpcQuery("resource", "listFiles", { id }),
		staleTime: Number.POSITIVE_INFINITY,
	})
}

export function relatedResourcesByTagsQueryOptions(id: string, limit: number) {
	return queryOptions({
		queryKey: resKeys.relatedByTags(id, limit),
		queryFn: () => trpcQuery("resource", "relatedByTags", { id, limit }),
		staleTime: 30_000,
	})
}

export function createResourceWithUploadMutation() {
	return trpcMutation("resource", "create", {
		transform: (input: {
			files?: readonly string[]
			archiveFileId?: string
			name?: string
			intro?: string
			contentPluginId?: PluginManifestId
			tagIds?: readonly string[]
			charIds?: readonly string[]
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
			tagIds: nonEmptyArray(input.tagIds),
			charIds: nonEmptyArray(input.charIds),
			files: input.files ? [...input.files] : undefined,
		}),
	})
}

export function updateResourceMutation() {
	return trpcMutation("resource", "update", {
		transform: (input: {
			id: string
			name?: string
			intro?: string
			charIds?: readonly string[]
		}) => ({
			...input,
			charIds: nonEmptyArray(input.charIds),
		}),
	})
}

export function softDeleteResourceMutation() {
	return idMutation("resource", "softDelete")
}

export function restoreResourceMutation() {
	return idMutation("resource", "restore")
}

export function hardDeleteResourceMutation() {
	return idMutation("resource", "hardDelete")
}

export function softDeleteManyResourcesMutation() {
	return trpcMutation("resource", "softDeleteMany", {
		transform: (ids: readonly string[]) => ({
			ids: nonEmptyArray(ids) ?? [],
		}),
	})
}

export function hardDeleteManyResourcesMutation() {
	return trpcMutation("resource", "hardDeleteMany", {
		transform: (ids: readonly string[]) => ({
			ids: nonEmptyArray(ids) ?? [],
		}),
	})
}

export function setResourceContentPluginIdMutation() {
	return trpcMutation("resource", "setContentPluginId")
}

// ── Non-tRPC HTTP endpoints ─────────────────────────────────────────────────

export function resCoverUrl(resId: string): string {
	return apiPaths.resources.cover(resId)
}

export async function uploadResCover(
	resId: string,
	blob: Blob,
	filename: string,
	contentType?: string,
): Promise<void> {
	const response = await apiPutBlob(
		apiPaths.resources.cover(resId),
		blob,
		filename,
		contentType,
	)
	if (!response.ok) {
		const text = await response.text().catch(() => "")
		throw new Error(text || `cover upload failed (${response.status})`)
	}
}

export async function deleteResCover(resId: string): Promise<void> {
	const response = await apiDelete(apiPaths.resources.cover(resId))
	if (!response.ok) {
		const text = await response.text().catch(() => "")
		throw new Error(text || `cover delete failed (${response.status})`)
	}
}

export function resFileUrl(resId: string, filename: string): string {
	return apiPaths.resources.files(resId, filename)
}

export function resSourceZipUrl(resId: string): string {
	return apiPaths.resources.sourceZip(resId)
}

export async function bulkDownloadResources(
	ids: readonly string[],
	options: { readonly dateStamp: string },
): Promise<Response> {
	return fetch(apiPaths.resources.bulkSourceZip(), {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			ids: [...ids],
			sortByCreated: true,
			dateStamp: options?.dateStamp,
		}),
	})
}
