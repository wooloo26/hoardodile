import { describe, expect, it } from "vitest"
import { useActiveGate } from "./useActiveGate"

describe("useActiveGate", () => {
	it("returns true when both gates are open", () => {
		expect(useActiveGate({ enabled: true, active: true })).toBe(true)
	})

	it("returns false when enabled is false", () => {
		expect(useActiveGate({ enabled: false, active: true })).toBe(false)
	})

	it("returns false when active is false", () => {
		expect(useActiveGate({ enabled: true, active: false })).toBe(false)
	})

	it("returns false when idle is true", () => {
		expect(useActiveGate({ enabled: true, active: true, idle: true })).toBe(
			false,
		)
	})

	it("defaults missing gates to true", () => {
		expect(useActiveGate({})).toBe(true)
	})
})
