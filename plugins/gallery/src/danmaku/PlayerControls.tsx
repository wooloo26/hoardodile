import { Slider } from "@hoardodile/ui/components/slider"
import { useBelowMd } from "@hoardodile/ui/hooks/use-mobile"
import { cn } from "@hoardodile/ui/lib/utils"
import {
	Camera,
	Maximize,
	Minimize,
	Pause,
	PictureInPicture2,
	Play,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import { DisplaySettingsPopover } from "./DisplaySettingsPopover"
import { formatTime } from "./helpers"
import { IconButton } from "./IconButton"
import { MoreControlsPopover } from "./MoreControlsPopover"
import { RateSelect } from "./RateSelect"
import {
	type FitMode,
	type PlayerEngine,
	RESUME_HINT_DURATION_MS,
} from "./types"
import { VolumeControl } from "./VolumeControl"

type ControlsProps = {
	/**
	 * `full`      — the standard control bar (default).
	 * `seek-only` — just a thin progress slider pinned to the bottom
	 *               edge so the user can scrub the active feed video
	 *               without the rest of the chrome competing for the
	 *               viewport.
	 */
	readonly mode?: "full" | "seek-only"
	readonly paused: boolean
	readonly currentMs: number
	readonly durationMs: number
	readonly volume: number
	readonly muted: boolean
	readonly rate: number
	readonly fullscreen: boolean
	readonly scrubbing: boolean
	readonly showControls?: boolean
	readonly engine: PlayerEngine
	readonly fitMode: FitMode
	readonly autoplay: boolean
	/**
	 * Wall-clock timestamp at which the resume hook successfully
	 * jumped the video back to its last position. Triggers a brief
	 * top-left hint so the user understands why the time changed.
	 * `undefined` keeps the badge hidden.
	 */
	readonly lastResumedAt: number | undefined
	/**
	 * Builds a server-rendered frame-thumbnail URL for the current file.
	 * Supplied by the host (via the plugin SDK) so the control bar never
	 * needs to know the resource id or the API path layout. Pass
	 * `undefined` to disable the hover-preview affordance.
	 */
	readonly resolveFrameUrl?: (filename: string, timeMs: number) => string
	readonly filename?: string
	readonly onTogglePlay: () => void
	readonly onSeek: (values: readonly number[]) => void
	readonly onSeekCommit: () => void
	readonly onVolumeChange: (values: readonly number[]) => void
	readonly onToggleMute: () => void
	readonly onRateChange: (rate: number) => void
	readonly onApplyRate: (rate: number) => void
	readonly onScreenshot: () => void
	readonly onTogglePip: () => void
	readonly onToggleFullscreen: () => void
	readonly onEngineChange: (next: PlayerEngine) => void
	readonly onFitModeChange: (next: FitMode) => void
	readonly onAutoplayChange: (next: boolean) => void
}

type ExclusivePopover = "display" | "rate" | "more" | undefined

export function PlayerControls(props: ControlsProps) {
	const {
		mode = "full",
		paused,
		currentMs,
		durationMs,
		volume,
		muted,
		rate,
		fullscreen,
		scrubbing,
		showControls,
		engine,
		fitMode,
		autoplay,
		lastResumedAt,
		resolveFrameUrl,
		filename,
		onTogglePlay,
		onSeek,
		onSeekCommit,
		onVolumeChange,
		onToggleMute,
		onRateChange,
		onApplyRate,
		onScreenshot,
		onTogglePip,
		onToggleFullscreen,
		onEngineChange,
		onFitModeChange,
		onAutoplayChange,
	} = props
	const isBelowMd = useBelowMd()
	const { t } = useTranslation()

	// Mutually-exclusive popover slot for display/rate/more. Each Radix
	// Select/Popover only closes itself on outside-click; without this
	// guard, clicking a sibling trigger races with the close.
	const [openPopover, setOpenPopover] = useState<ExclusivePopover>(undefined)
	function makeOpenChange(slot: Exclude<ExclusivePopover, undefined>) {
		return function handleOpenChange(open: boolean) {
			setOpenPopover(open ? slot : (cur) => (cur === slot ? undefined : cur))
		}
	}

	// Independent popovers (volume, danmaku settings) bump this counter
	// so the control bar stays visible while the user interacts with
	// their portal-rendered popups.
	const [openCount, setOpenCount] = useState(0)
	function handleAuxOpenChange(open: boolean) {
		setOpenCount((n) => (open ? n + 1 : Math.max(0, n - 1)))
	}
	const interacting = openPopover !== undefined || openCount > 0

	const [resumeHintVisible, setResumeHintVisible] = useState(false)
	useEffect(
		function showResumeHintBriefly() {
			if (lastResumedAt === undefined) return
			setResumeHintVisible(true)
			const handle = window.setTimeout(() => {
				setResumeHintVisible(false)
			}, RESUME_HINT_DURATION_MS)
			return () => {
				window.clearTimeout(handle)
			}
		},
		[lastResumedAt],
	)
	const resumedTime =
		lastResumedAt === undefined ? undefined : formatTime(currentMs)

	const showPreview = resolveFrameUrl !== undefined && filename !== undefined
	const [previewVisible, setPreviewVisible] = useState(false)
	const [previewTimeMs, setPreviewTimeMs] = useState(0)
	const [previewX, setPreviewX] = useState(0)
	const [previewImageUrl, setPreviewImageUrl] = useState<string | undefined>(
		undefined,
	)
	const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	)

	function clearPreviewDebounce() {
		if (previewDebounceRef.current !== undefined) {
			window.clearTimeout(previewDebounceRef.current)
			previewDebounceRef.current = undefined
		}
	}

	function updatePreview(containerRect: DOMRect, clientX: number) {
		if (resolveFrameUrl === undefined || filename === undefined) return
		const x = clientX - containerRect.left
		const ratio = Math.max(0, Math.min(1, x / containerRect.width))
		const timeMs = Math.round(ratio * durationMs)
		setPreviewVisible(true)
		setPreviewX(x)
		setPreviewTimeMs(timeMs)
		clearPreviewDebounce()
		previewDebounceRef.current = window.setTimeout(() => {
			setPreviewImageUrl(resolveFrameUrl(filename, timeMs))
		}, 150)
	}

	function hidePreview() {
		setPreviewVisible(false)
		clearPreviewDebounce()
	}

	const previewElement = showPreview && (
		<div
			className={cn(
				"pointer-events-none absolute bottom-full mb-2 flex -translate-x-1/2 flex-col items-center gap-1 transition-opacity duration-100",
				previewVisible ? "opacity-100" : "opacity-0",
			)}
			style={{ left: previewX }}
		>
			{previewImageUrl !== undefined && (
				<img
					src={previewImageUrl}
					alt=""
					className="block h-20 w-36 rounded bg-black/80 object-contain"
				/>
			)}
			<span className="rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-white">
				{formatTime(previewTimeMs)}
			</span>
		</div>
	)

	if (mode === "seek-only") {
		return (
			<div
				className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 px-3 pb-2"
				data-scrubbing={scrubbing ? "true" : "false"}
				onPointerMove={(e) => {
					if (e.pointerType !== "mouse") return
					updatePreview(e.currentTarget.getBoundingClientRect(), e.clientX)
				}}
				onPointerLeave={hidePreview}
			>
				{previewElement}
				<Slider
					value={[currentMs]}
					min={0}
					max={Math.max(durationMs, 1)}
					step={100}
					onValueChange={onSeek}
					onValueCommit={onSeekCommit}
					aria-label={t("player.progress")}
					data-scrubbing={scrubbing ? "true" : "false"}
					className="cursor-pointer
					**:data-[slot=slider-track]:h-0.5
					**:data-[slot=slider-track]:bg-white/30
					**:data-[slot=slider-track]:transition-[height]
					**:data-[slot=slider-track]:duration-150
					hover:**:data-[slot=slider-track]:h-1
					data-[scrubbing=true]:**:data-[slot=slider-track]:h-1
					**:data-[slot=slider-range]:bg-primary
					**:data-[slot=slider-thumb]:size-3
					**:data-[slot=slider-thumb]:border-0
					**:data-[slot=slider-thumb]:bg-primary
					**:data-[slot=slider-thumb]:opacity-0
					**:data-[slot=slider-thumb]:transition-opacity
					data-[scrubbing=true]:**:data-[slot=slider-thumb]:opacity-100"
				/>
			</div>
		)
	}
	return (
		<>
			{resumeHintVisible ? (
				<div
					data-testid="player-resume-hint"
					className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-sm"
				>
					{t("player.resume", { time: resumedTime ?? "" })}
				</div>
			) : null}
			{paused ? (
				<button
					type="button"
					aria-label={t("player.play")}
					onClick={onTogglePlay}
					className="pointer-events-auto absolute right-4 bottom-16 z-10 flex size-12 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
				>
					<Play className="size-6 translate-x-0.5 fill-current" />
				</button>
			) : null}
			<div
				className={cn(
					"pointer-events-none absolute inset-x-0 -bottom-0.5 flex flex-col gap-2 bg-linear-to-t from-black/90 via-black/55 to-transparent pt-10 text-white",
					"opacity-0 transition-opacity duration-200 group-hover/player:opacity-100 focus-within:opacity-100 data-[paused=true]:opacity-100 data-[scrubbing=true]:opacity-100 data-[interacting=true]:opacity-100",
					isBelowMd ? "data-[controls-visible=true]:opacity-100" : "",
					"[&_button]:pointer-events-auto **:[[role=slider]]:pointer-events-auto **:data-[slot=slider]:pointer-events-auto **:data-[slot=select-trigger]:pointer-events-auto",
				)}
				data-paused={paused ? "true" : "false"}
				data-scrubbing={scrubbing ? "true" : "false"}
				data-interacting={interacting ? "true" : "false"}
				data-controls-visible={showControls ? "true" : "false"}
			>
				<div
					className="relative pointer-events-auto"
					onPointerMove={(e) => {
						if (e.pointerType !== "mouse") return
						updatePreview(e.currentTarget.getBoundingClientRect(), e.clientX)
					}}
					onPointerLeave={hidePreview}
				>
					{previewElement}
					<Slider
						value={[currentMs]}
						min={0}
						max={Math.max(durationMs, 1)}
						step={100}
						onValueChange={onSeek}
						onValueCommit={onSeekCommit}
						aria-label={t("player.progress")}
						data-scrubbing={scrubbing ? "true" : "false"}
						className="cursor-pointer
					**:data-[slot=slider-track]:h-1
					**:data-[slot=slider-track]:bg-white/25
					**:data-[slot=slider-track]:transition-[height]
					**:data-[slot=slider-track]:duration-150
					hover:**:data-[slot=slider-track]:h-1.5
					data-[scrubbing=true]:**:data-[slot=slider-track]:h-1.5
					**:data-[slot=slider-range]:bg-primary
					**:data-[slot=slider-thumb]:size-3.5
					**:data-[slot=slider-thumb]:border-0
					**:data-[slot=slider-thumb]:bg-primary
					**:data-[slot=slider-thumb]:shadow-[0_0_0_4px_rgba(255,255,255,0.18)]
					**:data-[slot=slider-thumb]:opacity-0
					**:data-[slot=slider-thumb]:transition-opacity
					data-[scrubbing=true]:**:data-[slot=slider-thumb]:opacity-100"
					/>
				</div>
				<div className="flex items-center gap-1 pb-2 px-2">
					<IconButton
						ariaLabel={paused ? t("player.play") : t("player.pause")}
						onClick={onTogglePlay}
						size="lg"
					>
						{paused ? (
							<Play className="size-5 fill-current" />
						) : (
							<Pause className="size-5 fill-current" />
						)}
					</IconButton>
					<VolumeControl
						volume={volume}
						muted={muted}
						onToggleMute={onToggleMute}
						onVolumeChange={onVolumeChange}
						onOpenChange={handleAuxOpenChange}
					/>
					<span className="ml-1 select-none font-mono text-[11px] tabular-nums tracking-wide text-white/85">
						<span className="text-white">{formatTime(currentMs)}</span>
						<span className="px-1 text-white/40">/</span>
						<span>{formatTime(durationMs)}</span>
					</span>
					<div className="ml-auto flex items-center gap-1">
						{/* Inline on >=sm. Collapsed into the "more" popover on
						    mobile where the bar would otherwise overflow. */}
						<div className="hidden items-center gap-1 sm:flex">
							<DisplaySettingsPopover
								engine={engine}
								fitMode={fitMode}
								autoplay={autoplay}
								onEngineChange={onEngineChange}
								onFitModeChange={onFitModeChange}
								onAutoplayChange={onAutoplayChange}
								open={openPopover === "display"}
								onOpenChange={makeOpenChange("display")}
							/>
							<RateSelect
								rate={rate}
								onChange={onRateChange}
								onApply={onApplyRate}
								open={openPopover === "rate"}
								onOpenChange={makeOpenChange("rate")}
							/>
							<IconButton
								ariaLabel={t("player.screenshot")}
								onClick={onScreenshot}
							>
								<Camera className="size-4.5" />
							</IconButton>
							<IconButton ariaLabel={t("player.pip")} onClick={onTogglePip}>
								<PictureInPicture2 className="size-4.5" />
							</IconButton>
						</div>
						<div className="flex items-center gap-1 sm:hidden">
							<MoreControlsPopover
								rate={rate}
								engine={engine}
								fitMode={fitMode}
								autoplay={autoplay}
								onRateChange={onRateChange}
								onApplyRate={onApplyRate}
								onScreenshot={onScreenshot}
								onTogglePip={onTogglePip}
								onEngineChange={onEngineChange}
								onFitModeChange={onFitModeChange}
								onAutoplayChange={onAutoplayChange}
								open={openPopover === "more"}
								onOpenChange={makeOpenChange("more")}
							/>
						</div>
						<IconButton
							ariaLabel={
								fullscreen ? t("player.exitFullscreen") : t("player.fullscreen")
							}
							onClick={onToggleFullscreen}
						>
							{fullscreen ? (
								<Minimize className="size-4.5" />
							) : (
								<Maximize className="size-4.5" />
							)}
						</IconButton>
					</div>
				</div>
			</div>
		</>
	)
}
