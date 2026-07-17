import { DropdownMenuItem } from "@hoardodile/ui/components/dropdown-menu"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { TagChipButton } from "../TagChipButton"

function Harness(props: {
	readonly onSelect: () => void
	readonly triggerTestId?: string
}) {
	const [open, setOpen] = useState(false)
	return (
		<TagChipButton
			chip={{ name: "tag-x", color: "#888" }}
			menuOpen={open}
			onMenuOpenChange={setOpen}
			triggerTestId={props.triggerTestId ?? "tag-chip-x"}
		>
			<DropdownMenuItem data-testid="edit-action" onSelect={props.onSelect}>
				edit
			</DropdownMenuItem>
		</TagChipButton>
	)
}

describe("TagChipButton integration with DropdownMenuTrigger", () => {
	test("clicking the chip opens the dropdown and reveals the menu items", async () => {
		const user = userEvent.setup()
		const onSelect = vi.fn()

		render(<Harness onSelect={onSelect} />)

		const trigger = screen.getByTestId("tag-chip-x")
		// Dropdown content is portaled but absent until open.
		expect(screen.queryByTestId("edit-action")).toBeNull()

		await user.click(trigger)
		// Now the menu item should be in the DOM.
		const item = await screen.findByTestId("edit-action")
		await user.click(item)
		expect(onSelect).toHaveBeenCalledTimes(1)
	})

	test("trigger is a button that carries Radix aria attributes", async () => {
		const user = userEvent.setup()
		render(<Harness onSelect={() => undefined} triggerTestId="trigger-a" />)
		const trigger = screen.getByTestId("trigger-a")
		expect(trigger.tagName).toBe("BUTTON")
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu")
		expect(trigger.getAttribute("aria-expanded")).toBe("false")

		await user.click(trigger)
		expect(trigger.getAttribute("aria-expanded")).toBe("true")
	})
})
