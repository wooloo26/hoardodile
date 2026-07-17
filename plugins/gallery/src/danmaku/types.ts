/**
 * Shared types and constants for the {@link DanmakuPlayer} feature.
 *
 * Kept colocated with the other player modules so adding a new
 * preset (e.g. a new danmaku area) does not require touching the
 * main component file.
 */

export type DanmakuPlayerProps = {
	readonly resId: string
	/**
	 * Stable per-resource sub-anchor (typically the gallery file's
	 * filename). Defaults to "" for resources that expose only one
	 * playable surface.
	 */
	readonly filename?: string
	readonly src: string
	readonly autoplay?: boolean
	/**
	 * Loop playback. Caller-driven (e.g. the feed always loops). When
	 * omitted the player does not loop.
	 */
	readonly loop?: boolean
	/**
	 * Optional controlled playback state. When provided, the player
	 * imperatively plays or pauses to match every change of this flag
	 * — useful for the feed where the *active* card plays and
	 * neighbours stay paused after preloading. Leave undefined to keep
	 * the user-driven play/pause behaviour.
	 */
	readonly playing?: boolean
	/**
	 * Controls overlay mode:
	 *  - `full`      — the standard control bar with seek, volume,
	 *                  play/pause, fullscreen, etc. Default.
	 *  - `seek-only` — only a thin progress slider so the user can
	 *                  scrub the active feed video without pinning
	 *                  the rest of the chrome over it.
	 *  - `none`      — no controls at all (tap-to-toggle external).
	 */
	readonly controls?: "full" | "seek-only" | "none"
	/**
	 * Skip the per-`(resId, filename)` resume hooks (read on
	 * mount, throttled write while playing). The feed always plays
	 * from the start so the cross-device resume seek does not pause
	 * the active video half a second after autoplay starts.
	 */
	readonly disableResume?: boolean
	readonly className?: string
	/**
	 * Hide the inline danmaku send bar. The full control bar (seek,
	 * volume, play/pause, fullscreen, etc.) is still rendered. Used by
	 * the TikTok-style feed where danmaku is composed in an external
	 * popup but users still need to scrub the timeline.
	 */
	readonly hideSendBar?: boolean
	/**
	 * Optional controlled danmaku display settings. When provided the
	 * player treats them as the source of truth (and stops keeping its
	 * own internal copy). The feed lifts this state so the same
	 * settings persist across slides and so the danmaku popover can
	 * live outside the player subtree (e.g. in the feed header).
	 */
	readonly settings?: DanmakuSettings
	readonly onSettingsChange?: (next: DanmakuSettings) => void
	/**
	 * Forwarded to the underlying `<video preload>` attribute. The
	 * default is `"metadata"` — enough to expose duration/dimensions
	 * without prefetching the bytes. The resource feed bumps active
	 * neighbours up to `"auto"` so the next swipe starts buffering
	 * before the slide is shown.
	 */
	readonly preload?: "none" | "metadata" | "auto"
	/**
	 * Probed video dimensions from `sourceMeta`, used to set an initial
	 * CSS `aspect-ratio` before the browser decodes `loadedmetadata`.
	 * Prevents the first painted frame from stretching to fill the
	 * player rect.
	 */
	readonly naturalSize?: { readonly w: number; readonly h: number }
}

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const RESUME_STORAGE_PREFIX = "app:player:resume:"
export const RESUME_THROTTLE_MS = 2000
export const RESUME_MIN_REMAINING_MS = 5
export const VOLUME_PREF_KEY = "player.volume"
export const VOLUME_THROTTLE_MS = 500
export const AUTOPLAY_PREF_KEY = "player.autoplay"
/** How long the "resumed from last position" badge stays visible. */
export const RESUME_HINT_DURATION_MS = 2000
export const DEFAULT_VIDEO_ASPECT = 16 / 9

export type PlayerEngine = "enhanced" | "native"
/**
 * `contain`  letterbox the video to the player frame.
 * `natural`  letterbox, but never upscale past the source resolution
 *            — useful for low-res clips where `contain` would blur
 *            them across the frame.
 */
export type FitMode = "contain" | "natural"
export const FIT_MODES = ["contain", "natural"] as const

export const DANMAKU_AREA_PRESETS = [
	"quarter",
	"half",
	"threeQuarters",
	"full",
] as const
export type DanmakuArea = (typeof DANMAKU_AREA_PRESETS)[number]

export type DanmakuSettings = {
	readonly enabled: boolean
	readonly opacity: number
	readonly fontSizePx: number
	readonly area: DanmakuArea
}

export const DEFAULT_DANMAKU_SETTINGS: DanmakuSettings = {
	enabled: true,
	opacity: 1,
	fontSizePx: 24,
	area: "full",
}
