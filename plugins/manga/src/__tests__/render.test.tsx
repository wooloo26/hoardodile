import {
	createWebPluginAPI,
	PluginAPIProvider,
} from "@hoardodile/plugin-sdk-react"
import { render, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MangaReader } from "../render/MangaReader"
import type { MangaPage } from "../shared"

function page(filename: string): MangaPage {
	return { filename, type: "image", preview: true }
}

function wrapWithAPI(
	api: ReturnType<typeof createWebPluginAPI>,
	children: React.ReactNode,
) {
	return <PluginAPIProvider value={api}>{children}</PluginAPIProvider>
}

describe("manga render", () => {
	it("module can be imported", async () => {
		const mod = await import("../render.tsx")
		expect(mod).toBeDefined()
	})

	it("shows skeleton when files list is loading", async () => {
		const api = createWebPluginAPI({
			resource: {
				id: "r-test",
				name: "test",
				sourceMeta: {
					previews: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				},
				searchMeta: undefined,
				fileStats: { count: 200 },
				contentPluginId: "p-test",
			},
			useFileList: () => ({
				data: undefined,
				isLoading: true,
				isError: false,
				error: null,
			}),
		})
		const { queryByTestId } = render(wrapWithAPI(api, <MangaReader />))
		// Top bar is visible during skeleton; the page content area is skeleton
		await waitFor(() => {
			expect(queryByTestId("manga-mode-toggle")).not.toBeNull()
			expect(queryByTestId("manga-page-indicator")).not.toBeNull()
		})
	})

	it("renders the chrome when files list has resolved", async () => {
		const api = createWebPluginAPI({
			resource: {
				...createWebPluginAPI().resource,
				fileStats: { count: 3 },
			},
			useFileList: () => ({
				data: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				isLoading: false,
				isError: false,
				error: null,
			}),
		})
		const { queryByTestId } = render(wrapWithAPI(api, <MangaReader />))
		await waitFor(() =>
			expect(queryByTestId("manga-mode-toggle")).not.toBeNull(),
		)
	})

	it("shows the full page count from fileStats before files list resolves", async () => {
		const api = createWebPluginAPI({
			resource: {
				id: "r-test",
				name: "test",
				sourceMeta: {
					previews: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				},
				searchMeta: undefined,
				fileStats: { count: 200 },
				contentPluginId: "p-test",
			},
			useFileList: () => ({
				data: undefined,
				isLoading: true,
				isError: false,
				error: null,
			}),
		})
		const { getByTestId } = render(wrapWithAPI(api, <MangaReader />))
		await waitFor(() =>
			expect(getByTestId("manga-page-indicator")).toHaveTextContent("/ 200"),
		)
	})
})
