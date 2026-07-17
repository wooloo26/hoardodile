import { Button } from "@hoardodile/ui/components/button"
import { isBelowMd } from "@hoardodile/ui/hooks/use-mobile"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { authStatusQueryKey, logout } from "@/features/auth"
import { charKeys } from "@/features/char"
import { resKeys } from "@/features/res"
import { swMessageTypes } from "@/lib/keys"
import { clearCache, trashListQueryOptions } from "./api"
import { SettingsRow } from "./SettingsRow"
import { TrashPreviewDialog } from "./TrashPreviewDialog"
import { usePrecache } from "./use-precache"

/**
 * Aggregate cache and precache controls grouped on the Me page.
 *
 * "Clear Cache" wipes local/ resource, character, and tmp directories plus
 * all rebuildable meta columns in the DB.
 *
 * "Precache" rebuilds every resource's metadata in a single merged pass
 * server-side and generates all cover / avatar / fullbody thumbnails,
 * streaming progress via SSE. After the server phase it warms the
 * browser HTTP cache with the result URLs.
 */
export function RebuildPanel() {
	const queryClient = useQueryClient()
	const { t } = useTranslation()
	const precache = usePrecache()
	const [clearingAll, setClearingAll] = useState(false)
	const [cacheProgress, setCacheProgress] = useState<{
		total: number
		done: number
	} | null>(null)

	const mounted = useRef(false)

	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true
			void precache.resumeIfRunning()
		}
	}, [precache])

	const isChecking = precache.status === "checking"
	const isLoading = precache.status === "loading" || cacheProgress !== null
	const isReady = precache.status === "ready"
	const conflict = precache.conflict

	const serverTotal = precache.progress.total
	const serverDone = precache.progress.current
	const cacheTotal = cacheProgress?.total ?? 0
	const cacheDone = cacheProgress?.done ?? 0

	const inServerPhase = precache.status === "loading"
	const inCachePhase = cacheProgress !== null
	const total = inCachePhase ? cacheTotal : serverTotal
	const done = inCachePhase ? cacheDone : serverDone
	const percent = total === 0 ? 0 : Math.round((done / total) * 100)

	const stage: string = (() => {
		if (inCachePhase) return t("overview.caching")
		if (inServerPhase && precache.progress.phase !== null) {
			return precache.progress.phase
		}
		return t("overview.precacheStageLoading")
	})()

	async function doClearCache() {
		setClearingAll(true)
		try {
			await clearCache()
			if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage({
					type: swMessageTypes.clearCache,
				})
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: resKeys.all }),
				queryClient.invalidateQueries({ queryKey: charKeys.all }),
			])
			toast.success(t("overview.toastClearSuccess"))
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("overview.toastClearFailed"),
			)
		} finally {
			setClearingAll(false)
		}
	}

	async function handleClearCache() {
		await doClearCache()
	}

	async function handlePrecache() {
		const result = await precache.start()
		if (result === null) return

		const failed = result.resources.failed + result.characters.failed
		const resTotal = result.resources.total
		const charTotal = result.characters.total
		const allUrls = [
			...result.resources.thumbUrls,
			...result.characters.thumbUrls,
		]

		if (allUrls.length > 0) {
			setCacheProgress({ total: allUrls.length, done: 0 })
			await prefetchImages(allUrls, 6, (doneCount) => {
				setCacheProgress((prev) =>
					prev === null ? null : { ...prev, done: doneCount },
				)
			})
			setCacheProgress(null)
		}

		await Promise.all([
			queryClient.invalidateQueries({ queryKey: resKeys.all }),
			queryClient.invalidateQueries({ queryKey: charKeys.all }),
		])

		if (failed > 0) {
			toast.warning(t("overview.toastPrecachePartial", { failed }))
		} else {
			toast.success(
				t("overview.toastPrecacheSuccess", { count: resTotal + charTotal }),
			)
		}
	}

	async function handleAbortPrecache() {
		const ok = await precache.abort()
		if (ok) {
			toast.info(t("overview.precacheAborted"))
		}
	}

	const idle = precache.status === "idle" && cacheProgress === null

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					onClick={handleClearCache}
					disabled={clearingAll || isLoading}
					data-testid="clear-all-cache"
				>
					{clearingAll ? t("overview.clearing") : t("overview.clearCache")}
				</Button>
				<Button
					size="sm"
					onClick={() => {
						void handlePrecache()
					}}
					disabled={isLoading || isChecking}
					data-testid="precache-thumbnails"
				>
					{isLoading
						? t("overview.precaching")
						: isReady
							? t("overview.refreshCache")
							: t("overview.precache")}
				</Button>
				{inServerPhase ? (
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							void handleAbortPrecache()
						}}
						data-testid="abort-precache"
					>
						{t("overview.abortPrecache")}
					</Button>
				) : null}
			</div>

			{(isLoading || isReady) && !conflict ? (
				<div className="flex flex-col gap-2">
					<div
						className="h-2 w-full overflow-hidden rounded-full bg-muted"
						aria-hidden="true"
					>
						<div
							className="h-full bg-primary transition-[width] duration-200"
							style={{ width: `${percent}%` }}
						/>
					</div>
					<p
						className="text-xs text-muted-foreground"
						data-testid="precache-thumbnails-status"
					>
						{isLoading
							? t("overview.progressLine", {
									done,
									total,
									percent,
									stage,
								})
							: t("overview.cachedSummary", { count: total })}
					</p>
				</div>
			) : null}

			{precache.status === "error" ? (
				<p className="text-xs text-destructive">
					{conflict
						? t("overview.precacheInProgress")
						: t("overview.precacheFailed", {
								error: precache.error ?? t("overview.precacheDefaultError"),
							})}
				</p>
			) : null}

			{idle ? (
				<p className="text-xs text-muted-foreground">
					{t("overview.precacheHint")}
				</p>
			) : null}
		</div>
	)
}

/**
 * Prefetch an array of URLs through detached `<img>` elements so the
 * browser HTTP cache is warm. Errors resolve so the run can finish.
 * `onProgress` is called after each URL completes (success or failure).
 */
async function prefetchImages(
	urls: readonly string[],
	concurrency: number,
	onProgress?: (done: number) => void,
): Promise<void> {
	let cursor = 0
	let done = 0

	async function pump(): Promise<void> {
		for (;;) {
			const i = cursor
			cursor += 1
			if (i >= urls.length) break
			const url = urls[i]
			if (url !== undefined) {
				await new Promise<void>((resolve) => {
					const img = new Image()
					function settle() {
						img.removeEventListener("load", settle)
						img.removeEventListener("error", settle)
						resolve()
					}
					img.addEventListener("load", settle)
					img.addEventListener("error", settle)
					img.src = url
				})
			}
			done += 1
			onProgress?.(done)
		}
	}

	const lanes = Math.min(concurrency, urls.length)
	const runners: Promise<void>[] = []
	for (let i = 0; i < lanes; i += 1) runners.push(pump())
	await Promise.all(runners)
}

/**
 * Toggles browser fullscreen on the document root so the entire web
 * UI fills the screen. Distinct from the per-preview fullscreen
 * affordance: this one is meant for distraction-free reading or
 * presentation, not for media inspection.
 */
export function FullscreenSection() {
	const { t } = useTranslation()
	const [isFullscreen, setIsFullscreen] = useState(false)
	useEffect(() => {
		function handleChange() {
			const isFs = document.fullscreenElement !== null
			setIsFullscreen(isFs)
			if (!isFs) {
				document.documentElement.classList.remove("mobile-fs-zoom")
			}
		}
		document.addEventListener("fullscreenchange", handleChange)
		return () => {
			document.removeEventListener("fullscreenchange", handleChange)
		}
	}, [])
	function toggle() {
		if (document.fullscreenElement !== null) {
			void document.exitFullscreen()
			return
		}
		const root = document.documentElement
		if (isBelowMd()) {
			root.classList.add("mobile-fs-zoom")
		}
		const req = root.requestFullscreen?.bind(root)
		if (req === undefined) {
			toast.error(t("me.fullscreen.unsupported"))
			return
		}
		void req()
	}
	return (
		<SettingsRow
			title={t("me.section.fullscreen")}
			description={t("me.fullscreen.description")}
			control={
				<Button
					size="sm"
					variant="outline"
					onClick={toggle}
					data-testid="fullscreen-toggle"
				>
					{isFullscreen ? t("me.fullscreen.exit") : t("me.fullscreen.enter")}
				</Button>
			}
			data-testid="fullscreen-row"
		/>
	)
}

/**
 * Sign-out action rendered as a flat setting row on the "Me" page.
 */
export function SignOutSection() {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const logoutMutation = useMutation({
		mutationFn: logout,
		onSuccess: async () => {
			queryClient.setQueryData(authStatusQueryKey, { authenticated: false })
			await navigate({ to: "/login" })
		},
	})

	return (
		<SettingsRow
			title={t("overview.signOut")}
			description={t("me.signOut.description")}
			control={
				<Button
					variant="outline"
					size="sm"
					onClick={() => logoutMutation.mutate()}
					disabled={logoutMutation.isPending}
					data-testid="sign-out"
				>
					{logoutMutation.isPending
						? t("overview.signingOut")
						: t("overview.signOut")}
				</Button>
			}
			data-testid="sign-out-row"
		/>
	)
}

/**
 * Trash section on the Me page showing count and a button to open
 * a full ResPreviewDialog-based flip-through preview.
 */
export function TrashPanel() {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const query = useQuery(trashListQueryOptions())
	const items = query.data?.items ?? []

	function handleOpen() {
		if (items.length > 0) setOpen(true)
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<Button
					size="sm"
					variant="outline"
					onClick={handleOpen}
					disabled={items.length === 0}
					data-testid="view-trash"
				>
					<Trash2 className="mr-1 size-4" />
					{t("me.trash.view", { count: items.length })}
				</Button>
			</div>
			<TrashPreviewDialog items={items} open={open} onOpenChange={setOpen} />
		</div>
	)
}
