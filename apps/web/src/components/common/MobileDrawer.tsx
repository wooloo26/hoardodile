import { useMobileBackToClose } from "@hoardodile/ui/hooks/useMobileBackToClose"
import { cn } from "@hoardodile/ui/lib/utils"
import { X } from "lucide-react"
import type { ReactNode } from "react"

export type MobileDrawerProps = {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly side?: "left" | "right"
	readonly width?: string
	readonly title?: ReactNode
	readonly children: ReactNode
	readonly className?: string
}

/**
 * Mobile-only slide-in drawer with backdrop, close header and
 * {@link useMobileBackToClose} integration.
 *
 * Renders nothing on `md:` and above — the caller is expected to
 * provide its own desktop layout independently.
 */
export function MobileDrawer(props: MobileDrawerProps) {
	const { open, onOpenChange, side = "left", width = "w-72", title } = props
	const isLeft = side === "left"

	useMobileBackToClose(open, onOpenChange)

	return (
		<>
			{open && (
				<button
					type="button"
					className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm md:hidden"
					onClick={() => onOpenChange(false)}
				/>
			)}
			<aside
				className={cn(
					"fixed top-12 bottom-0 z-40 flex flex-col bg-card transition-transform duration-200 md:hidden",
					isLeft ? "left-0 border-r" : "right-0 border-l",
					width,
					isLeft
						? open
							? "translate-x-0 shadow-xl"
							: "-translate-x-full"
						: open
							? "translate-x-0 shadow-xl"
							: "translate-x-full",
					props.className,
				)}
			>
				{title !== undefined && (
					<div className="flex items-center justify-between border-b px-3 py-3">
						<span className="text-sm font-medium">{title}</span>
						<button
							type="button"
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
							onClick={() => onOpenChange(false)}
						>
							<X className="size-4" />
						</button>
					</div>
				)}
				<div className="flex-1 overflow-hidden">{props.children}</div>
			</aside>
		</>
	)
}
