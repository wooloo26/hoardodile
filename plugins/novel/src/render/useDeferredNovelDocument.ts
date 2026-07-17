import { useEffect, useState } from "react"
import { type NovelDocument, parseNovel } from "./parse"

/**
 * Threshold (chars) above which novel parsing is deferred to a
 * `requestIdleCallback` slot rather than running inline. Below it the
 * parse cost is invisibly small and the extra round-trip would just
 * delay first paint of short documents.
 */
const NOVEL_PARSE_DEFERRAL_THRESHOLD = 200_000

type DeferredParseInput = Readonly<{
	raw: string | undefined
	chapterRegexSource: string | undefined
}>

/**
 * Run `parseNovel` outside the React commit phase so that opening a
 * multi-megabyte text file doesn't freeze the UI thread for hundreds
 * of milliseconds. Small documents take the synchronous path so the
 * common case still produces a first paint without the extra idle
 * round-trip.
 */
export function useDeferredNovelDocument(
	input: DeferredParseInput,
): NovelDocument | undefined {
	const { raw, chapterRegexSource } = input
	const [doc, setDoc] = useState<NovelDocument | undefined>(undefined)
	useEffect(
		function scheduleParse() {
			if (raw === undefined) {
				setDoc(undefined)
				return
			}
			if (raw.length <= NOVEL_PARSE_DEFERRAL_THRESHOLD) {
				setDoc(parseNovel(raw, { chapterRegexSource }))
				return
			}
			let cancelled = false
			function run() {
				if (cancelled) return
				const next = parseNovel(raw as string, { chapterRegexSource })
				if (cancelled) return
				setDoc(next)
			}
			const ric =
				typeof window !== "undefined" &&
				typeof window.requestIdleCallback === "function"
					? window.requestIdleCallback(run, { timeout: 250 })
					: window.setTimeout(run, 0)
			return function cancel() {
				cancelled = true
				if (
					typeof window !== "undefined" &&
					typeof window.cancelIdleCallback === "function"
				) {
					window.cancelIdleCallback(ric as number)
				} else {
					window.clearTimeout(ric as number)
				}
			}
		},
		[raw, chapterRegexSource],
	)
	return doc
}
