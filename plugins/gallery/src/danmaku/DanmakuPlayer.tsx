import type { Danmaku as DanmakuRecord } from "@hoardodile/plugin-sdk-web"
import type { VideoPlayerStore } from "@videojs/react"
import { usePluginAPI } from "../hooks"
import "@videojs/react/video/skin.css"
import { useBelowMd } from "@hoardodile/ui/hooks/use-mobile"
import { cn } from "@hoardodile/ui/lib/utils"
import { createPlayer } from "@videojs/react"
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video"
import type Danmaku from "danmaku"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import {
	clearPlayerTime,
	dispatchDanmakuPlayerSeek,
	publishPlayerTime,
	useEmitDanmakuRequestBus,
	useSeekBus,
} from "./bus"
import { DanmakuSendBar } from "./DanmakuSendBar"
import { noopReject, toEngineComment } from "./helpers"
import {
	useAutoplayPref,
	useDanmakuEngine,
	useInitialVolume,
	useResumeApply,
	useResumePlayback,
} from "./hooks"
import { PlayerControls } from "./PlayerControls"
import { PlayerPortalContainerContext } from "./PlayerPortalContext"
import { ENGINE_PREF_KEY, FIT_MODE_PREF_KEY } from "./prefs"
import {
	type DanmakuPlayerProps,
	type DanmakuSettings,
	DEFAULT_DANMAKU_SETTINGS,
	DEFAULT_VIDEO_ASPECT,
	type FitMode,
	type PlayerEngine,
	VOLUME_PREF_KEY,
} from "./types"
import { useDanmakuSubmitter } from "./useDanmakuSubmitter"

/**
 * Bullet-comment ("danmaku") video player. Wraps a native `<video>`
 * with a Danmaku.js overlay and a shadcn control bar; persists the
 * playback offset per `(resId, filename)` so reopening resumes
 * from the last known position.
 *
 * The persisted engine preference selects between two independent
 * surfaces (mounting one swaps out the other):
 *  - `enhanced` — custom danmaku stack with shadcn UI.
 *  - `native`   — plain `@videojs/react` skin, no danmaku/bus/resume.
 *                 Reference fallback when the custom UI misbehaves.
 */
export function DanmakuPlayer(props: DanmakuPlayerProps) {
	const api = usePluginAPI()
	const [engine, setEngineState] = useState<PlayerEngine>(() => {
		const raw = api.getPref(ENGINE_PREF_KEY)
		return raw === "native" ? "native" : "enhanced"
	})
	function handleEngineChange(next: PlayerEngine) {
		setEngineState(next)
		api.setPref(ENGINE_PREF_KEY, next)
	}
	if (engine === "native") {
		return (
			<NativePlayer
				src={props.src}
				autoplay={props.autoplay}
				loop={props.loop}
				className={props.className}
				preload={props.preload}
				naturalSize={props.naturalSize}
				onEngineChange={handleEngineChange}
			/>
		)
	}
	return (
		<EnhancedPlayer
			{...props}
			engine={engine}
			onEngineChange={handleEngineChange}
		/>
	)
}

// `@videojs/react` reference player. Owns its own provider so it
// never shares store state with the enhanced surface.
const NativeVideoPlayer = createPlayer({
	features: videoFeatures,
	displayName: "DanmakuPlayer.Native",
})

function NativePlayer(props: {
	readonly src: string
	readonly autoplay?: boolean
	readonly loop?: boolean
	readonly className?: string
	readonly preload?: "none" | "metadata" | "auto"
	readonly naturalSize?: { readonly w: number; readonly h: number }
	readonly onEngineChange: (next: PlayerEngine) => void
}) {
	const {
		src,
		autoplay,
		loop,
		className,
		preload,
		naturalSize,
		onEngineChange,
	} = props
	const { autoplay: autoplayPrefValue } = useAutoplayPref()
	const { t } = useTranslation()
	const effectiveAutoplay = autoplay ?? autoplayPrefValue
	const initialAspectRatio = naturalSize
		? `${naturalSize.w} / ${naturalSize.h}`
		: `${DEFAULT_VIDEO_ASPECT}`
	return (
		<NativeVideoPlayer.Provider>
			<div
				className={cn(
					"relative flex h-full w-full flex-col overflow-hidden bg-black",
					className,
				)}
			>
				<VideoSkin>
					<Video
						src={src}
						autoPlay={effectiveAutoplay}
						loop={loop}
						playsInline
						preload={preload ?? "metadata"}
						crossOrigin="anonymous"
						style={{ aspectRatio: initialAspectRatio }}
					/>
				</VideoSkin>
				<button
					type="button"
					onClick={() => {
						onEngineChange("enhanced")
					}}
					className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 font-mono text-tiny text-white/85 hover:bg-black/80"
				>
					{t("player.engineNative")}
				</button>
			</div>
		</NativeVideoPlayer.Provider>
	)
}

const EnhancedVideoPlayer = createPlayer({
	features: videoFeatures,
	displayName: "DanmakuPlayer",
})

function EnhancedPlayer(
	props: DanmakuPlayerProps & {
		readonly engine: PlayerEngine
		readonly onEngineChange: (next: PlayerEngine) => void
	},
) {
	return (
		<EnhancedVideoPlayer.Provider>
			<EnhancedPlayerInner {...props} />
		</EnhancedVideoPlayer.Provider>
	)
}

function EnhancedPlayerInner(
	props: DanmakuPlayerProps & {
		readonly engine: PlayerEngine
		readonly onEngineChange: (next: PlayerEngine) => void
	},
) {
	const {
		resId,
		filename = "",
		src,
		autoplay,
		loop,
		playing,
		controls = "full",
		disableResume = false,
		className,
		hideSendBar = false,
		settings: settingsProp,
		onSettingsChange,
		preload,
		naturalSize,
		engine,
		onEngineChange,
	} = props
	const api = usePluginAPI()
	const videoRef = useRef<HTMLVideoElement>(null)
	const stageRef = useRef<HTMLDivElement>(null)
	const wrapperRef = useRef<HTMLDivElement>(null)
	// Mirror `wrapperRef.current` into state so the popover-portal
	// context update once the container mounts. Popovers and selects
	// rendered inside the player portal into this element so they
	// remain visible (and tappable) when the player enters fullscreen.
	const [portalContainer, setPortalContainer] = useState<
		HTMLElement | undefined
	>(undefined)
	const danmakuRef = useRef<Danmaku | undefined>(undefined)

	// Full store for action methods (`play`, `pause`, `seek`, ...);
	// selectors below subscribe each reactive field individually so we
	// re-render only on the slice that actually changed.
	const store = EnhancedVideoPlayer.usePlayer() as VideoPlayerStore
	const paused = EnhancedVideoPlayer.usePlayer((s) => Boolean(s.paused))
	const currentTime = EnhancedVideoPlayer.usePlayer(
		(s) => Number(s.currentTime) || 0,
	)
	const duration = EnhancedVideoPlayer.usePlayer((s) => Number(s.duration) || 0)
	const volume = EnhancedVideoPlayer.usePlayer((s) => Number(s.volume) || 0)
	const muted = EnhancedVideoPlayer.usePlayer((s) => Boolean(s.muted))
	const rate = EnhancedVideoPlayer.usePlayer((s) => Number(s.playbackRate) || 1)
	const fullscreen = EnhancedVideoPlayer.usePlayer((s) => Boolean(s.fullscreen))

	const currentMs = Math.round(currentTime * 1000)
	const durationMs = Math.round(duration * 1000)
	const isBelowMd = useBelowMd()

	const [scrubbing, setScrubbing] = useState(false)
	const scrubResumeRef = useRef(false)
	const [showControls, setShowControls] = useState(true)
	const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	)
	const [internalSettings, setInternalSettings] = useState<DanmakuSettings>(
		DEFAULT_DANMAKU_SETTINGS,
	)
	// `settings` may be controlled by the caller (the feed lifts this so
	// it can render the popover in its own header). When uncontrolled we
	// fall back to the internal copy.
	const settings = settingsProp ?? internalSettings
	function setSettings(next: DanmakuSettings) {
		if (onSettingsChange !== undefined) onSettingsChange(next)
		else setInternalSettings(next)
	}
	const [fitMode, setFitModeState] = useState<FitMode>(() => {
		const raw = api.getPref(FIT_MODE_PREF_KEY)
		return raw === "natural" ? "natural" : "contain"
	})
	// Captured on `loadedmetadata`. Used by the `natural` fit mode to
	// cap the rendered video at its source resolution so low-res clips
	// do not get scaled up across the player frame.
	const [natural, setNatural] = useState<{ w: number; h: number } | undefined>(
		undefined,
	)

	function handleFitModeChange(next: FitMode) {
		setFitModeState(next)
		api.setPref(FIT_MODE_PREF_KEY, next)
	}

	function clearHideControls() {
		if (controlsTimeoutRef.current !== undefined) {
			clearTimeout(controlsTimeoutRef.current)
			controlsTimeoutRef.current = undefined
		}
	}

	function scheduleHideControls() {
		clearHideControls()
		if (isBelowMd && !paused) {
			controlsTimeoutRef.current = setTimeout(() => {
				setShowControls(false)
			}, 3000)
		}
	}

	useEffect(() => {
		if (!isBelowMd) return
		if (paused) {
			clearHideControls()
			setShowControls(true)
		} else {
			scheduleHideControls()
		}
	}, [paused, isBelowMd])

	useEffect(() => {
		return () => {
			clearHideControls()
		}
	}, [resId, filename])

	const danmakuListQ = api.useDanmakuList({
		kind: "videoTime",
		filename,
	})
	const danmakuList = danmakuListQ.data

	useDanmakuEngine({
		stageRef,
		videoRef,
		danmakuRef,
		comments: danmakuList,
		settings,
	})

	useInitialVolume({ store, duration })

	useResumePlayback({
		videoRef,
		resId,
		filename,
		currentMs,
		durationMs,
		disabled: disableResume,
	})
	const { lastResumedAt } = useResumeApply({
		videoRef,
		resId,
		filename,
		disabled: disableResume,
	})
	useSeekBus({ videoRef, resId, filename })

	useEffect(
		function listenForAnchorJump() {
			function handler(event: MessageEvent) {
				if (event.data?.type !== "anchor-jump") return
				const data = event.data.data as
					| { readonly timeMs?: number; readonly filename?: string }
					| undefined
				if (typeof data?.timeMs !== "number") return
				if (data.filename !== undefined && data.filename !== filename) return
				dispatchDanmakuPlayerSeek({
					resId,
					filename,
					timeMs: data.timeMs,
				})
			}
			window.addEventListener("message", handler)
			return () => window.removeEventListener("message", handler)
		},
		[resId, filename],
	)

	const { autoplay: autoplayPrefValue, setAutoplay: handleAutoplayChange } =
		useAutoplayPref()
	// The `autoplay` prop is the caller's hard preference (e.g. the
	// lightbox dialog wants to start playing immediately). When it is
	// not provided we fall back to the user-saved preference, which
	// defaults to off so opening a video does not auto-start.
	const effectiveAutoplay = autoplay ?? autoplayPrefValue

	const apiRef = useRef(api)
	apiRef.current = api

	function handleTogglePlay() {
		clearHideControls()
		if (paused) store.play().catch(noopReject)
		else store.pause()
	}

	function handleVideoClick() {
		if (isBelowMd && !paused && !showControls) {
			setShowControls(true)
			scheduleHideControls()
			return
		}
		handleTogglePlay()
	}

	function handleSeek(values: readonly number[]) {
		const next = values[0]
		if (next === undefined) return
		// First tick enters scrub mode and pauses playback for
		// frame-accurate previews; the prior paused state is restored on
		// commit.
		if (!scrubbing) {
			scrubResumeRef.current = !paused
			store.pause()
			setScrubbing(true)
		}
		store.seek(next / 1000).catch(noopReject)
	}

	function handleSeekCommit() {
		if (!scrubbing) return
		setScrubbing(false)
		if (scrubResumeRef.current) {
			store.play().catch(noopReject)
			scrubResumeRef.current = false
		}
	}

	function handleVolumeChange(values: readonly number[]) {
		const next = values[0] ?? 0
		// Drop writes that race the media target (slider rendered before
		// `loadedmetadata`); the store throws `StoreError: NO_TARGET`.
		try {
			store.setVolume(next)
			if (next === 0 && !muted) store.toggleMuted()
			else if (next > 0 && muted) store.toggleMuted()
		} catch {
			return
		}
		apiRef.current.setPref(VOLUME_PREF_KEY, String(next))
	}

	function handleToggleMute() {
		store.toggleMuted()
	}

	function handleScreenshot() {
		const v = videoRef.current
		if (v === null || v.videoWidth === 0) return
		const canvas = document.createElement("canvas")
		canvas.width = v.videoWidth
		canvas.height = v.videoHeight
		const ctx = canvas.getContext("2d")
		if (ctx === null) return
		try {
			ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
		} catch {
			return
		}
		canvas.toBlob((blob) => {
			if (blob === null) return
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `${resId}-${Math.round(v.currentTime * 1000)}.png`
			document.body.appendChild(a)
			a.click()
			a.remove()
			URL.revokeObjectURL(url)
		}, "image/png")
	}

	function handleTogglePip() {
		store.togglePictureInPicture().catch(noopReject)
	}

	function handleToggleFullscreen() {
		store.toggleFullscreen().catch(noopReject)
	}

	function handleApplyRate(r: number) {
		store.setPlaybackRate(r)
	}

	function handleEmitDanmaku(d: DanmakuRecord) {
		danmakuRef.current?.emit(toEngineComment(d, settings.fontSizePx))
	}

	const externalSubmitter = useDanmakuSubmitter({
		filename,
		getCurrentMs: () => currentMs,
		onEmit: handleEmitDanmaku,
	})
	useEmitDanmakuRequestBus({
		resId,
		filename,
		onRequest: externalSubmitter.submit,
	})

	useEffect(() => {
		publishPlayerTime(resId, filename, currentMs)
	}, [resId, filename, currentMs])
	useEffect(() => {
		return () => {
			clearPlayerTime(resId, filename)
		}
	}, [resId, filename])

	// Controlled playback: the feed flips this on when the slide
	// becomes active and off when it leaves so neighbours preload
	// silently. `autoPlay` only fires on initial mount so we drive
	// transitions imperatively.
	useEffect(() => {
		if (playing === undefined) return
		const v = videoRef.current
		if (v === null) return
		if (playing) {
			v.play().catch(noopReject)
		} else {
			v.pause()
		}
	}, [playing])

	function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
		const v = e.currentTarget
		// Resume seeks are now centralised in `useResumeApply`, which
		// listens for `loadedmetadata`/`durationchange`/`canplay` itself
		// (mobile browsers occasionally drop the React-synthesised
		// `onLoadedMetadata`).
		if (v.videoWidth > 0 && v.videoHeight > 0) {
			setNatural({ w: v.videoWidth, h: v.videoHeight })
		}
	}

	const containerClassName = cn(
		// `flex-1 min-h-0` lets the container fill the column without
		// fighting the send-bar row below it. An explicit `h-full` would
		// force this row to claim the full parent height and push the
		// send bar past `overflow-hidden`, which on mobile manifests as a
		// thin gap between the video and the input as the browser
		// resolves the contradictory sizes.
		"group/player relative flex w-full flex-1 min-h-0 overflow-hidden bg-black items-center justify-center",
		// Mobile browsers fire `:focus-visible` on tap (the player root
		// is `tabindex=0` so it can capture keyboard shortcuts), which
		// paints a stray outline ring across the video. Suppress it —
		// keyboard focus on the controls inside still gets their own
		// rings.
		"focus-visible:outline-none",
	)
	// `natural` caps the video at its source resolution so low-res
	// clips are not scaled up; `contain` letterboxes to fill.
	const isNatural = fitMode === "natural" && natural !== undefined
	const initialAspectRatio = naturalSize
		? `${naturalSize.w} / ${naturalSize.h}`
		: `${DEFAULT_VIDEO_ASPECT}`
	const videoStyle = isNatural
		? ({
				maxWidth: `min(100%, ${natural.w}px)`,
				maxHeight: `min(100%, ${natural.h}px)`,
				aspectRatio: `${natural.w} / ${natural.h}`,
			} satisfies React.CSSProperties)
		: ({ aspectRatio: initialAspectRatio } satisfies React.CSSProperties)
	const videoClassName = isNatural
		? "block h-auto w-auto object-contain"
		: "block h-full w-full object-contain"

	return (
		<div
			className={cn(
				"relative flex h-full w-full flex-col overflow-hidden bg-black",
				className,
			)}
		>
			<EnhancedVideoPlayer.Container
				ref={(el) => {
					wrapperRef.current = el
					setPortalContainer(el ?? undefined)
				}}
				className={containerClassName}
			>
				<Video
					ref={videoRef}
					src={src}
					autoPlay={effectiveAutoplay}
					loop={loop}
					playsInline
					preload={preload ?? "metadata"}
					crossOrigin="anonymous"
					className={videoClassName}
					style={videoStyle}
					onClick={handleVideoClick}
					onLoadedMetadata={handleLoadedMetadata}
				/>
				<div
					ref={stageRef}
					className="pointer-events-none absolute inset-0"
					style={{ opacity: settings.enabled ? settings.opacity : 0 }}
				/>
				<PlayerPortalContainerContext.Provider value={portalContainer}>
					{controls === "none" ? undefined : (
						<PlayerControls
							mode={controls === "seek-only" ? "seek-only" : "full"}
							paused={paused}
							currentMs={currentMs}
							durationMs={durationMs}
							volume={volume}
							muted={muted}
							rate={rate}
							fullscreen={fullscreen}
							scrubbing={scrubbing}
							showControls={showControls}
							engine={engine}
							fitMode={fitMode}
							autoplay={autoplayPrefValue}
							lastResumedAt={lastResumedAt}
							resolveFrameUrl={api.resolveFrameUrl}
							filename={filename}
							onTogglePlay={handleTogglePlay}
							onSeek={handleSeek}
							onSeekCommit={handleSeekCommit}
							onVolumeChange={handleVolumeChange}
							onToggleMute={handleToggleMute}
							onRateChange={handleApplyRate}
							onScreenshot={handleScreenshot}
							onTogglePip={handleTogglePip}
							onToggleFullscreen={handleToggleFullscreen}
							onApplyRate={handleApplyRate}
							onEngineChange={onEngineChange}
							onFitModeChange={handleFitModeChange}
							onAutoplayChange={handleAutoplayChange}
						/>
					)}
				</PlayerPortalContainerContext.Provider>
			</EnhancedVideoPlayer.Container>
			{hideSendBar ? undefined : (
				<DanmakuSendBar
					filename={filename}
					getCurrentMs={() => currentMs}
					onEmit={handleEmitDanmaku}
					settings={settings}
					onSettingsChange={setSettings}
				/>
			)}
		</div>
	)
}
