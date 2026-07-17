import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { conflict, isDomainError, notFound } from "@hoardodile/shared"
import BetterSqlite3 from "better-sqlite3"

/**
 * Persisted version-state file (under `<root>/local/`, not `versions/`,
 * because `versions/` is reserved for version folders only).
 */
const STATE_FILENAME = "version-state.json"

/**
 * On-disk shape of the version state.
 *
 * - `active` — the version the user is currently viewing. When `active`
 *   equals the current (max) version the server runs in normal R/W mode;
 *   when `active < current` the server runs READ-ONLY against a cloned
 *   snapshot of the active version's DB.
 */
type VersionState = {
	readonly active: number
}

/** Root layout helper: the versions root directory `<root>/versions`. */
function versionsRoot(root: string): string {
	return resolve(root, "versions")
}

/** State file lives under `<root>/local/version-state.json`. */
function stateFile(root: string): string {
	return resolve(root, "local", STATE_FILENAME)
}

/**
 * Enumerate version directories under `<root>/versions/`. Names that are
 * not pure positive integers are ignored. Result is sorted ascending.
 */
export function listVersions(root: string): readonly number[] {
	const dir = versionsRoot(root)
	if (!existsSync(dir)) return []
	const names = readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
	const nums: number[] = []
	for (const n of names) {
		if (!/^[1-9][0-9]*$/.test(n)) continue
		nums.push(Number.parseInt(n, 10))
	}
	nums.sort((a, b) => a - b)
	return nums
}

/**
 * Current (maximum) version on disk. Returns `0` when no version exists
 * yet (caller is expected to bootstrap version 1 in that case).
 */
export function currentVersion(root: string): number {
	const all = listVersions(root)
	return all.length === 0 ? 0 : (all[all.length - 1] ?? 0)
}

/**
 * Read the persisted active version. Falls back to current when the
 * state file is missing or malformed, or when the recorded value points
 * at a version that no longer exists.
 */
export function readActiveVersion(root: string): number {
	const cur = currentVersion(root)
	const file = stateFile(root)
	if (!existsSync(file)) return cur
	try {
		const parsed = JSON.parse(
			readFileSync(file, "utf8"),
		) as Partial<VersionState>
		const active = typeof parsed.active === "number" ? parsed.active : cur
		const all = listVersions(root)
		if (all.includes(active)) return active
		return cur
	} catch {
		return cur
	}
}

/**
 * Persist the active version. Caller must ensure `version` exists on
 * disk (use {@link listVersions}).
 *
 * @throws {DomainError} when `version` is not a known version directory.
 */
export function writeActiveVersion(root: string, version: number): void {
	const all = listVersions(root)
	if (!all.includes(version)) {
		throw notFound("version.not_found", `version ${version} does not exist`, {
			version,
		})
	}
	const file = stateFile(root)
	mkdirSync(resolve(root, "local"), { recursive: true })
	const payload: VersionState = { active: version }
	writeFileSync(file, JSON.stringify(payload), "utf8")
}

/**
 * Bootstrap version 1 if the versions root has no version directories yet.
 * Idempotent; a no-op when any version already exists.
 */
export function ensureBootstrapVersion(root: string): number {
	const cur = currentVersion(root)
	if (cur > 0) return cur
	const v1 = resolve(versionsRoot(root), "1")
	mkdirSync(v1, { recursive: true })
	return 1
}

export type CreateNextVersionResult = {
	readonly previous: number
	readonly created: number
}

/**
 * Snapshot the current version into a freshly-numbered next version.
 *
 * Process:
 * 1. Compute `next = currentVersion + 1`.
 * 2. Create `<root>/versions/<next>/`.
 * 3. Vacuum-snapshot the live DB into `<root>/versions/<next>/app.sqlite`.
 *    (Caller passes a `vacuumInto` function; we don't take a `DbHandles`
 *    here to keep this module decoupled from drizzle.)
 * 4. Return summary.
 *
 * Note: avatar / fullbody / resource binaries are NOT copied. They live
 * at their fileVersion (recorded on each row); the cross-version reader
 * resolves them via {@link versionedPath}.
 *
 * @throws {DomainError} when no version exists yet (caller must
 *   bootstrap first).
 */
export function createNextVersion(
	root: string,
	vacuumInto: (destination: string) => void,
): CreateNextVersionResult {
	const prev = currentVersion(root)
	if (prev === 0) {
		throw conflict(
			"version.bootstrap_required",
			"no current version to snapshot from",
		)
	}
	const next = prev + 1
	const nextDir = resolve(versionsRoot(root), String(next))
	mkdirSync(nextDir, { recursive: true })
	// Archive the current live DB under the PREVIOUS version directory so
	// that `versions/<prev>/app.sqlite` becomes the immutable snapshot.
	// The live database stays at `<root>/app.sqlite`; only this archived
	// copy lands in `versions/`.
	const dest = resolve(versionsRoot(root), String(prev), "app.sqlite")
	if (existsSync(dest)) {
		throw conflict(
			"version.already_exists",
			`app.sqlite already exists for version ${next}`,
			{ version: next },
		)
	}
	vacuumInto(dest)
	return { previous: prev, created: next }
}

/**
 * Path to the DB file for version `v`: `<root>/versions/<v>/app.sqlite`.
 */
export function versionedDbFile(root: string, v: number): string {
	return resolve(versionsRoot(root), String(v), "app.sqlite")
}

/**
 * Path to the per-version archive directory `<root>/versions/<v>`.
 */
export function versionedPath(root: string, v: number): string {
	return resolve(versionsRoot(root), String(v))
}

/**
 * Stage a read-only viewing clone of `version`'s DB into
 * `<root>/local/tmp/view-<version>.sqlite`. Returns the cloned path. The
 * caller opens it in `readonly: true` mode and is responsible for
 * removing it on shutdown.
 *
 * Cloning (rather than opening the version DB directly) avoids any risk
 * of corrupting the immutable archive via SQLite WAL/SHM sidecars or
 * stray writes.
 */
export function stageViewCloneDb(root: string, version: number): string {
	const src = versionedDbFile(root, version)
	if (!existsSync(src)) {
		throw notFound("version.db_missing", `version ${version} has no DB file`, {
			version,
		})
	}
	const tmpDir = resolve(root, "local", "tmp")
	mkdirSync(tmpDir, { recursive: true })
	const dest = join(tmpDir, `view-${version}.sqlite`)
	rmSync(dest, { force: true })
	rmSync(`${dest}-wal`, { force: true })
	rmSync(`${dest}-shm`, { force: true })
	copyFileSync(src, dest)
	// Verify the clone before we hand it back.
	let handle: InstanceType<typeof BetterSqlite3> | undefined
	try {
		handle = new BetterSqlite3(dest, { readonly: true, fileMustExist: true })
		const rows = handle.pragma("integrity_check") as ReadonlyArray<{
			integrity_check: string
		}>
		const ok = rows.length === 1 && rows[0]?.integrity_check === "ok"
		if (!ok) {
			throw conflict(
				"version.clone_corrupt",
				`view clone for version ${version} failed integrity check`,
				{ version },
			)
		}
	} catch (err) {
		if (isDomainError(err)) throw err
		throw conflict(
			"version.clone_corrupt",
			`view clone for version ${version} failed integrity check`,
			{ version },
		)
	} finally {
		handle?.close()
	}
	return dest
}
