import { describe, expect, it } from "vitest"
import { splitIntoChunks } from "./chunks"
import type { NovelParagraph } from "./parse"

function makeParagraphs(n: number): readonly NovelParagraph[] {
	const out: NovelParagraph[] = []
	for (let i = 0; i < n; i += 1) {
		out.push({ index: i, text: `p${i}`, isChapterHeading: false })
	}
	return out
}

describe("splitIntoChunks", () => {
	it("returns no chunks for an empty paragraph list", () => {
		const idx = splitIntoChunks(makeParagraphs(0), 50)
		expect(idx.chunks).toEqual([])
	})

	it("creates chunks of the requested size and preserves indices", () => {
		const idx = splitIntoChunks(makeParagraphs(450), 200)
		expect(idx.chunks).toHaveLength(3)
		expect(idx.chunks[0]?.startParagraphIndex).toBe(0)
		expect(idx.chunks[0]?.paragraphs.length).toBe(200)
		expect(idx.chunks[1]?.startParagraphIndex).toBe(200)
		expect(idx.chunks[2]?.startParagraphIndex).toBe(400)
		expect(idx.chunks[2]?.paragraphs.length).toBe(50)
	})

	it("maps a paragraph index back to its containing chunk", () => {
		const idx = splitIntoChunks(makeParagraphs(450), 200)
		expect(idx.chunkOfParagraph(0)).toBe(0)
		expect(idx.chunkOfParagraph(199)).toBe(0)
		expect(idx.chunkOfParagraph(200)).toBe(1)
		expect(idx.chunkOfParagraph(399)).toBe(1)
		expect(idx.chunkOfParagraph(400)).toBe(2)
		expect(idx.chunkOfParagraph(449)).toBe(2)
	})

	it("rejects non-positive chunk sizes", () => {
		expect(() => splitIntoChunks(makeParagraphs(1), 0)).toThrow()
	})
})
