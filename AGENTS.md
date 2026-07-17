# hoardodile

Privacy-first, self-hosted archiving app for personal media and documents (gallery, manga, novel), built as a pnpm monorepo: Fastify + tRPC server, React SPA, iframe content plugins. This file is the instruction manual for coding agents — treat it as living documentation and update it whenever commands, conventions, or structure change.

## Objectives

- **Privacy-first & secure by design**
- **Single-user authentication** (not userless/headless)
- **Manual backup & host-switching:** sync `{storage}/versions/` with any file-sync tool; back up the DB in-app before switching hosts
- **Versioned archiving:** once a version is released, its `versions/<v>/` files and DB snapshot are frozen and never deleted
- **Lightweight data:** resource originals stay well under 1 TB

## Commands

Prerequisites: Node.js 24 and pnpm via corepack (`corepack enable`; the version is pinned by the `packageManager` field), then `pnpm install`.

- `pnpm dev` — start web + server + selected plugin watches. Set `DEV_PLUGINS=gallery,manga` to select plugins; entries may also be paths to external plugin directories (their `watch` script is started when present); when omitted, no plugin watches start. `DEV_PLUGIN_PATHS` lists extra pre-built dist dirs to load (appended, no watchers).
- `pnpm test` / `pnpm lint` — run all tests / biome check + per-package `tsc --noEmit`. Both use Turborepo under the hood; repeat runs hit the local cache and are near-instant.
- `pnpm format` — run biome check + format with write.
- `pnpm build` — build all plugins, then the server (embeds web dist, plugin dists, migrations, assets).
- `pnpm db:generate` — generate Drizzle migrations from domain schemas.
- `pnpm sdks:pack` — pack the plugin SDK packages into `tmp/sdks/*.tgz` for out-of-tree plugin development (rewrites `workspace:*`/`catalog:` specs).
- `pnpm -F @hoardodile/server setup:dev` — one-shot setup: write admin password and optionally restore a snapshot (`RESTORE_FROM`). The production binary exposes `app-server-setup`.
- `pnpm -F @hoardodile/docs dev` — run the Nextra docs site locally (`http://localhost:3000`).
- Git hooks (lefthook): commit-msg runs commitlint (Conventional Commits enforced); pre-commit runs lint-staged (biome on staged files) + `scripts/guard-versions.mjs --staged`; pre-push runs `pnpm lint` + `pnpm test` + `pnpm version:check`.
- CI: `.github/workflows/ci.yml` runs `pnpm lint`, `pnpm test`, `pnpm licenses:check`, `pnpm version:check`, and `pnpm build` in the `check` job, plus a Playwright `e2e` job — all on an ubuntu + windows matrix, on push/PR to `main`. Releases are cut locally with `pnpm release` only (no CI release workflow). Dependabot (`.github/dependabot.yml`) opens weekly grouped PRs for npm and GitHub Actions updates; `typescript` major bumps are ignored because `apps/docs` must stay on TS 5.9 (nextra's twoslash peer allows only `^5.5 || ^6.0`), so docs pins its own `next`/`typescript` instead of the catalog. The docs site is deployed to GitHub Pages by `.github/workflows/docs.yml` on pushes to `main` that touch `apps/docs/` (requires repo Settings → Pages → Source = "GitHub Actions"; served at the custom domain `docs.hoardodile.com` via `apps/docs/public/CNAME`).
- **Versioning:** one unified app version, owned by the root `package.json`. Cut releases with `pnpm release` (release-it): it bumps the version, syncs the official plugin manifests via `scripts/sync-version.mjs`, then commits, tags, pushes, and creates the GitHub Release (needs a `GITHUB_TOKEN` env var). Release notes are generated from Conventional Commits via `@release-it/conventional-changelog`, which also recommends the bump level. Never hand-edit a `version` field — `pnpm version:check` enforces the sync in CI and pre-push. Other workspace packages stay `0.0.0` (never published). The `plugin-sdk-*` packages are intended for future npm publication — keep their public API surface deliberate.

The server has no CLI flags; all runtime configuration comes from environment variables validated by `apps/server/src/config/env.ts`.

Turborepo caches task outputs in `.turbo/` (ignored by git). Delete `.turbo/` and `*/.turbo/` to force a cold run.

## Tech Stack

- **Runtime:** Node.js 24, TypeScript, pnpm workspaces
- **Monorepo tasks:** Turborepo (caches lint/test/build)
- **Server:** Fastify v5 + cookie/cors/multipart/rate-limit/sse/static
- **DB:** Drizzle ORM + better-sqlite3 (WAL, foreign keys, busy timeout)
- **API:** tRPC v11 + TanStack React Query
- **Router:** TanStack Router (file-based)
- **SPA:** React 19, Vite
- **State:** zustand
- **Forms:** react-hook-form + zod resolvers
- **CSS:** Tailwind CSS v4
- **UI:** shadcn/ui + Radix + Base UI primitives
- **i18n:** i18next + react-i18next (browser language detection)
- **PWA:** vite-plugin-pwa + workbox (`apps/web/src/sw.ts`)
- **Auth:** @node-rs/argon2 + iron-session cookies
- **Editor:** BlockNote
- **Validation:** Zod v4
- **Media:** sharp, ffmpeg/ffprobe installers
- **Plugins:** server loads `dist/main.js` via dynamic import; client runs plugins in iframes over `postMessage`
- **Logging:** pino + pino-pretty + pino-roll
- **E2E:** Playwright

## Coding guidelines

1. Follow the [Microsoft/TypeScript](https://github.com/microsoft/TypeScript) conventions.
2. Prefer type inference; do not annotate types that can be inferred.
3. Use type guards (`instanceof`, `typeof`), assertion functions (`asserts`), or `satisfies` instead of `as`.
4. Avoid arrow functions assigned to `let` or `const`.
8. Commit messages follow Conventional Commits (`type(scope): subject`), enforced by commitlint on commit-msg.

## Dependencies

- Add runtime dependencies to the package that uses them, never to the workspace root.
- Versions of dependencies shared by multiple packages go in the `catalog:` protocol in `pnpm-workspace.yaml`; consumers reference them as `"catalog:"`.
- Before introducing a new third-party library, check whether an existing dependency already covers it (e.g. `es-toolkit`, `dayjs` via `@hoardodile/shared/dayjs`).

## Project Structure

Monorepo (pnpm). tRPC + React SPA + Fastify.

```
apps/
  web/         React SPA, TanStack Router (routes/, features/, components/)
  server/      Fastify (domain/ = biz logic, infra/ = db/trpc/storage, config/, lib/, scripts/)
  docs/        Nextra documentation site (static export, deployed to GitHub Pages)
packages/
  consts/     Shared constants (media extensions, pagination, text limits, timezone)
  shared/     Utils, errors, pagination
  schemas/    Domain schemas, derived types, and schema-related constants
  ui/         shadcn/ui + Radix + Base UI primitives, theme, hooks, components
  plugin-file/        Built-in fallback plugin for unknown file types
  plugin-sdk-types/   Shared plugin runtime types
  plugin-sdk-server/  Server-side plugin contract + helpers + build CLI (`hoardodile-plugin-build`)
  plugin-sdk-web/     Framework-agnostic iframe/postMessage runtime
  plugin-sdk-react/   React bindings for iframe plugins
plugins/       Content plugins (gallery, manga, novel) + template (starting point for third-party plugins; never bundled into the server build)
scripts/       Root dev/license/guard/version scripts
```

## Architecture

- **Domain-driven:** each domain follows `schema.ts` → `repo.ts` → `service.ts` → `router.ts`; plugin-exposing domains add `plugin.ts`.
- **Service factory:** `create*Service(deps)` — DI via closures, no classes.
- **Plugins:** `manifest.json` (UUID, permissions, i18n, UI templates) + server `main.js` (`createPlugin(api)`) + client iframe renderer.
  - Server plugins default-export a declarative `definePlugin()` definition (`detect` plus optional hooks) from `@hoardodile/plugin-sdk-server`. Third-party plugins live out of tree and join the dev loop via `DEV_PLUGINS` paths — see `plugins/template` and the docs' Plugin Development page.
  - Client plugins run inside a sandboxed iframe. Framework-agnostic code uses `@hoardodile/plugin-sdk-web`; React plugins use `@hoardodile/plugin-sdk-react` (`createPluginRoot`, `usePluginAPI`, `useVisibility`).
- **Storage:** all server paths come from `apps/server/src/infra/storage/paths.ts`.
  - `{storage}/app.sqlite` — live runtime DB, not synced.
  - `{storage}/versions/<version>/` — frozen, syncable version partitions (DB snapshot, resources, characters, documents). Old versions are read-only.
  - `{storage}/local/` — host-only state (logs, thumbnails, trash, staging, session key, extracted caches).
- **Archive write safety:** writes under `versions/<v>/` must target the latest version via `paths.latest` inside `writeVersioned`. Never write through `paths.active` or `paths.atVersion(...)`. `scripts/guard-versions.mjs` enforces this in `apps/server/src` (lefthook pre-commit, `--staged`); exemptions need `// write-guard-exempt`.

## Generated files — do not hand-edit

- `apps/web/src/routeTree.gen.ts` — regenerated by TanStack Router (also gitignored).
- `apps/web/public/licenses.json` and `apps/web/public/LICENSE` — generated by `scripts/generate-licenses.mjs`, which runs automatically on web `build`/`watch` (gitignored; never commit). `pnpm licenses:check` only validates the dependency-license allowlist and runs solely in CI.
- `apps/server/src/infra/db/migrations/` — regenerate with `pnpm db:generate`.
- `pnpm-lock.yaml` — regenerate with `pnpm install`.

## Testing

- **Unit/integration:** Vitest, files at `src/**/*.test.{ts,tsx}`. Add or update tests for the code you change, even if nobody asked.
- **Server:** node env, config in `apps/server/vite.config.ts`.
- **Web:** jsdom env, globals on, setup at `apps/web/src/test/setup.ts`.
- **Plugins:** jsdom env, separate `vitest.config.ts` per plugin.
- **E2E:** Playwright (chromium, serial, ephemeral server + web + seeded DB). Specs at `apps/web/e2e/`, config at `apps/web/playwright.config.ts`; run with `pnpm -F @hoardodile/web test:e2e`.

## Commits & releases

- Commit messages follow Conventional Commits (`type(scope): subject`); commitlint rejects anything else on commit-msg.
- Before finishing a change, run in order: `pnpm format` → `pnpm lint` → `pnpm test`, all green.
- Releases are cut only with `pnpm release` (see Commands → Versioning). Never hand-edit a `version` field.

## Guardrails

- Never hand-edit generated files (see above) or any `version` field.
- Writes under `versions/<v>/` go only through `paths.latest` inside `writeVersioned` (see Architecture → Archive write safety); use `// write-guard-exempt` only when truly necessary.
- The deliberate lack of LAN-only network restriction is a project decision (see Objectives) — do not "fix" it, and never add telemetry or external calls without explicit instruction.
- The app's only external request is the update check in Settings → About (a user-triggered fetch to the GitHub releases API, explicitly authorized). Everything else must stay free of telemetry and external calls.
- Do not run `git commit`, `git push`, or other git mutations unless explicitly asked.
