import type { Codec } from "@hoardodile/plugin-sdk-web"

const SETTINGS_VERSION = 1 as const
const POSITION_VERSION = 2 as const

export type NovelBgKind = "color"

export type NovelSettings = {
	readonly v: typeof SETTINGS_VERSION
	readonly fontSize: number
	readonly lineHeight: number
	readonly letterSpacing: number
	readonly bgKind: NovelBgKind
	readonly bgColor: string
	readonly chapterRegex: string
}

/**
 * Persisted reading position. `v:2` adds `fraction` ∈ [0,1] for
 * sub-paragraph precision so long paragraphs that span multiple pages
 * restore to roughly the same text after a window resize / font change.
 */
export type NovelPosition = {
	readonly v: typeof POSITION_VERSION
	readonly filename: string
	readonly paragraphIndex: number
	readonly fraction: number
	readonly updatedAtMs: number
}

export const NOVEL_SETTINGS_KEY = "settings"

export const NOVEL_SETTINGS_DEFAULT: NovelSettings = {
	v: SETTINGS_VERSION,
	fontSize: 18,
	lineHeight: 1.8,
	letterSpacing: 0,
	bgKind: "color",
	bgColor: "#f4ecd8",
	chapterRegex: "",
}

export const NOVEL_BG_COLOR_PRESETS: readonly {
	readonly id: string
	readonly value: string
	readonly textColor: string
}[] = [
	{
		id: "paper",
		value: "#f4ecd8",
		textColor: "#3a2f1f",
	},
	{
		id: "green",
		value: "#cce8cf",
		textColor: "#1f3a23",
	},
	{
		id: "dark",
		value: "#2a2a2a",
		textColor: "#d8d8d8",
	},
	{
		id: "black",
		value: "#000000",
		textColor: "#bdbdbd",
	},
	{
		id: "white",
		value: "#ffffff",
		textColor: "#1a1a1a",
	},
] as const

export function encodeNovelSettings(value: NovelSettings): string {
	return JSON.stringify(value)
}

export function decodeNovelSettings(raw: string): NovelSettings | undefined {
	try {
		const parsed = JSON.parse(raw) as NovelSettings
		if (parsed.v !== SETTINGS_VERSION) return undefined
		return parsed
	} catch {
		return undefined
	}
}

export function encodeNovelPosition(value: NovelPosition): string {
	return JSON.stringify(value)
}

/**
 * Parse a persisted novel position. Returns `undefined` for malformed JSON
 * or unknown versions.
 */
export function decodeNovelPosition(raw: string): NovelPosition | undefined {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>
		if (parsed.v !== POSITION_VERSION) return undefined
		if (
			typeof parsed.filename !== "string" ||
			typeof parsed.paragraphIndex !== "number" ||
			typeof parsed.fraction !== "number" ||
			typeof parsed.updatedAtMs !== "number"
		) {
			return undefined
		}
		return {
			v: POSITION_VERSION,
			filename: parsed.filename,
			paragraphIndex: parsed.paragraphIndex,
			fraction: parsed.fraction,
			updatedAtMs: parsed.updatedAtMs,
		}
	} catch {
		return undefined
	}
}

/**
 * Resolve the foreground colour to use for a given background colour.
 * Falls back to the closest preset; defaults to a dark text colour
 * when the user has supplied a custom value.
 */
export function novelTextColorFor(bgColor: string): string {
	const match = NOVEL_BG_COLOR_PRESETS.find((p) => p.value === bgColor)
	if (match !== undefined) return match.textColor
	return "#1a1a1a"
}

export const novelSettingsCodec: Codec<NovelSettings> = {
	encode: encodeNovelSettings,
	decode: decodeNovelSettings,
}

export const novelPositionMaybeCodec: Codec<NovelPosition | undefined> = {
	encode: (value) => (value === undefined ? "" : encodeNovelPosition(value)),
	decode: (raw) => {
		if (raw === "") return undefined
		return decodeNovelPosition(raw)
	},
}
