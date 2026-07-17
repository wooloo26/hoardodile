import { expect, test } from "@playwright/test"
import { resourceIdFromTrpcCreateResponse } from "./trpcResourceCreate"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

// 1x1 PNG used as the upload payload. Tiny so the staging step is fast.
const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64")

async function login(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/")
	await expect(page).toHaveURL(/\/login$/)
	await page.getByLabel(/password/i).fill(PASSWORD)
	await page.getByTestId("login-submit").click()
	await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible()
}

test.describe("resources create flow", () => {
	test.setTimeout(60_000)

	test("upload via /resources/new with explicit name", async ({ page }) => {
		expect(PASSWORD).not.toBe("")
		await login(page)

		await page.goto("/resources")
		await page.getByTestId("open-create-resource").click()
		await expect(page).toHaveURL(/\/resources\/new$/)

		await page.getByTestId("create-resource-files").setInputFiles({
			name: "pixel.png",
			mimeType: "image/png",
			buffer: TINY_PNG,
		})
		await expect(page.getByTestId("create-resource-file-count")).toHaveText(
			/总共 1 个文件|1 files in total/,
		)

		const explicitName = `e2e-${Date.now()}`
		await page.getByTestId("create-resource-name").fill(explicitName)
		await page.getByTestId("create-resource-intro").fill("hello")
		await page
			.getByTestId("create-resource-content-type")
			.selectOption("gallery")

		const createResPromise = page.waitForResponse(
			(res) =>
				res.url().includes("/trpc") &&
				res.url().includes("resource.create") &&
				res.request().method() === "POST" &&
				res.status() === 200,
		)
		await page.getByTestId("create-resource-submit").click()
		const createRes = await createResPromise
		const createdId = await resourceIdFromTrpcCreateResponse(createRes)
		expect(createdId).toBeDefined()

		await expect(page).toHaveURL(/\/resources\/new$/)
		await expect(page.getByTestId("create-resource-name")).toHaveValue(
			explicitName,
		)
		await expect(page.getByTestId("create-resource-intro")).toHaveValue("hello")
		await expect(page.getByTestId("create-resource-file-count")).toHaveText(
			/总共 0 个文件|0 files in total/,
		)
		await expect(page.getByTestId("create-resource-submit")).toBeDisabled()

		await page.goto(`/resources/${createdId}`)
		await expect(page.getByTestId("resource-detail-name")).toHaveText(
			explicitName,
		)
	})

	test("name defaults to formatted timestamp when left blank", async ({
		page,
	}) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/resources/new")

		await page.getByTestId("create-resource-files").setInputFiles({
			name: "pixel.png",
			mimeType: "image/png",
			buffer: TINY_PNG,
		})
		const createResPromise = page.waitForResponse(
			(res) =>
				res.url().includes("/trpc") &&
				res.url().includes("resource.create") &&
				res.request().method() === "POST" &&
				res.status() === 200,
		)
		await page.getByTestId("create-resource-submit").click()
		const createRes = await createResPromise
		const createdId = await resourceIdFromTrpcCreateResponse(createRes)
		expect(createdId).toBeDefined()

		await expect(page).toHaveURL(/\/resources\/new$/)
		await expect(page.getByTestId("create-resource-submit")).toBeDisabled()

		await page.goto(`/resources/${createdId}`)
		// `yyyy-MM-dd HH:mm:ss` produced by the server fallback.
		await expect(page.getByTestId("resource-detail-name")).toHaveText(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
		)
	})

	test("submit is disabled until at least one file is selected", async ({
		page,
	}) => {
		expect(PASSWORD).not.toBe("")
		await login(page)
		await page.goto("/resources/new")

		await expect(page.getByTestId("create-resource-submit")).toBeDisabled()

		await page.getByTestId("create-resource-files").setInputFiles({
			name: "pixel.png",
			mimeType: "image/png",
			buffer: TINY_PNG,
		})
		await expect(page.getByTestId("create-resource-submit")).toBeEnabled()
	})
})
