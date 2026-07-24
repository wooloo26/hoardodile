import { definePluginAPI } from "@hoardodile/plugin-sdk-react"
import { decodeVideoTimeAnchor, type GallerySchema } from "./shared"

export const { PluginAPIProvider, usePluginAPI, useAnchorJump } =
	definePluginAPI<GallerySchema>({ decodeAnchor: decodeVideoTimeAnchor })
