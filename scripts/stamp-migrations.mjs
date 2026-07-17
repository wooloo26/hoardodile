#!/usr/bin/env node
/**
 * One-off dev helper: stamp an existing SQLite database as "already migrated"
 * with the current contents of apps/server/src/infra/db/migrations.
 *
 * Needed after squashing migrations (wiping the folder + `pnpm db:generate`).
 * The Drizzle migrator applies every journal entry whose `when` is newer than
 * the last row in `__drizzle_migrations` and never re-checks hashes, so a
 * freshly regenerated initial migration would otherwise re-run all its
 * CREATE TABLE statements on an existing database and crash at startup.
 * This script rewrites the `__drizzle_migrations` bookkeeping table to match
 * the new journal. It does not touch any application table.
 *
 *   node scripts/stamp-migrations.mjs <path-to-app.sqlite>
 */

import { createHash } from "node:crypto"
import { constants, copyFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../apps/server/src/infra/db/migrations", import.meta.url),
)

function fail(message) {
	console.error(`error: ${message}`)
	process.exit(1)
}

const dbPath = process.argv[2]
if (!dbPath) {
	fail("usage: node scripts/stamp-migrations.mjs <path-to-app.sqlite>")
}
if (!existsSync(dbPath)) fail(`database not found: ${dbPath}`)

const journalPath = join(MIGRATIONS_DIR, "meta", "_journal.json")
if (!existsSync(journalPath)) {
	fail(`no journal at ${journalPath} — run \`pnpm db:generate\` first`)
}
const entries = JSON.parse(readFileSync(journalPath, "utf8")).entries
if (!entries?.length) {
	fail("journal has no entries — run `pnpm db:generate` first")
}

// Mirror drizzle-orm/migrator.js: hash = sha256 of the whole .sql file
// text, created_at = the journal entry's `when`.
const rows = entries.map((entry) => ({
	hash: createHash("sha256")
		.update(readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8"))
		.digest("hex"),
	createdAt: entry.when,
}))

const db = new DatabaseSync(dbPath)
try {
	// Fold any pending WAL frames into the main file so the single-file
	// backup below is consistent on its own.
	db.exec("PRAGMA wal_checkpoint(TRUNCATE)")

	const backupPath = `${dbPath}.pre-stamp.bak`
	try {
		copyFileSync(dbPath, backupPath, constants.COPYFILE_EXCL)
	} catch {
		fail(`backup already exists: ${backupPath} — remove it first`)
	}

	db.exec("BEGIN")
	try {
		db.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`)
		db.exec('DELETE FROM "__drizzle_migrations"')
		const insert = db.prepare(
			'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
		)
		for (const row of rows) insert.run(row.hash, row.createdAt)
		db.exec("COMMIT")
	} catch (error) {
		db.exec("ROLLBACK")
		throw error
	}

	console.log(`Stamped ${rows.length} migration(s) into ${dbPath}`)
	console.log(`Backup of the untouched file: ${backupPath}`)
} finally {
	db.close()
}
