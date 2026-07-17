import { cn } from "@hoardodile/ui/lib/utils"
import type { ReactNode } from "react"

type PageHeaderProps = {
	readonly title?: ReactNode
	readonly description?: ReactNode
	readonly actions?: ReactNode
	readonly className?: string
}

export function PageHeader(props: PageHeaderProps) {
	return (
		<header
			className={cn(
				"flex flex-row items-center justify-between gap-4 rounded-lg",
				props.className,
			)}
		>
			<div className="min-w-0 space-y-2">
				<div className="space-y-1">
					{props.title !== undefined ? (
						<h1 className="text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
							{props.title}
						</h1>
					) : null}
					{props.description !== undefined ? (
						<div className="max-w-3xl text-sm leading-6 text-muted-foreground">
							{props.description}
						</div>
					) : null}
				</div>
			</div>
			{props.actions !== undefined ? (
				<div className="flex flex-wrap items-center gap-2">{props.actions}</div>
			) : null}
		</header>
	)
}
