import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import { decodeMangaPageAnchor, type MangaSchema } from "../shared"

export const { PluginAPIProvider, usePluginAPI, useAnchorJump } =
	definePluginAPI<MangaSchema>({ decodeAnchor: decodeMangaPageAnchor })
