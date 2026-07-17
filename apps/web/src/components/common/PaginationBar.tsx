import { Button } from "@hoardodile/ui/components/button"
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@hoardodile/ui/components/pagination"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export type PaginationBarProps = {
	readonly page: number
	readonly pageCount: number
	readonly onChangePage: (page: number) => void
}

/**
 * Full pagination bar exposing first / prev / page-number jump / next /
 * last controls. Used by `/resources` and `/characters` search routes
 * where users may need to leap across many pages. Built on top of the
 * shadcn {@link Pagination} primitives for accessible nav semantics.
 */
export function PaginationBar(props: PaginationBarProps) {
	const { page, pageCount, onChangePage } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState("")

	function jump() {
		const parsed = Number.parseInt(draft, 10)
		if (Number.isNaN(parsed)) return
		const clamped = Math.min(Math.max(1, parsed), pageCount)
		setDraft("")
		if (clamped !== page) onChangePage(clamped)
	}

	return (
		<Pagination>
			<PaginationContent className="flex-wrap gap-2">
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => onChangePage(1)}
					>
						{t("common.first")}
					</Button>
				</PaginationItem>
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => onChangePage(Math.max(1, page - 1))}
					>
						{t("common.prev")}
					</Button>
				</PaginationItem>
				<PaginationItem>
					<span className="text-sm text-muted-foreground">
						{page} / {pageCount}
					</span>
				</PaginationItem>
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= pageCount}
						onClick={() => onChangePage(Math.min(pageCount, page + 1))}
					>
						{t("common.next")}
					</Button>
				</PaginationItem>
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= pageCount}
						onClick={() => onChangePage(pageCount)}
					>
						{t("common.last")}
					</Button>
				</PaginationItem>
				<PaginationItem>
					<form
						className="flex items-center gap-1"
						onSubmit={(e) => {
							e.preventDefault()
							jump()
						}}
					>
						<input
							type="number"
							min={1}
							max={pageCount}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={t("common.jumpToPage")}
							className="w-14 rounded border px-2 py-1 text-sm"
							aria-label={t("common.jumpToPage")}
						/>
						<Button type="submit" variant="outline" size="sm">
							{t("common.go")}
						</Button>
					</form>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	)
}
