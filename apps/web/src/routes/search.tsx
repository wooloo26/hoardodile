import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { SearchResultsPage } from "@/features/search/components/SearchResultsPage"
import { requireAuth } from "@/lib/auth-guard"

const searchRouteSchema = z.object({
	query: z.string().optional(),
})

export const Route = createFileRoute("/search")({
	beforeLoad: requireAuth,
	validateSearch: searchRouteSchema,
	component: SearchRoute,
})

function SearchRoute() {
	const { t } = useTranslation()
	return (
		<PageScaffold>
			<PageHeader title={t("search.title")} />
			<SearchResultsPage />
		</PageScaffold>
	)
}
