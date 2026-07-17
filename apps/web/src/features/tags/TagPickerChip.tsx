import { Badge } from "@hoardodile/ui/components/badge"
import { cn } from "@hoardodile/ui/lib/utils"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { computeTagChipColors, isSpecialTagStyle } from "@/lib/colors"
import { SpecialTagPickerChip } from "./SpecialTagPickerChip"

export type TagPickerChipVariant = "default" | "warning"

type TagPickerChipBaseProps = {
	readonly active?: boolean
	readonly variant?: TagPickerChipVariant
	/**
	 * When provided and non-empty, the chip uses a tinted background derived
	 * from this color instead of the theme default. Active/hover states still
	 * work by shifting the tint intensity.
	 */
	readonly color?: string
	/**
	 * When true, the children supply their own interactive trigger (e.g. a
	 * {@link DropdownMenuTrigger} `asChild` button). The chip then renders as
	 * a Badge `asChild` wrapper and forwards any incoming props (onClick,
	 * data-state, refs from upstream Slot) down to the child trigger.
	 */
	readonly asChild?: boolean
	/**
	 * When false, removes the right border-radius so the chip can sit flush
	 * against a sibling (e.g. an action button chip) on its right side.
	 */
	readonly roundedRight?: boolean
	readonly children: ReactNode
}

export type TagPickerChipProps = TagPickerChipBaseProps &
	Omit<ComponentPropsWithoutRef<"button">, keyof TagPickerChipBaseProps>

/**
 * Compact selectable chip used by category/tag/trait/collection pickers.
 * Two visual states (`active` vs idle) across two variants (`default`,
 * `warning`); the warning variant mirrors the active geometry using the
 * destructive palette.
 *
 * Delegates silver / gold / rainbow colours to {@link SpecialTagPickerChip}
 * so the special SVG implementation stays separate from the normal tinted
 * chip.
 */
export function TagPickerChip(props: TagPickerChipProps) {
	const {
		active,
		variant,
		color,
		asChild,
		children,
		className,
		roundedRight,
		...rest
	} = props
	const isWarning = variant === "warning"
	const isActive = active === true
	const hasColor = color !== undefined && color !== ""

	if (hasColor && isSpecialTagStyle(color)) {
		return (
			<SpecialTagPickerChip
				active={active}
				specialStyle={color}
				asChild={asChild}
				roundedRight={roundedRight}
				className={className}
				{...rest}
			>
				{children}
			</SpecialTagPickerChip>
		)
	}

	const chipColors = hasColor ? computeTagChipColors(color) : null

	const stateClass = isWarning
		? isActive
			? "border-transparent bg-destructive text-primary-foreground hover:bg-destructive/90"
			: "border border-destructive/60 text-destructive hover:bg-destructive/10"
		: isActive
			? chipColors !== null
				? "border-transparent bg-(--chip-bg) hover:bg-(--chip-hover-bg)"
				: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
			: chipColors !== null
				? "border bg-(--chip-bg) hover:bg-(--chip-hover-bg)"
				: hasColor
					? "border"
					: "border border-border text-foreground hover:bg-muted hover:text-muted-foreground"

	const mergedClassName = cn(
		"h-7 rounded-md",
		roundedRight === false && "rounded-r-none",
		rest.onClick !== undefined || asChild ? "cursor-pointer" : undefined,
		stateClass,
		className,
	)

	const style: React.CSSProperties | undefined =
		chipColors !== null
			? {
					["--chip-bg" as string]: isActive
						? chipColors.hoverBg
						: chipColors.baseBg,
					["--chip-hover-bg" as string]: chipColors.hoverBg,
					backgroundColor: "var(--chip-bg)",
					color: chipColors.fg,
					borderColor: isActive ? chipColors.hoverBg : `${color}30`,
				}
			: undefined

	if (asChild) {
		return (
			<Badge
				asChild
				variant="outline"
				className={mergedClassName}
				style={style}
				{...rest}
			>
				{children}
			</Badge>
		)
	}

	if (rest.onClick !== undefined) {
		const { onClick, disabled, title, type, ...buttonRest } = rest
		return (
			<Badge
				asChild
				variant="outline"
				className={mergedClassName}
				style={style}
			>
				<button
					type={type ?? "button"}
					onClick={onClick}
					disabled={disabled}
					title={title}
					{...buttonRest}
				>
					{children}
				</button>
			</Badge>
		)
	}

	const { title, ...spanRest } = rest
	return (
		<Badge
			variant="outline"
			className={mergedClassName}
			title={title}
			style={style}
			{...spanRest}
		>
			{children}
		</Badge>
	)
}
