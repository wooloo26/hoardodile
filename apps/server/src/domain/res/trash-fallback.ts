import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import type {
	FileStats,
	PluginManifestId,
	SerializedFileList,
} from "@hoardodile/schemas"
import { createPluginResourceAPI } from "src/domain/plugin/api.ts"
import type { PluginRegistry } from "src/domain/plugin/api-types.ts"
import {
	probeAnimatedImage,
	probeImage,
	probeVideo,
} from "src/infra/probes/probes.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import { createPluginOrchestrator } from "./plugin-orchestrator.ts"
import type { SourceArtifactView, SourceViewDeps } from "./source-view.ts"
import { buildSourceArtifactView } from "./source-view.ts"
import { createZipCdCache } from "./zip-cd-cache.ts"

export type TrashFallbackDeps = {
	readonly paths: StoragePaths
	readonly pluginRegistry: PluginRegistry
	readonly zipCdCache?: SourceViewDeps["zipCdCache"]
}

function buildTrashedSpec(
	trashPath: string,
):
	| { readonly kind: "zip"; readonly archivePath: string }
	| { readonly kind: "empty" } {
	const archivePath = join(trashPath, "source.hoard")
	return { kind: "zip", archivePath }
}

export async function findTrashedResourcePath(
	paths: StoragePaths,
	id: string,
): Promise<string | undefined> {
	const trashDir = paths.local.trash()
	const entries = await readdirSafe(trashDir)
	const prefix = `resources-${id}-`
	for (const entry of entries) {
		if (entry.startsWith(prefix)) {
			return join(trashDir, entry)
		}
	}
	return undefined
}

export async function buildTrashedArtifactView(
	deps: TrashFallbackDeps,
	id: string,
): Promise<SourceArtifactView | undefined> {
	const trashPath = await findTrashedResourcePath(deps.paths, id)
	if (trashPath === undefined) return undefined
	const spec = buildTrashedSpec(trashPath)
	if (spec.kind === "empty") return undefined
	try {
		const s = await stat(spec.archivePath)
		if (!s.isFile()) return undefined
	} catch {
		return undefined
	}
	return buildSourceArtifactView(
		{ paths: deps.paths, zipCdCache: deps.zipCdCache ?? createZipCdCache() },
		id,
		0,
		spec,
	)
}

export async function detectPluginForTrash(
	deps: TrashFallbackDeps,
	id: string,
): Promise<PluginManifestId | undefined> {
	const view = await buildTrashedArtifactView(deps, id)
	if (view === undefined) return undefined
	const api = createPluginResourceAPI({
		view,
		probeImage,
		probeVideo,
		isAnimatedImage: probeAnimatedImage,
	})
	const orchestrator = createPluginOrchestrator({
		pluginRegistry: deps.pluginRegistry,
		buildResourceAPI: async () => api,
	})
	try {
		return await orchestrator.detectFirstMatch(id, 0, undefined)
	} catch {
		return undefined
	}
}

export async function buildTrashedFileList(
	deps: TrashFallbackDeps,
	id: string,
): Promise<SerializedFileList | undefined> {
	const view = await buildTrashedArtifactView(deps, id)
	if (view === undefined) return undefined
	const api = createPluginResourceAPI({
		view,
		probeImage,
		probeVideo,
		isAnimatedImage: probeAnimatedImage,
	})
	const orchestrator = createPluginOrchestrator({
		pluginRegistry: deps.pluginRegistry,
		buildResourceAPI: async () => api,
	})
	let contentPluginId: PluginManifestId
	try {
		contentPluginId = await orchestrator.detectFirstMatch(id, 0, undefined)
	} catch {
		return undefined
	}
	const pluginResult = await orchestrator.buildFileList(
		id,
		0,
		undefined,
		contentPluginId,
	)
	if (pluginResult !== undefined) return pluginResult
	const names = [...(await api.listFiles())].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
	)
	return names
}

export async function computeTrashedFileStats(
	deps: TrashFallbackDeps,
	id: string,
): Promise<FileStats | undefined> {
	const view = await buildTrashedArtifactView(deps, id)
	if (view === undefined) return undefined
	let sizeBytes = 0
	let count = 0
	try {
		const entries = await view.listEntries()
		count = entries.length
		for (const name of entries) {
			const range = await view.resolveByteRange(name)
			if (range !== undefined) sizeBytes += range.size
		}
	} catch {
		return undefined
	}
	return { sizeBytes, count }
}

async function readdirSafe(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true })
		return entries.filter((e) => e.isDirectory()).map((e) => e.name)
	} catch {
		return []
	}
}
