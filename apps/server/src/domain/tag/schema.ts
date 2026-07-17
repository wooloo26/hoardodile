import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { categories } from "src/domain/cat/schema.ts"
import { characters } from "src/domain/char/schema.ts"
import { resources } from "src/domain/res/schema.ts"

/**
 * Domain table for {@link import("@hoardodile/schemas").Tag}. `category_id` is
 * required at the application level — uncategorized tags are not allowed.
 * Tags are hard-deleted only.
 */
export const tags = sqliteTable("tags", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	intro: text("intro").notNull().default(""),
	color: text("color").notNull().default(""),
	position: integer("position").notNull().default(0),
	pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
	catId: text("category_id").references(() => categories.id, {
		onDelete: "set null",
	}),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
})

/** Join table between resources and tags. Cascade on both sides. */
export const resTags = sqliteTable(
	"resource_tags",
	{
		resId: text("resource_id")
			.notNull()
			.references(() => resources.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.resId, t.tagId] })],
)

/** Join table between characters and tags. Cascade on both sides. */
export const charTags = sqliteTable(
	"character_tags",
	{
		charId: text("character_id")
			.notNull()
			.references(() => characters.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.charId, t.tagId] })],
)
