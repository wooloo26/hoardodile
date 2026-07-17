import type { PluginSchema } from "@hoardodile/plugin-sdk-types"
import type { Detection, PluginDefinition } from "./types.ts"

/**
 * Freeze and return a plugin definition. This helper carries no runtime
 * behaviour beyond validation-friendly typing; the host validates the shape
 * when loading the plugin.
 */
export function definePlugin<TSchema extends PluginSchema = PluginSchema>(
	definition: PluginDefinition<TSchema>,
): PluginDefinition<TSchema> {
	return Object.freeze({ ...definition })
}

/**
 * Narrowly validate that a value satisfies the structural contract of a
 * {@link PluginDefinition}. Does NOT exercise behaviour.
 */
export function assertPluginShape(
	value: unknown,
): asserts value is PluginDefinition {
	if (typeof value !== "object" || value === null) {
		throw new Error("PluginDefinition: expected object")
	}

	const definition = value as Record<string, unknown>
	if (typeof definition.detect !== "function") {
		throw new Error("PluginDefinition: missing detect()")
	}

	if (
		definition.sourceMeta !== undefined &&
		typeof definition.sourceMeta !== "function"
	) {
		throw new Error("PluginDefinition: sourceMeta must be a function")
	}

	if (
		definition.searchMeta !== undefined &&
		typeof definition.searchMeta !== "function"
	) {
		throw new Error("PluginDefinition: searchMeta must be a function")
	}

	if (
		definition.coverLocal !== undefined &&
		typeof definition.coverLocal !== "function"
	) {
		throw new Error("PluginDefinition: coverLocal must be a function")
	}

	if (
		definition.listFiles !== undefined &&
		typeof definition.listFiles !== "function"
	) {
		throw new Error("PluginDefinition: listFiles must be a function")
	}
}

/**
 * Convenience wrapper that builds a failing plugin definition. Used by the host
 * when a plugin directory is missing or its main.js cannot be loaded.
 */
export function createFailingPlugin(
	reasons: readonly string[],
): PluginDefinition {
	return definePlugin({
		detect: async () => ({ ok: false, reasons }) as Detection,
	})
}

/** Type guard for the success branch of a {@link Detection}. */
export function isDetected(
	detection: Detection,
): detection is { readonly ok: true } {
	return detection.ok
}

/** Type guard for the failure branch of a {@link Detection}. */
export function isMissed(
	detection: Detection,
): detection is { readonly ok: false; readonly reasons: readonly string[] } {
	return !detection.ok
}
