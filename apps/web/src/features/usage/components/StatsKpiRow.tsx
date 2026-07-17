import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Surface } from "@hoardodile/ui/components/surface"
import { cn } from "@hoardodile/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Clock, Equal, TrendingDown, TrendingUp } from "lucide-react"
import type { ComponentType } from "react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useUsageTimeZones } from "@/features/settings/datePrefs"
import { formatDurationMs } from "@/lib/formatDuration"
import { formatCalendarDay } from "@/lib/timezone"
import {
	usageDailySummaryQueryOptions,
	usageDashboardQueryOptions,
	usageTrendQueryOptions,
} from "../api"
import { getRangeTrend, type UsageRange } from "../lib/date"
import { computePeriodTotalMs } from "../lib/statsShare"
import {
	computeUsageInsight,
	getUsageInsightComparison,
	getUsageInsightTrendInput,
} from "../lib/usageInsight"
import type { UsageDeviceFilterValue } from "./UsageDeviceFilter"
import { usageDeviceFilterParam } from "./UsageDeviceFilter"

type StatsKpiRowProps = {
	readonly range: UsageRange
	readonly deviceFilter: UsageDeviceFilterValue
}

export function StatsKpiRow(props: StatsKpiRowProps) {
	const { range, deviceFilter } = props
	const { t } = useTranslation()
	const { timeZonePref, resolvedTimeZone } = useUsageTimeZones()

	const deviceId = usageDeviceFilterParam(deviceFilter)

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

	const comparison = getUsageInsightComparison(range)
	const insightTrendInput = getUsageInsightTrendInput(range)
	const insightTrendQuery = useQuery({
		...usageTrendQueryOptions(
			insightTrendInput !== null
				? { ...insightTrendInput, timeZone: timeZonePref, deviceId }
				: {
						granularity: "day",
						periods: 1,
						timeZone: timeZonePref,
						deviceId,
					},
		),
		enabled: insightTrendInput !== null && comparison !== null,
		placeholderData: keepPreviousData,
	})

	const insight = useMemo(() => {
		if (comparison === null || insightTrendQuery.data === undefined) return null
		return computeUsageInsight(
			insightTrendQuery.data.buckets,
			comparison.comparisonKey,
			range,
		)
	}, [comparison, insightTrendQuery.data])

	const totalMs = useMemo(
		() =>
			computePeriodTotalMs({
				range,
				dailySummary: dailySummaryQuery.data,
				dashboard: dashboardQuery.data,
				trend: trendQuery.data,
			}),
		[range, dailySummaryQuery.data, dashboardQuery.data, trendQuery.data],
	)

	const isTotalPending =
		range === "today"
			? dailySummaryQuery.isPending
			: range === "all"
				? dashboardQuery.isPending
				: trendQuery.isPending

	let insightLabel: string | undefined
	let InsightIcon: ComponentType<{ className?: string }> = Equal
	if (insight !== null) {
		const comparisonLabel = t(insight.comparisonKey)
		if (insight.deltaMs === 0) {
			insightLabel = t("usage.insight.sameAsPeriod", {
				period: comparisonLabel,
			})
			InsightIcon = Equal
		} else if (insight.deltaMs > 0) {
			insightLabel = t("usage.insight.moreThanPeriod", {
				duration: formatDurationMs(insight.deltaMs),
				period: comparisonLabel,
			})
			InsightIcon = TrendingUp
		} else {
			insightLabel = t("usage.insight.lessThanPeriod", {
				duration: formatDurationMs(Math.abs(insight.deltaMs)),
				period: comparisonLabel,
			})
			InsightIcon = TrendingDown
		}
	}

	return (
		<div
			className={cn(
				"grid gap-3",
				insight !== null ? "sm:grid-cols-2" : "grid-cols-1",
			)}
			data-testid="stats-kpi-row"
		>
			<StatsMetricCard
				icon={Clock}
				label={t("usage.stats.totalTime")}
				value={formatDurationMs(totalMs)}
				isPending={isTotalPending}
				testId="stats-kpi-total-time"
			/>
			{insight !== null ? (
				<StatsMetricCard
					icon={InsightIcon}
					label={t("usage.stats.periodComparison")}
					value={insightLabel}
					isPending={insightTrendQuery.isPending}
					testId="stats-kpi-insight"
				/>
			) : null}
		</div>
	)
}

type StatsMetricCardProps = {
	readonly icon: ComponentType<{ className?: string }>
	readonly label: string
	readonly value: string | undefined
	readonly isPending: boolean
	readonly testId?: string
	readonly className?: string
}

function StatsMetricCard(props: StatsMetricCardProps) {
	const Icon = props.icon
	return (
		<Surface
			size="compact"
			className={cn("flex items-center gap-3", props.className)}
			data-testid={props.testId}
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<Icon className="size-5" />
			</div>
			<div className="min-w-0 flex flex-col gap-0.5">
				{props.isPending ? (
					<>
						<Skeleton className="h-7 w-24" />
						<Skeleton className="h-3 w-16" />
					</>
				) : (
					<>
						<span className="text-xl font-semibold leading-tight tabular-nums sm:text-2xl">
							{props.value ?? "—"}
						</span>
						<span className="text-xs text-muted-foreground">{props.label}</span>
					</>
				)}
			</div>
		</Surface>
	)
}
