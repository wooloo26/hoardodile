import type {
	Danmaku,
	DanmakuCreateInput,
	DanmakuDeleteInput,
	DanmakuListInput,
	DanmakuMode,
	ResAnchor,
	ResAnchorFilter,
} from "@hoardodile/schemas"
import { asc, eq, type SQL } from "drizzle-orm"
import { createCapabilityGuard } from "src/domain/plugin/capability-guard.ts"
import { buildFindById, buildRemove } from "src/infra/db/builders.ts"
import type { SqliteDb } from "src/infra/db/connection.ts"
import { type ClockDeps, generateId, wrapAsync } from "src/infra/service.ts"
import type { PluginRegistry } from "../plugin/api-types.ts"
import { resources } from "../res/schema.ts"
import { danmakus } from "./schema.ts"

export type DanmakuServiceDeps = ClockDeps & {
	readonly db: SqliteDb
	readonly pluginRegistry?: PluginRegistry
}

/**
 * Behaviour contract for the danmaku module.
 *
 * `list` returns every danmaku scoped to a resource. Plugin-specific
 * location filtering (page, timestamp, paragraph) happens client-side
 * through the plugin render module.
 */
export type DanmakuService = {
	list(input: DanmakuListInput): Promise<readonly Danmaku[]>
	create(input: DanmakuCreateInput): Promise<Danmaku>
	delete(input: DanmakuDeleteInput): Promise<void>
}

export function createDanmakuService(deps: DanmakuServiceDeps): DanmakuService {
	const { db, pluginRegistry } = deps
	const now = deps.now ?? Date.now
	const newId = deps.newId ?? generateId
	const guard = createCapabilityGuard()
	const findById = buildFindById<typeof danmakus.$inferSelect>(
		db,
		danmakus,
		"danmaku",
	)
	const remove = buildRemove(db, danmakus)

	function list(input: DanmakuListInput): readonly Danmaku[] {
		const rows = db
			.select()
			.from(danmakus)
			.where(buildAnchorWhere(input.anchor))
			.orderBy(asc(danmakus.createdAt))
			.all()
		return rows.map(rowToDanmaku)
	}

	function create(input: DanmakuCreateInput): Danmaku {
		const resRow = db
			.select({ contentPluginId: resources.contentPluginId })
			.from(resources)
			.where(eq(resources.id, input.anchor.resId))
			.get()
		if (resRow !== undefined && resRow.contentPluginId !== null) {
			const pluginEntry = pluginRegistry?.getById(resRow.contentPluginId)
			if (pluginEntry !== undefined) {
				guard.require(pluginEntry.manifest, "danmaku")
			}
		}
		const id = newId()
		const ts = now()
		const anchor = input.anchor
		db.insert(danmakus)
			.values({
				id,
				anchorResourceId: anchor.resId,
				anchorKind: "",
				anchorData: JSON.stringify(anchor),
				text: input.text,
				color: input.color ?? "",
				mode: input.mode ?? "scroll",
				createdAt: ts,
			})
			.run()
		return rowToDanmaku(findById(id))
	}

	function deleteOne(input: DanmakuDeleteInput): void {
		findById(input.id)
		remove(input.id)
	}

	return wrapAsync({
		list,
		create,
		delete: deleteOne,
	})
}

function buildAnchorWhere(filter: ResAnchorFilter): SQL | undefined {
	return eq(danmakus.anchorResourceId, filter.resId)
}

function rowToDanmaku(row: typeof danmakus.$inferSelect): Danmaku {
	const anchor = parseAnchor(row.anchorData, row.anchorResourceId)
	return {
		id: row.id,
		anchor,
		text: row.text,
		color: row.color,
		mode: row.mode satisfies DanmakuMode,
		createdAt: row.createdAt,
	}
}

function parseAnchor(raw: string, resId: string): ResAnchor {
	const parsed = JSON.parse(raw) as ResAnchor
	if (parsed.resId !== resId) {
		throw new Error(
			`danmaku anchor resId mismatch: row=${resId} json=${parsed.resId}`,
		)
	}
	return parsed
}
