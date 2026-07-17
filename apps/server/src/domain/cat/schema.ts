import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Domain table for {@link import("@hoardodile/schemas").Category}. Categories are
 * flat: there is no parent/child relationship. Hard-deleted only - there is
 * no soft-delete lifecycle.
 */
export const categories = sqliteTable("categories", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	intro: text("intro").notNull().default(""),
	color: text("color").notNull().default(""),
	kind: text("kind", {
		enum: ["common", "resource", "character"],
	}).notNull(),
	position: integer("position").notNull().default(0),
	pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
})
