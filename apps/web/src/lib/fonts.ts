/**
 * Font registry and dynamic CSS loader.
 *
 * Preset fonts ship woff2 files under `apps/web/public/fonts` and are
 * loaded on demand via `<link>`. Users can also type arbitrary font names.
 */

export type FontPreset = {
	readonly id: string
	readonly name: string
	readonly family: string
	readonly cssPath?: string
	readonly i18nKey: string
}

/** The classic Chinese-friendly sans-serif system stack. Used by the reset
 *  button to quickly restore a sensible default font-family. */
export const SYSTEM_FONT_TAGS: readonly string[] = [
	"Helvetica Neue",
	"Helvetica",
	"PingFang SC",
	"Hiragino Sans GB",
	"Microsoft YaHei",
	"Arial",
	"sans-serif",
] as const

// ── Web fonts ──────────────────────────────────────────────────────────────

const WEB_FONTS: readonly FontPreset[] = [
	{
		id: "inter",
		name: "Inter",
		family: "Inter",
		cssPath: "/fonts/inter-5.2.8/index.css",
		i18nKey: "font.presets.inter",
	},
	{
		id: "lxgw-wenkai",
		name: "LXGW WenKai",
		family: "LXGW WenKai",
		cssPath: "/fonts/lxgw-wenkai-webfont-1.7.0/style.css",
		i18nKey: "font.presets.lxgw-wenkai",
	},
	{
		id: "lxgw-wenkai-mono",
		name: "LXGW WenKai Mono",
		family: "LXGW WenKai Mono",
		cssPath: "/fonts/lxgw-wenkai-webfont-1.7.0/lxgwwenkaimono-regular.css",
		i18nKey: "font.presets.lxgw-wenkai-mono",
	},
	{
		id: "source-sans-3",
		name: "Source Sans 3",
		family: "Source Sans 3",
		cssPath: "/fonts/source-sans-3-5.2.9/index.css",
		i18nKey: "font.presets.source-sans-3",
	},
] as const

// ── Extra system font tags (no CSS to load, just family names) ─────────────

export const EXTRA_FONT_TAGS: readonly string[] = [
	"Verdana",
	"Georgia",
	"Times New Roman",
	"Courier New",
	"Consolas",
	"Garamond",
	"Trebuchet MS",
	"Impact",
	"Comic Sans MS",
	"monospace",
	"serif",
] as const

// ── Preset lookup ──────────────────────────────────────────────────────────

export const PRESET_FONTS: readonly FontPreset[] = WEB_FONTS

const PRESET_BY_ID = new Map<string, FontPreset>()
const PRESET_BY_NAME = new Map<string, FontPreset>()
for (const p of PRESET_FONTS) {
	PRESET_BY_ID.set(p.id, p)
	PRESET_BY_NAME.set(p.name, p)
}

export function getPresetById(id: string): FontPreset | undefined {
	return PRESET_BY_ID.get(id)
}

export function getPresetByName(name: string): FontPreset | undefined {
	return PRESET_BY_NAME.get(name)
}

export function getPresetByIdOrName(key: string): FontPreset | undefined {
	return PRESET_BY_ID.get(key) ?? PRESET_BY_NAME.get(key)
}

// ── CSS helpers ────────────────────────────────────────────────────────────

/** Build a CSS `font-family` value from an ordered list of font identifiers. */
export function buildFontFamily(names: readonly string[]): string {
	if (names.length === 0) return ""
	const parts = names.map((n) => getPresetByIdOrName(n)?.family ?? n)
	return parts.join(", ")
}

/** Get the CSS path for a preset font by its id or display name. */
export function getPresetCssPath(key: string): string | undefined {
	return getPresetByIdOrName(key)?.cssPath
}

/** Load CSS for a preset font if it exists. Idempotent. */
export function loadPresetCss(key: string): void {
	const path = getPresetCssPath(key)
	if (path !== undefined) loadFontCss(path)
}

/** Load multiple preset CSS files. Idempotent per path. */
export function loadPresetCssList(keys: readonly string[]): void {
	const seen = new Set<string>()
	for (const key of keys) {
		const path = getPresetCssPath(key)
		if (path !== undefined && !seen.has(path)) {
			seen.add(path)
			loadFontCss(path)
		}
	}
}

/** Dynamically inject a `<link rel="stylesheet">`. Idempotent. */
export function loadFontCss(path: string): void {
	if (typeof document === "undefined") return
	const selector = `link[rel="stylesheet"][href="${path}"]`
	if (document.querySelector(selector) !== null) return
	const link = document.createElement("link")
	link.rel = "stylesheet"
	link.href = path
	document.head.appendChild(link)
}
