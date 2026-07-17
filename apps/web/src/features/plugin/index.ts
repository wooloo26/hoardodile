export { claim, setPoolContainer } from "./iframe/iframe-pool"
export { PluginIframePoolHost } from "./iframe/PluginIframePoolHost"
export {
	clearAllResCache,
	invalidateResCache,
	preloadCacheByResId,
} from "./iframe/plugin-cache-preload"
export {
	type UsePluginIframeSlotOptions,
	type UsePluginIframeSlotResult,
	usePluginIframeSlot,
} from "./iframe/use-iframe-slot"
export {
	renderSearchKindIcon,
	renderSearchKindLabel,
	resolveManifestDescription,
	resolveManifestName,
} from "./manifestText"
export {
	PluginListProvider,
	usePluginList,
} from "./PluginListContext"
export { PluginSettingsPanel } from "./PluginSettingsPanel"
export {
	pluginCacheListByResId,
	pluginCacheRemoveAllByPluginMutation,
	pluginCacheRemoveAllMutation,
	pluginKeys,
	pluginListAllQueryOptions,
	pluginPrefRemoveAllByPluginMutation,
	pluginPrefRemoveAllMutation,
	pluginReorderMutation,
	pluginRescanMutation,
	pluginUpdateMutation,
	systemPrefRemoveAllMutation,
} from "./pluginApi"
