#!/usr/bin/env node
/**
 * Syncs the unified app version from the root package.json into every
 * official plugin manifest, then stages them so the release commit
 * includes them. Invoked by release-it's after:bump hook; also safe to
 * run standalone (idempotent).
 *
 *   node scripts/sync-version.mjs
 */

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const manifests = [
	"plugins/gallery/manifest.json",
	"plugins/manga/manifest.json",
	"plugins/novel/manifest.json",
	"packages/plugin-file/manifest.json",
]

const { version } = JSON.parse(readFileSync("package.json", "utf8"))

for (const path of manifests) {
	const manifest = JSON.parse(readFileSync(path, "utf8"))
	if (manifest.version === version) {
		console.log(`unchanged ${path} (${version})`)
		continue
	}
	manifest.version = version
	writeFileSync(path, `${JSON.stringify(manifest, null, "\t")}\n`)
	console.log(`synced ${path} -> ${version}`)
}

try {
	execFileSync("git", ["add", ...manifests], { stdio: "inherit" })
} catch {
	console.warn("warning: could not stage manifests with git")
}
