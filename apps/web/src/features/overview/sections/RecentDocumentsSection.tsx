import type { DocNode } from "@hoardodile/schemas"
import type { SortBy } from "@hoardodile/shared"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FilePen } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { docTreeQueryOptions } from "@/features/doc/api"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { RecentSection } from "../components/RecentSection"
import { SectionSortToggle } from "../components/SectionSortToggle"
import { StatCard } from "../components/StatCard"

const RECENT_DOCUMENTS_SIZE = 5

type RecentDocumentsSectionProps = {
	readonly mode: "summary" | "list"
	readonly presentation?: "standalone" | "embedded"
}

export function RecentDocumentsSection(props: RecentDocumentsSectionProps) {
	const presentation = props.presentation ?? "standalone"
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const [sortBy, setSortBy] = useState<SortBy>("updated")

	const { data, isPending } = useQuery(docTreeQueryOptions())

	const documents = useMemo(
		() => getRecentDocuments(data, sortBy),
		[data, sortBy],
	)

	if (props.mode === "summary") {
		return (
			<StatCard
				to="/documents"
				icon={FilePen}
				count={data?.length ?? 0}
				label={t("overview.stats.documents")}
				testId="overview-stat-documents"
				variant="plain"
			/>
		)
	}

	const toolbar = (
		<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
			<SectionSortToggle
				sortBy={sortBy}
				onChange={setSortBy}
				testId="overview-document-sort"
			/>
			<Link
				to="/documents"
				className="text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				{t("overview.viewAll")}
			</Link>
		</div>
	)

	const listContent = isPending ? (
		<div className="flex flex-col gap-1">
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-full" />
		</div>
	) : documents.length === 0 ? (
		<p className="text-sm text-muted-foreground">
			{t("overview.empty.documents")}
		</p>
	) : (
		<div className="flex flex-col gap-1">
			{documents.map((doc) => (
				<Link
					key={doc.id}
					to="/documents/$id"
					params={{ id: doc.id }}
					className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
					data-testid={`overview-doc-${doc.id}`}
				>
					<FilePen className="size-4 shrink-0 text-muted-foreground" />
					<span className="flex-1 truncate">{doc.title}</span>
					<span className="text-xs text-muted-foreground">
						{formatter.formatDateTime(
							sortBy === "created" ? doc.createdAt : doc.updatedAt,
						)}
					</span>
				</Link>
			))}
		</div>
	)

	if (presentation === "embedded") {
		return (
			<div data-testid="overview-activity-documents">
				{toolbar}
				{listContent}
			</div>
		)
	}

	return (
		<RecentSection
			title={t("overview.sections.recentDocuments")}
			viewAllTo="/documents"
			viewAllLabel={t("overview.viewAll")}
			isEmpty={documents.length === 0}
			emptyText={t("overview.empty.documents")}
			actions={
				<SectionSortToggle
					sortBy={sortBy}
					onChange={setSortBy}
					testId="overview-document-sort"
				/>
			}
		>
			{listContent}
		</RecentSection>
	)
}

function getRecentDocuments(
	nodes: readonly DocNode[] | undefined,
	sortBy: SortBy,
): DocNode[] {
	if (nodes === undefined) return []
	return [...nodes]
		.filter((node) => node.kind === "document")
		.sort((a, b) => {
			const field = sortBy === "created" ? "createdAt" : "updatedAt"
			return b[field] - a[field]
		})
		.slice(0, RECENT_DOCUMENTS_SIZE)
}
