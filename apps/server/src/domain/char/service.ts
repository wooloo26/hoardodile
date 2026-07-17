import type {
	Character,
	CharCard,
	TraitDef,
	TraitFilter,
	TraitKind,
} from "@hoardodile/schemas"
import {
	computeDateOrder,
	computeDateOrderRange,
	parseTraitValue,
	TraitParseError,
} from "@hoardodile/schemas"
import type { ListPageInput, ListPageResult } from "@hoardodile/shared"
import { conflict, invalid } from "@hoardodile/shared"
import { produce } from "@hoardodile/shared/immer"
import { buildTraitRepository } from "src/domain/trait/repo.ts"
import type { SqliteDb } from "src/infra/db/connection.ts"
import { parseRecord } from "src/infra/db/parse.ts"
import type { MutableRef } from "src/infra/runtime-context.ts"
import {
	applyPageBounds,
	buildSoftDeleteOps,
	type ClockDeps,
	filterDefined,
	generateId,
} from "src/infra/service.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import { formatTimestamp } from "src/lib/date.ts"
import { buildPinnedTraitRows } from "./build-pinned-trait-rows.ts"
import { buildCharacterFiles } from "./files.ts"
import {
	buildCharacterRepository,
	type CharCardRow,
	type CharDbPatch,
	type CharRow,
} from "./repo.ts"

export type CharServiceDeps = ClockDeps & {
	readonly db: SqliteDb
	readonly paths: StoragePaths
	readonly readOnly: MutableRef<boolean>
}

export type CharCreateInput = {
	/** Optional display name. When omitted, a formatted creation timestamp is used. */
	readonly name?: string
	/** IANA zone for the fallback name when `name` is omitted. */
	readonly defaultNameTimeZone?: string
	readonly intro?: string
	readonly tagIds?: readonly string[]
	readonly traitValues?: Record<string, string>
}

export type CharUpdateInput = {
	readonly id: string
	readonly name?: string
	readonly intro?: string
	readonly tagIds?: readonly string[]
	readonly traitValues?: Record<string, string>
}

/** Returned path is either the `.deleted` marker file or the directory under `local/trash/` where the versions folder was moved. */
export type CharHardDeleteResult = {
	readonly trashedPath: string
}

export type CharService = {
	list(input: ListPageInput): Promise<ListPageResult<Character>>
	listCards(input: ListPageInput): Promise<ListPageResult<CharCard>>
	trashList(input: ListPageInput): Promise<ListPageResult<Character>>
	trashListCards(input: ListPageInput): Promise<ListPageResult<CharCard>>
	detail(id: string): Promise<Character>
	detailCard(id: string): Promise<CharCard>
	/**
	 * Batch fetch by ids. Missing or trashed characters are skipped silently
	 * - chip-style consumers MUST be tolerant of stale references and do not
	 * want a single missing id to fail the whole call.
	 */
	byIds(ids: readonly string[]): Promise<readonly Character[]>
	create(input: CharCreateInput): Promise<Character>
	update(input: CharUpdateInput): Promise<Character>
	softDelete(id: string): Promise<Character>
	restore(id: string): Promise<Character>
	hardDelete(id: string): Promise<CharHardDeleteResult>
	/** Bump `updatedAt` so the front-end thumb cache-buster fires after an image upload/delete. */
	touch(id: string): Promise<Character>
	/**
	 * Resolve the on-disk path to the character's avatar / fullbody
	 * file in the version recorded on the row. Returns `undefined` when
	 * the variant was never set or has been deleted in that version.
	 */
	resolveImagePath(
		id: string,
		variant: "avatar" | "fullbody",
	): Promise<string | undefined>
	/**
	 * Bump the `avatarVersion` / `fullbodyVersion` row column to the
	 * current writable version and refresh `updatedAt`. Called after a
	 * successful image PUT/DELETE on the HTTP route so subsequent reads
	 * resolve files from the new version's folder.
	 */
	setVariantVersion(
		id: string,
		variant: "avatar" | "fullbody",
		version: number,
	): Promise<Character>
	/**
	 * Server-internal: returns the version recorded on the row for the
	 * given variant. Used by HTTP / thumb routes to resolve files in
	 * past archives.
	 */
	getVariantVersion(id: string, variant: "avatar" | "fullbody"): Promise<number>
	/**
	 * Install a new avatar/fullbody image under the current version. The
	 * file is copied through `writeVersioned`, any previous variant file is
	 * archived to `local/`, the row's variant version is bumped to the
	 * current version, and the local thumb cache is invalidated.
	 *
	 * @param sourcePath Absolute path of the validated source file (usually
	 *   a temp file under `local/tmp`).
	 */
	setImage(
		id: string,
		variant: "avatar" | "fullbody",
		ext: string,
		sourcePath: string,
	): Promise<Character>
	/**
	 * Remove the current avatar/fullbody image. The existing file is
	 * archived to `local/`, the row's variant version is bumped to the
	 * current version, and the local thumb cache is invalidated.
	 */
	clearImage(id: string, variant: "avatar" | "fullbody"): Promise<Character>
}

const MAX_PAGE_SIZE = 200
/**
 * Upper bound for the post-filter fetch when `traitFilters` is set. Trait
 * filters are evaluated in JS (parsed dimensional values can't be expressed
 * as a SQL predicate cheaply); the dataset is expected to host O(1k)
 * characters so 5k leaves headroom without exposing pathological scans.
 */
const TRAIT_FILTER_FETCH_CAP = 5000

function effectiveTraitFilters(
	filters: readonly TraitFilter[],
): readonly TraitFilter[] {
	return filters.filter((f) => !(f.op === "contains" && f.value.length === 0))
}

function matchesTraitFilters(
	traitValuesJson: string,
	kinds: ReadonlyMap<string, TraitKind>,
	filters: readonly TraitFilter[],
): boolean {
	let values: Record<string, string>
	try {
		const parsed = JSON.parse(traitValuesJson) as unknown
		values =
			parsed !== null && typeof parsed === "object"
				? (parsed as Record<string, string>)
				: {}
	} catch {
		values = {}
	}
	for (const f of filters) {
		const raw = values[f.traitId]
		const present = typeof raw === "string" && raw.length > 0
		switch (f.op) {
			case "empty":
				if (present) return false
				break
			case "notempty":
				if (!present) return false
				break
			case "contains":
				if (!present) return false
				if (!raw.toLowerCase().includes(f.value.toLowerCase())) return false
				break
			case "dateAfter":
			case "dateOnOrAfter":
			case "dateBefore":
			case "dateOnOrBefore":
			case "dateOn": {
				if (!present) return false
				const kind = kinds.get(f.traitId)
				if (kind !== "date") return false
				try {
					const parsed = parseTraitValue(kind, raw)
					if (parsed.kind !== "date") return false
					const filterOrder = computeDateOrder(f.value)
					const range = computeDateOrderRange(parsed)
					if (!compareDateRange(range, f.op, filterOrder)) return false
				} catch (err) {
					if (err instanceof TraitParseError) return false
					throw err
				}
				break
			}
			case "dateMonthDayOn": {
				if (!present) return false
				const kind = kinds.get(f.traitId)
				if (kind !== "date") return false
				try {
					const parsed = parseTraitValue(kind, raw)
					if (parsed.kind !== "date") return false
					if (
						parsed.month === undefined ||
						parsed.day === undefined ||
						parsed.month !== f.value.month ||
						parsed.day !== f.value.day
					)
						return false
				} catch (err) {
					if (err instanceof TraitParseError) return false
					throw err
				}
				break
			}
			case "dateMonthDayToday":
				return false
			case ">":
			case ">=":
			case "<":
			case "<=":
			case "=": {
				if (!present) return false
				const kind = kinds.get(f.traitId)
				if (kind === undefined) return false
				try {
					const parsed = parseTraitValue(kind, raw)
					const order = "order" in parsed ? parsed.order : Number.NaN
					if (!Number.isFinite(order)) return false
					if (!compareOrder(order, f.op, f.value)) return false
				} catch (err) {
					if (err instanceof TraitParseError) return false
					throw err
				}
				break
			}
		}
	}
	return true
}

function compareOrder(
	order: number,
	op: ">" | ">=" | "<" | "<=" | "=",
	value: number,
): boolean {
	switch (op) {
		case ">":
			return order > value
		case ">=":
			return order >= value
		case "<":
			return order < value
		case "<=":
			return order <= value
		case "=":
			return order === value
	}
}

function compareDateRange(
	range: { min: number; max: number },
	op:
		| "dateAfter"
		| "dateOnOrAfter"
		| "dateBefore"
		| "dateOnOrBefore"
		| "dateOn",
	filterOrder: number,
): boolean {
	switch (op) {
		case "dateAfter":
			// The whole known period lies strictly after the filter date.
			return range.min > filterOrder
		case "dateOnOrAfter":
			// The known period touches or extends past the filter date.
			return range.max >= filterOrder
		case "dateBefore":
			// The whole known period lies strictly before the filter date.
			return range.max < filterOrder
		case "dateOnOrBefore":
			// The known period touches or is before the filter date.
			return range.min <= filterOrder
		case "dateOn":
			// The filter date falls within the possible range.
			return range.min <= filterOrder && filterOrder <= range.max
	}
}

function rejectDateMonthDayTodayFilters(filters: readonly TraitFilter[]): void {
	for (const filter of filters) {
		if (filter.op === "dateMonthDayToday") {
			throw invalid(
				"char.trait_filter_date_month_day_today",
				"dateMonthDayToday must be rewritten to dateMonthDayOn client-side with the user's time zone",
			)
		}
	}
}

function toCharListQuery(
	trashed: boolean,
	input: ListPageInput,
	page: number,
	size: number,
) {
	return {
		trashed,
		query: input.query,
		page,
		size,
		tagIds: input.tagIds,
		tagMode: input.tagMode,
		sortBy: input.sortBy,
		order: input.order,
		random: input.random,
		searchIntro: input.searchIntro,
		relationshipTypeIds: input.relationshipTypeIds,
	}
}

export function createCharacterService(deps: CharServiceDeps): CharService {
	const repo = buildCharacterRepository(deps.db)
	const traitRepo = buildTraitRepository(deps.db)
	const files = buildCharacterFiles(deps.paths, deps.readOnly)
	const now = deps.now ?? Date.now
	const newId = deps.newId ?? generateId

	function listTraitDefs(): readonly TraitDef[] {
		return traitRepo.listAll()
	}

	function paginateCharacters(
		trashed: boolean,
		input: ListPageInput,
	): ListPageResult<Character> {
		const { page, size } = applyPageBounds(input, MAX_PAGE_SIZE)
		const filters = effectiveTraitFilters(input.traitFilters ?? [])
		const traitDefs = listTraitDefs()
		if (filters.length === 0) {
			const { rows, total } = repo.listPage(
				toCharListQuery(trashed, input, page, size),
			)
			return { rows: rows.map(rowToCharacter), total, page, size }
		}
		rejectDateMonthDayTodayFilters(filters)
		const { rows: allRows } = repo.listPage(
			toCharListQuery(trashed, input, 1, TRAIT_FILTER_FETCH_CAP),
		)
		const kinds = buildTraitKindMap(traitDefs)
		const filtered = allRows.filter((row) =>
			matchesTraitFilters(row.traitValues, kinds, filters),
		)
		const start = (page - 1) * size
		const slice = filtered.slice(start, start + size)
		return {
			rows: slice.map(rowToCharacter),
			total: filtered.length,
			page,
			size,
		}
	}

	function paginateCharacterCards(
		trashed: boolean,
		input: ListPageInput,
	): ListPageResult<CharCard> {
		const { page, size } = applyPageBounds(input, MAX_PAGE_SIZE)
		const filters = effectiveTraitFilters(input.traitFilters ?? [])
		const traitDefs = listTraitDefs()
		if (filters.length === 0) {
			const { rows, total } = repo.listCardPage(
				toCharListQuery(trashed, input, page, size),
			)
			return {
				rows: rows.map((row) => rowToCharacterCard(row, traitDefs)),
				total,
				page,
				size,
			}
		}
		rejectDateMonthDayTodayFilters(filters)
		const { rows: allRows } = repo.listCardPage(
			toCharListQuery(trashed, input, 1, TRAIT_FILTER_FETCH_CAP),
		)
		const kinds = buildTraitKindMap(traitDefs)
		const filtered = allRows.filter((row) =>
			matchesTraitFilters(row.traitValues, kinds, filters),
		)
		const start = (page - 1) * size
		const slice = filtered.slice(start, start + size)
		return {
			rows: slice.map((row) => rowToCharacterCard(row, traitDefs)),
			total: filtered.length,
			page,
			size,
		}
	}

	async function create(input: CharCreateInput): Promise<Character> {
		const id = newId()
		await files.ensureFolder(id)
		const ts = now()
		const name =
			input.name !== undefined && input.name.length > 0
				? input.name
				: formatTimestamp(ts, input.defaultNameTimeZone ?? "UTC")
		try {
			repo.insert(
				id,
				{
					name,
					intro: input.intro ?? "",
					tagIds: input.tagIds ?? [],
					traitValues: JSON.stringify(input.traitValues ?? {}),
				},
				ts,
				deps.paths.latestVersion,
			)
		} catch (err) {
			await files.removeFolder(id)
			throw err
		}
		return rowToCharacter(repo.findById(id))
	}

	function update(input: CharUpdateInput): Character {
		repo.findById(input.id)
		const fields: CharDbPatch = {
			...filterDefined({ name: input.name, intro: input.intro }),
			updatedAt: now(),
		}
		if (input.traitValues !== undefined) {
			fields.traitValues = JSON.stringify(input.traitValues)
		}
		repo.patch(input.id, fields, { tagIds: input.tagIds })
		return rowToCharacter(repo.findById(input.id))
	}

	const softDeleteOps = buildSoftDeleteOps({
		entity: "character",
		repo,
		mapper: rowToCharacter,
		now,
	})

	function softDelete(id: string): Character {
		return softDeleteOps.softDelete(id)
	}

	function restore(id: string): Character {
		return softDeleteOps.restore(id)
	}

	async function hardDelete(id: string): Promise<CharHardDeleteResult> {
		const row = repo.findById(id)
		if (row.deletedAt === null) {
			throw conflict(
				"character.hard_delete_requires_trash",
				`character ${id} must be soft-deleted first`,
				{ id },
			)
		}
		const hasFilesInCurrentVersion =
			row.avatarVersion === deps.paths.latestVersion ||
			row.fullbodyVersion === deps.paths.latestVersion
		let trashedPath: string
		if (hasFilesInCurrentVersion) {
			trashedPath = await files.moveFolderToTrash(id)
		} else {
			// Variants live only under past frozen archives; record the
			// hard-delete in the current version folder only.
			trashedPath = await files.markDeleted(id)
		}
		repo.remove(id)
		return { trashedPath }
	}

	function touch(id: string): Character {
		repo.findById(id)
		repo.patch(id, { updatedAt: now() })
		return rowToCharacter(repo.findById(id))
	}

	async function resolveImagePath(
		id: string,
		variant: "avatar" | "fullbody",
	): Promise<string | undefined> {
		const row = repo.findById(id)
		const version =
			variant === "avatar" ? row.avatarVersion : row.fullbodyVersion
		return files.findVariantInVersion(id, version, variant)
	}

	function setVariantVersion(
		id: string,
		variant: "avatar" | "fullbody",
		version: number,
	): Character {
		repo.findById(id)
		const patch =
			variant === "avatar"
				? { avatarVersion: version, updatedAt: now() }
				: { fullbodyVersion: version, updatedAt: now() }
		repo.patch(id, patch)
		return rowToCharacter(repo.findById(id))
	}

	async function setImage(
		id: string,
		variant: "avatar" | "fullbody",
		ext: string,
		sourcePath: string,
	): Promise<Character> {
		repo.findById(id)
		await files.writeVariant(id, variant, ext, sourcePath)
		await clearVariantThumb(id, variant)
		return setVariantVersion(id, variant, deps.paths.latestVersion)
	}

	async function clearImage(
		id: string,
		variant: "avatar" | "fullbody",
	): Promise<Character> {
		repo.findById(id)
		await files.deleteVariant(id, variant)
		await clearVariantThumb(id, variant)
		return setVariantVersion(id, variant, deps.paths.latestVersion)
	}

	async function clearVariantThumb(
		id: string,
		variant: "avatar" | "fullbody",
	): Promise<void> {
		const thumbPath = deps.paths.local.localCover(
			"character",
			id,
			`v${deps.paths.latestVersion}-${variant}`,
		)
		const { unlink } = await import("node:fs/promises")
		await unlink(thumbPath).catch(() => {})
	}

	return {
		list: async (input) => paginateCharacters(false, input),
		listCards: async (input) => paginateCharacterCards(false, input),
		trashList: async (input) => paginateCharacters(true, input),
		trashListCards: async (input) => paginateCharacterCards(true, input),
		detail: async (id) => rowToCharacter(repo.findById(id)),
		detailCard: async (id) =>
			rowToCharacterCard(repo.findCardById(id), listTraitDefs()),
		byIds: async (ids) => {
			const out: Character[] = []
			for (const id of ids) {
				try {
					const row = repo.findById(id)
					if (row.deletedAt === null) out.push(rowToCharacter(row))
				} catch {
					// Missing ids are silently skipped - see service interface JSDoc.
				}
			}
			return out
		},
		create,
		update: async (input) => update(input),
		softDelete: async (id) => softDelete(id),
		restore: async (id) => restore(id),
		hardDelete,
		touch: async (id) => touch(id),
		resolveImagePath,
		setVariantVersion: async (id, variant, version) =>
			setVariantVersion(id, variant, version),
		getVariantVersion: async (id, variant) => {
			const row = repo.findById(id)
			return variant === "avatar" ? row.avatarVersion : row.fullbodyVersion
		},
		setImage,
		clearImage,
	}
}

function rowToCharacter(row: CharRow): Character {
	const base = {
		id: row.id,
		name: row.name,
		intro: row.intro,
		tagIds: [...row.tagIds],
		traitValues: parseRecord(row.traitValues),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
	return row.deletedAt !== null ? { ...base, deletedAt: row.deletedAt } : base
}

function rowToCharacterCard(
	row: CharCardRow,
	traitDefs: readonly TraitDef[],
): CharCard {
	const traitValues = parseRecord(row.traitValues)
	return {
		...rowToCharacter(row),
		pinnedTags: [...row.pinnedTags],
		pinnedTraits: [...buildPinnedTraitRows(traitDefs, traitValues)],
		relations: row.relations.map((relation) => ({
			id: relation.id,
			name: relation.name,
			labels: [...relation.labels],
			color: relation.color,
			updatedAt: relation.updatedAt,
		})),
	}
}

/**
 * Build a Map from trait id to its {@link TraitKind} from a flat list of
 * trait definitions. Pure function — no DB access; the caller supplies
 * the list explicitly so the DB read stays visible at the call site.
 */
function buildTraitKindMap(
	defs: readonly { id: string; kind: TraitKind }[],
): ReadonlyMap<string, TraitKind> {
	return produce(new Map<string, TraitKind>(), (draft) => {
		for (const def of defs) draft.set(def.id, def.kind)
	})
}
