# Changelog

Release entries are written by release-please from the Conventional Commits since the previous release.

## [0.2.0](https://github.com/TimeToAlign/TimeLineEditor/compare/v0.1.0...v0.2.0) (2026-10-12)


### ⚠ BREAKING CHANGES

* the 24 earlier commands are replaced by `add`, `set`, `remove` and `style`; workspace values hold `blocks`; manifests follow timeskeleton 0.5.0.
* block records and commands use `scale` for the drawing scale; `zoom`, `margins`, `background` and `nameColumn` are no longer accepted.
* draw manifests per the TimeSkeleton drawing specification
* separate the workspace, its blocks and their manifests

### Features

* arrange blocks on a Svelte Flow canvas ([0ad0eeb](https://github.com/TimeToAlign/TimeLineEditor/commit/0ad0eebf5814dbd6d2de932f90b9f66bc2a83126))
* **core:** the editable TimeSkeleton document with commands, invariants and a Yjs binding ([ac427a7](https://github.com/TimeToAlign/TimeLineEditor/commit/ac427a77ef9d5e2a79bba865f5ec5d9dcb43efc5))
* draw manifests per the TimeSkeleton drawing specification ([4801604](https://github.com/TimeToAlign/TimeLineEditor/commit/480160475f47150e062f48046c3a253236fa1bbf))
* edit the workspace through four addressed commands and a journal ([f86591f](https://github.com/TimeToAlign/TimeLineEditor/commit/f86591ffa7bfc7161a783b29ffc15196f98b8836))
* lay out TimeSkeleton documents and write them as SVG and TikZ ([0218776](https://github.com/TimeToAlign/TimeLineEditor/commit/0218776c0e4b3f23fada5e2e01a79a6d62dc1735))
* open, save, import and inspect workspaces in the editor ([2011c6a](https://github.com/TimeToAlign/TimeLineEditor/commit/2011c6a931b6964626c1e3bed93a2f469ce7f42f))
* rename zoom to scale and draw per the revised specification ([1a18f0b](https://github.com/TimeToAlign/TimeLineEditor/commit/1a18f0b81e9885c19bf5c68476a9c5099632a6a0))
* separate the workspace, its blocks and their manifests ([9723c6c](https://github.com/TimeToAlign/TimeLineEditor/commit/9723c6c01796f5a58a95d1abbb34c93ee508f22f))


### Bug Fixes

* **editor:** keep the selection in step with the canvas and make the placement form follow gestures ([91dbaed](https://github.com/TimeToAlign/TimeLineEditor/commit/91dbaedf0bc9bccdfee54b4f48252516d0f341b7))

## [0.1.0] - 2026-10-10

### Added

- A pnpm TypeScript workspace with six packages and an enforced dependency ladder.
- A Svelte 5 browser shell with Arranger, Inspector, and Diagnostics panes and a health readout.
- A FastAPI local server with token, Host, and Origin protections, `/api/health`, static app serving, and the `tilie` command.
- Python and TypeScript test gates, dependency checks, release version checking, CI, wheel bundling, and PyPI trusted-publishing workflow configuration.
- Architecture decisions for the selected tools and distribution design.
- `Referrer-Policy: no-referrer` on every server response.

### Changed

- `tilie` hands the run's token to the editor in the URL fragment (`/#token=…`) instead of the query, so it never reaches the server's access log; the editor removes it from the address bar and the history entry.
- The `tilie-server` classifier is `Development Status :: 3 - Alpha`.
- The server manifest declares compatible ranges for its runtime and build dependencies (`fastapi>=0.141,<1`, `uvicorn[standard]>=0.53,<1`, `hatchling>=1.32`); `uv.lock` keeps the exact resolved versions.
