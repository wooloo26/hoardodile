import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { cn } from "@hoardodile/ui/lib/utils"
import { useTranslation } from "react-i18next"
import { FontPicker } from "@/components/common/FontPicker"
import { useFont } from "@/components/common/FontProvider"
import { THEME_PALETTES } from "@/components/common/ThemeProvider"
import { useDocTheme } from "@/features/doc/hooks/useDocPrefs"
import { fontArrayCodec } from "@/features/prefs"
import { usePrefSync } from "@/hooks/usePrefSync"
import { prefKeys } from "@/lib/keys"

export type DocAppearanceSettingsDialogProps = {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}

/**
 * Unified appearance dialog for the document area.
 *
 * Groups theme (palette / inherit) and font (editor + UI stacks) settings
 * that were previously split into two separate dialogs.
 */
export function DocAppearanceSettingsDialog(
	props: DocAppearanceSettingsDialogProps,
) {
	const { t } = useTranslation()
	const { theme, themeClass, setTheme } = useDocTheme()
	const { appFonts, fontFamily } = useFont()
	const [editorFonts, setEditorFonts] = usePrefSync(
		prefKeys.docEditorFont,
		[],
		fontArrayCodec,
	)
	const [uiFonts, setUiFonts] = usePrefSync(
		prefKeys.docUiFont,
		[],
		fontArrayCodec,
	)

	function handleThemeChange(next: string) {
		if (next === "inherit") {
			setTheme("inherit")
			return
		}
		for (const palette of THEME_PALETTES) {
			if (palette.id === next) {
				setTheme(palette.id)
				return
			}
		}
	}

	return (
		<AppDialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			contentClassName={cn(
				"doc max-h-[90svh] max-w-lg overflow-y-auto",
				themeClass,
			)}
			title={t("documents.appearanceSettings.title")}
			footer={null}
		>
			<div className="flex flex-col gap-6 py-2">
				<section className="flex flex-col gap-3">
					<h3 className="text-sm font-medium">
						{t("documents.appearanceSettings.theme")}
					</h3>
					<DropdownSelect
						value={theme}
						onValueChange={handleThemeChange}
						options={[
							{
								value: "inherit",
								label: t("documents.appearanceSettings.inherit"),
							},
							...THEME_PALETTES.map((palette) => ({
								value: palette.id,
								label: t(palette.labelKey),
							})),
						]}
						placeholder={t("documents.appearanceSettings.theme")}
						aria-label={t("documents.appearanceSettings.theme")}
						data-testid="doc-theme-select"
					/>
				</section>

				<section className="flex flex-col gap-3">
					<h3 className="text-sm font-medium">
						{t("documents.appearanceSettings.editorFont")}
					</h3>
					<p className="text-xs text-muted-foreground">
						{t("documents.appearanceSettings.editorFontDescription")}
					</p>
					<FontPicker
						value={editorFonts}
						onChange={setEditorFonts}
						includeInherit
						inheritedFonts={appFonts}
						inheritedFamily={fontFamily}
						data-testid="doc-editor-font-picker"
						aria-label={t("documents.appearanceSettings.editorFont")}
					/>
				</section>

				<section className="flex flex-col gap-3">
					<h3 className="text-sm font-medium">
						{t("documents.appearanceSettings.uiFont")}
					</h3>
					<p className="text-xs text-muted-foreground">
						{t("documents.appearanceSettings.uiFontDescription")}
					</p>
					<FontPicker
						value={uiFonts}
						onChange={setUiFonts}
						includeInherit
						inheritedFonts={appFonts}
						inheritedFamily={fontFamily}
						data-testid="doc-ui-font-picker"
						aria-label={t("documents.appearanceSettings.uiFont")}
					/>
				</section>
			</div>
		</AppDialog>
	)
}
