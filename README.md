# TimeLineEditor (TiLiE)

TiLiE is a local browser editor and visualization tool for musical timelines represented by the Python `timetoalign` library. Its canonical document is a TimeSkeleton document: timelines with exact rational coordinates, child offsets, conversion maps, regions, flow control, measure maps, and metric hierarchies.

**Status: alpha.** `tilie-server` 0.1.0 installs from PyPI, serves the bundled editor shell on `127.0.0.1` with a fresh token for each run, and reports its health; it does not edit anything yet. In the source tree, the `core` package holds the editable TimeSkeleton document: exact numbers, validated load and save, eighteen commands with the library's invariants, and a Yjs binding with undo. The `layout` package draws a document as geometry, and the `writers` package writes that geometry as SVG and TikZ text, both as the [timeskeleton geometry specification](https://github.com/TimeToAlign/timeskeleton/blob/main/docs/geometry.md) defines them. The editor shell does not use these packages yet.

Today, TiLiE is an application shell. It serves a browser page with Arranger, Inspector, and Diagnostics panes plus a server-health readout; the local server exposes `/api/health`. Editing, loading documents, on-screen rendering, and export are not available in the application yet.

## Install

```bash
pip install tilie-server
tilie
```

`tilie` chooses a free loopback port, starts the local server, and opens the browser. Use `tilie --check` to verify an installed distribution. `tilie --port 43129` selects a port, and `tilie --no-browser` starts without opening a browser.

## Status

The server binds only to `127.0.0.1`, creates a random bearer token for each run, rejects foreign Host and Origin headers, serves the bundled application, protects `/api/health`, and sends `Referrer-Policy: no-referrer` with every response. `tilie` prints and opens `http://127.0.0.1:<port>/#token=<token>`: the token travels in the URL fragment, which the browser never sends to the server. The editor reads it, removes it from the address bar, and displays the health response. The token is held in memory only, so reloading the page loses it; restart `tilie` for a fresh URL.

Of the six application packages, `core` implements the document model described in [the architecture guide](docs/architecture.md#the-core-package), and `layout` and `writers` implement the drawing described in [Layout and writers](docs/architecture.md#layout-and-writers): `layout(document)` returns the geometry of a document in exact numbers, and `writeSvg(geometry)` and `writeTikz(geometry)` return its SVG and TikZ text, byte for byte the golden figures that timeskeleton ships. The other three establish boundaries and build tooling, and their exported behavior is intentionally minimal. There is no on-screen renderer, OpenAPI client, server-side loading or export endpoint yet, and the editor shell neither opens nor edits a document.

## Architecture

TiLiE keeps a small browser editing core and treats the local Python server as an equal peer for loading, computation, and exports. TimeSkeleton data remains exact and schema-validated, while screen geometry is derived from that data. The package structure prevents UI dependencies from leaking into the document core. Read [the architecture guide](docs/architecture.md) for the complete design and the distinction between current behavior and intended behavior.

## Development

Until `@timetoalign/timeskeleton` 0.3.0 is published, the workspace takes that package from a `timeskeleton` checkout next to this repository (a `link:` dependency); build it first:

```bash
git clone https://github.com/TimeToAlign/timeskeleton.git
cd timeskeleton/js && pnpm install && pnpm build && cd ../..
```

Clone the repository, then install and validate the application workspace:

```bash
git clone https://github.com/TimeToAlign/TimeLineEditor.git
cd TimeLineEditor/app
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Set up, test, and build the server separately:

```bash
cd ../server
uv sync
uv run pytest
uv build
```

The compile test of the TikZ figures needs `lualatex` with TikZ, `standalone`, `fontspec` and the DejaVu Sans font; without it the test is skipped, and with `TILIE_REQUIRE_LUALATEX=1` set it fails instead, as in CI.

The server wheel bundles the built app. From `server/`, `uv run tilie --check --static-dir ../app/packages/editor/dist` checks a development build. From the repository root, `python3 scripts/check_versions.py --tag v0.1.0` checks that a release tag matches both declared versions.

## Releasing

Release preparation, version checks, the tag-triggered workflow, and PyPI trusted publishing are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

TiLiE is released under the [MIT License](LICENSE). It depends on the `timetoalign` library, which is distributed separately.
