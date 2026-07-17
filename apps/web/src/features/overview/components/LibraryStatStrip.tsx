import { RecentCharactersSection } from "../sections/RecentCharactersSection"
import { RecentCommentsSection } from "../sections/RecentCommentsSection"
import { RecentDocumentsSection } from "../sections/RecentDocumentsSection"
import { RecentResourcesSection } from "../sections/RecentResourcesSection"

const sections = [
	{ key: "resources", Component: RecentResourcesSection },
	{ key: "characters", Component: RecentCharactersSection },
	{ key: "documents", Component: RecentDocumentsSection },
	{ key: "comments", Component: RecentCommentsSection },
]

export function LibraryStatStrip() {
	return (
		<div
			className="flex flex-wrap items-center gap-2"
			data-testid="overview-library-stat-strip"
		>
			{sections.map(({ key, Component }) => (
				<Component key={key} mode="summary" />
			))}
		</div>
	)
}
