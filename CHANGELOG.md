# Changelog

## [0.1.4](https://github.com/wooloo26/hoardodile/compare/v0.1.3...v0.1.4) (2026-07-18)

### Features

* **server:** add CSP sandbox and frame-ancestors headers ([8f06627](https://github.com/wooloo26/hoardodile/commit/8f06627392b7ae00678d08f0a780f78b4acaee09))

### Bug Fixes

* **server:** scope plugin file tokens to a single resource ([edc81fb](https://github.com/wooloo26/hoardodile/commit/edc81fb83a5a6f56f98e8edeadabb5db975e7ffe))
* **web:** keep bridge handler tests out of the import.meta.glob bundle ([3cd742d](https://github.com/wooloo26/hoardodile/commit/3cd742d295b8b382acc55982e8efd016e44f40e4))
* **web:** scope iframe bridge methods to the iframe's own resource ([aa95bac](https://github.com/wooloo26/hoardodile/commit/aa95bac530f4bf09c4b2536ceea9b755ec13a54d))

## [0.1.3](https://github.com/wooloo26/hoardodile/compare/v0.1.2...v0.1.3) (2026-07-18)

### Features

* **build:** add build:pkgs script for non-apps packages ([758f785](https://github.com/wooloo26/hoardodile/commit/758f7856fc7aefd6b09f5554c1469ffc1059df75))
* **web:** confirm dialog with risk warning before plugin install ([4aeb758](https://github.com/wooloo26/hoardodile/commit/4aeb75835f885050934704ac4713f3344acdfa90))
* **web:** show declared permissions in plugin list ([7313a55](https://github.com/wooloo26/hoardodile/commit/7313a5597fd0706ca7f9b31ed6c805858b59c078))

### Bug Fixes

* **server:** cap plugin upload compressed and extracted size ([8ab2c9e](https://github.com/wooloo26/hoardodile/commit/8ab2c9eeb9596220fd01d13220ef88fa43f82f4f))
* **server:** cap probe buffering at 32MB per entry ([c699f9b](https://github.com/wooloo26/hoardodile/commit/c699f9b5358ada972b486bd904984f33274290d0))
* **server:** restrict path-token auth to GET file/frame route paths ([8b04680](https://github.com/wooloo26/hoardodile/commit/8b04680a209838a455401d690d0b53fc6f2fb16d))
* **server:** stop vite from bundling the sandbox worker as a browser worker ([0c04d65](https://github.com/wooloo26/hoardodile/commit/0c04d653f069243759c785fa743178c6e22e96b1))

### Performance Improvements

* **plugins:** parallelize per-file probe loops with bounded concurrency ([b4f4124](https://github.com/wooloo26/hoardodile/commit/b4f4124f601aa4f7688244ed10be752d043a74c0))
* **server:** aggregate file stats from the zip CD instead of per-file RPCs ([c03f93e](https://github.com/wooloo26/hoardodile/commit/c03f93ef728040dd4ba389f164f2485c7351dc15))
* **server:** cache host-side probes per resource entry ([7c264a6](https://github.com/wooloo26/hoardodile/commit/7c264a6fe9ee448f52ecf5864ffaa0df4d4c8545))
* **server:** cap concurrent meta rebuilds across resources ([27a36c2](https://github.com/wooloo26/hoardodile/commit/27a36c243af87c369776e5599dac15311281f3c0))
* **server:** keep the file-list cache across cover changes ([409d84f](https://github.com/wooloo26/hoardodile/commit/409d84ff012e526c3be1374fd7bff3d02b50419f))
* **server:** memoize archive stat per source view ([7764c5e](https://github.com/wooloo26/hoardodile/commit/7764c5e7409f5e21c259a7fc9eaa43fbb22b41d7))

## [0.1.2](https://github.com/wooloo26/hoardodile/compare/v0.1.1...v0.1.2) (2026-07-18)

### Features

* **server:** route plugin logs to console and guard meta hook failures ([82add2d](https://github.com/wooloo26/hoardodile/commit/82add2d86cd3f4521032ec5ada5ce16bc19e4719))

### Bug Fixes

* **release:** restore changelog generation and add CHANGELOG.md ([104956d](https://github.com/wooloo26/hoardodile/commit/104956ddcbdde324dde7608dd841be544402cf73))
* **server:** auto-recover degraded plugins once the crash window slides ([2991b40](https://github.com/wooloo26/hoardodile/commit/2991b4072c065585753382a3be7de6aa235d3816))
* **server:** guard plugin load against same-id races ([177138a](https://github.com/wooloo26/hoardodile/commit/177138ad175bb8085f1a8f3f6ad842b2cc56e7dd))
* **server:** ignore messages from stale plugin workers ([0e36d45](https://github.com/wooloo26/hoardodile/commit/0e36d45c45d0a0f1545eaf390157d175a63f85df))
* **server:** pause plugin watchdog while host API calls are in flight ([4578a68](https://github.com/wooloo26/hoardodile/commit/4578a6881a496f7730f9288ac7ffdcd03ae25a13))
* **server:** serialize plugin loader loadAll ([539748d](https://github.com/wooloo26/hoardodile/commit/539748d075bc8b7e9bc14847618111f5f0ddf8b8))
* **server:** terminate worker when plugin load fails ([cc19f6b](https://github.com/wooloo26/hoardodile/commit/cc19f6b8c4d28e90e2fb89c80c457a3e93e65f51))
* **web:** move documents start-page link from sidebar title to footer ([741fe77](https://github.com/wooloo26/hoardodile/commit/741fe77ec1cf40ffad5f1cdc85a51652bb2adb69))
* **web:** record documents home as the last-opened location ([0b396a7](https://github.com/wooloo26/hoardodile/commit/0b396a709ebd421b150d06d3f02ca927d3a56296))
* **web:** skip leave-guard confirm for same-location history pops ([9a0aeb7](https://github.com/wooloo26/hoardodile/commit/9a0aeb7eeae0ac64a3cab14239c962c195ba4f51))

## [0.1.1](https://github.com/wooloo26/hoardodile/compare/v0.1.0...v0.1.1) (2026-07-17)

### Features

* **plugins:** support byte-range readFile with chunked helper and size cap ([ff7a94f](https://github.com/wooloo26/hoardodile/commit/ff7a94ffc62b837b531e772dd0b5f6b5480f72c9))
* **plugins:** support out-of-tree plugin development ([52e04b6](https://github.com/wooloo26/hoardodile/commit/52e04b66c1ebf9758ab7f47ef695343ed11f41a5))
* **server:** run content plugin hooks in worker-thread sandbox ([0720fb2](https://github.com/wooloo26/hoardodile/commit/0720fb2044c7de3d471e1f8c82c52e6921a8863b))

### Bug Fixes

* **dev:** spawn services without shell args array to silence DEP0190 ([19f5136](https://github.com/wooloo26/hoardodile/commit/19f5136d9883cea852c1d3df773e382866fa5fb6))

## 0.1.0 (2026-07-17)
