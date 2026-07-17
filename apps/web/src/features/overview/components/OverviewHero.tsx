import { OverviewSearchBar } from "@/features/search/components/OverviewSearchBar"
import { TodayUsageCard } from "../sections/TodayUsageCard"
import { LibraryStatStrip } from "./LibraryStatStrip"

export function OverviewHero() {
	return (
		<header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<OverviewSearchBar className="mx-0 px-0 py-0 max-w-full" />
				<LibraryStatStrip />
			</div>
			<TodayUsageCard variant="compact" />
		</header>
	)
}
