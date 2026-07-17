import type { ResCard as ResCardData } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { Checkbox } from "@hoardodile/ui/components/checkbox"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import {
	keepPreviousData,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { Download, ListChecks } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmByTypingDialog } from "@/components/common/ConfirmByTypingDialog"
import { PaginationBar } from "@/components/common/PaginationBar"
import { useDatePrefs } from "@/features/settings/datePrefs"
import { BulkTagsDialog } from "@/features/tags"
import { dayjsFor } from "@/features/usage/lib/date"

import {
	type SetPatch,
	useLocalPatchState,
	useRouteSearchState,
} from "@/hooks/useRouteSearchState"
import { parseFilenameFromContentDisposition } from "@/lib/contentDisposition"
import { pageCountOf } from "@/lib/pagination"
import {
	resolveCardSelection,
	toggleSelectionMembership,
} from "@/lib/searchSelection"
import {
	bulkDownloadResources,
	hardDeleteManyResourcesMutation,
	invalidateResources,
	resDetailCardQueryOptions,
	resKeys,
	resListCardsQueryOptions,
	softDeleteManyResourcesMutation,
} from "../api"
import type { ResSearchState } from "../utils/searchState"
import { RESOURCE_SEARCH_DEFAULTS } from "../utils/searchState"

const MAX_BULK_PACK_DOWNLOAD = 150

import { ResCard } from "./ResCard"
import { ResFilterBar } from "./ResFilterBar"
import { ResSearchPreviewDialog } from "./ResSearchPreviewDialog"

export type ResSearchMultiSelection = {
	readonly mode: "multi"
	readonly selected: readonly string[]
	readonly onChange: (ids: readonly string[]) => void
}

export type ResSearchSingleSelection = {
	readonly mode: "single"
	readonly selected: string | undefined
	readonly onChange: (id: string) => void
}

export type ResSearchSelection =
	| ResSearchMultiSelection
	| ResSearchSingleSelection

type ResSearchProps = {
	/**
	 * When provided the picker enters selection mode: cards hide their action
	 * menu and surface a checkbox / radio overlay. When `undefined` the picker
	 * is a plain browse list.
	 */
	readonly selection?: ResSearchSelection
	/**
	 * When provided, scopes the search to a single character. The character
	 * filter is then hidden from the UI (the picker is treated as a forced,
	 * non-displayed filter), and the "no characters" toggle is suppressed.
	 */
	readonly charId?: string
	/**
	 * Optional controlled browse multi-select. When both are set, the parent
	 * owns the on/off state (e.g. header action on `/resources`). Otherwise
	 * {@link ResSearch} uses internal state and may render a local toggle when
	 * there is no external `selection`.
	 */
	readonly bulkSelectMode?: boolean
	readonly onBulkSelectModeChange?: (on: boolean) => void
	/**
	 * Extra actions rendered before the bulk-select toggle in the toolbar.
	 */
	readonly toolbarLeadingActions?: ReactNode
	/**
	 * Optional initial search state. When provided the component starts from
	 * these values instead of the default empty search.
	 */
	readonly initialState?: Partial<ResSearchState>
}

/**
 * Reusable resource search & listing experience: search box, tag filter,
 * sort/order/random controls, paginated card grid. Backs state with local
 * component state; use {@link ResSearchRouted} on the route surface where
 * filters should round-trip through the URL.
 */
export function ResSearch(props: ResSearchProps) {
	const { initialState } = props
	const [state, patchState] = useLocalPatchState<ResSearchState>({
		...RESOURCE_SEARCH_DEFAULTS,
		...initialState,
	})
	return <ResSearchInner {...props} state={state} patchState={patchState} />
}

/**
 * Route-mounted variant of {@link ResSearch} that persists filter /
 * pagination state in the active route's search params so refreshes
 * restore the same view.
 */
export function ResSearchRouted(props: ResSearchProps) {
	const [state, patchState] = useRouteSearchState<ResSearchState>(
		RESOURCE_SEARCH_DEFAULTS,
	)
	return <ResSearchInner {...props} state={state} patchState={patchState} />
}

type ResSearchInnerProps = ResSearchProps & {
	readonly state: ResSearchState
	readonly patchState: SetPatch<ResSearchState>
}

function ResSearchInner(props: ResSearchInnerProps) {
	const {
		selection,
		charId,
		bulkSelectMode,
		onBulkSelectModeChange,
		toolbarLeadingActions,
		state,
		patchState: patchStateInner,
	} = props
	const { t } = useTranslation()
	const { timeZone } = useDatePrefs()
	const qc = useQueryClient()
	const {
		query,
		page,
		size,
		tagIds,
		tagMode,
		noCharacters,
		trash,
		sortBy,
		order,
		random,
		showOnlySelected,
		contentPluginId,
		searchMetaFacets,
		searchIntro,
	} = state

	const [previewId, setPreviewId] = useState("")
	const handlePreviewRequest = useCallback(
		(resource: ResCardData) => setPreviewId(resource.id),
		[],
	)

	const allowInternalBulk = selection === undefined
	const isBulkControlled =
		bulkSelectMode !== undefined && onBulkSelectModeChange !== undefined
	const [internalBulkMode, setInternalBulkMode] = useState(false)
	const bulkSelectOn = isBulkControlled ? bulkSelectMode : internalBulkMode
	const [bulkIds, setBulkIds] = useState<readonly string[]>([])

	const prevBulkSelectOn = useRef(bulkSelectOn)
	useEffect(() => {
		if (prevBulkSelectOn.current === true && bulkSelectOn === false) {
			setBulkIds([])
			if (showOnlySelected) patchStateInner({ showOnlySelected: false })
		}
		prevBulkSelectOn.current = bulkSelectOn
	}, [bulkSelectOn, showOnlySelected, patchStateInner])

	const patchState = useCallback(
		(partial: Partial<ResSearchState>, opts?: { push?: boolean }) => {
			if (partial.trash !== undefined && partial.trash !== trash) {
				setBulkIds([])
				patchStateInner({ ...partial, showOnlySelected: false }, opts)
				return
			}
			if (
				partial.contentPluginId !== undefined &&
				partial.contentPluginId !== contentPluginId
			) {
				patchStateInner({ ...partial, searchMetaFacets: {} }, opts)
				return
			}
			patchStateInner(partial, opts)
		},
		[trash, contentPluginId, patchStateInner],
	)

	const externalMulti = useMemo(
		() => (selection?.mode === "multi" ? selection : undefined),
		[selection],
	)
	const internalMulti: ResSearchMultiSelection | undefined = useMemo(
		() =>
			allowInternalBulk && bulkSelectOn
				? {
						mode: "multi",
						selected: bulkIds,
						onChange: setBulkIds,
					}
				: undefined,
		[allowInternalBulk, bulkSelectOn, bulkIds],
	)
	const effectiveMulti = useMemo(
		() => externalMulti ?? internalMulti,
		[externalMulti, internalMulti],
	)
	const isMultiSelect = effectiveMulti !== undefined
	const selectedCount = isMultiSelect ? effectiveMulti.selected.length : 0

	const [hardBulkOpen, setHardBulkOpen] = useState(false)
	const [hardBulkTyped, setHardBulkTyped] = useState("")
	const [softBulkOpen, setSoftBulkOpen] = useState(false)
	const [softBulkTyped, setSoftBulkTyped] = useState("")
	const [bulkDownloadPending, setBulkDownloadPending] = useState(false)
	const [bulkTagsOpen, setBulkTagsOpen] = useState(false)

	function setBulkSelectMode(on: boolean) {
		if (isBulkControlled) onBulkSelectModeChange?.(on)
		else setInternalBulkMode(on)
	}

	function handleBulkSelectModeChange(on: boolean) {
		setBulkSelectMode(on)
		if (!on) {
			setBulkIds([])
			if (showOnlySelected) patchStateInner({ showOnlySelected: false })
		}
	}

	const softManyMut = useMutation({
		...softDeleteManyResourcesMutation(),
		onSuccess: async (result) => {
			await invalidateResources(qc)
			await qc.refetchQueries({ queryKey: resKeys.all, type: "inactive" })
			const okSet = new Set(result.okIds)
			setBulkIds((prev) => prev.filter((id) => !okSet.has(id)))
			toastBulkOutcome(t, result.okIds.length, result.failures)
		},
		onError: (err) =>
			toast.error(err.message || t("resources.toast.deleteFailed")),
	})

	const hardManyMut = useMutation({
		...hardDeleteManyResourcesMutation(),
		onSuccess: async (result) => {
			await invalidateResources(qc)
			await qc.refetchQueries({ queryKey: resKeys.all, type: "inactive" })
			const okSet = new Set(result.okIds)
			setBulkIds((prev) => prev.filter((id) => !okSet.has(id)))
			setHardBulkOpen(false)
			setHardBulkTyped("")
			toastBulkOutcome(t, result.okIds.length, result.failures)
		},
		onError: (err) =>
			toast.error(err.message || t("resources.toast.deleteFailed")),
	})

	async function confirmBulkDownload() {
		if (bulkIds.length === 0) return
		if (bulkIds.length > MAX_BULK_PACK_DOWNLOAD) {
			toast.error(
				t("resources.bulk.downloadTooMany", { max: MAX_BULK_PACK_DOWNLOAD }),
			)
			return
		}
		setBulkDownloadPending(true)
		try {
			const res = await bulkDownloadResources(bulkIds, {
				dateStamp: dayjsFor(Date.now(), timeZone).format("YYYY-MM-DD"),
			})
			if (!res.ok) {
				toast.error(
					res.status === 400
						? t("resources.bulk.downloadRejected")
						: t("resources.bulk.downloadFailed"),
				)
				return
			}
			const blob = await res.blob()
			const fromHeader = parseFilenameFromContentDisposition(
				res.headers.get("content-disposition"),
			)
			const fallbackDate = dayjsFor(Date.now(), timeZone).format("YYYY-MM-DD")
			const filename = fromHeader ?? `hoardodile-resources-${fallbackDate}.zip`
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = filename
			document.body.appendChild(a)
			a.click()
			a.remove()
			URL.revokeObjectURL(url)
		} catch {
			toast.error(t("resources.bulk.downloadFailed"))
		} finally {
			setBulkDownloadPending(false)
		}
	}

	function handleBulkSoftDelete() {
		if (bulkIds.length === 0) return
		setSoftBulkOpen(true)
	}

	function handleSoftBulkDialogChange(open: boolean) {
		if (open) return
		setSoftBulkOpen(false)
		setSoftBulkTyped("")
	}

	function handleHardBulkDialogChange(open: boolean) {
		if (open) return
		setHardBulkOpen(false)
		setHardBulkTyped("")
	}

	const listQuery = useQuery({
		...resListCardsQueryOptions({
			query,
			page,
			size,
			trash,
			charId,
			noCharacters: charId === undefined ? noCharacters : undefined,
			tagIds,
			tagMode,
			sortBy,
			order,
			random,
			contentPluginId: contentPluginId === "" ? undefined : contentPluginId,
			searchMetaFacets:
				Object.keys(searchMetaFacets).length > 0 ? searchMetaFacets : undefined,
			searchIntro,
		}),
		enabled: !showOnlySelected,
		placeholderData: keepPreviousData,
	})

	const rows = listQuery.data?.rows ?? []
	const total = listQuery.data?.total ?? 0
	const pageCount = pageCountOf(total, size)

	useEffect(() => {
		if (listQuery.isPlaceholderData) return
		if (rows.length === 0 && total > 0) {
			const target = Math.max(1, page - 1)
			if (target !== page) {
				patchState({ page: target }, { push: true })
			}
		}
	}, [listQuery.isPlaceholderData, page, rows.length, total, patchState])

	const hardBulkExpected = String(bulkIds.length)
	const showBulkToolbar = allowInternalBulk && bulkSelectOn && !showOnlySelected
	const hasBulkActions = bulkIds.length > 0
	const pageRowIds = rows.map((r) => r.id)
	const pageSelectDisabled = pageRowIds.length === 0

	function handleBulkSelectCurrentPage() {
		if (pageRowIds.length === 0) return
		setBulkIds((prev) => {
			const next = new Set(prev)
			for (const id of pageRowIds) next.add(id)
			return [...next]
		})
	}

	function handleBulkInvertCurrentPage() {
		if (pageRowIds.length === 0) return
		setBulkIds((prev) => {
			const next = new Set(prev)
			for (const id of pageRowIds) {
				if (next.has(id)) next.delete(id)
				else next.add(id)
			}
			return [...next]
		})
	}

	return (
		<div className="flex flex-col gap-3">
			<ResFilterBar state={state} patchState={patchState} charId={charId} />
			<div
				className="flex flex-wrap items-center gap-2 min-h-6 text-sm"
				data-testid={showBulkToolbar ? "resource-bulk-toolbar" : undefined}
			>
				{toolbarLeadingActions}
				{allowInternalBulk ? (
					<Button
						type="button"
						variant={bulkSelectOn ? "secondary" : "outline"}
						size="sm"
						onClick={() => handleBulkSelectModeChange(!bulkSelectOn)}
						data-testid="resource-bulk-mode-toggle"
					>
						<ListChecks className="mr-1 size-4" />
						{bulkSelectOn
							? t("resources.bulk.exitSelectMode")
							: t("resources.bulk.enterSelectMode")}
					</Button>
				) : null}
				{showBulkToolbar ? (
					<>
						<span className="text-xs text-muted-foreground">
							{t("resources.bulk.toolbarCount", { count: bulkIds.length })}
						</span>
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={pageSelectDisabled}
							onClick={handleBulkSelectCurrentPage}
							data-testid="resource-bulk-select-page"
						>
							{t("resources.bulk.selectCurrentPage")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={pageSelectDisabled}
							onClick={handleBulkInvertCurrentPage}
							data-testid="resource-bulk-invert-page"
						>
							{t("resources.bulk.invertCurrentPage")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={bulkIds.length === 0}
							onClick={() => setBulkIds([])}
							data-testid="resource-bulk-clear"
						>
							{t("resources.bulk.clearSelection")}
						</Button>
					</>
				) : null}
				{isMultiSelect ? (
					<label
						htmlFor="resource-view-selected"
						className="flex items-center gap-1.5 text-xs text-muted-foreground"
					>
						<Checkbox
							id="resource-view-selected"
							checked={showOnlySelected}
							onCheckedChange={(v) =>
								patchState({ showOnlySelected: v === true })
							}
							disabled={selectedCount === 0}
							data-testid="resource-view-selected"
						/>
						<span>{t("resources.viewSelected", { count: selectedCount })}</span>
					</label>
				) : null}
				{showBulkToolbar && hasBulkActions ? (
					<div className="ml-auto flex flex-wrap gap-2">
						{!trash ? (
							<>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => setBulkTagsOpen(true)}
									data-testid="resource-bulk-edit-tags"
								>
									{t("resources.bulk.editTags")}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="xs"
									disabled={bulkDownloadPending}
									onClick={() => void confirmBulkDownload()}
									data-testid="resource-bulk-download"
									className="gap-1.5"
								>
									<Download className="size-4" />
									{t("resources.bulk.download")}
								</Button>
								<Button
									type="button"
									variant="destructive"
									size="xs"
									disabled={softManyMut.isPending}
									onClick={handleBulkSoftDelete}
									data-testid="resource-bulk-soft-delete"
								>
									{t("resources.bulk.moveToTrash")}
								</Button>
							</>
						) : (
							<Button
								type="button"
								variant="destructive"
								size="sm"
								disabled={hardManyMut.isPending}
								onClick={() => setHardBulkOpen(true)}
								data-testid="resource-bulk-hard-delete"
							>
								{t("resources.bulk.deleteForever")}
							</Button>
						)}
					</div>
				) : null}
				<span
					className={`text-xs text-muted-foreground${showBulkToolbar && hasBulkActions ? "" : " ml-auto"}`}
				>
					{t("resources.search.itemCount", {
						count: showOnlySelected ? selectedCount : total,
					})}
				</span>
			</div>

			{!showOnlySelected && pageCount > 1 ? (
				<PaginationBar
					page={page}
					pageCount={pageCount}
					onChangePage={(p) => patchState({ page: p }, { push: true })}
				/>
			) : null}

			{showOnlySelected && effectiveMulti ? (
				<SelectedResourceList selection={effectiveMulti} />
			) : (
				<ul
					className="flex flex-wrap gap-6 justify-around mt-3"
					data-testid="resource-list"
				>
					{rows.length === 0 ? (
						<li className="col-span-full p-4 text-sm text-muted-foreground">
							{listQuery.isLoading ? (
								<ResListSkeleton />
							) : trash ? (
								t("resources.search.trashEmpty")
							) : (
								t("resources.search.empty")
							)}
						</li>
					) : (
						rows.map((r) => (
							<li key={r.id}>
								<ResCard
									resource={r}
									selection={resolveCardSelection(
										effectiveMulti ?? selection,
										r.id,
									)}
									onPreviewRequest={handlePreviewRequest}
								/>
							</li>
						))
					)}
				</ul>
			)}
			{!showOnlySelected && pageCount > 1 ? (
				<PaginationBar
					page={page}
					pageCount={pageCount}
					onChangePage={(p) => patchState({ page: p }, { push: true })}
				/>
			) : null}
			<ResSearchPreviewDialog
				rows={rows}
				page={page}
				size={size}
				total={total}
				previewId={previewId}
				onChangePreviewId={setPreviewId}
				onChangePage={(p) =>
					patchState({ page: p }, { push: previewId === "" })
				}
			/>

			{showBulkToolbar && hasBulkActions && !trash ? (
				<ConfirmByTypingDialog
					open={softBulkOpen}
					onOpenChange={handleSoftBulkDialogChange}
					title={t("resources.bulk.confirmSoft", { count: bulkIds.length })}
					description={t("resources.bulk.softDeleteDescription")}
					targetName={String(bulkIds.length)}
					expectedInput={String(bulkIds.length)}
					typed={softBulkTyped}
					onTypedChange={setSoftBulkTyped}
					pending={softManyMut.isPending}
					confirmLabel={t("resources.bulk.moveToTrash")}
					pendingLabel={t("common.working")}
					onConfirm={() => softManyMut.mutate(bulkIds)}
					inputTestId="resource-bulk-soft-delete-input"
					confirmTestId="resource-bulk-soft-delete-confirm"
				/>
			) : null}
			{showBulkToolbar && hasBulkActions && trash ? (
				<ConfirmByTypingDialog
					open={hardBulkOpen}
					onOpenChange={handleHardBulkDialogChange}
					title={t("resources.bulk.hardDeleteTitle")}
					description={t("resources.bulk.hardDeleteDescription")}
					targetName={String(bulkIds.length)}
					expectedInput={hardBulkExpected}
					typed={hardBulkTyped}
					onTypedChange={setHardBulkTyped}
					pending={hardManyMut.isPending}
					confirmLabel={t("resources.bulk.hardDeleteConfirm")}
					pendingLabel={t("resources.bulk.hardDeleteDeleting")}
					onConfirm={() => hardManyMut.mutate(bulkIds)}
					inputTestId="resource-bulk-hard-delete-input"
					confirmTestId="resource-bulk-hard-delete-confirm"
				/>
			) : null}
			<BulkTagsDialog
				kind="resource"
				ids={bulkIds}
				open={bulkTagsOpen}
				onOpenChange={setBulkTagsOpen}
			/>
		</div>
	)
}

function toastBulkOutcome(
	t: (key: string, opts?: Record<string, unknown>) => string,
	okCount: number,
	failures: readonly { readonly message: string }[],
): void {
	if (failures.length === 0) {
		toast.success(t("resources.bulk.toastAllOk", { count: okCount }))
		return
	}
	if (okCount === 0) {
		toast.error(t("resources.bulk.toastAllFailed", { count: failures.length }))
		return
	}
	toast.warning(
		t("resources.bulk.toastPartial", {
			ok: okCount,
			failed: failures.length,
		}),
	)
}

// ── Selected viewer (inline list) ───────────────────────────────────────────

type SelectedResourceListProps = {
	readonly selection: ResSearchMultiSelection
}

function SelectedResourceList(props: SelectedResourceListProps) {
	const { selection } = props
	const { t } = useTranslation()
	const ids = selection.selected
	const queries = useQueries({
		queries: ids.map((id) => ({
			...resDetailCardQueryOptions(id),
		})),
	})

	if (ids.length === 0) {
		return (
			<p className="p-4 text-sm text-muted-foreground">
				{t("resources.picker.selectedEmpty")}
			</p>
		)
	}

	return (
		<ul
			className="flex flex-wrap gap-6 justify-around mt-3"
			data-testid="resource-selected-list"
		>
			{ids.map((id, i) => {
				const q = queries[i]
				if (q === undefined || q.data === undefined || q.data === null) {
					return (
						<li key={id} className="p-2 text-xs text-muted-foreground">
							{q === undefined || q.isPending
								? t("resources.search.empty")
								: t("resources.picker.loadFailed")}
						</li>
					)
				}
				return (
					<li key={id} className="min-w-0">
						<ResCard
							resource={q.data}
							selection={{
								selected: true,
								onToggle: () => toggleSelectionMembership(selection, id),
							}}
						/>
					</li>
				)
			})}
		</ul>
	)
}

function ResListSkeleton() {
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<Skeleton className="h-36 rounded-lg" />
			<Skeleton className="hidden h-36 rounded-lg sm:block" />
			<Skeleton className="hidden h-36 rounded-lg lg:block" />
		</div>
	)
}
