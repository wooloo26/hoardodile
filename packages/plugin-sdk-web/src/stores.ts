import type { PluginIframeContext } from "./protocol.ts"

const pluginPrefStore = new Map<string, string>()
const pluginCacheStore = new Map<string, string>()

export function seedPluginStores(ctx: PluginIframeContext): void {
	pluginPrefStore.clear()
	for (const [k, v] of Object.entries(ctx.initialPrefs)) {
		pluginPrefStore.set(k, v)
	}
	pluginCacheStore.clear()
	for (const [k, v] of Object.entries(ctx.initialCache)) {
		pluginCacheStore.set(k, v)
	}
}

export function getPluginPrefStore(): ReadonlyMap<string, string> {
	return pluginPrefStore
}

export function setPluginPref(key: string, value: string): void {
	pluginPrefStore.set(key, value)
}

export function deletePluginPref(key: string): void {
	pluginPrefStore.delete(key)
}

export function getPluginCacheStore(): ReadonlyMap<string, string> {
	return pluginCacheStore
}

export function setPluginCache(key: string, value: string): void {
	pluginCacheStore.set(key, value)
}

export function snapshotCacheEntries(): {
	readonly key: string
	readonly value: string
}[] {
	const result: { readonly key: string; readonly value: string }[] = []
	for (const [key, value] of pluginCacheStore) {
		result.push({ key, value })
	}
	return result
}

// ── Pref change pub/sub ──────────────────────────────────────────────────

const prefChangeListeners = new Map<string, Set<() => void>>()

export function subscribeToPrefChanges(
	key: string,
	cb: () => void,
): () => void {
	let listeners = prefChangeListeners.get(key)
	if (listeners === undefined) {
		listeners = new Set()
		prefChangeListeners.set(key, listeners)
	}
	listeners.add(cb)
	return function unsubscribe() {
		listeners!.delete(cb)
		if (listeners!.size === 0) {
			prefChangeListeners.delete(key)
		}
	}
}

export function broadcastPrefChange(key: string): void {
	const listeners = prefChangeListeners.get(key)
	if (listeners === undefined) return
	for (const cb of listeners) {
		cb()
	}
}
