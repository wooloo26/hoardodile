import { useCallback, useMemo } from "react"
import {
	THEME_PALETTES,
	type ThemePalette,
} from "@/components/common/ThemeProvider"
import { booleanCodec } from "@/features/prefs"
import { usePrefSync } from "@/hooks/usePrefSync"
import { prefKeys } from "@/lib/keys"
import { clampZoomIndex, ZOOM_DEFAULT_INDEX, ZOOM_STEPS } from "../prefs.ts"

const DOC_AUTOSAVE_PREF_KEY = "document.autosave"
const DOC_READING_PREF_KEY = "document.reading"
const DOC_INDENT_PREF_KEY = "document.indent"
const DOC_ZOOM_PREF_KEY = "document.zoom"

export type DocPrefs = {
	readonly autosaveEnabled: boolean
	readonly readingMode: boolean
	readonly indentEnabled: boolean
	readonly fontSizeIndex: number
	readonly toggleAutosave: (onPostFlush: () => void) => void
	readonly toggleReadingMode: (onPostFlush: () => void) => void
	readonly toggleIndent: () => void
	readonly adjustFontSize: (delta: number) => void
	readonly resetFontSize: () => void
	readonly clearTransientDirty: () => void
}

/**
 * Persists the four per-document settings (autosave, reading mode, indent,
 * zoom) through {@link prefSync} so they read instantly from localStorage
 * and sync to the server in the background.
 */
export function useDocumentPrefs(args: {
	readonly clearTransientDirty: () => void
}): DocPrefs {
	const { clearTransientDirty } = args
	const [autosaveEnabled, setAutosave] = usePrefSync(
		DOC_AUTOSAVE_PREF_KEY,
		false,
		booleanCodec(),
	)
	const [readingMode, setReadingMode] = usePrefSync(
		DOC_READING_PREF_KEY,
		false,
		booleanCodec(),
	)
	const [indentEnabled, setIndentEnabled] = usePrefSync(
		DOC_INDENT_PREF_KEY,
		true,
		booleanCodec(),
	)
	const [fontSizeIndex, setFontSizeIndex] = usePrefSync(
		DOC_ZOOM_PREF_KEY,
		String(ZOOM_DEFAULT_INDEX),
	)

	const zoomIndex = clampZoomIndex(
		Number.parseInt(fontSizeIndex, 10) || ZOOM_DEFAULT_INDEX,
	)

	const toggleAutosave = useCallback(
		function toggleAutosave(onPostFlush: () => void) {
			const next = !autosaveEnabled
			setAutosave(next)
			if (next) onPostFlush()
		},
		[autosaveEnabled, setAutosave],
	)

	const toggleReadingMode = useCallback(
		function toggleReadingMode(onPostFlush: () => void) {
			const next = !readingMode
			if (next) onPostFlush()
			setReadingMode(next)
			// BlockNote can emit a spurious onChange when its `editable` flag
			// flips. Suppress any pending dirty signal from the transition.
			if (typeof window !== "undefined") {
				window.requestAnimationFrame(clearTransientDirty)
			}
		},
		[readingMode, setReadingMode, clearTransientDirty],
	)

	const toggleIndent = useCallback(
		function toggleIndent() {
			setIndentEnabled(!indentEnabled)
		},
		[indentEnabled, setIndentEnabled],
	)

	const adjustFontSize = useCallback(
		function adjustFontSize(delta: number) {
			const next = clampZoomIndex(zoomIndex + delta)
			if (next === zoomIndex) return
			setFontSizeIndex(String(next))
		},
		[zoomIndex, setFontSizeIndex],
	)

	const resetFontSize = useCallback(
		function resetFontSize() {
			if (zoomIndex === ZOOM_DEFAULT_INDEX) return
			setFontSizeIndex(String(ZOOM_DEFAULT_INDEX))
		},
		[zoomIndex, setFontSizeIndex],
	)

	return {
		autosaveEnabled,
		readingMode,
		indentEnabled,
		fontSizeIndex: zoomIndex,
		toggleAutosave,
		toggleReadingMode,
		toggleIndent,
		adjustFontSize,
		resetFontSize,
		clearTransientDirty,
	}
}

export function zoomLevelAt(index: number): number {
	return ZOOM_STEPS[clampZoomIndex(index)] ?? 1
}

export type DocThemePreference = "inherit" | ThemePalette

const DOC_THEME_PREF_KEY = prefKeys.docTheme

function isThemePalette(value: string): value is ThemePalette {
	for (const palette of THEME_PALETTES) {
		if (palette.id === value) return true
	}
	return false
}

function normalizeDocTheme(value: string): DocThemePreference {
	if (value === "inherit") return "inherit"
	if (isThemePalette(value)) return value
	return "gold-celadon"
}

/**
 * Reads the per-document-area theme preference.
 *
 * - `"inherit"` follows the global web theme.
 * - Any registered palette applies that palette locally within the
 *   documents area (and to portaled overlays that re-apply the class).
 *
 * Defaults to `"gold-celadon"` so the knowledge base keeps its gold-celadon
 * look unless the user explicitly opts into another palette.
 */
export function useDocTheme(): {
	readonly theme: DocThemePreference
	readonly themeClass: string | undefined
	readonly setTheme: (theme: DocThemePreference) => void
} {
	const [raw, setRaw] = usePrefSync(DOC_THEME_PREF_KEY, "gold-celadon")
	const theme = useMemo(() => normalizeDocTheme(raw), [raw])

	const themeClass = useMemo(() => {
		if (theme === "inherit") return undefined
		return `theme-${theme}`
	}, [theme])

	const setTheme = useCallback(
		function setTheme(next: DocThemePreference) {
			setRaw(next)
		},
		[setRaw],
	)

	return { theme, themeClass, setTheme }
}
