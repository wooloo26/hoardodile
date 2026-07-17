import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import "src/infra/fastify-augment.ts"
import { createPluginLoader } from "./loader.ts"
import { createPluginService } from "./service.ts"

async function pluginDomainImpl(app: FastifyInstance): Promise<void> {
	const pluginsDir = app.paths.local.plugins()
	const builtinDir = app.env.BUILTIN_PATH
	if (builtinDir === undefined && app.env.NODE_ENV !== "test") {
		throw new Error("Builtin plugin path is required: set BUILTIN_PATH env.")
	}

	const loader = createPluginLoader({
		builtinDir,
		devPluginDirs: app.env.DEV_PLUGIN_PATHS,
		pluginsDir,
		db: app.db,
		disableDevPlugins: app.env.DISABLE_DEV_PLUGINS,
		onTiming: (step, ms) => {
			app.log.info({ step, ms }, "content plugin boot step finished")
		},
	})
	await loader.loadAll()
	app.decorate("pluginLoader", loader)
	app.decorate("pluginService", createPluginService({ db: app.db, loader }))
}

export const pluginDomain = fp(pluginDomainImpl satisfies FastifyPluginAsync, {
	name: "content-plugin-domain",
	dependencies: ["db-plugin", "paths-plugin"],
})
