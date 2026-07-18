import type { Message } from "@hoardodile/plugin-sdk-web"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { useTranslation } from "../i18n"
import { CommentComposer } from "./CommentComposer"
import { usePluginAPI } from "./hooks"

export function NovelParagraphCommentDialog(props: {
	readonly open: boolean
	readonly onClose: () => void
	readonly filename: string
	readonly paragraphIndex: number | undefined
	readonly comments: readonly Message[]
}) {
	const api = usePluginAPI()
	const { open, onClose, filename, paragraphIndex, comments } = props
	const { t } = useTranslation()
	const createMessage = api.useCreateMessage()

	function handleOpenChange(next: boolean) {
		if (!next) onClose()
	}

	async function handleSubmit(body: string) {
		await createMessage.mutate({
			body,
			anchor: {
				data: { paragraphIndex, filename },
			},
		})
	}

	if (paragraphIndex === undefined) return null

	const title = (
		<>
			{t("comments")}
			{" — "}
			{t("paragraphAnchor", { n: paragraphIndex + 1 })}
		</>
	)
	return (
		<AppDialog
			open={open}
			onOpenChange={handleOpenChange}
			title={title}
			contentClassName="sm:max-w-lg"
			contentTestId="novel-paragraph-comment-dialog"
		>
			<div className="flex flex-col gap-3">
				{comments.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("commentsEmpty")}</p>
				) : (
					<ul className="flex flex-col gap-2">
						{comments.map(function renderComment(c) {
							return (
								<li
									key={c.id}
									className="rounded-md bg-muted/40 px-3 py-2 text-sm"
								>
									{c.body}
								</li>
							)
						})}
					</ul>
				)}
				<div className="border-t pt-3">
					<CommentComposer
						onSubmit={handleSubmit}
						isPending={createMessage.isPending}
						placeholder={t("commentPlaceholder")}
					/>
				</div>
			</div>
		</AppDialog>
	)
}
