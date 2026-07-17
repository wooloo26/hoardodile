import { readFileSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { visualizer } from "rollup-plugin-visualizer"
import inspect from "vite-plugin-inspect"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"

const serverTarget = process.env.VITE_SERVER_URL ?? "http://127.0.0.1:3000"

// The unified app version lives in the root package.json; bake it into the
// bundle as __APP_VERSION__ (see src/lib/appInfo.ts).
const rootPackage: { version?: unknown } = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
)
const appVersion =
	typeof rootPackage.version === "string" ? rootPackage.version : "0.0.0"

// Paths forwarded to the Fastify server during dev. Covers the tRPC mount
// and the raw HTTP surface (auth, health, and future upload / range GET / SSE
// routes under /api). Cookies flow through because Vite proxies `credentials`
// transparently via `changeOrigin`.
const proxyPaths = ["/trpc", "/auth", "/health", "/api"] as const

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: false,
			routesDirectory: "./src/routes",
			generatedRouteTree: "./src/routeTree.gen.ts",
			routeFileIgnorePattern: "\\.test\\.(ts|tsx)$",
		}),
		react(),
		tailwindcss(),
		visualizer(),
		inspect(),
		VitePWA({
			strategies: "injectManifest",
			srcDir: "src",
			filename: "sw.ts",
			injectManifest: {
				injectionPoint: "self.__WB_MANIFEST",
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
			},
			devOptions: {
				enabled: false,
			},
		}),
	],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion),
	},
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
		},
	},
	server: {
		port: 5173,
		strictPort: false,
		proxy: Object.fromEntries(
			proxyPaths.map((p) => [
				p,
				{
					target: serverTarget,
					changeOrigin: true,
					secure: false,
					ws: false,
				},
			]),
		),
	},
	build: {
		chunkSizeWarningLimit: Infinity,
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		css: false,
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["e2e/**", "node_modules/**", "dist/**"],
		pool: "threads",
	},
})
