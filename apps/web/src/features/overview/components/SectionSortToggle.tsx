import type { SortBy } from "@hoardodile/shared"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { useTranslation } from "react-i18next"

type SectionSortToggleProps = {
	readonly sortBy: SortBy
	readonly onChange: (sortBy: SortBy) => void
	readonly testId?: string
}

export function SectionSortToggle(props: SectionSortToggleProps) {
	const { t } = useTranslation()
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			value={props.sortBy}
			onValueChange={(v) => {
				if (v === "created" || v === "updated") props.onChange(v)
			}}
			data-testid={props.testId}
		>
			{(["created", "updated"] as const).map((value) => (
				<ToggleGroupItem
					key={value}
					value={value}
					className="h-6 px-2 text-xs"
					data-testid={props.testId ? `${props.testId}-${value}` : undefined}
				>
					{t(`overview.sort.${value}`)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}
