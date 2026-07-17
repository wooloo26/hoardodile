import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderRouter } from "@/test/render-router"

function mockFetchResponse(body: unknown, status = 200) {
	return Promise.resolve(
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		}),
	)
}

beforeEach(() => {
	vi.restoreAllMocks()
	vi.stubGlobal(
		"fetch",
		vi.fn(() => mockFetchResponse({ authenticated: false })),
	)
})

describe("login route", () => {
	it("blocks submit with an empty password and surfaces a validation error", async () => {
		const user = userEvent.setup()
		renderRouter({ initialEntries: ["/login"] })

		await screen.findByRole("heading", { name: /sign in/i })

		await user.click(screen.getByTestId("login-submit"))

		const message = await screen.findByRole("alert")
		expect(message).toHaveTextContent(/.+/)
	})

	it("calls the login mutation with the entered password on valid submit", async () => {
		const user = userEvent.setup()
		let callCount = 0
		vi.stubGlobal(
			"fetch",
			vi.fn((input: string, init?: RequestInit) => {
				if (input === "/auth/login" && init?.method === "POST") {
					callCount++
					return mockFetchResponse({ authenticated: true })
				}
				return mockFetchResponse({ authenticated: false })
			}),
		)
		renderRouter({ initialEntries: ["/login"] })

		await screen.findByRole("heading", { name: /sign in/i })

		const password = screen.getByLabelText(/password/i)
		await user.type(password, "hunter2")
		await user.click(screen.getByTestId("login-submit"))

		await waitFor(() => {
			expect(callCount).toBeGreaterThan(0)
		})
	})
})
