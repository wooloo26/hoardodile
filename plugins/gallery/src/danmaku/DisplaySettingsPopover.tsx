import { Button } from "@hoardodile/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@hoardodile/ui/components/popover"
import { Switch } from "@hoardodile/ui/components/switch"
import { Settings2 } from "lucide-react"
import { useTranslation } from "../i18n"
import { usePlayerPortalContainer } from "./PlayerPortalContext"
import { FIT_MODES, type FitMode, type PlayerEngine } from "./types"

const FIT_LABEL: Record<string, string> = {
	fill: "player.fitFill",
	contain: "player.fitContain",
	cover: "player.fitCover",
}

type Props = {
	readonly engine: PlayerEngine
	readonly fitMode: FitMode
	readonly autoplay: boolean
	readonly onEngineChange: (next: PlayerEngine) => void
	readonly onFitModeChange: (next: FitMode) => void
	readonly onAutoplayChange: (next: boolean) => void
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
}

export function DisplaySettingsPopover(props: Props) {
	const {
		engine,
		fitMode,
		autoplay,
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
					aria-label={t("player.displaySettings")}
					className="size-9 rounded-full text-white/90 transition-none hover:bg-white/15 hover:text-white"
				>
					<Settings2 className="size-4.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				container={portalContainer}
				side="top"
				align="end"
				className="flex w-56 flex-col gap-3 p-3"
			>
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs text-muted-foreground">
						{t("player.autoplay")}
					</span>
					<Switch
						checked={autoplay}
						onCheckedChange={onAutoplayChange}
						aria-label={t("player.autoplay")}
					/>
				</div>
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
			</PopoverContent>
		</Popover>
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
