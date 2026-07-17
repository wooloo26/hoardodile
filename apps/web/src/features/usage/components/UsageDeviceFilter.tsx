import { cn } from "@hoardodile/ui/lib/utils"
import { useTranslation } from "react-i18next"
import { detectDeviceId, formatDeviceLabel } from "../detectDeviceId"

export type UsageDeviceFilterValue = "all" | string

export function usageDeviceFilterParam(
	device: UsageDeviceFilterValue,
): string | undefined {
	return device === "all" ? undefined : device
}

type UsageDeviceFilterProps = {
	readonly value: UsageDeviceFilterValue
	readonly knownDeviceIds: readonly string[]
	readonly onChange: (value: UsageDeviceFilterValue) => void
}

export function UsageDeviceFilter(props: UsageDeviceFilterProps) {
	const { value, knownDeviceIds, onChange } = props
	const { t } = useTranslation()
	const localDeviceId = detectDeviceId()

	const options: { value: UsageDeviceFilterValue; label: string }[] = [
		{ value: "all", label: t("usage.stats.deviceAll") },
		{
			value: localDeviceId,
			label: t("usage.stats.deviceLocal", {
				id: formatDeviceLabel(localDeviceId),
			}),
		},
	]

	for (const deviceId of knownDeviceIds) {
		if (deviceId === localDeviceId) continue
		options.push({
			value: deviceId,
			label: t("usage.stats.deviceNamed", {
				id: formatDeviceLabel(deviceId),
			}),
		})
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium text-muted-foreground">
				{t("usage.stats.deviceFilter")}
			</span>
			<div className="flex flex-wrap gap-2">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => onChange(option.value)}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
							value === option.value
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground hover:bg-muted/80",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	)
}
