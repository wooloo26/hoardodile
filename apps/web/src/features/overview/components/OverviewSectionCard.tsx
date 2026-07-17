import { Surface } from "@hoardodile/ui/components/surface"
import { cn } from "@hoardodile/ui/lib/utils"
import type { ReactNode } from "react"

type OverviewSectionCardProps = {
	readonly title: ReactNode
	readonly description?: ReactNode
	readonly action?: ReactNode
	readonly children: ReactNode
	readonly className?: string
	readonly "data-testid"?: string
}

export function OverviewSectionCard(props: OverviewSectionCardProps) {
	return (
		<Surface
			as="section"
			size="default"
			className={cn("flex flex-col gap-4", props.className)}
			data-testid={props["data-testid"]}
		>
			{(props.title !== undefined ||
				props.description !== undefined ||
				props.action !== undefined) && (
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-0.5">
						<h2 className="text-sm font-semibold">{props.title}</h2>
						{props.description !== undefined ? (
							<p className="text-xs text-muted-foreground">
								{props.description}
							</p>
						) : null}
					</div>
					{props.action !== undefined ? (
						<div className="shrink-0">{props.action}</div>
					) : null}
				</div>
			)}
			<div className="min-w-0">{props.children}</div>
		</Surface>
	)
}
