import { describe, expect, test } from "vitest"
import { resource } from "./res.ts"

const TEST_PLUGIN_ID = "665cfbdd-1db6-48f5-9d53-1008b8cb84c3"

const valid = {
	id: "01J0000000000000000000RES0",
	name: "Hello",
	intro: "",
	tagIds: [],
	charIds: [],
	contentPluginId: TEST_PLUGIN_ID,
	coverVersion: 1,
	createdAt: 0,
	updatedAt: 0,
} as const

describe("resource schema", () => {
	test("parses a valid resource", () => {
		const parsed = resource.parse(valid)
		expect(parsed.id).toBe(valid.id)
		expect(parsed.contentPluginId).toBe(TEST_PLUGIN_ID)
	})

	test("applies defaults for intro, tagIds, charIds", () => {
		const { intro, tagIds, charIds, ...rest } = valid
		void intro
		void tagIds
		void charIds
		const parsed = resource.parse(rest)
		expect(parsed.intro).toBe("")
		expect(parsed.tagIds).toEqual([])
		expect(parsed.charIds).toEqual([])
	})

	test("rejects empty name", () => {
		expect(resource.safeParse({ ...valid, name: "" }).success).toBe(false)
	})

	test("rejects invalid contentPluginId", () => {
		expect(
			resource.safeParse({ ...valid, contentPluginId: "not-a-uuid" }).success,
		).toBe(false)
	})

	test("accepts a soft-deleted resource (deletedAt number)", () => {
		const parsed = resource.parse({ ...valid, deletedAt: 1_700_000_000_000 })
		expect(parsed.deletedAt).toBe(1_700_000_000_000)
	})
})
