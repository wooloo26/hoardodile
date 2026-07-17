import type { UsageEntityType } from "@hoardodile/schemas"
import { cn } from "@hoardodile/ui"
import { useQuery } from "@tanstack/react-query"
import { Clock, Eye } from "lucide-react"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { formatDurationMs } from "@/lib/formatDuration"
import { usageEntityExposureQueryOptions } from "../api"

type EntityUsageStatsProps = {
	readonly entityType: Extract<
		UsageEntityType,
		"resource" | "character" | "document"
	>
	readonly entityId: string
	readonly className?: string
}

export const EntityUsageStats = memo(function EntityUsageStats(
	props: EntityUsageStatsProps,
) {
	const { entityType, entityId } = props
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const exposureQuery = useQuery(
		usageEntityExposureQueryOptions({ entityType, entityId }),
	)

	if (exposureQuery.isPending) return undefined
	if (exposureQuery.isError || exposureQuery.data === undefined)
		return undefined

	const exposure = exposureQuery.data
	if (exposure.viewCount <= 0) return undefined

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-4 text-xs text-muted-foreground",
				props.className,
			)}
			data-testid={`${entityType}-usage-stats`}
		>
			<span className="inline-flex items-center gap-1.5">
				<Clock className="size-3.5" />
				{t("usage.entityExposure.totalTime", {
					duration: formatDurationMs(exposure.totalMs),
				})}
			</span>
			<span className="inline-flex items-center gap-1.5">
				<Eye className="size-3.5" />
				{t("usage.entityExposure.views", {
					count: exposure.viewCount,
				})}
			</span>
			{exposure.lastViewedAt !== null ? (
				<span>
					{t("usage.entityExposure.lastViewed", {
						time: formatter.formatDateTime(exposure.lastViewedAt),
					})}
				</span>
			) : null}
		</div>
	)
})
