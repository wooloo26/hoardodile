import type { DocVersionMeta } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@hoardodile/ui/components/dialog"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { cn } from "@hoardodile/ui/lib/utils"
import {
	BookOpen,
	CircleHelp,
	Clock,
	GitCompareArrows,
	Indent,
	List,
	Menu,
	MoreHorizontal,
	PencilLine,
	Redo2,
	RotateCcw,
	Save,
	Undo2,
	X,
	Zap,
	ZoomIn,
	ZoomOut,
} from "lucide-react"
import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useDocTheme } from "@/features/doc/hooks/useDocPrefs"
import { useDateFormatter } from "@/features/settings/datePrefs.ts"
import { DocHelpPanel } from "../DocHelpPopover.tsx"
import { ZOOM_DEFAULT_INDEX, ZOOM_STEPS } from "../prefs.ts"

export type DocDetailHeaderProps = {
	readonly readingMode: boolean
	readonly readingModeLocked: boolean
	readonly diffMode: boolean
	readonly canEnterDiff: boolean
	readonly autosaveEnabled: boolean
	readonly indentEnabled: boolean
	readonly fontSizeIndex: number
	readonly zoom: number
	readonly canUndo: boolean
	readonly canRedo: boolean
	readonly dirty: boolean
	readonly hasCommittableChange: boolean
	readonly hasVersions: boolean
	readonly versions: readonly DocVersionMeta[]
	readonly diffVersionId: string | undefined
	readonly onChangeDiffVersionId: (id: string) => void
	readonly patchPending: boolean
	readonly commitPending: boolean
	readonly discardPending: boolean
	readonly onUndo: () => void
	readonly onRedo: () => void
	readonly onToggleReadingMode: () => void
	readonly onToggleAutosave: () => void
	readonly onToggleIndent: () => void
	readonly onAdjustFontSize: (delta: number) => void
	readonly onResetFontSize: () => void
	readonly onManualSave: () => void
	readonly onRequestCommit: () => void
	readonly onOpenDiscard: () => void
	readonly onEnterDiff: () => void
	readonly onExitDiff: () => void
	/**
	 * Mobile-only: open the document tree drawer. Rendered as a
	 * hamburger button in the leftmost cluster on small screens.
	 */
	readonly onOpenTree?: () => void
	/**
	 * Mobile-only: open the heading navigation sheet. Rendered next
	 * to the save button on small screens.
	 */
	readonly onOpenHeadingNav?: () => void
}

/**
 * Sticky header for the document detail page. Composes undo/redo,
 * reading/diff mode toggles, the settings dropdown menu (zoom, autosave,
 * indent, diff, discard) and the primary save button.
 *
 * All actions are passed in as callbacks so this component stays
 * presentation-only; the route owns the underlying state and
 * mutations.
 */
export const DocDetailHeader = memo(function DocDetailHeader(
	props: DocDetailHeaderProps,
) {
	const { t } = useTranslation()
	const {
		readingMode,
		autosaveEnabled,
		indentEnabled,
		fontSizeIndex,
		zoom,
		canUndo,
		canRedo,
		dirty,
		hasCommittableChange,
		hasVersions,
		patchPending,
		commitPending,
		discardPending,
	} = props
	const [helpOpen, setHelpOpen] = useState(false)
	const { themeClass } = useDocTheme()
	return (
		<header className="doc-detail-header sticky top-12 z-22">
			<div className="doc-toolbar flex min-w-0 items-center gap-2 px-2 py-1.5 md:px-2.5">
				<div className="flex min-w-0 flex-1 items-center gap-1">
					{props.onOpenTree !== undefined ? (
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground md:hidden"
							onClick={props.onOpenTree}
							title={t("documents.title")}
							aria-label={t("documents.title")}
							data-testid="documents-open-tree"
						>
							<Menu className="size-3.5" />
						</Button>
					) : undefined}
					{props.diffMode ? (
						<>
							<Button
								variant="default"
								size="sm"
								onClick={props.onExitDiff}
								title={t("documents.diff.exit")}
								data-testid="document-exit-diff"
							>
								<X className="size-3.5" />
								<span className="ml-1 hidden lg:inline">
									{t("documents.diff.exit")}
								</span>
							</Button>
							<VersionSelector
								versions={props.versions}
								selectedId={props.diffVersionId}
								onSelect={props.onChangeDiffVersionId}
								themeClass={themeClass}
							/>
						</>
					) : (
						<>
							{!props.readingModeLocked && (
								<Button
									variant={readingMode ? "default" : "outline"}
									size="sm"
									onClick={props.onToggleReadingMode}
									title={
										readingMode
											? t("documents.readOnly.disable")
											: t("documents.readOnly.enable")
									}
									data-testid="document-reading-toggle"
								>
									{readingMode ? (
										<PencilLine className="size-3.5" />
									) : (
										<BookOpen className="size-3.5" />
									)}
									<span className="ml-1 hidden lg:inline">
										{readingMode
											? t("documents.readOnly.disable")
											: t("documents.readOnly.enable")}
									</span>
								</Button>
							)}
							{props.canEnterDiff && (
								<Button
									variant="outline"
									size="sm"
									onClick={props.onEnterDiff}
									title={t("documents.diff.show")}
									data-testid="document-enter-diff"
								>
									<GitCompareArrows className="size-3.5" />
									<span className="ml-1 hidden lg:inline">
										{t("documents.diff.show")}
									</span>
								</Button>
							)}
							{!readingMode && (
								<>
									<Button
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground hover:text-foreground"
										onClick={props.onUndo}
										disabled={!canUndo}
										title={t("documents.toolbar.undo")}
										aria-label={t("documents.toolbar.undo")}
										data-testid="document-undo"
									>
										<Undo2 className="size-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground hover:text-foreground"
										onClick={props.onRedo}
										disabled={!canRedo}
										title={t("documents.toolbar.redo")}
										aria-label={t("documents.toolbar.redo")}
										data-testid="document-redo"
									>
										<Redo2 className="size-3.5" />
									</Button>
								</>
							)}
						</>
					)}
				</div>
				<div className="flex min-w-0 items-center gap-1">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-muted-foreground hover:text-foreground"
								title={t("documents.moreActions")}
								data-testid="document-more"
							>
								<MoreHorizontal className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className={cn("doc w-60", themeClass)}
						>
							<DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
								<ZoomIn className="size-3.5" />
								{t("documents.zoom.label")}
							</DropdownMenuLabel>
							<div className="flex items-center gap-1 px-2 pb-1.5">
								<Button
									variant="outline"
									size="sm"
									className="h-7 flex-1 px-2"
									onClick={() => props.onAdjustFontSize(-1)}
									disabled={fontSizeIndex === 0}
									title={t("documents.zoom.smaller")}
									data-testid="document-zoom-smaller"
								>
									<ZoomOut className="size-3.5" />
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="h-7 flex-1 px-2 text-xs tabular-nums"
									onClick={props.onResetFontSize}
									disabled={fontSizeIndex === ZOOM_DEFAULT_INDEX}
									title={t("documents.zoom.reset")}
									data-testid="document-zoom-reset"
								>
									{Math.round(zoom * 100)}%
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="h-7 flex-1 px-2"
									onClick={() => props.onAdjustFontSize(1)}
									disabled={fontSizeIndex === ZOOM_STEPS.length - 1}
									title={t("documents.zoom.larger")}
									data-testid="document-zoom-larger"
								>
									<ZoomIn className="size-3.5" />
								</Button>
							</div>
							<DropdownMenuSeparator />
							{props.diffMode ? (
								<DropdownMenuItem
									onSelect={props.onExitDiff}
									data-testid="document-diff-exit-menu"
								>
									<X className="mr-2 size-3.5" />
									{t("documents.diff.exit")}
								</DropdownMenuItem>
							) : !props.readingModeLocked ? (
								<DropdownMenuCheckboxItem
									checked={readingMode}
									onCheckedChange={props.onToggleReadingMode}
									data-testid="document-reading-menu"
								>
									<BookOpen className="mr-2 size-3.5" />
									{t("documents.readOnly.enable")}
								</DropdownMenuCheckboxItem>
							) : null}
							<DropdownMenuCheckboxItem
								checked={indentEnabled}
								onCheckedChange={props.onToggleIndent}
								data-testid="document-indent-toggle"
							>
								<Indent className="mr-2 size-3.5" />
								{t("documents.indent.enable")}
							</DropdownMenuCheckboxItem>
							<DropdownMenuSeparator />
							<DropdownMenuCheckboxItem
								checked={autosaveEnabled}
								onCheckedChange={props.onToggleAutosave}
								disabled={readingMode}
								data-testid="document-autosave-toggle"
							>
								<Zap className="mr-2 size-3.5" />
								{t("documents.autosave.enable")}
							</DropdownMenuCheckboxItem>
							{!readingMode && (
								<DropdownMenuItem
									onSelect={props.onManualSave}
									disabled={patchPending || !dirty}
									data-testid="document-save"
								>
									<Save className="mr-2 size-3.5" />
									{t("documents.saveDraft")}
								</DropdownMenuItem>
							)}
							{!readingMode && (
								<DropdownMenuItem
									onSelect={props.onRequestCommit}
									disabled={commitPending || !hasCommittableChange}
									data-testid="document-commit"
								>
									<Save className="mr-2 size-3.5" />
									{t("documents.commit")}
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={() => setHelpOpen(true)}
								data-testid="document-help"
							>
								<CircleHelp className="mr-2 size-3.5" />
								{t("documents.help.title")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={props.onOpenDiscard}
								disabled={readingMode || discardPending || !hasVersions}
								data-testid="document-discard"
								className="text-destructive focus:text-destructive"
							>
								<RotateCcw className="mr-2 size-3.5" />
								{t("documents.discardDraft")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					{props.onOpenHeadingNav !== undefined && (
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground lg:hidden"
							onClick={props.onOpenHeadingNav}
							data-testid="document-open-headings"
						>
							<List className="size-3.5" />
						</Button>
					)}
					{!readingMode && (
						<Button
							variant="outline"
							size="sm"
							onClick={props.onManualSave}
							disabled={patchPending || !dirty}
							className={cn(
								"inline-flex",
								!autosaveEnabled && dirty && "relative",
							)}
							data-testid="document-save-primary"
						>
							<Save className="mr-1 size-3.5" />
							<span className="hidden lg:inline">
								{t("documents.saveDraft")}
							</span>
							{!autosaveEnabled && dirty && (
								<span
									className={cn(
										"absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary shadow-[0_0_8px_var(--gold-glow)]",
										patchPending && "animate-pulse",
									)}
									data-testid="document-save-dot"
								/>
							)}
						</Button>
					)}
				</div>
			</div>
			<Dialog open={helpOpen} onOpenChange={setHelpOpen}>
				<DialogContent showCloseButton={true} className={cn("doc", themeClass)}>
					<DialogHeader>
						<DialogTitle>{t("documents.help.title")}</DialogTitle>
					</DialogHeader>
					<DocHelpPanel />
				</DialogContent>
			</Dialog>
		</header>
	)
})

const VersionSelector = memo(function VersionSelector(props: {
	readonly versions: readonly DocVersionMeta[]
	readonly selectedId: string | undefined
	readonly onSelect: (id: string) => void
	readonly themeClass: string | undefined
}) {
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const selected = props.versions.find((v) => v.id === props.selectedId)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="max-w-[10rem] truncate md:max-w-[14rem]"
					title={t("documents.diff.compareWith")}
					data-testid="document-diff-version-selector"
				>
					<Clock className="size-3.5 shrink-0" />
					<span className="ml-1 truncate">
						{selected !== undefined
							? `v${selected.versionNo} · ${selected.title}`
							: t("documents.diff.selectVersion")}
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className={cn("doc w-72", props.themeClass)}
			>
				<DropdownMenuLabel>{t("documents.diff.compareWith")}</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={props.selectedId}
					onValueChange={(value) => props.onSelect(value)}
				>
					{props.versions.map((version) => (
						<DropdownMenuRadioItem key={version.id} value={version.id}>
							<div className="flex flex-col">
								<span className="truncate text-sm">
									v{version.versionNo} · {version.title}
								</span>
								<span className="text-xs text-muted-foreground">
									{formatter.formatDateTime(version.createdAt)}
									{version.message.length > 0 ? ` · ${version.message}` : ""}
								</span>
							</div>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
})
