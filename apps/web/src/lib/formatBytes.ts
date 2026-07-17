import prettyBytes from "pretty-bytes"

/**
 * Format a non-negative byte count as a short human-readable string
 * via {@link prettyBytes} (decimal SI units, e.g. `4.5 kB`, `1.2 MB`).
 *
 * Returns the empty string for `undefined` so callers can splat the value
 * into a template without conditional checks. Negative or non-finite
 * inputs are clamped to `0 B`.
 */
export function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined) return ""
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
	return prettyBytes(bytes)
}
