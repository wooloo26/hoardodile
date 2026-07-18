import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginManifest } from "@hoardodile/schemas"
import { type DbHandles, openDb } from "src/infra/db/connection.ts"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createPluginLoader } from "./loader.ts"
import type { PluginSandbox } from "./sandbox/host.ts"

const SHARED_ID = "11111111-1111-4111-8111-111111111111"

function writePluginDir(dir: string, manifest: PluginManifest): void {
	mkdirSync(dir, { recursive: true })
	writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest))
}

function buildManifest(
	overrides: Partial<PluginManifest> = {},
): PluginManifest {
	return {
		id: SHARED_ID,
		name: "Test Plugin",
		description: "Loader test fixture",
		version: "1.0.0",
		permissions: {
			sourceMeta: false,
			searchMeta: false,
			danmaku: false,
			message: false,
		},
		...overrides,
	}
}

describe("plugin loader: dev plugin overrides same-id disk plugin", () => {
	let root: string
	let pluginsDir: string
	let devDir: string
	let dbh: DbHandles
	let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
	let consoleInfoSpy: ReturnType<typeof vi.spyOn> | undefined

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-plugin-loader-"))
		pluginsDir = join(root, "plugins")
		devDir = join(root, "dev")
		mkdirSync(pluginsDir, { recursive: true })
		dbh = openDb(":memory:")
		dbh.runMigrations()
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
	})

	afterEach(() => {
		consoleWarnSpy?.mockRestore()
		consoleInfoSpy?.mockRestore()
		dbh.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("only the dev entry survives, disk entry is skipped with a console.info log", async () => {
		writePluginDir(join(pluginsDir, "shared"), buildManifest())
		writePluginDir(devDir, buildManifest())

		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})

		const loader = createPluginLoader({
			pluginsDir,
			devPluginDirs: [devDir],
			db: dbh.db,
		})
		const registry = await loader.loadAll()

		const matching = registry.getAll().filter((e) => e.id === SHARED_ID)
		expect(matching).toHaveLength(1)
		expect(matching[0]?.dev).toBe(true)
		expect(matching[0]?.diskPath).toBe(devDir)

		const overrideLogs = infoSpy.mock.calls.filter((args) => {
			const first = args[0]
			return (
				typeof first === "string" &&
				first.includes("skipping disk plugin") &&
				first.includes(SHARED_ID)
			)
		})
		expect(overrideLogs).toHaveLength(1)

		infoSpy.mockRestore()
	})

	test("disk entry loads when no dev plugin overrides it", async () => {
		writePluginDir(join(pluginsDir, "shared"), buildManifest())

		const loader = createPluginLoader({
			pluginsDir,
			db: dbh.db,
		})
		const registry = await loader.loadAll()

		const matching = registry.getAll().filter((e) => e.id === SHARED_ID)
		expect(matching).toHaveLength(1)
		expect(matching[0]?.dev).toBe(false)
		expect(matching[0]?.diskPath).toBe(join(pluginsDir, "shared"))
	})

	test("dev plugins are ignored when disableDevPlugins is true", async () => {
		writePluginDir(join(pluginsDir, "shared"), buildManifest())
		writePluginDir(devDir, buildManifest({ name: "Dev Override" }))

		const loader = createPluginLoader({
			pluginsDir,
			devPluginDirs: [devDir],
			disableDevPlugins: true,
			db: dbh.db,
		})
		const registry = await loader.loadAll()

		const matching = registry.getAll().filter((e) => e.id === SHARED_ID)
		expect(matching).toHaveLength(1)
		expect(matching[0]?.dev).toBe(false)
		expect(matching[0]?.diskPath).toBe(join(pluginsDir, "shared"))
	})

	test("manifest with ui.card loads and parses slot templates", async () => {
		writePluginDir(
			join(pluginsDir, "card"),
			buildManifest({
				id: "22222222-2222-4222-8222-222222222222",
				ui: {
					card: {
						image: {
							br: ["{{bytes(file.sizeBytes)}}"],
							bl: ["{{source.width}}×{{source.height}}"],
						},
						video: {
							br: ["{{bytes(file.sizeBytes)}}"],
							tl: ["▶ {{duration(source.durationMs)}}"],
						},
						audio: {
							br: ["{{bytes(file.sizeBytes)}}"],
						},
					},
				},
			}),
		)

		const loader = createPluginLoader({
			pluginsDir,
			db: dbh.db,
		})
		const registry = await loader.loadAll()

		const entry = registry.getById("22222222-2222-4222-8222-222222222222")
		expect(entry).toBeDefined()
		expect(entry?.manifest.ui?.card?.image?.br).toEqual([
			"{{bytes(file.sizeBytes)}}",
		])
		expect(entry?.manifest.ui?.card?.video?.tl).toEqual([
			"▶ {{duration(source.durationMs)}}",
		])
	})

	test("manifest with invalid ui.card kind strips unknown keys", async () => {
		writePluginDir(
			join(pluginsDir, "bad"),
			buildManifest({
				id: "33333333-3333-4333-8333-333333333333",
				ui: {
					card: {
						// @ts-expect-error — injecting an invalid kind for testing
						invalidKind: {
							br: ["bad"],
						},
					},
				},
			}),
		)

		const loader = createPluginLoader({
			pluginsDir,
			db: dbh.db,
		})
		const registry = await loader.loadAll()

		const entry = registry.getById("33333333-3333-4333-8333-333333333333")
		expect(entry).toBeDefined()
		// Zod strips unknown keys during parse, so invalidKind is discarded.
		expect(
			// @ts-expect-error — accessing a stripped key
			entry?.manifest.ui?.card?.invalidKind,
		).toBeUndefined()
	})
})

describe("plugin loader: loadAll serialization", () => {
	let root: string
	let dbh: DbHandles
	let consoleLogSpy: ReturnType<typeof vi.spyOn> | undefined

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-plugin-loader-"))
		dbh = openDb(":memory:")
		dbh.runMigrations()
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
	})

	afterEach(() => {
		consoleLogSpy?.mockRestore()
		dbh.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("concurrent loadAll calls never interleave sandbox teardown", async () => {
		const log: string[] = []
		const sandbox: PluginSandbox = {
			loadPlugin: async () => undefined,
			unloadPlugin: () => {},
			disposeAll: async () => {
				log.push("dispose:start")
				await new Promise((resolve) => setTimeout(resolve, 10))
				log.push("dispose:end")
			},
		}
		const loader = createPluginLoader({
			pluginsDir: join(root, "plugins"),
			db: dbh.db,
			sandbox,
		})

		const [first, second] = await Promise.all([
			loader.loadAll(),
			loader.loadAll(),
		])
		expect(first).toBeDefined()
		expect(loader.getRegistry()).toBe(second)

		// Every teardown must complete before the next run starts one.
		const starts = log.flatMap((event, i) =>
			event === "dispose:start" ? [i] : [],
		)
		expect(starts).toHaveLength(2)
		for (const i of starts) {
			expect(log[i + 1]).toBe("dispose:end")
		}
	})
})
