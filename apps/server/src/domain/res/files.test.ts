import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resources } from "src/domain/res/schema.ts"
import { openDb } from "src/infra/db/connection.ts"
import { createStoragePaths } from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { cleanupOrphanResourceFolders } from "./files.ts"

describe("cleanupOrphanResourceFolders", () => {
	let root: string
	let paths: ReturnType<typeof createStoragePaths>
	let dbh: ReturnType<typeof openDb>

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "res-files-"))
		paths = createStoragePaths({ root })
		dbh = openDb(paths.runtimeDb())
		dbh.runMigrations()
	})

	afterEach(() => {
		dbh.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("never touches shared resource folders, only local derived folders", async () => {
		dbh.db
			.insert(resources)
			.values({
				id: "res-alive",
				name: "Alive",
				intro: "",
				fileVersion: 1,
				coverVersion: 1,
				createdAt: 1,
				updatedAt: 1,
			})
			.run()

		mkdirSync(paths.latest.resource("res-alive"), { recursive: true })
		mkdirSync(paths.latest.resource("res-orphan"), { recursive: true })
		mkdirSync(paths.local.resource("res-alive"), { recursive: true })
		mkdirSync(paths.local.resource("res-local-orphan"), { recursive: true })

		await cleanupOrphanResourceFolders(paths, dbh.db)

		expect(existsSync(paths.latest.resource("res-alive"))).toBe(true)
		expect(existsSync(paths.latest.resource("res-orphan"))).toBe(true)
		expect(existsSync(paths.local.resource("res-alive"))).toBe(true)
		expect(existsSync(paths.local.resource("res-local-orphan"))).toBe(false)
	})
})
