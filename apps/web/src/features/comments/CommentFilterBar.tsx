import { MAX_SEARCH_QUERY_LENGTH } from "@hoardodile/consts/text-limits"
import { Button } from "@hoardodile/ui/components/button"
import { Checkbox } from "@hoardodile/ui/components/checkbox"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@hoardodile/ui/components/dropdown-menu"
import { Input } from "@hoardodile/ui/components/input"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Search, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { charDetailCardQueryOptions } from "@/features/char/api"
import { CharChip } from "@/features/char/components/CharChip"
import { resDetailCardQueryOptions } from "@/features/res/api"
import type { SetPatch } from "@/hooks/useRouteSearchState"
import { useDebouncedValue } from "@/lib/useDebouncedValue"
import type { CommentSearchState } from "./searchState"
import { SORT_OPTIONS } from "./searchState"

export type CommentFilterBarProps = {
	readonly state: CommentSearchState
	readonly patch: SetPatch<CommentSearchState>
}

export function CommentFilterBar(props: CommentFilterBarProps) {
	const { state, patch } = props
	const { t } = useTranslation()
	const [rawQuery, setRawQuery] = useState(state.query)
	const debouncedQuery = useDebouncedValue(rawQuery.trim(), 250)

	useEffect(() => {
		setRawQuery(state.query)
	}, [state.query])

	useEffect(() => {
		if (debouncedQuery === state.query) return
		patch({ query: debouncedQuery, page: 1 })
	}, [debouncedQuery, state.query, patch])

	return (
		<div className="flex flex-col gap-3">
			{(state.charId.length > 0 || state.resId.length > 0) && (
				<div className="flex flex-wrap items-center gap-2">
					{state.charId.length > 0 ? (
						<ActiveCharFilter
							charId={state.charId}
							onClear={() => patch({ charId: "", page: 1 })}
						/>
					) : null}
					{state.resId.length > 0 ? (
						<ActiveResourceFilter
							resId={state.resId}
							onClear={() => patch({ resId: "", page: 1 })}
						/>
					) : null}
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-48 flex-1">
					<Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-8"
						placeholder={t("comments.searchPlaceholder")}
						value={rawQuery}
						onChange={(e) => setRawQuery(e.target.value)}
						maxLength={MAX_SEARCH_QUERY_LENGTH}
						data-testid="comments-search-input"
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							data-testid="comments-sort-trigger"
						>
							{t("comments.sortBy")}: {t(`comments.sort.${state.sortBy}`)}
							<ChevronDown className="ml-1 h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{SORT_OPTIONS.map((option) => (
							<DropdownMenuItem
								key={option}
								onSelect={() => patch({ sortBy: option, page: 1 })}
							>
								{t(`comments.sort.${option}`)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<label
					className="flex items-center gap-1.5 text-sm"
					htmlFor="comments-trash"
				>
					<Checkbox
						id="comments-trash"
						checked={state.trash}
						onCheckedChange={(v) => patch({ trash: v === true, page: 1 })}
					/>
					{t("comments.trash")}
				</label>
			</div>
		</div>
	)
}

type ActiveCharFilterProps = {
	readonly charId: string
	readonly onClear: () => void
}

function ActiveCharFilter(props: ActiveCharFilterProps) {
	const { charId, onClear } = props
	const { t } = useTranslation()
	const charQuery = useQuery(charDetailCardQueryOptions(charId))
	return (
		<div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1">
			<span className="text-xs text-muted-foreground">
				{t("comments.filterByCharacter")}
			</span>
			<CharChip charId={charId} character={charQuery.data} showName size="sm" />
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-6"
				onClick={onClear}
				aria-label={t("comments.clearFilter")}
				data-testid="comments-clear-char-filter"
			>
				<X className="size-3.5" />
			</Button>
		</div>
	)
}

type ActiveResourceFilterProps = {
	readonly resId: string
	readonly onClear: () => void
}

function ActiveResourceFilter(props: ActiveResourceFilterProps) {
	const { resId, onClear } = props
	const { t } = useTranslation()
	const resQuery = useQuery(resDetailCardQueryOptions(resId))
	const name = resQuery.data?.name ?? resId
	return (
		<div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1">
			<span className="text-xs text-muted-foreground">
				{t("comments.filterByResource")}
			</span>
			<span className="max-w-40 truncate text-xs font-medium">{name}</span>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-6"
				onClick={onClear}
				aria-label={t("comments.clearFilter")}
				data-testid="comments-clear-res-filter"
			>
				<X className="size-3.5" />
			</Button>
		</div>
	)
}
