import type {
	AnchorData,
	Danmaku,
	DanmakuMode,
	FileStats,
	Message,
	PluginSchema,
} from "@hoardodile/plugin-sdk-types"
import type { InvalidateTarget } from "./protocol.ts"

/** Resource metadata available to render modules for context-aware rendering. */
export type PluginResource<TSchema extends PluginSchema = PluginSchema> = {
	readonly id: string
	readonly name: string
	readonly sourceMeta: TSchema["sourceMeta"]
	readonly searchMeta: TSchema["searchMeta"]
	readonly fileStats: FileStats | undefined
	readonly contentPluginId: string
	/**
	 * Short-lived token appended to resource file URLs so the sandboxed
	 * iframe can fetch binaries without a session cookie.
	 */
	readonly fileToken: string
}

/** Encode/decode pair for typed preference values. */
export type Codec<T> = {
	readonly encode: (value: T) => string
	readonly decode: (raw: string) => T | undefined
}

/** Client-side filter applied after fetching all danmaku for a resource. */
export type DanmakuListFilter = {
	readonly kind?: string
	readonly filename?: string
	readonly page?: number
	readonly paragraph?: number
}

/** Reactive query state returned by hooks. */
export type QueryState<T> = {
	readonly data: T | undefined
	readonly isLoading: boolean
	readonly isError: boolean
	readonly error: Error | null
}

/** Reactive mutation state returned by hooks. */
export type MutationState<TInput, TOutput> = {
	readonly mutate: (input: TInput) => Promise<TOutput>
	readonly isPending: boolean
}

/** Current theme as observed by the plugin. */
export type Theme = {
	readonly resolvedTheme: string
	readonly palette: string
}

/**
 * Full imperative and reactive API surface injected into plugin render modules.
 */
export type WebPluginAPI<TSchema extends PluginSchema = PluginSchema> = {
	/** Logging */
	readonly logInfo: (message: string, data?: Record<string, unknown>) => void
	readonly logWarn: (message: string, data?: Record<string, unknown>) => void
	readonly logError: (message: string, data?: Record<string, unknown>) => void

	/** Resource context. */
	readonly resource: PluginResource<TSchema>

	/** Files. */
	readonly listFiles: () => Promise<readonly TSchema["file"][]>
	readonly readFile: (path: string) => Promise<ArrayBuffer>
	readonly resolveFileUrl: (
		filename: string,
		size?: "preview" | "original",
	) => string
	/**
	 * Root URL of the current resource's files directory, trailing-slash
	 * included. For vendor SDKs that internally join relative paths and need
	 * a base.
	 */
	readonly resolveBaseUrl: () => string
	/**
	 * Resolve a server-rendered frame thumbnail URL for a video file at the
	 * given timestamp (in milliseconds, measured from the start of the
	 * file). The server decodes the requested frame on demand; callers
	 * should debounce frequent invocations (e.g. while scrubbing) to avoid
	 * a flood of decode requests.
	 */
	readonly resolveFrameUrl: (filename: string, timeMs: number) => string

	/** Messages. */
	readonly listMessages: () => Promise<readonly Message[]>
	readonly createMessage: (input: {
		readonly body: string
		readonly anchor?: AnchorData
	}) => Promise<Message>

	/** Danmaku. */
	readonly listDanmaku: () => Promise<readonly Danmaku[]>
	readonly createDanmaku: (input: {
		readonly text: string
		readonly anchor: AnchorData
		readonly mode?: DanmakuMode
	}) => Promise<Danmaku>

	/** Preferences. */
	readonly getPref: (key: string) => string | undefined
	readonly setPref: (key: string, value: string) => void

	/** Cache. */
	readonly getCache: (key: string) => string | undefined
	readonly setCache: (key: string, value: string) => void
	readonly listCache: () => readonly {
		readonly key: string
		readonly value: string
	}[]

	/** Invalidation. */
	readonly invalidate: (target: InvalidateTarget) => Promise<void>

	/** Reactive hooks. */
	readonly useFileList: () => QueryState<readonly TSchema["file"][]>
	readonly useMessageList: () => QueryState<readonly Message[]>
	readonly useCreateMessage: () => MutationState<
		{ readonly body: string; readonly anchor?: AnchorData },
		Message
	>
	readonly useDanmakuList: (
		filter?: DanmakuListFilter,
	) => QueryState<readonly Danmaku[]>
	readonly useCreateDanmaku: () => MutationState<
		{
			readonly text: string
			readonly anchor: AnchorData
			readonly mode?: DanmakuMode
		},
		Danmaku
	>
	readonly usePref: <T>(
		key: string,
		defaultValue: T,
		codec?: Codec<T>,
	) => readonly [T, (value: T) => void]
	readonly useTheme: () => Theme
}

/** Error info passed to onError callback when a plugin preview crashes. */
export type PluginErrorInfo = {
	readonly pluginId: string
	readonly resId: string
	readonly error: Error
}

export type {
	AnchorData,
	Danmaku,
	DanmakuMode,
	Message,
	ResAnchor,
} from "@hoardodile/plugin-sdk-types"
