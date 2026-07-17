import { describe, expect, test } from "vitest"
import {
	calendarDaysSince,
	formatPeriod,
	getCalendarWindowStart,
	getDayBounds,
	getDayHourBuckets,
	getPeriodBounds,
	getTrendPeriods,
	requireIanaTimeZone,
	splitSessionIntoHourlyMs,
} from "./time.ts"

describe("assertIanaTimeZone", () => {
	test("rejects local sentinel", () => {
		expect(() => getDayBounds("2026-06-15", "local")).toThrow(
			/timeZone must be a resolved IANA zone/,
		)
	})

	test("rejects empty string", () => {
		expect(() => getDayBounds("2026-06-15", "")).toThrow(
			/timeZone must be a resolved IANA zone/,
		)
	})
})

describe("requireIanaTimeZone", () => {
	test("rejects undefined", () => {
		expect(() => requireIanaTimeZone(undefined)).toThrow(
			/timeZone is required for period-bound usage queries/,
		)
	})
})

describe("getDayBounds", () => {
	test("returns Shanghai calendar day boundaries in UTC milliseconds", () => {
		const { start, end } = getDayBounds("2026-06-15", "Asia/Shanghai")
		expect(start).toBe(Date.UTC(2026, 5, 14, 16, 0, 0))
		expect(end).toBe(Date.UTC(2026, 5, 15, 16, 0, 0))
	})

	test("returns UTC calendar day boundaries", () => {
		const { start, end } = getDayBounds("2026-06-15", "UTC")
		expect(start).toBe(Date.UTC(2026, 5, 15, 0, 0, 0))
		expect(end).toBe(Date.UTC(2026, 5, 16, 0, 0, 0))
	})

	test("spring-forward day is 23 hours in America/New_York", () => {
		const { start, end } = getDayBounds("2024-03-10", "America/New_York")
		expect(end - start).toBe(23 * 60 * 60 * 1000)
	})
})

describe("getPeriodBounds", () => {
	test("parses ISO week period in IANA zone", () => {
		const bounds = getPeriodBounds("week", "2026-W24", "Asia/Shanghai")
		expect(bounds.period).toBe("2026-W24")
		expect(bounds.end - bounds.start).toBe(7 * 24 * 60 * 60 * 1000)
	})

	test("parses month and year periods", () => {
		const month = getPeriodBounds("month", "2026-06", "UTC")
		expect(month.start).toBe(Date.UTC(2026, 5, 1, 0, 0, 0))
		expect(month.end).toBe(Date.UTC(2026, 6, 1, 0, 0, 0))

		const year = getPeriodBounds("year", "2026", "UTC")
		expect(year.start).toBe(Date.UTC(2026, 0, 1, 0, 0, 0))
		expect(year.end).toBe(Date.UTC(2027, 0, 1, 0, 0, 0))
	})

	test("spring-forward ISO week is 167 hours in America/New_York", () => {
		const bounds = getPeriodBounds("week", "2024-W10", "America/New_York")
		expect(bounds.period).toBe("2024-W10")
		expect(bounds.end - bounds.start).toBe(167 * 60 * 60 * 1000)
	})

	test("fall-back ISO week is 169 hours in America/New_York", () => {
		const bounds = getPeriodBounds("week", "2024-W44", "America/New_York")
		expect(bounds.period).toBe("2024-W44")
		expect(bounds.end - bounds.start).toBe(169 * 60 * 60 * 1000)
	})
})

describe("formatPeriod", () => {
	const ts = Date.UTC(2026, 5, 15, 4, 30, 0)

	test("formats day/week/month/year in zone", () => {
		expect(formatPeriod(ts, "day", "Asia/Shanghai")).toBe("2026-06-15")
		expect(formatPeriod(ts, "week", "Asia/Shanghai")).toMatch(/^2026-W\d{2}$/)
		expect(formatPeriod(ts, "month", "Asia/Shanghai")).toBe("2026-06")
		expect(formatPeriod(ts, "year", "Asia/Shanghai")).toBe("2026")
	})
})

describe("getTrendPeriods", () => {
	test("returns consecutive daily buckets ending at now", () => {
		const nowMs = Date.UTC(2026, 5, 15, 10, 0, 0)
		const buckets = getTrendPeriods("day", 3, nowMs, "UTC")
		expect(buckets).toHaveLength(3)
		expect(buckets[2]?.period).toBe("2026-06-15")
		expect(buckets[0]?.period).toBe("2026-06-13")
	})

	test("week bucket spanning spring-forward is 167 hours in America/New_York", () => {
		const nowMs = Date.UTC(2024, 2, 10, 18, 0, 0)
		const buckets = getTrendPeriods("week", 1, nowMs, "America/New_York")
		expect(buckets).toHaveLength(1)
		expect(buckets[0]?.period).toBe("2024-W10")
		expect(buckets[0]!.end - buckets[0]!.start).toBe(167 * 60 * 60 * 1000)
	})
})

describe("splitSessionIntoHourlyMs", () => {
	test("assigns cross-midnight overlap to Shanghai hour 0 only", () => {
		const shanghaiMidnight = Date.UTC(2026, 5, 14, 16, 0, 0)
		const dayStart = shanghaiMidnight
		const dayEnd = shanghaiMidnight + 24 * 60 * 60 * 1000
		const sessionStart = shanghaiMidnight - 30 * 60 * 1000
		const sessionEnd = shanghaiMidnight + 30 * 60 * 1000

		const hourlyMs = splitSessionIntoHourlyMs(
			sessionStart,
			sessionEnd,
			dayStart,
			dayEnd,
			"Asia/Shanghai",
		)

		expect(hourlyMs).toHaveLength(24)
		expect(hourlyMs[0]).toBe(30 * 60 * 1000)
		expect(hourlyMs[23]).toBe(0)
		expect(hourlyMs.reduce((sum, ms) => sum + ms, 0)).toBe(30 * 60 * 1000)
	})

	test("spring-forward day has 23 local hours in America/New_York", () => {
		const { start, end } = getDayBounds("2024-03-10", "America/New_York")
		const { hourStarts, labels } = getDayHourBuckets(
			start,
			end,
			"America/New_York",
		)

		expect(hourStarts).toHaveLength(23)
		expect(labels).toHaveLength(23)
		expect(labels).not.toContain("02:00")

		const sessionStart = hourStarts[1]!
		const sessionEnd = hourStarts[2]!
		const hourlyMs = splitSessionIntoHourlyMs(
			sessionStart,
			sessionEnd,
			start,
			end,
			"America/New_York",
		)
		expect(hourlyMs[1]).toBe(sessionEnd - sessionStart)
		expect(hourlyMs.reduce((sum, ms) => sum + ms, 0)).toBe(
			sessionEnd - sessionStart,
		)
	})

	test("fall-back day has 25 local hours in America/New_York", () => {
		const { start, end } = getDayBounds("2024-11-03", "America/New_York")
		const { hourStarts, labels } = getDayHourBuckets(
			start,
			end,
			"America/New_York",
		)

		expect(hourStarts).toHaveLength(25)
		expect(labels).toHaveLength(25)
		const firstOneAm = labels.indexOf("01:00")
		const secondOneAm = labels.lastIndexOf("01:00")
		expect(firstOneAm).toBeGreaterThanOrEqual(0)
		expect(secondOneAm).toBeGreaterThan(firstOneAm)

		const sessionStart = hourStarts[firstOneAm]!
		const sessionEnd = hourStarts[firstOneAm]! + 30 * 60 * 1000
		const hourlyMs = splitSessionIntoHourlyMs(
			sessionStart,
			sessionEnd,
			start,
			end,
			"America/New_York",
		)
		expect(hourlyMs[firstOneAm]).toBe(30 * 60 * 1000)
	})
})

describe("calendar day helpers", () => {
	test("getCalendarWindowStart matches rolling seven-day window", () => {
		const nowMs = Date.UTC(2026, 5, 15, 10, 0, 0)
		const start = getCalendarWindowStart(nowMs, 7, "Asia/Shanghai")
		expect(start).toBe(Date.UTC(2026, 5, 8, 16, 0, 0))
	})

	test("calendarDaysSince counts whole local days", () => {
		const earlier = Date.UTC(2026, 5, 10, 23, 0, 0)
		const later = Date.UTC(2026, 5, 12, 1, 0, 0)
		expect(calendarDaysSince(earlier, later, "UTC")).toBe(2)
	})
})
