import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { PluginManifest, PluginManifestId } from "@hoardodile/schemas"
import { pluginManifest as pluginManifestSchema } from "@hoardodile/schemas"
import { eq } from "drizzle-orm"
import type { SqliteDb } from "src/infra/db/connection.ts"
import { contentPlugins } from "./schema.ts"

/**
 * Default priorities for bundled official plugins.
 * Used when there is no DB row yet (first install / clean state).
 * Users can still override via drag-and-drop reorder.
 */
const OFFICIAL_PLUGIN_PRIORITY: Record<string, number> = {
	"c9cf1c0a-2a99-44fe-ac71-4068bea2fabf": 100, // manga
	"665cfbdd-1db6-48f5-9d53-1008b8cb84c3": 200, // gallery
	"b3bfba9e-b14b-42b1-8bf9-147251317dc0": 300, // novel
}

function getDefaultPriority(pluginId: PluginManifestId): number {
	return OFFICIAL_PLUGIN_PRIORITY[pluginId] ?? 100
}

export type FoundPlugin = {
	readonly id: PluginManifestId
	readonly manifest: PluginManifest
	readonly diskPath: string
	readonly source: "builtin" | "dev" | "disk"
	readonly enabled: boolean
	readonly priority: number
	readonly pinned: boolean
	readonly color: string
}

export type MissingPlugin = {
	readonly id: PluginManifestId
	readonly manifest: PluginManifest
	readonly enabled: boolean
	readonly priority: number
	readonly pinned: boolean
	readonly color: string
}

export type PluginDiscoveryDeps = {
	readonly builtinDir?: string
	readonly devPluginDirs?: readonly string[]
	readonly pluginsDir: string
	readonly db: SqliteDb
	readonly disableDevPlugins?: boolean
}

export type PluginDiscovery = {
	readonly discover: () => Promise<{
		found: FoundPlugin[]
		missing: MissingPlugin[]
	}>
}

export function createPluginDiscovery(
	deps: PluginDiscoveryDeps,
): PluginDiscovery {
	async function discover(): Promise<{
		found: FoundPlugin[]
		missing: MissingPlugin[]
	}> {
		const found: FoundPlugin[] = []

		// 1. Builtin plugin
		if (deps.builtinDir !== undefined) {
			const builtin = discoverBuiltin(deps.builtinDir)
			if (builtin !== undefined) found.push(builtin)
		}

		// 2. Dev plugins
		const dev = discoverDevPlugins(
			deps.devPluginDirs,
			deps.db,
			deps.disableDevPlugins ?? false,
		)
		found.push(...dev)

		// 3. Disk plugins, skipping ids overridden by dev
		const devIds = new Set(dev.map((d) => d.id))
		const disk = discoverDiskPlugins(deps.pluginsDir, deps.db, devIds)
		found.push(...disk)

		// 4. Missing plugins (DB-only)
		const loadedIds = new Set(found.map((f) => f.id))
		const missing = discoverMissingPlugins(deps.db, loadedIds)

		return { found, missing }
	}

	return { discover }
}

function discoverBuiltin(builtinDir: string): FoundPlugin | undefined {
	const resolved = resolve(builtinDir)
	const manifest = parseManifest(resolved, "builtin")
	if (manifest === undefined) {
		throw new Error(
			`Builtin plugin not found or invalid at ${resolved}. ` +
				"A builtin plugin is required — set BUILTIN_PATH env to a valid plugin directory.",
		)
	}
	return {
		id: manifest.id,
		manifest,
		diskPath: resolved,
		source: "builtin",
		enabled: true,
		priority: Number.MAX_SAFE_INTEGER,
		pinned: false,
		color: "",
	}
}

function discoverDevPlugins(
	devPluginDirs: readonly string[] | undefined,
	db: SqliteDb,
	disableDevPlugins: boolean,
): FoundPlugin[] {
	if (disableDevPlugins) {
		console.info("[plugin-discovery] dev plugins disabled by configuration")
		return []
	}
	if (devPluginDirs === undefined || devPluginDirs.length === 0) return []

	const results: FoundPlugin[] = []
	for (const dir of devPluginDirs) {
		const resolved = resolve(dir)
		const manifest = parseManifest(resolved, "dev")
		if (manifest === undefined) continue

		const dbRow = db
			.select()
			.from(contentPlugins)
			.where(eq(contentPlugins.id, manifest.id))
			.get()

		results.push({
			id: manifest.id,
			manifest,
			diskPath: resolved,
			source: "dev",
			enabled: true,
			priority: dbRow?.priority ?? getDefaultPriority(manifest.id),
			pinned: dbRow?.pinned === 1,
			color: dbRow?.color ?? "",
		})
	}
	return results
}

function discoverDiskPlugins(
	pluginsDir: string,
	db: SqliteDb,
	overriddenIds: ReadonlySet<PluginManifestId>,
): FoundPlugin[] {
	if (!existsSync(pluginsDir)) return []

	const dirents = readdirSync(pluginsDir, { withFileTypes: true })
	if (dirents.length === 0) return []

	const results: FoundPlugin[] = []
	for (const dirent of dirents) {
		if (!dirent.isDirectory()) continue
		const dirPath = join(pluginsDir, dirent.name)

		const manifest = parseManifest(dirPath, dirent.name)
		if (manifest === undefined) continue

		if (overriddenIds.has(manifest.id)) {
			console.info(
				`[plugin-discovery] skipping disk plugin ${manifest.id}: overridden by DEV_PLUGIN_PATHS`,
			)
			continue
		}

		const dbRow = db
			.select()
			.from(contentPlugins)
			.where(eq(contentPlugins.id, manifest.id))
			.get()

		const dbEnabled = dbRow?.enabled
		const enabled = dbEnabled !== undefined ? dbEnabled === 1 : true
		const priority = dbRow?.priority ?? getDefaultPriority(manifest.id)
		const pinned = dbRow?.pinned === 1
		const color = dbRow?.color ?? ""

		results.push({
			id: manifest.id,
			manifest,
			diskPath: dirPath,
			source: "disk",
			enabled,
			priority,
			pinned,
			color,
		})
	}
	return results
}

function discoverMissingPlugins(
	db: SqliteDb,
	loadedIds: ReadonlySet<PluginManifestId>,
): MissingPlugin[] {
	const dbRows = db.select().from(contentPlugins).all()
	const results: MissingPlugin[] = []
	for (const row of dbRows) {
		if (loadedIds.has(row.id)) continue
		let manifest: PluginManifest
		try {
			manifest = JSON.parse(row.manifest) as PluginManifest
		} catch {
			continue
		}
		results.push({
			id: row.id,
			manifest,
			enabled: row.enabled === 1,
			priority: row.priority,
			pinned: row.pinned === 1,
			color: row.color,
		})
	}
	return results
}

export function parseManifest(
	dirPath: string,
	dirName: string,
): PluginManifest | undefined {
	const manifestPath = join(dirPath, "manifest.json")
	if (!existsSync(manifestPath)) {
		console.warn(`[plugin-discovery] skipping ${dirName}: no manifest.json`)
		return undefined
	}

	let raw: string
	try {
		raw = readFileSync(manifestPath, "utf-8")
	} catch {
		console.warn(
			`[plugin-discovery] skipping ${dirName}: cannot read manifest.json`,
		)
		return undefined
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		console.warn(
			`[plugin-discovery] skipping ${dirName}: manifest is not valid JSON`,
		)
		return undefined
	}

	const result = pluginManifestSchema.safeParse(parsed)
	if (!result.success) {
		console.warn(
			`[plugin-discovery] skipping ${dirName}: invalid manifest`,
			result.error,
		)
		return undefined
	}

	return result.data
}
