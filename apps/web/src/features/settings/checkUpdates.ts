import { APP_RELEASES_API_URL, APP_REPOSITORY_URL } from "@/lib/appInfo"

export type UpdateCheckResult =
	| { readonly status: "latest" }
	| {
			readonly status: "outdated"
			readonly version: string
			readonly url: string
	  }
	| { readonly status: "error" }

/**
 * Comparator for dotted numeric versions (`1.2.3`); a leading `v` and
 * missing trailing segments are tolerated (`v1.2` === `1.2.0`).
 * Returns negative / zero / positive like a standard comparator.
 */
export function compareVersions(a: string, b: string): number {
	const pa = a
		.replace(/^v/, "")
		.split(".")
		.map((segment) => Number(segment))
	const pb = b
		.replace(/^v/, "")
		.split(".")
		.map((segment) => Number(segment))
	const length = Math.max(pa.length, pb.length)
	for (let i = 0; i < length; i += 1) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
		if (diff !== 0) return diff
	}
	return 0
}

/**
 * Fetch the latest GitHub release and compare it against the running
 * version. Browser-direct call (api.github.com allows CORS); invoked only
 * on an explicit user action from the About section — never automatically.
 */
export async function checkForUpdate(
	current: string,
): Promise<UpdateCheckResult> {
	let data: unknown
	try {
		const res = await fetch(APP_RELEASES_API_URL)
		if (!res.ok) return { status: "error" }
		data = await res.json()
	} catch {
		return { status: "error" }
	}

	if (
		typeof data !== "object" ||
		data === null ||
		!("tag_name" in data) ||
		typeof data.tag_name !== "string"
	) {
		return { status: "error" }
	}

	const latest = data.tag_name.replace(/^v/, "")
	if (latest.length === 0) return { status: "error" }
	if (compareVersions(latest, current) <= 0) return { status: "latest" }

	const url =
		"html_url" in data && typeof data.html_url === "string"
			? data.html_url
			: `${APP_REPOSITORY_URL}/releases`
	return { status: "outdated", version: latest, url }
}
