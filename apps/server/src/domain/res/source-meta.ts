import type { ResourceAPI } from "@hoardodile/plugin-sdk-server"
import type { PluginManifestId } from "@hoardodile/schemas"

export type BuildFileStatsInput = {
	readonly contentPluginId: PluginManifestId
	readonly api: ResourceAPI
}

/**
 * Collect size and top-level file count from the resource API. With the
 * single-archive storage shape, `listFiles` returns every entry in the
 * artifact (zip entries are flat-listed even when they contain `/` in
 * their names), so a separate recursive walk is no longer needed.
 *
 * Returns `undefined` when the artifact is not accessible; returns
 * `{ sizeBytes: 0, count: 0 }` for an empty artifact.
 */
export async function aggregateSourceFiles(
	api: ResourceAPI,
): Promise<{ sizeBytes: number; count: number } | undefined> {
	const files = await api.listFiles().catch(() => undefined)
	if (files === undefined) return undefined

	let sizeBytes = 0
	for (const filename of files) {
		try {
			const stat = await api.statFile(filename)
			if (stat !== undefined) sizeBytes += stat.sizeBytes
		} catch {
			// File unreadable — skip in size aggregation
		}
	}

	return { sizeBytes, count: files.length }
}
