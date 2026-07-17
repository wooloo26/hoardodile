import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { assertInside, assertSafeSegment, createStoragePaths } from "./paths.ts"

const ROOT = process.platform === "win32" ? "C:\\data\\app" : "/data/app"

describe("createStoragePaths", () => {
	test("defaults latestVersion from max versions/<n> on disk when omitted", () => {
		const root = mkdtempSync(join(tmpdir(), "paths-ver-"))
		try {
			mkdirSync(join(root, "versions", "1"), { recursive: true })
			mkdirSync(join(root, "versions", "2"), { recursive: true })
			const paths = createStoragePaths({ root })
			expect(paths.latestVersion).toBe(2)
			expect(paths.activeVersion).toBe(2)
			expect(paths.active.version).toBe(2)
			expect(paths.latest.version).toBe(2)
			expect(paths.active.root).toContain(`${sep()}versions${sep()}2`)
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})

	test("rejects relative roots", () => {
		expect(() => createStoragePaths({ root: "relative/path" })).toThrow(
			/absolute path/,
		)
	})

	test("builds versions and local subtrees under the root", () => {
		const paths = createStoragePaths({ root: ROOT })
		expect(paths.active.root).toContain("versions")
		expect(paths.local.root).toContain("local")
		expect(paths.active.root).not.toBe(paths.local.root)
	})

	test("resource path nests under versions/resources/<id>", () => {
		const paths = createStoragePaths({ root: ROOT })
		const p = paths.active.resource("res_42")
		expect(p.endsWith(`resources${sep()}res_42`)).toBe(true)
		expect(p.startsWith(paths.active.root)).toBe(true)
	})

	test("upload staging root and pool nest under local/.tmp", () => {
		const paths = createStoragePaths({ root: ROOT })
		const root = paths.local.uploadStagingRoot()
		expect(root.endsWith(`${sep()}local${sep()}.tmp`)).toBe(true)
		expect(root.startsWith(paths.local.root)).toBe(true)
		const pool = paths.local.stagingPoolRoot()
		expect(pool.startsWith(`${root}${sep()}`)).toBe(true)
		const file = paths.local.stagingPoolFile(
			"550e8400-e29b-41d4-a716-446655440000",
			".png",
		)
		expect(file.startsWith(`${pool}${sep()}`)).toBe(true)
		expect(file.endsWith("550e8400-e29b-41d4-a716-446655440000.png")).toBe(true)
	})

	test("thumb path nests under local/<kind>/<id>/<variant>.webp", () => {
		const paths = createStoragePaths({ root: ROOT })
		const r = paths.local.localCover("resource", "res_1", "preview", "webp")
		expect(r.endsWith(`resources${sep()}res_1${sep()}preview.webp`)).toBe(true)
		expect(r.startsWith(paths.local.root)).toBe(true)
		const c = paths.local.localCover("character", "char_1", "avatar", "webp")
		expect(c.endsWith(`characters${sep()}char_1${sep()}avatar.webp`)).toBe(true)
		expect(c.startsWith(paths.local.root)).toBe(true)
	})

	test("rejects path-like ids to prevent directory traversal", () => {
		const paths = createStoragePaths({ root: ROOT })
		expect(() => paths.active.resource("../escape")).toThrow(/separators/)
		expect(() => paths.active.resource("../../etc/passwd")).toThrow(
			/separators/,
		)
		expect(() => paths.active.resource("a\\b")).toThrow(/separators/)
	})

	test("rejects Windows reserved basenames and trailing dot/space", () => {
		const paths = createStoragePaths({ root: ROOT })
		expect(() => paths.active.resource("CON")).toThrow(/reserved/)
		expect(() => paths.active.resource("prn.txt")).toThrow(/reserved/)
		expect(() => paths.active.resource("trailing.")).toThrow(/dot or space/)
		expect(() => paths.active.resource("trailing ")).toThrow(/dot or space/)
	})

	test("rejects empty and dot segments", () => {
		expect(() => assertSafeSegment("")).toThrow(/empty/)
		expect(() => assertSafeSegment(".")).toThrow(/'\.'/)
		expect(() => assertSafeSegment("..")).toThrow(/'\.\.'/)
	})

	test("rejects control characters", () => {
		expect(() => assertSafeSegment("nul\u0000byte")).toThrow(/disallowed/)
	})
})

describe("assertInside", () => {
	test("accepts descendants and the ancestor itself", () => {
		expect(assertInside(ROOT, ROOT)).toBe(ROOT)
		const descendant =
			process.platform === "win32"
				? `${ROOT}\\sub\\leaf.txt`
				: `${ROOT}/sub/leaf.txt`
		expect(assertInside(ROOT, descendant)).toBe(descendant)
	})

	test("rejects siblings that share a prefix", () => {
		const sibling =
			process.platform === "win32" ? `${ROOT}-other` : `${ROOT}-other`
		expect(() => assertInside(ROOT, sibling)).toThrow(/escapes/)
	})
})

function sep(): string {
	return process.platform === "win32" ? "\\" : "/"
}
