import type { ResCard as ResCardData } from "@hoardodile/schemas"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
	Download,
	ImageIcon,
	Layers,
	MoreVertical,
	Pencil,
	Plus,
	RotateCcw,
	StickyNote,
	Tag as TagIcon,
	Trash2,
	Users as UsersIcon,
} from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmByTypingDialog } from "@/components/common/ConfirmByTypingDialog"
import { ResCollectionsDialog } from "@/features/col/ResColsDialog"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import {
	hardDeleteResourceMutation,
	invalidateResources,
	resFilesQueryOptions,
	resFileUrl,
	resKeys,
	resSourceZipUrl,
	restoreResourceMutation,
	softDeleteResourceMutation,
} from "../api"
import {
	ResBasicEditDialog,
	ResCharactersEditDialog,
	ResCoverEditDialog,
} from "./ResEditDialogs"
import { ResTagsDialog } from "./ResTagsDialog"

type DialogKind = "basic" | "characters" | "cover" | "tags" | "collections"

export type ResCardActionsProps = {
	readonly resource: ResCardData
	/**
	 * Pixel offset from the top of the thumbnail. Stacks below the zoom
	 * button when present. Required for the default card-corner trigger;
	 * ignored when {@link renderTrigger} is supplied.
	 */
	readonly topOffsetClass?: string
	/**
	 * When provided, replaces the default absolutely-positioned card-corner
	 * trigger with a caller-supplied element. The element is wrapped in
	 * `DropdownMenuTrigger asChild` so callers can render any clickable
	 * affordance (icon button, list item, etc.) without re-implementing the
	 * surrounding menu and dialog plumbing.
	 */
	readonly renderTrigger?: () => React.ReactNode
}

/**
 * Three-dot actions menu for a {@link ResCard}. The "Edit" item now
 * expands a submenu with one entry per editable section, plus tags and
 * collections. Each entry opens a dedicated dialog instead of a tabbed hub.
 */
export function ResCardActions(props: ResCardActionsProps) {
	const { resource, topOffsetClass, renderTrigger } = props
	const resId = resource.id
	const resName = resource.name
	const isTrashed = resource.deletedAt !== undefined
	const count = resource.fileStats?.count
	const qc = useQueryClient()
	const { t } = useTranslation()
	const [hardDeleteOpen, setHardDeleteOpen] = useState(false)
	const [openDialog, setOpenDialog] = useState<DialogKind | undefined>(
		undefined,
	)
	const [confirmText, setConfirmText] = useState("")

	const invalidateResourceAndDetail = useCallback(
		async function invalidate(client: QueryClient) {
			await invalidateResources(client, resId)
			await client.refetchQueries({ queryKey: resKeys.all, type: "inactive" })
		},
		[resId],
	)

	const softDeleteMut = useSaveMutation({
		mutationOptions: softDeleteResourceMutation(),
		invalidate: invalidateResourceAndDetail,
		successMessageKey: "resources.toast.movedToTrash",
		errorMessageKey: "resources.toast.deleteFailed",
	})

	const restoreMut = useSaveMutation({
		mutationOptions: restoreResourceMutation(),
		invalidate: invalidateResourceAndDetail,
		successMessageKey: "resources.toast.restored",
		errorMessageKey: "resources.toast.restoreFailed",
	})

	const hardMut = useSaveMutation({
		mutationOptions: hardDeleteResourceMutation(),
		invalidate: invalidateResourceAndDetail,
		onSaved() {
			setHardDeleteOpen(false)
			setConfirmText("")
		},
		successMessageKey: "resources.toast.deletedForever",
		errorMessageKey: "resources.toast.deleteFailed",
	})

	function handleHardDeleteDialogChange(open: boolean) {
		if (open) return
		setHardDeleteOpen(false)
		setConfirmText("")
	}

	function handleDialogChange(kind: DialogKind, next: boolean) {
		if (!next && openDialog === kind) setOpenDialog(undefined)
	}

	return (
		<>
			<DropdownMenu modal={false}>
				<DropdownMenuTrigger asChild>
					{renderTrigger !== undefined ? (
						renderTrigger()
					) : (
						<button
							type="button"
							aria-label={t("resources.actions.actionsAria", {
								name: resName,
							})}
							data-testid={`resource-actions-${resId}`}
							className={`pointer-events-auto absolute right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white transition-opacity duration-200 bg-black/60 hover:bg-black/80 ${topOffsetClass ?? "top-2"}`}
						>
							<MoreVertical className="h-4 w-4" />
						</button>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					{isTrashed ? (
						<>
							<DropdownMenuItem
								onSelect={() => restoreMut.mutate(resId)}
								disabled={restoreMut.isPending}
								data-testid={`resource-action-restore-${resId}`}
							>
								<RotateCcw className="h-4 w-4" />
								{t("resources.actions.restore")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					) : null}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger
							data-testid={`resource-action-edit-${resId}`}
						>
							<Pencil className="h-4 w-4" />
							{t("common.edit")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-44">
							<DropdownMenuItem
								onSelect={() => setOpenDialog("tags")}
								data-testid={`resource-action-edit-tags-${resId}`}
							>
								<TagIcon className="h-4 w-4" />
								{t("resources.actions.editTags")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => setOpenDialog("collections")}
								data-testid={`resource-action-edit-collections-${resId}`}
							>
								<Layers className="h-4 w-4" />
								{t("resources.actions.editCollections")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => setOpenDialog("characters")}
								data-testid={`resource-action-edit-characters-${resId}`}
							>
								<UsersIcon className="h-4 w-4" />
								{t("resources.actions.editCharacters")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => setOpenDialog("basic")}
								data-testid={`resource-action-edit-basic-${resId}`}
							>
								<Pencil className="h-4 w-4" />
								{t("resources.actions.editBasic")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={() => setOpenDialog("cover")}
								data-testid={`resource-action-edit-cover-${resId}`}
							>
								<ImageIcon className="h-4 w-4" />
								{t("resources.actions.editCover")}
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuItem
						onSelect={(e) => {
							e.preventDefault()
							void downloadResource({ qc, resId, count })
						}}
						data-testid={`resource-action-download-${resId}`}
					>
						<Download className="h-4 w-4" />
						{t("resources.actions.download")}
					</DropdownMenuItem>
					<DropdownMenuItem
						asChild
						data-testid={`resource-action-comments-${resId}`}
					>
						<Link
							to="/messages"
							search={{ resId }}
							target="_blank"
							rel="noopener noreferrer"
							className="flex w-full items-center gap-2"
						>
							<StickyNote className="h-4 w-4" />
							{t("resources.actions.openComments")}
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem
						asChild
						data-testid={`resource-action-create-similar-${resId}`}
					>
						<Link
							to="/resources/new"
							search={{ cloneFrom: resId }}
							target="_blank"
							rel="noopener noreferrer"
							className="flex w-full items-center gap-2"
						>
							<Plus className="h-4 w-4" />
							{t("resources.actions.extend")}
						</Link>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{isTrashed ? (
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setHardDeleteOpen(true)}
							data-testid={`resource-action-hard-delete-${resId}`}
						>
							<Trash2 className="h-4 w-4" />
							{t("resources.actions.hardDelete")}
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => softDeleteMut.mutate(resId)}
							disabled={softDeleteMut.isPending}
							data-testid={`resource-action-delete-${resId}`}
						>
							<Trash2 className="h-4 w-4" />
							{t("resources.actions.softDelete")}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{openDialog === "basic" ? (
				<ResBasicEditDialog
					open
					resource={resource}
					onOpenChange={(n) => handleDialogChange("basic", n)}
				/>
			) : null}
			{openDialog === "characters" ? (
				<ResCharactersEditDialog
					open
					resource={resource}
					onOpenChange={(n) => handleDialogChange("characters", n)}
				/>
			) : null}
			{openDialog === "cover" ? (
				<ResCoverEditDialog
					open
					resId={resId}
					resName={resName}
					onOpenChange={(n) => handleDialogChange("cover", n)}
				/>
			) : null}
			{openDialog === "tags" ? (
				<ResTagsDialog
					open
					resource={{ id: resId, name: resName }}
					onOpenChange={(n) => handleDialogChange("tags", n)}
				/>
			) : null}
			{openDialog === "collections" ? (
				<ResCollectionsDialog
					open
					resource={{ id: resId, name: resName }}
					onOpenChange={(n) => handleDialogChange("collections", n)}
				/>
			) : null}

			{hardDeleteOpen ? (
				<ConfirmByTypingDialog
					open
					onOpenChange={handleHardDeleteDialogChange}
					title={t("resources.hardDelete.title")}
					description={t("resources.hardDelete.description")}
					targetName={resName}
					expectedInput={resName}
					typed={confirmText}
					onTypedChange={setConfirmText}
					pending={hardMut.isPending}
					confirmLabel={t("resources.hardDelete.confirm")}
					pendingLabel={t("resources.hardDelete.deleting")}
					onConfirm={() => hardMut.mutate(resId)}
					inputTestId={`hard-delete-confirm-input-${resId}`}
					confirmTestId={`hard-delete-confirm-${resId}`}
				/>
			) : null}
		</>
	)
}

type DownloadResourceArgs = {
	readonly qc: QueryClient
	readonly resId: string
	readonly count: number | undefined
}

/**
 * Browser download for a resource; filenames come from the server's
 * Content-Disposition. Single-file resources hit `/files/...`; otherwise
 * `source.zip`.
 */
async function downloadResource(args: DownloadResourceArgs): Promise<void> {
	const { qc, resId, count } = args
	if (count === 1) {
		const files = await qc.fetchQuery(resFilesQueryOptions(resId))
		const only = files[0]
		if (only !== undefined) {
			const filename = typeof only === "string" ? only : only.filename
			if (typeof filename === "string" && filename.length > 0) {
				triggerDownload(resFileUrl(resId, filename))
				return
			}
		}
	}
	triggerDownload(resSourceZipUrl(resId))
}

/** Same-origin navigation download; filename comes from Content-Disposition. */
function triggerDownload(url: string): void {
	const a = document.createElement("a")
	a.href = url
	document.body.appendChild(a)
	a.click()
	a.remove()
}
