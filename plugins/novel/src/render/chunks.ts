import type { NovelParagraph } from "./parse"

/**
 * Default maximum paragraphs in a single layout chunk. The novel
 * reader only mounts one chunk's worth of `<p>` elements into the
 * CSS multi-column flow at a time, so the cost of laying out a
 * multi-million character novel scales with this constant rather
 * than with the document length. Tuned empirically: 200 paragraphs
 * is roughly 50–150 columns at typical reading sizes, which lays out
 * in well under a frame on commodity hardware.
 */
export const NOVEL_CHUNK_SIZE = 200

export type NovelChunk = {
	readonly index: number
	readonly startParagraphIndex: number
	readonly paragraphs: readonly NovelParagraph[]
}

export type NovelChunkIndex = {
	readonly chunks: readonly NovelChunk[]
	/**
	 * Map an absolute paragraph index to the chunk that contains it.
	 * Returns 0 for an empty index — callers should range-check the
	 * paragraph against `paragraphCount` before relying on it.
	 */
	readonly chunkOfParagraph: (paragraphIdx: number) => number
}

/**
 * Group a flat paragraph list into fixed-size chunks. Paragraph
 * indices are preserved (each `NovelParagraph.index` keeps its
 * absolute position) so comment anchors and persisted positions stay
 * stable across chunking changes.
 */
export function splitIntoChunks(
	paragraphs: readonly NovelParagraph[],
	chunkSize: number = NOVEL_CHUNK_SIZE,
): NovelChunkIndex {
	if (chunkSize <= 0) {
		throw new Error("chunkSize must be positive")
	}
	const chunks: NovelChunk[] = []
	for (let start = 0; start < paragraphs.length; start += chunkSize) {
		const slice = paragraphs.slice(start, start + chunkSize)
		const head = slice[0]
		if (head === undefined) continue
		chunks.push({
			index: chunks.length,
			startParagraphIndex: head.index,
			paragraphs: slice,
		})
	}
	function chunkOfParagraph(paragraphIdx: number): number {
		if (chunks.length === 0) return 0
		// Binary search on chunk start indices. Chunks are contiguous
		// and ordered, so the chunk containing `paragraphIdx` is the
		// last one whose start <= paragraphIdx.
		let lo = 0
		let hi = chunks.length - 1
		while (lo < hi) {
			const mid = (lo + hi + 1) >>> 1
			const c = chunks[mid]
			if (c !== undefined && c.startParagraphIndex <= paragraphIdx) lo = mid
			else hi = mid - 1
		}
		return lo
	}
	return { chunks, chunkOfParagraph }
}
