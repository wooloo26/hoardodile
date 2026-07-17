import type { Comment, CommentVote } from "@hoardodile/schemas"
import { Badge } from "@hoardodile/ui/components/badge"
import { Button } from "@hoardodile/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Surface } from "@hoardodile/ui/components/surface"
import { cn } from "@hoardodile/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	ChevronDown,
	ChevronUp,
	MoreVertical,
	Reply,
	RotateCcw,
	ThumbsDown,
	ThumbsUp,
	Trash2,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { CharChipsPicker } from "@/features/char/components/CharChipsPicker"
import {
	addCommentVoteMutation,
	commentThreadQueryOptions,
	commentVotesQueryOptions,
	hardDeleteCommentMutation,
	invalidateComments,
	restoreCommentMutation,
	softDeleteCommentMutation,
} from "@/features/comments"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { ResChipsPicker } from "../res/components/ResChipsPicker"
import { CommentAnchorChip } from "./anchor"
import { CommentComposer } from "./CommentComposer"

export type CommentItemProps = {
	readonly comment: Comment
	readonly replies?: readonly Comment[]
	readonly depth?: number
	readonly trash?: boolean
	readonly hideActions?: boolean
	readonly context?:
		| { readonly kind: "char"; readonly id: string }
		| { readonly kind: "res"; readonly id: string }
}

export function CommentItem(props: CommentItemProps) {
	const {
		comment,
		replies,
		depth = 0,
		trash = false,
		hideActions = false,
		context,
	} = props
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const qc = useQueryClient()
	const [replyOpen, setReplyOpen] = useState(false)
	const [showReplies, setShowReplies] = useState(true)
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
	const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false)

	const isDeleted = comment.deletedAt !== undefined
	const effectiveHideActions = hideActions || (trash && !isDeleted)

	const threadQuery = useQuery({
		...commentThreadQueryOptions(comment.id, {}),
		enabled:
			replies === undefined && showReplies && comment.replyCount > 0 && !trash,
	})

	const effectiveReplies =
		replies ?? (threadQuery.data?.replies as readonly Comment[] | undefined)

	const votesQuery = useQuery({
		...commentVotesQueryOptions(comment.id),
		enabled: comment.likeCount + comment.dislikeCount > 0,
	})

	const addLikeMut = useMutation({
		...addCommentVoteMutation(),
		onSuccess: () => invalidateComments(qc),
		onError: (err) =>
			toast.error(err.message || t("comments.toast.voteFailed")),
	})
	const softDeleteMut = useMutation({
		...softDeleteCommentMutation(),
		onSuccess: async () => {
			await invalidateComments(qc)
			setDeleteConfirmOpen(false)
			toast.success(t("comments.toast.deleted"))
		},
	})
	const restoreMut = useMutation({
		...restoreCommentMutation(),
		onSuccess: async () => {
			await invalidateComments(qc)
			toast.success(t("comments.toast.restored"))
		},
	})
	const hardDeleteMut = useMutation({
		...hardDeleteCommentMutation(),
		onSuccess: async () => {
			await invalidateComments(qc)
			setHardDeleteConfirmOpen(false)
			toast.success(t("comments.toast.hardDeleted"))
		},
	})

	function handleVote(kind: "like" | "dislike") {
		addLikeMut.mutate({ commentId: comment.id, kind })
	}

	const allVotes: readonly CommentVote[] = votesQuery.data ?? []
	const activeVote = allVotes.find((v) => v.cancellable)
	const isLikeActive = activeVote?.kind === "like"
	const isDislikeActive = activeVote?.kind === "dislike"

	const visibleCharIds =
		context?.kind === "char"
			? comment.charIds.filter((id) => id !== context.id)
			: comment.charIds
	const visibleResIds =
		context?.kind === "res"
			? comment.resIds.filter((id) => id !== context.id)
			: comment.resIds

	const hasMeta =
		visibleCharIds.length > 0 ||
		comment.anchor !== undefined ||
		visibleResIds.length > 0

	const actionsPending =
		softDeleteMut.isPending || restoreMut.isPending || hardDeleteMut.isPending

	return (
		<div
			className={cn(depth > 0 && "border-l-2 border-border/60 pl-4")}
			style={
				depth > 0
					? { marginLeft: `${Math.min(depth - 1, 5) * 8}px` }
					: undefined
			}
			data-testid={`comment-${comment.id}`}
		>
			<Surface
				as="article"
				size="compact"
				className={cn(
					"flex flex-col gap-3 px-3 pt-3 pb-2",
					isDeleted && "opacity-60",
				)}
			>
				<header className="flex flex-wrap items-center gap-2 text-xs">
					{depth === 0 && comment.floor !== undefined ? (
						<span className="font-semibold text-muted-foreground">
							{t("comments.floor", { n: comment.floor })}
						</span>
					) : null}
					<time className="font-medium text-foreground">
						{formatter.formatDateTime(comment.createdAt)}
					</time>
					{isDeleted ? (
						<Badge variant="destructive" className="rounded-md">
							{t("comments.deleted")}
						</Badge>
					) : null}
				</header>

				<p className="whitespace-pre-wrap text-[15px] leading-relaxed">
					{comment.body}
				</p>

				{hasMeta ? (
					<div className="flex flex-wrap items-center gap-2">
						{visibleCharIds.length > 0 ? (
							<CharChipsPicker ids={visibleCharIds} />
						) : null}
						{comment.anchor !== undefined ? (
							<CommentAnchorChip
								anchor={comment.anchor}
								hideResourceName={
									context?.kind === "res" && context.id === comment.anchor.resId
								}
							/>
						) : null}
						{visibleResIds.length > 0 ? (
							<ResChipsPicker ids={visibleResIds} />
						) : null}
					</div>
				) : null}

				<footer className="flex flex-wrap items-center gap-1">
					{!trash && !effectiveHideActions ? (
						<>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className={cn("h-7 gap-1 px-2", isLikeActive && "text-primary")}
								onClick={() => handleVote("like")}
								disabled={addLikeMut.isPending}
								aria-pressed={isLikeActive}
							>
								<ThumbsUp
									className="size-3.5"
									fill={isLikeActive ? "currentColor" : "none"}
								/>
								{comment.likeCount > 0 ? comment.likeCount : null}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className={cn(
									"h-7 gap-1 px-2",
									isDislikeActive && "text-primary",
								)}
								onClick={() => handleVote("dislike")}
								disabled={addLikeMut.isPending}
								aria-pressed={isDislikeActive}
							>
								<ThumbsDown
									className="size-3.5"
									fill={isDislikeActive ? "currentColor" : "none"}
								/>
								{comment.dislikeCount > 0 ? comment.dislikeCount : null}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 gap-1 px-2"
								onClick={() => setReplyOpen((v) => !v)}
							>
								<Reply className="size-3.5" />
								{t("comments.reply")}
							</Button>
						</>
					) : null}
					{comment.replyCount > 0 && !trash && !effectiveHideActions ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 gap-1 px-2"
							onClick={() => setShowReplies((v) => !v)}
						>
							{showReplies ? (
								<ChevronUp className="size-3.5" />
							) : (
								<ChevronDown className="size-3.5" />
							)}
							{showReplies
								? t("comments.collapseReplies")
								: t("comments.viewReplies", { count: comment.replyCount })}
						</Button>
					) : null}
					{!effectiveHideActions ? (
						<DropdownMenu modal={false}>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="ml-auto h-7 w-7 px-0"
									aria-label={t("comments.actions")}
									disabled={actionsPending}
								>
									<MoreVertical className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-44">
								{trash ? (
									<>
										<DropdownMenuItem
											onSelect={() => restoreMut.mutate({ id: comment.id })}
											disabled={restoreMut.isPending}
										>
											<RotateCcw className="size-3.5" />
											{t("comments.restore")}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											variant="destructive"
											onSelect={() => setHardDeleteConfirmOpen(true)}
										>
											<Trash2 className="size-3.5" />
											{t("comments.hardDelete")}
										</DropdownMenuItem>
									</>
								) : (
									<DropdownMenuItem
										variant="destructive"
										onSelect={() => setDeleteConfirmOpen(true)}
									>
										<Trash2 className="size-3.5" />
										{t("comments.delete")}
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</footer>

				{replyOpen && !trash ? (
					<CommentComposer
						variant="reply"
						parentId={comment.id}
						initialCharacterIds={
							context?.kind === "char" ? [context.id] : undefined
						}
						initialResourceIds={
							context?.kind === "res" ? [context.id] : undefined
						}
						lockInitialCharacterLinks={context?.kind === "char"}
						lockInitialResourceLinks={context?.kind === "res"}
						onPosted={() => setReplyOpen(false)}
					/>
				) : null}
			</Surface>

			{showReplies &&
			comment.replyCount > 0 &&
			(replies === undefined || replies.length > 0) &&
			!trash ? (
				threadQuery.isPending && effectiveReplies === undefined ? (
					<div className="mt-3 flex flex-col gap-2 border-l-2 border-border/60 pl-4">
						<Skeleton className="h-24 rounded-lg" />
						<Skeleton className="h-24 rounded-lg" />
					</div>
				) : null
			) : null}

			{replies !== undefined && replies.length > 0 && showReplies ? (
				<div className="mt-3 flex flex-col gap-3">
					<CommentReplyTree
						parentId={comment.id}
						all={replies}
						depth={depth + 1}
						trash={trash}
						hideActions={trash ? false : hideActions}
						context={context}
					/>
				</div>
			) : null}
			{replies === undefined &&
			showReplies &&
			!trash &&
			effectiveReplies !== undefined &&
			effectiveReplies.length > 0 ? (
				<div className="mt-3 flex flex-col gap-3">
					<CommentReplyTree
						parentId={comment.id}
						all={effectiveReplies}
						depth={depth + 1}
						trash={trash}
						hideActions={hideActions}
						context={context}
					/>
				</div>
			) : null}

			<ConfirmDialog
				open={deleteConfirmOpen}
				onOpenChange={setDeleteConfirmOpen}
				title={t("comments.deleteConfirmTitle")}
				description={t("comments.deleteConfirmDescription")}
				confirmLabel={t("comments.delete")}
				isPending={softDeleteMut.isPending}
				onConfirm={() => softDeleteMut.mutate({ id: comment.id })}
			/>
			<ConfirmDialog
				open={hardDeleteConfirmOpen}
				onOpenChange={setHardDeleteConfirmOpen}
				title={t("comments.hardDeleteConfirmTitle")}
				description={t("comments.hardDeleteConfirmDescription")}
				confirmLabel={t("comments.hardDelete")}
				isPending={hardDeleteMut.isPending}
				onConfirm={() => hardDeleteMut.mutate({ id: comment.id })}
			/>
		</div>
	)
}

type ReplyTreeProps = {
	readonly parentId: string
	readonly all: readonly Comment[]
	readonly depth: number
	readonly trash: boolean
	readonly hideActions: boolean
	readonly context?: CommentItemProps["context"]
}

function CommentReplyTree(props: ReplyTreeProps) {
	const direct = props.all.filter((c) => c.parentId === props.parentId)
	if (direct.length === 0) return undefined
	return (
		<>
			{direct.map((c) => (
				<CommentItem
					key={c.id}
					comment={c}
					replies={props.all}
					depth={props.depth}
					trash={props.trash}
					hideActions={props.hideActions}
					context={props.context}
				/>
			))}
		</>
	)
}
