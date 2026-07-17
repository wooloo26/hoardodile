import { Button } from "@hoardodile/ui/components/button"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Archive, HardDrive } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmByTypingDialog } from "@/components/common/ConfirmByTypingDialog"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { QueryStateView } from "@/components/common/QueryStateView"
import { useConfirmDialog } from "@/components/common/useConfirmDialog"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { hardResetAndReload } from "@/lib/client-reset"
import {
	type BackupEvent,
	createBackupMutation,
	createVersionMutation,
	dataHistoryListQueryOptions,
	deleteBackupMutation,
	invalidateDataHistory,
	restoreBackupMutation,
	switchVersionMutation,
} from "./api"
import { CreateArchiveDialog } from "./CreateArchiveDialog"
import { DataHistoryDetail } from "./DataHistoryDetail"
import { DataHistoryTimeline } from "./DataHistoryTimeline"

/**
 * Unified "Data History" panel that replaces the former BackupsPanel and
 * VersionsPanel. Presents backups and archives on a single timeline, lets
 * the user add notes, and surfaces the consequence of every destructive
 * action in plain language.
 */
export function DataHistoryPanel() {
	const { t } = useTranslation()
	const { formatDateTime } = useDateFormatter()
	const listQuery = useQuery(dataHistoryListQueryOptions())
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
	const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)

	const restoreConfirm = useConfirmDialog<{
		readonly fileName: string
		readonly confirmName: string
	}>()
	const deleteConfirm = useConfirmDialog<{
		readonly fileName: string
		readonly confirmName: string
	}>()
	const switchConfirm = useConfirmDialog<number>()

	const createBackupMut = useSaveMutation({
		mutationOptions: createBackupMutation(),
		invalidate: invalidateDataHistory,
		successMessageKey: "dataHistory.toast.backupCreated",
		errorMessageKey: "dataHistory.toast.backupFailed",
	})

	const createVersionMut = useMutation({
		...createVersionMutation(),
		onSuccess: () => {
			setArchiveDialogOpen(false)
			void hardResetAndReload(t("dataHistory.reloading"))
		},
		onError: (err) =>
			toast.error(err.message || t("dataHistory.toast.archiveFailed")),
	})

	const restoreMut = useMutation({
		...restoreBackupMutation(),
		onSuccess: () => {
			restoreConfirm.close()
			void hardResetAndReload(t("dataHistory.reloading"))
		},
		onError: (err) =>
			toast.error(err.message || t("dataHistory.toast.restoreFailed")),
	})

	const deleteMut = useSaveMutation({
		mutationOptions: deleteBackupMutation(),
		invalidate: invalidateDataHistory,
		onSaved: () => {
			deleteConfirm.close()
			if (selectedId?.startsWith("backup-")) {
				setSelectedId(undefined)
			}
		},
		successMessageKey: "dataHistory.toast.backupDeleted",
		errorMessageKey: "dataHistory.toast.deleteFailed",
	})

	const switchMut = useMutation({
		...switchVersionMutation(),
		onSuccess: () => {
			switchConfirm.close()
			void hardResetAndReload(t("dataHistory.reloading"))
		},
		onError: (err) =>
			toast.error(err.message || t("dataHistory.toast.switchFailed")),
	})

	function handleCreateBackup() {
		createBackupMut.mutate({})
	}

	function handleCreateArchive(input: { readonly note?: string }) {
		createVersionMut.mutate(input)
	}

	function resolveBackupConfirmName(backup: BackupEvent): string {
		const trimmed = backup.name?.trim()
		return trimmed && trimmed.length > 0
			? trimmed
			: formatDateTime(backup.createdAt)
	}

	function findBackupByFileName(fileName: string): BackupEvent | undefined {
		const data = listQuery.data
		if (data === undefined) return undefined
		for (const group of data.groups) {
			const backup = group.backups.find((b) => b.fileName === fileName)
			if (backup !== undefined) return backup
		}
		return undefined
	}

	function handleRestore(fileName: string) {
		const backup = findBackupByFileName(fileName)
		if (backup === undefined) return
		restoreConfirm.open({
			fileName,
			confirmName: resolveBackupConfirmName(backup),
		})
	}

	function handleDeleteBackup(fileName: string) {
		const backup = findBackupByFileName(fileName)
		if (backup === undefined) return
		deleteConfirm.open({
			fileName,
			confirmName: resolveBackupConfirmName(backup),
		})
	}

	function handleSwitchVersion(version: number) {
		switchConfirm.open(version)
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						onClick={handleCreateBackup}
						disabled={createBackupMut.isPending || createVersionMut.isPending}
						data-testid="create-backup"
					>
						<HardDrive className="mr-1 size-4" />
						{createBackupMut.isPending
							? t("dataHistory.action.backingUp")
							: t("dataHistory.action.backupNow")}
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setArchiveDialogOpen(true)}
						disabled={createBackupMut.isPending || createVersionMut.isPending}
						data-testid="create-archive"
					>
						<Archive className="mr-1 size-4" />
						{t("dataHistory.action.archiveNow")}
					</Button>
				</div>
				{listQuery.data !== undefined ? (
					<StatusPill
						currentVersion={listQuery.data.currentVersion}
						activeVersion={listQuery.data.activeVersion}
						currentArchiveName={
							listQuery.data.groups.find((g) => g.archive.current)?.archive.name
						}
					/>
				) : null}
			</div>

			<QueryStateView
				result={listQuery}
				isEmpty={(data) => data.groups.length === 0}
				loading={
					<div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
						{t("common.loading")}
					</div>
				}
				empty={
					<div
						className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground"
						data-testid="data-history-empty"
					>
						<p className="font-medium">{t("dataHistory.empty.title")}</p>
						<p className="mt-1 text-xs">{t("dataHistory.empty.description")}</p>
					</div>
				}
			>
				{(data) => (
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
						<div className="min-w-0">
							<DataHistoryTimeline
								data={data}
								selectedId={selectedId}
								onSelect={setSelectedId}
							/>
						</div>
						<div className="min-w-0">
							<DataHistoryDetail
								data={data}
								selectedId={selectedId}
								onRestore={handleRestore}
								onDeleteBackup={handleDeleteBackup}
								onSwitchVersion={handleSwitchVersion}
								isRestoring={restoreMut.isPending}
								isDeleting={deleteMut.isPending}
								isSwitching={switchMut.isPending}
							/>
						</div>
					</div>
				)}
			</QueryStateView>

			<CreateArchiveDialog
				open={archiveDialogOpen}
				onOpenChange={setArchiveDialogOpen}
				onConfirm={handleCreateArchive}
				pending={createVersionMut.isPending}
			/>

			{restoreConfirm.target !== undefined ? (
				<ConfirmByTypingDialog
					open={restoreConfirm.isOpen}
					onOpenChange={restoreConfirm.onOpenChange}
					title={t("dataHistory.confirm.restoreTitle")}
					description={t("dataHistory.confirm.restoreDescription")}
					targetName={restoreConfirm.target.confirmName}
					expectedInput={restoreConfirm.target.confirmName}
					confirmLabel={t("dataHistory.action.restore")}
					pendingLabel={t("common.working")}
					pending={restoreMut.isPending}
					typed={restoreConfirm.typed}
					onTypedChange={restoreConfirm.setTyped}
					onConfirm={() => {
						if (restoreConfirm.target === undefined) return
						restoreMut.mutate(restoreConfirm.target.fileName)
					}}
					inputTestId="restore-confirm-input"
					confirmTestId="restore-confirm-submit"
				/>
			) : null}

			{deleteConfirm.target !== undefined ? (
				<ConfirmByTypingDialog
					open={deleteConfirm.isOpen}
					onOpenChange={deleteConfirm.onOpenChange}
					title={t("dataHistory.confirm.deleteBackupTitle")}
					description={t("dataHistory.confirm.deleteBackupDescription")}
					targetName={deleteConfirm.target.confirmName}
					expectedInput={deleteConfirm.target.confirmName}
					confirmLabel={t("dataHistory.action.delete")}
					pendingLabel={t("common.working")}
					pending={deleteMut.isPending}
					typed={deleteConfirm.typed}
					onTypedChange={deleteConfirm.setTyped}
					onConfirm={() => {
						if (deleteConfirm.target === undefined) return
						deleteMut.mutate(deleteConfirm.target.fileName)
					}}
					inputTestId="delete-confirm-input"
					confirmTestId="delete-confirm-submit"
				/>
			) : null}

			{switchConfirm.target !== undefined ? (
				<ConfirmDialog
					open={switchConfirm.isOpen}
					onOpenChange={switchConfirm.onOpenChange}
					title={t("dataHistory.confirm.switchTitle")}
					description={t("dataHistory.confirm.switchDescription")}
					confirmLabel={t("dataHistory.action.switchToVersion")}
					pendingLabel={t("common.working")}
					isPending={switchMut.isPending}
					onConfirm={() => {
						if (switchConfirm.target === undefined) return
						switchMut.mutate(switchConfirm.target)
					}}
					confirmTestId="switch-confirm-submit"
				/>
			) : null}
		</div>
	)
}

type StatusPillProps = {
	readonly currentVersion: number
	readonly activeVersion: number
	readonly currentArchiveName?: string
}

function StatusPill(props: StatusPillProps) {
	const { currentVersion, activeVersion, currentArchiveName } = props
	const { t } = useTranslation()
	const isViewingArchive = activeVersion !== currentVersion

	const baseText = isViewingArchive
		? t("dataHistory.status.viewingArchive", { version: activeVersion })
		: t("dataHistory.status.currentWritable", { version: currentVersion })

	return (
		<div
			className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs"
			data-testid="data-history-status"
		>
			<span
				className={`size-2 rounded-full ${
					isViewingArchive ? "bg-amber-500" : "bg-emerald-500"
				}`}
			/>
			<span className="flex min-w-0 items-center gap-1">
				<span className="truncate">{baseText}</span>
				{currentArchiveName !== undefined && currentArchiveName.length > 0 ? (
					<span className="truncate font-medium">{currentArchiveName}</span>
				) : null}
			</span>
		</div>
	)
}
