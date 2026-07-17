import type { Detection, ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type {
	CoverKind,
	FileStats,
	PluginManifestId,
	ResCard,
	Resource,
	ResourceMetaSnapshot,
	ResourceMetaType,
	SerializedFileList,
} from "@hoardodile/schemas"
import type { ListPageInput, ListPageResult } from "@hoardodile/shared"
import { conflict, isDomainError } from "@hoardodile/shared"
import { createPluginResourceAPI } from "src/domain/plugin/api.ts"
import type { PluginRegistry } from "src/domain/plugin/api-types.ts"
import type { SqliteDb } from "src/infra/db/connection.ts"
import {
	probeAnimatedImage,
	probeImage,
	probeVideo,
} from "src/infra/probes/probes.ts"
import type { MutableRef } from "src/infra/runtime-context.ts"
import {
	applyPageBounds,
	buildSoftDeleteOps,
	type ClockDeps,
	filterDefined,
	generateId,
} from "src/infra/service.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import { formatTimestamp } from "src/lib/date.ts"
import { buildResourceCoverOps } from "./cover-ops.ts"
import { buildResourceFiles } from "./files.ts"
import { buildResMetaOps } from "./meta-ops.ts"
import { createPluginOrchestrator } from "./plugin-orchestrator.ts"
import {
	buildResourceRepository,
	parseFileStats,
	type ResDbPatch,
	type ResRow,
	rowToResource,
	rowToResourceCard,
} from "./repo.ts"

import {
	buildSourceArtifactView,
	locateSourceArtifact,
	type SourceArtifactView,
} from "./source-view.ts"
import { buildTrashedFileList } from "./trash-fallback.ts"
import { buildResourceUploads, type ResUploads } from "./upload.ts"
import { createZipCdCache, type ZipCdCache } from "./zip-cd-cache.ts"

export type SetContentPluginIdResult =
	| { readonly ok: true; readonly resource: Resource }
	| {
			readonly ok: false
			readonly failure: Extract<Detection, { ok: false }>
	  }

export type ResServiceDeps = ClockDeps & {
	readonly db: SqliteDb
	readonly paths: StoragePaths
	readonly readOnly: MutableRef<boolean>
	readonly uploads?: ResUploads
	/** Process-wide zip central-directory cache. Created when omitted. */
	readonly zipCdCache?: ZipCdCache
	/** Plugin registry - required. Builtin plugin must be present. */
	readonly pluginRegistry: PluginRegistry
	/** Called when any meta is rebuilt and changed for a resource. */
	readonly onMetaUpdated?: (
		resourceId: string,
		metaTypes: ResourceMetaType[],
		meta: ResourceMetaSnapshot,
	) => void
	/** Fire-and-forget hook after a resource upload commit succeeds. */
	readonly onUploadCommitted?: (id: string) => void
}

export type ResCreateInput = {
	readonly name?: string
	/** IANA zone for the fallback name when `name` is omitted. */
	readonly defaultNameTimeZone?: string
	readonly intro?: string
	readonly contentPluginId?: PluginManifestId
	readonly tagIds?: readonly string[]
	readonly charIds?: readonly string[]
	/**
	 * Ordered list of `fileId`s previously staged via the per-file upload
	 * endpoint (`POST /api/uploads/ordered`). Each `fileId` must resolve to
	 * a staged pool file; consumed files are removed on successful commit.
	 * Mutually exclusive with {@link archiveFileId}.
	 */
	readonly files?: readonly string[]
	/**
	 * `fileId` of a single archive (zip) previously staged via
	 * `POST /api/uploads/archive`. The archive is transcoded to the
	 * canonical STORED encoding and installed as `source.hoard`.
	 * Mutually exclusive with {@link files}.
	 */
	readonly archiveFileId?: string
}

export type ResUpdateInput = {
	readonly id: string
	readonly name?: string
	readonly intro?: string
	readonly tagIds?: readonly string[]
	readonly charIds?: readonly string[]
}

export type HardDeleteResult = {
	readonly trashedPath: string
}

export type ResManyDeleteFailure = {
	readonly id: string
	readonly code: string
	readonly message: string
}

export type ResManyDeleteResult = {
	readonly okIds: readonly string[]
	readonly failures: readonly ResManyDeleteFailure[]
}

export type ResCoverStore = {
	hasCoverMeta(id: string): Promise<boolean>
	recordCoverMeta(
		id: string,
		meta: {
			readonly width?: number
			readonly height?: number
			readonly kind: CoverKind
			readonly source?: string
		},
	): Promise<void>
}

export type ResMetaScheduler = {
	hasSourceMeta(id: string): Promise<boolean>
	enqueueFullMetaRebuild(id: string): void
	enqueueFileStatsRebuild(id: string): void
	enqueuePluginMetaRebuild(id: string): void
	enqueueCoverMetaRebuild(id: string): void
	clearAllMeta(): void
	rebuildAllMeta(id: string): Promise<void>
	rebuildPrecacheMeta(id: string): Promise<void>
	rebuildCoverMeta(id: string): Promise<void>
	recordCoverMetaFromRenderedThumb(id: string, thumbPath: string): Promise<void>
	/** Wait for all background meta rebuild queues to settle. */
	drainMetaQueue(): Promise<void>
}

export type ResPreviewSource = {
	findCover(id: string): Promise<string | undefined>
	getContentPluginId(id: string): Promise<string | null>
	resolveSourceView(id: string): Promise<SourceArtifactView>
	resolveLocalCoverSource(id: string): Promise<string | undefined>
}

export type ResService = ResCoverStore &
	ResMetaScheduler &
	ResPreviewSource & {
		list(input: ListPageInput): Promise<ListPageResult<Resource>>
		listCards(input: ListPageInput): Promise<ListPageResult<ResCard>>
		trashList(input: ListPageInput): Promise<ListPageResult<Resource>>
		trashListCards(input: ListPageInput): Promise<ListPageResult<ResCard>>
		detail(id: string): Promise<Resource>
		detailCard(id: string): Promise<ResCard>
		create(input: ResCreateInput): Promise<Resource>
		update(input: ResUpdateInput): Promise<Resource>
		softDelete(id: string): Promise<Resource>
		softDeleteMany(ids: readonly string[]): Promise<ResManyDeleteResult>
		restore(id: string): Promise<Resource>
		hardDelete(id: string): Promise<HardDeleteResult>
		hardDeleteMany(ids: readonly string[]): Promise<ResManyDeleteResult>
		setContentPluginId(
			id: string,
			next: PluginManifestId,
		): Promise<SetContentPluginIdResult>
		listFiles(id: string): Promise<SerializedFileList>
		listTrashedFiles(id: string): Promise<SerializedFileList | undefined>
		listSourceRelativePaths(id: string): Promise<readonly string[]>
		setCover(id: string, ext: string, data: Buffer): Promise<Resource>
		clearCover(id: string): Promise<Resource>
		rebuildPluginMeta(id: string): Promise<void>
		getFileVersion(id: string): Promise<number>
		relatedByTags(id: string, limit: number): Promise<readonly ResCard[]>
	}

const MAX_PAGE_SIZE = 200

export function createResourceService(deps: ResServiceDeps): ResService {
	const repo = buildResourceRepository(deps.db)
	const files = buildResourceFiles(deps.paths, deps.readOnly)
	const now = deps.now ?? Date.now
	const newId = deps.newId ?? generateId
	const uploads =
		deps.uploads ??
		buildResourceUploads(
			deps.paths,
			{
				maxArchiveExtractedBytes: Number.MAX_SAFE_INTEGER,
			},
			deps.readOnly,
		)
	const pluginRegistry = deps.pluginRegistry
	const zipCdCache = deps.zipCdCache ?? createZipCdCache()
	const viewDeps = { paths: deps.paths, zipCdCache }

	// Dedupe concurrent `listFiles(id)` calls so a single archive only gets
	// probed once even under fan-out (e.g. many tabs hitting the same
	// thousand-page manga right after a cold start, before the sidecar
	// cache is populated). Cleared on settle so per-request behaviour
	// matches the cache-hit path afterwards.
	const listFilesInflight = new Map<string, Promise<SerializedFileList>>()

	async function buildResourceView(
		resId: string,
		fileVersion: number,
		_stats: FileStats | undefined,
	): Promise<SourceArtifactView> {
		const spec = await locateSourceArtifact(deps.paths, resId, fileVersion)
		return buildSourceArtifactView(viewDeps, resId, fileVersion, spec)
	}

	async function buildResourceAPI(
		resId: string,
		fileVersion: number,
		stats: FileStats | undefined,
	): Promise<ResourceAPI> {
		const view = await buildResourceView(resId, fileVersion, stats)
		return createPluginResourceAPI({
			view,
			probeImage,
			probeVideo,
			isAnimatedImage: probeAnimatedImage,
		})
	}

	const orchestrator = createPluginOrchestrator({
		pluginRegistry,
		buildResourceAPI,
	})

	const cover = buildResourceCoverOps({
		repo,
		files,
		now,
	})

	const metaOps = buildResMetaOps({
		repo,
		now,
		pluginRegistry,
		createResourceAPI: async (resId, fileVersion) => {
			const row = repo.findById(resId)
			const stats = parseFileStats(row.fileStats)
			return buildResourceAPI(resId, fileVersion, stats)
		},
		resolveSourceView: async (id) => {
			const row = repo.findById(id)
			const stats = parseFileStats(row.fileStats)
			return buildResourceView(id, row.fileVersion, stats)
		},
		findCover: cover.findCover,
		onMetaUpdated: deps.onMetaUpdated,
	})

	// Global dedup lock for rebuildAllMeta (precache path).
	// User requests via rebuildMissingMeta never wait — they run immediately
	// so UX is never blocked by a background precache job.
	const metaRebuildLocks = new Map<string, Promise<void>>()

	async function rebuildMissingMetaImpl(row: ResRow): Promise<boolean> {
		if (row.contentPluginId === null) return false
		const id = row.id
		let dirty = false
		if (row.fileStats === null) {
			await metaOps.rebuildFileStats(id)
			dirty = true
		}
		if (row.sourceMeta === null || row.searchMeta === null) {
			await metaOps.rebuildPluginMeta(id)
			dirty = true
		}
		if (row.coverMeta === null) {
			await metaOps.rebuildCoverMeta(id)
			dirty = true
		}
		return dirty
	}

	async function rebuildMissingMeta(row: ResRow): Promise<boolean> {
		// Always use the freshest row so that a concurrent precache finish
		// is visible immediately, avoiding redundant work.
		const fresh = repo.findById(row.id)
		return rebuildMissingMetaImpl(fresh)
	}

	async function lockedRebuildAllMeta(id: string): Promise<void> {
		const existing = metaRebuildLocks.get(id)
		if (existing) return existing
		const p = metaOps.rebuildAllMeta(id).finally(() => {
			metaRebuildLocks.delete(id)
		})
		metaRebuildLocks.set(id, p)
		return p
	}

	function enqueueMissingMetaRebuilds(row: ResRow): void {
		if (row.contentPluginId === null) return
		if (row.fileStats === null) metaOps.enqueueFileStatsRebuild(row.id)
		if (row.sourceMeta === null || row.searchMeta === null)
			metaOps.enqueuePluginMetaRebuild(row.id)
		if (row.coverMeta === null) metaOps.enqueueCoverMetaRebuild(row.id)
	}

	function paginateResources(
		trashed: boolean,
		input: ListPageInput,
	): ListPageResult<Resource> {
		const { page, size } = applyPageBounds(input, MAX_PAGE_SIZE)
		const { rows, total } = repo.listPage({
			trashed,
			query: input.query,
			page,
			size,
			charId: input.charId,
			noCharacters: input.noCharacters,
			tagIds: input.tagIds,
			tagMode: input.tagMode,
			sortBy: input.sortBy,
			order: input.order,
			random: input.random,
			contentPluginId: input.contentPluginId,
			searchMetaFacets: input.searchMetaFacets,
			searchIntro: input.searchIntro,
		})
		for (const row of rows) {
			enqueueMissingMetaRebuilds(row)
		}
		return { rows: rows.map(rowToResource), total, page, size }
	}

	function paginateResourceCards(
		trashed: boolean,
		input: ListPageInput,
	): ListPageResult<ResCard> {
		const { page, size } = applyPageBounds(input, MAX_PAGE_SIZE)
		const { rows, total } = repo.listCardPage({
			trashed,
			query: input.query,
			page,
			size,
			charId: input.charId,
			noCharacters: input.noCharacters,
			tagIds: input.tagIds,
			tagMode: input.tagMode,
			sortBy: input.sortBy,
			order: input.order,
			random: input.random,
			contentPluginId: input.contentPluginId,
			searchMetaFacets: input.searchMetaFacets,
			searchIntro: input.searchIntro,
		})
		for (const row of rows) {
			enqueueMissingMetaRebuilds(row)
		}
		return {
			rows: rows.map(rowToResourceCard),
			total,
			page,
			size,
		}
	}

	async function create(input: ResCreateInput): Promise<Resource> {
		const id = newId()
		const ts = now()
		const name =
			input.name !== undefined && input.name.length > 0
				? input.name
				: formatTimestamp(ts, input.defaultNameTimeZone ?? "UTC")
		repo.insert(
			id,
			{
				name,
				intro: input.intro ?? "",
				contentPluginId: input.contentPluginId ?? null,
				tagIds: input.tagIds ?? [],
				charIds: input.charIds ?? [],
			},
			ts,
			deps.paths.latestVersion,
		)
		// Make the per-resource versions directory exist immediately so
		// downstream features (permanent cover writes, manual file drops
		// before first upload) have a stable target. Source artifacts
		// land under this dir on commit; the dir itself is cheap and the
		// rest of the service treats its existence as the post-create
		// invariant.
		await files.ensureFolder(id)
		try {
			if (input.files !== undefined && input.files.length > 0) {
				await applyStagedSource(id, input.files, input.contentPluginId)
				return rowToResource(repo.findById(id))
			}
			if (input.archiveFileId !== undefined) {
				await applyStagedArchive(id, input.archiveFileId, input.contentPluginId)
				return rowToResource(repo.findById(id))
			}
			return rowToResource(repo.findById(id))
		} catch (err) {
			repo.remove(id)
			await files.removeFolder(id)
			throw err
		}
	}

	function update(input: ResUpdateInput): Resource {
		repo.findById(input.id)
		const fields: ResDbPatch = {
			...filterDefined({ name: input.name, intro: input.intro }),
			updatedAt: now(),
		}
		repo.patch(input.id, fields, {
			tagIds: input.tagIds,
			charIds: input.charIds,
		})
		return rowToResource(repo.findById(input.id))
	}

	const softDeleteOps = buildSoftDeleteOps({
		entity: "resource",
		repo,
		mapper: rowToResource,
		now,
	})

	function softDelete(id: string): Resource {
		return softDeleteOps.softDelete(id)
	}

	function restore(id: string): Resource {
		return softDeleteOps.restore(id)
	}

	async function hardDelete(id: string): Promise<HardDeleteResult> {
		const row = repo.findById(id)
		if (row.deletedAt === null) {
			throw conflict(
				"resource.hard_delete_requires_trash",
				`resource ${id} must be soft-deleted first`,
				{ id },
			)
		}
		const filesLiveOnlyInPastArchive =
			row.fileVersion < deps.paths.latestVersion
		let trashedPath: string
		if (filesLiveOnlyInPastArchive) {
			trashedPath = await files.markDeleted(id)
		} else {
			trashedPath = await files.moveFolderToTrash(id)
		}
		await files.clearLocalDerivatives(id).catch(() => {})
		zipCdCache.invalidate(id, row.fileVersion)
		repo.remove(id)
		return { trashedPath }
	}

	function dedupeResourceIds(ids: readonly string[]): string[] {
		const seen = new Set<string>()
		const out: string[] = []
		for (const id of ids) {
			if (seen.has(id)) continue
			seen.add(id)
			out.push(id)
		}
		return out
	}

	async function softDeleteMany(
		ids: readonly string[],
	): Promise<ResManyDeleteResult> {
		const okIds: string[] = []
		const failures: ResManyDeleteFailure[] = []
		for (const id of dedupeResourceIds(ids)) {
			try {
				softDelete(id)
				okIds.push(id)
			} catch (err) {
				failures.push(toManyDeleteFailure(id, err))
			}
		}
		return { okIds, failures }
	}

	async function hardDeleteMany(
		ids: readonly string[],
	): Promise<ResManyDeleteResult> {
		const okIds: string[] = []
		const failures: ResManyDeleteFailure[] = []
		for (const id of dedupeResourceIds(ids)) {
			try {
				await hardDelete(id)
				okIds.push(id)
			} catch (err) {
				failures.push(toManyDeleteFailure(id, err))
			}
		}
		return { okIds, failures }
	}

	function toManyDeleteFailure(id: string, err: unknown): ResManyDeleteFailure {
		if (isDomainError(err)) {
			return { id, code: err.code, message: err.message }
		}
		if (err instanceof Error) {
			return {
				id,
				code: "UNKNOWN",
				message: err.message,
			}
		}
		return { id, code: "UNKNOWN", message: String(err) }
	}

	async function listSourceRelativePaths(
		id: string,
	): Promise<readonly string[]> {
		const row = repo.findById(id)
		const stats = parseFileStats(row.fileStats)
		try {
			const view = await buildResourceView(id, row.fileVersion, stats)
			return view.listEntries()
		} catch {
			return []
		}
	}

	async function listResourceFiles(id: string): Promise<SerializedFileList> {
		const cached = await files.readFilesCache(id)
		if (cached !== undefined) return cached as SerializedFileList

		const existing = listFilesInflight.get(id)
		if (existing !== undefined) return existing

		const work = computeAndCacheFiles(id)
		listFilesInflight.set(id, work)
		try {
			return await work
		} finally {
			listFilesInflight.delete(id)
		}
	}

	async function resolveLocalCoverSource(
		id: string,
	): Promise<string | undefined> {
		const row = repo.findById(id)
		if (row.contentPluginId === null) return undefined
		const stats = parseFileStats(row.fileStats)
		return orchestrator.resolveLocalCoverSource(
			id,
			row.fileVersion,
			stats,
			row.contentPluginId,
		)
	}

	async function computeAndCacheFiles(id: string): Promise<SerializedFileList> {
		const row = repo.findById(id)
		const stats = parseFileStats(row.fileStats)
		try {
			await buildResourceView(id, row.fileVersion, stats)
		} catch {
			return []
		}

		const api = await buildResourceAPI(id, row.fileVersion, stats)

		// If the owning plugin provides buildFileList, delegate to it.
		if (row.contentPluginId !== null) {
			const pluginResult = await orchestrator.buildFileList(
				id,
				row.fileVersion,
				stats,
				row.contentPluginId,
			)
			if (pluginResult !== undefined) {
				await files.writeFilesCache(id, pluginResult).catch(() => {})
				return pluginResult
			}
		}

		// Default: bare filename entries.
		const names = [...(await api.listFiles())].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
		)
		await files.writeFilesCache(id, names).catch(() => {})
		return names
	}

	/**
	 * Commit an ordered resource from the global single-file staging pool.
	 * On failure the staged pool files are left in place so the client can
	 * retry the commit (or delete them via the per-file DELETE endpoint).
	 */
	async function applyStagedSource(
		id: string,
		fileIds: readonly string[],
		explicitPluginId: PluginManifestId | undefined,
	): Promise<Resource> {
		repo.findById(id)
		await uploads.commitOrderedByIds(id, fileIds)
		const row = repo.findById(id)
		zipCdCache.invalidate(id, row.fileVersion)
		const newStats: FileStats = { count: 1 }
		repo.patchMeta(
			id,
			{
				fileStats: JSON.stringify(newStats),
				sourceMeta: null,
				coverMeta: null,
			},
			now(),
		)
		await files.clearLocalDerivatives(id).catch(() => {})
		if (explicitPluginId !== undefined) {
			await revalidateExplicitPlugin(id)
		} else {
			await detectAndAssignPlugin(id)
		}
		metaOps.enqueueFullMetaRebuild(id)
		deps.onUploadCommitted?.(id)
		repo.patch(id, { updatedAt: now() })
		return rowToResource(repo.findById(id))
	}

	/**
	 * Commit a resource whose source is a single staged archive (zip).
	 * Mirrors {@link applyStagedSource} but consumes a staged archive by
	 * `fileId` instead of an ordered `fileId` list.
	 */
	async function applyStagedArchive(
		id: string,
		archiveFileId: string,
		explicitPluginId: PluginManifestId | undefined,
	): Promise<Resource> {
		repo.findById(id)
		await uploads.commitArchiveById(id, archiveFileId)
		const row = repo.findById(id)
		zipCdCache.invalidate(id, row.fileVersion)
		const newStats: FileStats = { count: 1 }
		repo.patchMeta(
			id,
			{
				fileStats: JSON.stringify(newStats),
				sourceMeta: null,
				coverMeta: null,
			},
			now(),
		)
		await files.clearLocalDerivatives(id).catch(() => {})
		if (explicitPluginId !== undefined) {
			await revalidateExplicitPlugin(id)
		} else {
			await detectAndAssignPlugin(id)
		}
		metaOps.enqueueFullMetaRebuild(id)
		deps.onUploadCommitted?.(id)
		repo.patch(id, { updatedAt: now() })
		return rowToResource(repo.findById(id))
	}

	/**
	 * Run all enabled plugins' detectors in priority order and assign
	 * the first match. The builtin plugin always runs last and always
	 * matches, so this should never fail.
	 */
	async function detectAndAssignPlugin(id: string): Promise<void> {
		const row = repo.findById(id)
		const stats = parseFileStats(row.fileStats)
		const matchedId = await orchestrator.detectFirstMatch(
			id,
			row.fileVersion,
			stats,
		)
		if (row.contentPluginId !== matchedId) {
			repo.patch(id, { contentPluginId: matchedId })
		}
	}

	/**
	 * Re-validate after upload when the user set an explicit plugin:
	 * check if that plugin's detector still passes. If not, fall back
	 * to the builtin plugin.
	 */
	async function revalidateExplicitPlugin(id: string): Promise<void> {
		const row = repo.findById(id)
		if (row.contentPluginId === null) return
		const stats = parseFileStats(row.fileStats)
		const validatedId = await orchestrator.revalidate(
			id,
			row.fileVersion,
			stats,
			row.contentPluginId,
		)
		if (validatedId !== row.contentPluginId) {
			repo.patch(id, {
				contentPluginId: validatedId,
				updatedAt: now(),
			})
			metaOps.enqueueFullMetaRebuild(id)
		}
	}

	async function detail(id: string): Promise<Resource> {
		const row = repo.findById(id)
		const dirty = await rebuildMissingMeta(row)
		return rowToResource(dirty ? repo.findById(id) : row)
	}

	async function setContentPluginId(
		id: string,
		next: PluginManifestId,
	): Promise<SetContentPluginIdResult> {
		const row = repo.findById(id)
		if (row.contentPluginId === next) {
			return { ok: true, resource: rowToResource(row) }
		}
		const stats = parseFileStats(row.fileStats)
		const result = await orchestrator.detectForPlugin(
			id,
			row.fileVersion,
			stats,
			next,
		)
		if (!result.ok) {
			return { ok: false, failure: result }
		}
		repo.patch(id, { contentPluginId: next, updatedAt: now() })
		await clearDerivedMeta(id)
		metaOps.enqueueFullMetaRebuild(id)
		return {
			ok: true,
			resource: rowToResource(repo.findById(id)),
		}
	}

	async function clearDerivedMeta(id: string): Promise<void> {
		repo.patchMeta(
			id,
			{
				sourceMeta: null,
				coverMeta: null,
				searchMeta: null,
			},
			now(),
		)
		await files.clearLocalDerivatives(id).catch(() => {})
	}

	async function setCover(
		id: string,
		ext: string,
		data: Buffer,
	): Promise<Resource> {
		repo.findById(id)
		const latestVersion = deps.paths.latestVersion
		await files.writeCover(id, latestVersion, ext, data)
		await files.clearLocalDerivatives(id).catch(() => {})
		repo.patch(id, {
			coverVersion: latestVersion,
			updatedAt: now(),
		})
		metaOps.enqueueCoverMetaRebuild(id)
		return rowToResource(repo.findById(id))
	}

	async function clearCover(id: string): Promise<Resource> {
		repo.findById(id)
		const latestVersion = deps.paths.latestVersion
		await files.deleteCover(id, latestVersion)
		await files.clearLocalDerivatives(id).catch(() => {})
		repo.patch(id, {
			coverVersion: latestVersion,
			updatedAt: now(),
		})
		repo.patchMeta(id, { coverMeta: null }, now())
		metaOps.enqueueCoverMetaRebuild(id)
		return rowToResource(repo.findById(id))
	}

	return {
		list: async (input) => paginateResources(false, input),
		listCards: async (input) => paginateResourceCards(false, input),
		trashList: async (input) => paginateResources(true, input),
		trashListCards: async (input) => paginateResourceCards(true, input),
		detail,
		detailCard: async (id: string): Promise<ResCard> => {
			const row = repo.findCardById(id)
			const dirty = await rebuildMissingMeta(row)
			return rowToResourceCard(dirty ? repo.findCardById(id) : row)
		},
		create,
		update: async (input) => update(input),
		softDelete: async (id) => softDelete(id),
		softDeleteMany,
		restore: async (id) => restore(id),
		hardDelete,
		hardDeleteMany,
		setContentPluginId,
		hasCoverMeta: cover.hasCoverMeta,
		recordCoverMeta: cover.recordCoverMeta,
		findCover: cover.findCover,
		setCover,
		clearCover,
		hasSourceMeta: async (id) => {
			const row = repo.findById(id)
			return row.sourceMeta !== null
		},
		rebuildPluginMeta: metaOps.rebuildPluginMeta,
		enqueueFullMetaRebuild: metaOps.enqueueFullMetaRebuild,
		enqueueFileStatsRebuild: metaOps.enqueueFileStatsRebuild,
		enqueuePluginMetaRebuild: metaOps.enqueuePluginMetaRebuild,
		enqueueCoverMetaRebuild: metaOps.enqueueCoverMetaRebuild,
		clearAllMeta: repo.clearAllMeta,
		rebuildAllMeta: lockedRebuildAllMeta,
		rebuildPrecacheMeta: metaOps.rebuildPrecacheMeta,
		rebuildCoverMeta: metaOps.rebuildCoverMeta,
		recordCoverMetaFromRenderedThumb: metaOps.recordCoverMetaFromRenderedThumb,
		drainMetaQueue: metaOps.drainQueue,
		listFiles: listResourceFiles,
		listTrashedFiles: async (id: string) =>
			buildTrashedFileList(
				{ paths: deps.paths, pluginRegistry, zipCdCache },
				id,
			),
		listSourceRelativePaths,
		resolveSourceView: async (id) => {
			const row = repo.findById(id)
			const stats = parseFileStats(row.fileStats)
			return buildResourceView(id, row.fileVersion, stats)
		},
		getContentPluginId: async (id) => {
			const row = repo.findById(id)
			return row.contentPluginId ?? null
		},
		getFileVersion: async (id) => repo.findById(id).fileVersion,
		relatedByTags: async (id, limit) => relatedByTags(id, limit),
		resolveLocalCoverSource,
	}

	function relatedByTags(id: string, limit: number): readonly ResCard[] {
		if (limit <= 0) return []
		const seed = repo.findById(id)
		const seedTags = seed.tagIds
		if (seedTags.length === 0) return []
		const seedTagSet = new Set(seedTags)
		const CANDIDATE_CAP = 200
		const { rows } = repo.listCardPage({
			trashed: false,
			query: undefined,
			page: 1,
			size: CANDIDATE_CAP,
			tagIds: [...seedTags],
			tagMode: "or",
			sortBy: "updated",
			order: "desc",
		})
		const scored = rows
			.filter((r) => r.id !== id)
			.map((r) => {
				let overlap = 0
				for (const tagId of r.tagIds) {
					if (seedTagSet.has(tagId)) overlap++
				}
				return { row: r, overlap }
			})
			.filter((s) => s.overlap > 0)
		scored.sort((a, b) => {
			if (a.overlap !== b.overlap) return b.overlap - a.overlap
			return b.row.updatedAt - a.row.updatedAt
		})
		return scored.slice(0, limit).map((s) => rowToResourceCard(s.row))
	}
}
