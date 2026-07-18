import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	PLUGIN_HOOK_HARD_TIMEOUT_MS,
	PLUGIN_WATCHDOG_TIMEOUT_MS,
	PLUGIN_WORKER_MAX_OLD_SPACE_MB,
} from "@hoardodile/consts/plugin"
import { z } from "zod"

/**
 * Fallback storage root for local development and tests. In production the
 * operator always supplies an explicit
 * `STORAGE_ROOT`; the default here exists so `loadEnv({})` stays ergonomic
 * for unit tests that do not exercise binary storage. Tests that DO
 * exercise storage always pass their own per-test tmpdir.
 */
const DEFAULT_STORAGE_ROOT = resolve(tmpdir(), "app-dev")

/**
 * Resolve the @hoardodile/server package root from this module's URL. Works both
 * when running vite-node against src/ and when the server is bundled to dist/.
 */
function resolveServerPackageRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	let current = here
	while (true) {
		try {
			const pkg = JSON.parse(
				readFileSync(join(current, "package.json"), "utf-8"),
			) as { name?: string }
			if (pkg.name === "@hoardodile/server") return current
		} catch {
			// not found here, keep walking
		}
		const parent = dirname(current)
		if (parent === current) {
			throw new Error(
				"Could not locate @hoardodile/server package root from env.ts",
			)
		}
		current = parent
	}
}

/**
 * Resolve the monorepo workspace root from the server package root. All
 * relative paths in environment variables are interpreted against this root.
 */
function resolveWorkspaceRoot(): string {
	const serverRoot = resolveServerPackageRoot()
	let current = serverRoot
	while (true) {
		if (existsSync(join(current, "pnpm-workspace.yaml"))) {
			return current
		}
		const parent = dirname(current)
		if (parent === current) {
			return resolve(serverRoot, "../..")
		}
		current = parent
	}
}

const WORKSPACE_ROOT = resolveWorkspaceRoot()

function makeAbsolute(path: string): string {
	return isAbsolute(path) ? path : resolve(WORKSPACE_ROOT, path)
}

function looksLikeFilePath(value: string): boolean {
	return value.includes("/") || value.includes("\\")
}

const envSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		HOST: z.string().min(1).default("127.0.0.1"),
		PORT: z.coerce.number().int().min(1).max(65535).default(3000),
		/**
		 * Optional restore snapshot name. Consumed by the setup script before
		 * the server starts listening.
		 */
		RESTORE_FROM: z.string().min(1).optional(),
		/**
		 * Override the directory of pre-built web assets to serve at `/`.
		 */
		APP_WEB_ROOT: z.string().min(1).optional(),
		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
			.default("info"),
		/**
		 * Optional override; only used by tests that need an in-memory DB
		 * (`:memory:`). In real deployments the DB path is derived at
		 * runtime from `STORAGE_ROOT` as `<STORAGE_ROOT>/app.sqlite`.
		 * The live runtime DB lives in the storage root (not inside
		 * `versions/`) so syncing `versions/` to other devices cannot corrupt
		 * the in-use database.
		 */
		DATABASE_URL: z.string().min(1).optional(),
		STORAGE_ROOT: z.string().min(1).default(DEFAULT_STORAGE_ROOT),
		/**
		 * Root directory for shared-folder browsing during folder import.
		 * This is the "Shared Folder" shown in the upload UI; it is unrelated to
		 * the versioned `{storage}/versions/<v>/` archive partitions. The user
		 * navigates subdirectories starting from this path. When omitted,
		 * shared-folder import is disabled and only zip-file import remains
		 * available.
		 */
		SHARED_FOLDER_ROOT: z.string().min(1).optional(),
		SESSION_COOKIE_NAME: z.string().min(1).default("app_session"),
		SESSION_TTL_SECONDS: z.coerce
			.number()
			.int()
			.positive()
			.default(60 * 60 * 24 * 30),
		SESSION_SECURE_COOKIE: z
			.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
			.transform((v) =>
				typeof v === "boolean" ? v : v === "true" || v === "1",
			)
			.default(false),
		/**
		 * When true, the server refuses to issue or refresh session cookies over
		 * plain HTTP and forces the Secure flag. Use when running behind a TLS
		 * terminating reverse proxy to prevent cookie downgrade attacks.
		 */
		FORCE_HTTPS: z
			.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
			.transform((v) =>
				typeof v === "boolean" ? v : v === "true" || v === "1",
			)
			.default(false),
		/**
		 * When true, dev plugin directories (DEV_PLUGIN_PATHS) are ignored.
		 * Recommended for public-facing deployments where arbitrary disk plugins
		 * would widen the attack surface.
		 */
		DISABLE_DEV_PLUGINS: z
			.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
			.transform((v) =>
				typeof v === "boolean" ? v : v === "true" || v === "1",
			)
			.default(false),
		/**
		 * Upper bound on a single resource upload, in bytes. Defaults to 2 GiB
		 * -- large enough for typical video originals, small enough that a
		 * runaway client does not fill the disk before hitting the limit.
		 */
		MAX_UPLOAD_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(16 * 1024 * 1024 * 1024),
		/**
		 * Hard cap on the cumulative bytes written to disk when extracting an
		 * archive upload. Defends against zip bombs whose compressed size
		 * fits inside `MAX_UPLOAD_BYTES` but whose uncompressed payload
		 * would exhaust the disk. Defaults to 8 GiB (4× MAX_UPLOAD_BYTES).
		 */
		MAX_ARCHIVE_EXTRACTED_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(64 * 1024 * 1024 * 1024),
		/**
		 * Upper bound on a plugin upload, in bytes -- applied both to the
		 * compressed zip payload and to the cumulative extracted size. Plugin
		 * packages are a few source files plus assets, so anything near this
		 * bound is almost certainly abuse (e.g. a zip bomb). Defaults to
		 * 256 MiB.
		 */
		PLUGIN_UPLOAD_MAX_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(256 * 1024 * 1024),
		/**
		 * Optional overrides for the `ffmpeg` / `ffprobe` binaries.
		 * In dev `ffmpeg-static` (devDep) or PATH resolve them instead, so
		 * neither CI nor a fresh clone needs extra setup.
		 */
		FFMPEG_PATH: z.string().min(1).optional(),
		FFPROBE_PATH: z.string().min(1).optional(),
		/**
		 * Path to the directory containing the builtin content plugin
		 * (manifest.json + main.js + render.js). Defaults to the built-in
		 * fallback plugin under `packages/plugin-file/dist`.
		 */
		BUILTIN_PATH: z.string().min(1).default("packages/plugin-file/dist"),
		/**
		 * Comma-separated paths to dev content plugin directories.
		 * Loaded directly from disk without copying to local/plugins/.
		 */
		DEV_PLUGIN_PATHS: z
			.preprocess(
				(val) =>
					typeof val === "string" && val.length > 0
						? val
								.split(",")
								.map((s) => s.trim())
								.filter((s) => s.length > 0)
						: [],
				z.array(z.string()),
			)
			.default([]),
		/**
		 * Plugin sandbox watchdog: kill a plugin worker when an invocation
		 * neither returns nor shows resource-API activity for this long.
		 * Hooks that keep calling the API (e.g. probing thousands of files)
		 * reset the watchdog continuously and never trip it.
		 */
		PLUGIN_WATCHDOG_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(PLUGIN_WATCHDOG_TIMEOUT_MS),
		/**
		 * Absolute cap for a single plugin hook invocation, regardless of
		 * activity. Backstop for "slow but not hung" pathological hooks.
		 */
		PLUGIN_HOOK_HARD_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(PLUGIN_HOOK_HARD_TIMEOUT_MS),
		/**
		 * V8 old-generation memory cap per plugin worker, in MiB. Exceeding
		 * it aborts the worker; the plugin respawns lazily on the next call.
		 */
		PLUGIN_WORKER_MAX_OLD_SPACE_MB: z.coerce
			.number()
			.int()
			.positive()
			.default(PLUGIN_WORKER_MAX_OLD_SPACE_MB),
	})
	.transform((data) => {
		const storageRoot = makeAbsolute(data.STORAGE_ROOT)
		return {
			...data,
			STORAGE_ROOT: storageRoot,
			DATABASE_URL:
				data.DATABASE_URL === ":memory:"
					? data.DATABASE_URL
					: makeAbsolute(data.DATABASE_URL ?? join(storageRoot, "app.sqlite")),
			SHARED_FOLDER_ROOT:
				data.SHARED_FOLDER_ROOT !== undefined
					? makeAbsolute(data.SHARED_FOLDER_ROOT)
					: data.SHARED_FOLDER_ROOT,
			APP_WEB_ROOT:
				data.APP_WEB_ROOT !== undefined
					? makeAbsolute(data.APP_WEB_ROOT)
					: data.APP_WEB_ROOT,
			BUILTIN_PATH: makeAbsolute(data.BUILTIN_PATH),
			DEV_PLUGIN_PATHS: data.DEV_PLUGIN_PATHS.map(makeAbsolute),
			FFMPEG_PATH:
				data.FFMPEG_PATH !== undefined && looksLikeFilePath(data.FFMPEG_PATH)
					? makeAbsolute(data.FFMPEG_PATH)
					: data.FFMPEG_PATH,
			FFPROBE_PATH:
				data.FFPROBE_PATH !== undefined && looksLikeFilePath(data.FFPROBE_PATH)
					? makeAbsolute(data.FFPROBE_PATH)
					: data.FFPROBE_PATH,
		}
	})

export type Env = z.infer<typeof envSchema>

/**
 * Parse a process-env-like record into a validated {@link Env}.
 *
 * All relative file/directory paths are resolved against the monorepo
 * workspace root so behaviour does not depend on the process cwd.
 *
 * @throws `Error` (aggregated message) when one or more fields fail validation.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
	const parsed = envSchema.safeParse(source)
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
			.join("\n")
		throw new Error(`Invalid environment:\n${issues}`)
	}
	return parsed.data
}
