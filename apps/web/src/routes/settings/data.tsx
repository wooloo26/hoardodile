import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { DataHistoryPanel } from "@/features/data-history"
import { SettingsSection } from "@/features/settings/SettingsSection"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/settings/data")({
	beforeLoad: requireAuth,
	component: DataSettingsRoute,
})

/**
 * Data settings tab. Backup history and restore.
 */
function DataSettingsRoute() {
	const { t } = useTranslation()
	return (
		<SettingsSection
			title={t("dataHistory.title")}
			description={t("dataHistory.description")}
			data-testid="data-history-section"
		>
			<DataHistoryPanel />
		</SettingsSection>
	)
}
