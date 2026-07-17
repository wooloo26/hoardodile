import type { RelationshipKind } from "@hoardodile/schemas"
import { ArrowLeftRight, ArrowRight, GitBranch } from "lucide-react"

type Props = {
	readonly kind: RelationshipKind
	readonly className?: string
}

/** Lucide icon for relationship kind (chips, toggles). */
export function RelationshipKindIcon(props: Props) {
	const { kind, className } = props
	if (kind === "symmetric") {
		return <ArrowLeftRight className={className} aria-hidden />
	}
	if (kind === "hierarchical") {
		return <GitBranch className={className} aria-hidden />
	}
	return <ArrowRight className={className} aria-hidden />
}

type ChipLabelProps = {
	readonly name: string
	readonly kind: RelationshipKind
}

/** Name + kind icon for relationship type chips. */
export function RelationshipTypeChipLabel(props: ChipLabelProps) {
	const { name, kind } = props
	return (
		<span className="inline-flex items-center gap-1.5">
			<span>{name}</span>
			<RelationshipKindIcon
				kind={kind}
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
		</span>
	)
}

/** Kind icon for relationship type chips. */
export function RelationshipTypeChipIcons(props: Omit<ChipLabelProps, "name">) {
	const { kind } = props
	return (
		<RelationshipKindIcon
			kind={kind}
			className="size-3.5 shrink-0 text-muted-foreground"
		/>
	)
}
