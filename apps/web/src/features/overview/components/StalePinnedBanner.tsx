import { Clock } from "lucide-react"
import { useTranslation } from "react-i18next"
import { CharCard } from "@/features/char/components/CharCard"
import { CharCardSkeleton } from "@/features/char/components/CharCardSkeleton"
import { ResCard } from "@/features/res/components/ResCard"
import { ResCardSkeleton } from "@/features/res/components/ResCardSkeleton"
import {
	STALE_NOT_VIEWED_DAYS,
	useStalePinnedItems,
} from "../hooks/useStalePinnedItems"
import { OverviewSectionCard } from "./OverviewSectionCard"

export { STALE_NOT_VIEWED_DAYS }

export function StalePinnedBanner() {
	const { t } = useTranslation()
	const { isVisible, isPending, staleItems } = useStalePinnedItems()

	if (!isVisible) return null

	return (
		<OverviewSectionCard
			className="border-amber-500/25 bg-amber-500/5"
			title={
				<div className="flex items-center gap-2">
					<Clock className="size-4 text-primary" />
					{t("overview.sections.staleNotViewed", {
						days: STALE_NOT_VIEWED_DAYS,
					})}
				</div>
			}
			data-testid="overview-stale-banner"
		>
			{isPending ? (
				<div className="flex min-w-0 gap-3 overflow-x-auto pb-1">
					{Array.from({ length: 3 }).map((_, i) =>
						i % 2 === 0 ? (
							<CharCardSkeleton key={i} />
						) : (
							<ResCardSkeleton key={i} />
						),
					)}
				</div>
			) : (
				<div className="flex min-w-0 gap-3 overflow-x-auto pb-1">
					{staleItems.map((item) =>
						item.kind === "character" ? (
							<CharCard
								key={`${item.kind}:${item.card.id}`}
								character={item.card}
								className="shrink-0"
							/>
						) : (
							<div
								key={`${item.kind}:${item.card.id}`}
								className="flex shrink-0 items-center"
							>
								<ResCard resource={item.card} />
							</div>
						),
					)}
				</div>
			)}
		</OverviewSectionCard>
	)
}
