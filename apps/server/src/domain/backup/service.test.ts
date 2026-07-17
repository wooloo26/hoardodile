import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DomainError } from "@hoardodile/shared"
import { openDb } from "src/infra/db/connection.ts"
import { createStoragePaths } from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { readPendingRestoreMarker } from "./marker.ts"
import { type BackupService, createBackupService } from "./service.ts"
import { applyPendingRestore, describeFirstRunState } from "./startup.ts"

describe("backup service", () => {
	let root: string
	let dbFilePath: string
	let paths: ReturnType<typeof createStoragePaths>
	let dbh: ReturnType<typeof openDb>
	let svc: BackupService
	let nowSpy: { value: number }

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-backup-"))
		paths = createStoragePaths({ root })
		dbFilePath = paths.runtimeDb()
		dbh = openDb(dbFilePath)
		dbh.runMigrations()
		nowSpy = { value: 1_700_000_000_000 }
		svc = createBackupService({
			db: dbh,
			paths,
			dbFilePath,
			now: () => nowSpy.value++,
			getActiveVersion: () => 1,
		})
	})

	afterEach(() => {
		dbh.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("create writes a consistent snapshot that passes integrity_check", async () => {
		const summary = await svc.create()
		expect(summary.fileName).toMatch(/^app-\d+\.sqlite$/)
		expect(summary.name).toBeUndefined()
		expect(summary.size).toBeGreaterThan(0)
		const path = paths.active.dbBackup(summary.fileName)
		expect(existsSync(path)).toBe(true)
		// Open the snapshot read-only and verify integrity via a fresh handle.
		const snap = openDb(path)
		expect(snap.integrityCheck()).toBe(true)
		snap.close()
	})

	test("list returns snapshots newest-first and ignores foreign files", async () => {
		await svc.create()
		await svc.create()
		const dir = paths.active.dbBackups()
		writeFileSync(join(dir, "not-a-backup.txt"), "hi")
		const list = await svc.list()
		expect(list).toHaveLength(2)
		expect(list[0]?.createdAt).toBeGreaterThanOrEqual(list[1]?.createdAt ?? 0)
	})

	test("delete removes the file; missing name throws NOT_FOUND", async () => {
		const first = await svc.create()
		await svc.delete(first.fileName)
		expect(existsSync(paths.active.dbBackup(first.fileName))).toBe(false)

		try {
			await svc.delete(first.fileName)
			throw new Error("expected throw")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("backup.not_found")
		}
	})

	test("prepareRestore stages the pending file and writes a marker", async () => {
		const summary = await svc.create()
		await svc.prepareRestore(summary.fileName)
		const marker = readPendingRestoreMarker(paths)
		expect(marker?.sourceName).toBe(summary.fileName)
		expect(marker?.dbFilePath).toBe(dbFilePath)
		expect(existsSync(marker?.pendingPath ?? "")).toBe(true)
	})

	test("prepareRestore rejects unknown names", async () => {
		try {
			await svc.prepareRestore("app-missing.sqlite")
			throw new Error("expected throw")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("backup.not_found")
		}
	})

	test("prepareRestore rejects corrupt snapshots", async () => {
		const summary = await svc.create()
		// Corrupt the snapshot by truncating it.
		writeFileSync(paths.active.dbBackup(summary.fileName), "not a sqlite file")
		try {
			await svc.prepareRestore(summary.fileName)
			throw new Error("expected throw")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("backup.integrity_failed")
		}
	})

	test("create stores note and activeVersion in sidecar meta", async () => {
		const summary = await svc.create({ note: "before migration" })
		expect(summary.note).toBe("before migration")
		expect(summary.activeVersion).toBe(1)
		const metaPath = `${paths.active.dbBackup(summary.fileName)}.meta.json`
		expect(existsSync(metaPath)).toBe(true)
	})

	test("updateMeta persists and clears note/name", async () => {
		const summary = await svc.create()
		await svc.updateMeta(summary.fileName, {
			name: "migration",
			note: "updated note",
		})
		let list = await svc.list()
		expect(list[0]?.name).toBe("migration")
		expect(list[0]?.note).toBe("updated note")

		await svc.updateMeta(summary.fileName, { name: "", note: "" })
		list = await svc.list()
		expect(list[0]?.name).toBeUndefined()
		expect(list[0]?.note).toBeUndefined()
	})

	test("updateMeta throws for unknown backup", async () => {
		try {
			await svc.updateMeta("app-missing.sqlite", { note: "note" })
			throw new Error("expected throw")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("backup.not_found")
		}
	})

	test("delete and updateMeta refuse to modify a backup stored in an archived version", async () => {
		// Seed a backup under version 1, then advance to version 2.
		const summary = await svc.create()
		mkdirSync(join(root, "versions", "2"), { recursive: true })
		const v2Paths = createStoragePaths({ root, latestVersion: 2 })
		const v2Svc = createBackupService({
			db: dbh,
			paths: v2Paths,
			dbFilePath,
			now: () => nowSpy.value++,
			getActiveVersion: () => 2,
		})

		try {
			await v2Svc.delete(summary.fileName)
			throw new Error("expected throw")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("backup.archived_readonly")
		}

		try {
			await v2Svc.updateMeta(summary.fileName, { note: "nope" })
			throw new Error("expected throw")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			expect((err as DomainError).kind).toBe("backup.archived_readonly")
		}

		// The archived backup must remain untouched.
		expect(existsSync(paths.atVersion(1).dbBackup(summary.fileName))).toBe(true)
	})

	test("create always writes into the current version directory", async () => {
		// Advance to version 2 while the active (viewing) version stays at 1.
		mkdirSync(join(root, "versions", "2"), { recursive: true })
		const mixedPaths = createStoragePaths({
			root,
			activeVersion: 1,
			latestVersion: 2,
		})
		const mixedSvc = createBackupService({
			db: dbh,
			paths: mixedPaths,
			dbFilePath,
			now: () => nowSpy.value++,
			getActiveVersion: () => 1,
		})

		const summary = await mixedSvc.create()
		expect(existsSync(mixedPaths.latest.dbBackup(summary.fileName))).toBe(true)
		expect(existsSync(mixedPaths.active.dbBackup(summary.fileName))).toBe(false)
	})
})

describe("applyPendingRestore", () => {
	let root: string
	let paths: ReturnType<typeof createStoragePaths>
	let dbFilePath: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-restore-"))
		paths = createStoragePaths({ root })
		dbFilePath = paths.runtimeDb()
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("no marker -> no-op", () => {
		const result = applyPendingRestore({ paths })
		expect(result.applied).toBe(false)
	})

	test("marker with pending source -> swaps live DB into trash", async () => {
		// Seed a pre-existing live DB
		const dbh = openDb(dbFilePath)
		dbh.runMigrations()
		dbh.close()
		const originalSize = statSync(dbFilePath).size
		expect(originalSize).toBeGreaterThan(0)

		// Create a snapshot to be restored.
		const dbh2 = openDb(dbFilePath)
		const svc = createBackupService({
			db: dbh2,
			paths,
			dbFilePath,
			getActiveVersion: () => 1,
		})
		const snap = await svc.create()
		await svc.prepareRestore(snap.fileName)
		dbh2.close()

		const result = applyPendingRestore({ paths })
		expect(result.applied).toBe(true)
		if (!result.applied) throw new Error("unreachable")
		expect(result.sourceName).toBe(snap.fileName)
		expect(existsSync(result.previousPath)).toBe(true)
		expect(existsSync(dbFilePath)).toBe(true)
		// Marker is cleared.
		expect(readPendingRestoreMarker(paths)).toBeUndefined()
	})
})

describe("describeFirstRunState", () => {
	test("reports no live DB and empty backup list on a fresh root", () => {
		const root = mkdtempSync(join(tmpdir(), "app-firstrun-"))
		try {
			const paths = createStoragePaths({ root })
			const state = describeFirstRunState({
				paths,
				dbFilePath: paths.runtimeDb(),
			})
			expect(state.hasLiveDb).toBe(false)
			expect(state.backupNames).toEqual([])
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})

	test("surfaces existing backups when no live DB is present", () => {
		const root = mkdtempSync(join(tmpdir(), "app-firstrun-"))
		try {
			const paths = createStoragePaths({ root })
			mkdirSync(paths.latest.dbBackups(), { recursive: true })
			writeFileSync(paths.latest.dbBackup("app-2.sqlite"), "x")
			writeFileSync(paths.latest.dbBackup("app-1.sqlite"), "x")
			const state = describeFirstRunState({
				paths,
				dbFilePath: paths.runtimeDb(),
			})
			expect(state.hasLiveDb).toBe(false)
			expect(state.backupNames).toEqual(["app-2.sqlite", "app-1.sqlite"])
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})
})
