import { z } from "zod"

/** Body of `POST /auth/login`: a single non-empty password. */
export const loginRequest = z.object({
	password: z.string().min(1),
})

/**
 * Response of `GET /auth/status` and `POST /auth/login`: whether the current
 * request is authenticated by a valid session cookie.
 */
export const authStatus = z.object({
	authenticated: z.boolean(),
})

/** Response of `POST /auth/logout`: sentinel acknowledgement. */
export const logoutResponse = z.object({
	ok: z.literal(true),
})

export type LoginRequest = z.infer<typeof loginRequest>
export type AuthStatus = z.infer<typeof authStatus>
export type LogoutResponse = z.infer<typeof logoutResponse>
