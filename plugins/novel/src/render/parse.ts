/**
 * Default chapter regex covering both Chinese (e.g. `第一章 …`,
 * `第十二卷 …`) and common English markers
 * (`Chapter 5`, `Prologue`, `Epilogue`). Users can override via the
 * novel reader settings.
 */
export const DEFAULT_CHAPTER_REGEX_SOURCE =
	"^\\s*(?:第[\\d一二三四五六七八九十百千零两]+[章卷]|Chapter\\s+\\d+|Prologue|Epilogue)" as const

export const DEFAULT_CHAPTER_REGEX_FLAGS = "i" as const

export type NovelParagraph = {
	readonly index: number
	readonly text: string
	readonly isChapterHeading: boolean
}

export type NovelChapter = {
	readonly paragraphIndex: number
	readonly title: string
}

export type NovelDocument = {
	readonly paragraphs: readonly NovelParagraph[]
	readonly chapters: readonly NovelChapter[]
}

/**
 * Strip the BOM, normalise CRLF/LF/CR to `\n`, and trim trailing
 * whitespace per line. Pure so reader components can re-parse on the
 * fly when the user changes the chapter regex without re-fetching.
 */
export function normalizeNovelText(raw: string): string {
	const bomStripped = raw.startsWith("\uFEFF") ? raw.slice(1) : raw
	return bomStripped.replace(/\r\n?/g, "\n")
}

/**
 * Split into paragraphs on any run of one-or-more newlines. Empty
 * paragraphs are dropped — they would otherwise inflate paragraph
 * indices and confuse the comment-anchor jump UI.
 */
export function splitNovelParagraphs(normalized: string): readonly string[] {
	return normalized
		.split(/\n+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
}

export type ParseNovelOptions = {
	readonly chapterRegexSource?: string
	readonly chapterRegexFlags?: string
}

/**
 * Build a {@link NovelDocument} from raw text. Caller chooses whether
 * to use the default chapter regex or a user-supplied one (via
 * settings); we tolerate an invalid regex by falling back to the
 * default rather than throwing into the render path.
 */
export function parseNovel(
	raw: string,
	opts: ParseNovelOptions = {},
): NovelDocument {
	const chapterRegex = compileChapterRegex(opts)
	const text = normalizeNovelText(raw)
	const paragraphTexts = splitNovelParagraphs(text)
	const paragraphs: NovelParagraph[] = []
	const chapters: NovelChapter[] = []
	for (let i = 0; i < paragraphTexts.length; i += 1) {
		const t = paragraphTexts[i]
		if (t === undefined) continue
		const isHeading = chapterRegex.test(t)
		paragraphs.push({ index: i, text: t, isChapterHeading: isHeading })
		if (isHeading) {
			chapters.push({ paragraphIndex: i, title: t })
		}
	}
	return { paragraphs, chapters }
}

function compileChapterRegex(opts: ParseNovelOptions): RegExp {
	const source = opts.chapterRegexSource || DEFAULT_CHAPTER_REGEX_SOURCE
	const flags = opts.chapterRegexFlags ?? DEFAULT_CHAPTER_REGEX_FLAGS
	try {
		return new RegExp(source, flags)
	} catch {
		return new RegExp(DEFAULT_CHAPTER_REGEX_SOURCE, DEFAULT_CHAPTER_REGEX_FLAGS)
	}
}
