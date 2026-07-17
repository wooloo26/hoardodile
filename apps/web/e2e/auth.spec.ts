import { expect, test } from "@playwright/test"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

test.describe("auth flow", () => {
	test("rejects the wrong password and keeps the user on /login", async ({
		page,
	}) => {
		await page.goto("/")
		await expect(page).toHaveURL(/\/login$/)
		await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible()

		await page.getByLabel(/password/i).fill("definitely-wrong")
		await page.getByTestId("login-submit").click()

		const error = page.getByRole("alert")
		await expect(error).toBeVisible()
		await expect(error).toContainText(/incorrect/i)
		await expect(page).toHaveURL(/\/login$/)
	})

	test("accepts the correct password and lands on /", async ({ page }) => {
		expect(
			PASSWORD,
			"E2E_TEST_PASSWORD must be set by the Playwright config",
		).not.toBe("")

		await page.goto("/")
		await expect(page).toHaveURL(/\/login$/)

		await page.getByLabel(/password/i).fill(PASSWORD)
		await page.getByTestId("login-submit").click()

		await expect(
			page.getByRole("navigation", { name: /primary/i }),
		).toBeVisible()
		await expect(page).toHaveURL("/")
	})
})
