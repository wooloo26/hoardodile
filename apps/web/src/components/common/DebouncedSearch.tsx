import { MAX_SEARCH_QUERY_LENGTH } from "@hoardodile/consts/text-limits"
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@hoardodile/ui/components/input-group"
import { Search } from "lucide-react"
import { useEffect, useState } from "react"
import { useDebounce } from "react-use"

export type DebouncedSearchProps = {
	readonly value: string
	readonly placeholder?: string
	readonly delayMs?: number
	readonly maxLength?: number
	readonly onCommit: (value: string) => void
	readonly testId?: string
}

/**
 * Text input that debounces keystrokes before propagating them to the
 * parent. Kept dumb on purpose: the upstream page owns the committed
 * search string and passes it back as `value`, so programmatic resets
 * (e.g. after clearing) round-trip correctly.
 *
 * Renders as an InputGroup with a leading search icon and no browser
 * clear button (type="text").
 */
export function DebouncedSearch(props: DebouncedSearchProps) {
	const [draft, setDraft] = useState(props.value)

	// When the committed value changes externally, re-sync the draft so
	// the input reflects programmatic resets.
	useEffect(() => {
		setDraft(props.value)
	}, [props.value])

	useDebounce(
		() => {
			if (draft !== props.value) props.onCommit(draft)
		},
		props.delayMs ?? 300,
		[draft],
	)

	return (
		<InputGroup className="h-11 bg-background text-base sm:text-sm">
			<InputGroupAddon>
				<Search className="size-4 text-muted-foreground" />
			</InputGroupAddon>
			<InputGroupInput
				type="text"
				placeholder={props.placeholder ?? "Search"}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				maxLength={props.maxLength ?? MAX_SEARCH_QUERY_LENGTH}
				data-testid={props.testId}
			/>
		</InputGroup>
	)
}
