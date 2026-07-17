import type { DocSearchRow } from "@hoardodile/schemas"
import { cn } from "@hoardodile/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { FileText, Folder } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { SearchHighlight } from "./SearchHighlight"

export type DocSearchCardProps = {
	readonly doc: DocSearchRow
	readonly query: string
}

export function DocSearchCard(props: DocSearchCardProps) {
	const { doc, query } = props
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const isFolder = doc.kind === "folder"

	return (
		<Link
			to="/documents/$id"
			params={{ id: doc.id }}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-accent/50"
			data-testid={`search-result-document-${doc.id}`}
		>
			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
					{isFolder ? (
						<Folder className="size-5 text-muted-foreground" />
					) : (
						<FileText className="size-5 text-muted-foreground" />
					)}
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="truncate font-medium">
							<SearchHighlight text={doc.title} query={query} />
						</span>
						<span
							className={cn(
								"shrink-0 rounded px-1.5 py-0.5 text-xs",
								isFolder
									? "bg-muted text-muted-foreground"
									: "bg-primary/10 text-primary",
							)}
						>
							{isFolder
								? t("search.resultLabels.folder")
								: t("search.resultLabels.document")}
						</span>
					</div>
					{doc.snippet !== undefined && doc.snippet.length > 0 ? (
						<p className="line-clamp-4 text-sm text-muted-foreground">
							<SearchHighlight text={doc.snippet} query={query} />
						</p>
					) : null}
					<span className="text-xs text-muted-foreground text-right">
						{formatter.formatDateTime(doc.updatedAt)}
					</span>
				</div>
			</div>
		</Link>
	)
}
