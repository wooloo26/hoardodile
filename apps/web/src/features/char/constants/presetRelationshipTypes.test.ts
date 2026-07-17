import type { RelationshipType } from "@hoardodile/schemas"
import { describe, expect, it } from "vitest"
import {
	buildCreateTypeInputFromPreset,
	isPresetAlreadyAdded,
	PRESET_RELATIONSHIP_TYPES,
	resolvePresetLabels,
} from "./presetRelationshipTypes"

const resolveZh: (
	key: string,
	field: "name" | "selfLabel" | "targetLabel",
) => string = (key, field) => {
	const labels: Record<string, Record<string, string>> = {
		friend: { name: "朋友", selfLabel: "朋友", targetLabel: "朋友" },
		mentor: { name: "师徒", selfLabel: "师父", targetLabel: "徒弟" },
		unrequited: { name: "单恋", selfLabel: "单恋者", targetLabel: "单恋对象" },
	}
	return labels[key]?.[field] ?? key
}

describe("resolvePresetLabels", () => {
	it("resolves localized labels for a preset key", () => {
		const preset = PRESET_RELATIONSHIP_TYPES[0]!
		expect(resolvePresetLabels(preset, resolveZh)).toEqual({
			name: "朋友",
			selfLabel: "朋友",
			targetLabel: "朋友",
		})
	})
})

describe("isPresetAlreadyAdded", () => {
	const preset = PRESET_RELATIONSHIP_TYPES.find((p) => p.key === "friend")!

	it("returns false when no matching type name exists", () => {
		const types: RelationshipType[] = []
		expect(isPresetAlreadyAdded(preset, types, resolveZh)).toBe(false)
	})

	it("returns true when a type with the same localized name exists", () => {
		const types = [
			{
				id: "t1",
				name: "朋友",
				selfLabel: "朋友",
				targetLabel: "朋友",
				kind: "symmetric",
				hierarchyFrom: null,
				position: 0,
				intro: "",
				color: "",
				pinned: false,
				createdAt: 0,
				updatedAt: 0,
			},
		] satisfies RelationshipType[]
		expect(isPresetAlreadyAdded(preset, types, resolveZh)).toBe(true)
	})
})

describe("buildCreateTypeInputFromPreset", () => {
	it("maps mentor preset semantics and labels into create input", () => {
		const preset = PRESET_RELATIONSHIP_TYPES.find((p) => p.key === "mentor")!
		const labels = resolvePresetLabels(preset, resolveZh)
		expect(buildCreateTypeInputFromPreset(preset, labels)).toEqual({
			name: "师徒",
			selfLabel: "师父",
			targetLabel: "徒弟",
			kind: "hierarchical",
			hierarchyFrom: "self",
		})
	})

	it("maps directed unrequited preset into create input", () => {
		const preset = PRESET_RELATIONSHIP_TYPES.find(
			(p) => p.key === "unrequited",
		)!
		const labels = resolvePresetLabels(preset, resolveZh)
		expect(buildCreateTypeInputFromPreset(preset, labels)).toEqual({
			name: "单恋",
			selfLabel: "单恋者",
			targetLabel: "单恋对象",
			kind: "directed",
			hierarchyFrom: null,
		})
	})
})
