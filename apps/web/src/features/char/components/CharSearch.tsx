import type { TraitFilter } from "@hoardodile/schemas"
import type { SortBy, SortOrder } from "@hoardodile/shared"
import { Button } from "@hoardodile/ui/components/button"
import { Checkbox } from "@hoardodile/ui/components/checkbox"
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@hoardodile/ui/components/input-group"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query"
import { ListChecks, Search } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { PaginationBar } from "@/components/common/PaginationBar"
import { FlatSurface } from "@/components/layout/PageScaffold"
import { useUsageTimeZones } from "@/features/settings/datePrefs"
import {
	BulkTagsDialog,
	CatTagPicker,
	type TagFilterMode,
	TagFilterModeToggle,
} from "@/features/tags"
import {
	type SetPatch,
	useLocalPatchState,
	useRouteSearchState,
} from "@/hooks/useRouteSearchState"
import { pageCountOf } from "@/lib/pagination"
import { formatCalendarDay } from "@/lib/timezone"
import {
	CHARACTER_PAGE_SIZE,
	charDetailCardQueryOptions,
	charListCalendarDay,
	charListCalendarTimeZone,
	charListCardsQueryOptions,
} from "../api"
import {
	resolveCardSelection,
	toggleSelectionMembership,
} from "../utils/charSearchSelection"
import { CharCard } from "./CharCard"
import { CharTraitFilter } from "./CharTraitFilter"
import { RelationshipTypeFilterPicker } from "./RelationshipTypeFilterPicker"

const SORT_OPTIONS: readonly { tKey: string; value: SortBy }[] = [
	{ tKey: "characters.sort.created", value: "created" },
	{ tKey: "characters.sort.updated", value: "updated" },
]

// ── Selection types ──────────────────────────────────────────────────────────

export type CharSearchMultiSelection = {
	readonly mode: "multi"
	readonly selected: readonly string[]
	readonly onChange: (ids: readonly string[]) => void
}

export type CharSearchSingleSelection = {
	readonly mode: "single"
	readonly selected: string | undefined
	readonly onChange: (id: string) => void
}

export type CharSearchSelection =
	| CharSearchMultiSelection
	| CharSearchSingleSelection

// ── Props ────────────────────────────────────────────────────────────────────

export type CharSearchProps = {
	/**
	 * When provided the picker enters selection mode: cards hide their action
	 * menu, disable in-place navigation, and expose a checkbox / radio in the
	 * bottom-right corner. When `undefined` the picker is a plain browse list.
	 */
	readonly selection?: CharSearchSelection
	readonly className?: string
	/**
	 * Optional controlled browse multi-select. When both are set, the parent
	 * owns the on/off state (e.g. header action on `/characters`). Otherwise
	 * {@link CharSearch} uses internal state and may render a local toggle when
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
	readonly initialState?: Partial<CharSearchState>
}

export type CharSearchState = {
	readonly query: string
	readonly page: number
	readonly tagIds: readonly string[]
	readonly tagMode: TagFilterMode
	readonly sortBy: SortBy
	readonly order: SortOrder
	readonly random: boolean
	readonly showOnlySelected: boolean
	readonly trash: boolean
	readonly traitFilters: readonly TraitFilter[]
	readonly searchIntro: boolean
	readonly relationshipTypeIds: readonly string[]
}

export const CHARACTER_SEARCH_DEFAULTS: CharSearchState = {
	query: "",
	page: 1,
	tagIds: [],
	tagMode: "and",
	sortBy: "created",
	order: "desc",
	random: false,
	showOnlySelected: false,
	trash: false,
	traitFilters: [],
	searchIntro: false,
	relationshipTypeIds: [],
}

/**
 * Reusable character search + list UI. Owns search query, tag filters, and
 * pagination state internally via local component state. Used inside dialogs
 * that need to pick one or many characters (relations, resource associations).
 * For the route surface that should mirror filters into the URL, use
 * {@link CharSearchRouted}.
 */
export function CharSearch(props: CharSearchProps) {
	const { initialState } = props
	const [state, patchState] = useLocalPatchState<CharSearchState>({
		...CHARACTER_SEARCH_DEFAULTS,
		...initialState,
	})
	return <CharSearchInner {...props} state={state} patchState={patchState} />
}

/**
 * Route-mounted variant of {@link CharSearch} that persists filter /
 * pagination state in the active route's search params so a hard refresh
 * keeps the same view.
 */
export function CharSearchRouted(props: CharSearchProps) {
	const [state, patchState] = useRouteSearchState<CharSearchState>(
		CHARACTER_SEARCH_DEFAULTS,
	)
	return <CharSearchInner {...props} state={state} patchState={patchState} />
}

type CharSearchInnerProps = CharSearchProps & {
	readonly state: CharSearchState
	readonly patchState: SetPatch<CharSearchState>
}

function CharSearchInner(props: CharSearchInnerProps) {
	const {
		selection,
		className,
		bulkSelectMode,
		onBulkSelectModeChange,
		toolbarLeadingActions,
		state,
		patchState: patchStateInner,
	} = props
	const { t } = useTranslation()
	const { timeZonePref, resolvedTimeZone } = useUsageTimeZones()
	const calendarDay = useMemo(
		() => formatCalendarDay(Date.now(), timeZonePref),
		[timeZonePref, resolvedTimeZone],
	)

	const {
		query,
		page,
		tagIds,
		tagMode,
		sortBy,
		order,
		random,
		showOnlySelected,
		trash,
		traitFilters,
		searchIntro,
		relationshipTypeIds,
	} = state

	const allowInternalBulk = selection === undefined
	const isBulkControlled =
		bulkSelectMode !== undefined && onBulkSelectModeChange !== undefined
	const [internalBulkMode, setInternalBulkMode] = useState(false)
	const bulkSelectOn = isBulkControlled ? bulkSelectMode : internalBulkMode
	const [bulkIds, setBulkIds] = useState<readonly string[]>([])
	const [bulkTagsOpen, setBulkTagsOpen] = useState(false)

	const prevBulkSelectOn = useRef(bulkSelectOn)
	useEffect(() => {
		if (prevBulkSelectOn.current === true && bulkSelectOn === false) {
			setBulkIds([])
			if (showOnlySelected) patchStateInner({ showOnlySelected: false })
		}
		prevBulkSelectOn.current = bulkSelectOn
	}, [bulkSelectOn, showOnlySelected, patchStateInner])

	const patchState = useCallback(
		(partial: Partial<CharSearchState>, opts?: { push?: boolean }) => {
			patchStateInner(partial, opts)
		},
		[patchStateInner],
	)

	const externalMulti = useMemo(
		() => (selection?.mode === "multi" ? selection : undefined),
		[selection],
	)
	const internalMulti: CharSearchMultiSelection | undefined = useMemo(
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
	const effectiveSelection: CharSearchSelection | undefined = useMemo(
		() =>
			effectiveMulti ?? (selection?.mode === "single" ? selection : undefined),
		[effectiveMulti, selection],
	)
	const isMultiSelect = effectiveMulti !== undefined
	const selectedCount = isMultiSelect ? effectiveMulti.selected.length : 0

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

	const listQuery = useQuery({
		...charListCardsQueryOptions({
			query,
			page,
			tagIds,
			tagMode,
			sortBy,
			order,
			random,
			trash,
			traitFilters,
			searchIntro,
			relationshipTypeIds,
			calendarTimeZone: charListCalendarTimeZone(
				traitFilters,
				resolvedTimeZone,
			),
			calendarDay: charListCalendarDay(traitFilters, calendarDay),
		}),
		enabled: !showOnlySelected,
		placeholderData: keepPreviousData,
	})

	const rows = listQuery.data?.rows ?? []
	const total = listQuery.data?.total ?? 0
	const pageCount = pageCountOf(total, CHARACTER_PAGE_SIZE)

	useEffect(() => {
		if (listQuery.isPlaceholderData) return
		if (rows.length === 0 && total > 0) {
			const target = Math.max(1, page - 1)
			if (target !== page) {
				patchState({ page: target }, { push: true })
			}
		}
	}, [listQuery.isPlaceholderData, page, rows.length, total, patchState])

	const showBulkToolbar = allowInternalBulk && bulkSelectOn && !showOnlySelected
	const hasBulkActions = bulkIds.length > 0
	const pageRowIds = rows.map((c) => c.id)
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

	function handleToggleTrash(next: boolean) {
		// Selection state is over live characters; viewing trash should
		// not stay scoped to the prior selection list.
		patchState({
			page: 1,
			trash: next,
			...(next ? { showOnlySelected: false } : {}),
		})
	}

	return (
		<div className={`flex flex-col gap-3 ${className ?? ""}`}>
			<FlatSurface className="space-y-4 bg-card/95">
				<div className="grid lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-center gap-3">
					<InputGroup className="h-11 bg-background text-base sm:text-sm">
						<InputGroupAddon>
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							type="text"
							placeholder={t("characters.searchPlaceholder")}
							value={query}
							onChange={(e) => {
								patchState({ page: 1, query: e.target.value })
							}}
							data-testid="character-search-input"
							disabled={showOnlySelected}
						/>
					</InputGroup>
					<label
						htmlFor="character-search-intro"
						className="flex items-center gap-1.5 text-xs text-muted-foreground"
					>
						<Checkbox
							id="character-search-intro"
							checked={searchIntro}
							onCheckedChange={(v) =>
								patchState({ page: 1, searchIntro: v === true })
							}
							disabled={showOnlySelected}
							data-testid="character-search-intro"
						/>
						<span>{t("common.searchIncludeIntro")}</span>
					</label>
				</div>

				{showOnlySelected ? null : (
					<>
						<div className="flex flex-col gap-3 text-sm">
							<TagFilterModeToggle
								mode={tagMode}
								onModeChange={(m) => {
									patchState({ page: 1, tagMode: m })
								}}
							/>

							<div data-testid="character-tag-filter">
								<CatTagPicker
									value={tagIds}
									onChange={(ids) => {
										patchState({ page: 1, tagIds: ids })
									}}
									kind="character"
								/>
							</div>
							<RelationshipTypeFilterPicker
								value={relationshipTypeIds}
								onChange={(ids) => {
									patchState({ page: 1, relationshipTypeIds: ids })
								}}
							/>
						</div>
						<CharTraitFilter
							value={traitFilters}
							onChange={(next) => patchState({ page: 1, traitFilters: next })}
						/>
						<div className="flex flex-wrap items-center gap-4 text-sm">
							<div className="flex items-center gap-1.5">
								<span className="text-muted-foreground">
									{t("characters.sort.by")}
								</span>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									value={random ? "" : sortBy}
									disabled={random}
									onValueChange={(v) => {
										if (v) patchState({ page: 1, sortBy: v as SortBy })
									}}
								>
									{SORT_OPTIONS.map((opt) => (
										<ToggleGroupItem
											key={opt.value}
											value={opt.value}
											data-testid={`character-sort-${opt.value}`}
											className="text-xs"
										>
											{t(opt.tKey)}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="text-muted-foreground">
									{t("characters.sort.direction")}
								</span>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									value={random ? "" : order}
									disabled={random}
									onValueChange={(v) => {
										if (v === "asc" || v === "desc")
											patchState({ page: 1, order: v })
									}}
								>
									{(["desc", "asc"] as const).map((dir) => (
										<ToggleGroupItem
											key={dir}
											value={dir}
											data-testid={`character-order-${dir}`}
											className="text-xs"
										>
											{dir === "desc"
												? t("characters.sort.desc")
												: t("characters.sort.asc")}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</div>
							<div className="flex flex-wrap items-center gap-2 text-sm">
								<label
									htmlFor="character-random"
									className="flex items-center gap-1.5"
								>
									<Checkbox
										id="character-random"
										checked={random}
										onCheckedChange={(v) => {
											patchState({ page: 1, random: v === true })
										}}
										data-testid="character-random"
									/>
									<span>{t("characters.sort.random")}</span>
								</label>
								<label
									htmlFor="character-filter-trash"
									className="flex items-center gap-1.5 text-sm"
								>
									<Checkbox
										id="character-filter-trash"
										checked={trash}
										onCheckedChange={(v) => handleToggleTrash(v === true)}
										data-testid="character-filter-trash"
									/>
									<span>{t("characters.filter.trash")}</span>
								</label>
							</div>
						</div>
					</>
				)}
			</FlatSurface>
			<div
				className="flex flex-wrap items-center gap-2 min-h-6 text-sm"
				data-testid={showBulkToolbar ? "character-bulk-toolbar" : undefined}
			>
				{toolbarLeadingActions}
				{allowInternalBulk ? (
					<Button
						type="button"
						variant={bulkSelectOn ? "secondary" : "outline"}
						size="sm"
						onClick={() => handleBulkSelectModeChange(!bulkSelectOn)}
						data-testid="character-bulk-mode-toggle"
					>
						<ListChecks className="mr-1 size-4" />
						{bulkSelectOn
							? t("characters.exitSelectMode")
							: t("characters.enterSelectMode")}
					</Button>
				) : null}
				{showBulkToolbar ? (
					<>
						<span className="text-xs text-muted-foreground">
							{t("characters.selectedCount", { count: bulkIds.length })}
						</span>
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={pageSelectDisabled}
							onClick={handleBulkSelectCurrentPage}
							data-testid="character-bulk-select-page"
						>
							{t("resources.bulk.selectCurrentPage")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={pageSelectDisabled}
							onClick={handleBulkInvertCurrentPage}
							data-testid="character-bulk-invert-page"
						>
							{t("resources.bulk.invertCurrentPage")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={bulkIds.length === 0}
							onClick={() => setBulkIds([])}
							data-testid="character-bulk-clear"
						>
							{t("characters.bulk.clearSelection")}
						</Button>
					</>
				) : null}
				{isMultiSelect ? (
					<label
						htmlFor="character-view-selected"
						className="flex items-center gap-1.5 text-xs text-muted-foreground"
					>
						<Checkbox
							id="character-view-selected"
							checked={showOnlySelected}
							onCheckedChange={(v) =>
								patchState({ showOnlySelected: v === true })
							}
							disabled={selectedCount === 0}
							data-testid="character-view-selected"
						/>
						<span>
							{t("characters.viewSelected", { count: selectedCount })}
						</span>
					</label>
				) : null}
				{showBulkToolbar && hasBulkActions ? (
					<div className="ml-auto flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							size="xs"
							onClick={() => setBulkTagsOpen(true)}
							data-testid="character-bulk-edit-tags"
						>
							{t("characters.bulk.editTags")}
						</Button>
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
				<SelectedCharacterList selection={effectiveMulti} />
			) : (
				<ul
					className="flex flex-wrap gap-4 justify-around mt-3"
					data-testid="character-list"
				>
					{rows.length === 0 ? (
						<li className="p-4 text-sm text-muted-foreground">
							{listQuery.isLoading
								? t("common.loading")
								: trash
									? t("characters.trashEmpty")
									: t("characters.listEmpty")}
						</li>
					) : (
						rows.map((c) => (
							<li key={c.id}>
								<CharCard
									character={c}
									selection={resolveCardSelection(effectiveSelection, c.id)}
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
			<BulkTagsDialog
				kind="character"
				ids={bulkIds}
				open={bulkTagsOpen}
				onOpenChange={setBulkTagsOpen}
			/>
		</div>
	)
}

// ── Selected viewer (inline list) ────────────────────────────────────────────

type SelectedCharacterListProps = {
	readonly selection: CharSearchMultiSelection
}

function SelectedCharacterList(props: SelectedCharacterListProps) {
	const { selection } = props
	const { t } = useTranslation()
	const ids = selection.selected
	const queries = useQueries({
		queries: ids.map((id) => ({
			...charDetailCardQueryOptions(id),
		})),
	})

	if (ids.length === 0) {
		return (
			<p className="p-4 text-sm text-muted-foreground">
				{t("characters.picker.selectedEmpty")}
			</p>
		)
	}

	return (
		<ul
			className="flex flex-wrap gap-4 justify-around mt-3"
			data-testid="character-selected-list"
		>
			{ids.map((id, i) => {
				const q = queries[i]
				if (q === undefined || q.data === undefined) {
					// In react-query v5, `isLoading` is only true while a fetch is
					// actively in flight; queued / paused observers return false
					// even though there is no data yet. Use `isPending` so the
					// initial render does not flash the failure label.
					return (
						<li key={id} className="p-2 text-xs text-muted-foreground">
							{q === undefined || q.isPending
								? t("common.loading")
								: t("characters.picker.loadFailed")}
						</li>
					)
				}
				return (
					<li key={id} className="min-w-0">
						<CharCard
							character={q.data}
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
