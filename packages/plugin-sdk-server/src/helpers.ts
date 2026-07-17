import { fileNeedsPreview } from "@hoardodile/consts/res-consts"
import type { ResourceAPI } from "./types.ts"

/** Return the lower-cased extension from the last dot, or `""` when there is none. */
export function extname(filename: string): string {
	const dot = filename.lastIndexOf(".")
	if (dot === -1) return ""
	return filename.slice(dot).toLowerCase()
}

/** Natural-sort filenames (case-insensitive, numeric). Mutates and returns. */
export function naturalSort(files: readonly string[]): string[] {
	return [...files].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
	)
}

/** Probe an image file and return a file-item shaped object. */
export async function probeImageFile(
	api: ResourceAPI,
	filename: string,
): Promise<{
	readonly type: "image"
	readonly width?: number
	readonly height?: number
	readonly preview: boolean
}> {
	const probed = await api.probeImage(filename)
	const stat = await api.statFile(filename)
	const width = probed?.width
	const height = probed?.height
	const sizeBytes = stat?.sizeBytes
	return {
		type: "image",
		width,
		height,
		preview:
			width !== undefined &&
			height !== undefined &&
			sizeBytes !== undefined &&
			fileNeedsPreview({ type: "image", width, height, sizeBytes }),
	}
}

/** Probe a video file and return a file-item shaped object. */
export async function probeVideoFile(
	api: ResourceAPI,
	filename: string,
): Promise<{
	readonly type: "video"
	readonly width?: number
	readonly height?: number
	readonly durationMs?: number
}> {
	const probed = await api.probeVideo(filename)
	return {
		type: "video",
		width: probed?.width,
		height: probed?.height,
		durationMs: probed?.durationMs,
	}
}

export type ReadFileChunksOptions = {
	/** Chunk size in bytes. Defaults to 1 MiB. */
	readonly chunkSize?: number
}

/**
 * Stream a file as a sequence of chunks via ranged `readFile` calls.
 * Memory stays bounded by the chunk size on both sides of the plugin
 * boundary — the host never buffers the whole file.
 */
export async function* readFileChunks(
	api: ResourceAPI,
	path: string,
	opts: ReadFileChunksOptions = {},
): AsyncGenerator<Uint8Array, void, undefined> {
	const chunkSize = opts.chunkSize ?? 1024 * 1024
	let offset = 0
	for (;;) {
		const chunk = await api.readFile(path, {
			start: offset,
			end: offset + chunkSize,
		})
		if (chunk.byteLength === 0) return
		yield chunk
		if (chunk.byteLength < chunkSize) return
		offset += chunk.byteLength
	}
}
