import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
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
	test("sums top-level file sizes and counts", async () => {
		const dir = mkdtempSync(join(tmpdir(), "app-fs-"))
		try {
			writeFileSync(join(dir, "1.png"), "AAAA")
			writeFileSync(join(dir, "2.png"), "BB")
			const api = createTestResourceAPI(dir)
			const meta = await aggregateSourceFiles(api)
			expect(meta).toEqual({ sizeBytes: 6, count: 2 })
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test("empty folder returns zero stats", async () => {
		const dir = mkdtempSync(join(tmpdir(), "app-fs-"))
		try {
			const api = createTestResourceAPI(dir)
			const meta = await aggregateSourceFiles(api)
			expect(meta).toEqual({ sizeBytes: 0, count: 0 })
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test("hidden / .uploading-* files are skipped", async () => {
		const dir = mkdtempSync(join(tmpdir(), "app-fs-"))
		try {
			writeFileSync(join(dir, ".cover.png"), "ignored-1")
			writeFileSync(join(dir, "x.uploading-123.png"), "ignored-2")
			writeFileSync(join(dir, "real.png"), "ABC")
			const api = createTestResourceAPI(dir)
			const meta = await aggregateSourceFiles(api)
			expect(meta).toEqual({ sizeBytes: 3, count: 1 })
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test("sizeBytes recursively sums files across nested folders", async () => {
		const dir = mkdtempSync(join(tmpdir(), "app-fs-"))
		try {
			writeFileSync(join(dir, "top.txt"), "AAAA") // 4
			mkdirSync(join(dir, "sub", "deep"), { recursive: true })
			writeFileSync(join(dir, "sub", "a.txt"), "BB") // 2
			writeFileSync(join(dir, "sub", "deep", "b.txt"), "CCCCCC") // 6
			writeFileSync(join(dir, "sub", ".meta"), "ignore-me")
			writeFileSync(
				join(dir, "sub", "deep", "x.uploading-9.bin"),
				"ignore-me-2",
			)
			const api = createTestResourceAPI(dir)
			const meta = await aggregateSourceFiles(api)
			// SourceArtifactView returns every entry from the canonical
			// artifact (zip CD) as a flat list — entries with `/`
			// are still single entries. Sizes and counts now come straight
			// from `listFiles`.
			expect(meta).toEqual({ sizeBytes: 12, count: 3 })
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
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
