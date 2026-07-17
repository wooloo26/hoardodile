import "./index.css"

import { createPluginRoot, useVisibility } from "@hoardodile/plugin-sdk-react"
import { PluginAPIProvider } from "./render/hooks"
import { MangaReader } from "./render/MangaReader"

function MangaPreview() {
	const visible = useVisibility()

	if (!visible) return undefined
	return <MangaReader />
}

createPluginRoot({ provider: PluginAPIProvider, render: MangaPreview })
