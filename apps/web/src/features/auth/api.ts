import type {
	AuthStatus,
	LoginRequest,
	LogoutResponse,
} from "@hoardodile/schemas"
import { authStatus, logoutResponse } from "@hoardodile/schemas"
import { queryOptions } from "@tanstack/react-query"
import { HttpError, jsonFetch } from "@/lib/http"
import { apiPaths } from "@/lib/paths"

export async function fetchAuthStatus(): Promise<AuthStatus> {
	const body = await jsonFetch(apiPaths.auth.status(), { method: "GET" })
	return authStatus.parse(body)
}

export async function login(payload: LoginRequest): Promise<AuthStatus> {
	const body = await jsonFetch(apiPaths.auth.login(), {
		method: "POST",
		body: JSON.stringify(payload),
	})
	return authStatus.parse(body)
}

export async function logout(): Promise<LogoutResponse> {
	try {
		const body = await jsonFetch(apiPaths.auth.logout(), {
			method: "POST",
			body: JSON.stringify({}),
		})
		return logoutResponse.parse(body)
	} catch (err) {
		// Logout is idempotent: a 404 (route missing on an older server)
		// or 401 (session already expired) means the user is already
		// effectively logged out, so we surface success rather than
		// blocking the UI on a stale-server detail.
		if (
			err instanceof HttpError &&
			(err.status === 404 || err.status === 401)
		) {
			return { ok: true } as const
		}
		throw err
	}
}

export { HttpError }

export const authKeys = {
	all: ["auth"] as const,
	status: () => [...authKeys.all, "status"] as const,
}

const AUTH_STATUS_STALE_MS = 30_000

export function authStatusQueryOptions() {
	return queryOptions({
		queryKey: authKeys.status(),
		queryFn: () => fetchAuthStatus(),
		staleTime: AUTH_STATUS_STALE_MS,
	})
}

export const authStatusQueryKey = authKeys.status()
