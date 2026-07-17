import { Badge } from "@hoardodile/ui/components/badge"
import { cn } from "@hoardodile/ui/lib/utils"
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react"
import React from "react"
import type { TagSpecialStyle } from "@/lib/colors"
import {
	getSpecialTagStyleConfig,
	SpecialTagSurface,
} from "./SpecialTagSurface"

export type SpecialTagPickerChipProps = {
	readonly active?: boolean
	readonly specialStyle: TagSpecialStyle
	readonly asChild?: boolean
	readonly roundedRight?: boolean
	readonly children: ReactNode
} & Omit<ComponentPropsWithoutRef<"button">, "color">

const chipClassName = "relative isolate h-7 rounded-md"

/**
 * Standalone selectable special-style chip (silver / gold / rainbow).
 *
 * Mirrors the public shape of {@link TagPickerChip} but renders the effect as
 * an inline SVG gradient surface. Used by {@link TagPickerChip} as the
 * dedicated special-colour branch.
 */
export function SpecialTagPickerChip(props: SpecialTagPickerChipProps) {
	const {
		active,
		specialStyle,
		asChild,
		roundedRight,
		children,
		className,
		...rest
	} = props
	const isActive = active === true
	const useAsChild = asChild === true
	const isInteractive = rest.onClick !== undefined

	const config = getSpecialTagStyleConfig(specialStyle)

	const specialStyleCss = {
		...config.default.style,
		borderColor: "transparent",
		...(isActive ? config.active?.style : {}),
	}

	const mergedClassName = cn(
		chipClassName,
		"transition-none group",
		roundedRight === false && "rounded-r-none border-r-0",
		isInteractive || useAsChild ? "cursor-pointer" : undefined,
		config.default.className,
		isActive ? config.active?.className : undefined,
		className,
	)

	const surface = (
		<SpecialTagSurface
			style={specialStyle}
			active={isActive}
			className="absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
		/>
	)

	if (useAsChild) {
		const child = React.Children.only(children) as ReactElement<{
			children?: ReactNode
		}>
		return (
			<Badge
				asChild
				variant="outline"
				className={mergedClassName}
				style={specialStyleCss}
				{...rest}
			>
				{React.cloneElement(child, {
					children: (
						<>
							{surface}
							{child.props.children}
						</>
					),
				})}
			</Badge>
		)
	}

	if (isInteractive) {
		const { onClick, disabled, title, type, ...buttonRest } = rest
		return (
			<Badge
				asChild
				variant="outline"
				className={mergedClassName}
				style={specialStyleCss}
			>
				<button
					type={type ?? "button"}
					onClick={onClick}
					disabled={disabled}
					title={title}
					{...buttonRest}
				>
					{surface}
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
			style={specialStyleCss}
			{...spanRest}
		>
			{surface}
			{children}
		</Badge>
	)
}
