import {
	type Detection,
	definePlugin,
	type ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import type { NovelSchema } from "./shared"

const TEXT_EXTS = new Set([".txt", ".md", ".epub"])

export default definePlugin<NovelSchema>({
	detect,
})

async function detect(api: ResourceAPI): Promise<Detection> {
	const files = await api.listFiles()
	const hasText = files.some((name) => {
		const dot = name.lastIndexOf(".")
		if (dot === -1) return false
		return TEXT_EXTS.has(name.slice(dot).toLowerCase())
	})
	return hasText ? { ok: true } : { ok: false, reasons: ["text-file"] }
}
