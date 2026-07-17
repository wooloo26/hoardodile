import { extname } from "node:path"
import type { Readable } from "node:stream"
import { IMAGE_EXTS, VIDEO_EXTS } from "@hoardodile/consts/media-exts"
import { THUMB_BUFFER_MAX_BYTES } from "@hoardodile/consts/res-consts"
import { notFound } from "@hoardodile/shared"
import type { SourceArtifactView } from "src/domain/res/source-view.ts"
import type { ImageThumbInput } from "./pipeline.ts"

export type ThumbInput =
	| { readonly kind: "path"; readonly path: string }
	| { readonly kind: "buffer"; readonly buffer: Buffer }
	| {
			readonly kind: "stream"
			readonly openStream: () => Promise<Readable>
			readonly size: number
	  }

export function imageThumbSource(input: ThumbInput): ImageThumbInput {
	if (input.kind === "path") return input.path
	if (input.kind === "buffer") return input.buffer
	if (input.kind === "stream") return { openStream: input.openStream }
	throw new Error("unsupported image thumb input")
}

export async function videoThumbSource(
	input: ThumbInput,
): Promise<string | Readable> {
	if (input.kind === "path") return input.path
	if (input.kind === "stream") return input.openStream()
	throw new Error("unsupported video thumb input")
}

function streamThumbInput(
	view: SourceArtifactView,
	relPath: string,
	size: number,
): ThumbInput {
	return {
		kind: "stream",
		openStream: () =>
			view.openEntryStream(relPath).then((entry) => entry.stream),
		size,
	}
}

/**
 * Resolve a zip entry into the cheapest readable form for thumb synthesis:
 * small images are read into memory; larger images and videos stream
 * directly from `source.hoard` without extracted-cache writes.
 */
export async function withThumbInput<T>(
	view: SourceArtifactView,
	relPath: string,
	mediaKind: "image" | "video",
	fn: (input: ThumbInput, ext: string) => Promise<T>,
): Promise<T> {
	const ext = extname(relPath).toLowerCase()
	if (mediaKind === "image" && IMAGE_EXTS.has(ext)) {
		const range = await view.resolveByteRange(relPath)
		if (range === undefined) {
			throw notFound(
				"resource.file_not_found",
				`resource ${view.resId} has no entry ${relPath}`,
				{ resId: view.resId, relPath },
			)
		}
		if (range.size <= THUMB_BUFFER_MAX_BYTES) {
			const buffer = await view.readEntry(relPath)
			return fn({ kind: "buffer", buffer }, ext)
		}
		return fn(streamThumbInput(view, relPath, range.size), ext)
	}
	if (mediaKind === "video" && VIDEO_EXTS.has(ext)) {
		const range = await view.resolveByteRange(relPath)
		if (range === undefined) {
			throw notFound(
				"resource.file_not_found",
				`resource ${view.resId} has no entry ${relPath}`,
				{ resId: view.resId, relPath },
			)
		}
		return fn(streamThumbInput(view, relPath, range.size), ext)
	}
	throw new Error(`unsupported thumb media kind ${mediaKind} for ${relPath}`)
}
