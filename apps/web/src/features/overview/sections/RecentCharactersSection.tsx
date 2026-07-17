import type { SortBy } from "@hoardodile/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { charListCardsQueryOptions } from "@/features/char/api"
import { CharCard } from "@/features/char/components/CharCard"
import { CharCardSkeleton } from "@/features/char/components/CharCardSkeleton"
import { RecentSection } from "../components/RecentSection"
import { SectionSortToggle } from "../components/SectionSortToggle"
import { StatCard } from "../components/StatCard"

const RECENT_CHARACTERS_SIZE = 6

type RecentCharactersSectionProps = {
	readonly mode: "summary" | "list"
	readonly presentation?: "standalone" | "embedded"
}

export function RecentCharactersSection(props: RecentCharactersSectionProps) {
	const presentation = props.presentation ?? "standalone"
	const { t } = useTranslation()
	const [sortBy, setSortBy] = useState<SortBy>("updated")

	const { data, isPending } = useQuery(
		charListCardsQueryOptions({
			query: "",
			page: 1,
			size: RECENT_CHARACTERS_SIZE,
			sortBy,
			order: "desc",
		}),
	)

	if (props.mode === "summary") {
		return (
			<StatCard
				to="/characters"
				icon={Users}
				count={data?.total ?? 0}
				label={t("overview.stats.characters")}
				testId="overview-stat-characters"
				variant="plain"
			/>
		)
	}

	const toolbar = (
		<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
			<SectionSortToggle
				sortBy={sortBy}
				onChange={setSortBy}
				testId="overview-character-sort"
			/>
			<Link
				to="/characters"
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
				{Array.from({ length: RECENT_CHARACTERS_SIZE }).map((_, i) => (
					<CharCardSkeleton key={i} />
				))}
			</div>
		) : data.rows.length === 0 ? (
			<p className="text-sm text-muted-foreground">
				{t("overview.empty.characters")}
			</p>
		) : (
			<div className="flex gap-4 overflow-x-auto pb-2">
				{data.rows.map((character) => (
					<CharCard
						key={character.id}
						character={character}
						className="shrink-0"
					/>
				))}
			</div>
		)

	if (presentation === "embedded") {
		return (
			<div data-testid="overview-activity-characters">
				{toolbar}
				{listContent}
			</div>
		)
	}

	return (
		<RecentSection
			title={t("overview.sections.recentCharacters")}
			viewAllTo="/characters"
			viewAllSearch={{ sortBy, order: "desc" }}
			viewAllLabel={t("overview.viewAll")}
			isEmpty={data?.rows.length === 0}
			emptyText={t("overview.empty.characters")}
			actions={
				<SectionSortToggle
					sortBy={sortBy}
					onChange={setSortBy}
					testId="overview-character-sort"
				/>
			}
		>
			{listContent}
		</RecentSection>
	)
}
