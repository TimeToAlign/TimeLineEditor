# TimeLineEditor (TiLiE)

TiLiE is a local browser editor and visualization tool for musical timelines represented by the Python `timetoalign` library. It edits a **workspace**, a canvas of records. Its main record, the **block**, places one **manifest** on the canvas: a TimeSkeleton manifest describes one timeline with exact rational coordinates, child offsets, conversion maps, regions, flow control, measure maps, and metric hierarchies, and knows nothing about where it is shown.

**Status: alpha.** `tilie-server` installs from PyPI, serves the bundled editor shell on `127.0.0.1` with a fresh token for each run, and reports its health; it does not edit anything yet. In the source tree, the `core` package holds the workspace and its 0.4.0 manifests in memory: exact numbers, validated manifest load and save, the workspace view with its records, ids and order keys, twenty-four commands with the library's invariants, and a Yjs binding of one manifest. The `layout` package derives a drawing from a manifest, and the `writers` package turns drawings into element descriptors, SVG, and TikZ as the [timeskeleton drawing specification](https://github.com/TimeToAlign/timeskeleton/blob/main/docs/drawing.md) defines them. The editor shell does not use these packages yet, and no file format for a workspace exists yet.

Today, TiLiE is an application shell. It serves a browser page with Arranger, Inspector, and Diagnostics panes plus a server-health readout; the local server exposes `/api/health`. Editing, loading manifests, on-screen rendering, and export are not available in the application yet.

## Install

```bash
pip install tilie-server
tilie
```

`tilie` chooses a free loopback port, starts the local server, and opens the browser. Use `tilie --check` to verify an installed distribution. `tilie --port 43129` selects a port, and `tilie --no-browser` starts without opening a browser.

## Status

The server binds only to `127.0.0.1`, creates a random bearer token for each run, rejects foreign Host and Origin headers, serves the bundled application, protects `/api/health`, and sends `Referrer-Policy: no-referrer` with every response. `tilie` prints and opens `http://127.0.0.1:<port>/#token=<token>`: the token travels in the URL fragment, which the browser never sends to the server. The editor reads it, removes it from the address bar, and displays the health response. The token is held in memory only, so reloading the page loses it; restart `tilie` for a fresh URL.

Of the six application packages, `core` implements the workspace, block, and manifest model described in [the architecture guide](docs/architecture.md#the-core-package). It loads only schema 0.4.0 manifests. `layout` exports `draw(manifest, placement, layers, metrics)`, which returns one derived drawing. `writers` exports `toDescriptors(drawing)`, `writeSvg(placed)`, and `writeTikz(placed, options)`; a placed drawing has `drawing`, `x`, `y`, and `scale`, and a page may contain more than one. The other three packages establish boundaries and build tooling, and their exported behavior is intentionally minimal. There is no on-screen renderer, OpenAPI client, server-side loading or export endpoint yet, and the editor shell neither opens nor edits a workspace.

## Architecture

TiLiE keeps a small browser editing core and treats the local Python server as an equal peer for loading, computation, and exports. TimeSkeleton manifests remain exact and schema-validated, while the screen drawing is derived from them. The package structure prevents UI dependencies from leaking into the core. Read [the architecture guide](docs/architecture.md) for the complete design and the distinction between current behavior and intended behavior.

## Development

Clone the repository, then install and validate the application workspace (see [CONTRIBUTING.md](CONTRIBUTING.md#setup)):

```bash
git clone https://github.com/TimeToAlign/TimeLineEditor.git
cd TimeLineEditor/app
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

To render the writer review sheet, install `rsvg-convert` and run this from
the repository root:

```bash
pnpm -C app/packages/writers review
```

The command writes SVG and PNG renders plus `index.html` under
`app/packages/writers/review/`. It confines fontconfig to the DejaVu Sans file
bundled by timeskeleton and refuses to render when another font is visible.

Set up, test, and build the server separately:

```bash
cd ../server
uv sync
uv run pytest
uv build
```

The writer compile test needs `lualatex` with TikZ, `standalone`, and `fontspec`; it uses the DejaVu Sans file bundled by timeskeleton. Without `lualatex` the TikZ compilation is skipped, and with `TILIE_REQUIRE_LUALATEX=1` set its absence is a failure, as in CI. The same test parses every review SVG as XML.

The server wheel bundles the built app. From `server/`, `uv run tilie --check --static-dir ../app/packages/editor/dist` checks a development build. From the repository root, `python3 scripts/check_versions.py --tag vX.Y.Z` checks that a release tag matches both declared versions.

## Releasing

Release preparation, version checks, the tag-triggered workflow, and PyPI trusted publishing are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

TiLiE is released under the [MIT License](LICENSE). It depends on the `timetoalign` library, which is distributed separately.
