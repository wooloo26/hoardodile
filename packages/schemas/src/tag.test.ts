import { describe, expect, test } from "vitest"
import { tag } from "./tag.ts"

const valid = {
	id: "tag_1",
	name: "Red",
	intro: "",
	color: "#ff0000",
	position: 1,
	pinned: false,
	catId: "cat_1",
	createdAt: 0,
	updatedAt: 0,
} as const

describe("tag schema", () => {
	test("parses a valid tag", () => {
		expect(tag.parse(valid).name).toBe("Red")
	})

	test("rejects missing catId", () => {
		const { catId: _, ...rest } = valid
		expect(tag.safeParse(rest).success).toBe(false)
	})

	test("rejects empty name", () => {
		expect(tag.safeParse({ ...valid, name: "" }).success).toBe(false)
	})

	test("rejects overly long color", () => {
		expect(tag.safeParse({ ...valid, color: "a".repeat(101) }).success).toBe(
			false,
		)
	})
})
