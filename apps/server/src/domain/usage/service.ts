import type {
	CharCard,
	ResCard,
	UsageBatchEntityExposure,
	UsageBatchEntityExposureInput,
	UsageDailySummary,
	UsageDailySummaryInput,
	UsageDashboard,
	UsageEntityExposure,
	UsageEntityExposureInput,
	UsageEntityType,
	UsageExposureMode,
	UsagePeriodSummary,
	UsagePeriodSummaryInput,
	UsageRecommendation,
	UsageRecommendationsInput,
	UsageSessionBeatInput,
	UsageTimelineInput,
	UsageTimelineItem,
	UsageTotal,
	UsageTotalsInput,
	UsageTotalsPage,
	UsageTrend,
	UsageTrendInput,
} from "@hoardodile/schemas"
import { and, eq, inArray, isNull } from "drizzle-orm"
import {
	type DbClient,
	type SqliteDb,
	withTransaction,
} from "src/infra/db/connection.ts"
import { type ClockDeps, generateId, wrapAsync } from "src/infra/service.ts"
import { characters } from "../char/schema.ts"
import type { CharService } from "../char/service.ts"
import { documents } from "../doc/schema.ts"
import type { DocService } from "../doc/service.ts"
import { resCharacters, resources } from "../res/schema.ts"
import type { ResService } from "../res/service.ts"
import {
	calendarDaysSince,
	getCalendarWindowStart,
	getDayBounds,
	getDayHourBuckets,
	getPeriodBounds,
	getTrendPeriods,
	overlapMs,
	requireIanaTimeZone,
	splitSessionIntoHourlyMs,
} from "./lib/time.ts"
import {
	buildUsageDevicesRepository,
	buildUsageSessionAssociationsRepository,
	buildUsageSessionsRepository,
	deleteAllUsageData,
	type SessionQueryFilters,
} from "./repo.ts"

type RecommendationCandidate = {
	readonly entityType: string
	readonly entityId: string
	readonly totalMs: number
	readonly lastViewedAt: number | null
}

export type UsageServiceDeps = ClockDeps & {
	readonly db: SqliteDb
	/** Optional: required only for recommendation card resolution. */
	readonly resService?: ResService
	/** Optional: required only for recommendation card resolution. */
	readonly charService?: CharService
	/** Optional: required only for recommendation card resolution. */
	readonly docService?: DocService
}

export type UsageService = {
	recordSessionBeat(input: UsageSessionBeatInput): Promise<void>
	getTotals(input: UsageTotalsInput): Promise<readonly UsageTotal[]>
	getTotalsPage(input: UsageTotalsInput): Promise<UsageTotalsPage>
	getDashboard(input?: { deviceId?: string }): Promise<UsageDashboard>
	getRecommendations(
		input: UsageRecommendationsInput,
	): Promise<readonly UsageRecommendation[]>
	getTimeline(input: UsageTimelineInput): Promise<readonly UsageTimelineItem[]>
	getDailySummary(input: UsageDailySummaryInput): Promise<UsageDailySummary>
	getTrend(input: UsageTrendInput): Promise<UsageTrend>
	getPeriodSummary(input: UsagePeriodSummaryInput): Promise<UsagePeriodSummary>
	getEntityExposure(
		input: UsageEntityExposureInput,
	): Promise<UsageEntityExposure>
	batchEntityExposure(
		input: UsageBatchEntityExposureInput,
	): Promise<UsageBatchEntityExposure>
	clearAll(): Promise<void>
}

/**
 * Build the usage statistics service.
 *
 * The session-based model keeps one row per viewing session in
 * `usage_sessions`. Related entities are attached in
 * `usage_session_associations` so that associated exposure can be reported
 * without inflating the primary totals.
 */
export function createUsageService(deps: UsageServiceDeps): UsageService {
	const db = deps.db
	const sessionsRepo = buildUsageSessionsRepository(db)
	const associationsRepo = buildUsageSessionAssociationsRepository(db)
	const now = deps.now ?? Date.now
	const newId = deps.newId ?? generateId

	function clientDeviceFilters(input: {
		deviceId?: string
	}): SessionQueryFilters {
		return {
			...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
		}
	}

	type TopRow = {
		readonly entityId: string
		readonly totalMs: number
		readonly viewCount: number
		readonly lastViewedAt: number | null
	}

	function mergeTopRows(
		direct: readonly {
			entityId: string
			totalMs: number
			viewCount: number
			lastViewedAt: number | null
		}[],
		associated: readonly {
			entityId: string
			totalMs: number
			sessionCount: number
			lastViewedAt: number | null
		}[],
		order: "time" | "recent" | "views",
		limit: number,
	): TopRow[] {
		const map = new Map<string, TopRow>()
		for (const row of direct) {
			map.set(row.entityId, {
				entityId: row.entityId,
				totalMs: row.totalMs,
				viewCount: row.viewCount,
				lastViewedAt: row.lastViewedAt,
			})
		}
		for (const row of associated) {
			const existing = map.get(row.entityId)
			if (existing === undefined) {
				map.set(row.entityId, {
					entityId: row.entityId,
					totalMs: row.totalMs,
					viewCount: 0,
					lastViewedAt: row.lastViewedAt,
				})
			} else {
				map.set(row.entityId, {
					entityId: row.entityId,
					totalMs: existing.totalMs + row.totalMs,
					viewCount: existing.viewCount,
					lastViewedAt: maxLastViewed(existing.lastViewedAt, row.lastViewedAt),
				})
			}
		}
		const sorted = [...map.values()].sort((a, b) => {
			if (order === "recent") {
				return (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0)
			}
			if (order === "views") {
				return b.viewCount - a.viewCount
			}
			return b.totalMs - a.totalMs
		})
		return sorted.slice(0, limit)
	}

	function maxLastViewed(a: number | null, b: number | null): number | null {
		if (a === null) return b
		if (b === null) return a
		return a > b ? a : b
	}

	type PeriodBounds = { readonly start: number; readonly end: number }

	function buildEntityExistenceFilter(
		client: DbClient,
		entityType: UsageEntityType,
		ids: readonly string[],
	): Set<string> {
		if (ids.length === 0) return new Set()

		switch (entityType) {
			case "resource": {
				const rows = client
					.select({ id: resources.id })
					.from(resources)
					.where(and(inArray(resources.id, ids), isNull(resources.deletedAt)))
					.all()
				return new Set(rows.map((row) => row.id))
			}
			case "character": {
				const rows = client
					.select({ id: characters.id })
					.from(characters)
					.where(and(inArray(characters.id, ids), isNull(characters.deletedAt)))
					.all()
				return new Set(rows.map((row) => row.id))
			}
			case "document": {
				const rows = client
					.select({ id: documents.id })
					.from(documents)
					.where(
						and(
							inArray(documents.id, ids),
							isNull(documents.deletedAt),
							eq(documents.kind, "document"),
						),
					)
					.all()
				return new Set(rows.map((row) => row.id))
			}
			case "plugin":
				return new Set(ids)
		}
	}

	function filterRowsByExistingEntity<
		T extends { entityType: UsageEntityType; entityId: string },
	>(rows: readonly T[], client: DbClient): T[] {
		if (rows.length === 0) return []

		const idsByType = new Map<UsageEntityType, string[]>()
		for (const row of rows) {
			const list = idsByType.get(row.entityType) ?? []
			list.push(row.entityId)
			idsByType.set(row.entityType, list)
		}

		const existingKeys = new Set<string>()
		for (const [entityType, ids] of idsByType) {
			const existingIds = buildEntityExistenceFilter(client, entityType, ids)
			for (const id of existingIds) {
				existingKeys.add(`${entityType}:${id}`)
			}
		}

		return rows.filter((row) =>
			existingKeys.has(`${row.entityType}:${row.entityId}`),
		)
	}

	function countExistingTopEntities(
		entityType: UsageEntityType,
		filters: SessionQueryFilters,
		exposureMode: UsageExposureMode,
		bounds: PeriodBounds | undefined,
	): number {
		const effectiveFilters: SessionQueryFilters =
			bounds !== undefined &&
			filters.from !== undefined &&
			filters.to !== undefined
				? { ...filters, from: bounds.start, to: bounds.end }
				: filters

		const candidateIds = new Set<string>()
		if (exposureMode !== "associated") {
			for (const id of sessionsRepo.listTopEntityIds(
				entityType,
				effectiveFilters,
			)) {
				candidateIds.add(id)
			}
		}
		if (exposureMode !== "direct") {
			for (const id of associationsRepo.listTopAssociatedEntityIds(
				entityType,
				effectiveFilters,
			)) {
				candidateIds.add(id)
			}
		}

		const existing = buildEntityExistenceFilter(db, entityType, [
			...candidateIds,
		])
		return existing.size
	}

	function sortTopRows(
		rows: readonly TopRow[],
		order: "time" | "recent" | "views",
	): TopRow[] {
		return [...rows].sort((a, b) => {
			if (order === "recent") {
				return (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0)
			}
			if (order === "views") {
				return b.viewCount - a.viewCount
			}
			return b.totalMs - a.totalMs
		})
	}

	function aggregateDirectClipped(
		entityType: string,
		filters: SessionQueryFilters & { from: number; to: number },
		bounds: PeriodBounds,
	): Map<string, TopRow> {
		const map = new Map<string, TopRow>()
		for (const session of sessionsRepo.findInRange(filters)) {
			if (session.entityType !== entityType) continue
			const clipped = overlapMs(
				session.startedAt,
				session.endedAt,
				bounds.start,
				bounds.end,
			)
			if (clipped === 0) continue
			const existing = map.get(session.entityId)
			if (existing === undefined) {
				map.set(session.entityId, {
					entityId: session.entityId,
					totalMs: clipped,
					viewCount: 1,
					lastViewedAt: session.endedAt,
				})
				continue
			}
			map.set(session.entityId, {
				entityId: session.entityId,
				totalMs: existing.totalMs + clipped,
				viewCount: existing.viewCount + 1,
				lastViewedAt: maxLastViewed(existing.lastViewedAt, session.endedAt),
			})
		}
		return map
	}

	function aggregateAssociatedClipped(
		entityType: string,
		filters: SessionQueryFilters & { from: number; to: number },
		bounds: PeriodBounds,
	): Map<string, TopRow> {
		const map = new Map<string, TopRow & { readonly sessionIds: Set<string> }>()
		for (const row of associationsRepo.findInRange(filters)) {
			if (row.entityType !== entityType) continue
			const clipped = overlapMs(
				row.startedAt,
				row.endedAt,
				bounds.start,
				bounds.end,
			)
			if (clipped === 0) continue
			const existing = map.get(row.entityId)
			if (existing === undefined) {
				map.set(row.entityId, {
					entityId: row.entityId,
					totalMs: clipped,
					viewCount: 1,
					lastViewedAt: row.endedAt,
					sessionIds: new Set([row.sessionId]),
				})
				continue
			}
			const isNewSession = !existing.sessionIds.has(row.sessionId)
			const sessionIds = new Set(existing.sessionIds)
			if (isNewSession) {
				sessionIds.add(row.sessionId)
			}
			map.set(row.entityId, {
				entityId: row.entityId,
				totalMs: existing.totalMs + clipped,
				viewCount: isNewSession ? existing.viewCount + 1 : existing.viewCount,
				lastViewedAt: maxLastViewed(existing.lastViewedAt, row.endedAt),
				sessionIds,
			})
		}
		const result = new Map<string, TopRow>()
		for (const [entityId, row] of map) {
			result.set(entityId, {
				entityId,
				totalMs: row.totalMs,
				viewCount: row.viewCount,
				lastViewedAt: row.lastViewedAt,
			})
		}
		return result
	}

	function listTopForExposureClipped(
		entityType: string,
		filters: SessionQueryFilters & { from: number; to: number },
		bounds: PeriodBounds,
		order: "time" | "recent" | "views",
		limit: number,
		offset: number,
		exposureMode: UsageExposureMode,
	): readonly TopRow[] {
		if (exposureMode === "direct") {
			return sortTopRows(
				[...aggregateDirectClipped(entityType, filters, bounds).values()],
				order,
			).slice(offset, offset + limit)
		}
		if (exposureMode === "associated") {
			return sortTopRows(
				[...aggregateAssociatedClipped(entityType, filters, bounds).values()],
				order,
			).slice(offset, offset + limit)
		}
		const direct = aggregateDirectClipped(entityType, filters, bounds)
		const associated = aggregateAssociatedClipped(entityType, filters, bounds)
		const directRows = [...direct.values()]
		const associatedRows = [...associated.values()].map((row) => ({
			entityId: row.entityId,
			totalMs: row.totalMs,
			sessionCount: row.viewCount,
			lastViewedAt: row.lastViewedAt,
		}))
		const fetchLimit = Math.min((offset + limit) * 2, 100)
		return mergeTopRows(directRows, associatedRows, order, fetchLimit).slice(
			offset,
			offset + limit,
		)
	}

	function listTopForExposure(
		entityType: string,
		filters: SessionQueryFilters,
		order: "time" | "recent" | "views",
		limit: number,
		offset: number,
		exposureMode: UsageExposureMode,
		bounds?: PeriodBounds,
	): readonly TopRow[] {
		if (
			bounds !== undefined &&
			filters.from !== undefined &&
			filters.to !== undefined
		) {
			return listTopForExposureClipped(
				entityType,
				{ ...filters, from: filters.from, to: filters.to },
				bounds,
				order,
				limit,
				offset,
				exposureMode,
			)
		}
		if (exposureMode === "direct") {
			return sessionsRepo.listTop(entityType, filters, order, limit, offset)
		}
		if (exposureMode === "associated") {
			return associationsRepo
				.listTopAssociated(entityType, filters, order, limit, offset)
				.map((row) => ({
					entityId: row.entityId,
					totalMs: row.totalMs,
					viewCount: row.sessionCount,
					lastViewedAt: row.lastViewedAt,
				}))
		}
		const fetchLimit = Math.min((offset + limit) * 2, 100)
		return mergeTopRows(
			sessionsRepo.listTop(entityType, filters, order, fetchLimit, 0),
			associationsRepo.listTopAssociated(
				entityType,
				filters,
				order,
				fetchLimit,
				0,
			),
			order,
			fetchLimit,
		).slice(offset, offset + limit)
	}

	function mapTopRowsToTotals(
		rows: readonly TopRow[],
		input: {
			entityType: UsageTotalsInput["entityType"]
			granularity: UsageTotalsInput["granularity"]
			period: string | null
		},
	): UsageTotal[] {
		return rows.map((row) => ({
			id: newId(),
			entityType: input.entityType,
			entityId: row.entityId,
			granularity: input.granularity,
			period: input.period,
			totalMs: row.totalMs,
			viewCount: row.viewCount,
			lastViewedAt: row.lastViewedAt,
			updatedAt: row.lastViewedAt ?? now(),
		}))
	}

	function recordAssociations(
		client: DbClient,
		txAssociationsRepo: ReturnType<
			typeof buildUsageSessionAssociationsRepository
		>,
		sessionId: string,
		entityType: UsageEntityType,
		entityId: string,
	): void {
		switch (entityType) {
			case "resource": {
				const resRow = client
					.select({ contentPluginId: resources.contentPluginId })
					.from(resources)
					.where(eq(resources.id, entityId))
					.get()
				if (
					resRow?.contentPluginId !== undefined &&
					resRow.contentPluginId !== null
				) {
					txAssociationsRepo.upsert(
						sessionId,
						"plugin",
						resRow.contentPluginId,
						"owner",
					)
				}

				const charRows = client
					.select({ charId: resCharacters.charId })
					.from(resCharacters)
					.where(eq(resCharacters.resId, entityId))
					.all()
				for (const { charId } of charRows) {
					txAssociationsRepo.upsert(sessionId, "character", charId, "linked")
				}
				break
			}

			case "document": {
				const docRow = client
					.select({
						draftResIds: documents.draftResIds,
						draftCharIds: documents.draftCharIds,
					})
					.from(documents)
					.where(eq(documents.id, entityId))
					.get()
				if (docRow !== undefined) {
					for (const resId of docRow.draftResIds) {
						txAssociationsRepo.upsert(sessionId, "resource", resId, "contained")
					}
					for (const charId of docRow.draftCharIds) {
						txAssociationsRepo.upsert(
							sessionId,
							"character",
							charId,
							"contained",
						)
					}
				}
				break
			}

			case "character":
			case "plugin":
				break
		}
	}

	function recordSessionBeat(input: UsageSessionBeatInput): void {
		const ts = now()
		const { sessionId, entityType, entityId, startedAt, durationMs } = input
		if (durationMs <= 0) return

		const endedAt = startedAt + durationMs
		withTransaction(db, (tx) => {
			const txDevicesRepo = buildUsageDevicesRepository(tx)
			const txSessionsRepo = buildUsageSessionsRepository(tx)
			const existing = txSessionsRepo.findById(sessionId)
			// Monotonicity guard: ignore stale/out-of-order beats so offline
			// retries or duplicated flushes cannot regress recorded duration.
			if (existing !== undefined && durationMs <= existing.durationMs) {
				return
			}

			const deviceId = input.deviceId ?? null
			if (deviceId !== null && deviceId.length > 0) {
				const info = input.deviceInfo
				const existingDevice = txDevicesRepo.findById(deviceId)
				txDevicesRepo.upsert({
					id: deviceId,
					channel: info?.channel ?? "web",
					deviceType: info?.deviceType ?? "unknown",
					os: info?.os ?? "unknown",
					osVersion: info?.osVersion ?? "",
					browser: info?.browser ?? "unknown",
					browserVersion: info?.browserVersion ?? "",
					appVersion: info?.appVersion ?? "",
					firstSeenAt: existingDevice?.firstSeenAt ?? ts,
					lastSeenAt: ts,
				})
			}

			const txAssociationsRepo = buildUsageSessionAssociationsRepository(tx)
			txSessionsRepo.upsert({
				id: sessionId,
				entityType,
				entityId,
				startedAt,
				endedAt,
				durationMs,
				deviceId,
				createdAt: existing?.createdAt ?? ts,
				updatedAt: ts,
			})
			recordAssociations(
				tx,
				txAssociationsRepo,
				sessionId,
				entityType,
				entityId,
			)
		})
	}

	function getTotals(input: UsageTotalsInput): readonly UsageTotal[] {
		const period =
			input.granularity !== "all" && input.period !== undefined
				? input.period
				: null
		const bounds =
			period !== null && input.granularity !== "all"
				? getPeriodBounds(
						input.granularity,
						period,
						requireIanaTimeZone(input.timeZone),
					)
				: null
		const filters: SessionQueryFilters = {
			...clientDeviceFilters(input),
			...(bounds !== null ? { from: bounds.start, to: bounds.end } : {}),
		}

		const rows = listTopForExposure(
			input.entityType,
			filters,
			input.order,
			input.limit,
			0,
			input.exposureMode ?? "direct",
			bounds ?? undefined,
		)
		const existingIds = buildEntityExistenceFilter(
			db,
			input.entityType,
			rows.map((row) => row.entityId),
		)
		const filteredRows = rows.filter((row) => existingIds.has(row.entityId))
		return mapTopRowsToTotals(filteredRows, {
			entityType: input.entityType,
			granularity: input.granularity,
			period,
		})
	}

	function getTotalsPage(input: UsageTotalsInput): UsageTotalsPage {
		const page = input.page ?? 1
		const size = input.limit
		const offset = (page - 1) * size
		const period =
			input.granularity !== "all" && input.period !== undefined
				? input.period
				: null
		const bounds =
			period !== null && input.granularity !== "all"
				? getPeriodBounds(
						input.granularity,
						period,
						requireIanaTimeZone(input.timeZone),
					)
				: null
		const filters: SessionQueryFilters = {
			...clientDeviceFilters(input),
			...(bounds !== null ? { from: bounds.start, to: bounds.end } : {}),
		}

		const rows = listTopForExposure(
			input.entityType,
			filters,
			input.order,
			size,
			offset,
			input.exposureMode ?? "direct",
			bounds ?? undefined,
		)
		const existingIds = buildEntityExistenceFilter(
			db,
			input.entityType,
			rows.map((row) => row.entityId),
		)
		const filteredRows = rows.filter((row) => existingIds.has(row.entityId))
		const total = countExistingTopEntities(
			input.entityType,
			filters,
			input.exposureMode ?? "direct",
			bounds ?? undefined,
		)
		return {
			rows: mapTopRowsToTotals(filteredRows, {
				entityType: input.entityType,
				granularity: input.granularity,
				period,
			}),
			total,
			page,
			size,
		}
	}

	function getDashboard(input: { deviceId?: string } = {}): UsageDashboard {
		const primaryTypes: readonly UsageEntityType[] = [
			"resource",
			"document",
			"character",
		]
		const filters = clientDeviceFilters(input)
		const totalMs = sessionsRepo.sumDurationByEntityTypes(primaryTypes, filters)
		const totalViews = sessionsRepo.countSessionsByEntityTypes(
			primaryTypes,
			filters,
		)
		const deviceIds = sessionsRepo.listDistinctDeviceIds()

		return {
			totalMs,
			totalViews,
			deviceIds,
			topResources: getTotals({
				entityType: "resource",
				granularity: "all",
				order: "time",
				limit: 10,
				deviceId: input.deviceId,
			}),
			topCharacters: getTotals({
				entityType: "character",
				granularity: "all",
				order: "time",
				limit: 10,
				deviceId: input.deviceId,
			}),
			topDocuments: getTotals({
				entityType: "document",
				granularity: "all",
				order: "time",
				limit: 10,
				deviceId: input.deviceId,
			}),
			topPlugins: getTotals({
				entityType: "plugin",
				granularity: "all",
				order: "time",
				limit: 10,
				deviceId: input.deviceId,
			}),
			recentActivity: getTotals({
				entityType: "resource",
				granularity: "all",
				order: "recent",
				limit: 10,
				deviceId: input.deviceId,
			}),
		}
	}

	const CONTINUE_WINDOW_DAYS = 7
	const CONTINUE_MIN_MS = 30_000
	const TOP_PICK_HALF_LIFE_DAYS = 30

	async function resolveRecommendation(
		row: RecommendationCandidate,
	): Promise<UsageRecommendation | undefined> {
		const base = {
			entityType: row.entityType as UsageEntityType,
			entityId: row.entityId,
			totalMs: row.totalMs,
			lastViewedAt: row.lastViewedAt,
		}

		try {
			switch (row.entityType) {
				case "resource": {
					if (deps.resService === undefined) return undefined
					const resource = (await deps.resService.detailCard(
						row.entityId,
					)) as ResCard
					return { ...base, resource }
				}
				case "character": {
					if (deps.charService === undefined) return undefined
					const character = (await deps.charService.detailCard(
						row.entityId,
					)) as CharCard
					return { ...base, character }
				}
				case "document": {
					if (deps.docService === undefined) return undefined
					const doc = await deps.docService.detail(row.entityId)
					if (doc.kind !== "document") return undefined
					return {
						...base,
						document: { id: doc.id, title: doc.title },
					}
				}
				default:
					return undefined
			}
		} catch {
			// Deleted/trashed or missing entity — skip it.
			return undefined
		}
	}

	async function getRecommendations(
		input: UsageRecommendationsInput,
	): Promise<readonly UsageRecommendation[]> {
		const ts = now()
		const timeZone = requireIanaTimeZone(input.timeZone)
		if (input.kind === "continue") {
			const since = getCalendarWindowStart(ts, CONTINUE_WINDOW_DAYS, timeZone)
			const rows = sessionsRepo.findContinue(
				["resource", "document"],
				CONTINUE_MIN_MS,
				since,
				input.limit * 3,
			)
			const unique = new Map<string, RecommendationCandidate>()
			for (const row of rows) {
				const key = `${row.entityType}:${row.entityId}`
				if (!unique.has(key)) {
					unique.set(key, {
						entityType: row.entityType,
						entityId: row.entityId,
						totalMs: row.durationMs,
						lastViewedAt: row.endedAt,
					})
				}
			}
			const candidates = Array.from(unique.values())
				.sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
				.slice(0, input.limit * 3)
			const resolved = await Promise.all(candidates.map(resolveRecommendation))
			return resolved
				.filter((item): item is UsageRecommendation => item !== undefined)
				.slice(0, input.limit)
		}

		const rows = sessionsRepo.findTopCandidates(
			["resource", "character"],
			input.limit * 5,
		)
		const scored = rows
			.map((row) => {
				const daysSince =
					row.lastViewedAt === null
						? Number.POSITIVE_INFINITY
						: calendarDaysSince(row.lastViewedAt, ts, timeZone)
				const score =
					row.totalMs *
					Math.exp((-Math.LN2 * daysSince) / TOP_PICK_HALF_LIFE_DAYS)
				return {
					row: {
						entityType: row.entityType as UsageEntityType,
						entityId: row.entityId,
						totalMs: row.totalMs,
						lastViewedAt: row.lastViewedAt,
					},
					score,
				}
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, input.limit)

		const resolved = await Promise.all(
			scored.map((item) => resolveRecommendation(item.row)),
		)
		return resolved.filter(
			(item): item is UsageRecommendation => item !== undefined,
		)
	}

	async function getTimeline(
		input: UsageTimelineInput,
	): Promise<readonly UsageTimelineItem[]> {
		const rows = sessionsRepo.findTimeline({
			entityType: input.entityType,
			entityId: input.entityId,
			from: input.from,
			to: input.to,
			deviceId: input.deviceId,
			limit: input.limit,
		})

		const sessionsWithAssociations = rows.map((row) => ({
			session: row,
			associations: associationsRepo.listBySession(row.id),
		}))

		return sessionsWithAssociations.map(({ session, associations }) => ({
			sessionId: session.id,
			entityType: session.entityType as UsageEntityType,
			entityId: session.entityId,
			startedAt: session.startedAt,
			endedAt: session.endedAt,
			durationMs: session.durationMs,
			deviceId: session.deviceId,
			associations: associations.map((a) => ({
				sessionId: a.sessionId,
				entityType: a.entityType as UsageEntityType,
				entityId: a.entityId,
				associationKind: a.associationKind as "owner" | "linked" | "contained",
			})),
		}))
	}

	function getDailySummary(input: UsageDailySummaryInput): UsageDailySummary {
		const timeZone = requireIanaTimeZone(input.timeZone)
		const { start, end } = getDayBounds(input.date, timeZone)
		const sessions = sessionsRepo.findInRange({
			from: start,
			to: end,
			deviceId: input.deviceId,
		})
		const { hourStarts, labels: hourlyLabels } = getDayHourBuckets(
			start,
			end,
			timeZone,
		)
		const hourlyMs = Array.from({ length: hourStarts.length }, () => 0)

		for (const session of sessions) {
			const buckets = splitSessionIntoHourlyMs(
				session.startedAt,
				session.endedAt,
				start,
				end,
				timeZone,
			)
			for (let i = 0; i < buckets.length; i++) {
				hourlyMs[i] = (hourlyMs[i] ?? 0) + (buckets[i] ?? 0)
			}
		}

		const entityMap = new Map<
			string,
			{
				entityType: UsageEntityType
				entityId: string
				totalMs: number
				lastViewedAt: number
			}
		>()
		let totalMs = 0
		for (const session of sessions) {
			const clipped = overlapMs(session.startedAt, session.endedAt, start, end)
			totalMs += clipped
			const key = `${session.entityType}:${session.entityId}`
			const existing = entityMap.get(key)
			if (existing === undefined) {
				entityMap.set(key, {
					entityType: session.entityType as UsageEntityType,
					entityId: session.entityId,
					totalMs: clipped,
					lastViewedAt: session.endedAt,
				})
			} else {
				existing.totalMs += clipped
				if (session.endedAt > existing.lastViewedAt) {
					existing.lastViewedAt = session.endedAt
				}
			}
		}

		const topEntities = filterRowsByExistingEntity(
			Array.from(entityMap.values()),
			db,
		)
			.sort((a, b) => b.totalMs - a.totalMs)
			.slice(0, input.limit)
			.map((entity) => ({
				id: entity.entityId,
				entityType: entity.entityType,
				entityId: entity.entityId,
				granularity: "all" as const,
				period: null,
				totalMs: entity.totalMs,
				viewCount: sessions.filter(
					(s) =>
						s.entityType === entity.entityType &&
						s.entityId === entity.entityId,
				).length,
				lastViewedAt: entity.lastViewedAt,
				updatedAt: entity.lastViewedAt,
			}))

		return {
			date: input.date,
			totalMs,
			sessionCount: sessions.length,
			hourlyMs: hourlyMs.map((ms) => Math.round(ms)),
			hourlyLabels,
			topEntities,
		}
	}

	function getTrend(input: UsageTrendInput): UsageTrend {
		const ts = now()
		const timeZone = requireIanaTimeZone(input.timeZone)
		const buckets = getTrendPeriods(
			input.granularity,
			input.periods,
			ts,
			timeZone,
		)

		const entityTypeFilter = input.entityType
		const result = buckets.map((bucket) => {
			const sessions = sessionsRepo.findInRange({
				from: bucket.start,
				to: bucket.end,
				deviceId: input.deviceId,
			})
			const filtered =
				entityTypeFilter !== undefined
					? sessions.filter((s) => s.entityType === entityTypeFilter)
					: sessions
			const totalMs = filtered.reduce(
				(sum, s) =>
					sum + overlapMs(s.startedAt, s.endedAt, bucket.start, bucket.end),
				0,
			)
			return {
				period: bucket.period,
				totalMs,
				sessionCount: filtered.length,
			}
		})

		return {
			granularity: input.granularity,
			buckets: result,
		}
	}

	function getPeriodSummary(
		input: UsagePeriodSummaryInput,
	): UsagePeriodSummary {
		const timeZone = requireIanaTimeZone(input.timeZone)
		const bounds = getPeriodBounds(input.granularity, input.period, timeZone)
		const filters = {
			...clientDeviceFilters(input),
			from: bounds.start,
			to: bounds.end,
		} satisfies SessionQueryFilters & { from: number; to: number }
		const sessions = sessionsRepo.findInRange(filters)
		const exposureMode = input.exposureMode ?? "direct"

		type PeriodEntity = {
			entityType: UsageEntityType
			entityId: string
			totalMs: number
			lastViewedAt: number
			viewCount: number
		}

		const entityMap = new Map<string, PeriodEntity>()

		function upsertPeriodEntity(
			entityType: UsageEntityType,
			entityId: string,
			clippedMs: number,
			endedAt: number,
			viewDelta: number,
		): void {
			const key = `${entityType}:${entityId}`
			const existing = entityMap.get(key)
			if (existing === undefined) {
				entityMap.set(key, {
					entityType,
					entityId,
					totalMs: clippedMs,
					lastViewedAt: endedAt,
					viewCount: viewDelta,
				})
			} else {
				existing.totalMs += clippedMs
				existing.viewCount += viewDelta
				if (endedAt > existing.lastViewedAt) {
					existing.lastViewedAt = endedAt
				}
			}
		}

		if (exposureMode === "direct" || exposureMode === "total") {
			for (const session of sessions) {
				const clipped = overlapMs(
					session.startedAt,
					session.endedAt,
					bounds.start,
					bounds.end,
				)
				upsertPeriodEntity(
					session.entityType as UsageEntityType,
					session.entityId,
					clipped,
					session.endedAt,
					1,
				)
			}
		}

		if (exposureMode === "associated" || exposureMode === "total") {
			const associations = associationsRepo.findInRange(filters)
			for (const row of associations) {
				const clipped = overlapMs(
					row.startedAt,
					row.endedAt,
					bounds.start,
					bounds.end,
				)
				if (exposureMode === "total") {
					const key = `${row.entityType}:${row.entityId}`
					const existing = entityMap.get(key)
					if (existing !== undefined) {
						existing.totalMs += clipped
						if (row.endedAt > existing.lastViewedAt) {
							existing.lastViewedAt = row.endedAt
						}
						continue
					}
				}
				upsertPeriodEntity(
					row.entityType as UsageEntityType,
					row.entityId,
					clipped,
					row.endedAt,
					0,
				)
			}
		}

		let totalMs = 0
		for (const session of sessions) {
			totalMs += overlapMs(
				session.startedAt,
				session.endedAt,
				bounds.start,
				bounds.end,
			)
		}

		const topEntities = filterRowsByExistingEntity(
			Array.from(entityMap.values()),
			db,
		)
			.sort((a, b) => b.totalMs - a.totalMs)
			.slice(0, input.limit)
			.map((entity) => ({
				id: entity.entityId,
				entityType: entity.entityType,
				entityId: entity.entityId,
				granularity: input.granularity as UsageTotalsInput["granularity"],
				period: input.period,
				totalMs: entity.totalMs,
				viewCount: entity.viewCount,
				lastViewedAt: entity.lastViewedAt,
				updatedAt: entity.lastViewedAt,
			}))

		let hourlyMs: number[] | undefined
		let hourlyLabels: readonly string[] | undefined
		if (input.granularity === "day") {
			const { hourStarts, labels } = getDayHourBuckets(
				bounds.start,
				bounds.end,
				timeZone,
			)
			hourlyMs = Array.from({ length: hourStarts.length }, () => 0)
			for (const session of sessions) {
				const buckets = splitSessionIntoHourlyMs(
					session.startedAt,
					session.endedAt,
					bounds.start,
					bounds.end,
					timeZone,
				)
				for (let i = 0; i < buckets.length; i++) {
					hourlyMs[i] = (hourlyMs[i] ?? 0) + (buckets[i] ?? 0)
				}
			}
			hourlyMs = hourlyMs.map((ms) => Math.round(ms))
			hourlyLabels = labels
		}

		return {
			granularity: input.granularity,
			period: input.period,
			totalMs,
			sessionCount: sessions.length,
			topEntities,
			hourlyMs,
			hourlyLabels,
		}
	}

	function getEntityExposure(
		input: UsageEntityExposureInput,
	): UsageEntityExposure {
		const direct = sessionsRepo.aggregatePrimary(
			input.entityType,
			input.entityId,
		)
		const associated = associationsRepo.aggregateAssociated(
			input.entityType,
			input.entityId,
		)

		const lastViewedAt = [direct.lastViewedAt, associated.lastViewedAt]
			.filter((v): v is number => v !== null)
			.sort((a, b) => b - a)[0]

		return {
			entityType: input.entityType,
			entityId: input.entityId,
			directMs: direct.totalMs,
			associatedMs: associated.totalMs,
			totalMs: direct.totalMs + associated.totalMs,
			viewCount: direct.viewCount,
			sessionCount: direct.viewCount + associated.sessionCount,
			lastViewedAt: lastViewedAt ?? null,
		}
	}

	function batchEntityExposure(
		input: UsageBatchEntityExposureInput,
	): UsageEntityExposure[] {
		return input.entities.map((entity) => getEntityExposure(entity))
	}

	function clearAll(): void {
		withTransaction(db, (tx) => {
			deleteAllUsageData(tx)
		})
	}

	return wrapAsync({
		recordSessionBeat,
		getTotals,
		getTotalsPage,
		getDashboard,
		getRecommendations,
		getTimeline,
		getDailySummary,
		getTrend,
		getPeriodSummary,
		getEntityExposure,
		batchEntityExposure,
		clearAll,
	})
}
