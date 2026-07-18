import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
	createPluginSandbox,
	DEFAULT_SANDBOX_CONFIG,
	type PluginSandbox,
	type PluginSandboxConfig,
} from "./host.ts"

/**
 * Deterministic lifecycle tests: a scripted fake Worker lets us hit race
 * windows (stale messages, concurrent loads) that real worker threads only
 * reproduce flakily. Only this file sees the mock.
 */
const mocks = vi.hoisted(() => {
	class FakeWorker {
		static instances: FakeWorker[] = []
		private readonly listeners = new Map<
			string,
			((...args: unknown[]) => void)[]
		>()
		readonly posted: unknown[] = []
		terminated = false

		constructor(..._args: unknown[]) {
			FakeWorker.instances.push(this)
		}

		on(event: string, fn: (...args: unknown[]) => void): this {
			const list = this.listeners.get(event) ?? []
			list.push(fn)
			this.listeners.set(event, list)
			return this
		}

		emit(event: string, ...args: unknown[]): void {
			for (const fn of this.listeners.get(event) ?? []) fn(...args)
		}

		postMessage(msg: unknown): void {
			this.posted.push(msg)
		}

		terminate(): Promise<number> {
			this.terminated = true
			return Promise.resolve(0)
		}

		unref(): this {
			return this
		}
	}
	return { FakeWorker }
})

vi.mock("node:worker_threads", () => ({ Worker: mocks.FakeWorker }))

function unitConfig(overrides: Partial<PluginSandboxConfig> = {}) {
	return {
		...DEFAULT_SANDBOX_CONFIG,
		...overrides,
	} satisfies PluginSandboxConfig
}

function lastWorker(): InstanceType<typeof mocks.FakeWorker> {
	const worker = mocks.FakeWorker.instances.at(-1)
	if (worker === undefined) throw new Error("no worker spawned")
	return worker
}

describe("plugin sandbox lifecycle (fake worker)", () => {
	let sandbox: PluginSandbox | undefined

	beforeEach(() => {
		mocks.FakeWorker.instances.length = 0
	})

	afterEach(async () => {
		await sandbox?.disposeAll()
		sandbox = undefined
		vi.restoreAllMocks()
	})

	test("a plugin that fails to load has its worker terminated", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {})
		sandbox = createPluginSandbox(unitConfig())
		const load = sandbox.loadPlugin({
			id: "bad",
			mainPath: "/plugins/bad/main.js",
			eager: true,
		})
		const worker = lastWorker()
		worker.emit("message", {
			type: "loaded",
			ok: false,
			error: { name: "Error", message: "import exploded" },
		})
		await expect(load).resolves.toBeUndefined()
		expect(worker.terminated).toBe(true)
	})
})
