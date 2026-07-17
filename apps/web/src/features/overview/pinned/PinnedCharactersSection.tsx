import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@hoardodile/ui/components/tabs"
import type { UseQueryResult } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Pin } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { CharCardListResult } from "@/features/char/api"
import { CharCard } from "@/features/char/components/CharCard"
import { CharCardSkeleton } from "@/features/char/components/CharCardSkeleton"
import { OverviewSectionCard } from "../components/OverviewSectionCard"
import { PinnedSectionSkeleton } from "./PinnedSectionSkeleton"
import type { PinnedSectionItem } from "./types"
import type { PinnedCharacterItemData } from "./usePinnedSectionData"

const DEFAULT_SIZE = 6

function PinnedCharacterContent({
	item,
	query,
}: {
	readonly item: PinnedSectionItem
	readonly query: UseQueryResult<CharCardListResult, Error>
}) {
	const { t } = useTranslation()

	const isPending = query.isPending
	const rows = query.data?.rows ?? []
	const isEmpty = !isPending && rows.length === 0

	return (
		<div className="min-w-0">
			{isPending ? (
				<div className="flex min-w-0 gap-4 overflow-x-auto pb-2">
					{Array.from({ length: item.size ?? DEFAULT_SIZE }).map((_, i) => (
						<div key={i} className="shrink-0">
							<CharCardSkeleton />
						</div>
					))}
				</div>
			) : isEmpty ? (
				<p className="text-sm text-muted-foreground">
					{t("overview.pinned.charactersEmpty")}
				</p>
			) : (
				<div className="flex min-w-0 gap-4 overflow-x-auto pb-2">
					{rows.map((character) => (
						<CharCard
							key={character.id}
							character={character}
							className="shrink-0"
						/>
					))}
				</div>
			)}
		</div>
	)
}

export function PinnedCharactersSection({
	visibleItems,
	isPending,
}: {
	readonly visibleItems: PinnedCharacterItemData[]
	readonly isPending: boolean
}) {
	const { t } = useTranslation()

	const [activeId, setActiveId] = useState<string | undefined>(
		visibleItems[0]?.item.id,
	)
	useEffect(() => {
		setActiveId((prev) => {
			const found = visibleItems.find(({ item }) => item.id === prev)
			return found?.item.id ?? visibleItems[0]?.item.id
		})
	}, [visibleItems])

	if (isPending) {
		return (
			<PinnedSectionSkeleton data-testid="overview-pinned-characters-loading">
				<div className="flex min-w-0 gap-4 overflow-x-auto pb-2">
					{Array.from({ length: DEFAULT_SIZE }).map((_, i) => (
						<div key={i} className="shrink-0">
							<CharCardSkeleton />
						</div>
					))}
				</div>
			</PinnedSectionSkeleton>
		)
	}

	if (visibleItems.length === 0) return null

	const isSingle = visibleItems.length === 1
	const activeEntry =
		visibleItems.find(({ item }) => item.id === activeId) ?? visibleItems[0]
	if (activeEntry === undefined) return null

	const sectionTitle = isSingle
		? (activeEntry.item.title ?? t("overview.pinned.charactersTitle"))
		: t("overview.pinned.charactersTitle")

	const viewAllSearch = {
		query: activeEntry.item.query,
		tagIds: activeEntry.item.tagIds ? [...activeEntry.item.tagIds] : undefined,
		tagMode: activeEntry.item.tagMode,
		sortBy: activeEntry.item.sortBy,
		order: activeEntry.item.order,
		random: activeEntry.item.random,
		traitFilters: activeEntry.item.traitFilters
			? [...activeEntry.item.traitFilters]
			: undefined,
		searchIntro: activeEntry.item.searchIntro,
		relationshipTypeIds: activeEntry.item.relationshipTypeIds
			? [...activeEntry.item.relationshipTypeIds]
			: undefined,
	}

	return (
		<OverviewSectionCard
			className="min-w-0"
			title={
				<div className="flex items-center gap-2">
					<Pin className="size-4 text-primary" />
					{sectionTitle}
				</div>
			}
			action={
				<Link
					to="/characters"
					search={viewAllSearch}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t("overview.viewAll")}
				</Link>
			}
			data-testid="overview-pinned-characters"
		>
			{isSingle ? (
				<PinnedCharacterContent
					item={activeEntry.item}
					query={activeEntry.query}
				/>
			) : (
				<Tabs value={activeId} onValueChange={setActiveId}>
					<TabsList className="h-auto w-full flex-wrap justify-start">
						{visibleItems.map(({ item }) => (
							<TabsTrigger key={item.id} value={item.id} className="gap-1.5">
								{item.title ?? t("overview.pinned.charactersTitle")}
							</TabsTrigger>
						))}
					</TabsList>
					{visibleItems.map(({ item, query }) => (
						<TabsContent key={item.id} value={item.id} className="mt-4">
							<PinnedCharacterContent item={item} query={query} />
						</TabsContent>
					))}
				</Tabs>
			)}
		</OverviewSectionCard>
	)
}
