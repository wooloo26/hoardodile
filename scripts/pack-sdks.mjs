#!/usr/bin/env node
/**
 * Pack the plugin SDK packages into tarballs for out-of-tree plugin
 * repositories. `pnpm pack` rewrites the `workspace:*` and `catalog:` specs
 * in package manifests to concrete versions — plain `file:` directory
 * dependencies cannot resolve those specs outside this workspace, so
 * external plugins depend on the tarballs instead:
 *
 *   "@hoardodile/plugin-sdk-server": "file:<hoardodile>/tmp/sdks/hoardodile-plugin-sdk-server-0.0.0.tgz"
 *
 *   node scripts/pack-sdks.mjs   # → tmp/sdks/*.tgz (gitignored)
 */

import { execSync } from "node:child_process"
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT_DIR = resolve(WORKSPACE_ROOT, "tmp", "sdks")

// The full @hoardodile dependency closure of the plugin SDKs. External
// plugins declare every one of these tarballs: after packing, cross-package
// specs read "0.0.0", which only the sibling tarballs can satisfy.
const SDK_PACKAGES = [
	"packages/consts",
	"packages/plugin-sdk-types",
	"packages/plugin-sdk-web",
	"packages/plugin-sdk-react",
	"packages/plugin-sdk-server",
]

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

for (const pkgDir of SDK_PACKAGES) {
	console.log(`[sdks:pack] packing ${pkgDir}...`)
	execSync(`pnpm pack --pack-destination "${OUT_DIR}"`, {
		cwd: resolve(WORKSPACE_ROOT, pkgDir),
		stdio: "inherit",
		shell: true,
	})
}

console.log(`[sdks:pack] tarballs in ${OUT_DIR}:`)
for (const file of readdirSync(OUT_DIR)) {
	console.log(`  ${file}`)
}
