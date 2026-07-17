import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@hoardodile/ui/components/dialog"
import type { ReactNode } from "react"

/**
 * Radix focuses the first focusable element on open which would steal
 * the caret from the page underneath, jump scroll position, and on
 * iOS occasionally pop the soft keyboard before the user even reaches
 * an input. Routing focus to the dialog container itself keeps the
 * dialog accessible without those side effects.
 */
function preventDialogAutoFocus(e: Event): void {
	e.preventDefault()
	if (e.currentTarget instanceof HTMLElement) e.currentTarget.focus()
}

export type AppDialogProps = Readonly<{
	open: boolean
	onOpenChange: (open: boolean) => void
	title: ReactNode
	description?: ReactNode
	children: ReactNode
	footer?: ReactNode
	contentClassName?: string
	/** Passed to dialog overlay (e.g. disable backdrop blur over WebGL). */
	overlayClassName?: string
	/** Fade-only motion — lighter than default slide/zoom when over heavy surfaces. */
	contentMotion?: "default" | "minimal"
	/** Defaults to true. Set to false to honour native auto-focus (rare). */
	suppressAutoFocus?: boolean
	contentTestId?: string
}>

/**
 * Standard dialog shell. Wires up `Dialog`/`DialogContent`/`DialogHeader`/
 * `DialogTitle` and an optional description and footer so callers stop
 * re-stating the boilerplate. Use {@link ConfirmDialog} for the common
 * "cancel + primary action" pattern.
 */
export function AppDialog(props: AppDialogProps) {
	const {
		open,
		onOpenChange,
		title,
		description,
		children,
		footer,
		contentClassName,
		overlayClassName,
		contentMotion,
		suppressAutoFocus = true,
		contentTestId,
	} = props
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={contentClassName}
				overlayClassName={overlayClassName}
				contentMotion={contentMotion}
				// When the dialog has no description, opt out of Radix's
				// description-presence warning. When a description IS
				// rendered, Radix's context auto-links it via aria-
				// describedby and we should not override that here.
				{...(description === undefined
					? { "aria-describedby": undefined }
					: {})}
				onOpenAutoFocus={suppressAutoFocus ? preventDialogAutoFocus : undefined}
				data-testid={contentTestId}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				{description !== undefined ? (
					<DialogDescription>{description}</DialogDescription>
				) : null}
				{children}
				{footer !== undefined ? <DialogFooter>{footer}</DialogFooter> : null}
			</DialogContent>
		</Dialog>
	)
}
