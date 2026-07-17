import type { TraitDef } from "@hoardodile/schemas"
import { parseTraitValue, TraitParseError } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { traitListQueryOptions } from "@/features/traits"
import { useSaveMutation } from "@/hooks/useSaveMutation"
import { invalidateCharacters, setCharacterTraitValuesMutation } from "../api"
import { TraitValueEditor } from "./TraitValueEditor"

export type CharTraitValuesPanelProps = {
	readonly charId: string
	readonly traitValues: Readonly<Record<string, string>>
	readonly onSaved?: () => void
}

/**
 * Per-character editor for trait *values*. Only traits that already have a
 * value are listed; the user can press the add button to pick an unset trait
 * and fill in its value. Empty/whitespace values are rejected on the client
 * and by the server.
 */
export function CharTraitValuesPanel(props: CharTraitValuesPanelProps) {
	const { charId, traitValues, onSaved } = props
	const { t } = useTranslation()
	const listQuery = useQuery(traitListQueryOptions())
	const traits: readonly TraitDef[] = listQuery.data ?? []

	const [draft, setDraft] = useState<Record<string, string>>(() => ({
		...traitValues,
	}))

	const saveMut = useSaveMutation({
		mutationOptions: setCharacterTraitValuesMutation(),
		invalidate: (qc) => invalidateCharacters(qc, charId),
		onSaved,
	})

	function handleSave() {
		const cleaned: Record<string, string> = {}
		for (const td of traits) {
			const v = (draft[td.id] ?? "").trim()
			if (v.length > 0) cleaned[td.id] = v
		}
		const empties = Object.keys(draft).filter(
			(id) =>
				traits.find((t) => t.id === id) !== undefined &&
				(draft[id] ?? "").trim().length === 0,
		)
		if (empties.length > 0) {
			const names = empties
				.map((id) => traits.find((t) => t.id === id)?.name ?? id)
				.join("、")
			toast.error(t("traits.values.emptyError", { names }))
			return
		}
		for (const td of traits) {
			const raw = cleaned[td.id]
			if (raw === undefined) continue
			try {
				parseTraitValue(td.kind, raw)
			} catch (err) {
				if (err instanceof TraitParseError) {
					toast.error(
						t("traits.values.parseError", {
							name: td.name,
							value: raw,
						}),
					)
					return
				}
				throw err
			}
		}
		saveMut.mutate({ id: charId, traitValues: cleaned })
	}

	return (
		<div className="flex flex-col gap-4">
			<TraitValueEditor
				traits={traits}
				values={draft}
				onChange={setDraft}
				testIdPrefix="character-trait"
			/>
			<div className="flex justify-end pt-2">
				<Button
					type="button"
					onClick={handleSave}
					disabled={saveMut.isPending || traits.length === 0}
					data-testid="character-trait-values-save"
				>
					{saveMut.isPending ? t("common.saving") : t("common.save")}
				</Button>
			</div>
		</div>
	)
}
