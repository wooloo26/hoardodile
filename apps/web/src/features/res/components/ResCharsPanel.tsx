import { Button } from "@hoardodile/ui/components/button"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CharChipsPicker } from "@/features/char"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { invalidateResources, updateResourceMutation } from "../api"

export type ResCharactersPanelProps = {
	readonly resId: string
	readonly initialCharacterIds: readonly string[]
	readonly onSaved?: () => void
}

/**
 * Edit the characters associated with a single resource. Reuses
 * {@link CharChipsPicker} and sends the full id list via
 * `resource.update`; the server replaces the join rows atomically.
 */
export function ResCharactersPanel(props: ResCharactersPanelProps) {
	const { resId, initialCharacterIds, onSaved } = props
	const { t } = useTranslation()

	const [selected, setSelected] =
		useState<readonly string[]>(initialCharacterIds)

	const mutation = useSaveMutation({
		mutationOptions: updateResourceMutation(),
		invalidate: (qc) => invalidateResources(qc, resId),
		onSaved,
	})

	function handleSave() {
		mutation.mutate({ id: resId, charIds: selected })
	}

	return (
		<div className="flex flex-col gap-4">
			<div
				className="min-h-30 rounded border p-3"
				data-testid="character-picker-list"
			>
				<CharChipsPicker
					ids={selected}
					onChange={setSelected}
					testId="resource-characters-picker"
				/>
			</div>
			<div className="flex justify-end pt-2">
				<Button
					type="button"
					onClick={handleSave}
					disabled={mutation.isPending}
					data-testid="edit-characters-submit"
				>
					{mutation.isPending ? t("common.saving") : t("common.save")}
				</Button>
			</div>
		</div>
	)
}
