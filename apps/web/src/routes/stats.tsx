import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { UsageStatsPage } from "@/features/usage/components/UsageStatsPage"
import { requireAuth } from "@/lib/auth-guard"

const statsSearchSchema = z.object({
	range: z
		.enum(["today", "last7days", "thisWeek", "thisMonth", "thisYear", "all"])
		.default("last7days"),
	device: z.string().default("all"),
	entityType: z
		.enum(["all", "resource", "character", "document", "plugin"])
		.optional(),
	shareMetric: z.enum(["time", "views"]).default("time"),
	exposureMode: z.enum(["direct", "associated", "total"]).default("direct"),
	sharePage: z.number().int().positive().default(1),
})

export const Route = createFileRoute("/stats")({
	beforeLoad: requireAuth,
	validateSearch: statsSearchSchema,
	component: StatsRoute,
})

function StatsRoute() {
	const { t } = useTranslation()
	const search = Route.useSearch()

	return (
		<PageScaffold className="max-w-7xl">
			<PageHeader
				title={<span data-testid="stats-heading">{t("usage.title")}</span>}
				description={t("usage.description")}
			/>
			<UsageStatsPage search={search} />
		</PageScaffold>
	)
}
