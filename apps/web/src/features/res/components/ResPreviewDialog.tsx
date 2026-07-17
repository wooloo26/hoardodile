import type { PluginManifestId, Resource } from "@hoardodile/schemas"
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@hoardodile/ui/components/dialog"
import { isBelowMd } from "@hoardodile/ui/hooks/use-mobile"
import { cn } from "@hoardodile/ui/lib/utils"
import { Maximize, Minimize, X } from "lucide-react"
import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { usePluginIframeSlot } from "@/features/plugin/iframe/use-iframe-slot"
import { useUsageTracker } from "@/features/usage/useUsageTracker"

// ── Fullscreen interface ──────────────────────────────────────────────────────

export type FullscreenAPI = {
	readonly isFullscreen: boolean
	readonly toggle: () => void
}

/**
 * Drive the browser Fullscreen API against an externally-owned
 * container ref. The caller decides which element fullscreens (so
 * the same hook works for the dialog's content surface, the resource
 * detail page's preview block, etc.) and renders its own button.
 */
export function useContainerFullscreen(
	containerRef: RefObject<HTMLElement | null>,
): FullscreenAPI {
	const [isFullscreen, setIsFullscreen] = useState(false)
	useEffect(() => {
		function handleChange() {
			const el = containerRef.current
			const isFs = document.fullscreenElement === el
			setIsFullscreen(isFs)
			if (!isFs && el !== null) {
				el.classList.remove("mobile-fs-zoom")
			}
		}
		document.addEventListener("fullscreenchange", handleChange)
		return () => {
			document.removeEventListener("fullscreenchange", handleChange)
		}
	}, [containerRef])
	function toggle() {
		const el = containerRef.current
		if (el === null) return
		if (document.fullscreenElement === el) {
			void document.exitFullscreen()
		} else {
			if (isBelowMd()) {
				el.classList.add("mobile-fs-zoom")
			}
			void el.requestFullscreen()
		}
	}
	return { isFullscreen, toggle }
}

export type FullscreenButtonProps = {
	readonly api: FullscreenAPI
	readonly className?: string
}

/**
 * Tiny presentational fullscreen toggle. Stays decoupled from
 * {@link PreviewContent} so the surrounding chrome (dialog header,
 * detail page toolbar, feed overlay, …) decides when and where to
 * surface it.
 */
export function FullscreenButton(props: FullscreenButtonProps) {
	const { t } = useTranslation()
	const { isFullscreen, toggle } = props.api
	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={t(
				isFullscreen
					? "resources.preview.exitFullscreen"
					: "resources.preview.enterFullscreen",
			)}
			className={
				props.className ??
				"flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-70 transition-opacity hover:opacity-100"
			}
			data-testid="preview-fullscreen-toggle"
		>
			{isFullscreen ? (
				<Minimize className="h-4 w-4" />
			) : (
				<Maximize className="h-4 w-4" />
			)}
		</button>
	)
}

// ── Content switcher ──────────────────────────────────────────────────────────

export type PreviewContentProps = {
	readonly resId: string
	readonly resName: string
	readonly contentPluginId: PluginManifestId
	readonly sourceMeta: Resource["sourceMeta"]
	readonly searchMeta?: Resource["searchMeta"]
	readonly fileStats?: Resource["fileStats"]
	/**
	 * Caller-supplied ref kept in sync with the live pool iframe. Combine
	 * with {@link useContainerFullscreen} to fullscreen the actual iframe
	 * element rather than the placeholder wrapper (which sits in a
	 * different DOM subtree than the floated iframe).
	 */
	readonly iframeRef?: RefObject<HTMLIFrameElement | null>
	/**
	 * Forces the iframe theme regardless of the host global theme. The
	 * dialog chrome is always dark, so callers should pass "dark".
	 */
	readonly forceTheme?: "light" | "dark"
	/**
	 * When true, appends the iframe directly into the placeholder instead
	 * of floating it via fixed positioning.
	 */
	readonly inline?: boolean
	/** Called when the plugin placeholder enters or leaves the viewport. */
	readonly onContentVisibleChange?: (visible: boolean) => void
}

/**
 * Self-contained preview surface used both inside the lightbox dialog
 * and on the standalone resource detail page. Dispatches to the plugin
 * render module registered for `contentPluginId`.
 *
 * Fullscreening is intentionally not implemented here: callers attach
 * their own {@link iframeRef} and render an external button via
 * {@link useContainerFullscreen} / {@link FullscreenButton} so the
 * dialog header, detail page toolbar, and feed overlay each control
 * the affordance themselves.
 */
export function PreviewContent(props: PreviewContentProps) {
	const { resId, resName, contentPluginId, sourceMeta, searchMeta, fileStats } =
		props
	const { t } = useTranslation()
	const [error, setError] = useState<string | null>(null)
	const { ref, status, contentVisible } = usePluginIframeSlot({
		pluginId: contentPluginId,
		resId,
		resName,
		sourceMeta,
		searchMeta,
		fileStats,
		contentPluginId,
		zHint: 1001,
		forceTheme: props.forceTheme,
		iframeRef: props.iframeRef,
		inline: props.inline,
		onError: (info) => {
			console.error(
				`[plugin-error] ${info.pluginId} / ${info.resId}:`,
				info.error,
			)
			setError(info.error.message)
		},
	})

	useEffect(() => {
		props.onContentVisibleChange?.(contentVisible)
	}, [contentVisible, props.onContentVisibleChange])

	return (
		<div
			ref={ref}
			className="relative flex h-full w-full items-center justify-center"
		>
			{status === "error" ? (
				<div className="text-sm text-red-400">
					{t("plugin.previewFailed")}: {error ?? t("common.unknownError")}
				</div>
			) : null}
			{status === "loading" ? (
				<div className="text-sm">{t("plugin.loading")}</div>
			) : null}
		</div>
	)
}

// ── Main component ────────────────────────────────────────────────────────────

export type ResPreviewDialogProps = {
	readonly resId: string
	readonly resName: string
	readonly contentPluginId: PluginManifestId
	readonly sourceMeta: Resource["sourceMeta"]
	readonly searchMeta?: Resource["searchMeta"]
	readonly fileStats?: Resource["fileStats"]
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	/**
	 * Optional extra controls rendered under the preview surface.
	 * Used by `<ResSearch>` to inject prev/next navigation + paging.
	 */
	readonly bottomBar?: React.ReactNode
}

/**
 * Full-screen lightbox preview for a resource.
 *
 * Supported media types:
 * - `gallery` - image slideshow via `listFiles` + {@link apiPaths.resources.files}
 * - `manga`   - same as gallery, sorted by filename
 * - `video`   - native `<video>` via {@link apiPaths.resources.cover} with `?format=video`
 *
 * Galleries always go through {@link GalleryView}, even when the resource
 * holds a single file. The preview/original toggle is decided per-file
 * from the real-time `listFiles` probe (image type + area >
 * {@link RESOURCE_PREVIEW_MAX_AREA}); for files where the server cannot
 * meaningfully downscale, the toggle stays hidden and the original is
 * served unconditionally.
 */
export function ResPreviewDialog(props: ResPreviewDialogProps) {
	const {
		resId,
		resName,
		contentPluginId,
		sourceMeta,
		searchMeta,
		fileStats,
		open,
		onOpenChange,
	} = props
	const { t } = useTranslation()
	const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
	const fullscreenAPI = useContainerFullscreen(previewIframeRef)
	const [contentVisible, setContentVisible] = useState(false)
	useUsageTracker({
		entityType: "resource",
		entityId: resId,
		enabled: open,
		active: open && contentVisible,
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				overlayClassName="bg-black/85 transition-none data-open:animate-none data-closed:animate-none"
				// Backdrop / outside taps must not dismiss: galleries and
				// readers contain large interactive surfaces (manga zoom,
				// novel scroll, video controls) that frequently bubble up
				// pointerdown to the overlay; closing only via the X button
				// avoids surprise dismissals mid-read.
				onPointerDownOutside={(e) => {
					e.preventDefault()
				}}
				onInteractOutside={(e) => {
					e.preventDefault()
				}}
				className={cn(
					"bg-transparent text-white ring-0 transition-none duration-0",
					"overflow-hidden rounded-none",
					"data-open:animate-none data-closed:animate-none sm:data-open:animate-none sm:data-closed:animate-none",
					fullscreenAPI.isFullscreen
						? "inset-0 h-svh w-screen sm:inset-0 sm:max-w-none sm:max-h-none"
						: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[85vh] max-h-[85vh] w-screen sm:w-[90vw] sm:max-w-none sm:max-h-none",
				)}
			>
				<DialogBody className="flex flex-col overflow-hidden p-0">
					<DialogTitle className="sr-only">
						{t("resources.preview.aria", { name: resName })}
					</DialogTitle>
					{/* ── Header ─────────────────────────────────────────── */}
					<div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-1">
						<span className="max-w-[calc(100%-12rem)] truncate rounded bg-black/60 px-2 py-1 text-sm text-white">
							{resName}
						</span>
						<div className="flex items-center gap-2">
							<FullscreenButton api={fullscreenAPI} />
							<DialogClose asChild>
								<button
									type="button"
									aria-label={t("resources.preview.closePreview")}
									className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
								>
									<X className="h-4 w-4" />
								</button>
							</DialogClose>
						</div>
					</div>

					{/* ── Content ────────────────────────────────────────── */}
					<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
						<div className="flex h-full w-full items-center justify-center overflow-hidden">
							<PreviewContent
								resId={resId}
								resName={resName}
								contentPluginId={contentPluginId}
								sourceMeta={sourceMeta}
								searchMeta={searchMeta}
								fileStats={fileStats}
								iframeRef={previewIframeRef}
								forceTheme="dark"
								onContentVisibleChange={setContentVisible}
							/>
						</div>
					</div>
					{props.bottomBar !== undefined ? (
						<div className="shrink-0">{props.bottomBar}</div>
					) : null}
				</DialogBody>
			</DialogContent>
		</Dialog>
	)
}
