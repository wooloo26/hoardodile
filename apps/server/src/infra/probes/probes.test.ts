import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { THUMB_BUFFER_MAX_BYTES } from "@hoardodile/consts"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
	needsFullAnimationScan,
	probeAnimatedImage,
	probeImageSource,
	readImageMetadata,
} from "./probes.ts"

describe("probeAnimatedImage", () => {
	test("returns false for video extensions without invoking sharp", async () => {
		const dir = mkdtempSync(join(tmpdir(), "probe-anim-"))
		try {
			const path = join(dir, "clip.mp4")
			writeFileSync(path, "not-a-real-mp4")
			await expect(probeAnimatedImage(path)).resolves.toBe(false)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe("probeImageSource", () => {
	test("static PNG is not animated after a single-page read", async () => {
		const png = await sharp({
			create: {
				width: 32,
				height: 32,
				channels: 3,
				background: { r: 10, g: 20, b: 30 },
			},
		})
			.png()
			.toBuffer()
		const probe = await probeImageSource(png, ".png")
		expect(probe).toEqual({
			width: 32,
			height: 32,
			animated: false,
		})
	})

	test("stream input within the cap probes normally", async () => {
		const png = await sharp({
			create: {
				width: 16,
				height: 8,
				channels: 3,
				background: { r: 1, g: 2, b: 3 },
			},
		})
			.png()
			.toBuffer()
		const probe = await probeImageSource(Readable.from(png), ".png")
		expect(probe).toEqual({ width: 16, height: 8, animated: false })
	})

	test("stream input beyond the byte cap degrades to undefined", async () => {
		const oversized = Buffer.alloc(THUMB_BUFFER_MAX_BYTES + 1, 0xab)
		const probe = await probeImageSource(Readable.from(oversized), ".png")
		expect(probe).toBeUndefined()
	})
})

describe("needsFullAnimationScan", () => {
	test("gif always escalates to full scan", () => {
		expect(needsFullAnimationScan({ width: 1, height: 1 }, ".gif")).toBe(true)
	})

	test("static jpeg does not escalate", () => {
		expect(
			needsFullAnimationScan({ width: 4000, height: 3000, pages: 1 }, ".jpg"),
		).toBe(false)
	})
})

describe("readImageMetadata", () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "probe-meta-"))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test("reads static jpeg dimensions from buffer", async () => {
		const jpeg = await sharp({
			create: {
				width: 120,
				height: 80,
				channels: 3,
				background: { r: 1, g: 2, b: 3 },
			},
		})
			.jpeg()
			.toBuffer()
		const { meta, animated } = await readImageMetadata(jpeg, ".jpg")
		expect(animated).toBe(false)
		expect(meta.width).toBe(120)
		expect(meta.height).toBe(80)
	})
})
