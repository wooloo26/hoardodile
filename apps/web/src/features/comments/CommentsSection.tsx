import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { InfoPill } from "@/components/layout/PageScaffold"
import { commentListQueryOptions } from "./api"
import { CommentComposer } from "./CommentComposer"
import type { CommentItemProps } from "./CommentItem"
import { CommentList } from "./CommentList"
import { COMMENT_PAGE_SIZE } from "./searchState"

export type CommentsSectionProps = {
	readonly variant: "embedded"
	readonly context: NonNullable<CommentItemProps["context"]>
	readonly children?: ReactNode
	readonly testId?: string
}

export function CommentsSection(props: CommentsSectionProps) {
	const { context, testId } = props
	const { t } = useTranslation()
	const [page, setPage] = useState(1)

	const charId = context.kind === "char" ? context.id : ""
	const resId = context.kind === "res" ? context.id : ""

	return (
		<section className="flex flex-col gap-3" data-testid={testId}>
			<header className="flex items-center gap-2">
				<h2 className="text-base font-semibold">{t("comments.title")}</h2>
				<CommentCountBadge charId={charId} resId={resId} />
			</header>
			<CommentComposer
				variant="embedded"
				initialCharacterIds={context.kind === "char" ? [context.id] : undefined}
				initialResourceIds={context.kind === "res" ? [context.id] : undefined}
				lockInitialCharacterLinks={context.kind === "char"}
				lockInitialResourceLinks={context.kind === "res"}
			/>
			<CommentList
				input={{
					charId,
					resId,
					page,
					size: COMMENT_PAGE_SIZE,
					sortBy: "newest",
					trash: false,
				}}
				context={context}
				showPagination
				onPageChange={setPage}
				testId={testId !== undefined ? `${testId}-list` : undefined}
			/>
			{props.children}
		</section>
	)
}

type CommentCountBadgeProps = {
	readonly charId: string
	readonly resId: string
}

function CommentCountBadge(props: CommentCountBadgeProps) {
	return <CommentListCount charId={props.charId} resId={props.resId} />
}

function CommentListCount(props: CommentCountBadgeProps) {
	const { charId, resId } = props
	const { t } = useTranslation()
	const listQuery = useQuery(
		commentListQueryOptions({
			charId: charId !== "" ? charId : undefined,
			resId: resId !== "" ? resId : undefined,
			page: 1,
			size: 1,
			sortBy: "newest",
			trashed: false,
		}),
	)
	if (listQuery.data === undefined) return null
	const total = listQuery.data.total
	const totalAll = listQuery.data.totalAll ?? total
	const totalFloors = total
	const totalReplies = totalAll - total
	return (
		<InfoPill tone="muted">
			{t("comments.summaryShort", {
				floors: totalFloors,
				replies: totalReplies,
			})}
		</InfoPill>
	)
}
