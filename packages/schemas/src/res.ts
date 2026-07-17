import {
	MAX_INTRO_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import { z } from "zod"
import { resCollectionChip } from "./col.ts"
import { pluginManifestId } from "./plugin.ts"
import { id, timestamp } from "./primitives.ts"
import { pinnedTag } from "./tag.ts"

/**
 * The fixed catalog of cover rendering variants. `coverMeta.kind` picks
 * which variant the web app renders (e.g. `"video"` enables hover-to-play).
 */
export const COVER_KINDS = ["image", "video", "audio"] as const
export type CoverKind = (typeof COVER_KINDS)[number]

/**
 * An item of content owned by the user.
 * `coverMeta` absent means the app should derive a cover automatically.
 * `deletedAt` absent means the resource is live.
 */
export const coverMeta = z.object({
	/**
	 * Intrinsic pixel dimensions of the cover image. Used by the client
	 * to pre-size the image slot before the image loads, preventing layout
	 * shifts.
	 */
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
	/**
	 * Which media variant the web app renders (e.g. "video" enables
	 * hover-to-play). Derived from the owning plugin's `buildLocalCover`
	 * source file, not from a user-uploaded permanent `.cover.*` image.
	 */
	kind: z.enum(COVER_KINDS),
	/**
	 * Filename (relative to resource root) of the source file used as cover
	 * origin. Set from `buildLocalCover` during cover meta build. Present
	 * whenever the plugin resolves a local cover source, including when a
	 * user-uploaded permanent `.cover.*` image overrides the thumbnail.
	 */
	source: z.string().optional(),
})
export type CoverMeta = z.infer<typeof coverMeta>

/**
 * Universal file-level facts about the resource's source artifact,
 * independent of any plugin. Available on every resource the moment
 * a `source.hoard` artifact exists.
 *
 * The source always lives in `<resource>/source.hoard` (STORED zip
 * encoding under a project-specific extension).  `sizeBytes` is the
 * cumulative uncompressed byte size of all entries; `count` is the
 * number of entries.  Every resource uses this shape, even single-file
 * ones.
 */
export const fileStats = z.object({
	sizeBytes: z.number().int().nonnegative().optional(),
	count: z.number().int().nonnegative().optional(),
})
export type FileStats = z.infer<typeof fileStats>

/**
 * Plugin-specific per-resource metadata. No host-enforced fields;
 * everything is plugin-defined and passes through unchanged.
 */
export const sourceMetaBase = z.object({}).passthrough()
export type SourceMetaBase = z.infer<typeof sourceMetaBase>

/**
 * Read the well-known `kind` field out of a {@link coverMeta} blob.
 * Returns `undefined` when the blob is missing, the field is missing,
 * or the value isn't one of {@link COVER_KINDS}.
 */
export function pickCoverKind(coverMeta: unknown): CoverKind | undefined {
	if (typeof coverMeta !== "object" || coverMeta === null) return undefined
	const candidate = (coverMeta as Record<string, unknown>).kind
	if (typeof candidate !== "string") return undefined
	for (const kind of COVER_KINDS) {
		if (kind === candidate) return kind
	}
	return undefined
}

/**
 * Per-resource search-optimisation metadata. Built eagerly at upload /
 * import time by the owning plugin so search queries never touch the
 * file system.
 *
 * `facets` is a plugin-defined bag of boolean flags (e.g. `image`,
 * `video`, `audio`). The keys are opaque to shared/server/web — the
 * plugin declares them via `ui.search.kinds` in its manifest so the
 * UI can render filter checkboxes with i18n labels and icons.
 *
 * `v` is bumped whenever the owning plugin changes its build algorithm
 * incompatibly so a one-shot rebuild can identify stale rows.
 */
export const searchMeta = z.object({
	v: z.number().int().positive(),
	facets: z.record(z.string(), z.boolean()).optional(),
})
export type SearchMeta = z.infer<typeof searchMeta>

export const RESOURCE_META_TYPES = [
	"coverMeta",
	"sourceMeta",
	"searchMeta",
	"fileStats",
] as const
export type ResourceMetaType = (typeof RESOURCE_META_TYPES)[number]

/** Partial meta fields carried on SSE `resourceMetaUpdated` events. */
export type ResourceMetaSnapshot = {
	coverMeta?: CoverMeta | null
	sourceMeta?: SourceMetaBase | null
	searchMeta?: SearchMeta | null
	fileStats?: FileStats | null
}

export type ResourceMetaUpdatedEvent = {
	type: "resourceMetaUpdated"
	resourceId: string
	metaTypes: ResourceMetaType[]
	meta?: ResourceMetaSnapshot
}

/**
 * Emitted when the server finishes an in-process storage context reload
 * (backup restore or archive version switch). Clients should invalidate
 * cached query data because the underlying database / active version has
 * changed while the HTTP/SSE connection stayed alive.
 */
export type StorageContextReloadedEvent = {
	type: "storageContextReloaded"
}

export const resource = z.object({
	id,
	name: z.string().min(1).max(MAX_NAME_LENGTH),
	intro: z.string().max(MAX_INTRO_LENGTH).default(""),
	tagIds: z.array(id).default([]),
	charIds: z.array(id).default([]),
	/** Plugin that owns detection and preview for this resource. Null until first source upload. */
	contentPluginId: pluginManifestId.nullable(),
	/** Cover metadata (dimensions + kind). Absent when no cover has been generated yet. */
	coverMeta: coverMeta.optional(),
	/**
	 * Universal file-level facts (size, count). Plugin-agnostic; computed
	 * by the server's source-tree walker. Absent until the first probe runs.
	 */
	fileStats: fileStats.optional(),
	/**
	 * Plugin-owned per-resource JSON produced by the owning plugin's
	 * `buildSourceMeta()`. No host-enforced fields; everything is
	 * plugin-defined and passed through.
	 *
	 * Well-known optional fields the host may read:
	 *  - `previews: readonly string[]` is an opt-in first-paint hint:
	 *    up to 3 media-file relative paths the plugin can render
	 *    synchronously from `ctx.sourceMeta` before its `useResFiles()`
	 *    round-trip resolves. Used by both `plugin-manga` (image-only)
	 *    and `plugin-gallery` (image/video/audio union). Safe to omit;
	 *    consumers must fall through to `useResFiles()` when absent or
	 *    malformed. Resources are archive-immutable, so these paths
	 *    never need invalidation.
	 *
	 * Absent until built.
	 */
	sourceMeta: sourceMetaBase.optional(),
	/**
	 * Search-optimisation metadata built at upload / import time. Absent
	 * for resources created before the feature shipped or whose source
	 * folder is empty. See {@link searchMeta} for layout.
	 */
	searchMeta: searchMeta.optional(),
	/**
	 * Archive version where this resource's user-uploaded permanent
	 * `.cover.*` file lives. Bumped on every cover write/delete.
	 */
	coverVersion: z.number().int().positive(),
	createdAt: timestamp,
	updatedAt: timestamp,
	deletedAt: timestamp.optional(),
	/**
	 * Present only when the most recent read detected source drift and the
	 * active `contentPluginId` detector rejected the new layout.
	 * `from` carries the previous content type (which the server already
	 * downgraded back to `gallery`), `reason` lists the missing structural
	 * items so the frontend can prompt the user.
	 */
	degraded: z
		.object({
			from: pluginManifestId,
			reason: z.array(z.string()),
		})
		.optional(),
})

export type Resource = z.infer<typeof resource>

/**
 * Resource with pre-computed pinned tags and character summaries, returned by
 * the `resource.listCards` procedure. The server resolves both before sending
 * so the client needs no extra queries or local tag resolution.
 *
 * `pinnedTags` - filtered to `tag.pinned OR category.pinned`, sorted by
 *   (category.position, tag.position), color resolved: tag → category → "".
 * `characters` - minimal character info needed for avatar thumbnails and links.
 */
export const resCard = resource.extend({
	pinnedTags: z.array(pinnedTag).default([]),
	characters: z
		.array(
			z.object({
				id,
				name: z.string().min(1).max(MAX_NAME_LENGTH),
				updatedAt: timestamp,
			}),
		)
		.default([]),
	/**
	 * Collections that contain this resource. Embedded so card grids can
	 * render collection chips without an N+1 fetch per card.
	 */
	collections: z.array(resCollectionChip).default([]),
})

export type ResCard = z.infer<typeof resCard>

/** One item in a serialized file list: a bare filename string or a metadata object. */
export type SerializedFileEntry =
	| string
	| Record<string, string | number | boolean>

/** Serialized file list as stored in the sidecar cache and sent over the wire. */
export type SerializedFileList = readonly SerializedFileEntry[]
