import { MAX_TRAIT_FILTER_VALUE_LENGTH } from "@hoardodile/consts/text-limits"
import type {
	DateFilterValue,
	MonthDayFilterValue,
	TraitDef,
	TraitFilter,
	TraitKind,
} from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { Input } from "@hoardodile/ui/components/input"
import { useQuery } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { QueryStateView } from "@/components/common/QueryStateView"
import { traitListQueryOptions } from "@/features/traits"
import { TraitDateField } from "./TraitDateField"

type CharTraitFilterProps = Readonly<{
	value: readonly TraitFilter[]
	onChange(next: readonly TraitFilter[]): void
}>

type NumericOp = ">" | ">=" | "<" | "<=" | "="
type DateOp =
	| "dateAfter"
	| "dateOnOrAfter"
	| "dateBefore"
	| "dateOnOrBefore"
	| "dateOn"
	| "dateMonthDayOn"
	| "dateMonthDayToday"
type TextOp = "contains"
type NullaryOp = "empty" | "notempty"
type TraitFilterOp = NumericOp | DateOp | TextOp | NullaryOp

const NUMERIC_OPS: readonly NumericOp[] = [">=", "<=", "=", ">", "<"]
const DATE_OPS: readonly DateOp[] = [
	"dateOnOrAfter",
	"dateOnOrBefore",
	"dateOn",
	"dateMonthDayOn",
	"dateMonthDayToday",
	"dateAfter",
	"dateBefore",
]
const NULLARY_OPS: readonly NullaryOp[] = ["empty", "notempty"]
const TEXT_OPS: readonly TextOp[] = ["contains"]

const DEFAULT_DATE_FILTER_VALUE: DateFilterValue = {
	sign: "+",
	year: 2000,
	month: 1,
	day: 1,
}

const DEFAULT_MONTH_DAY_FILTER_VALUE: MonthDayFilterValue = {
	month: 1,
	day: 1,
}

function isNumericKind(kind: TraitKind): boolean {
	return kind === "number" || kind === "height" || kind === "weight"
}

function isDateKind(kind: TraitKind): boolean {
	return kind === "date"
}

function isNullaryOp(op: string): op is NullaryOp {
	return (NULLARY_OPS as readonly string[]).includes(op)
}

function isNumericOp(op: string): op is NumericOp {
	return (NUMERIC_OPS as readonly string[]).includes(op)
}

function isDateOp(op: string): op is DateOp {
	return (DATE_OPS as readonly string[]).includes(op)
}

function opsForKind(kind: TraitKind): readonly TraitFilterOp[] {
	if (isNumericKind(kind)) return [...NUMERIC_OPS, ...NULLARY_OPS]
	if (isDateKind(kind)) return [...DATE_OPS, ...NULLARY_OPS]
	return [...TEXT_OPS, ...NULLARY_OPS]
}

/** Build the default filter clause for a freshly selected trait. */
function defaultFilterForTrait(trait: TraitDef): TraitFilter {
	if (isNumericKind(trait.kind)) {
		return { traitId: trait.id, op: ">=", value: 0 }
	}
	if (isDateKind(trait.kind)) {
		return {
			traitId: trait.id,
			op: "dateOnOrAfter",
			value: { ...DEFAULT_DATE_FILTER_VALUE },
		}
	}
	return { traitId: trait.id, op: "contains", value: "" }
}

/** Replace just the operator on an existing filter, picking a sensible value. */
function withOpReplaced(traitId: string, op: string): TraitFilter | undefined {
	if (isNullaryOp(op)) return { traitId, op }
	if (op === "contains") return { traitId, op, value: "" }
	if (isNumericOp(op)) return { traitId, op, value: 0 }
	if (op === "dateMonthDayOn")
		return { traitId, op, value: { ...DEFAULT_MONTH_DAY_FILTER_VALUE } }
	if (op === "dateMonthDayToday") return { traitId, op }
	if (isDateOp(op))
		return { traitId, op, value: { ...DEFAULT_DATE_FILTER_VALUE } }
	return undefined
}

/**
 * Editor for the `traitFilters` argument of character search. Each row is
 * an independent {@link TraitFilter} clause; multiple clauses combine with
 * AND in the backend (see `matchesTraitFilters` in `character/service.ts`).
 */
export function CharTraitFilter(props: CharTraitFilterProps) {
	const { value, onChange } = props
	const { t } = useTranslation()
	const traitsQuery = useQuery(traitListQueryOptions())

	return (
		<QueryStateView
			result={traitsQuery}
			isEmpty={isEmptyTraitList}
			loading={
				<p className="text-xs text-muted-foreground">{t("common.loading")}</p>
			}
			empty={
				<p className="text-xs text-muted-foreground">
					{t("characters.traitFilter.empty")}
				</p>
			}
		>
			{(traits) => (
				<CharTraitFilterBody
					traits={traits}
					value={value}
					onChange={onChange}
				/>
			)}
		</QueryStateView>
	)
}

function isEmptyTraitList(traits: readonly TraitDef[]): boolean {
	return traits.length === 0
}

type CharTraitFilterBodyProps = Readonly<{
	traits: readonly TraitDef[]
	value: readonly TraitFilter[]
	onChange(next: readonly TraitFilter[]): void
}>

function CharTraitFilterBody(props: CharTraitFilterBodyProps) {
	const { traits, value, onChange } = props
	const { t } = useTranslation()

	function handleAdd() {
		const first = traits[0]
		if (first === undefined) return
		onChange([...value, defaultFilterForTrait(first)])
	}

	function handleRemove(index: number) {
		onChange(value.filter((_, i) => i !== index))
	}

	function handleReplace(index: number, next: TraitFilter) {
		onChange(value.map((row, i) => (i === index ? next : row)))
	}

	return (
		<div className="flex flex-col" data-testid="character-trait-filter">
			<div className="flex items-center">
				<span className="text-muted-foreground text-sm mr-2">
					{t("characters.traitFilter.label")}
				</span>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={handleAdd}
					data-testid="character-trait-filter-add"
				>
					{t("characters.traitFilter.add")}
				</Button>
			</div>
			<ul className="flex flex-col">
				{value.map((filter, index) => (
					<li key={index} className="flex flex-wrap items-center gap-2 mt-2">
						<TraitFilterRow
							traits={traits}
							filter={filter}
							onChange={(next) => handleReplace(index, next)}
						/>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => handleRemove(index)}
							aria-label={t("common.removeAria")}
						>
							<Trash2 className="size-4" />
						</Button>
					</li>
				))}
			</ul>
		</div>
	)
}

type TraitFilterRowProps = Readonly<{
	traits: readonly TraitDef[]
	filter: TraitFilter
	onChange(next: TraitFilter): void
}>

function TraitFilterRow(props: TraitFilterRowProps) {
	const { traits, filter, onChange } = props
	const { t } = useTranslation()
	const trait = traits.find((tt) => tt.id === filter.traitId) ?? traits[0]
	if (trait === undefined) return undefined
	const traitId = trait.id
	const ops = opsForKind(trait.kind)

	function handleTraitChange(nextTraitId: string) {
		const nextTrait = traits.find((tt) => tt.id === nextTraitId)
		if (nextTrait === undefined) return
		onChange(defaultFilterForTrait(nextTrait))
	}

	function handleOpChange(op: string) {
		const next = withOpReplaced(traitId, op)
		if (next !== undefined) onChange(next)
	}

	function renderValueInput(): ReactNode {
		switch (filter.op) {
			case "empty":
			case "notempty":
				return undefined
			case "contains":
				return (
					<Input
						type="text"
						value={filter.value}
						className="h-8 w-40"
						maxLength={MAX_TRAIT_FILTER_VALUE_LENGTH}
						onChange={(e) =>
							onChange({
								traitId,
								op: "contains",
								value: e.target.value,
							})
						}
					/>
				)
			case "dateAfter":
			case "dateOnOrAfter":
			case "dateBefore":
			case "dateOnOrBefore":
			case "dateOn":
				return (
					<TraitDateField
						value={filter.value}
						onChange={(next) =>
							onChange({
								traitId,
								op: filter.op,
								value: next,
							})
						}
					/>
				)
			case "dateMonthDayOn":
				return (
					<div className="flex items-center gap-1">
						<Input
							type="number"
							value={filter.value.month}
							className="h-8 w-16"
							onChange={(e) => {
								const parsed = Number.parseInt(e.target.value, 10)
								onChange({
									traitId,
									op: "dateMonthDayOn",
									value: {
										...filter.value,
										month: Number.isFinite(parsed) ? parsed : 1,
									},
								})
							}}
						/>
						<span className="text-muted-foreground">/</span>
						<Input
							type="number"
							value={filter.value.day}
							className="h-8 w-16"
							onChange={(e) => {
								const parsed = Number.parseInt(e.target.value, 10)
								onChange({
									traitId,
									op: "dateMonthDayOn",
									value: {
										...filter.value,
										day: Number.isFinite(parsed) ? parsed : 1,
									},
								})
							}}
						/>
					</div>
				)
			case "dateMonthDayToday":
				return (
					<span className="text-xs text-muted-foreground">
						{t("characters.traitFilter.opDateMonthDayToday")}
					</span>
				)
			case ">":

			case ">=":

			case "<":
			case "<=":
			case "=":
				return (
					<Input
						type="number"
						value={filter.value}
						className="h-8 w-28"
						onChange={(e) => {
							const parsed = Number.parseFloat(e.target.value)
							onChange({
								traitId,
								op: filter.op,
								value: Number.isFinite(parsed) ? parsed : 0,
							})
						}}
					/>
				)
		}
	}

	return (
		<>
			<DropdownSelect
				value={filter.traitId}
				onValueChange={handleTraitChange}
				size="sm"
				triggerClassName="min-w-32"
				options={traits.map((tt) => ({
					value: tt.id,
					label: tt.name,
				}))}
			/>
			<DropdownSelect
				value={filter.op}
				onValueChange={handleOpChange}
				size="sm"
				triggerClassName="min-w-20"
				options={ops.map((op) => ({
					value: op,
					label: labelForOp(op, t),
				}))}
			/>
			{renderValueInput()}
		</>
	)
}

function labelForOp(op: TraitFilterOp, t: (key: string) => string): string {
	switch (op) {
		case "contains":
			return t("characters.traitFilter.opContains")
		case "empty":
			return t("characters.traitFilter.opEmpty")
		case "notempty":
			return t("characters.traitFilter.opNotEmpty")
		case "dateAfter":
			return t("characters.traitFilter.opDateAfter")
		case "dateOnOrAfter":
			return t("characters.traitFilter.opDateOnOrAfter")
		case "dateBefore":
			return t("characters.traitFilter.opDateBefore")
		case "dateOnOrBefore":
			return t("characters.traitFilter.opDateOnOrBefore")
		case "dateOn":
			return t("characters.traitFilter.opDateOn")
		case "dateMonthDayOn":
			return t("characters.traitFilter.opDateMonthDayOn")
		case "dateMonthDayToday":
			return t("characters.traitFilter.opDateMonthDayToday")
		case ">":

		case "<":
		case ">=":
		case "<=":
		case "=":
			return op
	}
}
