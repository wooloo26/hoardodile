import { cn } from "@hoardodile/ui/lib/utils"
import { useTranslation } from "react-i18next"

import type { UsageRange } from "../lib/date"

const RANGES: { value: UsageRange; labelKey: string }[] = [
	{ value: "today", labelKey: "usage.periods.today" },
	{ value: "last7days", labelKey: "usage.periods.last7days" },
	{ value: "thisWeek", labelKey: "usage.periods.thisWeek" },
	{ value: "thisMonth", labelKey: "usage.periods.thisMonth" },
	{ value: "thisYear", labelKey: "usage.periods.thisYear" },
	{ value: "all", labelKey: "usage.periods.all" },
]

export type UsagePeriodSelectorProps = {
	readonly value: UsageRange
	readonly onChange: (value: UsageRange) => void
}

export function UsagePeriodSelector(props: UsagePeriodSelectorProps) {
	const { value, onChange } = props
	const { t } = useTranslation()

	return (
		<div className="flex flex-wrap gap-2">
			{RANGES.map((range) => (
				<button
					key={range.value}
					type="button"
					onClick={() => onChange(range.value)}
					className={cn(
						"rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
						value === range.value
							? "bg-primary text-primary-foreground"
							: "bg-muted text-muted-foreground hover:bg-muted/80",
					)}
				>
					{t(range.labelKey)}
				</button>
			))}
		</div>
	)
}
