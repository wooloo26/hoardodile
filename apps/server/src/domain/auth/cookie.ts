import type {} from "@fastify/cookie"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { Env } from "src/config/env.ts"

/**
 * Read the session cookie value from an incoming request. Single source of
 * truth for the cookie name 'any rename only touches this file and
 * {@link Env.SESSION_COOKIE_NAME}.
 */
export function readSessionCookie(
	req: FastifyRequest,
	cookieName: string,
): string | undefined {
	return req.cookies[cookieName]
}

/**
 * Determine whether session cookies should carry the Secure flag.
 * `FORCE_HTTPS` overrides `SESSION_SECURE_COOKIE` to true.
 */
export function isSecureCookie(env: Env): boolean {
	return env.FORCE_HTTPS || env.SESSION_SECURE_COOKIE
}

/**
 * Shared `setCookie` / `clearCookie` options. `maxAgeSeconds` is set for
 * login/refresh; omitted for logout so the browser expires the cookie
 * immediately.
 */
export function cookieOptions(
	env: Env,
	maxAgeSeconds?: number,
): Record<string, unknown> {
	return {
		httpOnly: true,
		sameSite: "strict",
		secure: isSecureCookie(env),
		path: "/",
		...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
	}
}

/** Write a new session cookie with a sliding TTL. */
export function writeSessionCookie(
	reply: FastifyReply,
	id: string,
	env: Env,
	ttlSeconds: number,
): void {
	reply.setCookie(env.SESSION_COOKIE_NAME, id, cookieOptions(env, ttlSeconds))
}

/** Clear the session cookie on the response. */
export function clearSessionCookie(reply: FastifyReply, env: Env): void {
	reply.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions(env))
}
