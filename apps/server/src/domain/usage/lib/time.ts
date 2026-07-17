import type {
	UsageEntityType,
	UsageReportGranularity,
} from "@hoardodile/schemas"
import {
	dayjsForInstant,
	formatUsagePeriod,
	getUsageDayBounds,
	parseInZone,
	requireIanaTimeZone,
} from "@hoardodile/shared/usage-period"
import type dayjs from "src/lib/dayjs.ts"

export type PeriodBounds = {
	readonly start: number
	readonly end: number
	readonly period: string
}

export { requireIanaTimeZone }

function dayjsFor(ts: number, timeZone: string): dayjs.Dayjs {
	return dayjsForInstant(ts, timeZone)
}

/**
 * Parse a period string for the given granularity and time zone.
 *
 * - `day`: `YYYY-MM-DD`
 * - `week`: `YYYY-Www`
 * - `month`: `YYYY-MM`
 * - `year`: `YYYY`
 */
function parsePeriod(
	granularity: UsageReportGranularity,
	period: string,
	timeZone: string,
): dayjs.Dayjs {
	switch (granularity) {
		case "day":
			return parseInZone(period, timeZone).startOf("day")
		case "week": {
			const match = /^(\d{4})-W(\d{2})$/.exec(period)
			if (match === null) {
				throw new Error(`Invalid week period: ${period}`)
			}
			const [, year, week] = match
			// Jan 4 is always in ISO week 1; anchor before applying week/year.
			return parseInZone(`${year}-01-04`, timeZone)
				.isoWeek(Number(week))
				.isoWeekday(1)
				.startOf("day")
		}
		case "month":
			return parseInZone(period, timeZone).startOf("month")
		case "year":
			return parseInZone(period, timeZone).startOf("year")
	}
}

function nextPeriodStart(
	start: dayjs.Dayjs,
	granularity: UsageReportGranularity,
): dayjs.Dayjs {
	const next = start.add(1, granularity as dayjs.ManipulateType)
	switch (granularity) {
		case "day":
		case "week":
			return next.startOf("day")
		case "month":
			return next.startOf("month")
		case "year":
			return next.startOf("year")
	}
}

export function getPeriodBounds(
	granularity: UsageReportGranularity,
	period: string,
	timeZone: string,
): PeriodBounds {
	const start = parsePeriod(granularity, period, timeZone)
	const end = nextPeriodStart(start, granularity)
	return {
		start: start.valueOf(),
		end: end.valueOf(),
		period,
	}
}

export function formatPeriod(
	ts: number,
	granularity: UsageReportGranularity,
	timeZone: string,
): string {
	return formatUsagePeriod(ts, granularity, timeZone)
}

export function getTrendPeriods(
	granularity: UsageReportGranularity,
	periods: number,
	nowMs: number,
	timeZone: string,
): readonly PeriodBounds[] {
	const now = dayjsFor(nowMs, timeZone)
	const current =
		granularity === "week"
			? now.isoWeekday(1).startOf("day")
			: now.startOf(granularity)

	const result: PeriodBounds[] = []
	for (let i = periods - 1; i >= 0; i--) {
		const start = current.subtract(i, granularity as dayjs.ManipulateType)
		const end = nextPeriodStart(start, granularity)
		result.push({
			start: start.valueOf(),
			end: end.valueOf(),
			period: formatPeriod(start.valueOf(), granularity, timeZone),
		})
	}
	return result
}

export function getDayBounds(
	day: string,
	timeZone: string,
): { readonly start: number; readonly end: number } {
	return getUsageDayBounds(day, timeZone)
}

/** Inclusive start of a rolling calendar-day window ending at `nowMs`. */
export function getCalendarWindowStart(
	nowMs: number,
	windowDays: number,
	timeZone: string,
): number {
	requireIanaTimeZone(timeZone)
	const firstDay = dayjsFor(nowMs, timeZone)
		.subtract(windowDays - 1, "day")
		.format("YYYY-MM-DD")
	return getDayBounds(firstDay, timeZone).start
}

/** Whole calendar days from `earlierMs` to `laterMs` in `timeZone`. */
export function calendarDaysSince(
	earlierMs: number,
	laterMs: number,
	timeZone: string,
): number {
	requireIanaTimeZone(timeZone)
	const laterDay = dayjsFor(laterMs, timeZone).startOf("day")
	const earlierDay = dayjsFor(earlierMs, timeZone).startOf("day")
	return laterDay.diff(earlierDay, "day")
}

type DayHourBucket = {
	readonly hourStart: number
	readonly label: string
}

function buildDayHourBuckets(
	day: string,
	timeZone: string,
): readonly DayHourBucket[] {
	const buckets: DayHourBucket[] = []
	for (let hour = 0; hour < 24; hour++) {
		const label = `${String(hour).padStart(2, "0")}:00`
		const parsed = parseInZone(`${day} ${label}`, timeZone)
		if (
			parsed.format("YYYY-MM-DD") !== day ||
			parsed.format("HH:mm") !== label
		) {
			continue
		}
		buckets.push({ hourStart: parsed.valueOf(), label })
	}

	const expanded: DayHourBucket[] = []
	for (let i = 0; i < buckets.length; i++) {
		const bucket = buckets[i]!
		expanded.push(bucket)
		const next = buckets[i + 1]
		if (next === undefined) break
		let cursor = bucket.hourStart + 60 * 60 * 1000
		while (
			next.hourStart - bucket.hourStart > 60 * 60 * 1000 &&
			cursor < next.hourStart
		) {
			expanded.push({
				hourStart: cursor,
				label: dayjsFor(cursor, timeZone).format("HH:mm"),
			})
			cursor += 60 * 60 * 1000
		}
	}
	return expanded
}

/** Local hour starts and display labels for a calendar day in the given zone. */
export function getDayHourBuckets(
	dayStart: number,
	_dayEnd: number,
	timeZone: string,
): {
	readonly hourStarts: readonly number[]
	readonly labels: readonly string[]
} {
	const day = dayjsFor(dayStart, timeZone).format("YYYY-MM-DD")
	const buckets = buildDayHourBuckets(day, timeZone)
	return {
		hourStarts: buckets.map((bucket) => bucket.hourStart),
		labels: buckets.map((bucket) => bucket.label),
	}
}

/**
 * Split a session into hourly buckets in the given time zone.
 *
 * Returns one bucket per local hour in the calendar day (23, 24, or 25 on DST
 * transition days). Sessions that span local midnight are truncated to the
 * provided day bounds.
 */
export function splitSessionIntoHourlyMs(
	startedAt: number,
	endedAt: number,
	dayStart: number,
	dayEnd: number,
	timeZone: string,
): readonly number[] {
	const { hourStarts } = getDayHourBuckets(dayStart, dayEnd, timeZone)
	const hourlyMs = Array.from({ length: hourStarts.length }, () => 0)

	const overlapStart = Math.max(startedAt, dayStart)
	const overlapEnd = Math.min(endedAt, dayEnd)
	if (overlapEnd <= overlapStart) return hourlyMs

	for (let i = 0; i < hourStarts.length; i++) {
		const hourStart = hourStarts[i]!
		const hourEnd = i + 1 < hourStarts.length ? hourStarts[i + 1]! : dayEnd
		const segmentStart = Math.max(hourStart, overlapStart)
		const segmentEnd = Math.min(hourEnd, overlapEnd)
		if (segmentEnd > segmentStart) {
			hourlyMs[i] = segmentEnd - segmentStart
		}
	}

	return hourlyMs
}

/**
 * Filter sessions to those that overlap the given time range and belong to the
 * requested entity/client filters.
 */
export function overlapMs(
	aStart: number,
	aEnd: number,
	bStart: number,
	bEnd: number,
): number {
	const start = Math.max(aStart, bStart)
	const end = Math.min(aEnd, bEnd)
	return end > start ? end - start : 0
}

export function matchesSessionFilters(
	row: {
		readonly entityType: string
		readonly startedAt: number
		readonly endedAt: number
	},
	filters: {
		readonly entityType?: UsageEntityType
		readonly from?: number
		readonly to?: number
	},
): boolean {
	if (
		filters.entityType !== undefined &&
		row.entityType !== filters.entityType
	) {
		return false
	}
	if (filters.from !== undefined && row.endedAt < filters.from) return false
	if (filters.to !== undefined && row.startedAt >= filters.to) return false
	return true
}
