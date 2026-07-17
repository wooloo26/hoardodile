import { LibraryOverviewCard } from "./components/LibraryOverviewCard"
import { OverviewActivityPanel } from "./components/OverviewActivityPanel"
import { OverviewHero } from "./components/OverviewHero"
import { OverviewPinnedRow } from "./components/OverviewPinnedRow"
import { StalePinnedBanner } from "./components/StalePinnedBanner"

/**
 * Overview dashboard layout. Each section owns its state, query, and loading
 * skeleton so sorting or tab changes in one area do not re-render the rest.
 */
export function OverviewDashboard() {
	return (
		<div className="flex flex-col gap-6">
			<OverviewHero />

			<LibraryOverviewCard />

			<OverviewPinnedRow />

			<OverviewActivityPanel />

			<StalePinnedBanner />
		</div>
	)
}
