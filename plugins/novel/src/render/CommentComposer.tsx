import { MAX_COMMENT_BODY_LENGTH } from "@hoardodile/consts/text-limits"
import type { ResAnchor } from "@hoardodile/plugin-sdk-web"
import { Button } from "@hoardodile/ui/components/button"
import { Textarea } from "@hoardodile/ui/components/textarea"
import { Send } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useTranslation } from "../i18n"

export type CommentComposerProps = {
	/**
	 * Called when the user submits. The caller owns the mutation,
	 * invalidation, and error/success notification.
	 */
	readonly onSubmit: (body: string) => Promise<unknown>
	readonly isPending?: boolean
	readonly placeholder?: string
	readonly submitLabel?: string
	readonly pendingLabel?: string
	/** Pre-seeded anchor attached to the comment without exposing UI for it. */
	readonly initialAnchor?: ResAnchor
	/** Initial body text. */
	readonly initialBody?: string
	/** Optional slot for character/resource pickers (web-specific). */
	readonly pickerSlot?: ReactNode
	readonly testId?: string
	readonly className?: string
}

/**
 * Generic comment composer. Accepts `onSubmit` as the sole mutation
 * contract — the caller wraps create, invalidation, and toast.
 */
export function CommentComposer(props: CommentComposerProps) {
	const { t } = useTranslation()
	const [body, setBody] = useState(props.initialBody ?? "")
	const isPending = props.isPending ?? false

	function submit() {
		const trimmed = body.trim()
		if (trimmed.length === 0) return
		props.onSubmit(trimmed).then(
			() => setBody(""),
			() => {
				/* caller handles error notification */
			},
		)
	}

	return (
		<div
			className={`flex flex-col gap-2 rounded-lg ${props.className ?? ""}`}
			data-testid={props.testId}
		>
			<Textarea
				value={body}
				onChange={(e) => setBody(e.target.value)}
				maxLength={MAX_COMMENT_BODY_LENGTH}
				placeholder={props.placeholder ?? t("writeComment")}
				rows={3}
				className="min-h-24 resize-y bg-background"
			/>
			{props.pickerSlot}
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					size="sm"
					onClick={submit}
					disabled={isPending || body.trim().length === 0}
				>
					<Send className="mr-1 size-3.5" />
					{isPending
						? (props.pendingLabel ?? t("submitting"))
						: (props.submitLabel ?? t("submit"))}
				</Button>
			</div>
		</div>
	)
}
