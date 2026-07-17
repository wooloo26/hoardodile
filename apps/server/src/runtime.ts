/**
 * Shared runtime primitives used by the standalone server entry and the
 * one-shot setup script.
 *
 * Keeping the first-run setup ops and the listen-and-go launch logic in a
 * single module means the surfaces cannot drift on subtle ordering
 * details (apply pending restore BEFORE writing the password hash, etc.).
 */

import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Env } from "src/config/env.ts"
import { resolveAvailablePort } from "src/config/port.ts"
import { hashPassword } from "src/domain/auth/password.ts"
import { createBackupService } from "src/domain/backup/service.ts"
import { applyPendingRestore } from "src/domain/backup/startup.ts"
import { openDb, schema } from "src/infra/db/connection.ts"
import { resolveStorageContext } from "src/infra/storage/bootstrap.ts"
import { type BuiltServer, buildServer } from "src/server.ts"

/**
 * Stage a previously-taken backup as the next database, then apply the
 * pending-restore swap so a subsequent {@link writeAuthPassword} or
 * {@link launchHttpServer} call sees the restored DB in place.
 *
 * Order matters: the swap must happen BEFORE any handle to the live DB
 * is opened, otherwise the rename races with an open SQLite file.
 *
 * @throws when `name` does not match a known backup or the snapshot is
 *   corrupt -- the underlying {@link createBackupService} validates.
 */
export async function stagePendingRestoreSnapshot(
	env: Env,
	name: string,
): Promise<void> {
	const ctx = resolveStorageContext(env)
	const dbHandles = openDb(":memory:")
	dbHandles.runMigrations()
	const backupService = createBackupService({
		db: dbHandles,
		paths: ctx.paths,
		dbFilePath: ctx.dbFilePath,
	})
	try {
		await backupService.prepareRestore(name)
	} finally {
		dbHandles.close()
	}
	applyPendingRestore({ paths: ctx.paths })
}

/**
 * Hash `password` with argon2id and upsert it as the single-user auth row.
 * Opens its own short-lived DB connection so it is safe to call BEFORE the
 * long-running server starts.
 *
 * @throws when `password` is empty.
 */
export async function writeAuthPassword(
	env: Env,
	password: string,
): Promise<void> {
	const hash = await hashPassword(password)
	const ctx = resolveStorageContext(env)
	if (ctx.readOnly) {
		throw new Error(
			"app: cannot write password while viewing a past version (read-only)",
		)
	}
	mkdirSync(dirname(ctx.dbFilePath), { recursive: true })
	const dbHandles = openDb(ctx.dbFilePath)
	try {
		dbHandles.runMigrations()
		const now = Date.now()
		dbHandles.db
			.insert(schema.auth)
			.values({ singleton: 1, passwordHash: hash, updatedAt: now })
			.onConflictDoUpdate({
				target: schema.auth.singleton,
				set: { passwordHash: hash, updatedAt: now },
			})
			.run()
	} finally {
		dbHandles.close()
	}
}

export type LaunchedServer = {
	readonly built: BuiltServer
	readonly host: string
	readonly port: number
}

export type LaunchHttpServerOptions = {
	readonly env: Env
	readonly webRoot?: string
	readonly onContextReloaded?: () => void
}

/**
 * Build a Fastify instance via {@link buildServer}, resolve a free port
 * (preferring `env.PORT`, falling back to an OS-picked one) and start
 * listening. Returns the running instance plus the resolved bind info so
 * callers can surface it.
 */
export async function launchHttpServer(
	opts: LaunchHttpServerOptions,
): Promise<LaunchedServer> {
	const ctx = resolveStorageContext(opts.env)
	const built = await buildServer({
		env: opts.env,
		webRoot: opts.webRoot,
		onContextReloaded: opts.onContextReloaded,
		storagePaths: ctx.paths,
		databaseUrl: ctx.dbFilePath,
		readOnly: ctx.readOnly,
	})
	const port = await resolveAvailablePort(opts.env.PORT)
	await built.app.listen({ host: opts.env.HOST, port })

	// ── TCP keepalive ─────────────────────────────────────────────────────
	// LAN clients reach the server over WiFi or Ethernet through a router
	// whose NAT/ARP table expires idle entries after ~1-5 minutes. Without
	// OS-level keepalive probes the router silently drops the mapping and
	// the next request stalls for 5-30 s while the client re-establishes
	// connectivity. Enabling TCP keepalive at 60 s keeps those entries
	// fresh. The HTTP keepAliveTimeout in server.ts is aligned to the same
	// 2-minute window so application-level connection reuse matches.
	const server = built.app.server
	if (server) {
		server.on("connection", (socket) => {
			socket.setKeepAlive(true, 60_000)
		})
	}

	return { built, host: opts.env.HOST, port }
}

export type AuthConfiguration =
	| { readonly kind: "configured" }
	| { readonly kind: "no-db"; readonly dbFilePath: string }
	| { readonly kind: "no-password" }

/**
 * Inspect the persistent auth state without starting the server. Used by
 * the CLI `serve` command to fail fast in production when the operator
 * forgot to run `setup` first, and to decide whether to seed the dev
 * default password in development mode.
 *
 * Behaviour:
 *  - No DB file on disk -> `no-db`. Setup has not run yet.
 *  - DB exists but no auth row -> `no-password`. DB was created by some
 *    other path (e.g. import script) and still needs a password.
 *  - DB exists and auth row present -> `configured`.
 */
export function readAuthConfiguration(env: Env): AuthConfiguration {
	const ctx = resolveStorageContext(env)
	if (ctx.dbFilePath !== ":memory:" && !existsSync(ctx.dbFilePath)) {
		return { kind: "no-db", dbFilePath: ctx.dbFilePath }
	}
	const dbHandles = openDb(ctx.dbFilePath)
	try {
		if (!ctx.readOnly) dbHandles.runMigrations()
		const row = dbHandles.db.select().from(schema.auth).get()
		return row ? { kind: "configured" } : { kind: "no-password" }
	} finally {
		dbHandles.close()
	}
}
