import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import type { ReactNode } from "react"
import { TagPickerChip, type TagPickerChipVariant } from "./TagPickerChip"

export function tagHasNoCharOrResUsage(tag: {
	readonly charCount: number
	readonly resCount: number
}): boolean {
	return tag.charCount === 0 && tag.resCount === 0
}

export type TagChipButtonProps = Readonly<{
	chip: {
		readonly name: ReactNode
		readonly color?: string
		readonly variant?: TagPickerChipVariant
		readonly className?: string
	}
	readonly menuOpen: boolean
	readonly onMenuOpenChange: (open: boolean) => void
	readonly triggerTestId?: string
	readonly title?: string
	readonly contentClassName?: string
	readonly contentAlign?: "start" | "center" | "end"
	readonly children: ReactNode
}>

/**
 * {@link TagPickerChip} as a {@link DropdownMenu} trigger — shared by traits,
 * tags, categories, and collections management rows.
 */
export function TagChipButton(props: TagChipButtonProps) {
	const {
		chip,
		menuOpen,
		onMenuOpenChange,
		triggerTestId,
		title,
		contentClassName,
		contentAlign = "start",
		children,
	} = props
	return (
		<DropdownMenu modal={false} onOpenChange={onMenuOpenChange}>
			<DropdownMenuTrigger asChild>
				<TagPickerChip
					asChild
					active={menuOpen}
					variant={chip.variant}
					color={chip.color}
					className={chip.className}
					data-testid={triggerTestId}
				>
					<button type="button" title={title}>
						{chip.name}
					</button>
				</TagPickerChip>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={contentAlign} className={contentClassName}>
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
