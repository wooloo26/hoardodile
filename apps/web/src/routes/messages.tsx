import { createFileRoute } from "@tanstack/react-router"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { CommentComposer } from "@/features/comments/CommentComposer"
import { CommentFilterBar } from "@/features/comments/CommentFilterBar"
import { CommentList } from "@/features/comments/CommentList"
import {
	COMMENT_SEARCH_DEFAULTS,
	commentSearchUrlSchema,
} from "@/features/comments/searchState"
import { useRouteSearchState } from "@/hooks/useRouteSearchState"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/messages")({
	beforeLoad: requireAuth,
	validateSearch: commentSearchUrlSchema,
	component: CommentsPage,
})

function CommentsPage() {
	const [searchState, patch] = useRouteSearchState(COMMENT_SEARCH_DEFAULTS)

	const charId = searchState.charId
	const resId = searchState.resId
	const trash = searchState.trash

	return (
		<PageScaffold className="max-w-3xl">
			<CommentFilterBar state={searchState} patch={patch} />

			{!trash ? (
				<CommentComposer
					variant="standalone"
					initialCharacterIds={charId !== "" ? [charId] : undefined}
					initialResourceIds={resId !== "" ? [resId] : undefined}
				/>
			) : null}

			<CommentList
				input={{
					charId,
					resId,
					query: searchState.query,
					sortBy: searchState.sortBy,
					trash,
					page: searchState.page,
					size: searchState.size,
				}}
				showPagination
				onPageChange={(page) => patch({ page }, { push: true })}
			/>
		</PageScaffold>
	)
}
