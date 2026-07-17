import { traitFilter } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Pin } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { CHARACTER_SEARCH_DEFAULTS, CharSearchRouted } from "@/features/char"
import { PinnedSectionSettingsDialog } from "@/features/overview/pinned/PinnedSectionSettingsDialog"
import { pinnedSectionListCodec } from "@/features/overview/pinned/pinnedSectionListCodec"
import type {
	PinnedFilterConfig,
	PinnedSectionItem,
} from "@/features/overview/pinned/types"
import { usePrefSync } from "@/hooks/usePrefSync"
import { useRouteSearchState } from "@/hooks/useRouteSearchState"
import { requireAuth } from "@/lib/auth-guard"
import { prefKeys } from "@/lib/keys"

const charsSearchSchema = z
	.object({
		query: z.string().optional(),
		page: z.coerce.number().int().min(1).optional(),
		tagIds: z.array(z.string()).optional(),
		tagMode: z.enum(["and", "or", "not", "nor"]).optional(),
		sortBy: z.enum(["created", "updated"]).optional(),
		order: z.enum(["asc", "desc"]).optional(),
		random: z.coerce.boolean().optional(),
		showOnlySelected: z.coerce.boolean().optional(),
		trash: z.coerce.boolean().optional(),
		searchIntro: z.coerce.boolean().optional(),
		traitFilters: z.array(traitFilter).optional(),
		relationshipTypeIds: z.array(z.string()).optional(),
	})
	.loose()

export const Route = createFileRoute("/characters/")({
	beforeLoad: requireAuth,
	validateSearch: charsSearchSchema,
	component: CharsListRoute,
})

function CharsListRoute() {
	const [bulkSelectMode, setBulkSelectMode] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const { t } = useTranslation()
	const [searchState] = useRouteSearchState(CHARACTER_SEARCH_DEFAULTS)

	const [pinnedItems, setPinnedItems] = usePrefSync(
		prefKeys.overviewPinnedCharacters,
		[] as readonly PinnedSectionItem[],
		pinnedSectionListCodec,
	)

	const currentFilters: PinnedFilterConfig = {
		query: searchState.query,
		tagIds: searchState.tagIds,
		tagMode: searchState.tagMode,
		traitFilters: searchState.traitFilters,
		searchIntro: searchState.searchIntro,
		relationshipTypeIds: searchState.relationshipTypeIds,
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
				title={t("characters.title")}
				actions={
					<Button asChild data-testid="new-character">
						<Link to="/characters/new">{t("characters.new")}</Link>
					</Button>
				}
			/>
			<CharSearchRouted
				bulkSelectMode={bulkSelectMode}
				onBulkSelectModeChange={setBulkSelectMode}
				toolbarLeadingActions={
					!bulkSelectMode ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setSettingsOpen(true)}
							data-testid="character-pin-overview-settings"
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
				sectionTitle={t("characters.title")}
				entityType="character"
				items={pinnedItems}
				currentFilters={currentFilters}
				onChange={handleSave}
			/>
		</PageScaffold>
	)
}
