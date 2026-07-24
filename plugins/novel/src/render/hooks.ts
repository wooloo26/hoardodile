import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import { decodeNovelParagraphAnchor, type NovelSchema } from "../shared"

export const { PluginAPIProvider, usePluginAPI, useAnchorJump } =
	definePluginAPI<NovelSchema>({ decodeAnchor: decodeNovelParagraphAnchor })
