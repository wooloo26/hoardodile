import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
	PluginDefinition,
	ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import { DomainError } from "@hoardodile/shared"
import { eq } from "drizzle-orm"
import { createPluginHooks } from "src/domain/plugin/hooks.ts"
import { buildRegistry } from "src/domain/plugin/loader.ts"
import {
	getMetaBuildCalls,
	getMetaBuildPeak,
	resetMetaBuildTracking,
	setMetaBuildDelay,
	TEST_BUILTIN_ID,
	TEST_BUILTIN_MANIFEST,
	trackMetaBuild,
} from "./test-registry.ts"
import { seedResourceArtifact } from "./test-seed.ts"

// 鈹€鈹€ Inline plugin stubs (replaces deleted in-memory-plugins.ts) 鈹€鈹€鈹€

function createMangaStub(): PluginDefinition {
	return {
		detect: async (api: ResourceAPI) => {
			const entries = await api.listFiles()
			const hasImage = entries.some((n) =>
				/\.(jpg|jpeg|png|webp|gif)$/i.test(n),
			)
			return hasImage ? { ok: true } : { ok: false, reasons: ["page-image"] }
		},
	}
}

function createNovelStub(): PluginDefinition {
	return {
		detect: async (api: ResourceAPI) => {
			const entries = await api.listFiles()
			const hasText = entries.some((n) => /\.(txt|md|epub)$/i.test(n))
			return hasText ? { ok: true } : { ok: false, reasons: ["text-file"] }
		},
	}
}

function extname(filename: string): string {
	const dot = filename.lastIndexOf(".")
	if (dot === -1) return ""
	return filename.slice(dot).toLowerCase()
}

function inferType(filename: string): "image" | "video" | "audio" | undefined {
	const ext = extname(filename)
	if (
		ext === ".jpg" ||
		ext === ".jpeg" ||
		ext === ".png" ||
		ext === ".webp" ||
		ext === ".gif" ||
		ext === ".bmp" ||
		ext === ".avif"
	)
		return "image"
	if (
		ext === ".mp4" ||
		ext === ".webm" ||
		ext === ".mov" ||
		ext === ".mkv" ||
		ext === ".m4v" ||
		ext === ".avi"
	)
		return "video"
	if (
		ext === ".mp3" ||
		ext === ".flac" ||
		ext === ".ogg" ||
		ext === ".m4a" ||
		ext === ".wav" ||
		ext === ".opus"
	)
		return "audio"
	return undefined
}

function createGalleryStub(): PluginDefinition<{
	readonly file: { readonly filename: string; readonly type?: string }
}> {
	return {
		detect: async () => ({ ok: true }),
		sourceMeta: async () =>
			trackMetaBuild(async () => ({
				coverKind: "image" as const,
				width: 1,
				height: 1,
			})),
		listFiles: async (api: ResourceAPI) => {
			const files = await api.listFiles()
			const sorted = [...files].sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
			)
			return sorted.map((filename) => {
				const type = inferType(filename)
				return type === undefined ? { filename } : { filename, type }
			})
		},
	}
}

const IN_MEMORY_STUBS = [
	{
		id: "c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
		manifest: {
			id: "c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
			name: "Manga",
			description: "",
			version: "1.0.0",
			permissions: {
				sourceMeta: false,
				searchMeta: false,
				danmaku: false,
				message: false,
				preferences: false,
				node: false,
			},
		},
		priority: 50,
		plugin: createMangaStub(),
	},
	{
		id: "b3bfba9e-b14b-42b1-8bf9-147251317dc0",
		manifest: {
			id: "b3bfba9e-b14b-42b1-8bf9-147251317dc0",
			name: "Novel",
			description: "",
			version: "1.0.0",
			permissions: {
				sourceMeta: false,
				searchMeta: false,
				danmaku: false,
				message: false,
				preferences: false,
				node: false,
			},
		},
		priority: 60,
		plugin: createNovelStub(),
	},
]

import { type DbHandles, openDb } from "src/infra/db/connection.ts"
import {
	createStoragePaths,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { resources } from "./schema.ts"
import { createResourceService, type ResService } from "./service.ts"

function createTestRegistry() {
	return buildRegistry([
		{
			id: TEST_BUILTIN_ID,
			manifest: TEST_BUILTIN_MANIFEST,
			enabled: true,
			priority: Number.MAX_SAFE_INTEGER,
			pinned: false,
			color: "",
			missing: false,
			builtin: true,
			dev: false,
			plugin: createGalleryStub(),
		},
		...IN_MEMORY_STUBS.map((def) => ({
			id: def.id,
			manifest: def.manifest,
			enabled: true,
			priority: def.priority,
			pinned: false,
			color: "",
			missing: false,
			builtin: false,
			dev: false,
			plugin: def.plugin,
		})),
	])
}

function createTestHooks() {
	return createPluginHooks({ getRegistry: () => createTestRegistry() })
}

describe("resource service", () => {
	let root: string
	let dbh: DbHandles
	let paths: StoragePaths
	let svc: ResService

	beforeEach(() => {
		resetMetaBuildTracking()
		root = mkdtempSync(join(tmpdir(), "app-resource-"))
		dbh = openDb(":memory:")
		dbh.runMigrations()
		paths = createStoragePaths({ root })
		svc = createResourceService({
			db: dbh.db,
			paths,
			pluginHooks: createTestHooks(),
			readOnly: { current: false },
		})
	})

	afterEach(async () => {
		await svc.drainMetaQueue()
		dbh.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("create persists the row and creates the resource folder", async () => {
		const r = await svc.create({ name: "Hello" })
		expect(r.id).toBeTruthy()
		expect(r.name).toBe("Hello")
		expect(r.intro).toBe("")
		expect(r.tagIds).toEqual([])
		expect(r.charIds).toEqual([])
		expect(existsSync(paths.active.resource(r.id))).toBe(true)
	})

	test("full lifecycle: create 鈫?list 鈫?detail 鈫?edit 鈫?soft 鈫?trash 鈫?restore 鈫?soft 鈫?hard", async () => {
		const a = await svc.create({ name: "alpha" })
		const b = await svc.create({ name: "beta" })
		expect((await svc.list({})).total).toBe(2)
		expect((await svc.detail(a.id)).name).toBe("alpha")

		const edited = await svc.update({
			id: a.id,
			name: "alpha-updated",
			intro: "notes",
		})
		expect(edited.name).toBe("alpha-updated")
		expect(edited.intro).toBe("notes")

		const trashed = await svc.softDelete(a.id)
		expect(trashed.deletedAt).toBeTypeOf("number")
		expect((await svc.list({})).rows.map((r) => r.id)).toEqual([b.id])
		expect((await svc.trashList({})).rows.map((r) => r.id)).toEqual([a.id])

		const restored = await svc.restore(a.id)
		expect(restored.deletedAt).toBeUndefined()
		expect((await svc.list({})).total).toBe(2)

		await svc.softDelete(a.id)
		const result = await svc.hardDelete(a.id)
		expect(result.trashedPath.startsWith(paths.local.trash())).toBe(true)
		expect(result.trashedPath).toContain(a.id)
		expect(existsSync(paths.active.resource(a.id))).toBe(false)
		expect(existsSync(result.trashedPath)).toBe(true)
		expect(existsSync(paths.active.deletedMarker("resources", a.id))).toBe(
			false,
		)
		await expect(svc.detail(a.id)).rejects.toThrow(DomainError)
	})

	test("soft delete leaves the resource folder byte-identical on disk", async () => {
		const r = await svc.create({ name: "keep-me" })
		const file = join(paths.active.resource(r.id), "payload.bin")
		const contents = Buffer.from([0, 1, 2, 3, 4, 5])
		writeFileSync(file, contents)
		await svc.softDelete(r.id)
		expect(existsSync(file)).toBe(true)
		const after = readFileSync(file)
		expect(after.equals(contents)).toBe(true)
	})

	test("hard delete refuses unless the row is already soft-deleted", async () => {
		const r = await svc.create({ name: "still-live" })
		await expect(svc.hardDelete(r.id)).rejects.toBeInstanceOf(DomainError)
		expect(existsSync(paths.active.resource(r.id))).toBe(true)
		expect((await svc.detail(r.id)).id).toBe(r.id)
	})

	test("restore refuses on a live row; soft-delete refuses on an already-trashed row", async () => {
		const r = await svc.create({ name: "double" })
		await expect(svc.restore(r.id)).rejects.toThrow(DomainError)
		await svc.softDelete(r.id)
		await expect(svc.softDelete(r.id)).rejects.toThrow(DomainError)
	})

	test("search excludes soft-deleted rows and re-includes them after restore", async () => {
		const a = await svc.create({ name: "Apple" })
		const b = await svc.create({ name: "Banana" })
		expect((await svc.list({ query: "apple" })).rows.map((r) => r.id)).toEqual([
			a.id,
		])
		expect((await svc.list({ query: "BANANA" })).rows.map((r) => r.id)).toEqual(
			[b.id],
		)
		await svc.softDelete(a.id)
		expect((await svc.list({ query: "apple" })).total).toBe(0)
		expect(
			(await svc.trashList({ query: "apple" })).rows.map((r) => r.id),
		).toEqual([a.id])
		await svc.restore(a.id)
		expect((await svc.list({ query: "apple" })).total).toBe(1)
	})

	test("LIKE search escapes %, _, and backslash so they match literally", async () => {
		const pct = await svc.create({ name: "100% complete" })
		await svc.create({ name: "100 complete" })
		const under = await svc.create({ name: "a_b pair" })
		await svc.create({ name: "axb pair" })
		const winPath = await svc.create({
			name: "C:\\app\\x.png",
		})

		expect((await svc.list({ query: "100%" })).rows.map((r) => r.id)).toEqual([
			pct.id,
		])
		expect((await svc.list({ query: "a_b" })).rows.map((r) => r.id)).toEqual([
			under.id,
		])
		expect((await svc.list({ query: "\\app" })).rows.map((r) => r.id)).toEqual([
			winPath.id,
		])
	})

	test("search matches either name or intro", async () => {
		const a = await svc.create({
			name: "vacation",
			intro: "beach sand",
		})
		const b = await svc.create({
			name: "receipts",
			intro: "vacation trip",
		})
		const ids = (await svc.list({ query: "vacation", searchIntro: true })).rows
			.map((r) => r.id)
			.sort()
		expect(ids).toEqual([a.id, b.id].sort())
	})

	test("list paginates in createdAt DESC order", async () => {
		const ids: string[] = []
		let t = 1_000
		const svcTs = createResourceService({
			db: dbh.db,
			paths,
			pluginHooks: createTestHooks(),
			readOnly: { current: false },
			now: () => {
				t += 1
				return t
			},
		})
		for (const name of ["a", "b", "c", "d", "e"]) {
			ids.push((await svcTs.create({ name })).id)
		}
		const page1 = await svcTs.list({ size: 2, page: 1 })
		const page2 = await svcTs.list({ size: 2, page: 2 })
		expect(page1.total).toBe(5)
		expect(page1.rows.map((r) => r.id)).toEqual([ids[4], ids[3]])
		expect(page2.rows.map((r) => r.id)).toEqual([ids[2], ids[1]])
	})

	test("detail on a missing id throws a typed NOT_FOUND domain error", async () => {
		try {
			await svc.detail("nope")
			expect.unreachable("detail should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(DomainError)
			if (err instanceof DomainError) {
				expect(err.code).toBe("NOT_FOUND")
				expect(err.kind).toBe("resource.not_found")
			}
		}
	})

	test("setContentType returns structured failure when detector rejects", async () => {
		const r = await svc.create({ name: "g" })
		const result = await svc.setContentPluginId(
			r.id,
			"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
		)
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.failure.reasons.length).toBeGreaterThan(0)
		}
		expect((await svc.detail(r.id)).contentPluginId).toBeNull()
	})

	test("setContentType commits when the detector passes", async () => {
		const r = await svc.create({ name: "m" })
		await seedResourceArtifact({ db: dbh, paths }, r.id, [
			{ name: "page.png", bytes: Buffer.alloc(0) },
		])
		const result = await svc.setContentPluginId(
			r.id,
			"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
		)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.resource.contentPluginId).toBe(
				"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
			)
		}
		expect((await svc.detail(r.id)).contentPluginId).toBe(
			"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
		)
	})

	test("setContentType is idempotent when the type is unchanged", async () => {
		const r = await svc.create({ name: "g2" })
		const result = await svc.setContentPluginId(r.id, TEST_BUILTIN_ID)
		expect(result.ok).toBe(true)
	})

	test("listFiles returns top-level files only, sorted, without directories or dotfiles", async () => {
		const r = await svc.create({
			name: "list",
			contentPluginId: TEST_BUILTIN_ID,
		})
		// Seed three image entries in a STORED `source.hoard`. Dotfiles and
		// sub-paths are explicitly not part of the current on-disk shape
		// any more (every artifact is a single `source.hoard`), so this test
		// just verifies the natural sort.
		await seedResourceArtifact({ db: dbh, paths }, r.id, [
			{ name: "b.png", bytes: Buffer.alloc(0) },
			{ name: "a.png", bytes: Buffer.alloc(0) },
			{ name: "10.png", bytes: Buffer.alloc(0) },
		])
		const names = (await svc.listFiles(r.id)) as {
			readonly filename: string
			readonly type?: string
		}[]
		expect(names.map((f) => f.filename)).toEqual(["10.png", "a.png", "b.png"])
		// The fixture does not wire real probes, so width/height stay absent.
		expect(names.every((f) => f.type === "image")).toBe(true)
	})

	test("listFiles returns empty array for a brand-new gallery resource (no throw)", async () => {
		const r = await svc.create({ name: "empty" })
		expect(await svc.listFiles(r.id)).toEqual([])
	})

	test("rebuildPluginMeta is a no-op when no builder is configured", async () => {
		const r = await svc.create({ name: "no-build" })
		await svc.rebuildPluginMeta(r.id)
		expect((await svc.detail(r.id)).sourceMeta).toBeUndefined()
	})

	test("rebuildPluginMeta persists the builder result", async () => {
		const r = await svc.create({
			name: "with-build",
			contentPluginId: TEST_BUILTIN_ID,
		})
		await svc.rebuildPluginMeta(r.id)
		expect((await svc.detail(r.id)).sourceMeta).toEqual({
			coverKind: "image",
			width: 1,
			height: 1,
		})
	})

	test("detail awaits meta rebuild when sourceMeta is missing", async () => {
		const r = await svc.create({
			name: "lazy",
			contentPluginId: TEST_BUILTIN_ID,
		})
		const resource = await svc.detail(r.id)
		expect(getMetaBuildCalls()).toBeGreaterThanOrEqual(1)
		expect(resource.sourceMeta).toEqual({
			coverKind: "image",
			width: 1,
			height: 1,
		})
	})

	test("source-meta queue dedupes concurrent rebuilds for the same id", async () => {
		resetMetaBuildTracking()
		setMetaBuildDelay(5)
		const r = await svc.create({
			name: "dedupe",
			contentPluginId: TEST_BUILTIN_ID,
		})
		// Fire a burst; only one job should be in flight at a time per id.
		for (let i = 0; i < 5; i++) {
			svc.enqueuePluginMetaRebuild(r.id)
		}
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(getMetaBuildPeak()).toBe(1)
	})

	test("setContentType clears derived artifacts on transition", async () => {
		const r = await svc.create({ name: "ct" })
		await seedResourceArtifact({ db: dbh, paths }, r.id, [
			{ name: "p.png", bytes: Buffer.alloc(0) },
		])
		const result = await svc.setContentPluginId(
			r.id,
			"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
		)
		expect(result.ok).toBe(true)
		expect((await svc.detail(r.id)).contentPluginId).toBe(
			"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf",
		)
	})

	test("hardDelete clears derived artifacts and moves versions folder to host trash", async () => {
		const r = await svc.create({ name: "purge" })
		// Simulate a previously-rendered derived artifact.
		const { mkdirSync } = await import("node:fs")
		const localResourceDir = paths.local.resource(r.id)
		mkdirSync(localResourceDir, { recursive: true })
		const thumbFile = join(localResourceDir, "preview.webp")
		writeFileSync(thumbFile, "")
		await svc.softDelete(r.id)
		const result = await svc.hardDelete(r.id)
		expect(result.trashedPath.startsWith(paths.local.trash())).toBe(true)
		expect(existsSync(result.trashedPath)).toBe(true)
		expect(existsSync(paths.active.resource(r.id))).toBe(false)
		expect(existsSync(paths.active.deletedMarker("resources", r.id))).toBe(
			false,
		)
		expect(existsSync(thumbFile)).toBe(false)
	})

	test("hardDelete writes .deleted only when fileVersion points at a past archive", async () => {
		paths = createStoragePaths({ root, latestVersion: 2 })
		svc = createResourceService({
			db: dbh.db,
			paths,
			pluginHooks: createTestHooks(),
			readOnly: { current: false },
		})
		const r = await svc.create({ name: "legacy" })
		dbh.db
			.update(resources)
			.set({ fileVersion: 1 })
			.where(eq(resources.id, r.id))
			.run()
		await svc.softDelete(r.id)
		const result = await svc.hardDelete(r.id)
		expect(result.trashedPath).toContain(".deleted")
		expect(existsSync(paths.latest.deletedMarker("resources", r.id))).toBe(true)
	})

	test("softDeleteMany moves live rows and collects already-trashed ids", async () => {
		const a = await svc.create({ name: "a" })
		const b = await svc.create({ name: "b" })
		await svc.softDelete(b.id)
		const r = await svc.softDeleteMany([a.id, b.id, a.id])
		expect(r.okIds).toEqual([a.id])
		expect(r.failures).toHaveLength(1)
		expect(r.failures[0]?.id).toBe(b.id)
		expect((await svc.list({})).total).toBe(0)
		const trashIds = (await svc.trashList({})).rows.map((x) => x.id).sort()
		expect(trashIds).toEqual([a.id, b.id].sort())
	})

	test("hardDeleteMany purges trashed rows and collects live ids as failures", async () => {
		const a = await svc.create({ name: "a" })
		const b = await svc.create({ name: "b" })
		await svc.softDelete(a.id)
		const r = await svc.hardDeleteMany([a.id, b.id])
		expect(r.okIds).toEqual([a.id])
		expect(r.failures).toHaveLength(1)
		expect(r.failures[0]?.id).toBe(b.id)
		await expect(svc.detail(a.id)).rejects.toThrow(DomainError)
		expect((await svc.detail(b.id)).id).toBe(b.id)
	})

	describe("cover across versions", () => {
		test("setCover bumps coverVersion to latestVersion", async () => {
			const r = await svc.create({ name: "cover-bump" })
			await svc.setCover(r.id, ".jpg", Buffer.from("cover1"))
			await new Promise((resolve) => setTimeout(resolve, 100))
			const row = dbh.db
				.select()
				.from(resources)
				.where(eq(resources.id, r.id))
				.get()
			expect(row?.coverVersion).toBe(1)
			expect((await svc.detail(r.id)).coverMeta).toBeTruthy()
		})

		test("setCover rejects non-image extension", async () => {
			const r = await svc.create({ name: "video-cover" })
			await expect(
				svc.setCover(r.id, ".mp4", Buffer.from("fake-video")),
			).rejects.toThrow(DomainError)
		})

		test("legacy resource can update cover after version publish", async () => {
			// Create and cover a resource in version 1
			const r = await svc.create({ name: "legacy-cover" })
			await svc.setCover(r.id, ".jpg", Buffer.from("old-cover"))
			expect(existsSync(join(paths.active.resource(r.id), ".cover.jpg"))).toBe(
				true,
			)

			// Simulate a version publish: current becomes 2
			paths = createStoragePaths({ root, latestVersion: 2 })
			svc = createResourceService({
				db: dbh.db,
				paths,
				pluginHooks: createTestHooks(),
				readOnly: { current: false },
			})

			// Mark the resource as legacy (source lives in v1)
			dbh.db
				.update(resources)
				.set({ fileVersion: 1 })
				.where(eq(resources.id, r.id))
				.run()

			// Cover update should succeed and move to current version
			await svc.setCover(r.id, ".png", Buffer.from("new-cover"))

			await new Promise((resolve) => setTimeout(resolve, 100))

			const row = dbh.db
				.select()
				.from(resources)
				.where(eq(resources.id, r.id))
				.get()
			expect(row?.coverVersion).toBe(2)
			expect((await svc.detail(r.id)).coverMeta).toBeTruthy()

			// findCover resolves from the new version
			const coverPath = await svc.findCover(r.id)
			expect(coverPath).toContain(".cover.png")
			expect(coverPath?.startsWith(paths.atVersion(2).resource(r.id))).toBe(
				true,
			)

			// Old cover in the archived version is untouched
			expect(
				existsSync(join(paths.atVersion(1).resource(r.id), ".cover.jpg")),
			).toBe(true)

			// Allow background meta-ops queue to settle before teardown
			await new Promise((r) => setTimeout(r, 100))
		})

		test("legacy resource can clear cover after version publish", async () => {
			const r = await svc.create({ name: "legacy-clear" })
			await svc.setCover(r.id, ".jpg", Buffer.from("old-cover"))

			paths = createStoragePaths({ root, latestVersion: 2 })
			svc = createResourceService({
				db: dbh.db,
				paths,
				pluginHooks: createTestHooks(),
				readOnly: { current: false },
			})
			dbh.db
				.update(resources)
				.set({ fileVersion: 1 })
				.where(eq(resources.id, r.id))
				.run()

			await svc.clearCover(r.id)

			const row = dbh.db
				.select()
				.from(resources)
				.where(eq(resources.id, r.id))
				.get()
			expect(row?.coverVersion).toBe(2)
			expect((await svc.detail(r.id)).coverMeta).toBeUndefined()

			// The current-version cover file is gone
			expect(
				existsSync(join(paths.atVersion(2).resource(r.id), ".cover.jpg")),
			).toBe(false)
			// Archived cover remains
			expect(
				existsSync(join(paths.atVersion(1).resource(r.id), ".cover.jpg")),
			).toBe(true)

			// Allow background meta-ops queue to settle before teardown
			await new Promise((r) => setTimeout(r, 100))
		})
	})
})
