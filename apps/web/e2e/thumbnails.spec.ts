import { expect, test } from "@playwright/test"
import { resourceIdFromTrpcCreateResponse } from "./trpcResourceCreate"

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? ""

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

test.describe("thumbnails", () => {
	test.setTimeout(60_000)

	test("thumbnail appears shortly after the new resource is created", async ({
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
		const id = await resourceIdFromTrpcCreateResponse(createRes)
		expect(id).toBeDefined()

		await expect(page).toHaveURL(/\/resources\/new$/)

		// Hop back to the list and assert the matching card's thumb finishes
		// loading (naturalWidth > 0) - synth runs on a queue so we poll.
		await page.goto("/resources")
		const thumb = page.getByTestId(`resource-thumb-img-${id}`)
		await expect(thumb).toBeAttached({ timeout: 20_000 })
		await expect
			.poll(
				async () =>
					thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth),
				{ timeout: 20_000 },
			)
			.toBeGreaterThan(0)

		const src = await thumb.getAttribute("src")
		expect(src).toMatch(/\/api\/resources\/[^/]+\/thumb/)
	})
})
