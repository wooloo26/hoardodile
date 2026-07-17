import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createResourceAPIFixture } from "@hoardodile/plugin-sdk-server"
import { readFileChunks } from "@hoardodile/plugin-sdk-server/helpers"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
	createImportResourceAPI,
	createPluginResourceAPI,
	type PluginSourceView,
} from "./api.ts"

describe("createImportResourceAPI", () => {
	let rootDir: string

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), "import-api-test-"))
		mkdirSync(join(rootDir, "sub"))
		writeFileSync(join(rootDir, "inside.txt"), "inside")
		writeFileSync(join(rootDir, "sub", "nested.txt"), "nested")
	})

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true })
	})

	test("readFile allows paths inside the directory", async () => {
		const api = createImportResourceAPI(rootDir)
		const data = await api.readFile("inside.txt")
		expect(new TextDecoder().decode(data)).toBe("inside")
	})

	test("readFile rejects parent directory traversal", async () => {
		const api = createImportResourceAPI(rootDir)
		await expect(api.readFile("../outside.txt")).rejects.toThrow(
			"escapes import directory",
		)
	})

	test("readFile rejects nested traversal", async () => {
		const api = createImportResourceAPI(rootDir)
		await expect(api.readFile("sub/../../outside.txt")).rejects.toThrow(
			"escapes import directory",
		)
	})

	test("readFile rejects absolute paths", async () => {
		const api = createImportResourceAPI(rootDir)
		await expect(api.readFile("/etc/passwd")).rejects.toThrow(
			"absolute paths are not allowed",
		)
	})

	test("readFile rejects empty paths", async () => {
		const api = createImportResourceAPI(rootDir)
		await expect(api.readFile("")).rejects.toThrow("path is empty")
	})

	test("readFile rejects null bytes", async () => {
		const api = createImportResourceAPI(rootDir)
		await expect(api.readFile("inside.txt\0extra")).rejects.toThrow("null byte")
	})

	test("statFile validates paths even though it returns undefined", async () => {
		const api = createImportResourceAPI(rootDir)
		await expect(api.statFile("../outside.txt")).rejects.toThrow(
			"escapes import directory",
		)
		expect(await api.statFile("inside.txt")).toBeUndefined()
	})

	test("listFiles stays within the directory", async () => {
		const api = createImportResourceAPI(rootDir)
		const files = await api.listFiles()
		expect([...files].sort()).toEqual(["inside.txt", join("sub", "nested.txt")])
	})
})

describe("createImportResourceAPI ranged reads", () => {
	let rootDir: string

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), "import-api-range-"))
		writeFileSync(join(rootDir, "data.bin"), Buffer.from([1, 2, 3, 4, 250]))
	})

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true })
	})

	test("range returns the requested slice", async () => {
		const api = createImportResourceAPI(rootDir)
		expect([...(await api.readFile("data.bin", { start: 1, end: 4 }))]).toEqual(
			[2, 3, 4],
		)
	})

	test("end defaults to file size and clamps", async () => {
		const api = createImportResourceAPI(rootDir)
		expect([...(await api.readFile("data.bin", { start: 3 }))]).toEqual([
			4, 250,
		])
		expect([
			...(await api.readFile("data.bin", { start: 0, end: 10_000 })),
		]).toEqual([1, 2, 3, 4, 250])
	})

	test("start past the end returns empty", async () => {
		const api = createImportResourceAPI(rootDir)
		expect(
			(await api.readFile("data.bin", { start: 100, end: 200 })).byteLength,
		).toBe(0)
	})

	test("full reads above the byte cap are rejected with guidance", async () => {
		const api = createImportResourceAPI(rootDir, { maxReadFileBytes: 4 })
		await expect(api.readFile("data.bin")).rejects.toThrow(/byte range/)
	})

	test("ranged reads above the byte cap are rejected too", async () => {
		const api = createImportResourceAPI(rootDir, { maxReadFileBytes: 3 })
		await expect(
			api.readFile("data.bin", { start: 0, end: 5 }),
		).rejects.toThrow(/byte range/)
		await expect(
			api.readFile("data.bin", { start: 0, end: 3 }),
		).resolves.toHaveLength(3)
	})
})

describe("createPluginResourceAPI ranged reads", () => {
	function stubView(content: readonly number[]): PluginSourceView {
		const bytes = Buffer.from(content)
		return {
			listEntries: async () => ["blob.bin"],
			readEntry: async () => bytes,
			readEntrySlice: async (_relPath, start, end) =>
				bytes.subarray(start, end),
			openEntryStream: async () => {
				throw new Error("not used in these tests")
			},
			resolveByteRange: async () => ({ size: bytes.byteLength }),
		}
	}

	function stubApi(content: readonly number[], maxReadFileBytes?: number) {
		return createPluginResourceAPI({
			view: stubView(content),
			probeImage: async () => undefined,
			probeVideo: async () => undefined,
			isAnimatedImage: async () => false,
			...(maxReadFileBytes !== undefined ? { maxReadFileBytes } : {}),
		})
	}

	test("full read delegates to readEntry", async () => {
		const api = stubApi([1, 2, 3, 4, 250])
		expect([...(await api.readFile("blob.bin"))]).toEqual([1, 2, 3, 4, 250])
	})

	test("ranged read maps to readEntrySlice with clamped end", async () => {
		const api = stubApi([1, 2, 3, 4, 250])
		expect([...(await api.readFile("blob.bin", { start: 2 }))]).toEqual([
			3, 4, 250,
		])
		expect([
			...(await api.readFile("blob.bin", { start: 1, end: 10_000 })),
		]).toEqual([2, 3, 4, 250])
	})

	test("full read above the byte cap is rejected", async () => {
		const api = stubApi([1, 2, 3, 4, 250], 4)
		await expect(api.readFile("blob.bin")).rejects.toThrow(/byte range/)
	})
})

describe("readFileChunks", () => {
	test("yields the whole file in chunk-sized pieces", async () => {
		const contents = Array.from({ length: 10 }, (_, i) => i)
		const { api } = createResourceAPIFixture({
			contents: { "big.bin": new Uint8Array(contents) },
		})
		const chunks: number[][] = []
		for await (const chunk of readFileChunks(api, "big.bin", {
			chunkSize: 4,
		})) {
			chunks.push([...chunk])
		}
		expect(chunks).toEqual([
			[0, 1, 2, 3],
			[4, 5, 6, 7],
			[8, 9],
		])
	})

	test("empty file yields nothing", async () => {
		const { api } = createResourceAPIFixture({
			contents: { "empty.bin": new Uint8Array() },
		})
		const chunks: Uint8Array[] = []
		for await (const chunk of readFileChunks(api, "empty.bin", {
			chunkSize: 4,
		})) {
			chunks.push(chunk)
		}
		expect(chunks).toEqual([])
	})
})
