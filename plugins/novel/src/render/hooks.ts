import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import type { NovelSchema } from "../shared"

export const { PluginAPIProvider, usePluginAPI } =
	definePluginAPI<NovelSchema>()
