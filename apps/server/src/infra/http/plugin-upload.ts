import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify"
import { buildPluginUploads } from "src/domain/plugin/upload.ts"
import { extractZipInto } from "src/domain/res/archive.ts"
import { sendJson } from "./utils.ts"

async function pluginUploadPluginImpl(app: FastifyInstance): Promise<void> {
	const uploads = buildPluginUploads({
		pluginsDir: app.paths.local.plugins(),
		extractZip: extractZipInto,
		maxExtractedBytes: app.env.PLUGIN_UPLOAD_MAX_BYTES,
	})

	app.post("/api/plugin-upload", async (req, reply) => {
		if (!req.isMultipart()) {
			return sendError(
				reply,
				415,
				"expected multipart/form-data",
				"plugin.upload_not_multipart",
			)
		}

		const declaredLen = Number(req.headers["content-length"])
		if (
			Number.isFinite(declaredLen) &&
			declaredLen > app.env.PLUGIN_UPLOAD_MAX_BYTES
		) {
			return sendError(
				reply,
				413,
				"plugin upload exceeds maximum size",
				"plugin.upload_too_large",
			)
		}

		let archivePath: string | undefined

		try {
			// local/tmp is cleaned (not created) at boot and only mkdir'd
			// lazily by other flows; ensure it exists before writing.
			await mkdir(app.paths.local.tmp(), { recursive: true })
			for await (const partRaw of req.parts()) {
				const part = partRaw as MultipartPart
				if (part.type === "field") continue
				if (part.fieldname === "archive") {
					archivePath = `${app.paths.local.tmp()}/plugin-upload-${Date.now()}.zip`
					await pipeline(
						part.file,
						makeByteLimiter(app.env.PLUGIN_UPLOAD_MAX_BYTES),
						createWriteStream(archivePath),
					)
				} else {
					for await (const _ of part.file) {
						// drain unknown fields
					}
				}
			}

			if (archivePath === undefined) {
				return sendError(
					reply,
					400,
					"plugin upload requires an archive file part",
					"plugin.upload_no_archive",
				)
			}

			const pluginId = await uploads.installFromZip(
				createReadStream(archivePath),
			)

			// Trigger rescan to load the newly installed plugin
			await app.pluginLoader.rescan()

			return reply.send({ pluginId })
		} catch (err) {
			if (err instanceof UploadTooLargeError) {
				return sendError(
					reply,
					413,
					"plugin upload exceeds maximum size",
					"plugin.upload_too_large",
				)
			}
			return replyWithDomainError(reply, err)
		} finally {
			if (archivePath !== undefined) {
				await rm(archivePath, { force: true }).catch(() => {})
			}
		}
	})
}

export const pluginUploadPlugin =
	pluginUploadPluginImpl satisfies FastifyPluginAsync

type MultipartPart =
	| {
			readonly type: "field"
			readonly fieldname: string
			readonly value: unknown
	  }
	| {
			readonly type: "file"
			readonly fieldname: string
			readonly filename: string
			readonly file: NodeJS.ReadableStream
	  }

function sendError(
	reply: FastifyReply,
	code: number,
	message: string,
	kind?: string,
): FastifyReply {
	sendJson(
		reply,
		code,
		kind !== undefined ? { error: message, kind } : { error: message },
	)
	return reply
}

function replyWithDomainError(reply: FastifyReply, err: unknown): FastifyReply {
	if (err instanceof Error && "code" in err) {
		const code = (err as { code?: unknown }).code
		// DomainError carries `kind` directly; a wrapped error carries it
		// on `cause`. Accept both so clients get the machine-readable kind.
		const ownKind = (err as { kind?: unknown }).kind
		const cause = (err as { cause?: { kind?: unknown } }).cause
		const kind =
			typeof ownKind === "string"
				? ownKind
				: cause !== undefined && typeof cause.kind === "string"
					? cause.kind
					: undefined
		if (code === "NOT_FOUND")
			return sendError(reply, 404, err.message, kind ?? "plugin.not_found")
		if (code === "VALIDATION") return sendError(reply, 400, err.message, kind)
	}
	reply.log.error({ err }, "plugin upload failed")
	return sendError(reply, 500, "internal error")
}

class UploadTooLargeError extends Error {
	constructor() {
		super("plugin upload exceeds maximum size")
		this.name = "UploadTooLargeError"
	}
}

/**
 * Fail the pipeline once more than `maxBytes` flow through. Same pattern
 * as the character-image upload limiter: multipart's own limits only
 * truncate silently, so we enforce the cap ourselves and map it to 413.
 */
function makeByteLimiter(maxBytes: number): Transform {
	let seen = 0
	return new Transform({
		transform(chunk: Buffer, _enc, cb) {
			seen += chunk.length
			if (seen > maxBytes) {
				cb(new UploadTooLargeError())
				return
			}
			cb(null, chunk)
		},
	})
}
