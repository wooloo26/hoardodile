import { z } from "zod"
import { id } from "./primitives.ts"

/**
 * Generic pointer into a specific location within a resource. Used by
 * comments and danmaku to attach themselves to a precise location so
 * readers can surface inline annotations and clients can navigate
 * back to the exact spot where a remark was made.
 *
 * Only `resId` is defined by shared. Plugins attach their own
 * opaque location data via `data` (e.g. page number, paragraph index,
 * timestamp). The plugin's `resolveCommentAnchor` render export
 * interprets this data for display and navigation.
 */
export const resAnchor = z.object({
	resId: id,
	/** Plugin-defined location data. Interpreted by the owning plugin. */
	data: z.unknown().optional(),
})
export type ResAnchor = z.infer<typeof resAnchor>

/**
 * Filter shape for listing rows whose anchor targets a given resource.
 * Server filters by `resId` only; plugin-specific location filtering
 * happens client-side through the plugin render module.
 */
export const resAnchorFilter = z.object({
	resId: id,
})
export type ResAnchorFilter = z.infer<typeof resAnchorFilter>
