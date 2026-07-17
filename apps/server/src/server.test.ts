import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadEnv } from "src/config/env.ts"
import { hashPassword } from "src/domain/auth/password.ts"
import { readPendingRestoreMarker } from "src/domain/backup/marker.ts"
import { createBackupService } from "src/domain/backup/service.ts"
import { createVersionService } from "src/domain/version/service.ts"
import { openDb, schema } from "src/infra/db/connection.ts"
import { createDeferred } from "src/infra/runtime-context.ts"
import { createStoragePaths } from "src/infra/storage/paths.ts"
import {
	ensureBootstrapVersion,
	stageViewCloneDb,
} from "src/infra/storage/version.ts"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { type BuiltServer, buildServer } from "./server.ts"

async function bootstrap(): Promise<BuiltServer> {
	const env = loadEnv({
		NODE_ENV: "test",
		LOG_LEVEL: "silent",
	} satisfies NodeJS.ProcessEnv)
	const db = openDb(":memory:")
	db.runMigrations()
	const passwordHash = await hashPassword("hunter2")
	db.db
		.insert(schema.auth)
		.values({ singleton: 1, passwordHash, updatedAt: Date.now() })
		.run()
	return buildServer({ env, dbHandles: db })
}

/** @throws when `value` is not a string. */
function assertString(value: unknown): asserts value is string {
	if (typeof value !== "string") {
		throw new Error(`expected string, got ${typeof value}`)
	}
}

type TrpcEnvelope<T> = { result: { data: T } }

/** @throws when `value` is not a tRPC `{ result: { data } }` envelope. */
function assertTrpcEnvelope<T>(
	value: unknown,
): asserts value is TrpcEnvelope<T> {
	if (
		value === null ||
		typeof value !== "object" ||
		!("result" in value) ||
		value.result === null ||
		typeof value.result !== "object" ||
		!("data" in value.result)
	) {
		throw new Error("expected tRPC { result: { data } } envelope")
	}
}

function firstSetCookie(header: string | string[] | undefined): string {
	const line = Array.isArray(header) ? header[0] : header
	assertString(line)
	return line
}

describe("server", () => {
	let built: BuiltServer
	let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
	let consoleInfoSpy: ReturnType<typeof vi.spyOn> | undefined
	beforeEach(async () => {
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
		built = await bootstrap()
		await built.app.ready()
	})
	afterEach(async () => {
		await built.close()
		built.db.close()
		consoleWarnSpy?.mockRestore()
		consoleInfoSpy?.mockRestore()
	})

	test("/health is public and returns ok", async () => {
		const res = await built.app.inject({
			method: "GET",
			url: "/health",
			remoteAddress: "127.0.0.1",
		})
		expect(res.statusCode).toBe(200)
		expect(res.json()).toEqual({ ok: true })
	})

	test("login sets an HttpOnly SameSite=Strict cookie and authed tRPC call succeeds", async () => {
		const login = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			payload: { password: "hunter2" },
		})
		expect(login.statusCode).toBe(200)
		expect(login.json()).toEqual({ authenticated: true })

		const cookieLine = firstSetCookie(login.headers["set-cookie"])
		expect(cookieLine).toMatch(/HttpOnly/i)
		expect(cookieLine).toMatch(/SameSite=Strict/i)
		expect(cookieLine).toMatch(/app_session=/)

		const headerPart = cookieLine.split(";")[0]
		assertString(headerPart)

		const me = await built.app.inject({
			method: "GET",
			url: "/trpc/me",
			remoteAddress: "127.0.0.1",
			headers: { cookie: headerPart },
		})
		expect(me.statusCode).toBe(200)
		const body = me.json()
		assertTrpcEnvelope<{ authenticated: boolean }>(body)
		expect(body.result.data.authenticated).toBe(true)
	})

	test("tRPC authed procedure returns 401 without a valid session", async () => {
		const res = await built.app.inject({
			method: "GET",
			url: "/trpc/me",
			remoteAddress: "127.0.0.1",
		})
		expect(res.statusCode).toBe(401)
	})

	test("tRPC public procedure works without a session", async () => {
		const res = await built.app.inject({
			method: "GET",
			url: "/trpc/ping",
			remoteAddress: "127.0.0.1",
		})
		expect(res.statusCode).toBe(200)
		const body = res.json()
		assertTrpcEnvelope<{ ok: boolean }>(body)
		expect(body.result.data.ok).toBe(true)
	})

	test("login with the wrong password returns 401", async () => {
		const res = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			payload: { password: "wrong" },
		})
		expect(res.statusCode).toBe(401)
	})

	test("logout instructs the browser to clear the session cookie", async () => {
		const login = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			payload: { password: "hunter2" },
		})
		const cookieLine = firstSetCookie(login.headers["set-cookie"])
		const headerPart = cookieLine.split(";")[0]
		assertString(headerPart)

		const logout = await built.app.inject({
			method: "POST",
			url: "/auth/logout",
			remoteAddress: "127.0.0.1",
			headers: { cookie: headerPart },
		})
		expect(logout.statusCode).toBe(200)
		// Stateless cookie design: logout's only effect is the clearing
		// Set-Cookie header sent back to the browser. The cookie value
		// itself remains cryptographically valid until its TTL expires --
		// any client that ignores the clear instruction (or replays a
		// captured cookie) keeps access until then. Acceptable for the
		// single-user desktop deployment.
		const clearLine = firstSetCookie(logout.headers["set-cookie"])
		expect(clearLine).toMatch(/app_session=/)
		expect(clearLine).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i)
	})

	test("logout works when the frontend sends an empty JSON body", async () => {
		const login = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			payload: { password: "hunter2" },
		})
		const cookieLine = firstSetCookie(login.headers["set-cookie"])
		const headerPart = cookieLine.split(";")[0]
		assertString(headerPart)

		const logout = await built.app.inject({
			method: "POST",
			url: "/auth/logout",
			remoteAddress: "127.0.0.1",
			headers: {
				cookie: headerPart,
				"content-type": "application/json",
			},
			payload: JSON.stringify({}),
		})
		expect(logout.statusCode).toBe(200)
		expect(logout.json()).toEqual({ ok: true })
		const clearLine = firstSetCookie(logout.headers["set-cookie"])
		expect(clearLine).toMatch(/app_session=/)
		expect(clearLine).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i)
	})
})

describe("buildServer lifecycle (9a)", () => {
	let root: string
	let dbFilePath: string
	let paths: ReturnType<typeof createStoragePaths>

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-lifecycle-"))
		paths = createStoragePaths({ root })
		dbFilePath = paths.runtimeDb()
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("a staged restore is applied automatically on the next buildServer (no child process)", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			DATABASE_URL: dbFilePath,
		} satisfies NodeJS.ProcessEnv)

		const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
			code?: number,
		) => {
			throw new Error(`process.exit(${code}) must not be called`)
		}) as typeof process.exit)

		// First server owns its DB (no handles passed).
		const onContextReloaded = vi.fn()
		const built1 = await buildServer({
			env,
			onContextReloaded,
		})
		await built1.app.ready()

		// Seed auth data so we can tell the first DB from the swapped one.
		const passwordHash = await hashPassword("hunter2")
		built1.db.db
			.insert(schema.auth)
			.values({ singleton: 1, passwordHash, updatedAt: 1 })
			.run()

		// Take a snapshot of state #1, mutate live DB, then stage a restore
		// of the earlier snapshot. After restart the mutation must be gone.
		const svc = createBackupService({
			db: built1.db,
			paths: built1.storagePaths,
			dbFilePath,
		})
		const snap = await svc.create()

		built1.db.db
			.update(schema.auth)
			.set({ passwordHash: "tainted", updatedAt: 999 })
			.run()

		await svc.prepareRestore(snap.fileName)
		expect(readPendingRestoreMarker(paths)?.sourceName).toBe(snap.fileName)

		// Simulate the tRPC restore hook: close the server, then build a
		// fresh one. `applyPendingRestore` runs at the top of `buildServer`
		// before the DB is opened.
		await built1.close()
		const built2 = await buildServer({ env })
		await built2.app.ready()

		// Marker cleared -> applyPendingRestore ran.
		expect(readPendingRestoreMarker(paths)).toBeUndefined()
		// Previous (tainted) DB was preserved in local/trash/.
		const trashEntries = existsSync(paths.local.trash())
			? readdirSync(paths.local.trash())
			: []
		expect(trashEntries.length).toBeGreaterThan(0)
		// Fresh DB reflects the snapshot, not the tainted mutation.
		const rows = built2.db.db.select().from(schema.auth).all()
		expect(rows).toHaveLength(1)
		expect(rows[0]?.passwordHash).toBe(passwordHash)

		// No child process was ever spawned (we only touched `buildServer`).
		expect(onContextReloaded).not.toHaveBeenCalled()
		expect(exitSpy).not.toHaveBeenCalled()

		await built2.close()
		exitSpy.mockRestore()
	})

	test("storage context is hot-reloaded in-process on restore signal", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			DATABASE_URL: dbFilePath,
		} satisfies NodeJS.ProcessEnv)

		const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
			code?: number,
		) => {
			throw new Error(`process.exit(${code}) must not be called`)
		}) as typeof process.exit)

		let resolveReloaded: (() => void) | undefined
		const reloadPromise = new Promise<void>((r) => {
			resolveReloaded = r
		})
		const onContextReloaded = vi.fn(() => {
			resolveReloaded?.()
		})
		const built = await buildServer({
			env,
			onContextReloaded,
		})
		await built.app.ready()

		// Seed auth data so we can tell the first DB from the swapped one.
		const passwordHash = await hashPassword("hunter2")
		built.db.db
			.insert(schema.auth)
			.values({ singleton: 1, passwordHash, updatedAt: 1 })
			.run()

		// Take a snapshot, mutate live DB, stage restore, then emit the
		// same signal the backup router emits.
		const svc = createBackupService({
			db: built.db,
			paths: built.storagePaths,
			dbFilePath,
		})
		const snap = await svc.create()

		built.db.db
			.update(schema.auth)
			.set({ passwordHash: "tainted", updatedAt: 999 })
			.run()

		await svc.prepareRestore(snap.fileName)
		const pidBefore = process.pid

		built.app.signals.emit("backup.restoreRequested", undefined)
		await reloadPromise

		// Same process, but the DB was swapped.
		expect(process.pid).toBe(pidBefore)
		expect(onContextReloaded).toHaveBeenCalledTimes(1)
		expect(readPendingRestoreMarker(paths)).toBeUndefined()

		const rows = built.db.db.select().from(schema.auth).all()
		expect(rows).toHaveLength(1)
		expect(rows[0]?.passwordHash).toBe(passwordHash)

		// Server is still listening and serving requests.
		const health = await built.app.inject({
			method: "GET",
			url: "/health",
			remoteAddress: "127.0.0.1",
		})
		expect(health.statusCode).toBe(200)

		await built.close()
		exitSpy.mockRestore()
	})

	test("requests are queued during storage context reload", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			DATABASE_URL: dbFilePath,
		} satisfies NodeJS.ProcessEnv)

		const built = await buildServer({ env })
		await built.app.ready()

		// Manually enter draining state with a controlled gate.
		const gate = createDeferred<void>()
		built.app.isDraining = true
		built.app.reloadGate = gate

		// Send a request while draining; it should not complete until the gate resolves.
		const responsePromise = built.app.inject({
			method: "GET",
			url: "/health",
			remoteAddress: "127.0.0.1",
		})

		await new Promise((resolve) => setImmediate(resolve))
		let completed = false
		responsePromise.then(
			() => {
				completed = true
			},
			() => {
				completed = true
			},
		)
		expect(completed).toBe(false)

		gate.resolve()
		const res = await responsePromise
		expect(res.statusCode).toBe(200)
		expect(res.json()).toEqual({ ok: true })

		await built.close()
	})

	test("SSE /api/events is excluded from draining", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			DATABASE_URL: dbFilePath,
		} satisfies NodeJS.ProcessEnv)

		const built = await buildServer({ env })
		await built.app.listen({ host: "127.0.0.1", port: 0 })
		const address = built.app.server.address()
		const baseUrl =
			typeof address === "string"
				? address
				: `http://127.0.0.1:${address?.port}`

		// Open an SSE connection. It should not count as an in-flight request.
		const controller = new AbortController()
		const ssePromise = fetch(`${baseUrl}/api/events`, {
			signal: controller.signal,
		})

		// Give the server a chance to enter the SSE handler.
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(built.app.inflightRequests).toBe(0)

		// Enter draining with a gate that will never resolve on its own.
		const gate = createDeferred<void>()
		built.app.isDraining = true
		built.app.reloadGate = gate

		// A normal request should be queued, not rejected.
		const healthPromise = built.app.inject({
			method: "GET",
			url: "/health",
			remoteAddress: "127.0.0.1",
		})
		await new Promise((resolve) => setImmediate(resolve))
		let healthCompleted = false
		healthPromise.then(
			() => {
				healthCompleted = true
			},
			() => {
				healthCompleted = true
			},
		)
		expect(healthCompleted).toBe(false)

		// The SSE connection did not block draining: inflightRequests is still 0.
		expect(built.app.inflightRequests).toBe(0)

		// Resolve the gate and finish.
		gate.resolve()
		const health = await healthPromise
		expect(health.statusCode).toBe(200)

		controller.abort()
		try {
			await ssePromise
		} catch {
			// Aborting the fetch is expected.
		}
		await built.close()
	})

	test("graceful close releases the DB lock and stops Fastify", async () => {
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			DATABASE_URL: dbFilePath,
		} satisfies NodeJS.ProcessEnv)

		const built = await buildServer({ env })
		await built.app.listen({ host: "127.0.0.1", port: 0 })

		await built.close()

		// Fastify instance is closed: a further inject rejects.
		await expect(
			built.app.inject({ method: "GET", url: "/health" }),
		).rejects.toThrow()

		// DB file is unlocked: re-opening succeeds and integrity is intact.
		const reopened = openDb(dbFilePath)
		try {
			expect(reopened.integrityCheck()).toBe(true)
		} finally {
			reopened.close()
		}
	})

	test("webRoot serves index.html at / and falls back to it on unknown paths", async () => {
		const webRoot = join(root, "web-dist")
		mkdirSync(webRoot, { recursive: true })
		const indexHtml =
			"<!doctype html><html><body data-testid=spa>ok</body></html>"
		writeFileSync(join(webRoot, "index.html"), indexHtml, "utf8")
		writeFileSync(join(webRoot, "app.js"), "// static asset", "utf8")

		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
			DATABASE_URL: dbFilePath,
		} satisfies NodeJS.ProcessEnv)

		const built = await buildServer({
			env,
			webRoot,
		})
		try {
			await built.app.ready()

			const rootRes = await built.app.inject({
				method: "GET",
				url: "/",
				remoteAddress: "127.0.0.1",
			})
			expect(rootRes.statusCode).toBe(200)
			expect(rootRes.body).toContain("data-testid=spa")

			const assetRes = await built.app.inject({
				method: "GET",
				url: "/app.js",
				remoteAddress: "127.0.0.1",
			})
			expect(assetRes.statusCode).toBe(200)
			expect(assetRes.body).toContain("static asset")

			const deepRes = await built.app.inject({
				method: "GET",
				url: "/resources/123/edit",
				remoteAddress: "127.0.0.1",
			})
			expect(deepRes.statusCode).toBe(200)
			expect(deepRes.body).toContain("data-testid=spa")

			// API/trpc routes are unaffected by the SPA fallback.
			const health = await built.app.inject({
				method: "GET",
				url: "/health",
				remoteAddress: "127.0.0.1",
			})
			expect(health.statusCode).toBe(200)
			expect(health.json()).toEqual({ ok: true })
		} finally {
			await built.close()
		}
	})
})
describe("read-only archive mode", () => {
	let root: string
	let built: BuiltServer
	let roDb: ReturnType<typeof openDb>

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "app-ro-"))
		ensureBootstrapVersion(root)

		const liveDbPath = join(root, "app.sqlite")
		const db = openDb(liveDbPath)
		db.runMigrations()
		const passwordHash = await hashPassword("hunter2")
		db.db
			.insert(schema.auth)
			.values({ singleton: 1, passwordHash, updatedAt: Date.now() })
			.run()

		// Publish version 2 so version 1 becomes an archive
		const versionSvc = createVersionService({
			db,
			storageRoot: root,
			readOnly: false,
		})
		versionSvc.create()
		versionSvc.switchTo(1)
		db.close()

		// Open a read-only clone of version 1
		const clonePath = stageViewCloneDb(root, 1)
		roDb = openDb(clonePath, { readonly: true })

		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			STORAGE_ROOT: root,
		})
		const paths = createStoragePaths({
			root,
			activeVersion: 1,
			latestVersion: 2,
		})
		built = await buildServer({
			env,
			dbHandles: roDb,
			storagePaths: paths,
			readOnly: true,
		})
		await built.app.ready()
	})

	afterEach(async () => {
		await built.close()
		roDb.close()
		rmSync(root, { recursive: true, force: true })
	})

	async function loginCookie(): Promise<string> {
		const login = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			payload: { password: "hunter2" },
		})
		expect(login.statusCode).toBe(200)
		const cookieLine = firstSetCookie(login.headers["set-cookie"])
		const headerPart = cookieLine.split(";")[0]
		assertString(headerPart)
		return headerPart
	}

	test("tRPC mutation is blocked with FORBIDDEN", async () => {
		const cookie = await loginCookie()
		// resource.create is a mutation; should be rejected in read-only mode
		const res = await built.app.inject({
			method: "POST",
			url: "/trpc/resource.create",
			remoteAddress: "127.0.0.1",
			headers: { cookie, "content-type": "application/json" },
			payload: JSON.stringify({ json: { name: "should-fail" } }),
		})
		expect(res.statusCode).toBe(403)
		const body = res.json()
		expect(body.error?.message).toMatch(/read-only archive/)
	})

	test("tRPC query remains available", async () => {
		const cookie = await loginCookie()
		const res = await built.app.inject({
			method: "GET",
			url: "/trpc/resource.list",
			remoteAddress: "127.0.0.1",
			headers: { cookie },
		})
		expect(res.statusCode).toBe(200)
	})

	test("version.switchTo mutation is allowed even in read-only mode", async () => {
		const cookie = await loginCookie()
		const res = await built.app.inject({
			method: "POST",
			url: "/trpc/version.switchTo",
			remoteAddress: "127.0.0.1",
			headers: { cookie, "content-type": "application/json" },
			payload: JSON.stringify({ json: { version: 2 } }),
		})
		// Should NOT be 403; it may be 200 (success) or another non-FORBIDDEN code
		expect(res.statusCode).not.toBe(403)
	})

	test("HTTP character image upload is blocked in read-only mode", async () => {
		const cookie = await loginCookie()
		const res = await built.app.inject({
			method: "PUT",
			url: "/api/characters/char-1/images/avatar",
			remoteAddress: "127.0.0.1",
			headers: {
				cookie,
				"content-type": "application/octet-stream",
				"x-filename": "avatar.jpg",
			},
			payload: Buffer.from("not-an-image"),
		})
		expect(res.statusCode).toBe(403)
		expect(res.json().error).toMatch(/read-only archive/)
	})

	test("HTTP character image delete is blocked in read-only mode", async () => {
		const cookie = await loginCookie()
		const res = await built.app.inject({
			method: "DELETE",
			url: "/api/characters/char-1/images/avatar",
			remoteAddress: "127.0.0.1",
			headers: { cookie },
		})
		expect(res.statusCode).toBe(403)
		expect(res.json().error).toMatch(/read-only archive/)
	})

	test("HTTP ordered upload is blocked in read-only mode", async () => {
		const cookie = await loginCookie()
		const res = await built.app.inject({
			method: "POST",
			url: "/api/uploads/ordered",
			remoteAddress: "127.0.0.1",
			headers: { cookie, "content-type": "application/json" },
			payload: JSON.stringify({}),
		})
		expect(res.statusCode).toBe(403)
		expect(res.json().error).toMatch(/read-only archive/)
	})

	test("bulk-source.zip download is still reachable in read-only mode", async () => {
		const cookie = await loginCookie()
		const res = await built.app.inject({
			method: "POST",
			url: "/api/resources/bulk-source.zip",
			remoteAddress: "127.0.0.1",
			headers: { cookie, "content-type": "application/json" },
			payload: JSON.stringify({
				ids: ["res-1"],
				dateStamp: "2024-01-01",
			}),
		})
		// The unknown resource causes a 404, but the request must NOT be
		// blocked at the read-only middleware (which would return 403).
		expect(res.statusCode).not.toBe(403)
		expect(res.statusCode).toBe(404)
	})

	test("read-only safe GET routes are not blocked", async () => {
		const cookie = await loginCookie()
		const routes = [
			{ method: "GET", url: "/api/characters/char-1/images/avatar" },
			{ method: "GET", url: "/api/characters/char-1/thumb/avatar" },
			{ method: "GET", url: "/api/resources/res-1/source.zip" },
			{ method: "GET", url: "/api/resources/res-1/files/foo.png" },
			{ method: "GET", url: "/api/uploads/staged/file-1/preview" },
			{ method: "GET", url: "/api/cache/trash" },
			{ method: "GET", url: "/api/resources/res-1/cover" },
		]
		for (const route of routes) {
			const res = await built.app.inject({
				method: route.method as "GET",
				url: route.url,
				remoteAddress: "127.0.0.1",
				headers: { cookie },
			})
			expect(res.statusCode, `${route.method} ${route.url}`).not.toBe(403)
		}
	})

	test("read-only safe POST routes are not blocked", async () => {
		const cookie = await loginCookie()
		const routes = [
			{
				method: "POST",
				url: "/api/upload-previews",
				headers: { cookie, "content-type": "multipart/form-data" },
			},
		]
		for (const route of routes) {
			const res = await built.app.inject({
				method: route.method as "POST",
				url: route.url,
				remoteAddress: "127.0.0.1",
				headers: route.headers,
			})
			expect(res.statusCode, `${route.method} ${route.url}`).not.toBe(403)
		}
	})

	test("unmarked write routes are blocked in read-only mode", async () => {
		const cookie = await loginCookie()
		const routes = [
			{ method: "PUT", url: "/api/resources/res-1/cover" },
			{ method: "DELETE", url: "/api/resources/res-1/cover" },
			{ method: "POST", url: "/api/uploads/archive" },
			{ method: "POST", url: "/api/precache" },
			{ method: "POST", url: "/api/precache/abort" },
			{ method: "POST", url: "/api/plugin-upload" },
			{ method: "DELETE", url: "/api/cache" },
		]
		for (const route of routes) {
			const res = await built.app.inject({
				method: route.method as "POST" | "PUT" | "DELETE",
				url: route.url,
				remoteAddress: "127.0.0.1",
				headers: { cookie },
			})
			expect(res.statusCode, `${route.method} ${route.url}`).toBe(403)
			expect(res.json().error, `${route.method} ${route.url}`).toMatch(
				/read-only archive/,
			)
		}
	})
})

describe("FORCE_HTTPS", () => {
	let built: BuiltServer
	let dbh: ReturnType<typeof openDb>
	let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
	let consoleInfoSpy: ReturnType<typeof vi.spyOn> | undefined

	beforeEach(async () => {
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
		dbh = openDb(":memory:")
		dbh.runMigrations()
		const passwordHash = await hashPassword("hunter2")
		dbh.db
			.insert(schema.auth)
			.values({ singleton: 1, passwordHash, updatedAt: Date.now() })
			.run()
		const env = loadEnv({
			NODE_ENV: "test",
			LOG_LEVEL: "silent",
			FORCE_HTTPS: "true",
		} satisfies NodeJS.ProcessEnv)
		built = await buildServer({ env, dbHandles: dbh })
		await built.app.ready()
	})

	afterEach(async () => {
		await built.close()
		dbh.close()
		consoleWarnSpy?.mockRestore()
		consoleInfoSpy?.mockRestore()
	})

	test("plain HTTP login is rejected with 426", async () => {
		const res = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			payload: { password: "hunter2" },
		})
		expect(res.statusCode).toBe(426)
		expect(res.json()).toEqual({ error: "HTTPS required" })
	})

	test("plain HTTP status check is rejected with 426", async () => {
		const res = await built.app.inject({
			method: "GET",
			url: "/auth/status",
			remoteAddress: "127.0.0.1",
		})
		expect(res.statusCode).toBe(426)
	})

	test("login behind TLS-terminating proxy succeeds and sets Secure cookie", async () => {
		const res = await built.app.inject({
			method: "POST",
			url: "/auth/login",
			remoteAddress: "127.0.0.1",
			headers: { "x-forwarded-proto": "https" },
			payload: { password: "hunter2" },
		})
		expect(res.statusCode).toBe(200)
		const cookieLine = firstSetCookie(res.headers["set-cookie"])
		expect(cookieLine).toMatch(/Secure/i)
	})
})
