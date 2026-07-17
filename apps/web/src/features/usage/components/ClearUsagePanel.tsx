import { Button } from "@hoardodile/ui/components/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Footprints } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmByTypingDialog } from "@/components/common/ConfirmByTypingDialog"
import { useConfirmDialog } from "@/components/common/useConfirmDialog"
import { clearAllUsageMutation, usageKeys } from "@/features/usage/api"
import { clearUsageBeatQueue } from "@/features/usage/beatQueue"

/**
 * Destructive control to wipe all usage sessions from the server and the
 * local offline beat queue. Requires typed confirmation.
 */
export function ClearUsagePanel() {
	const queryClient = useQueryClient()
	const { t } = useTranslation()
	const confirm = useConfirmDialog<true>()
	const confirmPhrase = t("me.usage.confirmPhrase")

	const clearMut = useMutation({
		...clearAllUsageMutation(),
		onSuccess: async () => {
			await clearUsageBeatQueue()
			await queryClient.invalidateQueries({ queryKey: usageKeys.all })
			confirm.close()
			toast.success(t("me.usage.toastSuccess"))
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : t("me.usage.toastFailed"),
			),
	})

	return (
		<div className="flex flex-col gap-4">
			<div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => confirm.open(true)}
					disabled={clearMut.isPending}
					data-testid="clear-all-usage"
				>
					<Footprints className="mr-1 size-4" />
					{clearMut.isPending ? t("me.usage.clearing") : t("me.usage.clearAll")}
				</Button>
			</div>

			{confirm.target !== undefined ? (
				<ConfirmByTypingDialog
					open={confirm.isOpen}
					onOpenChange={confirm.onOpenChange}
					title={t("me.usage.confirmTitle")}
					description={t("me.usage.confirmDescription")}
					targetName={confirmPhrase}
					expectedInput={confirmPhrase}
					confirmLabel={t("me.usage.confirmLabel")}
					pendingLabel={t("me.usage.clearing")}
					pending={clearMut.isPending}
					typed={confirm.typed}
					onTypedChange={confirm.setTyped}
					onConfirm={() => clearMut.mutate(undefined)}
					inputTestId="clear-usage-confirm-input"
					confirmTestId="clear-usage-confirm-submit"
				/>
			) : null}
		</div>
	)
}
