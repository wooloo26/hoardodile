import { expect, test } from "vitest"
import { loadEnv } from "./env.ts"

test("loadEnv parses with defaults", () => {
	const env = loadEnv({})
	expect(env.NODE_ENV).toBe("development")
	expect(env.PORT).toBe(3000)
	expect(env.SESSION_COOKIE_NAME).toBe("app_session")
	expect(env.SESSION_SECURE_COOKIE).toBe(false)
	expect(env.SHARED_FOLDER_ROOT).toBeUndefined()
})

test("loadEnv coerces numeric PORT", () => {
	const env = loadEnv({ PORT: "5173" } satisfies NodeJS.ProcessEnv)
	expect(env.PORT).toBe(5173)
})

test("loadEnv rejects invalid PORT", () => {
	expect(() => loadEnv({ PORT: "99999" } satisfies NodeJS.ProcessEnv)).toThrow(
		/Invalid environment/,
	)
})

test("loadEnv coerces stringy booleans", () => {
	const env = loadEnv({
		SESSION_SECURE_COOKIE: "true",
		FORCE_HTTPS: "1",
		DISABLE_DEV_PLUGINS: "true",
	} satisfies NodeJS.ProcessEnv)
	expect(env.SESSION_SECURE_COOKIE).toBe(true)
	expect(env.FORCE_HTTPS).toBe(true)
	expect(env.DISABLE_DEV_PLUGINS).toBe(true)
})

test("loadEnv security flags default to false", () => {
	const env = loadEnv({})
	expect(env.FORCE_HTTPS).toBe(false)
	expect(env.DISABLE_DEV_PLUGINS).toBe(false)
})

test("loadEnv resolves SHARED_FOLDER_ROOT relative to workspace root", () => {
	const env = loadEnv({ SHARED_FOLDER_ROOT: "packages/plugin-file/dist" })
	expect(env.SHARED_FOLDER_ROOT).toMatch(/packages[/\\]plugin-file[/\\]dist$/)
})
