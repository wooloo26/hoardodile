#!/usr/bin/env node
import { copyFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { init } from "license-checker-rseidelsohn"

// Resolve everything against the workspace root so the script can run from
// any cwd (it is chained into apps/web's build/watch scripts).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const isCheckOnly = process.argv.includes("--check")

const SCAN_PATHS = ["apps/web", "apps/server"].map((p) => resolve(ROOT, p))

const ALLOWED_LICENSE_TOKENS = new Set([
	"MIT",
	"ISC",
	"Apache-2.0",
	"BlueOak-1.0.0",
	"BSD-3-Clause",
	"BSD-2-Clause",
	"MIT-0",
	"CC0-1.0",
	"Python-2.0",
	"CC-BY-4.0",
	"CC-BY-3.0",
	"MPL-2.0",
	"0BSD",
	"OFL-1.1",
	"GPL-3.0",
	"GPL-3.0*",
	"WTFPL",
	"Public Domain",
	"Unlicense",
])

const FONTS = [
	{
		family: "Inter",
		license: "OFL-1.1",
		licenseUrl: "https://openfontlicense.org",
		attribution:
			"Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)",
		source: "https://github.com/google/fonts",
	},
	{
		family: "LXGW WenKai",
		license: "OFL-1.1",
		licenseUrl: "https://openfontlicense.org",
		attribution:
			"LXGW WenKai Project Authors (https://github.com/lxgw/LxgwWenKai)",
		source: "https://github.com/lxgw/LxgwWenKai",
	},
	{
		family: "Source Sans 3",
		license: "OFL-1.1",
		licenseUrl: "https://openfontlicense.org",
		attribution: "Google Inc.",
		source: "https://github.com/google/fonts",
	},
]

function normalizeLicense(value) {
	if (Array.isArray(value)) return value.flatMap(normalizeLicense)
	if (typeof value !== "string") return []
	return value
		.replace(/[()]/g, " ")
		.split(/\s+(?:OR|AND)\s+/gu)
		.map((token) => token.trim())
		.filter(Boolean)
}

function isLicenseAllowed(raw) {
	const rawString = Array.isArray(raw) ? raw.join(" OR ") : String(raw ?? "")
	const tokens = normalizeLicense(raw)
	if (tokens.length === 0) return false
	const isOrExpression = /\s+OR\s+/iu.test(rawString)
	if (isOrExpression) {
		return tokens.some((token) => ALLOWED_LICENSE_TOKENS.has(token))
	}
	return tokens.every((token) => ALLOWED_LICENSE_TOKENS.has(token))
}

function collectLicenseText(value) {
	if (Array.isArray(value)) return value.join(" / ")
	return String(value ?? "")
}

function checkLicenses(packages) {
	const invalid = []
	for (const pkg of packages) {
		if (!isLicenseAllowed(pkg.license)) {
			invalid.push(`${pkg.name}@${pkg.version}: ${pkg.license}`)
		}
	}
	return invalid
}

function runChecker(start) {
	return new Promise((resolve, reject) => {
		init(
			{
				start,
				production: true,
				excludePrivatePackages: true,
				customFormat: {
					name: "",
					version: "",
					licenses: "",
					repository: "",
					publisher: "",
					copyright: "",
				},
			},
			(err, data) => {
				if (err) reject(err)
				else resolve(data)
			},
		)
	})
}

async function main() {
	const merged = new Map()
	for (const start of SCAN_PATHS) {
		const data = await runChecker(start)
		for (const [key, info] of Object.entries(data)) {
			if (merged.has(key)) continue
			merged.set(key, {
				name: info.name ?? key.split("@").slice(0, -1).join("@"),
				version: info.version ?? key.split("@").pop(),
				license: collectLicenseText(info.licenses),
				repository: info.repository ?? "",
				publisher: info.publisher ?? "",
				copyright: info.copyright ?? "",
			})
		}
	}

	const packages = Array.from(merged.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	)

	const invalid = checkLicenses(packages)
	if (invalid.length > 0) {
		console.error("Found incompatible or unknown licenses:")
		for (const line of invalid) console.error(`  - ${line}`)
		process.exit(1)
	}

	if (isCheckOnly) {
		console.log(`License check passed (${packages.length} packages).`)
		return
	}

	const grouped = new Map()
	for (const pkg of packages) {
		const group = grouped.get(pkg.license) ?? []
		group.push(pkg)
		grouped.set(pkg.license, group)
	}
	const sortedLicenses = Array.from(grouped.entries())
		.map(([license, packagesForLicense]) => ({
			license,
			packages: packagesForLicense,
		}))
		.sort((a, b) => a.license.localeCompare(b.license))

	const licensesJson = {
		project: {
			name: "hoardodile",
			license: "GPL-3.0",
		},
		licenses: sortedLicenses,
		fonts: FONTS,
	}
	writeFileSync(
		resolve(ROOT, "apps/web/public/licenses.json"),
		`${JSON.stringify(licensesJson, null, "\t")}\n`,
	)
	copyFileSync(
		resolve(ROOT, "LICENSE"),
		resolve(ROOT, "apps/web/public/LICENSE"),
	)

	console.log(
		`Generated apps/web/public/licenses.json and copied LICENSE (${packages.length} packages).`,
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
