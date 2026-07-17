import {
	MAX_PAGE_SIZE,
	MAX_SEARCH_QUERY_LENGTH,
} from "@hoardodile/consts/text-limits"
import { pluginManifestId, traitFilter } from "@hoardodile/schemas"
import { sortBy, sortOrder, tagFilterMode } from "@hoardodile/shared"
import { z } from "zod"

export const idInput = z.object({ id: z.string().min(1) })

/** Batch resource deletes; `max` matches {@link listInput} page size cap. */
export const resourceIdsInput = z.object({
	ids: z.array(z.string().min(1)).min(1).max(MAX_PAGE_SIZE),
})

/**
 * Input for "force delete" procedures (tag, category, trait). Requires
 * both the entity id and its current name as a confirmation token; the
 * service rejects the call if the names do not match, guarding against
 * stale UI references after a rename.
 */
export const forceDeleteInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
})

/**
 * Input for tag attach/detach procedures. `entityId` is the resource or
 * character id; the entity kind is encoded in the procedure name
 * (`attachToResource` vs `attachToCharacter`).
 */
export const tagAttachmentInput = z.object({
	entityId: z.string().min(1),
	tagId: z.string().min(1),
})

export const listInput = z
	.object({
		query: z.string().max(MAX_SEARCH_QUERY_LENGTH).optional(),
		page: z.number().int().positive().optional(),
		size: z.number().int().positive().max(MAX_PAGE_SIZE).optional(),
		charId: z.string().min(1).optional(),
		noCharacters: z.boolean().optional(),
		tagIds: z.array(z.string().min(1)).optional(),
		tagMode: tagFilterMode.optional(),
		sortBy: sortBy.optional(),
		order: sortOrder.optional(),
		random: z.boolean().optional(),
		traitFilters: z.array(traitFilter).optional(),
		contentPluginId: pluginManifestId.optional(),
		searchMetaFacets: z.record(z.string(), z.boolean()).optional(),
		searchIntro: z.boolean().optional(),
		relationshipTypeIds: z.array(z.string().min(1)).optional(),
	})
	.default({})
