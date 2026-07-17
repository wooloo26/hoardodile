import type { Detection, ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type { PluginManifestId, SerializedFileList } from "@hoardodile/schemas"
import type { PluginRegistry } from "./api-types.ts"
import { createCapabilityGuard } from "./capability-guard.ts"

export type PluginHooksDeps = {
	/**
	 * Live accessor for the current registry — called on every hook
	 * invocation so a `rescan()` replacing the registry never leaves
	 * consumers holding a stale snapshot.
	 */
	readonly getRegistry: () => PluginRegistry
}

/**
 * Result of {@link PluginHooks.runMetaHooks}. A present key means the hook
 * ran (permission granted + implemented); `value` is the raw hook result,
 * which may still be `undefined` when the hook itself returned nothing.
 */
export type PluginMetaHookResults = {
	readonly sourceMeta?: { readonly value: unknown }
	readonly searchMeta?: { readonly value: unknown }
}

/**
 * The single entry point for executing plugin hooks. Owns every
 * hook-invocation policy: priority iteration, builtin fallback, error
 * swallowing/logging, capability checks, and result validation.
 *
 * Methods receive a ready-built {@link ResourceAPI} — this module knows
 * nothing about resources, archives, or paths.
 */
export type PluginHooks = {
	/** The builtin fallback plugin id. Throws when no builtin is registered. */
	readonly defaultPluginId: () => PluginManifestId
	/** Run all enabled plugins' detectors in priority order. Returns the first matching plugin id. Throws if no match (builtin should always match). */
	readonly detectFirstMatch: (api: ResourceAPI) => Promise<PluginManifestId>
	/** Validate that the current plugin still matches. Returns confirmed plugin id or falls back to builtin id. */
	readonly revalidate: (
		api: ResourceAPI,
		currentPluginId: PluginManifestId,
	) => Promise<PluginManifestId>
	/** Run a specific plugin's detector. */
	readonly detectForPlugin: (
		api: ResourceAPI,
		pluginId: PluginManifestId,
	) => Promise<Detection>
	/**
	 * Detector pass for folder-import candidates: non-builtin detectors in
	 * priority order, falling back to the builtin plugin without invoking
	 * its detector.
	 */
	readonly detectForImportDir: (api: ResourceAPI) => Promise<PluginManifestId>
	/**
	 * Ask the owning plugin for a custom file list. Returns `undefined`
	 * when the plugin has no file list hook (or it failed).
	 */
	readonly buildFileList: (
		api: ResourceAPI,
		pluginId: PluginManifestId,
	) => Promise<SerializedFileList | undefined>
	/** Ask the owning plugin which file should be used for the local cover. */
	readonly resolveLocalCoverSource: (
		api: ResourceAPI,
		pluginId: PluginManifestId,
	) => Promise<string | undefined>
	/**
	 * Run the capability-gated meta hooks (`sourceMeta`, `searchMeta`) of
	 * the owning plugin. Keys are absent when the permission is not
	 * granted or the hook is not implemented.
	 */
	readonly runMetaHooks: (
		api: ResourceAPI,
		pluginId: PluginManifestId,
	) => Promise<PluginMetaHookResults>
}

export function createPluginHooks(deps: PluginHooksDeps): PluginHooks {
	const { getRegistry } = deps
	const guard = createCapabilityGuard()

	function defaultPluginId(): PluginManifestId {
		const builtin = getRegistry().getBuiltin()
		if (builtin === undefined) {
			throw new Error(
				"No builtin plugin in registry — cannot determine default plugin",
			)
		}
		return builtin.id
	}

	async function detectFirstMatch(api: ResourceAPI): Promise<PluginManifestId> {
		const registry = getRegistry()
		const enabled = registry.getEnabled()
		for (const entry of enabled) {
			try {
				const result = await entry.plugin.detect(api)
				if (result.ok) {
					return entry.id
				}
			} catch (err) {
				console.error(
					`[plugin-hooks] detect failed for plugin ${entry.id}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
		const builtin = registry.getBuiltin()
		throw new Error(
			`No plugin matched resource. Builtin plugin ${builtin?.id ?? "unknown"} should have matched but did not.`,
		)
	}

	async function revalidate(
		api: ResourceAPI,
		currentPluginId: PluginManifestId,
	): Promise<PluginManifestId> {
		const registry = getRegistry()
		const builtin = registry.getBuiltin()
		if (builtin === undefined) {
			throw new Error("No builtin plugin available for fallback")
		}

		const enabled = registry.getEnabled()
		const startIndex = enabled.findIndex((e) => e.id === currentPluginId)
		if (startIndex < 0) {
			return builtin.id
		}

		for (const entry of enabled.slice(startIndex)) {
			try {
				const result = await entry.plugin.detect(api)
				if (result.ok) return entry.id
			} catch (err) {
				console.error(
					`[plugin-hooks] revalidate detect failed for plugin ${entry.id}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
		return builtin.id
	}

	async function detectForPlugin(
		api: ResourceAPI,
		pluginId: PluginManifestId,
	): Promise<Detection> {
		const entry = getRegistry().getById(pluginId)
		if (entry === undefined) {
			return { ok: false, reasons: [`unknown plugin: ${pluginId}`] }
		}
		try {
			const result = await entry.plugin.detect(api)
			if (result.ok) return { ok: true }
			return { ok: false, reasons: result.reasons.slice() }
		} catch (err) {
			console.error(
				`[plugin-hooks] detectForPlugin failed for plugin ${pluginId}: ${err instanceof Error ? err.message : String(err)}`,
			)
			return { ok: false, reasons: ["detect threw an exception"] }
		}
	}

	async function detectForImportDir(
		api: ResourceAPI,
	): Promise<PluginManifestId> {
		const fallback = defaultPluginId()
		const detectors = getRegistry()
			.getEnabled()
			.filter((e) => !e.builtin)
			.sort((a, b) => a.priority - b.priority)
		for (const entry of detectors) {
			let result: Detection
			try {
				result = await entry.plugin.detect(api)
			} catch (err) {
				console.error(
					`[plugin-hooks] import detect failed for plugin ${entry.id}: ${err instanceof Error ? err.message : String(err)}`,
				)
				continue
			}
			if (result.ok) {
				return entry.id
			}
		}
		return fallback
	}

	async function buildFileList(
		api: ResourceAPI,
		pluginId: PluginManifestId,
	): Promise<SerializedFileList | undefined> {
		const entry = getRegistry().getById(pluginId)
		if (entry?.plugin.listFiles === undefined) return undefined
		let pluginResult: readonly unknown[]
		try {
			pluginResult = await entry.plugin.listFiles(api)
		} catch (err) {
			console.error(
				`[plugin-hooks] listFiles failed for plugin ${pluginId}: ${err instanceof Error ? err.message : String(err)}`,
			)
			return undefined
		}
		for (const item of pluginResult) {
			if (typeof item === "string") continue
			if (typeof item === "object" && item !== null && !Array.isArray(item)) {
				for (const value of Object.values(item)) {
					if (value === undefined) continue
					const t = typeof value
					if (t === "string" || t === "number" || t === "boolean") continue
					throw new Error(
						`Plugin ${String(pluginId)} returned an invalid file list item value type: ${t}`,
					)
				}
				continue
			}
			throw new Error(
				`Plugin ${String(pluginId)} returned an invalid file list item`,
			)
		}
		return pluginResult as SerializedFileList
	}

	async function resolveLocalCoverSource(
		api: ResourceAPI,
		pluginId: PluginManifestId,
	): Promise<string | undefined> {
		const entry = getRegistry().getById(pluginId)
		if (entry?.plugin.coverLocal === undefined) return undefined
		try {
			return await entry.plugin.coverLocal(api)
		} catch (err) {
			console.warn(
				`[plugin-hooks] coverLocal failed for plugin ${pluginId}: ${err instanceof Error ? err.message : String(err)}`,
			)
			return undefined
		}
	}

	async function runMetaHooks(
		api: ResourceAPI,
		pluginId: PluginManifestId,
	): Promise<PluginMetaHookResults> {
		const entry = getRegistry().getById(pluginId)
		if (entry === undefined) return {}
		const results: {
			sourceMeta?: { readonly value: unknown }
			searchMeta?: { readonly value: unknown }
		} = {}
		if (
			guard.check(entry.manifest, "sourceMeta") &&
			entry.plugin.sourceMeta !== undefined
		) {
			results.sourceMeta = { value: await entry.plugin.sourceMeta(api) }
		}
		if (
			guard.check(entry.manifest, "searchMeta") &&
			entry.plugin.searchMeta !== undefined
		) {
			results.searchMeta = { value: await entry.plugin.searchMeta(api) }
		}
		return results
	}

	return {
		defaultPluginId,
		detectFirstMatch,
		revalidate,
		detectForPlugin,
		detectForImportDir,
		buildFileList,
		resolveLocalCoverSource,
		runMetaHooks,
	}
}
