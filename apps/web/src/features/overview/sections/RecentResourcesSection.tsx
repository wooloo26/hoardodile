import type { SortBy } from "@hoardodile/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Images } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { resListCardsQueryOptions } from "@/features/res/api"
import { ResCard } from "@/features/res/components/ResCard"
import { ResCardSkeleton } from "@/features/res/components/ResCardSkeleton"
import { RecentSection } from "../components/RecentSection"
import { SectionSortToggle } from "../components/SectionSortToggle"
import { StatCard } from "../components/StatCard"

const RECENT_RESOURCES_SIZE = 6

type RecentResourcesSectionProps = {
	readonly mode: "summary" | "list"
	readonly presentation?: "standalone" | "embedded"
}

export function RecentResourcesSection(props: RecentResourcesSectionProps) {
	const presentation = props.presentation ?? "standalone"
	const { t } = useTranslation()
	const [sortBy, setSortBy] = useState<SortBy>("updated")

	const { data, isPending } = useQuery(
		resListCardsQueryOptions({
			query: "",
			page: 1,
			size: RECENT_RESOURCES_SIZE,
			sortBy,
			order: "desc",
		}),
	)

	if (props.mode === "summary") {
		return (
			<StatCard
				to="/resources"
				icon={Images}
				count={data?.total ?? 0}
				label={t("overview.stats.resources")}
				testId="overview-stat-resources"
				variant="plain"
			/>
		)
	}

	const toolbar = (
		<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
			<SectionSortToggle
				sortBy={sortBy}
				onChange={setSortBy}
				testId="overview-resource-sort"
			/>
			<Link
				to="/resources"
				search={{ sortBy, order: "desc" }}
				className="text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				{t("overview.viewAll")}
			</Link>
		</div>
	)

	const listContent =
		isPending || data === undefined ? (
			<div className="flex gap-4 overflow-x-auto pb-2">
				{Array.from({ length: RECENT_RESOURCES_SIZE }).map((_, i) => (
					<ResCardSkeleton key={i} />
				))}
			</div>
		) : data.rows.length === 0 ? (
			<p className="text-sm text-muted-foreground">
				{t("overview.empty.resources")}
			</p>
		) : (
			<div className="flex gap-4 overflow-x-auto pb-2">
				{data.rows.map((resource) => (
					<div key={resource.id} className="flex items-start">
						<ResCard resource={resource} />
					</div>
				))}
			</div>
		)

	if (presentation === "embedded") {
		return (
			<div data-testid="overview-activity-resources">
				{toolbar}
				{listContent}
			</div>
		)
	}

	return (
		<RecentSection
			title={t("overview.sections.recentResources")}
			viewAllTo="/resources"
			viewAllSearch={{ sortBy, order: "desc" }}
			viewAllLabel={t("overview.viewAll")}
			isEmpty={data?.rows.length === 0}
			emptyText={t("overview.empty.resources")}
			actions={
				<SectionSortToggle
					sortBy={sortBy}
					onChange={setSortBy}
					testId="overview-resource-sort"
				/>
			}
		>
			{listContent}
		</RecentSection>
	)
}
