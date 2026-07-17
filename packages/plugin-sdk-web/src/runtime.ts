import type { PluginSchema } from "@hoardodile/plugin-sdk-types"
import type {
	Host,
	HostMessage,
	HostPushes,
	InvalidateTarget,
	PluginIframeContext,
	PluginMessage,
	PluginRequests,
	PluginSubscribe,
	RequestInput,
	RequestOutput,
} from "./protocol.ts"
import {
	broadcastPrefChange,
	getPluginCacheStore,
	getPluginPrefStore,
	seedPluginStores,
	setPluginCache,
	setPluginPref,
	snapshotCacheEntries,
} from "./stores.ts"
import type {
	Codec,
	Danmaku,
	DanmakuMode,
	Message,
	MutationState,
	QueryState,
	ResAnchor,
	Theme,
	WebPluginAPI,
} from "./types.ts"

// ── Host bridge ──────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 10_000

let nextId = 1
let hostBridge: Host | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isValidHostMessage(msg: unknown): msg is HostMessage {
	return isRecord(msg) && "type" in msg
}

export function ensureHostBridge(): Host {
	if (hostBridge !== undefined) return hostBridge

	const pending = new Map<
		number,
		{
			resolve(value: unknown): void
			reject(reason: Error): void
			timeoutId: ReturnType<typeof setTimeout>
		}
	>()
	const subscribers = new Map<string, Set<(data: unknown) => void>>()

	window.addEventListener(
		"message",
		function handleMessage(event: MessageEvent) {
			const msg = event.data
			if (!isValidHostMessage(msg)) return

			if (msg.type === "response") {
				const entry = pending.get(msg.id)
				if (entry === undefined) return
				pending.delete(msg.id)
				clearTimeout(entry.timeoutId)
				if (msg.ok) {
					entry.resolve(msg.data)
				} else {
					entry.reject(new Error(msg.error ?? "Unknown error"))
				}
			} else if (msg.type === "push") {
				const handlers = subscribers.get(msg.key)
				if (handlers !== undefined) {
					for (const handler of handlers) {
						handler(msg.data)
					}
				}
			}
		},
	)

	function request<K extends keyof PluginRequests>(
		method: K,
		...args: RequestInput<K> extends void ? [] : [RequestInput<K>]
	): Promise<RequestOutput<K>> {
		const id = nextId++
		const params = args[0]
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				pending.delete(id)
				reject(new Error(`Request timed out: ${String(method)}`))
			}, REQUEST_TIMEOUT_MS)
			pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeoutId,
			})
			const message: PluginMessage = {
				type: "request",
				id,
				method: method as string,
				params,
			}
			window.parent.postMessage(message, "*")
		})
	}

	function subscribe<K extends keyof HostPushes>(
		key: K,
		handler: (data: HostPushes[K]) => void,
	): () => void {
		const keyString = key as string
		let handlers = subscribers.get(keyString)
		if (handlers === undefined) {
			handlers = new Set()
			subscribers.set(keyString, handlers)
			const message: PluginSubscribe = { type: "subscribe", key: keyString }
			window.parent.postMessage(message, "*")
		}
		const wrapped = (data: unknown) => handler(data as HostPushes[K])
		handlers.add(wrapped)
		return function unsubscribe() {
			handlers!.delete(wrapped)
			if (handlers!.size === 0) {
				subscribers.delete(keyString)
			}
		}
	}

	hostBridge = { request, subscribe } as Host
	return hostBridge
}

// ── Pure helpers ─────────────────────────────────────────────────────────

export function extractThemePayload(data: unknown): {
	resolvedTheme: string | undefined
	palette: string | undefined
} {
	if (!isRecord(data)) return { resolvedTheme: undefined, palette: undefined }
	return {
		resolvedTheme:
			typeof data.resolvedTheme === "string" ? data.resolvedTheme : undefined,
		palette: typeof data.palette === "string" ? data.palette : undefined,
	}
}

export function extractPrefPayload(
	data: unknown,
): { readonly key: string; readonly value: string | undefined } | undefined {
	if (!isRecord(data)) return undefined
	const key = data.key
	if (typeof key !== "string") return undefined
	return {
		key,
		value: typeof data.value === "string" ? data.value : undefined,
	}
}

// ── File URL resolution ──────────────────────────────────────────────────

function resolveFilesBaseUrl(resId: string, token: string): string {
	return `/api/resources/${resId}/files/${encodeURIComponent(token)}/`
}

function buildFileUrl(
	resId: string,
	filename: string,
	token: string,
	size?: "preview" | "original",
): string {
	let url = `/api/resources/${resId}/files/${encodeURIComponent(token)}/${encodeURIComponent(filename)}`
	if (size === "preview") url = `${url}?size=preview`
	return url
}

function buildFrameUrl(
	resId: string,
	filename: string,
	timeMs: number,
	token: string,
): string {
	const time = String(Math.max(0, Math.round(timeMs)))
	return `/api/resources/${resId}/frame/${encodeURIComponent(token)}/${encodeURIComponent(filename)}/${time}`
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Builds the full {@link WebPluginAPI} for a plugin running inside a sandboxed
 * iframe. Communicates with the host via postMessage.
 */
export function createIframeHostAPI<
	TSchema extends PluginSchema = PluginSchema,
>(ctx: PluginIframeContext): WebPluginAPI<TSchema> {
	const host = ensureHostBridge()
	seedPluginStores(ctx)

	function logInfo(message: string, data?: Record<string, unknown>): void {
		host.request("logInfo", { message, data }).catch(() => {})
	}
	function logWarn(message: string, data?: Record<string, unknown>): void {
		host.request("logWarn", { message, data }).catch(() => {})
	}
	function logError(message: string, data?: Record<string, unknown>): void {
		host.request("logError", { message, data }).catch(() => {})
	}

	function listFiles(): Promise<readonly TSchema["file"][]> {
		return host.request("listFiles") as Promise<readonly TSchema["file"][]>
	}

	function readFile(path: string): Promise<ArrayBuffer> {
		return host.request("readFile", { path })
	}

	function resolveFileUrl(
		filename: string,
		size?: "preview" | "original",
	): string {
		return buildFileUrl(ctx.resId, filename, ctx.fileToken, size)
	}

	function resolveBaseUrl(): string {
		return resolveFilesBaseUrl(ctx.resId, ctx.fileToken)
	}

	function resolveFrameUrl(filename: string, timeMs: number): string {
		return buildFrameUrl(ctx.resId, filename, timeMs, ctx.fileToken)
	}

	function listMessages(resId: string): Promise<readonly Message[]> {
		return host.request("listMessages", { resId })
	}

	function createMessage(input: {
		readonly body: string
		readonly anchor?: ResAnchor
	}): Promise<Message> {
		return host.request("createMessage", input)
	}

	function listDanmaku(resId: string): Promise<readonly Danmaku[]> {
		return host.request("listDanmaku", { resId })
	}

	function createDanmaku(input: {
		readonly text: string
		readonly anchor: ResAnchor
		readonly mode?: DanmakuMode
	}): Promise<Danmaku> {
		return host.request("createDanmaku", input)
	}

	function getPref(key: string): string | undefined {
		return getPluginPrefStore().get(key) ?? undefined
	}

	function setPref(key: string, value: string): void {
		setPluginPref(key, value)
		broadcastPrefChange(key)
		host.request("setPref", { key, value }).catch(() => {})
	}

	function getCache(key: string): string | undefined {
		return getPluginCacheStore().get(key) ?? undefined
	}

	function setCache(key: string, value: string): void {
		setPluginCache(key, value)
		host.request("setCache", { resId: ctx.resId, key, value }).catch(() => {})
	}

	function listCache(): readonly {
		readonly key: string
		readonly value: string
	}[] {
		return snapshotCacheEntries()
	}

	async function uploadCover(blob: Blob): Promise<void> {
		const result = await host.request("getUploadUrl")
		const response = await fetch(result.uploadUrl, {
			method: "PUT",
			body: blob,
		})
		if (!response.ok) {
			throw new Error(
				`Upload failed: ${response.status} ${response.statusText}`,
			)
		}
		await host.request("notifyUploadComplete", { fileId: result.fileId })
	}

	function invalidate(target: InvalidateTarget): Promise<void> {
		return host.request("invalidate", { target })
	}

	function useFileList(): QueryState<readonly TSchema["file"][]> {
		throw new Error("useFileList must be provided by a framework adapter")
	}

	function useMessageList(): QueryState<readonly Message[]> {
		throw new Error("useMessageList must be provided by a framework adapter")
	}

	function useCreateMessage(): MutationState<
		{ readonly body: string; readonly anchor?: ResAnchor },
		Message
	> {
		throw new Error("useCreateMessage must be provided by a framework adapter")
	}

	function useDanmakuList(): QueryState<readonly Danmaku[]> {
		throw new Error("useDanmakuList must be provided by a framework adapter")
	}

	function useCreateDanmaku(): MutationState<
		{
			readonly text: string
			readonly anchor: ResAnchor
			readonly mode?: DanmakuMode
		},
		Danmaku
	> {
		throw new Error("useCreateDanmaku must be provided by a framework adapter")
	}

	function usePref<T>(
		_key: string,
		_defaultValue: T,
		_codec?: Codec<T>,
	): readonly [T, (value: T) => void] {
		throw new Error("usePref must be provided by a framework adapter")
	}

	function useTheme(): Theme {
		throw new Error("useTheme must be provided by a framework adapter")
	}

	return {
		logInfo,
		logWarn,
		logError,
		resource: {
			id: ctx.resId,
			name: ctx.resName,
			sourceMeta: ctx.sourceMeta as TSchema["sourceMeta"],
			searchMeta: ctx.searchMeta as TSchema["searchMeta"],
			fileStats: ctx.fileStats,
			contentPluginId: ctx.contentPluginId,
			fileToken: ctx.fileToken,
		},
		listFiles,
		readFile,
		resolveFileUrl,
		resolveBaseUrl,
		resolveFrameUrl,
		listMessages,
		createMessage,
		listDanmaku,
		createDanmaku,
		getPref,
		setPref,
		getCache,
		setCache,
		listCache,
		uploadCover,
		invalidate,
		useFileList,
		useMessageList,
		useCreateMessage,
		useDanmakuList,
		useCreateDanmaku,
		usePref,
		useTheme,
	} satisfies WebPluginAPI<TSchema>
}

let pluginContext: PluginIframeContext | undefined

export function getPluginContext(): PluginIframeContext | undefined {
	return pluginContext
}

function setPluginContext(ctx: PluginIframeContext): void {
	pluginContext = ctx
}

// ── Visibility (framework-agnostic store) ────────────────────────────────

let currentVisibility = true
const visibilityListeners = new Set<(visible: boolean) => void>()

export function subscribeToVisibility(
	cb: (visible: boolean) => void,
): () => void {
	visibilityListeners.add(cb)
	return () => {
		visibilityListeners.delete(cb)
	}
}

export function getVisibilitySnapshot(): boolean {
	return currentVisibility
}

function publishVisibilityChange(visible: boolean): void {
	if (currentVisibility === visible) return
	currentVisibility = visible
	for (const cb of visibilityListeners) {
		cb(visible)
	}
}

// ── Mount lifecycle ──────────────────────────────────────────────────────

/**
 * Sets up listeners for host→plugin communication via `postMessage` and
 * `CustomEvent` fallback. The host pushes context and visibility updates;
 * this function invokes `mount(ctx)` whenever a new context arrives.
 */
export function mountPlugin(mount: (ctx: PluginIframeContext) => void): void {
	function applyContext(ctx: PluginIframeContext) {
		setPluginContext(ctx)
		currentVisibility = true
		mount(ctx)
	}

	window.addEventListener("message", (event: MessageEvent) => {
		const msg = event.data
		if (!isRecord(msg) || msg.type !== "push") return
		if (msg.key === "context") {
			applyContext(msg.data as PluginIframeContext)
		} else if (msg.key === "visibility") {
			publishVisibilityChange((msg.data as { visible: boolean }).visible)
		}
	})

	window.addEventListener("context-ready", (e: Event) => {
		applyContext((e as CustomEvent<PluginIframeContext>).detail)
	})
	window.addEventListener("visibility-changed", (e: Event) => {
		publishVisibilityChange(
			(e as CustomEvent<{ visible: boolean }>).detail.visible,
		)
	})

	const w = window as unknown as Record<string, unknown>
	if (w.__pluginContext !== undefined) {
		applyContext(w.__pluginContext as PluginIframeContext)
	}
	if (w.__pluginVisibility !== undefined) {
		publishVisibilityChange(
			(w.__pluginVisibility as { visible: boolean }).visible,
		)
	}
}

/** Applies theme classes to `document.documentElement` so CSS variables update. */
export function applyTheme(resolvedTheme: string, palette: string): void {
	const root = document.documentElement
	root.classList.remove("light", "dark")
	root.classList.add(resolvedTheme)
	root.classList.remove(
		"theme-default",
		"theme-sky-blue",
		"theme-warmred",
		"theme-gold-celadon",
	)
	if (palette !== "default") {
		root.classList.add(`theme-${palette}`)
	}
}
