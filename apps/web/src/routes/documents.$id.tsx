import {
	MAX_DOC_CONTENT_TEXT_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import { Input } from "@hoardodile/ui/components/input"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { Node } from "prosemirror-model"
import { Fragment, Slice } from "prosemirror-model"
import type { CSSProperties } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MobileDrawer } from "@/components/common/MobileDrawer"
import {
	docDetailPageQueryOptions,
	docVersionQueryOptions,
} from "@/features/doc"
import { DocDetailHeader } from "@/features/doc/components/DocDetailHeader"
import { DocHeadingNav } from "@/features/doc/components/DocHeadingNav"
import { DocStatusBar } from "@/features/doc/components/DocStatusBar"
import { ZenEnso } from "@/features/doc/components/ZenEnso"
import {
	DocCommitDialog,
	DocDiscardDialog,
} from "@/features/doc/DocCommitDialogs"
import {
	blocksToDoc,
	computeInlineDiffDoc,
	type DiffableBlock,
} from "@/features/doc/diff.ts"
import {
	DocEditor,
	type DocEditorHandle,
} from "@/features/doc/editor/DocEditor"
import { useDocBlockPosition } from "@/features/doc/hooks/useDocBlockPosition"
import { useDocDraft } from "@/features/doc/hooks/useDocDraft"
import { useDocLeaveGuard } from "@/features/doc/hooks/useDocLeaveGuard"
import { useDocumentPrefs } from "@/features/doc/hooks/useDocPrefs"
import { scrollBlockToReadingAnchorAfterLayout } from "@/features/doc/lib/docReadingAnchor"
import { zoomLevelAt } from "@/features/doc/prefs"
import { fontArrayCodec } from "@/features/prefs"
import { asyncPrefQueryOptions } from "@/features/prefs/asyncPrefQuery"
import { EntityUsageStats } from "@/features/usage/components/EntityUsageStats"
import { useUsageTracker } from "@/features/usage/useUsageTracker"
import { useKeybinding } from "@/hooks/useKeybinding"
import { usePrefSync, useStringPrefSync } from "@/hooks/usePrefSync"
import { buildFontFamily } from "@/lib/fonts"
import { prefKeys } from "@/lib/keys"
import { useDocLayout } from "./documents"

export const Route = createFileRoute("/documents/$id")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			asyncPrefQueryOptions(prefKeys.docBlockPositions),
		)
		await context.queryClient.ensureQueryData(
			docDetailPageQueryOptions(params.id),
		)
	},
	component: DocDetailRoute,
})

function DocDetailRoute() {
	const { id } = Route.useParams()
	const qc = useQueryClient()
	const { t } = useTranslation()
	const layout = useDocLayout()
	const detailPageQuery = useQuery(docDetailPageQueryOptions(id))
	const view = detailPageQuery.data?.nodeView
	const node = view?.node
	const isTrashed = node?.deletedAt != null
	const draft = view?.draft
	const versions = view?.versions ?? []

	const editorHandleRef = useRef<DocEditorHandle | null>(null)
	const diffEditorHandleRef = useRef<DocEditorHandle | null>(null)
	const appliedDiffVersionRef = useRef<string | undefined>(undefined)
	const [diffMode, setDiffMode] = useState(false)
	const [diffDoc, setDiffDoc] = useState<Node | undefined>(undefined)
	const [diffVersionId, setDiffVersionId] = useState<string | undefined>(
		undefined,
	)
	const [diffCurrentBlocks, setDiffCurrentBlocks] = useState<
		DiffableBlock[] | undefined
	>(undefined)
	const [diffEditorReady, setDiffEditorReady] = useState(false)
	const [enteringDiff, setEnteringDiff] = useState(false)
	const [commitOpen, setCommitOpen] = useState(false)
	const [discardOpen, setDiscardOpen] = useState(false)
	const [commitMessage, setCommitMessage] = useState("")
	const [headings, setHeadings] = useState<
		{ readonly id: string; readonly level: number; readonly text: string }[]
	>([])
	const [mobileNavOpen, setMobileNavOpen] = useState(false)

	const draftStateRef = useRef<{ clearTransientDirty: () => void }>({
		clearTransientDirty() {},
	})

	const prefs = useDocumentPrefs({
		clearTransientDirty: () => draftStateRef.current.clearTransientDirty(),
	})

	const [docEditorFonts] = usePrefSync(
		prefKeys.docEditorFont,
		[],
		fontArrayCodec,
	)
	const docEditorFontFamily = buildFontFamily(docEditorFonts)

	const [lastOpenedId, setLastOpenedId] = useStringPrefSync(
		prefKeys.docLastOpened,
		"",
	)

	const draftState = useDocDraft({
		id,
		draft,
		autosaveEnabled: prefs.autosaveEnabled,
		latestVersionAt: versions[0]?.createdAt,
		editorHandleRef,
		qc,
	})

	useDocLeaveGuard({
		dirty: draftState.dirty,
		message: t("documents.leaveDialog.confirm"),
	})

	// Expose the dirty-clear hook to prefs callbacks (forward declaration
	// because the prefs hook needs a callback that references draftState
	// which is created after it).
	draftStateRef.current.clearTransientDirty = () => {
		// `onContentChange` with the saved baseline collapses the dirty flag.
		if (draft !== undefined) draftState.onContentChange(draft.content)
	}

	const readingModeForUI = prefs.readingMode || isTrashed || diffMode
	const canEnterDiff =
		versions.length > 0 && !diffMode && !isTrashed && !enteringDiff

	const onEditorReady = useDocBlockPosition({
		docId: id,
		editorHandleRef,
	})

	const handleNavigateToHeading = useCallback(function handleNavigateToHeading(
		blockId: string,
	) {
		const editor = editorHandleRef.current?.editor
		if (editor === undefined) return
		editor.setTextCursorPosition(blockId, "start")
		scrollBlockToReadingAnchorAfterLayout(blockId, editor.domElement, 0)
		setMobileNavOpen(false)
	}, [])

	const handleUndo = useCallback(function handleUndo() {
		editorHandleRef.current?.undo()
	}, [])

	const handleRedo = useCallback(function handleRedo() {
		editorHandleRef.current?.redo()
	}, [])

	const handleToggleReadingMode = useCallback(
		function handleToggleReadingMode() {
			prefs.toggleReadingMode(draftState.manualSave)
		},
		[prefs.toggleReadingMode, draftState.manualSave],
	)

	const handleToggleAutosave = useCallback(
		function handleToggleAutosave() {
			prefs.toggleAutosave(draftState.manualSave)
		},
		[prefs.toggleAutosave, draftState.manualSave],
	)

	const handleRequestCommit = useCallback(
		function handleRequestCommit() {
			draftState.requestCommit(() => {
				setCommitMessage("")
				setCommitOpen(true)
			})
		},
		[draftState.requestCommit],
	)

	const handleOpenDiscard = useCallback(function handleOpenDiscard() {
		setDiscardOpen(true)
	}, [])

	const handleOpenHeadingNav = useCallback(function handleOpenHeadingNav() {
		setMobileNavOpen(true)
	}, [])

	const handleCommitSubmit = useCallback(
		function handleCommitSubmit() {
			draftState.submitCommit(commitMessage, () => {
				setCommitOpen(false)
				setCommitMessage("")
			})
		},
		[draftState.submitCommit, commitMessage],
	)

	const handleDiscardConfirm = useCallback(
		function handleDiscardConfirm() {
			draftState.confirmDiscard(() => setDiscardOpen(false))
		},
		[draftState.confirmDiscard],
	)

	useEffect(() => {
		// Leaving diff mode whenever the document identity changes prevents
		// showing another document's diff on top of the current editor.
		setDiffMode(false)
		setDiffDoc(undefined)
		setDiffVersionId(undefined)
		setDiffCurrentBlocks(undefined)
		setDiffEditorReady(false)
		appliedDiffVersionRef.current = undefined
	}, [id])

	useKeybinding({ key: "s", ctrlOrMeta: true }, function handleForceSave() {
		if (readingModeForUI) return
		if (node?.kind !== "document" || draft === undefined) return
		draftState.manualSaveAsync().then(() => {
			toast.success(t("documents.toast.saved"))
		})
	})

	useUsageTracker({
		entityType: "document",
		entityId: id,
		enabled:
			!detailPageQuery.isLoading &&
			!draftState.isCacheLoading &&
			!diffMode &&
			node?.kind === "document" &&
			draft !== undefined,
	})

	useEffect(() => {
		if (
			!detailPageQuery.isLoading &&
			node?.kind === "document" &&
			draft !== undefined &&
			id !== lastOpenedId
		) {
			setLastOpenedId(id)
		}
	}, [
		id,
		node?.kind,
		draft,
		detailPageQuery.isLoading,
		lastOpenedId,
		setLastOpenedId,
	])

	const handleEnterDiff = useCallback(
		async function handleEnterDiff() {
			if (versions.length === 0) return
			const editor = editorHandleRef.current?.editor
			if (editor === undefined) return
			setEnteringDiff(true)
			try {
				// Flush any buffered edits and wait for the save to settle so the
				// diff matches what the user sees, and so the main editor remounts
				// with fresh content when the diff is closed.
				await draftState.manualSaveAsync()
			} catch {
				// The mutation layer already toasts the failure; stay out of diff.
				return
			} finally {
				setEnteringDiff(false)
			}
			setDiffCurrentBlocks(editor.document as DiffableBlock[])
			setDiffVersionId(versions[0]?.id)
			setDiffMode(true)
		},
		[draftState.manualSaveAsync, versions],
	)

	const handleExitDiff = useCallback(function handleExitDiff() {
		setDiffMode(false)
		setDiffDoc(undefined)
		setDiffVersionId(undefined)
		setDiffCurrentBlocks(undefined)
		setDiffEditorReady(false)
		appliedDiffVersionRef.current = undefined
	}, [])

	const handleDiffEditorReady = useCallback(function handleDiffEditorReady():
		| (() => void)
		| undefined {
		setDiffEditorReady(true)
		return undefined
	}, [])

	const selectedVersionQuery = useQuery({
		...docVersionQueryOptions(id, diffVersionId ?? ""),
		enabled: diffMode && diffVersionId !== undefined,
	})

	useEffect(() => {
		if (
			!diffMode ||
			diffCurrentBlocks === undefined ||
			diffVersionId === undefined
		)
			return
		const editor = diffEditorHandleRef.current?.editor
		if (editor === undefined) return
		const version = selectedVersionQuery.data
		if (version === undefined) return
		// Diffing large documents is expensive; defer it so the UI stays
		// responsive while the diff editor mounts.
		const timer = setTimeout(() => {
			const schema = editor._tiptapEditor.state.schema
			const baseBlocks =
				(version.content.blocks as DiffableBlock[] | undefined) ?? []
			const diff =
				computeInlineDiffDoc(editor, baseBlocks, diffCurrentBlocks) ??
				blocksToDoc(schema, diffCurrentBlocks)
			setDiffDoc(diff)
			appliedDiffVersionRef.current = undefined
		}, 0)
		return () => clearTimeout(timer)
	}, [
		diffMode,
		diffCurrentBlocks,
		diffVersionId,
		diffEditorReady,
		selectedVersionQuery.data,
	])

	useEffect(() => {
		if (!diffMode || !diffEditorReady || diffDoc === undefined) return
		const editor = diffEditorHandleRef.current?.editor
		if (editor === undefined) return
		if (appliedDiffVersionRef.current === diffVersionId) return
		const tiptap = editor._tiptapEditor
		const tr = tiptap.state.tr
		tr.replace(0, tr.doc.content.size, new Slice(Fragment.from(diffDoc), 0, 0))
		tiptap.view.dispatch(tr.setMeta("addToHistory", false))
		appliedDiffVersionRef.current = diffVersionId
	}, [diffMode, diffEditorReady, diffDoc, diffVersionId])

	if (detailPageQuery.isLoading) {
		return (
			<div className="flex h-full min-h-[50svh] flex-col items-center justify-center gap-4 text-muted-foreground">
				<ZenEnso
					variant="spin"
					className="size-10 text-primary/70"
					strokeWidth={6}
				/>
				<span className="doc-label">{t("common.loading")}</span>
			</div>
		)
	}
	if (node === undefined) {
		return (
			<div className="flex h-full min-h-[50svh] flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
				<ZenEnso className="size-12 text-muted-foreground/40" strokeWidth={5} />
				<p className="text-sm">{t("common.unknownError")}</p>
			</div>
		)
	}
	if (node.kind !== "document" || draft === undefined) {
		// Folder selected - render a lightweight placeholder so the
		// layout still feels responsive while the user navigates the tree.
		return (
			<div className="flex h-full min-h-[50svh] flex-col items-center justify-center gap-5 p-8 text-center">
				<ZenEnso
					variant="breathe"
					className="size-16 text-muted-foreground/40"
					strokeWidth={5}
				/>
				<div className="flex flex-col gap-1.5">
					<p className="text-xl font-semibold tracking-wide">{node.title}</p>
					<p className="text-sm text-muted-foreground">
						{t("documents.folderHint")}
					</p>
				</div>
			</div>
		)
	}

	if (draftState.isCacheLoading) {
		return (
			<div className="flex h-full min-h-[50svh] flex-col items-center justify-center gap-4 text-muted-foreground">
				<ZenEnso
					variant="spin"
					className="size-10 text-primary/70"
					strokeWidth={6}
				/>
				<span className="doc-label">{t("common.loading")}</span>
			</div>
		)
	}

	const zoom = zoomLevelAt(prefs.fontSizeIndex)

	return (
		<div
			className="flex min-w-0 w-full min-h-full"
			data-reading={readingModeForUI ? "true" : "false"}
		>
			<div className="doc-sheet-col mx-auto flex min-w-0 w-full max-w-3xl flex-col gap-3 md:max-w-5xl md:gap-4">
				<DocDetailHeader
					readingMode={readingModeForUI}
					readingModeLocked={isTrashed || diffMode}
					diffMode={diffMode}
					canEnterDiff={canEnterDiff}
					autosaveEnabled={prefs.autosaveEnabled}
					indentEnabled={prefs.indentEnabled}
					fontSizeIndex={prefs.fontSizeIndex}
					zoom={zoom}
					canUndo={draftState.canUndo}
					canRedo={draftState.canRedo}
					dirty={draftState.dirty}
					hasCommittableChange={draftState.hasCommittableChange}
					hasVersions={versions.length > 0}
					versions={versions}
					diffVersionId={diffVersionId}
					onChangeDiffVersionId={setDiffVersionId}
					patchPending={draftState.patchPending}
					commitPending={draftState.commitPending}
					discardPending={draftState.discardPending}
					onUndo={handleUndo}
					onRedo={handleRedo}
					onToggleReadingMode={handleToggleReadingMode}
					onToggleAutosave={handleToggleAutosave}
					onToggleIndent={prefs.toggleIndent}
					onAdjustFontSize={prefs.adjustFontSize}
					onResetFontSize={prefs.resetFontSize}
					onManualSave={draftState.manualSave}
					onRequestCommit={handleRequestCommit}
					onOpenDiscard={handleOpenDiscard}
					onEnterDiff={handleEnterDiff}
					onExitDiff={handleExitDiff}
					onOpenTree={layout?.onOpenTree}
					onOpenHeadingNav={
						headings.length > 0 ? handleOpenHeadingNav : undefined
					}
				/>

				{node.kind === "document" ? (
					<EntityUsageStats
						className="ml-2"
						entityType="document"
						entityId={id}
					/>
				) : null}

				{readingModeForUI ? (
					<h1
						className="doc-title-underline mx-5 pb-2 text-3xl font-semibold tracking-wide md:mx-13.5 md:text-4xl"
						data-testid="document-title-readonly"
					>
						{draftState.titleInput.length > 0
							? draftState.titleInput
							: t("documents.untitled")}
					</h1>
				) : (
					<div className="px-3 md:px-13.5">
						<div className="doc-title-underline flex items-center gap-2 pb-1.5">
							<Input
								value={draftState.titleInput}
								onChange={(e) => draftState.setTitleInput(e.target.value)}
								maxLength={MAX_NAME_LENGTH}
								placeholder={t("documents.untitled")}
								className="h-auto border-0 bg-transparent px-0 py-1 text-3xl font-semibold tracking-wide shadow-none focus-visible:ring-0 md:text-4xl dark:bg-transparent"
								data-testid="document-title"
							/>
						</div>
					</div>
				)}

				<div
					data-doc-zoom-root
					data-doc-indent={prefs.indentEnabled ? "true" : "false"}
					data-doc-diff={diffMode ? "true" : "false"}
					className="flex-1 pl-4 pr-5 md:px-0"
					style={
						{
							"--doc-zoom": String(zoom),
							...(docEditorFontFamily
								? { "--font-doc-editor": docEditorFontFamily }
								: {}),
						} as CSSProperties
					}
				>
					{diffMode ? (
						<DocEditor
							key={`${id}-diff`}
							value={
								selectedVersionQuery.data?.content as Record<string, unknown>
							}
							editable={false}
							handleRef={diffEditorHandleRef}
							onReady={handleDiffEditorReady}
						/>
					) : (
						<DocEditor
							key={id}
							value={draftState.initialContent}
							editable={!prefs.readingMode && !isTrashed}
							placeholder={t("documents.placeholder")}
							onChange={draftState.onContentChange}
							onHistoryChange={draftState.setHistoryFlags}
							onHeadingsChange={setHeadings}
							onCharCountChange={draftState.onCharCountChange}
							handleRef={editorHandleRef}
							onReady={onEditorReady}
						/>
					)}
					{!diffMode && (
						<DocStatusBar
							charCount={draftState.charCount}
							maxCharCount={MAX_DOC_CONTENT_TEXT_LENGTH}
						/>
					)}
				</div>

				<DocCommitDialog
					open={commitOpen}
					onOpenChange={setCommitOpen}
					message={commitMessage}
					onMessageChange={setCommitMessage}
					onSubmit={handleCommitSubmit}
					isPending={draftState.commitPending}
					hasCommittableChange={draftState.hasCommittableChange}
				/>

				<DocDiscardDialog
					open={discardOpen}
					onOpenChange={setDiscardOpen}
					onConfirm={handleDiscardConfirm}
					isPending={draftState.discardPending}
				/>
			</div>
			{headings.length > 0 && (
				<aside className="sticky top-12 hidden h-[calc(100svh-3rem)] w-52 shrink-0 flex-col overflow-y-auto border-l border-border/40 py-6 pl-3 pr-4 lg:flex">
					<p className="doc-label mb-3 px-2">{t("documents.headings")}</p>
					<DocHeadingNav
						headings={headings}
						onNavigate={handleNavigateToHeading}
					/>
				</aside>
			)}
			<MobileDrawer
				open={mobileNavOpen}
				onOpenChange={setMobileNavOpen}
				side="right"
				width="w-64"
				title={t("documents.headings")}
			>
				<div className="h-full overflow-y-auto p-3">
					<DocHeadingNav
						headings={headings}
						onNavigate={handleNavigateToHeading}
					/>
				</div>
			</MobileDrawer>
		</div>
	)
}
