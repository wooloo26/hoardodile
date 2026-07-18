import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { pluginManifest as pluginManifestSchema } from "@hoardodile/schemas"
import { invalid } from "@hoardodile/shared"

export type PluginUploads = {
	readonly installFromZip: (archive: NodeJS.ReadableStream) => Promise<string>
}

export type PluginUploadsDeps = {
	readonly pluginsDir: string
	/**
	 * Zip extraction, injected by the assembly site so this module does
	 * not depend on the res domain's archive utilities.
	 */
	readonly extractZip: (
		source: NodeJS.ReadableStream,
		destDir: string,
		maxExtractedBytes: number,
	) => Promise<void>
	/**
	 * Cumulative uncompressed byte budget for one plugin zip. Defends
	 * against zip bombs; sized via `PLUGIN_UPLOAD_MAX_BYTES`.
	 */
	readonly maxExtractedBytes: number
}

export function buildPluginUploads(deps: PluginUploadsDeps): PluginUploads {
	const { pluginsDir, extractZip, maxExtractedBytes } = deps

	async function installFromZip(
		archive: NodeJS.ReadableStream,
	): Promise<string> {
		const stagingId = randomUUID()
		const stagingDir = join(pluginsDir, `.staging-${stagingId}`)

		try {
			await mkdir(stagingDir, { recursive: true })

			await extractZip(archive, stagingDir, maxExtractedBytes)

			const manifestPath = join(stagingDir, "manifest.json")
			if (!existsSync(manifestPath)) {
				throw invalid(
					"plugin.upload_no_manifest",
					"plugin zip must contain a manifest.json at its root",
					{},
				)
			}

			let raw: string
			try {
				raw = readFileSync(manifestPath, "utf-8")
			} catch {
				throw invalid(
					"plugin.upload_manifest_unreadable",
					"cannot read manifest.json",
					{},
				)
			}

			let parsed: unknown
			try {
				parsed = JSON.parse(raw)
			} catch {
				throw invalid(
					"plugin.upload_manifest_invalid_json",
					"manifest.json is not valid JSON",
					{},
				)
			}

			const result = pluginManifestSchema.safeParse(parsed)
			if (!result.success) {
				throw invalid(
					"plugin.upload_manifest_invalid",
					"manifest.json failed validation",
					{ issues: result.error.issues },
				)
			}

			const { id } = result.data
			const destDir = join(pluginsDir, id)

			if (existsSync(destDir)) {
				await rm(destDir, { recursive: true, force: true })
			}

			await rename(stagingDir, destDir)
			return id
		} catch (err) {
			await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
			throw err
		}
	}

	return { installFromZip }
}
