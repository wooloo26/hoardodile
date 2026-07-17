import type { UsageEntityType, UsageTotal } from "@hoardodile/schemas"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useDateFormatter } from "@/features/settings/datePrefs"
import {
	entityDetailHref,
	useUsageEntityName,
} from "@/features/usage/components/UsageEntityRow"

type RecentViewedListItemProps = {
	readonly item: UsageTotal
	readonly linkTarget?: "_self" | "_blank"
	readonly testId?: string
}

function entityTypeLabelKey(
	entityType: UsageEntityType,
):
	| "usage.leaderboard.entityResources"
	| "usage.leaderboard.entityCharacters"
	| "usage.leaderboard.entityDocuments" {
	if (entityType === "character") {
		return "usage.leaderboard.entityCharacters"
	}
	if (entityType === "document") {
		return "usage.leaderboard.entityDocuments"
	}
	return "usage.leaderboard.entityResources"
}

export function RecentViewedListItem(props: RecentViewedListItemProps) {
	const { item, linkTarget = "_self", testId } = props
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const { name, isPending: isNamePending } = useUsageEntityName(
		item.entityType,
		item.entityId,
	)
	const href = entityDetailHref(item.entityType, item.entityId)
	const typeLabel = t(entityTypeLabelKey(item.entityType))
	const displayName = name ?? item.entityId

	if (isNamePending) {
		return <Skeleton className="h-8 w-full" data-testid={testId} />
	}
	const viewedAt =
		item.lastViewedAt !== null
			? formatter.formatDateTime(item.lastViewedAt)
			: t("overview.recentViewed.unknownTime")

	const row = (
		<>
			<span className="min-w-0 flex-1 truncate">
				<span className="text-muted-foreground">{typeLabel}</span>
				<span aria-hidden> · </span>
				<span className="text-foreground">{displayName}</span>
			</span>
			<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
				{viewedAt}
			</span>
		</>
	)

	const className =
		"flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"

	if (href === undefined) {
		return (
			<div className={className} data-testid={testId}>
				{row}
			</div>
		)
	}

	if (linkTarget === "_blank") {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
				data-testid={testId}
			>
				{row}
			</a>
		)
	}

	return (
		<Link to={href} className={className} data-testid={testId}>
			{row}
		</Link>
	)
}
