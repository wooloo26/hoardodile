import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadEnv } from "src/config/env.ts"
import { verifyPassword } from "src/domain/auth/password.ts"
import { openDb, schema } from "src/infra/db/connection.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { readAuthConfiguration } from "./runtime.ts"
import { runSetup } from "./setup.ts"

describe("runSetup", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-setup-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	function env(
		overrides: Record<string, string> = {},
	): ReturnType<typeof loadEnv> {
		return loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			...overrides,
		})
	}

	test("writes an env-supplied password", async () => {
		await runSetup(env(), { kind: "env", password: "hunter2" })

		const dbh = openDb(env().DATABASE_URL)
		try {
			const row = dbh.db.select().from(schema.auth).get()
			expect(row).toBeDefined()
			if (!row) throw new Error("unreachable")
			expect(await verifyPassword(row.passwordHash, "hunter2")).toBe(true)
		} finally {
			dbh.close()
		}
	})

	test("reads password from ADMIN_PASSWORD_FILE", async () => {
		const passwordFile = join(root, "admin-password.txt")
		writeFileSync(passwordFile, "file-password\n", "utf-8")
		const e = env()

		await runSetup(e, { kind: "file", path: passwordFile })

		const dbh = openDb(e.DATABASE_URL)
		try {
			const row = dbh.db.select().from(schema.auth).get()
			expect(row).toBeDefined()
			if (!row) throw new Error("unreachable")
			expect(await verifyPassword(row.passwordHash, "file-password")).toBe(true)
		} finally {
			dbh.close()
		}
	})

	test("upserts when called twice", async () => {
		const e = env()
		await runSetup(e, { kind: "env", password: "first" })
		await runSetup(e, { kind: "env", password: "second" })

		const dbh = openDb(e.DATABASE_URL)
		try {
			const row = dbh.db.select().from(schema.auth).get()
			if (!row) throw new Error("unreachable")
			expect(await verifyPassword(row.passwordHash, "first")).toBe(false)
			expect(await verifyPassword(row.passwordHash, "second")).toBe(true)
		} finally {
			dbh.close()
		}
	})

	test("rejects a password shorter than 4 characters", async () => {
		await expect(
			runSetup(env(), { kind: "env", password: "abc" }),
		).rejects.toThrow(/at least 4 characters/i)
	})

	test("reports configured after setup", async () => {
		const e = env()
		await runSetup(e, { kind: "env", password: "hunter2" })
		expect(readAuthConfiguration(e).kind).toBe("configured")
	})

	test("throws when RESTORE_FROM points to a missing snapshot", async () => {
		await expect(
			runSetup(env({ RESTORE_FROM: "missing.sqlite" }), {
				kind: "env",
				password: "hunter2",
			}),
		).rejects.toThrow()
	})
})
