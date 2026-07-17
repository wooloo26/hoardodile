import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { DebouncedSearch } from "./DebouncedSearch"

describe("DebouncedSearch", () => {
	test("debounces keystrokes before committing", async () => {
		const user = userEvent.setup()
		const onCommit = vi.fn()
		render(
			<DebouncedSearch
				value=""
				onCommit={onCommit}
				testId="search"
				delayMs={50}
			/>,
		)
		await user.type(screen.getByTestId("search"), "hello")
		expect(onCommit).not.toHaveBeenCalledWith("hello")
		await waitFor(() => {
			expect(onCommit).toHaveBeenCalledWith("hello")
		})
	})

	test("re-syncs with external resets", () => {
		const { rerender } = render(
			<DebouncedSearch value="foo" onCommit={() => {}} testId="search" />,
		)
		const input = screen.getByTestId("search") as HTMLInputElement
		expect(input.value).toBe("foo")
		rerender(<DebouncedSearch value="" onCommit={() => {}} testId="search" />)
		expect(input.value).toBe("")
	})
})
