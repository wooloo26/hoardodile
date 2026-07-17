import { Badge } from "@hoardodile/ui/components/badge"
import { Button } from "@hoardodile/ui/components/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HardDrive, History, RotateCcw, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { formatBytes } from "@/lib/formatBytes"
import type { BackupEvent, DataHistoryList } from "./api"
import {
	dataHistoryKeys,
	updateBackupMetaMutation,
	updateVersionMetaMutation,
} from "./api"
import { HistoryNoteEditor } from "./HistoryNoteEditor"
import { InlineNameEditor } from "./InlineNameEditor"

export type DataHistoryDetailProps = {
	readonly data: DataHistoryList
	readonly selectedId: string | undefined
	readonly onRestore: (fileName: string) => void
	readonly onDeleteBackup: (fileName: string) => void
	readonly onSwitchVersion: (version: number) => void
	readonly isRestoring: boolean
	readonly isDeleting: boolean
	readonly isSwitching: boolean
}

export function DataHistoryDetail(props: DataHistoryDetailProps) {
	const {
		data,
		selectedId,
		onRestore,
		onDeleteBackup,
		onSwitchVersion,
		isRestoring,
		isDeleting,
		isSwitching,
	} = props
	const { t } = useTranslation()

	const selected = findEventById(data, selectedId)

	if (selected === undefined) {
		return (
			<div
				className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center"
				data-testid="data-history-empty-detail"
			>
				<p className="text-sm text-muted-foreground">
					{t("dataHistory.detail.selectPrompt")}
				</p>
			</div>
		)
	}

	return selected.kind === "archive" ? (
		<ArchiveDetail
			archive={selected}
			onSwitch={() => onSwitchVersion(selected.version)}
			isSwitching={isSwitching}
		/>
	) : (
		<BackupDetail
			backup={selected}
			currentVersion={data.currentVersion}
			onRestore={() => onRestore(selected.fileName)}
			onDelete={() => onDeleteBackup(selected.fileName)}
			isRestoring={isRestoring}
			isDeleting={isDeleting}
		/>
	)
}

function findEventById(
	data: DataHistoryList,
	id: string | undefined,
): BackupEvent | DataHistoryList["groups"][number]["archive"] | undefined {
	if (id === undefined) return undefined
	for (const group of data.groups) {
		if (group.archive.id === id) return group.archive
		const backup = group.backups.find((b) => b.id === id)
		if (backup !== undefined) return backup
	}
	return undefined
}

type ArchiveDetailProps = {
	readonly archive: DataHistoryList["groups"][number]["archive"]
	readonly onSwitch: () => void
	readonly isSwitching: boolean
}

function ArchiveDetail(props: ArchiveDetailProps) {
	const { archive, onSwitch, isSwitching } = props
	const { t } = useTranslation()
	const { formatDateTime } = useDateFormatter()
	const queryClient = useQueryClient()
	const canEditMeta = archive.current

	const updateMeta = useMutation({
		...updateVersionMetaMutation(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: dataHistoryKeys.list(),
			})
			toast.success(t("dataHistory.toast.metaSaved"))
		},
		onError: () => toast.error(t("dataHistory.toast.metaSaveFailed")),
	})

	return (
		<div className="flex flex-col gap-4" data-testid={`detail-${archive.id}`}>
			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<History className="size-5" />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h3 className="font-semibold">
						{archive.name ??
							t("dataHistory.archive.title", { version: archive.version })}
					</h3>
					<div className="flex flex-wrap items-center gap-2">
						{archive.current ? (
							<Badge variant="default" className="text-xs">
								{t("dataHistory.archive.tagCurrent")}
							</Badge>
						) : null}
						{archive.active ? (
							<Badge variant="secondary" className="text-xs">
								{t("dataHistory.archive.tagActive")}
							</Badge>
						) : null}
						{!archive.current ? (
							<Badge variant="outline" className="text-xs">
								{t("dataHistory.archive.tagReadOnly")}
							</Badge>
						) : null}
					</div>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<p className="text-xs text-muted-foreground">
						{t("dataHistory.detail.size")}
					</p>
					<p>{formatBytes(archive.dbSize)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						{t("dataHistory.detail.versionNumber")}
					</p>
					<p>v{archive.version}</p>
				</div>
				{archive.createdAt !== undefined ? (
					<div className="col-span-2">
						<p className="text-xs text-muted-foreground">
							{t("dataHistory.detail.createdAt")}
						</p>
						<p>{formatDateTime(archive.createdAt)}</p>
					</div>
				) : null}
			</div>

			<div>
				<p className="text-xs text-muted-foreground mb-1.5">
					{t("dataHistory.archive.nameLabel")}
				</p>
				{canEditMeta ? (
					<InlineNameEditor
						name={archive.name ?? ""}
						onSave={(name) =>
							updateMeta.mutate({ version: archive.version, name })
						}
						disabled={updateMeta.isPending}
						placeholder={t("dataHistory.archive.namePlaceholder")}
					/>
				) : (
					<p className="text-sm">
						{archive.name ??
							t("dataHistory.archive.title", { version: archive.version })}
					</p>
				)}
			</div>

			{canEditMeta ||
			(archive.note !== undefined && archive.note.length > 0) ? (
				<div>
					<p className="text-xs text-muted-foreground mb-1.5">
						{t("dataHistory.detail.note")}
					</p>
					{canEditMeta ? (
						<HistoryNoteEditor
							note={archive.note}
							onSave={(note) =>
								updateMeta.mutate({ version: archive.version, note })
							}
							disabled={updateMeta.isPending}
						/>
					) : (
						<p className="text-sm">{archive.note}</p>
					)}
				</div>
			) : null}

			{!archive.active ? (
				<div className="flex flex-col gap-2 pt-2">
					<Button
						size="sm"
						onClick={onSwitch}
						disabled={isSwitching}
						data-testid={`switch-${archive.version}`}
					>
						<RotateCcw className="mr-1 size-4" />
						{isSwitching
							? t("dataHistory.action.switching")
							: t("dataHistory.action.switchToVersion")}
					</Button>
					<p className="text-xs text-muted-foreground">
						{t("dataHistory.archive.switchHint")}
					</p>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					{t("dataHistory.archive.activeHint")}
				</p>
			)}
		</div>
	)
}

type BackupDetailProps = {
	readonly backup: BackupEvent
	readonly currentVersion: number
	readonly onRestore: () => void
	readonly onDelete: () => void
	readonly isRestoring: boolean
	readonly isDeleting: boolean
}

function BackupDetail(props: BackupDetailProps) {
	const {
		backup,
		currentVersion,
		onRestore,
		onDelete,
		isRestoring,
		isDeleting,
	} = props
	const { t } = useTranslation()
	const { formatDateTime } = useDateFormatter()
	const queryClient = useQueryClient()

	const updateMeta = useMutation({
		...updateBackupMetaMutation(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: dataHistoryKeys.list(),
			})
			toast.success(t("dataHistory.toast.metaSaved"))
		},
		onError: () => toast.error(t("dataHistory.toast.metaSaveFailed")),
	})

	const isArchived = backup.activeVersionAtCreate !== currentVersion

	return (
		<div className="flex flex-col gap-4" data-testid={`detail-${backup.id}`}>
			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
					<HardDrive className="size-5" />
				</div>
				<div className="flex flex-col gap-1">
					<h3 className="font-semibold">{backup.name ?? backup.fileName}</h3>
					<Badge variant="secondary" className="w-fit text-xs">
						{t("dataHistory.backup.typeLabel")}
					</Badge>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<p className="text-xs text-muted-foreground">
						{t("dataHistory.detail.size")}
					</p>
					<p>{formatBytes(backup.size)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						{t("dataHistory.detail.createdAt")}
					</p>
					<p>{formatDateTime(backup.createdAt)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						{t("dataHistory.detail.versionNumber")}
					</p>
					<p>v{backup.activeVersionAtCreate}</p>
				</div>
			</div>

			<div>
				<p className="text-xs text-muted-foreground mb-1.5">
					{t("dataHistory.backup.nameLabel")}
				</p>
				{!isArchived ? (
					<InlineNameEditor
						name={backup.name ?? ""}
						onSave={(name) =>
							updateMeta.mutate({ fileName: backup.fileName, name })
						}
						disabled={updateMeta.isPending}
						placeholder={t("dataHistory.backup.nameEmpty")}
					/>
				) : (
					<p className="text-sm">
						{backup.name ?? t("dataHistory.backup.nameEmpty")}
					</p>
				)}
			</div>

			{!isArchived || (backup.note !== undefined && backup.note.length > 0) ? (
				<div>
					<p className="text-xs text-muted-foreground mb-1.5">
						{t("dataHistory.detail.note")}
					</p>
					{!isArchived ? (
						<HistoryNoteEditor
							note={backup.note}
							onSave={(note) =>
								updateMeta.mutate({ fileName: backup.fileName, note })
							}
							disabled={updateMeta.isPending}
						/>
					) : (
						<p className="text-sm">{backup.note}</p>
					)}
				</div>
			) : null}

			{isArchived ? (
				<p className="text-sm text-muted-foreground">
					{t("dataHistory.backup.archivedHint")}
				</p>
			) : (
				<div className="flex flex-col gap-3 pt-2">
					<div className="flex flex-col gap-2">
						<Button
							size="sm"
							onClick={onRestore}
							disabled={isRestoring || isDeleting}
							data-testid={`restore-${backup.fileName}`}
						>
							<RotateCcw className="mr-1 size-4" />
							{isRestoring
								? t("dataHistory.action.restoring")
								: t("dataHistory.action.restore")}
						</Button>
						<p className="text-xs text-muted-foreground">
							{t("dataHistory.backup.restoreHint")}
						</p>
					</div>

					<div className="flex flex-col gap-2">
						<Button
							size="sm"
							variant="destructive"
							onClick={onDelete}
							disabled={isRestoring || isDeleting}
							data-testid={`delete-${backup.fileName}`}
						>
							<Trash2 className="mr-1 size-4" />
							{isDeleting
								? t("dataHistory.action.deleting")
								: t("dataHistory.action.delete")}
						</Button>
						<p className="text-xs text-muted-foreground">
							{t("dataHistory.backup.deleteHint")}
						</p>
					</div>
				</div>
			)}
		</div>
	)
}
