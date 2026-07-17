import { useEffect, useRef, useState } from "react"
import type { FileListEntry } from "./FileListEditor"
import { stageSingleFile, type UploadProgress } from "./upload"

export type UseIncrementalStagingResult = {
	/**
	 * Ordered list of staged `fileId`s, aligned 1:1 with the current
	 * `entries`. `undefined` at a position means that file has not finished
	 * staging yet (or staging failed). Pass this list (filtered to defined
	 * values, in entry order) to `resource.create({ files })` at submit.
	 */
	readonly fileIds: readonly (string | undefined)[]
	readonly fileProgresses: readonly number[]
	readonly isStaging: boolean
	readonly stagingComplete: boolean
}

export type UseIncrementalStagingOptions = {
	/** Debounce before starting a stage. Defaults to 300 ms. */
	readonly debounceMs?: number
}

/**
 * Manage per-file staging of ordered uploads against the global staging
 * pool.
 *
 * Each entry is staged independently via `POST /api/uploads/ordered`; the
 * server returns a `fileId` that is kept in a `Map<entryId, fileId>`. When
 * the user adds files, only the new ones are uploaded. When the user
 * removes a file, its local `fileId` reference is dropped but the staged
 * bytes are left on the server; the application startup sequence cleans
 * the staging pool once. Reordering is purely client-side (no bytes move).
 * Already-staged files are never re-uploaded.
 *
 * On unmount, in-flight uploads are aborted. When an entry is removed
 * mid-upload, only the local reference is dropped; the XHR is left to
 * finish or fail on its own and any stale resolution is ignored via the
 * effect token. This avoids surfacing a network error when the server has
 * already staged the file.
 */
export function useIncrementalStaging(
	entries: readonly FileListEntry[],
	options: UseIncrementalStagingOptions = {},
): UseIncrementalStagingResult {
	const debounceMs = options.debounceMs ?? 300

	const [fileIds, setFileIds] = useState<(string | undefined)[]>([])
	const [fileProgresses, setFileProgresses] = useState<number[]>([])
	const [isStaging, setIsStaging] = useState(false)
	const [stagingComplete, setStagingComplete] = useState(false)

	// entryId -> server fileId for files that have been successfully staged.
	const stagedMapRef = useRef<Map<string, string>>(new Map())
	// entryId -> current upload progress (0..1), for live UI updates.
	const progressMapRef = useRef<Map<string, number>>(new Map())
	// entryId -> AbortController for any in-flight upload.
	const inflightRef = useRef<Map<string, AbortController>>(new Map())
	// The set of entryIds we have ever seen, so we can detect removals even
	// when an upload is still in flight.
	const knownIdsRef = useRef<Set<string>>(new Set())
	// A token bumped on every effect run so stale async resolutions are
	// ignored.
	const runTokenRef = useRef(0)

	useEffect(() => {
		const runToken = ++runTokenRef.current

		const currentIds = new Set(entries.map((e) => e.id))
		const previousIds = knownIdsRef.current

		// Detect removed entries: drop their local references. Any in-flight
		// upload is left to finish or fail on its own; its resolution will be
		// ignored via runToken. The staged bytes are left on the server and
		// reclaimed at the next application startup.
		const removedIds: string[] = []
		for (const id of previousIds) {
			if (!currentIds.has(id)) removedIds.push(id)
		}
		for (const id of removedIds) {
			knownIdsRef.current.delete(id)
			inflightRef.current.delete(id)
			progressMapRef.current.delete(id)
			stagedMapRef.current.delete(id)
		}

		// Detect added entries: stage them. Also detect entries whose `file`
		// changed (same id, different File) by comparing identity — treat
		// those as remove+add.
		const toStage: { entry: FileListEntry; replace: string | undefined }[] = []
		for (const entry of entries) {
			const known = stagedMapRef.current.get(entry.id)
			const inflight = inflightRef.current.has(entry.id)
			if (known !== undefined || inflight) {
				// Already staged or staging. (File-identity drift is not
				// tracked here because FileListEditor mints a fresh id when
				// the user swaps a file.)
				continue
			}
			toStage.push({ entry, replace: undefined })
		}

		// Recompute the aligned output arrays from the current entries.
		const recompute = () => {
			const ids = entries.map((e) => stagedMapRef.current.get(e.id))
			const progresses = entries.map(
				(e) =>
					progressMapRef.current.get(e.id) ??
					(stagedMapRef.current.has(e.id) ? 1 : 0),
			)
			setFileIds(ids)
			setFileProgresses(progresses)
		}

		const progressRef = progressMapRef.current

		if (toStage.length === 0) {
			recompute()
			const done = entries.every((e) => stagedMapRef.current.has(e.id))
			setIsStaging(false)
			setStagingComplete(done && entries.length > 0)
			knownIdsRef.current = currentIds
			return
		}

		setIsStaging(true)
		setStagingComplete(false)
		for (const { entry } of toStage) {
			knownIdsRef.current.add(entry.id)
		}
		recompute()

		const timer = setTimeout(() => {
			for (const { entry } of toStage) {
				if (runToken !== runTokenRef.current) return
				const ctrl = new AbortController()
				inflightRef.current.set(entry.id, ctrl)
				stageSingleFile({
					file: entry.file,
					signal: ctrl.signal,
					onProgress: (p) => {
						progressRef.set(entry.id, p.total > 0 ? p.loaded / p.total : 0)
						if (runToken !== runTokenRef.current) return
						setFileProgresses((prev) => {
							const idx = entries.findIndex((e) => e.id === entry.id)
							if (idx < 0) return prev
							const next = [...prev]
							while (next.length <= idx) next.push(0)
							next[idx] = p.total > 0 ? p.loaded / p.total : 0
							return next
						})
					},
				})
					.then((result) => {
						if (runToken !== runTokenRef.current) {
							// Stale run: ignore the result. The staged bytes will
							// be reclaimed at the next application startup.
							return
						}
						stagedMapRef.current.set(entry.id, result.fileId)
						inflightRef.current.delete(entry.id)
						progressRef.set(entry.id, 1)
						recompute()
						const allDone = entries.every((e) => stagedMapRef.current.has(e.id))
						if (allDone && inflightRef.current.size === 0) {
							setIsStaging(false)
							setStagingComplete(true)
						}
					})
					.catch((err: unknown) => {
						inflightRef.current.delete(entry.id)
						progressRef.delete(entry.id)
						if (err instanceof Error && err.message === "aborted") return
						if (runToken !== runTokenRef.current) return
						// Leave the slot as undefined; stagingComplete stays false.
						recompute()
						console.warn("Per-file staging failed:", err)
					})
			}
		}, debounceMs)

		return () => {
			clearTimeout(timer)
			// Removal no longer aborts in-flight uploads; the cleanup only
			// cancels the debounce timer.
		}
	}, [entries, debounceMs])

	// On unmount, abort in-flight uploads. Staged files are left in the
	// server-side pool and reclaimed at the next application startup.
	useEffect(() => {
		return () => {
			runTokenRef.current++
			for (const ctrl of inflightRef.current.values()) ctrl.abort()
			inflightRef.current.clear()
			stagedMapRef.current.clear()
			progressMapRef.current.clear()
			knownIdsRef.current.clear()
		}
	}, [])

	return {
		fileIds,
		fileProgresses,
		isStaging,
		stagingComplete,
	}
}

export type { UploadProgress }
