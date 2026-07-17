import type { SortBy, SortOrder, TagFilterMode } from "@hoardodile/shared"
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
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import { categories } from "src/domain/cat/schema.ts"
import { likeContainsLower } from "src/domain/res/like.ts"
import { buildTagFilterClauses } from "src/domain/tag/filter.ts"
import { charTags, tags } from "src/domain/tag/schema.ts"
import {
	buildFindById,
	buildHydrate,
	buildRemove,
} from "src/infra/db/builders.ts"
import type { DbClient } from "src/infra/db/connection.ts"
import { characters, characterships, relationshipTypes } from "./schema.ts"

type CharCardRelation = {
	id: string
	name: string
	labels: string[]
	color: string
	updatedAt: number
}

function mergeCharCardRelation(
	map: Map<string, CharCardRelation>,
	entry: {
		readonly id: string
		readonly name: string
		readonly label: string
		readonly typeColor: string
		readonly updatedAt: number
	},
): void {
	const label = entry.label
	if (label.length === 0) return
	const existing = map.get(entry.id)
	if (existing === undefined) {
		map.set(entry.id, {
			id: entry.id,
			name: entry.name,
			labels: [label],
			color: entry.typeColor,
			updatedAt: entry.updatedAt,
		})
		return
	}
	if (!existing.labels.includes(label)) {
		existing.labels.push(label)
	}
	if (existing.color.length === 0 && entry.typeColor.length > 0) {
		existing.color = entry.typeColor
	}
	if (entry.updatedAt > existing.updatedAt) {
		existing.updatedAt = entry.updatedAt
	}
}

function mergeCharCardRelationInList(
	list: CharCardRelation[],
	entry: {
		readonly id: string
		readonly name: string
		readonly label: string
		readonly typeColor: string
		readonly updatedAt: number
	},
): void {
	const label = entry.label
	if (label.length === 0) return
	const existing = list.find((item) => item.id === entry.id)
	if (existing === undefined) {
		list.push({
			id: entry.id,
			name: entry.name,
			labels: [label],
			color: entry.typeColor,
			updatedAt: entry.updatedAt,
		})
		return
	}
	if (!existing.labels.includes(label)) {
		existing.labels.push(label)
	}
	if (existing.color.length === 0 && entry.typeColor.length > 0) {
		existing.color = entry.typeColor
	}
	if (entry.updatedAt > existing.updatedAt) {
		existing.updatedAt = entry.updatedAt
	}
}

type CharColumns = typeof characters.$inferSelect

/**
 * A character row already hydrated with its tag join rows. Consumers
 * (service layer) treat this as the canonical DB row shape.
 */
export type CharRow = CharColumns & {
	readonly tagIds: readonly string[]
}

/** Enriched row returned by {@link CharRepository.listCardPage}. */
export type CharCardRow = CharRow & {
	readonly pinnedTags: readonly {
		readonly id: string
		readonly name: string
		readonly color: string
	}[]
	readonly relations: readonly {
		readonly id: string
		readonly name: string
		readonly labels: readonly string[]
		readonly color: string
		readonly updatedAt: number
	}[]
}

export type CharDbValues = {
	readonly name: string
	readonly intro: string
	readonly traitValues: string
	readonly tagIds: readonly string[]
}

export type CharDbPatch = Partial<
	Pick<
		typeof characters.$inferInsert,
		| "name"
		| "intro"
		| "traitValues"
		| "deletedAt"
		| "updatedAt"
		| "avatarVersion"
		| "fullbodyVersion"
	>
>

/**
 * Join updates. `undefined` means "leave alone"; an array (even empty)
 * means "replace the full set".
 */
export type CharJoinPatch = {
	readonly tagIds?: readonly string[]
}

export type CharListQuery = {
	readonly trashed: boolean
	readonly query: string | undefined
	readonly page: number
	readonly size: number
	readonly tagIds?: readonly string[]
	readonly tagMode?: TagFilterMode
	readonly sortBy?: SortBy
	readonly order?: SortOrder
	readonly random?: boolean
	/** When true, the free-text query also matches `intro`. Defaults to false (name-only). */
	readonly searchIntro?: boolean
	readonly relationshipTypeIds?: readonly string[]
}

export type CharRowPage = {
	readonly rows: readonly CharRow[]
	readonly total: number
}

export type CharCardRowPage = {
	readonly rows: readonly CharCardRow[]
	readonly total: number
}

/**
 * Pure Drizzle query layer for the character module. No file-system
 * operations; no domain business rules.
 */
export type CharRepository = {
	/** @throws {DomainError} NOT_FOUND when the row is missing. */
	findById(id: string): CharRow
	/** Like {@link findById} but also fetches pinned tags. */
	findCardById(id: string): CharCardRow
	listPage(query: CharListQuery): CharRowPage
	/**
	 * Like {@link listPage} but each row also carries pre-computed
	 * `pinnedTags` - fetched in one extra batch query, not N+1.
	 */
	listCardPage(query: CharListQuery): CharCardRowPage
	insert(
		id: string,
		values: CharDbValues,
		ts: number,
		fileVersion: number,
	): void
	patch(id: string, fields: CharDbPatch, joins?: CharJoinPatch): void
	remove(id: string): void
}

export function buildCharacterRepository(client: DbClient): CharRepository {
	const findBareById = buildFindById<CharColumns>(
		client,
		characters,
		"character",
	)
	const remove = buildRemove(client, characters)
	const attachTagIds = buildHydrate(
		client,
		charTags,
		charTags.charId,
		charTags.tagId,
		"tagIds" as const,
	)

	function hydrate(bareRows: readonly CharColumns[]): readonly CharRow[] {
		return attachTagIds(bareRows) as readonly CharRow[]
	}

	function findById(id: string): CharRow {
		const row = findBareById(id)
		const [hydrated] = hydrate([row])
		return hydrated as CharRow
	}

	function findCardById(id: string): CharCardRow {
		const base = findById(id)
		const pinnedTags = client
			.select({
				id: tags.id,
				name: tags.name,
				color: sql<string>`COALESCE(NULLIF(${tags.color}, ''), NULLIF(${categories.color}, ''), '')`,
			})
			.from(charTags)
			.innerJoin(tags, eq(charTags.tagId, tags.id))
			.leftJoin(categories, eq(tags.catId, categories.id))
			.where(
				and(
					eq(charTags.charId, id),
					or(eq(tags.pinned, true), eq(categories.pinned, true)),
				),
			)
			.orderBy(sql`COALESCE(${categories.position}, 2147483647)`, tags.position)
			.all()
		const relationsSelf = client
			.select({
				id: characters.id,
				name: characters.name,
				label: relationshipTypes.targetLabel,
				typeColor: relationshipTypes.color,
				updatedAt: characters.updatedAt,
			})
			.from(characterships)
			.innerJoin(characters, eq(characterships.targetId, characters.id))
			.innerJoin(
				relationshipTypes,
				eq(characterships.typeId, relationshipTypes.id),
			)
			.where(
				and(eq(characterships.selfId, id), eq(relationshipTypes.pinned, true)),
			)
			.all()
		const relationsTarget = client
			.select({
				id: characters.id,
				name: characters.name,
				label: relationshipTypes.selfLabel,
				typeColor: relationshipTypes.color,
				updatedAt: characters.updatedAt,
			})
			.from(characterships)
			.innerJoin(characters, eq(characterships.selfId, characters.id))
			.innerJoin(
				relationshipTypes,
				eq(characterships.typeId, relationshipTypes.id),
			)
			.where(
				and(
					eq(characterships.targetId, id),
					eq(relationshipTypes.pinned, true),
				),
			)
			.all()
		const relationsByCharacter = new Map<string, CharCardRelation>()
		for (const r of [...relationsSelf, ...relationsTarget]) {
			mergeCharCardRelation(relationsByCharacter, r)
		}
		const relations = [...relationsByCharacter.values()]
		return { ...base, pinnedTags, relations }
	}

	function buildWhere(q: CharListQuery) {
		const clauses: SQL[] = []
		clauses.push(
			q.trashed
				? isNotNull(characters.deletedAt)
				: isNull(characters.deletedAt),
		)
		if (q.query !== undefined && q.query.length > 0) {
			const match =
				q.searchIntro === true
					? or(
							likeContainsLower(characters.name, q.query),
							likeContainsLower(characters.intro, q.query),
						)
					: likeContainsLower(characters.name, q.query)
			if (match !== undefined) clauses.push(match)
		}
		if (q.tagIds !== undefined && q.tagIds.length > 0) {
			clauses.push(
				...buildTagFilterClauses({
					db: client,
					entityIdColumn: charTags.charId,
					tagIdColumn: charTags.tagId,
					outerEntityIdColumn: characters.id,
					tagIds: q.tagIds,
					tagMode: q.tagMode,
				}),
			)
		}
		if (
			q.relationshipTypeIds !== undefined &&
			q.relationshipTypeIds.length > 0
		) {
			for (const typeId of q.relationshipTypeIds) {
				clauses.push(
					exists(
						client
							.select({ one: sql`1` })
							.from(characterships)
							.where(
								and(
									eq(characterships.typeId, typeId),
									or(
										eq(characterships.selfId, characters.id),
										eq(characterships.targetId, characters.id),
									),
								),
							),
					),
				)
			}
		}
		return and(...clauses)
	}

	function listPage(q: CharListQuery): CharRowPage {
		const where = buildWhere(q)
		const totalRow = client
			.select({ total: count() })
			.from(characters)
			.where(where)
			.get()
		const total = totalRow?.total ?? 0
		const orderClause =
			q.random === true
				? [sql`RANDOM()`]
				: (() => {
						const sortCol =
							(q.sortBy ?? "created") === "updated"
								? characters.updatedAt
								: characters.createdAt
						const sortDir = (q.order ?? "desc") === "asc" ? asc : desc
						return [sortDir(sortCol), desc(characters.id)]
					})()
		const bareRows = client
			.select()
			.from(characters)
			.where(where)
			.orderBy(...orderClause)
			.limit(q.size)
			.offset((q.page - 1) * q.size)
			.all()
		return { rows: hydrate(bareRows), total }
	}

	/**
	 * Returns the same page as {@link listPage} but each row is enriched with
	 * its pinned tags and relations. Pinned tags and relations are fetched in
	 * batch queries - O(page_size + tags_on_page + relations_on_page), not O(N) round-trips.
	 * A tag is included when `tag.pinned = true` OR its `category.pinned = true`.
	 * Tag color is resolved: tag.color → category.color → "".
	 * Rows are ordered by (category.position ASC, tag.position ASC).
	 */
	function listCardPage(q: CharListQuery): CharCardRowPage {
		const { rows, total } = listPage(q)
		if (rows.length === 0) return { rows: [], total }
		const ids = rows.map((r) => r.id)
		const pinnedRows = client
			.select({
				charId: charTags.charId,
				tagId: tags.id,
				tagName: tags.name,
				tagColor: sql<string>`COALESCE(NULLIF(${tags.color}, ''), NULLIF(${categories.color}, ''), '')`,
			})
			.from(charTags)
			.innerJoin(tags, eq(charTags.tagId, tags.id))
			.leftJoin(categories, eq(tags.catId, categories.id))
			.where(
				and(
					inArray(charTags.charId, ids),
					or(eq(tags.pinned, true), eq(categories.pinned, true)),
				),
			)
			.orderBy(sql`COALESCE(${categories.position}, 2147483647)`, tags.position)
			.all()
		const pinnedByCharacter = new Map<
			string,
			Array<{ id: string; name: string; color: string }>
		>()
		for (const r of pinnedRows) {
			let list = pinnedByCharacter.get(r.charId)
			if (list === undefined) {
				list = []
				pinnedByCharacter.set(r.charId, list)
			}
			list.push({ id: r.tagId, name: r.tagName, color: r.tagColor })
		}
		// Batch-fetch relations in both directions; deduplicate per character.
		const relationsSelf = client
			.select({
				charId: characterships.selfId,
				relatedId: characters.id,
				relatedName: characters.name,
				relatedLabel: relationshipTypes.targetLabel,
				typeColor: relationshipTypes.color,
				relatedUpdatedAt: characters.updatedAt,
			})
			.from(characterships)
			.innerJoin(characters, eq(characterships.targetId, characters.id))
			.innerJoin(
				relationshipTypes,
				eq(characterships.typeId, relationshipTypes.id),
			)
			.where(
				and(
					inArray(characterships.selfId, ids),
					eq(relationshipTypes.pinned, true),
				),
			)
			.all()
		const relationsTarget = client
			.select({
				charId: characterships.targetId,
				relatedId: characters.id,
				relatedName: characters.name,
				relatedLabel: relationshipTypes.selfLabel,
				typeColor: relationshipTypes.color,
				relatedUpdatedAt: characters.updatedAt,
			})
			.from(characterships)
			.innerJoin(characters, eq(characterships.selfId, characters.id))
			.innerJoin(
				relationshipTypes,
				eq(characterships.typeId, relationshipTypes.id),
			)
			.where(
				and(
					inArray(characterships.targetId, ids),
					eq(relationshipTypes.pinned, true),
				),
			)
			.all()
		const relationsByCharacter = new Map<string, CharCardRelation[]>()
		for (const r of [...relationsSelf, ...relationsTarget]) {
			if (r.charId === null) continue
			let list = relationsByCharacter.get(r.charId)
			if (list === undefined) {
				list = []
				relationsByCharacter.set(r.charId, list)
			}
			mergeCharCardRelationInList(list, {
				id: r.relatedId,
				name: r.relatedName,
				label: r.relatedLabel,
				typeColor: r.typeColor,
				updatedAt: r.relatedUpdatedAt,
			})
		}
		const cardRows: readonly CharCardRow[] = rows.map((row) => ({
			...row,
			pinnedTags: pinnedByCharacter.get(row.id) ?? [],
			relations: relationsByCharacter.get(row.id) ?? [],
		}))
		return { rows: cardRows, total }
	}

	function insert(
		id: string,
		values: CharDbValues,
		ts: number,
		fileVersion: number,
	): void {
		client.transaction((tx) => {
			tx.insert(characters)
				.values({
					id,
					name: values.name,
					intro: values.intro,
					traitValues: values.traitValues,
					avatarVersion: fileVersion,
					fullbodyVersion: fileVersion,
					createdAt: ts,
					updatedAt: ts,
				})
				.run()
			for (const tagId of values.tagIds) {
				tx.insert(charTags).values({ charId: id, tagId }).run()
			}
		})
	}

	function patch(id: string, fields: CharDbPatch, joins?: CharJoinPatch): void {
		client.transaction((tx) => {
			if (Object.keys(fields).length > 0) {
				tx.update(characters).set(fields).where(eq(characters.id, id)).run()
			}
			if (joins?.tagIds !== undefined) {
				tx.delete(charTags).where(eq(charTags.charId, id)).run()
				for (const tagId of joins.tagIds) {
					tx.insert(charTags).values({ charId: id, tagId }).run()
				}
			}
		})
	}

	return {
		findById,
		findCardById,
		listPage,
		listCardPage,
		insert,
		patch,
		remove,
	}
}
