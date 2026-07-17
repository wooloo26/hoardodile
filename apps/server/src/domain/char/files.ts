import {
	copyFile,
	mkdir,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises"
import { extname, join } from "node:path"
import type { MutableRef } from "src/infra/runtime-context.ts"
import type { StoragePaths } from "src/infra/storage/paths.ts"
import { writeVersioned } from "src/infra/write-versioned.ts"

/**
 * Pure file-system layer for the character module. No database access;
 * no domain logic. The service layer calls these functions alongside
 * repository calls to coordinate disk and DB state.
 *
 * All writes target the **current** (latest) archive version
 * (`paths.latest.character(id)`). Reads accept a `version` argument so
 * callers can resolve avatar/fullbody against the archive recorded on
 * the row (`avatarVersion` / `fullbodyVersion` columns).
 */
export type CharFiles = {
	ensureFolder(id: string): Promise<void>
	/** Remove the current-version character folder. Swallows missing-path errors. */
	removeFolder(id: string): Promise<void>
	/**
	 * When avatar/fullbody bytes live only under frozen past archives (both
	 * versions `< latestVersion`), hard-delete cannot alter those folders;
	 * drop a `.deleted` placeholder in the **current** folder instead.
	 * Otherwise hard-delete moves the live folder to `local/trash/`.
	 */
	markDeleted(id: string): Promise<string>
	/**
	 * Move `paths.latest.character(id)` into `local/trash/` with a unique
	 * directory name. No-op when the source path is missing.
	 */
	moveFolderToTrash(id: string): Promise<string>
	/**
	 * Locate the on-disk avatar / fullbody file in `version`'s folder.
	 * Returns absolute path or `undefined` when missing.
	 */
	findVariantInVersion(
		id: string,
		version: number,
		variant: "avatar" | "fullbody",
	): Promise<string | undefined>
	/**
	 * Atomically install a new avatar/fullbody image under the current
	 * version. Any existing `<variant>.*` files are archived to the local
	 * character directory before the source file is copied into place.
	 *
	 * @param sourcePath Absolute path of the validated source file (usually
	 *   a temp file under `local/tmp`).
	 * @returns Absolute path of the written file.
	 */
	writeVariant(
		id: string,
		variant: "avatar" | "fullbody",
		ext: string,
		sourcePath: string,
	): Promise<string>
	/**
	 * Remove the avatar/fullbody image under the current version by
	 * archiving any existing `<variant>.*` files to the local character
	 * directory. Idempotent; missing files are ignored.
	 */
	deleteVariant(id: string, variant: "avatar" | "fullbody"): Promise<void>
}

export function buildCharacterFiles(
	paths: StoragePaths,
	readOnly: MutableRef<boolean>,
): CharFiles {
	async function ensureFolder(id: string): Promise<void> {
		await writeVersioned(paths, readOnly.current, (current) =>
			mkdir(current.character(id), { recursive: true }),
		)
	}

	async function removeFolder(id: string): Promise<void> {
		await writeVersioned(paths, readOnly.current, (current) =>
			rm(current.character(id), {
				recursive: true,
				force: true,
			}).catch(() => {}),
		)
	}

	async function markDeleted(id: string): Promise<string> {
		return writeVersioned(paths, readOnly.current, async (current) => {
			const folder = current.character(id)
			await mkdir(folder, { recursive: true })
			const marker = current.deletedMarker("characters", id)
			// Empty file: the placeholder's existence is the whole signal.
			await writeFile(marker, "")
			return marker
		})
	}

	async function moveFolderToTrash(id: string): Promise<string> {
		// write-local-only: trash directory is under local/, not versions/.
		await mkdir(paths.local.trash(), { recursive: true })
		return writeVersioned(paths, readOnly.current, async (current) => {
			const src = current.character(id)
			const dest = join(paths.local.trash(), `characters-${id}-${Date.now()}`)
			try {
				await rename(src, dest)
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code
				if (code !== "ENOENT") throw err
			}
			return dest
		})
	}

	async function findVariantInVersion(
		id: string,
		version: number,
		variant: "avatar" | "fullbody",
	): Promise<string | undefined> {
		const folder = paths.atVersion(version).character(id)
		try {
			const entries = await readdir(folder, { withFileTypes: true })
			const match = entries.find(
				(e) => e.isFile() && e.name.startsWith(`${variant}.`),
			)
			return match !== undefined ? join(folder, match.name) : undefined
		} catch {
			return undefined
		}
	}

	async function writeVariant(
		id: string,
		variant: "avatar" | "fullbody",
		ext: string,
		sourcePath: string,
	): Promise<string> {
		return writeVersioned(paths, readOnly.current, async (current) => {
			const root = current.character(id)
			await mkdir(root, { recursive: true })
			await archiveVariantFiles({
				sourceFolder: root,
				destFolder: paths.local.character(id),
				variant,
			})
			const finalFilename = `${variant}${ext}`
			const finalPath = join(root, finalFilename)
			const tmpPath = join(root, `.uploading-${variant}-${Date.now()}${ext}`)
			try {
				await copyFile(sourcePath, tmpPath)
				await rename(tmpPath, finalPath)
			} catch (err) {
				await rm(tmpPath, { force: true }).catch(() => {})
				throw err
			}
			return finalPath
		})
	}

	async function deleteVariant(
		id: string,
		variant: "avatar" | "fullbody",
	): Promise<void> {
		return writeVersioned(paths, readOnly.current, async (current) => {
			const root = current.character(id)
			await archiveVariantFiles({
				sourceFolder: root,
				destFolder: paths.local.character(id),
				variant,
			})
		})
	}

	return {
		ensureFolder,
		removeFolder,
		markDeleted,
		moveFolderToTrash,
		findVariantInVersion,
		writeVariant,
		deleteVariant,
	}
}

/**
 * Move every file in `sourceFolder` whose name starts with `<variant>.`
 * (e.g. `avatar.jpg`) into `destFolder` under a timestamped archive name
 * (e.g. `avatar_<stamp>.jpg`). Moves to the local (non-synced) directory
 * so replaced images are preserved without polluting the versions sync scope.
 * Creates `destFolder` on demand. Silently ignores ENOENT on source files.
 */
async function archiveVariantFiles(args: {
	readonly sourceFolder: string
	readonly destFolder: string
	readonly variant: "avatar" | "fullbody"
}): Promise<void> {
	const { sourceFolder, destFolder, variant } = args
	const entries = await readdir(sourceFolder).catch(() => [])
	const stale = entries.filter((n) => n.startsWith(`${variant}.`))
	if (stale.length === 0) return
	await mkdir(destFolder, { recursive: true })
	const stamp = Date.now()
	await Promise.all(
		stale.map(async (name, i) => {
			const ext = extname(name)
			const archiveName =
				stale.length === 1
					? `${variant}_${stamp}${ext}`
					: `${variant}_${stamp}_${i}${ext}`
			try {
				await rename(join(sourceFolder, name), join(destFolder, archiveName))
			} catch (err) {
				if (!isEnoentError(err)) throw err
			}
		}),
	)
}

/**
 * Truthy when `err` looks like a Node.js ENOENT (file not found) error.
 */
function isEnoentError(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT"
}
