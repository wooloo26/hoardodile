import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { prefKeys } from "@/lib/keys"
import { prefSync } from "@/lib/prefSync"
import { AppShell } from "./AppShell"

function renderAppShell() {
	const rootRoute = createRootRoute({
		component: () => (
			<AppShell>
				<div />
			</AppShell>
		),
	})
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => null,
	})
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	})
	return render(<RouterProvider router={router} />)
}

describe("AppShell documents nav", () => {
	it("links to the last opened document when one is recorded", async () => {
		prefSync.set(prefKeys.docLastOpened, "doc-123")

		const { container, findByRole } = renderAppShell()
		await findByRole("navigation")

		expect(
			container.querySelector('nav a[href="/documents/doc-123"]'),
		).not.toBeNull()
	})

	it("links to the documents home when the home was the last location", async () => {
		// The home is recorded as the empty value (see useDocsHomeLastOpened).
		prefSync.set(prefKeys.docLastOpened, "")

		const { container, findByRole } = renderAppShell()
		await findByRole("navigation")

		expect(container.querySelector('nav a[href="/documents"]')).not.toBeNull()
	})
})
