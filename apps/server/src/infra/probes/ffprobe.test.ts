import { PassThrough, Readable } from "node:stream"
import { afterEach, describe, expect, test, vi } from "vitest"
import { probeVideoMeta } from "./ffprobe.ts"

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}))

describe("probeVideoMeta", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	test("ffprobe receives pipe:0 for stream sources", async () => {
		const { spawn } = await import("node:child_process")
		const payload = Buffer.from(
			JSON.stringify({
				streams: [{ codec_type: "video", width: 640, height: 360 }],
				format: { duration: "1.5" },
			}),
		)
		const fakeChild = {
			stdin: new PassThrough(),
			stdout: {
				on: vi.fn((_event: string, handler: (chunk: Buffer) => void) => {
					handler(payload)
				}),
			},
			stderr: { on: vi.fn() },
			on: vi.fn((event: string, handler: (code: number) => void) => {
				if (event === "close") handler(0)
			}),
		}
		vi.mocked(spawn).mockReturnValue(fakeChild as never)

		const stream = Readable.from(Buffer.from("fake-video"))
		const meta = await probeVideoMeta(
			stream,
			{
				ffmpeg: "/bin/ffmpeg",
				ffprobe: "/bin/ffprobe",
			},
			"mp4",
		)
		const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[]
		expect(args).toContain("pipe:0")
		expect(args).toContain("-f")
		expect(args).toContain("mp4")
		expect(meta.width).toBe(640)
		expect(meta.height).toBe(360)
		expect(meta.durationMs).toBe(1500)
	})
})
