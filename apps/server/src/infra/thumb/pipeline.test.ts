import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough, Readable } from "node:stream"
import sharp from "sharp"
import { afterEach, describe, expect, test, vi } from "vitest"
import { renderVideoFrame } from "./pipeline.ts"

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}))

describe("renderVideoFrame", () => {
	afterEach(() => {
		vi.resetModules()
		vi.clearAllMocks()
	})

	test("ffmpeg receives pipe:0 for stream sources", async () => {
		const { spawn } = await import("node:child_process")
		const jpeg = await sharp({
			create: {
				width: 8,
				height: 8,
				channels: 3,
				background: { r: 1, g: 2, b: 3 },
			},
		})
			.jpeg()
			.toBuffer()
		const fakeChild = {
			stdin: new PassThrough(),
			stdout: {
				on: vi.fn((_event: string, handler: (chunk: Buffer) => void) => {
					handler(jpeg)
				}),
			},
			stderr: { on: vi.fn() },
			on: vi.fn((event: string, handler: (code: number) => void) => {
				if (event === "close") handler(0)
			}),
		}
		vi.mocked(spawn).mockReturnValue(fakeChild as never)

		const destDir = mkdtempSync(join(tmpdir(), "pipe-frame-"))
		try {
			const destPath = join(destDir, "frame.avif")
			const stream = Readable.from(Buffer.from("fake-video"))
			await renderVideoFrame({
				source: stream,
				ext: ".mp4",
				destPath,
				ffmpeg: { ffmpeg: "/bin/ffmpeg", ffprobe: "/bin/ffprobe" },
				maxArea: 10_000,
				quality: 65,
			})
			const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[]
			expect(args).toContain("pipe:0")
			expect(args).toContain("-f")
			expect(args).toContain("mp4")
			expect(args).not.toContain("-ss")
			expect(args).not.toContain("fake-video")
		} finally {
			rmSync(destDir, { recursive: true, force: true })
		}
	})
})
