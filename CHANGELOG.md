# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to Semantic Versioning.

## [Unreleased]

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
