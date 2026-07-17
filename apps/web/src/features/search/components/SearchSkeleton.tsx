import { Skeleton } from "@hoardodile/ui/components/skeleton"

export function SearchSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{Array.from({ length: 8 }).map((_, index) => (
				<div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
					<Skeleton className="aspect-square w-full rounded-md" />
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-3 w-1/2" />
				</div>
			))}
		</div>
	)
}
