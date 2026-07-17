import { expect, test } from "@playwright/test"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

async function login(page: import("@playwright/test").Page) {
	await page.goto("/")
	await expect(page).toHaveURL(/\/login$/)
	await page.getByLabel(/password/i).fill(PASSWORD)
	await page.getByTestId("login-submit").click()
	await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible()
}

async function openDataHistory(page: import("@playwright/test").Page) {
	await page.goto("/settings")
	await page.getByTestId("me-tab-data").click()
	await expect(page.getByTestId("data-history-section")).toBeVisible()
}

test.describe("data history", () => {
	test.setTimeout(60_000)

	test("create backup → archive → edit notes → delete backup", async ({
		page,
	}) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await openDataHistory(page)

		// Create a backup.
		await page.getByTestId("create-backup").click()
		await expect(page.getByTestId("data-history-timeline")).toBeVisible()
		const backupId = await page
			.getByTestId(/backup-app-.*\.sqlite/)
			.first()
			.getAttribute("data-testid")
		expect(backupId).toMatch(/^backup-app-\d+\.sqlite$/)

		// Select the backup and add a note.
		await page.getByTestId(backupId ?? "").click()
		await page.getByTestId("note-preview").click()
		await page.locator("textarea").fill("migration backup")
		await page.getByTestId("note-save").click()
		await expect(page.getByTestId("note-preview")).toHaveText(
			"migration backup",
		)

		// Create an archive with a note.
		await page.getByTestId("create-archive").click()
		await expect(page.getByTestId("archive-confirm-input")).toBeVisible()
		await page.getByTestId("archive-confirm-input").fill("archive")
		await page.getByTestId("archive-note-input").fill("v1 milestone")
		const reloadAfterArchive = page.waitForEvent("load")
		await page.getByTestId("archive-confirm-submit").click()
		await reloadAfterArchive

		// Reopen the data tab after reload.
		await openDataHistory(page)

		// Delete the backup with typed confirmation.
		await page.getByTestId(backupId ?? "").click()
		const deleteButton = page.getByTestId(/^delete-app-.*\.sqlite$/)
		await deleteButton.click()
		await page.getByTestId("delete-confirm-input").fill("delete backup")
		await page.getByTestId("delete-confirm-submit").click()
		await expect(page.getByTestId(backupId ?? "")).not.toBeVisible()
	})

	test("switch to archive and back", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await openDataHistory(page)

		// Create an archive first.
		await page.getByTestId("create-archive").click()
		await page.getByTestId("archive-confirm-input").fill("archive")
		const reloadAfterArchive = page.waitForEvent("load")
		await page.getByTestId("archive-confirm-submit").click()
		await reloadAfterArchive

		// Reopen the data tab after reload.
		await openDataHistory(page)
		const archiveNode = page.getByTestId("archive-1")
		await archiveNode.waitFor({ state: "visible" })

		// Switch to the archived version.
		const reloadAfterSwitch = page.waitForEvent("load")
		await archiveNode.click()
		await page.getByTestId("switch-1").click()
		await page.getByTestId("switch-confirm-submit").click()
		await reloadAfterSwitch

		// Reopen the data tab and verify read-only status.
		await openDataHistory(page)
		await expect(page.getByTestId("data-history-status")).toContainText(
			"Viewing archive",
			{ timeout: 10_000 },
		)

		// Switch back to the current version so later tests keep R/W mode.
		const currentArchive = page.locator("[data-testid^='archive-']", {
			hasText: /current/i,
		})
		await currentArchive.waitFor({ state: "visible" })
		const reloadAfterReturn = page.waitForEvent("load")
		await currentArchive.click()
		const returnButton = page.locator("[data-testid^='switch-']")
		await returnButton.waitFor({ state: "visible" })
		await returnButton.click()
		await page.getByTestId("switch-confirm-submit").click()
		await reloadAfterReturn
	})
})
