import { resAnchor } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { assertOwnResource, defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listMessages,
			z.object({ resId: z.string().min(1) }),
			async (ctx, params) => {
				assertOwnResource(ctx, params.resId)
				const r = await trpcQuery("comment", "list", { resId: ctx.resId })
				return r.rows
			},
		),

		defineHandler(
			pluginMethods.createMessage,
			z.object({ body: z.string().min(1), anchor: resAnchor.optional() }),
			async (ctx, params) => {
				if (params.anchor !== undefined) {
					assertOwnResource(ctx, params.anchor.resId)
				}
				return trpcMutate("comment", "create", {
					body: params.body,
					anchor: params.anchor,
					resIds: params.anchor !== undefined ? [params.anchor.resId] : [],
				})
			},
		),
	]
}
