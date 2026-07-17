import type { SortBy } from "@hoardodile/shared"
import { Checkbox } from "@hoardodile/ui/components/checkbox"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { DebouncedSearch } from "@/components/common/DebouncedSearch"
import { FlatSurface } from "@/components/layout/PageScaffold"
import {
	pluginListAllQueryOptions,
	renderSearchKindIcon,
	renderSearchKindLabel,
	resolveManifestName,
} from "@/features/plugin"
import { CatTagPicker, TagFilterModeToggle } from "@/features/tags"
import {
	RESOURCE_PAGE_SIZE_OPTIONS,
	type ResSearchState,
} from "../utils/searchState"

const SORT_OPTIONS: readonly { tKey: string; value: SortBy }[] = [
	{ tKey: "resources.search.sortCreated", value: "created" },
	{ tKey: "resources.search.sortUpdated", value: "updated" },
]

export type ResFilterBarProps = {
	readonly state: ResSearchState
	readonly patchState: (
		partial: Partial<ResSearchState>,
		options?: { push?: boolean },
	) => void
	readonly charId: string | undefined
}

/**
 * Filter controls for {@link ResSearch}. Pure rendering: receives
 * the search state plus a `patchState` writer and emits state updates
 * back through it.
 */
export function ResFilterBar(props: ResFilterBarProps) {
	const { state, patchState, charId } = props
	const { t, i18n } = useTranslation()
	const pluginListQuery = useQuery(pluginListAllQueryOptions())
	const pluginOptions = (pluginListQuery.data ?? []).map((p) => ({
		value: p.id,
		label: resolveManifestName(p.manifest, i18n.language),
	}))
	const {
		query,
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
		size,
	} = state

	const selectedPluginManifest =
		contentPluginId !== "" && contentPluginId !== undefined
			? pluginListQuery.data?.find((p) => p.id === contentPluginId)?.manifest
			: undefined
	const searchMetaKinds = selectedPluginManifest?.ui?.search?.kinds

	return (
		<FlatSurface className="space-y-4 bg-card/95">
			<div className="grid lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-center gap-3">
				<DebouncedSearch
					value={query}
					placeholder={t("resources.search.placeholder")}
					testId="search-input"
					onCommit={(v) => patchState({ page: 1, query: v })}
				/>
				<label
					htmlFor="resource-search-intro"
					className="flex items-center gap-1.5 text-xs text-muted-foreground"
				>
					<Checkbox
						id="resource-search-intro"
						checked={searchIntro}
						onCheckedChange={(v) =>
							patchState({ page: 1, searchIntro: v === true })
						}
						data-testid="resource-search-intro"
					/>
					<span>{t("common.searchIncludeIntro")}</span>
				</label>
			</div>

			{showOnlySelected ? null : (
				<>
					<div className="flex flex-col gap-3 text-sm">
						<TagFilterModeToggle
							mode={tagMode}
							onModeChange={(m) => patchState({ page: 1, tagMode: m })}
						/>

						<div data-testid="resource-tag-filter">
							<CatTagPicker
								value={tagIds}
								onChange={(ids) => patchState({ page: 1, tagIds: ids })}
								kind="resource"
							/>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-muted-foreground text-sm">
							{t("resources.search.contentType.label")}
						</span>
						<ToggleGroup
							type="single"
							variant="outline"
							size="sm"
							value={contentPluginId}
							onValueChange={(v) =>
								patchState({
									page: 1,
									contentPluginId: v,
								})
							}
							data-testid="filter-content-type"
						>
							{pluginOptions.map((opt) => (
								<ToggleGroupItem
									key={opt.value}
									value={opt.value}
									className="text-xs"
								>
									{opt.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>
					{searchMetaKinds !== undefined &&
					selectedPluginManifest !== undefined ? (
						<div className="flex flex-wrap items-center gap-3 text-sm">
							{searchMetaKinds.map((kind) => {
								const checked = searchMetaFacets[kind.key] === true
								const label = renderSearchKindLabel(
									kind,
									selectedPluginManifest,
									contentPluginId ?? "",
									i18n.language,
								)
								const kindIcon = renderSearchKindIcon({
									kind,
									manifest: selectedPluginManifest,
									pluginId: contentPluginId ?? "",
									locale: i18n.language,
									iconClassName: "h-4 w-4",
								})
								return (
									<label
										key={kind.key}
										htmlFor={`filter-facet-${kind.key}`}
										className="flex items-center gap-1.5"
									>
										<Checkbox
											id={`filter-facet-${kind.key}`}
											checked={checked}
											onCheckedChange={(v) =>
												patchState({
													page: 1,
													searchMetaFacets: toggleFacet(
														searchMetaFacets,
														kind.key,
														v === true,
													),
												})
											}
											data-testid={`filter-facet-${kind.key}`}
										/>
										{kindIcon !== undefined ? kindIcon : null}
										<span>{label}</span>
									</label>
								)
							})}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-4 text-sm">
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground">
								{t("resources.search.sortLabel")}
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
										className="text-xs"
										key={opt.value}
										value={opt.value}
									>
										{t(opt.tKey)}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground">
								{t("resources.search.orderLabel")}
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
									<ToggleGroupItem key={dir} value={dir} className="text-xs">
										{dir === "desc"
											? t("resources.search.orderDesc")
											: t("resources.search.orderAsc")}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<label
								htmlFor="filter-random"
								className="flex items-center gap-1.5"
							>
								<Checkbox
									id="filter-random"
									checked={random}
									onCheckedChange={(v) =>
										patchState({ page: 1, random: v === true })
									}
									data-testid="filter-random"
								/>
								<span>{t("resources.search.random")}</span>
							</label>
							{charId === undefined ? (
								<label
									htmlFor="filter-no-characters"
									className="flex items-center gap-1.5 text-sm"
								>
									<Checkbox
										id="filter-no-characters"
										checked={noCharacters}
										onCheckedChange={(v) =>
											patchState({ page: 1, noCharacters: v === true })
										}
										data-testid="filter-no-characters"
									/>
									<span>{t("resources.search.noCharacters")}</span>
								</label>
							) : null}
							<label
								htmlFor="filter-trash"
								className="flex items-center gap-1.5 text-sm"
							>
								<Checkbox
									id="filter-trash"
									checked={trash}
									onCheckedChange={(v) =>
										patchState({ page: 1, trash: v === true })
									}
									data-testid="filter-trash"
								/>
								<span>{t("resources.search.trash")}</span>
							</label>
							<div className="flex items-center gap-1.5">
								<span className="text-muted-foreground">
									{t("resources.search.pageSizeLabel")}
								</span>
								<DropdownSelect
									value={String(size)}
									onValueChange={(v) => {
										const next = Number(v)
										if (Number.isFinite(next)) {
											patchState({ page: 1, size: next })
										}
									}}
									size="sm"
									triggerClassName="h-8 w-20 text-xs"
									data-testid="filter-page-size"
									options={RESOURCE_PAGE_SIZE_OPTIONS.map((n) => ({
										value: String(n),
										label: String(n),
									}))}
								/>
							</div>
						</div>
					</div>
				</>
			)}
		</FlatSurface>
	)
}

function toggleFacet(
	current: Record<string, boolean>,
	key: string,
	include: boolean,
): Record<string, boolean> {
	const present = current[key] === true
	if (include === present) return current
	if (include) return { ...current, [key]: true }
	const { [key]: _, ...rest } = current
	return rest
}
