import { extname } from "node:path"
import type { Readable } from "node:stream"
import { extToMediaType } from "@hoardodile/consts/media-exts"
import {
	ANIMATED_AREA_DIVISOR,
	RESOURCE_COVER_MAX_AREA,
} from "@hoardodile/consts/res-consts"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type {
	CoverKind,
	FileStats,
	ResourceMetaSnapshot,
	ResourceMetaType,
} from "@hoardodile/schemas"
import sharp from "sharp"
import type { PluginRegistry } from "src/domain/plugin/api-types.ts"
import { createCapabilityGuard } from "src/domain/plugin/capability-guard.ts"
import { createKeyedTaskQueue } from "src/infra/keyed-task-queue.ts"
import { probeImageSource, probeVideo } from "src/infra/probes/probes.ts"
import { fitInsideArea } from "src/infra/thumb/pipeline.ts"
import type { ResRepository, ResRow } from "./repo.ts"
import {
	parseCoverMeta,
	parseFileStats,
	parseSearchMeta,
	parseSourceMeta,
} from "./repo.ts"
import { aggregateSourceFiles } from "./source-meta.ts"
import type { SourceArtifactView } from "./source-view.ts"

export type ResMetaOpsDeps = {
	readonly repo: ResRepository
	readonly now: () => number
	readonly pluginRegistry?: PluginRegistry
	readonly createResourceAPI: (
		resId: string,
		fileVersion: number,
	) => Promise<ResourceAPI>
	readonly resolveSourceView: (id: string) => Promise<SourceArtifactView>
	readonly findCover: (id: string) => Promise<string | undefined>
	readonly onMetaUpdated?: (
		id: string,
		types: ResourceMetaType[],
		meta: ResourceMetaSnapshot,
	) => void
}

export type ResMetaOps = {
	readonly rebuildFileStats: (id: string) => Promise<void>
	readonly enqueueFileStatsRebuild: (id: string) => void
	readonly rebuildPluginMeta: (id: string) => Promise<void>
	readonly enqueuePluginMetaRebuild: (id: string) => void
	readonly rebuildCoverMeta: (id: string) => Promise<void>
	readonly enqueueCoverMetaRebuild: (id: string) => void
	readonly enqueueFullMetaRebuild: (id: string) => void
	readonly rebuildAllMeta: (id: string) => Promise<void>
	readonly rebuildPrecacheMeta: (id: string) => Promise<void>
	readonly recordCoverMetaFromRenderedThumb: (
		id: string,
		thumbPath: string,
	) => Promise<void>
	/** Wait for all background meta rebuild queues to settle. */
	readonly drainQueue: () => Promise<void>
}

export function buildResMetaOps(deps: ResMetaOpsDeps): ResMetaOps {
	const {
		repo,
		now,
		pluginRegistry,
		createResourceAPI,
		resolveSourceView,
		findCover,
		onMetaUpdated,
	} = deps

	const fileStatsQueue = createKeyedTaskQueue()
	const pluginMetaQueue = createKeyedTaskQueue()
	const coverMetaQueue = createKeyedTaskQueue()
	const guard = createCapabilityGuard()

	// -- Unified patch + notify wrapper --

	function buildMetaSnapshot(
		patch: Record<string, string | null>,
	): ResourceMetaSnapshot {
		const snapshot: ResourceMetaSnapshot = {}
		if ("coverMeta" in patch) {
			snapshot.coverMeta =
				patch.coverMeta === null
					? null
					: (parseCoverMeta(patch.coverMeta) ?? null)
		}
		if ("sourceMeta" in patch) {
			snapshot.sourceMeta =
				patch.sourceMeta === null
					? null
					: (parseSourceMeta(patch.sourceMeta) ?? null)
		}
		if ("searchMeta" in patch) {
			snapshot.searchMeta =
				patch.searchMeta === null
					? null
					: (parseSearchMeta(patch.searchMeta) ?? null)
		}
		if ("fileStats" in patch) {
			snapshot.fileStats =
				patch.fileStats === null
					? null
					: (parseFileStats(patch.fileStats) ?? null)
		}
		return snapshot
	}

	function applyMetaPatch(
		id: string,
		patch: Record<string, string | null>,
	): void {
		const row = repo.findById(id)
		const actual: Record<string, string | null> = {}
		for (const [key, value] of Object.entries(patch)) {
			if ((row as Record<string, unknown>)[key] !== value) {
				actual[key] = value
			}
		}
		const keys = Object.keys(actual)
		if (keys.length === 0) return
		repo.patchMeta(id, actual, now())
		onMetaUpdated?.(id, keys as ResourceMetaType[], buildMetaSnapshot(actual))
	}

	// -- Inner compute helpers (pure, no DB writes, no error handling) --

	function thumbnailDims(
		info: { readonly width?: number; readonly height?: number } | undefined,
		animated: boolean,
	): { readonly width: number; readonly height: number } | undefined {
		if (info?.width === undefined || info?.height === undefined)
			return undefined
		const maxArea = animated
			? Math.floor(RESOURCE_COVER_MAX_AREA / ANIMATED_AREA_DIVISOR)
			: RESOURCE_COVER_MAX_AREA
		return fitInsideArea(info.width, info.height, maxArea)
	}

	async function probeCoverDims(
		source: string | Readable,
		ext: string,
	): Promise<{
		readonly width?: number
		readonly height?: number
		readonly kind: ReturnType<typeof extToMediaType>
	}> {
		const kind = extToMediaType(ext)
		if (kind === "video") {
			const info =
				typeof source === "string"
					? await probeVideo(source)
					: await probeVideo(source, ext)
			const dims = thumbnailDims(info, false)
			return { width: dims?.width, height: dims?.height, kind }
		}
		if (kind === "audio") {
			return { kind }
		}
		const probe = await probeImageSource(source, ext)
		if (probe === undefined) return { kind }
		const dims = thumbnailDims(probe, probe.animated)
		return { width: dims?.width, height: dims?.height, kind }
	}

	async function computeFileStats(
		row: ResRow,
		api: ResourceAPI,
	): Promise<Record<string, string | null>> {
		const partial = await aggregateSourceFiles(api)
		if (partial === undefined) return {}
		const existing = parseFileStats(row.fileStats) ?? {}
		const merged: FileStats = {
			...existing,
			sizeBytes: partial.sizeBytes,
			count: partial.count,
		}
		const nextJson = JSON.stringify(merged)
		return row.fileStats !== nextJson ? { fileStats: nextJson } : {}
	}

	async function computePluginMeta(
		row: ResRow,
		api: ResourceAPI,
	): Promise<Record<string, string | null>> {
		const entry = pluginRegistry?.getById(row.contentPluginId!)
		const patch: Record<string, string | null> = {}

		if (
			entry !== undefined &&
			guard.check(entry.manifest, "sourceMeta") &&
			entry.plugin.sourceMeta !== undefined
		) {
			const meta = await entry.plugin.sourceMeta(api)
			if (meta !== undefined) {
				const nextJson = JSON.stringify(meta)
				if (row.sourceMeta !== nextJson) patch.sourceMeta = nextJson
			}
		}

		if (
			entry !== undefined &&
			guard.check(entry.manifest, "searchMeta") &&
			entry.plugin.searchMeta !== undefined
		) {
			const meta = await entry.plugin.searchMeta(api)
			const nextJson = meta === undefined ? null : JSON.stringify(meta)
			if (row.searchMeta !== nextJson) patch.searchMeta = nextJson
		}

		return patch
	}

	async function resolveSourceCoverSemantics(
		id: string,
		row: ResRow,
		api: ResourceAPI | undefined,
	): Promise<
		| {
				readonly kind: ReturnType<typeof extToMediaType>
				readonly source: string
				readonly width?: number
				readonly height?: number
		  }
		| undefined
	> {
		const entry = pluginRegistry?.getById(row.contentPluginId!)
		if (entry?.plugin.coverLocal === undefined || api === undefined) {
			return undefined
		}

		let sourceFile: string | undefined
		try {
			sourceFile = await entry.plugin.coverLocal(api)
		} catch (err) {
			console.warn(
				`[meta-ops] coverLocal for ${id}: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
		if (sourceFile === undefined) return undefined

		const view = await resolveSourceView(id)
		const { stream } = await view.openEntryStream(sourceFile)
		const ext = extname(sourceFile)
		const probed = await probeCoverDims(stream, ext)
		return {
			kind: probed.kind,
			source: sourceFile,
			width: probed.width,
			height: probed.height,
		}
	}

	async function computeCoverMeta(
		id: string,
		row: ResRow,
		api?: ResourceAPI,
	): Promise<Record<string, string | null>> {
		const sharedCoverPath = await findCover(id)
		let displayWidth: number | undefined
		let displayHeight: number | undefined
		if (sharedCoverPath !== undefined) {
			const ext = extname(sharedCoverPath)
			const probed = await probeCoverDims(sharedCoverPath, ext)
			displayWidth = probed.width
			displayHeight = probed.height
		}

		const semantics = await resolveSourceCoverSemantics(id, row, api)
		if (semantics !== undefined) {
			return {
				coverMeta: JSON.stringify({
					width: displayWidth ?? semantics.width,
					height: displayHeight ?? semantics.height,
					kind: semantics.kind,
					source: semantics.source,
				}),
			}
		}

		if (sharedCoverPath !== undefined) {
			return {
				coverMeta: JSON.stringify({
					width: displayWidth,
					height: displayHeight,
					kind: "image",
				}),
			}
		}

		return { coverMeta: null }
	}

	// -- Public rebuild functions --

	async function rebuildFileStats(id: string): Promise<void> {
		const row = repo.findById(id)
		if (row.contentPluginId === null) return
		const api = await createResourceAPI(id, row.fileVersion)
		const patch = await computeFileStats(row, api)
		applyMetaPatch(id, patch)
	}

	async function rebuildPluginMeta(id: string): Promise<void> {
		const row = repo.findById(id)
		if (row.contentPluginId === null) return
		const api = await createResourceAPI(id, row.fileVersion)
		const patch = await computePluginMeta(row, api)
		applyMetaPatch(id, patch)
	}

	async function rebuildCoverMeta(id: string): Promise<void> {
		const row = repo.findById(id)
		const api =
			row.contentPluginId !== null
				? await createResourceAPI(id, row.fileVersion)
				: undefined
		const patch = await computeCoverMeta(id, row, api)
		applyMetaPatch(id, patch)
	}

	async function rebuildAllMeta(id: string): Promise<void> {
		const row = repo.findById(id)

		if (row.contentPluginId === null) {
			const patch: Record<string, null> = {}
			if (row.fileStats !== null) patch.fileStats = null
			if (row.sourceMeta !== null) patch.sourceMeta = null
			if (row.searchMeta !== null) patch.searchMeta = null
			if (row.coverMeta !== null) patch.coverMeta = null
			applyMetaPatch(id, patch)
			return
		}

		const api = await createResourceAPI(id, row.fileVersion)
		const patch: Record<string, string | null> = {}

		const run = async (
			label: string,
			fn: () => Promise<Record<string, string | null>>,
		) => {
			try {
				Object.assign(patch, await fn())
			} catch (err) {
				console.warn(
					`[meta-ops] ${label} for ${id}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		await run("fileStats", () => computeFileStats(row, api))
		await run("pluginMeta", () => computePluginMeta(row, api))
		await run("coverMeta", () => computeCoverMeta(id, row, api))

		applyMetaPatch(id, patch)
	}

	async function rebuildPrecacheMeta(id: string): Promise<void> {
		const row = repo.findById(id)

		if (row.contentPluginId === null) {
			const patch: Record<string, null> = {}
			if (row.fileStats !== null) patch.fileStats = null
			if (row.sourceMeta !== null) patch.sourceMeta = null
			if (row.searchMeta !== null) patch.searchMeta = null
			applyMetaPatch(id, patch)
			return
		}

		const api = await createResourceAPI(id, row.fileVersion)
		const patch: Record<string, string | null> = {}

		const run = async (
			label: string,
			fn: () => Promise<Record<string, string | null>>,
		) => {
			try {
				Object.assign(patch, await fn())
			} catch (err) {
				console.warn(
					`[meta-ops] ${label} for ${id}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		await run("fileStats", () => computeFileStats(row, api))
		await run("pluginMeta", () => computePluginMeta(row, api))
		applyMetaPatch(id, patch)
	}

	async function recordCoverMetaFromRenderedThumb(
		id: string,
		thumbPath: string,
	): Promise<void> {
		const row = repo.findById(id)
		const thumbMeta = await sharp(thumbPath).metadata()
		if (thumbMeta.width === undefined || thumbMeta.height === undefined) {
			return
		}

		const sharedCoverPath = await findCover(id)
		let kind: CoverKind = "image"
		let source: string | undefined

		if (sharedCoverPath === undefined && row.contentPluginId !== null) {
			const entry = pluginRegistry?.getById(row.contentPluginId)
			if (entry?.plugin.coverLocal !== undefined) {
				const api = await createResourceAPI(id, row.fileVersion)
				try {
					source = await entry.plugin.coverLocal(api)
				} catch (err) {
					console.warn(
						`[meta-ops] coverLocal for ${id}: ${err instanceof Error ? err.message : String(err)}`,
					)
				}
				if (source !== undefined) {
					const mediaKind = extToMediaType(extname(source))
					if (mediaKind !== "audio") kind = mediaKind
				}
			}
		}

		applyMetaPatch(id, {
			coverMeta: JSON.stringify({
				width: thumbMeta.width,
				height: thumbMeta.height,
				kind,
				...(source !== undefined ? { source } : {}),
			}),
		})
	}

	// -- Enqueue wrappers --

	function enqueueFileStatsRebuild(id: string): void {
		fileStatsQueue.enqueue(id, () =>
			rebuildFileStats(id).catch((err) => {
				console.warn(
					`[meta-ops] fileStats rebuild for ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}),
		)
	}

	function enqueuePluginMetaRebuild(id: string): void {
		pluginMetaQueue.enqueue(id, () =>
			rebuildPluginMeta(id).catch((err) => {
				console.warn(
					`[meta-ops] pluginMeta rebuild for ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}),
		)
	}

	function enqueueCoverMetaRebuild(id: string): void {
		coverMetaQueue.enqueue(id, () =>
			rebuildCoverMeta(id).catch((err) => {
				console.warn(
					`[meta-ops] coverMeta rebuild for ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}),
		)
	}

	function enqueueFullMetaRebuild(id: string): void {
		enqueueFileStatsRebuild(id)
		enqueuePluginMetaRebuild(id)
		enqueueCoverMetaRebuild(id)
	}

	async function drainQueue(): Promise<void> {
		await Promise.all([
			fileStatsQueue.drain(),
			pluginMetaQueue.drain(),
			coverMetaQueue.drain(),
		])
	}

	return {
		rebuildFileStats,
		enqueueFileStatsRebuild,
		rebuildPluginMeta,
		enqueuePluginMetaRebuild,
		rebuildCoverMeta,
		enqueueCoverMetaRebuild,
		enqueueFullMetaRebuild,
		rebuildAllMeta,
		rebuildPrecacheMeta,
		recordCoverMetaFromRenderedThumb,
		drainQueue,
	}
}
