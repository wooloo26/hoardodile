import { type DBSchema, type IDBPDatabase, openDB } from "idb"

export type LocalDraftCacheEntry = {
	readonly title: string
	readonly content: Record<string, unknown>
	readonly savedAt: number
}

export type DraftRecord = LocalDraftCacheEntry & {
	readonly docId: string
	readonly size: number
	/** For the single global current-draft entry, the real document id. */
	readonly actualDocId?: string
}

export const DRAFT_STORE_NAME = "hoardodile-web"
const DRAFT_STORE_VERSION = 1

/** Fixed key for the single global offline draft (one at a time). */
export const CURRENT_DOC_DRAFT_KEY = "__current_doc_draft__"

interface DraftDB extends DBSchema {
	drafts: {
		key: string
		value: DraftRecord
		indexes: { savedAt: number }
	}
}

export const DRAFT_LIMITS = {
	/** Reject a single draft larger than this (e.g. pasted base64 images). */
	maxDraftSizeBytes: 5 * 1024 * 1024,
	/** Keep at most this many drafts across all documents. */
	maxTotalCount: 50,
	/** Keep drafts under this total on-disk size. */
	maxTotalSizeBytes: 50 * 1024 * 1024,
	/** Drop drafts older than this. */
	ttlMs: 30 * 24 * 60 * 60 * 1000,
} as const

function computeEntrySize(entry: LocalDraftCacheEntry): number {
	try {
		return new Blob([JSON.stringify(entry)]).size
	} catch {
		// Fallback for environments where Blob.size is unavailable.
		return JSON.stringify(entry).length
	}
}

async function openDb(): Promise<IDBPDatabase<DraftDB>> {
	return openDB<DraftDB>(DRAFT_STORE_NAME, DRAFT_STORE_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains("drafts")) {
				const store = db.createObjectStore("drafts", { keyPath: "docId" })
				store.createIndex("savedAt", "savedAt")
			}
		},
	})
}

export type DraftLimits = {
	readonly maxDraftSizeBytes: number
	readonly maxTotalCount: number
	readonly maxTotalSizeBytes: number
	readonly ttlMs: number
}

export type CurrentDraftSnapshot = LocalDraftCacheEntry & {
	readonly docId: string
}

/** Pure helper: decide which records must be evicted to stay within limits. */
export function selectEvictedDocIds(
	records: readonly DraftRecord[],
	limits: DraftLimits,
	now: number,
): string[] {
	const ttlCutoff = now - limits.ttlMs
	const byAge = [...records].sort((a, b) => a.savedAt - b.savedAt)
	const evicted = new Set<string>()
	let totalSize = 0
	let count = 0

	for (const record of byAge) {
		if (record.savedAt < ttlCutoff) {
			evicted.add(record.docId)
			continue
		}
		totalSize += record.size
		count++
	}

	for (const record of byAge) {
		if (evicted.has(record.docId)) continue
		if (count > limits.maxTotalCount || totalSize > limits.maxTotalSizeBytes) {
			evicted.add(record.docId)
			count--
			totalSize -= record.size
		} else {
			break
		}
	}

	return [...evicted]
}

class DraftStore {
	private dbPromise: Promise<IDBPDatabase<DraftDB> | "memory"> | undefined
	private memory = new Map<string, LocalDraftCacheEntry>()
	private fallbackToMemory = false

	constructor() {
		if (typeof indexedDB === "undefined") {
			this.fallbackToMemory = true
		}
	}

	private async db(): Promise<IDBPDatabase<DraftDB> | "memory"> {
		if (this.fallbackToMemory) return "memory"
		if (this.dbPromise === undefined) {
			this.dbPromise = openDb().catch((error: unknown) => {
				console.warn(
					"IndexedDB draft store unavailable, falling back to memory",
					error,
				)
				this.fallbackToMemory = true
				return "memory" as const
			})
		}
		const result = await this.dbPromise
		if (result === "memory") {
			this.fallbackToMemory = true
		}
		return result
	}

	async get(docId: string): Promise<LocalDraftCacheEntry | undefined> {
		const dbOrMemory = await this.db()
		if (dbOrMemory === "memory") {
			return this.memory.get(docId)
		}
		const record = await dbOrMemory.get("drafts", docId)
		if (record === undefined) return undefined
		const { docId: _docId, size: _size, ...entry } = record
		return entry
	}

	async set(docId: string, entry: LocalDraftCacheEntry): Promise<void> {
		const size = computeEntrySize(entry)
		if (size > DRAFT_LIMITS.maxDraftSizeBytes) {
			// Refuse to store a single huge draft so one base64 image cannot
			// blow up the store.
			return
		}

		const dbOrMemory = await this.db()
		if (dbOrMemory === "memory") {
			this.memory.set(docId, entry)
			return
		}

		const record: DraftRecord = { docId, ...entry, size }
		const transaction = dbOrMemory.transaction("drafts", "readwrite")
		await transaction.store.put(record)
		await transaction.done
		await this.enforceLimits(dbOrMemory)
	}

	private async enforceLimits(db: IDBPDatabase<DraftDB>): Promise<void> {
		const records = await db.getAll("drafts")
		const evicted = selectEvictedDocIds(records, DRAFT_LIMITS, Date.now())
		if (evicted.length === 0) return
		const transaction = db.transaction("drafts", "readwrite")
		for (const docId of evicted) {
			transaction.store.delete(docId)
		}
		await transaction.done
	}

	async setCurrent(docId: string, entry: LocalDraftCacheEntry): Promise<void> {
		const size = computeEntrySize(entry)
		if (size > DRAFT_LIMITS.maxDraftSizeBytes) {
			return
		}

		const dbOrMemory = await this.db()
		if (dbOrMemory === "memory") {
			this.memory.set(CURRENT_DOC_DRAFT_KEY, {
				...entry,
				docId,
			} as LocalDraftCacheEntry)
			return
		}

		const record: DraftRecord = {
			docId: CURRENT_DOC_DRAFT_KEY,
			actualDocId: docId,
			...entry,
			size,
		}
		const transaction = dbOrMemory.transaction("drafts", "readwrite")
		await transaction.store.put(record)
		await transaction.done
		await this.enforceLimits(dbOrMemory)
	}

	async getCurrent(): Promise<CurrentDraftSnapshot | undefined> {
		const dbOrMemory = await this.db()
		if (dbOrMemory === "memory") {
			const entry = this.memory.get(CURRENT_DOC_DRAFT_KEY)
			if (entry === undefined) return undefined
			const { docId, ...rest } = entry as LocalDraftCacheEntry & {
				docId: string
			}
			return { ...rest, docId }
		}
		const record = await dbOrMemory.get("drafts", CURRENT_DOC_DRAFT_KEY)
		if (record === undefined) return undefined
		const { docId: _docId, size: _size, actualDocId, ...entry } = record
		return { ...entry, docId: actualDocId ?? _docId }
	}

	async clearCurrent(): Promise<void> {
		await this.clear(CURRENT_DOC_DRAFT_KEY)
	}

	async clear(docId: string): Promise<void> {
		const dbOrMemory = await this.db()
		if (dbOrMemory === "memory") {
			this.memory.delete(docId)
			return
		}
		await dbOrMemory.delete("drafts", docId)
	}

	/** Close any open connection. Safe to call repeatedly. */
	close(): void {
		if (this.dbPromise === undefined) return
		this.dbPromise
			.then((db) => {
				if (db !== "memory") db.close()
			})
			.catch(() => {
				// Ignore close errors.
			})
		this.dbPromise = undefined
	}

	/** Test-only helper: close the connection and wipe persisted data. */
	async __resetForTests(): Promise<void> {
		this.close()
		this.memory.clear()
		this.fallbackToMemory = false
		if (typeof indexedDB === "undefined") return
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(DRAFT_STORE_NAME)
			request.onsuccess = () => {
				resolve()
			}
			request.onerror = () => {
				reject(request.error)
			}
			request.onblocked = () => {
				// If a test forgot to close, move on; the next open will start
				// fresh in fake-indexeddb.
				resolve()
			}
		})
	}
}

export const draftStore = new DraftStore()
