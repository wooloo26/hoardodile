import { pluginManifestId } from "@hoardodile/schemas"
import { authedProcedure, router, writeProcedure } from "src/infra/trpc/core.ts"
import { z } from "zod"
import type { PluginService } from "./service.ts"

const updateInput = z.object({
	id: pluginManifestId,
	enabled: z.boolean().optional(),
	priority: z.number().int().optional(),
	pinned: z.boolean().optional(),
	color: z.string().optional(),
})

const reorderInput = z.object({
	ids: z.array(pluginManifestId),
})

export function buildPluginRouter(service: PluginService) {
	return router({
		listAll: authedProcedure.query(() => service.listAll()),
		update: writeProcedure
			.input(updateInput)
			.mutation(({ input }) => service.update(input.id, input)),
		reorder: writeProcedure
			.input(reorderInput)
			.mutation(({ input }) => service.reorder(input.ids)),
		rescan: writeProcedure.mutation(() => service.rescan()),
	})
}

export type PluginRouter = ReturnType<typeof buildPluginRouter>
