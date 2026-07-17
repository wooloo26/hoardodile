import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type { PluginManifestId, SearchMeta } from "@hoardodile/schemas"

export type BuildSearchMetaInput = {
	readonly contentPluginId: PluginManifestId
	readonly api: ResourceAPI
}

/**
 * Strategy that turns a resource's `source/` directory into a
 * {@link SearchMeta}. Returns `undefined` when the plugin has no
 * `searchMeta` method or the folder is empty/unreadable.
 */
export type SearchMetaBuilder = (
	input: BuildSearchMetaInput,
) => Promise<SearchMeta | undefined>
