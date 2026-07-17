import type { Comment } from "@hoardodile/schemas"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { StickyNote } from "lucide-react"
import { useTranslation } from "react-i18next"
import { commentListQueryOptions } from "@/features/comments/api"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { RecentSection } from "../components/RecentSection"
import { StatCard } from "../components/StatCard"

const COMMENT_SNIPPET_LENGTH = 120
const RECENT_COMMENTS_SIZE = 5

type RecentCommentsSectionProps = {
	readonly mode: "summary" | "list"
	readonly presentation?: "standalone" | "embedded"
}

export function RecentCommentsSection(props: RecentCommentsSectionProps) {
	const presentation = props.presentation ?? "standalone"
	const { t } = useTranslation()

	const { data, isPending } = useQuery(
		commentListQueryOptions({
			page: 1,
			size: RECENT_COMMENTS_SIZE,
			sortBy: "newest",
			trashed: false,
		}),
	)

	if (props.mode === "summary") {
		return (
			<StatCard
				to="/messages"
				icon={StickyNote}
				count={data?.totalAll ?? data?.total ?? 0}
				label={t("overview.stats.comments")}
				testId="overview-stat-comments"
				variant="plain"
			/>
		)
	}

	const toolbar = (
		<div className="mb-3 flex flex-wrap items-center justify-end gap-2">
			<Link
				to="/messages"
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
	) : data === undefined || data.rows.length === 0 ? (
		<p className="text-sm text-muted-foreground">
			{t("overview.empty.comments")}
		</p>
	) : (
		<div className="flex flex-col gap-1">
			{data.rows.map((comment) => (
				<CommentSnippet key={comment.id} comment={comment} />
			))}
		</div>
	)

	if (presentation === "embedded") {
		return (
			<div data-testid="overview-activity-comments">
				{toolbar}
				{listContent}
			</div>
		)
	}

	return (
		<RecentSection
			title={t("overview.sections.recentComments")}
			viewAllTo="/messages"
			viewAllLabel={t("overview.viewAll")}
			isEmpty={data?.rows.length === 0}
			emptyText={t("overview.empty.comments")}
		>
			{listContent}
		</RecentSection>
	)
}

function CommentSnippet(props: { readonly comment: Comment }) {
	const { comment } = props
	const formatter = useDateFormatter()
	const snippet =
		comment.body.length > COMMENT_SNIPPET_LENGTH
			? `${comment.body.slice(0, COMMENT_SNIPPET_LENGTH)}…`
			: comment.body

	const search =
		comment.charIds.length > 0
			? { charId: comment.charIds[0] }
			: comment.resIds.length > 0
				? { resId: comment.resIds[0] }
				: undefined

	return (
		<Link
			to="/messages"
			search={search}
			className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
			data-testid={`overview-comment-${comment.id}`}
		>
			<span className="line-clamp-2 text-foreground">{snippet}</span>
			<span className="text-xs text-muted-foreground">
				{formatter.formatDateTime(comment.createdAt)}
			</span>
		</Link>
	)
}
