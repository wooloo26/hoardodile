import type { ResAnchor } from "@hoardodile/schemas"
import { pickCoverKind } from "@hoardodile/schemas"
import { Separator } from "@hoardodile/ui/components/separator"
import { cn } from "@hoardodile/ui/lib/utils"
import { useQueries, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { catListQueryOptions } from "@/features/cat"
import { CharChip } from "@/features/char/components/CharChip"
import {
	colResourceIdsQueryOptions,
	colsForResourceQueryOptions,
} from "@/features/col"
import { ResCollectionChips } from "@/features/col/ResColChips"
import { CommentsSection } from "@/features/comments"
import { AnchorJumpProvider } from "@/features/comments/anchor"
import { DocLinkedSearchSection } from "@/features/doc/DocLinkedSearchSection"
import { pluginListAllQueryOptions } from "@/features/plugin"
import {
	FullscreenButton,
	PreviewContent,
	ResCard,
	relatedResourcesByTagsQueryOptions,
	resDetailCardQueryOptions,
	useContainerFullscreen,
} from "@/features/res"
import { useDateFormatter } from "@/features/settings/datePrefs"
import { buildTagGroups, tagsForResourceQueryOptions } from "@/features/tags"
import { CatTagGroups } from "@/features/tags/CatTagGroups"
import { TagChip } from "@/features/tags/TagChip"
import { EntityUsageStats } from "@/features/usage/components/EntityUsageStats"
import { useUsageTracker } from "@/features/usage/useUsageTracker"
import { requireAuth } from "@/lib/auth-guard"
import { formatBytes } from "@/lib/formatBytes"

const resDetailSearchSchema = z
	.object({
		/**
		 * 1-based index of the gallery file currently being viewed. Persisted
		 * in the URL so refreshing or sharing keeps the same page open.
		 */
		file: z.coerce.number().int().min(1).optional(),
		/**
		 * Source filename target when arriving via a comment anchor jump.
		 * Resolved against the resource's file list to pick the gallery
		 * page; falls back silently when the filename is missing from the
		 * resource (e.g. file renamed/removed).
		 */
		fileName: z.string().min(1).optional(),
		/**
		 * Opaque plugin state persisted across navigation (e.g. anchor jump
		 * coordinates, reader scroll position). Interpreted by the plugin's
		 * render module.
		 */
		pluginState: z.string().optional(),
	})
	.loose()

export const Route = createFileRoute("/resources/$id")({
	beforeLoad: requireAuth,
	validateSearch: resDetailSearchSchema,
	component: ResDetailRoute,
})

/**
 * Standalone detail page for a single resource. Top: preview surface and
 * basic metadata. Right sidebar: every tag the resource owns grouped by
 * its category (full listing, not just pinned), plus, for each
 * collection the resource belongs to, a grid of sibling resource cards.
 * Bottom: comments scoped by `resId`.
 *
 * Reuses {@link PreviewContent} for the actual content viewer so the
 * inline preview and the lightbox dialog stay byte-for-byte identical
 * (gallery navigation, manga reader, novel reader). Comments reuse the
 * shared {@link CommentComposer} / {@link CommentItem} components.
 */
function ResDetailRoute() {
	const { id } = Route.useParams()
	const [contentVisible, setContentVisible] = useState(true)
	useUsageTracker({
		entityType: "resource",
		entityId: id,
		active: contentVisible,
	})
	const { t } = useTranslation()
	const formatter = useDateFormatter()
	const detailQuery = useQuery(resDetailCardQueryOptions(id))
	const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
	const fullscreenAPI = useContainerFullscreen(previewIframeRef)
	const pluginListQuery = useQuery(pluginListAllQueryOptions())

	function handleAnchorJump(anchor: ResAnchor): void {
		if (anchor.resId !== id) {
			const params = new URLSearchParams()
			if (anchor.data !== undefined) {
				params.set(
					"pluginState",
					encodeURIComponent(JSON.stringify(anchor.data)),
				)
			}
			window.location.href = `/resources/${anchor.resId}?${params.toString()}`
			return
		}
		const win = previewIframeRef.current?.contentWindow
		if (win !== null && win !== undefined) {
			win.postMessage({ type: "anchor-jump", data: anchor.data }, "*")
		}
	}

	if (detailQuery.isPending) {
		return (
			<div className="p-6 text-sm text-muted-foreground">
				{t("common.loading")}
			</div>
		)
	}
	if (detailQuery.isError || detailQuery.data === undefined) {
		return (
			<div className="p-6 text-sm text-destructive">
				{detailQuery.error?.message ?? t("resources.detail.notFound")}
			</div>
		)
	}

	const resource = detailQuery.data

	const pluginManifest =
		resource.contentPluginId !== null && resource.contentPluginId !== undefined
			? pluginListQuery.data?.find((p) => p.id === resource.contentPluginId)
					?.manifest
			: undefined
	const manifestHeight = pluginManifest?.ui?.height

	const header = (
		<header className="flex flex-col gap-2">
			<div className="flex items-start gap-2">
				<div>
					<FullscreenButton api={fullscreenAPI} />
				</div>
				<div className="min-w-0 flex-1">
					<h1
						className="wrap-break-word text-xl font-semibold"
						data-testid="resource-detail-title"
					>
						{resource.name}
					</h1>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
				{resource.fileStats?.sizeBytes !== undefined ? (
					<span data-testid="resource-detail-size">
						{formatBytes(resource.fileStats.sizeBytes)}
					</span>
				) : null}
				{resource.fileStats?.count !== undefined ? (
					<span data-testid="resource-detail-file-count">
						{t("resources.detail.fileCount", {
							count: resource.fileStats.count,
						})}
					</span>
				) : null}
				<span>{formatter.formatDateTime(resource.createdAt)}</span>
			</div>
			<EntityUsageStats entityType="resource" entityId={id} />
		</header>
	)

	const isVideo = pickCoverKind(resource.coverMeta) === "video"
	const useFixedHeight = !isVideo && manifestHeight !== undefined
	const previewSurface = (
		<div
			className={cn(
				"relative flex w-full items-center justify-center overflow-hidden",
				isVideo ? "aspect-video max-h-[70vh]" : !useFixedHeight && "h-[60vh]",
			)}
			style={useFixedHeight ? { height: manifestHeight } : undefined}
			data-testid="resource-detail-preview"
		>
			<PreviewContent
				resId={id}
				resName={resource.name}
				contentPluginId={resource.contentPluginId ?? ""}
				sourceMeta={resource.sourceMeta}
				searchMeta={resource.searchMeta}
				fileStats={resource.fileStats}
				iframeRef={previewIframeRef}
				inline
				onContentVisibleChange={setContentVisible}
			/>
		</div>
	)

	const meta = (
		<>
			{resource.pinnedTags.length > 0 ? (
				<div
					className="flex flex-wrap gap-1.5"
					data-testid="resource-detail-pinned-tags"
				>
					{resource.pinnedTags.map((tag) => (
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

			{resource.intro.length > 0 ? (
				<p className="whitespace-pre-wrap text-sm">{resource.intro}</p>
			) : null}

			{resource.characters.length > 0 ? (
				<div
					className="flex flex-wrap gap-1.5"
					data-testid="resource-detail-characters"
				>
					{resource.characters.map((char) => (
						<CharChip
							key={char.id}
							showName
							charId={char.id}
							character={{ name: char.name, updatedAt: char.updatedAt }}
						/>
					))}
				</div>
			) : null}

			<ResCollectionChips collections={resource.collections} />
		</>
	)

	const commentsSection = (
		<CommentsSection
			variant="embedded"
			context={{ kind: "res", id }}
			testId="resource-detail-comments"
		/>
	)

	const sidebar = (
		<aside
			className="flex flex-col gap-4 lg:top-4 lg:self-start"
			data-testid="resource-detail-sidebar"
		>
			<ResCard className="m-auto" resource={resource} />
			<ResTagsSection resId={id} />
			<ResCollectionsSection resId={id} />
			<ResRelatedByTagsSection resId={id} tagIds={resource.tagIds} />
		</aside>
	)

	// Bilibili-style flex layout: two-column row on lg+ (video +
	// comments column on the left, sidebar on the right).
	return (
		<div className="mx-auto flex w-full max-w-480 flex-col gap-4 p-4">
			{header}
			<div className="flex flex-col gap-6 lg:flex-row">
				<div className="flex min-w-0 flex-1 flex-col gap-4">
					{previewSurface}
					<div className="flex flex-col gap-4">
						{meta}
						<DocLinkedSearchSection variant="res" resId={id} />
						<Separator />
						<AnchorJumpProvider handler={handleAnchorJump}>
							{commentsSection}
						</AnchorJumpProvider>
					</div>
				</div>
				<div className="shrink-0 lg:w-100">{sidebar}</div>
			</div>
		</div>
	)
}

type ResTagsSectionProps = {
	readonly resId: string
}

/**
 * Sidebar block that lists every tag the resource owns, grouped by its
 * category (not filtered by the pinned flag). Categories appear in
 * `category.position`; uncategorised tags fall into a synthetic bucket at
 * the end. Tag chips reuse {@link TagChip} so colour blending and
 * navigation behave the same as on cards.
 */
function ResTagsSection(props: ResTagsSectionProps) {
	const { resId } = props
	const { t } = useTranslation()
	const tagsQuery = useQuery(tagsForResourceQueryOptions(resId))
	const catsQuery = useQuery(catListQueryOptions())
	const tags = tagsQuery.data ?? []
	const categories = catsQuery.data ?? []
	const groups = buildTagGroups(tags, categories)
	return (
		<section
			className="flex flex-col gap-3"
			data-testid="resource-detail-tag-groups"
		>
			<h2 className="text-sm font-semibold">
				{t("resources.detail.sidebar.tagsHeading")}
			</h2>
			{groups.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					{t("resources.detail.sidebar.noTags")}
				</p>
			) : (
				<CatTagGroups
					type="resource"
					groups={groups}
					testIdPrefix="resource-detail-tag-group"
				/>
			)}
		</section>
	)
}

type ResCollectionsSectionProps = {
	readonly resId: string
}

/**
 * Sidebar block that lists, per collection, the sibling resources of the
 * current resource as compact resource cards. Skips the current resource
 * so the user doesn't see themselves.
 */
function ResCollectionsSection(props: ResCollectionsSectionProps) {
	const { resId } = props
	const { t } = useTranslation()
	const colsQuery = useQuery(colsForResourceQueryOptions(resId))
	const collections = colsQuery.data ?? []
	if (collections.length === 0) return undefined
	return (
		<section
			className="flex flex-col gap-3"
			data-testid="resource-detail-collection-groups"
		>
			<h2 className="text-sm font-semibold">
				{t("resources.detail.sidebar.colsHeading")}
			</h2>
			<div className="flex flex-col gap-4">
				{collections.map((c) => (
					<ColResourceList
						key={c.id}
						colId={c.id}
						colName={c.name}
						currentResourceId={resId}
					/>
				))}
			</div>
		</section>
	)
}

type ColResourceListProps = {
	readonly colId: string
	readonly colName: string
	readonly currentResourceId: string
}

function ColResourceList(props: ColResourceListProps) {
	const { colId, colName, currentResourceId } = props
	const { t } = useTranslation()
	const idsQuery = useQuery(colResourceIdsQueryOptions(colId))
	const allIds = idsQuery.data ?? []
	const otherIds = allIds.filter((rid) => rid !== currentResourceId)
	// Per-card detail fetch. Cheaper than a dedicated `listCardsByIds`
	// procedure for the sidebar's 'small handful of items, and reuses
	// the same cache slot as elsewhere on the page.
	const cardQueries = useQueries({
		queries: otherIds.map((rid) => resDetailCardQueryOptions(rid)),
	})
	const cards = cardQueries
		.map((q) => q.data)
		.filter((card): card is NonNullable<typeof card> => card !== undefined)
	return (
		<div
			className="flex flex-col gap-2"
			data-testid={`resource-detail-collection-${colId}`}
		>
			<h3 className="text-xs font-medium text-muted-foreground">{colName}</h3>
			{cards.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					{t("resources.detail.sidebar.colEmpty")}
				</p>
			) : (
				<div className="flex flex-col gap-3">
					{cards.map((card) => (
						<ResCard key={card.id} resource={card} />
					))}
				</div>
			)}
		</div>
	)
}

type ResRelatedByTagsSectionProps = {
	readonly resId: string
	readonly tagIds: readonly string[]
}

const RELATED_BY_TAGS_LIMIT = 5

/**
 * Sidebar block listing the top-N other resources ranked by tag-overlap
 * count with the current resource. Hidden when the resource has no
 * tags (no overlap is computable) or when no candidates exist.
 */
function ResRelatedByTagsSection(props: ResRelatedByTagsSectionProps) {
	const { resId, tagIds } = props
	const { t } = useTranslation()
	const relatedQuery = useQuery({
		...relatedResourcesByTagsQueryOptions(resId, RELATED_BY_TAGS_LIMIT),
		enabled: tagIds.length > 0,
	})
	const cards = relatedQuery.data ?? []
	if (tagIds.length === 0 || cards.length === 0) return undefined
	return (
		<section
			className="flex flex-col gap-3 m-auto"
			data-testid="resource-detail-related-by-tags"
		>
			<h2 className="text-sm font-semibold">
				{t("resources.detail.sidebar.relatedByTagsHeading")}
			</h2>
			<div className="flex flex-col gap-3">
				{cards.map((card) => (
					<ResCard key={card.id} resource={card} />
				))}
			</div>
		</section>
	)
}
