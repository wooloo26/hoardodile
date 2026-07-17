import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core"
import { characters } from "src/domain/char/schema.ts"

/**
 * Domain table for {@link import("@hoardodile/schemas").Resource}. `content_plugin_id`
 * is the UUID of the content plugin that owns detection and preview.
 * `null` means no plugin has been assigned yet — detection runs when source
 * files are first uploaded.
 * Rebuildable metadata lives in {@link resourceMeta}. Tag and character
 * associations live in the `resource_tags` and `resource_characters` join
 * tables. Soft deletion is tracked via `deleted_at`.
 */
export const resources = sqliteTable(
	"resources",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		intro: text("intro").notNull().default(""),
		/**
		 * UUID of the content plugin that owns detection and preview for
		 * this resource. `null` means unassigned — detection runs on
		 * first source upload.
		 */
		contentPluginId: text("content_plugin_id"),
		/**
		 * Archive version where this resource's `source.hoard` was created.
		 * Resources are immutable after creation, so this is
		 * effectively the resource's birth version.
		 */
		fileVersion: integer("file_version").notNull().default(1),
		/**
		 * Archive version where this resource's user-uploaded permanent
		 * `.cover.*` file lives. Bumped to `latestVersion` on every cover
		 * write/delete so covers remain mutable across version publishes,
		 * unlike the immutable source artifact tracked by `fileVersion`.
		 */
		coverVersion: integer("cover_version").notNull().default(1),

		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		deletedAt: integer("deleted_at"),
	},
	(t) => [
		index("resources_deleted_at_idx").on(t.deletedAt),
		index("resources_created_at_idx").on(t.createdAt),
	],
)

/**
 * Rebuildable derived metadata for a resource. Kept separate from
 * {@link resources} so background meta rebuilds do not touch the user-owned
 * resource row or its `updatedAt`.
 */
export const resourceMeta = sqliteTable("resource_meta", {
	resourceId: text("resource_id")
		.primaryKey()
		.references(() => resources.id, { onDelete: "cascade" }),
	coverMeta: text("cover_meta"),
	sourceMeta: text("source_meta"),
	searchMeta: text("search_meta"),
	fileStats: text("file_stats"),
	/** Bumped whenever any meta column on this row changes. */
	builtAt: integer("built_at").notNull(),
})

/** Join table between resources and characters. Cascade on both sides. */
export const resCharacters = sqliteTable(
	"resource_characters",
	{
		resId: text("resource_id")
			.notNull()
			.references(() => resources.id, { onDelete: "cascade" }),
		charId: text("character_id")
			.notNull()
			.references(() => characters.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.resId, t.charId] })],
)
