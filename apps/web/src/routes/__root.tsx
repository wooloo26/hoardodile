import { Toaster } from "@hoardodile/ui/components/sonner"
import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AppShell } from "@/components/layout/AppShell"
import { handleResourceMetaUpdated } from "@/features/res/api/sse-handler"
import { hardResetAndReload } from "@/lib/client-reset"
import type { SseEvent } from "@/lib/sse"
import { connectEventSource } from "@/lib/sse"
import type { TRPC } from "@/trpc/client"

export type RouterContext = {
	queryClient: QueryClient
	trpc: TRPC
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
})

export async function handleSseEvent(
	queryClient: QueryClient,
	evt: SseEvent,
	reloadingMessage?: string,
): Promise<void> {
	if (evt.type === "resourceMetaUpdated") {
		handleResourceMetaUpdated(queryClient, evt)
		return
	}
	if (evt.type === "storageContextReloaded") {
		// The underlying database has been replaced. Wipe every form of
		// persisted client state and reload so the app starts fresh against
		// the new storage context.
		void hardResetAndReload(reloadingMessage)
	}
}

function RootComponent() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	useEffect(
		function startSse() {
			return connectEventSource(queryClient, {
				onEvent: (evt) =>
					handleSseEvent(queryClient, evt, t("dataHistory.reloading")),
			})
		},
		[queryClient, t],
	)
	return (
		<>
			<AppShell>
				<Outlet />
			</AppShell>
			<Toaster richColors closeButton position="top-right" />
		</>
	)
}
