import { createReadStream } from "node:fs"
import type { FastifyReply } from "fastify"
import { parseByteRange } from "./res-files.ts"
import { sendJson } from "./utils.ts"

/** Absolute on-disk byte window for a logical file (zip entry). */
export type ByteRangeSource = {
	readonly path: string
	/** Inclusive absolute start offset inside `path`. */
	readonly start: number
	/** Inclusive absolute end offset inside `path`. */
	readonly end: number
	/** Logical content length (`end - start + 1`). */
	readonly size: number
}

/**
 * Stream bytes from `source` with HTTP Range support. Range headers are
 * interpreted relative to the logical content (`0..size-1`); stream offsets
 * are translated into absolute positions inside `source.path`.
 */
export async function sendByteRangeWithHttpRange(
	reply: FastifyReply,
	source: ByteRangeSource,
	contentType: string,
	rangeHeader: string | undefined,
): Promise<FastifyReply> {
	reply.header("accept-ranges", "bytes")
	reply.header("content-type", contentType)
	reply.header("cache-control", "private, max-age=31536000, immutable")

	if (rangeHeader === undefined || !rangeHeader.startsWith("bytes=")) {
		reply.header("content-length", String(source.size))
		if (source.size === 0) return reply.send(Buffer.alloc(0))
		return reply.send(
			createReadStream(source.path, { start: source.start, end: source.end }),
		)
	}

	const parsedRange = parseByteRange(rangeHeader, source.size)
	if (!parsedRange.ok) {
		reply.header("content-range", `bytes */${source.size}`)
		sendJson(reply, 416, { error: "invalid or unsatisfiable range" })
		return reply
	}

	const { start, end } = parsedRange
	reply.code(206)
	reply.header("content-range", `bytes ${start}-${end}/${source.size}`)
	reply.header("content-length", String(end - start + 1))
	return reply.send(
		createReadStream(source.path, {
			start: source.start + start,
			end: source.start + end,
		}),
	)
}
