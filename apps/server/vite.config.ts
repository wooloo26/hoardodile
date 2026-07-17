import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs"
import path from "node:path"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

/**
 * Copy the pre-built web UI from `apps/web/dist` into `dist/web/` so the
 * standalone CLI (`node dist/main.js`) automatically serves the SPA at
 * `/` without any extra configuration. When the web build has not been
 * produced yet (e.g. running `pnpm -F @hoardodile/server build` in
 * isolation) the plugin is a no-op rather than failing the server build,
 * since the CLI gracefully falls back to "tRPC/HTTP only" mode.
 */
function copyWebDistPlugin(): Plugin {
	return {
		name: "app-copy-web-dist",
		apply: "build",
		closeBundle() {
			const src = path.resolve(import.meta.dirname, "../web/dist")
			const dst = path.resolve(import.meta.dirname, "dist/web")
			if (!existsSync(src)) {
				console.warn(
					`[app-server] apps/web/dist not found at ${src}; skipping web bundle copy. Build apps/web first to embed the SPA.`,
				)
				return
			}
			copyDirRecursiveSync(src, dst)
		},
	}
}

/**
 * Copy the entire `migrations/` folder (both the `*.sql` files and the
 * Drizzle-Kit-managed `meta/_journal.json` + snapshot files) next to the
 * emitted `dist/index.js` so that `connection.ts`, once bundled, can still
 * resolve them via `new URL("./migrations", import.meta.url)` at runtime.
 */
function copyServerAssetsPlugin(): Plugin {
	return {
		name: "app-copy-server-assets",
		apply: "build",
		closeBundle() {
			const src = path.resolve(import.meta.dirname, "assets")
			const dst = path.resolve(import.meta.dirname, "dist/assets")
			if (!existsSync(src)) {
				console.warn(
					`[app-server] apps/server/assets not found at ${src}; skipping asset copy.`,
				)
				return
			}
			copyDirRecursiveSync(src, dst)
		},
	}
}

/**
 * Copy each plugin's `dist/` into `dist/plugins/{uuid}/` so the server
 * can seed them into the storage root at startup (same pattern as
 * `copyWebDistPlugin` but for the official built-in plugins).
 */
function copyPluginDistPlugin(): Plugin {
	return {
		name: "app-copy-plugin-dist",
		apply: "build",
		closeBundle() {
			const pluginsRoot = path.resolve(import.meta.dirname, "../../plugins")
			const dstRoot = path.resolve(import.meta.dirname, "dist/plugins")
			if (!existsSync(pluginsRoot)) {
				console.warn(
					`[app-server] plugins/ not found at ${pluginsRoot}; skipping plugin copy.`,
				)
				return
			}
			for (const name of readdirSync(pluginsRoot)) {
				const pluginDir = path.join(pluginsRoot, name)
				const pluginDist = path.join(pluginDir, "dist")
				if (!statSync(pluginDir).isDirectory()) continue
				if (!existsSync(pluginDist)) {
					console.warn(
						`[app-server] ${name}/dist not found; skipping. Build plugins first.`,
					)
					continue
				}
				const manifestPath = path.join(pluginDist, "manifest.json")
				if (!existsSync(manifestPath)) continue
				const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
				if (typeof manifest.id !== "string" || manifest.id.length === 0)
					continue
				const dst = path.join(dstRoot, manifest.id)
				copyDirRecursiveSync(pluginDist, dst)
			}
		},
	}
}

function copyMigrationSqlPlugin(): Plugin {
	return {
		name: "app-copy-migration-sql",
		apply: "build",
		closeBundle() {
			const src = path.resolve(import.meta.dirname, "src/infra/db/migrations")
			// The migrations folder must be present alongside every chunk that
			// may contain the migrator callsite, because the resolver uses
			// `new URL("./migrations", import.meta.url)` at runtime. Chunks land
			// in dist/chunks/ per `chunkFileNames` below.
			const dstDirs = [
				path.resolve(import.meta.dirname, "dist/migrations"),
				path.resolve(import.meta.dirname, "dist/chunks/migrations"),
			]
			for (const dst of dstDirs) {
				copyDirRecursiveSync(src, dst)
			}
		},
	}
}

function copyDirRecursiveSync(src: string, dst: string): void {
	mkdirSync(dst, { recursive: true })
	for (const entry of readdirSync(src)) {
		const srcEntry = path.join(src, entry)
		const dstEntry = path.join(dst, entry)
		if (statSync(srcEntry).isDirectory()) {
			copyDirRecursiveSync(srcEntry, dstEntry)
		} else {
			copyFileSync(srcEntry, dstEntry)
		}
	}
}

export default defineConfig({
	resolve: {
		alias: {
			src: path.resolve(import.meta.dirname, "src"),
		},
	},
	test: {
		// bootstrap() + buildServer() often exceeds the default 5s under Windows
		// and when pnpm -r test runs packages in parallel.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		pool: "threads",
	},
	plugins: [
		copyMigrationSqlPlugin(),
		copyServerAssetsPlugin(),
		copyWebDistPlugin(),
		copyPluginDistPlugin(),
	],
	build: {
		target: "node24",
		lib: {
			entry: {
				// Public library entry - kept for type-checking path resolution.
				index: "src/index.ts",
				// Standalone dev/server mode.
				main: "src/main.ts",
				// One-shot setup entry for first-run configuration.
				"setup-main": "src/setup-main.ts",
			},
			formats: ["es"],
		},
		rollupOptions: {
			external(id) {
				// Local source files -- bundle them.
				if (path.isAbsolute(id) || id.startsWith(".") || id.startsWith("\0"))
					return false
				// src/* alias -- these resolve to local source, must be bundled.
				if (id.startsWith("src/") || id === "src") return false
				// Everything else (node built-ins, npm packages) stays external.
				// dist/ is only used for standalone dev mode; node_modules is
				// always available alongside it.
				return true
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "chunks/[name]-[hash].js",
			},
		},
		outDir: "dist",
		sourcemap: true,
		minify: false,
	},
})
