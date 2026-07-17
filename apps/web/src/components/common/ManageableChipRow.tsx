import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { EntityMetaSortable } from "@hoardodile/schemas"
import { DropdownMenuItem } from "@hoardodile/ui/components/dropdown-menu"
import { cn } from "@hoardodile/ui/lib/utils"
import { Pencil, Trash2 } from "lucide-react"
import { forwardRef, type ReactNode, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { TagChipButton } from "@/features/tags/TagChipButton"
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import type { DeleteEntityButtonHandle } from "./DeleteEntityButton"

export type ManageableItem = EntityMetaSortable & { readonly id: string }

export type ManageableChipRowProps<T extends ManageableItem> = {
	readonly item: T
	readonly reorderMode: boolean
	readonly dragDisabled: boolean
	readonly chipLabel: ReactNode
	readonly chipColor: string
	readonly chipVariant?: "warning"
	readonly chipTitle?: string
	readonly widthClass?: string
	readonly testIdPrefix: string
	readonly editMenuTestId?: string
	readonly deleteMenuTestId?: string
	readonly contentClassName?: string
	readonly renderEditDialog: (controls: {
		readonly open: boolean
		readonly onOpenChange: (open: boolean) => void
	}) => ReactNode
	readonly renderDeleteButton: (
		ref: React.RefObject<DeleteEntityButtonHandle | null>,
	) => ReactNode
	readonly extraMenuItems?: ReactNode
}

/**
 * A generic, sortable management chip row: handles drag-and-drop wiring,
 * reorder/normal rendering modes, an edit/delete dropdown menu, and a
 * hidden delete confirmation button.
 */
export const ManageableChipRow = forwardRef<
	HTMLSpanElement,
	ManageableChipRowProps<ManageableItem>
>(function ManageableChipRow(props, ref) {
	const { t } = useTranslation()
	const [editOpen, setEditOpen] = useState(false)
	const [menuOpen, setMenuOpen] = useState(false)
	const deleteRef = useRef<DeleteEntityButtonHandle>(null)

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: props.item.id,
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
			ref={(node) => {
				setNodeRef(node)
				if (typeof ref === "function") {
					ref(node)
				} else if (ref !== null) {
					ref.current = node
				}
			}}
			style={style}
			className={cn(
				"inline-flex",
				props.widthClass,
				props.reorderMode &&
					!props.dragDisabled &&
					"cursor-grab active:cursor-grabbing",
			)}
			data-testid={`${props.testIdPrefix}-row-${props.item.id}`}
			{...attributes}
			{...listeners}
		>
			{props.reorderMode ? (
				<span
					className="inline-flex w-full min-w-0 max-w-full rounded-sm ring-1 ring-transparent"
					data-testid={`${props.testIdPrefix}-chip-${props.item.id}`}
				>
					<TagPickerChip
						color={props.chipColor}
						variant={props.chipVariant}
						className="w-full min-w-0"
					>
						{props.chipLabel}
					</TagPickerChip>
				</span>
			) : (
				<TagChipButton
					chip={{
						name: props.chipLabel,
						color: props.chipColor,
						variant: props.chipVariant,
					}}
					menuOpen={menuOpen}
					onMenuOpenChange={setMenuOpen}
					title={props.chipTitle}
					triggerTestId={`${props.testIdPrefix}-chip-${props.item.id}`}
					contentClassName={props.contentClassName}
				>
					<DropdownMenuItem
						onSelect={() => setEditOpen(true)}
						data-testid={
							props.editMenuTestId ??
							`${props.testIdPrefix}-open-edit-${props.item.id}`
						}
					>
						<Pencil className="h-3.5 w-3.5" />
						{t("common.edit")}
					</DropdownMenuItem>
					{props.extraMenuItems}
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => deleteRef.current?.beginDelete()}
						data-testid={
							props.deleteMenuTestId ??
							`${props.testIdPrefix}-delete-menu-${props.item.id}`
						}
					>
						<Trash2 className="h-3.5 w-3.5" />
						{t("deleteEntity.defaultLabel")}
					</DropdownMenuItem>
				</TagChipButton>
			)}
			{editOpen
				? props.renderEditDialog({ open: editOpen, onOpenChange: setEditOpen })
				: null}
			{props.renderDeleteButton(deleteRef)}
		</span>
	)
})
