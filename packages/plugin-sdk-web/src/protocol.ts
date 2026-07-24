import type { FileStats, SearchMeta } from "@hoardodile/plugin-sdk-types"

export type PluginResolvedTheme = "light" | "dark"

export type PluginThemePalette =
	| "default"
	| "sky-blue"
	| "warmred"
	| "gold-celadon"

/** Context injected into the iframe as `window.__context__`. */
export type PluginIframeContext = {
	readonly pluginId: string
	readonly resId: string
	readonly resName: string
	readonly sourceMeta: unknown
	readonly searchMeta: SearchMeta | undefined
	readonly fileStats: FileStats | undefined
	readonly contentPluginId: string
	/** Current UI language code. The iframe uses this to select its own locale bundle. */
	readonly language: string
	/** Current resolved theme (light or dark). */
	readonly resolvedTheme: PluginResolvedTheme
	/** Current theme palette. */
	readonly palette: PluginThemePalette
	/** Initial plugin-scoped prefs (unprefixed keys) loaded from server. */
	readonly initialPrefs: Record<string, string>
	/** Initial plugin+resId cache entries (unprefixed keys) loaded from server. */
	readonly initialCache: Record<string, string>
	/**
	 * Short-lived token that lets the sandboxed iframe fetch resource files
	 * without a session cookie (null-origin iframe cannot send SameSite cookies).
	 */
	readonly fileToken: string
}

/** Wire request from plugin (iframe) to host. */
export type PluginRequest = {
	readonly type: "request"
	readonly id: number
	readonly method: string
	readonly params?: unknown
	/**
	 * SDK-internal scope stamp: the resource the request was issued for,
	 * captured by the runtime when the plugin called the API. The host
	 * drops the request as stale when the stamp no longer matches the
	 * iframe's binding (e.g. an unmount flush racing a rebind), so late
	 * requests never leak into the wrong resource. Plugin code never
	 * sets this.
	 */
	readonly resId?: string
}

/** Wire response from host to plugin for a prior request. */
export type HostResponse = {
	readonly type: "response"
	readonly id: number
	readonly ok: boolean
	readonly data?: unknown
	readonly error?: string
}

/** Wire push event from host to plugin. */
export type HostPush = {
	readonly type: "push"
	readonly key: string
	readonly data?: unknown
}

/** Wire subscription request from plugin to host. */
export type PluginSubscribe = {
	readonly type: "subscribe"
	readonly key: string
}

/** Union of all messages a plugin can send to the host. */
export type PluginMessage = PluginRequest | PluginSubscribe

/** Union of all messages the host can send to a plugin. */
export type HostMessage = HostResponse | HostPush

/** Type-safe request protocol table. Each entry declares input and output. */
export type PluginRequests = {
	logInfo: {
		readonly input: {
			readonly message: string
			readonly data?: Record<string, unknown>
		}
		readonly output: undefined
	}
	logWarn: {
		readonly input: {
			readonly message: string
			readonly data?: Record<string, unknown>
		}
		readonly output: undefined
	}
	logError: {
		readonly input: {
			readonly message: string
			readonly data?: Record<string, unknown>
		}
		readonly output: undefined
	}
	listFiles: {
		readonly input: undefined
		readonly output: readonly string[]
	}
	readFile: {
		readonly input: { readonly path: string }
		readonly output: ArrayBuffer
	}
	listMessages: {
		readonly input: undefined
		readonly output: readonly import("@hoardodile/plugin-sdk-types").Message[]
	}
	createMessage: {
		readonly input: {
			readonly body: string
			readonly anchor?: import("@hoardodile/plugin-sdk-types").AnchorData
		}
		readonly output: import("@hoardodile/plugin-sdk-types").Message
	}
	listDanmaku: {
		readonly input: {
			readonly filter?: import("@hoardodile/plugin-sdk-types").DanmakuListFilter
		}
		readonly output: readonly import("@hoardodile/plugin-sdk-types").Danmaku[]
	}
	createDanmaku: {
		readonly input: {
			readonly text: string
			readonly anchor: import("@hoardodile/plugin-sdk-types").AnchorData
			readonly mode?: import("@hoardodile/plugin-sdk-types").DanmakuMode
		}
		readonly output: import("@hoardodile/plugin-sdk-types").Danmaku
	}
	setPref: {
		readonly input: { readonly key: string; readonly value: string }
		readonly output: undefined
	}
	setCache: {
		readonly input: {
			readonly key: string
			readonly value: string
		}
		readonly output: undefined
	}
	invalidate: {
		readonly input: { readonly target: InvalidateTarget }
		readonly output: undefined
	}
}

/** Type-safe push protocol table. */
export type HostPushes = {
	context: PluginIframeContext
	visibility: { readonly visible: boolean }
	themeChanged: { readonly resolvedTheme: string; readonly palette: string }
	languageChanged: { readonly language: string }
	prefsChanged: { readonly key: string; readonly value?: string }
	/**
	 * Host-initiated request to jump to an anchor (e.g. the user clicked a
	 * comment anchor in the host UI). Carries the plugin-defined anchor data
	 * only — the resource is always the iframe's own.
	 */
	anchorJump: import("@hoardodile/plugin-sdk-types").AnchorData
	"res:invalidate": undefined
	"resources:invalidate": undefined
	"messages:invalidate": undefined
	"danmaku:invalidate": undefined
}

/** Extract the input type for a request key. */
export type RequestInput<K extends keyof PluginRequests> =
	PluginRequests[K]["input"]

/** Extract the output type for a request key. */
export type RequestOutput<K extends keyof PluginRequests> =
	PluginRequests[K]["output"]

/** Targets that can be invalidated from the plugin runtime. */
export type InvalidateTarget = "resource" | "resources" | "messages" | "danmaku"

/**
 * Type-safe host bridge. The runtime still serialises messages as plain
 * postMessage objects; this contract gives compile-time guarantees to callers.
 */
export type Host = {
	request<K extends keyof PluginRequests>(
		method: K,
		...args: RequestInput<K> extends void ? [] : [RequestInput<K>]
	): Promise<RequestOutput<K>>
	subscribe<K extends keyof HostPushes>(
		key: K,
		handler: (data: HostPushes[K]) => void,
	): () => void
	/**
	 * Internal — returns a Host whose requests are stamped with the given
	 * resource scope (see {@link PluginRequest.resId}). Used by the runtime
	 * to bind one API instance to the resource it was created for.
	 */
	withScope: (resId: string) => Host
}
