import { Button } from "@hoardodile/ui/components/button"
import { ButtonGroup } from "@hoardodile/ui/components/button-group"
import { Input } from "@hoardodile/ui/components/input"
import { cn } from "@hoardodile/ui/lib/utils"
import { useNavigate } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

type OverviewSearchBarProps = {
	readonly className?: string
}

export function OverviewSearchBar(props: OverviewSearchBarProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [text, setText] = useState("")
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		function handleKeyDown(ev: KeyboardEvent) {
			const target = ev.target as HTMLElement | null
			const isTyping =
				target !== null &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)

			if (
				!isTyping &&
				(ev.key === "/" || (ev.key === "k" && (ev.metaKey || ev.ctrlKey)))
			) {
				ev.preventDefault()
				inputRef.current?.focus()
			}
		}

		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [])

	function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault()
		const trimmed = text.trim()
		navigate({
			to: "/search",
			search: {
				query: trimmed.length > 0 ? trimmed : undefined,
			},
		})
	}

	return (
		<div
			className={cn(
				"mx-auto flex w-full max-w-md flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center",
				props.className,
			)}
			data-testid="overview-search-bar"
		>
			<form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
				<ButtonGroup className="w-full">
					<Input
						ref={inputRef}
						type="text"
						value={text}
						onChange={(ev) => setText(ev.target.value)}
						placeholder={t("search.placeholder")}
						data-testid="overview-search-input"
					/>
					<Button
						type="submit"
						variant="outline"
						aria-label={t("search.submit")}
						data-testid="overview-search-submit"
					>
						<Search className="size-4" />
					</Button>
				</ButtonGroup>
			</form>
		</div>
	)
}
