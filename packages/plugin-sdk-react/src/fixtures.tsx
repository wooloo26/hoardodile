import type { WebPluginAPI } from "@hoardodile/plugin-sdk-web"
import { createWebPluginAPIStub } from "@hoardodile/plugin-sdk-web"
import type { ReactNode } from "react"
import { PluginAPIProvider } from "./context.tsx"

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (...args: never[]) => unknown
		? T[K] | undefined
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K]
}

/**
 * Create a stubbed {@link WebPluginAPI} with deep-merge overrides.
 * Re-exports the web SDK helper under a React-friendly name.
 */
export function createWebPluginAPI(
	overrides?: DeepPartial<WebPluginAPI>,
): WebPluginAPI {
	return createWebPluginAPIStub(overrides)
}

/**
 * Wrap children with a stubbed API provider for tests.
 */
export function StubPluginAPIProvider({
	api,
	children,
}: {
	readonly api?: DeepPartial<WebPluginAPI>
	readonly children: ReactNode
}) {
	return (
		<PluginAPIProvider value={createWebPluginAPI(api)}>
			{children}
		</PluginAPIProvider>
	)
}
