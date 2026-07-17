import {
	MAX_CHARACTER_INTRO_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import { Button } from "@hoardodile/ui/components/button"
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
import { Textarea } from "@hoardodile/ui/components/textarea"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FileText, Tag, User, Wand2 } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { ImageCropPanel } from "@/components/common/ImageCropPanel"
import type { CroppedImage } from "@/components/common/ImageCropper"
import { FixedActionBar } from "@/components/layout/FixedActionBar"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { createCharacterMutation, invalidateCharacters } from "@/features/char"
import { uploadCharImage } from "@/features/char/api"

import { TraitValueEditor } from "@/features/char/components/TraitValueEditor"
import { UploadSection } from "@/features/res/upload/UploadSection"
import { formatDateTime, useDatePrefs } from "@/features/settings/datePrefs"
import { CatTagPicker } from "@/features/tags"
import { traitListQueryOptions } from "@/features/traits"
import { mimeToImageExt } from "@/lib/mime"

const schema = z.object({
	name: z.string().max(MAX_NAME_LENGTH),
	intro: z.string().max(MAX_CHARACTER_INTRO_LENGTH),
})

type FormValues = z.infer<typeof schema>

export const Route = createFileRoute("/characters/new")({
	component: NewCharacterRoute,
})

function NewCharacterRoute() {
	const qc = useQueryClient()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const [tagIds, setTagIds] = useState<readonly string[]>([])
	const [traitDraft, setTraitDraft] = useState<Record<string, string>>({})
	const [avatarCrop, setAvatarCrop] = useState<CroppedImage | undefined>(
		undefined,
	)
	const [fullbodyCrop, setFullbodyCrop] = useState<CroppedImage | undefined>(
		undefined,
	)

	const traitsQ = useQuery(traitListQueryOptions())
	const traits = traitsQ.data ?? []
	const { dateFormat, timeZone } = useDatePrefs()

	const form = useForm<FormValues>({
		resolver: standardSchemaResolver(schema),
		defaultValues: { name: "", intro: "" },
	})

	const createMut = useMutation({
		...createCharacterMutation(),
	})

	async function onSubmit(values: FormValues) {
		const trimmedName = values.name.trim()
		const traitValues: Record<string, string> = {}
		for (const [k, v] of Object.entries(traitDraft)) {
			const trimmed = v.trim()
			if (trimmed.length > 0) traitValues[k] = trimmed
		}

		try {
			const character = await createMut.mutateAsync({
				name:
					trimmedName.length > 0
						? trimmedName
						: formatDateTime(Date.now(), dateFormat, timeZone),
				intro: values.intro.length > 0 ? values.intro : undefined,
				tagIds,
				traitValues:
					Object.keys(traitValues).length > 0 ? traitValues : undefined,
			})

			const uploads: Promise<unknown>[] = []
			if (avatarCrop !== undefined) {
				const ext = mimeToImageExt(avatarCrop.mimeType)
				uploads.push(
					uploadCharImage(
						character.id,
						"avatar",
						avatarCrop.blob,
						`avatar${ext}`,
					),
				)
			}
			if (fullbodyCrop !== undefined) {
				const ext = mimeToImageExt(fullbodyCrop.mimeType)
				uploads.push(
					uploadCharImage(
						character.id,
						"fullbody",
						fullbodyCrop.blob,
						`fullbody${ext}`,
					),
				)
			}
			if (uploads.length > 0) {
				await Promise.all(uploads)
			}

			await invalidateCharacters(qc)
			toast.success(t("characters.toast.createSuccess"))
			await navigate({
				to: "/characters/$id",
				params: { id: character.id },
			})
		} catch (err: unknown) {
			toast.error(
				err instanceof Error ? err.message : t("characters.toast.createFailed"),
			)
		}
	}

	return (
		<PageScaffold className="max-w-3xl">
			<header className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
					<User className="size-5" />
				</div>
				<div>
					<h1 className="text-lg font-semibold">
						{t("characters.new_.title")}
					</h1>
					<p className="text-xs text-muted-foreground">
						{t("characters.new_.description")}
					</p>
				</div>
			</header>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col gap-5 pb-24"
				>
					<UploadSection
						icon={FileText}
						title={t("characters.new_.basicInfo")}
						description={t("characters.new_.basicDescription")}
						data-testid="create-character-basic-section"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("characters.new_.name")}</FormLabel>
										<FormControl>
											<Input
												{...field}
												data-testid="create-character-name"
												autoComplete="off"
												placeholder={t("characters.new_.namePlaceholder")}
												maxLength={MAX_NAME_LENGTH}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="intro"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("characters.new_.intro")}</FormLabel>
										<FormControl>
											<Textarea
												{...field}
												data-testid="create-character-intro"
												rows={3}
												maxLength={MAX_CHARACTER_INTRO_LENGTH}
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
						title={t("characters.new_.links")}
						description={t("characters.new_.linksDescription")}
						data-testid="create-character-links-section"
					>
						<div className="flex flex-col divide-y">
							<div className="flex flex-col gap-2 py-4 first:pt-0">
								<Label className="font-medium">
									{t("characters.new_.tags")}
								</Label>
								<div data-testid="create-character-tags">
									<CatTagPicker
										value={tagIds}
										onChange={setTagIds}
										kind="character"
									/>
								</div>
							</div>

							<div className="flex flex-col gap-2 py-4 last:pb-0">
								<Label className="font-medium">
									{t("characters.new_.traits")}
								</Label>
								<TraitValueEditor
									traits={traits}
									values={traitDraft}
									onChange={setTraitDraft}
								/>
							</div>
						</div>
					</UploadSection>

					<UploadSection
						icon={Wand2}
						title={t("characters.new_.appearance")}
						description={t("characters.new_.appearanceDescription")}
						data-testid="create-character-appearance-section"
					>
						<div className="flex flex-col divide-y">
							<div className="flex flex-col gap-2 py-4 first:pt-0">
								<Label className="font-medium">
									{t("characters.new_.avatar")}
								</Label>
								<ImageCropPanel
									aspect={1}
									previewShape="circle"
									cropStageWidth={200}
									cropStageHeight={200}
									hideActionButton
									autoSaveOnCrop
									onSave={async (cropped) => {
										setAvatarCrop(cropped)
									}}
								/>
							</div>

							<div className="flex flex-col gap-2 py-4 last:pb-0">
								<Label className="font-medium">
									{t("characters.new_.fullbody")}
								</Label>
								<ImageCropPanel
									previewShape="square"
									cropStageWidth={260}
									cropStageHeight={500}
									hideActionButton
									autoSaveOnCrop
									onSave={async (cropped) => {
										setFullbodyCrop(cropped)
									}}
								/>
							</div>
						</div>
					</UploadSection>

					<FixedActionBar>
						<Button
							type="submit"
							data-testid="create-character-submit"
							disabled={createMut.isPending}
						>
							{createMut.isPending
								? t("characters.new_.submitting")
								: t("characters.new_.submit")}
						</Button>
					</FixedActionBar>
				</form>
			</Form>
		</PageScaffold>
	)
}
