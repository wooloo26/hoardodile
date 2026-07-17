import { MAX_COMMIT_MESSAGE_LENGTH } from "@hoardodile/consts/text-limits"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { Textarea } from "@hoardodile/ui/components/textarea"
import { cn } from "@hoardodile/ui/lib/utils"
import { RotateCcw, Save } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useDocTheme } from "@/features/doc/hooks/useDocPrefs"

type CommitDialogProps = Readonly<{
	open: boolean
	onOpenChange(open: boolean): void
	message: string
	onMessageChange(message: string): void
	onSubmit(): void
	isPending: boolean
	hasCommittableChange: boolean
}>

export function DocCommitDialog(props: CommitDialogProps) {
	const {
		open,
		onOpenChange,
		message,
		onMessageChange,
		onSubmit,
		isPending,
		hasCommittableChange,
	} = props
	const { t } = useTranslation()
	const { themeClass } = useDocTheme()
	const submitDisabled =
		isPending || message.trim().length === 0 || !hasCommittableChange
	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("documents.commitDialog.title")}
			contentClassName={cn("doc sm:max-w-lg", themeClass)}
			footer={
				<>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						{t("common.cancel")}
					</Button>
					<Button
						onClick={onSubmit}
						disabled={submitDisabled}
						data-testid="document-commit-confirm"
					>
						<Save className="mr-1 size-3.5" />
						{isPending
							? t("documents.commitDialog.committing")
							: t("documents.commitDialog.submit")}
					</Button>
				</>
			}
		>
			<p className="text-sm text-muted-foreground">
				{t("documents.commitDialog.description")}
			</p>
			<div className="flex flex-col gap-2">
				<label
					htmlFor="document-commit-message"
					className="text-sm font-medium"
				>
					{t("documents.commitDialog.messageLabel")}
				</label>
				<Textarea
					id="document-commit-message"
					value={message}
					onChange={(e) => onMessageChange(e.target.value)}
					placeholder={t("documents.commitDialog.messagePlaceholder")}
					rows={4}
					maxLength={MAX_COMMIT_MESSAGE_LENGTH}
					data-testid="document-commit-message"
				/>
			</div>
		</AppDialog>
	)
}

type DiscardDialogProps = Readonly<{
	open: boolean
	onOpenChange(open: boolean): void
	onConfirm(): void
	isPending: boolean
}>

export function DocDiscardDialog(props: DiscardDialogProps) {
	const { open, onOpenChange, onConfirm, isPending } = props
	const { t } = useTranslation()
	const { themeClass } = useDocTheme()
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("documents.discardDialog.title")}
			contentClassName={cn("doc sm:max-w-md", themeClass)}
			body={
				<p className="text-sm text-muted-foreground">
					{t("documents.discardDialog.description")}
				</p>
			}
			isPending={isPending}
			destructive={true}
			onConfirm={onConfirm}
			confirmLabel={
				<>
					<RotateCcw className="mr-1 size-3.5" />
					{t("documents.discardDialog.confirm")}
				</>
			}
			pendingLabel={
				<>
					<RotateCcw className="mr-1 size-3.5" />
					{t("documents.discardDialog.discarding")}
				</>
			}
			confirmTestId="document-discard-confirm"
		/>
	)
}
