import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
	THEME_PALETTES,
	type ThemePalette,
	useTheme,
} from "@/components/common/ThemeProvider"

const MODE_OPTIONS = [
	{ id: "light", icon: Sun, labelKey: "theme.mode.light" },
	{ id: "dark", icon: Moon, labelKey: "theme.mode.dark" },
	{ id: "system", icon: Monitor, labelKey: "theme.mode.system" },
] as const satisfies readonly {
	readonly id: "light" | "dark" | "system"
	readonly icon: typeof Sun
	readonly labelKey: string
}[]

type ThemeMode = (typeof MODE_OPTIONS)[number]["id"]

/**
 * Settings panel for picking the active hardcoded theme palette and
 * the light/dark mode. Each palette ships paired light + dark
 * stylesheets; the mode toggle (including `system`) flips between
 * them without forcing the user to change palette.
 */
export function ThemeSettingsPanel() {
	const { t } = useTranslation()
	const { theme, setTheme, palette, setPalette } = useTheme()

	function handleThemeChange(next: string) {
		if (isThemeMode(next)) setTheme(next)
	}

	function handlePaletteChange(next: string) {
		if (isThemePalette(next)) setPalette(next)
	}

	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-3">
				<h3 className="text-xs font-medium text-muted-foreground">
					{t("theme.paletteLabel")}
				</h3>
				<DropdownSelect
					value={palette}
					onValueChange={handlePaletteChange}
					options={THEME_PALETTES.map((p) => ({
						value: p.id,
						label: t(p.labelKey),
					}))}
					placeholder={t("theme.paletteLabel")}
					aria-label={t("theme.paletteLabel")}
					data-testid="theme-palette-select"
				/>
			</section>
			<section className="flex flex-col gap-3">
				<h3 className="text-xs font-medium text-muted-foreground">
					{t("theme.modeLabel")}
				</h3>
				<ToggleGroup
					type="single"
					value={theme}
					onValueChange={handleThemeChange}
					variant="outline"
					className="flex-wrap justify-start"
					role="radiogroup"
					aria-label={t("theme.modeLabel")}
				>
					{MODE_OPTIONS.map((opt) => {
						const Icon = opt.icon
						return (
							<ToggleGroupItem
								key={opt.id}
								value={opt.id}
								role="radio"
								aria-checked={opt.id === theme}
								data-testid={`theme-mode-${opt.id}`}
								className="gap-2 px-3"
							>
								<Icon className="size-4" />
								{t(opt.labelKey)}
							</ToggleGroupItem>
						)
					})}
				</ToggleGroup>
			</section>
		</div>
	)
}

function isThemeMode(value: string): value is ThemeMode {
	for (const option of MODE_OPTIONS) {
		if (option.id === value) return true
	}
	return false
}

function isThemePalette(value: string): value is ThemePalette {
	for (const palette of THEME_PALETTES) {
		if (palette.id === value) return true
	}
	return false
}
