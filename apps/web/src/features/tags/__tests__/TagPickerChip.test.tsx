import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { TagPickerChip } from "../TagPickerChip"

function mockBoundingRect(width: number, height: number) {
	const original = Element.prototype.getBoundingClientRect
	Element.prototype.getBoundingClientRect = vi.fn(() =>
		DOMRect.fromRect({ x: 0, y: 0, width, height }),
	)
	return () => {
		Element.prototype.getBoundingClientRect = original
	}
}

describe("TagPickerChip", () => {
	test("interactive mode renders a button that fires onClick", async () => {
		const user = userEvent.setup()
		const onClick = vi.fn()
		render(
			<TagPickerChip onClick={onClick} data-testid="chip">
				hello
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.tagName).toBe("BUTTON")
		await user.click(el)
		expect(onClick).toHaveBeenCalledTimes(1)
	})

	test("display mode renders a span (non-button)", () => {
		render(<TagPickerChip data-testid="chip">hello</TagPickerChip>)
		const el = screen.getByTestId("chip")
		expect(el.tagName).toBe("SPAN")
	})

	test("active default variant uses primary palette", () => {
		render(
			<TagPickerChip active onClick={() => undefined} data-testid="chip">
				x
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.className).toContain("bg-primary")
		expect(el.className).toContain("text-primary-foreground")
		expect(el.className).toContain("border-transparent")
	})

	test("warning idle variant uses destructive border + text", () => {
		render(
			<TagPickerChip variant="warning" data-testid="chip">
				x
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.className).toContain("text-destructive")
		expect(el.className).toContain("border-destructive/60")
	})

	test("warning active variant mirrors active geometry with destructive palette", () => {
		render(
			<TagPickerChip
				active
				variant="warning"
				onClick={() => undefined}
				data-testid="chip"
			>
				x
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.className).toContain("bg-destructive")
		expect(el.className).toContain("border-transparent")
	})

	test("asChild forwards click handlers from the upstream Slot to the inner trigger", async () => {
		// Simulate the DropdownMenuTrigger asChild pattern by injecting an
		// onClick at the wrapper level the same way Radix's Slot would.
		const user = userEvent.setup()
		const upstreamClick = vi.fn()

		render(
			<TagPickerChip asChild onClick={upstreamClick} data-testid="chip">
				<button type="button">trigger</button>
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.tagName).toBe("BUTTON")
		await user.click(el)
		expect(upstreamClick).toHaveBeenCalledTimes(1)
	})

	test("roundedRight=false removes the right border-radius", () => {
		render(
			<TagPickerChip roundedRight={false} data-testid="chip">
				x
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.className).toContain("rounded-r-none")
	})

	test("special style renders an SVG gradient surface", () => {
		const restore = mockBoundingRect(100, 36)
		render(
			<TagPickerChip color="rainbow" data-testid="chip">
				rainbow
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.querySelector("svg")).toBeInTheDocument()
		expect(el.querySelector("linearGradient")).toBeInTheDocument()
		restore()
	})

	test("special style active state uses the active fill", () => {
		const restore = mockBoundingRect(100, 36)
		render(
			<TagPickerChip color="gold" active data-testid="chip">
				gold
			</TagPickerChip>,
		)
		const rect = screen.getByTestId("chip").querySelector("rect")
		expect(rect).toHaveAttribute("fill", "#8a6d1f")
		restore()
	})

	test("special style does not apply the regular border class", () => {
		render(
			<TagPickerChip color="silver" data-testid="chip">
				silver
			</TagPickerChip>,
		)
		const el = screen.getByTestId("chip")
		expect(el.className).not.toContain("border-transparent")
		expect(el.className).not.toContain(" bg-(--chip-bg)")
	})
})
