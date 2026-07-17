import { createReadStream, existsSync } from "node:fs"
import { stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { FastifyReply } from "fastify"
import { replyNotModified } from "./http/conditional-request.ts"

/**
 * AVIF streamed when a resource or character thumbnail cannot be synthesised.
 * Resolved relative to this module so it works under `vite-node` (source tree)
 * and after Rollup (chunks under `dist/chunks/`).
 *
 * Build copies `apps/server/assets/` into `dist/assets/` so deployments that
 * only ship `dist/` still find the file next to chunks.
 */
export function thumbFallbackAvifPath(): string {
	const dir = dirname(fileURLToPath(import.meta.url))
	const nextToDistChunks = join(dir, "../assets/fallback.avif")
	const serverRootAssets = join(dir, "../../assets/fallback.avif")
	if (existsSync(nextToDistChunks)) return nextToDistChunks
	return serverRootAssets
}

/**
 * Streams the shared AVIF placeholder with ETag-based conditional caching
 * matching the semantics of synthesised thumbnails (max-age=60, 304 on match).
 */
export async function sendThumbFallbackImage(
	reply: FastifyReply,
	headers: Readonly<Record<string, string | string[] | undefined>>,
): Promise<FastifyReply> {
	const fallbackPath = thumbFallbackAvifPath()
	const info = await stat(fallbackPath)
	if (replyNotModified(reply, headers, info)) return reply
	reply.header("content-type", "image/avif")
	reply.header("content-length", String(info.size))
	reply.header("cache-control", "private, max-age=60")
	return reply.send(createReadStream(fallbackPath))
}
