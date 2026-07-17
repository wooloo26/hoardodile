import type {
	CoverMeta,
	FileStats,
	ResCard,
	Resource,
	SearchMeta,
	SourceMetaBase,
} from "@hoardodile/schemas"
import {
	coverMeta as coverMetaSchema,
	fileStats as fileStatsSchema,
	searchMeta as searchMetaSchema,
	sourceMetaBase,
} from "@hoardodile/schemas"
import type { SortBy, SortOrder, TagFilterMode } from "@hoardodile/shared"
import { produce } from "@hoardodile/shared/immer"
import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	inArray,
	isNotNull,
	isNull,
	not,
	or,
	sql,
} from "drizzle-orm"
import { omitBy } from "es-toolkit"
import { categories } from "src/domain/cat/schema.ts"
import { characters } from "src/domain/char/schema.ts"
import { resCollectionItems, resCollections } from "src/domain/col/schema.ts"
import { buildTagFilterClauses } from "src/domain/tag/filter.ts"
import { resTags, tags } from "src/domain/tag/schema.ts"
import {
	buildFindById,
	buildHydrate,
	buildRemove,
} from "src/infra/db/builders.ts"
import type { DbClient } from "src/infra/db/connection.ts"
import { likeContainsLower } from "./like.ts"
import { resCharacters, resourceMeta, resources } from "./schema.ts"

type ResourceCore = typeof resources.$inferSelect
type ResourceMetaRow = typeof resourceMeta.$inferSelect

/**
 * A resource row already hydrated with derived meta and join rows.
 * Consumers (service layer) treat this as the canonical DB row shape.
 */
export type ResRow = ResourceCore & {
	readonly coverMeta: string | null
	readonly sourceMeta: string | null
	readonly searchMeta: string | null
	readonly fileStats: string | null
	readonly tagIds: readonly string[]
	readonly charIds: readonly string[]
}

export type ResDbValues = {
	readonly name: string
	readonly intro: string
	readonly contentPluginId: string | null
	readonly tagIds: readonly string[]
	readonly charIds: readonly string[]
}

export type ResDbPatch = Partial<
	Pick<
		typeof resources.$inferInsert,
		| "name"
		| "intro"
		| "contentPluginId"
		| "deletedAt"
		| "updatedAt"
		| "coverVersion"
	>
>

export type ResMetaPatch = Partial<
	Pick<
		typeof resourceMeta.$inferInsert,
		"coverMeta" | "sourceMeta" | "searchMeta" | "fileStats"
	>
>

/**
 * Join updates. `undefined` means "leave alone"; an array (even empty)
 * means "replace the full set".
 */
export type ResJoinPatch = {
	readonly tagIds?: readonly string[]
	readonly charIds?: readonly string[]
}

export type ResListQuery = {
	readonly trashed: boolean
	readonly query: string | undefined
	readonly page: number
	readonly size: number
	readonly charId?: string
	readonly noCharacters?: boolean
	readonly tagIds?: readonly string[]
	readonly tagMode?: TagFilterMode
	readonly sortBy?: SortBy
	readonly order?: SortOrder
	readonly random?: boolean
	readonly contentPluginId?: string
	/**
	 * When set, restricts results to rows whose `searchMeta.facets`
	 * contains at least one of the listed keys with a truthy value.
	 * OR semantics across keys.
	 */
	readonly searchMetaFacets?: Record<string, boolean>
	/** When true, the free-text query also matches `intro`. Defaults to false (name-only). */
	readonly searchIntro?: boolean
}

export type ResRowPage = {
	readonly rows: readonly ResRow[]
	readonly total: number
}

/** Enriched row returned by {@link ResRepository.listCardPage}. */
export type ResCardRow = ResRow & {
	readonly pinnedTags: readonly {
		readonly id: string
		readonly name: string
		readonly color: string
	}[]
	readonly characters: readonly {
		readonly id: string
		readonly name: string
		readonly updatedAt: number
	}[]
	readonly collections: readonly {
		readonly id: string
		readonly name: string
		readonly color: string
	}[]
}

export type ResCardRowPage = {
	readonly rows: readonly ResCardRow[]
	readonly total: number
}

/**
 * Pure Drizzle query layer for the resource module. No file-system
 * operations; no domain business rules. The service layer calls these
 * functions and handles invariant enforcement, row-to-domain mapping, and
 * coordination with the file layer.
 */
export type ResRepository = {
	/** @throws {DomainError} NOT_FOUND when the row is missing. */
	findById(id: string): ResRow
	/** Like {@link findById} but also pre-computes `pinnedTags` + `characters`. */
	findCardById(id: string): ResCardRow
	listPage(query: ResListQuery): ResRowPage
	/**
	 * Like {@link listPage} but each row also carries pre-computed
	 * `pinnedTags` and `characters` - fetched in batch queries, not N+1.
	 * A tag is included when `tag.pinned = true` OR its `category.pinned = true`.
	 */
	listCardPage(query: ResListQuery): ResCardRowPage
	insert(id: string, values: ResDbValues, ts: number, fileVersion: number): void
	patch(id: string, fields: ResDbPatch, joins?: ResJoinPatch): void
	patchMeta(id: string, fields: ResMetaPatch, builtAt: number): void
	remove(id: string): void
	/** Set all rebuildable meta columns to NULL on every row. */
	clearAllMeta(): void
}

export function buildResourceRepository(client: DbClient): ResRepository {
	const findCoreById = buildFindById<ResourceCore>(
		client,
		resources,
		"resource",
	)
	const remove = buildRemove(client, resources)
	const attachTagIds = buildHydrate(
		client,
		resTags,
		resTags.resId,
		resTags.tagId,
		"tagIds" as const,
	)
	const attachCharacterIds = buildHydrate(
		client,
		resCharacters,
		resCharacters.resId,
		resCharacters.charId,
		"charIds" as const,
	)

	function mergeMeta(
		core: ResourceCore,
		meta: ResourceMetaRow | undefined,
	): Omit<ResRow, "tagIds" | "charIds"> {
		return {
			...core,
			coverMeta: meta?.coverMeta ?? null,
			sourceMeta: meta?.sourceMeta ?? null,
			searchMeta: meta?.searchMeta ?? null,
			fileStats: meta?.fileStats ?? null,
		}
	}

	function loadMetaByIds(ids: readonly string[]): Map<string, ResourceMetaRow> {
		if (ids.length === 0) return new Map()
		const rows = client
			.select()
			.from(resourceMeta)
			.where(inArray(resourceMeta.resourceId, ids))
			.all()
		return new Map(rows.map((row) => [row.resourceId, row]))
	}

	function hydrate(
		bareRows: readonly Omit<ResRow, "tagIds" | "charIds">[],
	): readonly ResRow[] {
		return attachCharacterIds(attachTagIds(bareRows)) as readonly ResRow[]
	}

	function findById(id: string): ResRow {
		const core = findCoreById(id)
		const meta = client
			.select()
			.from(resourceMeta)
			.where(eq(resourceMeta.resourceId, id))
			.get()
		const [hydrated] = hydrate([mergeMeta(core, meta)])
		return hydrated as ResRow
	}

	function buildWhere(q: ResListQuery) {
		const {
			trashed,
			query,
			charId,
			tagIds,
			contentPluginId,
			searchMetaFacets,
			searchIntro,
		} = q
		const noCharacters = q.noCharacters ?? false
		const tagMode = q.tagMode
		const lifecycle = trashed
			? isNotNull(resources.deletedAt)
			: isNull(resources.deletedAt)
		const clauses: Array<ReturnType<typeof and>> = [lifecycle]
		if (query !== undefined && query.length > 0) {
			const q =
				searchIntro === true
					? or(
							likeContainsLower(resources.name, query),
							likeContainsLower(resources.intro, query),
						)
					: likeContainsLower(resources.name, query)
			if (q !== undefined) clauses.push(q)
		}
		if (contentPluginId !== undefined) {
			clauses.push(eq(resources.contentPluginId, contentPluginId))
		}
		if (searchMetaFacets !== undefined) {
			const activeKeys = Object.entries(searchMetaFacets)
				.filter(([, v]) => v)
				.map(([k]) => k)
			if (activeKeys.length > 0) {
				const kindClauses = activeKeys.map(
					(key) =>
						sql`json_extract(${resourceMeta.searchMeta}, ${`$.facets.${key}`}) = 1`,
				)
				const combined = or(...kindClauses)
				if (combined !== undefined) {
					clauses.push(
						exists(
							client
								.select({ one: sql`1` })
								.from(resourceMeta)
								.where(
									and(eq(resourceMeta.resourceId, resources.id), combined),
								),
						),
					)
				}
			}
		}
		if (charId !== undefined) {
			clauses.push(
				exists(
					client
						.select({ one: sql`1` })
						.from(resCharacters)
						.where(
							and(
								eq(resCharacters.resId, resources.id),
								eq(resCharacters.charId, charId),
							),
						),
				),
			)
		} else if (noCharacters) {
			clauses.push(
				not(
					exists(
						client
							.select({ one: sql`1` })
							.from(resCharacters)
							.where(eq(resCharacters.resId, resources.id)),
					),
				),
			)
		}
		if (tagIds !== undefined && tagIds.length > 0) {
			clauses.push(
				...buildTagFilterClauses({
					db: client,
					entityIdColumn: resTags.resId,
					tagIdColumn: resTags.tagId,
					outerEntityIdColumn: resources.id,
					tagIds,
					tagMode,
				}),
			)
		}
		return clauses.length === 1 ? clauses[0] : and(...clauses)
	}

	function listPage(q: ResListQuery): ResRowPage {
		const where = buildWhere(q)
		const totalRow = client
			.select({ total: count() })
			.from(resources)
			.where(where)
			.get()
		const total = totalRow?.total ?? 0
		const orderClause =
			q.random === true
				? [sql`RANDOM()`]
				: (() => {
						const sortCol =
							(q.sortBy ?? "created") === "updated"
								? resources.updatedAt
								: resources.createdAt
						const sortDir = (q.order ?? "desc") === "asc" ? asc : desc
						return [sortDir(sortCol), desc(resources.id)]
					})()
		const coreRows = client
			.select()
			.from(resources)
			.where(where)
			.orderBy(...orderClause)
			.limit(q.size)
			.offset((q.page - 1) * q.size)
			.all()
		const metaById = loadMetaByIds(coreRows.map((row) => row.id))
		const bareRows = coreRows.map((core) =>
			mergeMeta(core, metaById.get(core.id)),
		)
		return { rows: hydrate(bareRows), total }
	}

	/**
	 * Returns the same page as {@link listPage} but each row is enriched with
	 * pre-computed `pinnedTags` and `characters`. Both are fetched in single
	 * batch queries - O(page_size + tags_on_page + chars_on_page), not O(N).
	 */
	function listCardPage(q: ResListQuery): ResCardRowPage {
		const { rows, total } = listPage(q)
		if (rows.length === 0) return { rows: [], total }
		const ids = rows.map((r) => r.id)

		const pinnedRows = client
			.select({
				resId: resTags.resId,
				tagId: tags.id,
				tagName: tags.name,
				tagColor: sql<string>`COALESCE(NULLIF(${tags.color}, ''), NULLIF(${categories.color}, ''), '')`,
			})
			.from(resTags)
			.innerJoin(tags, eq(resTags.tagId, tags.id))
			.leftJoin(categories, eq(tags.catId, categories.id))
			.where(
				and(
					inArray(resTags.resId, ids),
					or(eq(tags.pinned, true), eq(categories.pinned, true)),
				),
			)
			.orderBy(sql`COALESCE(${categories.position}, 2147483647)`, tags.position)
			.all()

		const pinnedByResource = new Map<
			string,
			Array<{ id: string; name: string; color: string }>
		>()
		for (const r of pinnedRows) {
			let list = pinnedByResource.get(r.resId)
			if (list === undefined) {
				list = []
				pinnedByResource.set(r.resId, list)
			}
			list.push({ id: r.tagId, name: r.tagName, color: r.tagColor })
		}

		const charRows = client
			.select({
				resId: resCharacters.resId,
				charId: characters.id,
				charName: characters.name,
				charUpdatedAt: characters.updatedAt,
			})
			.from(resCharacters)
			.innerJoin(characters, eq(resCharacters.charId, characters.id))
			.where(inArray(resCharacters.resId, ids))
			.all()

		const charsByResource = new Map<
			string,
			Array<{ id: string; name: string; updatedAt: number }>
		>()
		for (const r of charRows) {
			let list = charsByResource.get(r.resId)
			if (list === undefined) {
				list = []
				charsByResource.set(r.resId, list)
			}
			list.push({ id: r.charId, name: r.charName, updatedAt: r.charUpdatedAt })
		}

		const colRows = client
			.select({
				resId: resCollectionItems.resId,
				colId: resCollections.id,
				name: resCollections.name,
				color: resCollections.color,
			})
			.from(resCollectionItems)
			.innerJoin(
				resCollections,
				eq(resCollectionItems.colId, resCollections.id),
			)
			.where(inArray(resCollectionItems.resId, ids))
			.orderBy(
				desc(resCollections.pinned),
				asc(resCollections.position),
				asc(resCollections.name),
			)
			.all()
		const colsByResource = new Map<
			string,
			Array<{ id: string; name: string; color: string }>
		>()
		for (const r of colRows) {
			let list = colsByResource.get(r.resId)
			if (list === undefined) {
				list = []
				colsByResource.set(r.resId, list)
			}
			list.push({ id: r.colId, name: r.name, color: r.color })
		}

		const cardRows: readonly ResCardRow[] = rows.map((row) => ({
			...row,
			pinnedTags: pinnedByResource.get(row.id) ?? [],
			characters: charsByResource.get(row.id) ?? [],
			collections: colsByResource.get(row.id) ?? [],
		}))
		return { rows: cardRows, total }
	}

	function findCardById(id: string): ResCardRow {
		const base = findById(id)
		const pinnedTags = client
			.select({
				id: tags.id,
				name: tags.name,
				color: sql<string>`COALESCE(NULLIF(${tags.color}, ''), NULLIF(${categories.color}, ''), '')`,
			})
			.from(resTags)
			.innerJoin(tags, eq(resTags.tagId, tags.id))
			.leftJoin(categories, eq(tags.catId, categories.id))
			.where(
				and(
					eq(resTags.resId, id),
					or(eq(tags.pinned, true), eq(categories.pinned, true)),
				),
			)
			.orderBy(sql`COALESCE(${categories.position}, 2147483647)`, tags.position)
			.all()
		const charRows = client
			.select({
				id: characters.id,
				name: characters.name,
				updatedAt: characters.updatedAt,
			})
			.from(resCharacters)
			.innerJoin(characters, eq(resCharacters.charId, characters.id))
			.where(eq(resCharacters.resId, id))
			.all()
		const colsList = client
			.select({
				id: resCollections.id,
				name: resCollections.name,
				color: resCollections.color,
			})
			.from(resCollectionItems)
			.innerJoin(
				resCollections,
				eq(resCollectionItems.colId, resCollections.id),
			)
			.where(eq(resCollectionItems.resId, id))
			.orderBy(
				desc(resCollections.pinned),
				asc(resCollections.position),
				asc(resCollections.name),
			)
			.all()
		return {
			...base,
			pinnedTags,
			characters: charRows,
			collections: colsList,
		}
	}

	function insert(
		id: string,
		values: ResDbValues,
		ts: number,
		fileVersion: number,
	): void {
		client.transaction((tx) => {
			tx.insert(resources)
				.values({
					id,
					name: values.name,
					intro: values.intro,
					contentPluginId: values.contentPluginId,
					fileVersion,
					coverVersion: fileVersion,
					createdAt: ts,
					updatedAt: ts,
				})
				.run()
			for (const tagId of values.tagIds) {
				tx.insert(resTags).values({ resId: id, tagId }).run()
			}
			for (const charId of values.charIds) {
				tx.insert(resCharacters).values({ resId: id, charId }).run()
			}
		})
	}

	function patch(id: string, fields: ResDbPatch, joins?: ResJoinPatch): void {
		client.transaction((tx) => {
			if (Object.keys(fields).length > 0) {
				tx.update(resources).set(fields).where(eq(resources.id, id)).run()
			}
			if (joins?.tagIds !== undefined) {
				tx.delete(resTags).where(eq(resTags.resId, id)).run()
				for (const tagId of joins.tagIds) {
					tx.insert(resTags).values({ resId: id, tagId }).run()
				}
			}
			if (joins?.charIds !== undefined) {
				tx.delete(resCharacters).where(eq(resCharacters.resId, id)).run()
				for (const charId of joins.charIds) {
					tx.insert(resCharacters).values({ resId: id, charId }).run()
				}
			}
		})
	}

	function patchMeta(id: string, fields: ResMetaPatch, builtAt: number): void {
		findCoreById(id)
		const existing = client
			.select()
			.from(resourceMeta)
			.where(eq(resourceMeta.resourceId, id))
			.get()
		if (existing === undefined) {
			client
				.insert(resourceMeta)
				.values({
					resourceId: id,
					coverMeta: fields.coverMeta ?? null,
					sourceMeta: fields.sourceMeta ?? null,
					searchMeta: fields.searchMeta ?? null,
					fileStats: fields.fileStats ?? null,
					builtAt,
				})
				.run()
			return
		}
		const next = {
			...(fields.coverMeta !== undefined
				? { coverMeta: fields.coverMeta }
				: {}),
			...(fields.sourceMeta !== undefined
				? { sourceMeta: fields.sourceMeta }
				: {}),
			...(fields.searchMeta !== undefined
				? { searchMeta: fields.searchMeta }
				: {}),
			...(fields.fileStats !== undefined
				? { fileStats: fields.fileStats }
				: {}),
			builtAt,
		}
		if (Object.keys(next).length === 1) return
		client
			.update(resourceMeta)
			.set(next)
			.where(eq(resourceMeta.resourceId, id))
			.run()
	}

	function clearAllMeta(): void {
		const ts = Date.now()
		client
			.update(resourceMeta)
			.set({
				fileStats: null,
				sourceMeta: null,
				searchMeta: null,
				coverMeta: null,
				builtAt: ts,
			})
			.run()
	}

	return {
		findById,
		findCardById,
		listPage,
		listCardPage,
		insert,
		patch,
		patchMeta,
		remove,
		clearAllMeta,
	}
}

export function rowToResource(row: ResRow): Resource {
	const base: Resource = {
		id: row.id,
		name: row.name,
		intro: row.intro,
		contentPluginId: row.contentPluginId,
		tagIds: [...row.tagIds],
		charIds: [...row.charIds],
		coverVersion: row.coverVersion,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
	const coverMetaPart = parseCoverMeta(row.coverMeta)
	const fileStatsPart = parseFileStats(row.fileStats)
	const sourceMetaPart = parseSourceMeta(row.sourceMeta)
	const searchMetaPart = parseSearchMeta(row.searchMeta)
	return produce(base, (draft) => {
		if (coverMetaPart !== undefined) draft.coverMeta = coverMetaPart
		if (fileStatsPart !== undefined) draft.fileStats = fileStatsPart
		if (sourceMetaPart !== undefined) draft.sourceMeta = sourceMetaPart
		if (searchMetaPart !== undefined) draft.searchMeta = searchMetaPart
		if (row.deletedAt !== null) draft.deletedAt = row.deletedAt
	})
}

export function rowToResourceCard(row: ResCardRow): ResCard {
	return {
		...rowToResource(row),
		pinnedTags: [...row.pinnedTags],
		characters: [...row.characters],
		collections: [...row.collections],
	}
}

export function parseCoverMeta(raw: string | null): CoverMeta | undefined {
	return parseJsonColumn(raw, coverMetaSchema.safeParse.bind(coverMetaSchema))
}

export function parseFileStats(raw: string | null): FileStats | undefined {
	return parseJsonColumn(raw, fileStatsSchema.safeParse.bind(fileStatsSchema))
}

export function parseSourceMeta(
	raw: string | null,
): SourceMetaBase | undefined {
	return parseJsonColumn(raw, sourceMetaBase.safeParse.bind(sourceMetaBase))
}

export function parseSearchMeta(raw: string | null): SearchMeta | undefined {
	return parseJsonColumn(raw, searchMetaSchema.safeParse.bind(searchMetaSchema))
}

export function stripUndefined<T extends object>(o: T): T {
	return omitBy(o, (v: unknown) => v === undefined) as T
}

type SafeParse<T> = (
	input: unknown,
) => { readonly success: true; readonly data: T } | { readonly success: false }

function parseJsonColumn<T>(
	raw: string | null,
	safeParse: SafeParse<T>,
): T | undefined {
	if (raw === null) return undefined
	try {
		const parsed: unknown = JSON.parse(raw)
		const result = safeParse(parsed)
		return result.success ? result.data : undefined
	} catch {
		return undefined
	}
}
