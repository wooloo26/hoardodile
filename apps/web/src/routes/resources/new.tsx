import {
	MAX_INTRO_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import { pluginManifestId as pluginManifestIdSchema } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { Checkbox } from "@hoardodile/ui/components/checkbox"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@hoardodile/ui/components/form"
import { Input } from "@hoardodile/ui/components/input"
import { Label } from "@hoardodile/ui/components/label"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@hoardodile/ui/components/tabs"
import { Textarea } from "@hoardodile/ui/components/textarea"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FileText, Folder, Image, Tag, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { ImageCropPanel } from "@/components/common/ImageCropPanel"
import type { CroppedImage } from "@/components/common/ImageCropper"
import { FixedActionBar } from "@/components/layout/FixedActionBar"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { CharChipsPicker } from "@/features/char"
import {
	attachResourceToCollectionMutation,
	ColPicker,
	colsForResourceQueryOptions,
} from "@/features/col"
import {
	pluginListAllQueryOptions,
	resolveManifestName,
} from "@/features/plugin"
import {
	createResourceWithUploadMutation,
	FileListEditor,
	type FileListEntry,
	FolderImporter,
	invalidateResources,
	resDetailQueryOptions,
	stageSingleFile,
} from "@/features/res"
import { UploadSection } from "@/features/res/upload/UploadSection"
import { useBatchResourceSubmit } from "@/features/res/upload/useBatchResourceSubmit"
import { useIncrementalStaging } from "@/features/res/upload/useIncrementalStaging"
import { uploadResCoverCropped } from "@/features/res/utils/coverCapture"
import { formatDateTime, useDatePrefs } from "@/features/settings/datePrefs"
import { CatTagPicker } from "@/features/tags"

const schema = z.object({
	name: z.string().max(MAX_NAME_LENGTH),
	intro: z.string().max(MAX_INTRO_LENGTH),
	contentPluginId: pluginManifestIdSchema.nullable(),
})

type FormValues = z.infer<typeof schema>

const searchSchema = z.object({
	charId: z.string().min(1).optional(),
	/**
	 * Pre-fill the form from an existing resource. Used by the "create
	 * similar resource" action so users can spin up a sibling without
	 * re-entering the same metadata. Only public fields are inherited;
	 * uploads still require the user to pick new files.
	 */
	cloneFrom: z.string().min(1).optional(),
})

export const Route = createFileRoute("/resources/new")({
	component: NewResourceRoute,
	validateSearch: searchSchema,
})

type UploadMode = "ordered" | "folder"

type NewResourceNameResolution = Readonly<{
	trimmedNameInput: string
	useFilenameAsName: boolean
	orderedFiles: readonly File[]
}>

function resolvedNameForNewResourceSubmission(
	resolution: NewResourceNameResolution,
): string | undefined {
	const typed = resolution.trimmedNameInput
	if (typed.length > 0) return typed
	if (!resolution.useFilenameAsName) return undefined
	const fname = resolution.orderedFiles[0]?.name
	if (fname === undefined) return undefined
	const base = basenameWithoutExt(fname).trim()
	return base.length > 0 ? base : undefined
}

function basenameWithoutExt(filename: string): string {
	const dot = filename.lastIndexOf(".")
	if (dot <= 0) return filename
	return filename.slice(0, dot)
}

function buildIdentityOrder(length: number): readonly number[] {
	return Array.from({ length }, (_, i) => i)
}

function NewResourceRoute() {
	const { t, i18n } = useTranslation()
	const { dateFormat, timeZone } = useDatePrefs()
	const qc = useQueryClient()
	const { charId: prefilledCharacterId, cloneFrom } = Route.useSearch()
	const [uploadMode, setUploadMode] = useState<UploadMode>("ordered")
	const [entries, setEntries] = useState<readonly FileListEntry[]>([])
	const [displayOrder, setDisplayOrder] = useState<readonly number[]>([])
	const [tagIds, setTagIds] = useState<readonly string[]>([])
	const [charIds, setCharacterIds] = useState<readonly string[]>(
		prefilledCharacterId !== undefined ? [prefilledCharacterId] : [],
	)
	// Collection IDs the user has chosen for the new resource. Pre-filled
	// from the clone source on first load (see effect below) but always
	// editable via the picker. After creation each id receives an
	// `attachResourceToCollection` call.
	const [selectedCollectionIds, setSelectedCollectionIds] = useState<
		readonly string[]
	>([])
	// Optional cover image. Cropped in the same ImageCropPanel used by the
	// character creation form; the cropped blob is uploaded after the
	// resource row is created.
	const [coverCrop, setCoverCrop] = useState<CroppedImage | undefined>(
		undefined,
	)
	const pluginListQuery = useQuery(pluginListAllQueryOptions())
	const pluginOptions = [
		{ value: "", label: t("resources.new.autoDetect") },
		...(pluginListQuery.data ?? []).map((p) => ({
			value: p.id,
			label: resolveManifestName(p.manifest, i18n.language),
		})),
	]

	const [progress, setProgress] = useState<number | undefined>(undefined)
	const [useFilenameAsName, setUseFilenameAsName] = useState(true)
	const [splitOrderedIntoResources, setSplitOrderedIntoResources] =
		useState(false)

	// Auto-staging state (non-batch mode)
	const { fileIds, fileProgresses, isStaging, stagingComplete } =
		useIncrementalStaging(entries)

	// Force-submit confirmation dialog
	const [forceSubmitOpen, setForceSubmitOpen] = useState(false)
	const pendingSubmitRef = useRef<FormValues | null>(null)

	const form = useForm<FormValues>({
		resolver: standardSchemaResolver(schema),
		defaultValues: {
			name: "",
			intro: "",
			contentPluginId: null,
		},
	})

	// Source-resource lookup for "create similar". Disabled when no
	// cloneFrom param so the standard /resources/new path stays a single
	// network request.
	const cloneDetailQuery = useQuery({
		...resDetailQueryOptions(cloneFrom ?? ""),
		enabled: cloneFrom !== undefined,
	})
	const cloneCollectionsQuery = useQuery({
		...colsForResourceQueryOptions(cloneFrom ?? ""),
		enabled: cloneFrom !== undefined,
	})

	useEffect(() => {
		if (cloneFrom === undefined) return
		const source = cloneDetailQuery.data
		if (source === undefined) return
		// Only seed the form once per source load; subsequent renders must
		// not clobber the user's edits.
		form.reset({
			name: source.name,
			intro: source.intro,
			contentPluginId: source.contentPluginId,
		})
		setTagIds(source.tagIds)
		setCharacterIds((existing) =>
			existing.length > 0 ? existing : source.charIds,
		)
	}, [cloneFrom, cloneDetailQuery.data, form])

	useEffect(() => {
		const cols = cloneCollectionsQuery.data
		if (cols === undefined) return
		// Only seed if the user hasn't picked anything yet, so an in-flight
		// query result doesn't clobber an explicit selection.
		setSelectedCollectionIds((existing) =>
			existing.length > 0 ? existing : cols.map((c) => c.id),
		)
	}, [cloneCollectionsQuery.data])

	const attachCollectionMut = useMutation(attachResourceToCollectionMutation())
	const createMut = useMutation(createResourceWithUploadMutation())

	async function finalizeNewResource(createdId: string): Promise<void> {
		const tasks: Promise<unknown>[] = []
		for (const colId of selectedCollectionIds) {
			tasks.push(
				attachCollectionMut.mutateAsync({
					colId,
					resId: createdId,
				}),
			)
		}
		if (coverCrop !== undefined) {
			tasks.push(uploadResCoverCropped(createdId, coverCrop, qc))
		}
		await Promise.all(tasks).catch(() => {
			// Per-attach / cover errors are non-fatal: the resource exists
			// and the user can still attach manually from the actions menu.
			toast.error(t("resources.new.errors.attachCollectionsFailed"))
		})
	}

	function defaultResourceName(): string {
		return formatDateTime(Date.now(), dateFormat, timeZone)
	}

	function resolveSubmittedResourceName(
		trimmedNameInput: string,
		activeFiles: readonly File[],
	): string {
		return (
			resolvedNameForNewResourceSubmission({
				trimmedNameInput,
				useFilenameAsName,
				orderedFiles: activeFiles,
			}) ?? defaultResourceName()
		)
	}

	function buildCreatePayload(
		files: readonly string[],
		values: FormValues,
		resolvedName: string,
	) {
		return {
			files,
			name: resolvedName,
			intro: values.intro.length > 0 ? values.intro : undefined,
			contentPluginId: values.contentPluginId ?? undefined,
			tagIds,
			charIds: charIds.length > 0 ? charIds : undefined,
		}
	}

	function orderedFilesFromEntries(
		entryList: readonly FileListEntry[],
	): readonly File[] {
		return entryList.map((e) => e.file)
	}

	const batchSubmit = useBatchResourceSubmit({
		entries,
		name: form.watch("name"),
		intro: form.watch("intro"),
		contentPluginId: form.watch("contentPluginId"),
		tagIds,
		charIds,
		selectedCollectionIds,
		coverCrop,
		useFilenameAsName,
		resolveResourceName: (name, _useFilenameAsName, file) =>
			resolveSubmittedResourceName(name, [file]),
		attachToCollection: (colId, resId) =>
			attachCollectionMut.mutateAsync({ colId, resId }),
		uploadCover:
			coverCrop !== undefined
				? (resId) => uploadResCoverCropped(resId, coverCrop, qc)
				: undefined,
		onSuccess: async () => {
			await invalidateResources(qc)
			toast.success(t("resources.new.createdCount", { count: entries.length }))
			setEntries([])
			setDisplayOrder([])
			setCoverCrop(undefined)
		},
		onError: (message) => {
			toast.error(message)
			toast.message(t("resources.new.errors.batchPartialHint"))
		},
	})

	async function onSubmit(values: FormValues) {
		const splitEachFile =
			uploadMode === "ordered" &&
			splitOrderedIntoResources &&
			entries.length >= 2

		if (splitEachFile) {
			await batchSubmit.submit()
			return
		}

		if (isStaging) {
			pendingSubmitRef.current = values
			setForceSubmitOpen(true)
			return
		}

		await executeSubmit(values)
	}

	async function executeSubmit(
		values: FormValues,
		overrideEntries?: readonly FileListEntry[],
	) {
		setForceSubmitOpen(false)
		pendingSubmitRef.current = null

		const activeEntries =
			overrideEntries ??
			displayOrder.map((i) => entries[i]).filter((e) => e !== undefined)

		if (activeEntries.length === 0) {
			toast.error(t("resources.new.errors.pickAtLeastOne"))
			return
		}

		// Use pre-staged fileIds when the file set has not been overridden.
		// When overridden (overrideEntries provided), the auto-staging hook
		// has been aborted for those entries, so we cannot reuse fileIds.
		let activeFiles: readonly string[]
		if (overrideEntries === undefined) {
			activeFiles = activeEntries
				.map((e) => fileIds[entries.indexOf(e)])
				.filter((id): id is string => typeof id === "string")
			if (activeFiles.length !== activeEntries.length) {
				toast.error(t("resources.new.errors.uploadFailed"))
				return
			}
		} else {
			// Override path: stage each file individually right now.
			try {
				setProgress(0)
				const staged: string[] = []
				const grandTotal = overrideEntries.reduce(
					(sum, e) => sum + Math.max(1, e.file.size),
					0,
				)
				let loaded = 0
				for (const entry of overrideEntries) {
					const { fileId } = await stageSingleFile({
						file: entry.file,
						onProgress: (p) => {
							if (p.total > 0 && grandTotal > 0) {
								setProgress((loaded + p.loaded) / grandTotal)
							}
						},
					})
					staged.push(fileId)
					loaded += Math.max(1, entry.file.size)
				}
				activeFiles = staged
			} catch (err) {
				setProgress(undefined)
				const message =
					err instanceof Error
						? err.message
						: t("resources.new.errors.uploadFailed")
				toast.error(message)
				return
			}
		}

		try {
			setProgress(1)
			const trimmedName = values.name.trim()
			const activeFileObjects = orderedFilesFromEntries(activeEntries)
			const resolvedName = resolveSubmittedResourceName(
				trimmedName,
				activeFileObjects,
			)
			const created = await createMut.mutateAsync(
				buildCreatePayload(activeFiles, values, resolvedName),
			)
			await finalizeNewResource(created.id)
			await invalidateResources(qc)
			toast.success(t("resources.new.created"))
			setEntries([])
			setDisplayOrder([])
			setCoverCrop(undefined)
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: t("resources.new.errors.uploadFailed")
			toast.error(message)
		} finally {
			setProgress(undefined)
		}
	}

	const submitting =
		createMut.isPending || batchSubmit.isSubmitting || progress !== undefined
	const hasPayload = entries.length > 0

	return (
		<PageScaffold className="max-w-3xl">
			<header className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
					<Upload className="size-5" />
				</div>
				<div>
					<h1 className="text-lg font-semibold">{t("resources.new.title")}</h1>
					<p className="text-xs text-muted-foreground">
						{t("resources.new.description")}
					</p>
				</div>
			</header>
			<Tabs
				value={uploadMode}
				onValueChange={(value) => {
					setUploadMode(value as UploadMode)
					if (value === "folder") setSplitOrderedIntoResources(false)
				}}
			>
				<TabsList className="w-full sm:w-auto">
					<TabsTrigger value="ordered" data-testid="upload-mode-ordered">
						<Upload className="mr-1 size-4" />
						{t("resources.new.uploadModes.ordered")}
					</TabsTrigger>
					<TabsTrigger value="folder" data-testid="upload-mode-folder">
						<Folder className="mr-1 size-4" />
						{t("resources.new.uploadModes.folder")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="ordered" className="pt-4">
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="flex flex-col gap-5 pb-24"
						>
							<FileListEditor
								entries={entries}
								displayOrder={displayOrder}
								onEntriesChange={(next) => {
									setEntries(next)
									setDisplayOrder(buildIdentityOrder(next.length))
								}}
								onOrderChange={setDisplayOrder}
								disabled={submitting}
								fileIds={fileIds}
								fileProgresses={fileProgresses}
								stagingComplete={stagingComplete}
							/>

							{entries.length >= 2 ? (
								<div className="flex flex-col gap-1">
									<label
										htmlFor="create-resource-one-file-per-resource"
										className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
									>
										<Checkbox
											id="create-resource-one-file-per-resource"
											checked={splitOrderedIntoResources}
											onCheckedChange={(v) =>
												setSplitOrderedIntoResources(v === true)
											}
											disabled={submitting}
											data-testid="create-resource-one-file-per-resource"
										/>
										<span>{t("resources.new.oneFilePerResource")}</span>
									</label>
									<p className="pl-6 text-xs text-muted-foreground">
										{t("resources.new.oneFilePerResourceHint")}
									</p>
								</div>
							) : undefined}

							<UploadSection
								icon={FileText}
								title={t("resources.new.basicInfo")}
								description={t("resources.new.basicDescription")}
								data-testid="create-resource-basic-section"
							>
								<div className="flex flex-col gap-4">
									<div className="grid gap-4 md:grid-cols-[1fr_160px]">
										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("resources.new.name")}</FormLabel>
													<FormControl>
														<Input
															{...field}
															data-testid="create-resource-name"
															autoComplete="off"
															placeholder={t("resources.new.namePlaceholder")}
															maxLength={MAX_NAME_LENGTH}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="contentPluginId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("resources.new.contentType")}
													</FormLabel>
													<FormControl>
														<DropdownSelect
															value={field.value ?? ""}
															onValueChange={(value) =>
																field.onChange(value === "" ? null : value)
															}
															data-testid="create-resource-content-type"
															triggerClassName="h-9 w-full rounded border bg-background px-2 text-sm"
															options={pluginOptions}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>

									<label
										htmlFor="create-resource-use-filename-name"
										className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
									>
										<Checkbox
											id="create-resource-use-filename-name"
											checked={useFilenameAsName}
											onCheckedChange={(v) => setUseFilenameAsName(v === true)}
											disabled={submitting}
											data-testid="create-resource-use-filename-name"
										/>
										<span>{t("resources.new.useFilenameAsName")}</span>
									</label>

									<FormField
										control={form.control}
										name="intro"
										render={({ field: _field }) => (
											<FormItem>
												<FormLabel>{t("resources.new.intro")}</FormLabel>
												<FormControl>
													<Textarea
														data-testid="create-resource-intro"
														rows={3}
														maxLength={MAX_INTRO_LENGTH}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</UploadSection>

							<UploadSection
								icon={Tag}
								title={t("resources.new.links")}
								description={t("resources.new.linksDescription")}
								data-testid="create-resource-links-section"
							>
								<div className="flex flex-col divide-y">
									<div className="flex flex-col gap-2 py-4 first:pt-0">
										<Label className="font-medium">
											{t("resources.new.tags")}
										</Label>
										<div data-testid="create-resource-tags">
											<CatTagPicker
												value={tagIds}
												onChange={setTagIds}
												kind="resource"
											/>
										</div>
									</div>

									<div className="flex flex-col gap-2 py-4">
										<Label className="font-medium">
											{t("resources.new.characters")}
										</Label>
										<div data-testid="create-resource-characters">
											<CharChipsPicker
												ids={charIds}
												onChange={setCharacterIds}
												testId="create-resource-characters-picker"
											/>
										</div>
									</div>

									<div className="flex flex-col gap-2 py-4 last:pb-0">
										<Label className="font-medium">
											{t("resources.new.collections")}
										</Label>
										<div data-testid="create-resource-collections">
											<ColPicker
												value={selectedCollectionIds}
												onChange={setSelectedCollectionIds}
											/>
										</div>
									</div>
								</div>
							</UploadSection>

							<UploadSection
								icon={Image}
								title={t("resources.new.cover")}
								description={t("resources.new.coverDescription")}
								data-testid="create-resource-cover-section"
							>
								<div className="flex flex-col gap-3">
									<ImageCropPanel
										previewShape="square"
										cropStageWidth={280}
										cropStageHeight={280}
										hideActionButton
										autoSaveOnCrop
										onSave={async (cropped) => {
											setCoverCrop(cropped)
										}}
									/>
								</div>
							</UploadSection>

							{progress !== undefined ? (
								<div
									className="flex flex-col gap-1"
									data-testid="create-resource-progress"
								>
									<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
										<div
											className="h-full bg-primary transition-[width] duration-200 ease-out"
											style={{ width: `${Math.round(progress * 100)}%` }}
										/>
									</div>
									<span className="text-right text-xs text-muted-foreground">
										{Math.round(progress * 100)}%
									</span>
								</div>
							) : undefined}

							<FixedActionBar>
								<Button
									type="submit"
									data-testid="create-resource-submit"
									disabled={submitting || !hasPayload}
								>
									{submitting || isStaging
										? t("resources.new.uploading")
										: t("resources.new.submit")}
								</Button>
							</FixedActionBar>
						</form>
					</Form>
				</TabsContent>

				<TabsContent value="folder" className="pt-4">
					<FolderImporter />
				</TabsContent>
			</Tabs>

			<ConfirmDialog
				open={forceSubmitOpen}
				onOpenChange={(open) => {
					if (!open) pendingSubmitRef.current = null
					setForceSubmitOpen(open)
				}}
				title={t("resources.new.forceSubmitTitle")}
				description={t("resources.new.forceSubmitDesc", {
					count:
						fileProgresses.length > 0
							? fileProgresses.filter((p) => p < 0.99).length
							: entries.length,
				})}
				confirmLabel={t("resources.new.forceSubmitConfirm")}
				isPending={false}
				onConfirm={() => {
					const values = pendingSubmitRef.current
					if (values === null) return
					pendingSubmitRef.current = null
					setForceSubmitOpen(false)
					const completedFinalOrder = displayOrder
						.map((i) => entries[i])
						.filter(
							(e, i): e is FileListEntry =>
								e !== undefined &&
								(fileProgresses[displayOrder[i] ?? -1] ?? 0) >= 0.99,
						)
					if (completedFinalOrder.length === 0) {
						toast.error(t("resources.new.errors.pickAtLeastOne"))
						return
					}
					void executeSubmit(values, completedFinalOrder)
				}}
			/>
		</PageScaffold>
	)
}
