import { Separator } from "@hoardodile/ui/components/separator"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import {
	buildRelationshipGroups,
	CharChipsPicker,
	CharRelationshipGraph,
	charactershipsQueryOptions,
	relationshipTypesQueryOptions,
} from "@/features/char"
import { CommentsSection } from "@/features/comments"
import { DocLinkedSearchSection } from "@/features/doc/DocLinkedSearchSection"
import { ResCard, resListCardsQueryOptions } from "@/features/res"
import { TagChip } from "@/features/tags/TagChip"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/characters/$id/")({
	beforeLoad: requireAuth,
	component: CharOverview,
})

const RECENT_RESOURCE_LIMIT = 3

/**
 * Overview tab for a character. The right sidebar (fullbody
 * illustration, traits, tag groups) belongs to the `/characters/$id`
 * layout — see `$id.tsx`. This tab only owns the main column: intro
 * paragraphs split by newlines, relationships row, the three most
 * recently updated resources, and a comments section scoped by
 * `charId`.
 *
 * Each section owns its own query subscription so the page renders
 * progressively — sections with cached data appear immediately while
 * slower probes (relationships, recents) show their own placeholders.
 */
function CharOverview() {
	const { id } = Route.useParams()
	return (
		<div className="flex flex-col gap-6">
			<RelationshipsSection charId={id} />
			<DocLinkedSearchSection variant="char" charId={id} />
			<RecentResourcesSection charId={id} />
			<Separator />
			<CommentsSection
				variant="embedded"
				context={{ kind: "char", id }}
				testId="character-overview-comments"
			/>
		</div>
	)
}

function RelationshipsSection({ charId }: { readonly charId: string }) {
	const { t } = useTranslation()
	const edgesQ = useQuery(charactershipsQueryOptions(charId))
	const typesQ = useQuery(relationshipTypesQueryOptions())
	const groups = buildRelationshipGroups(
		edgesQ.data ?? [],
		typesQ.data ?? [],
		charId,
	)

	if (groups.length === 0) {
		return null
	}

	return (
		<section
			className="flex flex-col gap-2"
			data-testid="character-overview-relationships"
		>
			<h2 className="text-base font-semibold">
				{t("characters.detail.relationships")}
			</h2>
			<CharRelationshipGraph charId={charId} />
			<ul className="flex flex-col gap-2">
				{groups.map((g) => (
					<li
						key={g.key}
						className="flex flex-wrap items-center gap-2"
						data-testid={`character-overview-relgroup-${g.key}`}
					>
						<TagChip
							id={g.key}
							type="character"
							name={g.label}
							color={g.color}
							link={false}
						/>
						<CharChipsPicker ids={g.otherIds} />
						{g.otherNames.map((name) => (
							<span
								key={name}
								className="inline-flex max-w-40 items-center rounded-full border bg-muted/30 px-2.5 py-0.5 text-xs font-medium"
								data-testid={`character-overview-relname-${g.key}-${name}`}
							>
								{name}
							</span>
						))}
					</li>
				))}
			</ul>
		</section>
	)
}

function RecentResourcesSection({ charId }: { readonly charId: string }) {
	const { t } = useTranslation()
	const listQ = useQuery(
		resListCardsQueryOptions({
			query: "",
			page: 1,
			charId,
			sortBy: "updated",
			order: "desc",
		}),
	)
	const rows = (listQ.data?.rows ?? []).slice(0, RECENT_RESOURCE_LIMIT)
	if (rows.length === 0) return null
	return (
		<section
			className="flex flex-col gap-2"
			data-testid="character-overview-recent"
		>
			<h2 className="text-base font-semibold">
				{t("characters.detail.recent")}
			</h2>
			<ul className="flex flex-wrap gap-3 justify-around">
				{rows.map((r) => (
					<li key={r.id}>
						<ResCard key={r.id} resource={r} />
					</li>
				))}
			</ul>
		</section>
	)
}
