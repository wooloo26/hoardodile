import type { UsageTotal } from "@hoardodile/schemas"
import { describe, expect, it } from "vitest"
import {
	computePeriodTotalMs,
	computePeriodTotalViews,
	mergeShareTotals,
	shareListOrder,
} from "./statsShare"

const rows: UsageTotal[] = [
	{
		id: "a",
		entityType: "resource",
		entityId: "r1",
		granularity: "all",
		period: null,
		totalMs: 100,
		viewCount: 2,
		lastViewedAt: 1,
		updatedAt: 1,
	},
	{
		id: "b",
		entityType: "resource",
		entityId: "r2",
		granularity: "all",
		period: null,
		totalMs: 50,
		viewCount: 5,
		lastViewedAt: 2,
		updatedAt: 2,
	},
]

describe("statsShare", () => {
	it("mergeShareTotals sorts by time or views", () => {
		expect(mergeShareTotals(rows, 10, "time")[0]?.entityId).toBe("r1")
		expect(mergeShareTotals(rows, 10, "views")[0]?.entityId).toBe("r2")
	})

	it("shareListOrder maps metric to API order", () => {
		expect(shareListOrder("time")).toBe("time")
		expect(shareListOrder("views")).toBe("views")
	})

	it("computePeriodTotalViews uses dashboard totalViews for all range", () => {
		expect(
			computePeriodTotalViews({
				range: "all",
				dailySummary: undefined,
				dashboard: { totalViews: 12 },
				trend: undefined,
			}),
		).toBe(12)
	})

	it("computePeriodTotalMs uses dashboard totalMs for all range", () => {
		expect(
			computePeriodTotalMs({
				range: "all",
				dailySummary: undefined,
				dashboard: { totalMs: 99_000 },
				trend: undefined,
			}),
		).toBe(99_000)
	})
})
