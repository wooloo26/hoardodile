import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
	assertPluginShape,
	createFailingPlugin,
	definePlugin,
} from "@hoardodile/plugin-sdk-server"
import type { PluginManifestId } from "@hoardodile/schemas"
import type {
	FoundPlugin,
	MissingPlugin,
	PluginDefinition,
	PluginRegistryEntry,
} from "./api-types.ts"

export type PluginActivation = {
	readonly activateAll: (
		found: readonly FoundPlugin[],
	) => Promise<PluginRegistryEntry[]>
	readonly createFailingEntries: (
		missing: readonly MissingPlugin[],
	) => PluginRegistryEntry[]
}

export function createPluginActivation(): PluginActivation {
	async function activateAll(
		found: readonly FoundPlugin[],
	): Promise<PluginRegistryEntry[]> {
		// Import plugin bundles in parallel — sequential imports multiply the
		// boot cost on slow or antivirus-scanned disks. Array order is kept by
		// `map`, and `loadAll` re-sorts by priority afterwards anyway.
		return Promise.all(
			found.map(async (candidate) => {
				const plugin = await loadDiskPlugin(candidate.diskPath)
				return {
					id: candidate.id,
					manifest: candidate.manifest,
					enabled: candidate.enabled,
					priority: candidate.priority,
					pinned: candidate.pinned,
					color: candidate.color,
					missing: false,
					builtin: candidate.source === "builtin",
					dev: candidate.source === "dev",
					plugin,
					diskPath: candidate.diskPath,
				}
			}),
		)
	}

	function createFailingEntries(
		missing: readonly MissingPlugin[],
	): PluginRegistryEntry[] {
		return missing.map((m) => ({
			id: m.id,
			manifest: m.manifest,
			enabled: m.enabled,
			priority: m.priority,
			pinned: m.pinned,
			color: m.color,
			missing: true,
			builtin: false,
			dev: false,
			plugin: createFailingPlugin(["plugin directory not found"]),
		}))
	}

	return { activateAll, createFailingEntries }
}

async function loadDiskPlugin(dirPath: string): Promise<PluginDefinition> {
	const mainJsPath = join(dirPath, "main.js")
	if (!existsSync(mainJsPath)) {
		const id = guessIdFromPath(dirPath)
		console.warn(`[plugin-activation] ${id}: no main.js, not loaded`)
		return createFailingPlugin(["main.js not found"])
	}

	try {
		const url = pathToFileURL(mainJsPath).href
		const mod: unknown = await import(url)
		const extracted = extractDefaultPlugin(mod)
		if (extracted === undefined) {
			const id = guessIdFromPath(dirPath)
			console.warn(
				`[plugin-activation] ${id}: main.js does not export default plugin`,
			)
			return createFailingPlugin(["invalid main.js"])
		}
		assertPluginShape(extracted)
		return definePlugin(extracted)
	} catch (err) {
		const id = guessIdFromPath(dirPath)
		console.error(`[plugin-activation] ${id}: failed to load main.js`, err)
		return createFailingPlugin(["main.js load error"])
	}
}

function guessIdFromPath(dirPath: string): PluginManifestId {
	const parts = dirPath.split(/[/\\]/)
	const last = parts.at(-1)
	return last ?? "unknown"
}

interface PluginModule {
	readonly default?: unknown
}

function extractDefaultPlugin(mod: unknown): PluginDefinition | undefined {
	if (typeof mod !== "object" || mod === null) return undefined
	const m = mod as PluginModule
	if (m.default === undefined) return undefined
	return m.default as PluginDefinition
}
