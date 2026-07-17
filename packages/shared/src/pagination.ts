import type { PluginManifestId } from "@hoardodile/schemas/plugin"
import type { TraitFilter } from "@hoardodile/schemas/trait"
import { z } from "zod"

export const tagFilterMode = z.enum(["and", "or", "not", "nor"])

export const sortBy = z.enum(["created", "updated"])

export const sortOrder = z.enum(["asc", "desc"])

export type TagFilterMode = z.infer<typeof tagFilterMode>

export type SortBy = z.infer<typeof sortBy>

export type SortOrder = z.infer<typeof sortOrder>

/**
 * Generic paginated list query input shared by all list procedures.
 */
export type ListPageInput = {
	readonly query?: string
	readonly page?: number
	readonly size?: number
	/**
	 * Restrict results to rows whose `charIds` JSON array includes
	 * this id. Supported by the resource list procedures; a no-op
	 * on procedures that do not have a character association.
	 */
	readonly charId?: string
	/**
	 * When `true`, restrict results to rows that have **no** character
	 * associations. Mutually exclusive with {@link charId} - when both
	 * are set, `charId` takes precedence. Supported by the resource
	 * list procedures.
	 */
	readonly noCharacters?: boolean
	/**
	 * Restrict results to rows matching the given tags according to
	 * {@link tagMode}. Supported by the resource and character list procedures.
	 */
	readonly tagIds?: readonly string[]
	/**
	 * Controls how {@link tagIds} are matched:
	 * - `"and"` (default) - entity must carry **all** selected tags.
	 * - `"or"` - entity must carry **at least one** of the selected tags.
	 * - `"not"` - entity must carry **none** of the selected tags (NOT OR).
	 * - `"nor"` - entity carries **none** of the selected tags (NOR / !(A || B)).
	 */
	readonly tagMode?: TagFilterMode
	/**
	 * Column to sort by. Defaults to `"created"`.
	 * Ignored by procedures that do not implement dynamic sort.
	 */
	readonly sortBy?: SortBy
	/**
	 * Sort direction. Defaults to `"desc"`.
	 * Ignored by procedures that do not implement dynamic sort.
	 */
	readonly order?: SortOrder
	/**
	 * When true, results are returned in random order. Overrides
	 * {@link sortBy} and {@link order}. Ignored by procedures that do
	 * not implement random sort.
	 */
	readonly random?: boolean
	/**
	 * Per-trait filter clauses. Currently only honoured by character list
	 * procedures; ignored elsewhere. Multiple clauses combine with AND.
	 */
	readonly traitFilters?: readonly TraitFilter[]
	/**
	 * Restrict resource lists to resources owned by a single plugin.
	 * Honoured by the resource list procedures only.
	 */
	readonly contentPluginId?: PluginManifestId
	/**
	 * When set, restricts results to rows whose
	 * {@link SearchMeta.facets} contains at least one of the listed
	 * keys with a truthy value. OR semantics across keys. Honoured
	 * by the resource list procedures only.
	 */
	readonly searchMetaFacets?: Record<string, boolean>
	/**
	 * When true, the free-text {@link query} also matches the entity's
	 * `intro` / description, in addition to its `name`. Default is
	 * `false` (name-only). Honoured by character and resource list
	 * procedures.
	 */
	readonly searchIntro?: boolean
	/**
	 * Restrict character lists to rows that participate in **every**
	 * listed relationship type (as self or target). Ignored by
	 * non-character list procedures.
	 */
	readonly relationshipTypeIds?: readonly string[]
}

export type ListPageResult<T> = {
	readonly rows: readonly T[]
	readonly total: number
	readonly page: number
	readonly size: number
}
