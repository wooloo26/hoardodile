import type { UsageExposureMode } from "@hoardodile/schemas"
import type { UsageRange } from "./date"
import type { ShareMetric } from "./statsShare"

export type LeaderboardEntityFilter =
	| "all"
	| "resource"
	| "character"
	| "document"
	| "plugin"

/** Normalized `/stats` search params (matches route validateSearch). */
export type StatsRouteSearch = {
	readonly range: UsageRange
	readonly device: string
	readonly exposureMode: UsageExposureMode
	readonly shareMetric: ShareMetric
	readonly entityType?: LeaderboardEntityFilter
	readonly sharePage?: number
}

export type StatsSearch = StatsRouteSearch

export type StatsSearchPatch = Partial<StatsRouteSearch>

export const DEFAULT_STATS_SEARCH = {
	range: "last7days",
	device: "all",
	exposureMode: "direct",
	shareMetric: "time",
	entityType: "all",
	sharePage: 1,
} as const satisfies StatsSearch

export function normalizeStatsSearch(
	search: Partial<StatsSearch>,
): StatsSearch {
	const range = search.range ?? DEFAULT_STATS_SEARCH.range
	const device = search.device ?? DEFAULT_STATS_SEARCH.device
	const exposureMode = search.exposureMode ?? DEFAULT_STATS_SEARCH.exposureMode
	const shareMetric = search.shareMetric ?? DEFAULT_STATS_SEARCH.shareMetric
	const entityType = search.entityType ?? DEFAULT_STATS_SEARCH.entityType
	const sharePage =
		typeof search.sharePage === "number" && search.sharePage > 0
			? search.sharePage
			: DEFAULT_STATS_SEARCH.sharePage

	return {
		range,
		device,
		exposureMode,
		shareMetric,
		entityType,
		sharePage,
	}
}

export function buildStatsSearch(
	current: Partial<StatsSearch>,
	patch: StatsSearchPatch,
): StatsRouteSearch {
	return normalizeStatsSearch({ ...normalizeStatsSearch(current), ...patch })
}
