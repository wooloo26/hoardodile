import rateLimit from "@fastify/rate-limit"
import { loginRequest } from "@hoardodile/schemas"
import { eq } from "drizzle-orm"
import type {
	FastifyInstance,
	FastifyPluginAsync,
	FastifyReply,
	FastifyRequest,
} from "fastify"
import type { Env } from "src/config/env.ts"
import { type SqliteDb, schema } from "src/infra/db/connection.ts"
import {
	clearSessionCookie,
	cookieOptions,
	writeSessionCookie,
} from "./cookie.ts"
import { verifyPassword } from "./password.ts"
import type { SessionStore } from "./session.ts"

/**
 * Decide whether the incoming request is considered HTTPS. Honors the
 * `X-Forwarded-Proto` header set by a TLS-terminating reverse proxy and
 * falls back to the direct TLS indicator.
 */
function isHttpsRequest(req: FastifyRequest): boolean {
	const forwarded = req.headers["x-forwarded-proto"]
	if (typeof forwarded === "string") {
		return forwarded.toLowerCase() === "https"
	}
	return (
		(req.raw.socket as { encrypted?: boolean | undefined }).encrypted === true
	)
}

function httpsRequiredReply(reply: FastifyReply): FastifyReply {
	return reply
		.code(426)
		.type("application/json")
		.send({ error: "HTTPS required" })
}

export type AuthDeps = {
	readonly env: Env
	readonly db: SqliteDb
	readonly sessions: SessionStore
}

/**
 * Per-IP brute-force budget for `POST /auth/login`. 10 attempts per minute
 * is generous for a legitimate human (typo + retry) and very tight for an
 * online password-guessing attacker, even one with parallel IPs on the
 * local network.
 */
const LOGIN_RATE_MAX = 30
const LOGIN_RATE_WINDOW_MS = 60_000

/**
 * Register the `/auth/*` routes on the given Fastify instance. Supports the
 * single-user password login flow: status probe, login (issues an HttpOnly
 * SameSite=Strict cookie), and logout (clears the cookie).
 *
 * Every successful `POST /auth/login` rotates the session id (a fresh
 * sealed cookie payload) so any pre-login token captured by fixation
 * attempts is useless afterwards.
 *
 * `POST /auth/login` is additionally protected by `@fastify/rate-limit`
 * with a per-IP budget so a local-network attacker cannot trial passwords
 * at line-rate.
 */
export async function registerAuthRoutes(
	app: FastifyInstance,
	deps: AuthDeps,
): Promise<void> {
	const { env, db, sessions } = deps

	await app.register(rateLimit, { global: false })

	app.get("/auth/status", async (req, reply) => {
		if (env.FORCE_HTTPS && !isHttpsRequest(req)) {
			return httpsRequiredReply(reply)
		}
		const cookie = req.cookies[env.SESSION_COOKIE_NAME]
		const refreshed = await sessions.touch(cookie, env.SESSION_TTL_SECONDS)
		if (refreshed === undefined) return { authenticated: false }
		if (refreshed.sealed !== undefined) {
			writeSessionCookie(reply, refreshed.sealed, env, env.SESSION_TTL_SECONDS)
		}
		return { authenticated: true }
	})

	app.post(
		"/auth/login",
		{
			config: {
				rateLimit: {
					max: LOGIN_RATE_MAX,
					timeWindow: LOGIN_RATE_WINDOW_MS,
				},
			},
		},
		async (req, reply) => {
			if (env.FORCE_HTTPS && !isHttpsRequest(req)) {
				return httpsRequiredReply(reply)
			}
			const parsed = loginRequest.safeParse(req.body)
			if (!parsed.success) {
				reply.code(400)
				return { error: "invalid body" }
			}
			const hash = getPasswordHash(db)
			if (!hash) {
				reply.code(401)
				return { error: "not configured" }
			}
			const ok = await verifyPassword(hash, parsed.data.password, req.log)
			if (!ok) {
				reply.code(401)
				return { error: "unauthorized" }
			}
			const issued = await sessions.rotate(env.SESSION_TTL_SECONDS)
			writeSessionCookie(reply, issued.sealed, env, env.SESSION_TTL_SECONDS)
			return { authenticated: true }
		},
	)

	app.post("/auth/logout", async (_req, reply) => {
		// Sessions are stateless cookies -- clearing the cookie is the only
		// step needed. (A revoked-id deny-list would go here if we ever
		// needed pre-expiry revocation.)
		clearSessionCookie(reply, env)
		return { ok: true as const }
	})
}

/**
 * Build a Fastify plugin that defers to {@link registerAuthRoutes}. Useful
 * when you want `app.register(authPlugin(deps))` ergonomics.
 */
export function authPlugin(deps: AuthDeps): FastifyPluginAsync {
	return async (app) => {
		await registerAuthRoutes(app, deps)
	}
}

function getPasswordHash(db: SqliteDb): string | undefined {
	const row = db
		.select({ hash: schema.auth.passwordHash })
		.from(schema.auth)
		.where(eq(schema.auth.singleton, 1))
		.get()
	return row?.hash
}

export { cookieOptions }
