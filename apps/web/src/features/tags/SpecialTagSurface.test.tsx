import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TAG_SPECIAL_STYLES } from "@/lib/colors"
import { SpecialTagSurface } from "./SpecialTagSurface"

/**
 * @vitest-environment jsdom
 */
describe("SpecialTagSurface", () => {
	it("renders every registered special style", () => {
		for (const style of TAG_SPECIAL_STYLES) {
			const { container } = render(<SpecialTagSurface style={style} />)
			expect(container.querySelector("svg")).toBeInTheDocument()
		}
	})

	it("renders active state for every registered special style", () => {
		for (const style of TAG_SPECIAL_STYLES) {
			const { container } = render(<SpecialTagSurface style={style} active />)
			expect(container.querySelector("svg")).toBeInTheDocument()
		}
	})
})
