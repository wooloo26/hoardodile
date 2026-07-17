import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import type { FileSchema } from "./shared"

export const { PluginAPIProvider, usePluginAPI } = definePluginAPI<FileSchema>()
