import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { broadcastToAll } from "@/features/plugin/iframe/iframe-pool"
import { hostPushKeys } from "@/lib/keys"
import { trpcMutate } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { assertOwnResource, defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.setPref,
			z.object({ key: z.string().min(1), value: z.string() }),
			async (ctx, params) => {
				await trpcMutate("pluginPreference", "set", {
					pluginId: ctx.pluginId,
					key: params.key,
					value: params.value,
				})
				broadcastToAll({
					type: "push",
					key: hostPushKeys.prefsChanged,
					data: { key: params.key, value: params.value },
				})
			},
		),

		defineHandler(
			pluginMethods.setCache,
			z.object({
				resId: z.string().min(1),
				key: z.string().min(1),
				value: z.string(),
			}),
			async (ctx, params) => {
				assertOwnResource(ctx, params.resId)
				await trpcMutate("pluginPreference", "cacheSet", {
					pluginId: ctx.pluginId,
					resId: ctx.resId,
					key: params.key,
					value: params.value,
				})
				broadcastToAll({
					type: "push",
					key: hostPushKeys.cacheChanged,
					data: {
						resId: ctx.resId,
						key: params.key,
						value: params.value,
					},
				})
			},
		),
	]
}
