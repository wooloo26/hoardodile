import { resAnchor } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listMessages,
			// resId is accepted for wire compatibility with older plugin
			// builds but never read: the iframe can only see its own resource.
			z.object({ resId: z.string().min(1).optional() }),
			async (ctx, _params) => {
				const r = await trpcQuery("comment", "list", { resId: ctx.resId })
				return r.rows
			},
		),

		defineHandler(
			pluginMethods.createMessage,
			z.object({ body: z.string().min(1), anchor: resAnchor.optional() }),
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
