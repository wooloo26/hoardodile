import { createWriteStream, mkdtempSync, rmSync } from "node:fs"
import { mkdir, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buffer } from "node:stream/consumers"
import { pipeline } from "node:stream/promises"
import { createStoragePaths } from "src/infra/storage/paths.ts"
import { describe, expect, test } from "vitest"
import yazl from "yazl"
import { buildSourceArtifactView } from "./source-view.ts"
import { createZipCdCache } from "./zip-cd-cache.ts"

const PAYLOAD = Buffer.alloc(64 * 1024, 0xab)

async function writeStoredZip(
	path: string,
	entries: readonly (readonly [string, Buffer])[],
): Promise<void> {
	const zip = new yazl.ZipFile()
	for (const [name, data] of entries) {
		zip.addBuffer(data, name, { compress: false })
	}
	zip.end()
	await pipeline(zip.outputStream, createWriteStream(path))
}

describe("openEntryStream", () => {
	test("streams zip entry bytes without writing extracted cache", async () => {
		const root = mkdtempSync(join(tmpdir(), "src-view-stream-"))
		try {
			const paths = createStoragePaths({ root, latestVersion: 1 })
			const resId = "res-stream"
			const archivePath = paths.latest.resSourceArchive(resId)
			await mkdir(join(root, "versions", "1", "resources", resId), {
				recursive: true,
			})
			const payload = Buffer.from("stream-bytes")
			await writeStoredZip(archivePath, [["clip.mp4", payload]])

			const view = buildSourceArtifactView(
				{ paths, zipCdCache: createZipCdCache() },
				resId,
				1,
				{ kind: "zip", archivePath },
			)

			const { stream, size } = await view.openEntryStream("clip.mp4")
			expect(size).toBe(payload.length)
			const read = await buffer(stream)
			expect(read.equals(payload)).toBe(true)

			const extractedDir = join(root, "local", "resources", resId, "extracted")
			await expect(stat(extractedDir)).rejects.toThrow()
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})
})

describe("readEntrySlice", () => {
	test("reads a positioned byte range from a STORED entry", async () => {
		const root = mkdtempSync(join(tmpdir(), "src-view-slice-"))
		try {
			const paths = createStoragePaths({ root, latestVersion: 1 })
			const resId = "res-slice"
			const archivePath = paths.latest.resSourceArchive(resId)
			await mkdir(join(root, "versions", "1", "resources", resId), {
				recursive: true,
			})
			const payload = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
			await writeStoredZip(archivePath, [
				["data.bin", payload],
				["empty.bin", Buffer.alloc(0)],
			])

			const view = buildSourceArtifactView(
				{ paths, zipCdCache: createZipCdCache() },
				resId,
				1,
				{ kind: "zip", archivePath },
			)

			expect(
				(await view.readEntrySlice("data.bin", 2, 5)).toJSON().data,
			).toEqual([3, 4, 5])
			// End clamps to the entry size; past-the-end start is empty.
			expect(
				(await view.readEntrySlice("data.bin", 6, 100)).toJSON().data,
			).toEqual([7, 8])
			expect((await view.readEntrySlice("data.bin", 100, 200)).byteLength).toBe(
				0,
			)
			// Zero-length entry does not read past the archive bounds.
			expect((await view.readEntrySlice("empty.bin", 0, 10)).byteLength).toBe(0)
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})
})

describe("withMaterializedEntry cache", () => {
	test("reuses persisted extraction across calls", async () => {
		const root = mkdtempSync(join(tmpdir(), "src-view-"))
		try {
			const paths = createStoragePaths({ root, latestVersion: 1 })
			const resId = "res-cache"
			const archivePath = paths.latest.resSourceArchive(resId)
			await mkdir(join(root, "versions", "1", "resources", resId), {
				recursive: true,
			})
			await writeStoredZip(archivePath, [
				["clip.mp4", Buffer.from("video-bytes")],
			])

			const view = buildSourceArtifactView(
				{ paths, zipCdCache: createZipCdCache() },
				resId,
				1,
				{ kind: "zip", archivePath },
			)

			let calls = 0
			const first = await view.withMaterializedEntry(
				"clip.mp4",
				async (path) => {
					calls += 1
					return path
				},
			)
			const second = await view.withMaterializedEntry(
				"clip.mp4",
				async (path) => {
					calls += 1
					return path
				},
			)

			expect(first).toBe(second)
			expect(calls).toBe(2)
			const cached = await readFile(first, "utf8")
			expect(cached).toBe("video-bytes")
			const info = await stat(first)
			expect(info.size).toBe(11)
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})
})

describe("withMaterializedEntry concurrent extraction", () => {
	test("parallel views share one extraction", async () => {
		const root = mkdtempSync(join(tmpdir(), "src-view-race-"))
		try {
			const paths = createStoragePaths({ root, latestVersion: 1 })
			const resId = "res-race"
			const archivePath = paths.latest.resSourceArchive(resId)
			await mkdir(join(root, "versions", "1", "resources", resId), {
				recursive: true,
			})
			await writeStoredZip(archivePath, [["clip.mp4", PAYLOAD]])

			const deps = { paths, zipCdCache: createZipCdCache() }
			const viewA = buildSourceArtifactView(deps, resId, 1, {
				kind: "zip",
				archivePath,
			})
			const viewB = buildSourceArtifactView(deps, resId, 1, {
				kind: "zip",
				archivePath,
			})

			const [pathA, pathB] = await Promise.all([
				viewA.withMaterializedEntry("clip.mp4", async (path) => path),
				viewB.withMaterializedEntry("clip.mp4", async (path) => path),
			])

			expect(pathA).toBe(pathB)
			const cached = await readFile(pathA)
			expect(cached.equals(PAYLOAD)).toBe(true)
			const info = await stat(pathA)
			expect(info.size).toBe(PAYLOAD.length)
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})
})
