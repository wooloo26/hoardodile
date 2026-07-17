import type { ReactNode } from "react"
import { TagChip } from "@/features/tags/TagChip"
import { tagChipDotLineContent } from "@/features/tags/tagChipDotLineContent"

export type TraitValueRowProps = {
	readonly traitId: string
	readonly name: string
	readonly kind: string
	readonly color?: string
	readonly children: ReactNode
	readonly className?: string
	readonly testId?: string
}

/**
 * Shared layout row for a single trait chip + input control.
 * The trait name is rendered as a read-only {@link TagChip} so it stays
 * visually consistent with displayed tags and respects the trait's color.
 */
export function TraitValueRow(props: TraitValueRowProps) {
	const { traitId, name, kind, color, children, className, testId } = props
	return (
		<div
			className={`flex flex-wrap items-center gap-2 text-sm ${className ?? ""}`}
			data-testid={testId}
		>
			<TagChip
				id={traitId}
				type="character"
				name={tagChipDotLineContent(`${name}·${kind}`)}
				color={color ?? ""}
				link={false}
			/>
			{children}
		</div>
	)
}
