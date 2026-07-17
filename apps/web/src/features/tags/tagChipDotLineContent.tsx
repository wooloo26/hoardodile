import { Fragment, type ReactNode } from "react"

const DOT = "·"

/**
 * Renders a middle-dot line for {@link TagPickerChip}: first segment uses
 * the chip body style; each `·` keeps that style, only text after each dot
 * is slightly smaller and softer. The first segment carries `min-w-0
 * truncate` so it ellipsises when the chip is in a fixed-width container
 * (e.g. reorder mode).
 */
export function tagChipDotLineContent(full: string): ReactNode {
	if (!full.includes(DOT)) return full
	const parts = full.split(DOT)
	const first = parts[0] ?? ""
	return (
		<p className="flex min-w-0 flex-1 flex-row items-center gap-0.5">
			<span className="min-w-0 truncate">{first}</span>
			{parts.slice(1).map((segment, i) => (
				<Fragment key={i}>
					<span className="font-bold">{DOT}</span>
					<span className="text-tiny shrink-0 opacity-70">{segment}</span>
				</Fragment>
			))}
		</p>
	)
}
