import type { UsageExposureMode } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@hoardodile/ui/components/popover"
import { Tabs, TabsList, TabsTrigger } from "@hoardodile/ui/components/tabs"
import { cn } from "@hoardodile/ui/lib/utils"
import { SlidersHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { UsageRange } from "../lib/date"
import type { StatsSearch, StatsSearchPatch } from "../lib/statsSearch"
import { UsageCurrentDevice } from "./UsageCurrentDevice"
import { UsageDeviceFilter } from "./UsageDeviceFilter"
import { UsageExposureModeToggle } from "./UsageExposureModeToggle"

const RANGES: { value: UsageRange; labelKey: string }[] = [
	{ value: "today", labelKey: "usage.periods.today" },
	{ value: "last7days", labelKey: "usage.periods.last7days" },
	{ value: "thisWeek", labelKey: "usage.periods.thisWeek" },
	{ value: "thisMonth", labelKey: "usage.periods.thisMonth" },
	{ value: "thisYear", labelKey: "usage.periods.thisYear" },
	{ value: "all", labelKey: "usage.periods.all" },
]

type StatsToolbarProps = {
	readonly search: StatsSearch
	readonly knownDeviceIds: readonly string[]
	readonly onSearchChange: (patch: StatsSearchPatch) => void
}

export function StatsToolbar(props: StatsToolbarProps) {
	const { search, knownDeviceIds, onSearchChange } = props
	const { t } = useTranslation()

	const hasAdvancedFilters =
		search.device !== "all" || search.exposureMode !== "direct"

	return (
		<div
			className="sticky top-12 z-30 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6"
			data-testid="stats-toolbar"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<Tabs
					value={search.range}
					onValueChange={(value) => {
						onSearchChange({ range: value as UsageRange })
					}}
					className="min-w-0"
				>
					<TabsList className="h-auto w-full max-w-full flex-nowrap overflow-x-auto no-scrollbar justify-start gap-1">
						{RANGES.map((range) => (
							<TabsTrigger
								key={range.value}
								value={range.value}
								className="shrink-0 px-2.5 text-xs sm:text-sm"
							>
								{t(range.labelKey)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>

				<Popover>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className={cn(
								"shrink-0 gap-1.5 self-end sm:self-auto",
								hasAdvancedFilters && "border-primary/50",
							)}
							data-testid="stats-filters-trigger"
						>
							<SlidersHorizontal className="size-3.5" />
							{t("usage.stats.filtersTitle")}
							{hasAdvancedFilters ? (
								<span className="size-1.5 rounded-full bg-primary" />
							) : null}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-80">
						<PopoverHeader>
							<PopoverTitle>{t("usage.stats.filtersTitle")}</PopoverTitle>
						</PopoverHeader>
						<div className="flex flex-col gap-4">
							<UsageCurrentDevice />
							<div className="border-t" />
							<UsageDeviceFilter
								value={search.device}
								knownDeviceIds={knownDeviceIds}
								onChange={(device) => onSearchChange({ device })}
							/>
							<UsageExposureModeToggle
								value={search.exposureMode}
								onChange={(exposureMode: UsageExposureMode) =>
									onSearchChange({ exposureMode })
								}
							/>
							{search.exposureMode !== "direct" ? (
								<p className="text-xs text-muted-foreground">
									{t("usage.stats.exposureModeNote")}
								</p>
							) : null}
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	)
}
