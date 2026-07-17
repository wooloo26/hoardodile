import { Input } from "@hoardodile/ui/components/input"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useDebouncedValue } from "@/lib/useDebouncedValue"
import { docSearchQueryOptions } from "./api.ts"
import { DocSearchResults } from "./DocSearchResults.tsx"

export type DocLinkedSearchSectionProps =
	| { readonly variant: "char"; readonly charId: string }
	| { readonly variant: "res"; readonly resId: string }

/**
 * Embedded block: debounced full-text search over documents that reference a
 * single character or resource via editor chips (server uses link tables).
 */
export function DocLinkedSearchSection(props: DocLinkedSearchSectionProps) {
	const { t } = useTranslation()
	const [filter, setFilter] = useState("")
	const debouncedFilter = useDebouncedValue(filter, 250)

	const title =
		props.variant === "char"
			? t("characters.detail.docSearchTitle")
			: t("resources.detail.docSearchTitle")
	const placeholder =
		props.variant === "char"
			? t("characters.detail.docSearchPlaceholder")
			: t("resources.detail.docSearchPlaceholder")

	const scopeProps =
		props.variant === "char"
			? { charIds: [props.charId] as const }
			: { resIds: [props.resId] as const }

	const baselineInput =
		props.variant === "char"
			? {
					query: undefined as string | undefined,
					size: 100,
					charIds: [props.charId],
				}
			: {
					query: undefined as string | undefined,
					size: 100,
					resIds: [props.resId],
				}
	const baseline = useQuery(docSearchQueryOptions(baselineInput))
	if (!baseline.isSuccess || (baseline.data?.rows.length ?? 0) === 0) {
		return null
	}

	return (
		<section
			className="flex flex-col gap-2 max-w-120"
			data-testid={
				props.variant === "char"
					? "character-doc-linked-search"
					: "resource-doc-linked-search"
			}
		>
			<h2 className="text-base font-semibold">{title}</h2>
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					placeholder={placeholder}
					className="h-9 pl-8 text-sm"
				/>
			</div>
			<DocSearchResults
				query={debouncedFilter}
				activeId={undefined}
				listClassName="max-h-80 overflow-y-auto"
				{...scopeProps}
			/>
		</section>
	)
}
