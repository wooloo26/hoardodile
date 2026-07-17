import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { pipeline } from "node:stream/promises"
import type { FileStats } from "@hoardodile/schemas"
import { buildResourceRepository } from "src/domain/res/repo.ts"
import type { DbHandles } from "src/infra/db/connection.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import yazl from "yazl"

/**
 * Seed a resource's source artifact on disk as a STORED `source.hoard`
 * and patch `file_stats` in the DB so the read path can locate it. Used
 * by tests that need to populate a resource without going through the
 * full upload pipeline.
 *
 * For N=1 the single file is wrapped in a zip with its original name as
 * the entry name. For N≥2 the input names are written verbatim as zip
 * entry names.
 */
export async function seedResourceArtifact(
	deps: {
		readonly db: DbHandles
		readonly paths: StoragePaths
	},
	id: string,
	files: readonly { readonly name: string; readonly bytes: Buffer }[],
): Promise<void> {
	if (files.length === 0) {
		throw new Error("seedResourceArtifact requires at least one file")
	}
	const archivePath = deps.paths.latest.resSourceArchive(id)
	await mkdir(dirname(archivePath), { recursive: true })

	const zip = new yazl.ZipFile()
	for (const file of files) {
		zip.addBuffer(file.bytes, file.name, { compress: false })
	}
	zip.end()
	await pipeline(zip.outputStream, createWriteStream(archivePath))

	const total = files.reduce((acc, f) => acc + f.bytes.length, 0)
	const fileStats: FileStats = {
		count: files.length,
		sizeBytes: total,
	}

	buildResourceRepository(deps.db.db).patchMeta(
		id,
		{ fileStats: JSON.stringify(fileStats) },
		Date.now(),
	)
}

/**
 * Build a minimal STORED (method=0, no compression) zip in memory.
 * Used by tests that need to exercise the archive-upload path or
 * inspect zip output. Centralised here so the byte layout stays in
 * one place.
 *
 * @param entries array of `[name, payload]` pairs
 */
export async function buildStoredZipBuffer(
	entries: readonly (readonly [string, Buffer])[],
): Promise<Buffer> {
	const zip = new yazl.ZipFile()
	for (const [name, data] of entries) {
		zip.addBuffer(data, name, { compress: false })
	}
	zip.end()
	const chunks: Buffer[] = []
	for await (const chunk of zip.outputStream) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
	}
	return Buffer.concat(chunks)
}
