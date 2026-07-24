import type { Comment } from "@hoardodile/schemas"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Surface } from "@hoardodile/ui/components/surface"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { StickyNote } from "lucide-react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { PaginationBar } from "@/components/common/PaginationBar"
import { pageCountOf } from "@/lib/pagination"
import { commentListQueryOptions } from "./api"
import { CommentItem, type CommentItemProps } from "./CommentItem"
import type { CommentSearchState } from "./searchState"

export type CommentListInput = {
	readonly charId?: string
	readonly resId?: string
	readonly query?: string
	readonly sortBy?: CommentSearchState["sortBy"]
	readonly trash?: boolean
	readonly page?: number
	readonly size?: number
}

export type CommentListProps = {
	readonly input: CommentListInput
	readonly context?: CommentItemProps["context"]
	readonly showPagination?: boolean
	readonly onPageChange?: (page: number) => void
	readonly testId?: string
}

export function CommentList(props: CommentListProps) {
	const {
		input,
		context,
		showPagination = false,
		onPageChange,
		testId = "comment-list",
	} = props
	const { t } = useTranslation()
	const listRef = useRef<HTMLDivElement>(null)
	const page = input.page ?? 1
	const size = input.size ?? 20

	const trash = input.trash ?? false

	const listQuery = useQuery({
		...commentListQueryOptions({
			query: input.query !== "" ? input.query : undefined,
			page,
			size,
			charId: input.charId !== "" ? input.charId : undefined,
			resId: input.resId !== "" ? input.resId : undefined,
			sortBy: input.sortBy ?? "newest",
			trashed: trash,
		}),
		placeholderData: keepPreviousData,
	})

	const rows = listQuery.data?.rows ?? []
	const total = listQuery.data?.total ?? 0
	const totalAll = listQuery.data?.totalAll ?? total
	const totalFloors = total
	const totalReplies = totalAll - total
	const pageCount = pageCountOf(total, size)

	useEffect(() => {
		if (listQuery.isPlaceholderData) return
		if (rows.length === 0 && total > 0) {
			const target = Math.max(1, page - 1)
			if (target !== page) {
				onPageChange?.(target)
			}
		}
	}, [listQuery.isPlaceholderData, page, rows.length, total, onPageChange])

	function handlePageChange(nextPage: number) {
		onPageChange?.(nextPage)
		listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
	}

	if (listQuery.isPending && listQuery.data === undefined) {
		return (
			<div className="flex flex-col gap-5" data-testid={`${testId}-loading`}>
				<CommentCardSkeleton />
				<CommentCardSkeleton />
				<CommentCardSkeleton />
			</div>
		)
	}

	if (rows.length === 0) {
		return (
			<div
				className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center"
				data-testid={`${testId}-empty`}
			>
				<StickyNote className="size-8 text-muted-foreground/60" />
				<p className="text-sm text-muted-foreground">
					{trash ? t("comments.emptyTrash") : t("comments.empty")}
				</p>
			</div>
		)
	}

	return (
		<div ref={listRef} className="flex flex-col gap-4" data-testid={testId}>
			<p
				className="text-sm text-muted-foreground"
				data-testid={`${testId}-total-count`}
			>
				{trash
					? t("comments.trashSummaryCount", {
							floors: totalFloors,
							replies: totalReplies,
						})
					: t("comments.summaryCount", {
							floors: totalFloors,
							replies: totalReplies,
						})}
			</p>
			<div className="flex flex-col gap-5">
				{rows.map((row) => (
					<CommentItem
						key={row.id}
						comment={row}
						replies={row.floorContext?.replies}
						trash={trash}
						context={context}
					/>
				))}
			</div>
			{showPagination && pageCount > 1 && onPageChange !== undefined ? (
				<PaginationBar
					page={page}
					pageCount={pageCount}
					onChangePage={handlePageChange}
				/>
			) : null}
		</div>
	)
}

function CommentCardSkeleton() {
	return (
		<Surface size="compact" className="flex flex-col p-4 gap-3">
			<Skeleton className="h-3 w-32" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-4/5" />
			<div className="flex gap-2">
				<Skeleton className="h-7 w-14" />
				<Skeleton className="h-7 w-14" />
				<Skeleton className="h-7 w-16" />
			</div>
		</Surface>
	)
}

export type { Comment }
