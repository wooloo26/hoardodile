import { cn } from "@hoardodile/ui/lib/utils"
import { HardDrive, History } from "lucide-react"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { formatBytes } from "@/lib/formatBytes"
import type { BackupEvent, DataHistoryList, HistoryGroup } from "./api"

export type DataHistoryTimelineProps = {
	readonly data: DataHistoryList
	readonly selectedId: string | undefined
	readonly onSelect: (id: string) => void
}

/**
 * Vertical timeline that groups backups under the archive version they were
 * created against. Archives sit on the primary rail; backups branch off the
 * rail with a horizontal connector that meets the backup node icon.
 */
export function DataHistoryTimeline(props: DataHistoryTimelineProps) {
	const { data, selectedId, onSelect } = props
	const { t } = useTranslation()

	if (data.groups.length === 0) {
		return (
			<div
				className="rounded-lg border border-dashed bg-muted/20 p-6 text-center"
				data-testid="data-history-empty"
			>
				<p className="text-sm text-muted-foreground">
					{t("dataHistory.empty.title")}
				</p>
				<p className="text-xs text-muted-foreground mt-1">
					{t("dataHistory.empty.description")}
				</p>
			</div>
		)
	}

	return (
		<div
			className="relative flex flex-col gap-2"
			data-testid="data-history-timeline"
		>
			{/* Continuous vertical spine behind all archive icons */}
			<div className="absolute left-4 top-3 bottom-3 w-px bg-border" />

			{data.groups.map((group) => {
				const isArchiveSelected = selectedId === group.archive.id
				const selectedBackupId =
					group.backups.find((b) => b.id === selectedId)?.id ?? undefined

				return (
					<TimelineGroup
						key={group.archive.version}
						group={group}
						isArchiveSelected={isArchiveSelected}
						selectedBackupId={selectedBackupId}
						isActiveVersion={group.archive.version === data.activeVersion}
						isCurrentVersion={group.archive.version === data.currentVersion}
						onSelect={onSelect}
					/>
				)
			})}
		</div>
	)
}

type TimelineGroupProps = {
	readonly group: HistoryGroup
	readonly isArchiveSelected: boolean
	readonly selectedBackupId: string | undefined
	readonly isActiveVersion: boolean
	readonly isCurrentVersion: boolean
	readonly onSelect: (id: string) => void
}

const TimelineGroup = memo(function TimelineGroup(props: TimelineGroupProps) {
	const {
		group,
		isArchiveSelected,
		selectedBackupId,
		isActiveVersion,
		isCurrentVersion,
		onSelect,
	} = props
	const { t } = useTranslation()
	const { formatDateTime } = useDateFormatter()
	const archive = group.archive

	return (
		<div className="relative flex gap-2">
			{/* Rail column: archive icon centered on the spine */}
			<div className="relative flex w-8 shrink-0 flex-col items-center pt-3">
				<div
					className={cn(
						"relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
						isActiveVersion
							? "bg-primary text-primary-foreground"
							: "bg-muted text-muted-foreground",
					)}
				>
					<History className="size-4" />
				</div>
			</div>

			{/* Content column */}
			<div className="min-w-0 flex-1">
				<button
					type="button"
					onClick={() => onSelect(archive.id)}
					className={cn(
						"relative z-10 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
						isArchiveSelected
							? "border-primary bg-card ring-1 ring-primary"
							: "border-border bg-card hover:bg-muted/50",
					)}
					data-testid={archive.id}
				>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<div className="flex items-center gap-2">
							<span className="font-medium">
								{archive.name ??
									t("dataHistory.archive.title", { version: archive.version })}
							</span>
							{isCurrentVersion ? (
								<span className="text-xs text-primary">
									{t("dataHistory.archive.tagCurrentShort")}
								</span>
							) : null}
							{isActiveVersion && !isCurrentVersion ? (
								<span className="text-xs text-muted-foreground">
									{t("dataHistory.archive.tagActiveShort")}
								</span>
							) : null}
						</div>
						{archive.note !== undefined && archive.note.length > 0 ? (
							<p className="truncate text-xs text-muted-foreground">
								{archive.note}
							</p>
						) : null}
						{archive.createdAt !== undefined ? (
							<p className="text-xs text-muted-foreground">
								{formatDateTime(archive.createdAt)}
							</p>
						) : null}
						<p className="text-xs text-muted-foreground">
							{formatBytes(archive.dbSize)}
						</p>
					</div>
				</button>

				{/* Backup nodes nested under the archive */}
				{group.backups.length > 0 ? (
					<div className="relative mt-1 space-y-1 pb-2 pl-6">
						{group.backups.map((backup) => (
							<TimelineBackupNode
								key={backup.id}
								backup={backup}
								selected={selectedBackupId === backup.id}
								onSelect={() => onSelect(backup.id)}
							/>
						))}
					</div>
				) : null}
			</div>
		</div>
	)
}, areTimelineGroupPropsEqual)

function areTimelineGroupPropsEqual(
	a: TimelineGroupProps,
	b: TimelineGroupProps,
): boolean {
	return (
		a.group === b.group &&
		a.isArchiveSelected === b.isArchiveSelected &&
		a.selectedBackupId === b.selectedBackupId &&
		a.isActiveVersion === b.isActiveVersion &&
		a.isCurrentVersion === b.isCurrentVersion &&
		a.onSelect === b.onSelect
	)
}

type TimelineBackupNodeProps = {
	readonly backup: BackupEvent
	readonly selected: boolean
	readonly onSelect: () => void
}

const TimelineBackupNode = memo(function TimelineBackupNode(
	props: TimelineBackupNodeProps,
) {
	const { backup, selected, onSelect } = props
	const { formatDateTime } = useDateFormatter()

	return (
		<div className="relative flex items-center gap-2">
			{/* Horizontal connector from the main spine to the backup icon */}
			<div className="absolute -left-12 top-1/2 h-px w-[3.75rem] -translate-y-1/2 bg-border" />

			<div className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<HardDrive className="size-3" />
			</div>

			<button
				type="button"
				onClick={onSelect}
				className={cn(
					"relative z-10 flex flex-1 items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
					selected
						? "border-primary bg-card ring-1 ring-primary"
						: "border-border bg-card hover:bg-muted/50",
				)}
				data-testid={backup.id}
			>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate text-sm">
						{backup.name ?? backup.fileName}
					</span>
					{backup.note !== undefined && backup.note.length > 0 ? (
						<p className="truncate text-xs text-muted-foreground">
							{backup.note}
						</p>
					) : null}
					<span className="text-xs text-muted-foreground">
						{formatBytes(backup.size)} · {formatDateTime(backup.createdAt)}
					</span>
				</div>
			</button>
		</div>
	)
})
