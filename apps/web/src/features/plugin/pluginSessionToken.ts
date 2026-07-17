import { trpcQuery } from "@/trpc/factory"

const TOKEN_TTL_MS = 24 * 60 * 60 * 1_000
const REFRESH_AFTER_MS = TOKEN_TTL_MS - 60 * 60 * 1_000

type CacheEntry = { readonly token: string; readonly fetchedAt: number }

let cached: CacheEntry | null = null
let pending: Promise<string> | null = null

export function fetchPluginSessionToken(): Promise<string> {
	const now = Date.now()
	if (cached !== null && now - cached.fetchedAt < REFRESH_AFTER_MS) {
		return Promise.resolve(cached.token)
	}
	if (pending !== null) return pending
	pending = trpcQuery("resource", "pluginSessionToken")
	pending.then(
		function settleCache(token: string) {
			cached = { token, fetchedAt: Date.now() }
		},
		function clearPendingOnError() {
			/* best-effort — caller handles failure via its own try/catch */
		},
	)
	pending.finally(function dropPending() {
		pending = null
	})
	return pending
}
