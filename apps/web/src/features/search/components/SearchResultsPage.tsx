import { Button } from "@hoardodile/ui/components/button"
import { ButtonGroup } from "@hoardodile/ui/components/button-group"
import { Input } from "@hoardodile/ui/components/input"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { globalSearchQueryOptions, useSearchUrlState } from "@/features/search"
import { SearchEmptyState } from "./SearchEmptyState"
import { SearchResultSections } from "./SearchResultSections"
import { SearchSkeleton } from "./SearchSkeleton"

export function SearchResultsPage() {
	const { t } = useTranslation()
	const [state, patch] = useSearchUrlState()
	const [draft, setDraft] = useState(state.query)

	useEffect(() => {
		setDraft(state.query)
	}, [state.query])

	const query = useQuery(
		globalSearchQueryOptions({
			query: state.query,
			scope: "all",
			page: 1,
		}),
	)

	function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault()
		patch({ query: draft.trim() })
	}

	const hasQuery = state.query.trim().length > 0

	return (
		<div className="flex flex-col gap-4">
			<form onSubmit={handleSubmit} className="flex items-center gap-2">
				<ButtonGroup className="w-full">
					<Input
						type="text"
						value={draft}
						onChange={(ev) => setDraft(ev.target.value)}
						placeholder={t("search.placeholder")}
						data-testid="search-page-input"
					/>
					<Button
						type="submit"
						variant="outline"
						aria-label={t("search.submit")}
						data-testid="search-page-submit"
					>
						<Search className="size-4" />
					</Button>
				</ButtonGroup>
			</form>

			{!hasQuery ? (
				<SearchEmptyState />
			) : query.isPending ? (
				<SearchSkeleton />
			) : query.isError ? (
				<div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
					{t("common.requestFailed")}
				</div>
			) : (
				<SearchResultSections data={query.data} query={state.query} />
			)}
		</div>
	)
}
