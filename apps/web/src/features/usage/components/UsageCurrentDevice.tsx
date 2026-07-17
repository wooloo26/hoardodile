import { Monitor, Smartphone, Tablet, Tv } from "lucide-react"
import { useTranslation } from "react-i18next"
import { detectDeviceInfo } from "../detectDeviceInfo"

const DEVICE_TYPE_ICONS = {
	desktop: Monitor,
	mobile: Smartphone,
	tablet: Tablet,
	tv: Tv,
	unknown: Monitor,
}

export function UsageCurrentDevice() {
	const { t } = useTranslation()
	const info = detectDeviceInfo()
	const DeviceIcon = DEVICE_TYPE_ICONS[info.deviceType]

	function label(key: string, value: string): string {
		const translated = t(`usage.stats.currentDevice.${key}.${value}`, {
			defaultValue: value,
		})
		return translated === value
			? t(`usage.stats.currentDevice.${key}.unknown`, { defaultValue: value })
			: translated
	}

	return (
		<div className="flex flex-col gap-2" data-testid="usage-current-device">
			<span className="text-xs font-medium text-muted-foreground">
				{t("usage.stats.currentDevice.title")}
			</span>
			<div className="flex items-center gap-2">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
					<DeviceIcon className="size-4 text-muted-foreground" />
				</div>
				<div className="flex min-w-0 flex-col">
					<span className="truncate text-sm font-medium">
						{label("deviceType", info.deviceType)}
						{info.os !== "unknown" ? (
							<span className="text-muted-foreground">
								{" · "}
								{label("os", info.os)}
								{info.osVersion ? ` ${info.osVersion}` : null}
							</span>
						) : null}
					</span>
					<span className="truncate text-xs text-muted-foreground">
						{info.browser !== "unknown" ? label("browser", info.browser) : null}
						{info.browser !== "unknown" && info.browserVersion
							? ` ${info.browserVersion}`
							: null}
						{info.appVersion ? (
							<span className="text-muted-foreground">
								{" · "}
								{t("usage.stats.currentDevice.appVersion", {
									version: info.appVersion,
								})}
							</span>
						) : null}
					</span>
				</div>
			</div>
			<span className="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
				{t("usage.stats.currentDevice.channelLabel")}:{" "}
				{label("channel", info.channel)}
			</span>
		</div>
	)
}
