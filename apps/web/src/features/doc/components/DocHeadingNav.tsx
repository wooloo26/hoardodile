import { cn } from "@hoardodile/ui/lib/utils"
import { List } from "lucide-react"
import { memo } from "react"
import { useTranslation } from "react-i18next"

export type HeadingInfo = {
	readonly id: string
	readonly level: number
	readonly text: string
}

export type DocHeadingNavProps = {
	readonly headings: readonly HeadingInfo[]
	readonly onNavigate: (blockId: string) => void
	readonly className?: string
}

/**
 * Renders a clickable list of document headings for quick navigation.
 * Used on desktop as a sticky sidebar and inside a Sheet on mobile.
 */
export const DocHeadingNav = memo(function DocHeadingNav(
	props: DocHeadingNavProps,
) {
	const { headings, onNavigate } = props
	const { t } = useTranslation()
	if (headings.length === 0) {
		return (
			<div
				className={cn(
					"px-4 py-6 text-center text-sm text-muted-foreground",
					props.className,
				)}
			>
				<List className="mx-auto mb-2 size-5 opacity-40" />
				{t("documents.noHeadings")}
			</div>
		)
	}

	return (
		<nav className={cn("relative", props.className)}>
			{/* Hairline rail; each entry pins an ink dot onto it. */}
			<span
				className="pointer-events-none absolute inset-y-1 left-[3px] w-px bg-border/70"
				aria-hidden="true"
			/>
			{headings.map((h) => (
				<button
					key={h.id}
					type="button"
					className={cn(
						"group relative block w-full truncate py-1.5 pr-2 text-left text-[13px] transition-[color,transform] duration-200 hover:translate-x-0.5",
						h.level === 1
							? "font-medium text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
					style={{ paddingLeft: `${1 + (h.level - 1) * 0.75}rem` }}
					onClick={() => onNavigate(h.id)}
				>
					<span
						className={cn(
							"absolute left-[0.5px] top-1/2 size-1.5 -translate-y-1/2 rounded-full transition-colors duration-200 group-hover:bg-primary",
							h.level === 1 ? "bg-primary/60" : "bg-border",
						)}
						aria-hidden="true"
					/>
					{h.text.length > 0 ? (
						h.text
					) : (
						<span className="italic opacity-50">
							{t("documents.untitledHeading")}
						</span>
					)}
				</button>
			))}
		</nav>
	)
})
