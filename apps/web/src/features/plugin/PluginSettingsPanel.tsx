import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { PluginManifest } from "@hoardodile/schemas"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { Label } from "@hoardodile/ui/components/label"
import { Switch } from "@hoardodile/ui/components/switch"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { keyBy } from "es-toolkit"
import {
	Database,
	Eraser,
	GripVertical,
	MoreVertical,
	Palette,
	Pin,
	RefreshCw,
	RotateCcw,
	Settings2,
	Upload,
} from "lucide-react"
import {
	type ChangeEvent,
	type CSSProperties,
	useEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ColorPicker } from "@/components/common/ColorPicker"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useConfirmDialog } from "@/components/common/useConfirmDialog"
import { broadcastToAll } from "@/features/plugin/iframe/iframe-pool"
import {
	hydrateSystemPrefs,
	invalidateSystemPrefsHydration,
} from "@/features/prefs/prefSyncHydrator"
import { Icon, parseIconRef } from "@/features/res/template/template-icons"
import { hostPushKeys } from "@/lib/keys"
import { broadcastPrefSyncDelete } from "@/lib/prefSync"
import { prefSyncStore } from "@/lib/prefSyncStore"
import type { RouterOutputs } from "@/trpc/client"
import {
	renderSearchKindIcon,
	renderSearchKindLabel,
	resolveManifestDescription,
	resolveManifestName,
} from "./manifestText"
import { PluginPermissionBadges } from "./PluginPermissionBadges"
import {
	pluginCacheRemoveAllByPluginMutation,
	pluginCacheRemoveAllMutation,
	pluginKeys,
	pluginListAllQueryOptions,
	pluginPrefRemoveAllByPluginMutation,
	pluginPrefRemoveAllMutation,
	pluginReorderMutation,
	pluginRescanMutation,
	pluginUpdateMutation,
	systemPrefRemoveAllMutation,
	uploadPlugin,
} from "./pluginApi"
import { previewPluginZip } from "./previewPluginZip"

export function PluginSettingsPanel() {
	const { t, i18n } = useTranslation()
	const qc = useQueryClient()
	const listQuery = useQuery(pluginListAllQueryOptions())
	const updateMut = useMutation({
		...pluginUpdateMutation(),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: pluginKeys.all })
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})
	const reorderMut = useMutation({
		...pluginReorderMutation(),
		onMutate: async ({ ids }) => {
			await qc.cancelQueries({ queryKey: pluginKeys.listAll() })
			const previous = qc.getQueryData<RouterOutputs["plugin"]["listAll"]>(
				pluginKeys.listAll(),
			)
			if (previous !== undefined) {
				qc.setQueryData(pluginKeys.listAll(), reorderListByIds(previous, ids))
			}
			return { previous }
		},
		onError: (err, _input, ctx) => {
			if (ctx?.previous !== undefined) {
				qc.setQueryData(pluginKeys.listAll(), ctx.previous)
			}
			void qc.invalidateQueries({ queryKey: pluginKeys.all })
			toast.error(err.message)
		},
	})
	const rescanMut = useMutation({
		...pluginRescanMutation(),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: pluginKeys.all })
			toast.success(t("plugins.rescanSuccess"))
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const sysPrefResetMut = useMutation({
		...systemPrefRemoveAllMutation(),
		onSuccess: () => {
			for (const key of prefSyncStore.keys()) {
				prefSyncStore.delete(key)
				try {
					localStorage.removeItem(key)
				} catch {}
				broadcastPrefSyncDelete(key)
			}
			invalidateSystemPrefsHydration()
			void hydrateSystemPrefs()
			broadcastToAll({ type: "push", key: hostPushKeys.prefsChanged })
			toast.success(t("plugins.resetSystemPrefSuccess"))
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const pluginPrefResetAllMut = useMutation({
		...pluginPrefRemoveAllMutation(),
		onSuccess: () => {
			broadcastToAll({ type: "push", key: hostPushKeys.prefsChanged })
			toast.success(t("plugins.resetAllPluginPrefSuccess"))
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const pluginCacheClearAllMut = useMutation({
		...pluginCacheRemoveAllMutation(),
		onSuccess: () => {
			broadcastToAll({ type: "push", key: hostPushKeys.cacheChanged })
			toast.success(t("plugins.clearAllPluginCacheSuccess"))
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const plugins = listQuery.data ?? []

	const nonBuiltinPlugins = plugins.filter((p) => !p.builtin)
	const builtinPlugins = plugins.filter((p) => p.builtin)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	)

	const resetSysPrefConfirm = useConfirmDialog<true>()
	const resetAllPluginPrefConfirm = useConfirmDialog<true>()
	const clearAllPluginCacheConfirm = useConfirmDialog<true>()
	const installConfirm = useConfirmDialog<{
		file: File
		manifest: PluginManifest
	}>()

	function handleToggleEnabled(id: string, enabled: boolean) {
		updateMut.mutate({ id, enabled })
	}

	function handleSaveAppearance(
		id: string,
		patch: { readonly pinned: boolean; readonly color: string },
	) {
		updateMut.mutate({ id, ...patch })
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (over === null || active.id === over.id) return
		const currentIds = nonBuiltinPlugins.map((p) => p.id)
		const oldIndex = currentIds.indexOf(String(active.id))
		const newIndex = currentIds.indexOf(String(over.id))
		if (oldIndex < 0 || newIndex < 0) return
		const nextIds = arrayMove([...currentIds], oldIndex, newIndex)
		reorderMut.mutate({ ids: nextIds })
	}

	function handleRescan() {
		rescanMut.mutate(undefined)
	}

	const [isUploading, setUploading] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	function handleUploadClick() {
		fileInputRef.current?.click()
	}

	async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (file === undefined) return
		// Reset immediately so picking the same file again (e.g. after
		// cancelling the dialog) re-triggers onChange.
		if (fileInputRef.current !== null) {
			fileInputRef.current.value = ""
		}
		// Preview the manifest and ask for explicit consent first: a plugin
		// is server-side code, so installing must never be one-click.
		try {
			const manifest = await previewPluginZip(file)
			installConfirm.open({ file, manifest })
		} catch {
			toast.error(t("plugins.uploadInvalidPlugin"))
		}
	}

	async function handleInstallConfirm() {
		const target = installConfirm.target
		if (target === undefined) return
		setUploading(true)
		try {
			const form = new FormData()
			form.append("archive", target.file)
			await uploadPlugin(form)
			await qc.invalidateQueries({ queryKey: pluginKeys.all })
			toast.success(t("plugins.uploadPluginSuccess"))
			installConfirm.close()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t("common.error"))
		} finally {
			setUploading(false)
		}
	}

	function resolvePluginName(manifest: PluginManifest): string {
		return resolveManifestName(manifest, i18n.language)
	}

	function resolvePluginDescription(manifest: PluginManifest): string {
		return resolveManifestDescription(manifest, i18n.language)
	}

	if (listQuery.isPending) {
		return (
			<p className="text-sm text-muted-foreground">{t("common.loading")}</p>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			{nonBuiltinPlugins.length > 0 ? (
				<section>
					<h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{t("plugins.installed")}
					</h3>
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={nonBuiltinPlugins.map((p) => p.id)}
							strategy={verticalListSortingStrategy}
						>
							<div className="flex flex-col gap-2">
								{nonBuiltinPlugins.map((plugin) => (
									<SortablePluginItem
										key={plugin.id}
										plugin={plugin}
										resolveName={(manifest) => resolvePluginName(manifest)}
										resolveDescription={(manifest) =>
											resolvePluginDescription(manifest)
										}
										onToggleEnabled={handleToggleEnabled}
										onSaveAppearance={handleSaveAppearance}
										disabled={reorderMut.isPending}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				</section>
			) : null}

			{builtinPlugins.length > 0 ? (
				<section>
					<h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{t("plugins.builtinPlugins")}
					</h3>
					<div className="flex flex-col gap-2">
						{builtinPlugins.map((plugin) => (
							<PluginItemCard
								key={plugin.id}
								plugin={plugin}
								resolveName={(manifest) => resolvePluginName(manifest)}
								resolveDescription={(manifest) =>
									resolvePluginDescription(manifest)
								}
								onToggleEnabled={handleToggleEnabled}
								onSaveAppearance={handleSaveAppearance}
							/>
						))}
					</div>
				</section>
			) : null}

			<section>
				<h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{t("plugins.actions")}
				</h3>
				<div className="flex flex-wrap items-center gap-2">
					<input
						ref={fileInputRef}
						type="file"
						accept=".zip"
						className="hidden"
						onChange={handleFileChange}
						data-testid="plugin-upload-input"
					/>
					<Button
						variant="secondary"
						size="sm"
						onClick={handleUploadClick}
						disabled={isUploading}
						className="gap-2"
						data-testid="plugin-upload"
					>
						<Upload className="size-4" />
						{isUploading ? t("plugins.uploading") : t("plugins.uploadPlugin")}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={handleRescan}
						disabled={rescanMut.isPending}
						className="gap-2"
						data-testid="plugin-rescan"
					>
						<RefreshCw
							className={`size-4 ${rescanMut.isPending ? "animate-spin" : ""}`}
						/>
						{t("plugins.rescan")}
					</Button>
				</div>
			</section>

			<section>
				<h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{t("plugins.dangerZone")}
				</h3>
				<div className="rounded-xl bg-destructive/5 p-1">
					<div className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-destructive/10">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
								<Settings2 className="size-4" />
							</div>
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium">
									{t("plugins.resetSystemPref")}
								</span>
								<p className="text-xs text-muted-foreground">
									{t("plugins.resetSystemPrefDescription")}
								</p>
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0 text-destructive hover:bg-destructive/10"
							onClick={() => resetSysPrefConfirm.open(true)}
							disabled={sysPrefResetMut.isPending}
						>
							{sysPrefResetMut.isPending
								? t("common.working")
								: t("plugins.reset")}
						</Button>
					</div>

					<div className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-destructive/10">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
								<RotateCcw className="size-4" />
							</div>
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium">
									{t("plugins.resetAllPluginPref")}
								</span>
								<p className="text-xs text-muted-foreground">
									{t("plugins.resetAllPluginPrefDescription")}
								</p>
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0 text-destructive hover:bg-destructive/10"
							onClick={() => resetAllPluginPrefConfirm.open(true)}
							disabled={pluginPrefResetAllMut.isPending}
						>
							{pluginPrefResetAllMut.isPending
								? t("common.working")
								: t("plugins.reset")}
						</Button>
					</div>

					<div className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-destructive/10">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
								<Database className="size-4" />
							</div>
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium">
									{t("plugins.clearAllPluginCache")}
								</span>
								<p className="text-xs text-muted-foreground">
									{t("plugins.clearAllPluginCacheDescription")}
								</p>
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0 text-destructive hover:bg-destructive/10"
							onClick={() => clearAllPluginCacheConfirm.open(true)}
							disabled={pluginCacheClearAllMut.isPending}
						>
							{pluginCacheClearAllMut.isPending
								? t("common.working")
								: t("plugins.clear")}
						</Button>
					</div>
				</div>
			</section>

			<ConfirmDialog
				open={resetSysPrefConfirm.isOpen}
				onOpenChange={resetSysPrefConfirm.onOpenChange}
				title={t("plugins.resetSystemPrefConfirmTitle")}
				description={t("plugins.resetSystemPrefConfirmDescription")}
				confirmLabel={t("plugins.reset")}
				pendingLabel={t("common.working")}
				isPending={sysPrefResetMut.isPending}
				destructive
				onConfirm={() => sysPrefResetMut.mutate(undefined)}
			/>

			<ConfirmDialog
				open={resetAllPluginPrefConfirm.isOpen}
				onOpenChange={resetAllPluginPrefConfirm.onOpenChange}
				title={t("plugins.resetAllPluginPrefConfirmTitle")}
				description={t("plugins.resetAllPluginPrefConfirmDescription")}
				confirmLabel={t("plugins.reset")}
				pendingLabel={t("common.working")}
				isPending={pluginPrefResetAllMut.isPending}
				destructive
				onConfirm={() => pluginPrefResetAllMut.mutate(undefined)}
			/>

			<ConfirmDialog
				open={clearAllPluginCacheConfirm.isOpen}
				onOpenChange={clearAllPluginCacheConfirm.onOpenChange}
				title={t("plugins.clearAllPluginCacheConfirmTitle")}
				description={t("plugins.clearAllPluginCacheConfirmDescription")}
				confirmLabel={t("plugins.clear")}
				pendingLabel={t("common.working")}
				isPending={pluginCacheClearAllMut.isPending}
				destructive
				onConfirm={() => pluginCacheClearAllMut.mutate(undefined)}
			/>

			<ConfirmDialog
				open={installConfirm.isOpen}
				onOpenChange={installConfirm.onOpenChange}
				title={t("plugins.installConfirmTitle")}
				confirmLabel={t("plugins.install")}
				pendingLabel={t("plugins.uploading")}
				isPending={isUploading}
				onConfirm={() => void handleInstallConfirm()}
				confirmTestId="plugin-install-confirm"
				body={
					installConfirm.target !== undefined ? (
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium">
									{resolveManifestName(
										installConfirm.target.manifest,
										i18n.language,
									)}
									<span className="ml-2 text-xs font-normal text-muted-foreground">
										v{installConfirm.target.manifest.version}
									</span>
								</span>
								<span className="font-mono text-xs text-muted-foreground">
									{installConfirm.target.manifest.id}
								</span>
							</div>
							<PluginPermissionBadges
								permissions={installConfirm.target.manifest.permissions}
							/>
							<p className="text-xs leading-relaxed text-muted-foreground">
								{t("plugins.installConfirmRisk")}
							</p>
						</div>
					) : undefined
				}
			/>
		</div>
	)
}

function PluginAppearanceDialog(props: {
	readonly plugin: {
		readonly id: string
		readonly manifest: PluginManifest
		readonly pinned: boolean
		readonly color: string
	}
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly onSave: (patch: {
		readonly pinned: boolean
		readonly color: string
	}) => void
}) {
	const { plugin, open, onOpenChange, onSave } = props
	const { t, i18n } = useTranslation()
	const [draft, setDraft] = useState({
		pinned: plugin.pinned,
		color: plugin.color,
	})

	useEffect(() => {
		if (open) setDraft({ pinned: plugin.pinned, color: plugin.color })
	}, [open, plugin.pinned, plugin.color])

	const footer = (
		<>
			<Button variant="outline" onClick={() => onOpenChange(false)}>
				{t("common.cancel")}
			</Button>
			<Button
				type="button"
				onClick={() => {
					onSave(draft)
					onOpenChange(false)
				}}
			>
				{t("common.save")}
			</Button>
		</>
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("plugins.appearanceTitle", {
				name: resolveManifestName(plugin.manifest, i18n.language),
			})}
			description={t("plugins.appearanceDescription")}
			footer={footer}
			contentClassName="sm:max-w-md"
		>
			<div className="flex flex-col gap-4 py-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("plugins.color")}</Label>
					<ColorPicker
						value={draft.color}
						onChange={(color) => setDraft((d) => ({ ...d, color }))}
					/>
				</div>
				<Label
					htmlFor="plugin-appearance-pin"
					className="inline-flex w-fit items-center gap-2 py-2"
				>
					<Pin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
					<span className="text-sm">{t("plugins.pin")}</span>
					<Switch
						id="plugin-appearance-pin"
						checked={draft.pinned}
						onCheckedChange={(pinned) => setDraft((d) => ({ ...d, pinned }))}
						size="sm"
					/>
				</Label>
			</div>
		</AppDialog>
	)
}

function reorderListByIds(
	rows: Readonly<RouterOutputs["plugin"]["listAll"]>,
	ids: readonly string[],
): RouterOutputs["plugin"]["listAll"] {
	const nonBuiltin = rows.filter((r) => !r.builtin)
	const builtin = rows.filter((r) => r.builtin)
	const byId = keyBy(nonBuiltin, (r) => r.id)
	const reordered: typeof nonBuiltin = []
	for (const id of ids) {
		const r = byId[id]
		if (r !== undefined) reordered.push(r)
	}
	return [...reordered, ...builtin]
}

function SortablePluginItem(props: {
	readonly plugin: {
		readonly id: string
		readonly manifest: PluginManifest
		readonly enabled: boolean
		readonly pinned: boolean
		readonly color: string
		readonly missing: boolean
		readonly builtin: boolean
		readonly dev: boolean
	}
	readonly resolveName: (manifest: PluginManifest) => string
	readonly resolveDescription: (manifest: PluginManifest) => string
	readonly onToggleEnabled: (id: string, enabled: boolean) => void
	readonly onSaveAppearance: (
		id: string,
		patch: { readonly pinned: boolean; readonly color: string },
	) => void
	readonly disabled: boolean
}) {
	const {
		plugin,
		resolveName,
		resolveDescription,
		onToggleEnabled,
		onSaveAppearance,
		disabled,
	} = props
	const { t, i18n } = useTranslation()

	const iconRef =
		plugin.manifest.icon !== undefined
			? parseIconRef(plugin.manifest.icon, plugin.id)
			: undefined
	const kinds = plugin.manifest.ui?.search?.kinds ?? []

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: plugin.id,
		disabled: disabled,
		transition: null,
	})

	const style: CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
		zIndex: isDragging ? 10 : undefined,
	}

	const prefResetMut = useMutation({
		...pluginPrefRemoveAllByPluginMutation(),
		onSuccess: () => {
			broadcastToAll({ type: "push", key: hostPushKeys.prefsChanged })
			toast.success(
				t("plugins.resetPluginPrefSuccess", {
					name: resolveName(plugin.manifest),
				}),
			)
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const cacheClearMut = useMutation({
		...pluginCacheRemoveAllByPluginMutation(),
		onSuccess: () => {
			broadcastToAll({ type: "push", key: hostPushKeys.cacheChanged })
			toast.success(
				t("plugins.clearPluginCacheSuccess", {
					name: resolveName(plugin.manifest),
				}),
			)
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const resetConfirm = useConfirmDialog<"pref" | "cache">()
	const [appearanceOpen, setAppearanceOpen] = useState(false)

	function handleResetPref() {
		resetConfirm.open("pref")
	}

	function handleClearCache() {
		resetConfirm.open("cache")
	}

	return (
		<>
			<div
				ref={setNodeRef}
				style={style}
				className={`flex items-center gap-3 rounded-lg bg-muted/40 p-3 transition-colors ${isDragging ? "opacity-50 shadow-md" : "hover:bg-muted/60"}`}
				data-testid={`plugin-row-${plugin.id}`}
			>
				<button
					type="button"
					className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:opacity-30"
					disabled={disabled}
					aria-label={t("plugins.dragToReorder")}
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-3.5" />
				</button>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						{iconRef !== undefined ? (
							<Icon icon={iconRef} className="size-6 shrink-0" />
						) : null}
						<span className="truncate text-sm font-medium">
							{resolveName(plugin.manifest)}
						</span>
						<span className="text-xs text-muted-foreground">
							v{plugin.manifest.version}
						</span>
						{plugin.dev ? (
							<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
								{t("plugins.dev")}
							</span>
						) : null}
						{plugin.missing ? (
							<span className="text-xs text-destructive">
								{t("plugins.missing")}
							</span>
						) : null}
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{resolveDescription(plugin.manifest)}
					</p>
					<PluginPermissionBadges
						className="mt-1"
						permissions={plugin.manifest.permissions}
					/>
					{kinds.length > 0 ? (
						<div className="mt-1 flex flex-wrap gap-1.5">
							{kinds.map((kind) => {
								const kindIcon = renderSearchKindIcon({
									kind,
									manifest: plugin.manifest,
									pluginId: plugin.id,
									locale: i18n.language,
									iconClassName: "h-3.5 w-3.5",
								})
								return (
									<span
										key={kind.key}
										className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
									>
										{kindIcon !== undefined ? kindIcon : null}
										{renderSearchKindLabel(
											kind,
											plugin.manifest,
											plugin.id,
											i18n.language,
										)}
									</span>
								)
							})}
						</div>
					) : null}
				</div>

				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8 shrink-0"
								data-testid={`plugin-menu-${plugin.id}`}
							>
								<MoreVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setAppearanceOpen(true)}>
								<Palette className="size-4" />
								{t("plugins.appearance")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleResetPref}
								disabled={prefResetMut.isPending}
							>
								<RotateCcw className="size-4" />
								{t("plugins.resetPluginPref")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleClearCache}
								disabled={cacheClearMut.isPending}
							>
								<Eraser className="size-4" />
								{t("plugins.clearPluginCache")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<Switch
						checked={plugin.enabled}
						onCheckedChange={(checked) => onToggleEnabled(plugin.id, checked)}
						aria-label={t("plugins.enableToggle")}
						data-testid={`plugin-toggle-${plugin.id}`}
					/>
				</div>
			</div>

			<PluginAppearanceDialog
				plugin={plugin}
				open={appearanceOpen}
				onOpenChange={setAppearanceOpen}
				onSave={(patch) => onSaveAppearance(plugin.id, patch)}
			/>

			<ConfirmDialog
				open={resetConfirm.isOpen}
				onOpenChange={resetConfirm.onOpenChange}
				title={
					resetConfirm.target === "pref"
						? t("plugins.resetPluginPrefConfirmTitle", {
								name: resolveName(plugin.manifest),
							})
						: t("plugins.clearPluginCacheConfirmTitle", {
								name: resolveName(plugin.manifest),
							})
				}
				description={
					resetConfirm.target === "pref"
						? t("plugins.resetPluginPrefConfirmDescription", {
								name: resolveName(plugin.manifest),
							})
						: t("plugins.clearPluginCacheConfirmDescription", {
								name: resolveName(plugin.manifest),
							})
				}
				confirmLabel={
					resetConfirm.target === "pref"
						? t("plugins.reset")
						: t("plugins.clear")
				}
				pendingLabel={t("common.working")}
				isPending={
					resetConfirm.target === "pref"
						? prefResetMut.isPending
						: cacheClearMut.isPending
				}
				destructive
				onConfirm={() => {
					if (resetConfirm.target === "pref") {
						prefResetMut.mutate({ pluginId: plugin.id })
					} else {
						cacheClearMut.mutate({ pluginId: plugin.id })
					}
				}}
			/>
		</>
	)
}

function PluginItemCard(props: {
	readonly plugin: {
		readonly id: string
		readonly manifest: PluginManifest
		readonly enabled: boolean
		readonly pinned: boolean
		readonly color: string
		readonly missing: boolean
		readonly builtin: boolean
		readonly dev: boolean
	}
	readonly resolveName: (manifest: PluginManifest) => string
	readonly resolveDescription: (manifest: PluginManifest) => string
	readonly onToggleEnabled: (id: string, enabled: boolean) => void
	readonly onSaveAppearance: (
		id: string,
		patch: { readonly pinned: boolean; readonly color: string },
	) => void
}) {
	const {
		plugin,
		resolveName,
		resolveDescription,
		onToggleEnabled,
		onSaveAppearance,
	} = props
	const { t, i18n } = useTranslation()

	const iconRef =
		plugin.manifest.icon !== undefined
			? parseIconRef(plugin.manifest.icon, plugin.id)
			: undefined
	const kinds = plugin.manifest.ui?.search?.kinds ?? []

	const prefResetMut = useMutation({
		...pluginPrefRemoveAllByPluginMutation(),
		onSuccess: () => {
			broadcastToAll({ type: "push", key: hostPushKeys.prefsChanged })
			toast.success(
				t("plugins.resetPluginPrefSuccess", {
					name: resolveName(plugin.manifest),
				}),
			)
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const cacheClearMut = useMutation({
		...pluginCacheRemoveAllByPluginMutation(),
		onSuccess: () => {
			broadcastToAll({ type: "push", key: hostPushKeys.cacheChanged })
			toast.success(
				t("plugins.clearPluginCacheSuccess", {
					name: resolveName(plugin.manifest),
				}),
			)
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	const resetConfirm = useConfirmDialog<"pref" | "cache">()
	const [appearanceOpen, setAppearanceOpen] = useState(false)

	function handleResetPref() {
		resetConfirm.open("pref")
	}

	function handleClearCache() {
		resetConfirm.open("cache")
	}

	return (
		<>
			<div
				className="flex items-center gap-3 rounded-lg bg-muted/40 p-3 transition-colors hover:bg-muted/60"
				data-testid={`plugin-row-${plugin.id}`}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						{iconRef !== undefined ? (
							<Icon icon={iconRef} className="size-6 shrink-0" />
						) : null}
						<span className="truncate text-sm font-medium">
							{resolveName(plugin.manifest)}
						</span>
						<span className="text-xs text-muted-foreground">
							v{plugin.manifest.version}
						</span>
						<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
							{t("plugins.builtin")}
						</span>
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{resolveDescription(plugin.manifest)}
					</p>
					<PluginPermissionBadges
						className="mt-1"
						permissions={plugin.manifest.permissions}
					/>
					{kinds.length > 0 ? (
						<div className="mt-1 flex flex-wrap gap-1.5">
							{kinds.map((kind) => {
								const kindIcon = renderSearchKindIcon({
									kind,
									manifest: plugin.manifest,
									pluginId: plugin.id,
									locale: i18n.language,
									iconClassName: "h-3.5 w-3.5",
								})
								return (
									<span
										key={kind.key}
										className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
									>
										{kindIcon !== undefined ? kindIcon : null}
										{renderSearchKindLabel(
											kind,
											plugin.manifest,
											plugin.id,
											i18n.language,
										)}
									</span>
								)
							})}
						</div>
					) : null}
				</div>

				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8 shrink-0"
								data-testid={`plugin-menu-${plugin.id}`}
							>
								<MoreVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setAppearanceOpen(true)}>
								<Palette className="size-4" />
								{t("plugins.appearance")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleResetPref}
								disabled={prefResetMut.isPending}
							>
								<RotateCcw className="size-4" />
								{t("plugins.resetPluginPref")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleClearCache}
								disabled={cacheClearMut.isPending}
							>
								<Eraser className="size-4" />
								{t("plugins.clearPluginCache")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<Switch
						checked={plugin.enabled}
						onCheckedChange={(checked) => onToggleEnabled(plugin.id, checked)}
						disabled={plugin.builtin}
						aria-label={t("plugins.enableToggle")}
						data-testid={`plugin-toggle-${plugin.id}`}
					/>
				</div>
			</div>

			<PluginAppearanceDialog
				plugin={plugin}
				open={appearanceOpen}
				onOpenChange={setAppearanceOpen}
				onSave={(patch) => onSaveAppearance(plugin.id, patch)}
			/>

			<ConfirmDialog
				open={resetConfirm.isOpen}
				onOpenChange={resetConfirm.onOpenChange}
				title={
					resetConfirm.target === "pref"
						? t("plugins.resetPluginPrefConfirmTitle", {
								name: resolveName(plugin.manifest),
							})
						: t("plugins.clearPluginCacheConfirmTitle", {
								name: resolveName(plugin.manifest),
							})
				}
				description={
					resetConfirm.target === "pref"
						? t("plugins.resetPluginPrefConfirmDescription", {
								name: resolveName(plugin.manifest),
							})
						: t("plugins.clearPluginCacheConfirmDescription", {
								name: resolveName(plugin.manifest),
							})
				}
				confirmLabel={
					resetConfirm.target === "pref"
						? t("plugins.reset")
						: t("plugins.clear")
				}
				pendingLabel={t("common.working")}
				isPending={
					resetConfirm.target === "pref"
						? prefResetMut.isPending
						: cacheClearMut.isPending
				}
				destructive
				onConfirm={() => {
					if (resetConfirm.target === "pref") {
						prefResetMut.mutate({ pluginId: plugin.id })
					} else {
						cacheClearMut.mutate({ pluginId: plugin.id })
					}
				}}
			/>
		</>
	)
}
