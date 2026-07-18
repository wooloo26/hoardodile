import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { invalidateResources } from "@/features/res/api"
import { apiPaths } from "@/lib/paths"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(pluginMethods.getUploadUrl, async (ctx) => {
			return Promise.resolve({
				uploadUrl: apiPaths.resources.cover(ctx.resId),
				fileId: ctx.resId,
			})
		}),

		defineHandler(
			pluginMethods.notifyUploadComplete,
			z.object({ fileId: z.string().min(1) }),
			async (ctx, _params) => {
				// fileId is the resource id echoed back from getUploadUrl;
				// the iframe can only ever affect its own resource.
				await invalidateResources(qc, ctx.resId)
			},
		),
	]
}
