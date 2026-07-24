import type { PluginIframeContext } from "@hoardodile/plugin-sdk-web"
import type { Resource } from "@hoardodile/schemas"
import type { RefObject } from "react"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import i18n from "@/i18n"
import { trpcQuery } from "@/trpc/factory"
import { fetchPluginSessionToken } from "../pluginSessionToken"
import { claim, type PoolClaimedEntry } from "./iframe-pool"
import { fetchPluginCache } from "./plugin-cache-fetch"

// ── usePluginIframePool ──────────────────────────────────────────────────────

export function usePluginIframePool(opts: {
	readonly pluginId: string
	readonly iframeRef?: RefObject<HTMLIFrameElement | null>
}): { readonly slot: PoolClaimedEntry | null } {
	const { pluginId, iframeRef } = opts
	const [slot, setSlot] = useState<PoolClaimedEntry | null>(null)

	useEffect(() => {
		const newSlot = claim({ pluginId })
		setSlot(newSlot)
		if (iframeRef !== undefined) iframeRef.current = newSlot.iframe

		return () => {
			newSlot.release()
			setSlot(null)
			if (iframeRef !== undefined) iframeRef.current = null
		}
	}, [pluginId, iframeRef])

	return { slot }
}

// ── useIframeLifecycle ───────────────────────────────────────────────────────

export type SlotStatus = "loading" | "ready" | "error"

export function useIframeLifecycle(opts: {
	readonly slot: PoolClaimedEntry | null
	readonly placeholder: HTMLElement | null
	readonly pluginId: string
	readonly resId: string
	readonly onError?: (info: {
		readonly pluginId: string
		readonly resId: string
		readonly error: Error
	}) => void
	readonly contextPushed: boolean
}): { readonly status: SlotStatus; readonly contentVisible: boolean } {
	const { slot, placeholder, pluginId, resId, onError, contextPushed } = opts
	const [status, setStatus] = useState<SlotStatus>("loading")
	const [contentVisible, setContentVisible] = useState(true)
	const loadedRef = useRef(false)
	const onErrorRef = useRef(onError)

	useEffect(() => {
		onErrorRef.current = onError
	}, [onError])

	useEffect(() => {
		if (slot === null || placeholder === null) return
		loadedRef.current = false
		setStatus("loading")

		let visible = true
		setContentVisible(true)
		const io = new IntersectionObserver(
			(entries) => {
				const isIntersecting = entries.some((e) => e.isIntersecting)
				if (isIntersecting === visible) return
				visible = isIntersecting
				setContentVisible(isIntersecting)
				slot.setVisibility(isIntersecting)
			},
			{ threshold: 0 },
		)
		io.observe(placeholder)
		slot.setVisibility(true)

		const unsubLoad = slot.onLoaded(() => {
			loadedRef.current = true
			if (contextPushed) {
				setStatus("ready")
			}
		})

		if (contextPushed && loadedRef.current) {
			setStatus("ready")
		}

		const timeout = setTimeout(() => {
			if (!loadedRef.current) {
				setStatus("error")
				onErrorRef.current?.({
					pluginId,
					resId,
					error: new Error("Plugin preview timed out"),
				})
			}
		}, 30_000)

		return () => {
			clearTimeout(timeout)
			unsubLoad()
			io.disconnect()
		}
	}, [slot, placeholder, pluginId, resId, contextPushed])

	return { status, contentVisible }
}

// ── useIframePositionSync ────────────────────────────────────────────────────

export function useIframePositionSync(opts: {
	readonly placeholder: HTMLElement | null
	readonly slot: PoolClaimedEntry | null
	readonly zHint?: number
	readonly visible?: boolean
}): void {
	const { placeholder, slot, zHint = 0, visible = true } = opts

	useLayoutEffect(() => {
		if (placeholder === null || slot === null) return

		function syncPosition() {
			if (placeholder === null || slot === null) return

			if (!visible) {
				slot.iframe.style.display = "none"
				return
			}

			const rect = placeholder.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) {
				slot.iframe.style.display = "none"
				return
			}
			slot.iframe.style.display = "block"
			slot.iframe.style.top = `${rect.top}px`
			slot.iframe.style.left = `${rect.left}px`
			slot.iframe.style.width = `${rect.width}px`
			slot.iframe.style.height = `${rect.height}px`
			slot.iframe.style.zIndex = String(zHint)
		}

		syncPosition()

		const ro = new ResizeObserver(syncPosition)
		ro.observe(placeholder)

		return () => {
			ro.disconnect()
		}
	}, [placeholder, slot, zHint, visible])
}

// ── usePluginContext ─────────────────────────────────────────────────────────

export function usePluginContext(opts: {
	readonly slot: PoolClaimedEntry | null
	readonly pluginId: string
	readonly resId: string
	readonly resName: string
	readonly sourceMeta: Resource["sourceMeta"]
	readonly searchMeta?: Resource["searchMeta"]
	readonly fileStats?: Resource["fileStats"]
	readonly contentPluginId: string
	readonly forceTheme?: "light" | "dark"
	readonly onContextPushed?: () => void
}): void {
	const {
		slot,
		pluginId,
		resId,
		resName,
		sourceMeta,
		searchMeta,
		fileStats,
		contentPluginId,
		forceTheme,
		onContextPushed,
	} = opts

	useEffect(() => {
		if (slot === null) return

		const ctx: PluginIframeContext = {
			pluginId,
			resId,
			resName,
			sourceMeta,
			searchMeta,
			fileStats,
			contentPluginId,
			language: i18n.resolvedLanguage || i18n.language || "en",
			resolvedTheme:
				forceTheme ??
				((document.documentElement.classList.contains("dark")
					? "dark"
					: "light") as "light" | "dark"),
			palette: (document.documentElement.dataset.theme || "default") as
				| "default"
				| "sky-blue"
				| "warmred"
				| "gold-celadon",
			initialPrefs: {},
			initialCache: {},
			fileToken: "",
		}

		let mounted = true
		void (async function init() {
			await slot.whenLoaded()
			if (!mounted) return

			try {
				const [prefEntries, cacheRecord, sessionToken] = await Promise.all([
					trpcQuery("pluginPreference", "listByPlugin", { pluginId }),
					fetchPluginCache(resId, pluginId),
					fetchPluginSessionToken(resId),
				])
				if (!mounted) return
				for (const entry of prefEntries) {
					if (entry.value !== undefined && entry.value !== "") {
						ctx.initialPrefs[entry.key] = entry.value
					}
				}
				for (const [key, value] of Object.entries(cacheRecord)) {
					ctx.initialCache[key] = value
				}
				// @ts-expect-error
				ctx.fileToken = sessionToken
			} catch {
				// Pref/cache/token load is best-effort; the iframe still works.
			}
			if (!mounted) return
			slot.postContext(ctx)
			onContextPushed?.()
		})()

		return () => {
			mounted = false
		}
	}, [slot, pluginId, resId, resName, contentPluginId, forceTheme])
}

// ── usePluginIframeSlot ──────────────────────────────────────────────────────

export type UsePluginIframeSlotOptions = {
	readonly pluginId: string
	readonly resId: string
	readonly resName: string
	readonly sourceMeta: Resource["sourceMeta"]
	readonly searchMeta?: Resource["searchMeta"]
	readonly fileStats?: Resource["fileStats"]
	readonly contentPluginId: string
	readonly zHint?: number
	readonly onError?: (info: {
		readonly pluginId: string
		readonly resId: string
		readonly error: Error
	}) => void
	readonly iframeRef?: RefObject<HTMLIFrameElement | null>
	readonly forceTheme?: "light" | "dark"
	readonly inline?: boolean
}

export type UsePluginIframeSlotResult = {
	readonly ref: (el: HTMLElement | null) => void
	readonly status: SlotStatus
	readonly contentVisible: boolean
}

export function usePluginIframeSlot(
	opts: UsePluginIframeSlotOptions,
): UsePluginIframeSlotResult {
	const {
		pluginId,
		resId,
		resName,
		sourceMeta,
		searchMeta,
		fileStats,
		contentPluginId,
		zHint = 0,
		onError,
		iframeRef,
		forceTheme,
		inline,
	} = opts
	const [placeholder, setPlaceholder] = useState<HTMLElement | null>(null)
	const [contextPushed, setContextPushed] = useState(false)

	const { slot } = usePluginIframePool({ pluginId, iframeRef })

	useEffect(() => {
		setContextPushed(false)
	}, [slot])

	usePluginContext({
		slot,
		pluginId,
		resId,
		resName,
		sourceMeta,
		searchMeta,
		fileStats,
		contentPluginId,
		forceTheme,
		onContextPushed: () => {
			requestAnimationFrame(() => setContextPushed(true))
		},
	})

	useEffect(() => {
		if (!inline || slot === null || placeholder === null) return

		const iframe = slot.iframe
		const originalParent = iframe.parentElement
		placeholder.appendChild(iframe)
		iframe.style.position = "absolute"
		iframe.style.inset = "0"
		iframe.style.width = "100%"
		iframe.style.height = "100%"
		iframe.style.zIndex = "auto"
		iframe.style.display = "block"

		return () => {
			if (originalParent !== null && iframe.parentElement !== originalParent) {
				originalParent.appendChild(iframe)
				iframe.style.position = "fixed"
				iframe.style.inset = ""
				iframe.style.width = ""
				iframe.style.height = ""
				iframe.style.zIndex = "0"
				iframe.style.display = "none"
			}
		}
	}, [inline, slot, placeholder])

	useIframePositionSync({
		placeholder: inline ? null : placeholder,
		slot,
		zHint,
		visible: contextPushed,
	})

	const { status, contentVisible } = useIframeLifecycle({
		slot,
		placeholder,
		pluginId,
		resId,
		onError,
		contextPushed,
	})

	const ref = useCallback((el: HTMLElement | null) => {
		setPlaceholder(el)
	}, [])

	return { ref, status, contentVisible }
}
