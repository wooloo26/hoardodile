import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { useTranslation } from "react-i18next"
import {
	DATE_FORMAT_PRESETS,
	type DateFormatPreset,
	DEFAULT_DATE_FORMAT,
	DEFAULT_TIME_ZONE,
	TIMEZONE_PRESETS,
	type TimeZonePreset,
	useDatePrefs,
} from "./datePrefs"

/**
 * Settings panel for choosing the global date/time display format and
 * timezone. Both preferences are persisted via prefSync so they survive
 * reloads and sync to the server.
 */
export function DateTimeSettingsPanel() {
	const { t } = useTranslation()
	const { dateFormat, setDateFormat, timeZone, setTimeZone } = useDatePrefs()

	function handleFormatChange(next: string) {
		if (isDateFormatPreset(next)) setDateFormat(next)
	}

	function handleTimeZoneChange(next: string) {
		if (isTimeZonePreset(next)) setTimeZone(next)
	}

	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-3">
				<h3 className="text-xs font-medium text-muted-foreground">
					{t("dateTime.formatLabel")}
				</h3>
				<DropdownSelect
					value={dateFormat}
					onValueChange={handleFormatChange}
					options={DATE_FORMAT_PRESETS.map((preset) => ({
						value: preset.value,
						label: t(preset.labelKey),
					}))}
					placeholder={t("dateTime.formatLabel")}
					aria-label={t("dateTime.formatLabel")}
					data-testid="date-format-select"
				/>
			</section>
			<section className="flex flex-col gap-3">
				<h3 className="text-xs font-medium text-muted-foreground">
					{t("dateTime.timeZoneLabel")}
				</h3>
				<DropdownSelect
					value={timeZone}
					onValueChange={handleTimeZoneChange}
					options={TIMEZONE_PRESETS.map((preset) => ({
						value: preset.value,
						label:
							preset.value === "local"
								? t(preset.labelKey)
								: `${t(preset.labelKey)} (${preset.value})`,
					}))}
					placeholder={t("dateTime.timeZoneLabel")}
					aria-label={t("dateTime.timeZoneLabel")}
					data-testid="time-zone-select"
				/>
			</section>
		</div>
	)
}

function isDateFormatPreset(value: string): value is DateFormatPreset {
	for (const preset of DATE_FORMAT_PRESETS) {
		if (preset.value === value) return true
	}
	return value === DEFAULT_DATE_FORMAT
}

function isTimeZonePreset(value: string): value is TimeZonePreset {
	for (const preset of TIMEZONE_PRESETS) {
		if (preset.value === value) return true
	}
	return value === DEFAULT_TIME_ZONE
}
