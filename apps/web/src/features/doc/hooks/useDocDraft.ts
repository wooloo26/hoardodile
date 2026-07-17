import { MAX_DOC_CONTENT_TEXT_LENGTH } from "@hoardodile/consts/text-limits"
import type { QueryClient } from "@tanstack/react-query"
import { isEqual } from "es-toolkit"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { type CurrentDraftSnapshot, draftStore } from "../draftStore"
import type { DocEditorHandle } from "../editor/DocEditor"
import { invalidateDocuments } from "../index.ts"
import { useDocAutosave } from "./useDocAutosave"
import { useDocDraftMutations } from "./useDocDraftMutations"

export type DocDraftInput = {
	readonly id: string
	readonly draft:
		| Readonly<{
				title: string
				content: Record<string, unknown>
				updatedAt: number
		  }>
		| undefined
	readonly autosaveEnabled: boolean
	readonly latestVersionAt: number | undefined
	readonly editorHandleRef: React.RefObject<DocEditorHandle | null>
	readonly qc: QueryClient
}

export type DocDraft = {
	readonly titleInput: string
	readonly setTitleInput: (next: string) => void
	readonly dirty: boolean
	readonly hasCommittableChange: boolean
	readonly canUndo: boolean
	readonly canRedo: boolean
	readonly charCount: number
	readonly charCountOverLimit: boolean
	readonly onCharCountChange: (count: number) => void
	readonly setHistoryFlags: (flags: {
		canUndo: boolean
		canRedo: boolean
	}) => void
	readonly onContentChange: (content: Record<string, unknown>) => void
	readonly flushPendingContent: () => void
	readonly manualSave: () => void
	readonly manualSaveAsync: () => Promise<void>
	readonly discardUnsaved: () => void
	readonly requestCommit: (openDialog: () => void) => void
	readonly submitCommit: (message: string, onSuccess: () => void) => void
	readonly confirmDiscard: (onSuccess: () => void) => void
	readonly patchPending: boolean
	readonly commitPending: boolean
	readonly discardPending: boolean
	readonly initialContent: Record<string, unknown> | undefined
	readonly isCacheLoading: boolean
}

const OFFLINE_SNAPSHOT_DEBOUNCE_MS = 800

/**
 * Owns the draft-side state machine for a document detail route.
 *
 * Only one offline draft is kept globally (via `draftStore`). When the user
 * tries to leave the current document with unsaved changes, the route-level
 * leave guard asks whether to save or discard them.
 */
export function useDocDraft(args: DocDraftInput): DocDraft {
	const { id, draft, autosaveEnabled, latestVersionAt, editorHandleRef, qc } =
		args
	const { t } = useTranslation()
	const [titleInput, setTitleInputRaw] = useState<string>("")
	const [contentDirty, setContentDirty] = useState(false)
	const [canUndo, setCanUndo] = useState(false)
	const [canRedo, setCanRedo] = useState(false)
	const [charCount, setCharCount] = useState(0)
	const [offlineEntry, setOfflineEntry] = useState<
		CurrentDraftSnapshot | undefined
	>(undefined)
	const [isCacheLoading, setIsCacheLoading] = useState(true)

	const currentDocIdRef = useRef(id)
	currentDocIdRef.current = id

	const initializedDocIdRef = useRef<string | undefined>(undefined)
	const lastDraftUpdatedAtRef = useRef<number | undefined>(undefined)
	const pendingContentRef = useRef<Record<string, unknown> | undefined>(
		undefined,
	)
	const isDiscardingRef = useRef(false)
	const titleInputRef = useRef(titleInput)
	titleInputRef.current = titleInput

	const offlineSnapshotTimerRef = useRef<
		ReturnType<typeof setTimeout> | undefined
	>(undefined)
	const pendingOfflineSnapshotRef = useRef<
		| { readonly title: string; readonly content: Record<string, unknown> }
		| undefined
	>(undefined)

	const { schedule: scheduleAutosave, cancel: cancelAutosave } =
		useDocAutosave(autosaveEnabled)
	const { patchMut, commitMut, discardMut } = useDocDraftMutations()

	// Load the single global offline draft once per document id.
	useEffect(() => {
		let cancelled = false
		setIsCacheLoading(true)
		draftStore.getCurrent().then((entry) => {
			if (cancelled) return
			setOfflineEntry(entry)
			setIsCacheLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [id])

	const initialContent = useMemo(() => {
		if (isCacheLoading) return undefined
		if (draft === undefined) {
			return offlineEntry?.content
		}
		if (offlineEntry?.docId === id && offlineEntry.savedAt > draft.updatedAt) {
			return offlineEntry.content
		}
		return draft.content
	}, [id, draft, offlineEntry, isCacheLoading])

	async function clearOfflineDraft(): Promise<void> {
		await draftStore.clearCurrent()
		setOfflineEntry(undefined)
	}

	async function saveOfflineSnapshot(
		docId: string,
		title: string,
		content: Record<string, unknown>,
	): Promise<void> {
		await draftStore.setCurrent(docId, { title, content, savedAt: Date.now() })
	}

	const flushOfflineSnapshot = useCallback(() => {
		if (offlineSnapshotTimerRef.current !== undefined) {
			clearTimeout(offlineSnapshotTimerRef.current)
			offlineSnapshotTimerRef.current = undefined
		}
		const snapshot = pendingOfflineSnapshotRef.current
		if (snapshot === undefined) return
		pendingOfflineSnapshotRef.current = undefined
		const targetId = currentDocIdRef.current
		saveOfflineSnapshot(targetId, snapshot.title, snapshot.content).catch(
			() => {},
		)
	}, [])

	const scheduleOfflineSnapshot = useCallback(
		(title: string, content: Record<string, unknown>) => {
			pendingOfflineSnapshotRef.current = { title, content }
			if (offlineSnapshotTimerRef.current !== undefined) {
				clearTimeout(offlineSnapshotTimerRef.current)
			}
			offlineSnapshotTimerRef.current = setTimeout(() => {
				offlineSnapshotTimerRef.current = undefined
				flushOfflineSnapshot()
			}, OFFLINE_SNAPSHOT_DEBOUNCE_MS)
		},
		[flushOfflineSnapshot],
	)

	// Cancel any pending autosave timer and flush the offline snapshot when the
	// document identity changes or the hook unmounts.
	useEffect(() => {
		return () => {
			cancelAutosave()
			flushOfflineSnapshot()
		}
	}, [id, cancelAutosave, flushOfflineSnapshot])

	const manualSaveAsync = useCallback(async (): Promise<void> => {
		const targetId = currentDocIdRef.current
		const titleAtSaveStart = titleInputRef.current
		const trimmedTitle = titleAtSaveStart.trim()
		const titleChanged =
			draft !== undefined &&
			trimmedTitle.length > 0 &&
			trimmedTitle !== draft.title
		const contentAtSaveStart = pendingContentRef.current
		if (!titleChanged && contentAtSaveStart === undefined) return
		if (
			contentAtSaveStart !== undefined &&
			charCount > MAX_DOC_CONTENT_TEXT_LENGTH
		) {
			toast.error(t("documents.toast.contentTooLarge"))
			throw new Error("content too large")
		}
		const newDraft = await patchMut.mutateAsync({
			id: targetId,
			title: titleChanged ? trimmedTitle : undefined,
			content: contentAtSaveStart,
		})
		// Treat the just-saved draft as the current baseline so the upcoming
		// invalidation/refetch does not clobber keystrokes typed after the save.
		initializedDocIdRef.current = targetId
		lastDraftUpdatedAtRef.current = newDraft.updatedAt
		await invalidateDocuments(qc, targetId)
		if (currentDocIdRef.current !== targetId) return
		// Only clear the pending buffers if the user has not typed more while
		// the save was in flight. Otherwise the new keystrokes must survive.
		if (pendingContentRef.current === contentAtSaveStart) {
			pendingContentRef.current = undefined
			setContentDirty(false)
		}
		if (titleInputRef.current === titleAtSaveStart && titleChanged) {
			setTitleInputRaw(trimmedTitle)
		}
		flushOfflineSnapshot()
		await clearOfflineDraft()
	}, [draft, charCount, flushOfflineSnapshot, patchMut, qc, t])

	const manualSave = useCallback(
		function manualSave() {
			manualSaveAsync().catch(() => {})
		},
		[manualSaveAsync],
	)

	const flushPendingContent = useCallback(
		function flushPendingContent() {
			manualSaveAsync().catch(() => {})
		},
		[manualSaveAsync],
	)

	const flushPendingContentRef = useRef(flushPendingContent)
	flushPendingContentRef.current = flushPendingContent

	const setTitleInput = useCallback(
		function setTitleInput(next: string) {
			setTitleInputRaw(next)
			if (!autosaveEnabled) return

			const trimmed = next.trim()
			const titleWillBeDirty =
				draft !== undefined && trimmed.length > 0 && trimmed !== draft.title
			if (!titleWillBeDirty) return

			scheduleAutosave(() => flushPendingContentRef.current())
			scheduleOfflineSnapshot(
				next,
				pendingContentRef.current ?? draft?.content ?? {},
			)
		},
		[autosaveEnabled, draft, scheduleAutosave, scheduleOfflineSnapshot],
	)

	const onContentChange = useCallback(
		function onContentChange(content: Record<string, unknown>) {
			// During discard we imperatively replace the editor content with the
			// latest committed version. Ignore the transient onChange so the dirty
			// flag and pending buffer stay cleared.
			if (isDiscardingRef.current) return
			// Ignore repeated emissions of the exact same object reference.
			if (content === pendingContentRef.current) return
			// BlockNote can fire onChange without any actual content delta
			// (e.g. the AI extension touches the document while opening or
			// dismissing its menu). Compare against the saved baseline so the
			// dirty flag and autosave only fire on real edits.
			if (draft !== undefined && contentEquals(content, draft.content)) {
				pendingContentRef.current = undefined
				setContentDirty(false)
				cancelAutosave()
				return
			}
			pendingContentRef.current = content
			setContentDirty(true)
			scheduleAutosave(() => flushPendingContentRef.current())
			// Persist to IndexedDB asynchronously so a refresh does not
			// lose edits made while offline. Debounced so rapid keystrokes do
			// not serialize the whole document on every tick.
			scheduleOfflineSnapshot(titleInputRef.current, content)
		},
		[draft, cancelAutosave, scheduleAutosave, scheduleOfflineSnapshot],
	)

	const titleDirty = useMemo(() => {
		const trimmed = titleInput.trim()
		return draft !== undefined && trimmed.length > 0 && trimmed !== draft.title
	}, [draft, titleInput])

	const discardUnsaved = useCallback(
		function discardUnsaved() {
			if (draft === undefined) return
			isDiscardingRef.current = true
			try {
				editorHandleRef.current?.replaceContent(draft.content)
			} finally {
				isDiscardingRef.current = false
			}
			setTitleInputRaw(draft.title)
			pendingContentRef.current = undefined
			setContentDirty(false)
			cancelAutosave()
			flushOfflineSnapshot()
			clearOfflineDraft().catch(() => {})
		},
		[draft, editorHandleRef, cancelAutosave, flushOfflineSnapshot],
	)

	const dirty = contentDirty || titleDirty
	const hasCommittableChange = computeHasCommittableChange({
		dirty,
		draft,
		latestVersionAt,
	})

	const requestCommit = useCallback(
		function requestCommit(openDialog: () => void) {
			if (!hasCommittableChange) return
			// Persist any unsaved buffer (including title) first so the version
			// captures the editor's current state, not the last autosaved snapshot.
			manualSave()
			openDialog()
		},
		[hasCommittableChange, manualSave],
	)

	const submitCommit = useCallback(
		function submitCommit(message: string, onSuccess: () => void) {
			const targetId = currentDocIdRef.current
			commitMut.mutate(
				{ id: targetId, message: message.trim() || undefined },
				{
					onSuccess: async () => {
						await invalidateDocuments(qc, targetId)
						await clearOfflineDraft()
						toast.success(t("documents.toast.committed"))
						onSuccess()
					},
				},
			)
		},
		[commitMut, qc, t],
	)

	const confirmDiscard = useCallback(
		function confirmDiscard(onSuccess: () => void) {
			const targetId = currentDocIdRef.current
			discardMut.mutate(targetId, {
				onSuccess: async (newDraft) => {
					await clearOfflineDraft()
					await invalidateDocuments(qc, targetId)
					// Only wipe the current buffer if we are still on the discarded doc.
					if (currentDocIdRef.current !== targetId) return

					// Reset the UI to the freshly discarded (HEAD-based) draft
					// immediately. DocEditor only computes its initial blocks at mount,
					// so we must imperatively replace the document body; otherwise the
					// editor would keep showing the discarded draft until remount.
					isDiscardingRef.current = true
					try {
						editorHandleRef.current?.replaceContent(newDraft.content)
					} finally {
						isDiscardingRef.current = false
					}
					setTitleInputRaw(newDraft.title)
					pendingContentRef.current = undefined
					setContentDirty(false)
					initializedDocIdRef.current = undefined
					lastDraftUpdatedAtRef.current = undefined
					flushOfflineSnapshot()
					onSuccess()
				},
			})
		},
		[discardMut, qc, editorHandleRef, flushOfflineSnapshot],
	)

	useEffect(
		// Initialize the title input from the draft or the offline snapshot once
		// per document id / draft version. Re-evaluate when the draft is refetched
		// so a successful save/commit/discard resets the baseline cleanly.
		function syncTitleWithDraft() {
			if (isCacheLoading) return

			// When the document id changes, reset the draft-tracking ref so
			// the next run is treated as a fresh initialization.
			if (initializedDocIdRef.current !== id) {
				lastDraftUpdatedAtRef.current = undefined
			}

			// Skip only when we have already initialised this exact document
			// with this exact draft timestamp.
			if (
				draft !== undefined &&
				initializedDocIdRef.current === id &&
				lastDraftUpdatedAtRef.current === draft.updatedAt
			) {
				return
			}

			if (draft === undefined) {
				if (offlineEntry?.docId === id) {
					initializedDocIdRef.current = id
					lastDraftUpdatedAtRef.current = undefined
					setTitleInputRaw(offlineEntry.title)
					pendingContentRef.current = offlineEntry.content
					setContentDirty(true)
				} else {
					initializedDocIdRef.current = id
					lastDraftUpdatedAtRef.current = undefined
					setTitleInputRaw("")
					pendingContentRef.current = undefined
					setContentDirty(false)
					setCharCount(0)
				}
				return
			}

			if (
				offlineEntry?.docId === id &&
				offlineEntry.savedAt > draft.updatedAt
			) {
				// The offline snapshot is older than the current keystrokes; don't
				// let the debounced snapshot write clobber local edits in progress.
				if (dirty) return
				initializedDocIdRef.current = id
				lastDraftUpdatedAtRef.current = draft.updatedAt
				setTitleInputRaw(offlineEntry.title)
				pendingContentRef.current = offlineEntry.content
				setContentDirty(true)
			} else {
				initializedDocIdRef.current = id
				lastDraftUpdatedAtRef.current = draft.updatedAt
				setTitleInputRaw(draft.title)
				pendingContentRef.current = undefined
				setContentDirty(false)
				if (offlineEntry !== undefined) {
					clearOfflineDraft().catch(() => {})
				}
			}
		},
		[id, draft, offlineEntry, isCacheLoading],
	)

	const setHistoryFlags = useCallback(function setHistoryFlags(flags: {
		canUndo: boolean
		canRedo: boolean
	}) {
		setCanUndo(flags.canUndo)
		setCanRedo(flags.canRedo)
	}, [])

	const onCharCountChange = useCallback(function onCharCountChange(
		count: number,
	) {
		setCharCount(count)
	}, [])

	const charCountOverLimit = charCount > MAX_DOC_CONTENT_TEXT_LENGTH

	return {
		titleInput,
		setTitleInput,
		dirty,
		hasCommittableChange,
		canUndo,
		canRedo,
		charCount,
		charCountOverLimit,
		onCharCountChange,
		setHistoryFlags,
		onContentChange,
		flushPendingContent,
		manualSave,
		manualSaveAsync,
		discardUnsaved,
		requestCommit,
		submitCommit,
		confirmDiscard,
		patchPending: patchMut.isPending,
		commitPending: commitMut.isPending,
		discardPending: discardMut.isPending,
		initialContent,
		isCacheLoading,
	}
}

/**
 * "Has changes since the last committed version", used to gate the commit
 * dialog. A change is recognised when:
 *   1. The editor has an unsaved buffer (`dirty`); or
 *   2. There is a draft and no version yet (first commit); or
 *   3. The draft has been saved more recently than the latest version.
 */
export function computeHasCommittableChange(
	args: Readonly<{
		dirty: boolean
		draft: Readonly<{ updatedAt: number }> | undefined
		latestVersionAt: number | undefined
	}>,
): boolean {
	const { dirty, draft, latestVersionAt } = args
	if (dirty) return true
	if (draft === undefined) return false
	if (latestVersionAt === undefined) return true
	return draft.updatedAt > latestVersionAt
}

/**
 * Cheap structural equality for BlockNote `{version, blocks}` payloads.
 * Used to suppress phantom dirty signals when the editor emits an
 * onChange without an actual document delta (e.g. selection-only mark
 * shuffles around the AI menu).
 */
export function contentEquals(
	next: Record<string, unknown>,
	prev: Record<string, unknown> | undefined,
): boolean {
	if (prev === undefined) return false
	if (next === prev) return true
	return isEqual(next, prev)
}
