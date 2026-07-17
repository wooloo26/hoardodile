import { cn } from "@hoardodile/ui/lib/utils"
import type { CSSProperties, MouseEvent, ReactNode } from "react"
import { forwardRef } from "react"
import { computeTagChipColors, isSpecialTagStyle } from "@/lib/colors"
import {
	getSpecialTagStyleConfig,
	SpecialTagSurface,
} from "./SpecialTagSurface"

const tagChipSurfaceClassName =
	"inline-flex items-center min-w-0 max-w-full overflow-hidden rounded-md px-2 py-1 text-xs transition duration-200"

export type TagChipSurfaceProps = {
	/**
	 * Effective display color. Special names (`silver`, `gold`, `rainbow`, etc.)
	 * render the corresponding SVG surface. An empty string falls back to the
	 * default muted chip palette.
	 */
	readonly color: string
	/** Label inside the chip; may be a string or rich content. */
	readonly children: ReactNode
	readonly className?: string
	readonly title?: string
	readonly style?: CSSProperties
	readonly onMouseDown?: (event: MouseEvent<HTMLSpanElement>) => void
}

/**
 * Pure visual chip shell: handles special SVG surfaces and normal tinted
 * backgrounds without knowing anything about IDs, links, or navigation.
 *
 * Exposes `--chip-bg` / `--chip-hover-bg` CSS variables and inline colors so
 * consumers can layer their own layout/hover classes on top.
 */
export const TagChipSurface = forwardRef<HTMLSpanElement, TagChipSurfaceProps>(
	function TagChipSurface(props, ref) {
		const { color, children, className, title, style, onMouseDown } = props

		if (isSpecialTagStyle(color)) {
			const config = getSpecialTagStyleConfig(color)
			return (
				<span
					ref={ref}
					title={title}
					className={cn(
						tagChipSurfaceClassName,
						"relative isolate group",
						config.default.className,
						className,
					)}
					style={{
						...config.default.style,
						...style,
					}}
					onMouseDown={onMouseDown}
				>
					<SpecialTagSurface
						style={color}
						className="absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
					/>
					<span className="truncate">{children}</span>
				</span>
			)
		}

		const chipColors = computeTagChipColors(color)

		return (
			<span
				ref={ref}
				title={title}
				className={cn(
					tagChipSurfaceClassName,
					"border bg-(--chip-bg) hover:bg-(--chip-hover-bg)",
					className,
				)}
				style={{
					["--chip-bg" as string]: chipColors.baseBg,
					["--chip-hover-bg" as string]: chipColors.hoverBg,
					color: chipColors.fg,
					borderColor: color ? `${color}30` : undefined,
					...style,
				}}
				onMouseDown={onMouseDown}
			>
				<span className="truncate">{children}</span>
			</span>
		)
	},
)
