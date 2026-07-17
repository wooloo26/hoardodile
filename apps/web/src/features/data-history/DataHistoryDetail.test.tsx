import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import type { DataHistoryList } from "./api"
import { DataHistoryDetail } from "./DataHistoryDetail"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) => {
			if (params === undefined) return key
			return `${key}(${JSON.stringify(params)})`
		},
	}),
}))

vi.mock("@/features/settings/datePrefs", () => ({
	useDateFormatter: () => ({
		formatDateTime: (ts: number) => new Date(ts).toLocaleString(),
		formatDate: () => "",
		formatDateTrait: () => "",
	}),
}))

function createQueryClient() {
	return new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
}

function renderWithClient(element: React.ReactElement) {
	return render(
		<QueryClientProvider client={createQueryClient()}>
			{element}
		</QueryClientProvider>,
	)
}

function buildData(): DataHistoryList {
	return {
		currentVersion: 2,
		activeVersion: 2,
		groups: [
			{
				archive: {
					kind: "archive",
					id: "archive-2",
					version: 2,
					dbSize: 1024,
					current: true,
					active: true,
				},
				backups: [],
			},
			{
				archive: {
					kind: "archive",
					id: "archive-1",
					version: 1,
					createdAt: 1_700_000_000_000,
					note: "v1 release",
					dbSize: 512,
					current: false,
					active: false,
				},
				backups: [
					{
						kind: "backup",
						id: "backup-app-1.sqlite",
						fileName: "app-1.sqlite",
						name: "migration backup",
						note: "before migration",
						size: 256,
						createdAt: 1_700_000_000_000,
						activeVersionAtCreate: 1,
					},
				],
			},
		],
	}
}

describe("DataHistoryDetail", () => {
	test("current archive has editable name and note", () => {
		const data = buildData()
		renderWithClient(
			<DataHistoryDetail
				data={data}
				selectedId="archive-2"
				onRestore={vi.fn()}
				onDeleteBackup={vi.fn()}
				onSwitchVersion={vi.fn()}
				isRestoring={false}
				isDeleting={false}
				isSwitching={false}
			/>,
		)

		expect(screen.getByTestId("name-preview")).not.toBeDisabled()
		expect(screen.getByTestId("note-preview")).not.toBeDisabled()
	})

	test("non-current archive shows plain name and note text", () => {
		const data = buildData()
		renderWithClient(
			<DataHistoryDetail
				data={data}
				selectedId="archive-1"
				onRestore={vi.fn()}
				onDeleteBackup={vi.fn()}
				onSwitchVersion={vi.fn()}
				isRestoring={false}
				isDeleting={false}
				isSwitching={false}
			/>,
		)

		expect(screen.queryByTestId("name-preview")).not.toBeInTheDocument()
		expect(screen.queryByTestId("note-preview")).not.toBeInTheDocument()
		expect(screen.getByText("v1 release")).toBeInTheDocument()
		// Header and read-only name both fall back to the default title.
		expect(
			screen.getAllByText('dataHistory.archive.title({"version":1})'),
		).toHaveLength(2)
	})

	test("archived backup shows plain name and note text", () => {
		const data = buildData()
		renderWithClient(
			<DataHistoryDetail
				data={data}
				selectedId="backup-app-1.sqlite"
				onRestore={vi.fn()}
				onDeleteBackup={vi.fn()}
				onSwitchVersion={vi.fn()}
				isRestoring={false}
				isDeleting={false}
				isSwitching={false}
			/>,
		)

		expect(screen.queryByTestId("name-preview")).not.toBeInTheDocument()
		expect(screen.queryByTestId("note-preview")).not.toBeInTheDocument()
		// Header and read-only name both show the backup name.
		expect(screen.getAllByText("migration backup")).toHaveLength(2)
		expect(screen.getByText("before migration")).toBeInTheDocument()
	})
})
