/**
 * Cross-cutting key constants for apps/web.
 *
 * Values that appear in multiple features (localStorage, BroadcastChannel,
 * plugin iframe pushes, SW messages) are centralized here so they can't
 * drift out of sync.
 */

// ── Pref / localStorage keys ───────────────────────────────────────────────
// NOTE: `index.html` has a pre-hydration script that reads the same keys.
// If you change these literals you MUST update `index.html` as well.
export const prefKeys = {
	theme: "theme",
	themePalette: "themePalette",
	language: "language",
	appFont: "app.font",
	docEditorFont: "document.editorFont",
	docUiFont: "document.uiFont",
	docTreeExpanded: "document.treeExpanded",
	docBlockPositions: "document.blockPositions",
	docTheme: "document.theme",
	docLastOpened: "document.lastOpened",
	colorPresets: "colorPicker.presets",
	overviewPinnedCharacters: "overview.pinned.characters",
	overviewPinnedResources: "overview.pinned.resources",
	dateFormat: "date.format",
	timeZone: "date.timeZone",
} as const

export const storagePrefixes = {
	docDraft: "doc.draft.cache.",
} as const

export const signalPrefixes = {
	prefSync: "__bc:",
} as const

// ── BroadcastChannel names ─────────────────────────────────────────────────
export const channelNames = {
	prefSync: "hoardodile-prefsync",
	sseEvents: "hoardodile-sse-events",
} as const

/** Web Locks API name — one exclusive holder per origin for `/api/events`. */
export const lockNames = {
	sse: "hoardodile-sse",
} as const

// ── Plugin iframe HostPush keys ────────────────────────────────────────────
export const hostPushKeys = {
	languageChanged: "languageChanged",
	themeChanged: "themeChanged",
	context: "context",
	visibility: "visibility",
	prefsChanged: "prefsChanged",
	cacheChanged: "cacheChanged",
} as const

// ── ServiceWorker message types ────────────────────────────────────────────
export const swMessageTypes = {
	clearCache: "CLEAR_SW_CACHE",
} as const
