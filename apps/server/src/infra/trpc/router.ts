// Single side-effect import that brings every `FastifyInstance`
// augmentation (infra primitives + service container) into the type
// graph. Required for downstream packages that import `AppRouter`
// without the rest of the server tree.
import "src/infra/fastify-augment.ts"
import { resolve as resolvePath, sep } from "node:path"
import { TRPCError } from "@trpc/server"
import { authRouter } from "src/domain/auth/router.ts"
import { buildBackupRouter } from "src/domain/backup/router.ts"
import { buildCategoryRouter } from "src/domain/cat/router.ts"
import { buildCharacterRouter } from "src/domain/char/router.ts"
import { buildResourceCollectionRouter } from "src/domain/col/router.ts"
import { buildCommentRouter } from "src/domain/comment/router.ts"
import { buildDanmakuRouter } from "src/domain/danmaku/router.ts"
import { buildDocumentRouter } from "src/domain/doc/router.ts"
import { buildPluginRouter } from "src/domain/plugin/router.ts"
import {
	buildAsyncPreferenceRouter,
	buildPluginPreferenceRouter,
	buildSystemPreferenceRouter,
} from "src/domain/prefs/router.ts"
import {
	assertInsideGuard,
	browseDirectory,
	extractUploadedArchive,
} from "src/domain/res/folder-import.ts"
import { importLocal, scanImportDirectory } from "src/domain/res/import.ts"
import { buildResourceRouter } from "src/domain/res/router.ts"
import { buildSearchRouter } from "src/domain/search/router.ts"
import { buildTagRouter } from "src/domain/tag/router.ts"
import { buildTraitRouter } from "src/domain/trait/router.ts"
import { buildUsageRouter } from "src/domain/usage/router.ts"
import { buildVersionRouter } from "src/domain/version/router.ts"
import { z } from "zod"
import {
	authedProcedure,
	mergeRouters,
	router,
	writeProcedure,
} from "./core.ts"
import type { AppRouterServices, RouterServices } from "./services.ts"

/**
 * Build the domain tRPC router: auth procedures at the root (`ping`, `me`)
 * plus namespaced domain modules (`resource.*`, `character.*`, ...) so
 * procedure names stay collision-free.
 *
 * Every sub-router is invoked explicitly here (not via
 * {@link FastifyInstance.domainRouters}) so TypeScript can preserve the
 * literal key names in `AppRouter`. Using `Record<string, AnyRouter>` 'even
 * indirectly through `Object.entries` 'causes tRPC's inference to fall back
 * to an index signature whose value type is `any`, which collapses every
 * sub-router into a single query procedure on the client side.
 */
export function buildDomainRouter(services: RouterServices) {
	return mergeRouters(
		authRouter,
		router({
			resource: mergeRouters(
				buildResourceRouter(services.resService),
				router({
					importConfig: authedProcedure.query(async ({ ctx }) => {
						return { sharedFolderRoot: ctx.env.SHARED_FOLDER_ROOT }
					}),
					browseDirectory: authedProcedure
						.input(
							z.object({
								root: z.string().min(1),
								subPath: z.string().optional(),
							}),
						)
						.query(async ({ input, ctx }) => {
							const guardRoot = resolveBrowseGuard(
								input.root,
								ctx.env.SHARED_FOLDER_ROOT,
								services.tmpBase,
							)
							const entries = await browseDirectory(
								input.root,
								input.subPath,
								guardRoot,
							)
							return { entries }
						}),
					extractArchive: writeProcedure
						.input(
							z.object({
								archiveFileId: z.string().uuid(),
							}),
						)
						.mutation(async ({ input, ctx }) => {
							const extractDir = await extractUploadedArchive(
								services.resUploads,
								services.tmpBase,
								input.archiveFileId,
								ctx.env.MAX_ARCHIVE_EXTRACTED_BYTES,
							)
							return { extractDir }
						}),
					folderScan: authedProcedure
						.input(
							z.object({
								root: z.string().min(1),
								subPath: z.string().optional(),
								contentPluginId: z.string().optional(),
							}),
						)
						.query(async ({ input, ctx }) => {
							const guardRoot = resolveBrowseGuard(
								input.root,
								ctx.env.SHARED_FOLDER_ROOT,
								services.tmpBase,
							)
							const sourceDir = assertInsideGuard(
								input.root,
								input.subPath,
								guardRoot,
							)
							const registry = services.pluginLoader.getRegistry()
							const entries = await scanImportDirectory(
								sourceDir,
								input.contentPluginId,
								services.pluginHooks,
							)
							return entries.map((e) => {
								const entry = registry.getById(e.contentPluginId)
								return {
									name: e.item.name,
									path: e.item.absPath,
									kind: e.item.kind,
									contentPluginId: e.contentPluginId,
									pluginName: entry?.manifest.name ?? e.contentPluginId,
								}
							})
						}),
					folderImport: writeProcedure
						.input(
							z.object({
								root: z.string().min(1),
								subPath: z.string().optional(),
								contentPluginId: z.string().optional(),
								cleanupExtract: z.boolean().optional(),
							}),
						)
						.mutation(async ({ input, ctx }) => {
							const guardRoot = resolveBrowseGuard(
								input.root,
								ctx.env.SHARED_FOLDER_ROOT,
								services.tmpBase,
							)
							const sourceDir = assertInsideGuard(
								input.root,
								input.subPath,
								guardRoot,
							)
							const report = await importLocal(
								{
									service: services.resService,
									uploads: services.resUploads,
									pluginHooks: services.pluginHooks,
								},
								{
									sourceDir,
									contentPluginId: input.contentPluginId,
								},
							)
							if (input.cleanupExtract === true) {
								const { rm } = await import("node:fs/promises")
								await rm(guardRoot, {
									recursive: true,
									force: true,
								}).catch(() => {})
							}
							return report
						}),
					pluginSessionToken: authedProcedure
						.input(z.object({ resId: z.string().min(1) }))
						.query(async ({ ctx, input }) => {
							const session = await services.sessions.read(
								ctx.req.cookies[ctx.env.SESSION_COOKIE_NAME],
							)
							if (session === undefined) {
								throw new TRPCError({ code: "UNAUTHORIZED" })
							}
							const token = await services.sessions.createToken(
								86400,
								input.resId,
							)
							return token.sealed
						}),
				}),
			),
			character: buildCharacterRouter({
				service: services.charService,
				relationships: services.relationshipService,
			}),
			document: buildDocumentRouter({
				documents: services.docService,
			}),
			category: buildCategoryRouter(services.catService),
			tag: buildTagRouter(services.tagService),
			trait: buildTraitRouter(services.traitService),
			resCollection: buildResourceCollectionRouter(
				services.resCollectionService,
			),
			comment: buildCommentRouter(services.commentService),
			danmaku: buildDanmakuRouter(services.danmakuService),
			usage: buildUsageRouter(services.usageService),
			search: buildSearchRouter(services.searchService),
			plugin: buildPluginRouter(services.pluginService),
			systemPreference: buildSystemPreferenceRouter(services.systemPrefService),
			asyncPreference: buildAsyncPreferenceRouter(services.asyncPrefService),
			pluginPreference: buildPluginPreferenceRouter(
				services.pluginPrefService,
				services.cacheService,
			),
		}),
	)
}

/**
 * Compose the full application router by merging the domain router with
 * infrastructure sub-routers. Infra services (backup service, signal
 * emitter) are likewise read off the services record, so there is a single
 * source of truth for wiring.
 */
export function buildAppRouter(services: AppRouterServices) {
	return mergeRouters(
		buildDomainRouter(services),
		router({
			backup: buildBackupRouter({
				service: services.backupService,
				signals: services.signals,
			}),
			version: buildVersionRouter({
				service: services.versionService,
				signals: services.signals,
			}),
		}),
	)
}

export type AppRouter = ReturnType<typeof buildAppRouter>

/**
 * Determine the guard root for a browse/scan/import call. The `root`
 * parameter must be either the configured `SHARED_FOLDER_ROOT` (for shared
 * folder browsing) or a valid extraction directory under `tmpBase` (for zip
 * file imports). Returns the guard root to use for path traversal checks.
 *
 * @throws `TRPCError(FORBIDDEN)` when `root` does not match any allowed
 *   source.
 */
function resolveBrowseGuard(
	root: string,
	sharedFolderRoot: string | undefined,
	tmpBase: string,
): string {
	const resolvedRoot = resolvePath(root)
	if (sharedFolderRoot !== undefined) {
		const resolvedSharedFolderRoot = resolvePath(sharedFolderRoot)
		if (resolvedRoot === resolvedSharedFolderRoot)
			return resolvedSharedFolderRoot
	}
	const resolvedTmpBase = resolvePath(tmpBase)
	if (
		resolvedRoot.startsWith(resolvedTmpBase + sep) &&
		resolvedRoot.slice(resolvedTmpBase.length + 1).startsWith("extract-")
	) {
		return resolvedRoot
	}
	throw new TRPCError({
		code: "FORBIDDEN",
		message: "browsing this root directory is not allowed",
	})
}
