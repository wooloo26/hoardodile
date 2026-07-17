import {
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import {
	clearPendingRestoreMarker,
	readPendingRestoreMarker,
} from "./marker.ts"

export type ApplyPendingRestoreDeps = {
	readonly paths: StoragePaths
	readonly now?: () => number
	/**
	 * Logger callback; the server passes a pino child. Kept narrow so the
	 * module stays loggable without importing fastify/pino types.
	 */
	readonly log?: (
		event: string,
		fields: Readonly<Record<string, unknown>>,
	) => void
}

export type ApplyPendingRestoreResult =
	| { readonly applied: false; readonly reason?: string }
	| {
			readonly applied: true
			readonly sourceName: string
			readonly previousPath: string
			readonly dbFilePath: string
	  }

/**
 * Apply a pending restore if one is recorded. Must run before any DB
 * connection is opened -- the swap is a file-level operation.
 *
 * Algorithm:
 * 1. Read the marker under `{storage}/local/tmp/`. Missing -> no-op.
 * 2. Validate the staged snapshot exists and is non-empty.
 * 3. Move the live DB (plus any `-wal` / `-shm` sidecars) into a
 *    timestamped folder under `{storage}/local/trash/`.
 * 4. Move the staged snapshot into place at the live DB path.
 * 5. Clear the marker.
 *
 * Any failure mid-way leaves the marker in place so the next boot retries.
 */
export function applyPendingRestore(
	deps: ApplyPendingRestoreDeps,
): ApplyPendingRestoreResult {
	const { paths } = deps
	const now = deps.now ?? Date.now
	const log = deps.log ?? (() => {})

	const marker = readPendingRestoreMarker(paths)
	if (marker === undefined) return { applied: false }

	if (!existsSync(marker.pendingPath)) {
		clearPendingRestoreMarker(paths)
		log("backup.restore.missing_source", { sourceName: marker.sourceName })
		return { applied: false, reason: "pending source missing" }
	}
	const stat = statSync(marker.pendingPath)
	if (!stat.isFile() || stat.size === 0) {
		clearPendingRestoreMarker(paths)
		rmSync(marker.pendingPath, { force: true })
		log("backup.restore.invalid_source", { sourceName: marker.sourceName })
		return { applied: false, reason: "pending source invalid" }
	}

	const trashDir = join(paths.local.trash(), `db-${now()}`)
	mkdirSync(trashDir, { recursive: true })
	mkdirSync(dirname(marker.dbFilePath), { recursive: true })

	const previousDbInTrash = join(trashDir, basename(marker.dbFilePath))
	for (const suffix of ["", "-wal", "-shm"] as const) {
		const live = `${marker.dbFilePath}${suffix}`
		if (!existsSync(live)) continue
		renameSync(live, `${previousDbInTrash}${suffix}`)
	}

	renameSync(marker.pendingPath, marker.dbFilePath)
	clearPendingRestoreMarker(paths)

	log("backup.restore.applied", {
		sourceName: marker.sourceName,
		previousPath: previousDbInTrash,
		dbFilePath: marker.dbFilePath,
	})

	return {
		applied: true,
		sourceName: marker.sourceName,
		previousPath: previousDbInTrash,
		dbFilePath: marker.dbFilePath,
	}
}

/**
 * First-run fallback: when no live DB file exists yet but one or more
 * backups are sitting in `versions/db-backups/`, the setup tool asks the
 * user whether to start fresh or restore. This helper exposes just enough
 * state for that UI; it does NOT auto-restore.
 */
export function describeFirstRunState(deps: {
	readonly paths: StoragePaths
	readonly dbFilePath: string
}): {
	readonly hasLiveDb: boolean
	readonly backupNames: readonly string[]
} {
	const { paths, dbFilePath } = deps
	const hasLiveDb = dbFilePath !== ":memory:" && existsSync(dbFilePath)
	// First-run backup discovery looks at the current (writable) version.
	// Backups are mutable working copies and belong to the current version.
	const backupsDir = paths.latest.dbBackups()
	if (!existsSync(backupsDir)) return { hasLiveDb, backupNames: [] }
	const names = readdirSync(backupsDir)
		.filter((name) => name.startsWith("app-") && name.endsWith(".sqlite"))
		.sort()
		.reverse()
	return { hasLiveDb, backupNames: names }
}
