import type { PluginManifest } from "@hoardodile/schemas"
import type { PluginRegistryEntry } from "./api-types.ts"

export type PluginCapability =
	| "sourceMeta"
	| "searchMeta"
	| "danmaku"
	| "comment"

export type CapabilityGuard = {
	/** Check whether a manifest grants the given capability. */
	readonly check: (
		manifest: PluginManifest,
		capability: PluginCapability,
	) => boolean
	/** Assert that a manifest grants the given capability; throw if not. */
	readonly require: (
		manifest: PluginManifest,
		capability: PluginCapability,
	) => void
	/** Filter entries to only those that grant the given capability. */
	readonly filter: (
		entries: readonly PluginRegistryEntry[],
		capability: PluginCapability,
	) => readonly PluginRegistryEntry[]
}

export function createCapabilityGuard(): CapabilityGuard {
	function check(
		manifest: PluginManifest,
		capability: PluginCapability,
	): boolean {
		return manifest.permissions[capability] === true
	}

	function require(
		manifest: PluginManifest,
		capability: PluginCapability,
	): void {
		if (!check(manifest, capability)) {
			throw new Error(
				`${capability} permission denied for plugin ${manifest.id}`,
			)
		}
	}

	function filter(
		entries: readonly PluginRegistryEntry[],
		capability: PluginCapability,
	): readonly PluginRegistryEntry[] {
		return entries.filter((e) => check(e.manifest, capability))
	}

	return { check, require, filter }
}
