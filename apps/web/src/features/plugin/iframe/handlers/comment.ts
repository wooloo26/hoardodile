import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listComments,
			z.object({ resId: z.string().min(1) }),
			async (_ctx, params) => {
				const r = await trpcQuery("comment", "list", { resId: params.resId })
				return r.rows
			},
		),

		defineHandler(
			pluginMethods.createComment,
			z.object({ body: z.string().min(1), anchor: z.any().optional() }),
			async (_ctx, params) => {
				return trpcMutate("comment", "create", {
					body: params.body,
					anchor: params.anchor,
					resIds: params.anchor !== undefined ? [params.anchor.resId] : [],
				})
			},
		),
	]
}
