import { describe, expect, test } from "vitest"
import { authStatus, loginRequest, logoutResponse } from "./auth.ts"

describe("auth schemas", () => {
	test("loginRequest accepts a password", () => {
		expect(loginRequest.parse({ password: "x" }).password).toBe("x")
	})

	test("loginRequest rejects an empty password", () => {
		expect(loginRequest.safeParse({ password: "" }).success).toBe(false)
	})

	test("loginRequest rejects a missing password", () => {
		expect(loginRequest.safeParse({}).success).toBe(false)
	})

	test("authStatus round-trips both booleans", () => {
		expect(authStatus.parse({ authenticated: true }).authenticated).toBe(true)
		expect(authStatus.parse({ authenticated: false }).authenticated).toBe(false)
	})

	test("logoutResponse only accepts ok: true", () => {
		expect(logoutResponse.parse({ ok: true }).ok).toBe(true)
		expect(logoutResponse.safeParse({ ok: false }).success).toBe(false)
	})
})
