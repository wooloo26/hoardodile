import type { ResCard as ResCardData } from "@hoardodile/schemas"
import { Checkbox } from "@hoardodile/ui/components/checkbox"
import { Link } from "@tanstack/react-router"
import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CharChip } from "@/features/char/components/CharChip"
import { ResCollectionChips } from "@/features/col/ResColChips"
import { resolveManifestName, usePluginList } from "@/features/plugin"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { TagChip } from "@/features/tags/TagChip"
import { TagChipSurface } from "@/features/tags/TagChipSurface"
import { formatBytes } from "@/lib/formatBytes"
import { ResCardActions } from "./ResCardActions"
import { ResMediaThumb } from "./ResMediaThumb"
import { ResPreviewDialog } from "./ResPreviewDialog"

function PluginTagChip({ pluginId }: { readonly pluginId: string }) {
	const { i18n } = useTranslation()
	const { plugins } = usePluginList()
	const plugin = plugins.find((p) => p.id === pluginId)
	if (plugin?.pinned !== true) return null
	return (
		<TagChipSurface color={plugin.color} className="max-w-25">
			{resolveManifestName(plugin.manifest, i18n.language)}
		</TagChipSurface>
	)
}

// ── Selection ────────────────────────────────────────────────────────────────

export type ResCardSelection = {
	readonly selected: boolean
	readonly onToggle: () => void
}

const MIN_HEIGHT_PX = 200
const MAX_HEIGHT_PX = 600
const MIN_WIDTH_PX = 200
const MAX_WIDTH_PX = 400

// ── Props ────────────────────────────────────────────────────────────────────

export type ResCardProps = {
	/**
	 * Resource data as returned by `resource.listCards`.
	 * Includes pre-resolved `pinnedTags` and `characters`.
	 */
	readonly resource: ResCardData
	readonly className?: string
	/**
	 * When provided the card switches to selection mode: the actions menu is
	 * hidden, the preview / video hover is suppressed, and a checkbox in the
	 * top-right corner reflects / toggles `selected`.
	 */
	readonly selection?: ResCardSelection
	/**
	 * Optional preview handler. When provided, the card will delegate preview
	 * opening to the parent (e.g. URL-backed preview in `<ResSearch>`) instead
	 * of owning a local `<ResPreviewDialog>` instance.
	 */
	readonly onPreviewRequest?: (resource: ResCardData) => void
}

/**
 * Self-contained display card for a resource in grid views.
 *
 * Thumbnail with overlay, media-type corner pill, name, pinned tag chips,
 * character avatars, and a relative timestamp. Action menu and video playback
 * are owned by sibling components ({@link ResCardActions},
 * {@link ResVideoHover}) so this file stays focused on layout.
 */
export const ResCard = memo(function ResCard(props: ResCardProps) {
	const { resource, className, selection, onPreviewRequest } = props
	const {
		id,
		name,
		contentPluginId,
		pinnedTags,
		characters,
		collections,
		fileStats,
		sourceMeta,
		searchMeta,
		createdAt,
	} = resource
	const formatter = useDateFormatter()

	const isSelectMode = selection !== undefined
	// All content types are previewable via plugin render modules
	const isPreviewable = true

	const [previewOpen, setPreviewOpen] = useState(false)
	const usesExternalPreview = onPreviewRequest !== undefined

	const { t } = useTranslation()

	return (
		<div
			className={`relative flex flex-col gap-1 ${className ?? ""}`}
			style={{ minWidth: MIN_WIDTH_PX, maxWidth: MAX_WIDTH_PX }}
			data-resource-card-id={id}
		>
			<div className="relative m-auto">
				<ResMediaThumb
					resource={resource}
					maxWidth={MAX_WIDTH_PX}
					maxHeight={MAX_HEIGHT_PX}
					minHeight={MIN_HEIGHT_PX}
					minWidth={MIN_WIDTH_PX}
					onVideoZoomRequest={
						isSelectMode
							? undefined
							: () => {
									if (usesExternalPreview) onPreviewRequest(resource)
									else setPreviewOpen(true)
								}
					}
					onPreviewRequest={
						isPreviewable && !isSelectMode
							? () => {
									if (usesExternalPreview) onPreviewRequest(resource)
									else setPreviewOpen(true)
								}
							: undefined
					}
					className="m-auto"
				/>

				{!isSelectMode ? (
					<Link
						to="/resources/$id"
						params={{ id }}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={name}
						tabIndex={-1}
						// Sits above the cover image so clicks on the empty
						// thumbnail area open the detail page in a new tab.
						// Z-index stays below the action menu (z-10), the zoom
						// button (z-10) and the inline video play overlay
						// (z-20) so those still receive their own clicks.
						className="absolute inset-0 z-1 rounded-xl"
						data-testid={`resource-card-link-${id}`}
					/>
				) : null}

				{!isSelectMode ? (
					<ResCardActions
						resource={resource}
						topOffsetClass={isPreviewable ? "top-11" : "top-2"}
					/>
				) : null}

				{isSelectMode ? (
					<div className="absolute top-3 left-3 z-30">
						<Checkbox
							className="bg-white w-5 h-5"
							checked={selection.selected}
							onCheckedChange={() => selection.onToggle()}
							aria-label={t("resources.selectAria", { name })}
							data-testid={`resource-select-checkbox-${id}`}
						/>
					</div>
				) : null}
			</div>

			{/* ── Name ───────────────────────────────────────────────────── */}
			<div className="min-w-0 overflow-hidden">
				{isSelectMode ? (
					<span
						className="block w-full truncate text-base font-medium"
						title={name}
						data-testid={`resource-item-${id}`}
					>
						{name}
					</span>
				) : (
					<Link
						to="/resources/$id"
						params={{ id }}
						target="_blank"
						rel="noopener noreferrer"
						className="block w-full truncate text-base font-medium hover:underline"
						title={name}
						data-testid={`resource-item-${id}`}
					>
						{name}
					</Link>
				)}
			</div>

			{/* ── Pinned tag chips (plugin label first) ──────────────────── */}
			{contentPluginId != null || pinnedTags.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{contentPluginId != null ? (
						<PluginTagChip pluginId={contentPluginId} />
					) : null}
					{pinnedTags.map((tag) => (
						<TagChip
							key={tag.id}
							id={tag.id}
							type="resource"
							name={tag.name}
							color={tag.color}
							className="max-w-25"
						/>
					))}
				</div>
			) : null}

			{/* ── Character avatars ───────────────────────────────────────── */}
			{characters.length > 0 ? (
				<div className="flex flex-wrap gap-1.5 mt-0.5">
					{characters.map((char) => (
						<CharChip
							key={char.id}
							charId={char.id}
							character={{ name: char.name, updatedAt: char.updatedAt }}
							disableLink={isSelectMode}
							showName
							className="max-w-30"
						/>
					))}
				</div>
			) : null}

			{/* ── Collection chips ───────────────────────────────────────── */}
			<ResCollectionChips collections={collections} />

			{/* ── File size & Date ───────────────────────────────────────── */}
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>
					{fileStats?.sizeBytes !== undefined
						? formatBytes(fileStats.sizeBytes)
						: null}
				</span>
				<span>{formatter.formatDateTime(createdAt)}</span>
			</div>

			{/* ── Dialogs ────────────────────────────────────────────────── */}
			{isPreviewable && !isSelectMode && !usesExternalPreview ? (
				<ResPreviewDialog
					open={previewOpen}
					onOpenChange={setPreviewOpen}
					resId={id}
					resName={name}
					contentPluginId={contentPluginId ?? ""}
					sourceMeta={sourceMeta}
					searchMeta={searchMeta}
					fileStats={resource.fileStats}
				/>
			) : null}

			{/* ── Selection overlay covering the whole card ──────────────── */}
			{isSelectMode ? (
				<button
					type="button"
					onClick={() => selection.onToggle()}
					aria-label={t("resources.toggleSelectAria", { name })}
					aria-pressed={selection.selected}
					className="absolute inset-0 z-20 cursor-pointer rounded-xl"
					data-testid={`resource-select-${id}`}
				/>
			) : null}
		</div>
	)
})

// TagChip lives in `features/tags/TagChip` so the standalone resource
// detail page can render the same chip layout without depending on this
// file.
