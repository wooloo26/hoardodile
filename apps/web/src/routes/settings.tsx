import { Tabs, TabsList, TabsTrigger } from "@hoardodile/ui/components/tabs"
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PageScaffold } from "@/components/layout/PageScaffold"
import { requireAuth } from "@/lib/auth-guard"

export const Route = createFileRoute("/settings")({
	beforeLoad: requireAuth,
	component: SettingsLayout,
})

type TabDef = {
	readonly key: "preferences" | "custom" | "data" | "app" | "plugins"
	readonly path:
		| "/settings"
		| "/settings/custom"
		| "/settings/data"
		| "/settings/app"
		| "/settings/plugins"
	readonly testId: string
}

const TABS: readonly TabDef[] = [
	{ key: "preferences", path: "/settings", testId: "me-tab-preferences" },
	{ key: "custom", path: "/settings/custom", testId: "me-tab-custom" },
	{ key: "data", path: "/settings/data", testId: "me-tab-data" },
	{ key: "app", path: "/settings/app", testId: "me-tab-app" },
	{ key: "plugins", path: "/settings/plugins", testId: "me-tab-plugins" },
] as const

/**
 * Settings layout. The tab bar is rendered once and each tab owns its route,
 * so back/forward navigation and deep links work across settings sections.
 */
function SettingsLayout() {
	const { t } = useTranslation()
	const { pathname } = useLocation()
	const suffix = pathname.replace(/\/$/, "").split("/").pop() ?? "preferences"
	const activeKey = TABS.some((tab) => tab.key === suffix)
		? (suffix as TabDef["key"])
		: "preferences"

	return (
		<PageScaffold className="max-w-3xl">
			<Tabs value={activeKey}>
				<TabsList className="w-full flex-nowrap overflow-x-auto no-scrollbar sm:w-auto">
					{TABS.map((tab) => {
						const active = tab.key === activeKey
						return (
							<TabsTrigger
								key={tab.key}
								value={tab.key}
								asChild
								data-active={active ? "true" : "false"}
								data-testid={tab.testId}
							>
								<Link to={tab.path} resetScroll={false}>
									{t(`me.tabs.${tab.key}`)}
								</Link>
							</TabsTrigger>
						)
					})}
				</TabsList>
				<div className="pt-4">
					<Outlet />
				</div>
			</Tabs>
		</PageScaffold>
	)
}
