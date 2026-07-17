import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createImportResourceAPI } from "./import.ts"

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
