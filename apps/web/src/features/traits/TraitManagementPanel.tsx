import { MAX_TRAIT_NAME_LENGTH } from "@hoardodile/consts/text-limits"
import type { EntityMetaDraft, TraitKind } from "@hoardodile/schemas"
import { TRAIT_KINDS } from "@hoardodile/schemas"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Badge } from "@hoardodile/ui/components/badge"
import { Button } from "@hoardodile/ui/components/button"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { useQuery } from "@tanstack/react-query"
import { Pin, Plus } from "lucide-react"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import { tagChipDotLineContent } from "@/features/tags/tagChipDotLineContent"
import { useDelayedReset } from "@/hooks/useDelayedReset"
import { useDeleteMutation } from "@/hooks/useDeleteMutation"
import { useReorderMutation } from "@/hooks/useReorderMutation"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { entityMetaDotLine } from "@/lib/entityMetaDotLine"
import {
	buildEntityMetaCreatePayload,
	buildEntityMetaUpdatePayload,
	emptyEntityMetaDraft,
	entityMetaFromEntity,
} from "@/lib/entityMetaDraft"
import { sortEntityMetas } from "@/lib/sortEntityMetas"
import {
	createTraitMutation,
	deleteTraitMutation,
	forceDeleteTraitMutation,
	invalidateTraits,
	reorderTraitMutation,
	type TraitDefWithCounts,
	traitListWithCountsQueryOptions,
	updateTraitMutation,
} from "./api"

const REORDER_SORTABLE_CHIP_WIDTH_CLASS = "w-40 shrink-0"

export function isTraitKind(value: string): value is TraitKind {
	for (const k of TRAIT_KINDS) {
		if (k === value) return true
	}
	return false
}

/**
 * Global trait definitions: add via trailing pill dialog; chips reuse
 * {@link TagPickerChip} with name·kind·count; menu for edit/delete.
 */
export function TraitManagementPanel() {
	const listQuery = useQuery(traitListWithCountsQueryOptions())
	const traitsRaw: readonly TraitDefWithCounts[] = listQuery.data ?? []
	const { t } = useTranslation()
	const [reorderMode, setReorderMode] = useState(false)

	const { orderIds, reorderMut, sensors, handleDragEnd } = useReorderMutation({
		mutationOptions: reorderTraitMutation(),
		invalidate: invalidateTraits,
		buildInput: (ids) => ({ ids }),
	})

	const traits = sortEntityMetas(traitsRaw, orderIds)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{!listQuery.isLoading ? (
					<ReorderModeSwitch
						id="traits-reorder-mode"
						checked={reorderMode}
						onCheckedChange={setReorderMode}
						label={t("traits.panel.reorderMode")}
						ariaLabel={t("traits.panel.reorderModeAria")}
						testId="traits-reorder-mode"
					/>
				) : null}
				<AddTraitPill />
			</div>

			{listQuery.isLoading ? (
				<ManagementSkeleton chipCount={2} />
			) : (
				<SortableChipList
					items={traits}
					renderItem={(trait) => (
						<TraitRow
							key={trait.id}
							trait={trait}
							reorderMode={reorderMode}
							dragDisabled={!reorderMode || reorderMut.isPending}
						/>
					)}
					sensors={sensors}
					onDragEnd={handleDragEnd(traits)}
					empty={
						<ManagementEmpty data-testid="trait-empty">
							{t("traits.panel.empty")}
						</ManagementEmpty>
					}
				/>
			)}
		</div>
	)
}

function TraitRow(props: {
	readonly trait: TraitDefWithCounts
	readonly reorderMode: boolean
	readonly dragDisabled: boolean
}) {
	const { trait, reorderMode, dragDisabled } = props
	const { t } = useTranslation()

	const line = useMemo(
		() =>
			entityMetaDotLine(
				trait.name,
				t(`traits.kind.${trait.kind}`),
				trait.charCount,
			),
		[trait, t],
	)

	const chipLabel = (
		<span className="inline-flex items-center gap-1">
			{trait.pinned ? <Pin className="size-3 shrink-0" aria-hidden /> : null}
			{tagChipDotLineContent(line)}
		</span>
	)

	return (
		<ManageableChipRow
			item={trait}
			reorderMode={reorderMode}
			dragDisabled={dragDisabled}
			chipLabel={chipLabel}
			chipColor={trait.color ?? ""}
			chipVariant={trait.charCount === 0 ? "warning" : undefined}
			widthClass={reorderMode ? REORDER_SORTABLE_CHIP_WIDTH_CLASS : undefined}
			testIdPrefix="trait"
			contentClassName="min-w-36"
			renderEditDialog={({ open, onOpenChange }) => (
				<TraitEditDialog
					trait={trait}
					open={open}
					onOpenChange={onOpenChange}
				/>
			)}
			renderDeleteButton={(ref) => (
				<TraitDeleteButton ref={ref} trait={trait} hideTrigger />
			)}
		/>
	)
}

const TraitDeleteButton = forwardRef<
	DeleteEntityButtonHandle,
	{
		readonly trait: TraitDefWithCounts
		readonly compactIcon?: boolean
		readonly hideTrigger?: boolean
	}
>(function TraitDeleteButton(
	{ trait, compactIcon = false, hideTrigger = false },
	ref,
) {
	const { t } = useTranslation()
	const { handleDelete, handleForceDelete } = useDeleteMutation({
		deleteOptions: deleteTraitMutation(),
		forceDeleteOptions: forceDeleteTraitMutation(),
		invalidate: invalidateTraits,
	})

	return (
		<DeleteEntityButton
			ref={ref}
			entityKindLabel={t("traits.delete.kindLabel")}
			entityName={trait.name}
			testId={`trait-delete-${trait.id}`}
			usageCount={trait.charCount}
			usageLabel={t("traits.delete.usageLabel")}
			onDelete={() => handleDelete(trait.id)}
			onForceDelete={(typed) => handleForceDelete(trait.id, typed)}
			compactIcon={hideTrigger ? false : compactIcon}
			hideTrigger={hideTrigger}
		/>
	)
})

function TraitEditDialog(props: {
	readonly trait: TraitDefWithCounts
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}) {
	const { trait, open, onOpenChange } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState<EntityMetaDraft>(() =>
		entityMetaFromEntity(trait),
	)

	useEffect(() => {
		if (!open) return
		setDraft(entityMetaFromEntity(trait))
	}, [open, trait.id, trait.name, trait.color, trait.intro, trait.pinned])

	const updateMut = useSaveMutation({
		mutationOptions: updateTraitMutation(),
		invalidate: invalidateTraits,
		onSaved: () => onOpenChange(false),
	})

	function handleSave() {
		const payload = buildEntityMetaUpdatePayload(trait.id, {
			...draft,
			color: draft.color.trim(),
			intro: draft.intro.trim(),
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
				onClick={handleSave}
				disabled={updateMut.isPending || draft.name.trim().length === 0}
				data-testid={`trait-save-${trait.id}`}
			>
				{updateMut.isPending ? t("common.saving") : t("common.save")}
			</Button>
		</>
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("traits.panel.editDialogTitle")}
			footer={footer}
			contentClassName="sm:max-w-lg"
			contentTestId={`trait-edit-${trait.id}`}
		>
			<div className="flex flex-col gap-3 py-2">
				<EntityMetaFields
					value={draft}
					onChange={(patch) => setDraft({ ...draft, ...patch })}
					maxNameLength={MAX_TRAIT_NAME_LENGTH}
					disabled={updateMut.isPending}
					testIdPrefix={`trait-edit-${trait.id}`}
					nameTestId={`trait-edit-name-${trait.id}`}
				/>
				<Badge variant="secondary" className="w-fit rounded-md text-sm">
					{t(`traits.kind.${trait.kind}`)}
				</Badge>
			</div>
		</AppDialog>
	)
}

function AddTraitPill() {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState<EntityMetaDraft>(emptyEntityMetaDraft())
	const [kind, setKind] = useState<TraitKind>("text")
	const delayedReset = useDelayedReset()

	function resetForm() {
		setDraft(emptyEntityMetaDraft())
		setKind("text")
	}

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen)
		if (!nextOpen) {
			delayedReset.schedule(resetForm)
		} else {
			delayedReset.cancel()
		}
	}

	const createMut = useSaveMutation({
		mutationOptions: createTraitMutation(),
		invalidate: invalidateTraits,
		onSaved: () => handleOpenChange(false),
		successMessageKey: "traits.panel.toast.added",
	})

	function handleSave() {
		const meta = buildEntityMetaCreatePayload({
			...draft,
			color: draft.color.trim(),
			intro: draft.intro.trim(),
		})
		if (meta === undefined) return
		createMut.mutate({
			...meta,
			kind,
		})
	}

	const footer = (
		<>
			<Button
				type="button"
				variant="outline"
				onClick={() => handleOpenChange(false)}
				disabled={createMut.isPending}
			>
				{t("common.cancel")}
			</Button>
			<Button
				type="button"
				onClick={handleSave}
				disabled={createMut.isPending || draft.name.trim().length === 0}
				data-testid="trait-add-submit"
			>
				{createMut.isPending ? t("common.saving") : t("traits.panel.addBtn")}
			</Button>
		</>
	)

	return (
		<span className="inline-flex">
			<button
				type="button"
				className="border-0 bg-transparent p-0"
				onClick={() => handleOpenChange(true)}
				data-testid="open-add-trait-dialog"
			>
				<TagPickerChip className="border-dashed border-muted-foreground/40 text-muted-foreground">
					<span className="inline-flex items-center gap-1">
						<span>{t("traits.panel.addPill")}</span>
						<Plus className="size-3 shrink-0 opacity-80" aria-hidden />
					</span>
				</TagPickerChip>
			</button>
			<AppDialog
				open={open}
				onOpenChange={handleOpenChange}
				title={t("traits.panel.addDialogTitle")}
				footer={footer}
				contentClassName="sm:max-w-lg"
			>
				<div className="flex flex-col gap-3 py-2">
					<EntityMetaFields
						value={draft}
						onChange={(patch) => setDraft({ ...draft, ...patch })}
						maxNameLength={MAX_TRAIT_NAME_LENGTH}
						disabled={createMut.isPending}
						testIdPrefix="trait-add"
						nameTestId="trait-add-name"
					/>
					<DropdownSelect
						value={kind}
						onValueChange={(next) => {
							if (isTraitKind(next)) setKind(next)
						}}
						modal={false}
						triggerClassName="w-36"
						data-testid="trait-add-kind"
						options={[
							{ value: "text", label: t("traits.kind.text") },
							{ value: "number", label: t("traits.kind.number") },
							{ value: "multitext", label: t("traits.kind.multitext") },
							{ value: "weight", label: t("traits.kind.weight") },
							{ value: "height", label: t("traits.kind.height") },
							{ value: "date", label: t("traits.kind.date") },
						]}
					/>
				</div>
			</AppDialog>
		</span>
	)
}
