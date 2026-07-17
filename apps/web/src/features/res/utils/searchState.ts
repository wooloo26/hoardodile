import { MAX_PAGE_SIZE } from "@hoardodile/consts/text-limits"
import type { PluginManifestId } from "@hoardodile/schemas"
import type { SortBy, SortOrder, TagFilterMode } from "@hoardodile/shared"
import { sortBy, sortOrder, tagFilterMode } from "@hoardodile/shared"
import { z } from "zod"
import { RESOURCE_PAGE_SIZE } from "../api"

/**
 * Shared state shape for the resource search experience.
 */
export type ResSearchState = {
	readonly query: string
	readonly page: number
	readonly size: number
	readonly tagIds: readonly string[]
	readonly tagMode: TagFilterMode
	readonly noCharacters: boolean
	readonly trash: boolean
	readonly sortBy: SortBy
	readonly order: SortOrder
	readonly random: boolean
	readonly showOnlySelected: boolean
	readonly contentPluginId: PluginManifestId | ""
	readonly searchMetaFacets: Record<string, boolean>
	readonly searchIntro: boolean
}

export const RESOURCE_SEARCH_DEFAULTS: ResSearchState = {
	query: "",
	page: 1,
	size: RESOURCE_PAGE_SIZE,
	tagIds: [],
	tagMode: "and",
	noCharacters: false,
	trash: false,
	sortBy: "created",
	order: "desc",
	random: false,
	showOnlySelected: false,
	contentPluginId: "",
	searchMetaFacets: {},
	searchIntro: false,
}

/** Page size choices surfaced in the search UI. */
export const RESOURCE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

const contentPluginId = z.string()

/**
 * Loose Zod schema for `<ResSearch>` route search params.
 * All fields optional so partial URLs (e.g. only `?query=foo`) still validate.
 */
export const resSearchUrlSchema = z
	.object({
		query: z.string().optional(),
		page: z.coerce.number().int().min(1).optional(),
		size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
		tagIds: z.array(z.string()).optional(),
		tagMode: tagFilterMode.optional(),
		noCharacters: z.coerce.boolean().optional(),
		trash: z.coerce.boolean().optional(),
		sortBy: sortBy.optional(),
		order: sortOrder.optional(),
		random: z.coerce.boolean().optional(),
		showOnlySelected: z.coerce.boolean().optional(),
		contentPluginId: contentPluginId.optional(),
		searchMetaFacets: z.record(z.string(), z.boolean()).optional(),
		searchIntro: z.coerce.boolean().optional(),
	})
	.loose()
