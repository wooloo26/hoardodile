import { Worker } from "node:worker_threads"
import {
	PLUGIN_HOOK_HARD_TIMEOUT_MS,
	PLUGIN_WATCHDOG_TIMEOUT_MS,
	PLUGIN_WORKER_MAX_OLD_SPACE_MB,
	PLUGIN_WORKER_MAX_RESPAWNS,
	PLUGIN_WORKER_RESPAWN_WINDOW_MS,
} from "@hoardodile/consts/plugin"
import type {
	PluginDefinition,
	ResourceAPI,
} from "@hoardodile/plugin-sdk-server"
import {
	API_METHOD_NAMES,
	type ApiMethodName,
	deserializeError,
	type HookName,
	type InvokeRequest,
	LOG_METHOD_NAMES,
	type SerializedError,
	serializeError,
	transferListOf,
	type WorkerMessage,
} from "./protocol.ts"
import { createSandboxedPlugin } from "./sandboxed-plugin.ts"

export type PluginSandboxConfig = {
	/**
	 * Kill the worker when an invocation neither returns nor shows API
	 * activity for this long. Long-running hooks that keep calling the
	 * resource API reset the watchdog continuously and never trip it;
	 * time spent inside a host-side API call does not count as inactivity.
	 */
	readonly watchdogMs: number
	/** Absolute per-invocation cap, regardless of activity. */
	readonly hardTimeoutMs: number
	/** V8 old-generation cap per worker; exceeding it aborts the worker. */
	readonly maxOldSpaceMb: number
	/**
	 * Max worker spawns per plugin within {@link respawnWindowMs} before the
	 * plugin is degraded (all invocations reject) until the next rescan or
	 * disable/enable cycle.
	 */
	readonly maxRespawns: number
	readonly respawnWindowMs: number
}

export const DEFAULT_SANDBOX_CONFIG: PluginSandboxConfig = {
	watchdogMs: PLUGIN_WATCHDOG_TIMEOUT_MS,
	hardTimeoutMs: PLUGIN_HOOK_HARD_TIMEOUT_MS,
	maxOldSpaceMb: PLUGIN_WORKER_MAX_OLD_SPACE_MB,
	maxRespawns: PLUGIN_WORKER_MAX_RESPAWNS,
	respawnWindowMs: PLUGIN_WORKER_RESPAWN_WINDOW_MS,
}

export type PluginSandbox = {
	/**
	 * Register and load a plugin bundle. With `eager` the worker stays
	 * alive; without it the hook list is probed and the worker immediately
	 * idles (it respawns lazily on first invocation — disabled plugins
	 * still serve their bound resources without holding a worker).
	 *
	 * Returns `undefined` when the bundle cannot be loaded (already
	 * logged) — callers fall back to a failing plugin.
	 */
	readonly loadPlugin: (opts: {
		readonly id: string
		readonly mainPath: string
		readonly eager: boolean
	}) => Promise<PluginDefinition | undefined>
	/**
	 * Terminate the plugin's worker (if any) and reset its respawn budget.
	 * The hook list stays known; the next invocation lazily respawns.
	 */
	readonly unloadPlugin: (id: string) => void
	/** Terminate every worker and forget all plugins. Pending invocations reject. */
	readonly disposeAll: () => Promise<void>
}

type PendingCall = {
	readonly api: ResourceAPI
	readonly resolve: (value: unknown) => void
	readonly reject: (err: Error) => void
	/**
	 * Host-side API dispatches currently running for this call. While any
	 * are in flight the watchdog is paused — the plugin is blocked on the
	 * host, not hung.
	 */
	apiInFlight: number
	watchdog?: NodeJS.Timeout
	hardTimer?: NodeJS.Timeout
}

type LoadWaiter = {
	readonly resolve: () => void
	readonly reject: (err: Error) => void
}

type PluginState = {
	readonly id: string
	readonly mainPath: string
	worker: Worker | undefined
	hooks: readonly HookName[] | undefined
	loading: Promise<void> | undefined
	loadWaiter: LoadWaiter | undefined
	readonly pending: Map<number, PendingCall>
	respawnTimes: number[]
	degraded: boolean
	disposed: boolean
}

export function createPluginSandbox(
	config: PluginSandboxConfig = DEFAULT_SANDBOX_CONFIG,
): PluginSandbox {
	const states = new Map<string, PluginState>()
	let nextCallId = 1

	async function loadPlugin(opts: {
		id: string
		mainPath: string
		eager: boolean
	}): Promise<PluginDefinition | undefined> {
		const existing = states.get(opts.id)
		if (existing !== undefined) {
			existing.disposed = true
			await teardownWorker(existing)
		}
		const state: PluginState = {
			id: opts.id,
			mainPath: opts.mainPath,
			worker: undefined,
			hooks: undefined,
			loading: undefined,
			loadWaiter: undefined,
			pending: new Map(),
			respawnTimes: [],
			degraded: false,
			disposed: false,
		}
		states.set(opts.id, state)
		try {
			await ensureLoaded(state)
		} catch (err) {
			console.error(`[plugin-sandbox] ${opts.id}: failed to load main.js`, err)
			// A concurrent loadPlugin for the same id may have replaced this
			// state — only remove the map entry when it is still ours.
			state.disposed = true
			if (states.get(opts.id) === state) states.delete(opts.id)
			return undefined
		}
		if (!opts.eager) {
			void teardownWorker(state)
		}
		return createSandboxedPlugin(state.hooks ?? ["detect"], (hook, api) =>
			invoke(state, hook, api),
		)
	}

	function unloadPlugin(id: string): void {
		const state = states.get(id)
		if (state === undefined) return
		teardownWorker(state)
		state.respawnTimes = []
		state.degraded = false
	}

	async function disposeAll(): Promise<void> {
		const tasks: Promise<void>[] = []
		for (const state of states.values()) {
			state.disposed = true
			tasks.push(teardownWorker(state))
		}
		states.clear()
		await Promise.all(tasks)
	}

	// -- worker lifecycle --

	function ensureLoaded(state: PluginState): Promise<void> {
		if (state.worker !== undefined) return Promise.resolve()
		state.loading ??= spawnAndLoad(state).finally(() => {
			state.loading = undefined
		})
		return state.loading
	}

	async function spawnAndLoad(state: PluginState): Promise<void> {
		const now = Date.now()
		state.respawnTimes = state.respawnTimes.filter(
			(t) => now - t < config.respawnWindowMs,
		)
		if (state.respawnTimes.length >= config.maxRespawns) {
			state.degraded = true
			throw new Error(
				`plugin ${state.id} unavailable: worker respawned ${config.maxRespawns} times within ${config.respawnWindowMs}ms`,
			)
		}
		state.respawnTimes.push(now)

		const worker = new Worker(new URL("./worker-entry.mjs", import.meta.url), {
			resourceLimits: { maxOldGenerationSizeMb: config.maxOldSpaceMb },
		})
		// The sandbox must never hold the process open on its own.
		worker.unref()
		state.worker = worker

		worker.on("message", (msg: WorkerMessage) =>
			handleMessage(state, worker, msg),
		)
		worker.on("messageerror", (err: unknown) =>
			failWorker(state, worker, asError(err)),
		)
		worker.on("error", (err: unknown) =>
			failWorker(state, worker, asError(err)),
		)
		worker.on("exit", (code) => {
			if (state.worker === worker) {
				failWorker(
					state,
					worker,
					new Error(`plugin ${state.id} worker exited (code ${code})`),
				)
			}
		})

		const loaded = new Promise<void>((resolve, reject) => {
			state.loadWaiter = { resolve, reject }
		})
		worker.postMessage({ type: "load", mainPath: state.mainPath })
		try {
			await loaded
		} catch (err) {
			// A plugin whose main.js throws at import reports `loaded: ok:false`
			// and keeps idling — terminate the worker so it never outlives
			// its owning state (failWorker already covered error/exit).
			await teardownWorker(state)
			throw err
		} finally {
			state.loadWaiter = undefined
		}
	}

	/** Terminate the worker without touching the respawn budget. */
	function teardownWorker(state: PluginState): Promise<void> {
		const worker = state.worker
		state.worker = undefined
		state.loading = undefined
		state.loadWaiter?.reject(new Error(`plugin ${state.id} worker stopped`))
		state.loadWaiter = undefined
		rejectAllPending(state, new Error(`plugin ${state.id} worker stopped`))
		if (worker === undefined) return Promise.resolve()
		return worker.terminate().then(
			() => {},
			() => {},
		)
	}

	function failWorker(state: PluginState, worker: Worker, err: Error): void {
		if (state.worker !== worker) return // stale event from a replaced worker
		state.worker = undefined
		state.loadWaiter?.reject(err)
		state.loadWaiter = undefined
		rejectAllPending(state, err)
		void worker.terminate().then(
			() => {},
			() => {},
		)
	}

	function rejectAllPending(state: PluginState, err: Error): void {
		for (const call of state.pending.values()) {
			clearCallTimers(call)
			call.reject(err)
		}
		state.pending.clear()
	}

	// -- invocation --

	async function invoke(
		state: PluginState,
		hook: HookName,
		api: ResourceAPI,
	): Promise<unknown> {
		if (state.disposed) {
			throw new Error(`plugin ${state.id} sandbox disposed`)
		}
		if (state.degraded) {
			throw new Error(
				`plugin ${state.id} unavailable: worker crashed repeatedly`,
			)
		}
		await ensureLoaded(state)
		const worker = state.worker
		if (worker === undefined) {
			throw new Error(`plugin ${state.id} worker unavailable`)
		}

		const callId = nextCallId++
		return new Promise((resolve, reject) => {
			const call: PendingCall = { api, resolve, reject, apiInFlight: 0 }
			state.pending.set(callId, call)
			armWatchdog(state, worker, callId, call)
			call.hardTimer = setTimeout(() => {
				failWorker(
					state,
					worker,
					new Error(
						`plugin ${state.id} exceeded hard timeout ${config.hardTimeoutMs}ms (call ${callId})`,
					),
				)
			}, config.hardTimeoutMs)
			call.hardTimer.unref()
			try {
				worker.postMessage({
					type: "invoke",
					callId,
					hook,
				} satisfies InvokeRequest)
			} catch (err) {
				state.pending.delete(callId)
				clearCallTimers(call)
				reject(err instanceof Error ? err : new Error(String(err)))
			}
		})
	}

	function armWatchdog(
		state: PluginState,
		worker: Worker,
		callId: number,
		call: PendingCall,
	): void {
		if (call.watchdog !== undefined) clearTimeout(call.watchdog)
		call.watchdog = setTimeout(() => {
			failWorker(
				state,
				worker,
				new Error(
					`plugin ${state.id} hung: no activity for ${config.watchdogMs}ms (call ${callId})`,
				),
			)
		}, config.watchdogMs)
		call.watchdog.unref()
	}

	function clearCallTimers(call: PendingCall): void {
		if (call.watchdog !== undefined) clearTimeout(call.watchdog)
		if (call.hardTimer !== undefined) clearTimeout(call.hardTimer)
	}

	// -- message handling --

	function handleMessage(
		state: PluginState,
		worker: Worker,
		msg: WorkerMessage,
	): void {
		// Stale worker from a replaced spawn: its messages must never
		// resolve the current worker's load waiter or pending calls.
		if (state.worker !== worker) return
		if (msg === null || typeof msg !== "object") return
		switch (msg.type) {
			case "loaded": {
				const waiter = state.loadWaiter
				state.loadWaiter = undefined
				if (msg.ok) {
					state.hooks = msg.hooks ?? ["detect"]
					waiter?.resolve()
				} else {
					waiter?.reject(
						deserializeError(
							msg.error ?? { name: "Error", message: "plugin load failed" },
						),
					)
				}
				return
			}
			case "result": {
				const call = state.pending.get(msg.callId)
				if (call === undefined) return
				state.pending.delete(msg.callId)
				clearCallTimers(call)
				if (msg.ok) {
					call.resolve(msg.value)
				} else {
					call.reject(
						deserializeError(
							msg.error ?? { name: "Error", message: "hook failed" },
						),
					)
				}
				return
			}
			case "api": {
				const call = state.pending.get(msg.callId)
				if (call === undefined) return
				// Pause the watchdog while the host executes the API call —
				// a slow readFile/probeVideo is host work, not a hung plugin.
				call.apiInFlight += 1
				if (call.watchdog !== undefined) {
					clearTimeout(call.watchdog)
					call.watchdog = undefined
				}
				void dispatchApi(
					worker,
					state,
					msg.callId,
					msg.apiCallId,
					call,
					msg.method,
					msg.args,
				)
				return
			}
			case "log": {
				const call = state.pending.get(msg.callId)
				if (call === undefined) return
				if (call.apiInFlight === 0) armWatchdog(state, worker, msg.callId, call)
				dispatchLog(state.id, msg.method, msg.args)
				return
			}
		}
	}

	async function dispatchApi(
		worker: Worker,
		state: PluginState,
		callId: number,
		apiCallId: number,
		call: PendingCall,
		method: ApiMethodName,
		args: readonly unknown[],
	): Promise<void> {
		const respond = (
			ok: boolean,
			value?: unknown,
			error?: SerializedError,
		): void => {
			// The worker may have died while the API call was in flight.
			if (state.worker !== worker) return
			worker.postMessage(
				{ type: "apiResult", apiCallId, ok, value, error },
				ok ? transferListOf(value) : [],
			)
		}
		try {
			if (!isApiMethod(method) || LOG_METHOD_NAMES.has(method)) {
				respond(false, undefined, {
					name: "Error",
					message: `unknown API method: ${String(method)}`,
				})
				return
			}
			// RPC boundary: the worker-side proxy is generated from the same
			// method list, so args always arrive in contract order.
			const fn = call.api[method] as (...a: readonly unknown[]) => unknown
			respond(true, await fn(...args))
		} catch (err) {
			respond(false, undefined, serializeError(err))
		} finally {
			call.apiInFlight -= 1
			// Resume the watchdog once the host-side work for this call
			// has drained and the call is still alive.
			if (call.apiInFlight === 0 && state.pending.get(callId) === call) {
				armWatchdog(state, worker, callId, call)
			}
		}
	}

	/**
	 * Plugin log sink. The worker-side proxy forwards log calls here, where
	 * the owning plugin id is known — ResourceAPI.log* stay no-ops because a
	 * shared API instance (e.g. one detect pass fanning out to every plugin)
	 * cannot attribute a log line to the plugin that emitted it.
	 */
	function dispatchLog(
		pluginId: string,
		method: "logInfo" | "logWarn" | "logError",
		args: readonly unknown[],
	): void {
		const message = typeof args[0] === "string" ? args[0] : String(args[0])
		const data = isPlainRecord(args[1]) ? args[1] : undefined
		const line = `[plugin:${pluginId}] ${message}`
		const extra = data === undefined ? [] : [data]
		try {
			if (method === "logInfo") console.log(line, ...extra)
			else if (method === "logWarn") console.warn(line, ...extra)
			else console.error(line, ...extra)
		} catch {
			// Logging must never break the host.
		}
	}

	return { loadPlugin, unloadPlugin, disposeAll }
}

function isApiMethod(name: unknown): name is ApiMethodName {
	return (
		typeof name === "string" &&
		(API_METHOD_NAMES as readonly string[]).includes(name)
	)
}

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
