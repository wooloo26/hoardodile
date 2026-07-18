import type { Message } from "@hoardodile/plugin-sdk-web"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import {
	NOVEL_SETTINGS_DEFAULT,
	NOVEL_SETTINGS_KEY,
	type NovelPosition,
	type NovelSettings,
	novelPositionMaybeCodec,
	novelSettingsCodec,
	novelTextColorFor,
} from "../prefs"
import { NovelChapterSheet } from "./ChapterSheet"
import { buildCommentsByParagraph } from "./commentsByParagraph"
import { usePluginAPI } from "./hooks"
import { NovelBody } from "./NovelBody"
import { NovelParagraphCommentDialog } from "./NovelParagraphCommentDialog"
import { NovelTopBar } from "./NovelTopBar"
import { NovelSettingsSheet } from "./SettingsSheet"
import { useDeferredNovelDocument } from "./useDeferredNovelDocument"
import { useReaderPositionWriter } from "./useReaderPositionWriter"

/**
 * TXT novel reader with paragraph-level comments. Picks the first
 * `.txt` file in the resource, parses it into paragraphs and chapters,
 * persists reading position + per-user typography settings via the
 * plugin host API, and routes comments through the shared resource-
 * anchor system.
 */
export function NovelReader(props: { readonly open: boolean }) {
	const { open } = props
	const api = usePluginAPI()
	const { t } = useTranslation()

	const filesQuery = api.useFileList()
	const txtFile = (filesQuery.data ?? []).find(function isTxt(f) {
		return f.toLowerCase().endsWith(".txt")
	})
	const filename = txtFile ?? ""

	// Text fetch via host API — async effect + state
	const [textData, setTextData] = useState<string | undefined>(undefined)
	const [textError, setTextError] = useState<Error | null>(null)
	const [textLoading, setTextLoading] = useState(false)
	useEffect(() => {
		if (!open || filename === "") return
		let cancelled = false
		setTextLoading(true)
		setTextError(null)
		api
			.readFile(filename)
			.then(function decode(buf) {
				if (cancelled) return
				setTextData(new TextDecoder("utf-8").decode(buf))
				setTextLoading(false)
			})
			.catch(function textFail(err: unknown) {
				if (cancelled) return
				setTextError(err instanceof Error ? err : new Error(String(err)))
				setTextLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [api, filename, open])

	const [settings, setSettings] = api.usePref(
		NOVEL_SETTINGS_KEY,
		NOVEL_SETTINGS_DEFAULT,
		novelSettingsCodec,
	)

	// Per-resource position is stored via cache API (sync, server-backed).
	const cachedPosition = useMemo((): NovelPosition | undefined => {
		const raw = api.getCache("position")
		return raw !== undefined ? novelPositionMaybeCodec.decode(raw) : undefined
	}, [api])

	const document = useDeferredNovelDocument({
		raw: textData,
		chapterRegexSource: settings.chapterRegex,
	})

	// Comments are fetched imperatively; the SDK only exposes a create hook.
	const [comments, setComments] = useState<readonly Message[]>([])
	useEffect(() => {
		let cancelled = false
		api
			.listMessages()
			.then(function got(rows) {
				if (cancelled) return
				setComments(rows)
			})
			.catch(function err(e: unknown) {
				if (cancelled) return
				api.logError("failed to load comments", { error: String(e) })
			})
		return () => {
			cancelled = true
		}
	}, [api])
	const commentsByParagraph = useMemo(
		() => buildCommentsByParagraph(comments),
		[comments],
	)

	const [scrollAnchor, setScrollAnchor] = useState<{
		paragraphIndex: number
		fraction: number
	}>({ paragraphIndex: 0, fraction: 0 })
	const currentParagraphIndex = scrollAnchor.paragraphIndex
	const [pageStats, setPageStats] = useState<{
		current: number
		total: number
	}>({ current: 1, total: 1 })
	const [chapterOpen, setChapterOpen] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [selectedParagraph, setSelectedParagraph] = useState<
		number | undefined
	>(undefined)
	const [scrollToAnchor, setScrollToAnchor] = useState<
		{ paragraphIndex: number; fraction: number } | undefined
	>(undefined)
	const [scrollToPage, setScrollToPage] = useState<number | undefined>(
		undefined,
	)
	const hasHydratedRef = useRef(false)

	useEffect(
		function hydrateOnce() {
			if (hasHydratedRef.current) return
			if (document === undefined) return
			hasHydratedRef.current = true
			const pos = cachedPosition
			if (pos === undefined) return
			if (pos.filename !== filename) return
			const idx = Math.min(
				pos.paragraphIndex,
				Math.max(0, document.paragraphs.length - 1),
			)
			const fraction = Math.max(0, Math.min(1, pos.fraction))
			setScrollAnchor({ paragraphIndex: idx, fraction })
			setScrollToAnchor({ paragraphIndex: idx, fraction })
		},
		[cachedPosition, document, filename],
	)

	const positionPayload = useMemo<NovelPosition | undefined>(
		function buildPayload() {
			if (filename === "") return undefined
			return {
				v: 2,
				filename,
				paragraphIndex: scrollAnchor.paragraphIndex,
				fraction: scrollAnchor.fraction,
				updatedAtMs: Date.now(),
			}
		},
		[filename, scrollAnchor.paragraphIndex, scrollAnchor.fraction],
	)

	useReaderPositionWriter({
		position: positionPayload,
		disabled: !open || !hasHydratedRef.current,
	})

	const handleJump = useCallback(function handleJump(idx: number) {
		setScrollAnchor({ paragraphIndex: idx, fraction: 0 })
		setScrollToAnchor({ paragraphIndex: idx, fraction: 0 })
	}, [])

	const handlePageJump = useCallback(function handlePageJump(page: number) {
		setScrollToPage(page)
	}, [])

	useEffect(
		function listenForAnchorJump() {
			function handler(event: MessageEvent) {
				if (event.data?.type !== "anchor-jump") return
				const data = event.data.data as
					| { readonly paragraphIndex?: number; readonly filename?: string }
					| undefined
				if (typeof data?.paragraphIndex !== "number") return
				if (data.filename !== filename) return
				handleJump(data.paragraphIndex)
			}
			window.addEventListener("message", handler)
			return () => window.removeEventListener("message", handler)
		},
		[filename, handleJump],
	)

	function handleSettingsChange(next: NovelSettings) {
		setSettings(next)
	}

	if (filesQuery.isLoading && filesQuery.data === undefined) {
		return <span className="text-sm text-white/60">{t("loading")}</span>
	}

	if (txtFile === undefined) {
		return <span className="text-sm text-white/60">{t("noFile")}</span>
	}

	if (textError) {
		return <span className="text-sm text-white/60">{t("loadFailed")}</span>
	}

	if (textLoading || document === undefined) {
		return <span className="text-sm text-white/60">{t("loading")}</span>
	}

	const textColor = novelTextColorFor(settings.bgColor)

	return (
		<div
			className="relative flex h-full w-full flex-col"
			style={{ background: settings.bgColor, color: textColor }}
		>
			<NovelTopBar
				currentPage={pageStats.current}
				totalPages={pageStats.total}
				onOpenChapters={() => setChapterOpen(true)}
				onOpenSettings={() => setSettingsOpen(true)}
				onPageJump={handlePageJump}
			/>
			<div className="relative flex-1 overflow-hidden">
				<NovelBody
					document={document}
					settings={settings}
					onScrollAnchorChange={setScrollAnchor}
					onParagraphLongPress={setSelectedParagraph}
					onParagraphCommentTap={setSelectedParagraph}
					commentsByParagraph={commentsByParagraph}
					scrollToAnchor={scrollToAnchor}
					onScrollHandled={() => setScrollToAnchor(undefined)}
					scrollToPage={scrollToPage}
					onScrollToPageHandled={() => setScrollToPage(undefined)}
					onPageStatsChange={setPageStats}
				/>
			</div>
			<NovelChapterSheet
				open={chapterOpen}
				onOpenChange={setChapterOpen}
				chapters={document.chapters}
				currentParagraphIndex={currentParagraphIndex}
				onJump={handleJump}
			/>
			<NovelSettingsSheet
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				settings={settings}
				onChange={handleSettingsChange}
			/>
			<NovelParagraphCommentDialog
				open={selectedParagraph !== undefined}
				onClose={() => setSelectedParagraph(undefined)}
				filename={filename}
				paragraphIndex={selectedParagraph}
				comments={
					selectedParagraph !== undefined
						? (commentsByParagraph.get(selectedParagraph) ?? [])
						: []
				}
			/>
		</div>
	)
}
