import type { InvalidateTarget } from "@hoardodile/plugin-sdk-web"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { invalidateComments } from "@/features/comments"
import { danmakuKeys } from "@/features/danmaku/api"
import { invalidateResources } from "@/features/res/api"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

const invalidateSchema = z.object({ target: z.string() })

export function createHandlers(qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.invalidate,
			invalidateSchema,
			async (ctx, params) => {
				const target = params.target as InvalidateTarget
				switch (target) {
					case "resource":
					case "resources":
						await invalidateResources(qc)
						break
					case "messages":
						await invalidateComments(qc)
						break
					case "danmaku":
						await qc.invalidateQueries({
							predicate: (query) => {
								const key = query.queryKey
								if (key[0] !== danmakuKeys.all[0] || key[1] !== "list")
									return false
								const input = key[2] as
									| { anchor: { resId: string } }
									| undefined
								return input?.anchor?.resId === ctx.resId
							},
						})
						break
				}
			},
		),
	]
}
