import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { resFilesQueryOptions } from "@/features/res/api"
import { apiFetch } from "@/lib/http"
import { apiPaths } from "@/lib/paths"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.readFile,
			z.object({ path: z.string().min(1) }),
			async (ctx, params) => {
				const res = await apiFetch(
					apiPaths.resources.files(ctx.resId, params.path),
				)
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				return res.arrayBuffer()
			},
		),

		defineHandler(pluginMethods.listFiles, async (ctx) => {
			return qc.fetchQuery(resFilesQueryOptions(ctx.resId))
		}),
	]
}
