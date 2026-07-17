import { readZipEntries, type ZipEntryRecord } from "./archive.ts"

/**
 * Per-resource zip central-directory cache. Avoids re-parsing the CD of
 * `source.hoard` on every preview request. Keyed by `(resId, fileVersion)`
 * — when a resource's `fileVersion` bumps the key changes naturally so
 * stale entries fall out without explicit invalidation. LRU bounds total
 * cached resources.
 *
 * Lookups by `(resId, fileVersion, entryName)` return the entry's byte
 * range inside `source.hoard`; the HTTP read path uses that range against
 * `createReadStream(zipPath, { start, end })` to serve preview bytes
 * with no zip-library overhead on the hot path.
 */
export type ZipCdCache = {
	/**
	 * Resolve an entry inside `(resId, fileVersion)`'s `source.hoard`. Loads
	 * and caches the central directory on first miss. Returns `undefined`
	 * when the zip exists but has no entry by that name.
	 */
	resolve(
		resId: string,
		fileVersion: number,
		zipPath: string,
		entryName: string,
	): Promise<ZipEntryRecord | undefined>
	/** List all entries in `(resId, fileVersion)`'s `source.hoard`. */
	list(
		resId: string,
		fileVersion: number,
		zipPath: string,
	): Promise<readonly ZipEntryRecord[]>
	/** Drop the cache entry for `(resId, fileVersion)`. Idempotent. */
	invalidate(resId: string, fileVersion: number): void
	/** Drop every cached entry. Used in tests and on shutdown. */
	clear(): void
}

export type ZipCdCacheOptions = {
	/** Max number of `(resId, fileVersion)` entries kept resident. */
	readonly maxEntries: number
}

const DEFAULT_MAX_ENTRIES = 256

export function createZipCdCache(
	opts?: Partial<ZipCdCacheOptions>,
): ZipCdCache {
	const maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES
	const lru = new Map<string, ResolvedZip>()
	const inflight = new Map<string, Promise<ResolvedZip>>()

	async function loadResolved(
		key: string,
		zipPath: string,
	): Promise<ResolvedZip> {
		const cached = lru.get(key)
		if (cached !== undefined) {
			lru.delete(key)
			lru.set(key, cached)
			return cached
		}
		const pending = inflight.get(key)
		if (pending !== undefined) return pending
		const promise = parseAndStore(key, zipPath)
		inflight.set(key, promise)
		try {
			return await promise
		} finally {
			inflight.delete(key)
		}
	}

	async function parseAndStore(
		key: string,
		zipPath: string,
	): Promise<ResolvedZip> {
		const records = await readZipEntries(zipPath)
		const byName = new Map<string, ZipEntryRecord>()
		for (const rec of records) byName.set(rec.name, rec)
		const resolved: ResolvedZip = { records, byName, zipPath }
		lru.set(key, resolved)
		while (lru.size > maxEntries) {
			const oldest = lru.keys().next().value
			if (oldest === undefined) break
			lru.delete(oldest)
		}
		return resolved
	}

	async function resolve(
		resId: string,
		fileVersion: number,
		zipPath: string,
		entryName: string,
	): Promise<ZipEntryRecord | undefined> {
		const key = cacheKey(resId, fileVersion)
		const resolved = await loadResolved(key, zipPath)
		return resolved.byName.get(entryName)
	}

	async function list(
		resId: string,
		fileVersion: number,
		zipPath: string,
	): Promise<readonly ZipEntryRecord[]> {
		const key = cacheKey(resId, fileVersion)
		const resolved = await loadResolved(key, zipPath)
		return resolved.records
	}

	function invalidate(resId: string, fileVersion: number): void {
		lru.delete(cacheKey(resId, fileVersion))
	}

	function clear(): void {
		lru.clear()
	}

	return { resolve, list, invalidate, clear }
}

type ResolvedZip = {
	readonly records: readonly ZipEntryRecord[]
	readonly byName: Map<string, ZipEntryRecord>
	readonly zipPath: string
}

function cacheKey(resId: string, fileVersion: number): string {
	return `${resId}@${fileVersion}`
}
