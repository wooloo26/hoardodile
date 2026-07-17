import type { CharCard as CharCardData } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@hoardodile/ui/components/sheet"
import { useQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router"
import { PanelRight } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useCategoryList } from "@/features/cat"
import { CharCard, charDetailCardQueryOptions } from "@/features/char"
import { CharImagePreviewDialog } from "@/features/char/components/CharImagePreviewDialog"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { buildTagGroups, tagsForCharacterQueryOptions } from "@/features/tags"
import { CatTagGroups } from "@/features/tags/CatTagGroups"
import { TagChip } from "@/features/tags/TagChip"
import {
	buildTraitRows,
	formatTraitValue,
	traitListQueryOptions,
} from "@/features/traits"
import { EntityUsageStats } from "@/features/usage/components/EntityUsageStats"
import { useUsageTracker } from "@/features/usage/useUsageTracker"
import { requireAuth } from "@/lib/auth-guard"
import { apiPaths } from "@/lib/paths"

export const Route = createFileRoute("/characters/$id")({
	beforeLoad: requireAuth,
	component: CharDetailLayout,
})

/**
 * Character detail layout. Mirrors the structure of `/resources/$id`:
 * the right sidebar (fullbody illustration, traits, tag groups) is owned
 * by the layout and persists across tabs, while the main column holds
 * the per-tab content via {@link Outlet}. The header reuses
 * {@link CharCard} for avatar + actions.
 *
 * Tag groups, trait values, and the fullbody illustration intentionally
 * live outside the overview tab so navigating to the resources tab keeps
 * the sidebar context visible.
 */
function CharDetailLayout() {
	const { id } = Route.useParams()
	useUsageTracker({ entityType: "character", entityId: id })
	const { t } = useTranslation()
	const detail = useQuery(charDetailCardQueryOptions(id))
	const [preview, setPreview] = useState<{
		open: boolean
		variant: "avatar" | "fullbody"
	}>({ open: false, variant: "avatar" })
	const [sheetOpen, setSheetOpen] = useState(false)

	// Show stale data while a refetch is in flight or has transiently failed.
	// Only fall back to loading/error placeholders when no data has ever arrived,
	// otherwise a transient error during tab switches (TanStack Router cancels
	// in-flight queries on navigation, surfacing AbortError once with retry: false)
	// would unmount the entire detail page until a hard refresh.
	const c = detail.data
	if (c === undefined) {
		if (detail.isError) {
			return (
				<div className="p-6 text-sm text-destructive">
					{t("characters.detail.loadError")}
				</div>
			)
		}
		return (
			<div className="p-6 text-sm text-muted-foreground">
				{t("common.loading")}
			</div>
		)
	}

	const intro = detail.data?.intro ?? ""
	const phrases = intro.split("\n")

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-2 sm:px-6 lg:px-8 lg:py-8">
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div>
					<header className="flex flex-row items-start gap-4 rounded p-4">
						<CharCard
							character={c}
							className="shrink-0"
							onAvatarClick={() =>
								setPreview({ open: true, variant: "avatar" })
							}
						/>
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<h1
								className="wrap-break-word text-xl font-semibold"
								data-testid="character-detail-name"
							>
								{c.name}
							</h1>
							<EntityUsageStats entityType="character" entityId={id} />
							{intro.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									{t("characters.detail.noIntro")}
								</p>
							) : (
								phrases.map((phrase, i) =>
									phrase.length > 0 ? (
										<p
											key={i}
											className="indent-[2em] text-sm whitespace-pre-wrap"
										>
											{phrase}
										</p>
									) : (
										<div key={i} className="h-2" />
									),
								)
							)}
						</div>
					</header>
					<div className="flex min-w-0 flex-col gap-4">
						<CharTabs charId={c.id} />
						<Outlet />
					</div>
				</div>
				<aside
					className="hidden flex-col gap-6 lg:flex lg:sticky lg:top-4 lg:self-start"
					data-testid="character-detail-sidebar"
				>
					<CharSidebar
						char={c}
						onFullbodyClick={() =>
							setPreview({ open: true, variant: "fullbody" })
						}
					/>
				</aside>
			</div>
			<Button
				type="button"
				variant="secondary"
				size="icon"
				className="fixed bottom-4 right-4 z-50 shadow-lg lg:hidden"
				aria-label={t("characters.detail.openSidebar")}
				onClick={() => setSheetOpen(true)}
				data-testid="character-detail-sidebar-fab"
			>
				<PanelRight className="size-5" />
			</Button>
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent side="right" className="w-3/4 sm:max-w-sm">
					<SheetHeader>
						<SheetTitle>{c.name}</SheetTitle>
					</SheetHeader>
					<div className="flex flex-col gap-6 overflow-y-auto p-4">
						<CharSidebar
							char={c}
							onFullbodyClick={() => {
								setSheetOpen(false)
								setPreview({ open: true, variant: "fullbody" })
							}}
						/>
					</div>
				</SheetContent>
			</Sheet>
			<CharImagePreviewDialog
				open={preview.open}
				charId={c.id}
				charName={c.name}
				variant={preview.variant}
				updatedAt={c.updatedAt}
				onOpenChange={(open) => setPreview((prev) => ({ ...prev, open }))}
			/>
		</div>
	)
}

type TabDef = {
	readonly key: "overview" | "resources"
	readonly path: "/characters/$id" | "/characters/$id/resources"
}

const TABS: readonly TabDef[] = [
	{ key: "overview", path: "/characters/$id" },
	{ key: "resources", path: "/characters/$id/resources" },
] as const

function CharTabs({ charId }: { readonly charId: string }) {
	const loc = useLocation()
	const { t } = useTranslation()
	const suffix = loc.pathname.replace(/\/$/, "").split("/").pop()
	const activeKey = suffix === "resources" ? "resources" : "overview"
	return (
		<nav
			className="-mb-px flex flex-nowrap overflow-x-auto no-scrollbar gap-1 border-b"
			data-testid="character-tabs"
			aria-label={t("characters.detail.tabsAria")}
		>
			{TABS.map((tab) => {
				const active = tab.key === activeKey
				return (
					<Link
						key={tab.key}
						to={tab.path}
						params={{ id: charId }}
						resetScroll={false}
						className={
							active
								? "border-primary text-foreground border-b-2 px-4 py-2 text-sm font-medium"
								: "text-muted-foreground hover:text-foreground border-b-2 border-transparent px-4 py-2 text-sm"
						}
						data-testid={`character-tab-${tab.key}`}
						data-active={active ? "true" : "false"}
					>
						{t(`characters.detail.tabs.${tab.key}`)}
					</Link>
				)
			})}
		</nav>
	)
}

type FullbodySectionProps = {
	readonly charId: string
	readonly name: string
	readonly updatedAt: number
	readonly onClick?: () => void
}

function FullbodySection(props: FullbodySectionProps) {
	const { charId, name, updatedAt, onClick } = props
	const { t } = useTranslation()
	return (
		<section
			className="flex flex-col gap-2"
			data-testid="character-detail-fullbody"
		>
			<h2 className="text-base font-semibold">
				{t("characters.detail.fullbody")}
			</h2>
			<div className="flex w-full justify-center">
				<button
					type="button"
					onClick={onClick}
					className="cursor-pointer"
					disabled={onClick === undefined}
				>
					<img
						src={`${apiPaths.characters.thumb(charId, "fullbody")}?v=${updatedAt}`}
						alt={name}
						className="rounded-lg object-contain w-auto h-auto max-w-full max-h-160"
					/>
				</button>
			</div>
		</section>
	)
}

function TraitsSection({ charId }: { readonly charId: string }) {
	const { t } = useTranslation()
	const { formatDateTrait } = useDateFormatter()
	const detail = useQuery(charDetailCardQueryOptions(charId))
	const traitsQ = useQuery(traitListQueryOptions())
	const rows = buildTraitRows(
		traitsQ.data ?? [],
		detail.data?.traitValues ?? {},
	)
	if (rows.length === 0) return null
	return (
		<section
			className="flex flex-col gap-2"
			data-testid="character-detail-traits"
		>
			<h2 className="text-base font-semibold">
				{t("characters.detail.traits")}
			</h2>
			<dl className="flex flex-col gap-1.5 text-sm">
				{rows.map((row) => (
					<div
						key={row.traitId}
						className="flex flex-wrap items-baseline gap-x-2"
						data-testid={`character-detail-trait-${row.traitId}`}
					>
						<dt className="shrink-0">
							<TagChip
								id={row.traitId}
								type="character"
								name={row.name}
								color={row.color}
								link={false}
							/>
						</dt>
						<dd className="wrap-break-word">
							{formatTraitValue(row, formatDateTrait)}
						</dd>
					</div>
				))}
			</dl>
		</section>
	)
}

function TagsSection({ charId }: { readonly charId: string }) {
	const { t } = useTranslation()
	const tagsQ = useQuery(tagsForCharacterQueryOptions(charId))
	const categories = useCategoryList()
	const groups = buildTagGroups(tagsQ.data ?? [], categories)
	if (groups.length === 0) return null
	return (
		<section
			className="flex flex-col gap-2"
			data-testid="character-detail-tags"
		>
			<h2 className="text-base font-semibold">{t("characters.detail.tags")}</h2>
			<CatTagGroups
				type="character"
				groups={groups}
				categoryVariant="chip"
				testIdPrefix="character-detail-tag-group"
			/>
		</section>
	)
}

type CharSidebarProps = {
	readonly char: CharCardData
	readonly onFullbodyClick: () => void
}

function CharSidebar({ char, onFullbodyClick }: CharSidebarProps) {
	return (
		<>
			<FullbodySection
				charId={char.id}
				name={char.name}
				updatedAt={char.updatedAt}
				onClick={onFullbodyClick}
			/>
			<TraitsSection charId={char.id} />
			<TagsSection charId={char.id} />
		</>
	)
}
