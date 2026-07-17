import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { definePlugin, hasExt } from "@hoardodile/plugin-sdk-server"
import { extname } from "@hoardodile/plugin-sdk-server/helpers"
import type { TemplateSchema, TemplateSourceMeta } from "./shared"

/**
 * The template claims every resource that contains at least one `.hdtpl`
 * file. Replace this with your own detection logic — see the composable
 * detectors (`hasExt`, `hasName`, `minFiles`, `all`, `any`, `not`).
 */
const TEMPLATE_EXTS = new Set([".hdtpl"])

export default definePlugin<TemplateSchema>({
	detect: hasExt(TEMPLATE_EXTS),
	sourceMeta: buildSourceMeta,
})

async function buildSourceMeta(api: ResourceAPI): Promise<TemplateSourceMeta> {
	const files = await api.listFiles()
	return { files: files.filter((name) => TEMPLATE_EXTS.has(extname(name))) }
}
