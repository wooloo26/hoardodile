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
import { StalePinnedBanner } from "@/features/overview/components/StalePinnedBanner"
import { pinnedSectionListCodec } from "@/features/overview/pinned/pinnedSectionListCodec"
import { prefKeys } from "@/lib/keys"
import { prefSync } from "@/lib/prefSync"
import type { RouterContext } from "@/routes/__root"
import type { TRPCClient } from "@/trpc/client"
import { setTrpcClient } from "@/trpc/client"
import type { PinnedSectionItem } from "../pinned/types"

const STALE_MS = 31 * 86_400_000
const nowMs = 1_000_000_000_000

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
									return undefined
								},
								mutate: async () => undefined,
							}
						},
					},
				)
			},
		},
	) as unknown as TRPCClient
}

const characterHandler = vi.fn(() => ({
	rows: [
		{
			id: "char-stale",
			name: "Stale Character",
			intro: "",
			tagIds: [],
			traitValues: {},
			pinnedTags: [],
			pinnedTraits: [],
			relations: [],
			createdAt: 100,
			updatedAt: 100,
		},
	],
	total: 1,
	page: 1,
	size: 6,
}))

const batchExposureHandler = vi.fn(() => [
	{
		entityType: "character",
		entityId: "char-stale",
		directMs: 0,
		associatedMs: 0,
		totalMs: 0,
		viewCount: 0,
		sessionCount: 0,
		lastViewedAt: nowMs - STALE_MS,
	},
])

beforeEach(() => {
	localStorage.clear()
	prefSync.set(prefKeys.overviewPinnedCharacters, "[]")
	prefSync.set(prefKeys.overviewPinnedResources, "[]")
	setTrpcClient(
		createMockTrpcClient({
			"character.listCards": characterHandler,
			"usage.batchEntityExposure": batchExposureHandler,
		}),
	)
	characterHandler.mockClear()
	batchExposureHandler.mockClear()
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

describe("StalePinnedBanner", () => {
	it("renders stale pinned character with subtitle", async () => {
		setPinnedCharacters([{ id: "char-stale-pin" }])

		await renderSection(<StalePinnedBanner />)

		expect(
			await screen.findByText(/Not viewed in 30 days|久未查看（30 天）/),
		).toBeInTheDocument()
		expect(await screen.findByText("Stale Character")).toBeInTheDocument()
		await waitFor(() => {
			expect(batchExposureHandler).toHaveBeenCalled()
		})
	})

	it("hides when no pin is enabled", async () => {
		await renderSection(<StalePinnedBanner />)
		await waitFor(() => {
			expect(
				screen.queryByText(/Not viewed in 30 days|久未查看/),
			).not.toBeInTheDocument()
		})
	})
})
