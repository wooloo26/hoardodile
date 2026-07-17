import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { Input } from "@hoardodile/ui/components/input"
import { useTranslation } from "react-i18next"

export type ConfirmByTypingDialogProps = Readonly<{
	open: boolean
	onOpenChange(open: boolean): void
	title: string
	description: string
	/** Name rendered in bold above the input. */
	targetName: string
	/** Exact string the user must type to enable the confirm button. */
	expectedInput: string
	confirmLabel: string
	pendingLabel: string
	pending: boolean
	/** When true the confirm button uses the destructive variant. */
	destructive?: boolean
	typed: string
	onTypedChange(value: string): void
	onConfirm(): void
	inputTestId?: string
	confirmTestId?: string
	/** Forwarded to the dialog content (e.g. theme scope classes). */
	contentClassName?: string
}>

/**
 * Shared "type the name to confirm" dialog for any operation that
 * requires the user to re-read a target name and type it back.
 * The prompt is rendered uniformly; only the bold target name varies.
 */
export function ConfirmByTypingDialog(props: ConfirmByTypingDialogProps) {
	const {
		open,
		onOpenChange,
		title,
		description,
		targetName,
		expectedInput,
		confirmLabel,
		pendingLabel,
		pending,
		destructive = true,
		typed,
		onTypedChange,
		onConfirm,
		inputTestId,
		confirmTestId,
		contentClassName,
	} = props
	const { t } = useTranslation()
	const canConfirm = !pending && typed === expectedInput
	function handleOpenChange(next: boolean) {
		if (pending && !next) return
		onOpenChange(next)
	}
	return (
		<AppDialog
			open={open}
			onOpenChange={handleOpenChange}
			title={title}
			description={description}
			contentClassName={contentClassName}
			footer={
				<>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={pending}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						disabled={!canConfirm}
						onClick={onConfirm}
						data-testid={confirmTestId}
					>
						{pending ? pendingLabel : confirmLabel}
					</Button>
				</>
			}
		>
			<div className="flex flex-col">
				<p className="text-sm text-muted-foreground">
					{t("common.confirmByTypingPrompt")}
				</p>
				<p className="text-sm mb-3">
					<span className="font-bold">{targetName}</span>
				</p>
				<Input
					autoFocus
					value={typed}
					onChange={(e) => onTypedChange(e.target.value)}
					autoComplete="off"
					data-testid={inputTestId}
				/>
			</div>
		</AppDialog>
	)
}
