import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ImageCropPanel } from "./ImageCropPanel"

const TALL_IMAGE_SRC =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='2000'%3E%3Crect width='100%25' height='100%25' fill='red'/%3E%3C/svg%3E"

describe("ImageCropPanel", () => {
	it("constrains the image within the provided crop stage bounds", async () => {
		render(
			<ImageCropPanel
				initialSrc={TALL_IMAGE_SRC}
				cropStageWidth={260}
				cropStageHeight={500}
				hideActionButton
				onSave={vi.fn()}
			/>,
		)

		const img = await screen.findByRole("img")
		expect(img).toHaveStyle({
			"max-width": "260px",
			"max-height": "500px",
		})
	})

	it("uses default bounds when crop stage dimensions are omitted", async () => {
		render(
			<ImageCropPanel
				initialSrc={TALL_IMAGE_SRC}
				hideActionButton
				onSave={vi.fn()}
			/>,
		)

		const img = await screen.findByRole("img")
		expect(img).toHaveStyle({
			"max-width": "320px",
			"max-height": "240px",
		})
	})

	it("keeps the crop stage wrapper within the effective bounds", async () => {
		const { container } = render(
			<ImageCropPanel
				initialSrc={TALL_IMAGE_SRC}
				cropStageWidth={200}
				cropStageHeight={200}
				hideActionButton
				onSave={vi.fn()}
			/>,
		)

		const stage = container.querySelector("[data-testid='image-crop-frame']")
		expect(stage).toBeNull()

		const wrapper = container.querySelector(
			".overflow-hidden.rounded-md.border",
		)
		await waitFor(() => expect(wrapper).toBeInTheDocument())
		expect(wrapper).toHaveStyle({
			width: "200px",
			height: "200px",
			"max-width": "200px",
			"max-height": "200px",
		})
	})
})
