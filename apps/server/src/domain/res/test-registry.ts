import {
	AUDIO_EXTS,
	IMAGE_EXTS,
	VIDEO_EXTS,
} from "@hoardodile/consts/media-exts"
import type {
	PluginDefinition,
	ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import {
	extname,
	naturalSort,
	probeImageFile,
	probeVideoFile,
} from "@hoardodile/plugin-sdk-server"
import type {
	PluginRegistry,
	PluginRegistryEntry,
} from "src/domain/plugin/api-types.ts"
import { buildRegistry } from "src/domain/plugin/loader.ts"

export const TEST_BUILTIN_ID = "665cfbdd-1db6-48f5-9d53-1008b8cb84c3"
export const TEST_BUILTIN_MANIFEST = {
	id: TEST_BUILTIN_ID,
	name: "Gallery",
	description: "Test builtin",
	version: "1.0.0",
	permissions: {
		sourceMeta: true,
		searchMeta: true,
		danmaku: true,
		comment: true,
		preferences: false,
		node: false,
	},
}

function createStubGalleryPlugin(): PluginDefinition<{
	readonly file: { readonly filename: string; readonly type?: string }
}> {
	return {
		detect: async () => ({ ok: true }),
		sourceMeta: buildSourceMetaGalleryStub,
		coverLocal: buildLocalCoverStub,
		listFiles: buildFileListStub,
	}
}

async function buildLocalCoverStub(
	api: ResourceAPI,
): Promise<string | undefined> {
	const files = await api.listFiles()
	for (const filename of naturalSort(files)) {
		const ext = extname(filename)
		if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) return filename
	}
	return undefined
}

async function buildFileListStub(api: ResourceAPI) {
	const files = await api.listFiles()
	const result: {
		readonly filename: string
		readonly type?: "image" | "video" | "audio"
		readonly width?: number
		readonly height?: number
		readonly preview?: boolean
	}[] = []
	for (const filename of naturalSort(files)) {
		const ext = extname(filename)
		if (IMAGE_EXTS.has(ext)) {
			const probed = await probeImageFile(api, filename)
			result.push({ filename, ...probed })
		} else if (VIDEO_EXTS.has(ext)) {
			const probed = await probeVideoFile(api, filename)
			result.push({ filename, ...probed })
		} else if (AUDIO_EXTS.has(ext)) {
			result.push({ filename, type: "audio" as const })
		}
	}
	return result
}

let metaBuildCalls = 0
let metaBuildInFlight = 0
let metaBuildPeak = 0
let metaBuildDelayMs = 0

export function resetMetaBuildTracking(): void {
	metaBuildCalls = 0
	metaBuildInFlight = 0
	metaBuildPeak = 0
	metaBuildDelayMs = 0
}

export function getMetaBuildCalls(): number {
	return metaBuildCalls
}

export function getMetaBuildPeak(): number {
	return metaBuildPeak
}

export function setMetaBuildDelay(ms: number): void {
	metaBuildDelayMs = ms
}

export async function trackMetaBuild<T>(fn: () => Promise<T>): Promise<T> {
	metaBuildCalls += 1
	metaBuildInFlight += 1
	metaBuildPeak = Math.max(metaBuildPeak, metaBuildInFlight)
	if (metaBuildDelayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, metaBuildDelayMs))
	}
	try {
		return await fn()
	} finally {
		metaBuildInFlight -= 1
	}
}

async function buildSourceMetaGalleryStub(
	_resAPI: ResourceAPI,
): Promise<unknown | undefined> {
	metaBuildCalls += 1
	metaBuildInFlight += 1
	metaBuildPeak = Math.max(metaBuildPeak, metaBuildInFlight)
	if (metaBuildDelayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, metaBuildDelayMs))
	}
	metaBuildInFlight -= 1
	return { coverKind: "image" as const, width: 1, height: 1 }
}

/**
 * Minimal PluginRegistry for tests that only need a builtin gallery plugin
 * (no detection / content-type logic).
 */
export function createTestRegistry(): PluginRegistry {
	const entry: PluginRegistryEntry = {
		id: TEST_BUILTIN_ID,
		manifest: TEST_BUILTIN_MANIFEST,
		enabled: true,
		priority: Number.MAX_SAFE_INTEGER,
		pinned: false,
		color: "",
		missing: false,
		builtin: true,
		dev: false,
		plugin: createStubGalleryPlugin(),
	}
	return buildRegistry([entry])
}
