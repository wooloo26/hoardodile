import { expect, test } from "@playwright/test"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

async function login(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/")
	await expect(page).toHaveURL(/\/login$/)
	await page.getByLabel(/password/i).fill(PASSWORD)
	await page.getByTestId("login-submit").click()
	await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible()
}

test.describe("characters create flow", () => {
	test.setTimeout(60_000)

	test("create with explicit name lands on detail page", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)

		await page.goto("/characters")
		await page.getByTestId("new-character").click()
		await expect(page).toHaveURL(/\/characters\/new$/)

		const name = `e2e-${Date.now()}`
		await page.getByTestId("create-character-name").fill(name)
		await page.getByTestId("create-character-intro").fill("hello")
		await page.getByTestId("create-character-submit").click()

		await expect(page).toHaveURL(/\/characters\/[^/]+$/)
		await expect(page.getByTestId("character-detail-name")).toHaveText(name)
	})

	test("name defaults to formatted timestamp when left blank", async ({
		page,
	}) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/characters/new")

		await page.getByTestId("create-character-submit").click()

		await expect(page).toHaveURL(/\/characters\/[^/]+$/)
		await expect(page.getByTestId("character-detail-name")).toHaveText(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
		)
	})
})
