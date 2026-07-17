import type { PluginSchema } from "@hoardodile/plugin-sdk-types"
import type { WebPluginAPI } from "@hoardodile/plugin-sdk-web"
import type { Provider } from "react"
import { useContext } from "react"
import { PluginAPIContext } from "./context.tsx"

/**
 * Define a typed plugin API context. The schema is declared once at module
 * level — every consumer below gets properly typed access without repeating
 * generics.
 *
 * The returned provider and hook share the same React context as the default
 * {@link PluginAPIProvider}, so plugin roots created by `createPluginRoot`
 * automatically satisfy typed consumers when the same provider is passed in.
 *
 * ```typescript
 * interface GallerySchema { file: GalleryFile; sourceMeta: GallerySourceMeta; searchMeta: GallerySearchMeta }
 * const { PluginAPIProvider, usePluginAPI } = definePluginAPI<GallerySchema>()
 *
 * function Viewer() {
 *   const api = usePluginAPI()
 *   const { data: files } = api.useFileList()
 *   // files → readonly GalleryFile[] | undefined
 * }
 * ```
 */
export function definePluginAPI<
	TSchema extends PluginSchema = PluginSchema,
>(): {
	readonly PluginAPIProvider: Provider<WebPluginAPI<TSchema> | null>
	readonly usePluginAPI: () => WebPluginAPI<TSchema>
} {
	function useTypedPluginAPI(): WebPluginAPI<TSchema> {
		const api = useContext(PluginAPIContext)
		if (api === null) {
			throw new Error("usePluginAPI must be used within a PluginAPIProvider")
		}
		return api as WebPluginAPI<TSchema>
	}

	return {
		PluginAPIProvider:
			PluginAPIContext.Provider as Provider<WebPluginAPI<TSchema> | null>,
		usePluginAPI: useTypedPluginAPI,
	}
}
