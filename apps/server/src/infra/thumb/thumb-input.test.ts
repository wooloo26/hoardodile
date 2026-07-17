import { createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs"
import { stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buffer } from "node:stream/consumers"
import { pipeline } from "node:stream/promises"
import { THUMB_BUFFER_MAX_BYTES } from "@hoardodile/consts"
import sharp from "sharp"
import { buildSourceArtifactView } from "src/domain/res/source-view.ts"
import { createZipCdCache } from "src/domain/res/zip-cd-cache.ts"
import {
	createStoragePaths,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import yazl from "yazl"
import { withThumbInput } from "./thumb-input.ts"

async function writeStoredZip(
	path: string,
	entries: { name: string; bytes: Buffer }[],
): Promise<void> {
	const zip = new yazl.ZipFile()
	for (const entry of entries) {
		zip.addBuffer(entry.bytes, entry.name, { compress: false })
	}
	zip.end()
	await pipeline(zip.outputStream, createWriteStream(path))
	expect(statSync(path).size).toBeGreaterThan(0)
}

describe("withThumbInput", () => {
	let root: string
	let paths: StoragePaths

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "thumb-input-"))
		paths = createStoragePaths({ root })
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("small zip image entries are read into memory without extraction", async () => {
		const archivePath = join(root, "source.hoard")
		const png = await sharp({
			create: {
				width: 24,
				height: 24,
				channels: 3,
				background: { r: 4, g: 5, b: 6 },
			},
		})
			.png()
			.toBuffer()
		await writeStoredZip(archivePath, [{ name: "a.png", bytes: png }])

		const view = buildSourceArtifactView(
			{ paths, zipCdCache: createZipCdCache() },
			"res-1",
			1,
			{ kind: "zip", archivePath },
		)

		let sawBuffer = false
		await withThumbInput(view, "a.png", "image", async (input) => {
			expect(input.kind).toBe("buffer")
			if (input.kind === "buffer") {
				sawBuffer = true
				expect(input.buffer.equals(png)).toBe(true)
			}
			return "ok"
		})
		expect(sawBuffer).toBe(true)
		expect(png.length).toBeLessThan(THUMB_BUFFER_MAX_BYTES)
	})

	test("video zip entries stream from hoard without extracted cache", async () => {
		const archivePath = join(root, "source.hoard")
		const mp4Bytes = Buffer.from("fake-mp4-bytes")
		await writeStoredZip(archivePath, [{ name: "clip.mp4", bytes: mp4Bytes }])

		const view = buildSourceArtifactView(
			{ paths, zipCdCache: createZipCdCache() },
			"res-2",
			1,
			{ kind: "zip", archivePath },
		)

		await withThumbInput(view, "clip.mp4", "video", async (input) => {
			expect(input.kind).toBe("stream")
			if (input.kind === "stream") {
				expect(input.size).toBe(mp4Bytes.length)
				const read = await buffer(await input.openStream())
				expect(read.equals(mp4Bytes)).toBe(true)
			}
			return "ok"
		})

		const extractedDir = join(root, "local", "resources", "res-2", "extracted")
		await expect(stat(extractedDir)).rejects.toThrow()
	})
})
