import { Button } from "@hoardodile/ui/components/button"
import { useMobileBackToClose } from "@hoardodile/ui/hooks/useMobileBackToClose"

import { cn } from "@hoardodile/ui/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import * as React from "react"

function Dialog({
	open,
	defaultOpen,
	onOpenChange,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
		defaultOpen ?? false,
	)
	const isControlled = open !== undefined
	const currentOpen = isControlled ? open : uncontrolledOpen
	function handleOpenChange(next: boolean) {
		if (!isControlled) setUncontrolledOpen(next)
		onOpenChange?.(next)
	}
	useMobileBackToClose(currentOpen, handleOpenChange)
	return (
		<DialogPrimitive.Root
			data-slot="dialog"
			open={currentOpen}
			onOpenChange={handleOpenChange}
			{...props}
		/>
	)
}

function DialogTrigger({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			className={cn(
				"fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
				className,
			)}
			{...props}
		/>
	)
}

function DialogContent({
	className,
	children,
	showCloseButton = true,
	overlayClassName,
	contentMotion = "default",
	...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
	showCloseButton?: boolean
	/** Merged into {@link DialogOverlay}. Use to drop backdrop blur over heavy GPU layers (e.g. WebGL). */
	overlayClassName?: string
	/**
	 * `minimal` uses fade-only enter/exit (no slide/zoom) to reduce jank
	 * when opening over canvas/video or other expensive surfaces.
	 */
	contentMotion?: "default" | "minimal"
}) {
	// Auto-wrap "loose" body children (anything that is not a DialogHeader
	// or DialogFooter) inside a DialogBody. This guarantees a single
	// scroll container — historically callers relied on DialogContent
	// itself scrolling and added their own nested `overflow-y-auto`
	// wrappers, which produced a confusing two-scrollbar behaviour on
	// touch devices. With a single inner scroller, header/footer stay
	// pinned and only the middle region scrolls on every viewport.
	const arranged = arrangeDialogChildren(children)
	const motionClasses =
		contentMotion === "minimal"
			? cn(
					"data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
					"sm:data-open:fade-in-0 sm:data-closed:fade-out-0",
				)
			: cn(
					"data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-10 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-10",
					"sm:data-open:fade-in-0 sm:data-open:zoom-in-95 sm:data-open:slide-in-from-bottom-0 sm:data-closed:fade-out-0 sm:data-closed:zoom-out-95 sm:data-closed:slide-out-to-bottom-0",
				)
	return (
		<DialogPortal>
			<DialogOverlay className={overlayClassName} />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				className={cn(
					// Mobile: bottom sheet occupying most of the viewport so edit
					// forms have room to breathe. The component never scrolls
					// itself; only the inner DialogBody does.
					"fixed z-50 flex flex-col bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 outline-hidden",
					"inset-x-0 bottom-0 max-h-[85svh] overflow-hidden rounded-t-xl rounded-b-none",
					motionClasses,
					// ≥ sm: centred modal, allow up to 90vh.
					"sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:max-h-[90vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
					className,
				)}
				{...props}
			>
				{arranged}
				{showCloseButton && (
					<DialogPrimitive.Close data-slot="dialog-close" asChild>
						<Button
							variant="ghost"
							className="absolute top-3 right-3 z-20"
							size="icon-sm"
						>
							<XIcon />
							<span className="sr-only">Close</span>
						</Button>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	)
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn(
				// Pinned strip at the top of the dialog. Lives in a flex
				// column so `shrink-0` keeps it visible while the body scrolls.
				"flex shrink-0 flex-col gap-2 border-b border-border/60 bg-popover px-6 py-4",
				className,
			)}
			{...props}
		/>
	)
}

/**
 * Scrolling body region for dialogs. The dialog itself never scrolls —
 * only this element does — so touch users always interact with one
 * obvious scroll surface.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-body"
			className={cn(
				"flex-1 overflow-y-auto overscroll-contain px-6 py-4",
				className,
			)}
			{...props}
		/>
	)
}

function DialogFooter({
	className,
	showCloseButton = false,
	children,
	...props
}: React.ComponentProps<"div"> & {
	showCloseButton?: boolean
}) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				// Pinned action bar mirroring DialogHeader.
				"flex shrink-0 flex-row justify-end flex-wrap gap-2 border-t border-border/60 bg-popover px-6 py-4",
				className,
			)}
			{...props}
		>
			{children}
			{showCloseButton && (
				<DialogPrimitive.Close asChild>
					<Button variant="outline">Close</Button>
				</DialogPrimitive.Close>
			)}
		</div>
	)
}

/**
 * Splits dialog children into header/footer/body groups so loose body
 * nodes (passed by callers that pre-date `<DialogBody>`) get wrapped in
 * a single scrolling region. Children already wrapped in
 * `<DialogBody>` are passed through unchanged.
 */
function arrangeDialogChildren(children: React.ReactNode): React.ReactNode {
	const headers: React.ReactNode[] = []
	const footers: React.ReactNode[] = []
	const bodyNodes: React.ReactNode[] = []
	let hasExplicitBody = false
	React.Children.forEach(children, (child) => {
		if (!React.isValidElement(child)) {
			bodyNodes.push(child)
			return
		}
		if (child.type === DialogHeader) {
			headers.push(child)
			return
		}
		if (child.type === DialogFooter) {
			footers.push(child)
			return
		}
		if (child.type === DialogBody) {
			hasExplicitBody = true
			bodyNodes.push(child)
			return
		}
		bodyNodes.push(child)
	})
	const body = hasExplicitBody ? (
		bodyNodes
	) : (
		<DialogBody>{bodyNodes}</DialogBody>
	)
	return (
		<>
			{headers}
			{body}
			{footers}
		</>
	)
}

function DialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("font-heading leading-none font-medium", className)}
			{...props}
		/>
	)
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn(
				"text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
				className,
			)}
			{...props}
		/>
	)
}

export {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
}
