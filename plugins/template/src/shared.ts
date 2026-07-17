import type { PluginSchema } from "@hoardodile/plugin-sdk-types"

export type TemplateFile = {
	readonly filename: string
}

export type TemplateSourceMeta = {
	readonly files: readonly string[]
}

/**
 * Declared once and shared between the server definition (`definePlugin`)
 * and the web API (`definePluginAPI`) so both sides stay in sync.
 */
export interface TemplateSchema extends PluginSchema {
	readonly file: TemplateFile
	readonly sourceMeta: TemplateSourceMeta | undefined
}
