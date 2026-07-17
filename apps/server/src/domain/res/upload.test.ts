import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { crc32 } from "node:zlib"
import { readZipEntries } from "src/domain/res/archive.ts"
import {
	createStoragePaths,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { buildResourceUploads, type ResUploads } from "./upload.ts"

/**
 * Build a minimal STORED (method=0) zip in memory. Used to exercise the
 * `archive` upload path (server transcodes / fast-paths).
 */
function buildStoredZip(
	entries: readonly (readonly [string, Buffer])[],
): Buffer {
	const localChunks: Buffer[] = []
	const centralChunks: Buffer[] = []
	let offset = 0
	for (const [name, data] of entries) {
		const nameBuf = Buffer.from(name, "utf8")
		const crc = crc32(data)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(0, 6)
		local.writeUInt16LE(0, 8) // method = stored
		local.writeUInt16LE(0, 10)
		local.writeUInt16LE(0, 12)
		local.writeUInt32LE(crc, 14)
		local.writeUInt32LE(data.length, 18)
		local.writeUInt32LE(data.length, 22)
		local.writeUInt16LE(nameBuf.length, 26)
		local.writeUInt16LE(0, 28)
		localChunks.push(local, nameBuf, data)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt16LE(0, 8)
		central.writeUInt16LE(0, 10) // method = stored
		central.writeUInt16LE(0, 12)
		central.writeUInt16LE(0, 14)
		central.writeUInt32LE(crc, 16)
		central.writeUInt32LE(data.length, 20)
		central.writeUInt32LE(data.length, 24)
		central.writeUInt16LE(nameBuf.length, 28)
		central.writeUInt16LE(0, 30)
		central.writeUInt16LE(0, 32)
		central.writeUInt16LE(0, 34)
		central.writeUInt16LE(0, 36)
		central.writeUInt32LE(0, 38)
		central.writeUInt32LE(offset, 42)
		centralChunks.push(central, nameBuf)
		offset += local.length + nameBuf.length + data.length
	}
	const central = Buffer.concat(centralChunks)
	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(0, 4)
	eocd.writeUInt16LE(0, 6)
	eocd.writeUInt16LE(entries.length, 8)
	eocd.writeUInt16LE(entries.length, 10)
	eocd.writeUInt32LE(central.length, 12)
	eocd.writeUInt32LE(offset, 16)
	eocd.writeUInt16LE(0, 20)
	return Buffer.concat([...localChunks, central, eocd])
}

/**
 * Build a DEFLATE-encoded zip in memory. Used to verify the server
 * unconditionally repacks non-STORED uploads.
 */
function buildDeflateZip(
	entries: readonly (readonly [string, Buffer])[],
): Buffer {
	const { deflateRawSync } = require("node:zlib") as {
		deflateRawSync: (data: Buffer) => Buffer
	}
	const localChunks: Buffer[] = []
	const centralChunks: Buffer[] = []
	let offset = 0
	for (const [name, data] of entries) {
		const nameBuf = Buffer.from(name, "utf8")
		const crc = crc32(data)
		const compressed = deflateRawSync(data)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(0, 6)
		local.writeUInt16LE(8, 8) // method = deflate
		local.writeUInt16LE(0, 10)
		local.writeUInt16LE(0, 12)
		local.writeUInt32LE(crc, 14)
		local.writeUInt32LE(compressed.length, 18)
		local.writeUInt32LE(data.length, 22)
		local.writeUInt16LE(nameBuf.length, 26)
		local.writeUInt16LE(0, 28)
		localChunks.push(local, nameBuf, compressed)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt16LE(0, 8)
		central.writeUInt16LE(8, 10) // method = deflate
		central.writeUInt16LE(0, 12)
		central.writeUInt16LE(0, 14)
		central.writeUInt32LE(crc, 16)
		central.writeUInt32LE(compressed.length, 20)
		central.writeUInt32LE(data.length, 24)
		central.writeUInt16LE(nameBuf.length, 28)
		central.writeUInt16LE(0, 30)
		central.writeUInt16LE(0, 32)
		central.writeUInt16LE(0, 34)
		central.writeUInt16LE(0, 36)
		central.writeUInt32LE(0, 38)
		central.writeUInt32LE(offset, 42)
		centralChunks.push(central, nameBuf)
		offset += local.length + nameBuf.length + compressed.length
	}
	const central = Buffer.concat(centralChunks)
	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(0, 4)
	eocd.writeUInt16LE(0, 6)
	eocd.writeUInt16LE(entries.length, 8)
	eocd.writeUInt16LE(entries.length, 10)
	eocd.writeUInt32LE(central.length, 12)
	eocd.writeUInt32LE(offset, 16)
	eocd.writeUInt16LE(0, 20)
	return Buffer.concat([...localChunks, central, eocd])
}

function streamOf(data: string): Readable {
	return Readable.from(Buffer.from(data, "utf8"))
}

describe("resource uploads", () => {
	let root: string
	let paths: StoragePaths
	let uploads: ResUploads

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "app-uploads-"))
		paths = createStoragePaths({ root })
		uploads = buildResourceUploads(
			paths,
			{
				maxArchiveExtractedBytes: Number.MAX_SAFE_INTEGER,
			},
			{ current: false },
		)
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("ordered N=1 commits as STORED `source.hoard` archive", async () => {
		const { fileId } = await uploads.stageSingleFile(
			"only.txt",
			streamOf("hello"),
		)
		const result = await uploads.commitOrderedByIds("res-single", [fileId])
		expect(existsSync(result.archivePath)).toBe(true)
		expect(result.archivePath).toBe(paths.latest.resSourceArchive("res-single"))
		expect(result.archivePath.endsWith("source.hoard")).toBe(true)

		const entries = await readZipEntries(result.archivePath)
		expect(entries.length).toBe(1)
		const first = entries[0]
		if (first === undefined) throw new Error("unreachable")
		expect(first.name).toBe("1.txt")
		expect(first.compressionMethod).toBe(0)
		// Pool file consumed on commit.
		await expect(uploads.resolveStagedFile(fileId)).resolves.toBeUndefined()
	})

	test("ordered N=1 with `.zip` extension becomes zip entry", async () => {
		const { fileId } = await uploads.stageSingleFile(
			"payload.zip",
			streamOf("ZIPDATA"),
		)
		const result = await uploads.commitOrderedByIds("res-single-zip", [fileId])
		expect(existsSync(result.archivePath)).toBe(true)

		const entries = await readZipEntries(result.archivePath)
		expect(entries.length).toBe(1)
		const first = entries[0]
		if (first === undefined) throw new Error("unreachable")
		expect(first.name).toBe("1.zip")
		expect(first.compressionMethod).toBe(0)
	})

	test("ordered N=1 with `.hoard` extension is rejected", async () => {
		await expect(
			uploads.stageSingleFile("anything.hoard", streamOf("X")),
		).rejects.toThrow()
	})

	test("ordered N>=2 commits as a STORED `source.hoard` archive", async () => {
		const a = await uploads.stageSingleFile("first.png", streamOf("AAA"))
		const b = await uploads.stageSingleFile("middle.JPG", streamOf("BB"))
		const c = await uploads.stageSingleFile("last.webp", streamOf("C"))
		const result = await uploads.commitOrderedByIds("res-zip", [
			a.fileId,
			b.fileId,
			c.fileId,
		])
		expect(existsSync(result.archivePath)).toBe(true)
		expect(result.archivePath).toBe(paths.latest.resSourceArchive("res-zip"))
		expect(result.archivePath.endsWith("source.hoard")).toBe(true)

		const entries = await readZipEntries(result.archivePath)
		const names = entries.map((e) => e.name).sort()
		expect(names).toEqual(["1.png", "2.jpg", "3.webp"])
		// Every entry uses STORED (method 0).
		for (const e of entries) expect(e.compressionMethod).toBe(0)
	})

	test("archive upload with all STORED entries is renamed without rewrite", async () => {
		const zipBytes = buildStoredZip([
			["a.png", Buffer.from("PNG-A")],
			["nested/b.txt", Buffer.from("NESTED-B")],
		])
		const { fileId } = await uploads.stageArchive(Readable.from(zipBytes))
		const result = await uploads.commitArchiveById("res-arc", fileId)
		expect(existsSync(result.archivePath)).toBe(true)
		const entries = await readZipEntries(result.archivePath)
		const names = entries.map((e) => e.name).sort()
		expect(names).toEqual(["a.png", "nested/b.txt"])
		for (const e of entries) expect(e.compressionMethod).toBe(0)
	})

	test("archive upload with DEFLATE entries is transcoded to STORED", async () => {
		// Build a payload large enough that DEFLATE actually compresses
		// (otherwise zlib emits a stored block and the test no longer
		// exercises the transcode path).
		const big = Buffer.from("x".repeat(4096))
		const zipBytes = buildDeflateZip([["big.txt", big]])
		const { fileId } = await uploads.stageArchive(Readable.from(zipBytes))
		const result = await uploads.commitArchiveById("res-trans", fileId)
		expect(existsSync(result.archivePath)).toBe(true)
		const entries = await readZipEntries(result.archivePath)
		expect(entries.length).toBe(1)
		const first = entries[0]
		if (first === undefined) throw new Error("unreachable: empty entries")
		expect(first.name).toBe("big.txt")
		// After transcode every entry must be STORED.
		expect(first.compressionMethod).toBe(0)
		expect(first.uncompressedSize).toBe(big.length)
	})

	test("commit replaces an existing artifact atomically", async () => {
		// First commit writes a single-file archive.
		const first = await uploads.stageSingleFile("a.txt", streamOf("OLD"))
		const r1 = await uploads.commitOrderedByIds("res-replace", [first.fileId])
		expect(existsSync(r1.archivePath)).toBe(true)

		// Second commit replaces with a different single-file archive.
		const second = await uploads.stageSingleFile("b.txt", streamOf("NEW"))
		const r2 = await uploads.commitOrderedByIds("res-replace", [second.fileId])
		expect(existsSync(r2.archivePath)).toBe(true)

		// Verify the new content is readable.
		const entries = await readZipEntries(r2.archivePath)
		expect(entries.length).toBe(1)
		const entry = entries[0]
		if (entry === undefined) throw new Error("unreachable")
		expect(entry.name).toBe("1.txt")

		// No `.replacing-*` siblings left over.
		const siblings = readdirSync(paths.latest.resource("res-replace"))
		expect(siblings.some((n) => n.includes(".replacing-"))).toBe(false)
	})

	test("commit replacing a multi-file archive with a single-file archive works", async () => {
		const firstA = await uploads.stageSingleFile("a.png", streamOf("A"))
		const firstB = await uploads.stageSingleFile("b.png", streamOf("B"))
		const r1 = await uploads.commitOrderedByIds("res-mix", [
			firstA.fileId,
			firstB.fileId,
		])
		expect(existsSync(r1.archivePath)).toBe(true)

		const second = await uploads.stageSingleFile("c.txt", streamOf("C"))
		const r2 = await uploads.commitOrderedByIds("res-mix", [second.fileId])
		expect(existsSync(r2.archivePath)).toBe(true)

		const entries = await readZipEntries(r2.archivePath)
		expect(entries.length).toBe(1)
		const entry = entries[0]
		if (entry === undefined) throw new Error("unreachable")
		expect(entry.name).toBe("1.txt")
	})

	test("commit honours explicit fileIds order", async () => {
		const a = await uploads.stageSingleFile("a.png", streamOf("A"))
		const b = await uploads.stageSingleFile("b.jpg", streamOf("B"))
		const c = await uploads.stageSingleFile("c.webp", streamOf("C"))

		const result = await uploads.commitOrderedByIds("res-order", [
			c.fileId,
			a.fileId,
			b.fileId,
		])
		expect(existsSync(result.archivePath)).toBe(true)

		const entries = await readZipEntries(result.archivePath)
		const names = entries.map((e) => e.name)
		expect(names).toEqual(["1.webp", "2.png", "3.jpg"])
		for (const e of entries) expect(e.compressionMethod).toBe(0)
	})

	test("commit rejects unknown fileId", async () => {
		const a = await uploads.stageSingleFile("a.png", streamOf("A"))
		await expect(
			uploads.commitOrderedByIds("res-bad-order", [
				a.fileId,
				"00000000-0000-0000-0000-000000000003",
			]),
		).rejects.toThrow()
	})

	test("commit rejects empty fileIds", async () => {
		await expect(
			uploads.commitOrderedByIds("res-no-order", []),
		).rejects.toThrow()
	})

	test("commit rejects duplicate fileId", async () => {
		const { fileId } = await uploads.stageSingleFile("a.png", streamOf("A"))
		await expect(
			uploads.commitOrderedByIds("res-dup", [fileId, fileId]),
		).rejects.toThrow()
	})

	test("discardStagedFile removes a staged file", async () => {
		const { fileId } = await uploads.stageSingleFile("x.png", streamOf("X"))
		await expect(uploads.resolveStagedFile(fileId)).resolves.toBeDefined()
		const removed = await uploads.discardStagedFile(fileId)
		expect(removed).toBe(true)
		await expect(uploads.resolveStagedFile(fileId)).resolves.toBeUndefined()
	})

	test("discardStagedFile returns false for unknown fileId", async () => {
		const removed = await uploads.discardStagedFile(
			"00000000-0000-0000-0000-000000000099",
		)
		expect(removed).toBe(false)
	})

	test("empty archive upload is rejected", async () => {
		await expect(
			uploads.stageArchive(Readable.from(Buffer.alloc(0))),
		).rejects.toThrow()
	})

	test("interrupted upload (no commit) leaves no resource directory", async () => {
		const { fileId } = await uploads.stageSingleFile("x.png", streamOf("X"))
		await uploads.discardStagedFile(fileId)
		expect(existsSync(paths.latest.resource("ghost"))).toBe(false)
	})
})
