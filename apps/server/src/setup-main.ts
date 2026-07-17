/**
 * Executable wrapper for {@link ./setup.ts}.
 */

import { dirname, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { runSetup } from "src/setup.ts"

const here = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(here, "../..")

try {
	process.loadEnvFile(resolve(workspaceRoot, ".env"))
} catch {
	// no .env present; rely on already-exported env vars
}

runSetup().catch((err) => {
	const message = err instanceof Error ? err.message : String(err)
	process.stderr.write(`${message}\n`)
	process.exit(1)
})
