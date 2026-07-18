# hoardodile

Privacy-first, self-hosted archiving app for personal media and documents (gallery, manga, novel). pnpm monorepo: Fastify + tRPC server, React SPA (TanStack Router/Query, Tailwind v4, shadcn/ui), iframe content plugins, Drizzle + better-sqlite3. This file is the instruction manual for coding agents — keep it updated when commands, conventions, or structure change.

## Commands

Prerequisites: Node.js 24, pnpm via corepack (`corepack enable`), then `pnpm install`.

- `pnpm dev` — web + server + plugin watches. `DEV_PLUGINS=gallery,manga` selects plugins (also accepts paths to external plugin dirs); `DEV_PLUGIN_PATHS` appends pre-built dists without watchers.
- `pnpm test` / `pnpm lint` / `pnpm format` — all tests / biome check + per-package `tsc --noEmit` / biome check + format with write. Turborepo-cached; repeat runs are near-instant.
- `pnpm build` — build all plugins, then the server (embeds web dist, plugin dists, migrations, assets).
- `pnpm build:pkgs` — build only non-apps packages (`packages/*` + `plugins/*`), skipping the web/server/docs apps.
- `pnpm db:generate` — regenerate Drizzle migrations from domain schemas.
- `pnpm -F @hoardodile/server setup:dev` — one-shot setup: write admin password, optionally restore a snapshot (`RESTORE_FROM`).
- `pnpm sdks:pack` — pack the plugin SDKs into `tmp/sdks/*.tgz` for out-of-tree plugin development.

The server has no CLI flags; all runtime configuration comes from environment variables validated by `apps/server/src/config/env.ts`.

## Coding guidelines

1. Follow the [Microsoft/TypeScript](https://github.com/microsoft/TypeScript) conventions.
2. Prefer type inference; do not annotate types that can be inferred.
3. Use type guards (`instanceof`, `typeof`), assertion functions (`asserts`), or `satisfies` instead of `as`.
4. Avoid arrow functions assigned to `let` or `const`.

## Dependencies

- Add runtime dependencies to the package that uses them, never to the workspace root. Versions shared by multiple packages go in the `catalog:` protocol in `pnpm-workspace.yaml`.
- Before adding a new library, check whether an existing dependency already covers it (e.g. `es-toolkit`, `dayjs` via `@hoardodile/shared/dayjs`).

## Project structure

```
apps/
  web/         React SPA (routes/, features/, components/)
  server/      Fastify (domain/ = business logic, infra/ = db/trpc/storage, config/, lib/, scripts/)
  docs/        Nextra documentation site
packages/
  consts/      Shared constants
  shared/      Utils, errors, pagination
  schemas/     Domain schemas, derived types, schema-related constants
  ui/          shadcn/ui + Radix + Base UI primitives, theme, hooks, components
  plugin-file/ Built-in fallback plugin for unknown file types
  plugin-sdk-{types,server,web,react}/  Plugin runtime types, server contract + build CLI, iframe/postMessage runtime, React bindings
plugins/       Content plugins (gallery, manga, novel) + template (third-party starting point; never bundled)
scripts/       Root dev/license/guard/version scripts
```

## Architecture

- **Domain-driven:** each domain follows `schema.ts` → `repo.ts` → `service.ts` → `router.ts`; plugin-exposing domains add `plugin.ts`. Services are `create*Service(deps)` factories — DI via closures, no classes.
- **Plugins:** `manifest.json` (UUID, permissions, i18n, UI templates) + server `main.js` (default-exports `definePlugin()` from `@hoardodile/plugin-sdk-server`) + sandboxed iframe client (`@hoardodile/plugin-sdk-web`, or `plugin-sdk-react` for React). Everything server-side lives in `apps/server/src/domain/plugin/`: lifecycle (`loader/discovery/activation/service/upload`), hook execution facade (`hooks.ts` — the ONLY way to invoke plugin hooks; methods take a ready-built `ResourceAPI`), `ResourceAPI` construction (`api.ts` — archive-backed + import-dir variants), and a per-plugin resident worker sandbox (`sandbox/`, structured-clone RPC + activity watchdog + memory cap). The plugin domain imports nothing from other domains; consumers (res/comment/danmaku/infra) go through `hooks.ts`/`api.ts`/`api-types.ts`. Third-party plugins join the dev loop via `DEV_PLUGINS` paths — see `plugins/template`.
- **Storage:** all server paths come from `apps/server/src/infra/storage/paths.ts`. `app.sqlite` = live DB, not synced; `versions/<v>/` = frozen syncable partitions, never deleted once released; `local/` = host-only state.
- **Archive write safety:** writes under `versions/<v>/` must target the latest version via `paths.latest` inside `writeVersioned` — never `paths.active` or `paths.atVersion(...)`. Enforced by `scripts/guard-versions.mjs` (pre-commit); exemptions need `// write-guard-exempt`.

## Testing

- Vitest, tests at `src/**/*.test.{ts,tsx}` — add or update tests for the code you change. Server: node env; web/plugins: jsdom, per-plugin `vitest.config.ts`.
- E2E: Playwright, specs at `apps/web/e2e/`; run with `pnpm -F @hoardodile/web test:e2e`.

## Generated files — never hand-edit

- `apps/web/src/routeTree.gen.ts` — TanStack Router.
- `apps/web/public/licenses.json` and `apps/web/public/LICENSE` — generated on web build/watch.
- `apps/server/src/infra/db/migrations/` — `pnpm db:generate`.
- `CHANGELOG.md` — `@release-it/conventional-changelog` on `pnpm release`.
- `pnpm-lock.yaml` — `pnpm install`.

## Commits & releases

- Conventional Commits (`type(scope): subject`), enforced by `scripts/verify-commit.mjs` (commit-msg hook).
- Before finishing a change, run in order: `pnpm format` → `pnpm lint` → `pnpm test`, all green.
- One unified app version, owned by the root `package.json`. Releases are cut only with `pnpm release` (release-it, needs `GITHUB_TOKEN`). **Never hand-edit a `version` field**; other workspace packages stay `0.0.0`.

## Guardrails

- Never add telemetry or external calls. The only authorized external request is the user-triggered update check in Settings → About; the deliberate lack of LAN-only restriction is a project decision — do not "fix" it.
- Do not run `git commit`, `git push`, or other git mutations unless explicitly asked.
