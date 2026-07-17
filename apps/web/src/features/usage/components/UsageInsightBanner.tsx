import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useUsageTimeZones } from "@/features/settings/datePrefs"
import { formatDurationMs } from "@/lib/formatDuration"
import { usageTrendQueryOptions } from "../api"
import type { UsageRange } from "../lib/date"
import {
	computeUsageInsight,
	getUsageInsightComparison,
	getUsageInsightTrendInput,
} from "../lib/usageInsight"
import type { UsageDeviceFilterValue } from "./UsageDeviceFilter"
import { usageDeviceFilterParam } from "./UsageDeviceFilter"

type UsageInsightBannerProps = {
	readonly range: UsageRange
	readonly deviceFilter: UsageDeviceFilterValue
}

export function UsageInsightBanner(props: UsageInsightBannerProps) {
	const { range, deviceFilter } = props
	const { t } = useTranslation()
	const { timeZonePref } = useUsageTimeZones()

	const comparison = getUsageInsightComparison(range)
	const trendInput = getUsageInsightTrendInput(range)

	const deviceId = usageDeviceFilterParam(deviceFilter)

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
		enabled: trendInput !== null && comparison !== null,
	})

	const insight = useMemo(() => {
		if (comparison === null || trendQuery.data === undefined) return null
		return computeUsageInsight(
			trendQuery.data.buckets,
			comparison.comparisonKey,
		)
	}, [comparison, trendQuery.data])

	if (insight === null) return undefined

	const comparisonLabel = t(insight.comparisonKey)
	const message =
		insight.deltaMs === 0
			? t("usage.insight.sameAsPeriod", { period: comparisonLabel })
			: insight.deltaMs > 0
				? t("usage.insight.moreThanPeriod", {
						duration: formatDurationMs(insight.deltaMs),
						period: comparisonLabel,
					})
				: t("usage.insight.lessThanPeriod", {
						duration: formatDurationMs(Math.abs(insight.deltaMs)),
						period: comparisonLabel,
					})

	return (
		<p
			className="text-sm text-muted-foreground"
			data-testid="usage-insight-banner"
		>
			{message}
		</p>
	)
}
