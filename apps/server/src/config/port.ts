import getPort from "get-port"

/**
 * Resolves an available TCP port for the server to bind to.
 *
 * Attempts to bind `preferredPort` first. If that port is already in use,
 * falls back to an OS-picked free ephemeral port.
 *
 * @param preferredPort - The port number to try first (e.g. from env.PORT).
 * @returns The resolved port number that is guaranteed to be free at the time
 *   of the check. Note: there is a small TOCTOU window between this call and
 *   the actual `listen()` - negligible for local desktop use.
 */
export async function resolveAvailablePort(
	preferredPort: number,
): Promise<number> {
	const port = await getPort({ port: preferredPort })
	if (port !== preferredPort) {
		console.warn(
			`Preferred port ${preferredPort} is not available. Using ${port} instead.`,
		)
	}
	return port
}
