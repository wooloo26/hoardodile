import type { UsageTotal } from "@hoardodile/schemas"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PaginationBar } from "@/components/common/PaginationBar"
import { RECENT_VIEWED_DIALOG_PAGE_SIZE } from "../lib/recentViewedConstants"
import { RecentViewedListItem } from "./RecentViewedListItem"

type RecentViewedDialogProps = {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly items: readonly UsageTotal[]
}

export function RecentViewedDialog(props: RecentViewedDialogProps) {
	const { open, onOpenChange, items } = props
	const { t } = useTranslation()
	const [page, setPage] = useState(1)

	useEffect(() => {
		if (open) setPage(1)
	}, [open])

	const pageCount = Math.max(
		1,
		Math.ceil(items.length / RECENT_VIEWED_DIALOG_PAGE_SIZE),
	)
	const pageItems = useMemo(() => {
		const start = (page - 1) * RECENT_VIEWED_DIALOG_PAGE_SIZE
		return items.slice(start, start + RECENT_VIEWED_DIALOG_PAGE_SIZE)
	}, [items, page])

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("overview.recentViewed.dialogTitle")}
			contentClassName="sm:max-w-lg"
			contentTestId="overview-recent-viewed-dialog"
		>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{t("overview.empty.recentViewed")}
				</p>
			) : (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						{pageItems.map((item) => (
							<RecentViewedListItem
								key={`${item.entityType}:${item.entityId}`}
								item={item}
								linkTarget="_blank"
								testId={`overview-recent-viewed-dialog-${item.entityType}-${item.entityId}`}
							/>
						))}
					</div>
					{pageCount > 1 ? (
						<PaginationBar
							page={page}
							pageCount={pageCount}
							onChangePage={setPage}
						/>
					) : null}
				</div>
			)}
		</AppDialog>
	)
}
