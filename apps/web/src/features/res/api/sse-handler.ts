import type { ResourceMetaUpdatedEvent } from "@hoardodile/schemas"
import type { QueryClient } from "@tanstack/react-query"
import { patchResMetaInCache } from "./patch-res-meta"

export function handleResourceMetaUpdated(
	queryClient: QueryClient,
	event: ResourceMetaUpdatedEvent,
): void {
	const { resourceId: id, meta } = event

	if (meta !== undefined && Object.keys(meta).length > 0) {
		patchResMetaInCache(queryClient, id, meta)
	}
}
