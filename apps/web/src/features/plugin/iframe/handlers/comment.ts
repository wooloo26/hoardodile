import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry, wireAnchor } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(pluginMethods.listMessages, async (ctx) => {
			const r = await trpcQuery("comment", "list", { resId: ctx.resId })
			return r.rows
		}),

		defineHandler(
			pluginMethods.createMessage,
			z.object({ body: z.string().min(1), anchor: wireAnchor.optional() }),
			async (ctx, params) => {
				// The anchor's resId is forced to the iframe's own resource; a
				// plugin-supplied value is overridden, never trusted.
				const anchor =
					params.anchor === undefined
						? undefined
						: { ...params.anchor, resId: ctx.resId }
				return trpcMutate("comment", "create", {
					body: params.body,
					anchor,
					resIds: anchor !== undefined ? [anchor.resId] : [],
				})
			},
		),
	]
}
