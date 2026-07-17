import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { probeImageSource, probeVideo } = vi.hoisted(() => ({
	probeImageSource: vi.fn(),
	probeVideo: vi.fn(),
}))

vi.mock("src/infra/probes/probes.ts", () => ({
	probeImageSource,
	probeVideo,
	probeImage: vi.fn(),
	probeAnimatedImage: vi.fn(),
}))

import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type { PluginRegistry } from "src/domain/plugin/api-types.ts"
import { buildResMetaOps } from "./meta-ops.ts"
import type { ResRow } from "./repo.ts"
import type { SourceArtifactView } from "./source-view.ts"
import { createTestRegistry, TEST_BUILTIN_ID } from "./test-registry.ts"

function mockZipView(
	overrides: Partial<SourceArtifactView> = {},
): SourceArtifactView {
	const stream = Readable.from(Buffer.from("fake-video"))
	return {
		resId: "res-1",
		fileVersion: 1,
		kind: "zip",
		artifactPath: "/fake/source.hoard",
		listEntries: async () => ["clip.mp4"],
		readEntry: async () => Buffer.alloc(0),
		openEntryStream: async () => ({ stream, size: 100 }),
		withMaterializedEntry: async (_rel, fn) => fn("/tmp/clip.mp4"),
		withSeekableEntry: async (_rel, fn) => fn("/tmp/clip.mp4"),
		resolveByteRange: async () => ({
			path: "/fake/source.hoard",
			start: 0,
			end: 99,
			size: 100,
			mtimeMs: 0,
		}),
		...overrides,
	}
}

function makeRow(overrides: Partial<ResRow> = {}): ResRow {
	return {
		id: "res-1",
		name: "test",
		intro: "",
		contentPluginId: TEST_BUILTIN_ID,
		fileVersion: 1,
		coverVersion: 0,
		fileStats: null,
		sourceMeta: null,
		searchMeta: null,
		coverMeta: null,
		createdAt: 0,
		updatedAt: 0,
		tagIds: [],
		charIds: [],
		...overrides,
	} as ResRow
}

describe("buildResMetaOps cover meta", () => {
	const registry = createTestRegistry()
	let row: ResRow
	const patches: Record<string, string | null>[] = []

	beforeEach(() => {
		row = makeRow()
		patches.length = 0
		probeImageSource.mockReset()
		probeVideo.mockReset()
		probeImageSource.mockResolvedValue({
			width: 100,
			height: 100,
			animated: false,
		})
		probeVideo.mockResolvedValue({
			width: 1920,
			height: 1080,
			durationMs: 12_000,
		})
	})

	function buildOps(view: SourceArtifactView) {
		const repo = {
			findById: () => row,
			patchMeta: (_id: string, patch: Record<string, string | null>) => {
				patches.push(patch)
				row = { ...row, ...patch } as ResRow
			},
		}
		const api: ResourceAPI = {
			logInfo() {},
			logWarn() {},
			logError() {},
			async listFiles() {
				return ["clip.mp4"]
			},
			async readFile() {
				return new Uint8Array()
			},
			async statFile() {
				return { sizeBytes: 1 }
			},
			async probeImage() {
				return undefined
			},
			async probeVideo() {
				return undefined
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
		return buildResMetaOps({
			repo: repo as never,
			now: () => 1,
			pluginRegistry: registry as PluginRegistry,
			createResourceAPI: async () => api,
			resolveSourceView: async () => view,
			findCover: async () => undefined,
		})
	}

	test("mp4 local cover uses probeVideo, not probeAnimatedImage", async () => {
		const view = mockZipView()
		const ops = buildOps(view)
		await ops.rebuildCoverMeta("res-1")

		expect(probeVideo).toHaveBeenCalledTimes(1)
		expect(typeof probeVideo.mock.calls[0]?.[0]?.pipe).toBe("function")
		expect(probeImageSource).not.toHaveBeenCalled()
		const coverMeta = JSON.parse(patches.at(-1)?.coverMeta ?? "{}") as {
			kind: string
			width?: number
			height?: number
			source?: string
		}
		expect(coverMeta).toMatchObject({
			kind: "video",
			source: "clip.mp4",
		})
		expect(coverMeta.width).toBeTypeOf("number")
		expect(coverMeta.height).toBeTypeOf("number")
	})

	test("rebuildCoverMeta does not bump updatedAt", async () => {
		const view = mockZipView()
		row = makeRow({ updatedAt: 42 })
		const ops = buildOps(view)
		await ops.rebuildCoverMeta("res-1")

		expect(row.updatedAt).toBe(42)
		expect(patches.at(-1)).not.toHaveProperty("updatedAt")
	})

	test("permanent image cover keeps video kind from buildLocalCover", async () => {
		const view = mockZipView()
		const repo = {
			findById: () => row,
			patchMeta: (_id: string, patch: Record<string, string | null>) => {
				patches.push(patch)
				row = { ...row, ...patch } as ResRow
			},
		}
		const api: ResourceAPI = {
			logInfo() {},
			logWarn() {},
			logError() {},
			async listFiles() {
				return ["clip.mp4"]
			},
			async readFile() {
				return new Uint8Array()
			},
			async statFile() {
				return { sizeBytes: 1 }
			},
			async probeImage() {
				return undefined
			},
			async probeVideo() {
				return undefined
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
		const ops = buildResMetaOps({
			repo: repo as never,
			now: () => 1,
			pluginRegistry: registry as PluginRegistry,
			createResourceAPI: async () => api,
			resolveSourceView: async () => view,
			findCover: async () => "/fake/.cover.jpg",
		})
		await ops.rebuildCoverMeta("res-1")

		expect(probeImageSource).toHaveBeenCalledWith("/fake/.cover.jpg", ".jpg")
		expect(probeVideo).toHaveBeenCalledTimes(1)
		expect(typeof probeVideo.mock.calls[0]?.[0]?.pipe).toBe("function")
		const coverMeta = JSON.parse(patches.at(-1)?.coverMeta ?? "{}") as {
			kind: string
			width?: number
			height?: number
			source?: string
		}
		expect(coverMeta).toMatchObject({
			kind: "video",
			source: "clip.mp4",
			width: 100,
			height: 100,
		})
	})
})
