import { randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { readdir, rm, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import { Readable } from "node:stream"
import type { PluginManifestId } from "@hoardodile/schemas"
import { createImportResourceAPI } from "src/domain/plugin/api.ts"
import type { PluginHooks } from "src/domain/plugin/hooks.ts"
import { packDirToStoredZip } from "./archive.ts"
import type { ResService } from "./service.ts"
import type { ResUploads } from "./upload.ts"

/**
 * Inputs for {@link importLocal}. Every path is absolute. The function
 * scans `sourceDir` non-recursively: each immediate subfolder becomes
 * one resource composed of its (sorted) immediate file children, and
 * each immediate loose file becomes a resource with one source entry.
 *
 * When `contentPluginId` is set, every item uses that plugin. When omitted,
 * each item's plugin is inferred via the plugin registry's detectors in
 * priority order (most specific first).
 *
 * For the builtin plugin (fixed or inferred), files inside a folder-resource
 * are renamed to `1.<ext>, 2.<ext>, ..., n.<ext>` in OS sort order (matches
 * the upload route's behaviour). For every other plugin the original
 * filenames are preserved on disk.
 */
export type ImportLocalOptions = {
	readonly sourceDir: string
	readonly contentPluginId?: PluginManifestId
	readonly onProgress?: (event: ImportLocalProgressEvent) => void
}

export type ImportLocalProgressEvent =
	| { readonly kind: "start"; readonly total: number }
	| {
			readonly kind: "item-start"
			readonly index: number
			readonly total: number
			readonly name: string
			readonly contentPluginId?: PluginManifestId
	  }
	| {
			readonly kind: "item-done"
			readonly index: number
			readonly total: number
			readonly name: string
			readonly resourceId: string
			readonly contentPluginId?: PluginManifestId
	  }
	| {
			readonly kind: "item-error"
			readonly index: number
			readonly total: number
			readonly name: string
			readonly message: string
			readonly contentPluginId?: PluginManifestId
	  }
	| { readonly kind: "done" }

export type ImportLocalReport = {
	readonly scanned: number
	readonly imported: number
	readonly failed: number
	readonly warnings: readonly string[]
	readonly resourceIds: readonly string[]
}

export type LocalImportDeps = {
	readonly service: ResService
	readonly uploads: ResUploads
	readonly pluginHooks: PluginHooks
}

type PendingItem = {
	readonly name: string
	readonly absPath: string
	readonly kind: "file" | "dir"
}

type ScannedImportEntry = {
	readonly item: PendingItem
	readonly contentPluginId: PluginManifestId
}

/**
 * Bulk-import a folder of local resources. Each entry under `sourceDir`
 * (immediate subfolder or immediate file) is committed as one resource.
 * Failures are isolated per resource: a single bad item will not abort the
 * whole batch.
 */
export async function importLocal(
	deps: LocalImportDeps,
	opts: ImportLocalOptions,
): Promise<ImportLocalReport> {
	const entries = await scanImportDirectory(
		opts.sourceDir,
		opts.contentPluginId,
		deps.pluginHooks,
	)

	const warnings: string[] = []
	const resourceIds: string[] = []
	let imported = 0
	let failed = 0

	opts.onProgress?.({ kind: "start", total: entries.length })
	try {
		for (let i = 0; i < entries.length; i += 1) {
			const row = entries[i]
			if (row === undefined) continue
			const { item, contentPluginId } = row
			opts.onProgress?.({
				kind: "item-start",
				index: i,
				total: entries.length,
				name: item.name,
				contentPluginId,
			})
			try {
				const id = await importOneItem(
					item,
					contentPluginId,
					deps.uploads,
					deps.service,
				)
				resourceIds.push(id)
				imported += 1
				opts.onProgress?.({
					kind: "item-done",
					index: i,
					total: entries.length,
					name: item.name,
					resourceId: id,
					contentPluginId,
				})
			} catch (err) {
				failed += 1
				const message = err instanceof Error ? err.message : String(err)
				warnings.push(`${item.name}: ${message}`)
				opts.onProgress?.({
					kind: "item-error",
					index: i,
					total: entries.length,
					name: item.name,
					message,
					contentPluginId,
				})
			}
		}
	} finally {
		opts.onProgress?.({ kind: "done" })
	}
	return {
		scanned: entries.length,
		imported,
		failed,
		warnings,
		resourceIds,
	}
}

export async function scanImportDirectory(
	sourceDir: string,
	contentPluginId: PluginManifestId | undefined,
	pluginHooks: PluginHooks,
): Promise<readonly ScannedImportEntry[]> {
	const items = await listShallowImportItems(sourceDir)
	if (contentPluginId !== undefined) {
		return items.map((item) => ({ item, contentPluginId }))
	}
	const builtinId = pluginHooks.defaultPluginId()
	const out: ScannedImportEntry[] = []
	for (const item of items) {
		if (item.kind === "file") {
			out.push({ item, contentPluginId: builtinId })
			continue
		}
		const matched = await pluginHooks.detectForImportDir(
			createImportResourceAPI(item.absPath),
		)
		out.push({ item, contentPluginId: matched })
	}
	return out
}

async function listShallowImportItems(
	dir: string,
): Promise<readonly PendingItem[]> {
	const entries = await readdir(dir, { withFileTypes: true })
	const out: PendingItem[] = []
	for (const e of entries) {
		if (e.name.startsWith(".")) continue
		const abs = join(dir, e.name)
		if (e.isDirectory()) out.push({ name: e.name, absPath: abs, kind: "dir" })
		else if (e.isFile())
			out.push({
				name: stripExt(e.name),
				absPath: abs,
				kind: "file",
			})
	}
	return out.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, {
			sensitivity: "base",
			numeric: true,
		}),
	)
}

async function importOneItem(
	item: PendingItem,
	contentPluginId: PluginManifestId,
	uploads: ResUploads,
	svc: ResService,
): Promise<string> {
	const source = await stageItem(item, uploads)
	const created = await svc.create({
		name: item.name,
		contentPluginId,
		...source,
	})
	return created.id
}

/**
 * Stage a single import item into the global pool. Returns the
 * `resource.create` source descriptor — either an ordered `files` list
 * (for a loose file) or an `archiveFileId` (for a folder packed into a
 * STORED zip).
 */
async function stageItem(
	item: PendingItem,
	uploads: ResUploads,
): Promise<
	{ readonly files: readonly string[] } | { readonly archiveFileId: string }
> {
	if (item.kind === "file") {
		const { fileId } = await uploads.stageSingleFile(
			basename(item.absPath),
			Readable.from(await readToBuffer(item.absPath)),
		)
		return { files: [fileId] }
	}
	// Folder upload: pack the directory into a STORED zip and stage it as
	// an archive. Commit then transcodes (or fast-paths) to the canonical
	// `source.hoard`. Subdir structure is preserved verbatim so nested-layout
	// plugins keep their relative paths.
	const allFiles = await walkDir(item.absPath)
	if (allFiles.length === 0) {
		throw new Error("folder contains no files")
	}
	const tmpZipPath = join(dirname(item.absPath), `import-${randomUUID()}.zip`)
	try {
		await packDirToStoredZip(item.absPath, tmpZipPath)
		const { fileId } = await uploads.stageArchive(createReadStream(tmpZipPath))
		return { archiveFileId: fileId }
	} finally {
		await rm(tmpZipPath, { force: true }).catch(() => {})
	}
}

/** Recursively walk `dir`, yielding files with their relative paths. */
type WalkedFile = { readonly rel: string; readonly abs: string }

async function walkDir(
	dir: string,
	prefix = "",
): Promise<readonly WalkedFile[]> {
	const entries = await readdir(dir, { withFileTypes: true })
	const results: WalkedFile[] = []
	for (const e of entries) {
		if (e.name.startsWith(".")) continue
		const abs = join(dir, e.name)
		const rel = prefix.length > 0 ? join(prefix, e.name) : e.name
		if (e.isDirectory()) {
			const nested = await walkDir(abs, rel)
			results.push(...nested)
		} else if (e.isFile()) {
			results.push({ rel, abs })
		}
	}
	return results.sort((a, b) =>
		a.rel.localeCompare(b.rel, undefined, {
			sensitivity: "base",
			numeric: true,
		}),
	)
}

async function readToBuffer(path: string): Promise<Buffer> {
	const { readFile } = await import("node:fs/promises")
	return readFile(path)
}

function stripExt(name: string): string {
	const ext = extname(name)
	return ext.length > 0 ? name.slice(0, -ext.length) : name
}

/**
 * Stat a path and return whether it is an existing directory. Used by
 * the CLI to validate the user's input before starting the import.
 */
export async function isExistingDir(path: string): Promise<boolean> {
	const info = await stat(path).catch(() => undefined)
	return info?.isDirectory() ?? false
}
