import {
	MAX_INTRO_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import type { Resource } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
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
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import {
	pluginListAllQueryOptions,
	resolveManifestName,
} from "@/features/plugin"
import {
	invalidateResources,
	setResourceContentPluginIdMutation,
	updateResourceMutation,
} from "../api"

type FormValues = {
	readonly name: string
	readonly intro: string
	readonly contentPluginId: string
}

export type ResEditPanelProps = {
	readonly resource: Resource
	readonly onSaved?: () => void
}

/**
 * Edit basic information (name and intro) plus content type for a
 * resource. Tags are edited separately via the tag panel.
 */
export function ResEditPanel(props: ResEditPanelProps) {
	const { resource, onSaved } = props
	const qc = useQueryClient()
	const { t, i18n } = useTranslation()
	const schema = useMemo(
		() =>
			z.object({
				name: z
					.string()
					.min(1, t("resources.editPanel.nameRequired"))
					.max(MAX_NAME_LENGTH),
				intro: z.string().max(MAX_INTRO_LENGTH),
				contentPluginId: z.string().min(1),
			}),
		[t],
	)
	const form = useForm<FormValues>({
		resolver: standardSchemaResolver(schema),
		defaultValues: {
			name: resource.name,
			intro: resource.intro,
			contentPluginId: resource.contentPluginId ?? "",
		},
	})

	const pluginListQuery = useQuery(pluginListAllQueryOptions())
	const pluginOptions = (pluginListQuery.data ?? []).map((p) => ({
		value: p.id,
		label: resolveManifestName(p.manifest, i18n.language),
	}))

	const updateMut = useMutation({
		...updateResourceMutation(),
		onSuccess: async () => {
			await invalidateResources(qc, resource.id)
			toast.success(t("common.saved"))
			onSaved?.()
		},
		onError: (err) => {
			toast.error(err.message || t("common.saveFailed"))
		},
	})

	const setContentPluginIdMut = useMutation({
		...setResourceContentPluginIdMutation(),
		onSuccess: async (result) => {
			if (result.ok) {
				await invalidateResources(qc, resource.id)
			}
		},
	})

	async function handleSubmit(values: FormValues) {
		if (values.contentPluginId !== resource.contentPluginId) {
			try {
				const result = await setContentPluginIdMut.mutateAsync({
					id: resource.id,
					contentPluginId: values.contentPluginId,
				})
				if (!result.ok) {
					form.setError("contentPluginId", {
						message: t("resources.editDialog.contentTypeMissing", {
							names: result.failure.reasons.join(", "),
						}),
					})
					return
				}
			} catch (err) {
				toast.error(
					err instanceof Error
						? err.message
						: t("resources.editDialog.toast.contentTypeFailed"),
				)
				return
			}
		}
		updateMut.mutate({
			id: resource.id,
			name: values.name,
			intro: values.intro,
		})
	}

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(handleSubmit)}
				className="flex flex-col gap-4"
				aria-label={t("resources.editDialog.aria")}
			>
				<FormField
					control={form.control}
					name="contentPluginId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("resources.editDialog.contentType")}</FormLabel>
							<FormControl>
								<DropdownSelect
									value={field.value ?? ""}
									onValueChange={field.onChange}
									triggerClassName="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
									data-testid="edit-content-type"
									options={pluginOptions}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("resources.editDialog.name")}</FormLabel>
							<FormControl>
								<Input
									{...field}
									data-testid="edit-name"
									autoComplete="off"
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
							<FormLabel>{t("resources.editDialog.intro")}</FormLabel>
							<FormControl>
								<Input
									{...field}
									data-testid="edit-intro"
									autoComplete="off"
									maxLength={MAX_INTRO_LENGTH}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="flex justify-end pt-2">
					<Button
						type="submit"
						disabled={updateMut.isPending || setContentPluginIdMut.isPending}
						data-testid="edit-submit"
					>
						{updateMut.isPending || setContentPluginIdMut.isPending
							? t("common.saving")
							: t("common.save")}
					</Button>
				</div>
			</form>
		</Form>
	)
}
