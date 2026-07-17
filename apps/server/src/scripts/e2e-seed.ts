/**
 * One-shot E2E seed script: writes the admin password into the empty
 * database created for a Playwright run. This must run before the server
 * boots so that the login flow can authenticate.
 *
 * Environment variables consumed:
 *  - STORAGE_ROOT (or DATABASE_URL override)
 *  - APP_NEW_PASSWORD
 */
import { loadEnv } from "src/config/env.ts"
import { writeAuthPassword } from "src/runtime.ts"

const password = process.env.APP_NEW_PASSWORD
if (password === undefined || password.length === 0) {
	throw new Error("APP_NEW_PASSWORD is required")
}

const env = loadEnv(process.env)
await writeAuthPassword(env, password)
process.stdout.write(`[e2e-seed] password configured for ${env.DATABASE_URL}\n`)
