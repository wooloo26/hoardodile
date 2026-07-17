import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	clearUsageBeatQueue,
	enqueueUsageBeat,
	flushUsageBeats,
	queuedBeatCount,
} from "./beatQueue"

beforeEach(async () => {
	await clearUsageBeatQueue()
})

describe("beatQueue", () => {
	it("enqueues and flushes beats", async () => {
		const send = vi.fn().mockResolvedValue(undefined)
		await enqueueUsageBeat({
			sessionId: "s1",
			entityType: "resource",
			entityId: "r1",
			startedAt: 1,
			durationMs: 10_000,
			deviceId: "device-1",
			deviceInfo: {
				channel: "web",
				deviceType: "desktop",
				os: "windows",
				osVersion: "10",
				browser: "chrome",
				browserVersion: "125",
				appVersion: "",
			},
		})
		expect(await queuedBeatCount()).toBe(1)
		await flushUsageBeats(send)
		expect(send).toHaveBeenCalledTimes(1)
		expect(await queuedBeatCount()).toBe(0)
	})

	it("keeps failed beats for retry", async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error("network"))
		await enqueueUsageBeat({
			sessionId: "s1",
			entityType: "resource",
			entityId: "r1",
			startedAt: 1,
			durationMs: 10_000,
			deviceId: "device-1",
			deviceInfo: {
				channel: "web",
				deviceType: "desktop",
				os: "windows",
				osVersion: "10",
				browser: "chrome",
				browserVersion: "125",
				appVersion: "",
			},
		})
		await flushUsageBeats(send)
		expect(await queuedBeatCount()).toBe(1)
	})

	it("flushes multiple beats in parallel", async () => {
		const send = vi.fn().mockResolvedValue(undefined)
		for (let i = 0; i < 3; i++) {
			await enqueueUsageBeat({
				sessionId: `s${i}`,
				entityType: "resource",
				entityId: "r1",
				startedAt: i,
				durationMs: 10_000,
				deviceId: "device-1",
				deviceInfo: {
					channel: "web",
					deviceType: "desktop",
					os: "windows",
					osVersion: "10",
					browser: "chrome",
					browserVersion: "125",
					appVersion: "",
				},
			})
		}
		await flushUsageBeats(send)
		expect(send).toHaveBeenCalledTimes(3)
	})
})
