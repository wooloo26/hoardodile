import { extname } from "./helpers.ts"
import type { Detection, ResourceAPI } from "./types.ts"

/** A detector evaluates a resource and returns a {@link Detection}. */
export type Detector = (api: ResourceAPI) => Promise<Detection>

function ok(): Detection {
	return { ok: true } as const
}

function fail(reasons: readonly string[]): Detection {
	return { ok: false, reasons }
}

/** Detect when all given detectors pass. */
export function all(...detectors: readonly Detector[]): Detector {
	return async function detectAll(api) {
		for (const detector of detectors) {
			const result = await detector(api)
			if (!result.ok) return result
		}
		return ok()
	}
}

/** Detect when at least one given detector passes. */
export function any(...detectors: readonly Detector[]): Detector {
	return async function detectAny(api) {
		for (const detector of detectors) {
			const result = await detector(api)
			if (result.ok) return ok()
		}
		return fail(["no-detector-matched"])
	}
}

/** Negate a detector: passes when the wrapped detector fails. */
export function not(detector: Detector, reasons: readonly string[]): Detector {
	return async function detectNot(api) {
		const result = await detector(api)
		return result.ok ? fail(reasons) : ok()
	}
}

/** Detect when the resource has at least one file with any of the given extensions. */
export function hasExt(extensions: ReadonlySet<string>): Detector {
	return async function detectHasExt(api) {
		const files = await api.listFiles()
		const has = files.some((name) => extensions.has(extname(name)))
		return has ? ok() : fail(["required-extension"])
	}
}

/** Detect when the resource has a file whose name matches the given regex. */
export function hasName(pattern: RegExp): Detector {
	return async function detectHasName(api) {
		const files = await api.listFiles()
		const has = files.some((name) => pattern.test(name))
		return has ? ok() : fail(["required-file"])
	}
}

/** Detect when the resource has at least `count` files. */
export function minFiles(count: number): Detector {
	return async function detectMinFiles(api) {
		const files = await api.listFiles()
		return files.length >= count ? ok() : fail(["insufficient-files"])
	}
}

/** File-selection helpers that operate on a {@link ResourceAPI}. */
export const files = {
	/**
	 * Return the first file matching any of the given extension sets,
	 * or `undefined` when none match.
	 */
	async firstMatching(
		api: ResourceAPI,
		...extensions: readonly ReadonlySet<string>[]
	): Promise<string | undefined> {
		const allFiles = await api.listFiles()
		for (const filename of allFiles) {
			const ext = extname(filename)
			for (const set of extensions) {
				if (set.has(ext)) return filename
			}
		}
		return undefined
	},
} as const
