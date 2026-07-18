import { cn } from "@hoardodile/ui/lib/utils"
import type { ReactNode } from "react"

type FixedActionBarProps = {
	readonly children: ReactNode
	readonly className?: string
}

/**
 * Fixed bottom action bar for long forms. Mirrors the horizontal padding of
 * {@link PageScaffold} and keeps the inner content aligned with the page's
 * `max-w-3xl` column so the button bar does not feel detached from the form.
 */
export function FixedActionBar(props: FixedActionBarProps) {
	return (
		<div
			className={cn(
				"fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
				props.className,
			)}
		>
			<div className="mx-auto flex max-w-3xl items-center justify-end gap-2 px-3 py-3 sm:px-6 lg:px-8">
				{props.children}
			</div>
		</div>
	)
}
