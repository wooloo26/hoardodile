import type { CatWithCounts } from "../panelModel"

export type TabDescriptor = {
	readonly id: string
	readonly label: string
	readonly count: number
	readonly color?: string
}

/**
 * Build tab descriptors from categories.
 */
export function buildTabs(
	categories: readonly CatWithCounts[],
): readonly TabDescriptor[] {
	return categories.map((c) => ({
		id: c.id,
		label: c.name,
		count: c.tagCount,
		color: c.color,
	}))
}
