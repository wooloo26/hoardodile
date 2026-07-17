import type { Detection, ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type {
	FileStats,
	PluginManifestId,
	SerializedFileList,
} from "@hoardodile/schemas"
import type { PluginRegistry } from "src/domain/plugin/api-types.ts"

export type PluginOrchestratorDeps = {
	readonly pluginRegistry: PluginRegistry
	readonly buildResourceAPI: (
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
	) => Promise<ResourceAPI>
}

export type PluginOrchestrator = {
	/** Run all enabled plugins' detectors in priority order. Returns the first matching plugin id. Throws if no match (builtin should always match). */
	readonly detectFirstMatch: (
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
	) => Promise<PluginManifestId>

	/** Validate that the current plugin still matches. Returns confirmed plugin id or falls back to builtin id. */
	readonly revalidate: (
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		currentPluginId: PluginManifestId,
	) => Promise<PluginManifestId>

	/** Run a specific plugin's detector against a resource. */
	readonly detectForPlugin: (
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		pluginId: PluginManifestId,
	) => Promise<Detection>

	/** Ask the owning plugin which file should be used for the local cover. */
	readonly resolveLocalCoverSource: (
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		pluginId: PluginManifestId,
	) => Promise<string | undefined>

	/**
	 * Ask the owning plugin for a custom file list.
	 * Returns `undefined` when the plugin has no file list hook.
	 */
	readonly buildFileList: (
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		pluginId: PluginManifestId,
	) => Promise<SerializedFileList | undefined>
}

export function createPluginOrchestrator(
	deps: PluginOrchestratorDeps,
): PluginOrchestrator {
	const { pluginRegistry, buildResourceAPI } = deps

	async function detectFirstMatch(
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
	): Promise<PluginManifestId> {
		const api = await buildResourceAPI(resId, fileVersion, stats)
		const enabled = pluginRegistry.getEnabled()
		for (const entry of enabled) {
			try {
				const result = await entry.plugin.detect(api)
				if (result.ok) {
					return entry.id
				}
			} catch (err) {
				console.error(
					`[plugin-orchestrator] detect failed for plugin ${entry.id} on resource ${resId}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
		const builtin = pluginRegistry.getBuiltin()
		throw new Error(
			`No plugin matched resource ${resId}. Builtin plugin ${builtin?.id ?? "unknown"} should have matched but did not.`,
		)
	}

	async function revalidate(
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		currentPluginId: PluginManifestId,
	): Promise<PluginManifestId> {
		const builtin = pluginRegistry.getBuiltin()
		if (builtin === undefined) {
			throw new Error("No builtin plugin available for fallback")
		}

		const enabled = pluginRegistry.getEnabled()
		const startIndex = enabled.findIndex((e) => e.id === currentPluginId)
		if (startIndex < 0) {
			return builtin.id
		}

		const api = await buildResourceAPI(resId, fileVersion, stats)
		for (const entry of enabled.slice(startIndex)) {
			try {
				const result = await entry.plugin.detect(api)
				if (result.ok) return entry.id
			} catch (err) {
				console.error(
					`[plugin-orchestrator] revalidate detect failed for plugin ${entry.id} on resource ${resId}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
		return builtin.id
	}

	async function detectForPlugin(
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		pluginId: PluginManifestId,
	): Promise<Detection> {
		const entry = pluginRegistry.getById(pluginId)
		if (entry === undefined) {
			return { ok: false, reasons: [`unknown plugin: ${pluginId}`] }
		}
		const api = await buildResourceAPI(resId, fileVersion, stats)
		try {
			const result = await entry.plugin.detect(api)
			if (result.ok) return { ok: true }
			return { ok: false, reasons: result.reasons.slice() }
		} catch (err) {
			console.error(
				`[plugin-orchestrator] detectForPlugin failed for plugin ${pluginId} on resource ${resId}: ${err instanceof Error ? err.message : String(err)}`,
			)
			return { ok: false, reasons: ["detect threw an exception"] }
		}
	}

	async function resolveLocalCoverSource(
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		pluginId: PluginManifestId,
	): Promise<string | undefined> {
		const entry = pluginRegistry.getById(pluginId)
		if (entry?.plugin.coverLocal === undefined) return undefined
		const api = await buildResourceAPI(resId, fileVersion, stats)
		try {
			return await entry.plugin.coverLocal(api)
		} catch (err) {
			console.error(
				`[plugin-orchestrator] coverLocal failed for plugin ${pluginId} on resource ${resId}: ${err instanceof Error ? err.message : String(err)}`,
			)
			return undefined
		}
	}

	async function buildFileList(
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
		pluginId: PluginManifestId,
	): Promise<SerializedFileList | undefined> {
		const entry = pluginRegistry.getById(pluginId)
		if (entry?.plugin.listFiles === undefined) return undefined
		const api = await buildResourceAPI(resId, fileVersion, stats)
		let pluginResult: readonly unknown[]
		try {
			pluginResult = await entry.plugin.listFiles(api)
		} catch (err) {
			console.error(
				`[plugin-orchestrator] listFiles failed for plugin ${pluginId} on resource ${resId}: ${err instanceof Error ? err.message : String(err)}`,
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

	return {
		detectFirstMatch,
		revalidate,
		detectForPlugin,
		resolveLocalCoverSource,
		buildFileList,
	}
}
