import type { TagFilterMode } from "@hoardodile/shared"
import { and, eq, exists, inArray, not, type SQL, sql } from "drizzle-orm"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import type { DbClient } from "src/infra/db/connection.ts"

/**
 * Inputs to {@link buildTagFilterClauses}: the entity-tag join table
 * description plus the active filter (selected tag ids and mode).
 *
 * `entityIdColumn` and `tagIdColumn` MUST come from the same join
 * table (`resTags.resId` + `resTags.tagId` or
 * `charTags.charId` + `charTags.tagId`).
 *
 * `outerEntityIdColumn` is the parent table's primary key reference
 * used inside the EXISTS subquery's `WHERE` clause to correlate it
 * back to the outer query (e.g. `resources.id`).
 */
export type TagFilterInputs = {
	readonly db: DbClient
	readonly entityIdColumn: AnySQLiteColumn
	readonly tagIdColumn: AnySQLiteColumn
	readonly outerEntityIdColumn: AnySQLiteColumn
	readonly tagIds: readonly string[]
	readonly tagMode: TagFilterMode | undefined
}

/**
 * Compose the WHERE-clause fragments that implement the per-tag filter
 * for an entity list query. Returns an empty array when no tag filter
 * is active so the caller can spread directly into its `clauses`
 * accumulator.
 *
 * Modes:
 * - `"and"` (default): one EXISTS per tag - entity must carry every tag.
 * - `"or"`: a single EXISTS with `IN (...)` - entity carries any tag.
 * - `"not"` / `"nor"`: NOT EXISTS with `IN (...)` - entity carries
 *   none of the selected tags. Both modes are SQL-equivalent today;
 *   the toggle separates them only because the UI surfaces both
 *   labels (logical complements of `and`/`or` respectively). Keep
 *   them as one branch so the implementation stays a single source
 *   of truth.
 */
export function buildTagFilterClauses(inputs: TagFilterInputs): SQL[] {
	const {
		db,
		entityIdColumn,
		tagIdColumn,
		outerEntityIdColumn,
		tagIds,
		tagMode,
	} = inputs
	if (tagIds.length === 0) return []
	const mode = tagMode ?? "and"
	if (mode === "or") {
		return [
			exists(
				db
					.select({ one: sql`1` })
					.from(entityIdColumn.table)
					.where(
						and(
							eq(entityIdColumn, outerEntityIdColumn),
							inArray(tagIdColumn, [...tagIds]),
						),
					),
			),
		]
	}
	if (mode === "not" || mode === "nor") {
		return [
			not(
				exists(
					db
						.select({ one: sql`1` })
						.from(entityIdColumn.table)
						.where(
							and(
								eq(entityIdColumn, outerEntityIdColumn),
								inArray(tagIdColumn, [...tagIds]),
							),
						),
				),
			),
		]
	}
	// "and": one EXISTS per tag - entity must carry every selected tag.
	const clauses: SQL[] = []
	for (const tagId of tagIds) {
		clauses.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(entityIdColumn.table)
					.where(
						and(
							eq(entityIdColumn, outerEntityIdColumn),
							eq(tagIdColumn, tagId),
						),
					),
			),
		)
	}
	return clauses
}
