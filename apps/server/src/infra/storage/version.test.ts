import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DomainError } from "@hoardodile/shared"
import { openDb } from "src/infra/db/connection.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
	createNextVersion,
	currentVersion,
	ensureBootstrapVersion,
	listVersions,
	readActiveVersion,
	stageViewCloneDb,
	writeActiveVersion,
} from "./version.ts"

describe("listVersions", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-list-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("empty directory returns empty array", () => {
		expect(listVersions(root)).toEqual([])
	})

	test("ignores non-numeric directory names", () => {
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		mkdirSync(join(root, "versions", "foo"), { recursive: true })
		mkdirSync(join(root, "versions", ".hidden"), { recursive: true })
		mkdirSync(join(root, "versions", "01"), { recursive: true })
		expect(listVersions(root)).toEqual([1])
	})

	test("returns sorted ascending", () => {
		for (const v of [3, 1, 10, 2]) {
			mkdirSync(join(root, "versions", String(v)), { recursive: true })
		}
		expect(listVersions(root)).toEqual([1, 2, 3, 10])
	})
})

describe("currentVersion", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-cur-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("returns 0 when no versions exist", () => {
		expect(currentVersion(root)).toBe(0)
	})

	test("returns max version number", () => {
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		mkdirSync(join(root, "versions", "5"), { recursive: true })
		expect(currentVersion(root)).toBe(5)
	})
})

describe("ensureBootstrapVersion", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-boot-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("creates versions/1 on empty storage", () => {
		const v = ensureBootstrapVersion(root)
		expect(v).toBe(1)
		expect(existsSync(join(root, "versions", "1"))).toBe(true)
	})

	test("is a no-op when any version already exists", () => {
		mkdirSync(join(root, "versions", "3"), { recursive: true })
		const v = ensureBootstrapVersion(root)
		expect(v).toBe(3)
		expect(existsSync(join(root, "versions", "1"))).toBe(false)
	})
})

describe("readActiveVersion", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-read-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("falls back to current when state file is missing", () => {
		mkdirSync(join(root, "versions", "2"), { recursive: true })
		expect(readActiveVersion(root)).toBe(2)
	})

	test("returns persisted active when it exists", () => {
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		mkdirSync(join(root, "versions", "2"), { recursive: true })
		mkdirSync(join(root, "local"), { recursive: true })
		writeFileSync(
			join(root, "local", "version-state.json"),
			JSON.stringify({ active: 1 }),
		)
		expect(readActiveVersion(root)).toBe(1)
	})

	test("falls back to current when state points at missing version", () => {
		mkdirSync(join(root, "versions", "2"), { recursive: true })
		mkdirSync(join(root, "local"), { recursive: true })
		writeFileSync(
			join(root, "local", "version-state.json"),
			JSON.stringify({ active: 99 }),
		)
		expect(readActiveVersion(root)).toBe(2)
	})

	test("falls back to current when state file is malformed", () => {
		mkdirSync(join(root, "versions", "3"), { recursive: true })
		mkdirSync(join(root, "local"), { recursive: true })
		writeFileSync(join(root, "local", "version-state.json"), "not json")
		expect(readActiveVersion(root)).toBe(3)
	})
})

describe("writeActiveVersion", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-write-"))
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		mkdirSync(join(root, "versions", "2"), { recursive: true })
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("persists valid active version", () => {
		writeActiveVersion(root, 1)
		const raw = readFileSync(join(root, "local", "version-state.json"), "utf8")
		expect(JSON.parse(raw)).toEqual({ active: 1 })
	})

	test("rejects unknown version", () => {
		try {
			writeActiveVersion(root, 99)
			expect.unreachable("should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("version.not_found")
		}
	})
})

describe("createNextVersion", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-next-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("throws when no version exists yet", () => {
		try {
			createNextVersion(root, () => {})
			expect.unreachable("should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("version.bootstrap_required")
		}
	})

	test("snapshots live DB into versions/<prev>/app.sqlite", () => {
		// Bootstrap version 1 and create a live DB
		ensureBootstrapVersion(root)
		const liveDbPath = join(root, "app.sqlite")
		const dbh = openDb(liveDbPath)
		dbh.runMigrations()
		dbh.close()

		const result = createNextVersion(root, (dest) => {
			const h = openDb(liveDbPath)
			h.vacuumInto(dest)
			h.close()
		})

		expect(result.previous).toBe(1)
		expect(result.created).toBe(2)

		const snapshotPath = join(root, "versions", "1", "app.sqlite")
		expect(existsSync(snapshotPath)).toBe(true)

		// Snapshot must pass integrity check
		const snap = openDb(snapshotPath, { readonly: true })
		expect(snap.integrityCheck()).toBe(true)
		snap.close()
	})

	test("throws when snapshot already exists", () => {
		ensureBootstrapVersion(root)
		const liveDbPath = join(root, "app.sqlite")
		const dbh = openDb(liveDbPath)
		dbh.runMigrations()
		dbh.close()

		// First call succeeds
		createNextVersion(root, (dest) => {
			const h = openDb(liveDbPath)
			h.vacuumInto(dest)
			h.close()
		})

		// After first publish, current version becomes 2; the next snapshot
		// target would be versions/2/app.sqlite. Pre-create it to trigger
		// the already_exists guard.
		mkdirSync(join(root, "versions", "2"), { recursive: true })
		writeFileSync(join(root, "versions", "2", "app.sqlite"), "")

		try {
			createNextVersion(root, () => {
				expect.unreachable("vacuumInto should not be called")
			})
			expect.unreachable("should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("version.already_exists")
		}
	})
})

describe("stageViewCloneDb", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ver-clone-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("clones archive DB and passes integrity check", () => {
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		const src = join(root, "versions", "1", "app.sqlite")
		const dbh = openDb(src)
		dbh.runMigrations()
		dbh.close()

		const clonePath = stageViewCloneDb(root, 1)
		expect(clonePath).toContain("view-1.sqlite")
		expect(existsSync(clonePath)).toBe(true)

		const clone = openDb(clonePath, { readonly: true })
		expect(clone.integrityCheck()).toBe(true)
		clone.close()
	})

	test("throws when source DB is missing", () => {
		try {
			stageViewCloneDb(root, 1)
			expect.unreachable("should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("version.db_missing")
		}
	})

	test("throws when clone fails integrity check", () => {
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		const src = join(root, "versions", "1", "app.sqlite")
		// Write garbage instead of a valid SQLite file
		writeFileSync(src, "this is not a sqlite database")

		try {
			stageViewCloneDb(root, 1)
			expect.unreachable("should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("version.clone_corrupt")
		}
	})

	test("cleans up stale WAL and SHM before cloning", () => {
		mkdirSync(join(root, "versions", "1"), { recursive: true })
		const src = join(root, "versions", "1", "app.sqlite")
		const dbh = openDb(src)
		dbh.runMigrations()
		dbh.close()

		// Pre-create stale sidecar files in tmp to simulate previous failed clone
		mkdirSync(join(root, "local", "tmp"), { recursive: true })
		const staleClone = join(root, "local", "tmp", "view-1.sqlite")
		writeFileSync(staleClone, "stale")
		writeFileSync(`${staleClone}-wal`, "stale-wal")
		writeFileSync(`${staleClone}-shm`, "stale-shm")

		const clonePath = stageViewCloneDb(root, 1)
		expect(existsSync(clonePath)).toBe(true)
		// The stale sidecars must be gone; the fresh clone may have new WAL/SHM
		// created by SQLite when opening in WAL mode, so we only assert the
		// stale contents were removed.
		expect(readFileSync(clonePath, "utf8")).not.toBe("stale")
		expect(
			existsSync(`${clonePath}-wal`)
				? readFileSync(`${clonePath}-wal`, "utf8")
				: "",
		).not.toBe("stale-wal")
		expect(
			existsSync(`${clonePath}-shm`)
				? readFileSync(`${clonePath}-shm`, "utf8")
				: "",
		).not.toBe("stale-shm")
	})
})
