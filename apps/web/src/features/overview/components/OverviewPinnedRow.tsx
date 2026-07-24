import { Button } from "@hoardodile/ui/components/button"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { PinnedCharactersSection } from "../pinned/PinnedCharactersSection"
import { PinnedResourcesSection } from "../pinned/PinnedResourcesSection"
import {
	PINNED_REFRESH_INTERVALS,
	useOverviewPinnedCharacters,
	useOverviewPinnedRefresh,
	useOverviewPinnedResources,
} from "../pinned/useOverviewPinnedData"

export function OverviewPinnedRow() {
	const { t } = useTranslation()
	const charData = useOverviewPinnedCharacters()
	const resData = useOverviewPinnedResources()
	const { intervalSec, setIntervalSec, refresh } = useOverviewPinnedRefresh()

	const showCharacters = !charData.isPending && charData.visibleItems.length > 0
	const showResources = !resData.isPending && resData.visibleItems.length > 0
	const visibleCount = Number(showCharacters) + Number(showResources)

	if (visibleCount === 0) return null

	return (
		<div
			className="flex min-w-0 flex-col gap-2"
			data-testid="overview-pinned-row"
		>
			<div className="flex items-center justify-end gap-2">
				<DropdownSelect
					size="sm"
					value={String(intervalSec)}
					onValueChange={(value) => setIntervalSec(Number(value))}
					options={PINNED_REFRESH_INTERVALS.map((sec) => ({
						value: String(sec),
						label:
							sec === 0
								? t("overview.pinned.refresh.off")
								: t(`overview.pinned.refresh.every${sec}s`),
					}))}
					aria-label={t("overview.pinned.refresh.intervalLabel")}
					data-testid="overview-pinned-refresh-interval"
				/>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={refresh}
					aria-label={t("overview.pinned.refresh.now")}
					data-testid="overview-pinned-refresh"
				>
					<RefreshCw />
				</Button>
			</div>
			<div className="flex min-w-0 flex-col gap-6">
				{showCharacters ? (
					<div className="min-w-0">
						<PinnedCharactersSection {...charData} />
					</div>
				) : null}
				{showResources ? (
					<div className="min-w-0">
						<PinnedResourcesSection {...resData} />
					</div>
				) : null}
			</div>
		</div>
	)
}
