import type { ResCard as ResCardData } from "@hoardodile/schemas"
import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { useQueryClient } from "@tanstack/react-query"
import type { CroppedImage } from "@/components/common/ImageCropper"
import { ImageEditPanel } from "@/components/common/ImageEditPanel"
import { useEditHubSectionTitle } from "@/components/common/useEditHubSectionTitle"
import { apiPaths } from "@/lib/paths"
import { invalidateResources } from "../api"
import { uploadResCoverCropped } from "../utils/coverCapture"
import { ResCharactersPanel } from "./ResCharsPanel"
import { ResEditPanel } from "./ResEditPanel"

/**
 * Standalone edit dialogs for a resource, opened from the card actions
 * submenu.
 */

function useSectionTitle(name: string, sectionKey: string): string {
	return useEditHubSectionTitle({
		hubKey: "resources.editHub.title",
		name,
		sectionKey,
	})
}

export type ResBasicEditDialogProps = {
	readonly open: boolean
	readonly resource: ResCardData
	readonly onOpenChange: (open: boolean) => void
}

export function ResBasicEditDialog(props: ResBasicEditDialogProps) {
	const { open, resource, onOpenChange } = props
	const title = useSectionTitle(resource.name, "resources.actions.editBasic")
	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			contentClassName="sm:max-w-2xl"
		>
			<ResEditPanel resource={resource} onSaved={() => onOpenChange(false)} />
		</AppDialog>
	)
}

export type ResCharactersEditDialogProps = {
	readonly open: boolean
	readonly resource: ResCardData
	readonly onOpenChange: (open: boolean) => void
}

export function ResCharactersEditDialog(props: ResCharactersEditDialogProps) {
	const { open, resource, onOpenChange } = props
	const title = useSectionTitle(
		resource.name,
		"resources.actions.editCharacters",
	)
	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			contentClassName="sm:max-w-3xl"
		>
			<ResCharactersPanel
				resId={resource.id}
				initialCharacterIds={resource.charIds}
				onSaved={() => onOpenChange(false)}
			/>
		</AppDialog>
	)
}

export type ResCoverEditDialogProps = {
	readonly open: boolean
	readonly resId: string
	readonly resName: string
	readonly onOpenChange: (open: boolean) => void
}

export function ResCoverEditDialog(props: ResCoverEditDialogProps) {
	const { open, resId, resName, onOpenChange } = props
	const title = useSectionTitle(resName, "resources.actions.editCover")
	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			contentClassName="sm:max-w-2xl"
		>
			<ResCoverPanel resId={resId} onSaved={() => onOpenChange(false)} />
		</AppDialog>
	)
}

function ResCoverPanel(props: {
	readonly resId: string
	readonly onSaved?: () => void
}) {
	const { resId, onSaved } = props
	const qc = useQueryClient()

	async function handleSave(cropped: CroppedImage) {
		await uploadResCoverCropped(resId, cropped, qc)
	}

	return (
		<ImageEditPanel
			mimeType="image/png"
			cropStageWidth={280}
			cropStageHeight={280}
			previewWidth={280}
			previewHeight={280}
			showPreviewSwitch
			onSave={handleSave}
			onSaved={onSaved}
			deleteUrl={apiPaths.resources.cover(resId)}
			onInvalidate={async () => invalidateResources(qc, resId)}
			onDeleted={onSaved}
			deleteTestId="resource-cover-delete"
		/>
	)
}
