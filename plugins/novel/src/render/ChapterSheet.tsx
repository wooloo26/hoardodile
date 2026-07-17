import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@hoardodile/ui/components/sheet"
import { useTranslation } from "../i18n"
import type { NovelChapter } from "./parse"

/**
 * Side sheet showing detected chapters. Clicking a row jumps to that
 * paragraph index and closes the sheet so the reader retains focus.
 */
export function NovelChapterSheet(props: {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly chapters: readonly NovelChapter[]
	readonly currentParagraphIndex: number
	readonly onJump: (paragraphIndex: number) => void
}) {
	const { open, onOpenChange, chapters, currentParagraphIndex, onJump } = props
	const { t } = useTranslation()
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				className="w-80 sm:max-w-sm"
				data-testid="novel-chapter-sheet"
			>
				<SheetHeader>
					<SheetTitle>{t("chapters")}</SheetTitle>
				</SheetHeader>
				<div className="flex h-full flex-col gap-1 overflow-y-auto px-4 pb-6">
					{chapters.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{t("chaptersEmpty")}
						</p>
					) : (
						chapters.map((c) => {
							const isActive = c.paragraphIndex <= currentParagraphIndex
							return (
								<button
									type="button"
									key={c.paragraphIndex}
									onClick={() => {
										onJump(c.paragraphIndex)
										onOpenChange(false)
									}}
									className={`rounded px-2 py-1 text-left text-sm transition ${
										isActive
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<span className="truncate">{c.title}</span>
								</button>
							)
						})
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
