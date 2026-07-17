import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core"

/**
 * A single viewing session.
 *
 * Each row represents a continuous period during which the user was
 * actively viewing one primary entity. The same physical viewing session
 * is updated by repeated heartbeats; `endedAt` and `durationMs` grow until
 * the user navigates away or the tab becomes inactive.
 */
export const usageDevices = sqliteTable(
	"usage_devices",
	{
		id: text("id").primaryKey(),
		/** Channel through which the device accesses the app. */
		channel: text("channel").notNull(),
		/** Broad form factor: mobile, tablet, desktop, tv, unknown. */
		deviceType: text("device_type").notNull(),
		/** Operating-system family. */
		os: text("os").notNull(),
		/** Operating-system version. */
		osVersion: text("os_version").notNull().default(""),
		/** Browser family (blank for non-web channels). */
		browser: text("browser").notNull(),
		/** Browser version. */
		browserVersion: text("browser_version").notNull().default(""),
		/** Application version. */
		appVersion: text("app_version").notNull().default(""),
		/** First heartbeat timestamp for this device. */
		firstSeenAt: integer("first_seen_at").notNull(),
		/** Last heartbeat timestamp for this device. */
		lastSeenAt: integer("last_seen_at").notNull(),
	},
	(t) => [index("usage_devices_last_seen_idx").on(t.lastSeenAt)],
)

export const usageSessions = sqliteTable(
	"usage_sessions",
	{
		id: text("id").primaryKey(),
		/** Entity kind that was directly opened. */
		entityType: text("entity_type").notNull(),
		/** Entity id that was directly opened. */
		entityId: text("entity_id").notNull(),
		/** Session start timestamp. */
		startedAt: integer("started_at").notNull(),
		/** Last heartbeat timestamp. */
		endedAt: integer("ended_at").notNull(),
		/** Total active viewing time in milliseconds. */
		durationMs: integer("duration_ms").notNull(),
		/** Optional device identifier for multi-device analytics. */
		deviceId: text("device_id"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [
		index("usage_sessions_entity_idx").on(
			t.entityType,
			t.entityId,
			t.startedAt,
		),
		index("usage_sessions_started_idx").on(t.startedAt),
		index("usage_sessions_ended_idx").on(t.endedAt),
	],
)

/**
 * Links a viewing session to related entities.
 *
 * When a resource is viewed, its owning plugin and linked characters are
 * recorded here. When a document is viewed, its linked resources and
 * characters are recorded here. This allows reporting "associated"
 * exposure without inflating the primary totals.
 */
export const usageSessionAssociations = sqliteTable(
	"usage_session_associations",
	{
		sessionId: text("session_id").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		/** Relationship kind, e.g. `owner`, `linked`, `contained`. */
		associationKind: text("association_kind").notNull(),
	},
	(t) => [
		primaryKey({
			columns: [t.sessionId, t.entityType, t.entityId],
		}),
		index("usage_session_associations_entity_idx").on(t.entityType, t.entityId),
	],
)

export type UsageDeviceRow = typeof usageDevices.$inferSelect
export type UsageDeviceInsert = typeof usageDevices.$inferInsert
export type UsageSessionRow = typeof usageSessions.$inferSelect
export type UsageSessionInsert = typeof usageSessions.$inferInsert
export type UsageSessionAssociationRow =
	typeof usageSessionAssociations.$inferSelect
export type UsageSessionAssociationInsert =
	typeof usageSessionAssociations.$inferInsert
