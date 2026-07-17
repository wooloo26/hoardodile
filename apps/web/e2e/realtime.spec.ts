import { expect, test } from "@playwright/test"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

async function login(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/")
	await expect(page).toHaveURL(/\/login$/)
	await page.getByLabel(/password/i).fill(PASSWORD)
	await page.getByTestId("login-submit").click()
	await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible()
}

test.describe("realtime - two-tab sync", () => {
	test.setTimeout(30_000)

	test("character creation in tab 1 propagates to tab 2 via SSE", async ({
		browser,
	}) => {
		expect(PASSWORD, "E2E_TEST_PASSWORD must be set").not.toBe("")

		const context = await browser.newContext()
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		try {
			await login(tab1)

			await tab1.goto("/characters")
			await tab2.goto("/characters")

			// Wait until tab2's SSE connection is established before mutating.
			await tab2.waitForFunction(
				() => document.documentElement.dataset.sseConnected === "1",
				{ timeout: 5_000 },
			)

			const initialCount = await tab2
				.getByTestId("character-list")
				.locator("li")
				.count()

			// Create in tab1 via the standalone /characters/new page.
			await tab1.getByTestId("new-character").click()
			await expect(tab1).toHaveURL(/\/characters\/new$/)
			await tab1.getByTestId("create-character-submit").click()
			await expect(tab1).toHaveURL(/\/characters\/[^/]+$/)

			// Tab2 should refetch within ~3 s.
			await expect(
				tab2.getByTestId("character-list").locator("li"),
			).toHaveCount(initialCount + 1, { timeout: 3_000 })
		} finally {
			await context.close()
		}
	})
})
