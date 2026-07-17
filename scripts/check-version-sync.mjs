#!/usr/bin/env node
/**
 * Verifies the unified app version: the root package.json and every
 * official plugin manifest must carry the same version. Exits non-zero
 * on mismatch. Wired into CI and the lefthook pre-push hook.
 *
 *   node scripts/check-version-sync.mjs
 */

import { readFileSync } from "node:fs"

const files = [
	"package.json",
	"plugins/gallery/manifest.json",
	"plugins/manga/manifest.json",
	"plugins/novel/manifest.json",
]

const versions = files.map((path) => ({
	path,
	version: JSON.parse(readFileSync(path, "utf8")).version,
}))

const expected = versions[0].version
const mismatched = versions.filter((entry) => entry.version !== expected)

if (mismatched.length > 0) {
	console.error(`Version mismatch (expected ${expected} from package.json):`)
	for (const entry of mismatched) {
		console.error(`  ${entry.path}: ${entry.version}`)
	}
	console.error(
		"Versions are bumped by `pnpm release`; fix the drift instead of editing by hand.",
	)
	process.exit(1)
}

console.log(`Version check passed (${expected}, ${files.length} files).`)
