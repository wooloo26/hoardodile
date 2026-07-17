import "./index.css"

import { createPluginRoot, useVisibility } from "@hoardodile/plugin-sdk-react"
import { PluginAPIProvider } from "./render/hooks"
import { NovelReader } from "./render/NovelReader"

function NovelPreview() {
	const visible = useVisibility()

	if (!visible) return undefined
	return <NovelReader open />
}

createPluginRoot({ provider: PluginAPIProvider, render: NovelPreview })
