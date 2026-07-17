import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadEnv } from "src/config/env.ts"
import { hashPassword } from "src/domain/auth/password.ts"
import { seedResourceArtifact } from "src/domain/res/test-seed.ts"
import { openDb, schema } from "src/infra/db/connection.ts"
import { createStoragePaths } from "src/infra/storage/paths.ts"
import { type BuiltServer, buildServer } from "src/server.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import yauzl from "yauzl"
import { parseByteRange } from "./res-files.ts"

const REMOTE_ADDR = "127.0.0.1"
const PAYLOAD = Buffer.from("The quick brown fox jumps over the lazy dog.")
const BULK_PACK_DATE_STAMP = "2024-06-12"

async function bootstrap(
	storageRoot: string,
	envOverrides?: Partial<NodeJS.ProcessEnv>,
): Promise<BuiltServer> {
	const env = loadEnv({
		NODE_ENV: "test",
		LOG_LEVEL: "silent",
		...envOverrides,
	} as NodeJS.ProcessEnv)
	const db = openDb(":memory:")
	db.runMigrations()
	const passwordHash = await hashPassword("hunter2")
	db.db
		.insert(schema.auth)
		.values({ singleton: 1, passwordHash, updatedAt: Date.now() })
		.run()
	return buildServer({
		env,
		dbHandles: db,
		storagePaths: createStoragePaths({ root: storageRoot }),
	})
}

async function login(server: BuiltServer): Promise<string> {
	const res = await server.app.inject({
		method: "POST",
		url: "/auth/login",
		remoteAddress: REMOTE_ADDR,
		payload: { password: "hunter2" },
	})
	const raw = res.headers["set-cookie"]
	const line = Array.isArray(raw) ? raw[0] : raw
	if (typeof line !== "string") throw new Error("no cookie")
	const head = line.split(";")[0]
	if (head === undefined) throw new Error("malformed cookie")
	return head
}

async function zipEntryNames(zipBuffer: Buffer): Promise<string[]> {
	const names: string[] = []
	await new Promise<void>((resolve, reject) => {
		yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
			if (err !== null || zipfile === undefined) {
				reject(err ?? new Error("missing zipfile"))
				return
			}
			zipfile.readEntry()
			zipfile.on("entry", (entry: { fileName: string }) => {
				names.push(entry.fileName.replace(/\\/g, "/"))
				zipfile.readEntry()
			})
			zipfile.on("end", () => resolve())
			zipfile.on("error", reject)
		})
	})
	return names.sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
	)
}

async function createResourceId(server: BuiltServer): Promise<string> {
	const resource = await server.app.resService.create({ name: "r" })
	return resource.id
}

describe("resource files HTTP", () => {
	let root: string
	let built: BuiltServer
	let cookie: string
	let id: string

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "app-files-"))
		built = await bootstrap(root)
		await built.app.ready()
		cookie = await login(built)
		id = await createResourceId(built)
	})

	afterEach(async () => {
		await built.close()
		built.db.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("GET returns 200 with full body for a seeded file", async () => {
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			id,
			[{ name: "a.png", bytes: PAYLOAD }],
		)

		const res = await built.app.inject({
			method: "GET",
			url: `/api/resources/${id}/files/a.png`,
			remoteAddress: REMOTE_ADDR,
			headers: { cookie },
		})
		expect(res.statusCode).toBe(200)
		expect(res.headers["accept-ranges"]).toBe("bytes")
		expect(res.headers["content-type"]).toBe("image/png")
		expect(res.headers["content-length"]).toBe(String(PAYLOAD.length))
		expect(Buffer.from(res.rawPayload)).toEqual(PAYLOAD)
	})

	test("GET with Range returns 206 and correct slice + Content-Range", async () => {
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			id,
			[{ name: "a.png", bytes: PAYLOAD }],
		)

		const res = await built.app.inject({
			method: "GET",
			url: `/api/resources/${id}/files/a.png`,
			remoteAddress: REMOTE_ADDR,
			headers: { cookie, range: "bytes=4-10" },
		})
		expect(res.statusCode).toBe(206)
		expect(res.headers["content-range"]).toBe(`bytes 4-10/${PAYLOAD.length}`)
		expect(res.headers["content-length"]).toBe("7")
		expect(Buffer.from(res.rawPayload)).toEqual(PAYLOAD.subarray(4, 11))
	})

	test("GET for unknown file returns 404", async () => {
		const res = await built.app.inject({
			method: "GET",
			url: `/api/resources/${id}/files/nope.png`,
			remoteAddress: REMOTE_ADDR,
			headers: { cookie },
		})
		expect(res.statusCode).toBe(404)
	})

	test("GET file sets Content-Disposition with UTF-8 filename*", async () => {
		const rid = (await built.app.resService.create({ name: "模型甲" })).id
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			rid,
			[{ name: "blob.bin", bytes: PAYLOAD }],
		)

		const res = await built.app.inject({
			method: "GET",
			url: `/api/resources/${rid}/files/blob.bin`,
			remoteAddress: REMOTE_ADDR,
			headers: { cookie },
		})
		expect(res.statusCode).toBe(200)
		const cd = res.headers["content-disposition"]
		expect(cd).toContain("attachment")
		expect(cd).toContain("filename*=")
		expect(cd).toContain(encodeURIComponent("模型甲.bin"))
	})

	test("GET source.zip sets Content-Disposition and streams a zip", async () => {
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			id,
			[{ name: "doc.txt", bytes: PAYLOAD }],
		)

		const res = await built.app.inject({
			method: "GET",
			url: `/api/resources/${id}/source.zip`,
			remoteAddress: REMOTE_ADDR,
			headers: { cookie },
		})
		expect(res.statusCode).toBe(200)
		expect(res.headers["content-type"]).toBe("application/zip")
		const cd = res.headers["content-disposition"]
		expect(cd).toContain("attachment")
		expect(cd).toContain("filename*=")
		expect(cd).toContain(encodeURIComponent("r.zip"))
		const buf = Buffer.from(res.rawPayload)
		expect(buf.subarray(0, 2).toString("ascii")).toBe("PK")
		const entries = await zipEntryNames(buf)
		// Single-file resources are wrapped in source.hoard; the download
		// endpoint streams the hoard archive byte-for-byte.
		expect(entries).toContain("doc.txt")
	})

	test("POST bulk-source.zip merges sources without nested zip entries", async () => {
		const idA = (await built.app.resService.create({ name: "Pack-Alpha" })).id
		const idB = (await built.app.resService.create({ name: "Pack-Beta" })).id
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			idA,
			[{ name: "one.txt", bytes: PAYLOAD }],
		)
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			idB,
			[{ name: "two.txt", bytes: PAYLOAD.subarray(0, 4) }],
		)

		const res = await built.app.inject({
			method: "POST",
			url: "/api/resources/bulk-source.zip",
			remoteAddress: REMOTE_ADDR,
			headers: {
				cookie,
				"content-type": "application/json",
			},
			payload: JSON.stringify({
				ids: [idA, idB],
				dateStamp: BULK_PACK_DATE_STAMP,
			}),
		})
		expect(res.statusCode).toBe(200)
		expect(res.headers["content-type"]).toBe("application/zip")
		expect(res.headers["content-disposition"]).toContain(
			"hoardodile-resources-",
		)
		const buf = Buffer.from(res.rawPayload)
		const entries = await zipEntryNames(buf)
		// `.hoard` artifacts are never nested as entries; only their
		// contents end up inside the bulk pack.
		expect(entries.some((e) => e.endsWith(".hoard"))).toBe(false)
		expect(entries.some((e) => e.includes("Pack-Alpha/one.txt"))).toBe(true)
		expect(entries.some((e) => e.includes("Pack-Beta/two.txt"))).toBe(true)
	})

	test("POST bulk-source.zip sorts by created time by default", async () => {
		const idA = (await built.app.resService.create({ name: "Pack-Alpha" })).id
		const idB = (await built.app.resService.create({ name: "Pack-Beta" })).id
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			idA,
			[{ name: "one.txt", bytes: PAYLOAD }],
		)
		await seedResourceArtifact(
			{ db: built.db, paths: built.storagePaths },
			idB,
			[{ name: "two.txt", bytes: PAYLOAD.subarray(0, 4) }],
		)

		const resDefault = await built.app.inject({
			method: "POST",
			url: "/api/resources/bulk-source.zip",
			remoteAddress: REMOTE_ADDR,
			headers: {
				cookie,
				"content-type": "application/json",
			},
			payload: JSON.stringify({
				ids: [idB, idA],
				dateStamp: BULK_PACK_DATE_STAMP,
			}),
		})
		expect(resDefault.statusCode).toBe(200)
		let entries = await zipEntryNames(Buffer.from(resDefault.rawPayload))
		expect(entries.some((e) => e.includes("Pack-Alpha/one.txt"))).toBe(true)
		expect(entries.some((e) => e.includes("Pack-Beta/two.txt"))).toBe(true)

		const resSelectionOrder = await built.app.inject({
			method: "POST",
			url: "/api/resources/bulk-source.zip",
			remoteAddress: REMOTE_ADDR,
			headers: {
				cookie,
				"content-type": "application/json",
			},
			payload: JSON.stringify({
				ids: [idB, idA],
				sortByCreated: false,
				dateStamp: BULK_PACK_DATE_STAMP,
			}),
		})
		expect(resSelectionOrder.statusCode).toBe(200)
		entries = await zipEntryNames(Buffer.from(resSelectionOrder.rawPayload))
		expect(entries.some((e) => e.includes("1-Pack-Beta/two.txt"))).toBe(true)
		expect(entries.some((e) => e.includes("2-Pack-Alpha/one.txt"))).toBe(true)
	})
})

describe("parseByteRange", () => {
	test("parses bytes=start-end", () => {
		expect(parseByteRange("bytes=0-9", 100)).toEqual({
			ok: true,
			start: 0,
			end: 9,
		})
	})

	test("caps end at totalSize-1", () => {
		expect(parseByteRange("bytes=90-200", 100)).toEqual({
			ok: true,
			start: 90,
			end: 99,
		})
	})

	test("parses bytes=start- (open-ended)", () => {
		expect(parseByteRange("bytes=50-", 100)).toEqual({
			ok: true,
			start: 50,
			end: 99,
		})
	})

	test("parses bytes=-suffix (suffix length)", () => {
		expect(parseByteRange("bytes=-10", 100)).toEqual({
			ok: true,
			start: 90,
			end: 99,
		})
	})

	test("rejects multi-range", () => {
		expect(parseByteRange("bytes=0-5,10-15", 100).ok).toBe(false)
	})

	test("rejects out-of-bounds start", () => {
		expect(parseByteRange("bytes=500-600", 100).ok).toBe(false)
	})

	test("rejects start > end", () => {
		expect(parseByteRange("bytes=50-10", 100).ok).toBe(false)
	})
})
