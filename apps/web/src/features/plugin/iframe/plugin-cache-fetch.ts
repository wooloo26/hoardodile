import { trpcQuery } from "@/trpc/factory"

const inflight = new Map<string, Promise<Record<string, string>>>()

/**
 * Fetch a plugin's cache entries for a resource as an unprefixed
 * key→value record, deduplicating concurrent calls.
 *
 * Deliberately not cached beyond the in-flight window: the server is
 * the single source of truth shared across tabs, and any longer-lived
 * local snapshot goes stale the moment another tab writes.
 */
export function fetchPluginCache(
	resId: string,
	pluginId: string,
): Promise<Record<string, string>> {
	const dedupKey = `${resId} ${pluginId}`
	const existing = inflight.get(dedupKey)
	if (existing !== undefined) return existing
	const promise = trpcQuery("pluginPreference", "cacheList", {
		pluginId,
		resId,
	})
		.then((entries) => {
			const record: Record<string, string> = {}
			for (const entry of entries) {
				if (entry.value === undefined || entry.value === "") continue
				record[entry.key] = entry.value
			}
			return record
		})
		.catch((): Record<string, string> => ({}))
		.finally(() => {
			inflight.delete(dedupKey)
		})
	inflight.set(dedupKey, promise)
	return promise
}
