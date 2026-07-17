// @vitest-environment node

import { describe, expect, it } from "vitest"
import { readGalleryPreviews, readSourceMetaDimensions } from "../helpers"

describe("readGalleryPreviews", () => {
	it("returns undefined when meta is absent", () => {
		expect(readGalleryPreviews(undefined)).toBeUndefined()
	})

	it("returns empty array when previews is empty", () => {
		expect(readGalleryPreviews({ previews: [] })).toEqual([])
	})

	it("returns GalleryFile entries when previews use the new object format", () => {
		const previews = [
			{ filename: "01.jpg", type: "image" as const, preview: true },
			{ filename: "02.mp4", type: "video" as const, preview: false },
		]
		expect(readGalleryPreviews({ previews })).toEqual(previews)
	})
})

describe("readSourceMetaDimensions", () => {
	it("returns finite width and height when present", () => {
		expect(readSourceMetaDimensions({ width: 800, height: 600 })).toEqual({
			width: 800,
			height: 600,
		})
	})

	it("omits non-finite dimensions", () => {
		expect(
			readSourceMetaDimensions({
				width: Number.NaN,
				height: Number.POSITIVE_INFINITY,
			}),
		).toEqual({ width: undefined, height: undefined })
	})
})
