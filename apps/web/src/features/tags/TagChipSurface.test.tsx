import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TAG_SPECIAL_STYLES } from "@/lib/colors"
import { TagChipSurface } from "./TagChipSurface"

/**
 * @vitest-environment jsdom
 */
describe("TagChipSurface", () => {
	it("renders normal colored chips", () => {
		const { container } = render(
			<TagChipSurface color="#E74C3C">tag</TagChipSurface>,
		)
		const chip = container.firstElementChild
		expect(chip).toHaveTextContent("tag")
		expect(chip).toHaveStyle({
			color: "#E74C3C",
			backgroundColor: expect.stringContaining("#E74C3C"),
		})
	})

	it("renders every registered special style with an SVG surface", () => {
		for (const style of TAG_SPECIAL_STYLES) {
			const { container } = render(
				<TagChipSurface color={style}>tag</TagChipSurface>,
			)
			expect(container.querySelector("svg")).toBeInTheDocument()
		}
	})

	it("falls back to the default palette when color is empty", () => {
		const { container } = render(<TagChipSurface color="">tag</TagChipSurface>)
		const chip = container.firstElementChild
		expect(chip).toHaveTextContent("tag")
	})
})
