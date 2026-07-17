import { expect, test } from "@playwright/test"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

async function login(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/")
	await expect(page).toHaveURL(/\/login$/)
	await page.getByLabel(/password/i).fill(PASSWORD)
	await page.getByTestId("login-submit").click()
	await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible()
}

test.describe("tags integration on create pages", () => {
	test.setTimeout(60_000)

	test("character /new page renders the tag picker", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/characters/new")
		await expect(page.getByTestId("create-character-tags")).toBeVisible()
	})

	test("resource /new page renders the tag picker", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/resources/new")
		await expect(page.getByTestId("create-resource-tags")).toBeVisible()
	})
})
