import type { PluginSchema } from "@hoardodile/plugin-sdk-types"
import type { AnchorData, WebPluginAPI } from "@hoardodile/plugin-sdk-web"
import type { Provider } from "react"
import { useContext, useEffect, useRef } from "react"
import { PluginAPIContext } from "./context.tsx"

/**
 * Anchor delivered to plugin code after validation: the plugin-defined
 * data payload is always present and already decoded.
 */
export type PluginAnchor<TSchema extends PluginSchema> = {
	readonly data: TSchema["anchor"]
}

export type DefinePluginAPIOptions<TSchema extends PluginSchema> = {
	/**
	 * Validate incoming anchor data (host → plugin) against the schema's
	 * `anchor` slot. Anchors that fail decoding are dropped silently and
	 * never reach the `useAnchorJump` callback. Declare this whenever the
	 * schema declares an `anchor` type.
	 */
	readonly decodeAnchor?: (data: unknown) => TSchema["anchor"] | undefined
}

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
 * interface GallerySchema { file: GalleryFile; sourceMeta: GallerySourceMeta; anchor: VideoTimeAnchor }
 * const { PluginAPIProvider, usePluginAPI, useAnchorJump } = definePluginAPI<GallerySchema>({
 *   decodeAnchor: decodeVideoTimeAnchor,
 * })
 *
 * function Viewer() {
 *   const api = usePluginAPI()
 *   const { data: files } = api.useFileList()
 *   // files → readonly GalleryFile[] | undefined
 * }
 * ```
 */
export function definePluginAPI<TSchema extends PluginSchema = PluginSchema>(
	options?: DefinePluginAPIOptions<TSchema>,
): {
	readonly PluginAPIProvider: Provider<WebPluginAPI<TSchema> | null>
	readonly usePluginAPI: () => WebPluginAPI<TSchema>
	readonly useAnchorJump: (cb: (anchor: PluginAnchor<TSchema>) => void) => void
} {
	const decodeAnchor = options?.decodeAnchor

	function useTypedPluginAPI(): WebPluginAPI<TSchema> {
		const api = useContext(PluginAPIContext)
		if (api === null) {
			throw new Error("usePluginAPI must be used within a PluginAPIProvider")
		}
		// SDK boundary: the shared context stores the base API; the schema
		// slots narrow it for this plugin. Declared once here so consumers
		// stay cast-free.
		return api as unknown as WebPluginAPI<TSchema>
	}

	/**
	 * Typed variant of the standalone `useAnchorJump`: incoming anchor data
	 * is decoded once at the SDK boundary, so the callback receives the
	 * schema's anchor type with no manual narrowing. The latest callback is
	 * invoked without resubscribing on every render.
	 */
	function useTypedAnchorJump(cb: (anchor: PluginAnchor<TSchema>) => void) {
		const api = useTypedPluginAPI()
		const cbRef = useRef(cb)
		cbRef.current = cb

		useEffect(
			function subscribe() {
				return api.onAnchorJump(function handle(anchor: AnchorData) {
					if (decodeAnchor === undefined) {
						cbRef.current(anchor as PluginAnchor<TSchema>)
						return
					}
					const data = decodeAnchor(anchor.data)
					if (data === undefined) return
					cbRef.current({ data })
				})
			},
			[api],
		)
	}

	return {
		PluginAPIProvider:
			PluginAPIContext.Provider as Provider<WebPluginAPI<TSchema> | null>,
		usePluginAPI: useTypedPluginAPI,
		useAnchorJump: useTypedAnchorJump,
	}
}
