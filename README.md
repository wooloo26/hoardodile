# hoardodile

[简体中文](README.zh-CN.md) | [Docs](https://docs.hoardodile.com/)

[![Release](https://img.shields.io/github/v/release/wooloo26/hoardodile)](https://github.com/wooloo26/hoardodile/releases)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)

hoardodile is a privacy-first, self-hosted archiving app for your personal media and documents. It is single-user by design, stores everything on your own machine, and keeps immutable, versioned snapshots of your archive so you can sync and migrate hosts with any file-sync tool.

## Features

- **Versioned archiving** — each released version freezes its files and a DB snapshot under `versions/<v>/`; old versions stay read-only and are never deleted
- **Pluggable content types** — gallery, manga, and novel plugins ship built-in; unknown file types fall back to a generic file plugin
- **Organization** — resources, characters, documents, tags, messages, danmaku, search, and usage stats
- **Single-user authentication** — argon2-hashed password with session cookies; your data never leaves your host
- **Manual backup & host-switching** — sync the `versions/` directory with any tool you like, back up the DB in-app, and restore on the new host

## Quick start

Requirements: **Node.js 24** and **pnpm**.

```bash
pnpm install
pnpm build

# One-shot setup: writes the admin password (optionally restores a snapshot)
pnpm -F @hoardodile/server setup:dev

# Start the server (serves the built web app)
pnpm -F @hoardodile/server start
```

Then open <http://127.0.0.1:3000> and log in.

All runtime configuration comes from environment variables — see [.env.example](.env.example) for the full list (`HOST`, `PORT`, `STORAGE_ROOT`, upload limits, session settings, etc.).

## Development

```bash
pnpm dev        # web + server + plugin watches (DEV_PLUGINS=gallery,manga to select)
pnpm test       # all unit/integration tests (Vitest, Turborepo)
pnpm lint       # biome check + shared-write guard + tsc --noEmit
pnpm format     # biome check + format with write
pnpm db:generate  # generate Drizzle migrations from domain schemas
pnpm licenses:check    # check dependency licenses against the allowlist (runs in CI)
pnpm licenses:generate # generate apps/web/public/licenses.json (automatic on web build/watch)
pnpm release    # cut a release: bump + sync versions, tag, push, create GitHub Release
```

## Plugins

| Plugin  | Description                                                               |
| ------- | ------------------------------------------------------------------------- |
| Gallery | Built-in media gallery (images, animations, videos, danmaku, messages)    |
| Manga   | Manga reader with scroll/paged modes, per-page messages, position restore |
| Novel   | Novel reader                                                              |

Unknown file types are handled by `packages/plugin-file`, the built-in fallback plugin.

## Contributing

Issues (bug reports and feature requests) are welcome; pull requests are not accepted. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0](LICENSE). Third-party licenses and font attributions are listed in the app under Settings → Licenses.
