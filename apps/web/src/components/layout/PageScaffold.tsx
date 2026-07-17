import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Surface } from "@hoardodile/ui/components/surface"
import { cn } from "@hoardodile/ui/lib/utils"
import type { ReactNode } from "react"
import { PageHeader } from "./PageHeader"

type PageScaffoldProps = {
	readonly children: ReactNode
	readonly className?: string
}

export function PageScaffold(props: PageScaffoldProps) {
	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8 lg:py-8",
				props.className,
			)}
		>
			{props.children}
		</div>
	)
}

type SurfaceProps = {
	readonly children: ReactNode
	readonly className?: string
}

export function FlatSurface(props: SurfaceProps) {
	return (
		<Surface as="section" size="compact" className={props.className}>
			{props.children}
		</Surface>
	)
}

type PillProps = {
	readonly children: ReactNode
	readonly tone?: "primary" | "secondary" | "accent" | "muted"
	readonly className?: string
}

export function InfoPill(props: PillProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
				pillToneClassName(props.tone),
				props.className,
			)}
		>
			{props.children}
		</span>
	)
}

export function RoutePendingFallback() {
	return (
		<PageScaffold>
			<PageHeader
				title={<Skeleton className="h-8 w-64 max-w-full" />}
				description={<Skeleton className="h-4 w-full max-w-lg" />}
			/>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<Skeleton className="h-32 rounded-lg" />
				<Skeleton className="h-32 rounded-lg" />
				<Skeleton className="h-32 rounded-lg md:col-span-2 xl:col-span-1" />
			</div>
		</PageScaffold>
	)
}

function pillToneClassName(tone: PillProps["tone"]) {
	if (tone === "primary") {
		return "bg-primary/10 text-primary"
	}

	if (tone === "secondary") {
		return "bg-secondary text-secondary-foreground"
	}

	if (tone === "accent") {
		return "bg-accent text-accent-foreground"
	}

	return "bg-muted text-muted-foreground"
}
