import { Button } from "@hoardodile/ui/components/button"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { Label } from "@hoardodile/ui/components/label"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@hoardodile/ui/components/popover"
import { Slider } from "@hoardodile/ui/components/slider"
import { Switch } from "@hoardodile/ui/components/switch"
import { MessageSquareText } from "lucide-react"
import type { ReactNode } from "react"
import { useId } from "react"
import { useTranslation } from "../i18n"
import { isDanmakuArea } from "./helpers"
import { usePlayerPortalContainer } from "./PlayerPortalContext"
import { DANMAKU_AREA_PRESETS, type DanmakuSettings } from "./types"

const AREA_LABEL: Record<string, string> = {
	top: "player.danmakuAreaTop",
	middle: "player.danmakuAreaMiddle",
	bottom: "player.danmakuAreaBottom",
}

export function DanmakuSettingsPopover(props: {
	readonly settings: DanmakuSettings
	readonly onChange: (next: DanmakuSettings) => void
	/**
	 * Optional custom trigger element (e.g. an icon-and-label button
	 * for the feed header). When omitted falls back to the default
	 * icon-only trigger shared with the inline send bar.
	 */
	readonly trigger?: ReactNode
	readonly contentSide?: "top" | "bottom" | "left" | "right"
	readonly contentAlign?: "start" | "center" | "end"
}) {
	const { settings, onChange, trigger, contentSide, contentAlign } = props
	const { t } = useTranslation()
	const enabledId = useId()
	const portalContainer = usePlayerPortalContainer()
	return (
		<Popover>
			<PopoverTrigger asChild>
				{trigger ?? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={t("player.danmakuSettings")}
						data-active={settings.enabled ? "true" : "false"}
						className="size-9 rounded-full text-white/90 transition-none hover:bg-white/15 hover:text-white data-[active=true]:bg-primary/20 data-[active=true]:text-primary"
					>
						<MessageSquareText className="size-4.5" />
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent
				container={portalContainer}
				side={contentSide ?? "top"}
				align={contentAlign ?? "start"}
				className="w-72 space-y-4 p-4"
			>
				<div className="flex items-center justify-between">
					<Label htmlFor={enabledId} className="text-sm font-medium">
						{t("player.danmakuEnabled")}
					</Label>
					<Switch
						id={enabledId}
						checked={settings.enabled}
						onCheckedChange={(checked) => {
							onChange({ ...settings, enabled: checked })
						}}
					/>
				</div>
				<div className="space-y-2">
					<Label className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{t("player.danmakuOpacity")}</span>
						<span className="font-mono">
							{Math.round(settings.opacity * 100)}%
						</span>
					</Label>
					<Slider
						value={[settings.opacity]}
						min={0.1}
						max={1}
						step={0.05}
						onValueChange={(values) => {
							onChange({ ...settings, opacity: values[0] ?? settings.opacity })
						}}
					/>
				</div>
				<div className="space-y-2">
					<Label className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{t("player.danmakuFontSize")}</span>
						<span className="font-mono">{settings.fontSizePx}px</span>
					</Label>
					<Slider
						value={[settings.fontSizePx]}
						min={14}
						max={48}
						step={1}
						onValueChange={(values) => {
							onChange({
								...settings,
								fontSizePx: values[0] ?? settings.fontSizePx,
							})
						}}
					/>
				</div>
				<div className="space-y-2">
					<Label className="text-xs text-muted-foreground">
						{t("player.danmakuArea")}
					</Label>
					<DropdownSelect
						value={settings.area}
						onValueChange={(v) => {
							const next = isDanmakuArea(v) ? v : settings.area
							onChange({ ...settings, area: next })
						}}
						size="sm"
						triggerClassName="w-full"
						container={portalContainer}
						options={DANMAKU_AREA_PRESETS.map((preset) => ({
							value: preset,
							label: t(AREA_LABEL[preset] ?? preset),
						}))}
					/>
				</div>
			</PopoverContent>
		</Popover>
	)
}
