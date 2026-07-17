import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { AboutSection } from "@/features/settings/AboutSection"
import {
	FullscreenSection,
	RebuildPanel,
	TrashPanel,
} from "@/features/settings/SettingsPanels"
import { SettingsSection } from "@/features/settings/SettingsSection"
import { ClearUsagePanel } from "@/features/usage/components/ClearUsagePanel"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/settings/app")({
	beforeLoad: requireAuth,
	component: AppSettingsRoute,
})

/**
 * App settings tab. Fullscreen, rebuild index, trash and usage clearing.
 */
function AppSettingsRoute() {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col gap-5">
			<FullscreenSection />
			<SettingsSection
				title={t("me.section.rebuild")}
				description={t("overview.rebuildDescription")}
			>
				<RebuildPanel />
			</SettingsSection>
			<SettingsSection
				title={t("me.section.trash")}
				description={t("me.trash.description")}
			>
				<TrashPanel />
			</SettingsSection>
			<SettingsSection
				title={t("me.section.usage")}
				description={t("me.usage.description")}
				data-testid="me-section-usage"
			>
				<ClearUsagePanel />
			</SettingsSection>

			<AboutSection />
		</div>
	)
}
