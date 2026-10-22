# Changelog

Release entries are written by release-please from the Conventional Commits since the previous release.

## [0.3.0](https://github.com/TimeToAlign/TimeLineEditor/compare/v0.2.0...v0.3.0) (2026-10-22)


### ⚠ BREAKING CHANGES

* address elements by objects and accept free ids unique across a manifest
* manifests and workspace files must carry the marker "timetoshare": "0.1.0"; a file with the marker "timeskeleton" is refused as not a TimeToShare manifest.
* read the revised manifest with abstract conversion maps, measure maps and flow-control elements
* the workspace file is format version 3, which adds `sessions` and a session entry kind to the journal and `places` and `bands` to every block; version 2 files are refused.

### Features

* address elements by objects and accept free ids unique across a manifest ([d732333](https://github.com/TimeToAlign/TimeLineEditor/commit/d732333ba2e429528fb66f00a6204b095a85a57f))
* bands as units, drawn per timeline and moved in the timeline editor ([1aef4ae](https://github.com/TimeToAlign/TimeLineEditor/commit/1aef4aebc270249c831d6b55845e9623ed603198))
* draw a timeline in several groups with one card per group ([ec38bc1](https://github.com/TimeToAlign/TimeLineEditor/commit/ec38bc18904649a168cd10fcc4995da5bb964842))
* edit bundles, groups and timelines in editors on the canvas ([2dc066b](https://github.com/TimeToAlign/TimeLineEditor/commit/2dc066bd18b346872cd3b0742a6f1796f6f6b2c6))
* edit group and bundle blocks, drawn with cards, frames and ancestor lines ([d0393c1](https://github.com/TimeToAlign/TimeLineEditor/commit/d0393c158a4e344096d5d3cc719f76e1d2903c43))
* hold one manifest shape per block, with segment delete, unknown length and unknown-key warnings ([e54e60a](https://github.com/TimeToAlign/TimeLineEditor/commit/e54e60a3e1fcae7c506bca32514f0c87f77af4d4))
* level tab, workspace name, gap spacing and editor selection fixes ([9aa5fe8](https://github.com/TimeToAlign/TimeLineEditor/commit/9aa5fe863ecc5de2d9028b14d517190046222a83))
* mark every box around the selection, thinning outward, and name every inspected element ([bbd82f8](https://github.com/TimeToAlign/TimeLineEditor/commit/bbd82f8465da1d5b65e54ec4552320e719bd7b97))
* read and write TimeToShare 0.1.0 manifests ([1b20731](https://github.com/TimeToAlign/TimeLineEditor/commit/1b20731fac17ecd9e092cc62fd7ccf76f773cf05))
* read the revised manifest with abstract conversion maps, measure maps and flow-control elements ([8a41908](https://github.com/TimeToAlign/TimeLineEditor/commit/8a419085fc5e9ab0f51508d53769a618e7d1f543))
* resize every box alike, undo one change at a time, edit each element's geometry ([03b738f](https://github.com/TimeToAlign/TimeLineEditor/commit/03b738f8d234b4261574fd2143f32d63294eff6a))
* select the box a press hits, refuse segment Delete, show a disabled Locked checkbox ([54e322f](https://github.com/TimeToAlign/TimeLineEditor/commit/54e322fe6510a3f1bc456205f4819c9e7911db0c))
* split the inspector into Properties and Manifest tabs, with a minimal view ([a8d46a4](https://github.com/TimeToAlign/TimeLineEditor/commit/a8d46a41b19e19cb295842f1d6a69a60d5818c9c))
* stretch every box vertically and keep requested margins in proportion ([64f1a95](https://github.com/TimeToAlign/TimeLineEditor/commit/64f1a950a5f3121f2530d26ffba9dcb129c35c6c))
* undo closed editor sessions by runs, move a multi-selection in the bundle editor ([4f0c747](https://github.com/TimeToAlign/TimeLineEditor/commit/4f0c7476755f11769c5f569fe4ebbd363d380462))


### Bug Fixes

* mark a group frame that holds the selection, and show Locked as a plain readable checkbox ([6c2eea5](https://github.com/TimeToAlign/TimeLineEditor/commit/6c2eea5744666a668b5dc5840f5ddecf82dd5166))

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
