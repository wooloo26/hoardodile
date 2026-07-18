import type {
	PluginDefinition,
	ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import type { PluginManifestId } from "@hoardodile/schemas"
import { describe, expect, test, vi } from "vitest"
import type { PluginRegistry } from "./api-types.ts"
import { createPluginHooks } from "./hooks.ts"
import { buildRegistry } from "./loader.ts"

const MANGA_ID = "11111111-1111-4111-8111-111111111111" as PluginManifestId
const GALLERY_ID = "22222222-2222-4222-8222-222222222222" as PluginManifestId
const FILE_BUILTIN_ID =
	"33333333-3333-4333-8333-333333333333" as PluginManifestId

function manifestFor(
	id: PluginManifestId,
	name: string,
	permissions: Partial<{
		sourceMeta: boolean
		searchMeta: boolean
		danmaku: boolean
		message: boolean
	}> = {},
) {
	return {
		id,
		name,
		description: "",
		version: "1.0.0",
		permissions: {
			sourceMeta: false,
			searchMeta: false,
			danmaku: false,
			message: false,
			...permissions,
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

function createHooks(registry: PluginRegistry = createRegistry()) {
	return createPluginHooks({ getRegistry: () => registry })
}

describe("plugin hooks: revalidate", () => {
	test("keeps the explicit plugin when it still matches", async () => {
		const result = await createHooks().revalidate(
			createAPI(["01.png", "02.png"]),
			MANGA_ID,
		)
		expect(result).toBe(MANGA_ID)
	})

	test("falls back from manga to gallery for a single image", async () => {
		const result = await createHooks().revalidate(
			createAPI(["page.png"]),
			MANGA_ID,
		)
		expect(result).toBe(GALLERY_ID)
	})

	test("falls back from gallery to file builtin when there is no media", async () => {
		const result = await createHooks().revalidate(
			createAPI(["notes.txt"]),
			GALLERY_ID,
		)
		expect(result).toBe(FILE_BUILTIN_ID)
	})

	test("falls back to builtin when the explicit plugin is unknown", async () => {
		const result = await createHooks().revalidate(
			createAPI(["page.png"]),
			"00000000-0000-4000-8000-000000000000" as PluginManifestId,
		)
		expect(result).toBe(FILE_BUILTIN_ID)
	})
})

describe("plugin hooks: detectFirstMatch", () => {
	test("returns the first matching plugin in priority order", async () => {
		await expect(
			createHooks().detectFirstMatch(createAPI(["01.png", "02.png"])),
		).resolves.toBe(MANGA_ID)
	})

	test("falls through to the builtin when nothing else matches", async () => {
		await expect(
			createHooks().detectFirstMatch(createAPI(["notes.txt"])),
		).resolves.toBe(FILE_BUILTIN_ID)
	})
})

describe("plugin hooks: detectForImportDir", () => {
	test("matches a non-builtin detector", async () => {
		await expect(
			createHooks().detectForImportDir(createAPI(["01.png", "02.png"])),
		).resolves.toBe(MANGA_ID)
	})

	test("falls back to builtin without invoking its detector", async () => {
		await expect(
			createHooks().detectForImportDir(createAPI(["notes.txt"])),
		).resolves.toBe(FILE_BUILTIN_ID)
	})

	test("a crashing detector is skipped instead of aborting the scan", async () => {
		const crashId = "44444444-4444-4444-8444-444444444444" as PluginManifestId
		const registry = buildRegistry([
			{
				id: crashId,
				manifest: manifestFor(crashId, "Crash"),
				enabled: true,
				priority: 10,
				pinned: false,
				color: "",
				missing: false,
				builtin: false,
				dev: false,
				plugin: {
					detect: async () => {
						throw new Error("detector exploded")
					},
				},
			},
			...createRegistry().getAll(),
		])
		await expect(
			createHooks(registry).detectForImportDir(createAPI(["01.png", "02.png"])),
		).resolves.toBe(MANGA_ID)
	})
})

describe("plugin hooks: runMetaHooks", () => {
	function createMetaRegistry(opts: {
		sourceMeta: boolean
		searchMeta: boolean
	}): PluginRegistry {
		const id = "55555555-5555-4555-8555-555555555555" as PluginManifestId
		return buildRegistry([
			{
				id,
				manifest: manifestFor(id, "Meta", opts),
				enabled: true,
				priority: 10,
				pinned: false,
				color: "",
				missing: false,
				builtin: false,
				dev: false,
				plugin: {
					detect: async () => ({ ok: true }),
					sourceMeta: async () => ({ coverKind: "image" }),
					searchMeta: async () => undefined,
				},
			},
		])
	}

	test("runs permitted hooks and reports raw results", async () => {
		const id = "55555555-5555-4555-8555-555555555555" as PluginManifestId
		const hooks = createHooks(
			createMetaRegistry({ sourceMeta: true, searchMeta: true }),
		)
		const results = await hooks.runMetaHooks(createAPI([]), id)
		expect(results.sourceMeta?.value).toEqual({ coverKind: "image" })
		// Hook ran but returned undefined — callers distinguish this from
		// "did not run" via key presence.
		expect(results.searchMeta).toBeDefined()
		expect(results.searchMeta?.value).toBeUndefined()
	})

	test("skips hooks the manifest does not permit", async () => {
		const id = "55555555-5555-4555-8555-555555555555" as PluginManifestId
		const hooks = createHooks(
			createMetaRegistry({ sourceMeta: false, searchMeta: false }),
		)
		const results = await hooks.runMetaHooks(createAPI([]), id)
		expect(results.sourceMeta).toBeUndefined()
		expect(results.searchMeta).toBeUndefined()
	})

	test("returns empty results for an unknown plugin", async () => {
		const results = await createHooks().runMetaHooks(
			createAPI([]),
			"99999999-9999-4999-8999-999999999999" as PluginManifestId,
		)
		expect(results).toEqual({})
	})

	test("a failing meta hook is logged and skipped without blocking the other", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const id = "55555555-5555-4555-8555-555555555555" as PluginManifestId
		const registry = buildRegistry([
			{
				id,
				manifest: manifestFor(id, "Meta", {
					sourceMeta: true,
					searchMeta: true,
				}),
				enabled: true,
				priority: 10,
				pinned: false,
				color: "",
				missing: false,
				builtin: false,
				dev: false,
				plugin: {
					detect: async () => ({ ok: true }),
					sourceMeta: async () => {
						throw new Error("sourceMeta exploded")
					},
					searchMeta: async () => ({ tags: ["a"] }),
				},
			},
		])
		try {
			const results = await createHooks(registry).runMetaHooks(
				createAPI([]),
				id,
			)
			expect(results.sourceMeta).toBeUndefined()
			expect(results.searchMeta?.value).toEqual({ tags: ["a"] })
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining(`sourceMeta failed for plugin ${id}`),
			)
		} finally {
			errorSpy.mockRestore()
		}
	})
})

describe("plugin hooks: buildFileList validation", () => {
	test("rejects non-scalar values in file list items", async () => {
		const id = "66666666-6666-4666-8666-666666666666" as PluginManifestId
		const registry = buildRegistry([
			{
				id,
				manifest: manifestFor(id, "Bad"),
				enabled: true,
				priority: 10,
				pinned: false,
				color: "",
				missing: false,
				builtin: false,
				dev: false,
				plugin: {
					detect: async () => ({ ok: true }),
					listFiles: async () => [{ filename: "a.png", nested: { bad: 1 } }],
				},
			},
		])
		await expect(
			createHooks(registry).buildFileList(createAPI([]), id),
		).rejects.toThrow(/invalid file list item value type/)
	})
})
