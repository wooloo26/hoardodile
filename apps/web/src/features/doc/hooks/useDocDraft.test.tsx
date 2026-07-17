import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createRef, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { draftStore } from "../draftStore"
import {
	computeHasCommittableChange,
	contentEquals,
	type DocDraftInput,
	useDocDraft,
} from "./useDocDraft"

vi.mock("@/trpc/factory", () => ({
	trpcMutation: vi.fn(),
	trpcQuery: vi.fn(),
	idMutation: vi.fn(),
}))

const patchMutate =
	vi.fn<
		(input: {
			id: string
			title?: string
			content?: Record<string, unknown>
		}) => Promise<unknown>
	>()

const commitMutate =
	vi.fn<(input: { id: string; message?: string }) => Promise<unknown>>()
const discardMutate =
	vi.fn<
		(id: string) => Promise<{ title: string; content: Record<string, unknown> }>
	>()

import { trpcMutation } from "@/trpc/factory"

beforeEach(async () => {
	vi.clearAllMocks()
	patchMutate.mockReset()
	patchMutate.mockResolvedValue({})
	commitMutate.mockReset()
	commitMutate.mockResolvedValue({})
	discardMutate.mockReset()
	discardMutate.mockResolvedValue({
		title: "Discarded",
		content: { blocks: [] },
	})
	vi.mocked(trpcMutation).mockImplementation((namespace, procedure) => {
		if (namespace === "document" && procedure === "patchDraft") {
			return {
				mutationFn: patchMutate,
			} as unknown as ReturnType<typeof trpcMutation>
		}
		if (namespace === "document" && procedure === "commitDraft") {
			return {
				mutationFn: commitMutate,
			} as unknown as ReturnType<typeof trpcMutation>
		}
		if (namespace === "document" && procedure === "discardDraft") {
			return {
				mutationFn: discardMutate,
			} as unknown as ReturnType<typeof trpcMutation>
		}
		return {
			mutationFn: vi.fn(() => Promise.resolve({})),
		} as unknown as ReturnType<typeof trpcMutation>
	})
	await draftStore.__resetForTests()
})

function createWrapper(qc: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
	}
}

function setup(
	overrides: Partial<DocDraftInput> & {
		readonly id: string
		readonly draft: NonNullable<DocDraftInput["draft"]>
	},
) {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const base: DocDraftInput = {
		id: overrides.id,
		draft: overrides.draft,
		autosaveEnabled: overrides.autosaveEnabled ?? false,
		latestVersionAt: overrides.latestVersionAt,
		editorHandleRef: overrides.editorHandleRef ?? createRef(),
		qc: overrides.qc ?? qc,
	}
	const rendered = renderHook((props: DocDraftInput) => useDocDraft(props), {
		wrapper: createWrapper(qc),
		initialProps: base,
	})
	return { ...rendered, qc, baseProps: base }
}

describe("computeHasCommittableChange", () => {
	it("is true when there are unsaved edits", () => {
		expect(
			computeHasCommittableChange({
				dirty: true,
				draft: { updatedAt: 100 },
				latestVersionAt: 200,
			}),
		).toBe(true)
	})

	it("is false when there is no draft", () => {
		expect(
			computeHasCommittableChange({
				dirty: false,
				draft: undefined,
				latestVersionAt: undefined,
			}),
		).toBe(false)
	})

	it("is true when there is a draft but no version yet (first commit)", () => {
		expect(
			computeHasCommittableChange({
				dirty: false,
				draft: { updatedAt: 100 },
				latestVersionAt: undefined,
			}),
		).toBe(true)
	})

	it("is true when the saved draft is newer than the latest version", () => {
		expect(
			computeHasCommittableChange({
				dirty: false,
				draft: { updatedAt: 200 },
				latestVersionAt: 100,
			}),
		).toBe(true)
	})

	it("is false when the latest version already covers the draft", () => {
		expect(
			computeHasCommittableChange({
				dirty: false,
				draft: { updatedAt: 100 },
				latestVersionAt: 200,
			}),
		).toBe(false)
	})
})

describe("contentEquals", () => {
	it("returns false when the prior baseline is missing", () => {
		expect(contentEquals({ blocks: [] }, undefined)).toBe(false)
	})

	it("returns true for structurally equal payloads", () => {
		const a = { blocks: [{ type: "paragraph" }] }
		const b = { blocks: [{ type: "paragraph" }] }
		expect(contentEquals(a, b)).toBe(true)
	})

	it("returns false for differing payloads", () => {
		expect(
			contentEquals(
				{ blocks: [{ type: "paragraph" }] },
				{ blocks: [{ type: "heading" }] },
			),
		).toBe(false)
	})

	it("does not throw on circular references", () => {
		const a: Record<string, unknown> = { type: "block" }
		a.self = a
		const b: Record<string, unknown> = { type: "block" }
		expect(() => contentEquals(a, b)).not.toThrow()
		expect(contentEquals(a, b)).toBe(false)
	})
})

describe("useDocDraft", () => {
	const draftA = {
		title: "A",
		content: { blocks: [{ type: "paragraph", content: "A" }] },
		updatedAt: 1,
	}
	const draftB = {
		title: "B",
		content: { blocks: [{ type: "paragraph", content: "B" }] },
		updatedAt: 1,
	}
	const modifiedContent = {
		blocks: [{ type: "paragraph", content: "MODIFIED" }],
	}

	it("marks dirty when title changes and saves title through manualSave", async () => {
		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		expect(result.current.dirty).toBe(false)

		act(() => result.current.setTitleInput("B"))
		expect(result.current.dirty).toBe(true)

		act(() => result.current.manualSave())
		await waitFor(() => expect(patchMutate).toHaveBeenCalled())
		expect(patchMutate.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({ id: "docA", title: "B" }),
		)
	})

	it("autosaves title changes after debounce when autosave is enabled", async () => {
		const { result } = setup({
			id: "docA",
			draft: draftA,
			autosaveEnabled: true,
		})
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		expect(result.current.dirty).toBe(false)
		expect(patchMutate).not.toHaveBeenCalled()

		act(() => result.current.setTitleInput("B"))
		expect(result.current.dirty).toBe(true)
		expect(patchMutate).not.toHaveBeenCalled()

		await waitFor(() => expect(patchMutate).toHaveBeenCalled(), {
			timeout: 1200,
		})
		expect(patchMutate.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({ id: "docA", title: "B" }),
		)
	})

	it("restores the current doc offline draft when it is newer than the server draft", async () => {
		const cachedContent = {
			blocks: [{ type: "paragraph", content: "CACHED" }],
		}
		await draftStore.setCurrent("docA", {
			title: "Cached title",
			content: cachedContent,
			savedAt: Date.now(),
		})

		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		expect(result.current.titleInput).toBe("Cached title")
		expect(result.current.dirty).toBe(true)
		expect(result.current.initialContent).toEqual(cachedContent)
	})

	it("ignores an offline draft belonging to another document", async () => {
		await draftStore.setCurrent("other-doc", {
			title: "Other",
			content: { blocks: [{ type: "paragraph", content: "OTHER" }] },
			savedAt: Date.now(),
		})

		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		expect(result.current.titleInput).toBe(draftA.title)
		expect(result.current.dirty).toBe(false)
		await waitFor(async () =>
			expect(await draftStore.getCurrent()).toBeUndefined(),
		)
	})

	it("clears the offline draft after a successful manual save", async () => {
		await draftStore.setCurrent("docA", {
			title: draftA.title,
			content: modifiedContent,
			savedAt: Date.now(),
		})

		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		expect(result.current.dirty).toBe(true)

		await act(async () => {
			await result.current.manualSaveAsync()
		})

		expect(patchMutate).toHaveBeenCalled()
		expect(result.current.dirty).toBe(false)
		expect(await draftStore.getCurrent()).toBeUndefined()
	})

	it("discardUnsaved resets the UI to the server draft without calling the server", async () => {
		const editorRef = createRef<{
			replaceContent: (content: Record<string, unknown>) => void
		}>()
		const replaceContent = vi.fn()
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		editorRef.current = { replaceContent } as any

		const { result } = setup({
			id: "docA",
			draft: draftA,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			editorHandleRef: editorRef as any,
		})
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		act(() => result.current.setTitleInput("Changed"))
		act(() => result.current.onContentChange(modifiedContent))
		expect(result.current.dirty).toBe(true)

		act(() => result.current.discardUnsaved())

		expect(replaceContent).toHaveBeenCalledWith(draftA.content)
		expect(result.current.titleInput).toBe(draftA.title)
		expect(result.current.dirty).toBe(false)
		expect(patchMutate).not.toHaveBeenCalled()
		await waitFor(async () =>
			expect(await draftStore.getCurrent()).toBeUndefined(),
		)
	})

	it("collapses dirty when content matches the saved baseline", async () => {
		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		act(() => result.current.onContentChange(modifiedContent))
		expect(result.current.dirty).toBe(true)

		act(() => result.current.onContentChange(draftA.content))
		expect(result.current.dirty).toBe(false)
	})

	it("cancels the pending autosave timer when doc id changes", async () => {
		const { result, rerender, baseProps } = setup({
			id: "docA",
			draft: draftA,
			autosaveEnabled: true,
		})
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		act(() => result.current.onContentChange(modifiedContent))

		rerender({ ...baseProps, id: "docB", draft: draftB, autosaveEnabled: true })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		// Wait longer than the autosave debounce window.
		await new Promise((r) => setTimeout(r, 1200))

		expect(patchMutate).not.toHaveBeenCalled()
	})

	it("keeps titleInput when a refetched draft matches the just-saved baseline", async () => {
		patchMutate.mockResolvedValueOnce({ updatedAt: 2 })
		const { result, rerender, baseProps } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		act(() => result.current.setTitleInput("B"))

		await act(async () => {
			await result.current.manualSaveAsync()
		})

		// Simulate a background refetch that returns a new draft timestamp.
		// The title in the refetched draft is stale relative to the user's input,
		// but because the timestamp matches the just-saved baseline the hook
		// must not reset titleInput.
		rerender({ ...baseProps, draft: { ...draftA, title: "A", updatedAt: 2 } })

		await waitFor(() => expect(result.current.titleInput).toBe("B"))
	})

	it("preserves title keystrokes typed while the save is in flight", async () => {
		patchMutate.mockImplementationOnce(
			async () =>
				new Promise((resolve) => {
					setTimeout(() => resolve({ updatedAt: 2 }), 100)
				}),
		)
		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		act(() => result.current.setTitleInput("B"))

		const savePromise = act(async () => {
			await result.current.manualSaveAsync()
		})

		// Simulate typing more while the patch request is pending.
		act(() => result.current.setTitleInput("BC"))

		await savePromise

		// The later keystroke must survive the post-save normalization.
		expect(result.current.titleInput).toBe("BC")
	})

	it("preserves content edits typed while the save is in flight", async () => {
		patchMutate.mockImplementationOnce(
			async () =>
				new Promise((resolve) => {
					setTimeout(() => resolve({ updatedAt: 2 }), 100)
				}),
		)
		const { result } = setup({ id: "docA", draft: draftA })
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		act(() => result.current.onContentChange(modifiedContent))

		const savePromise = act(async () => {
			await result.current.manualSaveAsync()
		})

		const newerContent = {
			blocks: [{ type: "paragraph", content: "NEWER" }],
		}
		act(() => result.current.onContentChange(newerContent))

		await savePromise

		// The newer edit must stay pending so the UI still reports unsaved changes.
		expect(result.current.dirty).toBe(true)
	})

	it("does not restore a debounced offline snapshot over the title being edited", async () => {
		const { result } = setup({
			id: "docA",
			draft: draftA,
			autosaveEnabled: false,
		})
		await waitFor(() => expect(result.current.isCacheLoading).toBe(false))

		// Seed a stale offline snapshot and dirty the local title.
		await draftStore.setCurrent("docA", {
			title: "SNAPSHOT",
			content: modifiedContent,
			savedAt: Date.now(),
		})
		act(() => result.current.setTitleInput("EDITED"))
		expect(result.current.dirty).toBe(true)

		// Trigger a debounced offline snapshot write. When it lands it would
		// previously reset titleInput to the older SNAPSHOT because
		// offlineEntry.savedAt > draft.updatedAt.
		act(() => result.current.onContentChange(modifiedContent))
		await new Promise((r) => setTimeout(r, 900))

		// The local edit must survive the snapshot reconciliation.
		await waitFor(() => expect(result.current.titleInput).toBe("EDITED"))
	})
})
