import { PinnedCharactersSection } from "../pinned/PinnedCharactersSection"
import { PinnedResourcesSection } from "../pinned/PinnedResourcesSection"
import {
	useOverviewPinnedCharacters,
	useOverviewPinnedResources,
} from "../pinned/useOverviewPinnedData"

export function OverviewPinnedRow() {
	const charData = useOverviewPinnedCharacters()
	const resData = useOverviewPinnedResources()

	const showCharacters = !charData.isPending && charData.visibleItems.length > 0
	const showResources = !resData.isPending && resData.visibleItems.length > 0
	const visibleCount = Number(showCharacters) + Number(showResources)

	if (visibleCount === 0) return null

	return (
		<div
			className="flex min-w-0 flex-col gap-6"
			data-testid="overview-pinned-row"
		>
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
	)
}
