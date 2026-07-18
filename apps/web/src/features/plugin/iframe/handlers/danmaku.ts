import { type DanmakuMode, resAnchor } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { assertOwnResource, defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listDanmaku,
			z.object({ resId: z.string().min(1) }),
			async (ctx, params) => {
				assertOwnResource(ctx, params.resId)
				return trpcQuery("danmaku", "list", { anchor: { resId: ctx.resId } })
			},
		),

		defineHandler(
			pluginMethods.createDanmaku,
			z.object({
				text: z.string().min(1),
				anchor: resAnchor,
				mode: z.string().optional(),
			}),
			async (ctx, params) => {
				assertOwnResource(ctx, params.anchor.resId)
				return trpcMutate("danmaku", "create", {
					text: params.text,
					anchor: params.anchor,
					mode: params.mode as DanmakuMode,
				})
			},
		),
	]
}
