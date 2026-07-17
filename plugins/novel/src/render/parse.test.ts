import { describe, expect, it } from "vitest"
import {
	DEFAULT_CHAPTER_REGEX_FLAGS,
	DEFAULT_CHAPTER_REGEX_SOURCE,
	normalizeNovelText,
	parseNovel,
	splitNovelParagraphs,
} from "./parse"

describe("normalizeNovelText", () => {
	it("strips a leading BOM", () => {
		expect(normalizeNovelText("\uFEFFhello")).toBe("hello")
	})

	it("normalises CRLF and CR to LF", () => {
		expect(normalizeNovelText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd")
	})
})

describe("splitNovelParagraphs", () => {
	it("collapses multiple blank lines and trims paragraphs", () => {
		expect(splitNovelParagraphs("a\n\n\n  b  \n\n c")).toEqual(["a", "b", "c"])
	})

	it("drops empty paragraphs", () => {
		expect(splitNovelParagraphs("\n\n\n")).toEqual([])
	})
})

describe("parseNovel", () => {
	it("detects Chinese chapter headings via the default regex", () => {
		const doc = parseNovel("第一章 起始\n正文段落\n第二卷 续\n更多")
		expect(doc.paragraphs).toHaveLength(4)
		expect(doc.chapters.map((c) => c.title)).toEqual([
			"第一章 起始",
			"第二卷 续",
		])
	})

	it("detects English chapter headings (Chapter, Prologue, Epilogue)", () => {
		const doc = parseNovel("Prologue\nintro\nChapter 1\nbody\nEpilogue\nend")
		expect(doc.chapters.map((c) => c.title)).toEqual([
			"Prologue",
			"Chapter 1",
			"Epilogue",
		])
	})

	it("falls back to the default regex when the supplied source is invalid", () => {
		const doc = parseNovel("第一章 t\nbody", { chapterRegexSource: "(" })
		// Default regex still matches the Chinese heading.
		expect(doc.chapters).toHaveLength(1)
	})

	it("honours a user-supplied chapter regex when valid", () => {
		const doc = parseNovel("Section A\nbody\nSection B\nmore", {
			chapterRegexSource: "^Section\\s+[A-Z]",
			chapterRegexFlags: "",
		})
		expect(doc.chapters.map((c) => c.title)).toEqual(["Section A", "Section B"])
	})

	it("exports the default regex constants for reuse", () => {
		expect(typeof DEFAULT_CHAPTER_REGEX_SOURCE).toBe("string")
		expect(DEFAULT_CHAPTER_REGEX_FLAGS).toBe("i")
	})
})
