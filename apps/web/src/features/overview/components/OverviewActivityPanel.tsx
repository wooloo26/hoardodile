import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@hoardodile/ui/components/tabs"
import { useTranslation } from "react-i18next"
import { RecentCharactersSection } from "../sections/RecentCharactersSection"
import { RecentCommentsSection } from "../sections/RecentCommentsSection"
import { RecentDocumentsSection } from "../sections/RecentDocumentsSection"
import { RecentResourcesSection } from "../sections/RecentResourcesSection"
import { OverviewSectionCard } from "./OverviewSectionCard"

type ActivityTabProps = {
	readonly value: string
	readonly label: string
}

function ActivityTab(props: ActivityTabProps) {
	return (
		<TabsTrigger value={props.value} className="gap-1.5">
			{props.label}
		</TabsTrigger>
	)
}

export function OverviewActivityPanel() {
	const { t } = useTranslation()

	return (
		<OverviewSectionCard
			title={t("overview.activity.title")}
			description={t("overview.activity.description")}
			data-testid="overview-activity-panel"
		>
			<Tabs defaultValue="resources">
				<TabsList className="h-auto w-full flex-wrap justify-start">
					<ActivityTab
						value="resources"
						label={t("overview.stats.resources")}
					/>
					<ActivityTab
						value="characters"
						label={t("overview.stats.characters")}
					/>
					<ActivityTab
						value="documents"
						label={t("overview.stats.documents")}
					/>
					<ActivityTab value="comments" label={t("overview.stats.comments")} />
				</TabsList>
				<TabsContent value="resources" className="mt-4">
					<RecentResourcesSection mode="list" presentation="embedded" />
				</TabsContent>
				<TabsContent value="characters" className="mt-4">
					<RecentCharactersSection mode="list" presentation="embedded" />
				</TabsContent>
				<TabsContent value="documents" className="mt-4">
					<RecentDocumentsSection mode="list" presentation="embedded" />
				</TabsContent>
				<TabsContent value="comments" className="mt-4">
					<RecentCommentsSection mode="list" presentation="embedded" />
				</TabsContent>
			</Tabs>
		</OverviewSectionCard>
	)
}
