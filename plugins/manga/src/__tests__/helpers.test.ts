// @vitest-environment node

import { describe, expect, it } from "vitest"
import { readMangaPreviews } from "../render/helpers"

describe("readMangaPreviews", () => {
	it("parses new-format MangaPage[] from sourceMeta", () => {
		const meta = {
			width: 800,
			height: 1200,
			previews: [
				{
					filename: "a.jpg",
					type: "image" as const,
					width: 800,
					height: 1200,
					preview: true,
				},
				{
					filename: "b.jpg",
					type: "image" as const,
					width: 600,
					height: 900,
					preview: false,
				},
			],
		}
		const result = readMangaPreviews(meta)
		expect(result).toEqual([
			{
				filename: "a.jpg",
				type: "image",
				width: 800,
				height: 1200,
				preview: true,
			},
			{
				filename: "b.jpg",
				type: "image",
				width: 600,
				height: 900,
				preview: false,
			},
		])
	})

	it("returns undefined when meta is undefined", () => {
		expect(readMangaPreviews(undefined)).toBeUndefined()
	})

	it("returns an empty array when previews is an empty array", () => {
		expect(readMangaPreviews({ previews: [] })).toEqual([])
	})
})
