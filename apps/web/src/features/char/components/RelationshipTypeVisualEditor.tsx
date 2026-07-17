import { MAX_RELATIONSHIP_LABEL_LENGTH } from "@hoardodile/consts/text-limits"
import type { RelationshipKind } from "@hoardodile/schemas"
import { Input } from "@hoardodile/ui/components/input"
import { Label } from "@hoardodile/ui/components/label"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { useTranslation } from "react-i18next"
import { RelationshipKindIcon } from "./RelationshipKindBadge"
import type { RelationshipTypeFormDraft } from "./RelationshipTypeFormFields"
import { RelationshipTypePreviewDiagram } from "./RelationshipTypePreviewDiagram"

const KIND_OPTIONS: readonly RelationshipKind[] = [
	"directed",
	"symmetric",
	"hierarchical",
]

type Props = {
	readonly draft: RelationshipTypeFormDraft
	readonly onChange: (patch: Partial<RelationshipTypeFormDraft>) => void
}

export function RelationshipTypeVisualEditor(props: Props) {
	const { draft, onChange } = props
	const { t } = useTranslation()

	return (
		<div className="flex flex-col gap-4 py-1">
			<RelationshipTypePreviewDiagram draft={draft} />

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs text-muted-foreground">
						{t("relationshipTypes.preview.aCallsB")}
					</Label>
					<Input
						className="h-10"
						placeholder={t("relationshipTypes.preview.labelPlaceholder")}
						value={draft.selfLabel}
						onChange={(e) => onChange({ selfLabel: e.target.value })}
						maxLength={MAX_RELATIONSHIP_LABEL_LENGTH}
						data-testid="relationship-type-self-label"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs text-muted-foreground">
						{t("relationshipTypes.preview.bCallsA")}
					</Label>
					<Input
						className="h-10"
						placeholder={t("relationshipTypes.preview.labelPlaceholder")}
						value={draft.targetLabel}
						onChange={(e) => onChange({ targetLabel: e.target.value })}
						maxLength={MAX_RELATIONSHIP_LABEL_LENGTH}
						data-testid="relationship-type-target-label"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					value={draft.kind}
					onValueChange={(value) => {
						if (value.length === 0) return
						const kind = value as RelationshipKind
						onChange({
							kind,
							hierarchyFrom:
								kind === "hierarchical" ? "self" : draft.hierarchyFrom,
						})
					}}
					className="grid w-full grid-cols-3"
					data-testid="relationship-type-kind-toggle"
				>
					{KIND_OPTIONS.map((option) => (
						<ToggleGroupItem
							key={option}
							value={option}
							className="min-w-0! flex h-auto flex-col gap-0.5 px-1 py-2 text-xs"
							aria-label={t(`relationshipTypes.kind.${option}.label`)}
						>
							<RelationshipKindIcon kind={option} className="size-4" />
							<span className="max-w-full truncate whitespace-nowrap">
								{t(`relationshipTypes.kind.${option}.iconLabel`)}
							</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<p className="text-xs text-muted-foreground">
					{t(`relationshipTypes.kind.${draft.kind}.hint`)}
				</p>
			</div>
		</div>
	)
}
