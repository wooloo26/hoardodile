import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { buildPluginUploads } from "./upload.ts"

const PLUGIN_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

const MANIFEST = JSON.stringify({
	id: PLUGIN_ID,
	name: "test-plugin",
	description: "test",
	version: "0.0.0",
	permissions: {},
})

describe("buildPluginUploads", () => {
	let pluginsDir: string

	beforeEach(() => {
		pluginsDir = mkdtempSync(join(tmpdir(), "plugin-upload-test-"))
	})

	afterEach(() => {
		rmSync(pluginsDir, { recursive: true, force: true })
	})

	test("installs a valid plugin zip into <pluginsDir>/<id>", async () => {
		const uploads = buildPluginUploads({
			pluginsDir,
			maxExtractedBytes: 1024,
			extractZip: async (_source, destDir) => {
				await writeFile(join(destDir, "manifest.json"), MANIFEST)
			},
		})

		const id = await uploads.installFromZip(Readable.from(["zip-bytes"]))
		expect(id).toBe(PLUGIN_ID)
		expect(existsSync(join(pluginsDir, PLUGIN_ID, "manifest.json"))).toBe(true)
		expect(
			readdirSync(pluginsDir).filter((n) => n.startsWith(".staging-")),
		).toEqual([])
	})

	test("forwards maxExtractedBytes and cleans the staging dir on failure", async () => {
		let seenBudget = 0
		const uploads = buildPluginUploads({
			pluginsDir,
			maxExtractedBytes: 1024,
			extractZip: (_source, _destDir, maxExtractedBytes) => {
				seenBudget = maxExtractedBytes
				return Promise.reject(
					new Error("archive extracts to more than N bytes"),
				)
			},
		})

		await expect(
			uploads.installFromZip(Readable.from(["zip-bytes"])),
		).rejects.toThrow("archive extracts to more than")
		expect(seenBudget).toBe(1024)
		// The failed install must leave neither the staging dir nor a
		// half-installed plugin directory behind.
		expect(readdirSync(pluginsDir)).toEqual([])
	})

	test("rejects a zip without a root manifest.json", async () => {
		const uploads = buildPluginUploads({
			pluginsDir,
			maxExtractedBytes: 1024,
			extractZip: async () => {},
		})

		await expect(
			uploads.installFromZip(Readable.from(["zip-bytes"])),
		).rejects.toThrow("manifest.json")
		expect(readdirSync(pluginsDir)).toEqual([])
	})
})
