import type { Danmaku as DanmakuRecord } from "@hoardodile/plugin-sdk-web"
import { toast } from "sonner"
import { usePluginAPI } from "../hooks"
import { useTranslation } from "../i18n"

type SubmitterDeps = {
	readonly resId: string
	readonly filename: string
	readonly getCurrentMs: () => number
	readonly onEmit?: (created: DanmakuRecord) => void
}

type SubmitterAPI = {
	readonly submit: (text: string) => void
	readonly isPending: boolean
}

export function useDanmakuSubmitter(deps: SubmitterDeps): SubmitterAPI {
	const api = usePluginAPI()
	const { resId, filename, getCurrentMs, onEmit } = deps
	const { t } = useTranslation()
	const { mutate: createDanmaku, isPending } = api.useCreateDanmaku()

	function submit(text: string) {
		const trimmed = text.trim()
		if (trimmed.length === 0 || isPending) return
		const rawMs = getCurrentMs()
		const timeMs = Number.isFinite(rawMs) ? Math.max(0, Math.round(rawMs)) : 0
		createDanmaku({
			text: trimmed,
			anchor: {
				resId,
				data: { kind: "videoTime", filename, timeMs },
			},
			mode: "scroll",
		})
			.then((created) => {
				onEmit?.(created)
				return api.invalidate("danmaku")
			})
			.catch((err: Error) => {
				toast.error(err.message || t("player.danmakuSendFailed"))
			})
	}

	return { submit, isPending }
}
