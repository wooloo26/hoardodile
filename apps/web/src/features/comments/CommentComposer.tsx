import { MAX_COMMENT_BODY_LENGTH } from "@hoardodile/consts/text-limits"
import type { CommentCreateInput, ResAnchor } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { Surface } from "@hoardodile/ui/components/surface"
import { Textarea } from "@hoardodile/ui/components/textarea"
import { FilePlus2, Send, UserPlus } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { CharChipsPicker } from "@/features/char/components/CharChipsPicker"
import { createCommentMutation, invalidateComments } from "@/features/comments"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { ResChipsPicker } from "../res/components/ResChipsPicker"

export type CommentComposerVariant = "standalone" | "reply" | "embedded"

export type CommentComposerProps = {
	readonly parentId?: string
	readonly initialCharacterIds?: readonly string[]
	readonly initialResourceIds?: readonly string[]
	/** When true, {@link initialCharacterIds} cannot be removed from the chip row. */
	readonly lockInitialCharacterLinks?: boolean
	/** When true, {@link initialResourceIds} cannot be removed from the chip row. */
	readonly lockInitialResourceLinks?: boolean
	/**
	 * Pointer into a specific block of a resource (e.g. manga page or
	 * novel paragraph). When set, the composer attaches the anchor to
	 * the new comment without exposing UI for it — readers seed the
	 * anchor based on the user's current scroll position.
	 */
	readonly initialAnchor?: ResAnchor
	readonly onPosted?: () => void
	readonly placeholder?: string
	readonly testId?: string
	readonly variant?: CommentComposerVariant
}

const CHARS_REMAINING_THRESHOLD = 500

/**
 * Single composer used both for top-level comments and for inline
 * replies. The `parentId` decides whether the create call nests the
 * new row under another thread.
 */
function mergeLockedIds(
	next: readonly string[],
	lockedIds: readonly string[] | undefined,
): readonly string[] {
	const locked = lockedIds ?? []
	if (locked.length === 0) return next
	const extras = next.filter((id) => !locked.includes(id))
	return [...locked, ...extras]
}

export function CommentComposer(props: CommentComposerProps) {
	const { t } = useTranslation()
	const variant = props.variant ?? "standalone"
	const lockedCharacterIds = props.lockInitialCharacterLinks
		? props.initialCharacterIds
		: undefined
	const lockedResourceIds = props.lockInitialResourceLinks
		? props.initialResourceIds
		: undefined
	const [body, setBody] = useState("")
	const [charIds, setCharacterIds] = useState<readonly string[]>(
		props.initialCharacterIds ?? [],
	)
	const [resIds, setResourceIds] = useState<readonly string[]>(
		props.initialResourceIds ?? [],
	)
	const [showCharacterRow, setShowCharacterRow] = useState(
		(props.initialCharacterIds ?? []).length > 0,
	)
	const [showResourceRow, setShowResourceRow] = useState(
		(props.initialResourceIds ?? []).length > 0,
	)

	const createMut = useSaveMutation({
		mutationOptions: createCommentMutation(),
		invalidate: invalidateComments,
		successMessageKey: "comments.toast.posted",
		errorMessageKey: "comments.toast.postFailed",
		onSaved() {
			setBody("")
			setCharacterIds(props.initialCharacterIds ?? [])
			setResourceIds(props.initialResourceIds ?? [])
			setShowCharacterRow((props.initialCharacterIds ?? []).length > 0)
			setShowResourceRow((props.initialResourceIds ?? []).length > 0)
			props.onPosted?.()
		},
	})

	function handleCharacterChange(next: readonly string[]) {
		setCharacterIds(mergeLockedIds(next, lockedCharacterIds))
	}

	function handleResourceChange(next: readonly string[]) {
		setResourceIds(mergeLockedIds(next, lockedResourceIds))
	}

	function submit() {
		const trimmed = body.trim()
		if (trimmed.length === 0) return
		const input: CommentCreateInput = {
			body: trimmed,
			parentId: props.parentId,
			charIds: charIds.length > 0 ? [...charIds] : undefined,
			resIds: resIds.length > 0 ? [...resIds] : undefined,
			anchor: props.initialAnchor,
		}
		createMut.mutate(input)
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault()
			submit()
		}
	}

	const charsRemaining = MAX_COMMENT_BODY_LENGTH - body.length
	const showCharsRemaining = charsRemaining <= CHARS_REMAINING_THRESHOLD

	const composerBody = (
		<>
			<Textarea
				value={body}
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={handleKeyDown}
				maxLength={MAX_COMMENT_BODY_LENGTH}
				placeholder={
					props.placeholder ??
					t(
						props.parentId !== undefined
							? "comments.replyPlaceholder"
							: "comments.composerPlaceholder",
					)
				}
				rows={1}
				className="min-h-10 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 field-sizing-content"
			/>
			{showCharacterRow ? (
				<CharChipsPicker
					ids={charIds}
					onChange={handleCharacterChange}
					lockedIds={lockedCharacterIds}
				/>
			) : undefined}
			{showResourceRow ? (
				<ResChipsPicker
					ids={resIds}
					onChange={handleResourceChange}
					lockedIds={lockedResourceIds}
				/>
			) : undefined}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					{!showCharacterRow ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setShowCharacterRow(true)}
							data-testid={
								props.testId !== undefined
									? `${props.testId}-add-character-row`
									: undefined
							}
						>
							<UserPlus className="mr-1 size-3.5" />
							{t("comments.linkCharactersAdd")}
						</Button>
					) : undefined}
					{!showResourceRow ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setShowResourceRow(true)}
							data-testid={
								props.testId !== undefined
									? `${props.testId}-add-resource-row`
									: undefined
							}
						>
							<FilePlus2 className="mr-1 size-3.5" />
							{t("comments.linkResourcesAdd")}
						</Button>
					) : undefined}
				</div>
				<div className="flex items-center gap-2">
					{showCharsRemaining ? (
						<span className="text-xs text-muted-foreground tabular-nums">
							{t("comments.charsRemaining", { count: charsRemaining })}
						</span>
					) : null}
					<Button
						type="button"
						size="sm"
						onClick={submit}
						disabled={createMut.isPending || body.trim().length === 0}
					>
						<Send className="mr-1 size-3.5" />
						{createMut.isPending
							? t("comments.submitting")
							: t("comments.submit")}
					</Button>
				</div>
			</div>
		</>
	)

	if (variant === "reply") {
		return (
			<Surface
				size="compact"
				className="flex flex-col gap-2 bg-muted/30 focus-within:ring-2 focus-within:ring-ring/20"
				data-testid={props.testId}
			>
				{composerBody}
			</Surface>
		)
	}

	return (
		<Surface
			size="compact"
			className="flex flex-col gap-2 focus-within:ring-2 focus-within:ring-ring/20"
			data-testid={props.testId}
		>
			{composerBody}
		</Surface>
	)
}
