import { z } from "zod"

export const pluginManifestId = z.string().uuid()
export type PluginManifestId = z.infer<typeof pluginManifestId>

export const pluginPermissions = z.object({
	sourceMeta: z.boolean().default(false),
	searchMeta: z.boolean().default(false),
	danmaku: z.boolean().default(false),
	message: z.boolean().default(false),
})
export type PluginPermissions = z.infer<typeof pluginPermissions>

export const localeString = z.record(z.string(), z.string())

export const iconRef = z.string().min(1)
export type IconRef = z.infer<typeof iconRef>

const templateValue = z.string()

const coverKindUi = z.object({
	tl: z.array(templateValue).optional(),
	tr: z.array(templateValue).optional(),
	bl: z.array(templateValue).optional(),
	br: z.array(templateValue).optional(),
})

const coverKindUiMap = z.object({
	image: coverKindUi.optional(),
	video: coverKindUi.optional(),
	audio: coverKindUi.optional(),
	default: coverKindUi.optional(),
})

export const searchKind = z.object({
	key: z.string().min(1),
	label: z.string().min(1),
	icon: templateValue.optional(),
})
export type SearchKind = z.infer<typeof searchKind>

const searchUi = z.object({
	kinds: z.array(searchKind),
})

const messageUi = z.object({
	/**
	 * Template string for message anchor chip labels. Rendered by the
	 * host's template engine. Supports `{{data.field}}`, `{{duration(ms)}}`,
	 * `{{inc(n)}}`, `{{t('key')}}`, etc.
	 */
	anchor: z.string().min(1).optional(),
})

export const pluginManifestUi = z.object({
	height: z.string().min(1).optional(),
	card: coverKindUiMap.optional(),
	search: searchUi.optional(),
	message: messageUi.optional(),
})
export type PluginManifestUi = z.infer<typeof pluginManifestUi>
export type CoverKindUi = z.infer<typeof coverKindUi>
export type CoverKindUiMap = z.infer<typeof coverKindUiMap>

export const pluginManifest = z.object({
	id: pluginManifestId,
	name: z.string().min(1),
	description: z.string().min(1),
	icon: iconRef.optional(),
	version: z.string().min(1),
	permissions: pluginPermissions,
	cache: z.boolean().optional(),
	i18n: z.record(z.string(), localeString).optional(),
	ui: pluginManifestUi.optional(),
})
export type PluginManifest = z.infer<typeof pluginManifest>

export const detectSuccess = z.object({ ok: z.literal(true) })
export const detectFailure = z.object({
	ok: z.literal(false),
	missing: z.array(z.string()),
})
export const detectResult = z.discriminatedUnion("ok", [
	detectSuccess,
	detectFailure,
])
export type DetectSuccess = z.infer<typeof detectSuccess>
export type DetectFailure = z.infer<typeof detectFailure>
export type DetectResult = z.infer<typeof detectResult>
