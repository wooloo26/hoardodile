import type { TagFilterMode } from "@hoardodile/shared"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@hoardodile/ui/components/toggle-group"
import { useTranslation } from "react-i18next"

const MODE_OPTIONS = [
	{ value: "and" as const, tKey: "tags.filterMode.and" },
	{ value: "or" as const, tKey: "tags.filterMode.or" },
	{ value: "not" as const, tKey: "tags.filterMode.not" },
	{ value: "nor" as const, tKey: "tags.filterMode.nor" },
] as const

export type TagFilterModeToggleProps = {
	readonly mode: TagFilterMode
	readonly onModeChange: (mode: TagFilterMode) => void
}

/**
 * AND / OR / NOT match-mode selector for tag-based search filters.
 * Lives outside `CatTagPicker` so the picker can stay reusable in
 * non-search contexts (e.g. editing a resource's tags).
 */
export function TagFilterModeToggle(props: TagFilterModeToggleProps) {
	const { mode, onModeChange } = props
	const { t } = useTranslation()

	function handleModeChange(next: string) {
		if (isTagFilterMode(next)) {
			onModeChange(next)
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-sm text-muted-foreground">
				{t("tags.filterMode.label")}
			</span>
			<ToggleGroup
				type="single"
				value={mode}
				onValueChange={handleModeChange}
				variant="outline"
				size="sm"
				spacing={0}
				aria-label={t("tags.filterMode.label")}
			>
				{MODE_OPTIONS.map((opt) => (
					<ToggleGroupItem
						key={opt.value}
						value={opt.value}
						className="text-xs"
					>
						{t(opt.tKey)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	)
}

function isTagFilterMode(value: string): value is TagFilterMode {
	for (const option of MODE_OPTIONS) {
		if (option.value === value) return true
	}
	return false
}
