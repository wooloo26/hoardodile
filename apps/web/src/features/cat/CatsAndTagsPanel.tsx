import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Category, CatKind } from "@hoardodile/schemas"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { Input } from "@hoardodile/ui/components/input"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { cn } from "@hoardodile/ui/lib/utils"
import { type QueryClient, useQuery } from "@tanstack/react-query"
import { ChevronDownIcon, Copy, Pencil, Pin, Trash2 } from "lucide-react"
import { forwardRef, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AddEntityMetaPill } from "@/components/common/AddEntityMetaPill"
import {
	DeleteEntityButton,
	type DeleteEntityButtonHandle,
} from "@/components/common/DeleteEntityButton"
import { EntityMetaFields } from "@/components/common/EntityMetaFields"
import { ManagementEmpty } from "@/components/common/ManagementEmpty"
import { ReorderModeSwitch } from "@/components/common/ReorderModeSwitch"
import { SortableChipList } from "@/components/common/SortableChipList"
import {
	catListWithCountsQueryOptions,
	createCategoryMutation,
	deleteCategoryMutation,
	forceDeleteCategoryMutation,
	invalidateCategories,
	reorderCategoryMutation,
	updateCategoryMutation,
} from "@/features/cat"
import {
	createTagMutation,
	deleteTagMutation,
	forceDeleteTagMutation,
	invalidateTags,
	reorderTagMutation,
	tagListWithCountsQueryOptions,
	updateTagMutation,
} from "@/features/tags"
import {
	TagChipButton,
	tagHasNoCharOrResUsage,
} from "@/features/tags/TagChipButton"
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import { tagChipDotLineContent } from "@/features/tags/tagChipDotLineContent"
import { useDeleteMutation } from "@/hooks/useDeleteMutation"
import { useReorderMutation } from "@/hooks/useReorderMutation"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { i18n } from "@/i18n"
import { entityMetaDotLine } from "@/lib/entityMetaDotLine"
import {
	buildEntityMetaUpdatePayload,
	entityMetaFromEntity,
} from "@/lib/entityMetaDraft"
import { sortEntityMetas } from "@/lib/sortEntityMetas"
import {
	CATEGORY_KIND_TABS,
	type CatWithCounts,
	groupTagsByCategoryWithCounts,
	isCategoryKind,
	type TagWithCounts,
} from "./panelModel"
import { buildTabs } from "./utils/buildTabs"
import { tagLineLabel } from "./utils/tagLineLabel"

async function invalidateCategoriesAndTags(qc: QueryClient): Promise<void> {
	await invalidateCategories(qc)
	await invalidateTags(qc)
}

const KIND_TABS = CATEGORY_KIND_TABS

/** Fixed chip width while reordering so flex-wrap geometry is stable for @dnd-kit. */
const REORDER_SORTABLE_CHIP_WIDTH_CLASS = "w-40 shrink-0"

/**
 * Combined management UI for categories and their tags. Category tabs and
 * tag pills reuse {@link TagPickerChip}; add flows use a dashed pill at the
 * end of each row. Labels use middle-dot segments (name·count·…).
 */
export function CatsAndTagsPanel() {
	const { t } = useTranslation()
	const catsQ = useQuery(catListWithCountsQueryOptions())
	const tagsQ = useQuery(tagListWithCountsQueryOptions())

	const [activeKind, setActiveKind] = useState<CatKind>("common")
	const [reorderMode, setReorderMode] = useState(false)
	const [tagSearchQuery, setTagSearchQuery] = useState("")
	const loading = catsQ.isLoading || tagsQ.isLoading

	const allCategories = catsQ.data ?? []
	const tags = tagsQ.data ?? []
	const categories = allCategories.filter((c) => c.kind === activeKind)
	const grouped = groupTagsByCategoryWithCounts(tags)

	const {
		orderIds: categoryOrderIds,
		setOrderIds: setCategoryOrderIds,
		reorderMut: catReorderMut,
		sensors: catSensors,
		handleDragEnd: handleCategoryDragEnd,
	} = useReorderMutation({
		mutationOptions: reorderCategoryMutation(),
		invalidate: invalidateCategories,
		buildInput: (ids) => ({ kind: activeKind, ids }),
	})

	useEffect(() => {
		setCategoryOrderIds(undefined)
	}, [activeKind, setCategoryOrderIds])

	const sortableCategories = sortEntityMetas(categories, categoryOrderIds)
	const tabs = buildTabs(sortableCategories)

	const [activeTabId, setActiveTabId] = useState<string | undefined>(undefined)

	const activeExists =
		activeTabId !== undefined && tabs.some((t) => t.id === activeTabId)
	const effectiveActiveId = activeExists ? activeTabId : undefined

	const activeCategory =
		effectiveActiveId !== undefined
			? categories.find((c) => c.id === effectiveActiveId)
			: undefined

	function handleKindChange(next: string) {
		if (!isCategoryKind(next)) return
		setActiveKind(next)
		setActiveTabId(undefined)
		setTagSearchQuery("")
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{!loading ? (
					<ReorderModeSwitch
						id="cats-reorder-mode"
						checked={reorderMode}
						onCheckedChange={setReorderMode}
						label={t("categories.panel.reorderMode")}
						ariaLabel={t("categories.panel.reorderModeAria")}
						testId="categories-reorder-mode"
					/>
				) : null}
				<AddCategoryPill kind={activeKind} />
			</div>

			<ToggleGroup
				type="single"
				value={activeKind}
				onValueChange={handleKindChange}
				variant="outline"
				className="justify-start flex-wrap"
				data-testid="category-kind-tabs"
				role="tablist"
				aria-label={t("categories.panel.kindTabsAria")}
			>
				{KIND_TABS.map((k) => (
					<ToggleGroupItem
						key={k}
						value={k}
						role="tab"
						aria-selected={activeKind === k}
						data-testid={`category-kind-tab-${k}`}
					>
						{t(`categories.panel.kindTab.${k}`)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			{loading ? <CatsPanelSkeleton /> : null}

			{!loading && categories.length === 0 && tags.length === 0 ? (
				<ManagementEmpty data-testid="categories-tags-empty">
					{t("categories.panel.empty")}
				</ManagementEmpty>
			) : null}

			{!loading ? (
				<section
					className="flex flex-wrap items-center gap-1.5"
					data-testid="category-tabs"
				>
					<SortableChipList
						items={sortableCategories}
						renderItem={(category) => (
							<SortableCategoryTab
								key={category.id}
								category={category}
								active={effectiveActiveId === category.id}
								reorderMode={reorderMode}
								dragDisabled={!reorderMode || catReorderMut.isPending}
								onClick={() =>
									setActiveTabId((prev) =>
										prev === category.id ? undefined : category.id,
									)
								}
							/>
						)}
						sensors={catSensors}
						onDragEnd={handleCategoryDragEnd(sortableCategories)}
					/>
				</section>
			) : null}

			{activeCategory !== undefined ? (
				<div className="flex flex-col gap-3 pl-1">
					<Input
						type="search"
						placeholder={t("categories.panel.searchPlaceholder")}
						value={tagSearchQuery}
						onChange={(e) => setTagSearchQuery(e.target.value)}
						className="h-8 text-xs w-60"
						data-testid="cats-and-tags-search"
					/>
					<div>
						<p className="mb-1 text-xs font-medium text-muted-foreground">
							{t("categories.panel.tagLabel")}
						</p>
						<CatSection
							key={activeCategory.id}
							category={activeCategory}
							tags={grouped.get(activeCategory.id) ?? []}
							kind={activeCategory.kind}
							reorderMode={reorderMode}
							searchQuery={tagSearchQuery}
						/>
					</div>
				</div>
			) : null}
		</div>
	)
}

function SortableCategoryTab(props: {
	readonly category: CatWithCounts
	readonly active: boolean
	readonly reorderMode: boolean
	readonly dragDisabled: boolean
	readonly onClick: () => void
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: props.category.id,
		disabled: props.dragDisabled,
		transition: null,
	})
	const { role: _sortableRole, ...tabAttributes } = attributes
	const style: React.CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}
	return (
		<span
			ref={setNodeRef}
			style={style}
			className={cn(
				"inline-flex items-center",
				props.reorderMode && REORDER_SORTABLE_CHIP_WIDTH_CLASS,
				props.reorderMode && "text-left align-top",
				props.reorderMode &&
					!props.dragDisabled &&
					"cursor-grab active:cursor-grabbing",
			)}
			{...tabAttributes}
			{...listeners}
		>
			{props.reorderMode ? (
				<span
					className={cn(
						"inline-flex rounded-sm ring-1 ring-transparent",
						props.reorderMode && "w-full min-w-0",
					)}
				>
					<TagPickerChip
						active={props.active}
						color={props.category.color}
						className={cn(props.reorderMode && "w-full min-w-0")}
					>
						{props.category.pinned ? (
							<Pin className="size-3 shrink-0" aria-hidden />
						) : null}
						{tagChipDotLineContent(
							entityMetaDotLine(props.category.name, props.category.tagCount),
						)}
					</TagPickerChip>
				</span>
			) : (
				<CategoryRow
					category={props.category}
					active={props.active}
					onClick={props.onClick}
				/>
			)}
		</span>
	)
}

function CategoryRow(props: {
	readonly category: CatWithCounts
	readonly active: boolean
	readonly onClick: () => void
}) {
	const { category, active, onClick } = props
	const { t } = useTranslation()
	const [menuOpen, setMenuOpen] = useState(false)
	const [editOpen, setEditOpen] = useState(false)
	const deleteRef = useRef<DeleteEntityButtonHandle>(null)

	const label = entityMetaDotLine(category.name, category.tagCount)

	return (
		<span className="inline-flex max-w-full">
			<TagPickerChip
				active={active}
				color={category.color}
				onClick={onClick}
				roundedRight={false}
				data-testid={`category-tab-${category.id}`}
			>
				<span className="inline-flex items-center gap-1">
					{category.pinned ? (
						<Pin className="size-3 shrink-0" aria-hidden />
					) : null}
					{tagChipDotLineContent(label)}
				</span>
			</TagPickerChip>
			<DropdownMenu modal={false} onOpenChange={setMenuOpen}>
				<DropdownMenuTrigger asChild>
					<TagPickerChip
						active={menuOpen}
						color={category.color}
						className="rounded-l-none border-l-0 px-1.5"
						asChild
					>
						<button type="button">
							<ChevronDownIcon className="size-4" />
						</button>
					</TagPickerChip>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-36">
					<DropdownMenuItem
						onSelect={() => {
							setEditOpen(true)
						}}
						data-testid={`category-open-edit-${category.id}`}
					>
						<Pencil className="h-3.5 w-3.5" />
						{t("common.edit")}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => deleteRef.current?.beginDelete()}
						data-testid={`category-delete-menu-${category.id}`}
					>
						<Trash2 className="h-3.5 w-3.5" />
						{t("deleteEntity.defaultLabel")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{editOpen ? (
				<CategoryEditDialog
					category={category}
					open={editOpen}
					onOpenChange={setEditOpen}
				/>
			) : null}
			<CategoryDeleteButton ref={deleteRef} category={category} hideTrigger />
		</span>
	)
}

const CategoryDeleteButton = forwardRef<
	DeleteEntityButtonHandle,
	{
		readonly category: CatWithCounts
		readonly compactIcon?: boolean
		readonly hideTrigger?: boolean
	}
>(function CategoryDeleteButton(
	{ category, compactIcon = false, hideTrigger = false },
	ref,
) {
	const { t } = useTranslation()
	const { handleDelete, handleForceDelete } = useDeleteMutation({
		deleteOptions: deleteCategoryMutation(),
		forceDeleteOptions: forceDeleteCategoryMutation(),
		invalidate: invalidateCategoriesAndTags,
	})

	return (
		<DeleteEntityButton
			ref={ref}
			entityKindLabel={t("categories.delete.kindLabelCategory")}
			entityName={category.name}
			testId={`category-delete-${category.id}`}
			usageCount={category.tagCount}
			usageLabel={t("categories.delete.usageLabelTags")}
			onDelete={() => handleDelete(category.id)}
			onForceDelete={(typed) => handleForceDelete(category.id, typed)}
			compactIcon={hideTrigger ? false : compactIcon}
			hideTrigger={hideTrigger}
		/>
	)
})

function CatsPanelSkeleton() {
	return (
		<section className="flex flex-wrap gap-1.5">
			<Skeleton className="h-7 w-24 rounded-md" />
			<Skeleton className="h-7 w-20 rounded-md" />
			<Skeleton className="h-7 w-28 rounded-md" />
		</section>
	)
}

// ── Add category (dialog, trailing pill) ─────────────────────────────────────

function AddCategoryPill(props: { readonly kind: CatKind }) {
	const { kind } = props
	const { t } = useTranslation()

	return (
		<AddEntityMetaPill
			label={t("categories.panel.addCategoryPill")}
			dialogTitle={t("categories.dialog.addCategoryTitle")}
			submitLabel={t("categories.form.createCategory")}
			pendingLabel={t("categories.form.creating")}
			testIdPrefix="new-category"
			nameTestId="new-category-name"
			openButtonTestId="open-add-category-dialog"
			createButtonTestId="create-category"
			mutationOptions={createCategoryMutation()}
			invalidate={invalidateCategoriesAndTags}
			buildPayload={(meta) => ({
				...meta,
				kind,
				color: meta.color || undefined,
			})}
			successMessageKey="categories.panel.toast.added"
			errorMessageKey="categories.panel.toast.addFailed"
			showPinned={false}
		/>
	)
}

// ── Category section ────────────────────────────────────────────────────────

type CatSectionProps = {
	readonly category: CatWithCounts
	readonly tags: readonly TagWithCounts[]
	readonly kind: CatKind
	readonly reorderMode: boolean
	readonly searchQuery: string
}

function CatSection(props: CatSectionProps) {
	const { category, tags, kind, reorderMode, searchQuery } = props
	const queryLower = searchQuery.trim().toLowerCase()
	const filteredTags =
		queryLower.length === 0
			? tags
			: tags.filter((t) => t.name.toLowerCase().includes(queryLower))
	const { t } = useTranslation()

	return (
		<section
			className="flex flex-col gap-2"
			data-testid={`category-section-${category.id}`}
		>
			{reorderMode ? (
				<span className="inline-flex max-w-full">
					<span
						className="inline-flex max-w-full min-w-0 rounded-sm ring-1 ring-transparent"
						data-testid={`category-strip-${category.id}`}
					>
						<TagPickerChip color={category.color}>
							{tagChipDotLineContent(
								entityMetaDotLine(category.name, category.tagCount),
							)}
						</TagPickerChip>
					</span>
				</span>
			) : null}

			<SortableTagStrip
				catId={category.id}
				tags={filteredTags}
				kind={kind}
				reorderMode={reorderMode}
			/>
			{filteredTags.length === 0 ? (
				<span className="text-sm text-muted-foreground">
					{t("categories.panel.tagsEmpty")}
				</span>
			) : null}
			<AddTagPill catId={category.id} />
		</section>
	)
}

function SortableTagStrip(props: {
	readonly catId: string
	readonly tags: readonly TagWithCounts[]
	readonly kind: CatKind
	readonly reorderMode: boolean
}) {
	const { orderIds, setOrderIds, reorderMut, sensors, handleDragEnd } =
		useReorderMutation({
			mutationOptions: reorderTagMutation(),
			invalidate: invalidateCategoriesAndTags,
			buildInput: (ids) => ({ catId: props.catId, ids }),
		})

	useEffect(() => {
		setOrderIds(undefined)
	}, [props.catId, setOrderIds])

	const orderedTags = sortEntityMetas(props.tags, orderIds)

	if (orderedTags.length === 0) return null

	return (
		<SortableChipList
			items={orderedTags}
			renderItem={(tag) => (
				<SortableTagRow
					key={tag.id}
					tag={tag}
					kind={props.kind}
					reorderMode={props.reorderMode}
					dragDisabled={!props.reorderMode || reorderMut.isPending}
				/>
			)}
			sensors={sensors}
			onDragEnd={handleDragEnd(orderedTags)}
		/>
	)
}

function SortableTagRow(props: {
	readonly tag: TagWithCounts
	readonly kind: CatKind
	readonly reorderMode: boolean
	readonly dragDisabled: boolean
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: props.tag.id,
		disabled: props.dragDisabled,
		transition: null,
	})
	const style: React.CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}
	return (
		<span
			ref={setNodeRef}
			style={style}
			className={cn(
				props.reorderMode && REORDER_SORTABLE_CHIP_WIDTH_CLASS,
				props.reorderMode && "inline-block align-top",
				props.reorderMode &&
					!props.dragDisabled &&
					"cursor-grab active:cursor-grabbing",
			)}
			{...attributes}
			{...listeners}
		>
			<TagRow
				tag={props.tag}
				kind={props.kind}
				reorderMode={props.reorderMode}
			/>
		</span>
	)
}

function TagRow(props: {
	readonly tag: TagWithCounts
	readonly kind: CatKind
	readonly reorderMode: boolean
}) {
	const { tag, kind, reorderMode } = props
	const { t } = useTranslation()
	const [editOpen, setEditOpen] = useState(false)
	const [tagMenuOpen, setTagMenuOpen] = useState(false)
	const tagDeleteRef = useRef<DeleteEntityButtonHandle>(null)
	const line = tagLineLabel(tag, kind, t)
	const tagColor = tag.color
	const orphan = tagHasNoCharOrResUsage(tag)

	return (
		<span
			className={cn("inline-flex", reorderMode && "w-full min-w-0")}
			data-testid={`tag-row-${tag.id}`}
		>
			{reorderMode ? (
				<span
					className="inline-flex w-full min-w-0 max-w-full rounded-sm ring-1 ring-transparent"
					data-testid={`tag-chip-${tag.id}`}
				>
					<TagPickerChip
						color={tagColor}
						variant={orphan ? "warning" : undefined}
						className="w-full min-w-0"
					>
						<span className="flex min-w-0 flex-1 items-center gap-1 truncate">
							{tag.pinned ? (
								<Pin className="size-3 shrink-0" aria-hidden />
							) : null}
							<span className="truncate">{tag.name}</span>
						</span>
					</TagPickerChip>
				</span>
			) : (
				<TagChipButton
					chip={{
						name: (
							<span className="inline-flex items-center gap-1">
								{tag.pinned ? (
									<Pin className="size-3 shrink-0" aria-hidden />
								) : null}
								{tagChipDotLineContent(line)}
							</span>
						),
						color: tagColor,
						variant: orphan ? "warning" : undefined,
					}}
					menuOpen={tagMenuOpen}
					onMenuOpenChange={setTagMenuOpen}
					triggerTestId={`tag-chip-${tag.id}`}
					contentClassName="min-w-36"
				>
					<DropdownMenuItem
						onSelect={() => setEditOpen(true)}
						data-testid={`tag-open-edit-${tag.id}`}
					>
						<Pencil className="h-3.5 w-3.5" />
						{t("common.edit")}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							void navigator.clipboard.writeText(tag.name).then(
								() => {
									toast.success(t("categories.panel.toast.copied"))
								},
								() => {
									toast.error(t("categories.panel.toast.copyFailed"))
								},
							)
						}}
						data-testid={`tag-copy-${tag.id}`}
					>
						<Copy className="h-3.5 w-3.5" />
						{t("categories.panel.copyTagName")}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => tagDeleteRef.current?.beginDelete()}
						data-testid={`tag-delete-menu-${tag.id}`}
					>
						<Trash2 className="h-3.5 w-3.5" />
						{t("deleteEntity.defaultLabel")}
					</DropdownMenuItem>
				</TagChipButton>
			)}
			{editOpen ? (
				<TagEditDialog tag={tag} open={editOpen} onOpenChange={setEditOpen} />
			) : null}
			<TagDeleteButton ref={tagDeleteRef} tag={tag} hideTrigger />
		</span>
	)
}

const TagDeleteButton = forwardRef<
	DeleteEntityButtonHandle,
	{
		readonly tag: TagWithCounts
		readonly compactIcon?: boolean
		readonly hideTrigger?: boolean
	}
>(function TagDeleteButton(
	{ tag, compactIcon = false, hideTrigger = false },
	ref,
) {
	const { t } = useTranslation()
	const categories = useCategoryOptions()
	const dependencyMessage = buildTagDependencyMessage(tag, categories)
	const { handleDelete, handleForceDelete } = useDeleteMutation({
		deleteOptions: deleteTagMutation(),
		forceDeleteOptions: forceDeleteTagMutation(),
		invalidate: invalidateCategoriesAndTags,
	})

	return (
		<DeleteEntityButton
			ref={ref}
			entityKindLabel={t("categories.delete.kindLabelTag")}
			entityName={tag.name}
			testId={`tag-delete-${tag.id}`}
			dependencyMessage={dependencyMessage}
			onDelete={() => handleDelete(tag.id)}
			onForceDelete={(typed) => handleForceDelete(tag.id, typed)}
			compactIcon={hideTrigger ? false : compactIcon}
			hideTrigger={hideTrigger}
		/>
	)
})

function TagEditDialog(props: {
	readonly tag: TagWithCounts
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}) {
	const { tag, open, onOpenChange } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState(() => entityMetaFromEntity(tag))
	const [catId, setCategoryId] = useState<string>(tag.catId)

	useEffect(() => {
		if (!open) return
		setDraft(entityMetaFromEntity(tag))
		setCategoryId(tag.catId)
	}, [open, tag.id, tag.name, tag.color, tag.intro, tag.pinned, tag.catId])

	const updateMut = useSaveMutation({
		mutationOptions: updateTagMutation(),
		invalidate: invalidateCategoriesAndTags,
		onSaved: () => onOpenChange(false),
	})

	const dirty =
		draft.name.trim() !== tag.name ||
		draft.intro !== tag.intro ||
		draft.color !== tag.color ||
		draft.pinned !== tag.pinned ||
		catId !== tag.catId

	function handleSave() {
		const payload = buildEntityMetaUpdatePayload(tag.id, draft)
		if (payload.name.length === 0) return
		updateMut.mutate({ ...payload, catId })
	}

	const categories = useCategoryOptions()

	const footer = (
		<>
			<Button
				type="button"
				variant="outline"
				onClick={() => onOpenChange(false)}
				disabled={updateMut.isPending}
			>
				{t("common.cancel")}
			</Button>
			<Button
				type="button"
				onClick={handleSave}
				disabled={
					updateMut.isPending || !dirty || draft.name.trim().length === 0
				}
				data-testid={`tag-save-${tag.id}`}
			>
				{updateMut.isPending ? t("common.saving") : t("common.save")}
			</Button>
		</>
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("categories.dialog.editTagTitle")}
			footer={footer}
			contentClassName="sm:max-w-lg"
			contentTestId={`tag-edit-${tag.id}`}
		>
			<div className="flex flex-col gap-3 py-2">
				<EntityMetaFields
					value={draft}
					onChange={(patch) => setDraft({ ...draft, ...patch })}
					disabled={updateMut.isPending}
					testIdPrefix={`tag-${tag.id}`}
					nameTestId={`tag-name-${tag.id}`}
				/>
				<DropdownSelect
					triggerClassName="h-9 rounded border px-2 text-sm"
					value={catId}
					onValueChange={(value) => setCategoryId(value)}
					data-testid={`tag-category-${tag.id}`}
					options={categories.map((c) => ({
						value: c.id,
						label: c.name,
					}))}
				/>
			</div>
		</AppDialog>
	)
}

// ── Add tag (dialog, trailing pill) ─────────────────────────────────────────

function AddTagPill(props: { readonly catId: string }) {
	const { catId } = props
	const { t } = useTranslation()

	return (
		<AddEntityMetaPill
			label={t("categories.panel.addTagPill")}
			dialogTitle={t("categories.dialog.addTagTitle")}
			submitLabel={t("categories.form.addTag")}
			testIdPrefix={`new-tag-${catId}`}
			nameTestId={`new-tag-name-${catId}`}
			openButtonTestId={`open-add-tag-dialog-${catId}`}
			createButtonTestId={`create-tag-${catId}`}
			mutationOptions={createTagMutation()}
			invalidate={invalidateCategoriesAndTags}
			buildPayload={(meta) => ({ ...meta, catId })}
			successMessageKey="categories.panel.toast.added"
			errorMessageKey="categories.panel.toast.addFailed"
			showPinned={false}
		/>
	)
}

// ── Category edit (dialog) ──────────────────────────────────────────────────

function CategoryEditDialog(props: {
	readonly category: CatWithCounts
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}) {
	const { category, open, onOpenChange } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState(() => entityMetaFromEntity(category))

	useEffect(() => {
		if (!open) return
		setDraft(entityMetaFromEntity(category))
	}, [
		open,
		category.id,
		category.name,
		category.color,
		category.intro,
		category.pinned,
	])

	const mut = useSaveMutation({
		mutationOptions: updateCategoryMutation(),
		invalidate: invalidateCategoriesAndTags,
		onSaved: () => onOpenChange(false),
	})

	const dirty =
		draft.name.trim() !== category.name ||
		draft.intro !== category.intro ||
		draft.color !== category.color ||
		draft.pinned !== category.pinned

	function handleSave() {
		const payload = buildEntityMetaUpdatePayload(category.id, draft)
		if (payload.name.length === 0) return
		mut.mutate(payload)
	}

	const footer = (
		<>
			<Button
				type="button"
				variant="outline"
				onClick={() => onOpenChange(false)}
				disabled={mut.isPending}
			>
				{t("common.cancel")}
			</Button>
			<Button
				type="button"
				onClick={handleSave}
				disabled={mut.isPending || !dirty || draft.name.trim().length === 0}
				data-testid={`category-save-${category.id}`}
			>
				{mut.isPending ? t("common.saving") : t("common.save")}
			</Button>
		</>
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("categories.dialog.editCategoryTitle")}
			footer={footer}
			contentClassName="sm:max-w-md"
			contentTestId={`category-edit-dialog-${category.id}`}
		>
			<div className="py-2">
				<EntityMetaFields
					value={draft}
					onChange={(patch) => setDraft({ ...draft, ...patch })}
					disabled={mut.isPending}
					testIdPrefix={`category-${category.id}`}
					nameTestId={`category-name-${category.id}`}
				/>
			</div>
		</AppDialog>
	)
}

function useCategoryOptions(): readonly Category[] {
	const q = useQuery(catListWithCountsQueryOptions())
	return q.data ?? []
}

function buildTagDependencyMessage(
	tag: TagWithCounts,
	categories: readonly Category[],
): string | undefined {
	const category = categories.find((c) => c.id === tag.catId)
	const kind = category?.kind ?? "common"

	const showResources = kind === "common" || kind === "resource"
	const showCharacters = kind === "common" || kind === "character"
	const resCount = showResources ? tag.resCount : 0
	const charCount = showCharacters ? tag.charCount : 0

	if (resCount === 0 && charCount === 0) return undefined

	const parts: string[] = []
	if (showResources)
		parts.push(
			i18n.t("categories.panel.dependencyResources", {
				count: tag.resCount,
			}),
		)
	if (showCharacters)
		parts.push(
			i18n.t("categories.panel.dependencyCharacters", {
				count: tag.charCount,
			}),
		)
	return i18n.t("categories.panel.dependencyMessage", {
		parts: parts.join("、"),
	})
}
