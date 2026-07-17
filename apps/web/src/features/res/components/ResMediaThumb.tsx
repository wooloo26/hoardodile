import type { CoverKindUi, PluginManifest } from "@hoardodile/schemas"
import { pickCoverKind } from "@hoardodile/schemas"
import { buildResThumbCacheKey } from "@hoardodile/shared"
import { useQuery } from "@tanstack/react-query"
import { ZoomIn } from "lucide-react"
import { Children, type CSSProperties, Fragment, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { pluginListAllQueryOptions } from "@/features/plugin"
import {
	type ResMediaThumbResource,
	useResDisplayResource,
} from "@/features/res/hooks/useResDisplayResource"
import {
	renderSlotBadges,
	type TemplateContext,
} from "@/features/res/template/render"
import { ResThumb } from "./ResThumb"
import { ResVideoHover } from "./ResVideoHover"

export type { ResMediaThumbResource } from "@/features/res/hooks/useResDisplayResource"

export type ResMediaThumbProps = {
	readonly resource: ResMediaThumbResource
	readonly className?: string
	/**
	 * Sizing strategy:
	 *  - `"intrinsic"` (default): scale cover dimensions to fit within
	 *    `maxWidth`/`maxHeight`, mirroring the resources page card.
	 *  - `"fill"`: occupy the parent's box (caller controls width/height).
	 */
	readonly sizing?: "intrinsic" | "fill"
	readonly maxWidth?: number
	readonly maxHeight?: number
	readonly minHeight?: number
	readonly minWidth?: number
	/**
	 * When provided and the resource is a video, enable the inline video
	 * preview-on-hover. Receives the user's intent to open a full preview
	 * dialog (clicking the centered play button while playing).
	 */
	readonly onVideoZoomRequest?: () => void
	/**
	 * When provided, renders a magnifying-glass button that calls this
	 * callback. Also shows a white hover overlay for non-video resources.
	 */
	readonly onPreviewRequest?: () => void
}

/**
 * Bare resource thumbnail tile: just the cover image plus the media-type
 * and file-count corner pills, with optional video-hover playback.
 *
 * Used as the visual core of {@link ResCard} on the resources page,
 * and standalone as an inline embed inside documents where the full card
 * (action menu, edit dialogs, preview button, etc.) would be visual noise.
 */
export function ResMediaThumb(props: ResMediaThumbProps) {
	const {
		resource: resourceProp,
		className,
		sizing = "intrinsic",
		maxWidth,
		maxHeight,
		minHeight,
		minWidth,
		onVideoZoomRequest,
		onPreviewRequest,
	} = props
	const resource = useResDisplayResource(resourceProp)
	const {
		id,
		name,
		contentPluginId,
		coverMeta,
		updatedAt,
		sourceMeta,
		searchMeta,
		fileStats,
	} = resource
	const coverKind = pickCoverKind(coverMeta)
	const cacheKey = buildResThumbCacheKey({ updatedAt })
	const isVideo = coverKind === "video"
	const style =
		sizing === "intrinsic"
			? buildIntrinsicStyle(coverMeta?.width, coverMeta?.height, {
					maxWidth,
					maxHeight,
					minHeight,
					minWidth,
				})
			: undefined

	const cardUi = usePluginCardUi(contentPluginId, coverKind)
	const { i18n } = useTranslation()
	const locale = i18n.language

	const scope = useMemo(
		() => ({
			file: fileStats,
			source: sourceMeta,
			searchMeta,
			coverMeta,
		}),
		[fileStats, sourceMeta, searchMeta, coverMeta],
	)

	const ctx: TemplateContext = {
		locale,
		pluginId: contentPluginId ?? "",
		manifest: cardUi?.manifest ?? {},
		iconClassName: "size-3.5",
	}

	const tlBadges = cardUi?.slotUi?.tl
		? renderSlotBadges(cardUi.slotUi.tl, scope, ctx)
		: []
	const blBadges = cardUi?.slotUi?.bl
		? renderSlotBadges(cardUi.slotUi.bl, scope, ctx)
		: []
	const brBadges = cardUi?.slotUi?.br
		? renderSlotBadges(cardUi.slotUi.br, scope, ctx)
		: []

	return (
		<div
			className={`group relative overflow-hidden rounded-xl ${className ?? ""}`}
			style={style}
		>
			<ResThumb
				resId={id}
				cacheKey={cacheKey}
				name={name}
				alt={name}
				maxWidth={maxWidth}
				maxHeight={maxHeight}
				className="absolute inset-0 h-full w-full rounded-xl"
			/>
			{isVideo && onVideoZoomRequest !== undefined ? (
				<ResVideoHover
					resId={id}
					resName={name}
					onZoomRequest={onVideoZoomRequest}
				/>
			) : null}
			{/* ── Slot overlays ──────────────────────────────────────── */}
			{tlBadges.length > 0 ? (
				<div className="absolute top-1 left-1 z-10 flex flex-col items-start gap-0.5">
					{tlBadges.map((badge, i) => (
						<SlotBadge key={i}>
							{Array.isArray(badge)
								? Children.toArray(badge).map((node, j) => (
										<Fragment key={j}>{node}</Fragment>
									))
								: badge}
						</SlotBadge>
					))}
				</div>
			) : null}
			{blBadges.length > 0 ? (
				<div className="absolute bottom-1 left-1 z-10 flex flex-col items-start gap-0.5">
					{blBadges.map((badge, i) => (
						<SlotBadge key={i}>
							{Array.isArray(badge)
								? Children.toArray(badge).map((node, j) => (
										<Fragment key={j}>{node}</Fragment>
									))
								: badge}
						</SlotBadge>
					))}
				</div>
			) : null}
			{brBadges.length > 0 ? (
				<div className="absolute bottom-1 right-1 z-10 flex flex-col items-end gap-0.5">
					{brBadges.map((badge, i) => (
						<SlotBadge key={i}>
							{Array.isArray(badge)
								? Children.toArray(badge).map((node, j) => (
										<Fragment key={j}>{node}</Fragment>
									))
								: badge}
						</SlotBadge>
					))}
				</div>
			) : null}
			{/* Hover overlay for non-video; video has its own playback layer. */}
			{!isVideo ? (
				<div className="pointer-events-none absolute inset-0 rounded-xl bg-white opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
			) : null}
			{/* Magnifying-glass preview button at top-right. Hidden until
			    hover so it does not occlude the underlying thumb area —
			    important when the thumb is an inline BlockNote node, where
			    a permanently-mounted button intercepts the mousedown that
			    ProseMirror needs to start a NodeSelection. */}
			{onPreviewRequest !== undefined ? (
				<button
					type="button"
					aria-label={name}
					onClick={onPreviewRequest}
					className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
				>
					<ZoomIn className="size-4" />
				</button>
			) : null}
		</div>
	)
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SlotBadge({ children }: { readonly children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-tiny font-bold leading-none text-white tabular-nums">
			{children}
		</span>
	)
}

type IntrinsicBounds = {
	readonly maxWidth?: number
	readonly maxHeight?: number
	readonly minHeight?: number
	readonly minWidth?: number
}

/**
 * Computes explicit pixel dimensions so the browser reserves the exact
 * fitted box before the cover loads. See {@link ResCard} for the
 * background on why CSS aspect-ratio + max-* alone is insufficient.
 */
function buildIntrinsicStyle(
	width: number | undefined,
	height: number | undefined,
	bounds: IntrinsicBounds,
): CSSProperties {
	const maxW = bounds.maxWidth ?? Number.POSITIVE_INFINITY
	const maxH = bounds.maxHeight ?? Number.POSITIVE_INFINITY
	if (
		width !== undefined &&
		height !== undefined &&
		height > 0 &&
		Number.isFinite(maxW) &&
		Number.isFinite(maxH)
	) {
		const scale = Math.min(maxW / width, maxH / height, 1)
		return { width: width * scale, height: height * scale }
	}
	return {
		minHeight: bounds.minHeight,
		minWidth: bounds.minWidth,
		maxHeight: Number.isFinite(maxH) ? maxH : undefined,
	}
}

/**
 * Look up the plugin manifest for a resource and return the
 * {@link CoverKindUi} entry that matches the resource's `coverKind`,
 * together with the full manifest needed for icon resolution.
 * Returns `undefined` when the plugin has no card customization.
 */
function usePluginCardUi(
	pluginId: string | null,
	coverKind: "image" | "video" | "audio" | undefined,
):
	| {
			readonly slotUi: CoverKindUi | undefined
			readonly manifest: PluginManifest | undefined
	  }
	| undefined {
	const pluginQuery = useQuery(pluginListAllQueryOptions())
	return useMemo(() => {
		if (pluginId === null) return undefined
		const plugins = pluginQuery.data ?? []
		const entry = plugins.find((p) => p.id === pluginId)
		const slotUi = entry?.manifest.ui?.card?.[coverKind || "default"]
		if (slotUi === undefined) return undefined
		return {
			slotUi,
			manifest: entry?.manifest,
		}
	}, [pluginId, coverKind, pluginQuery.data])
}
