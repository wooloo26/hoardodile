import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { loadEnv } from "src/config/env.ts"
import { verifyPassword } from "src/domain/auth/password.ts"
import { createBackupService } from "src/domain/backup/service.ts"
import { openDb, schema } from "src/infra/db/connection.ts"
import { createStoragePaths } from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
	readAuthConfiguration,
	stagePendingRestoreSnapshot,
	writeAuthPassword,
} from "./runtime.ts"

describe("writeAuthPassword", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-runtime-pw-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("stores a verifiable argon2id hash on a fresh DB", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		await writeAuthPassword(env, "hunter2")

		const dbh = openDb(env.DATABASE_URL)
		try {
			const row = dbh.db
				.select({ hash: schema.auth.passwordHash })
				.from(schema.auth)
				.where(eq(schema.auth.singleton, 1))
				.get()
			expect(row).toBeDefined()
			if (!row) throw new Error("unreachable")
			expect(await verifyPassword(row.hash, "hunter2")).toBe(true)
		} finally {
			dbh.close()
		}
	})

	test("upserts when called twice (second password wins)", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		await writeAuthPassword(env, "first")
		await writeAuthPassword(env, "second")

		const dbh = openDb(env.DATABASE_URL)
		try {
			const row = dbh.db
				.select({ hash: schema.auth.passwordHash })
				.from(schema.auth)
				.where(eq(schema.auth.singleton, 1))
				.get()
			if (!row) throw new Error("unreachable")
			expect(await verifyPassword(row.hash, "first")).toBe(false)
			expect(await verifyPassword(row.hash, "second")).toBe(true)
		} finally {
			dbh.close()
		}
	})

	test("rejects empty password", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		await expect(writeAuthPassword(env, "")).rejects.toThrow()
	})
})

describe("readAuthConfiguration", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-runtime-cfg-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test('returns "no-db" when the storage layout has no DB yet', () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		const state = readAuthConfiguration(env)
		expect(state.kind).toBe("no-db")
		if (state.kind !== "no-db") throw new Error("unreachable")
		expect(state.dbFilePath).toBe(env.DATABASE_URL)
	})

	test('returns "no-password" when DB exists but auth row is missing', () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		// Materialise the DB without writing a password row.
		mkdirSync(join(root, "local"), { recursive: true })
		const dbh = openDb(env.DATABASE_URL)
		dbh.runMigrations()
		dbh.close()

		const state = readAuthConfiguration(env)
		expect(state.kind).toBe("no-password")
	})

	test('returns "configured" once writeAuthPassword has run', async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		await writeAuthPassword(env, "hunter2")
		expect(readAuthConfiguration(env).kind).toBe("configured")
	})
})

describe("stagePendingRestoreSnapshot", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-runtime-stage-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("stages and applies a known backup so the live DB is replaced", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)

		// Step 1: produce a working live DB, take a snapshot, then mutate
		// the live DB so we can tell the staged version apart later.
		const paths = createStoragePaths({ root: env.STORAGE_ROOT })
		const dbh = openDb(env.DATABASE_URL)
		dbh.runMigrations()
		dbh.db
			.insert(schema.auth)
			.values({ singleton: 1, passwordHash: "snapshot-hash", updatedAt: 1 })
			.run()
		const svc = createBackupService({
			db: dbh,
			paths,
			dbFilePath: env.DATABASE_URL,
		})
		const snap = await svc.create()
		dbh.db
			.update(schema.auth)
			.set({ passwordHash: "tainted", updatedAt: 999 })
			.run()
		dbh.close()

		// Sanity: live DB now has the tainted row.
		const live = openDb(env.DATABASE_URL)
		expect(
			live.db.select({ hash: schema.auth.passwordHash }).from(schema.auth).get()
				?.hash,
		).toBe("tainted")
		live.close()

		// Step 2: stage the earlier snapshot. The helper applies the
		// pending restore in the same call, so reopening the live DB now
		// must show the snapshot row.
		await stagePendingRestoreSnapshot(env, snap.fileName)

		const restored = openDb(env.DATABASE_URL)
		try {
			const row = restored.db
				.select({ hash: schema.auth.passwordHash })
				.from(schema.auth)
				.get()
			expect(row?.hash).toBe("snapshot-hash")
		} finally {
			restored.close()
		}
	})

	test("rejects unknown backup names", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		mkdirSync(createStoragePaths({ root }).active.dbBackups(), {
			recursive: true,
		})
		await expect(
			stagePendingRestoreSnapshot(env, "app-missing.sqlite"),
		).rejects.toThrow()
	})

	test("does not leak state when the staging directory is empty", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		} satisfies NodeJS.ProcessEnv)
		const paths = createStoragePaths({ root })
		mkdirSync(paths.active.dbBackups(), { recursive: true })
		await expect(
			stagePendingRestoreSnapshot(env, "app-2.sqlite"),
		).rejects.toThrow()
		// No live DB should be created as a side-effect of the failed call.
		const dbExists = (() => {
			try {
				return statSync(env.DATABASE_URL).size > 0
			} catch {
				return false
			}
		})()
		expect(dbExists).toBe(false)
	})
})
