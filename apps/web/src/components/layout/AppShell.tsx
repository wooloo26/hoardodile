import { cn } from "@hoardodile/ui/lib/utils"
import { Link, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
	FilePen,
	Images,
	LayoutDashboard,
	Settings,
	StickyNote,
	Users,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useDocTheme } from "@/features/doc/hooks/useDocPrefs"
import { useStringPrefSync } from "@/hooks/usePrefSync"
import { prefKeys } from "@/lib/keys"

type AppShellProps = {
	readonly children: ReactNode
}

type NavPath =
	| "/"
	| "/resources"
	| "/characters"
	| "/documents"
	| "/messages"
	| "/settings"

type NavItem = {
	readonly to: NavPath
	readonly icon: LucideIcon
	readonly labelKey: string
}

const PRIMARY_NAV_ITEMS = [
	{ to: "/", icon: LayoutDashboard, labelKey: "appShell.nav.overview" },
	{ to: "/characters", icon: Users, labelKey: "appShell.nav.characters" },
	{ to: "/resources", icon: Images, labelKey: "appShell.nav.resources" },
	{ to: "/documents", icon: FilePen, labelKey: "appShell.nav.documents" },
	{ to: "/messages", icon: StickyNote, labelKey: "appShell.nav.comments" },
	{ to: "/settings", icon: Settings, labelKey: "appShell.nav.me" },
] as const satisfies readonly NavItem[]

/**
 * Single compact top bar shared by mobile and desktop. Icon-only on small
 * screens; the label appears alongside on `sm+`.
 */
export function AppShell(props: AppShellProps) {
	const routerState = useRouterState({
		select: (state) => ({
			pathname: state.location.pathname,
			loading: state.isLoading || state.isTransitioning,
		}),
	})
	const isLoginRoute = routerState.pathname === "/login"
	const isDocumentsRoute = routerState.pathname.startsWith("/documents")
	const { themeClass } = useDocTheme()

	if (isLoginRoute) {
		return <>{props.children}</>
	}

	return (
		<div
			className={cn(
				"flex min-h-svh flex-col bg-background text-foreground",
				isDocumentsRoute && themeClass,
			)}
		>
			<NavigationProgress visible={routerState.loading} />
			<TopBar pathname={routerState.pathname} />
			<main className="min-w-0 flex-1">{props.children}</main>
		</div>
	)
}

type NavigationProgressProps = {
	readonly visible: boolean
}

function NavigationProgress(props: NavigationProgressProps) {
	return (
		<div
			className={cn(
				"fixed inset-x-0 top-0 z-50 h-1 bg-primary transition-opacity duration-150",
				props.visible ? "opacity-100" : "pointer-events-none opacity-0",
			)}
			aria-hidden="true"
		/>
	)
}

type PathnameProps = {
	readonly pathname: string
}

function navLinkClassName(active: boolean) {
	return cn(
		"flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
		active
			? "bg-primary text-primary-foreground"
			: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
	)
}

function TopBar(props: PathnameProps) {
	const { t } = useTranslation()
	return (
		<header className="sticky top-0 z-41 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
			<Link
				to="/"
				className="items-center gap-1.5 px-1 text-sm font-semibold hidden md:flex"
			>
				<span className="flex size-9 shrink-0">
					<img
						src="/logo.png"
						alt=""
						width={28}
						height={28}
						className="size-full object-cover"
						decoding="async"
					/>
				</span>
			</Link>
			<nav
				className="flex flex-1 items-center justify-center gap-0.5 overflow-x-auto sm:gap-1"
				aria-label={t("appShell.primaryNav")}
			>
				{PRIMARY_NAV_ITEMS.map((item) =>
					item.to === "/documents" ? (
						<TopBarDocLink key={item.to} pathname={props.pathname} />
					) : (
						<TopBarLink key={item.to} item={item} pathname={props.pathname} />
					),
				)}
			</nav>
		</header>
	)
}

type TopBarLinkProps = {
	readonly item: NavItem
	readonly pathname: string
}

function TopBarLink(props: TopBarLinkProps) {
	const { t } = useTranslation()
	const Icon = props.item.icon
	const active = isRouteActive({ pathname: props.pathname, to: props.item.to })
	return (
		<Link
			to={props.item.to}
			aria-current={active ? "page" : undefined}
			title={t(props.item.labelKey)}
			className={navLinkClassName(active)}
		>
			<Icon className="size-4 shrink-0" />
			<span className="hidden truncate sm:inline">
				{t(props.item.labelKey)}
			</span>
		</Link>
	)
}

type TopBarDocLinkProps = {
	readonly pathname: string
}

/**
 * Documents entry points at the user's last location inside the section:
 * the last opened document, or the documents home when that was the last
 * place visited (recorded as the empty value — see `useDocsHomeLastOpened`).
 */
function TopBarDocLink(props: TopBarDocLinkProps) {
	const { t } = useTranslation()
	const [lastDocId] = useStringPrefSync(prefKeys.docLastOpened, "")
	const active = isRouteActive({ pathname: props.pathname, to: "/documents" })
	const label = t("appShell.nav.documents")
	const className = navLinkClassName(active)

	if (lastDocId.length > 0) {
		return (
			<Link
				to="/documents/$id"
				params={{ id: lastDocId }}
				aria-current={active ? "page" : undefined}
				title={label}
				className={className}
			>
				<FilePen className="size-4 shrink-0" />
				<span className="hidden truncate sm:inline">{label}</span>
			</Link>
		)
	}

	return (
		<Link
			to="/documents"
			aria-current={active ? "page" : undefined}
			title={label}
			className={className}
		>
			<FilePen className="size-4 shrink-0" />
			<span className="hidden truncate sm:inline">{label}</span>
		</Link>
	)
}

type RouteActivityInput = {
	readonly pathname: string
	readonly to: NavPath
}

function isRouteActive(input: RouteActivityInput) {
	if (input.to === "/") {
		return input.pathname === "/"
	}

	return (
		input.pathname === input.to || input.pathname.startsWith(`${input.to}/`)
	)
}
