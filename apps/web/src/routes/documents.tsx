import {
	MAX_NAME_LENGTH,
	MAX_SEARCH_QUERY_LENGTH,
} from "@hoardodile/consts/text-limits"
import { Button } from "@hoardodile/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { Input } from "@hoardodile/ui/components/input"
import { Switch } from "@hoardodile/ui/components/switch"
import { cn } from "@hoardodile/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	createFileRoute,
	Link,
	Outlet,
	useChildMatches,
	useNavigate,
} from "@tanstack/react-router"
import {
	FilePlus,
	FolderPlus,
	Palette,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react"
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { MobileDrawer } from "@/components/common/MobileDrawer"
import {
	createDocumentNodeMutation,
	docDetailPageQueryOptions,
	docWorkspaceQueryOptions,
	invalidateDocuments,
} from "@/features/doc"
import { DocAppearanceSettingsDialog } from "@/features/doc/components/DocAppearanceSettingsDialog"
import { DocSearchResults } from "@/features/doc/DocSearchResults"
import { DocTrashList } from "@/features/doc/DocTrashList"
import { DocTree } from "@/features/doc/DocTree"
import { useDocTheme } from "@/features/doc/hooks/useDocPrefs"
import { fontArrayCodec } from "@/features/prefs"
import { asyncPrefQueryOptions } from "@/features/prefs/asyncPrefQuery"
import { usePrefSync } from "@/hooks/usePrefSync"
import { requireAuth } from "@/lib/auth-guard"
import { buildFontFamily, loadPresetCss } from "@/lib/fonts"
import { prefKeys } from "@/lib/keys"
import { useDebouncedValue } from "@/lib/useDebouncedValue"

const docsSearchSchema = z
	.object({
		filter: z.string().optional(),
	})
	.loose()

export const Route = createFileRoute("/documents")({
	beforeLoad: requireAuth,
	validateSearch: docsSearchSchema,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			asyncPrefQueryOptions(prefKeys.docTreeExpanded),
		)
	},
	component: DocsLayout,
})

/**
 * Unified knowledge-base shell: persistent tree on the left, active
 * document on the right.
 *
 * - Desktop (md+): both panes share the viewport with a fixed-width
 *   sidebar.
 * - Mobile: the sidebar collapses into a slide-in drawer; the active
 *   document fills the viewport. A floating menu button toggles the
 *   drawer; selecting any document auto-dismisses it.
 *
 * The layout owns the single workspace query (tree + masked AI
 * config), so child routes never refetch the tree just to render a
 * detail panel.
 */
function DocsLayout() {
	const activeId = useActiveDocId()
	const detailPageQuery = useQuery({
		...docDetailPageQueryOptions(activeId ?? ""),
		enabled: activeId !== undefined,
	})
	const workspaceQuery = useQuery({
		...docWorkspaceQueryOptions(),
		enabled: activeId === undefined,
	})
	const nodes = detailPageQuery.data?.tree ?? workspaceQuery.data?.tree ?? []
	const workspaceLoading =
		activeId !== undefined
			? detailPageQuery.isPending
			: workspaceQuery.isPending
	const search = Route.useSearch()
	const navigate = useNavigate()
	const [mobileTreeOpen, setMobileTreeOpen] = useState(false)
	const [appearanceDialogOpen, setAppearanceDialogOpen] = useState(false)
	const [trashMode, setTrashMode] = useState(false)
	const [editMode, setEditMode] = useState(false)
	const handleCloseMobileTree = useCallback(function handleCloseMobileTree() {
		setMobileTreeOpen(false)
	}, [])
	const handleOpenMobileTree = useCallback(function handleOpenMobileTree() {
		setMobileTreeOpen(true)
	}, [])
	const { themeClass } = useDocTheme()
	const filter = search.filter ?? ""
	const debouncedFilter = useDebouncedValue(filter, 250)
	const [docUiFonts] = usePrefSync(prefKeys.docUiFont, [], fontArrayCodec)
	const docUiFontFamily = buildFontFamily(docUiFonts)

	useEffect(() => {
		setMobileTreeOpen(false)
	}, [activeId])

	// The document display font (chrome titles, document headings) ships
	// locally; load its CSS once when the knowledge base mounts.
	useEffect(() => {
		loadPresetCss("lxgw-wenkai")
	}, [])

	const trimmed = debouncedFilter.trim()
	const isSearching = trimmed.length > 0

	const layoutValue = useMemo<MobileTopBarProps>(
		function buildLayoutValue() {
			return { onOpenTree: handleOpenMobileTree }
		},
		[handleOpenMobileTree],
	)

	function setFilter(next: string) {
		if (next.length > 0) setTrashMode(false)
		navigate({
			to: ".",
			search: (prev) => ({
				...(prev ?? {}),
				filter: next.length > 0 ? next : undefined,
			}),
			replace: true,
		})
	}

	return (
		// Desktop sidebar is sticky so it stays visible while the content
		// scrolls via body. Mobile drawer is fixed-position and unaffected.
		<div
			className={cn("doc flex min-h-[calc(100svh-3rem)] w-full", themeClass)}
			data-doc-layout
			style={{ "--font-doc-ui": docUiFontFamily } as React.CSSProperties}
		>
			<aside
				className="sticky top-12 hidden h-[calc(100svh-3rem)] w-72 shrink-0 flex-col border-r border-border/70 bg-card/55 md:flex"
				data-testid="documents-sidebar"
			>
				<SidebarHeader
					count={nodes.length}
					isLoading={workspaceLoading}
					onClose={() => setMobileTreeOpen(false)}
					onOpenAppearanceSettings={() => setAppearanceDialogOpen(true)}
					trashMode={trashMode}
					onToggleTrash={() => {
						if (!trashMode) setFilter("")
						setTrashMode((v) => !v)
					}}
					editMode={editMode}
					onEditModeChange={setEditMode}
				/>
				{!trashMode && (
					<>
						<SidebarSearchField value={filter} onChange={setFilter} />
						<RootCreateBar />
					</>
				)}
				<div className="flex-1 min-h-0 overflow-y-auto pb-6">
					{trashMode ? (
						<DocTrashList
							activeId={activeId}
							onSelect={() => setMobileTreeOpen(false)}
						/>
					) : isSearching ? (
						<DocSearchResults
							query={trimmed}
							activeId={activeId}
							onSelect={() => setMobileTreeOpen(false)}
						/>
					) : (
						<DocTree
							nodes={nodes}
							activeId={activeId}
							editMode={editMode}
							onSelect={handleCloseMobileTree}
							isLoading={workspaceLoading}
						/>
					)}
				</div>
			</aside>

			<MobileDrawer
				open={mobileTreeOpen}
				onOpenChange={setMobileTreeOpen}
				side="left"
				width="w-72"
			>
				<div className="flex h-full flex-col">
					<SidebarHeader
						count={nodes.length}
						isLoading={workspaceLoading}
						onClose={() => setMobileTreeOpen(false)}
						onOpenAppearanceSettings={() => setAppearanceDialogOpen(true)}
						trashMode={trashMode}
						onToggleTrash={() => {
							if (!trashMode) setFilter("")
							setTrashMode((v) => !v)
						}}
						editMode={editMode}
						onEditModeChange={setEditMode}
					/>
					{!trashMode && (
						<>
							<SidebarSearchField value={filter} onChange={setFilter} />
							<RootCreateBar />
						</>
					)}
					<div className="flex-1 min-h-0 overflow-y-auto pb-6">
						{trashMode ? (
							<DocTrashList
								activeId={activeId}
								onSelect={handleCloseMobileTree}
							/>
						) : isSearching ? (
							<DocSearchResults
								query={trimmed}
								activeId={activeId}
								onSelect={handleCloseMobileTree}
							/>
						) : (
							<DocTree
								nodes={nodes}
								activeId={activeId}
								editMode={editMode}
								onSelect={handleCloseMobileTree}
								isLoading={workspaceLoading}
							/>
						)}
					</div>
				</div>
			</MobileDrawer>

			<main className="flex flex-1 flex-col">
				<DocLayoutContext.Provider value={layoutValue}>
					<div className="flex-1">
						<Outlet />
					</div>
				</DocLayoutContext.Provider>
			</main>

			<DocAppearanceSettingsDialog
				open={appearanceDialogOpen}
				onOpenChange={setAppearanceDialogOpen}
			/>
		</div>
	)
}

type SidebarHeaderProps = {
	readonly count: number
	readonly isLoading?: boolean
	readonly onClose: () => void
	readonly onOpenAppearanceSettings: () => void
	readonly trashMode: boolean
	readonly onToggleTrash: () => void
	readonly editMode: boolean
	readonly onEditModeChange: (next: boolean) => void
}

function SidebarHeader(props: SidebarHeaderProps) {
	const { t } = useTranslation()
	const statusLabel = props.isLoading
		? t("documents.loading")
		: t("documents.countLabel", { count: props.count })
	return (
		<div className="flex flex-col border-b border-border/60">
			<div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
				<Link
					to="/documents"
					className="flex min-w-0 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
					onClick={props.onClose}
				>
					<div className="flex min-w-0 flex-col gap-0.5 leading-tight">
						<span className="truncate text-[15px] font-semibold tracking-wide">
							{t("documents.title")}
						</span>
						<span className="doc-label truncate">{statusLabel}</span>
					</div>
				</Link>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 rounded-full text-muted-foreground hover:text-foreground md:hidden"
					onClick={props.onClose}
					title={t("common.close")}
				>
					<X className="size-4" />
				</Button>
			</div>
			<div className="flex items-center justify-between gap-1 px-4 py-1">
				{!props.trashMode && (
					<div
						className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex"
						title={t("documents.editMode.hint")}
					>
						<Switch
							checked={props.editMode}
							onCheckedChange={props.onEditModeChange}
							className="data-[state=checked]:bg-primary"
							aria-label={t("documents.editMode.toggle")}
							data-testid="documents-edit-mode-toggle"
						/>
						<span>{t("documents.editMode.label")}</span>
					</div>
				)}
				<div className="ml-auto flex items-center gap-0.5">
					<Button
						variant={props.trashMode ? "default" : "ghost"}
						size="icon"
						className="size-7 rounded-full transition-colors hover:text-foreground"
						onClick={props.onToggleTrash}
						title={t("documents.trash.open")}
						data-testid="documents-open-trash"
					>
						<Trash2 className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 rounded-full text-muted-foreground transition-colors hover:text-foreground"
						onClick={props.onOpenAppearanceSettings}
						title={t("documents.appearanceSettings.title")}
						data-testid="documents-appearance-settings"
					>
						<Palette className="size-3.5" />
					</Button>
				</div>
			</div>
		</div>
	)
}

type SidebarSearchFieldProps = {
	readonly value: string
	readonly onChange: (next: string) => void
}

/** Quiet underline-style search field shared by sidebar and drawer. */
function SidebarSearchField(props: SidebarSearchFieldProps) {
	const { t } = useTranslation()
	return (
		<div className="mt-3 px-4 pb-2">
			<div className="relative">
				<Search className="pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
				<Input
					value={props.value}
					onChange={(e) => props.onChange(e.target.value)}
					placeholder={t("documents.searchPlaceholder")}
					maxLength={MAX_SEARCH_QUERY_LENGTH}
					className="h-8 rounded-none border-0 border-b border-border/70 bg-transparent pl-7 pr-1 text-sm shadow-none transition-colors focus-visible:border-primary focus-visible:ring-0 dark:bg-transparent"
				/>
			</div>
		</div>
	)
}

function RootCreateBar() {
	const { t } = useTranslation()
	const { themeClass } = useDocTheme()
	const qc = useQueryClient()
	const navigate = useNavigate()
	const [title, setTitle] = useState("")

	const createMut = useMutation({
		...createDocumentNodeMutation(),
		onSuccess: async (created) => {
			setTitle("")
			await invalidateDocuments(qc)
			if (created.kind === "document") {
				await navigate({ to: "/documents/$id", params: { id: created.id } })
			}
		},
		onError: (err) =>
			toast.error(err.message || t("documents.toast.createFailed")),
	})

	function submit(kind: "folder" | "document") {
		const next = title.trim()
		const finalTitle =
			next.length > 0
				? next
				: kind === "folder"
					? t("documents.defaultNewFolderTitle")
					: t("documents.defaultNewTitle")
		createMut.mutate({ kind, title: finalTitle })
	}

	return (
		<div className="flex items-center gap-1.5 border-b border-border/60 px-4 pb-3">
			<Input
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") submit("document")
				}}
				maxLength={MAX_NAME_LENGTH}
				placeholder={t("documents.new")}
				className="h-7 rounded-md border-border/60 bg-background/50 text-xs shadow-none dark:bg-background/30"
				data-testid="documents-root-title"
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						size="icon"
						variant="default"
						className="size-7 shrink-0 rounded-full shadow-sm transition-shadow hover:shadow-[0_0_14px_var(--gold-glow)]"
						disabled={createMut.isPending}
						title={t("documents.new")}
						data-testid="documents-root-add"
					>
						<Plus className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className={cn("doc", themeClass)}>
					<DropdownMenuItem onClick={() => submit("document")}>
						<FilePlus className="mr-2 size-4" />
						{t("documents.new")}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => submit("folder")}>
						<FolderPlus className="mr-2 size-4" />
						{t("documents.newFolder")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

type MobileTopBarProps = {
	readonly onOpenTree: () => void
}

/**
 * Bridge between the documents shell and the active document detail
 * page. The shell owns the mobile tree drawer and the AI settings
 * dialog; the detail header (rendered inside the child route via
 * `<Outlet />`) needs to trigger them. Exposing the callbacks as
 * context lets the header opt in without prop-drilling through
 * router APIs.
 */
export const DocLayoutContext = createContext<MobileTopBarProps | undefined>(
	undefined,
)

/** Reads the {@link DocLayoutContext} from inside the documents shell. */
export function useDocLayout(): MobileTopBarProps | undefined {
	return useContext(DocLayoutContext)
}

/**
 * Reads the active doc id straight off the matched child route — works
 * with TanStack Router's nested matching without an extra param hook.
 */
function useActiveDocId(): string | undefined {
	const matches = useChildMatches()
	for (const m of matches) {
		if (
			typeof m.params === "object" &&
			m.params !== null &&
			"id" in m.params &&
			typeof m.params.id === "string"
		) {
			return m.params.id
		}
	}
	return undefined
}
