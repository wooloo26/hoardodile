import { act, renderHook } from "@testing-library/react"
import { vi } from "vitest"
import { randomUUID } from "@/lib/randomUUID"
import type { FileListEntry } from "./FileListEditor"
import { stageSingleFile } from "./upload"
import { useIncrementalStaging } from "./useIncrementalStaging"

vi.mock("./upload", () => ({
	stageSingleFile: vi.fn(),
}))

const mockedStageSingleFile = vi.mocked(stageSingleFile)

function makeFile(name: string): File {
	return new File(["x"], name, { type: "image/png" })
}

function makeEntry(name: string): FileListEntry {
	return { id: randomUUID(), file: makeFile(name) }
}

function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("useIncrementalStaging", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true })
		mockedStageSingleFile.mockReset()
		mockedStageSingleFile.mockImplementation(async () => ({
			fileId: randomUUID(),
		}))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	test("stages each file independently and exposes aligned fileIds", async () => {
		const a = makeEntry("a.png")
		const b = makeEntry("b.png")
		const { result } = renderHook(
			({ entries }) => useIncrementalStaging(entries, { debounceMs: 100 }),
			{ initialProps: { entries: [a, b] as FileListEntry[] } },
		)

		await act(async () => {
			vi.advanceTimersByTime(150)
			await flushPromises()
		})

		expect(mockedStageSingleFile).toHaveBeenCalledTimes(2)
		expect(result.current.stagingComplete).toBe(true)
		expect(result.current.fileIds).toHaveLength(2)
		expect(result.current.fileIds[0]).toBeDefined()
		expect(result.current.fileIds[1]).toBeDefined()
	})

	test("appending a file stages only the new file", async () => {
		const a = makeEntry("a.png")
		const b = makeEntry("b.png")
		const { rerender, result } = renderHook(
			({ entries }) => useIncrementalStaging(entries, { debounceMs: 100 }),
			{ initialProps: { entries: [a, b] as FileListEntry[] } },
		)

		await act(async () => {
			vi.advanceTimersByTime(150)
			await flushPromises()
		})
		expect(mockedStageSingleFile).toHaveBeenCalledTimes(2)

		const c = makeEntry("c.png")
		rerender({ entries: [a, b, c] })

		await act(async () => {
			vi.advanceTimersByTime(150)
			await flushPromises()
		})

		// Only the appended file is staged.
		expect(mockedStageSingleFile).toHaveBeenCalledTimes(3)
		expect(result.current.fileIds).toHaveLength(3)
		// The first two fileIds are preserved (not re-uploaded).
		expect(result.current.fileIds[0]).toBeDefined()
		expect(result.current.fileIds[1]).toBeDefined()
		expect(result.current.fileIds[2]).toBeDefined()
	})

	test("removing a file drops its local fileId and never re-uploads", async () => {
		const a = makeEntry("a.png")
		const b = makeEntry("b.png")
		const { rerender, result } = renderHook(
			({ entries }) => useIncrementalStaging(entries, { debounceMs: 100 }),
			{ initialProps: { entries: [a, b] as FileListEntry[] } },
		)

		await act(async () => {
			vi.advanceTimersByTime(150)
			await flushPromises()
		})
		expect(mockedStageSingleFile).toHaveBeenCalledTimes(2)

		rerender({ entries: [a] })

		await act(async () => {
			await flushPromises()
		})

		// No new upload happened.
		expect(mockedStageSingleFile).toHaveBeenCalledTimes(2)
		// The removed file's staged fileId is no longer exposed locally.
		expect(result.current.fileIds).toHaveLength(1)
		expect(result.current.fileIds[0]).toBeDefined()
	})

	test("removing a file mid-upload does not abort or surface an error", async () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		const a = makeEntry("a.png")
		const b = makeEntry("b.png")

		let resolveB: (value: { fileId: string }) => void = () => {}
		mockedStageSingleFile.mockImplementation(async (opts) => {
			if (opts.file.name === "b.png") {
				return new Promise<{ fileId: string }>((resolve) => {
					resolveB = resolve
				})
			}
			return { fileId: randomUUID() }
		})

		const { rerender, result } = renderHook(
			({ entries }) => useIncrementalStaging(entries, { debounceMs: 100 }),
			{ initialProps: { entries: [a, b] as FileListEntry[] } },
		)

		await act(async () => {
			vi.advanceTimersByTime(150)
			await flushPromises()
		})

		// Remove b while its upload is still pending.
		rerender({ entries: [a] })

		await act(async () => {
			await flushPromises()
		})

		expect(result.current.fileIds).toHaveLength(1)
		expect(result.current.fileIds[0]).toBeDefined()
		expect(result.current.isStaging).toBe(false)
		expect(result.current.stagingComplete).toBe(true)
		expect(consoleSpy).not.toHaveBeenCalled()

		// Even after the removed upload finally resolves, nothing changes.
		act(() => {
			resolveB({ fileId: randomUUID() })
		})
		await act(async () => {
			await flushPromises()
		})

		expect(result.current.fileIds).toHaveLength(1)
		expect(consoleSpy).not.toHaveBeenCalled()

		consoleSpy.mockRestore()
	})
})
