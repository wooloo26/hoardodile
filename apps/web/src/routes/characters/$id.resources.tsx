import { createFileRoute } from "@tanstack/react-router"
import { DocLinkedSearchSection } from "@/features/doc/DocLinkedSearchSection"
import { ResSearch } from "@/features/res"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/characters/$id/resources")({
	beforeLoad: requireAuth,
	component: CharResourcesTab,
})

/**
 * Resources tab for a single character. Reuses the shared
 * {@link ResSearch} component with a hidden character filter so the
 * listing is automatically scoped to this character.
 */
function CharResourcesTab() {
	const { id } = Route.useParams()
	return (
		<div className="flex flex-col gap-6">
			<DocLinkedSearchSection variant="char" charId={id} />
			<ResSearch charId={id} />
		</div>
	)
}
