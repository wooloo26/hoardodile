import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@hoardodile/ui/components/empty"
import { SearchX } from "lucide-react"
import { useTranslation } from "react-i18next"

export function SearchEmptyState() {
	const { t } = useTranslation()
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SearchX className="size-6" />
				</EmptyMedia>
				<EmptyTitle>{t("search.empty.title")}</EmptyTitle>
				<EmptyDescription>{t("search.empty.description")}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	)
}
