import type { HostPush, PluginIframeContext } from "@hoardodile/plugin-sdk-web"
import { hostPushKeys } from "@/lib/keys"
import { apiPaths } from "@/lib/paths"

// ── Transport (from former transport.ts) ─────────────────────────────────────

export type PluginIframeTransport = {
	readonly pushContext: (ctx: PluginIframeContext) => void
	readonly setVisibility: (visible: boolean) => void
	readonly push: (key: string, data?: unknown) => void
	readonly dispose: () => void
}

export function createTransport(
	iframe: HTMLIFrameElement,
): PluginIframeTransport {
	let disposed = false

	function post(msg: HostPush): void {
		const win = iframe.contentWindow
		if (win === null) return
		win.postMessage(msg, "*")
	}

	return {
		pushContext(ctx) {
			if (disposed) return
			post({ type: "push", key: hostPushKeys.context, data: ctx })
		},
		setVisibility(visible) {
			if (disposed) return
			post({ type: "push", key: hostPushKeys.visibility, data: { visible } })
		},
		push(key, data) {
			if (disposed) return
			post({ type: "push", key, data })
		},
		dispose() {
			disposed = true
		},
	}
}

// ── Iframe state (from former pluginIframeState.ts) ──────────────────────────

export type IframeRecord = {
	pluginId: string
	resId: string
}

const iframeBySource = new Map<Window, IframeRecord>()
const sourcesByResId = new Map<string, Set<Window>>()
const subscriptionsBySource = new Map<Window, Set<string>>()

export function registerIframe(source: Window, record: IframeRecord): void {
	const prev = iframeBySource.get(source)
	if (prev !== undefined) {
		const prevSources = sourcesByResId.get(prev.resId)
		if (prevSources !== undefined) {
			prevSources.delete(source)
			if (prevSources.size === 0) {
				sourcesByResId.delete(prev.resId)
			}
		}
	}
	iframeBySource.set(source, record)
	let sources = sourcesByResId.get(record.resId)
	if (sources === undefined) {
		sources = new Set()
		sourcesByResId.set(record.resId, sources)
	}
	sources.add(source)
}

export function unregisterIframe(source: Window): void {
	const record = iframeBySource.get(source)
	if (record !== undefined) {
		const sources = sourcesByResId.get(record.resId)
		if (sources !== undefined) {
			sources.delete(source)
			if (sources.size === 0) {
				sourcesByResId.delete(record.resId)
			}
		}
	}
	iframeBySource.delete(source)
	subscriptionsBySource.delete(source)
}

export function getIframeBySource(source: Window): IframeRecord | undefined {
	return iframeBySource.get(source)
}

export function broadcastToResource(resId: string, event: HostPush): void {
	const sources = sourcesByResId.get(resId)
	if (sources === undefined) return
	for (const source of sources) {
		source.postMessage(event, "*")
	}
}

export function broadcastToAll(event: HostPush): void {
	for (const source of iframeBySource.keys()) {
		source.postMessage(event, "*")
	}
}

export function addSubscription(source: Window, key: string): void {
	let keys = subscriptionsBySource.get(source)
	if (keys === undefined) {
		keys = new Set()
		subscriptionsBySource.set(source, keys)
	}
	keys.add(key)
}

export function broadcastToSubscribers(key: string, data?: unknown): void {
	const event: HostPush = { type: "push", key, data }
	for (const [source, keys] of subscriptionsBySource) {
		if (keys.has(key)) {
			source.postMessage(event, "*")
		}
	}
}

// ── Pool (from former PluginIframePool.ts) ───────────────────────────────────

const EPHEMERAL_CAP_PER_PLUGIN = 2

export type PoolClaimedEntry = {
	readonly iframe: HTMLIFrameElement
	readonly release: () => void
	readonly postContext: (ctx: PluginIframeContext) => void
	readonly setVisibility: (visible: boolean) => void
	readonly onLoaded: (cb: () => void) => () => void
	readonly whenLoaded: () => Promise<void>
}

type PoolEntry = {
	readonly id: number
	readonly pluginId: string
	readonly iframe: HTMLIFrameElement
	readonly isPrimary: boolean
	readonly transport: PluginIframeTransport
	claimId: number | undefined
	lastReleased: number
	loaded: boolean
}

const entries = new Map<number, PoolEntry>()
const byPlugin = new Map<string, PoolEntry[]>()
let nextEntryId = 1
let nextClaimId = 1
let container: HTMLElement | undefined
let evictTimer: ReturnType<typeof setInterval> | undefined

function getPluginList(pluginId: string): PoolEntry[] {
	let list = byPlugin.get(pluginId)
	if (list === undefined) {
		list = []
		byPlugin.set(pluginId, list)
	}
	return list
}

function createIframeEntry(pluginId: string, isPrimary: boolean): PoolEntry {
	if (container === undefined) {
		throw new Error("PluginIframePool container not mounted")
	}

	const iframe = document.createElement("iframe")
	iframe.sandbox.add("allow-scripts", "allow-forms", "allow-downloads")
	iframe.referrerPolicy = "no-referrer"
	iframe.allowFullscreen = true
	iframe.src = apiPaths.plugins.indexHtml(pluginId)
	iframe.title = `plugin:${pluginId}`
	iframe.style.position = "fixed"
	iframe.style.border = "0"
	iframe.style.display = "none"
	iframe.style.pointerEvents = "auto"
	iframe.style.zIndex = "0"

	const id = nextEntryId++

	function handleLoad() {
		entry.loaded = true
		if (iframe.contentWindow === null) return
		registerIframe(iframe.contentWindow, { pluginId, resId: "" })
	}

	function handleError() {
		entry.loaded = true
	}

	iframe.addEventListener("load", handleLoad)
	iframe.addEventListener("error", handleError)
	container.appendChild(iframe)

	const transport = createTransport(iframe)
	const entry: PoolEntry = {
		id,
		pluginId,
		iframe,
		isPrimary,
		transport,
		claimId: undefined,
		lastReleased: 0,
		loaded: false,
	}

	entries.set(id, entry)
	getPluginList(pluginId).push(entry)
	return entry
}

function findFreeEntry(pluginId: string): PoolEntry | undefined {
	const list = byPlugin.get(pluginId) ?? []
	let best: PoolEntry | undefined
	for (const entry of list) {
		if (entry.claimId !== undefined) continue
		if (best === undefined || entry.lastReleased > best.lastReleased) {
			best = entry
		}
	}
	return best
}

function evictLruIdleEphemeral(pluginId: string): boolean {
	const list = byPlugin.get(pluginId) ?? []
	let worst: PoolEntry | undefined
	for (const entry of list) {
		if (entry.claimId !== undefined || entry.isPrimary) continue
		if (worst === undefined || entry.lastReleased < worst.lastReleased) {
			worst = entry
		}
	}
	if (worst === undefined) return false
	destroyEntry(worst)
	return true
}

function runEviction(): void {
	for (const [pluginId, list] of byPlugin) {
		const idleEphemerals = list.filter(
			(e) => e.claimId === undefined && !e.isPrimary,
		)
		while (idleEphemerals.length > EPHEMERAL_CAP_PER_PLUGIN) {
			const evicted = evictLruIdleEphemeral(pluginId)
			if (!evicted) break
			const fresh = byPlugin.get(pluginId) ?? []
			const nextIdle = fresh.filter(
				(e) => e.claimId === undefined && !e.isPrimary,
			)
			if (nextIdle.length === idleEphemerals.length) break
			idleEphemerals.length = 0
			for (const e of nextIdle) idleEphemerals.push(e)
		}
	}
}

function destroyEntry(entry: PoolEntry): void {
	entry.transport.dispose()
	const win = entry.iframe.contentWindow
	if (win !== null) {
		unregisterIframe(win)
	}
	entry.iframe.remove()
	entries.delete(entry.id)
	const list = byPlugin.get(entry.pluginId)
	if (list !== undefined) {
		const idx = list.indexOf(entry)
		if (idx >= 0) list.splice(idx, 1)
		if (list.length === 0) byPlugin.delete(entry.pluginId)
	}
}

export function setPoolContainer(el: HTMLElement | undefined): void {
	container = el
	if (evictTimer !== undefined) {
		clearInterval(evictTimer)
		evictTimer = undefined
	}
	if (el !== undefined) {
		evictTimer = setInterval(runEviction, 5_000)
	}
}

export function claim(opts: { pluginId: string }): PoolClaimedEntry {
	const { pluginId } = opts

	let entry = findFreeEntry(pluginId)
	if (entry === undefined) {
		const list = getPluginList(pluginId)
		const hasPrimary = list.some((e) => e.isPrimary)
		const isPrimary = !hasPrimary
		if (!isPrimary) {
			const ephemerals = list.filter((e) => !e.isPrimary)
			if (ephemerals.length >= EPHEMERAL_CAP_PER_PLUGIN) {
				evictLruIdleEphemeral(pluginId)
			}
		}
		entry = createIframeEntry(pluginId, isPrimary)
	} else {
		entry.loaded = false
		const cw = entry.iframe.contentWindow
		if (cw !== null) {
			cw.location.replace(entry.iframe.src)
		} else {
			entry.iframe.src = entry.iframe.src
		}
	}

	const claimId = nextClaimId++
	entry.claimId = claimId

	return {
		iframe: entry.iframe,
		release() {
			if (entry!.claimId !== claimId) return
			entry!.transport.setVisibility(false)
			entry!.claimId = undefined
			entry!.lastReleased = performance.now()
			entry!.iframe.style.display = "none"
			const win = entry!.iframe.contentWindow
			if (win !== null) {
				unregisterIframe(win)
				registerIframe(win, { pluginId: entry!.pluginId, resId: "" })
			}
		},
		postContext(ctx) {
			if (entry!.claimId !== claimId) return
			entry!.transport.pushContext(ctx)
			const win = entry!.iframe.contentWindow
			if (win !== null) {
				registerIframe(win, { pluginId: ctx.pluginId, resId: ctx.resId })
			}
		},
		setVisibility(visible) {
			if (entry!.claimId !== claimId) return
			entry!.transport.setVisibility(visible)
		},
		onLoaded(cb) {
			if (entry!.loaded) {
				cb()
				return () => {}
			}
			function handler() {
				cb()
			}
			entry!.iframe.addEventListener("load", handler)
			return () => entry!.iframe.removeEventListener("load", handler)
		},
		whenLoaded() {
			if (entry!.loaded) return Promise.resolve()
			return new Promise<void>((resolve) => {
				function handler() {
					resolve()
					entry!.iframe.removeEventListener("load", handler)
				}
				entry!.iframe.addEventListener("load", handler)
			})
		},
	}
}
