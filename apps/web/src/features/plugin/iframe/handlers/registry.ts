import type { z } from "zod"

// ── Handler context ────────────────────────────────────────────────────────

export type HandlerContext = {
	readonly source: Window
	readonly resId: string
	readonly pluginId: string
}

// ── Handler entry ──────────────────────────────────────────────────────────

export type HandlerEntry = {
	readonly method: string
	readonly schema: z.ZodTypeAny | undefined
	readonly handler: (ctx: HandlerContext, params: unknown) => Promise<unknown>
}

// ── Factories ──────────────────────────────────────────────────────────────

/**
 * Throws when a plugin iframe targets a resource other than the one it is
 * rendering. `ctx.resId` comes from the host-side iframe registry, so it
 * cannot be forged by the plugin; bridge methods must not trust a resId
 * taken from message params.
 */
export function assertOwnResource(ctx: HandlerContext, resId: string): void {
	if (resId !== ctx.resId) {
		throw new Error(
			"resource id does not match the resource this iframe renders",
		)
	}
}

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
