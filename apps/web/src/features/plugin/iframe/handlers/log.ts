import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

const schema = z.object({
	msg: z.string().optional(),
	data: z.any().optional(),
})

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(pluginMethods.logInfo, schema, async (_ctx, _params) => {
			// no-op
		}),
		defineHandler(pluginMethods.logWarn, schema, async (_ctx, _params) => {
			// no-op
		}),
		defineHandler(pluginMethods.logError, schema, async (_ctx, _params) => {
			// no-op
		}),
	]
}
