import type { WebPluginAPI } from "./types.ts"

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (...args: never[]) => unknown
		? T[K] | undefined
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K]
}

function mergeDeep<T extends object>(target: T, source: DeepPartial<T>): T {
	const result = { ...target }
	for (const key of Object.keys(source) as Array<keyof T>) {
		const sourceValue = source[key]
		const targetValue = result[key]
		if (
			sourceValue !== undefined &&
			typeof sourceValue === "object" &&
			!Array.isArray(sourceValue) &&
			targetValue !== undefined &&
			typeof targetValue === "object" &&
			!Array.isArray(targetValue)
		) {
			result[key] = mergeDeep(
				targetValue as object,
				sourceValue as DeepPartial<object>,
			) as T[keyof T]
		} else if (sourceValue !== undefined) {
			result[key] = sourceValue as T[keyof T]
		}
	}
	return result
}

/**
 * Returns a minimal complete {@link WebPluginAPI} for render tests. All fields
 * return empty/loading/no-op values; override via `overrides` to exercise
 * plugin-specific code paths.
 */
export function createWebPluginAPIStub(
	overrides?: DeepPartial<WebPluginAPI>,
): WebPluginAPI {
	const base: WebPluginAPI = {
		logInfo: () => {},
		logWarn: () => {},
		logError: () => {},
		resource: {
			id: "r-test",
			name: "test",
			sourceMeta: undefined,
			searchMeta: undefined,
			fileStats: undefined,
			contentPluginId: "p-test",
			fileToken: "tok-test",
		},
		listFiles: async () => [],
		readFile: async () => new ArrayBuffer(0),
		resolveFileUrl: (filename) => `/files/${filename}`,
		resolveBaseUrl: () => "/files/",
		resolveFrameUrl: (filename, timeMs) => `/frame/${filename}/${timeMs}`,
		listMessages: async () => [],
		createMessage: async () => {
			throw new Error("createMessage stub not overridden")
		},
		listDanmaku: async () => [],
		createDanmaku: async () => {
			throw new Error("createDanmaku stub not overridden")
		},
		getPref: () => undefined,
		setPref: () => {},
		getCache: () => undefined,
		setCache: () => {},
		listCache: () => [],
		uploadCover: async () => {},
		invalidate: async () => {},
		useFileList: () => ({
			data: [],
			isLoading: false,
			isError: false,
			error: null,
		}),
		useMessageList: () => ({
			data: [],
			isLoading: false,
			isError: false,
			error: null,
		}),
		useCreateMessage: () => ({
			mutate: async () => {
				throw new Error("useCreateMessage stub not overridden")
			},
			isPending: false,
		}),
		useDanmakuList: () => ({
			data: [],
			isLoading: false,
			isError: false,
			error: null,
		}),
		useCreateDanmaku: () => ({
			mutate: async () => {
				throw new Error("useCreateDanmaku stub not overridden")
			},
			isPending: false,
		}),
		usePref: (_key, defaultValue, _codec) => [defaultValue, (_next) => {}],
		useTheme: () => ({ resolvedTheme: "light", palette: "default" }),
	}
	return overrides === undefined ? base : mergeDeep(base, overrides)
}
