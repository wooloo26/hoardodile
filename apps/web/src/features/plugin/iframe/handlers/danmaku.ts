import type { DanmakuMode } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listDanmaku,
			z.object({ resId: z.string().min(1) }),
			async (_ctx, params) => {
				return trpcQuery("danmaku", "list", { anchor: { resId: params.resId } })
			},
		),

		defineHandler(
			pluginMethods.createDanmaku,
			z.object({
				text: z.string().min(1),
				anchor: z.any(),
				mode: z.string().optional(),
			}),
			async (_ctx, params) => {
				return trpcMutate("danmaku", "create", {
					text: params.text,
					anchor: params.anchor,
					mode: params.mode as DanmakuMode,
				})
			},
		),
	]
}
