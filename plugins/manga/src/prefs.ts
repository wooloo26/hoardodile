export type MangaReadingMode = "scroll" | "paged"

export type MangaSettings = {
	readonly v: 1
	readonly defaultMode: MangaReadingMode
	readonly showComments: boolean
	readonly pageDirection: "ltr" | "rtl"
}

export type MangaPosition = {
	readonly v: 1
	readonly pageIndex: number
}

export const MANGA_SETTINGS_KEY = "settings"

export const MANGA_SETTINGS_DEFAULT: MangaSettings = {
	v: 1,
	defaultMode: "scroll",
	showComments: true,
	pageDirection: "ltr",
}

export function mangaPositionKey(resId: string): string {
	return `position.${resId}`
}

export function encodeMangaSettings(value: MangaSettings): string {
	return JSON.stringify(value)
}

export function decodeMangaSettings(raw: string): MangaSettings | undefined {
	try {
		return JSON.parse(raw) as MangaSettings
	} catch {
		return undefined
	}
}

export function encodeMangaPosition(value: MangaPosition): string {
	return JSON.stringify(value)
}

export function decodeMangaPosition(raw: string): MangaPosition | undefined {
	try {
		return JSON.parse(raw) as MangaPosition
	} catch {
		return undefined
	}
}
