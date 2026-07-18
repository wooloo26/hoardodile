import type { DanmakuListFilter } from "@hoardodile/plugin-sdk-web"
import type { DanmakuMode } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry, wireAnchor } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.listDanmaku,
			z.object({
				filter: z
					.object({
						kind: z.string().optional(),
						filename: z.string().optional(),
						page: z.number().optional(),
						paragraph: z.number().optional(),
					})
					.optional(),
			}),
			async (ctx, params) => {
				const rows = await trpcQuery("danmaku", "list", {
					anchor: { resId: ctx.resId },
				})
				const filter = params.filter
				if (filter === undefined) return rows
				return rows.filter((d) => matchesDanmakuFilter(d.anchor.data, filter))
			},
		),

		defineHandler(
			pluginMethods.createDanmaku,
			z.object({
				text: z.string().min(1),
				anchor: wireAnchor,
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Matches a danmaku against the plugin-declared filter: every declared
 * field must equal the value stored under the same key in the anchor's
 * `data`. Danmaku without matching data (or without data at all) are
 * excluded whenever a filter is set — e.g. another file's danmaku must
 * not render during playback of the current one.
 */
function matchesDanmakuFilter(
	data: unknown,
	filter: DanmakuListFilter,
): boolean {
	if (!isRecord(data)) return false
	for (const [key, value] of Object.entries(filter)) {
		if (value !== undefined && data[key] !== value) return false
	}
	return true
}
