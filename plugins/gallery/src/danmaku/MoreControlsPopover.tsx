import { Button } from "@hoardodile/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@hoardodile/ui/components/popover"
import { Switch } from "@hoardodile/ui/components/switch"
import { Camera, Ellipsis, PictureInPicture2 } from "lucide-react"
import { useTranslation } from "../i18n"
import { usePlayerPortalContainer } from "./PlayerPortalContext"
import { RateSelect } from "./RateSelect"
import { FIT_MODES, type FitMode, type PlayerEngine } from "./types"

const FIT_LABEL: Record<string, string> = {
	fill: "player.fitFill",
	contain: "player.fitContain",
	cover: "player.fitCover",
}

type Props = {
	readonly rate: number
	readonly engine: PlayerEngine
	readonly fitMode: FitMode
	readonly autoplay: boolean
	readonly onRateChange: (rate: number) => void
	readonly onApplyRate: (rate: number) => void
	readonly onScreenshot: () => void
	readonly onTogglePip: () => void
	readonly onEngineChange: (next: PlayerEngine) => void
	readonly onFitModeChange: (next: FitMode) => void
	readonly onAutoplayChange: (next: boolean) => void
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}

export function MoreControlsPopover(props: Props) {
	const {
		rate,
		engine,
		fitMode,
		autoplay,
		onRateChange,
		onApplyRate,
		onScreenshot,
		onTogglePip,
		onEngineChange,
		onFitModeChange,
		onAutoplayChange,
		open,
		onOpenChange,
	} = props
	const { t } = useTranslation()
	const portalContainer = usePlayerPortalContainer()
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={t("player.more")}
					className="size-9 rounded-full text-white/90 transition-none hover:bg-white/15 hover:text-white"
				>
					<Ellipsis className="size-4.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				container={portalContainer}
				side="top"
				align="end"
				className="flex w-64 flex-col gap-3 p-3"
				onInteractOutside={(e) => {
					// The nested rate DropdownMenu renders its content in a
					// Radix portal that lives outside this popover's DOM
					// subtree. Without this guard, touching a rate option on
					// mobile would register as an outside interaction and
					// close the surrounding popover before the menu handled
					// the tap, dismissing both layers and losing the rate
					// change.
					const target = e.target
					if (
						target instanceof Element &&
						target.closest("[data-radix-menu-content]") !== null
					) {
						e.preventDefault()
					}
				}}
			>
				<RowItem label={t("player.speed")}>
					<RateSelect
						rate={rate}
						onChange={onRateChange}
						onApply={onApplyRate}
					/>
				</RowItem>
				<RowItem label={t("player.autoplay")}>
					<Switch
						checked={autoplay}
						onCheckedChange={onAutoplayChange}
						aria-label={t("player.autoplay")}
					/>
				</RowItem>
				<OptionGroup label={t("player.fit")}>
					{FIT_MODES.map((m) => (
						<OptionPill
							key={m}
							active={fitMode === m}
							onClick={() => onFitModeChange(m)}
							label={t(FIT_LABEL[m] ?? m)}
						/>
					))}
				</OptionGroup>
				<OptionGroup label={t("player.engine")}>
					<OptionPill
						active={engine === "enhanced"}
						onClick={() => onEngineChange("enhanced")}
						label={t("player.engineEnhanced")}
					/>
					<OptionPill
						active={engine === "native"}
						onClick={() => onEngineChange("native")}
						label={t("player.engineNative")}
					/>
				</OptionGroup>
				<MoreActionRow
					label={t("player.screenshot")}
					icon={<Camera className="size-4" />}
					onClick={onScreenshot}
				/>
				<MoreActionRow
					label={t("player.pip")}
					icon={<PictureInPicture2 className="size-4" />}
					onClick={onTogglePip}
				/>
			</PopoverContent>
		</Popover>
	)
}

function RowItem(props: {
	readonly label: string
	readonly children: React.ReactNode
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs text-muted-foreground">{props.label}</span>
			{props.children}
		</div>
	)
}

function OptionGroup(props: {
	readonly label: string
	readonly children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs text-muted-foreground">{props.label}</span>
			<div className="flex flex-wrap gap-1.5">{props.children}</div>
		</div>
	)
}

function OptionPill(props: {
	readonly active: boolean
	readonly label: string
	readonly onClick: () => void
}) {
	const { active, label, onClick } = props
	return (
		<button
			type="button"
			onClick={onClick}
			data-active={active ? "true" : "false"}
			className="rounded-md border px-2.5 py-1 text-xs transition-colors data-[active=true]:border-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary hover:bg-accent"
		>
			{label}
		</button>
	)
}

function MoreActionRow(props: {
	readonly label: string
	readonly icon: React.ReactNode
	readonly active?: boolean
	readonly onClick: () => void
}) {
	const { label, icon, active, onClick } = props
	return (
		<button
			type="button"
			onClick={onClick}
			data-active={active ? "true" : "false"}
			className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent data-[active=true]:text-primary"
		>
			{icon}
			<span>{label}</span>
		</button>
	)
}
