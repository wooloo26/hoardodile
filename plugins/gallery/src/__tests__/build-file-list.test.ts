// @vitest-environment node

import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { naturalSort } from "@hoardodile/plugin-sdk-server/helpers"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"

function createApiStub(
	files: readonly string[],
	overrides: Partial<ResourceAPI> = {},
): ResourceAPI {
	return {
		logInfo() {},
		logWarn() {},
		logError() {},
		listFiles: async () => files,
		readFile: async () => new Uint8Array(),
		statFile: async () => ({ sizeBytes: 100 }),
		probeImage: async () => ({ width: 800, height: 1200 }),
		probeVideo: async () => undefined,
		probeAudio: async () => undefined,
		isAnimatedImage: async () => false,
		setCover: async () => {},
		clearCover: async () => {},
		setLocalCover: async () => {},
		...overrides,
	}
}

describe("gallery listFiles", () => {
	it("returns natural-sorted media entries, skipping unknown types", async () => {
		const media = ["10.jpg", "2.jpg", "01.mp4", "02.mp3", "03.webp"]
		const fixture = createResourceAPIFixture({
			files: [...media, "readme.txt"],
			probes: {
				image: { "": { width: 800, height: 1200 } },
				video: { "": { width: 640, height: 480, durationMs: 1000 } },
			},
			stats: { sizeBytes: 100 },
		})
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual(naturalSort(media))

		const byName = new Map(result?.map((f) => [f.filename, f]))
		expect(byName.get("01.mp4")).toMatchObject({
			type: "video",
			width: 640,
			durationMs: 1000,
		})
		expect(byName.get("02.mp3")).toEqual({ filename: "02.mp3", type: "audio" })
		expect(byName.get("2.jpg")).toMatchObject({ type: "image", width: 800 })
		expect(byName.has("readme.txt")).toBe(false)
	})

	it("probes images and videos concurrently within their own bounds", async () => {
		const images = Array.from(
			{ length: 20 },
			(_, i) => `${String(i).padStart(3, "0")}.jpg`,
		)
		const videos = Array.from(
			{ length: 10 },
			(_, i) => `${String(i).padStart(3, "0")}.mp4`,
		)
		let imageInFlight = 0
		let maxImageInFlight = 0
		let videoInFlight = 0
		let maxVideoInFlight = 0
		const api = createApiStub([...images, ...videos], {
			probeImage: async () => {
				imageInFlight++
				maxImageInFlight = Math.max(maxImageInFlight, imageInFlight)
				await new Promise((resolve) => setTimeout(resolve, 5))
				imageInFlight--
				return { width: 800, height: 1200 }
			},
			probeVideo: async () => {
				videoInFlight++
				maxVideoInFlight = Math.max(maxVideoInFlight, videoInFlight)
				await new Promise((resolve) => setTimeout(resolve, 5))
				videoInFlight--
				return { width: 640, height: 480 }
			},
		})
		const result = await plugin.listFiles?.(api)
		expect(result).toHaveLength(30)
		expect(maxImageInFlight).toBeGreaterThan(1)
		expect(maxImageInFlight).toBeLessThanOrEqual(8)
		expect(maxVideoInFlight).toBeGreaterThan(1)
		expect(maxVideoInFlight).toBeLessThanOrEqual(4)
	})
})
