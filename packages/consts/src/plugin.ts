/**
 * Plugin-runtime resource limits. Referenced by the server env schema
 * (defaults), the plugin sandbox host, and the plugin ResourceAPI — keep
 * them here so the three stay in agreement.
 */

/**
 * Upper bound for a single `readFile` call, full or ranged. Anything
 * bigger must go through byte ranges (`readFileChunks`) so neither the
 * host process nor the plugin worker buffers it whole.
 */
export const PLUGIN_READ_FILE_MAX_BYTES = 128 * 1024 * 1024

/**
 * Kill a plugin worker when an invocation neither returns nor shows
 * resource-API activity for this long. Hooks that keep calling the API
 * reset the watchdog continuously and never trip it; time spent inside a
 * host-side API call does not count as inactivity.
 */
export const PLUGIN_WATCHDOG_TIMEOUT_MS = 60_000

/** Absolute cap for a single plugin hook invocation, regardless of activity. */
export const PLUGIN_HOOK_HARD_TIMEOUT_MS = 30 * 60_000

/** V8 old-generation memory cap per plugin worker, in MiB. */
export const PLUGIN_WORKER_MAX_OLD_SPACE_MB = 512

/**
 * Max worker spawns per plugin within {@link PLUGIN_WORKER_RESPAWN_WINDOW_MS}
 * before the plugin is degraded. It recovers automatically once the crash
 * window slides clean, or immediately on disable/rescan.
 */
export const PLUGIN_WORKER_MAX_RESPAWNS = 3

/** Sliding window for {@link PLUGIN_WORKER_MAX_RESPAWNS}. */
export const PLUGIN_WORKER_RESPAWN_WINDOW_MS = 60_000

/**
 * Parallel image probes a plugin hook may fan out across the host.
 * Host-side probes run sharp concurrently; keep them bounded.
 */
export const PLUGIN_IMAGE_PROBE_CONCURRENCY = 8

/**
 * Parallel video probes a plugin hook may fan out. Each spawns an
 * ffprobe process host-side, so videos are bound tighter than images.
 */
export const PLUGIN_VIDEO_PROBE_CONCURRENCY = 4

/** Parallel `statFile` calls a plugin hook may fan out across the host. */
export const PLUGIN_STAT_CONCURRENCY = 8

/**
 * Batch size for animation scans in `searchMeta` hooks: probes run
 * concurrently within a batch, and the early-exit check happens between
 * batches.
 */
export const PLUGIN_ANIMATION_SCAN_BATCH = 8

/** Process-wide bound (entries) for the host-side probe result cache. */
export const PLUGIN_PROBE_CACHE_MAX_ENTRIES = 512
