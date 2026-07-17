import type { DocNode } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { cn } from "@hoardodile/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
	FileText,
	Folder,
	Loader2,
	MoreHorizontal,
	RotateCcw,
	Trash2,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmByTypingDialog } from "@/components/common/ConfirmByTypingDialog"
import {
	docSearchQueryOptions,
	hardDeleteDocumentMutation,
	invalidateDocuments,
	restoreDocumentMutation,
} from "@/features/doc"
import { useDocTheme } from "@/features/doc/hooks/useDocPrefs"

export type DocTrashListProps = {
	readonly activeId: string | undefined
	readonly onSelect?: () => void
}

/**
 * Flat recycle-bin list embedded in the sidebar (replaces DocTree when
 * trash mode is active). Each trashed node renders as a single row with
 * an icon, title, and a "more actions" dropdown containing restore and
 * permanent-delete. Styling mirrors DocSearchResults / DocTree rows.
 */
export function DocTrashList(props: DocTrashListProps) {
	const { t } = useTranslation()
	const trashQuery = useQuery(
		docSearchQueryOptions({ trashed: true, size: 200 }),
	)
	const rows = trashQuery.data?.rows ?? []

	return (
		<div className="flex flex-col gap-2">
			{trashQuery.isLoading ? (
				<div className="space-y-2 px-3 py-3">
					<p className="doc-label">{t("common.loading")}</p>
					<div className="h-8 w-full animate-pulse rounded-md bg-muted/60" />
					<div className="h-8 w-5/6 animate-pulse rounded-md bg-muted/60" />
					<div className="h-8 w-2/3 animate-pulse rounded-md bg-muted/60" />
				</div>
			) : rows.length === 0 ? (
				<div className="px-3 py-3 text-xs text-muted-foreground">
					{t("documents.trash.empty")}
				</div>
			) : (
				<ul
					className="flex flex-col px-1.5 py-0.5"
					data-testid="documents-trash-list"
				>
					{rows.map((row) => (
						<TrashRow
							key={row.id}
							node={row}
							isActive={props.activeId === row.id}
							onSelect={props.onSelect}
						/>
					))}
				</ul>
			)}
		</div>
	)
}

type TrashRowProps = {
	readonly node: DocNode
	readonly isActive: boolean
	readonly onSelect?: () => void
}

function TrashRow(props: TrashRowProps) {
	const { node, isActive } = props
	const { t } = useTranslation()
	const { themeClass } = useDocTheme()
	const qc = useQueryClient()
	const [hardDeleteOpen, setHardDeleteOpen] = useState(false)
	const [typed, setTyped] = useState("")
	const isFolder = node.kind === "folder"
	const Icon = isFolder ? Folder : FileText

	const restoreMut = useMutation({
		...restoreDocumentMutation(),
		onSuccess: async () => {
			await invalidateDocuments(qc, node.id)
			toast.success(t("documents.toast.restored"))
		},
		onError: (err) =>
			toast.error(err.message || t("documents.toast.restoreFailed")),
	})

	const hardMut = useMutation({
		...hardDeleteDocumentMutation(),
		onSuccess: async () => {
			await invalidateDocuments(qc, node.id)
			toast.success(t("documents.toast.deletedForever"))
			setHardDeleteOpen(false)
			setTyped("")
		},
		onError: (err) =>
			toast.error(err.message || t("documents.toast.deleteFailed")),
	})

	function handleHardDeleteOpenChange(open: boolean) {
		if (open) return
		setHardDeleteOpen(false)
		setTyped("")
	}

	const inner = (
		<div className="h-full flex items-center gap-1.5 truncate">
			<Icon
				className={cn(
					"size-4 shrink-0",
					isActive ? "text-primary" : "text-muted-foreground/70",
				)}
				strokeWidth={1.5}
			/>
			<span className="truncate text-sm font-medium leading-none">
				{node.title}
			</span>
		</div>
	)

	return (
		<li
			className="group relative flex h-8 items-center gap-1 rounded-md px-1 transition-colors duration-150"
			data-testid={`documents-trash-row-${node.id}`}
		>
			{isFolder ? (
				<div
					className={cn(
						"relative h-full flex-1 rounded-md px-1 text-muted-foreground",
						isActive && "doc-tree-active",
					)}
				>
					{inner}
				</div>
			) : (
				<Link
					to="/documents/$id"
					params={{ id: node.id }}
					onClick={() => props.onSelect?.()}
					className={cn(
						"relative flex h-full flex-1 items-center rounded-md px-1 transition-colors duration-150",
						isActive
							? "doc-tree-active text-foreground"
							: "text-foreground/80 hover:bg-accent/40",
					)}
					data-testid={`documents-trash-open-${node.id}`}
				>
					{inner}
				</Link>
			)}

			<div
				className={cn(
					"flex shrink-0 items-center transition-opacity",
					"opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100",
				)}
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-5 rounded-full text-muted-foreground/50 transition-colors hover:bg-transparent hover:text-foreground"
							aria-label={t("documents.moreActions")}
							onClick={(e) => e.stopPropagation()}
							data-testid={`documents-trash-more-${node.id}`}
						>
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className={cn("doc w-44", themeClass)}
					>
						<DropdownMenuItem
							onSelect={() => restoreMut.mutate(node.id)}
							data-testid={`documents-trash-restore-${node.id}`}
						>
							<RotateCcw className="mr-2 size-4" />
							{t("documents.trash.restore")}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => setHardDeleteOpen(true)}
							className="text-destructive focus:text-destructive"
							data-testid={`documents-trash-hard-delete-${node.id}`}
						>
							<Trash2 className="mr-2 size-4" />
							{t("documents.trash.hardDelete")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{restoreMut.isPending && (
				<Loader2 className="absolute right-1 size-3.5 animate-spin text-muted-foreground" />
			)}

			<ConfirmByTypingDialog
				open={hardDeleteOpen}
				onOpenChange={handleHardDeleteOpenChange}
				title={t("documents.trash.hardDeleteTitle")}
				description={t("documents.trash.hardDeleteDescription")}
				targetName={node.title}
				expectedInput={node.title}
				typed={typed}
				onTypedChange={setTyped}
				pending={hardMut.isPending}
				confirmLabel={t("documents.trash.hardDeleteConfirm")}
				pendingLabel={t("documents.trash.hardDeleting")}
				onConfirm={() => hardMut.mutate(node.id)}
				inputTestId={`documents-trash-hard-delete-input-${node.id}`}
				confirmTestId={`documents-trash-hard-delete-confirm-${node.id}`}
			/>
		</li>
	)
}
