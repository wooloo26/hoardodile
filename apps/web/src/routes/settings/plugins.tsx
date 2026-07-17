import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PluginSettingsPanel } from "@/features/plugin"
import { SettingsSection } from "@/features/settings/SettingsSection"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/settings/plugins")({
	beforeLoad: requireAuth,
	component: PluginsSettingsRoute,
})

/**
 * Plugin settings tab. Manage installed plugins.
 */
function PluginsSettingsRoute() {
	const { t } = useTranslation()
	return (
		<SettingsSection
			title={t("me.section.plugins")}
			description={t("plugins.description")}
		>
			<PluginSettingsPanel />
		</SettingsSection>
	)
}
