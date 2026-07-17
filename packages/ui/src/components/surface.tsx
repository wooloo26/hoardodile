import { cn } from "@hoardodile/ui/lib/utils"
import type * as React from "react"

type SurfaceProps<C extends React.ElementType = "div"> = {
	as?: C
	size?: "default" | "compact"
} & Omit<React.ComponentPropsWithoutRef<C>, "as" | "size">

function Surface<C extends React.ElementType = "div">({
	as,
	size = "default",
	className,
	...props
}: SurfaceProps<C>) {
	const Component = as || "div"
	return (
		<Component
			data-slot="surface"
			data-size={size}
			className={cn(
				"rounded-xl border bg-card text-card-foreground",
				size === "default" && "p-5",
				size === "compact" && "p-2",
				className,
			)}
			{...props}
		/>
	)
}

export { Surface }
