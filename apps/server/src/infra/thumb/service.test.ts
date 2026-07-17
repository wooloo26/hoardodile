import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import {
	createResourceService,
	type ResService,
} from "src/domain/res/service.ts"
import {
	createTestRegistry,
	TEST_BUILTIN_ID,
} from "src/domain/res/test-registry.ts"
import { seedResourceArtifact } from "src/domain/res/test-seed.ts"
import { type DbHandles, openDb } from "src/infra/db/connection.ts"
import {
	createStoragePaths,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { resolveFfmpegPaths } from "./ffmpeg.ts"
import { createThumbService, RESOURCE_LOCAL_COVER_VARIANT } from "./service.ts"

async function prepareImageResource(
	resources: ResService,
	dbh: DbHandles,
	paths: StoragePaths,
	name: string,
	png: Buffer,
): Promise<Awaited<ReturnType<ResService["create"]>>> {
	const r = await resources.create({ name })
	await seedResourceArtifact({ db: dbh, paths }, r.id, [
		{ name: "a.png", bytes: png },
	])
	await resources.setContentPluginId(r.id, TEST_BUILTIN_ID)
	// setContentPluginId enqueues async meta rebuilds that materialize zip
	// entries; drain them before thumb synthesis so test teardown cannot race.
	await resources.rebuildAllMeta(r.id)
	return r
}

async function pngBuffer(rgb: {
	r: number
	g: number
	b: number
}): Promise<Buffer> {
	return sharp({
		create: {
			width: 40,
			height: 40,
			channels: 3,
			background: rgb,
		},
	})
		.png()
		.toBuffer()
}

describe("thumb service", () => {
	let root: string
	let dbh: DbHandles
	let paths: StoragePaths
	let resources: ResService

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-local-thumbs-"))
		dbh = openDb(":memory:")
		dbh.runMigrations()
		paths = createStoragePaths({ root })
		resources = createResourceService({
			db: dbh.db,
			paths,
			pluginRegistry: createTestRegistry(),
			readOnly: { current: false },
		})
	})
	afterEach(async () => {
		dbh.close()
		sharp.cache(false)
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				rmSync(root, { recursive: true, force: true })
				return
			} catch (err) {
				if (attempt === 4) throw err
				await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
			}
		}
	})

	test("getCover synthesises an avif for an image resource", async () => {
		const png = await pngBuffer({ r: 0, g: 128, b: 255 })
		const r = await prepareImageResource(resources, dbh, paths, "img", png)

		const thumbs = createThumbService({ paths, resources })
		const result = await thumbs.getCover(r.id)
		expect(result.kind).toBe("ready")
		if (result.kind === "ready") {
			const info = await stat(result.path)
			expect(info.size).toBeGreaterThan(0)
			expect(result.path).toBe(
				paths.local.localCover("resource", r.id, RESOURCE_LOCAL_COVER_VARIANT),
			)
		}
	})

	test("N concurrent getCover calls collapse to one synth job", async () => {
		const png = await pngBuffer({ r: 255, g: 255, b: 0 })
		const r = await prepareImageResource(resources, dbh, paths, "img", png)

		let calls = 0
		const originalResolve = resources.resolveLocalCoverSource.bind(resources)
		const spiedResources: ResService = {
			...resources,
			resolveLocalCoverSource: async (id: string) => {
				calls += 1
				return originalResolve(id)
			},
		}
		const thumbs = createThumbService({ paths, resources: spiedResources })
		const results = await Promise.all([
			thumbs.getCover(r.id),
			thumbs.getCover(r.id),
			thumbs.getCover(r.id),
			thumbs.getCover(r.id),
		])
		for (const res of results) expect(res.kind).toBe("ready")
		expect(calls).toBe(1)
	})

	test("returns { unavailable, placeholder } for an empty resource folder", async () => {
		const r = await resources.create({ name: "empty" })
		const thumbs = createThumbService({ paths, resources })
		const result = await thumbs.getCover(r.id)
		expect(result).toEqual({ kind: "unavailable", reason: "placeholder" })
	})

	test("returns { unavailable, placeholder } for an audio resource", async () => {
		const r = await resources.create({ name: "audio" })
		await seedResourceArtifact({ db: dbh, paths }, r.id, [
			{ name: "track.mp3", bytes: Buffer.alloc(0) },
		])
		await resources.setContentPluginId(r.id, TEST_BUILTIN_ID)
		await resources.rebuildAllMeta(r.id)
		const thumbs = createThumbService({ paths, resources })
		const result = await thumbs.getCover(r.id)
		expect(result).toEqual({ kind: "unavailable", reason: "placeholder" })
	})

	test("getCover synthesises an avif for a zip-backed mp4 resource", async () => {
		const ffmpeg = resolveFfmpegPaths()
		const mp4Path = join(tmpdir(), `thumb-mp4-${Date.now()}.mp4`)
		const generated = await new Promise<boolean>((resolve) => {
			const child = spawn(
				ffmpeg.ffmpeg,
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-f",
					"lavfi",
					"-i",
					"color=c=red:s=64x64:d=0.2",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					"-y",
					mp4Path,
				],
				{ stdio: "ignore" },
			)
			child.on("error", () => resolve(false))
			child.on("close", (code) => resolve(code === 0))
		})
		if (!generated) return

		try {
			const mp4 = await readFile(mp4Path)
			const r = await resources.create({ name: "video" })
			await seedResourceArtifact({ db: dbh, paths }, r.id, [
				{ name: "clip.mp4", bytes: mp4 },
			])
			await resources.setContentPluginId(r.id, TEST_BUILTIN_ID)
			await resources.rebuildAllMeta(r.id)

			const thumbs = createThumbService({ paths, resources, ffmpeg })
			const result = await thumbs.getCover(r.id)
			expect(result.kind).toBe("ready")
			if (result.kind === "ready") {
				const info = await stat(result.path)
				expect(info.size).toBeGreaterThan(0)
			}
		} finally {
			rmSync(mp4Path, { force: true })
		}
	}, 30_000)

	test("a second call after synthesis returns the cached file without re-running the pipeline", async () => {
		const png = await pngBuffer({ r: 12, g: 34, b: 56 })
		const r = await prepareImageResource(resources, dbh, paths, "img", png)

		let calls = 0
		const originalResolve = resources.resolveLocalCoverSource.bind(resources)
		const spiedResources: ResService = {
			...resources,
			resolveLocalCoverSource: async (id: string) => {
				calls += 1
				return originalResolve(id)
			},
		}
		const thumbs = createThumbService({ paths, resources: spiedResources })
		await thumbs.getCover(r.id)
		await thumbs.getCover(r.id)
		expect(calls).toBe(1)
	})

	test("resolveFfmpegPaths honours explicit env overrides", () => {
		const paths = resolveFfmpegPaths({
			env: {
				FFMPEG_PATH: "C:/bin/ffmpeg.exe",
				FFPROBE_PATH: "C:/bin/ffprobe.exe",
			},
			loadStatic: () => "C:/static/ffmpeg.exe",
			loadStaticFfprobe: () => "C:/static/ffprobe.exe",
		})
		expect(paths.ffmpeg).toBe("C:/bin/ffmpeg.exe")
		expect(paths.ffprobe).toBe("C:/bin/ffprobe.exe")
	})

	test("resolveFfmpegPaths falls back to installer binaries when no env override", () => {
		const paths = resolveFfmpegPaths({
			env: {},
			loadStatic: () => "/node_modules/ffmpeg-static/ffmpeg",
			loadStaticFfprobe: () => "/node_modules/ffprobe-static/ffprobe",
		})
		expect(paths.ffmpeg).toBe("/node_modules/ffmpeg-static/ffmpeg")
		expect(paths.ffprobe).toBe("/node_modules/ffprobe-static/ffprobe")
	})

	test("resolveFfmpegPaths falls back to PATH lookup when static is unavailable", () => {
		const paths = resolveFfmpegPaths({
			env: {},
			loadStatic: () => undefined,
			loadStaticFfprobe: () => undefined,
		})
		expect(paths.ffmpeg).toBe("ffmpeg")
		expect(paths.ffprobe).toBe("ffprobe")
	})
})
