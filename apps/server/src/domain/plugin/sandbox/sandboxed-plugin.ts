import {
	definePlugin,
	type PluginDefinition,
	type ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import type { HookName } from "./protocol.ts"

export type InvokeFn = (hook: HookName, api: ResourceAPI) => Promise<unknown>

/**
 * Build a contract-compliant {@link PluginDefinition} that forwards hooks
 * into a sandboxed worker. Only hooks the plugin actually implements are
 * exposed — presence is semantic (orchestrators branch on e.g.
 * `plugin.listFiles === undefined`).
 */
export function createSandboxedPlugin(
	hooks: readonly HookName[],
	invoke: InvokeFn,
): PluginDefinition {
	// RPC boundary: hook signatures share the shape `(api) => Promise<unknown>`;
	// the concrete return type is enforced by the plugin contract at runtime.
	const definition: Record<string, (api: ResourceAPI) => Promise<unknown>> = {}
	for (const hook of hooks) {
		definition[hook] = (api: ResourceAPI) => invoke(hook, api)
	}
	if (definition.detect === undefined) {
		definition.detect = async () => ({
			ok: false,
			reasons: ["plugin does not implement detect()"],
		})
	}
	return definePlugin(definition as unknown as PluginDefinition)
}
