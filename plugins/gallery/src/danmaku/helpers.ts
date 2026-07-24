import type { Danmaku as DanmakuRecord } from "@hoardodile/plugin-sdk-web"
import {
	DANMAKU_AREA_PRESETS,
	type DanmakuArea,
	RESUME_MIN_REMAINING_MS,
} from "./types"

/**
 * Per-resource cache key for a file's resume offset (milliseconds as a
 * decimal string). The cache is already scoped to the current resource
 * by the host, so the key only needs to distinguish files within it.
 */
export function resumeCacheKey(filename: string): string {
	return filename === "" ? "resume" : `resume:${filename}`
}

/** Minimal cache-writer surface needed by {@link writeResume}. */
export type ResumeWriter = {
	readonly setCache: (key: string, value: string) => void
}

/**
 * Persist the resume offset for a file. Near the end of the media the
 * offset is cleared instead, and positions under one second are not
 * worth resuming from.
 */
export function writeResume(
	api: ResumeWriter,
	args: {
		readonly filename: string
		readonly currentMs: number
		readonly durationMs: number
	},
): void {
	const { currentMs, durationMs } = args
	const remaining = durationMs - currentMs
	const key = resumeCacheKey(args.filename)
	if (remaining <= RESUME_MIN_REMAINING_MS) {
		api.setCache(key, "")
	} else if (currentMs > 1000) {
		api.setCache(key, String(currentMs))
	}
}

export function toEngineComment(d: DanmakuRecord, fontSizePx: number) {
	const mode = d.mode === "scroll" ? "rtl" : d.mode
	const data = d.anchor.data as { kind?: string; timeMs?: number } | undefined
	const timeMs = data?.kind === "videoTime" ? (data.timeMs ?? 0) : 0
	return {
		text: d.text,
		mode,
		time: timeMs / 1000,
		style: {
			fontSize: `${fontSizePx}px`,
			color: d.color !== "" ? d.color : "#ffffff",
			textShadow: "0 0 1px #000, 0 0 1px #000, 0 0 1px #000, 0 0 1px #000",
		},
	} satisfies {
		text: string
		mode: "rtl" | "top" | "bottom"
		time: number
		style: Partial<CSSStyleDeclaration>
	}
}

export function isDanmakuArea(v: string): v is DanmakuArea {
	return (DANMAKU_AREA_PRESETS as readonly string[]).includes(v)
}

export function areaToHeight(area: DanmakuArea): string {
	switch (area) {
		case "quarter":
			return "25%"
		case "half":
			return "50%"
		case "threeQuarters":
			return "75%"
		case "full":
			return "100%"
	}
}

export function formatTime(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "00:00"
	const totalSec = Math.floor(ms / 1000)
	const h = Math.floor(totalSec / 3600)
	const m = Math.floor((totalSec % 3600) / 60)
	const s = totalSec % 60
	const mm = String(m).padStart(2, "0")
	const ss = String(s).padStart(2, "0")
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function noopReject() {
	// Best-effort wrapper for play / requestPictureInPicture /
	// requestFullscreen / mutation invalidate. The browser surfaces
	// permission errors via UI on its own.
}
