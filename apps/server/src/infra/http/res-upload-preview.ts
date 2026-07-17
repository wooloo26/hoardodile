import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import type {
	FastifyInstance,
	FastifyPluginAsync,
	FastifyReply,
	FastifyRequest,
} from "fastify"
import { resolveFfmpegPaths } from "src/infra/thumb/ffmpeg.ts"
import { generateUploadPreview } from "src/infra/thumb/preview.ts"
import { sendFile } from "./conditional-request.ts"
import { replyWithDomainError } from "./reply-with-domain-error.ts"
import { sendJson } from "./utils.ts"

/**
 * Staged file preview endpoint.
 *
 * GET /api/uploads/staged/:fileId/preview
 *   Generates a downscaled preview for a single file staged in the global
 *   pool (per-file ordered upload). The file is located by `fileId`.
 */
async function resUploadPreviewPluginImpl(app: FastifyInstance): Promise<void> {
	const uploads = app.resUploads
	const ffmpeg = resolveFfmpegPaths()
	const paths = app.paths

	app.get(
		"/api/uploads/staged/:fileId/preview",
		{ config: { readOnlySafe: true } },
		async (req, reply) => {
			const { fileId } = req.params as { fileId: string }

			const sourcePath = await uploads.resolveStagedFile(fileId)
			if (sourcePath === undefined) {
				return sendJson(reply, 404, {
					error: "staged file not found",
					kind: "resource.upload_preview_file_not_found",
				})
			}

			return generateAndSendPreview(
				req,
				reply,
				sourcePath,
				paths.local.tmp(),
				ffmpeg,
			)
		},
	)
}

/**
 * Shared preview generation: write a downscaled rendition into a per-request
 * tmp dir, stream it back, and clean up. Errors are translated to domain
 * HTTP responses.
 */
async function generateAndSendPreview(
	req: FastifyRequest,
	reply: FastifyReply,
	sourcePath: string,
	tmpBase: string,
	ffmpeg: Awaited<ReturnType<typeof resolveFfmpegPaths>>,
) {
	const tmpId = randomUUID()
	const tmpDir = join(tmpBase, "upload-previews", tmpId)
	const previewPath = join(tmpDir, "preview")

	try {
		await mkdir(tmpDir, { recursive: true })
		const { path: finalPreviewPath, contentType } = await generateUploadPreview(
			sourcePath,
			previewPath,
			ffmpeg,
		)
		return sendFile(reply, finalPreviewPath, {
			contentType,
			cacheControl: "no-store",
		})
	} catch (err) {
		req.log.warn({ err }, "staging preview generation failed")
		return replyWithDomainError(reply, err)
	} finally {
		rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	}
}

export const resUploadPreviewPlugin =
	resUploadPreviewPluginImpl satisfies FastifyPluginAsync
