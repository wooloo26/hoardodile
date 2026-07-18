# Changelog

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
