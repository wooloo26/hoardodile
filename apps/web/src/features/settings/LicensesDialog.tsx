import { Badge } from "@hoardodile/ui/components/badge"
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@hoardodile/ui/components/dialog"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { SettingsSection } from "./SettingsSection"

type LicensePackage = {
	readonly name: string
	readonly version: string
	readonly license: string
	readonly repository: string
	readonly publisher: string
	readonly copyright: string
}

type LicenseGroup = {
	readonly license: string
	readonly packages: readonly LicensePackage[]
}

type FontEntry = {
	readonly family: string
	readonly license: string
	readonly licenseUrl: string
	readonly attribution: string
	readonly source: string
}

type LicensesData = {
	readonly project: { readonly name: string; readonly license: string }
	readonly licenses: readonly LicenseGroup[]
	readonly fonts: readonly FontEntry[]
}

function useLicenses() {
	const [data, setData] = useState<LicensesData | null>(null)
	const [error, setError] = useState<Error | null>(null)

	useEffect(() => {
		fetch("/licenses.json")
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				return res.json() as Promise<LicensesData>
			})
			.then(setData)
			.catch(setError)
	}, [])

	return { data, error }
}

export type LicensesDialogProps = {
	readonly trigger: React.ReactNode
}

export function LicensesDialog(props: LicensesDialogProps) {
	const { t } = useTranslation()
	const { data, error } = useLicenses()
	const [open, setOpen] = useState(false)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{props.trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("me.licenses.title")}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<div className="flex flex-col gap-5">
						<SettingsSection
							title={t("me.licenses.projectLicense")}
							description={t("me.licenses.projectLicenseDescription")}
						>
							<div className="flex items-center gap-2">
								<Badge variant="secondary">{data?.project.license}</Badge>
								<a
									href="/LICENSE"
									target="_blank"
									rel="noreferrer"
									className="text-xs text-primary underline-offset-4 hover:underline"
								>
									{t("me.licenses.fullLicense")}
								</a>
							</div>
						</SettingsSection>

						<SettingsSection title={t("me.licenses.fonts")}>
							{data ? (
								<ul className="flex flex-col gap-2">
									{data.fonts.map((font) => (
										<li
											key={font.family}
											className="text-xs text-muted-foreground"
										>
											<span className="font-medium text-foreground">
												{font.family}
											</span>
											<span className="ml-2">
												<a
													href={font.licenseUrl}
													target="_blank"
													rel="noreferrer"
													className="hover:underline"
												>
													{font.license}
												</a>
											</span>
											<span className="ml-2">— {font.attribution}</span>
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-muted-foreground">
									{t("common.loading")}
								</p>
							)}
						</SettingsSection>

						<SettingsSection
							title={t("me.licenses.dependencies")}
							description={
								data
									? t("me.licenses.packageCount", {
											count: data.licenses.reduce(
												(sum, group) => sum + group.packages.length,
												0,
											),
										})
									: ""
							}
						>
							{error ? (
								<p className="text-sm text-destructive">{error.message}</p>
							) : data ? (
								<div className="flex flex-col gap-4">
									{data.licenses.map((group) => (
										<div key={group.license}>
											<div className="mb-2 flex items-center gap-2">
												<h3 className="text-sm font-semibold">
													{group.license}
												</h3>
												<Badge variant="outline">{group.packages.length}</Badge>
											</div>
											<ul className="flex flex-col gap-1">
												{group.packages.map((pkg) => (
													<li
														key={`${pkg.name}@${pkg.version}`}
														className="text-xs text-muted-foreground"
													>
														{pkg.repository ? (
															<a
																href={pkg.repository}
																target="_blank"
																rel="noreferrer"
																className="font-medium text-foreground hover:underline"
															>
																{pkg.name}
															</a>
														) : (
															<span className="font-medium text-foreground">
																{pkg.name}
															</span>
														)}
														<span className="ml-1">@{pkg.version}</span>
														{pkg.copyright ? (
															<span className="ml-2">— {pkg.copyright}</span>
														) : pkg.publisher ? (
															<span className="ml-2">— {pkg.publisher}</span>
														) : null}
													</li>
												))}
											</ul>
										</div>
									))}
								</div>
							) : (
								<p className="text-sm text-muted-foreground">
									{t("common.loading")}
								</p>
							)}
						</SettingsSection>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	)
}
