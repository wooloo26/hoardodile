/**
 * Compute the number of pages for a paginated list given a total row count
 * and the page size. Always at least 1 so the UI never renders "1 / 0".
 */
export function pageCountOf(total: number, pageSize: number): number {
	return Math.max(1, Math.ceil(total / pageSize))
}
