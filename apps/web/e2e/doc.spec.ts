import { expect, test } from "@playwright/test"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

async function login(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/")
	await expect(page).toHaveURL(/\/login$/)
	await page.getByLabel(/password/i).fill(PASSWORD)
	await page.getByTestId("login-submit").click()
	await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible()
}

test.describe("documents flow", () => {
	test.setTimeout(60_000)

	test("navigate to documents from overview", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)

		await page.goto("/documents")
		await expect(page).toHaveURL(/\/documents$/)
		await expect(page.getByTestId("documents-heading")).toBeVisible()
	})

	test("create a new document and open the editor", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/documents")

		const title = `e2e-doc-${Date.now()}`
		await page.getByTestId("documents-new-title").fill(title)
		await page.getByTestId("documents-create-doc").click()

		// Should navigate to the document editor.
		await expect(page).toHaveURL(/\/documents\/[^/]+$/)
		await expect(page.getByTestId("document-title")).toHaveValue(title)
	})

	test("create a folder and see it in the list", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/documents")

		const folderName = `e2e-folder-${Date.now()}`
		await page.getByTestId("documents-new-title").fill(folderName)
		await page.getByTestId("documents-create-folder").click()

		// Stays on the list page (folders have no editor).
		await expect(page).toHaveURL(/\/documents$/)
		await expect(
			page.getByTestId("documents-list").getByText(folderName),
		).toBeVisible()
	})

	test("empty list shows empty state message", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/documents")

		// Only visible when the list is actually empty; skip assertion if items exist.
		const list = page.getByTestId("documents-list")
		const empty = page.getByTestId("documents-empty")
		const hasItems = await list.isVisible().catch(() => false)
		if (!hasItems) {
			await expect(empty).toBeVisible()
		}
	})

	test("commit draft creates a version entry", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/documents")

		const title = `e2e-commit-${Date.now()}`
		await page.getByTestId("documents-new-title").fill(title)
		await page.getByTestId("documents-create-doc").click()

		await expect(page).toHaveURL(/\/documents\/[^/]+$/)

		await page.getByTestId("document-commit").click()
		// After commit, versions list should show at least one entry.
		await expect(
			page.getByTestId("document-versions").locator("li").first(),
		).toBeVisible()
	})

	test("switching documents keeps each document's content", async ({
		page,
	}) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/documents")

		const titleA = `e2e-switch-A-${Date.now()}`
		const titleB = `e2e-switch-B-${Date.now()}`

		await page.getByTestId("documents-new-title").fill(titleA)
		await page.getByTestId("documents-create-doc").click()
		await expect(page.getByTestId("document-title")).toHaveValue(titleA)

		const editor = page.locator('[contenteditable="true"]').first()
		await editor.fill("Content for document A")

		// Open a second document without explicitly saving the first.
		await page.goto("/documents")
		await page.getByTestId("documents-new-title").fill(titleB)
		await page.getByTestId("documents-create-doc").click()
		await expect(page.getByTestId("document-title")).toHaveValue(titleB)
		await expect(editor).not.toContainText("Content for document A")

		// Switch back to the first document and ensure its content is intact.
		await page.getByTestId("documents-list").getByText(titleA).click()
		await expect(page.getByTestId("document-title")).toHaveValue(titleA)
		await expect(editor).toContainText("Content for document A")
	})

	test("navigate to AI settings page", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/documents")

		await page.getByTestId("documents-settings").click()
		await expect(page).toHaveURL(/\/documents\/settings$/)
	})
})
