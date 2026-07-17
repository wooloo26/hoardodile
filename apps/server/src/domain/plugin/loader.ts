import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { PluginManifest, PluginManifestId } from "@hoardodile/schemas"
import type { SqliteDb } from "src/infra/db/connection.ts"
import { createPluginActivation } from "./activation.ts"
import type { PluginRegistry, PluginRegistryEntry } from "./api-types.ts"
import { createPluginDiscovery } from "./discovery.ts"
import { createPluginSandbox, type PluginSandbox } from "./sandbox/host.ts"

export type PluginLoader = {
	readonly loadAll: () => Promise<PluginRegistry>
	readonly rescan: () => Promise<PluginRegistry>
	readonly getRegistry: () => PluginRegistry
}

export type PluginLoaderDeps = {
	readonly builtinDir?: string
	readonly devPluginDirs?: readonly string[]
	readonly pluginsDir: string
	readonly db: SqliteDb
	readonly disableDevPlugins?: boolean
	/**
	 * Worker-thread sandbox that executes plugin hooks. Optional so tests
	 * without any `main.js` on disk can omit it; the default spawns real
	 * workers when a loadable bundle is found.
	 */
	readonly sandbox?: PluginSandbox
	/**
	 * Optional timing sink for boot diagnostics — receives the duration of
	 * each `loadAll` step. Defaults to a no-op so tests stay quiet.
	 */
	readonly onTiming?: (step: string, ms: number) => void
}

export function createPluginLoader(deps: PluginLoaderDeps): PluginLoader {
	let registry: PluginRegistry | undefined

	const discovery = createPluginDiscovery(deps)
	const sandbox = deps.sandbox ?? createPluginSandbox()
	const activation = createPluginActivation({ sandbox })

	async function loadAll(): Promise<PluginRegistry> {
		const disposeStart = performance.now()
		// Terminate workers from the previous registry. This also makes
		// rescan pick up changed plugin code — worker respawn re-imports
		// main.js, bypassing the ESM module cache of the main thread.
		await sandbox.disposeAll()
		deps.onTiming?.("dispose", Math.round(performance.now() - disposeStart))

		const seedStart = performance.now()
		seedBundledPlugins(deps.pluginsDir)
		deps.onTiming?.("seed", Math.round(performance.now() - seedStart))

		const discoverStart = performance.now()
		const { found, missing } = await discovery.discover()
		deps.onTiming?.("discover", Math.round(performance.now() - discoverStart))

		const activateStart = performance.now()
		const activated = await activation.activateAll(found)
		deps.onTiming?.("activate", Math.round(performance.now() - activateStart))

		const failing = activation.createFailingEntries(missing)

		const entries = [...activated, ...failing]
		entries.sort((a, b) => a.priority - b.priority)

		registry = buildRegistry(entries)
		return registry
	}

	async function rescan(): Promise<PluginRegistry> {
		return loadAll()
	}

	function getRegistry(): PluginRegistry {
		if (registry === undefined) {
			throw new Error("Plugin registry not initialised — call loadAll() first")
		}
		return registry
	}

	return { loadAll, rescan, getRegistry }
}

function seedBundledPlugins(pluginsDir: string): void {
	const fileDir = dirname(fileURLToPath(import.meta.url))
	const candidates = [
		resolve(fileDir, "../plugins"),
		resolve(fileDir, "../../../dist/plugins"),
	]
	const bundledDir = candidates.find((c) => existsSync(c))
	if (bundledDir === undefined) {
		console.log("[plugin-loader] no bundled plugins found, skipping seed")
		return
	}
	const dirs = readdirSync(bundledDir, { withFileTypes: true })
	let _seeded = 0
	for (const dirent of dirs) {
		if (!dirent.isDirectory()) continue
		const srcDir = join(bundledDir, dirent.name)
		const manifestPath = join(srcDir, "manifest.json")
		if (!existsSync(manifestPath)) continue
		let manifest: PluginManifest
		try {
			manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
		} catch {
			continue
		}
		if (typeof manifest.id !== "string" || manifest.id.length === 0) continue
		const dstDir = join(pluginsDir, manifest.id)
		if (existsSync(dstDir)) {
			rmSync(dstDir, { recursive: true, force: true })
		}
		mkdirSync(dstDir, { recursive: true })
		for (const f of readdirSync(srcDir)) {
			cpSync(join(srcDir, f), join(dstDir, f), {
				recursive: true,
			})
		}
		_seeded += 1
	}
	// seeded count intentionally not logged to keep test output clean
}

export function buildRegistry(
	entries: readonly PluginRegistryEntry[],
): PluginRegistry {
	const byId = new Map<PluginManifestId, PluginRegistryEntry>()
	for (const entry of entries) {
		const existing = byId.get(entry.id)
		if (existing !== undefined) {
			console.warn(
				`[plugin-loader] skipping ${entry.id}: UUID conflicts with already registered plugin (${existing.manifest.name ?? existing.id}), keeping first`,
			)
			continue
		}
		byId.set(entry.id, entry)
	}

	let sortedEntries = [...entries]

	return {
		getAll(): readonly PluginRegistryEntry[] {
			return sortedEntries
		},
		getEnabled(): readonly PluginRegistryEntry[] {
			return sortedEntries.filter((e) => e.enabled)
		},
		getById(id: PluginManifestId): PluginRegistryEntry | undefined {
			return byId.get(id)
		},
		getBuiltin(): PluginRegistryEntry | undefined {
			return sortedEntries.find((e) => e.builtin)
		},
		getForResource(
			resPluginId: PluginManifestId,
		): PluginRegistryEntry | undefined {
			const entry = byId.get(resPluginId)
			if (entry === undefined || !entry.enabled) return undefined
			return entry
		},
		updateEntry(
			id: PluginManifestId,
			patch: Partial<
				Pick<
					PluginRegistryEntry,
					"enabled" | "priority" | "pinned" | "color" | "missing"
				>
			>,
		): void {
			const index = sortedEntries.findIndex((e) => e.id === id)
			if (index === -1) return
			const old = sortedEntries[index]
			if (old === undefined) return
			const updated: PluginRegistryEntry = {
				id: old.id,
				manifest: old.manifest,
				plugin: old.plugin,
				diskPath: old.diskPath,
				enabled: patch.enabled ?? old.enabled,
				priority: patch.priority ?? old.priority,
				pinned: patch.pinned ?? old.pinned,
				color: patch.color ?? old.color,
				missing: patch.missing ?? old.missing,
				builtin: old.builtin,
				dev: old.dev,
			}
			sortedEntries = [
				...sortedEntries.slice(0, index),
				updated,
				...sortedEntries.slice(index + 1),
			]
			sortedEntries.sort((a, b) => a.priority - b.priority)
			byId.set(id, updated)
		},
	}
}
