import { type DanmakuMode, resAnchor } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listDanmaku,
			// resId is accepted for wire compatibility with older plugin
			// builds but never read: the iframe can only see its own resource.
			z.object({ resId: z.string().min(1).optional() }),
			async (ctx, _params) => {
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
				return trpcMutate("danmaku", "create", {
					text: params.text,
					anchor: { ...params.anchor, resId: ctx.resId },
					mode: params.mode as DanmakuMode,
				})
			},
		),
	]
}
