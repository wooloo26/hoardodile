import { MAX_RELATIONSHIP_TYPE_NAME_LENGTH } from "@hoardodile/consts/text-limits"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@hoardodile/ui/components/tabs"
import { useTranslation } from "react-i18next"
import { EntityMetaFields } from "@/components/common/EntityMetaFields"
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import {
	PRESET_RELATIONSHIP_TYPES,
	type PresetLabelResolver,
	type PresetRelationshipType,
	resolvePresetLabels,
} from "../constants/presetRelationshipTypes"
import { RelationshipTypeChipLabel } from "./RelationshipKindBadge"
import type { RelationshipTypeFormDraft } from "./RelationshipTypeFormFields"
import { RelationshipTypeVisualEditor } from "./RelationshipTypeVisualEditor"

type Props = {
	readonly draft: RelationshipTypeFormDraft
	readonly onChange: (patch: Partial<RelationshipTypeFormDraft>) => void
	readonly nameTestId?: string
	readonly metaTestIdPrefix?: string
	readonly showPresets?: boolean
	readonly selectedPresetKey?: PresetRelationshipType["key"] | null
	readonly onFillPreset?: (preset: PresetRelationshipType) => void
	readonly resolvePresetLabel?: PresetLabelResolver
}

export function RelationshipTypeDialogBody(props: Props) {
	const {
		draft,
		onChange,
		nameTestId,
		metaTestIdPrefix,
		showPresets = false,
		selectedPresetKey = null,
		onFillPreset,
		resolvePresetLabel,
	} = props
	const { t } = useTranslation()

	return (
		<Tabs defaultValue="details" className="w-full">
			<TabsList className="w-full">
				<TabsTrigger
					value="details"
					data-testid="relationship-type-tab-details"
				>
					{t("relationshipTypes.panel.tabDetails")}
				</TabsTrigger>
				<TabsTrigger
					value="definition"
					data-testid="relationship-type-tab-definition"
				>
					{t("relationshipTypes.panel.tabDefinition")}
				</TabsTrigger>
			</TabsList>
			<TabsContent value="details" className="pt-4">
				<EntityMetaFields
					value={draft}
					onChange={onChange}
					maxNameLength={MAX_RELATIONSHIP_TYPE_NAME_LENGTH}
					testIdPrefix={metaTestIdPrefix}
					nameTestId={nameTestId}
				/>
			</TabsContent>
			<TabsContent value="definition" className="pt-4">
				<div className="flex flex-col gap-4">
					{showPresets && onFillPreset !== undefined && resolvePresetLabel ? (
						<div className="flex flex-col gap-2">
							<h4 className="text-xs font-medium text-muted-foreground">
								{t("relationshipTypes.presetSection")}
							</h4>
							<div className="flex flex-wrap gap-1.5">
								{PRESET_RELATIONSHIP_TYPES.map((preset) => {
									const labels = resolvePresetLabels(preset, resolvePresetLabel)
									return (
										<TagPickerChip
											key={preset.key}
											active={selectedPresetKey === preset.key}
											onClick={() => onFillPreset(preset)}
											title={t("relationshipTypes.fillPreset")}
											data-testid={`relationship-preset-${preset.key}`}
										>
											<RelationshipTypeChipLabel
												name={labels.name}
												kind={preset.kind}
											/>
										</TagPickerChip>
									)
								})}
							</div>
						</div>
					) : null}
					<RelationshipTypeVisualEditor draft={draft} onChange={onChange} />
				</div>
			</TabsContent>
		</Tabs>
	)
}
