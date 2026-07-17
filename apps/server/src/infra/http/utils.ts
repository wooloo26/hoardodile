import { isDomainError } from "@hoardodile/shared"
import type { FastifyReply } from "fastify"
import { assertSafeSegment } from "src/infra/storage/paths.ts"

/**
 * Send a JSON response with an explicit status code. Centralised so every
 * HTTP route plugin emits the same `application/json` content-type without
 * relying on Fastify's serializer auto-detection.
 */
export function sendJson(
	reply: FastifyReply,
	code: number,
	body: Record<string, unknown>,
): void {
	reply.code(code).type("application/json").send(body)
}

/**
 * Send a uniform error envelope: `{ error: message }` or, when a
 * domain-specific kind is available, `{ error: message, kind }`.
 */
export function sendError(
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

/**
 * Map a thrown service-layer error onto an HTTP response. Domain errors
 * carry a stable `code` discriminant; anything else is logged and surfaces
 * as a generic 500. The optional `notFoundKind` lets callers brand the
 * `kind` on `NOT_FOUND` so the client can localise the message.
 *
 * @param reply - Fastify reply to send through.
 * @param err - Caught error, expected to be a `DomainError` for the typed branches.
 * @param notFoundKind - Optional override for the `kind` field on 404s.
 */
export function forwardDomainError(
	reply: FastifyReply,
	err: unknown,
	notFoundKind?: string,
): FastifyReply {
	if (isDomainError(err)) {
		if (err.code === "NOT_FOUND") {
			return sendError(reply, 404, err.message, notFoundKind ?? err.kind)
		}
		if (err.code === "FORBIDDEN") return sendError(reply, 403, err.message)
		if (err.code === "VALIDATION") return sendError(reply, 400, err.message)
		if (err.code === "CONFLICT") return sendError(reply, 409, err.message)
	}
	reply.log.error({ err }, "request failed")
	return sendError(reply, 500, "internal error")
}

/**
 * Parse a path-parameter `id` through {@link assertSafeSegment}. Returns
 * `undefined` and writes a 400 response when the segment is unsafe, so
 * route handlers can short-circuit with `if (id === undefined) return reply`.
 */
export function parseSafeIdParam(
	reply: FastifyReply,
	raw: string,
): string | undefined {
	try {
		return assertSafeSegment(raw)
	} catch (err) {
		sendError(
			reply,
			400,
			err instanceof Error ? err.message : "invalid path segment",
		)
		return undefined
	}
}

export const resThumbParamsSchema = {
	type: "object",
	properties: {
		id: { type: "string", minLength: 1, maxLength: 255 },
	},
	required: ["id"],
} as const

/**
 * Map a {@link ThumbFormat} onto its IANA media type so route handlers
 * can set `content-type` without an inline ternary.
 */
export function imageFormatContentType(format: "webp" | "avif"): string {
	return format === "avif" ? "image/avif" : "image/webp"
}

/**
 * Map a file extension (with or without leading dot) to its IANA media type.
 * Covers the still-image formats accepted for character images and plugin assets.
 * Falls back to `application/octet-stream` for unknown extensions.
 */
export function extToContentType(ext: string): string {
	const e = ext.startsWith(".") ? ext.slice(1) : ext
	switch (e) {
		case "jpg":
		case "jpeg":
			return "image/jpeg"
		case "png":
			return "image/png"
		case "webp":
			return "image/webp"
		case "gif":
			return "image/gif"
		case "bmp":
			return "image/bmp"
		case "avif":
			return "image/avif"
		default:
			return "application/octet-stream"
	}
}
