import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { pluginMethods } from "../methods"
import type { HandlerContext, HandlerEntry } from "./registry"

vi.mock("@/trpc/factory", () => ({
	trpcQuery: vi.fn(async () => ({ rows: [] })),
	trpcMutate: vi.fn(async () => ({})),
}))

vi.mock("@/features/plugin/iframe/iframe-pool", () => ({
	broadcastToAll: vi.fn(),
}))

import { trpcMutate, trpcQuery } from "@/trpc/factory"
import { createHandlers as createCommentHandlers } from "./comment"
import { createHandlers as createDanmakuHandlers } from "./danmaku"
import { createHandlers as createPreferenceHandlers } from "./preference"

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

beforeEach(() => {
	vi.clearAllMocks()
})

describe("bridge resource scoping", () => {
	it("listMessages serves the iframe's own resource", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.listMessages)
		await handler(ctx, { resId: "r-1" })
		expect(trpcQuery).toHaveBeenCalledWith("comment", "list", {
			resId: "r-1",
		})
	})

	it("listMessages rejects a foreign resource id", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.listMessages)
		await expect(handler(ctx, { resId: "other" })).rejects.toThrow(
			/does not match/,
		)
		expect(trpcQuery).not.toHaveBeenCalled()
	})

	it("createMessage with an own-resource anchor is forwarded", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.createMessage)
		const anchor = { resId: "r-1", data: { paragraphIndex: 2 } }
		await handler(ctx, { body: "hello", anchor })
		expect(trpcMutate).toHaveBeenCalledWith("comment", "create", {
			body: "hello",
			anchor,
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

	it("createMessage rejects an anchor on a foreign resource", async () => {
		const handler = handlerOf(commentHandlers, pluginMethods.createMessage)
		await expect(
			handler(ctx, { body: "hi", anchor: { resId: "other" } }),
		).rejects.toThrow(/does not match/)
		expect(trpcMutate).not.toHaveBeenCalled()
	})

	it("listDanmaku serves the iframe's own resource", async () => {
		const handler = handlerOf(danmakuHandlers, pluginMethods.listDanmaku)
		await handler(ctx, { resId: "r-1" })
		expect(trpcQuery).toHaveBeenCalledWith("danmaku", "list", {
			anchor: { resId: "r-1" },
		})
	})

	it("listDanmaku rejects a foreign resource id", async () => {
		const handler = handlerOf(danmakuHandlers, pluginMethods.listDanmaku)
		await expect(handler(ctx, { resId: "other" })).rejects.toThrow(
			/does not match/,
		)
		expect(trpcQuery).not.toHaveBeenCalled()
	})

	it("createDanmaku rejects an anchor on a foreign resource", async () => {
		const handler = handlerOf(danmakuHandlers, pluginMethods.createDanmaku)
		await expect(
			handler(ctx, { text: "hi", anchor: { resId: "other" } }),
		).rejects.toThrow(/does not match/)
		expect(trpcMutate).not.toHaveBeenCalled()
	})

	it("setCache serves the iframe's own resource", async () => {
		const handler = handlerOf(preferenceHandlers, pluginMethods.setCache)
		await handler(ctx, { resId: "r-1", key: "position", value: "12" })
		expect(trpcMutate).toHaveBeenCalledWith("pluginPreference", "cacheSet", {
			pluginId: "p-1",
			resId: "r-1",
			key: "position",
			value: "12",
		})
	})

	it("setCache rejects a foreign resource id", async () => {
		const handler = handlerOf(preferenceHandlers, pluginMethods.setCache)
		await expect(
			handler(ctx, { resId: "other", key: "position", value: "12" }),
		).rejects.toThrow(/does not match/)
		expect(trpcMutate).not.toHaveBeenCalled()
	})
})
