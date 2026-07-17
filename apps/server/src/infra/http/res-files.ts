import { createReadStream } from "node:fs"
import { extname } from "node:path"
import { DOWNLOAD_CONTENT_TYPES } from "@hoardodile/consts/media-exts"
import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { buildTrashedArtifactView } from "src/domain/res/trash-fallback.ts"
import { assertSafeSegment } from "src/infra/storage/paths.ts"
import yazl from "yazl"
import {
	buildAttachmentContentDisposition,
	bulkPackFolderName,
	resourceDownloadDisposition,
} from "./attachment-filename.ts"
import { sendFile } from "./conditional-request.ts"
import {
	forwardDomainError,
	imageFormatContentType,
	sendError,
} from "./utils.ts"

type Params = { id: string; "*": string }
type Querystring = { size?: string }

const resFileQuerySchema = {
	type: "object",
	properties: {
		size: { type: "string", enum: ["preview"] },
	},
} as const

const resFileParamsSchema = {
	type: "object",
	properties: {
		id: { type: "string", minLength: 1, maxLength: 255 },
	},
	required: ["id"],
} as const

const MAX_BULK_PACK_IDS = 150

const bulkSourceZipBodySchema = {
	type: "object",
	properties: {
		ids: {
			type: "array",
			items: { type: "string", minLength: 1, maxLength: 255 },
			minItems: 1,
			maxItems: MAX_BULK_PACK_IDS,
		},
		sortByCreated: { type: "boolean" },
		dateStamp: {
			type: "string",
			pattern: "^\\d{4}-\\d{2}-\\d{2}$",
			description:
				"Calendar date (YYYY-MM-DD) in the user's IANA zone for the ZIP filename.",
		},
	},
	required: ["ids", "dateStamp"],
} as const

type BulkSourceZipBody = {
	readonly ids: readonly string[]
	readonly sortByCreated?: boolean
	readonly dateStamp: string
}

/**
 * Fastify plugin registering a range-capable GET route for resource
 * binaries. The route sits behind the enclosing `protectedHttpPlugin`
 * auth hook and the server-level LAN guard.
 *
 * The on-disk source is always a STORED `source.hoard` archive (entries
 * served via direct byte-range reads into the zip). This layer
 * translates HTTP `Range` headers into windows over
 * `view.resolveByteRange(filename)`.
 */
async function resFilesPluginImpl(app: FastifyInstance): Promise<void> {
	const service = app.resService

	app.post<{ Body: BulkSourceZipBody }>(
		"/api/resources/bulk-source.zip",
		{
			schema: { body: bulkSourceZipBodySchema },
			config: { readOnlySafe: true },
		},
		async (req, reply) => {
			const sortByCreated = req.body.sortByCreated !== false
			const rawIds = req.body.ids
			const ids = dedupePreserveOrder(rawIds)
			let safeIds: string[]
			try {
				safeIds = ids.map((id) => assertSafeSegment(id))
			} catch (err) {
				return sendError(
					reply,
					400,
					err instanceof Error ? err.message : "invalid id",
				)
			}
			type BulkPackRow = {
				readonly id: string
				readonly name: string
				readonly entries: readonly string[]
				readonly view: Awaited<ReturnType<typeof service.resolveSourceView>>
				readonly createdAt: number
				readonly folder: string
			}
			type BulkPackRowInput = Omit<BulkPackRow, "folder">
			const rows: BulkPackRowInput[] = []
			for (const id of safeIds) {
				let detail: Awaited<ReturnType<typeof service.detail>>
				try {
					detail = await service.detail(id)
				} catch (err) {
					return forwardDomainError(reply, err)
				}
				let view: Awaited<ReturnType<typeof service.resolveSourceView>>
				try {
					view = await service.resolveSourceView(id)
				} catch (err) {
					return forwardDomainError(reply, err)
				}
				const entries = await view.listEntries()
				rows.push({
					id,
					name: detail.name,
					entries,
					view,
					createdAt: detail.createdAt,
				})
			}
			const ordered = sortByCreated
				? [...rows].sort((a, b) => {
						if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
						return a.id.localeCompare(b.id)
					})
				: rows
			const resources: BulkPackRow[] = ordered.map((r, i) => ({
				...r,
				folder: bulkPackFolderName(i + 1, r.id, r.name),
			}))
			let totalFiles = 0
			for (const r of resources) totalFiles += r.entries.length
			if (totalFiles === 0) {
				return sendError(
					reply,
					400,
					"no source files in selection",
					"resource.bulk_pack_empty",
				)
			}
			const dateStamp = req.body.dateStamp
			const bulkUtf8 = `hoardodile-resources-${dateStamp}.zip`
			reply.header("content-type", "application/zip")
			reply.header(
				"content-disposition",
				buildAttachmentContentDisposition({ utf8Filename: bulkUtf8 }),
			)
			reply.header("cache-control", "no-store")
			const zipfile = new yazl.ZipFile()
			for (const r of resources) {
				for (const rel of r.entries) {
					const range = await r.view.resolveByteRange(rel)
					if (range === undefined) continue
					const zipPath = `${r.folder}/${rel.replace(/\\/g, "/")}`
					if (range.size === 0) {
						zipfile.addBuffer(Buffer.alloc(0), zipPath, { compress: false })
						continue
					}
					zipfile.addReadStream(
						createReadStream(range.path, {
							start: range.start,
							end: range.end,
						}),
						zipPath,
						{ compress: false, size: range.size },
					)
				}
			}
			zipfile.end()
			return reply.send(zipfile.outputStream)
		},
	)

	app.get<{ Params: { id: string } }>(
		"/api/resources/:id/source.zip",
		{
			schema: {
				params: {
					type: "object",
					properties: {
						id: { type: "string", minLength: 1, maxLength: 255 },
					},
					required: ["id"],
				} as const,
			},
			config: { readOnlySafe: true },
		},
		async (req, reply) => {
			let id: string
			try {
				id = assertSafeSegment(req.params.id)
			} catch (err) {
				return sendError(
					reply,
					400,
					err instanceof Error ? err.message : "invalid id",
				)
			}
			let resName: string
			let view: Awaited<ReturnType<typeof service.resolveSourceView>>
			try {
				const resource = await service.detail(id)
				resName = resource.name
				view = await service.resolveSourceView(id)
			} catch (err) {
				const trashedView = await buildTrashedArtifactView(
					{
						paths: app.paths,
						pluginHooks: app.pluginHooks,
					},
					id,
				)
				if (trashedView === undefined) {
					return forwardDomainError(reply, err)
				}
				resName = id
				view = trashedView
			}
			reply.header("content-type", "application/zip")
			reply.header(
				"content-disposition",
				resourceDownloadDisposition(id, resName, ".zip"),
			)
			reply.header("cache-control", "private, max-age=31536000, immutable")
			if (view.kind === "zip") {
				// On-disk artifact is `source.hoard` (STORED zip contents
				// under our project-specific extension); stream it
				// byte-for-byte. The download still arrives as `.zip` for
				// the client thanks to the Content-Type / Content-Disposition
				// headers set above - zip tooling reads the magic bytes,
				// not the on-disk filename.
				return reply.send(createReadStream(view.artifactPath))
			}
			const entries = await view.listEntries()
			if (entries.length === 0) {
				return sendError(
					reply,
					404,
					"source not found",
					"resource.source_not_found",
				)
			}
			const zipfile = new yazl.ZipFile()
			for (const name of entries) {
				const r = await view.resolveByteRange(name)
				if (r === undefined) continue
				if (r.size === 0) {
					zipfile.addBuffer(Buffer.alloc(0), name, { compress: false })
					continue
				}
				zipfile.addReadStream(
					createReadStream(r.path, { start: r.start, end: r.end }),
					name,
					{ compress: false, size: r.size },
				)
			}
			zipfile.end()
			return reply.send(zipfile.outputStream)
		},
	)

	app.get<{ Params: Params; Querystring: Querystring }>(
		"/api/resources/:id/files/*",
		{
			schema: {
				params: resFileParamsSchema,
				querystring: resFileQuerySchema,
			},
			config: { readOnlySafe: true },
		},
		async (req, reply) => {
			const parsed = parseParams(req.params)
			if (!parsed.ok) return sendError(reply, parsed.code, parsed.message)
			const { id, filename, ext } = parsed
			let resName: string
			let view: Awaited<ReturnType<typeof service.resolveSourceView>>
			try {
				const resource = await service.detail(id)
				resName = resource.name
				view = await service.resolveSourceView(id)
			} catch (err) {
				const trashedView = await buildTrashedArtifactView(
					{
						paths: app.paths,
						pluginHooks: app.pluginHooks,
					},
					id,
				)
				if (trashedView === undefined) {
					return forwardDomainError(reply, err)
				}
				resName = id
				view = trashedView
			}

			if (req.query.size === "preview") {
				const result = await app.thumbService.getFilePreview(id, filename)
				if (result.kind === "unavailable") {
					return sendError(
						reply,
						404,
						"no preview size",
						"resource.file_not_found",
					)
				}
				return sendFile(reply, result.path, {
					contentType: imageFormatContentType(result.format),
					cacheControl: "private, max-age=31536000, immutable",
				})
			}

			const range = await view.resolveByteRange(filename)
			if (range === undefined) {
				return sendError(
					reply,
					404,
					"file not found",
					"resource.file_not_found",
				)
			}
			const contentType =
				DOWNLOAD_CONTENT_TYPES[ext] ?? "application/octet-stream"
			reply.header("accept-ranges", "bytes")
			reply.header("content-type", contentType)
			reply.header(
				"content-disposition",
				resourceDownloadDisposition(id, resName, ext),
			)
			reply.header("cache-control", "private, max-age=31536000, immutable")

			const rangeHeader = req.headers.range
			if (rangeHeader === undefined || !rangeHeader.startsWith("bytes=")) {
				reply.header("content-length", String(range.size))
				if (range.size === 0) return reply.send(Buffer.alloc(0))
				return reply.send(
					createReadStream(range.path, { start: range.start, end: range.end }),
				)
			}
			const parsedRange = parseByteRange(rangeHeader, range.size)
			if (!parsedRange.ok) {
				reply.header("content-range", `bytes */${range.size}`)
				return sendError(
					reply,
					416,
					"invalid or unsatisfiable range",
					"resource.range_not_satisfiable",
				)
			}
			const { start, end } = parsedRange
			reply.code(206)
			reply.header("content-range", `bytes ${start}-${end}/${range.size}`)
			reply.header("content-length", String(end - start + 1))
			return reply.send(
				createReadStream(range.path, {
					start: range.start + start,
					end: range.start + end,
				}),
			)
		},
	)
}

export const resFilesPlugin = resFilesPluginImpl satisfies FastifyPluginAsync

function dedupePreserveOrder(ids: readonly string[]): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const id of ids) {
		if (seen.has(id)) continue
		seen.add(id)
		out.push(id)
	}
	return out
}

type ParsedParams =
	| {
			readonly ok: true
			readonly id: string
			readonly filename: string
			readonly ext: string
	  }
	| { readonly ok: false; readonly code: number; readonly message: string }

function parseParams(raw: Params): ParsedParams {
	try {
		const id = assertSafeSegment(raw.id)
		const tail = raw["*"] ?? ""
		if (tail.length === 0) {
			return { ok: false, code: 400, message: "filename is required" }
		}
		const segments = tail.split("/")
		for (const seg of segments) assertSafeSegment(seg)
		const filename = segments.join("/")
		const ext = extname(filename).toLowerCase()
		return { ok: true, id, filename, ext }
	} catch (err) {
		return {
			ok: false,
			code: 400,
			message: err instanceof Error ? err.message : "invalid path segment",
		}
	}
}

type ParsedRange =
	| { readonly ok: true; readonly start: number; readonly end: number }
	| { readonly ok: false }

/**
 * Parse a single-range `bytes=start-end` header. Multi-range requests
 * are treated as unsatisfiable; the upstream playback / download
 * clients we care about always ask for a single contiguous range.
 */
export function parseByteRange(header: string, totalSize: number): ParsedRange {
	const value = header.slice("bytes=".length)
	if (value.includes(",")) return { ok: false }
	const dash = value.indexOf("-")
	if (dash === -1) return { ok: false }
	const startRaw = value.slice(0, dash).trim()
	const endRaw = value.slice(dash + 1).trim()
	if (totalSize === 0) return { ok: false }
	if (startRaw.length === 0 && endRaw.length === 0) return { ok: false }
	if (startRaw.length === 0) {
		const suffix = Number(endRaw)
		if (!Number.isFinite(suffix) || suffix <= 0) return { ok: false }
		const length = Math.min(suffix, totalSize)
		return { ok: true, start: totalSize - length, end: totalSize - 1 }
	}
	const start = Number(startRaw)
	if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
		return { ok: false }
	}
	if (endRaw.length === 0) {
		return { ok: true, start, end: totalSize - 1 }
	}
	const end = Number(endRaw)
	if (!Number.isFinite(end) || end < start) return { ok: false }
	return { ok: true, start, end: Math.min(end, totalSize - 1) }
}
