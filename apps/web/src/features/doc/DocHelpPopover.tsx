import { Badge } from "@hoardodile/ui/components/badge"
import { Separator } from "@hoardodile/ui/components/separator"
import { useTranslation } from "react-i18next"

export function DocHelpPanel() {
	const { t } = useTranslation()
	const tips = t("documents.help.tips", {
		returnObjects: true,
	}) as readonly string[]
	const shortcuts = t("documents.help.shortcuts", {
		returnObjects: true,
	}) as ReadonlyArray<{ readonly keys: string; readonly desc: string }>
	return (
		<div className="flex flex-col gap-3 text-xs">
			<div>
				<div className="mb-1 text-sm font-semibold">
					{t("documents.help.title")}
				</div>
				<ul className="ml-4 list-disc space-y-1 text-muted-foreground">
					{tips.map((tip) => (
						<li key={tip}>{tip}</li>
					))}
				</ul>
			</div>
			<Separator />
			<div>
				<div className="mb-1 text-sm font-semibold">
					{t("documents.help.shortcutsTitle")}
				</div>
				<ul className="space-y-0.5">
					{shortcuts.map((row) => (
						<li
							key={row.keys}
							className="flex items-center justify-between gap-2"
						>
							<Badge
								variant="secondary"
								className="rounded-md font-mono text-[11px]"
							>
								{row.keys}
							</Badge>
							<span className="text-muted-foreground">{row.desc}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}
