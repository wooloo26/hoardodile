/**
 * One-shot setup entry for the app server.
 *
 * This script handles first-run configuration that must happen before the
 * server can start listening:
 *
 *  - Optionally restore a database snapshot (`RESTORE_FROM`).
 *  - Write the single-user admin password hash.
 *
 * The server itself never prompts and never mutates auth state; it only
 * fails fast when auth is not configured.
 *
 * Password sources (highest priority first):
 *  1. `ADMIN_PASSWORD_FILE` -> read the first line of that file.
 *  2. `ADMIN_PASSWORD` env var.
 *  3. Interactive TTY prompt via `@clack/prompts`.
 *
 * Throws when no source is available or the password is too short.
 */

import { readFileSync } from "node:fs"
import * as p from "@clack/prompts"
import { type Env, loadEnv } from "src/config/env.ts"
import { stagePendingRestoreSnapshot, writeAuthPassword } from "src/runtime.ts"

const MIN_PASSWORD_LENGTH = 4

export type PasswordSource =
	| { readonly kind: "file"; readonly path: string }
	| { readonly kind: "env"; readonly password: string }
	| { readonly kind: "interactive" }

export async function runSetup(
	env?: Env,
	passwordSource?: PasswordSource,
): Promise<void> {
	const resolvedEnv = env ?? loadEnv(process.env)

	if (resolvedEnv.RESTORE_FROM !== undefined) {
		await stagePendingRestoreSnapshot(resolvedEnv, resolvedEnv.RESTORE_FROM)
	}

	const source = passwordSource ?? resolvePasswordSource()
	const password = await readPassword(source)
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(
			`app: password must be at least ${MIN_PASSWORD_LENGTH} characters`,
		)
	}

	await writeAuthPassword(resolvedEnv, password)
	process.stdout.write("app: admin password configured\n")
}

export function resolvePasswordSource(): PasswordSource {
	const fromFile = process.env.ADMIN_PASSWORD_FILE
	if (fromFile !== undefined && fromFile.length > 0) {
		return { kind: "file", path: fromFile }
	}
	const fromEnv = process.env.ADMIN_PASSWORD
	if (fromEnv !== undefined && fromEnv.length > 0) {
		return { kind: "env", password: fromEnv }
	}
	if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
		return { kind: "interactive" }
	}
	throw new Error(
		"app: ADMIN_PASSWORD, ADMIN_PASSWORD_FILE, or an interactive TTY is required to set the admin password.",
	)
}

async function readPassword(source: PasswordSource): Promise<string> {
	switch (source.kind) {
		case "env":
			return source.password
		case "file": {
			const raw = readFileSync(source.path, "utf-8").replace(/\r?\n$/, "")
			return raw
		}
		case "interactive":
			return promptNewPassword()
	}
}

async function promptNewPassword(): Promise<string> {
	const first = await p.password({
		message: "Choose an admin password:",
		validate(input) {
			if (input === undefined || input.length < MIN_PASSWORD_LENGTH) {
				return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
			}
			return undefined
		},
	})
	if (p.isCancel(first)) {
		p.cancel("Aborted.")
		process.exit(0)
	}
	const second = await p.password({
		message: "Confirm password:",
		validate(input) {
			if (input !== first) return "Passwords do not match."
			return undefined
		},
	})
	if (p.isCancel(second)) {
		p.cancel("Aborted.")
		process.exit(0)
	}
	return first
}
