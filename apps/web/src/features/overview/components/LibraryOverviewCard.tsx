import type { UsageEntityType, UsageTotal } from "@hoardodile/schemas"
import { Link } from "@tanstack/react-router"
import { FileText, Images } from "lucide-react"
import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CharThumb } from "@/features/char/components/CharThumb"
import { useDateFormatter } from "@/features/settings/datePrefs"
import {
	entityDetailHref,
	useUsageEntityName,
} from "@/features/usage/components/UsageEntityRow"
import { useRecentViewedTotals } from "../hooks/useRecentViewedTotals"
import { RecentViewedDialog } from "./RecentViewedDialog"

const RECENT_VIEWED_PREVIEW_LIMIT = 6

function entityTypeIcon(entityType: UsageEntityType) {
	switch (entityType) {
		case "resource":
			return Images
		default:
			return FileText
	}
}

const RecentViewedCardItemMedia = memo(
	function RecentViewedCardItemMedia(props: {
		readonly item: UsageTotal
		readonly name: string | undefined
	}) {
		if (props.item.entityType === "character") {
			return (
				<CharThumb
					charId={props.item.entityId}
					variant="avatar"
					cacheKey={props.item.updatedAt}
					name={props.name}
					className="size-6 shrink-0 rounded-md"
					hoverOverlay={false}
				/>
			)
		}

		const Icon = entityTypeIcon(props.item.entityType)
		return (
			<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<Icon className="size-3.5" />
			</div>
		)
	},
)

const RecentViewedCardItem = memo(function RecentViewedCardItem(props: {
	readonly item: UsageTotal
	readonly testId?: string
}) {
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const { name, isPending: isNamePending } = useUsageEntityName(
		props.item.entityType,
		props.item.entityId,
	)
	const href = entityDetailHref(props.item.entityType, props.item.entityId)
	const viewedAt =
		props.item.lastViewedAt !== null
			? formatter.formatDateTime(props.item.lastViewedAt)
			: t("overview.recentViewed.unknownTime")

	const content = (
		<>
			<RecentViewedCardItemMedia item={props.item} name={name} />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm text-foreground">
					{name ?? props.item.entityId}
				</p>
				<p className="truncate text-xs text-muted-foreground">{viewedAt}</p>
			</div>
		</>
	)

	if (isNamePending) {
		return (
			<div
				className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5"
				data-testid={props.testId}
			>
				<div className="size-6 shrink-0 rounded-md bg-muted" />
				<div className="min-w-0 flex-1 space-y-1">
					<div className="h-3 w-2/3 rounded bg-muted" />
					<div className="h-2.5 w-1/3 rounded bg-muted" />
				</div>
			</div>
		)
	}

	if (href === undefined) {
		return (
			<div
				className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5"
				data-testid={props.testId}
			>
				{content}
			</div>
		)
	}

	return (
		<Link to={href} className="block w-full min-w-0" data-testid={props.testId}>
			<div className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent">
				{content}
			</div>
		</Link>
	)
})

function RecentViewedEmptyState() {
	const { t } = useTranslation()
	return (
		<div className="flex w-full flex-col gap-2 py-2">
			<p className="text-sm text-muted-foreground">
				{t("overview.recentViewed.emptyPrompt")}
			</p>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
				<Link
					to="/resources"
					className="text-primary hover:underline"
					data-testid="overview-recent-viewed-browse"
				>
					{t("overview.recentViewed.browseResources")}
				</Link>
				<Link
					to="/resources/new"
					className="text-primary hover:underline"
					data-testid="overview-recent-viewed-upload"
				>
					{t("overview.recentViewed.uploadResource")}
				</Link>
			</div>
		</div>
	)
}

function RecentViewedItemWrapper(props: {
	readonly children: React.ReactNode
}) {
	return (
		<div className="flex min-h-12 w-[calc(50%-0.25rem)] min-w-0 shrink-0 snap-start items-center sm:w-full">
			{props.children}
		</div>
	)
}

function RecentViewedListContainer(props: {
	readonly children: React.ReactNode
}) {
	return (
		<div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
			{props.children}
		</div>
	)
}

export function LibraryOverviewCard() {
	const { t } = useTranslation()
	const [dialogOpen, setDialogOpen] = useState(false)
	const { items, isPending } = useRecentViewedTotals()

	const previewItems = items.slice(0, RECENT_VIEWED_PREVIEW_LIMIT)
	const hasMore = items.length > RECENT_VIEWED_PREVIEW_LIMIT

	return (
		<>
			<div
				className="flex flex-col gap-3"
				data-testid="overview-library-overview-card"
			>
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-sm font-semibold">
						{t("overview.libraryOverview.title")}
					</h2>
					{!isPending && hasMore ? (
						<button
							type="button"
							onClick={() => setDialogOpen(true)}
							className="text-xs text-primary hover:underline"
							data-testid="overview-recent-viewed-view-all"
						>
							{t("overview.viewAll")}
						</button>
					) : null}
				</div>

				<div className="min-w-0">
					{isPending ? (
						<RecentViewedListContainer>
							{Array.from({ length: RECENT_VIEWED_PREVIEW_LIMIT }).map(
								(_, i) => (
									<RecentViewedItemWrapper key={i}>
										<div className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5">
											<div className="size-6 shrink-0 rounded-md bg-muted" />
											<div className="min-w-0 flex-1 space-y-1">
												<div className="h-3 w-2/3 rounded bg-muted" />
												<div className="h-2.5 w-1/3 rounded bg-muted" />
											</div>
										</div>
									</RecentViewedItemWrapper>
								),
							)}
						</RecentViewedListContainer>
					) : previewItems.length === 0 ? (
						<RecentViewedEmptyState />
					) : (
						<RecentViewedListContainer>
							{previewItems.map((item, index) => (
								<RecentViewedItemWrapper
									key={`${item.entityType}:${item.entityId}`}
								>
									<RecentViewedCardItem
										item={item}
										testId={`overview-recent-viewed-item-${index}`}
									/>
								</RecentViewedItemWrapper>
							))}
						</RecentViewedListContainer>
					)}
				</div>
			</div>

			<RecentViewedDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				items={items}
			/>
		</>
	)
}
