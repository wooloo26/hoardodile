import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { cn } from "@hoardodile/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { OverviewSectionCard } from "@/features/overview/components/OverviewSectionCard"
import { useUsageTimeZones } from "@/features/settings/datePrefs"
import { formatCalendarDay } from "@/lib/timezone"
import { usageDailySummaryQueryOptions, usageTrendQueryOptions } from "../api"
import { getRangeTrend, type UsageRange } from "../lib/date"
import { HourlyDistributionChart } from "./charts/HourlyDistributionChart"
import { TrendChart } from "./charts/TrendChart"
import type { UsageDeviceFilterValue } from "./UsageDeviceFilter"
import { usageDeviceFilterParam } from "./UsageDeviceFilter"

type StatsChartsSectionProps = {
	readonly range: UsageRange
	readonly deviceFilter: UsageDeviceFilterValue
}

export function StatsChartsSection(props: StatsChartsSectionProps) {
	const { range, deviceFilter } = props
	const { t } = useTranslation()
	const { timeZonePref, resolvedTimeZone } = useUsageTimeZones()

	const deviceId = usageDeviceFilterParam(deviceFilter)

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
	})

	const dailySummaryQuery = useQuery({
		...usageDailySummaryQueryOptions({
			date: today,
			limit: 10,
			timeZone: timeZonePref,
			deviceId,
		}),
		enabled: range === "today",
	})

	const trendData = trendQuery.data
	const hasTrendData = trendData?.buckets.some((bucket) => bucket.totalMs > 0)
	const showTrendCard =
		(trendQuery.isPending && trendInput !== null) || hasTrendData

	const dailySummaryData = dailySummaryQuery.data
	const hasHourlyData = dailySummaryData?.hourlyMs.some((ms) => ms > 0)
	const showHourlyCard =
		range === "today" && (dailySummaryQuery.isPending || hasHourlyData)

	const visibleCardCount = Number(showTrendCard) + Number(showHourlyCard)

	return (
		<div
			className={cn("grid gap-6", visibleCardCount > 1 && "lg:grid-cols-2")}
			data-testid="stats-charts-section"
		>
			{showTrendCard && (
				<OverviewSectionCard
					title={t("usage.stats.trend")}
					description={t("usage.stats.trendDescription")}
				>
					{trendQuery.isPending && trendInput !== null ? (
						<Skeleton className="h-64 w-full" />
					) : hasTrendData ? (
						<div className="h-64 w-full">
							<TrendChart
								granularity={trendData!.granularity}
								data={trendData!.buckets}
								timeZone={timeZonePref}
							/>
						</div>
					) : null}
				</OverviewSectionCard>
			)}

			{showHourlyCard && (
				<OverviewSectionCard
					title={t("usage.stats.todayHourly")}
					description={t("usage.stats.todayHourlyDescription")}
				>
					{dailySummaryQuery.isPending ? (
						<Skeleton className="h-64 w-full" />
					) : hasHourlyData ? (
						<div className="h-64 w-full">
							<HourlyDistributionChart
								data={dailySummaryData!.hourlyMs}
								labels={dailySummaryData!.hourlyLabels}
							/>
						</div>
					) : null}
				</OverviewSectionCard>
			)}
		</div>
	)
}
