import "src/infra/fastify-augment.ts"
import { createAdaptiveConcurrency } from "src/infra/adaptive-concurrency.ts"
import { buildServicePlugin } from "src/infra/plugins.ts"
import { createThumbService } from "./service.ts"

export const thumbPlugin = buildServicePlugin({
	name: "thumb-plugin",
	serviceKey: "thumbService",
	createService: (app) => {
		const thumbs = createThumbService({
			paths: app.paths,
			resources: app.resService,
			concurrency: createAdaptiveConcurrency(),
		})
		app.registerUploadWarmCover((id) => {
			void thumbs.getCover(id).catch((err) => {
				app.log.warn({ err, id }, "upload cover warm failed")
			})
		})
		return thumbs
	},
	dependencies: ["paths-plugin", "resource-plugin"],
})
