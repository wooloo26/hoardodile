import { cn } from "@hoardodile/ui/lib/utils"
import type { NovelChunk } from "./chunks"

export type ParagraphBaseStyle = Readonly<{
	fontSize: string
	lineHeight: number
	letterSpacing: string
}>

const CHAPTER_PARAGRAPH_OVERRIDES = {
	// Treat chapter headings as a page break only — the next paragraph
	// continues in the same column right below the heading instead of
	// each chapter title eating an entire otherwise-empty page.
	breakBefore: "column",
	breakInside: "avoid",
	textAlign: "center",
	textIndent: 0,
	marginTop: "1em",
	marginBottom: "1em",
} as const

export function NovelParagraphView(props: {
	readonly paragraph: NovelChunk["paragraphs"][number]
	readonly baseStyle: ParagraphBaseStyle
	readonly commentCount: number
}) {
	const { paragraph: p, baseStyle, commentCount } = props
	const paragraphStyle = p.isChapterHeading
		? { ...baseStyle, ...CHAPTER_PARAGRAPH_OVERRIDES }
		: {
				...baseStyle,
				// Chinese typesetting convention: indent the first line of
				// every body paragraph by two full-width characters. `2em`
				// ≈ two CJK glyphs at the configured `fontSize`.
				textIndent: "2em",
			}
	return (
		<p
			data-pidx={p.index}
			className={cn(
				"wrap-break-word py-1 transition-colors",
				p.isChapterHeading && "font-semibold",
			)}
			style={paragraphStyle}
		>
			{p.text}
			{commentCount > 0 ? (
				<span className="ml-2 mb-2 p-1 border rounded-sm text-xs align-top">
					{commentCount}
				</span>
			) : null}
		</p>
	)
}
