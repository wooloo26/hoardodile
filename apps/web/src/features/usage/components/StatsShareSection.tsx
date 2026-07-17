import type { UsageExposureMode, UsageTotal } from "@hoardodile/schemas"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@hoardodile/ui/components/tabs"
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { PaginationBar } from "@/components/common/PaginationBar"
import { OverviewSectionCard } from "@/features/overview/components/OverviewSectionCard"
import { useUsageTimeZones } from "@/features/settings/datePrefs"
import { formatCalendarDay } from "@/lib/timezone"
import {
	usageDailySummaryQueryOptions,
	usageDashboardQueryOptions,
	usageTotalsPageQueryOptions,
	usageTotalsQueryOptions,
	usageTrendQueryOptions,
} from "../api"
import {
	getRangeListTotalsInput,
	getRangeTrend,
	toUsageTotalsInput,
	type UsageRange,
} from "../lib/date"
import {
	buildStatsSearch,
	type LeaderboardEntityFilter,
	type StatsSearch,
	type StatsSearchPatch,
} from "../lib/statsSearch"
import {
	computePeriodTotalMs,
	computePeriodTotalViews,
	ENTITY_FILTER_OPTIONS,
	ENTITY_TYPES,
	mergeShareTotals,
	shareListOrder,
} from "../lib/statsShare"
import type { UsageDeviceFilterValue } from "./UsageDeviceFilter"
import { usageDeviceFilterParam } from "./UsageDeviceFilter"
import { UsageLeaderboardRow } from "./UsageLeaderboardRow"

const SHARE_LIST_PAGE_SIZE = 10

type StatsShareSectionProps = {
	readonly search: StatsSearch
	readonly range: UsageRange
	readonly deviceFilter: UsageDeviceFilterValue
	readonly exposureMode: UsageExposureMode
	readonly entityFilter: LeaderboardEntityFilter
}

type StaleShareView = {
	readonly items: readonly UsageTotal[]
	readonly total: number
	readonly denominator: number
	readonly metric: StatsSearch["shareMetric"]
	readonly entityFilter: LeaderboardEntityFilter
	readonly range: UsageRange
}

export function StatsShareSection(props: StatsShareSectionProps) {
	const { search, range, deviceFilter, exposureMode, entityFilter } = props
	const metric = search.shareMetric
	const page = search.sharePage ?? 1
	const { t } = useTranslation()
	const { timeZonePref, resolvedTimeZone } = useUsageTimeZones()
	const deviceId = usageDeviceFilterParam(deviceFilter)
	const navigate = useNavigate()

	const descriptionKey =
		metric === "views"
			? "usage.stats.viewShareDescription"
			: "usage.stats.shareDescription"

	const dashboardQuery = useQuery({
		...usageDashboardQueryOptions({ deviceId }),
		placeholderData: keepPreviousData,
	})

	const today = useMemo(
		() => formatCalendarDay(Date.now(), timeZonePref),
		[timeZonePref, resolvedTimeZone],
	)

	const trendInput = useMemo(
		() => getRangeTrend(range, timeZonePref),
		[range, timeZonePref, resolvedTimeZone],
	)
	const trendQuery = useQuery({
		...usageTrendQueryOptions(
			trendInput !== null
				? { ...trendInput, timeZone: timeZonePref, deviceId }
				: {
						granularity: "day",
						periods: 1,
						timeZone: timeZonePref,
						deviceId,
					},
		),
		enabled: trendInput !== null,
		placeholderData: keepPreviousData,
	})

	const dailySummaryQuery = useQuery({
		...usageDailySummaryQueryOptions({
			date: today,
			limit: 10,
			timeZone: timeZonePref,
			deviceId,
		}),
		enabled: range === "today",
		placeholderData: keepPreviousData,
	})

	const denominator = useMemo(() => {
		const periodInput = {
			range,
			dailySummary: dailySummaryQuery.data,
			dashboard: dashboardQuery.data,
			trend: trendQuery.data,
		}
		return metric === "views"
			? computePeriodTotalViews(periodInput)
			: computePeriodTotalMs(periodInput)
	}, [
		metric,
		range,
		dailySummaryQuery.data,
		dashboardQuery.data,
		trendQuery.data,
	])

	const periodInput = useMemo(
		() => getRangeListTotalsInput(range, timeZonePref),
		[range, timeZonePref, resolvedTimeZone],
	)

	const listOrder = shareListOrder(metric)

	const listTotalsBase = useMemo(
		() =>
			periodInput === null
				? null
				: {
						listTotals: periodInput,
						order: listOrder,
						timeZone: timeZonePref,
						deviceId,
						exposureMode,
					},
		[periodInput, listOrder, timeZonePref, deviceId, exposureMode],
	)

	const singleQuery = useQuery({
		...(listTotalsBase !== null
			? usageTotalsPageQueryOptions(
					toUsageTotalsInput(
						entityFilter === "all" ? "resource" : entityFilter,
						listTotalsBase.listTotals,
						{
							...listTotalsBase,
							limit: SHARE_LIST_PAGE_SIZE,
							page,
						},
					),
				)
			: usageTotalsPageQueryOptions({
					entityType: "resource",
					granularity: "all",
					order: listOrder,
					limit: SHARE_LIST_PAGE_SIZE,
					page,
					timeZone: timeZonePref,
					deviceId,
					exposureMode,
				})),
		enabled: entityFilter !== "all" && listTotalsBase !== null,
		placeholderData: keepPreviousData,
	})

	const allQueries = useQueries({
		queries: ENTITY_TYPES.map((entityType) => ({
			...(listTotalsBase !== null
				? usageTotalsQueryOptions(
						toUsageTotalsInput(entityType, listTotalsBase.listTotals, {
							...listTotalsBase,
							limit: page * SHARE_LIST_PAGE_SIZE,
						}),
					)
				: usageTotalsQueryOptions({
						entityType,
						granularity: "all",
						order: listOrder,
						limit: page * SHARE_LIST_PAGE_SIZE,
						timeZone: timeZonePref,
						deviceId,
						exposureMode,
					})),
			enabled: entityFilter === "all" && listTotalsBase !== null,
			placeholderData: keepPreviousData,
		})),
	})

	const pageState = useMemo(() => {
		if (entityFilter !== "all") {
			const data = singleQuery.data
			return {
				items: data?.rows ?? [],
				total: data?.total ?? 0,
				isLoading: singleQuery.isLoading,
			}
		}
		const merged: UsageTotal[] = []
		for (const query of allQueries) {
			if (query.data !== undefined) {
				for (const row of query.data) {
					merged.push(row)
				}
			}
		}
		const sorted = mergeShareTotals(merged, merged.length, metric)
		const start = (page - 1) * SHARE_LIST_PAGE_SIZE
		const end = start + SHARE_LIST_PAGE_SIZE
		return {
			items: sorted.slice(start, end),
			total: sorted.length,
			isLoading: allQueries.some((q) => q.isLoading),
		}
	}, [
		entityFilter,
		singleQuery.data,
		singleQuery.isLoading,
		allQueries,
		metric,
		page,
	])

	const staleViewRef = useRef<StaleShareView | null>(null)

	useEffect(() => {
		if (!pageState.isLoading && pageState.items.length > 0) {
			staleViewRef.current = {
				items: pageState.items,
				total: pageState.total,
				denominator,
				metric,
				entityFilter,
				range,
			}
		}
	}, [
		pageState.isLoading,
		pageState.items,
		pageState.total,
		denominator,
		metric,
		entityFilter,
		range,
	])

	const staleView = staleViewRef.current
	const isStale = pageState.isLoading && staleView !== null
	const displayItems = isStale ? staleView.items : pageState.items
	const displayTotal = isStale ? staleView.total : pageState.total
	const displayDenominator = isStale ? staleView.denominator : denominator

	const pageCount = Math.max(1, Math.ceil(displayTotal / SHARE_LIST_PAGE_SIZE))
	const showPagination =
		displayTotal > SHARE_LIST_PAGE_SIZE && !pageState.isLoading

	function buildShareSearch(patch: StatsSearchPatch) {
		return buildStatsSearch(search, patch)
	}

	const showSkeleton = pageState.isLoading && !isStale
	const showEmpty =
		!pageState.isLoading &&
		(displayDenominator <= 0 || displayItems.length === 0)

	return (
		<OverviewSectionCard
			title={t("usage.stats.shareSectionTitle")}
			description={t(descriptionKey)}
			data-testid="usage-share-breakdown"
		>
			<Tabs value={metric}>
				<TabsList className="h-auto w-full flex-wrap justify-start gap-1">
					<TabsTrigger value="time" asChild>
						<Link
							to="/stats"
							search={buildShareSearch({ shareMetric: "time", sharePage: 1 })}
							resetScroll={false}
							className="text-xs sm:text-sm"
						>
							{t("usage.stats.shareTitle")}
						</Link>
					</TabsTrigger>
					<TabsTrigger value="views" asChild>
						<Link
							to="/stats"
							search={buildShareSearch({ shareMetric: "views", sharePage: 1 })}
							resetScroll={false}
							className="text-xs sm:text-sm"
						>
							{t("usage.stats.viewShareTitle")}
						</Link>
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<Tabs value={entityFilter} className="mt-3">
				<TabsList className="h-auto w-full flex-wrap justify-start gap-1">
					{ENTITY_FILTER_OPTIONS.map((option) => (
						<TabsTrigger key={option.value} value={option.value} asChild>
							<Link
								to="/stats"
								search={buildShareSearch({
									entityType: option.value,
									sharePage: 1,
								})}
								resetScroll={false}
								className="text-xs sm:text-sm"
							>
								{t(option.labelKey)}
							</Link>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="relative mt-4 flex flex-col divide-y divide-border">
				{showSkeleton ? (
					<div className="flex flex-col gap-2 py-1">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-12 w-full" />
						))}
					</div>
				) : showEmpty ? (
					<p className="py-2 text-sm text-muted-foreground">
						{t("usage.leaderboard.empty")}
					</p>
				) : (
					<div className={isStale ? "opacity-50" : undefined}>
						{displayItems.map((total, index) => (
							<UsageLeaderboardRow
								key={`${total.entityType}-${total.entityId}`}
								rank={(page - 1) * SHARE_LIST_PAGE_SIZE + index + 1}
								total={total}
								metric={metric}
								denominator={displayDenominator}
								exposureMode={exposureMode}
							/>
						))}
					</div>
				)}

				{isStale && (
					<div className="absolute inset-0 z-10 flex items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				)}
			</div>

			{showPagination && (
				<div className="mt-4 flex justify-center">
					<PaginationBar
						page={page}
						pageCount={pageCount}
						onChangePage={(next) =>
							void navigate({
								to: "/stats",
								search: buildShareSearch({ sharePage: next }),
								replace: true,
								resetScroll: false,
							})
						}
					/>
				</div>
			)}
		</OverviewSectionCard>
	)
}
