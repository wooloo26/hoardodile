import { Surface } from "@hoardodile/ui/components/surface"
import { cn } from "@hoardodile/ui/lib/utils"
import type { LucideIcon } from "lucide-react"

export type SettingsRowProps = {
	readonly icon?: LucideIcon
	readonly title: string
	readonly description?: string
	readonly control: React.ReactNode
	readonly className?: string
	readonly "data-testid"?: string
}

/**
 * A single flat setting row: icon + label/description on the left,
 * control on the right. Used for switches, buttons, and simple actions.
 */
export function SettingsRow(props: SettingsRowProps) {
	const Icon = props.icon
	return (
		<Surface
			className={cn("flex items-center justify-between gap-4", props.className)}
			data-testid={props["data-testid"]}
		>
			<div className="flex items-center gap-3">
				{Icon !== undefined ? (
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<Icon className="size-4" />
					</div>
				) : null}
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">{props.title}</span>
					{props.description !== undefined ? (
						<p className="text-xs text-muted-foreground">{props.description}</p>
					) : null}
				</div>
			</div>
			<div className="shrink-0">{props.control}</div>
		</Surface>
	)
}
