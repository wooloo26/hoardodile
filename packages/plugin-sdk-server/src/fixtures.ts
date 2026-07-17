import type {
	AudioInfo,
	ImageInfo,
	Logger,
	ResourceAPI,
	VideoInfo,
} from "./types.ts"

/** Declarative configuration for a {@link ResourceAPI} fixture. */
export type ResourceAPIFixtureConfig = {
	/** File names returned by `listFiles`. */
	readonly files?: readonly string[]
	/** File contents returned by `readFile`. */
	readonly contents?: Readonly<Record<string, string | Uint8Array>>
	/** Probe results. A plain value is used as the default for all paths. */
	readonly probes?: {
		readonly image?:
			| Readonly<Record<string, ImageInfo | undefined>>
			| ImageInfo
			| undefined
		readonly video?:
			| Readonly<Record<string, VideoInfo | undefined>>
			| VideoInfo
			| undefined
		readonly audio?:
			| Readonly<Record<string, AudioInfo | undefined>>
			| AudioInfo
			| undefined
		readonly isAnimated?: Readonly<Record<string, boolean>> | boolean
	}
	/** Stat results. A plain value is used as the default for all paths. */
	readonly stats?:
		| Readonly<Record<string, { readonly sizeBytes: number } | undefined>>
		| { readonly sizeBytes: number }
		| undefined
}

function resolveValue<T>(
	path: string,
	value: Readonly<Record<string, T | undefined>> | T | undefined,
	defaultValue: T | undefined,
): T | undefined {
	if (value === undefined || value === null) return defaultValue
	if (typeof value !== "object" || Array.isArray(value)) return value
	for (const [key, candidate] of Object.entries(
		value as Record<string, T | undefined>,
	)) {
		if (path.includes(key)) return candidate
	}
	return defaultValue
}

/** Create a mutable {@link ResourceAPI} fixture driven by a declarative config. */
export function createResourceAPIFixture(
	initialConfig: ResourceAPIFixtureConfig = {},
): {
	readonly api: ResourceAPI
	readonly setConfig: (next: ResourceAPIFixtureConfig) => void
} {
	let config: ResourceAPIFixtureConfig = initialConfig

	function setConfig(next: ResourceAPIFixtureConfig): void {
		config = next
	}

	const api: ResourceAPI = {
		logInfo() {},
		logWarn() {},
		logError() {},
		async listFiles() {
			return config.files ?? []
		},
		async readFile(path, range) {
			const content = config.contents?.[path]
			if (content === undefined) {
				throw new Error(`ResourceAPIFixture: no content for "${path}"`)
			}
			const bytes =
				typeof content === "string"
					? new TextEncoder().encode(content)
					: content
			if (range === undefined) return bytes
			// Mirrors host semantics: the range is clamped to the content size.
			return bytes.slice(range.start ?? 0, range.end)
		},
		async statFile(path) {
			return resolveValue(path, config.stats, undefined)
		},
		async probeImage(path) {
			return resolveValue(path, config.probes?.image, undefined)
		},
		async probeVideo(path) {
			return resolveValue(path, config.probes?.video, undefined)
		},
		async probeAudio(path) {
			return resolveValue(path, config.probes?.audio, undefined)
		},
		async isAnimatedImage(path) {
			return resolveValue(path, config.probes?.isAnimated, false) ?? false
		},
		async setCover() {},
		async clearCover() {},
		async setLocalCover() {},
	}

	return { api, setConfig }
}

/** Return a minimal {@link Logger} for tests. */
export function stubLogger(overrides?: Partial<Logger>): Logger {
	return {
		info() {},
		warn() {},
		error() {},
		...overrides,
	}
}
