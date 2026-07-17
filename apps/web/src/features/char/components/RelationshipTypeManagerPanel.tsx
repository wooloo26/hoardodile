import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { useQuery } from "@tanstack/react-query"
import { Pin, Plus } from "lucide-react"
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	DeleteEntityButton,
	type DeleteEntityButtonHandle,
} from "@/components/common/DeleteEntityButton"
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
import { sortEntityMetas } from "@/lib/sortEntityMetas"
import {
	createRelationshipTypeMutation,
	deleteRelationshipTypeMutation,
	forceDeleteRelationshipTypeMutation,
	invalidateRelationshipTypes,
	type RelationshipTypeWithCounts,
	relationshipTypesWithCountsQueryOptions,
	reorderRelationshipTypesMutation,
	updateRelationshipTypeMutation,
} from "../api"
import {
	type PresetLabelResolver,
	type PresetRelationshipType,
	resolvePresetLabels,
} from "../constants/presetRelationshipTypes"
import { RelationshipTypeChipIcons } from "./RelationshipKindBadge"
import { RelationshipTypeDialogBody } from "./RelationshipTypeDialogBody"
import {
	buildCreateTypePayload,
	buildUpdateTypePayload,
	draftFromPreset,
	draftFromRelationshipType,
	emptyRelationshipTypeDraft,
	isRelationshipTypeDefinitionComplete,
	type RelationshipTypeFormDraft,
} from "./RelationshipTypeFormFields"

const REORDER_SORTABLE_CHIP_WIDTH_CLASS = "w-44 shrink-0"

export function RelationshipTypeManagerPanel() {
	const { t } = useTranslation()
	const typesQuery = useQuery(relationshipTypesWithCountsQueryOptions())
	const typesRaw: readonly RelationshipTypeWithCounts[] = typesQuery.data ?? []
	const [reorderMode, setReorderMode] = useState(false)

	const { orderIds, reorderMut, sensors, handleDragEnd } = useReorderMutation({
		mutationOptions: reorderRelationshipTypesMutation(),
		invalidate: invalidateRelationshipTypes,
		buildInput: (ids) => ({ ids }),
	})

	const types = sortEntityMetas(typesRaw, orderIds)

	return (
		<div
			className="flex flex-col gap-4"
			data-testid="relationship-type-manager"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				{!typesQuery.isLoading ? (
					<ReorderModeSwitch
						id="relationship-types-reorder-mode"
						checked={reorderMode}
						onCheckedChange={setReorderMode}
						label={t("relationshipTypes.panel.reorderMode")}
						ariaLabel={t("relationshipTypes.panel.reorderModeAria")}
						testId="relationship-types-reorder-mode"
					/>
				) : null}
				<AddRelationshipTypePill />
			</div>

			{typesQuery.isLoading ? (
				<ManagementSkeleton chipCount={2} />
			) : (
				<SortableChipList
					items={types}
					renderItem={(type) => (
						<RelationshipTypeRow
							key={type.id}
							type={type}
							reorderMode={reorderMode}
							dragDisabled={!reorderMode || reorderMut.isPending}
						/>
					)}
					sensors={sensors}
					onDragEnd={handleDragEnd(types)}
					empty={
						<ManagementEmpty data-testid="relationship-types-empty">
							{t("relationshipTypes.panel.empty")}
						</ManagementEmpty>
					}
				/>
			)}
		</div>
	)
}

function RelationshipTypeRow(props: {
	readonly type: RelationshipTypeWithCounts
	readonly reorderMode: boolean
	readonly dragDisabled: boolean
}) {
	const { type, reorderMode, dragDisabled } = props

	const line = useMemo(
		() => entityMetaDotLine(type.name, type.edgeCount),
		[type],
	)
	const title = type.intro !== "" ? `${type.name} — ${type.intro}` : type.name

	const chipLabel = useMemo(
		() => (
			<span className="inline-flex items-center gap-1">
				{type.pinned ? <Pin className="size-3 shrink-0" aria-hidden /> : null}
				{tagChipDotLineContent(line)}
				<RelationshipTypeChipIcons kind={type.kind} />
			</span>
		),
		[line, type],
	)

	return (
		<ManageableChipRow
			item={type}
			reorderMode={reorderMode}
			dragDisabled={dragDisabled}
			chipLabel={chipLabel}
			chipColor={type.color ?? ""}
			chipVariant={type.edgeCount === 0 ? "warning" : undefined}
			chipTitle={title}
			widthClass={reorderMode ? REORDER_SORTABLE_CHIP_WIDTH_CLASS : undefined}
			testIdPrefix="relationship-type"
			contentClassName="min-w-36"
			renderEditDialog={({ open, onOpenChange }) => (
				<RelationshipTypeEditDialog
					type={type}
					open={open}
					onOpenChange={onOpenChange}
				/>
			)}
			renderDeleteButton={(ref) => (
				<RelationshipTypeDeleteButton ref={ref} type={type} hideTrigger />
			)}
		/>
	)
}

const RelationshipTypeDeleteButton = forwardRef<
	DeleteEntityButtonHandle,
	{
		readonly type: RelationshipTypeWithCounts
		readonly hideTrigger?: boolean
	}
>(function RelationshipTypeDeleteButton({ type, hideTrigger = false }, ref) {
	const { t } = useTranslation()
	const { handleDelete, handleForceDelete } = useDeleteMutation({
		deleteOptions: deleteRelationshipTypeMutation(),
		forceDeleteOptions: forceDeleteRelationshipTypeMutation(),
		invalidate: invalidateRelationshipTypes,
	})

	return (
		<DeleteEntityButton
			ref={ref}
			entityKindLabel={t("relationshipTypes.delete.kindLabel")}
			entityName={type.name}
			testId={`relationship-type-delete-${type.id}`}
			usageCount={type.edgeCount}
			usageLabel={t("relationshipTypes.delete.usageLabel")}
			onDelete={() => handleDelete(type.id)}
			onForceDelete={(typed) => handleForceDelete(type.id, typed)}
			hideTrigger={hideTrigger}
		/>
	)
})

function RelationshipTypeEditDialog(props: {
	readonly type: RelationshipTypeWithCounts
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}) {
	const { type, open, onOpenChange } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState<RelationshipTypeFormDraft>(() =>
		draftFromRelationshipType(type),
	)

	useEffect(() => {
		if (!open) return
		setDraft(draftFromRelationshipType(type))
	}, [open, type])

	const updateMut = useSaveMutation({
		mutationOptions: updateRelationshipTypeMutation(),
		invalidate: invalidateRelationshipTypes,
		onSaved: () => onOpenChange(false),
	})

	function handlePatch(patch: Partial<RelationshipTypeFormDraft>) {
		setDraft((current) => ({ ...current, ...patch }))
	}

	function handleSave() {
		const payload = buildUpdateTypePayload(type.id, draft)
		if (payload === undefined) return
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
				data-testid={`relationship-type-save-${type.id}`}
			>
				{updateMut.isPending ? t("common.saving") : t("common.save")}
			</Button>
		</>
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("relationshipTypes.panel.editDialogTitle")}
			footer={footer}
			contentClassName="sm:max-w-lg"
			contentTestId={`relationship-type-edit-${type.id}`}
		>
			<RelationshipTypeDialogBody
				draft={draft}
				onChange={handlePatch}
				nameTestId={`relationship-type-edit-name-${type.id}`}
				metaTestIdPrefix={`relationship-type-edit-${type.id}`}
			/>
		</AppDialog>
	)
}

function AddRelationshipTypePill() {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState(emptyRelationshipTypeDraft)
	const [selectedPresetKey, setSelectedPresetKey] = useState<
		PresetRelationshipType["key"] | null
	>(null)
	const delayedReset = useDelayedReset()

	const resolvePresetLabel = useCallback<PresetLabelResolver>(
		function resolvePresetLabel(key, field) {
			return t(`relationshipTypes.presets.${key}.${field}`)
		},
		[t],
	)

	function resetForm() {
		setDraft(emptyRelationshipTypeDraft())
		setSelectedPresetKey(null)
	}

	const createMut = useSaveMutation({
		mutationOptions: createRelationshipTypeMutation(),
		invalidate: invalidateRelationshipTypes,
		onSaved: () => handleOpenChange(false),
		successMessageKey: "relationshipTypes.toast.created",
		errorMessageKey: "relationshipTypes.toast.createFailed",
	})

	function handlePatch(patch: Partial<RelationshipTypeFormDraft>) {
		setDraft((current) => ({ ...current, ...patch }))
	}

	function handleSave() {
		const payload = buildCreateTypePayload(draft)
		if (payload === undefined) return
		createMut.mutate(payload)
	}

	function handleFillPreset(preset: PresetRelationshipType) {
		const labels = resolvePresetLabels(preset, resolvePresetLabel)
		setDraft(draftFromPreset(preset, labels))
		setSelectedPresetKey(preset.key)
	}

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen)
		if (!nextOpen) {
			delayedReset.schedule(resetForm)
		} else {
			delayedReset.cancel()
		}
	}

	const canSave =
		draft.name.trim().length > 0 &&
		isRelationshipTypeDefinitionComplete(draft) &&
		!createMut.isPending

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
				disabled={!canSave}
				data-testid="relationship-type-add"
			>
				{createMut.isPending
					? t("common.saving")
					: t("relationshipTypes.addType")}
			</Button>
		</>
	)

	return (
		<span className="inline-flex">
			<button
				type="button"
				className="border-0 bg-transparent p-0"
				onClick={() => handleOpenChange(true)}
				data-testid="open-add-relationship-type-dialog"
			>
				<TagPickerChip className="border-dashed border-muted-foreground/40 text-muted-foreground">
					<span className="inline-flex items-center gap-1">
						<span>{t("relationshipTypes.panel.addPill")}</span>
						<Plus className="size-3 shrink-0 opacity-80" aria-hidden />
					</span>
				</TagPickerChip>
			</button>
			<AppDialog
				open={open}
				onOpenChange={handleOpenChange}
				title={t("relationshipTypes.panel.addDialogTitle")}
				footer={footer}
				contentClassName="sm:max-w-lg"
			>
				<RelationshipTypeDialogBody
					draft={draft}
					onChange={handlePatch}
					nameTestId="relationship-type-name"
					metaTestIdPrefix="relationship-type-add"
					showPresets
					selectedPresetKey={selectedPresetKey}
					onFillPreset={handleFillPreset}
					resolvePresetLabel={resolvePresetLabel}
				/>
			</AppDialog>
		</span>
	)
}
