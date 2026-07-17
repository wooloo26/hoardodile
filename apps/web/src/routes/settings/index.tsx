import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { DateTimeSettingsPanel } from "@/features/settings/DateTimeSettingsPanel"
import { FontSettingsPanel } from "@/features/settings/FontSettingsPanel"
import { LanguageSettingsPanel } from "@/features/settings/LanguageSettingsPanel"
import { SignOutSection } from "@/features/settings/SettingsPanels"
import { SettingsSection } from "@/features/settings/SettingsSection"
import { ThemeSettingsPanel } from "@/features/settings/ThemeSettingsPanel"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/settings/")({
	beforeLoad: requireAuth,
	component: AccountSettingsRoute,
})

/**
 * Account settings tab. Language, theme, font, date/time and sign-out.
 */
function AccountSettingsRoute() {
	const { t } = useTranslation()
	return (
		<div className="flex flex-col gap-5">
			<SettingsSection
				title={t("me.section.language")}
				description={t("language.description")}
			>
				<LanguageSettingsPanel />
			</SettingsSection>
			<SettingsSection
				title={t("me.section.theme")}
				description={t("theme.description")}
			>
				<ThemeSettingsPanel />
			</SettingsSection>
			<SettingsSection
				title={t("me.section.font")}
				description={t("font.description")}
			>
				<FontSettingsPanel />
			</SettingsSection>
			<SettingsSection
				title={t("me.section.dateTime")}
				description={t("dateTime.description")}
			>
				<DateTimeSettingsPanel />
			</SettingsSection>
			<SignOutSection />
		</div>
	)
}
