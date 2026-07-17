import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { docWorkspaceQueryOptions } from "@/features/doc"
import { DocTree } from "@/features/doc/DocTree"

export const Route = createFileRoute("/documents/")({
	pendingComponent: () => null,
	pendingMinMs: 0,
	component: DocsIndex,
})

/**
 * Landing view shown when no document is selected — the garden
 * entrance. An ensō draws itself in above the display-type welcome,
 * then the full tree settles below inside a washi panel so the user
 * can dive straight in.
 */
function DocsIndex() {
	const { t } = useTranslation()
	const workspace = useQuery(docWorkspaceQueryOptions())
	const nodes = workspace.data?.tree ?? []
	const isLoading = workspace.isPending
	return (
		<div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-16">
			<div className="doc-reveal flex flex-col items-center gap-5 text-center">
				<div className="flex flex-col gap-2">
					<h2 className="text-3xl font-semibold tracking-wide md:text-4xl">
						{t("documents.welcome.title")}
					</h2>
					<p className="text-sm text-muted-foreground md:text-base">
						{t("documents.welcome.subtitle")}
					</p>
				</div>
				<span className="doc-divider" aria-hidden="true" />
			</div>
			{isLoading ? (
				<div className="doc-reveal doc-reveal-3 doc-sheet rounded-2xl px-2 py-3 md:px-4 md:py-4">
					<DocTree nodes={nodes} activeId={undefined} isLoading />
				</div>
			) : nodes.length === 0 ? (
				<div className="doc-reveal doc-reveal-3">
					<DocTree nodes={nodes} activeId={undefined} />
				</div>
			) : (
				<div className="doc-reveal doc-reveal-3 doc-sheet rounded-2xl px-2 py-3 md:px-4 md:py-4">
					<DocTree nodes={nodes} activeId={undefined} />
				</div>
			)}
		</div>
	)
}
