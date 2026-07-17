import { isDomainError } from "@hoardodile/shared"
import type { FastifyReply } from "fastify"
import { sendJson } from "./utils.ts"

/**
 * Translate a {@link DomainError} thrown by the domain layer into the
 * matching HTTP response. Unknown errors are logged and returned as 500.
 */
export function replyWithDomainError(
	reply: FastifyReply,
	err: unknown,
): FastifyReply {
	if (isDomainError(err)) {
		const { code, kind, message } = err
		switch (code) {
			case "NOT_FOUND":
				return sendError(reply, 404, message, kind)
			case "VALIDATION":
				return sendError(reply, 400, message, kind)
			case "FORBIDDEN":
				return sendError(reply, 403, message, kind)
			case "CONFLICT":
				return sendError(reply, 409, message, kind)
			case "UNAUTHORIZED":
				return sendError(reply, 401, message, kind)
			case "RATE_LIMITED":
				return sendError(reply, 429, message, kind)
			case "UNSUPPORTED":
				return sendError(reply, 415, message, kind)
		}
	}
	reply.log.error({ err }, "resource upload failed")
	return sendError(reply, 500, "internal error")
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
