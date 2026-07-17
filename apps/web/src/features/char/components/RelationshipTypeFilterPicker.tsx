import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import { relationshipTypesQueryOptions } from "../api"

export type RelationshipTypeFilterPickerProps = {
	readonly value: readonly string[]
	readonly onChange: (ids: readonly string[]) => void
}

export function RelationshipTypeFilterPicker(
	props: RelationshipTypeFilterPickerProps,
) {
	const { value, onChange } = props
	const { t } = useTranslation()
	const typesQ = useQuery(relationshipTypesQueryOptions())
	const types = typesQ.data ?? []
	const selected = new Set(value)

	function toggleType(typeId: string) {
		if (selected.has(typeId)) {
			onChange(value.filter((id) => id !== typeId))
			return
		}
		onChange([...value, typeId])
	}

	if (types.length === 0) return null

	return (
		<div
			className="flex items-center text-sm"
			data-testid="character-relationship-filter"
		>
			<span className="shrink-0 text-muted-foreground mr-2">
				{t("characters.relationshipFilter.label")}
			</span>
			<div className="flex flex-wrap gap-1.5">
				{types.map((type) => (
					<TagPickerChip
						key={type.id}
						active={selected.has(type.id)}
						color={type.color}
						className="cursor-pointer"
						onClick={() => toggleType(type.id)}
						data-testid={`character-relationship-filter-${type.id}`}
					>
						{type.name}
					</TagPickerChip>
				))}
			</div>
		</div>
	)
}
