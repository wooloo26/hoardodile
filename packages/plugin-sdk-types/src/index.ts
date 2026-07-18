/** Plugin-scoped identifier. Runtime-wise a string; branded to avoid accidental mixing. */
export type PluginId = string & { readonly __brand: "PluginId" }

/** Resource-scoped identifier. Runtime-wise a string; branded to avoid accidental mixing. */
export type ResourceId = string & { readonly __brand: "ResourceId" }

/** Web plugin danmaku mode. */
export type DanmakuMode = "scroll" | "top" | "bottom"

/** Web plugin anchor for messages and danmaku. */
export type ResAnchor = {
	readonly resId: string
	readonly data?: unknown
}

/**
 * Anchor as supplied by plugin code: only the plugin-defined location
 * data. The SDK injects the iframe's own resource id before the anchor
 * reaches the host — plugins never pass a resId.
 */
export type AnchorData = Omit<ResAnchor, "resId">

/** Web plugin message shape. */
export type Message = {
	readonly id: string
	readonly parentId?: string
	readonly body: string
	readonly createdAt: number
	readonly deletedAt?: number
	readonly charIds: readonly string[]
	readonly resIds: readonly string[]
	readonly likeCount: number
	readonly dislikeCount: number
	readonly replyCount: number
	readonly floor?: number
	readonly anchor?: ResAnchor
}

/** Web plugin danmaku shape. */
export type Danmaku = {
	readonly id: string
	readonly anchor: ResAnchor
	readonly text: string
	readonly color: string
	readonly mode: DanmakuMode
	readonly createdAt: number
}

/** Plugin-facing file stats slice of a resource. */
export type FileStats = {
	readonly sizeBytes?: number
	readonly count?: number
}

/** Plugin-produced search metadata. The host enforces its own schema at ingestion time. */
export type SearchMeta = {
	readonly v: number
	readonly facets?: Readonly<Record<string, boolean>>
}

/**
 * Schema contract shared between server and web plugin APIs.
 * Declared once per plugin and used to type both `definePlugin` and
 * `WebPluginAPI`.
 */
export interface PluginSchema {
	readonly file?: unknown
	readonly sourceMeta?: unknown
	readonly searchMeta?: unknown
}
