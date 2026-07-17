import type { Comment } from "@hoardodile/plugin-sdk-web"

export function buildCommentsByParagraph(
	rows: readonly Comment[],
): ReadonlyMap<number, readonly Comment[]> {
	const map = new Map<number, Comment[]>()
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
