import type { Message } from "@hoardodile/plugin-sdk-web"

export function buildCommentsByParagraph(
	rows: readonly Message[],
): ReadonlyMap<number, readonly Message[]> {
	const map = new Map<number, Message[]>()
	for (const c of rows) {
		const a = c.anchor
		if (a === undefined) continue
		const data = a.data as { readonly paragraphIndex?: number } | undefined
		if (data?.paragraphIndex === undefined) continue
		const arr = map.get(data.paragraphIndex) ?? []
		arr.push(c)
		map.set(data.paragraphIndex, arr)
	}
	return map
}
