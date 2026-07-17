import { isAbsolute, resolve, sep } from "node:path"
import {
	currentVersion as diskCurrentVersion,
	readActiveVersion,
} from "./version.ts"

/**
 * Filename of the resource source archive at the resource root.
 * Project-specific extension `.hoard` (matches the app name) so OS
 * archive tools do not auto-associate with it. The file contents are
 * still a STORED zip — only the on-disk name differs.
 */
export const SOURCE_ARCHIVE_NAME = "source.hoard"
/** Reserved extension corresponding to {@link SOURCE_ARCHIVE_NAME}. */
export const SOURCE_ARCHIVE_EXT = ".hoard"
/** Stem shared by the source archive (`source.hoard`). */
export const SOURCE_ARTIFACT_STEM = "source"

/**
 * Windows reserved base names (case-insensitive). These must not appear as
 * the base of any filename we create, regardless of extension, or CreateFile
 * will fail with bizarre errors. The set is strict on Windows and advisory
 * on other platforms.
 *
 * @see https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
 */
const WINDOWS_RESERVED = new Set([
	"CON",
	"PRN",
	"AUX",
	"NUL",
	"COM1",
	"COM2",
	"COM3",
	"COM4",
	"COM5",
	"COM6",
	"COM7",
	"COM8",
	"COM9",
	"LPT1",
	"LPT2",
	"LPT3",
	"LPT4",
	"LPT5",
	"LPT6",
	"LPT7",
	"LPT8",
	"LPT9",
])

const FORBIDDEN_VISIBLE_CHARS = '<>:"|?*'

function hasControlChar(segment: string): boolean {
	for (let i = 0; i < segment.length; i++) {
		if (segment.charCodeAt(i) < 32) return true
	}
	return false
}

function hasForbiddenVisibleChar(segment: string): boolean {
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i]
		if (ch !== undefined && FORBIDDEN_VISIBLE_CHARS.includes(ch)) return true
	}
	return false
}

/**
 * Root-level subdirectory semantics:
 * - `versions/<version>/` is the user's manual-sync scope, partitioned by
 *   archive version. Each version folder holds: `app.sqlite` (the
 *   per-version database snapshot), `db-backups/` (temporary backups,
 *   only kept for the current version), `resources/<id>/`,
 *   `characters/<id>/`. Old versions are FROZEN: no
 *   writes ever land in `versions/<v>` once a `versions/<v+1>` exists.
 * - `local`  holds host-only state: logs, thumbs, trash, tmp,
 *   read-only DB clones for past-version viewing. It never leaves the
 *   host.
 *
 * `paths.active` resolves to the **active** version (which may be the
 * latest version, or a past version when the user is viewing
 * read-only). `paths.latest` always points at the latest version --
 * the only version writers may target. `paths.atVersion(v)` exposes
 * arbitrary cross-version reads (used for character avatar/fullbody
 * fallback once `avatarVersion` / `fullbodyVersion` columns point at a
 * historical archive).
 *
 * Every resolved path on the server MUST come out of this module so the
 * boundary stays enforceable.
 */
export type StoragePaths = {
	readonly root: string
	readonly activeVersion: number
	readonly latestVersion: number
	readonly active: VersionPaths
	readonly latest: VersionPaths
	readonly local: LocalPaths
	/** Per-version archive paths. Use for cross-version fallback reads. */
	atVersion(v: number): VersionPaths
	/**
	 * Path to the live runtime SQLite DB: `<root>/app.sqlite`.
	 * This file is the only writable database during normal operation.
	 * It lives outside `versions/` so that syncing `versions/` to other
	 * devices cannot corrupt the in-use database. Only archived snapshots
	 * (written by {@link createNextVersion}) and backup files belong in
	 * `versions/`.
	 */
	runtimeDb(): string
}

export type VersionPaths = {
	readonly root: string
	readonly version: number
	/** Path to the per-version SQLite DB: `<root>/versions/<v>/app.sqlite`. */
	versionSnapshotDb(): string
	/** Root folder of a resource: `<root>/versions/<v>/resources/<id>`. */
	resource(id: string): string
	/**
	 * Archive form of a resource source:
	 * `<root>/versions/<v>/resources/<id>/source.hoard`. A STORED-encoded
	 * zip (content-wise) holding the resource's source files. The
	 * `.hoard` extension is project-specific so OS archive tools do not
	 * auto-associate with it. Random access is byte-range reads into the
	 * local header payload. Past-version archives are immutable; the
	 * current-version archive is replaced atomically via rename from
	 * {@link LocalPaths.uploadStaging}.
	 */
	resSourceArchive(id: string): string
	character(id: string): string
	dbBackups(): string
	dbBackup(name: string): string
	/**
	 * Hard-delete placeholder marker file:
	 * `<root>/versions/<v>/<kind>/<id>/.deleted`. Empty file declaring that
	 * `id` was hard-deleted in version `v`. Per spec, no other content is
	 * created in such a folder once a placeholder exists.
	 */
	deletedMarker(kind: "resources" | "characters", id: string): string
	/** Root folder of a document: `<root>/versions/<v>/documents/<id>`. */
	document(id: string): string
}

export type LocalPaths = {
	readonly root: string
	logs(): string
	/**
	 * Path to a thumbnail variant file. The on-disk layout is flat:
	 * `<localRoot>/resources/<id>/<variant>.<ext>` for resources and
	 * `<localRoot>/characters/<id>/<variant>.<ext>` for characters. `format`
	 * picks the encoding (`avif` by default; `webp` for animated sources).
	 * Variants live next to (but
	 * never collide with) `.cover_*`, `avatar_*`, etc. because variant
	 * names are restricted to a closed set (`thumb`, `preview`, `avatar`,
	 * `fullbody`).
	 */
	localCover(
		subjectKind: "resource" | "character",
		id: string,
		variant: string,
		format?: "webp" | "avif",
	): string
	/**
	 * Per-file preview-size cache for a resource:
	 * `<localRoot>/resources/<id>/file-preview/<filename>.avif`.
	 * Synthesised on-demand by
	 * {@link import("src/infra/thumb/service.ts").ThumbService.getFilePreview}
	 * so multi-file galleries can serve a downscaled per-file rendition
	 * without the preview/original toggle being limited to single-file
	 * resources. `filename` is the raw source filename - we keep its
	 * extension intact and append `.avif` so two sources sharing a base
	 * (e.g. `01.png` / `01.jpg`) cannot collide.
	 */
	resFilePreview(id: string, filename: string, format?: "webp" | "avif"): string
	/**
	 * Sub-directory of the per-resource local root that holds the per-file
	 * preview-size cache: `<localRoot>/resources/<id>/file-preview`.
	 */
	resFilePreviewDir(id: string): string
	/**
	 * Sidecar JSON file caching the result of
	 * {@link import("src/domain/res/service.ts").ResService.listFiles}.
	 * Lives at `<localRoot>/resources/<id>/files-cache.json`. Because
	 * source artifacts are immutable post-upload (archived), the cache
	 * never goes stale on its own; it is wiped together with the other
	 * derived artifacts whenever `clearDerivedArtifacts` runs.
	 */
	resFilesCache(id: string): string
	/**
	 * Root of the local per-resource directory: `<localRoot>/resources/<id>`.
	 * Holds (a) versioned copies of replaced permanent covers and (b)
	 * thumbnail / preview-size caches (`thumb.webp`, `preview.webp`,
	 * `file-preview/`). Source bytes never live in `local/`; they live
	 * directly under `versions/<v>/resources/<id>/source.hoard`.
	 */
	resource(id: string): string
	/**
	 * Root of the local per-character directory: `<localRoot>/characters/<id>`.
	 * Holds (a) versioned copies of replaced avatar / fullbody images and
	 * (b) thumbnail variants (`avatar.webp`, `fullbody.webp`).
	 */
	character(id: string): string
	trash(): string
	trashItem(id: string): string
	tmp(): string
	tmpFile(name: string): string
	/**
	 * Path to the iron-session seal key file: `<root>/local/.session-key`.
	 * 32-byte base64-encoded secret, auto-generated on first boot. Lives in
	 * `local/` (never synced) so each host has its own seal key.
	 */
	sessionKey(): string
	/**
	 * Content plugin root directory: `<localRoot>/plugins`. Each
	 * subdirectory is a disk-based content plugin with `manifest.json`
	 * and `main.js`.
	 */
	plugins(): string
	/**
	 * Root of the host-only temporary directory tree:
	 * `<localRoot>/.tmp`. Holds the global staging pool
	 * ({@link stagingPoolRoot}) plus short-lived extraction directories
	 * (`extract-*`). The leading dot keeps host-only state out of any
	 * user-facing listing. Cleared on server startup together with
	 * {@link LocalPaths.tmp}.
	 */
	uploadStagingRoot(): string
	/**
	 * Root of the global staging pool: `<localRoot>/.tmp/staging`.
	 * Every file uploaded through the per-file upload endpoint lands
	 * here as `<fileId><ext>` and is addressed by its `fileId` alone —
	 * there is no per-batch grouping. Files are removed individually
	 * on client delete or consumed (and deleted) by commit at resource
	 * creation. Cleared on startup together with
	 * {@link LocalPaths.uploadStagingRoot}.
	 */
	stagingPoolRoot(): string
	/**
	 * Path of a single staged file in the global pool:
	 * `<stagingPoolRoot>/<fileId><ext>`. `ext` is the lower-cased
	 * extension of the original filename (empty for extensionless
	 * uploads).
	 */
	stagingPoolFile(fileId: string, ext: string): string
	/**
	 * Per-video-frame thumbnail cache:
	 * `<localRoot>/resources/<id>/frames/<filename>/<timeMs>.avif`.
	 * Synthesised on-demand by the video hover preview endpoint.
	 */
	resVideoFrame(id: string, filename: string, timeMs: number): string
	/**
	 * Root of persisted zip-entry extractions for a resource version:
	 * `<localRoot>/resources/<id>/extracted/v<fileVersion>/`.
	 */
	resExtractedDir(id: string, fileVersion: number): string
	/**
	 * On-disk path for a materialized zip entry used by probe/ffmpeg paths.
	 */
	resExtractedEntry(id: string, fileVersion: number, entryName: string): string
}

export type CreateStoragePathsOptions = {
	readonly root: string
	/**
	 * Active (viewing) version. When omitted together with latestVersion,
	 * resolves from `local/version-state.json` and the version dirs under
	 * `versions/`. When only latestVersion is pinned explicitly, defaults to
	 * that same value (call sites that override max version only).
	 */
	readonly activeVersion?: number
	/**
	 * Latest (current, writable) version. When omitted, the maximum
	 * version directory under `versions/` is used, or `1` when none exist.
	 */
	readonly latestVersion?: number
}

/**
 * Build a {@link StoragePaths} rooted at `opts.root`. The root must be an
 * absolute path (the sync boundary would not be well-defined otherwise).
 *
 * @throws `Error` when `root` is not absolute.
 */
export function createStoragePaths(
	opts: CreateStoragePathsOptions,
): StoragePaths {
	if (!isAbsolute(opts.root)) {
		throw new Error(`storage root must be an absolute path: ${opts.root}`)
	}
	const root = resolve(opts.root)
	const versionsRootPath = resolve(root, "versions")
	const localRoot = resolve(root, "local")

	const diskMax = diskCurrentVersion(root)
	let latestVersion: number
	if (opts.latestVersion !== undefined) {
		latestVersion = opts.latestVersion
	} else {
		latestVersion = diskMax > 0 ? diskMax : 1
	}

	let activeVersion: number
	if (opts.activeVersion !== undefined) {
		activeVersion = opts.activeVersion
	} else if (opts.latestVersion !== undefined) {
		activeVersion = latestVersion
	} else {
		activeVersion = diskMax > 0 ? readActiveVersion(root) : latestVersion
	}

	function versionAt(version: number): VersionPaths {
		const vSeg = assertSafeSegment(String(version))
		const vRoot = join(versionsRootPath, vSeg)
		return {
			root: vRoot,
			version,
			versionSnapshotDb: () => join(vRoot, "app.sqlite"),
			resource: (id) => join(vRoot, "resources", assertSafeSegment(id)),
			resSourceArchive: (id) =>
				join(vRoot, "resources", assertSafeSegment(id), SOURCE_ARCHIVE_NAME),
			character: (id) => join(vRoot, "characters", assertSafeSegment(id)),
			dbBackups: () => join(vRoot, "db-backups"),
			dbBackup: (name) => join(vRoot, "db-backups", assertSafeSegment(name)),
			deletedMarker: (kind, id) =>
				join(vRoot, kind, assertSafeSegment(id), ".deleted"),
			document: (id) => join(vRoot, "documents", assertSafeSegment(id)),
		}
	}

	const active = versionAt(activeVersion)
	const latest = versionAt(latestVersion)
	const uploadStagingRootPath = join(localRoot, ".tmp")

	const local: LocalPaths = {
		root: localRoot,
		logs: () => join(localRoot, "logs"),
		localCover: (subjectKind, id, variant, format) =>
			join(
				localRoot,
				localCoverSubjectDir(subjectKind),
				assertSafeSegment(id),
				`${assertSafeSegment(variant)}.${format ?? "avif"}`,
			),
		resFilePreview: (id, filename, format) =>
			join(
				localRoot,
				"resources",
				assertSafeSegment(id),
				"file-preview",
				`${assertSafeSegment(toCacheBasename(filename))}.${format ?? "avif"}`,
			),
		resFilePreviewDir: (id) =>
			join(localRoot, "resources", assertSafeSegment(id), "file-preview"),
		resFilesCache: (id) =>
			join(localRoot, "resources", assertSafeSegment(id), "files-cache.json"),
		resource: (id) => join(localRoot, "resources", assertSafeSegment(id)),
		character: (id) => join(localRoot, "characters", assertSafeSegment(id)),
		trash: () => join(localRoot, "trash"),
		trashItem: (id) => join(localRoot, "trash", assertSafeSegment(id)),
		tmp: () => join(localRoot, "tmp"),
		tmpFile: (name) => join(localRoot, "tmp", assertSafeSegment(name)),
		sessionKey: () => join(localRoot, ".session-key"),
		plugins: () => join(localRoot, "plugins"),
		uploadStagingRoot: () => uploadStagingRootPath,
		stagingPoolRoot: () => join(uploadStagingRootPath, "staging"),
		stagingPoolFile: (fileId, ext) =>
			join(
				uploadStagingRootPath,
				"staging",
				`${assertSafeSegment(fileId)}${ext}`,
			),
		resVideoFrame: (id, filename, timeMs) =>
			join(
				localRoot,
				"resources",
				assertSafeSegment(id),
				"frames",
				assertSafeSegment(toCacheBasename(filename)),
				`${timeMs}.avif`,
			),
		resExtractedDir: (id, fileVersion) =>
			join(
				localRoot,
				"resources",
				assertSafeSegment(id),
				"extracted",
				`v${fileVersion}`,
			),
		resExtractedEntry: (id, fileVersion, entryName) =>
			join(
				localRoot,
				"resources",
				assertSafeSegment(id),
				"extracted",
				`v${fileVersion}`,
				assertSafeSegment(toExtractedBasename(entryName)),
			),
	}

	return {
		root,
		activeVersion,
		latestVersion,
		active,
		latest,
		local,
		atVersion: (v) => versionAt(v),
		runtimeDb: () => join(root, "app.sqlite"),
	}
}

/**
 * Map a {@link LocalPaths.thumb} subjectKind onto its on-disk subdirectory.
 * Variants now live flat inside the per-id local directory (no enclosing
 * `thumbs/` parent), so `resource` -> `resources` and `character` ->
 * `characters` (both plural to match the storage layout convention).
 */
function localCoverSubjectDir(subjectKind: "resource" | "character"): string {
	return subjectKind === "resource" ? "resources" : "characters"
}

/**
 * Map a source filename to the basename used by per-file derived caches
 * (file-preview and video-frame). Strips the source extension before
 * {@link LocalPaths.thumb} appends `.webp`, so `1.jpeg` becomes `1__jpeg`
 * (not `1.jpeg.webp`). The source extension is folded into the basename
 * so two sources sharing a stem (e.g. `01.png` / `01.jpg`) cannot collide
 * on the same cache file.
 *
 * The encoding (`__<ext>`) avoids any character that {@link assertSafeSegment}
 * rejects (no dot, no separator, no control char) so the result passes the
 * boundary check unchanged.
 */
function toCacheBasename(filename: string): string {
	const dot = filename.lastIndexOf(".")
	if (dot <= 0) return filename
	const stem = filename.slice(0, dot)
	const ext = filename.slice(dot + 1)
	return `${stem}__${ext}`
}

/** Flatten a zip entry name into a single safe path segment. */
function toExtractedBasename(entryName: string): string {
	return entryName.replace(/[/\\]/g, "__")
}

/**
 * Validate a single path segment. We reject anything that embeds a path
 * separator, a drive letter, a NUL or other control code, a Windows
 * reserved basename, or a trailing dot/space (Windows normalises those away
 * and you get the wrong file).
 *
 * @throws `Error` when `segment` is empty or rejected by any of the rules.
 */
export function assertSafeSegment(segment: string): string {
	if (segment.length === 0) throw new Error("path segment must not be empty")
	if (segment === "." || segment === "..") {
		throw new Error(`path segment must not be '${segment}'`)
	}
	if (segment.includes("/") || segment.includes("\\")) {
		throw new Error(`path segment must not contain separators: ${segment}`)
	}
	if (hasForbiddenVisibleChar(segment) || hasControlChar(segment)) {
		throw new Error(`path segment contains disallowed characters: ${segment}`)
	}
	if (segment.endsWith(".") || segment.endsWith(" ")) {
		throw new Error(
			`path segment must not end with dot or space: ${JSON.stringify(segment)}`,
		)
	}
	const base = segment.split(".")[0]?.toUpperCase()
	if (base !== undefined && WINDOWS_RESERVED.has(base)) {
		throw new Error(`path segment is a reserved name: ${segment}`)
	}
	return segment
}

function join(...segments: readonly string[]): string {
	return resolve(...segments)
}

/**
 * Ensure `candidate` is contained within `ancestor` (after `resolve`). Used
 * as a belt-and-braces check before any disk operation that mixes user
 * input with a base directory.
 */
export function assertInside(ancestor: string, candidate: string): string {
	const resolved = resolve(candidate)
	const base = resolve(ancestor)
	if (resolved !== base && !resolved.startsWith(base + sep)) {
		throw new Error(`path ${resolved} escapes ${base}`)
	}
	return resolved
}
