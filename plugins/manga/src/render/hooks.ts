import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import type { MangaSchema } from "../shared"

export const { PluginAPIProvider, usePluginAPI } =
	definePluginAPI<MangaSchema>()
