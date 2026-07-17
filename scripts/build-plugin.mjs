import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	watch,
} from "node:fs"
import { join } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { build } from "vite"

/**
 * Build a plugin from `dir` (must contain `manifest.json` and optionally
 * `src/main.ts` / `index.html`). Output goes to `dir/dist/`.
 *
 * Pass `--watch` to rebuild on file changes instead of exiting.
 */
export async function buildPlugin(dir) {
	const manifestPath = join(dir, "manifest.json")
	if (!existsSync(manifestPath)) {
		throw new Error(`No manifest.json found in ${dir}`)
	}

	const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
	if (typeof manifest.id !== "string" || manifest.id.length === 0) {
		throw new Error("manifest.json missing id field")
	}

	const outDir = join(dir, "dist")

	const watchMode = process.argv.includes("--watch")
	if (!watchMode) {
		rmSync(outDir, { recursive: true, force: true })
	}
	mkdirSync(outDir, { recursive: true })

	const htmlEntry = join(dir, "index.html")
	const mainEntry = join(dir, "src", "main.ts")

	if (existsSync(htmlEntry)) {
		const result = await build({
			root: dir,
			base: "./",
			plugins: [react(), tailwindcss()],
			build: {
				outDir,
				emptyOutDir: false,
				chunkSizeWarningLimit: Infinity,
				rollupOptions: {
					input: htmlEntry,
				},
				watch: watchMode ? {} : null,
			},
		})
		if (watchMode) {
			result.on("event", (event) => {
				if (event.code === "END") {
					console.log(`[watch] ${manifest.id} client rebuilt`)
				} else if (event.code === "ERROR") {
					console.error(`[watch] ${manifest.id} client error:`, event.error)
				}
			})
		}
	}

	if (existsSync(mainEntry)) {
		const result = await build({
			root: dir,
			plugins: [react()],
			build: {
				ssr: mainEntry,
				outDir,
				emptyOutDir: false,
				target: "node24",
				rollupOptions: {
					output: {
						entryFileNames: "main.js",
						chunkFileNames: "[name].js",
					},
					external: [],
				},
				watch: watchMode ? {} : null,
			},
		})
		if (watchMode) {
			result.on("event", (event) => {
				if (event.code === "END") {
					console.log(`[watch] ${manifest.id} server rebuilt`)
				} else if (event.code === "ERROR") {
					console.error(`[watch] ${manifest.id} server error:`, event.error)
				}
			})
		}
	}

	copyFileSync(manifestPath, join(outDir, "manifest.json"))

	if (watchMode) {
		watch(manifestPath, () => {
			copyFileSync(manifestPath, join(outDir, "manifest.json"))
			console.log(`[watch] ${manifest.id} manifest updated`)
		})
		console.log(`[watch] ${manifest.id} watching for changes...`)
		await new Promise(() => {})
	}
	console.log(`${manifest.id} → ${outDir}`)
}

const invokedDirectly = process.argv[1]?.endsWith("build-plugin.mjs")
if (invokedDirectly) {
	buildPlugin(process.cwd()).catch((err) => {
		console.error(err)
		process.exit(1)
	})
}
