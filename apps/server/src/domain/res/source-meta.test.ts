import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type { PluginSourceView } from "src/domain/plugin/api.ts"
import { describe, expect, test } from "vitest"
import { aggregateSourceFiles } from "./source-meta.ts"
import { createTestRegistry, TEST_BUILTIN_ID } from "./test-registry.ts"

const stubProbes = {
	probeImage: async (_path: string) => ({ width: 1920, height: 1080 }),
	probeVideo: async (_path: string) => ({
		width: 1280,
		height: 720,
		durationMs: 5000,
	}),
}

function createTestResourceAPI(dir: string): ResourceAPI {
	async function listFlatAll(): Promise<readonly string[]> {
		const out: string[] = []
		async function collect(current: string, prefix: string) {
			const entries = await readdir(join(dir, current), {
				withFileTypes: true,
			}).catch(() => [] as readonly never[])
			for (const e of entries) {
				if (e.name.startsWith(".")) continue
				if (e.name.includes(".uploading-")) continue
				const rel = prefix ? `${prefix}/${e.name}` : e.name
				if (e.isDirectory()) {
					await collect(join(current, e.name), rel)
				} else if (e.isFile()) {
					out.push(rel)
				}
			}
		}
		await collect(".", "")
		return out.sort((a, b) =>
			a.localeCompare(b, undefined, {
				sensitivity: "base",
				numeric: true,
			}),
		)
	}
	return {
		logInfo() {},
		logWarn() {},
		logError() {},
		async readFile(relPath: string) {
			const buf = await readFile(join(dir, relPath))
			return new Uint8Array(buf)
		},
		// Mirrors the ResourceAPI where the SourceArtifactView returns
		// every entry from the zip CD — already flat, with `/` allowed in
		// names. The on-disk recursive walk here stands in for that.
		listFiles: listFlatAll,
		async statFile(relPath: string) {
			const full = join(dir, relPath)
			try {
				const info = statSync(full)
				return { sizeBytes: info.size }
			} catch {
				return undefined
			}
		},
		async probeImage(relPath: string) {
			return stubProbes.probeImage(join(dir, relPath))
		},
		async probeVideo(relPath: string) {
			return stubProbes.probeVideo(join(dir, relPath))
		},
		async probeAudio() {
			return undefined
		},
		async isAnimatedImage() {
			return false
		},
		async setCover() {},
		async clearCover() {},
		async setLocalCover() {},
	}
}

const registry = createTestRegistry()

describe("aggregateSourceFiles", () => {
	function stubView(
		entries: Readonly<Record<string, number>>,
	): Pick<PluginSourceView, "listEntries" | "resolveByteRange"> {
		return {
			listEntries: async () => Object.keys(entries),
			resolveByteRange: async (relPath: string) => {
				const size = entries[relPath]
				return size === undefined ? undefined : { size }
			},
		}
	}

	test("sums entry sizes and counts", async () => {
		const meta = await aggregateSourceFiles(
			stubView({ "1.png": 4, "sub/2.png": 2 }),
		)
		expect(meta).toEqual({ sizeBytes: 6, count: 2 })
	})

	test("empty archive returns zero stats", async () => {
		const meta = await aggregateSourceFiles(stubView({}))
		expect(meta).toEqual({ sizeBytes: 0, count: 0 })
	})

	test("entries without a byte range are skipped", async () => {
		const view = {
			listEntries: async () => ["a.png", "gone.png"],
			resolveByteRange: async (relPath: string) =>
				relPath === "gone.png" ? undefined : { size: 3 },
		}
		const meta = await aggregateSourceFiles(view)
		expect(meta).toEqual({ sizeBytes: 3, count: 2 })
	})

	test("unreadable entries are skipped without failing the aggregate", async () => {
		const view = {
			listEntries: async () => ["a.png", "bad.png"],
			resolveByteRange: async (relPath: string) => {
				if (relPath === "bad.png") throw new Error("non-STORED entry")
				return { size: 3 }
			},
		}
		const meta = await aggregateSourceFiles(view)
		expect(meta).toEqual({ sizeBytes: 3, count: 2 })
	})

	test("returns undefined when the archive cannot be listed", async () => {
		const view = {
			listEntries: async (): Promise<readonly string[]> => {
				throw new Error("archive missing")
			},
			resolveByteRange: async () => ({ size: 0 }),
		}
		await expect(aggregateSourceFiles(view)).resolves.toBeUndefined()
	})
})

describe("buildPluginSourceMeta", () => {
	const entry = registry.getById(TEST_BUILTIN_ID)!

	test("gallery buildSourceMeta returns fixed cover meta", async () => {
		const dir = mkdtempSync(join(tmpdir(), "app-pm-"))
		try {
			writeFileSync(join(dir, "1.png"), "AAAA")
			writeFileSync(join(dir, "2.png"), "BB")
			const api = createTestResourceAPI(dir)
			const meta = await entry.plugin.sourceMeta!(api)
			expect(meta).toEqual({
				coverKind: "image",
				width: 1,
				height: 1,
			})
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
