import type { Charactership } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import {
	charactershipsBatchQueryOptions,
	charactershipsQueryOptions,
} from "../api"

function charIdsInEdges(edges: readonly Charactership[]): string[] {
	const ids = new Set<string>()
	for (const edge of edges) {
		if (edge.selfId !== null) ids.add(edge.selfId)
		if (edge.targetId !== null) ids.add(edge.targetId)
	}
	return [...ids]
}

/** BFS-load every charactership edge in the anchor's connected component. */
export async function loadConnectedCharacterships(
	anchorCharId: string,
	queryClient: QueryClient,
): Promise<readonly Charactership[]> {
	const allEdges = new Map<string, Charactership>()
	const loadedCharIds = new Set<string>()

	const root = await queryClient.fetchQuery(
		charactershipsQueryOptions(anchorCharId),
	)
	for (const edge of root) allEdges.set(edge.id, edge)
	loadedCharIds.add(anchorCharId)

	while (true) {
		const pending = charIdsInEdges([...allEdges.values()]).filter(
			(charId) => !loadedCharIds.has(charId),
		)
		if (pending.length === 0) break

		const batch = await queryClient.fetchQuery(
			charactershipsBatchQueryOptions(pending),
		)
		for (const charId of pending) loadedCharIds.add(charId)
		for (const edge of batch) allEdges.set(edge.id, edge)
	}

	return [...allEdges.values()]
}
