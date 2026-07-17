import type { UsageExposureMode, UsageTotal } from "@hoardodile/schemas"
import { cn } from "@hoardodile/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { formatDurationMs } from "@/lib/formatDuration"
import type { ShareMetric } from "../lib/statsShare"
import { entityDetailHref, UsageEntityLeaderboardLabel } from "./UsageEntityRow"

export type { ShareMetric }

type UsageLeaderboardRowProps = {
	readonly rank: number
	readonly total: UsageTotal
	readonly metric: ShareMetric
	readonly denominator: number
	readonly exposureMode: UsageExposureMode
	readonly variant?: "default" | "compact"
}

function metricValue(metric: ShareMetric, total: UsageTotal): number {
	if (metric === "time") {
		return total.totalMs
	}
	return total.viewCount
}

function metricLabel(
	metric: ShareMetric,
	total: UsageTotal,
	exposureMode: UsageExposureMode,
	t: ReturnType<typeof useTranslation>["t"],
): string {
	if (metric === "time") {
		return formatDurationMs(total.totalMs)
	}
	if (exposureMode === "associated") {
		return t("usage.leaderboard.associatedSessionsShort", {
			count: total.viewCount,
		})
	}
	return t("usage.leaderboard.viewsShort", { count: total.viewCount })
}

export function UsageLeaderboardRow(props: UsageLeaderboardRowProps) {
	const {
		rank,
		total,
		metric,
		denominator,
		exposureMode,
		variant = "default",
	} = props
	const { t } = useTranslation()
	const href = entityDetailHref(total.entityType, total.entityId)
	const value = metricValue(metric, total)
	const sharePct =
		denominator > 0 ? Math.round((value / denominator) * 1000) / 10 : 0
	const barWidth =
		denominator > 0 ? Math.max(2, Math.round((value / denominator) * 100)) : 0

	const content =
		variant === "compact" ? (
			<div className="flex min-w-0 items-center gap-3 px-3 py-2">
				<span
					className={cn(
						"w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground",
						rank <= 3 && "font-semibold text-foreground",
					)}
				>
					<span className="sr-only">
						{t("usage.leaderboard.rankLabel", { rank })}
					</span>
					{rank}
				</span>
				<div className="min-w-0 flex-1 truncate text-sm">
					<UsageEntityLeaderboardLabel
						entityType={total.entityType}
						entityId={total.entityId}
					/>
				</div>
				<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
					{metricLabel(metric, total, exposureMode, t)}
				</span>
			</div>
		) : (
			<div className="flex flex-col gap-1.5 px-4 py-2">
				<div className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] items-center gap-3">
					<span
						className={cn(
							"text-right text-sm tabular-nums text-muted-foreground",
							rank <= 3 && "font-semibold text-foreground",
						)}
					>
						<span className="sr-only">
							{t("usage.leaderboard.rankLabel", { rank })}
						</span>
						{rank}
					</span>
					<div className="min-w-0">
						<div className="h-2 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary transition-all"
								style={{ width: `${barWidth}%` }}
							/>
						</div>
					</div>
					<span className="text-right text-sm font-medium tabular-nums text-muted-foreground">
						{sharePct}%
					</span>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-9 text-xs text-muted-foreground">
					<UsageEntityLeaderboardLabel
						entityType={total.entityType}
						entityId={total.entityId}
					/>
					<span aria-hidden>·</span>
					<span className="shrink-0 tabular-nums">
						{metricLabel(metric, total, exposureMode, t)}
					</span>
				</div>
			</div>
		)

	if (href !== undefined) {
		return (
			<Link to={href} className="block transition-colors hover:bg-accent/50">
				{content}
			</Link>
		)
	}

	return <div>{content}</div>
}
