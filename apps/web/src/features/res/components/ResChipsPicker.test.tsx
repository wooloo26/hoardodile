import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import { resKeys } from "@/features/res/api"
import { ResChipsPicker } from "./ResChipsPicker"

vi.mock("@/features/res/components/ResSelectorDialog", () => ({
	ResSelectorDialog: vi.fn(
		(props: {
			readonly open: boolean
			readonly onConfirm: (ids: readonly string[]) => void
		}) =>
			props.open ? (
				<button
					type="button"
					data-testid="mock-confirm"
					onClick={() => props.onConfirm(["extra-res"])}
				>
					confirm
				</button>
			) : null,
	),
}))

function createWrapper() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	for (const id of ["locked-res", "free-res", "extra-res"]) {
		qc.setQueryData(resKeys.detail(id), { id, name: `Res ${id}` })
	}
	return function Wrapper({ children }: { readonly children: ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
	}
}

describe("ResChipsPicker lockedIds", () => {
	test("locked chip has no remove button", () => {
		render(
			<ResChipsPicker
				ids={["locked-res", "free-res"]}
				lockedIds={["locked-res"]}
				onChange={() => undefined}
				testId="picker"
			/>,
			{ wrapper: createWrapper() },
		)
		expect(screen.queryByTestId("picker-chip-locked-res-remove")).toBeNull()
		expect(screen.getByTestId("picker-chip-free-res-remove")).toBeDefined()
	})

	test("removing unlocked id keeps locked ids", async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(
			<ResChipsPicker
				ids={["locked-res", "free-res"]}
				lockedIds={["locked-res"]}
				onChange={onChange}
				testId="picker"
			/>,
			{ wrapper: createWrapper() },
		)
		await user.click(screen.getByTestId("picker-chip-free-res-remove"))
		expect(onChange).toHaveBeenCalledWith(["locked-res"])
	})

	test("selector confirm merges locked ids back in", async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(
			<ResChipsPicker
				ids={["locked-res"]}
				lockedIds={["locked-res"]}
				onChange={onChange}
				testId="picker"
			/>,
			{ wrapper: createWrapper() },
		)
		await user.click(screen.getByTestId("picker-add"))
		await user.click(screen.getByTestId("mock-confirm"))
		expect(onChange).toHaveBeenCalledWith(["locked-res", "extra-res"])
	})
})
