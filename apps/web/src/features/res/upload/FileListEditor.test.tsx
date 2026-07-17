import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FileListEditor, type FileListEntry } from "./FileListEditor"

function entry(name: string): FileListEntry {
	return { id: name, file: new File(["x"], name, { type: "image/png" }) }
}

describe("FileListEditor", () => {
	it("renders tiles in displayOrder", () => {
		const entries = [entry("a.png"), entry("b.png")]
		render(
			<FileListEditor
				entries={entries}
				displayOrder={[1, 0]}
				onEntriesChange={vi.fn()}
				onOrderChange={vi.fn()}
				stagingComplete
			/>,
		)

		const strip = screen.getByTestId("upload-file-strip")
		const tiles = strip.querySelectorAll("[data-testid^='upload-file-thumb-']")
		expect(tiles[0]?.getAttribute("data-testid")).toBe(
			"upload-file-thumb-b.png",
		)
		expect(tiles[1]?.getAttribute("data-testid")).toBe(
			"upload-file-thumb-a.png",
		)
	})

	it("maps progress by displayOrder source index", () => {
		const entries = [entry("a.png"), entry("b.png")]
		render(
			<FileListEditor
				entries={entries}
				displayOrder={[1, 0]}
				onEntriesChange={vi.fn()}
				onOrderChange={vi.fn()}
				fileProgresses={[0.2, 0.8]}
				stagingComplete
			/>,
		)

		// First visible tile is entries[1] (b.png), whose progress is at index 1.
		const bars = screen.getAllByTestId("upload-file-thumb-b.png")
		expect(bars.length).toBeGreaterThan(0)
	})

	it("removes an entry and updates order", async () => {
		const onEntriesChange = vi.fn()
		const onOrderChange = vi.fn()
		const entries = [entry("a.png"), entry("b.png"), entry("c.png")]
		render(
			<FileListEditor
				entries={entries}
				displayOrder={[0, 2, 1]}
				onEntriesChange={onEntriesChange}
				onOrderChange={onOrderChange}
				stagingComplete
			/>,
		)

		const removeButton = screen
			.getByTestId("upload-file-thumb-b.png")
			.querySelector("button")
		expect(removeButton).not.toBeNull()
		await userEvent.click(removeButton!)

		expect(onEntriesChange).toHaveBeenCalledWith([entries[0], entries[2]])
		expect(onOrderChange).toHaveBeenCalledWith([0, 1])
	})

	it("clears all entries and order", async () => {
		const onEntriesChange = vi.fn()
		const onOrderChange = vi.fn()
		const entries = [entry("a.png")]
		render(
			<FileListEditor
				entries={entries}
				onEntriesChange={onEntriesChange}
				onOrderChange={onOrderChange}
				stagingComplete
			/>,
		)

		await userEvent.click(screen.getByTestId("upload-clear-all"))

		expect(onEntriesChange).toHaveBeenCalledWith([])
		expect(onOrderChange).toHaveBeenCalledWith([])
	})

	it("adds files and appends to order", async () => {
		const onEntriesChange = vi.fn()
		const onOrderChange = vi.fn()
		const entries = [entry("a.png")]
		render(
			<FileListEditor
				entries={entries}
				onEntriesChange={onEntriesChange}
				onOrderChange={onOrderChange}
				stagingComplete
			/>,
		)

		const input = screen.getByTestId("create-resource-files")
		const file = new File(["x"], "b.png", { type: "image/png" })
		await fireEvent.change(input, { target: { files: [file] } })

		expect(onEntriesChange).toHaveBeenCalled()
		const passedEntries = onEntriesChange.mock.calls[0]?.[0] as
			| FileListEntry[]
			| undefined
		expect(passedEntries?.length).toBe(2)
		expect(passedEntries?.[0]).toBe(entries[0])
		expect(passedEntries?.[1]?.file).toBe(file)

		expect(onOrderChange).toHaveBeenCalledWith([0, 1])
	})
})
