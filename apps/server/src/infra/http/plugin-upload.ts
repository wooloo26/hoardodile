import { createReadStream, createWriteStream } from "node:fs"
import { rm } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify"
import { buildPluginUploads } from "src/domain/plugin/upload.ts"
import { sendJson } from "./utils.ts"

async function pluginUploadPluginImpl(app: FastifyInstance): Promise<void> {
	const uploads = buildPluginUploads({ pluginsDir: app.paths.local.plugins() })

	app.post("/api/plugin-upload", async (req, reply) => {
		if (!req.isMultipart()) {
			return sendError(
				reply,
				415,
				"expected multipart/form-data",
				"plugin.upload_not_multipart",
			)
		}

		let archivePath: string | undefined

		try {
			for await (const partRaw of req.parts()) {
				const part = partRaw as MultipartPart
				if (part.type === "field") continue
				if (part.fieldname === "archive") {
					archivePath = `${app.paths.local.tmp()}/plugin-upload-${Date.now()}.zip`
					await pipeline(part.file, createWriteStream(archivePath))
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
		const cause = (err as { cause?: { kind?: unknown } }).cause
		const kind =
			cause !== undefined && typeof cause.kind === "string"
				? cause.kind
				: undefined
		if (code === "NOT_FOUND")
			return sendError(reply, 404, err.message, kind ?? "plugin.not_found")
		if (code === "VALIDATION") return sendError(reply, 400, err.message, kind)
	}
	reply.log.error({ err }, "plugin upload failed")
	return sendError(reply, 500, "internal error")
}
