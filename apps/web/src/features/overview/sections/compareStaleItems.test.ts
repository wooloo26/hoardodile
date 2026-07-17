import { describe, expect, it } from "vitest"
import { stubResCard } from "@/test/stubs/cards"
import { compareStaleItems } from "./compareStaleItems"

function resourceStaleItem(
	id: string,
	name: string,
	createdAt: number,
	staleRank: number,
) {
	return {
		kind: "resource" as const,
		card: stubResCard(id, name, {
			createdAt,
			updatedAt: createdAt,
		}),
		staleRank,
		createdAt,
	}
}

describe("compareStaleItems", () => {
	it("sorts by createdAt ascending when stale rank ties", () => {
		const older = resourceStaleItem(
			"res-old",
			"Old",
			100,
			Number.POSITIVE_INFINITY,
		)
		const newer = resourceStaleItem(
			"res-new",
			"New",
			200,
			Number.POSITIVE_INFINITY,
		)

		expect(compareStaleItems(older, newer)).toBeLessThan(0)
		expect(compareStaleItems(newer, older)).toBeGreaterThan(0)
		expect(
			[newer, older].sort(compareStaleItems).map((item) => item.card.id),
		).toEqual(["res-old", "res-new"])
	})
})
