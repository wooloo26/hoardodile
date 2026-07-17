import { readdir, rm, stat } from "node:fs/promises"
import os from "node:os"
import { extname, join } from "node:path"
import type { SSEMessage } from "@fastify/sse"
import type { FileStats } from "@hoardodile/schemas"
import type { ListPageResult } from "@hoardodile/shared"
import { buildResThumbCacheKey } from "@hoardodile/shared"
import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import {
	buildTrashedFileList,
	computeTrashedFileStats,
	detectPluginForTrash,
} from "src/domain/res/trash-fallback.ts"
import {
	type AdaptiveConcurrency,
	createAdaptiveConcurrency,
} from "src/infra/adaptive-concurrency.ts"
import { assertSafeSegment } from "src/infra/storage/paths.ts"
import yazl from "yazl"
import { sendFile } from "./conditional-request.ts"
import { type PrecacheBusEvent, precacheBus } from "./precache-bus.ts"
import { extToContentType, sendError, sendJson } from "./utils.ts"

type TrashItem = {
	readonly name: string
	readonly kind: "resource" | "character" | "db"
	readonly originalId?: string
	readonly trashedAt?: number
	readonly coverUrl?: string
	readonly contentPluginId?: string
	readonly fileStats?: FileStats
	readonly files?: readonly unknown[]
}

function parseTrashEntryName(
	name: string,
): Omit<TrashItem, "coverUrl"> | undefined {
	const resourceMatch = name.match(/^resources-(.+)-(\d+)$/)
	if (resourceMatch !== null) {
		return {
			name,
			kind: "resource",
			originalId: resourceMatch[1],
			trashedAt: Number(resourceMatch[2]),
		}
	}
	const charMatch = name.match(/^characters-(.+)-(\d+)$/)
	if (charMatch !== null) {
		return {
			name,
			kind: "character",
			originalId: charMatch[1],
			trashedAt: Number(charMatch[2]),
		}
	}
	const dbMatch = name.match(/^db-(\d+)$/)
	if (dbMatch !== null) {
		return {
			name,
			kind: "db",
			trashedAt: Number(dbMatch[1]),
		}
	}
	return undefined
}

const PAGE_SIZE = 200

type SweepResult = {
	total: number
	succeeded: number
	failed: number
	errors: Array<{ id: string; error: string }>
	thumbUrls: string[]
}

type PageLoader<T> = (page: number) => Promise<ListPageResult<T>>

/**
 * Fastify plugin registering cache-clear and precache routes.
 *
 * `DELETE /api/cache` — wipe local/ resource, character, and tmp
 * directories plus all rebuildable metadata columns in the DB.
 *
 * `POST /api/precache` — rebuild all resource metadata in a single pass
 * per resource, then generate every cover, avatar, and fullbody thumbnail
 * server-side. Returns an SSE stream with progress events and the final
 * result.
 *
 * `GET /api/precache/stream` — reconnect to an already-running precache
 * or fetch its last result. Used by the client when the precache page is
 * reopened mid-run.
 */
async function cacheAdminPluginImpl(app: FastifyInstance): Promise<void> {
	const res = app.resService
	const trashDir = app.paths.local.trash()

	app.delete("/api/cache", async (_req, reply) => {
		if (precacheBus.isRunning()) {
			return sendJson(reply, 409, {
				message: "Cannot clear cache while precache is in progress",
			} as unknown as Record<string, unknown>)
		}
		const localRoot = app.paths.local.root
		await Promise.all(
			["resources", "characters", "tmp"].map((dir) =>
				rm(join(localRoot, dir), { recursive: true, force: true }).catch(
					() => {},
				),
			),
		)
		res.clearAllMeta()
		return sendJson(reply, 200, { cleared: true })
	})

	/**
	 * `GET /api/cache/trash` — list non-empty entries under `local/trash/`.
	 *
	 * Returns resource / character folders that were moved here by
	 * hard-delete, plus db folders from backup restore. Each item carries
	 * a `coverUrl` when a `.cover.*` file is found inside the folder so
	 * the client can render a thumbnail without probing further.
	 */
	app.get(
		"/api/cache/trash",
		{ config: { readOnlySafe: true } },
		async (_req, reply) => {
			const entries = await readdir(trashDir, { withFileTypes: true }).catch(
				() => [] as never[],
			)
			const items: TrashItem[] = []
			for (const entry of entries) {
				if (!entry.isDirectory()) continue
				const parsed = parseTrashEntryName(entry.name)
				if (parsed === undefined) continue
				const entryPath = join(trashDir, entry.name)
				let coverUrl: string | undefined
				try {
					const files = await readdir(entryPath)
					const coverFile = files.find((f) => /^\.cover\./i.test(f))
					if (coverFile !== undefined) {
						coverUrl = `/api/cache/trash/${encodeURIComponent(entry.name)}/files/${coverFile}`
					}
				} catch {
					// ignore unreadable folders
				}
				let contentPluginId: string | undefined
				let fileStats: FileStats | undefined
				let filesList: readonly unknown[] | undefined
				if (parsed.kind === "resource" && parsed.originalId !== undefined) {
					const id = parsed.originalId
					const deps = { paths: app.paths, pluginHooks: app.pluginHooks }
					;[contentPluginId, fileStats, filesList] = await Promise.all([
						detectPluginForTrash(deps, id).catch(() => undefined),
						computeTrashedFileStats(deps, id).catch(() => undefined),
						buildTrashedFileList(deps, id).catch(() => undefined),
					])
				}
				items.push({
					...parsed,
					coverUrl,
					contentPluginId,
					fileStats,
					files: filesList,
				})
			}
			return sendJson(reply, 200, { items })
		},
	)

	/**
	 * `GET /api/cache/trash/:name/files/*` — serve a raw file from a
	 * trash entry. Used by the trash preview to display cover images.
	 */
	app.get<{ Params: { name: string; "*": string } }>(
		"/api/cache/trash/:name/files/*",
		{ config: { readOnlySafe: true } },
		async (req, reply) => {
			let name: string
			try {
				name = assertSafeSegment(req.params.name)
			} catch (err) {
				return sendError(
					reply,
					400,
					err instanceof Error ? err.message : "invalid name",
				)
			}
			const tail = req.params["*"] ?? ""
			const segments = tail.split("/").filter(Boolean)
			for (const seg of segments) {
				try {
					assertSafeSegment(seg)
				} catch (err) {
					return sendError(
						reply,
						400,
						err instanceof Error ? err.message : "invalid path segment",
					)
				}
			}
			const filePath = join(trashDir, name, ...segments)
			const trashRoot = join(trashDir, "")
			if (!filePath.startsWith(trashRoot)) {
				return sendError(reply, 400, "path escapes trash directory")
			}
			try {
				const info = await stat(filePath)
				if (!info.isFile()) {
					return sendError(reply, 404, "not found")
				}
			} catch {
				return sendError(reply, 404, "not found")
			}
			const ext = extname(filePath).toLowerCase()
			const contentType = extToContentType(ext)
			return sendFile(reply, filePath, {
				contentType,
				cacheControl: "no-store",
			})
		},
	)

	/**
	 * `GET /api/cache/trash/:name/download` — stream a trashed folder as a
	 * zip archive for download.
	 */
	app.get<{ Params: { name: string } }>(
		"/api/cache/trash/:name/download",
		{ config: { readOnlySafe: true } },
		async (req, reply) => {
			let name: string
			try {
				name = assertSafeSegment(req.params.name)
			} catch (err) {
				return sendError(
					reply,
					400,
					err instanceof Error ? err.message : "invalid name",
				)
			}
			const entryPath = join(trashDir, name)
			const trashRoot = join(trashDir, "")
			if (!entryPath.startsWith(trashRoot)) {
				return sendError(reply, 400, "path escapes trash directory")
			}
			let entries: string[]
			try {
				entries = await readdir(entryPath)
			} catch {
				return sendError(reply, 404, "not found")
			}
			reply.header("content-type", "application/zip")
			reply.header(
				"content-disposition",
				`attachment; filename="${encodeURIComponent(name)}.zip"`,
			)
			reply.header("cache-control", "no-store")
			const zipfile = new yazl.ZipFile()
			for (const fileName of entries) {
				const filePath = join(entryPath, fileName)
				try {
					const info = await stat(filePath)
					if (!info.isFile()) continue
				} catch {
					continue
				}
				zipfile.addFile(filePath, fileName)
			}
			zipfile.end()
			return reply.send(zipfile.outputStream)
		},
	)

	app.post("/api/precache", { sse: true }, async (_req, reply) => {
		if (precacheBus.isRunning()) {
			return sendJson(reply, 409, {
				message: "Precache already in progress",
			} as unknown as Record<string, unknown>)
		}

		precacheBus.start()

		// Fire-and-forget the actual work. The work emits progress
		// events through the bus which the async generator drains below.
		const workDone = doWork(app).catch(
			(err: unknown) =>
				void precacheBus.fail(err instanceof Error ? err.message : String(err)),
		)

		async function* generateFromBus(): AsyncGenerator<SSEMessage> {
			const queue: PrecacheBusEvent[] = []
			let wake: (() => void) | null = null
			let done = false

			const unsub = precacheBus.subscribe((evt) => {
				queue.push(evt)
				if (
					evt.event === "done" ||
					evt.event === "error" ||
					evt.event === "aborted"
				)
					done = true
				wake?.()
			})

			try {
				while (!done || queue.length > 0) {
					while (queue.length > 0) {
						const item = queue.shift()!
						yield { event: item.event, data: item.data }
					}
					if (!done) {
						await new Promise<void>((r) => {
							wake = r
						})
						wake = null
					}
				}
			} finally {
				unsub()
			}
		}

		await reply.sse.send(generateFromBus())
		await workDone
	})

	app.post("/api/precache/abort", async (_req, reply) => {
		if (!precacheBus.isRunning()) {
			return sendJson(reply, 400, {
				message: "No precache in progress",
			} as unknown as Record<string, unknown>)
		}
		precacheBus.abort()
		return sendJson(reply, 200, { aborted: true })
	})

	app.get("/api/precache/stream", { sse: true }, async (_req, reply) => {
		// Fast path: terminal states already reached.
		if (precacheBus.getResult() !== null) {
			await reply.sse.send({ event: "done", data: precacheBus.getResult() })
			return
		}
		if (precacheBus.getError() !== null) {
			await reply.sse.send({
				event: "error",
				data: { message: precacheBus.getError() },
			})
			return
		}
		if (!precacheBus.isRunning()) {
			await reply.sse.send({ event: "idle", data: {} })
			return
		}

		// Precache is running: subscribe first (avoids race with finish),
		// then replay the most recent snapshot so the reconnecting client
		// sees the current state immediately.
		reply.sse.keepAlive()

		let aborted = false
		reply.sse.onClose(() => {
			aborted = true
		})

		const queue: PrecacheBusEvent[] = []
		let wake: (() => void) | null = null
		let done = false

		const unsub = precacheBus.subscribe((evt) => {
			queue.push(evt)
			if (
				evt.event === "done" ||
				evt.event === "error" ||
				evt.event === "aborted"
			)
				done = true
			wake?.()
		})

		try {
			const lp = precacheBus.getLastProgress()
			if (lp !== null && !aborted) {
				await reply.sse.send({ event: lp.event, data: lp.data })
			}

			while (!done || queue.length > 0) {
				while (queue.length > 0) {
					if (aborted) return
					const item = queue.shift()!
					try {
						await reply.sse.send({ event: item.event, data: item.data })
					} catch {
						return
					}
				}
				if (done) break
				if (aborted) return
				await new Promise<void>((r) => {
					wake = r
				})
				wake = null
			}
		} finally {
			unsub()
		}
	})
}

async function doWork(app: FastifyInstance): Promise<void> {
	const thumbs = app.thumbService
	const res = app.resService
	const chars = app.charService

	const precacheConcurrency = createAdaptiveConcurrency({
		max: os.cpus().length,
		initial: Math.max(1, os.cpus().length - 1),
	})

	let phaseEmitted = false
	const resResult = await sweepAndProcess(
		(page) => res.list({ page, size: PAGE_SIZE }),
		async (r) => {
			await res.rebuildPrecacheMeta(r.id)
			const cover = await thumbs.getCover(r.id)
			if (cover.kind === "ready") {
				await res.recordCoverMetaFromRenderedThumb(r.id, cover.path)
			} else {
				await res.rebuildCoverMeta(r.id)
			}
			const fresh = await res.detail(r.id)
			if (cover.kind === "ready") {
				const v = buildResThumbCacheKey({
					updatedAt: fresh.updatedAt,
				})
				return `/api/resources/${r.id}/cover?v=${encodeURIComponent(v)}`
			}
			return undefined
		},
		(current, total) => {
			if (!phaseEmitted) {
				precacheBus.emit("phase", { phase: "resources", total })
				phaseEmitted = true
			}
			precacheBus.emit("progress", { phase: "resources", current, total })
		},
		precacheConcurrency,
	)

	if (precacheBus.isAborted()) {
		precacheBus.emit("aborted", {})
		return
	}

	phaseEmitted = false
	const charResult = await sweepAndProcess(
		(page) => chars.list({ page, size: PAGE_SIZE }),
		async (c) => {
			const urls: string[] = []
			for (const variant of ["avatar", "fullbody"] as const) {
				const ver = await chars.getVariantVersion(c.id, variant)
				const thumb = await thumbs.getCharacterThumb(c.id, variant, ver)
				if (thumb.kind === "ready") {
					urls.push(`/api/characters/${c.id}/thumb/${variant}?v=${c.updatedAt}`)
				}
			}
			return urls
		},
		(current, total) => {
			if (!phaseEmitted) {
				precacheBus.emit("phase", { phase: "characters", total })
				phaseEmitted = true
			}
			precacheBus.emit("progress", { phase: "characters", current, total })
		},
		precacheConcurrency,
	)

	if (precacheBus.isAborted()) {
		precacheBus.emit("aborted", {})
		return
	}

	precacheBus.finish({
		resources: resResult,
		characters: charResult,
	} as Record<string, unknown>)
}

async function sweepAndProcess<T>(
	loadPage: PageLoader<T>,
	process: (item: T) => Promise<string | string[] | undefined>,
	onProgress?: (current: number, total: number) => void,
	concurrency?: AdaptiveConcurrency,
): Promise<SweepResult> {
	const result: SweepResult = {
		total: 0,
		succeeded: 0,
		failed: 0,
		errors: [],
		thumbUrls: [],
	}
	let processed = 0
	let page = 1
	for (;;) {
		if (precacheBus.isAborted()) break
		const list = await loadPage(page)
		result.total = list.total

		const promises = list.rows.map(async (item) => {
			if (precacheBus.isAborted()) return
			const release = concurrency ? await concurrency.acquire() : () => {}
			try {
				const urls = await process(item)
				if (urls !== undefined) {
					if (Array.isArray(urls)) result.thumbUrls.push(...urls)
					else result.thumbUrls.push(urls)
				}
				result.succeeded++
			} catch (err) {
				result.failed++
				result.errors.push({
					id: (item as { id: string }).id,
					error: err instanceof Error ? err.message : String(err),
				})
			} finally {
				release()
			}
			processed++
			onProgress?.(processed, list.total)
		})
		await Promise.allSettled(promises)

		if (precacheBus.isAborted()) break
		page++
		if (list.rows.length === 0 || page > 1000) break
	}
	return result
}

export const cacheAdminPlugin =
	cacheAdminPluginImpl satisfies FastifyPluginAsync
