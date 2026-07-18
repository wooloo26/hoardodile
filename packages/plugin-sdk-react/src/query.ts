import type {
	AnchorData,
	Danmaku,
	DanmakuListFilter,
	DanmakuMode,
	Message,
	PluginSchema,
} from "@hoardodile/plugin-sdk-types"
import type {
	Codec,
	Host,
	MutationState,
	QueryState,
	Theme,
	WebPluginAPI,
} from "@hoardodile/plugin-sdk-web"
import {
	extractPrefPayload,
	extractThemePayload,
	getPluginPrefStore,
	setPluginPref,
	subscribeToPrefChanges,
} from "@hoardodile/plugin-sdk-web"
import { useEffect, useMemo, useState } from "react"

// ── Query state helpers ──────────────────────────────────────────────────

function buildQuerySuccessState<T>(data: T): QueryState<T> {
	return { data, isLoading: false, isError: false, error: null }
}

function buildQueryErrorState(err: unknown): QueryState<never> {
	return {
		data: undefined,
		isLoading: false,
		isError: true,
		error: err instanceof Error ? err : new Error(String(err)),
	}
}

function buildQueryLoadingState(): QueryState<never> {
	return { data: undefined, isLoading: true, isError: false, error: null }
}

// ── Base query hook ──────────────────────────────────────────────────────

type PluginRequestKey =
	keyof import("@hoardodile/plugin-sdk-web").PluginRequests
type HostPushKey = keyof import("@hoardodile/plugin-sdk-web").HostPushes

type UseHostQueryOptions<K extends PluginRequestKey> = {
	readonly method: K
	readonly params: import("@hoardodile/plugin-sdk-web").RequestInput<K>
	readonly invalidateKey: HostPushKey
	readonly extraDeps?: readonly unknown[]
}

function useHostQuery<K extends PluginRequestKey, T>(
	host: Host,
	options: UseHostQueryOptions<K>,
): QueryState<T> {
	const { method, params, invalidateKey, extraDeps = [] } = options
	const [state, setState] = useState<QueryState<T>>(buildQueryLoadingState)

	useEffect(() => {
		let cancelled = false
		setState(buildQueryLoadingState())

		function fetchData() {
			const args = params === undefined ? [] : [params]
			host
				.request(method, ...(args as never))
				.then((result) => {
					if (!cancelled) {
						setState(buildQuerySuccessState(result as T))
					}
				})
				.catch((err: unknown) => {
					if (!cancelled) {
						setState(buildQueryErrorState(err))
					}
				})
		}

		fetchData()
		const unsub = host.subscribe(invalidateKey, fetchData as never)
		return function cleanup() {
			cancelled = true
			unsub()
		}
	}, [host, method, invalidateKey, ...extraDeps])

	return state
}

// ── File queries ─────────────────────────────────────────────────────────

function useFileList(host: Host) {
	return useHostQuery<"listFiles", readonly string[]>(host, {
		method: "listFiles",
		params: undefined,
		invalidateKey: "res:invalidate",
	})
}

// ── Message queries ──────────────────────────────────────────────────────

function useMessageList(host: Host) {
	return useHostQuery<"listMessages", readonly Message[]>(host, {
		method: "listMessages",
		params: undefined,
		invalidateKey: "messages:invalidate",
	})
}

// ── Danmaku queries ───────────────────────────────────────────────────────

function useDanmakuList(host: Host, filter?: DanmakuListFilter) {
	return useHostQuery<"listDanmaku", readonly Danmaku[]>(host, {
		method: "listDanmaku",
		params: { filter },
		invalidateKey: "danmaku:invalidate",
		// The filter object is a fresh literal on every render; a stable
		// serialization keeps the effect from refetching in a loop while
		// still refetching when any filter value actually changes.
		extraDeps: [filter === undefined ? undefined : JSON.stringify(filter)],
	})
}

// ── Mutations ────────────────────────────────────────────────────────────

function useHostMutation<
	K extends PluginRequestKey,
	TArgs extends import("@hoardodile/plugin-sdk-web").RequestInput<K>,
	TResult extends import("@hoardodile/plugin-sdk-web").RequestOutput<K>,
>(host: Host, method: K): MutationState<TArgs, TResult> {
	const [isPending, setIsPending] = useState(false)

	async function mutate(args: TArgs): Promise<TResult> {
		setIsPending(true)
		try {
			const requestArgs = args === undefined ? [] : [args]
			return (await host.request(
				method,
				...(requestArgs as never),
			)) as unknown as TResult
		} finally {
			setIsPending(false)
		}
	}

	return { mutate, isPending }
}

function useCreateMessage(
	host: Host,
): MutationState<
	{ readonly body: string; readonly anchor?: AnchorData },
	Message
> {
	return useHostMutation<
		"createMessage",
		{ readonly body: string; readonly anchor?: AnchorData },
		Message
	>(host, "createMessage")
}

function useCreateDanmaku(host: Host): MutationState<
	{
		readonly text: string
		readonly anchor: AnchorData
		readonly mode?: DanmakuMode
	},
	Danmaku
> {
	return useHostMutation<
		"createDanmaku",
		{
			readonly text: string
			readonly anchor: AnchorData
			readonly mode?: DanmakuMode
		},
		Danmaku
	>(host, "createDanmaku")
}

// ── Preferences hook ─────────────────────────────────────────────────────

function usePref<T>(
	host: Host,
	key: string,
	defaultValue: T,
	codec?: Codec<T>,
): readonly [T, (value: T) => void] {
	const store = getPluginPrefStore()
	const encodedDefault = useMemo(
		function computeEncodedDefault() {
			return codec !== undefined
				? codec.encode(defaultValue)
				: String(defaultValue)
		},
		[codec, defaultValue],
	)

	const [raw, setRawState] = useState(function getInitial() {
		return store.get(key) ?? encodedDefault
	})

	useEffect(
		function subscribeToStoreChanges() {
			return subscribeToPrefChanges(key, function onChange() {
				setRawState(getPluginPrefStore().get(key) ?? encodedDefault)
			})
		},
		[key, encodedDefault],
	)

	useEffect(
		function subscribeToHostPush() {
			return host.subscribe("prefsChanged", function handlePrefPush(data) {
				const payload = extractPrefPayload(data)
				if (payload === undefined || payload.key !== key) return
				if (payload.value !== undefined) {
					setPluginPref(key, payload.value)
					setRawState(payload.value)
				} else {
					setRawState(encodedDefault)
				}
			})
		},
		[host, key, encodedDefault],
	)

	const value = useMemo(
		function decodeValue() {
			if (codec === undefined) return raw as unknown as T
			const decoded = codec.decode(raw)
			return decoded !== undefined ? decoded : defaultValue
		},
		[raw, codec, defaultValue],
	)

	function setValue(next: T): void {
		const encoded = codec !== undefined ? codec.encode(next) : String(next)
		setPluginPref(key, encoded)
		setRawState(encoded)
		host.request("setPref", { key, value: encoded }).catch(() => {})
	}

	return [value, setValue] as const
}

// ── Theme hook ───────────────────────────────────────────────────────────

function useTheme(
	host: Host,
	initialResolvedTheme: string,
	initialPalette: string,
): Theme {
	const [resolvedTheme, setResolvedTheme] = useState(initialResolvedTheme)
	const [palette, setPalette] = useState(initialPalette)

	useEffect(() => {
		const unsub = host.subscribe(
			"themeChanged",
			function handleThemePush(data) {
				const { resolvedTheme: nextTheme, palette: nextPalette } =
					extractThemePayload(data)
				if (nextTheme !== undefined) setResolvedTheme(nextTheme)
				if (nextPalette !== undefined) setPalette(nextPalette)
			},
		)
		return function cleanup() {
			unsub()
		}
	}, [host])

	return { resolvedTheme, palette }
}

// ── Public factory ───────────────────────────────────────────────────────

export function createPluginQueryAPI<
	TSchema extends PluginSchema = PluginSchema,
>(
	host: Host,
	ctx: { readonly resolvedTheme: string; readonly palette: string },
): Pick<
	WebPluginAPI<TSchema>,
	| "useFileList"
	| "useMessageList"
	| "useCreateMessage"
	| "useDanmakuList"
	| "useCreateDanmaku"
	| "usePref"
	| "useTheme"
> {
	return {
		useFileList: () =>
			useFileList(host) as QueryState<readonly TSchema["file"][]>,
		useMessageList: () => useMessageList(host),
		useCreateMessage: () => useCreateMessage(host),
		useDanmakuList: (filter?: DanmakuListFilter) =>
			useDanmakuList(host, filter),
		useCreateDanmaku: () => useCreateDanmaku(host),
		usePref: <T>(key: string, defaultValue: T, codec?: Codec<T>) =>
			usePref(host, key, defaultValue, codec),
		useTheme: () => useTheme(host, ctx.resolvedTheme, ctx.palette),
	}
}
