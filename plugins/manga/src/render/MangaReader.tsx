import { useCacheWriter } from "@hoardodile/plugin-sdk-react"
import type { Message } from "@hoardodile/plugin-sdk-web"
import { booleanCodec } from "@hoardodile/plugin-sdk-web"
import { Button } from "@hoardodile/ui/components/button"
import { MessageSquare, MessageSquareOff, Rows3, Square } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import {
	decodeMangaPosition,
	decodeMangaSettings,
	encodeMangaPosition,
	encodeMangaSettings,
	MANGA_SETTINGS_DEFAULT,
	MANGA_SETTINGS_KEY,
	type MangaPosition,
	type MangaReadingMode,
	type MangaSettings,
} from "../prefs"
import { decodeMangaPageAnchor } from "../shared"
import { MangaCommentSendBar } from "./CommentSendBar"
import { readMangaPreviews, selectMangaPages } from "./helpers"
import { useAnchorJump, usePluginAPI } from "./hooks"
import { MangaPagedView } from "./PagedView"
import { MangaScrollView } from "./ScrollView"

/**
 * Manga reader. Routes between scroll and paged view, persists the
 * current page anchor and global reader settings, and overlays
 * page-anchored comments rendered as a bullet-screen marquee.
 */
export function MangaReader() {
	const api = usePluginAPI()
	const [useOriginal, setUseOriginal] = api.usePref(
		"viewOriginal",
		false,
		booleanCodec(),
	)
	const toggleUseOriginal = useCallback(() => {
		setUseOriginal(!useOriginal)
	}, [setUseOriginal, useOriginal])

	const filesQuery = api.useFileList()
	const pages = useMemo(() => {
		if (filesQuery.data !== undefined) return selectMangaPages(filesQuery.data)
		return readMangaPreviews(api.resource.sourceMeta) ?? []
	}, [filesQuery.data, api.resource.sourceMeta])
	const expectedCount = api.resource.fileStats?.count ?? pages.length

	// MangaSettings pref with JSON encoding
	const [settingsRaw, setSettingsRaw] = api.usePref(
		MANGA_SETTINGS_KEY,
		encodeMangaSettings(MANGA_SETTINGS_DEFAULT),
	)
	const settings = useMemo((): MangaSettings => {
		return decodeMangaSettings(settingsRaw) ?? MANGA_SETTINGS_DEFAULT
	}, [settingsRaw])

	// Per-resource position is stored via cache API (sync, server-backed).
	const position = useMemo((): MangaPosition | undefined => {
		const raw = api.getCache("position")
		return raw !== undefined ? decodeMangaPosition(raw) : undefined
	}, [api])

	// `mode` paints on the first frame from the in-memory pref store.
	const [mode, setMode] = useState<MangaReadingMode>(() => settings.defaultMode)
	const [currentPageIndex, setCurrentPageIndex] = useState(0)
	const [scrollToPage, setScrollToPage] = useState<number | undefined>(
		undefined,
	)
	const hasHydratedRef = useRef(false)

	useEffect(() => {
		if (hasHydratedRef.current) return
		if (pages.length === 0) return
		const pos = position
		if (pos === undefined) {
			hasHydratedRef.current = true
			return
		}
		const target = Math.max(0, Math.min(pages.length - 1, pos.pageIndex))
		setCurrentPageIndex(target)
		if (target > 0) setScrollToPage(target)
		if (target === pos.pageIndex) {
			hasHydratedRef.current = true
		}
	}, [position, pages.length])

	// persist position with debounce + flush
	useCacheWriter({
		key: "position",
		value: currentPageIndex,
		encode: encodePageIndex,
		disabled: !hasHydratedRef.current,
	})

	// comments: reactive list, refreshed via api.invalidate("messages")
	const commentsQuery = api.useMessageList()
	const perPageComments = useMemo(
		() => buildPerPageComments(commentsQuery.data ?? []),
		[commentsQuery.data],
	)

	const toggleMode = useCallback(() => {
		setMode((prev) => {
			const next = prev === "scroll" ? "paged" : "scroll"
			setSettingsRaw(encodeMangaSettings({ ...settings, defaultMode: next }))
			return next
		})
	}, [settings, setSettingsRaw])

	const toggleComments = useCallback(() => {
		setSettingsRaw(
			encodeMangaSettings({
				...settings,
				showComments: !settings.showComments,
			}),
		)
	}, [settings, setSettingsRaw])

	const handleScrollHandled = useCallback(() => {
		setScrollToPage(undefined)
	}, [])

	const handleManualJump = useCallback(
		(idx: number) => {
			const clamped = Math.max(0, Math.min(pages.length - 1, idx))
			setCurrentPageIndex(clamped)
			if (mode === "scroll") setScrollToPage(clamped)
		},
		[pages.length, mode],
	)

	useAnchorJump(function handleAnchorJump(anchor) {
		const idx = pages.findIndex((p) => p.filename === anchor.data.filename)
		handleManualJump(idx !== -1 ? idx : anchor.data.page)
	})

	const currentFile = pages[currentPageIndex]

	return (
		<div className="relative flex h-full w-full flex-col bg-black text-white">
			<MangaTopBar
				pageIndex={currentPageIndex}
				pageCount={expectedCount}
				mode={mode}
				showComments={settings.showComments}
				useOriginal={useOriginal}
				// The toggle is a no-op for pages without a preview variant
				// (small or already-efficient files always serve the original)
				// — hide it there instead of offering a dead button.
				showOriginalToggle={currentFile?.preview === true}
				onToggleMode={toggleMode}
				onToggleComments={toggleComments}
				onToggleOriginal={toggleUseOriginal}
				onJump={handleManualJump}
			/>
			<div className="relative flex-1 overflow-hidden">
				{mode === "scroll" ? (
					<MangaScrollView
						pages={pages}
						useOriginal={useOriginal}
						currentPageIndex={currentPageIndex}
						onPageVisible={setCurrentPageIndex}
						perPageComments={perPageComments}
						showComments={settings.showComments}
						scrollToPage={scrollToPage}
						onScrollHandled={handleScrollHandled}
						expectedCount={expectedCount}
					/>
				) : (
					<MangaPagedView
						pages={pages}
						useOriginal={useOriginal}
						currentPageIndex={currentPageIndex}
						onChangePage={setCurrentPageIndex}
						perPageComments={perPageComments}
						showComments={settings.showComments}
						direction={settings.pageDirection}
					/>
				)}
			</div>
			{currentFile !== undefined ? (
				<div className="border-t border-white/10 bg-black/60 p-2">
					<MangaCommentSendBar
						filename={currentFile.filename}
						page={currentPageIndex}
					/>
				</div>
			) : null}
		</div>
	)
}

function encodePageIndex(pageIndex: number): string {
	return encodeMangaPosition({ v: 1, pageIndex })
}

function MangaTopBar(props: {
	readonly pageIndex: number
	readonly pageCount: number
	readonly mode: MangaReadingMode
	readonly showComments: boolean
	readonly useOriginal: boolean
	readonly showOriginalToggle: boolean
	readonly onToggleMode: () => void
	readonly onToggleComments: () => void
	readonly onToggleOriginal: () => void
	readonly onJump: (idx: number) => void
}) {
	const {
		pageIndex,
		pageCount,
		mode,
		showComments,
		useOriginal,
		showOriginalToggle,
		onToggleMode,
		onToggleComments,
		onToggleOriginal,
		onJump,
	} = props
	const { t } = useTranslation()
	return (
		<div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/60 px-3 py-2 text-sm">
			<MangaPageJumpInput
				pageIndex={pageIndex}
				pageCount={pageCount}
				onJump={onJump}
			/>
			<div className="flex items-center gap-1">
				{showOriginalToggle ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onToggleOriginal}
						className="h-7 gap-1 px-2 text-xs text-white hover:bg-white/10"
						data-testid="manga-original-toggle"
					>
						{useOriginal ? t("showPreview") : t("showOriginal")}
					</Button>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onToggleMode}
					className="h-7 gap-1 px-2 text-xs text-white hover:bg-white/10"
					data-testid="manga-mode-toggle"
				>
					{mode === "scroll" ? (
						<Rows3 className="size-3.5" />
					) : (
						<Square className="size-3.5" />
					)}
					{t(mode === "scroll" ? "modeScroll" : "modePaged")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onToggleComments}
					className="h-7 gap-1 px-2 text-xs text-white hover:bg-white/10"
					data-testid="manga-comments-toggle"
				>
					{showComments ? (
						<MessageSquare className="size-3.5" />
					) : (
						<MessageSquareOff className="size-3.5" />
					)}
				</Button>
			</div>
		</div>
	)
}

function buildPerPageComments(
	all: readonly Message[],
): ReadonlyMap<string, readonly Message[]> {
	const map = new Map<string, Message[]>()
	for (const c of all) {
		const a = c.anchor
		if (a === undefined) continue
		const anchor = decodeMangaPageAnchor(a.data)
		if (anchor === undefined) continue
		const arr = map.get(anchor.filename) ?? []
		arr.push(c)
		map.set(anchor.filename, arr)
	}
	return map
}

function MangaPageJumpInput(props: {
	readonly pageIndex: number
	readonly pageCount: number
	readonly onJump: (idx: number) => void
}) {
	const { pageIndex, pageCount, onJump } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState("")
	const [editing, setEditing] = useState(false)
	useEffect(() => {
		if (!editing) setDraft(String(pageIndex + 1))
	}, [pageIndex, editing])
	function commit() {
		setEditing(false)
		const n = Number.parseInt(draft, 10)
		if (Number.isNaN(n)) {
			setDraft(String(pageIndex + 1))
			return
		}
		const target = Math.max(0, Math.min(pageCount - 1, n - 1))
		onJump(target)
		setDraft(String(target + 1))
	}
	return (
		<span
			className="flex items-center gap-1 text-xs text-white/80"
			data-testid="manga-page-indicator"
		>
			<input
				type="text"
				inputMode="numeric"
				value={draft}
				onFocus={(e) => {
					setEditing(true)
					e.currentTarget.select()
				}}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						;(e.target as HTMLInputElement).blur()
					} else if (e.key === "Escape") {
						setDraft(String(pageIndex + 1))
						;(e.target as HTMLInputElement).blur()
					}
				}}
				className="w-12 rounded border border-white/20 bg-transparent px-1 py-0.5 text-center tabular-nums text-white outline-hidden focus:border-white/60"
				aria-label={t("page")}
				data-testid="manga-page-jump-input"
			/>
			<span>{t("pageCount", { total: pageCount })}</span>
		</span>
	)
}
