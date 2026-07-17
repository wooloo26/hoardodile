import { Skeleton } from "@hoardodile/ui/components/skeleton"

export function ResCardSkeleton() {
	return (
		<div className="flex min-w-[200px] max-w-md flex-col gap-1">
			<Skeleton className="aspect-square w-full rounded-lg" />
			<Skeleton className="h-4 w-3/4" />
			<div className="flex flex-wrap gap-1.5">
				<Skeleton className="h-5 w-14 rounded-full" />
				<Skeleton className="h-5 w-18 rounded-full" />
			</div>
			<div className="flex flex-wrap gap-1.5">
				<Skeleton className="h-5 w-16 rounded-full" />
			</div>
			<div className="flex justify-between">
				<Skeleton className="h-3 w-14" />
				<Skeleton className="h-3 w-24" />
			</div>
		</div>
	)
}
