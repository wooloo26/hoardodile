import {
	copyFileSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"
import type { BackupSummary } from "@hoardodile/schemas"
import { conflict, invalid, notFound } from "@hoardodile/shared"
import BetterSqlite3 from "better-sqlite3"
import { orderBy } from "es-toolkit"
import type { DbHandles } from "src/infra/db/connection.ts"
import type { ClockDeps } from "src/infra/service.ts"
import {
	assertInside,
	assertSafeSegment,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { writePendingRestoreMarker } from "./marker.ts"

/**
 * Prefix embedded in every generated snapshot filename so non-generated
 * or user-dropped files in `versions/db-backups/` are ignored when listing.
 */
const BACKUP_FILE_PREFIX = "app-"
/** Suffix for generated snapshots; matches the live DB file extension. */
const BACKUP_FILE_SUFFIX = ".sqlite"

export type BackupServiceDeps = ClockDeps & {
	readonly db: DbHandles
	readonly paths: StoragePaths
	/**
	 * Absolute path to the live DB file. Restores swap this file by moving
	 * the pending snapshot into place and the previous file into trash.
	 * Must not be `:memory:`; restore on an in-memory DB is unsupported.
	 */
	readonly dbFilePath: string
	/**
	 * Returns the version number that is currently active at backup time.
	 * Stored alongside the snapshot so the UI can relate backups to the
	 * archive version they belong to. Defaults to 0 for callers that do
	 * not need version tracking (e.g. restore-only utilities).
	 */
	readonly getActiveVersion?: () => number
}

export type BackupCreateInput = {
	readonly name?: string
	readonly note?: string
}

export type BackupUpdateMetaInput = {
	readonly name?: string
	readonly note?: string
}

export type BackupService = {
	/**
	 * Produce a consistent single-file snapshot of the live DB under
	 * `{storage}/versions/<v>/db-backups/`. Safe to call while writes are in
	 * flight; SQLite serialises `VACUUM INTO` against the WAL.
	 *
	 * @throws {DomainError} `backup.integrity_failed` when the freshly
	 *   written snapshot does not pass `PRAGMA integrity_check`.
	 */
	create(input?: BackupCreateInput): Promise<BackupSummary>
	/**
	 * List every snapshot currently on disk, newest first. Files that do
	 * not match the `app-*.sqlite` naming are skipped so users can drop
	 * other files into the folder without polluting the list.
	 */
	list(): Promise<readonly BackupSummary[]>
	/**
	 * Permanently remove a snapshot and its sidecar metadata. The file is
	 * unlinked (not moved to trash) because backups are already themselves
	 * the trash.
	 *
	 * @throws {DomainError} `backup.not_found` when `fileName` does not exist.
	 */
	delete(fileName: string): Promise<void>
	/**
	 * Validate and stage a restore from `fileName`: copies the snapshot into
	 * `local/tmp/` and writes a crash-safe marker. The caller (tRPC router)
	 * is responsible for scheduling the in-process restart after the HTTP
	 * response has been flushed.
	 *
	 * @throws {DomainError} `backup.not_found` / `backup.integrity_failed`
	 *   when the source cannot be used. `backup.memory_db_not_restorable`
	 *   when the live DB is `:memory:`.
	 */
	prepareRestore(fileName: string): Promise<void>
	/**
	 * Update user-visible metadata (`name` and/or `note`) attached to a backup.
	 * Both fields are persisted in the sidecar `.meta.json` file so they travel
	 * with the snapshot when the `versions/` folder is copied elsewhere.
	 *
	 * @throws {DomainError} `backup.not_found` when `fileName` does not exist.
	 */
	updateMeta(fileName: string, input: BackupUpdateMetaInput): Promise<void>
	/**
	 * Resolve the on-disk path of a snapshot for read-only streaming
	 * (download). Like restore, snapshots left behind in archived versions
	 * are located too, but never mutated.
	 *
	 * @throws {DomainError} `backup.not_found` when `fileName` does not exist.
	 */
	resolveFilePath(fileName: string): Promise<string>
	/**
	 * Snapshot the live runtime DB to an arbitrary `destination` path
	 * (`VACUUM INTO` + integrity check), e.g. a temp file for download.
	 *
	 * @throws {DomainError} `backup.integrity_failed` when the freshly
	 *   written snapshot does not pass `PRAGMA integrity_check`.
	 */
	snapshotRuntimeDb(destination: string): Promise<void>
}

/**
 * Build a {@link BackupService}. Pure closure; no hidden singletons.
 */
export function createBackupService(deps: BackupServiceDeps): BackupService {
	const { db, paths, dbFilePath, getActiveVersion } = deps
	const now = deps.now ?? Date.now

	function create(input?: BackupCreateInput): BackupSummary {
		// Backups are mutable working copies and belong to the current
		// (latest, writable) version only. Never write into `paths.active`,
		// which may point at a read-only past version when the user is
		// viewing an archive.
		const backupsDir = paths.latest.dbBackups()
		mkdirSync(backupsDir, { recursive: true })
		const fileName = buildBackupName(now())
		const destination = paths.latest.dbBackup(fileName)
		// `assertInside` gives a belt-and-braces check against symlinked or
		// otherwise drifting versions roots.
		assertInside(backupsDir, destination)
		db.vacuumInto(destination)
		if (!verifySnapshotIntegrity(destination)) {
			rmSync(destination, { force: true })
			throw invalid(
				"backup.integrity_failed",
				"snapshot failed integrity check",
				{ fileName },
			)
		}
		const trimmedName = input?.name?.trim()
		const trimmedNote = input?.note?.trim()
		writeBackupMeta(destination, {
			name: trimmedName && trimmedName.length > 0 ? trimmedName : undefined,
			note: trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined,
			activeVersion: (getActiveVersion ?? (() => 0))(),
		})
		return summarise(destination)
	}

	function list(): readonly BackupSummary[] {
		const summaries: BackupSummary[] = []
		for (let v = 1; v <= paths.latestVersion; v++) {
			const dir = paths.atVersion(v).dbBackups()
			if (!pathExists(dir)) continue
			for (const entry of readdirSync(dir).filter(isBackupFilename)) {
				try {
					summaries.push(summarise(join(dir, entry)))
				} catch {
					// Skip entries that disappeared between readdir and stat.
				}
			}
		}
		return orderBy(summaries, [(s) => s.createdAt], ["desc"])
	}

	function deleteBackup(fileName: string): void {
		const path = resolveBackupPath(fileName, { writable: true })
		if (!pathExists(path)) {
			throw notFound("backup.not_found", `backup ${fileName} does not exist`, {
				fileName,
			})
		}
		rmSync(path, { force: true })
		rmSync(backupMetaPath(path), { force: true })
	}

	function updateMeta(fileName: string, input: BackupUpdateMetaInput): void {
		const path = resolveBackupPath(fileName, { writable: true })
		if (!pathExists(path)) {
			throw notFound("backup.not_found", `backup ${fileName} does not exist`, {
				fileName,
			})
		}
		const existing = readBackupMeta(path)
		const trimmedName = input.name?.trim()
		const trimmedNote = input.note?.trim()

		const nextName =
			input.name === undefined
				? existing?.name
				: trimmedName && trimmedName.length > 0
					? trimmedName
					: undefined
		const nextNote =
			input.note === undefined
				? existing?.note
				: trimmedNote && trimmedNote.length > 0
					? trimmedNote
					: undefined

		if (nextName === undefined && nextNote === undefined) {
			rmSync(backupMetaPath(path), { force: true })
			return
		}
		writeBackupMeta(path, {
			name: nextName,
			note: nextNote,
			activeVersion: existing?.activeVersion,
		})
	}

	function prepareRestore(fileName: string): void {
		if (dbFilePath === ":memory:") {
			throw conflict(
				"backup.memory_db_not_restorable",
				"cannot restore into an in-memory database",
			)
		}
		const source = resolveBackupPath(fileName)
		if (!pathExists(source)) {
			throw notFound("backup.not_found", `backup ${fileName} does not exist`, {
				fileName,
			})
		}
		if (!verifySnapshotIntegrity(source)) {
			throw invalid(
				"backup.integrity_failed",
				"backup failed integrity check",
				{ fileName },
			)
		}
		stageRestore({ paths, source, dbFilePath, fileName, ts: now() })
	}

	return {
		create: async (input) => create(input),
		list: async () => list(),
		delete: async (fileName) => deleteBackup(fileName),
		prepareRestore: async (fileName) => prepareRestore(fileName),
		updateMeta: async (fileName, input) => updateMeta(fileName, input),
		resolveFilePath: async (fileName) => resolveFilePath(fileName),
		snapshotRuntimeDb: async (destination) => snapshotRuntimeDb(destination),
	}

	function resolveFilePath(fileName: string): string {
		const path = resolveBackupPath(fileName)
		if (!pathExists(path)) {
			throw notFound("backup.not_found", `backup ${fileName} does not exist`, {
				fileName,
			})
		}
		return path
	}

	function snapshotRuntimeDb(destination: string): void {
		db.vacuumInto(destination)
		if (!verifySnapshotIntegrity(destination)) {
			rmSync(destination, { force: true })
			throw invalid(
				"backup.integrity_failed",
				"snapshot failed integrity check",
				{ destination },
			)
		}
	}

	function resolveBackupPath(
		fileName: string,
		options?: { readonly writable?: boolean },
	): string {
		const safe = assertSafeSegment(fileName)
		const currentDir = paths.latest.dbBackups()
		const currentCandidate = paths.latest.dbBackup(safe)
		assertInside(currentDir, currentCandidate)

		if (pathExists(currentCandidate)) {
			return currentCandidate
		}

		if (options?.writable) {
			// Writable operations must never touch a past version's frozen
			// archive. If the file lives only in a past version, report it
			// as archived read-only instead of silently returning a missing
			// path under current/.
			for (let v = 1; v < paths.latestVersion; v++) {
				if (pathExists(paths.atVersion(v).dbBackup(safe))) {
					throw conflict(
						"backup.archived_readonly",
						`backup ${fileName} is stored in an archived version and cannot be modified`,
						{ fileName },
					)
				}
			}
			return currentCandidate
		}

		// Read operations (restore, list) may locate backups that were left
		// behind in older versions, but they must not mutate them.
		for (let v = 1; v < paths.latestVersion; v++) {
			const dir = paths.atVersion(v).dbBackups()
			const candidate = paths.atVersion(v).dbBackup(safe)
			if (pathExists(candidate)) {
				assertInside(dir, candidate)
				return candidate
			}
		}
		return currentCandidate
	}
}

function buildBackupName(ts: number): string {
	// Numeric-only timestamps sort lexicographically, which keeps listing
	// and restore UX ordered without extra parsing.
	return `${BACKUP_FILE_PREFIX}${ts}${BACKUP_FILE_SUFFIX}`
}

function isBackupFilename(name: string): boolean {
	return (
		name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_SUFFIX)
	)
}

function summarise(path: string): BackupSummary {
	const stat = statSync(path)
	const meta = readBackupMeta(path)
	const versionDir = basename(dirname(dirname(path)))
	const inferredVersion = /^\d+$/.test(versionDir)
		? Number(versionDir)
		: undefined
	return {
		fileName: basename(path),
		name: meta?.name,
		size: stat.size,
		createdAt: stat.mtimeMs,
		note: meta?.note,
		activeVersion: meta?.activeVersion ?? inferredVersion,
	}
}

type BackupMeta = {
	readonly name?: string
	readonly note?: string
	readonly activeVersion?: number
}

function backupMetaPath(backupPath: string): string {
	return `${backupPath}.meta.json`
}

function readBackupMeta(backupPath: string): BackupMeta | undefined {
	const metaPath = backupMetaPath(backupPath)
	if (!pathExists(metaPath)) return undefined
	try {
		const raw = readFileSync(metaPath, "utf-8")
		const parsed = JSON.parse(raw) as Partial<BackupMeta>
		const name =
			typeof parsed.name === "string" && parsed.name.length > 0
				? parsed.name
				: undefined
		const note =
			typeof parsed.note === "string" && parsed.note.length > 0
				? parsed.note
				: undefined
		const activeVersion =
			typeof parsed.activeVersion === "number" && parsed.activeVersion >= 0
				? parsed.activeVersion
				: undefined
		if (
			name !== undefined ||
			note !== undefined ||
			activeVersion !== undefined
		) {
			return { name, note, activeVersion }
		}
	} catch {
		// Ignore malformed meta files.
	}
	return undefined
}

function writeBackupMeta(backupPath: string, meta: BackupMeta): void {
	const metaPath = backupMetaPath(backupPath)
	const payload: Record<string, unknown> = {}
	if (meta.name !== undefined && meta.name.length > 0) {
		payload.name = meta.name
	}
	if (meta.note !== undefined && meta.note.length > 0) {
		payload.note = meta.note
	}
	if (meta.activeVersion !== undefined) {
		payload.activeVersion = meta.activeVersion
	}
	if (Object.keys(payload).length === 0) {
		rmSync(metaPath, { force: true })
		return
	}
	writeFileSync(metaPath, JSON.stringify(payload, undefined, 2))
}

function pathExists(path: string): boolean {
	try {
		statSync(path)
		return true
	} catch {
		return false
	}
}

/**
 * Open the file read-only, run `PRAGMA integrity_check`, and close. We use
 * a dedicated handle rather than the live `DbHandles` so corruption in a
 * snapshot cannot contaminate the running process.
 */
function verifySnapshotIntegrity(path: string): boolean {
	let handle: InstanceType<typeof BetterSqlite3> | undefined
	try {
		handle = new BetterSqlite3(path, { readonly: true, fileMustExist: true })
		const rows = handle.pragma("integrity_check") as ReadonlyArray<{
			integrity_check: string
		}>
		return rows.length === 1 && rows[0]?.integrity_check === "ok"
	} catch {
		return false
	} finally {
		handle?.close()
	}
}

type StageRestoreInput = {
	readonly paths: StoragePaths
	readonly source: string
	readonly dbFilePath: string
	readonly fileName: string
	readonly ts: number
}

/**
 * Copy the validated snapshot into `local/tmp/` under a canonical name and
 * record a marker the next boot will act on. We copy via rename-onto-same-
 * volume when possible; falling back to `copyFileSync` keeps cross-volume
 * setups working.
 */
function stageRestore(input: StageRestoreInput): void {
	const { paths, source, dbFilePath, fileName, ts } = input
	const tmpDir = paths.local.tmp()
	mkdirSync(tmpDir, { recursive: true })
	const pending = paths.local.tmpFile(PENDING_RESTORE_FILENAME)
	// Always overwrite any prior pending file; the marker is what actually
	// gates whether the swap happens on next boot.
	rmSync(pending, { force: true })
	copyFile(source, pending)
	writePendingRestoreMarker({
		paths,
		marker: {
			pendingPath: pending,
			dbFilePath,
			sourceName: fileName,
			requestedAt: ts,
		},
	})
}

/** Canonical filename for the staged snapshot awaiting restore. */
const PENDING_RESTORE_FILENAME = "pending-restore.sqlite"

function copyFile(src: string, dest: string): void {
	copyFileSync(src, dest)
}

export const __testing__ = {
	PENDING_RESTORE_FILENAME,
	buildBackupName,
	isBackupFilename,
}
