import { execSync, spawn } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// Load a local `.env` file into process.env so `pnpm dev` can be driven by
// env vars without exporting them manually. Safe to call even when no .env
// exists; in that case we fall back to the defaults below.
try {
	process.loadEnvFile(resolve(WORKSPACE_ROOT, ".env"))
} catch {
	// no .env present
}

function discoverPlugins() {
	const plugins = []

	const pluginsDir = join(WORKSPACE_ROOT, "plugins")
	if (existsSync(pluginsDir)) {
		for (const dirent of readdirSync(pluginsDir, { withFileTypes: true })) {
			if (!dirent.isDirectory()) continue
			const manifestPath = join(pluginsDir, dirent.name, "manifest.json")
			if (existsSync(manifestPath)) {
				try {
					const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
					plugins.push({
						name: dirent.name,
						label: manifest.name ?? dirent.name,
						distPath: resolve(WORKSPACE_ROOT, "plugins", dirent.name, "dist"),
					})
				} catch {
					// skip invalid manifests
				}
			}
		}
	}

	const builtinDir = join(WORKSPACE_ROOT, "packages", "plugin-file")
	const fileManifest = join(builtinDir, "manifest.json")
	if (existsSync(fileManifest)) {
		try {
			const manifest = JSON.parse(readFileSync(fileManifest, "utf-8"))
			plugins.push({
				name: "file",
				label: manifest.name ?? "file",
				distPath: resolve(WORKSPACE_ROOT, "packages", "plugin-file", "dist"),
			})
		} catch {
			// skip
		}
	}

	return plugins
}

function pluginNamesFromEnv() {
	const raw = process.env.DEV_PLUGINS
	if (raw === undefined || raw.length === 0) return undefined
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
}

function selectPlugins(allPlugins) {
	const fromEnv = pluginNamesFromEnv()
	if (fromEnv === undefined) {
		console.log("[dev] DEV_PLUGINS not set, starting without plugin watches.")
		return []
	}

	const selected = []
	for (const name of fromEnv) {
		const found = allPlugins.find((pl) => pl.name === name)
		if (found) {
			selected.push(found)
		} else {
			console.warn(`[dev] unknown plugin: ${name}`)
		}
	}
	return selected
}

function buildServices(selectedPlugins) {
	const svcs = []

	svcs.push({
		name: "web",
		command: "pnpm",
		args: ["-F", "@hoardodile/web", "watch"],
	})

	for (const pl of selectedPlugins) {
		svcs.push({
			name: `plugin:${pl.name}`,
			command: "pnpm",
			args: ["-F", `@hoardodile/plugin-${pl.name}`, "watch"],
		})
	}

	// file is the fallback builtin; only it should use BUILTIN_PATH
	const filePlugin = selectedPlugins.find((p) => p.name === "file")
	const devPlugins = selectedPlugins.filter((p) => p.name !== "file")

	const serverEnv = {
		STORAGE_ROOT:
			process.env.STORAGE_ROOT ?? resolve(WORKSPACE_ROOT, "tmp", "dev-storage"),
		HOST: process.env.HOST ?? "0.0.0.0",
		APP_WEB_ROOT:
			process.env.APP_WEB_ROOT ??
			resolve(WORKSPACE_ROOT, "apps", "web", "dist"),
		BUILTIN_PATH:
			process.env.BUILTIN_PATH ??
			(filePlugin !== undefined
				? filePlugin.distPath
				: resolve(WORKSPACE_ROOT, "packages", "plugin-file", "dist")),
		DEV_PLUGIN_PATHS:
			process.env.DEV_PLUGIN_PATHS ??
			devPlugins.map((pl) => pl.distPath).join(","),
	}

	svcs.push({
		name: "server",
		command: "pnpm",
		args: ["-F", "@hoardodile/server", "dev"],
		env: serverEnv,
	})

	return svcs
}

function showHelp() {
	const HELP = [
		"dev — start development services",
		"",
		"Usage:",
		"  pnpm dev",
		"  DEV_PLUGINS=gallery,manga pnpm dev",
		"",
		"Environment:",
		"  DEV_PLUGINS          Comma-separated plugin names to develop (no plugin watches when unset).",
		"  STORAGE_ROOT         Storage root for the dev server.",
		"  HOST                 Bind host for the dev server.",
		"  APP_WEB_ROOT         Pre-built web assets directory.",
		"  BUILTIN_PATH         Builtin plugin directory.",
		"  DEV_PLUGIN_PATHS     Dev plugin directories (overrides DEV_PLUGINS mapping).",
	].join("\n")
	console.log(HELP)
}

async function main() {
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		showHelp()
		return
	}

	const allPlugins = discoverPlugins()
	const selected = selectPlugins(allPlugins)

	const services = buildServices(selected)
	const children = []
	let exiting = false

	function cleanup(exitCode = 0) {
		if (exiting) return
		exiting = true
		console.log("\n[dev] stopping services...")
		for (const child of children) {
			if (child.exitCode !== null) continue
			try {
				execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: "ignore" })
			} catch {
				// already dead
			}
		}
		process.exit(exitCode)
	}

	process.on("SIGINT", () => cleanup(0))
	process.on("SIGTERM", () => cleanup(0))

	for (const svc of services) {
		console.log(`[dev] starting ${svc.name}...`)
		const child = spawn(svc.command, svc.args, {
			stdio: "inherit",
			shell: true,
			env: svc.env !== undefined ? { ...process.env, ...svc.env } : process.env,
		})
		child.on("error", (err) => {
			console.error(`[dev] ${svc.name} failed to start:`, err)
			cleanup(1)
		})
		child.on("exit", (code) => {
			if (code !== 0 && code !== null) {
				console.error(`[dev] ${svc.name} exited with code ${code}`)
				cleanup(code)
			} else if (code === 0) {
				console.log(`[dev] ${svc.name} exited cleanly`)
				cleanup(0)
			}
		})
		children.push(child)
		await new Promise((resolve) => setTimeout(resolve, 3000))
	}

	console.log("[dev] all services started. Ctrl+C to stop.")
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
