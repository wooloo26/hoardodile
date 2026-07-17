import {
	MAX_BACKUP_NAME_LENGTH,
	MAX_HISTORY_NOTE_LENGTH,
} from "@hoardodile/consts/text-limits"
import { z } from "zod"
import { timestamp } from "./primitives.ts"

/**
 * Single-file SQLite snapshot produced by the in-app "Backup now" action.
 * The `name` is a filesystem-safe filename under `{storage}/versions/<v>/db-backups/`,
 * never a full path -- the server owns the directory and callers only
 * reference backups by name.
 */
export const backupSummary = z.object({
	fileName: z.string().min(1).max(MAX_BACKUP_NAME_LENGTH),
	size: z.number().int().nonnegative(),
	createdAt: timestamp,
	/**
	 * User-defined display name stored in the backup's sidecar meta.json.
	 */
	name: z.string().min(1).max(MAX_BACKUP_NAME_LENGTH).optional(),
	note: z.string().max(MAX_HISTORY_NOTE_LENGTH).optional(),
	/**
	 * Version that was active when the backup was created. May be missing
	 * for backups created before this field was introduced.
	 */
	activeVersion: z.number().int().nonnegative().optional(),
})

export type BackupSummary = z.infer<typeof backupSummary>

/**
 * Result of requesting a restore. The server prepares the swap on disk and
 * then signals the supervisor to restart; the `willRestart` flag tells the
 * web client to expect a brief disconnection and show a waiting UI.
 */
export const restoreRequested = z.object({
	fileName: z.string().min(1).max(MAX_BACKUP_NAME_LENGTH),
	willRestart: z.boolean(),
})

export type RestoreRequested = z.infer<typeof restoreRequested>
