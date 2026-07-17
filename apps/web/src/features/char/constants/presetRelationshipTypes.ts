import type {
	HierarchyFrom,
	RelationshipKind,
	RelationshipType,
} from "@hoardodile/schemas"

export type PresetRelationshipTypeKey = "friend" | "mentor" | "unrequited"

export type PresetRelationshipType = {
	readonly key: PresetRelationshipTypeKey
	readonly kind: RelationshipKind
	readonly hierarchyFrom: HierarchyFrom | null
}

export const PRESET_RELATIONSHIP_TYPES: readonly PresetRelationshipType[] = [
	{
		key: "friend",
		kind: "symmetric",
		hierarchyFrom: null,
	},
	{
		key: "mentor",
		kind: "hierarchical",
		hierarchyFrom: "self",
	},
	{
		key: "unrequited",
		kind: "directed",
		hierarchyFrom: null,
	},
]

export type PresetRelationshipLabels = {
	readonly name: string
	readonly selfLabel: string
	readonly targetLabel: string
}

export type PresetLabelResolver = (
	key: PresetRelationshipTypeKey,
	field: "name" | "selfLabel" | "targetLabel",
) => string

/** Resolve localized labels for a preset template. */
export function resolvePresetLabels(
	preset: PresetRelationshipType,
	resolve: PresetLabelResolver,
): PresetRelationshipLabels {
	return {
		name: resolve(preset.key, "name"),
		selfLabel: resolve(preset.key, "selfLabel"),
		targetLabel: resolve(preset.key, "targetLabel"),
	}
}

/** True when a type with the same localized name already exists. */
export function isPresetAlreadyAdded(
	preset: PresetRelationshipType,
	types: readonly RelationshipType[],
	resolve: PresetLabelResolver,
): boolean {
	const { name } = resolvePresetLabels(preset, resolve)
	return types.some((type) => type.name === name)
}

export type CreateRelationshipTypeFromPresetInput = {
	readonly name: string
	readonly selfLabel: string
	readonly targetLabel: string
	readonly kind: RelationshipKind
	readonly hierarchyFrom: HierarchyFrom | null
}

/** Build the payload for `createRelationshipType` from a preset + labels. */
export function buildCreateTypeInputFromPreset(
	preset: PresetRelationshipType,
	labels: PresetRelationshipLabels,
): CreateRelationshipTypeFromPresetInput {
	return {
		name: labels.name,
		selfLabel: labels.selfLabel,
		targetLabel: labels.targetLabel,
		kind: preset.kind,
		hierarchyFrom: preset.hierarchyFrom,
	}
}
