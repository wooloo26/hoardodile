import { trpcQuery } from "@/trpc/factory"

type CacheEntry = {
	readonly pluginId: string
	readonly resId: string
	readonly key: string
	readonly value: string
	readonly updatedAt: number
}

type ResCacheMap = Map<string, Record<string, string>>

const store = new Map<string, ResCacheMap>()
const inflight = new Map<string, Promise<ResCacheMap>>()

function toResCacheMap(entries: readonly CacheEntry[]): ResCacheMap {
	const byPlugin = new Map<string, Record<string, string>>()
	for (const entry of entries) {
		if (entry.value === undefined || entry.value === "") continue
		let record = byPlugin.get(entry.pluginId)
		if (record === undefined) {
			record = {}
			byPlugin.set(entry.pluginId, record)
		}
		record[entry.key] = entry.value
	}
	return byPlugin
}

export function preloadCacheByResId(resId: string): void {
	if (store.has(resId) || inflight.has(resId)) return
	const promise = trpcQuery("pluginPreference", "cacheListByResId", { resId })
		.then((entries) => {
			const map = toResCacheMap(entries)
			store.set(resId, map)
			inflight.delete(resId)
			return map
		})
		.catch(() => {
			inflight.delete(resId)
			return new Map<string, Record<string, string>>()
		})
	inflight.set(resId, promise)
}

export function getCachedForPlugin(
	resId: string,
	pluginId: string,
): Record<string, string> | undefined {
	const map = store.get(resId)
	if (map === undefined) return undefined
	return map.get(pluginId)
}

export function invalidateResCache(resId: string): void {
	store.delete(resId)
}

export function clearAllResCache(): void {
	store.clear()
}
