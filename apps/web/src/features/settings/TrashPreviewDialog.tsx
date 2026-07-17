import type { PluginManifestId } from "@hoardodile/schemas"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ResPreviewDialog } from "@/features/res/components/ResPreviewDialog"
import { type TrashItem, trashDownloadUrl } from "./api"

export type TrashPreviewDialogProps = {
	readonly items: readonly TrashItem[]
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}

export function TrashPreviewDialog(props: TrashPreviewDialogProps) {
	const { items, open, onOpenChange } = props
	const { t } = useTranslation()
	const [index, setIndex] = useState(0)

	const current = items[index]

	function close() {
		onOpenChange(false)
		setIndex(0)
	}

	function goPrev() {
		if (index > 0) setIndex((i) => i - 1)
	}

	function goNext() {
		if (index < items.length - 1) setIndex((i) => i + 1)
	}

	if (current === undefined || !open) return null

	const canPrev = index > 0
	const canNext = index < items.length - 1

	const bottomBar = (
		<div className="flex items-center justify-between gap-2 px-3 py-2">
			<div className="flex items-center gap-2">
				<button
					type="button"
					disabled={!canPrev}
					onClick={goPrev}
					aria-label={t("common.prev")}
					className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
				>
					<ChevronLeft className="size-5" />
				</button>
				<button
					type="button"
					disabled={!canNext}
					onClick={goNext}
					aria-label={t("common.next")}
					className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
				>
					<ChevronRight className="size-5" />
				</button>
				<span className="text-xs text-white/80">
					{index + 1} / {items.length}
				</span>
			</div>
			<a
				href={trashDownloadUrl(current.name)}
				download
				className="flex h-8 items-center gap-1 rounded-full bg-black/60 px-3 text-xs text-white transition-colors hover:bg-black/80"
			>
				<Download className="size-4" />
				{t("me.trash.download")}
			</a>
		</div>
	)

	return (
		<ResPreviewDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) close()
			}}
			resId={current.originalId ?? current.name}
			resName={current.name}
			contentPluginId={(current.contentPluginId ?? "") as PluginManifestId}
			sourceMeta={{}}
			searchMeta={undefined}
			fileStats={current.fileStats}
			bottomBar={bottomBar}
		/>
	)
}
