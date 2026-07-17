import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import type { TemplateSchema } from "./shared"

export const { PluginAPIProvider, usePluginAPI } =
	definePluginAPI<TemplateSchema>()
