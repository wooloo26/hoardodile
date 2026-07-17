import type {
	EntityMetaCreateInput,
	EntityMetaUpdateInput,
	Tag,
} from "@hoardodile/schemas"
import { conflict } from "@hoardodile/shared"
import { and, eq, inArray } from "drizzle-orm"
import { characters } from "src/domain/char/schema.ts"
import { resources } from "src/domain/res/schema.ts"
import { type DbClient, withTransaction } from "src/infra/db/connection.ts"
import {
	buildEntityMetaPatch,
	buildForceDelete,
	buildMaxPosition,
	buildReorder,
	type DbServiceDeps,
	resolveClock,
	resolveEntityMetaInsert,
	wrapAsync,
} from "src/infra/service.ts"
import { buildTagRepository, type TagDbPatch, type TagRow } from "./repo.ts"
import { charTags, resTags } from "./schema.ts"

export type TagServiceDeps = DbServiceDeps

export type TagCreateInput = EntityMetaCreateInput & {
	readonly catId: string
}

export type TagUpdateInput = EntityMetaUpdateInput & {
	readonly catId?: string
}

export type TagWithCounts = Tag & {
	readonly resCount: number
	readonly charCount: number
}

/**
 * Behaviour contract for the tag module. Tags are hard-deleted only (no
 * soft-delete). Attach/detach operations are idempotent.
 */
export type TagService = {
	listAll(): Promise<readonly Tag[]>
	listAllWithCounts(): Promise<readonly TagWithCounts[]>
	detail(id: string): Promise<Tag>
	create(input: TagCreateInput): Promise<Tag>
	update(input: TagUpdateInput): Promise<Tag>
	reorder(catId: string, ids: readonly string[]): Promise<void>
	delete(id: string): Promise<void>
	forceDelete(id: string, confirmName: string): Promise<void>

	listForResource(resId: string): Promise<readonly Tag[]>
	attachToResource(resId: string, tagId: string): Promise<void>
	detachFromResource(resId: string, tagId: string): Promise<void>
	bulkAttachToResource(ids: readonly string[], tagId: string): Promise<void>
	bulkDetachFromResource(ids: readonly string[], tagId: string): Promise<void>

	listForCharacter(charId: string): Promise<readonly Tag[]>
	attachToCharacter(charId: string, tagId: string): Promise<void>
	detachFromCharacter(charId: string, tagId: string): Promise<void>
	bulkAttachToCharacter(ids: readonly string[], tagId: string): Promise<void>
	bulkDetachFromCharacter(ids: readonly string[], tagId: string): Promise<void>
}

export function createTagService(deps: TagServiceDeps): TagService {
	const repo = buildTagRepository(deps.db)
	const { now, newId } = resolveClock(deps)

	function listAll(): readonly Tag[] {
		return repo.listAll().map(rowToTag)
	}

	function listAllWithCounts(): readonly TagWithCounts[] {
		const resCounts = repo.resUsageCounts()
		const charCounts = repo.charUsageCounts()
		return repo.listAll().map((row) => ({
			...rowToTag(row),
			resCount: resCounts.get(row.id) ?? 0,
			charCount: charCounts.get(row.id) ?? 0,
		}))
	}

	function detail(id: string): Tag {
		return rowToTag(repo.findById(id))
	}

	function maxPositionForCatId(catId: string): number {
		return buildMaxPosition(repo.listAll, (t) => t.catId === catId)()
	}

	function create(input: TagCreateInput): Tag {
		const id = newId()
		const ts = now()
		const meta = resolveEntityMetaInsert(
			input,
			maxPositionForCatId(input.catId),
		)
		repo.insert(
			id,
			{
				name: input.name,
				...meta,
				catId: input.catId,
			},
			ts,
		)
		return rowToTag(repo.findById(id))
	}

	function update(input: TagUpdateInput): Tag {
		repo.findById(input.id)
		const patch: TagDbPatch = {
			...buildEntityMetaPatch(input, now()),
			...(input.catId !== undefined ? { catId: input.catId } : {}),
		}
		repo.patch(input.id, patch)
		return rowToTag(repo.findById(input.id))
	}

	function reorder(catId: string, ids: readonly string[]): void {
		buildReorder<TagRow>({
			entity: "tag",
			listAll: repo.listAll,
			patch: repo.patch,
			now,
			filter: (t) => t.catId === catId,
			filterMeta: { catId },
		})(ids)
	}

	function deleteTag(id: string): void {
		repo.findById(id)
		assertNoUsages(id)
		repo.remove(id)
	}

	function forceDelete(id: string, confirmName: string): void {
		buildForceDelete({
			entity: "tag",
			findById: repo.findById,
			remove: repo.remove,
		})(id, confirmName)
	}

	function assertNoUsages(tagId: string): void {
		const resources = repo.countResourceUsages(tagId)
		const characters = repo.countCharacterUsages(tagId)
		if (resources > 0 || characters > 0) {
			throw conflict(
				"tag.has_dependencies",
				`tag ${tagId} is in use (${resources} resource(s), ${characters} character(s))`,
				{ id: tagId, resources, characters },
			)
		}
	}

	function touchResource(client: DbClient, resId: string): void {
		client
			.update(resources)
			.set({ updatedAt: now() })
			.where(eq(resources.id, resId))
			.run()
	}

	function touchCharacter(client: DbClient, charId: string): void {
		client
			.update(characters)
			.set({ updatedAt: now() })
			.where(eq(characters.id, charId))
			.run()
	}

	function attachToResource(resId: string, tagId: string): void {
		withTransaction(deps.db, (tx) => {
			tx.insert(resTags).values({ resId, tagId }).onConflictDoNothing().run()
			touchResource(tx, resId)
		})
	}

	function detachFromResource(resId: string, tagId: string): void {
		withTransaction(deps.db, (tx) => {
			tx.delete(resTags)
				.where(and(eq(resTags.resId, resId), eq(resTags.tagId, tagId)))
				.run()
			touchResource(tx, resId)
		})
	}

	function bulkAttachToResource(ids: readonly string[], tagId: string): void {
		if (ids.length === 0) return
		withTransaction(deps.db, (tx) => {
			tx.insert(resTags)
				.values(ids.map((resId) => ({ resId, tagId })))
				.onConflictDoNothing()
				.run()
			tx.update(resources)
				.set({ updatedAt: now() })
				.where(inArray(resources.id, ids))
				.run()
		})
	}

	function bulkDetachFromResource(ids: readonly string[], tagId: string): void {
		if (ids.length === 0) return
		withTransaction(deps.db, (tx) => {
			tx.delete(resTags)
				.where(and(inArray(resTags.resId, ids), eq(resTags.tagId, tagId)))
				.run()
			tx.update(resources)
				.set({ updatedAt: now() })
				.where(inArray(resources.id, ids))
				.run()
		})
	}

	function attachToCharacter(charId: string, tagId: string): void {
		withTransaction(deps.db, (tx) => {
			tx.insert(charTags).values({ charId, tagId }).onConflictDoNothing().run()
			touchCharacter(tx, charId)
		})
	}

	function detachFromCharacter(charId: string, tagId: string): void {
		withTransaction(deps.db, (tx) => {
			tx.delete(charTags)
				.where(and(eq(charTags.charId, charId), eq(charTags.tagId, tagId)))
				.run()
			touchCharacter(tx, charId)
		})
	}

	function bulkAttachToCharacter(ids: readonly string[], tagId: string): void {
		if (ids.length === 0) return
		withTransaction(deps.db, (tx) => {
			tx.insert(charTags)
				.values(ids.map((charId) => ({ charId, tagId })))
				.onConflictDoNothing()
				.run()
			tx.update(characters)
				.set({ updatedAt: now() })
				.where(inArray(characters.id, ids))
				.run()
		})
	}

	function bulkDetachFromCharacter(
		ids: readonly string[],
		tagId: string,
	): void {
		if (ids.length === 0) return
		withTransaction(deps.db, (tx) => {
			tx.delete(charTags)
				.where(and(inArray(charTags.charId, ids), eq(charTags.tagId, tagId)))
				.run()
			tx.update(characters)
				.set({ updatedAt: now() })
				.where(inArray(characters.id, ids))
				.run()
		})
	}

	const asyncOps = wrapAsync({
		listAll,
		listAllWithCounts,
		detail,
		create,
		update,
		reorder,
		delete: deleteTag,
		forceDelete,
		attachToResource,
		detachFromResource,
		attachToCharacter,
		detachFromCharacter,
	})
	return {
		...asyncOps,
		bulkAttachToResource: async (ids, tagId) =>
			bulkAttachToResource(ids, tagId),
		bulkDetachFromResource: async (ids, tagId) =>
			bulkDetachFromResource(ids, tagId),
		bulkAttachToCharacter: async (ids, tagId) =>
			bulkAttachToCharacter(ids, tagId),
		bulkDetachFromCharacter: async (ids, tagId) =>
			bulkDetachFromCharacter(ids, tagId),
		listForResource: async (id) => repo.listForResource(id).map(rowToTag),
		listForCharacter: async (id) => repo.listForCharacter(id).map(rowToTag),
	}
}

function rowToTag(row: TagRow): Tag {
	return {
		id: row.id,
		name: row.name,
		intro: row.intro,
		color: row.color,
		position: row.position,
		pinned: row.pinned,
		catId: row.catId!,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}
