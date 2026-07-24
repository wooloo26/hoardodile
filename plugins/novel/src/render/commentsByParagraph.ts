import type { Message } from "@hoardodile/plugin-sdk-web"
import { decodeNovelParagraphAnchor } from "../shared"

export function buildCommentsByParagraph(
	rows: readonly Message[],
): ReadonlyMap<number, readonly Message[]> {
	const map = new Map<number, Message[]>()
	for (const c of rows) {
		const a = c.anchor
		if (a === undefined) continue
		const anchor = decodeNovelParagraphAnchor(a.data)
		if (anchor === undefined) continue
		const arr = map.get(anchor.paragraphIndex) ?? []
		arr.push(c)
		map.set(anchor.paragraphIndex, arr)
	}
	return map
}
