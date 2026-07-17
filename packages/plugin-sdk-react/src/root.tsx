import type { PluginSchema } from "@hoardodile/plugin-sdk-types"
import type { WebPluginAPI } from "@hoardodile/plugin-sdk-web"
import {
	applyTheme,
	createIframeHostAPI,
	ensureHostBridge,
	getVisibilitySnapshot,
	mountPlugin,
	subscribeToVisibility,
} from "@hoardodile/plugin-sdk-web"
import type { ComponentType, Provider, ReactNode } from "react"
import { createElement, useEffect, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { usePluginAPI } from "./context.tsx"
import { createPluginQueryAPI } from "./query.ts"

export type PluginRootConfig<TSchema extends PluginSchema = PluginSchema> = {
	/** Root component rendered inside the plugin iframe. */
	readonly render: ComponentType
	/**
	 * Typed provider returned by {@link definePluginAPI}. This is the single
	 * source of truth for the plugin schema type.
	 */
	readonly provider: Provider<WebPluginAPI<TSchema> | null>
}

function ThemeSync({ children }: { readonly children: ReactNode }) {
	const api = usePluginAPI()
	const { resolvedTheme, palette } = api.useTheme()

	useEffect(
		function applyOnChange() {
			applyTheme(resolvedTheme, palette)
		},
		[resolvedTheme, palette],
	)

	return children
}

/** Subscribe to the iframe visibility state from the host. */
export function useVisibility(): boolean {
	return useSyncExternalStore(subscribeToVisibility, getVisibilitySnapshot)
}

/**
 * One-call plugin bootstrap. Handles `mountPlugin`, `createRoot` caching,
 * iframe host API, typed `PluginAPIProvider`, reactive theme application, and
 * visibility subscription.
 *
 * The supplied component receives no props; it should call `usePluginAPI()`
 * and `useVisibility()` internally as needed. The root always remounts when
 * the resource changes; use `api.resource.id` as a key inside your component
 * if you need finer control.
 */
export function createPluginRoot<TSchema extends PluginSchema = PluginSchema>(
	config: PluginRootConfig<TSchema>,
): void {
	let root: ReturnType<typeof createRoot> | undefined

	mountPlugin(function onContext(ctx) {
		flushSync(() => {
			if (root === undefined) {
				const el = document.getElementById("root")
				if (el === null) {
					console.error("[plugin] #root element not found — cannot mount")
					return
				}
				root = createRoot(el)
			}
			const host = ensureHostBridge()
			const baseApi = createIframeHostAPI<TSchema>(ctx)
			const api: WebPluginAPI<TSchema> = {
				...baseApi,
				...createPluginQueryAPI(host, {
					resolvedTheme: ctx.resolvedTheme,
					palette: ctx.palette,
				}),
			}
			applyTheme(ctx.resolvedTheme, ctx.palette)
			root.render(
				createElement(
					config.provider,
					{ value: api },
					createElement(
						ThemeSync,
						null,
						createElement(config.render, { key: ctx.resId }),
					),
				),
			)
		})
	})
}
