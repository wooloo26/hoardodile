import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { pluginMethods } from "../../methods"
import type { HandlerContext, HandlerEntry } from "../registry"

vi.mock("@/trpc/factory", () => ({
	trpcQuery: vi.fn(async () => ({ rows: [] })),
	trpcMutate: vi.fn(async () => ({})),
}))

vi.mock("@/features/plugin/iframe/iframe-pool", () => ({
	broadcastToAll: vi.fn(),
}))

vi.mock("@/features/res/api", () => ({
	invalidateResources: vi.fn(async () => {}),
}))

import { invalidateResources } from "@/features/res/api"
import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { createHandlers as createCommentHandlers } from "../comment"
import { createHandlers as createDanmakuHandlers } from "../danmaku"
import { createHandlers as createPreferenceHandlers } from "../preference"
import { createHandlers as createUploadHandlers } from "../upload"

const ctx = {
	source: {} as Window,
	resId: "r-1",
	pluginId: "p-1",
} satisfies HandlerContext

function handlerOf(entries: readonly HandlerEntry[], method: string) {
	const entry = entries.find((e) => e.method === method)
	if (entry === undefined) throw new Error(`handler not found: ${method}`)
	return entry.handler
}

const commentHandlers = createCommentHandlers(new QueryClient())
const danmakuHandlers = createDanmakuHandlers(new QueryClient())
const preferenceHandlers = createPreferenceHandlers(new QueryClient())
const uploadHandlers = createUploadHandlers(new QueryClient())

beforeEach(() => {
	vi.clearAllMocks()
})

// Bridge handlers never trust a resId taken from message params: the
// iframe's registered resource (ctx.resId) is authoritative. A plugin
// that sends a foreign resId is not rejected — the value is simply
// ignored/overridden.
describe("bridge resource scoping", () => {
	it("listMessages serves the iframe's own resource", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.listMessages)
		await handler(ctx, { resId: "r-1" })
		expect(trpcQuery).toHaveBeenCalledWith("comment", "list", {
			resId: "r-1",
		})
	})

	it("listMessages ignores a foreign resId", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.listMessages)
		await handler(ctx, { resId: "other" })
		expect(trpcQuery).toHaveBeenCalledWith("comment", "list", {
			resId: "r-1",
		})
	})

	it("createMessage forwards an anchor on the iframe's resource", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.createMessage)
		await handler(ctx, {
			body: "hello",
			anchor: { resId: "r-1", data: { paragraphIndex: 2 } },
		})
		expect(trpcMutate).toHaveBeenCalledWith("comment", "create", {
			body: "hello",
			anchor: { resId: "r-1", data: { paragraphIndex: 2 } },
			resIds: ["r-1"],
		})
	})

	it("createMessage overrides a foreign anchor resId", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.createMessage)
		await handler(ctx, { body: "hi", anchor: { resId: "other" } })
		expect(trpcMutate).toHaveBeenCalledWith("comment", "create", {
			body: "hi",
			anchor: { resId: "r-1" },
			resIds: ["r-1"],
		})
	})

	it("createMessage without an anchor creates an unanchored message", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.createMessage)
		await handler(ctx, { body: "hello" })
		expect(trpcMutate).toHaveBeenCalledWith("comment", "create", {
			body: "hello",
			anchor: undefined,
			resIds: [],
		})
	})

	it("listDanmaku ignores a foreign resId", async () => {
		const handler = handlerOf(danmakuHandlers, pluginMethods.listDanmaku)
		await handler(ctx, { resId: "other" })
		expect(trpcQuery).toHaveBeenCalledWith("danmaku", "list", {
			anchor: { resId: "r-1" },
		})
	})

	it("createDanmaku overrides a foreign anchor resId", async () => {
		const handler = handlerOf(danmakuHandlers, pluginMethods.createDanmaku)
		await handler(ctx, {
			text: "hi",
			anchor: { resId: "other", data: { timeMs: 1 } },
		})
		expect(trpcMutate).toHaveBeenCalledWith("danmaku", "create", {
			text: "hi",
			anchor: { resId: "r-1", data: { timeMs: 1 } },
			mode: undefined,
		})
	})

	it("setCache ignores a foreign resId", async () => {
		const handler = handlerOf(preferenceHandlers, pluginMethods.setCache)
		await handler(ctx, { resId: "other", key: "position", value: "12" })
		expect(trpcMutate).toHaveBeenCalledWith("pluginPreference", "cacheSet", {
			pluginId: "p-1",
			resId: "r-1",
			key: "position",
			value: "12",
		})
	})

	it("notifyUploadComplete ignores a foreign fileId", async () => {
		const handler = handlerOf(
			uploadHandlers,
			pluginMethods.notifyUploadComplete,
		)
		await handler(ctx, { fileId: "other" })
		expect(invalidateResources).toHaveBeenCalledWith(
			expect.any(QueryClient),
			"r-1",
		)
	})
})
