import { Badge } from "@hoardodile/ui/components/badge"
import { Button } from "@hoardodile/ui/components/button"
import { cn } from "@hoardodile/ui/lib/utils"
import { ExternalLink, Info, RefreshCw, Scale } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { APP_REPOSITORY_URL, APP_VERSION } from "@/lib/appInfo"
import { checkForUpdate, type UpdateCheckResult } from "./checkUpdates"
import { LicensesDialog } from "./LicensesDialog"
import { SettingsSection } from "./SettingsSection"

type UpdateState = { readonly status: "idle" | "checking" } | UpdateCheckResult

/**
 * About block on the App settings tab: app name and version, repository
 * link, a manual update check (the app's only external request, fired
 * solely on click), and the third-party licenses dialog.
 */
export function AboutSection() {
	const { t } = useTranslation()
	const [update, setUpdate] = useState<UpdateState>({ status: "idle" })

	async function handleCheck() {
		setUpdate({ status: "checking" })
		setUpdate(await checkForUpdate(APP_VERSION))
	}

	return (
		<SettingsSection
			icon={Info}
			title={t("me.about.title")}
			description={t("me.about.description")}
			data-testid="me-section-about"
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold">hoardodile</span>
						<Badge variant="secondary">v{APP_VERSION}</Badge>
					</div>
					<p className="text-xs text-muted-foreground">
						{t("me.about.tagline")}
					</p>
					<a
						href={APP_REPOSITORY_URL}
						target="_blank"
						rel="noreferrer"
						className="flex w-fit items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
					>
						<ExternalLink className="size-3.5" />
						{t("me.about.repository")}
					</a>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							void handleCheck()
						}}
						disabled={update.status === "checking"}
						data-testid="me-about-check-update"
					>
						<RefreshCw
							className={cn(
								"mr-1 size-4",
								update.status === "checking" && "animate-spin",
							)}
						/>
						{t("me.about.checkUpdate")}
					</Button>
					<LicensesDialog
						trigger={
							<Button
								variant="outline"
								size="sm"
								data-testid="me-licenses-button"
							>
								<Scale className="mr-1 size-4" />
								{t("me.licenses.viewButton")}
							</Button>
						}
					/>
				</div>

				{update.status === "checking" ? (
					<p className="text-xs text-muted-foreground">
						{t("me.about.checking")}
					</p>
				) : null}
				{update.status === "latest" ? (
					<p className="text-xs text-muted-foreground">
						{t("me.about.latest")}
					</p>
				) : null}
				{update.status === "outdated" ? (
					<p className="text-xs" data-testid="me-about-outdated">
						{t("me.about.outdated", { version: update.version })}{" "}
						<a
							href={update.url}
							target="_blank"
							rel="noreferrer"
							className="text-primary underline-offset-4 hover:underline"
						>
							{t("me.about.viewRelease")}
						</a>
					</p>
				) : null}
				{update.status === "error" ? (
					<p className="text-xs text-destructive">
						{t("me.about.updateError")}
					</p>
				) : null}
			</div>
		</SettingsSection>
	)
}
