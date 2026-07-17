import type {
	CharCard as CharCardType,
	ResCard as ResCardType,
} from "@hoardodile/schemas"

export type StaleItem =
	| {
			readonly kind: "character"
			readonly card: CharCardType
			readonly staleRank: number
			readonly createdAt: number
	  }
	| {
			readonly kind: "resource"
			readonly card: ResCardType
			readonly staleRank: number
			readonly createdAt: number
	  }

export function compareStaleItems(a: StaleItem, b: StaleItem): number {
	if (a.staleRank !== b.staleRank) {
		return b.staleRank - a.staleRank
	}
	if (a.createdAt !== b.createdAt) {
		return a.createdAt - b.createdAt
	}
	return a.card.id.localeCompare(b.card.id)
}
