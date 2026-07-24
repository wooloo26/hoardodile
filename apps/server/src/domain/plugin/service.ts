import { statSync } from "node:fs"
import { join } from "node:path"
import type { PluginManifest, PluginManifestId } from "@hoardodile/schemas"
import { eq } from "drizzle-orm"
import type { SqliteDb } from "src/infra/db/connection.ts"
import type { PluginLoader } from "./loader.ts"
import type { PluginSandbox } from "./sandbox/host.ts"
import { contentPlugins } from "./schema.ts"

export type PluginSettingsRow = {
	readonly id: PluginManifestId
	readonly manifest: PluginManifest
	readonly enabled: boolean
	readonly priority: number
	readonly pinned: boolean
	readonly color: string
	readonly missing: boolean
	readonly builtin: boolean
	readonly dev: boolean
	/**
	 * Fingerprint of the plugin's client assets (its index.html mtime).
	 * Changes on every rebuild/reinstall, so the web client can hard-cache
	 * plugin assets under a `?v=` URL and only fetch anew when this moves.
	 */
	readonly assetVersion?: string
}

export type PluginServiceDeps = {
	readonly db: SqliteDb
	readonly loader: PluginLoader
	readonly sandbox: PluginSandbox
}

export type PluginService = {
	listAll(): PluginSettingsRow[]
	update(
		id: PluginManifestId,
		settings: {
			enabled?: boolean
			priority?: number
			pinned?: boolean
			color?: string
		},
	): void
	reorder(ids: readonly PluginManifestId[]): void
	rescan(): Promise<void>
}

export function createPluginService(deps: PluginServiceDeps): PluginService {
	const { db, loader, sandbox } = deps

	function listAll(): PluginSettingsRow[] {
		const registry = loader.getRegistry()
		return registry.getAll().map((entry) => ({
			id: entry.id,
			manifest: entry.manifest,
			enabled: entry.enabled,
			priority: entry.priority,
			pinned: entry.pinned,
			color: entry.color,
			missing: entry.missing,
			builtin: entry.builtin,
			dev: entry.dev,
			assetVersion: assetVersionOf(entry.diskPath),
		}))
	}

	function assetVersionOf(diskPath: string | undefined): string | undefined {
		if (diskPath === undefined) return undefined
		const st = statSync(join(diskPath, "index.html"), {
			throwIfNoEntry: false,
		})
		return st !== undefined ? String(st.mtimeMs) : undefined
	}

	function update(
		id: PluginManifestId,
		settings: {
			enabled?: boolean
			priority?: number
			pinned?: boolean
			color?: string
		},
	): void {
		const registry = loader.getRegistry()
		const entry = registry.getById(id)
		if (entry === undefined) return
		if (entry.builtin && settings.enabled === false) {
			throw new Error("Builtin plugin cannot be disabled")
		}

		const now = Date.now()
		const existing = db
			.select()
			.from(contentPlugins)
			.where(eq(contentPlugins.id, id))
			.get()

		if (existing === undefined) {
			db.insert(contentPlugins)
				.values({
					id,
					manifest: JSON.stringify(entry.manifest),
					enabled: intBool(settings.enabled ?? true),
					priority: settings.priority ?? entry.priority,
					pinned: intBool(settings.pinned ?? entry.pinned),
					color: settings.color ?? entry.color,
					missing: 0,
					createdAt: now,
					updatedAt: now,
				})
				.run()
		} else {
			const next: Record<string, number | string> = { updatedAt: now }
			if (settings.enabled !== undefined)
				next.enabled = intBool(settings.enabled)
			if (settings.priority !== undefined) next.priority = settings.priority
			if (settings.pinned !== undefined) next.pinned = intBool(settings.pinned)
			if (settings.color !== undefined) next.color = settings.color
			db.update(contentPlugins).set(next).where(eq(contentPlugins.id, id)).run()
		}

		registry.updateEntry(id, {
			enabled: settings.enabled,
			priority: settings.priority,
			pinned: settings.pinned,
			color: settings.color,
		})

		if (settings.enabled === false) {
			// Free the disabled plugin's worker. The sandboxed definition
			// stays in the registry: hooks of disabled plugins keep serving
			// resources already bound to them, and lazily respawn a worker
			// on the next invocation.
			sandbox.unloadPlugin(id)
		}
	}

	function reorder(ids: readonly PluginManifestId[]): void {
		const registry = loader.getRegistry()
		const allEntries = registry.getAll()
		const nonBuiltinEntries = allEntries.filter((e) => !e.builtin)
		const nonBuiltinIds = new Set(nonBuiltinEntries.map((e) => e.id))

		if (ids.length !== nonBuiltinEntries.length) {
			throw new Error(
				`Expected ${nonBuiltinEntries.length} non-builtin plugin ids, got ${ids.length}`,
			)
		}
		for (const id of ids) {
			if (!nonBuiltinIds.has(id)) {
				throw new Error(`Plugin ${id} is not a non-builtin plugin`)
			}
		}

		const now = Date.now()
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i]
			if (id === undefined) continue
			const priority = (i + 1) * 100
			const entry = registry.getById(id)
			if (entry === undefined) continue
			if (entry.priority === priority) continue

			const existing = db
				.select()
				.from(contentPlugins)
				.where(eq(contentPlugins.id, id))
				.get()
			if (existing !== undefined) {
				db.update(contentPlugins)
					.set({ priority, updatedAt: now })
					.where(eq(contentPlugins.id, id))
					.run()
			}
			registry.updateEntry(id, { priority })
		}
	}

	async function rescan(): Promise<void> {
		await loader.rescan()
	}

	return { listAll, update, reorder, rescan }
}

function intBool(value: boolean): number {
	return value ? 1 : 0
}
