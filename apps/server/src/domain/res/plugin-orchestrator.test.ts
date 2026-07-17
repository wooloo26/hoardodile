import type {
	PluginDefinition,
	ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import type { PluginManifestId } from "@hoardodile/schemas"
import type { PluginRegistry } from "src/domain/plugin/api-types.ts"
import { buildRegistry } from "src/domain/plugin/loader.ts"
import { describe, expect, test } from "vitest"
import { createPluginOrchestrator } from "./plugin-orchestrator.ts"

const MANGA_ID = "11111111-1111-4111-8111-111111111111" as PluginManifestId
const GALLERY_ID = "22222222-2222-4222-8222-222222222222" as PluginManifestId
const FILE_BUILTIN_ID =
	"33333333-3333-4333-8333-333333333333" as PluginManifestId

function manifestFor(id: PluginManifestId, name: string) {
	return {
		id,
		name,
		description: "",
		version: "1.0.0",
		permissions: {
			sourceMeta: false,
			searchMeta: false,
			danmaku: false,
			comment: false,
			preferences: false,
			node: false,
		},
	}
}

function createMangaPlugin(): PluginDefinition {
	return {
		detect: async (api: ResourceAPI) => {
			const files = await api.listFiles()
			if (files.length < 2) return { ok: false, reasons: ["page-image"] }
			const allImages = files.every((name) =>
				/\.(jpg|jpeg|png|webp|gif)$/i.test(name),
			)
			return allImages ? { ok: true } : { ok: false, reasons: ["page-image"] }
		},
	}
}

function createGalleryPlugin(): PluginDefinition {
	return {
		detect: async (api: ResourceAPI) => {
			const files = await api.listFiles()
			const hasImage = files.some((name) =>
				/\.(jpg|jpeg|png|webp|gif)$/i.test(name),
			)
			return hasImage ? { ok: true } : { ok: false, reasons: ["media-file"] }
		},
	}
}

function createFilePlugin(): PluginDefinition {
	return {
		detect: async () => ({ ok: true }) as const,
	}
}

function createRegistry(): PluginRegistry {
	return buildRegistry([
		{
			id: MANGA_ID,
			manifest: manifestFor(MANGA_ID, "Manga"),
			enabled: true,
			priority: 50,
			pinned: false,
			color: "",
			missing: false,
			builtin: false,
			dev: false,
			plugin: createMangaPlugin(),
		},
		{
			id: GALLERY_ID,
			manifest: manifestFor(GALLERY_ID, "Gallery"),
			enabled: true,
			priority: 60,
			pinned: false,
			color: "",
			missing: false,
			builtin: false,
			dev: false,
			plugin: createGalleryPlugin(),
		},
		{
			id: FILE_BUILTIN_ID,
			manifest: manifestFor(FILE_BUILTIN_ID, "File"),
			enabled: true,
			priority: Number.MAX_SAFE_INTEGER,
			pinned: false,
			color: "",
			missing: false,
			builtin: true,
			dev: false,
			plugin: createFilePlugin(),
		},
	])
}

function createAPI(files: readonly string[]): ResourceAPI {
	return {
		logInfo() {},
		logWarn() {},
		logError() {},
		listFiles: async () => files,
		readFile: async () => new Uint8Array(),
		statFile: async () => ({ sizeBytes: 0 }),
		probeImage: async () => undefined,
		probeVideo: async () => undefined,
		probeAudio: async () => undefined,
		isAnimatedImage: async () => false,
		setCover: async () => {},
		clearCover: async () => {},
		setLocalCover: async () => {},
	}
}

function createOrchestrator(files: readonly string[]) {
	const registry = createRegistry()
	return createPluginOrchestrator({
		pluginRegistry: registry,
		buildResourceAPI: async () => createAPI(files),
	})
}

describe("plugin-orchestrator revalidate", () => {
	test("keeps the explicit plugin when it still matches", async () => {
		const orchestrator = createOrchestrator(["01.png", "02.png"])
		const result = await orchestrator.revalidate("r", 1, undefined, MANGA_ID)
		expect(result).toBe(MANGA_ID)
	})

	test("falls back from manga to gallery for a single image", async () => {
		const orchestrator = createOrchestrator(["page.png"])
		const result = await orchestrator.revalidate("r", 1, undefined, MANGA_ID)
		expect(result).toBe(GALLERY_ID)
	})

	test("falls back from gallery to file builtin when there is no media", async () => {
		const orchestrator = createOrchestrator(["notes.txt"])
		const result = await orchestrator.revalidate("r", 1, undefined, GALLERY_ID)
		expect(result).toBe(FILE_BUILTIN_ID)
	})

	test("falls back to builtin when the explicit plugin is unknown", async () => {
		const orchestrator = createOrchestrator(["page.png"])
		const result = await orchestrator.revalidate(
			"r",
			1,
			undefined,
			"00000000-0000-4000-8000-000000000000" as PluginManifestId,
		)
		expect(result).toBe(FILE_BUILTIN_ID)
	})
})
