import { trpcQuery } from "@/trpc/factory"

const TOKEN_TTL_MS = 24 * 60 * 60 * 1_000
const REFRESH_AFTER_MS = TOKEN_TTL_MS - 60 * 60 * 1_000

type CacheEntry = { readonly token: string; readonly fetchedAt: number }

// File tokens are scoped to a single resource, so the cache is keyed by
// resId. Entries are independent: one resource's token rotating does not
// invalidate the others.
const cached = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<string>>()

export function fetchPluginSessionToken(resId: string): Promise<string> {
	const now = Date.now()
	const entry = cached.get(resId)
	if (entry !== undefined && now - entry.fetchedAt < REFRESH_AFTER_MS) {
		return Promise.resolve(entry.token)
	}
	const inFlight = pending.get(resId)
	if (inFlight !== undefined) return inFlight
	const request = trpcQuery("resource", "pluginSessionToken", { resId })
	request.then(
		function settleCache(token: string) {
			cached.set(resId, { token, fetchedAt: Date.now() })
		},
		function clearPendingOnError() {
			/* best-effort — caller handles failure via its own try/catch */
		},
	)
	request.finally(function dropPending() {
		pending.delete(resId)
	})
	pending.set(resId, request)
	return request
}
