import { Surface } from "@hoardodile/ui/components/surface"
import { cn } from "@hoardodile/ui/lib/utils"
import type { LucideIcon } from "lucide-react"

export type UploadSectionProps = {
	readonly icon?: LucideIcon
	readonly title: string
	readonly description?: string
	readonly children: React.ReactNode
	readonly className?: string
	readonly action?: React.ReactNode
	readonly "data-testid"?: string
}

/**
 * Flat card wrapper for upload form sections.
 *
 * Mirrors the visual style of SettingsSection (rounded border, muted icon, optional
 * description) but keeps the semantics scoped to the upload flow.
 */
export function UploadSection(props: UploadSectionProps) {
	const Icon = props.icon
	return (
		<Surface
			as="section"
			size="default"
			className={cn("flex flex-col gap-4", props.className)}
			data-testid={props["data-testid"]}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-2.5">
					{Icon !== undefined ? (
						<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
							<Icon className="size-4" />
						</div>
					) : null}
					<div className="flex flex-col gap-0.5">
						<h2 className="text-sm font-semibold">{props.title}</h2>
						{props.description !== undefined ? (
							<p className="text-xs text-muted-foreground">
								{props.description}
							</p>
						) : null}
					</div>
				</div>
				{props.action !== undefined ? (
					<div className="shrink-0">{props.action}</div>
				) : null}
			</div>
			<div>{props.children}</div>
		</Surface>
	)
}
