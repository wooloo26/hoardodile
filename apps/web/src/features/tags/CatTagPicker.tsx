import type { CatKind, Tag } from "@hoardodile/schemas"
import { Input } from "@hoardodile/ui/components/input"
import { Separator } from "@hoardodile/ui/components/separator"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Surface } from "@hoardodile/ui/components/surface"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useCategoryList, useCategoryStoreStatus } from "@/features/cat"
import { useTagList, useTagStoreStatus } from "./store"
import { TagPickerChip } from "./TagPickerChip"
import {
	buildSelectedTagGroups,
	filterCategoriesByKind,
	groupTagsByCategory,
} from "./utils/grouping"

export type CatTagPickerProps = {
	readonly value: readonly string[]
	readonly onChange: (ids: readonly string[]) => void
	/** When provided, only categories of this kind are shown. */
	readonly kind?: CatKind
	/** Tag ids that should be visually shown but cannot be toggled. */
	readonly disabledTagIds?: readonly string[]
}

/**
 * Pure tag selection UI grouped by category.
 *
 * Note: AND/OR/NOT match-mode toggle is intentionally NOT part of this
 * component - it belongs to search/filter UIs only. Callers that need a
 * mode toggle should render `TagFilterModeToggle` separately.
 */
export function CatTagPicker(props: CatTagPickerProps) {
	const { value, onChange, kind, disabledTagIds } = props
	const { t } = useTranslation()

	const catsStatus = useCategoryStoreStatus()
	const allCategories = useCategoryList()
	const tagsStatus = useTagStoreStatus()
	const allTags = useTagList()

	const categories = filterCategoriesByKind(allCategories, kind)
	const tagsByCategory = groupTagsByCategory(allTags)

	const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(
		undefined,
	)
	const [searchQuery, setSearchQuery] = useState("")

	const activeCategory =
		activeCategoryId !== undefined
			? categories.find((c) => c.id === activeCategoryId)
			: undefined

	const tagsForActive: readonly Tag[] =
		activeCategory !== undefined
			? (tagsByCategory.get(activeCategory.id) ?? [])
			: []

	const selectedSet = new Set(value)
	const disabledSet = useMemo(
		() => new Set(disabledTagIds ?? []),
		[disabledTagIds],
	)

	function handleCategoryClick(catId: string) {
		setActiveCategoryId((prev) => (prev === catId ? undefined : catId))
		setSearchQuery("")
	}

	function handleTagToggle(tagId: string) {
		if (disabledSet.has(tagId)) return
		if (selectedSet.has(tagId)) {
			onChange(value.filter((id) => id !== tagId))
		} else {
			onChange([...value, tagId])
		}
	}

	const queryLower = searchQuery.trim().toLowerCase()

	const selectedTagsForActive = useMemo(() => {
		const filtered = tagsForActive.filter((td) => selectedSet.has(td.id))
		if (queryLower.length === 0) return filtered
		return filtered.filter((td) => td.name.toLowerCase().includes(queryLower))
	}, [tagsForActive, queryLower])

	const availableTagsForActive = useMemo(() => {
		const filtered = tagsForActive.filter((td) => !selectedSet.has(td.id))
		if (queryLower.length === 0) return filtered
		return filtered.filter((td) => td.name.toLowerCase().includes(queryLower))
	}, [tagsForActive, queryLower])

	if (catsStatus === "loading" || tagsStatus === "loading") {
		return (
			<Surface size="compact" className="space-y-2">
				<p className="text-xs text-muted-foreground">{t("common.loading")}</p>
				<div className="flex gap-2">
					<Skeleton className="h-7 w-20" />
					<Skeleton className="h-7 w-24" />
					<Skeleton className="h-7 w-16" />
				</div>
			</Surface>
		)
	}

	if (categories.length === 0) {
		return (
			<p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				{t("tags.picker.noCategories")}
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1.5">
				{categories.map((cat) => (
					<TagPickerChip
						key={cat.id}
						active={activeCategoryId === cat.id}
						color={cat.color}
						onClick={() => handleCategoryClick(cat.id)}
					>
						{cat.name}
					</TagPickerChip>
				))}
			</div>

			{activeCategory !== undefined ? (
				<div className="flex flex-col gap-3 pl-3">
					<Input
						type="search"
						placeholder={t("tags.picker.searchPlaceholder")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8 text-xs w-60"
						data-testid="cat-tag-picker-search"
					/>

					{selectedTagsForActive.length > 0 ? (
						<div>
							<p className="mb-1 text-xs text-muted-foreground">
								{t("tags.picker.selectedHeader")}
							</p>
							<div className="flex flex-wrap gap-1.5">
								{selectedTagsForActive.map((tag) => (
									<TagPickerChip
										key={tag.id}
										active
										color={tag.color}
										onClick={() => handleTagToggle(tag.id)}
										disabled={disabledSet.has(tag.id)}
									>
										{tag.name}
									</TagPickerChip>
								))}
							</div>
						</div>
					) : null}

					{availableTagsForActive.length > 0 ? (
						<div>
							{selectedTagsForActive.length > 0 ? (
								<Separator className="mb-2" />
							) : null}
							<p className="mb-1 text-xs text-muted-foreground">
								{t("tags.picker.tagsHeader")}
							</p>
							<div className="flex flex-wrap gap-1.5">
								{availableTagsForActive.map((tag) => (
									<TagPickerChip
										key={tag.id}
										active={false}
										color={tag.color}
										onClick={() => handleTagToggle(tag.id)}
										disabled={disabledSet.has(tag.id)}
									>
										{tag.name}
									</TagPickerChip>
								))}
							</div>
						</div>
					) : null}

					{tagsForActive.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							{t("tags.picker.empty")}
						</p>
					) : selectedTagsForActive.length === 0 &&
						availableTagsForActive.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							{t("tags.picker.noMatches")}
						</p>
					) : null}
				</div>
			) : null}

			{value.length > 0 ? (
				<div className="flex flex-col gap-1 rounded-lg bg-muted/25 pl-2">
					{buildSelectedTagGroups(categories, allTags, selectedSet).map(
						(group) => (
							<div
								key={group.category.id}
								className="flex flex-wrap items-center gap-1.5"
							>
								<button
									type="button"
									className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
									onClick={() => handleCategoryClick(group.category.id)}
								>
									{group.category.name}:
								</button>
								{group.tags.map((tag) => (
									<TagPickerChip
										key={tag.id}
										active
										color={tag.color}
										onClick={() => handleCategoryClick(group.category.id)}
									>
										{tag.name}
									</TagPickerChip>
								))}
							</div>
						),
					)}
				</div>
			) : null}
		</div>
	)
}
