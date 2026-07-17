import type {
	CharCard,
	DocSearchRow,
	ResCard,
	SearchGlobalResult,
} from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { CharCard as CharacterCard } from "@/features/char/components/CharCard"
import { ResCard as ResourceCard } from "@/features/res/components/ResCard"
import { DocSearchCard } from "./DocSearchCard"

export type SearchResultSectionsProps = {
	readonly data: SearchGlobalResult
	readonly query: string
}

type SectionConfig = {
	readonly kind: "characters" | "resources" | "documents"
	readonly titleKey: string
	readonly countKey: string
}

const SECTIONS: readonly SectionConfig[] = [
	{
		kind: "characters",
		titleKey: "search.sectionTitles.characters",
		countKey: "search.counts.characters",
	},
	{
		kind: "resources",
		titleKey: "search.sectionTitles.resources",
		countKey: "search.counts.resources",
	},
	{
		kind: "documents",
		titleKey: "search.sectionTitles.documents",
		countKey: "search.counts.documents",
	},
]

export function SearchResultSections(props: SearchResultSectionsProps) {
	const { data, query } = props
	const { t } = useTranslation()

	return (
		<div className="flex flex-col gap-6">
			{SECTIONS.map((section) => {
				const page =
					section.kind === "characters"
						? data.characters
						: section.kind === "resources"
							? data.resources
							: data.documents

				if (page.total === 0) {
					return null
				}

				return (
					<section key={section.kind} className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">
								{t(section.titleKey)} (
								{t(section.countKey, { count: page.total })})
							</h3>
							<ViewAllLink
								kind={section.kind}
								query={query}
								count={page.total}
							/>
						</div>
						{section.kind === "characters" ? (
							<ul className="mt-3 flex flex-wrap justify-around gap-4">
								{(page.rows as readonly CharCard[]).map((character) => (
									<li key={character.id}>
										<CharacterCard character={character} />
									</li>
								))}
							</ul>
						) : section.kind === "resources" ? (
							<ul className="mt-3 flex flex-wrap justify-around gap-6">
								{(page.rows as readonly ResCard[]).map((resource) => (
									<li key={resource.id}>
										<ResourceCard resource={resource} />
									</li>
								))}
							</ul>
						) : (
							<div className="grid grid-cols-1 gap-3">
								{(page.rows as readonly DocSearchRow[]).map((doc) => (
									<DocSearchCard key={doc.id} doc={doc} query={query} />
								))}
							</div>
						)}
					</section>
				)
			})}
		</div>
	)
}

type ViewAllLinkProps = {
	readonly kind: "characters" | "resources" | "documents"
	readonly query: string
	readonly count: number
}

function ViewAllLink(props: ViewAllLinkProps) {
	const { kind, query, count } = props
	const { t } = useTranslation()

	if (kind === "characters") {
		return (
			<Button variant="ghost" size="sm" asChild>
				<Link
					to="/characters"
					search={{ query }}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t("search.viewAll", { count })}
				</Link>
			</Button>
		)
	}

	if (kind === "resources") {
		return (
			<Button variant="ghost" size="sm" asChild>
				<Link
					to="/resources"
					search={{ query }}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t("search.viewAll", { count })}
				</Link>
			</Button>
		)
	}

	return (
		<Button variant="ghost" size="sm" asChild>
			<Link
				to="/documents"
				search={{ filter: query }}
				target="_blank"
				rel="noopener noreferrer"
			>
				{t("search.viewAll", { count })}
			</Link>
		</Button>
	)
}
