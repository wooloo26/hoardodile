import { Button } from "@hoardodile/ui/components/button"
import { List, Settings } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "../i18n"

export function NovelTopBar(props: {
	readonly currentPage: number
	readonly totalPages: number
	readonly onOpenChapters: () => void
	readonly onOpenSettings: () => void
	readonly onPageJump: (page: number) => void
}) {
	const {
		currentPage,
		totalPages,
		onOpenChapters,
		onOpenSettings,
		onPageJump,
	} = props
	const { t } = useTranslation()
	return (
		<div className="flex items-center justify-between gap-2 border-b border-current/10 bg-current/5 px-3 py-2 text-sm">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onOpenChapters}
				className="h-7 gap-1 px-2 text-xs"
				data-testid="novel-chapters-button"
				aria-label={t("chapters")}
			>
				<List className="size-3.5" />
			</Button>
			<NovelPageJumpInput
				currentPage={currentPage}
				totalPages={totalPages}
				onJump={onPageJump}
				t={t}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onOpenSettings}
				className="h-7 gap-1 px-2 text-xs"
				data-testid="novel-settings-button"
				aria-label={t("settings")}
			>
				<Settings className="size-3.5" />
			</Button>
		</div>
	)
}

function NovelPageJumpInput(props: {
	readonly currentPage: number
	readonly totalPages: number
	readonly onJump: (page: number) => void
	readonly t: (key: string, vars?: Record<string, string | number>) => string
}) {
	const { currentPage, totalPages, onJump, t } = props
	const [draft, setDraft] = useState("")
	const [editing, setEditing] = useState(false)
	useEffect(
		function syncFromOutside() {
			if (!editing) setDraft(String(currentPage))
		},
		[currentPage, editing],
	)
	function commit() {
		setEditing(false)
		const n = Number.parseInt(draft, 10)
		if (Number.isNaN(n)) {
			setDraft(String(currentPage))
			return
		}
		const target = Math.max(1, Math.min(totalPages, n))
		onJump(target)
		setDraft(String(target))
	}
	return (
		<span
			className="flex items-center gap-1 text-xs tabular-nums opacity-80"
			data-testid="novel-page-indicator"
		>
			<input
				type="text"
				inputMode="numeric"
				value={draft}
				onFocus={(e) => {
					setEditing(true)
					e.currentTarget.select()
				}}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						;(e.target as HTMLInputElement).blur()
					} else if (e.key === "Escape") {
						setDraft(String(currentPage))
						;(e.target as HTMLInputElement).blur()
					}
				}}
				className="w-12 rounded border border-current/20 bg-transparent px-1 py-0.5 text-center text-xs outline-hidden focus:border-current/60"
				aria-label={t("page")}
				data-testid="novel-page-jump-input"
			/>
			<span>{t("pageCount", { total: totalPages })}</span>
		</span>
	)
}
