import { StubPluginAPIProvider } from "@hoardodile/plugin-sdk-react"
import type { AnchorData, Message } from "@hoardodile/plugin-sdk-web"
import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NovelReader } from "./NovelReader"

const FILENAME = "chapter.txt"
const TEXT = ["first", "second", "third", "fourth"].join("\n")

type CapturedBodyProps = {
	commentsByParagraph?: ReadonlyMap<number, readonly Message[]>
	scrollToAnchor?: { paragraphIndex: number; fraction: number }
}

const captured = vi.hoisted(function createStore(): CapturedBodyProps {
	return {}
})

// Layout measurement is meaningless under jsdom; stub the body and
// capture the props NovelReader feeds it.
vi.mock("./NovelBody", function mockNovelBody() {
	return {
		NovelBody: function NovelBodyStub(props: {
			readonly commentsByParagraph: ReadonlyMap<number, readonly Message[]>
			readonly scrollToAnchor:
				| { paragraphIndex: number; fraction: number }
				| undefined
		}) {
			captured.commentsByParagraph = props.commentsByParagraph
			captured.scrollToAnchor = props.scrollToAnchor
			return null
		},
	}
})

function encodeText(text: string): ArrayBuffer {
	const bytes = new TextEncoder().encode(text)
	const buffer = new ArrayBuffer(bytes.byteLength)
	new Uint8Array(buffer).set(bytes)
	return buffer
}

function message(id: string, paragraphIndex: number): Message {
	return {
		id,
		body: `comment-${id}`,
		createdAt: 1,
		charIds: [],
		resIds: [],
		likeCount: 0,
		dislikeCount: 0,
		replyCount: 0,
		anchor: { resId: "r-test", data: { paragraphIndex } },
	}
}

function readerElement(
	messages: readonly Message[],
	onAnchorJump?: (cb: (anchor: AnchorData) => void) => () => void,
) {
	return (
		<StubPluginAPIProvider
			api={{
				useFileList: function useFileList() {
					return {
						data: [FILENAME],
						isLoading: false,
						isError: false,
						error: null,
					}
				},
				readFile: async function readFile() {
					return encodeText(TEXT)
				},
				useMessageList: function useMessageList() {
					return {
						data: messages,
						isLoading: false,
						isError: false,
						error: null,
					}
				},
				onAnchorJump,
			}}
		>
			<NovelReader open />
		</StubPluginAPIProvider>
	)
}

describe("NovelReader", () => {
	beforeEach(function reset() {
		captured.commentsByParagraph = undefined
		captured.scrollToAnchor = undefined
	})

	it("feeds useMessageList data into the paragraph comment map", async () => {
		const view = render(readerElement([message("a", 1)]))
		await waitFor(function bodyMounted() {
			expect(captured.commentsByParagraph?.get(1)).toHaveLength(1)
		})

		// A host invalidation delivers the new list through the same hook.
		view.rerender(readerElement([message("a", 1), message("b", 3)]))
		await waitFor(function updated() {
			expect(captured.commentsByParagraph?.get(3)).toHaveLength(1)
		})
	})

	it("scrolls to the paragraph pushed via onAnchorJump", async () => {
		let jumpHandler: ((anchor: AnchorData) => void) | undefined
		render(
			readerElement([], function onAnchorJump(cb) {
				jumpHandler = cb
				return function unsubscribe() {}
			}),
		)
		await waitFor(function bodyMounted() {
			expect(captured.commentsByParagraph).toBeDefined()
		})

		act(function push() {
			jumpHandler?.({ data: { paragraphIndex: 3, filename: FILENAME } })
		})
		expect(captured.scrollToAnchor).toEqual({ paragraphIndex: 3, fraction: 0 })
	})

	it("ignores anchor jumps for other files", async () => {
		let jumpHandler: ((anchor: AnchorData) => void) | undefined
		render(
			readerElement([], function onAnchorJump(cb) {
				jumpHandler = cb
				return function unsubscribe() {}
			}),
		)
		await waitFor(function bodyMounted() {
			expect(captured.commentsByParagraph).toBeDefined()
		})

		act(function push() {
			jumpHandler?.({ data: { paragraphIndex: 2, filename: "other.txt" } })
		})
		expect(captured.scrollToAnchor).toBeUndefined()
	})
})
