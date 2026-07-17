import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { pluginKeys } from "@/features/plugin/pluginApi"
import type { ResMediaThumbResource } from "./ResMediaThumb"
import { ResMediaThumb } from "./ResMediaThumb"

const PLUGIN_ID = "11111111-1111-1111-1111-111111111111"

function makeResource(
	overrides?: Partial<ResMediaThumbResource>,
): ResMediaThumbResource {
	return {
		id: "res-1",
		name: "Test Resource",
		contentPluginId: PLUGIN_ID,
		coverMeta: { kind: "image", width: 100, height: 100 },
		sourceMeta: {},
		searchMeta: { v: 1, facets: { video: true, audio: true } },
		fileStats: undefined,
		updatedAt: 1,
		...overrides,
	}
}

function renderWithTemplate(
	template: string,
	resourceOverrides?: Partial<ResMediaThumbResource>,
) {
	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})

	queryClient.setQueryData(pluginKeys.listAll(), [
		{
			id: PLUGIN_ID,
			manifest: {
				id: PLUGIN_ID,
				name: "Test Plugin",
				description: "A plugin for testing",
				version: "1.0.0",
				permissions: {},
				ui: {
					card: {
						image: {
							tl: [template],
						},
					},
					search: {
						kinds: [
							{ key: "video", label: "Video", icon: "{{lucide('Video')}}" },
							{ key: "audio", label: "Audio", icon: "{{lucide('Music')}}" },
						],
					},
				},
			},
			enabled: true,
			priority: 0,
			missing: false,
			builtin: false,
			dev: false,
		},
	])

	render(
		<QueryClientProvider client={queryClient}>
			<ResMediaThumb resource={makeResource(resourceOverrides)} />
		</QueryClientProvider>,
	)

	const keyWarning = consoleError.mock.calls.find(
		(call) =>
			typeof call[0] === "string" &&
			call[0].includes('Each child in a list should have a unique "key"'),
	)
	consoleError.mockRestore()
	return keyWarning
}

describe("ResMediaThumb", () => {
	it("renders search-kind icons without a missing key warning", () => {
		expect(renderWithTemplate("{{searchKindIcons()}}")).toBeUndefined()
	})

	it("renders joined search-kind icons without a missing key warning", () => {
		expect(
			renderWithTemplate(
				"{{join(' ', searchKindIcons(), bytes(file.sizeBytes))}}",
				{
					fileStats: { count: 1, sizeBytes: 1024 },
				},
			),
		).toBeUndefined()
	})
})
