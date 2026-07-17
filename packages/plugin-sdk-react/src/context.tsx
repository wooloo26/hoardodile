import type { WebPluginAPI } from "@hoardodile/plugin-sdk-web"
import { createContext, useContext } from "react"

export const PluginAPIContext = createContext<WebPluginAPI | null>(null)

export const PluginAPIProvider = PluginAPIContext.Provider

export function usePluginAPI(): WebPluginAPI {
	const api = useContext(PluginAPIContext)
	if (api === null) {
		throw new Error("usePluginAPI must be used within a PluginAPIProvider")
	}
	return api
}
