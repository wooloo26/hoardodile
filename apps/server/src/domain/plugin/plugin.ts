import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import "src/infra/fastify-augment.ts"
import { createPluginLoader } from "./loader.ts"
import { createPluginSandbox, DEFAULT_SANDBOX_CONFIG } from "./sandbox/host.ts"
import { createPluginService } from "./service.ts"

async function pluginDomainImpl(app: FastifyInstance): Promise<void> {
	const pluginsDir = app.paths.local.plugins()
	const builtinDir = app.env.BUILTIN_PATH
	if (builtinDir === undefined && app.env.NODE_ENV !== "test") {
		throw new Error("Builtin plugin path is required: set BUILTIN_PATH env.")
	}

	const sandbox = createPluginSandbox({
		...DEFAULT_SANDBOX_CONFIG,
		watchdogMs: app.env.PLUGIN_WATCHDOG_TIMEOUT_MS,
		hardTimeoutMs: app.env.PLUGIN_HOOK_HARD_TIMEOUT_MS,
		maxOldSpaceMb: app.env.PLUGIN_WORKER_MAX_OLD_SPACE_MB,
	})
	app.addHook("onClose", async () => {
		await sandbox.disposeAll()
	})

	const loader = createPluginLoader({
		builtinDir,
		devPluginDirs: app.env.DEV_PLUGIN_PATHS,
		pluginsDir,
		db: app.db,
		disableDevPlugins: app.env.DISABLE_DEV_PLUGINS,
		sandbox,
		onTiming: (step, ms) => {
			app.log.info({ step, ms }, "content plugin boot step finished")
		},
	})
	await loader.loadAll()
	app.decorate("pluginLoader", loader)
	app.decorate(
		"pluginService",
		createPluginService({ db: app.db, loader, sandbox }),
	)
}

export const pluginDomain = fp(pluginDomainImpl satisfies FastifyPluginAsync, {
	name: "content-plugin-domain",
	dependencies: ["db-plugin", "paths-plugin"],
})
