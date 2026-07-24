import { z } from "zod"

// ── Handler context ────────────────────────────────────────────────────────

export type HandlerContext = {
	readonly source: Window
	/**
	 * The resource this request is scoped to: the iframe's current
	 * binding ("" only for never-bound iframes). Requests stamped by the
	 * SDK with a different resource are dropped as stale before they
	 * reach a handler.
	 */
	readonly resId: string
	readonly pluginId: string
}

/**
 * Wire shape of a message/danmaku anchor. Current SDKs omit resId
 * entirely; older plugin builds may still send it — either way the host
 * overwrites it with the iframe's registered resource before use.
 */
export const wireAnchor = z
	.object({
		resId: z.string().min(1).optional(),
		data: z.unknown().optional(),
	})
	.loose()

// ── Handler entry ──────────────────────────────────────────────────────────

export type HandlerEntry = {
	readonly method: string
	readonly schema: z.ZodTypeAny | undefined
	readonly handler: (ctx: HandlerContext, params: unknown) => Promise<unknown>
}

// ── Factories ──────────────────────────────────────────────────────────────

export function defineHandler<TReturn>(
	method: string,
	handler: (ctx: HandlerContext) => Promise<TReturn> | TReturn,
): HandlerEntry

export function defineHandler<TSchema extends z.ZodTypeAny, TReturn>(
	method: string,
	schema: TSchema,
	handler: (
		ctx: HandlerContext,
		params: z.infer<TSchema>,
	) => Promise<TReturn> | TReturn,
): HandlerEntry

export function defineHandler(
	method: string,
	schemaOrHandler:
		| z.ZodTypeAny
		| ((ctx: HandlerContext) => Promise<unknown> | unknown),
	maybeHandler?: (
		ctx: HandlerContext,
		params: unknown,
	) => Promise<unknown> | unknown,
): HandlerEntry {
	if (typeof schemaOrHandler === "function") {
		return {
			method,
			schema: undefined,
			handler: async (ctx) => schemaOrHandler(ctx),
		}
	}
	return {
		method,
		schema: schemaOrHandler,
		handler: async (ctx, params) => maybeHandler!(ctx, params),
	}
}
