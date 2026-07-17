import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { FlatSurface } from "@/components/layout/PageScaffold"

type RecentSectionProps = {
	readonly title: ReactNode
	readonly viewAllTo: string
	readonly viewAllLabel: string
	readonly viewAllSearch?: Record<string, unknown>
	readonly isEmpty: boolean
	readonly emptyText: string
	readonly actions?: ReactNode
	readonly children: ReactNode
}

export function RecentSection(props: RecentSectionProps) {
	return (
		<FlatSurface className="bg-card">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<h2 className="text-base font-semibold">{props.title}</h2>
					{props.actions}
				</div>
				<Link
					to={props.viewAllTo}
					search={props.viewAllSearch}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{props.viewAllLabel}
				</Link>
			</div>
			{props.isEmpty ? (
				<p className="text-sm text-muted-foreground">{props.emptyText}</p>
			) : (
				props.children
			)}
		</FlatSurface>
	)
}
