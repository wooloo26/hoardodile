import { Button } from "@hoardodile/ui/components/button"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Pin } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { PinnedSectionSettingsDialog } from "@/features/overview/pinned/PinnedSectionSettingsDialog"
import { pinnedSectionListCodec } from "@/features/overview/pinned/pinnedSectionListCodec"
import type {
	PinnedFilterConfig,
	PinnedSectionItem,
} from "@/features/overview/pinned/types"
import { ResSearchRouted } from "@/features/res"
import {
	RESOURCE_SEARCH_DEFAULTS,
	resSearchUrlSchema,
} from "@/features/res/utils/searchState"
import { usePrefSync } from "@/hooks/usePrefSync"
import { useRouteSearchState } from "@/hooks/useRouteSearchState"
import { requireAuth } from "@/lib/auth-guard"
import { prefKeys } from "@/lib/keys"

export const Route = createFileRoute("/resources/")({
	beforeLoad: requireAuth,
	validateSearch: resSearchUrlSchema,
	pendingMs: Number.POSITIVE_INFINITY,
	component: ResourcesListRoute,
})

function ResourcesListRoute() {
	const { t } = useTranslation()
	const [bulkSelectMode, setBulkSelectMode] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [searchState] = useRouteSearchState(RESOURCE_SEARCH_DEFAULTS)

	const [pinnedItems, setPinnedItems] = usePrefSync(
		prefKeys.overviewPinnedResources,
		[] as readonly PinnedSectionItem[],
		pinnedSectionListCodec,
	)

	const currentFilters: PinnedFilterConfig = {
		query: searchState.query,
		tagIds: searchState.tagIds,
		tagMode: searchState.tagMode,
		noCharacters: searchState.noCharacters,
		contentPluginId:
			searchState.contentPluginId === ""
				? undefined
				: searchState.contentPluginId,
		searchMetaFacets:
			Object.keys(searchState.searchMetaFacets).length > 0
				? searchState.searchMetaFacets
				: undefined,
		searchIntro: searchState.searchIntro,
		sortBy: searchState.sortBy,
		order: searchState.order,
		random: searchState.random,
	}

	function handleSave(nextItems: readonly PinnedSectionItem[]) {
		setPinnedItems(nextItems)
	}

	return (
		<PageScaffold>
			<PageHeader
				title={t("resources.title")}
				actions={
					<Button asChild data-testid="open-create-resource">
						<Link to="/resources/new">{t("resources.upload")}</Link>
					</Button>
				}
			/>
			<ResSearchRouted
				bulkSelectMode={bulkSelectMode}
				onBulkSelectModeChange={setBulkSelectMode}
				toolbarLeadingActions={
					!bulkSelectMode ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setSettingsOpen(true)}
							data-testid="resource-pin-overview-settings"
						>
							<Pin className="mr-1 size-4" />
							{t("appShell.nav.overview")}
						</Button>
					) : null
				}
			/>
			<PinnedSectionSettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				sectionTitle={t("resources.title")}
				entityType="resource"
				items={pinnedItems}
				currentFilters={currentFilters}
				onChange={handleSave}
			/>
		</PageScaffold>
	)
}
