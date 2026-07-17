import type { EntityMetaDraft, ResCollection } from "@hoardodile/schemas"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { useQuery } from "@tanstack/react-query"
import { Pin } from "lucide-react"
import { forwardRef, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AddEntityMetaPill } from "@/components/common/AddEntityMetaPill"
import {
	DeleteEntityButton,
	type DeleteEntityButtonHandle,
} from "@/components/common/DeleteEntityButton"
import { EntityMetaFields } from "@/components/common/EntityMetaFields"
import { ManageableChipRow } from "@/components/common/ManageableChipRow"
import { ManagementEmpty } from "@/components/common/ManagementEmpty"
import { ManagementSkeleton } from "@/components/common/ManagementSkeleton"
import { ReorderModeSwitch } from "@/components/common/ReorderModeSwitch"
import { SortableChipList } from "@/components/common/SortableChipList"
import { tagChipDotLineContent } from "@/features/tags/tagChipDotLineContent"
import { useDeleteMutation } from "@/hooks/useDeleteMutation"
import { useReorderMutation } from "@/hooks/useReorderMutation"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { entityMetaDotLine } from "@/lib/entityMetaDotLine"
import {
	buildEntityMetaUpdatePayload,
	entityMetaFromEntity,
} from "@/lib/entityMetaDraft"
import { sortEntityMetas } from "@/lib/sortEntityMetas"
import {
	colListWithCountsQueryOptions,
	createCollectionMutation,
	deleteCollectionMutation,
	forceDeleteCollectionMutation,
	invalidateCollections,
	reorderCollectionsMutation,
	updateCollectionMutation,
} from "./api"

export type ColWithCounts = ResCollection & {
	readonly resCount: number
}

const REORDER_SORTABLE_CHIP_WIDTH_CLASS = "w-40 shrink-0"

/**
 * Resource collections: trailing add pill; chips reuse {@link TagPickerChip}
 * with name·count; pin / edit / delete in the chip menu.
 */
export function ColManagementPanel() {
	const { t } = useTranslation()
	const { data: collections, isLoading } = useQuery(
		colListWithCountsQueryOptions(),
	)
	const [reorderMode, setReorderMode] = useState(false)

	const { orderIds, reorderMut, sensors, handleDragEnd } = useReorderMutation({
		mutationOptions: reorderCollectionsMutation(),
		invalidate: invalidateCollections,
		buildInput: (ids) => ({ ids }),
	})

	const sorted = sortEntityMetas(collections ?? [], orderIds)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{!isLoading ? (
					<ReorderModeSwitch
						id="collections-reorder-mode"
						checked={reorderMode}
						onCheckedChange={setReorderMode}
						label={t("collections.panel.reorderMode")}
						ariaLabel={t("collections.panel.reorderModeAria")}
						testId="collections-reorder-mode"
					/>
				) : null}
				<AddCollectionPill />
			</div>

			{isLoading ? (
				<ManagementSkeleton chipCount={2} />
			) : (
				<SortableChipList
					items={sorted}
					renderItem={(collection) => (
						<ColRow
							key={collection.id}
							collection={collection}
							reorderMode={reorderMode}
							dragDisabled={!reorderMode || reorderMut.isPending}
						/>
					)}
					sensors={sensors}
					onDragEnd={handleDragEnd(sorted)}
					listClassName="items-start"
					empty={
						<ManagementEmpty data-testid="collections-empty">
							{t("collections.panel.empty")}
						</ManagementEmpty>
					}
				/>
			)}
		</div>
	)
}

function AddCollectionPill() {
	const { t } = useTranslation()

	return (
		<AddEntityMetaPill
			label={t("collections.panel.addPill")}
			dialogTitle={t("collections.panel.addDialogTitle")}
			submitLabel={t("collections.panel.create")}
			testIdPrefix="collection-create"
			nameTestId="collection-create-name"
			openButtonTestId="open-add-collection-dialog"
			createButtonTestId="collection-create-submit"
			mutationOptions={createCollectionMutation()}
			invalidate={invalidateCollections}
			buildPayload={(payload) => payload}
			successMessageKey="categories.panel.toast.added"
		/>
	)
}

function ColRow(props: {
	readonly collection: ColWithCounts
	readonly reorderMode: boolean
	readonly dragDisabled: boolean
}) {
	const { collection, reorderMode, dragDisabled } = props

	const line = entityMetaDotLine(collection.name, collection.resCount)
	const title =
		collection.intro !== "" && collection.intro !== undefined
			? `${collection.name} — ${collection.intro}`
			: collection.name

	const chipLabel = (
		<span className="inline-flex items-center gap-1">
			{collection.pinned ? (
				<Pin className="size-3 shrink-0" aria-hidden />
			) : null}
			{tagChipDotLineContent(line)}
		</span>
	)

	return (
		<ManageableChipRow
			item={collection}
			reorderMode={reorderMode}
			dragDisabled={dragDisabled}
			chipLabel={chipLabel}
			chipColor={collection.color ?? ""}
			chipVariant={collection.resCount === 0 ? "warning" : undefined}
			chipTitle={title}
			widthClass={reorderMode ? REORDER_SORTABLE_CHIP_WIDTH_CLASS : undefined}
			testIdPrefix="collection"
			editMenuTestId={`collection-edit-${collection.id}`}
			contentClassName="min-w-40"
			renderEditDialog={({ open, onOpenChange }) => (
				<ColEditDialog
					collection={collection}
					open={open}
					onOpenChange={onOpenChange}
				/>
			)}
			renderDeleteButton={(ref) => (
				<ColDeleteButton ref={ref} collection={collection} hideTrigger />
			)}
		/>
	)
}

const ColDeleteButton = forwardRef<
	DeleteEntityButtonHandle,
	{
		readonly collection: ColWithCounts
		readonly hideTrigger?: boolean
	}
>(function ColDeleteButton({ collection, hideTrigger = false }, ref) {
	const { t } = useTranslation()
	const { handleDelete, handleForceDelete } = useDeleteMutation({
		deleteOptions: deleteCollectionMutation(),
		forceDeleteOptions: forceDeleteCollectionMutation(),
		invalidate: invalidateCollections,
	})

	return (
		<DeleteEntityButton
			ref={ref}
			hideTrigger={hideTrigger}
			entityKindLabel={t("collections.entityLabel")}
			entityName={collection.name}
			testId={`collection-delete-${collection.id}`}
			onDelete={() => handleDelete(collection.id)}
			onForceDelete={(typed) => handleForceDelete(collection.id, typed)}
			usageCount={collection.resCount}
			usageLabel={t("collections.usageLabel")}
		/>
	)
})

function ColEditDialog(props: {
	readonly collection: ColWithCounts
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}) {
	const { collection, open, onOpenChange } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState<EntityMetaDraft>(() =>
		entityMetaFromEntity(collection),
	)

	useEffect(() => {
		if (!open) return
		setDraft(entityMetaFromEntity(collection))
	}, [
		open,
		collection.id,
		collection.name,
		collection.intro,
		collection.color,
		collection.pinned,
	])

	const updateMut = useSaveMutation({
		mutationOptions: updateCollectionMutation(),
		invalidate: invalidateCollections,
		onSaved: () => onOpenChange(false),
	})

	function saveEdit() {
		const payload = buildEntityMetaUpdatePayload(collection.id, {
			...draft,
			color: draft.color.trim(),
		})
		if (payload.name.length === 0) return
		updateMut.mutate(payload)
	}

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
				onClick={saveEdit}
				disabled={draft.name.trim().length === 0 || updateMut.isPending}
				data-testid={`collection-edit-submit-${collection.id}`}
			>
				{t("common.save")}
			</Button>
		</>
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("collections.panel.editDialogTitle")}
			footer={footer}
			contentClassName="sm:max-w-md"
			contentTestId={`collection-edit-dialog-${collection.id}`}
		>
			<div className="py-2">
				<EntityMetaFields
					value={draft}
					onChange={(patch) => setDraft({ ...draft, ...patch })}
					disabled={updateMut.isPending}
					testIdPrefix={`collection-edit-${collection.id}`}
				/>
			</div>
		</AppDialog>
	)
}
