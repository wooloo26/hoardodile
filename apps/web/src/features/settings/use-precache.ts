import { useCallback, useState } from "react"
import { precacheAbort, precacheStart, precacheStream } from "./api"

type Phase = "resources" | "characters" | null

type ProgressState = {
	phase: Phase
	current: number
	total: number
}

type PrecachePhaseResult = {
	readonly total: number
	readonly succeeded: number
	readonly failed: number
	readonly errors: readonly { id: string; error: string }[]
	readonly thumbUrls: readonly string[]
}

type PrecacheResult = {
	readonly resources: PrecachePhaseResult
	readonly characters: PrecachePhaseResult
}

type PrecacheStatus = "checking" | "idle" | "loading" | "ready" | "error"

type PrecacheState = {
	status: PrecacheStatus
	progress: ProgressState
	result: PrecacheResult | null
	error: string | null
	conflict: boolean
}

const INITIAL: PrecacheState = {
	status: "checking",
	progress: { phase: null, current: 0, total: 0 },
	result: null,
	error: null,
	conflict: false,
}

type SSEEventHandler = (
	eventType: string,
	data: Record<string, unknown>,
) => void

async function parseSSEStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	onEvent: SSEEventHandler,
): Promise<void> {
	const decoder = new TextDecoder()
	let buffer = ""

	for (;;) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split("\n")
		buffer = lines.pop() ?? ""

		let eventType = ""
		for (const line of lines) {
			if (line.startsWith("event: ")) {
				eventType = line.slice("event: ".length)
			} else if (line.startsWith("data: ")) {
				const data = JSON.parse(line.slice("data: ".length)) as Record<
					string,
					unknown
				>
				onEvent(eventType, data)
				eventType = ""
			}
		}
	}
}

export function usePrecache() {
	const [state, setState] = useState<PrecacheState>(INITIAL)

	const start = useCallback(async (): Promise<PrecacheResult | null> => {
		setState({
			status: "loading",
			progress: { phase: null, current: 0, total: 0 },
			result: null,
			error: null,
			conflict: false,
		})

		let response: Response
		try {
			response = await precacheStart()
		} catch (err) {
			setState((prev) => ({
				...prev,
				status: "error",
				error: err instanceof Error ? err.message : "Network error",
			}))
			return null
		}

		if (response.status === 409) {
			setState((prev) => ({
				...prev,
				status: "error",
				conflict: true,
				error: "Precache already in progress",
			}))
			return null
		}

		if (!response.ok || !response.body) {
			setState((prev) => ({
				...prev,
				status: "error",
				error: `Server error: ${response.status}`,
			}))
			return null
		}

		const reader = response.body.getReader()
		let finalResult: PrecacheResult | null = null

		try {
			await parseSSEStream(reader, (eventType, data) => {
				switch (eventType) {
					case "phase":
						setState((prev) => ({
							...prev,
							progress: {
								phase: data.phase as Phase,
								total: data.total as number,
								current: 0,
							},
						}))
						break
					case "progress":
						setState((prev) => ({
							...prev,
							progress: {
								phase: data.phase as Phase,
								current: data.current as number,
								total: data.total as number,
							},
						}))
						break
					case "done":
						finalResult = data as unknown as PrecacheResult
						setState((prev) => ({
							...prev,
							status: "ready",
							result: finalResult,
						}))
						break
					case "aborted":
						setState((prev) => ({
							...prev,
							status: "idle",
							progress: { phase: null, current: 0, total: 0 },
						}))
						break
					case "error":
						setState((prev) => ({
							...prev,
							status: "error",
							error: data.message as string,
						}))
						break
				}
			})
		} catch (_err) {
			setState((prev) =>
				prev.status === "ready"
					? prev
					: { ...prev, status: "error", error: "Stream disconnected" },
			)
		} finally {
			reader.releaseLock()
		}

		return finalResult
	}, [])

	const abort = useCallback(async () => {
		try {
			const response = await precacheAbort()
			return response.ok
		} catch {
			return false
		}
	}, [])

	const resumeIfRunning = useCallback(async () => {
		// Immediately enter loading so the button is disabled while we check
		// the server state — prevents race between resume and a manual click.
		setState((prev) => ({
			...prev,
			status: "loading",
			error: null,
			conflict: false,
		}))

		let response: Response
		try {
			response = await precacheStream()
		} catch {
			setState((prev) => ({ ...prev, status: "idle" }))
			return
		}

		if (!response.ok || !response.body) {
			setState((prev) => ({ ...prev, status: "idle" }))
			return
		}

		const reader = response.body.getReader()

		try {
			await parseSSEStream(reader, (eventType, data) => {
				switch (eventType) {
					case "phase":
						setState((prev) => ({
							...prev,
							progress: {
								phase: data.phase as Phase,
								total: data.total as number,
								current: 0,
							},
						}))
						break
					case "progress":
						setState((prev) => ({
							...prev,
							progress: {
								phase: data.phase as Phase,
								current: data.current as number,
								total: data.total as number,
							},
						}))
						break
					case "done":
						setState((prev) => ({
							...prev,
							status: "ready",
							result: data as unknown as PrecacheResult,
						}))
						break
					case "idle":
						setState((prev) => ({ ...prev, status: "idle" }))
						break
					case "aborted":
						setState((prev) => ({
							...prev,
							status: "idle",
							progress: { phase: null, current: 0, total: 0 },
						}))
						break
					case "error":
						setState((prev) => ({
							...prev,
							status: "error",
							error: data.message as string,
						}))
						break
				}
			})
		} catch {
			// stream disconnected — last rendered progress remains visible
		} finally {
			reader.releaseLock()
		}
	}, [])

	return { ...state, start, abort, resumeIfRunning }
}
