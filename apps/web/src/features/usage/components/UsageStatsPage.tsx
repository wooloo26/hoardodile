import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { usageDashboardQueryOptions } from "../api"
import {
	buildStatsSearch,
	normalizeStatsSearch,
	type StatsSearch,
	type StatsSearchPatch,
} from "../lib/statsSearch"
import { StatsChartsSection } from "./StatsChartsSection"
import { StatsKpiRow } from "./StatsKpiRow"
import { StatsShareSection } from "./StatsShareSection"
import { StatsToolbar } from "./StatsToolbar"

export type UsageStatsSearch = StatsSearch

type UsageStatsPageProps = {
	readonly search: Partial<StatsSearch>
}

export function UsageStatsPage(props: UsageStatsPageProps) {
	const search = normalizeStatsSearch(props.search)
	const navigate = useNavigate()

	const deviceListQuery = useQuery({
		...usageDashboardQueryOptions(),
		placeholderData: keepPreviousData,
	})

	function updateSearch(patch: StatsSearchPatch): void {
		const next = buildStatsSearch(search, patch)
		void navigate({
			to: "/stats",
			search: next,
			replace: true,
			resetScroll: false,
		})
	}

	return (
		<div className="flex flex-col gap-6">
			<StatsToolbar
				search={search}
				knownDeviceIds={deviceListQuery.data?.deviceIds ?? []}
				onSearchChange={updateSearch}
			/>

			<StatsKpiRow range={search.range} deviceFilter={search.device} />

			<StatsChartsSection range={search.range} deviceFilter={search.device} />

			<StatsShareSection
				search={search}
				range={search.range}
				deviceFilter={search.device}
				exposureMode={search.exposureMode}
				entityFilter={search.entityType ?? "all"}
			/>
		</div>
	)
}
