import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"

const webPort = Number(process.env.WEB_PORT ?? 5173)
const serverPort = Number(process.env.SERVER_PORT ?? 3001)
const serverHost = "127.0.0.1"
// Ephemeral file per test run so migrations can create tables and the password
// script can seed a row. We delete this before the server process starts.
const dbPath = resolve(import.meta.dirname, ".playwright", "app-e2e.sqlite3")
const storageRoot = resolve(import.meta.dirname, ".playwright", "storage")
const testPassword = "correct horse battery staple"
const repoRoot = resolve(import.meta.dirname, "..", "..")

process.env.E2E_DB_PATH = dbPath
process.env.E2E_TEST_PASSWORD = testPassword
process.env.E2E_SERVER_PORT = String(serverPort)
process.env.E2E_WEB_PORT = String(webPort)

// Playwright loads this config in the main process and again in each worker;
// we only want to re-seed the DB once, before webServer boots.
function seedAuthDb() {
	if (process.env.E2E_DB_SEEDED === "1") return
	rmSync(dbPath, { force: true })
	rmSync(`${dbPath}-wal`, { force: true })
	rmSync(`${dbPath}-shm`, { force: true })
	rmSync(storageRoot, { recursive: true, force: true })
	mkdirSync(dirname(dbPath), { recursive: true })
	mkdirSync(storageRoot, { recursive: true })

	const result = spawnSync(
		"pnpm",
		[
			"-F",
			"@hoardodile/server",
			"exec",
			"vite-node",
			"src/scripts/e2e-seed.ts",
		],
		{
			cwd: repoRoot,
			stdio: "inherit",
			env: {
				...process.env,
				STORAGE_ROOT: storageRoot,
				APP_NEW_PASSWORD: testPassword,
				SESSION_SECURE_COOKIE: "false",
			},
			shell: process.platform === "win32",
		},
	)
	if (result.status !== 0) {
		throw new Error(`failed to seed e2e password (exit ${result.status})`)
	}
	process.env.E2E_DB_SEEDED = "1"
}

seedAuthDb()

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? [["list"], ["html"]] : [["list"]],
	use: {
		baseURL: `http://127.0.0.1:${webPort}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: `pnpm -F @hoardodile/server exec vite-node src/main.ts`,
			cwd: repoRoot,
			url: `http://${serverHost}:${serverPort}/health`,
			reuseExistingServer: false,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				NODE_ENV: "development",
				HOST: serverHost,
				PORT: String(serverPort),
				LOG_LEVEL: "warn",
				DATABASE_URL: dbPath,
				SESSION_COOKIE_NAME: "app_session_e2e",
				SESSION_SECURE_COOKIE: "false",
				STORAGE_ROOT: storageRoot,
				RESTART_ON_RESTORE: "false",
			},
		},
		{
			command: `pnpm -F @hoardodile/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
			cwd: repoRoot,
			url: `http://127.0.0.1:${webPort}`,
			reuseExistingServer: false,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				VITE_SERVER_URL: `http://${serverHost}:${serverPort}`,
			},
		},
	],
})
