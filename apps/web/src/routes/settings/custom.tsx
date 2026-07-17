import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { CatsAndTagsPanel } from "@/features/cat/CatsAndTagsPanel"
import { RelationshipTypesMePanel } from "@/features/char/components/RelationshipTypesMePanel"
import { ColManagementPanel } from "@/features/col/ColManagementPanel"
import { SettingsSection } from "@/features/settings/SettingsSection"
import { TraitManagementPanel } from "@/features/traits/TraitManagementPanel"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/settings/custom")({
	beforeLoad: requireAuth,
	component: CustomSettingsRoute,
})

/**
 * Customization settings tab. Categories/tags, traits, relationship types
 * and collections.
 */
function CustomSettingsRoute() {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col gap-5">
			<SettingsSection
				title={t("me.section.categoriesTags")}
				description={t("categories.panel.description")}
			>
				<CatsAndTagsPanel />
			</SettingsSection>
			<div className="flex flex-col gap-5">
				<SettingsSection
					title={t("me.section.traits")}
					description={t("traits.panel.description")}
				>
					<TraitManagementPanel />
				</SettingsSection>
				<SettingsSection
					title={t("me.section.relationshipTypes")}
					description={t("relationshipTypes.panel.description")}
					data-testid="me-relationship-types"
				>
					<RelationshipTypesMePanel />
				</SettingsSection>
				<SettingsSection
					title={t("me.section.collections")}
					description={t("collections.panel.description")}
				>
					<ColManagementPanel />
				</SettingsSection>
			</div>
		</div>
	)
}
