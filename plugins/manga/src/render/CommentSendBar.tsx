import { Button } from "@hoardodile/ui/components/button"
import { Input } from "@hoardodile/ui/components/input"
import { Send } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "../i18n"
import { usePluginAPI } from "./hooks"

const MAX_MANGA_COMMENT_LENGTH = 500

/**
 * Inline send bar for posting page-anchored manga comments. Each
 * submission is anchored via the resource anchor so the comment surfaces
 * in the reader's bullet-screen overlay and the sidebar list.
 */
export function MangaCommentSendBar(props: {
	readonly filename: string
	readonly page: number
	readonly disabled?: boolean
}) {
	const { filename, page, disabled = false } = props
	const api = usePluginAPI()
	const { t } = useTranslation()
	const [text, setText] = useState("")
	const create = api.useCreateMessage()

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		const trimmed = text.trim()
		if (trimmed === "") return
		create
			.mutate({
				body: trimmed,
				anchor: {
					data: { filename, page },
				},
			})
			.then(
				() => {
					setText("")
					void api.invalidate("messages")
				},
				() => {
					/* error handled by host */
				},
			)
	}

	return (
		<form
			className="flex items-center gap-2"
			onSubmit={handleSubmit}
			data-testid="manga-comment-send-bar"
		>
			<Input
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder={t("commentPlaceholder")}
				maxLength={MAX_MANGA_COMMENT_LENGTH}
				disabled={disabled || create.isPending}
				className="h-8"
			/>
			<Button
				type="submit"
				size="sm"
				className="h-8 gap-1"
				disabled={disabled || create.isPending || text.trim() === ""}
			>
				<Send className="size-3.5" />
				{t("commentSend")}
			</Button>
		</form>
	)
}
