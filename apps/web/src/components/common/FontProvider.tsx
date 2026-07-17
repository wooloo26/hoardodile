import * as React from "react"
import { fontArrayCodec } from "@/features/prefs"
import { usePrefSync } from "@/hooks/usePrefSync"
import {
	buildFontFamily,
	loadFontCss,
	loadPresetCssList,
	PRESET_FONTS,
} from "@/lib/fonts"
import { prefKeys } from "@/lib/keys"

type FontProviderState = {
	appFonts: readonly string[]
	fontFamily: string
	setAppFonts: (fonts: string[]) => void
}

const FontProviderContext = React.createContext<FontProviderState | undefined>(
	undefined,
)

export function FontProvider({
	children,
}: {
	readonly children: React.ReactNode
}) {
	const [appFonts, setAppFonts] = usePrefSync(
		prefKeys.appFont,
		["inter"],
		fontArrayCodec,
	)

	const fontFamily = React.useMemo(() => buildFontFamily(appFonts), [appFonts])

	React.useEffect(() => {
		const root = document.documentElement
		root.style.setProperty("--font-app", fontFamily)
		loadPresetCssList(appFonts)
		// Pre-load all web-font CSS files up front. The woff2 assets live in
		// public/fonts and are served/cached by the Service Worker, so the
		// <link> injection is cheap and idempotent. This ensures fonts are
		// available immediately when a user picks them (or when a stored
		// preference is restored after refresh).
		for (const p of PRESET_FONTS) {
			if (p.cssPath) loadFontCss(p.cssPath)
		}
	}, [appFonts, fontFamily])

	const value = React.useMemo(
		() => ({ appFonts, fontFamily, setAppFonts }),
		[appFonts, fontFamily, setAppFonts],
	)

	return (
		<FontProviderContext.Provider value={value}>
			{children}
		</FontProviderContext.Provider>
	)
}

export function useFont(): FontProviderState {
	const context = React.useContext(FontProviderContext)
	if (context === undefined) {
		throw new Error("useFont must be used within a FontProvider")
	}
	return context
}
