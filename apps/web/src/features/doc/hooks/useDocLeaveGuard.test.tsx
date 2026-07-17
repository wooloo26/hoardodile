import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDocLeaveGuard } from "./useDocLeaveGuard"

vi.mock("@tanstack/react-router", () => ({
	useBlocker: vi.fn(),
}))

import { useBlocker } from "@tanstack/react-router"

type BlockerOpts = {
	shouldBlockFn: () => boolean
	enableBeforeUnload: () => boolean
}

function lastBlockerOpts(): BlockerOpts {
	const call = vi.mocked(useBlocker).mock.calls.at(-1)?.[0]
	return call as unknown as BlockerOpts
}

beforeEach(() => {
	vi.mocked(useBlocker).mockClear()
})

describe("useDocLeaveGuard", () => {
	it("blocks navigation when dirty and the user cancels the system confirm", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
		renderHook(() =>
			useDocLeaveGuard({ dirty: true, message: "Leave anyway?" }),
		)

		const opts = lastBlockerOpts()
		expect(opts.enableBeforeUnload()).toBe(true)
		expect(opts.shouldBlockFn()).toBe(true)
		expect(confirmSpy).toHaveBeenCalledWith("Leave anyway?")

		confirmSpy.mockRestore()
	})

	it("allows navigation when dirty and the user confirms leave", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
		renderHook(() =>
			useDocLeaveGuard({ dirty: true, message: "Leave anyway?" }),
		)

		const opts = lastBlockerOpts()
		expect(opts.shouldBlockFn()).toBe(false)

		confirmSpy.mockRestore()
	})

	it("does not block or confirm when there are no unsaved changes", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
		renderHook(() =>
			useDocLeaveGuard({ dirty: false, message: "Leave anyway?" }),
		)

		const opts = lastBlockerOpts()
		expect(opts.enableBeforeUnload()).toBe(false)
		expect(opts.shouldBlockFn()).toBe(false)
		expect(confirmSpy).not.toHaveBeenCalled()

		confirmSpy.mockRestore()
	})
})
