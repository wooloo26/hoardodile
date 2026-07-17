import { spawn } from "node:child_process"
import type { Readable } from "node:stream"
import type { FfmpegPaths } from "src/infra/thumb/ffmpeg.ts"

/**
 * Source-media metadata derived by ffprobe - pixel dimensions of the first
 * video stream and the playable duration in milliseconds. Any field can be
 * absent when ffprobe declines to report it (corrupt header, missing
 * container metadata). Callers persist whichever fields are populated.
 */
export type ProbedVideoMeta = {
	readonly width?: number
	readonly height?: number
	readonly durationMs?: number
}

/**
 * Run `ffprobe` against `sourcePath` and parse the JSON it emits to extract
 * width, height, and duration. We deliberately skip silent failure paths
 * here (callers wrap the call in try/catch and treat missing meta as
 * non-fatal) so this function only returns when it has a parsed payload.
 *
 * Why JSON / `-print_format json`: the alternative `-show_entries` flat
 * format requires brittle line splitting and breaks on locale-specific
 * decimal separators in `duration`. JSON gives the values verbatim.
 *
 * @throws `Error` with stderr when ffprobe exits non-zero or emits no JSON.
 */
export function probeVideoMeta(
	source: string | Readable,
	ffmpeg: FfmpegPaths,
	inputFormat?: string,
): Promise<ProbedVideoMeta> {
	const fromStream = typeof source !== "string"
	return new Promise((resolve, reject) => {
		const args = [
			"-hide_banner",
			"-loglevel",
			"error",
			"-print_format",
			"json",
			"-show_streams",
			"-show_format",
		]
		if (fromStream) {
			if (inputFormat === undefined) {
				reject(new Error("stream ffprobe requires an input format hint"))
				return
			}
			args.push("-probesize", "100M", "-analyzeduration", "100M")
			args.push("-f", inputFormat)
		}
		args.push(fromStream ? "pipe:0" : source)
		const child = spawn(ffmpeg.ffprobe, args, {
			stdio: fromStream ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
		})
		const stdout = child.stdout
		const stderr = child.stderr
		if (stdout === null || stderr === null) {
			reject(new Error("ffprobe stdio was not configured"))
			return
		}
		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []
		stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk))
		stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk))
		if (fromStream) {
			source.on("error", reject)
			source.pipe(child.stdin!)
			child.stdin?.on("error", () => {})
		}
		child.on("error", reject)
		child.on("close", (code) => {
			if (code !== 0) {
				const msg = Buffer.concat(stderrChunks).toString("utf8").trim()
				reject(new Error(`ffprobe exited ${code}${msg ? `: ${msg}` : ""}`))
				return
			}
			const out = Buffer.concat(stdoutChunks).toString("utf8")
			if (out.length === 0) {
				reject(new Error("ffprobe produced no output"))
				return
			}
			try {
				resolve(parseFfprobeJson(out))
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)))
			}
		})
	})
}

type FfprobeStream = {
	readonly codec_type?: unknown
	readonly width?: unknown
	readonly height?: unknown
}

type FfprobeFormat = {
	readonly duration?: unknown
}

type FfprobePayload = {
	readonly streams?: readonly FfprobeStream[]
	readonly format?: FfprobeFormat
}

/**
 * Pure parser; broken out so callers and tests can hit it without spawning
 * ffprobe. Returns only the fields that survive type narrowing - partial
 * payloads are normal for malformed media and we prefer surfacing what we
 * have over rejecting the whole probe.
 */
function parseFfprobeJson(json: string): ProbedVideoMeta {
	const payload: unknown = JSON.parse(json)
	if (!isFfprobePayload(payload)) return {}
	const result: { width?: number; height?: number; durationMs?: number } = {}
	const videoStream = payload.streams?.find((s) => s.codec_type === "video")
	if (videoStream !== undefined) {
		if (typeof videoStream.width === "number" && videoStream.width > 0) {
			result.width = Math.round(videoStream.width)
		}
		if (typeof videoStream.height === "number" && videoStream.height > 0) {
			result.height = Math.round(videoStream.height)
		}
	}
	const durationRaw = payload.format?.duration
	if (typeof durationRaw === "string") {
		const seconds = Number.parseFloat(durationRaw)
		if (Number.isFinite(seconds) && seconds >= 0) {
			result.durationMs = Math.round(seconds * 1000)
		}
	}
	return result
}

function isFfprobePayload(value: unknown): value is FfprobePayload {
	return typeof value === "object" && value !== null
}
