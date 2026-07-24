import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { broadcastToAll } from "@/features/plugin/iframe/iframe-pool"
import { upsertResCacheEntry } from "@/features/plugin/iframe/plugin-cache-preload"
import { hostPushKeys } from "@/lib/keys"
import { trpcMutate } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

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
				key: z.string().min(1),
				value: z.string(),
			}),
			async (ctx, params) => {
				// A write from a never-bound iframe has nowhere to land —
				// drop it silently instead of failing the mutation.
				if (ctx.resId === "") return
				await trpcMutate("pluginPreference", "cacheSet", {
					pluginId: ctx.pluginId,
					resId: ctx.resId,
					key: params.key,
					value: params.value,
				})
				upsertResCacheEntry(ctx.resId, ctx.pluginId, params.key, params.value)
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
