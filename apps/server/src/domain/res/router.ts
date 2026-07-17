import {
	MAX_INTRO_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import { pluginManifestId, resolvedUsageTimeZone } from "@hoardodile/schemas"
import { isDomainError } from "@hoardodile/shared"
import { authedProcedure, router, writeProcedure } from "src/infra/trpc/core.ts"
import { idInput, resourceIdsInput } from "src/infra/trpc/inputs.ts"
import {
	pagedCardProcedures,
	pagedRowProcedures,
	softDeleteProcedures,
} from "src/infra/trpc/procedure-builders.ts"
import { z } from "zod"
import type { ResService } from "./service.ts"

/**
 * Compound creation input. The client stages files via the per-file
 * upload endpoints, then calls this procedure. Two source kinds are
 * supported, mutually exclusive:
 *
 * - Ordered: stage each file via `POST /api/uploads/ordered` (returns a
 *   `fileId`), then pass the ordered `files: [fileId, …]` list here.
 * - Archive: stage a single zip via `POST /api/uploads/archive` (returns
 *   a `fileId`), then pass `archiveFileId` here.
 *
 * Direct creation of an empty resource is intentionally unsupported on
 * the public API - every resource owns its source folder.
 */
const createWithUploadInput = z.object({
	files: z.array(z.string().uuid()).optional(),
	archiveFileId: z.string().uuid().optional(),
	name: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
	defaultNameTimeZone: resolvedUsageTimeZone,
	intro: z.string().max(MAX_INTRO_LENGTH).optional(),
	contentPluginId: pluginManifestId.optional(),
	tagIds: z.array(z.string().min(1)).optional(),
	charIds: z.array(z.string().min(1)).optional(),
})

const updateInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
	intro: z.string().max(MAX_INTRO_LENGTH).optional(),
	tagIds: z.array(z.string().min(1)).optional(),
	charIds: z.array(z.string().min(1)).optional(),
})

/**
 * tRPC sub-router that exposes the resource module. Every procedure is
 * auth-guarded and has automatic DomainError ->TRPCError translation
 * provided by {@link authedProcedure}. Event dispatch is performed by the
 * service layer.
 */
export function buildResourceRouter(service: ResService) {
	return router({
		...pagedRowProcedures({
			list: (input) => service.list(input),
			trashList: (input) => service.trashList(input),
			detail: (id) => service.detail(id),
		}),
		...pagedCardProcedures({
			listCards: (input) => service.listCards(input),
			trashListCards: (input) => service.trashListCards(input),
			detailCard: (id) => service.detailCard(id),
		}),
		create: writeProcedure
			.input(createWithUploadInput)
			.mutation(({ input }) => service.create(input)),
		update: writeProcedure
			.input(updateInput)
			.mutation(({ input }) => service.update(input)),
		...softDeleteProcedures({
			softDelete: (id) => service.softDelete(id),
			restore: (id) => service.restore(id),
			hardDelete: (id) => service.hardDelete(id),
		}),
		softDeleteMany: writeProcedure
			.input(resourceIdsInput)
			.mutation(({ input }) => service.softDeleteMany(input.ids)),
		hardDeleteMany: writeProcedure
			.input(resourceIdsInput)
			.mutation(({ input }) => service.hardDeleteMany(input.ids)),
		setContentPluginId: writeProcedure
			.input(
				z.object({
					id: z.string().min(1),
					contentPluginId: pluginManifestId,
				}),
			)
			.mutation(({ input }) =>
				service.setContentPluginId(input.id, input.contentPluginId),
			),
		listFiles: authedProcedure.input(idInput).query(async ({ input }) => {
			try {
				return await service.listFiles(input.id)
			} catch (err) {
				if (isDomainError(err) && err.code === "NOT_FOUND") {
					const trashed = await service.listTrashedFiles(input.id)
					if (trashed !== undefined) return trashed
				}
				throw err
			}
		}),
		relatedByTags: authedProcedure
			.input(
				z.object({
					id: z.string().min(1),
					limit: z.number().int().min(1).max(20).default(5),
				}),
			)
			.query(({ input }) => service.relatedByTags(input.id, input.limit)),
	})
}

export type ResRouter = ReturnType<typeof buildResourceRouter>
