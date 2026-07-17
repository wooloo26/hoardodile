import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pinnedSectionListCodec } from "@/features/overview/pinned/pinnedSectionListCodec"
import { prefKeys } from "@/lib/keys"
import { prefSync } from "@/lib/prefSync"
import type { RouterContext } from "@/routes/__root"
import { stubCharCard, stubResCard } from "@/test/stubs/cards"
import type { TRPCClient } from "@/trpc/client"
import { setTrpcClient } from "@/trpc/client"
import { OverviewPinnedRow } from "../components/OverviewPinnedRow"
import type { PinnedSectionItem } from "./types"

function createMockTrpcClient(
	handlers: Record<string, (input: unknown) => unknown>,
): TRPCClient {
	return new Proxy(
		{},
		{
			get(_, namespace: string) {
				return new Proxy(
					{},
					{
						get(_, procedure: string) {
							return {
								query: async (input: unknown) => {
									const key = `${namespace}.${procedure}`
									const handler = handlers[key]
									if (handler) return handler(input)
									if (namespace === "plugin" && procedure === "listAll")
										return []
									if (namespace === "tag" && procedure === "categories")
										return []
									if (namespace === "tag" && procedure === "listAll") return []
									return undefined
								},
								mutate: async (input: unknown) => {
									const key = `${namespace}.${procedure}`
									const handler = handlers[key]
									if (handler) return handler(input)
									return undefined
								},
							}
						},
					},
				)
			},
		},
	) as unknown as TRPCClient
}

const characterHandler = vi.fn((_input?: unknown) => ({
	rows: [stubCharCard("char-1", "Character One")],
	total: 1,
	page: 1,
	size: 6,
}))

const resourceHandler = vi.fn((_input?: unknown) => ({
	rows: [stubResCard("res-1", "Resource One")],
	total: 1,
	page: 1,
	size: 6,
}))

beforeEach(() => {
	localStorage.clear()
	prefSync.set(prefKeys.overviewPinnedCharacters, "[]")
	prefSync.set(prefKeys.overviewPinnedResources, "[]")
	setTrpcClient(
		createMockTrpcClient({
			"character.listCards": characterHandler,
			"resource.listCards": resourceHandler,
		}),
	)
	characterHandler.mockReset()
	characterHandler.mockImplementation(() => ({
		rows: [stubCharCard("char-1", "Character One")],
		total: 1,
		page: 1,
		size: 6,
	}))
	resourceHandler.mockReset()
	resourceHandler.mockImplementation(() => ({
		rows: [stubResCard("res-1", "Resource One")],
		total: 1,
		page: 1,
		size: 6,
	}))
})

function createRouterWith(element: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})

	const testContext: RouterContext = {
		queryClient,
		trpc: {} as RouterContext["trpc"],
	}

	const rootRoute = createRootRouteWithContext<RouterContext>()({
		component: () => <Outlet />,
	})

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => element,
	})

	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		context: testContext,
		history: createMemoryHistory({ initialEntries: ["/"] }),
		defaultPendingMs: 0,
	})

	return { router, queryClient }
}

let currentQueryClient: QueryClient | undefined

async function renderSection(element: React.ReactElement) {
	const { router, queryClient } = createRouterWith(element)
	currentQueryClient = queryClient

	await act(async () => {
		await router.load()
	})

	let utils!: ReturnType<typeof render>
	await act(async () => {
		utils = render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>,
		)
	})
	return utils
}

afterEach(() => {
	currentQueryClient?.cancelQueries()
	currentQueryClient?.clear()
	currentQueryClient = undefined
})

function setPinnedCharacters(items: readonly PinnedSectionItem[]) {
	prefSync.set(
		prefKeys.overviewPinnedCharacters,
		pinnedSectionListCodec.encode(items),
	)
}

function setPinnedResources(items: readonly PinnedSectionItem[]) {
	prefSync.set(
		prefKeys.overviewPinnedResources,
		pinnedSectionListCodec.encode(items),
	)
}

describe("PinnedCharactersSection via OverviewPinnedRow", () => {
	it("is hidden when no pinned items", async () => {
		await renderSection(<OverviewPinnedRow />)
		await waitFor(() => {
			expect(screen.queryByText("Pinned characters")).not.toBeInTheDocument()
		})
	})

	it("renders pinned characters with default settings", async () => {
		setPinnedCharacters([{ id: "char-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByText("Pinned characters")).toBeInTheDocument()
		})
		expect(screen.getByText("Character One")).toBeInTheDocument()
		expect(characterHandler).toHaveBeenCalledWith(
			expect.objectContaining({ page: 1, size: 6 }),
		)
	})

	it("uses custom title and size for a single item", async () => {
		setPinnedCharacters([{ id: "char-pin-1", title: "My chars", size: 3 }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByText("My chars")).toBeInTheDocument()
		})
		expect(screen.queryByRole("tab")).not.toBeInTheDocument()
		expect(characterHandler).toHaveBeenCalledWith(
			expect.objectContaining({ size: 3 }),
		)
	})

	it("renders tabs when multiple items exist", async () => {
		setPinnedCharacters([
			{ id: "char-pin-1", title: "First" },
			{ id: "char-pin-2", title: "Second" },
		])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByText("Pinned characters")).toBeInTheDocument()
		})
		expect(screen.getByRole("tab", { name: "First" })).toBeInTheDocument()
		expect(screen.getByRole("tab", { name: "Second" })).toBeInTheDocument()
	})

	it("hides empty tabs when multiple items exist", async () => {
		characterHandler.mockImplementation((input: unknown) => {
			const { query } = (input as { query?: string }) ?? {}
			if (query === "empty") {
				return { rows: [], total: 0, page: 1, size: 6 }
			}
			return {
				rows: [stubCharCard("char-1", "Character One")],
				total: 1,
				page: 1,
				size: 6,
			}
		})
		setPinnedCharacters([
			{ id: "char-pin-1", title: "First", query: "empty" },
			{ id: "char-pin-2", title: "Second" },
		])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(characterHandler).toHaveBeenCalledTimes(2)
		})
		expect(screen.queryByRole("tab", { name: "First" })).not.toBeInTheDocument()
		expect(screen.queryByRole("tab")).not.toBeInTheDocument()
		expect(screen.getByText("Character One")).toBeInTheDocument()
	})

	it("view all link carries current filters for single item", async () => {
		setPinnedCharacters([
			{
				id: "char-pin-1",
				query: "foo",
				tagIds: ["tag-a"],
				tagMode: "or",
				sortBy: "created",
				order: "asc",
				random: true,
				searchIntro: true,
			},
		])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByText("Pinned characters")).toBeInTheDocument()
		})
		const link = screen.getByText("View all").closest("a")
		expect(link).toHaveAttribute("href", expect.stringContaining("query=foo"))
		expect(link).toHaveAttribute("href", expect.stringContaining("tagIds"))
		expect(link).toHaveAttribute("href", expect.stringContaining("tagMode=or"))
		expect(link).toHaveAttribute(
			"href",
			expect.stringContaining("sortBy=created"),
		)
		expect(link).toHaveAttribute("href", expect.stringContaining("order=asc"))
		expect(link).toHaveAttribute("href", expect.stringContaining("random=true"))
		expect(link).toHaveAttribute(
			"href",
			expect.stringContaining("searchIntro=true"),
		)
	})

	it("hides section when item is empty", async () => {
		characterHandler.mockReturnValue({
			rows: [],
			total: 0,
			page: 1,
			size: 6,
		})
		setPinnedCharacters([{ id: "char-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(characterHandler).toHaveBeenCalled()
		})
		expect(
			screen.queryByTestId("overview-pinned-characters"),
		).not.toBeInTheDocument()
	})

	it("shows empty text when item is empty but showWhenEmpty is set", async () => {
		characterHandler.mockReturnValue({
			rows: [],
			total: 0,
			page: 1,
			size: 6,
		})
		setPinnedCharacters([{ id: "char-pin-1", showWhenEmpty: true }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(characterHandler).toHaveBeenCalled()
		})
		expect(screen.getByText("No matching characters")).toBeInTheDocument()
	})
})

describe("PinnedResourcesSection via OverviewPinnedRow", () => {
	it("is hidden when no pinned items", async () => {
		await renderSection(<OverviewPinnedRow />)
		await waitFor(() => {
			expect(screen.queryByText("Pinned resources")).not.toBeInTheDocument()
		})
	})

	it("renders pinned resources", async () => {
		setPinnedResources([{ id: "res-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByText("Pinned resources")).toBeInTheDocument()
		})
		expect(screen.getByText("Resource One")).toBeInTheDocument()
	})

	it("hides empty tabs when multiple items exist", async () => {
		resourceHandler.mockImplementation((input: unknown) => {
			const { query } = (input as { query?: string }) ?? {}
			if (query === "empty") {
				return { rows: [], total: 0, page: 1, size: 6 }
			}
			return {
				rows: [stubResCard("res-1", "Resource One")],
				total: 1,
				page: 1,
				size: 6,
			}
		})
		setPinnedResources([
			{ id: "res-pin-1", title: "First", query: "empty" },
			{ id: "res-pin-2", title: "Second" },
		])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(resourceHandler).toHaveBeenCalledTimes(2)
		})
		expect(screen.queryByRole("tab", { name: "First" })).not.toBeInTheDocument()
		expect(screen.queryByRole("tab")).not.toBeInTheDocument()
		expect(screen.getByText("Resource One")).toBeInTheDocument()
	})

	it("view all link carries current filters", async () => {
		setPinnedResources([
			{
				id: "res-pin-1",
				query: "bar",
				tagIds: ["tag-b"],
				tagMode: "not",
				noCharacters: true,
				sortBy: "created",
				order: "asc",
				random: true,
				searchIntro: true,
			},
		])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByText("Pinned resources")).toBeInTheDocument()
		})
		const link = screen.getByText("View all").closest("a")
		expect(link).toHaveAttribute("href", expect.stringContaining("query=bar"))
		expect(link).toHaveAttribute("href", expect.stringContaining("tagIds"))
		expect(link).toHaveAttribute("href", expect.stringContaining("tagMode=not"))
		expect(link).toHaveAttribute(
			"href",
			expect.stringContaining("noCharacters=true"),
		)
		expect(link).toHaveAttribute(
			"href",
			expect.stringContaining("sortBy=created"),
		)
		expect(link).toHaveAttribute("href", expect.stringContaining("order=asc"))
		expect(link).toHaveAttribute("href", expect.stringContaining("random=true"))
		expect(link).toHaveAttribute(
			"href",
			expect.stringContaining("searchIntro=true"),
		)
	})

	it("hides section when item is empty", async () => {
		resourceHandler.mockReturnValue({
			rows: [],
			total: 0,
			page: 1,
			size: 6,
		})
		setPinnedResources([{ id: "res-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(resourceHandler).toHaveBeenCalled()
		})
		expect(
			screen.queryByTestId("overview-pinned-resources"),
		).not.toBeInTheDocument()
	})

	it("shows empty text when item is empty but showWhenEmpty is set", async () => {
		resourceHandler.mockReturnValue({
			rows: [],
			total: 0,
			page: 1,
			size: 6,
		})
		setPinnedResources([{ id: "res-pin-1", showWhenEmpty: true }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(resourceHandler).toHaveBeenCalled()
		})
		expect(screen.getByText("No matching resources")).toBeInTheDocument()
	})
})

describe("OverviewPinnedRow", () => {
	it("is hidden when nothing is pinned", async () => {
		await renderSection(<OverviewPinnedRow />)
		await waitFor(() => {
			expect(
				screen.queryByTestId("overview-pinned-row"),
			).not.toBeInTheDocument()
		})
	})

	it("shows only characters section when only characters are pinned", async () => {
		setPinnedCharacters([{ id: "char-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(screen.getByTestId("overview-pinned-row")).toBeInTheDocument()
		})
		expect(screen.getByTestId("overview-pinned-characters")).toBeInTheDocument()
		expect(
			screen.queryByTestId("overview-pinned-resources"),
		).not.toBeInTheDocument()
	})

	it("shows both sections when both are pinned", async () => {
		setPinnedCharacters([{ id: "char-pin-1" }])
		setPinnedResources([{ id: "res-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(
				screen.getByTestId("overview-pinned-characters"),
			).toBeInTheDocument()
		})
		expect(screen.getByTestId("overview-pinned-resources")).toBeInTheDocument()
	})

	it("hides row when pinned section is empty", async () => {
		characterHandler.mockReturnValue({
			rows: [],
			total: 0,
			page: 1,
			size: 6,
		})
		setPinnedCharacters([{ id: "char-pin-1" }])
		await renderSection(<OverviewPinnedRow />)

		await waitFor(() => {
			expect(characterHandler).toHaveBeenCalled()
		})
		expect(screen.queryByTestId("overview-pinned-row")).not.toBeInTheDocument()
	})
})
