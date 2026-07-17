import { booleanCodec } from "@hoardodile/plugin-sdk-web"
import { Input } from "@hoardodile/ui/components/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@hoardodile/ui/components/popover"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DanmakuPlayer } from "./danmaku/DanmakuPlayer"
import type { DanmakuSettings } from "./danmaku/types"
import { readSourceMetaDimensions } from "./helpers"
import { usePluginAPI } from "./hooks"
import { useTranslation } from "./i18n"
import type { GalleryFile } from "./shared"

/**
 * Player customisation hook. Forwarded straight through to the
 * underlying {@link DanmakuPlayer} when the active file is a video.
 * Used by the feed to enable autoplay+loop and to lift danmaku display
 * settings out of the player so a single popover can cover all slides.
 */
export type GalleryPlayerOptions = {
	readonly autoplay?: boolean
	readonly loop?: boolean
	readonly playing?: boolean
	readonly controls?: "full" | "seek-only" | "none"
	readonly disableResume?: boolean
	readonly settings?: DanmakuSettings
	readonly onSettingsChange?: (next: DanmakuSettings) => void
	/**
	 * Forwarded to the underlying `<DanmakuPlayer preload>`. Lets the
	 * resource feed bump active neighbours up to `"auto"` so the next
	 * swipe starts buffering before the slide is shown.
	 */
	readonly preload?: "none" | "metadata" | "auto"
}

export type GalleryViewProps = {
	readonly resId: string
	readonly mediaFiles: readonly GalleryFile[]
	readonly onCurrentFileChange: (file: GalleryFile | undefined) => void
	readonly hideSendBar: boolean
	readonly playerOptions?: GalleryPlayerOptions
	/**
	 * Controlled current-file index. When provided together with
	 * {@link onFileIndexChange}, the gallery becomes URL-driven so callers
	 * can persist the position in route search params.
	 */
	readonly currentFileIndex?: number
	readonly onFileIndexChange?: (index: number) => void
	/**
	 * Pre-known total count from `fileStats.count`. Used for the nav
	 * badge / prev-next disabled state before `api.useFileList()` resolves.
	 * When absent, falls back to `mediaFiles.length`.
	 */
	readonly expectedCount?: number
}

export function GalleryView(props: GalleryViewProps) {
	const api = usePluginAPI()
	const {
		resId,
		mediaFiles,
		onCurrentFileChange,
		hideSendBar,
		playerOptions,
		currentFileIndex,
		onFileIndexChange,
		expectedCount,
	} = props
	const [useOriginal, setUseOriginal] = api.usePref(
		"viewOriginal",
		false,
		booleanCodec(),
	)
	const toggleUseOriginal = useCallback(() => {
		setUseOriginal(!useOriginal)
	}, [setUseOriginal, useOriginal])
	const controlled =
		currentFileIndex !== undefined && onFileIndexChange !== undefined
	const [internalIndex, setInternalIndex] = useState(0)
	const count = mediaFiles.length
	const effectiveCount = Math.max(count, expectedCount ?? 0)
	const rawIndex = controlled ? currentFileIndex : internalIndex
	const index = count === 0 ? 0 : Math.min(Math.max(rawIndex, 0), count - 1)
	function setIndex(next: number) {
		const clamped = count === 0 ? 0 : Math.min(Math.max(next, 0), count - 1)
		if (controlled) onFileIndexChange(clamped)
		else setInternalIndex(clamped)
	}

	useEffect(() => {
		if (!controlled) setInternalIndex(0)
	}, [resId, controlled])

	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "ArrowLeft") setIndex(index - 1)
			else if (e.key === "ArrowRight") setIndex(index + 1)
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [count, index, controlled])

	const file = mediaFiles[index]
	const { t } = useTranslation()
	useEffect(() => {
		onCurrentFileChange(file)
	}, [file, onCurrentFileChange])

	const sourceMetaSize = useMemo(() => {
		const dims = readSourceMetaDimensions(api.resource.sourceMeta)
		if (dims.width === undefined || dims.height === undefined) return undefined
		return { w: dims.width, h: dims.height }
	}, [api.resource.sourceMeta])

	if (file === undefined) return null

	const src = api.resolveFileUrl(
		file.filename,
		!useOriginal && file.type === "image" && file.preview
			? "preview"
			: "original",
	)

	return (
		<div className="relative flex h-full w-full items-center justify-center">
			{file.type === "image" && file.preview && (
				<button
					type="button"
					onClick={toggleUseOriginal}
					className="absolute right-2 top-2 z-10 rounded bg-black/60 px-2 py-1 text-xs text-white transition-colors hover:bg-black/80"
				>
					{useOriginal ? t("showPreview") : t("showOriginal")}
				</button>
			)}
			<GalleryFileMedia
				file={file}
				src={src}
				resId={resId}
				hideSendBar={hideSendBar}
				playerOptions={playerOptions}
				naturalSize={sourceMetaSize}
				showClickZones={count > 1}
				onPrev={() => setIndex(index - 1)}
				onNext={() => setIndex(index + 1)}
			/>
			{count > 1 && (
				<>
					<button
						type="button"
						aria-label={t("nav.prev")}
						disabled={index === 0}
						onClick={() => setIndex(index - 1)}
						className="absolute left-2 top-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
					>
						<ChevronLeft className="h-6 w-6" />
					</button>
					<button
						type="button"
						aria-label={t("nav.next")}
						disabled={index === count - 1}
						onClick={() => setIndex(index + 1)}
						className="absolute right-2 top-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
					>
						<ChevronRight className="h-6 w-6" />
					</button>
					<GalleryJumpBadge
						index={index}
						count={effectiveCount}
						onJump={(next) => setIndex(next)}
					/>
				</>
			)}
		</div>
	)
}

type GalleryJumpBadgeProps = {
	readonly index: number
	readonly count: number
	readonly onJump: (index: number) => void
}

function GalleryJumpBadge(props: GalleryJumpBadgeProps) {
	const { index, count, onJump } = props
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState("")
	useEffect(() => {
		if (open) setDraft(String(index + 1))
	}, [open, index])
	function commit() {
		const parsed = Number(draft)
		if (Number.isFinite(parsed)) {
			const next = Math.min(Math.max(Math.trunc(parsed), 1), count) - 1
			onJump(next)
		}
		setOpen(false)
	}
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t("nav.jump")}
					data-testid="gallery-jump-badge"
					className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm text-white transition-colors hover:bg-black/80"
				>
					{index + 1} / {count}
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" className="flex w-40 items-center gap-2 p-2">
				<form
					onSubmit={(e) => {
						e.preventDefault()
						commit()
					}}
					className="flex w-full items-center gap-2"
				>
					<Input
						type="number"
						inputMode="numeric"
						min={1}
						max={count}
						value={draft}
						onChange={(e) => {
							setDraft(e.target.value)
						}}
						className="h-8 text-sm"
						data-testid="gallery-jump-input"
					/>
					<span className="text-xs text-muted-foreground">/ {count}</span>
				</form>
			</PopoverContent>
		</Popover>
	)
}

const TAP_MOVE_TOLERANCE_PX = 8
const CENTER_SAFE_FRACTION = 1 / 3

type GalleryClickZonesProps = {
	readonly onPrev: () => void
	readonly onNext: () => void
}

function GalleryClickZones(props: GalleryClickZonesProps) {
	const { onPrev, onNext } = props
	const containerRef = useRef<HTMLDivElement>(null)
	const pressRef = useRef<
		{ readonly x: number; readonly y: number; aborted: boolean } | undefined
	>(undefined)

	function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
		if (e.pointerType === "mouse" && e.button !== 0) return
		pressRef.current = { x: e.clientX, y: e.clientY, aborted: false }
	}

	function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
		const tracker = pressRef.current
		if (tracker === undefined || tracker.aborted) return
		const dx = Math.abs(e.clientX - tracker.x)
		const dy = Math.abs(e.clientY - tracker.y)
		if (dx > TAP_MOVE_TOLERANCE_PX || dy > TAP_MOVE_TOLERANCE_PX) {
			tracker.aborted = true
		}
	}

	function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
		const tracker = pressRef.current
		pressRef.current = undefined
		if (tracker === undefined || tracker.aborted) return
		const root = containerRef.current
		if (root === null) return
		const rect = root.getBoundingClientRect()
		const xWithin = e.clientX - rect.left
		const centerHalf = (rect.width * CENTER_SAFE_FRACTION) / 2
		const centerStart = rect.width / 2 - centerHalf
		const centerEnd = rect.width / 2 + centerHalf
		if (xWithin >= centerStart && xWithin <= centerEnd) return
		const isLeftHalf = xWithin < rect.width / 2
		if (isLeftHalf) onPrev()
		else onNext()
	}

	function handlePointerLeave() {
		pressRef.current = undefined
	}

	function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		const root = containerRef.current
		if (root === null) return
		const rect = root.getBoundingClientRect()
		const xWithin = e.clientX - rect.left
		const centerHalf = (rect.width * CENTER_SAFE_FRACTION) / 2
		const centerStart = rect.width / 2 - centerHalf
		const centerEnd = rect.width / 2 + centerHalf
		if (xWithin >= centerStart && xWithin <= centerEnd) {
			root.style.cursor = "default"
		} else if (xWithin < rect.width / 2) {
			root.style.cursor = "w-resize"
		} else {
			root.style.cursor = "e-resize"
		}
	}

	function handleMouseLeave() {
		const root = containerRef.current
		if (root === null) return
		root.style.cursor = "default"
	}

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 z-0"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerLeave={handlePointerLeave}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
		/>
	)
}

type GalleryFileMediaProps = {
	readonly file: GalleryFile
	readonly src: string
	readonly resId: string
	readonly hideSendBar: boolean
	readonly playerOptions?: GalleryPlayerOptions
	readonly naturalSize?: { readonly w: number; readonly h: number }
	readonly showClickZones?: boolean
	readonly onPrev?: () => void
	readonly onNext?: () => void
}

function GalleryFileMedia(props: GalleryFileMediaProps) {
	const {
		file,
		src,
		resId,
		hideSendBar,
		playerOptions,
		naturalSize,
		showClickZones,
		onPrev,
		onNext,
	} = props
	if (file.type === "video") {
		return (
			<DanmakuPlayer
				key={src}
				resId={resId}
				filename={file.filename}
				src={src}
				autoplay={playerOptions?.autoplay}
				loop={playerOptions?.loop}
				playing={playerOptions?.playing}
				controls={playerOptions?.controls}
				disableResume={playerOptions?.disableResume}
				settings={playerOptions?.settings}
				onSettingsChange={playerOptions?.onSettingsChange}
				preload={playerOptions?.preload}
				naturalSize={naturalSize}
				hideSendBar={hideSendBar}
				className="max-h-full max-w-full"
			/>
		)
	}
	if (file.type === "audio") {
		return (
			<div className="flex flex-col items-center gap-3 px-6 py-8 text-white">
				<span className="max-w-[80vw] truncate rounded bg-black/60 px-3 py-1 text-sm">
					{file.filename}
				</span>
				{/** biome-ignore lint/a11y/useMediaCaption: audio files in galleries don't ship caption tracks */}
				<audio key={src} src={src} controls autoPlay className="min-w-80" />
			</div>
		)
	}
	return (
		<div className="relative flex h-full w-full items-center justify-center">
			{showClickZones && onPrev !== undefined && onNext !== undefined && (
				<GalleryClickZones onPrev={onPrev} onNext={onNext} />
			)}
			<img
				src={src}
				alt={file.filename}
				decoding="async"
				fetchPriority="high"
				className="max-h-full max-w-full object-contain"
			/>
		</div>
	)
}
