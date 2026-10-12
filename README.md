# TimeLineEditor (TiLiE)

TiLiE is a local browser editor and visualization tool for musical timelines represented by the Python `timetoalign` library. It edits a **workspace**, a canvas of **blocks**. A block places one **manifest** on the canvas: a TimeSkeleton manifest describes one timeline with exact rational coordinates, child offsets, conversion maps, regions, flow control, measure maps, and metric hierarchies, and knows nothing about where it is shown.

**Status: alpha.** `tilie-server` installs from PyPI, serves the bundled editor on `127.0.0.1` with a fresh token for each run, and reports its health. The release on PyPI predates the editor described here, which is in the source tree: it serves only the application shell. In the source tree, the `core` package holds the workspace and its schema 0.6.0 manifests: exact numbers, validated manifest load and save, the workspace view with its blocks, ids and order keys, the four commands `add`, `set`, `remove` and `style` over addresses with the library's invariants, a store whose command journal gives undo and redo, and the workspace file `<name>.tle.json`. The `editor` package opens, saves, imports and exports files, inspects and edits the selected block's manifest as JSON, YAML or TOML, and autosaves a workspace's text in the browser's IndexedDB. The `layout` package derives a drawing from a manifest, and the `writers` package turns drawings into element descriptors, SVG, and TikZ as the [timeskeleton drawing specification](https://github.com/TimeToAlign/timeskeleton/blob/main/docs/drawing.md) defines them. The `arranger` package shows a workspace's blocks on a canvas built on Svelte Flow, where blocks are dragged with snapping, resized in three modes, reordered, selected and deleted, each completed gesture one undoable command; the editor mounts it.

The editor is a header with a File menu (New workspace, Open…, Save, Save as…, Import manifest…, Export manifest…) and an About button, the canvas, and an inspector drawer that a tab at the right edge opens. Workspaces are `.tle.json` files; manifests are imported from and exported to TimeSkeleton JSON files. Unsaved changes are marked with `•` in the header, and an autosaved workspace is offered for restoring when the editor opens again. Loading sources through `timetoalign` on the server is not available yet; the local server exposes `/api/health`.

## Install

```bash
pip install tilie-server
tilie
```

`tilie` chooses a free loopback port, starts the local server, and opens the browser. Use `tilie --check` to verify an installed distribution. `tilie --port 43129` selects a port, and `tilie --no-browser` starts without opening a browser.

## Status

The server binds only to `127.0.0.1`, creates a random bearer token for each run, rejects foreign Host and Origin headers, serves the bundled application, protects `/api/health`, and sends `Referrer-Policy: no-referrer` with every response. `tilie` prints and opens `http://127.0.0.1:<port>/#token=<token>`: the token travels in the URL fragment, which the browser never sends to the server. The editor reads it, removes it from the address bar, and sends it with its health request. The token is held in memory only, so reloading the page loses it and the header then shows the "offline" mark; restart `tilie` for a fresh URL.

Of the six application packages, `core` implements the workspace, block, and manifest model described in [the architecture guide](docs/architecture.md#the-core-package). It loads manifests of every schema version timeskeleton supports, 0.5.0 and 0.6.0, migrating each to 0.6.0 with timeskeleton's `migrate`, and writes 0.6.0. `layout` exports `draw(manifest, placement, layers, metrics)`, which returns one derived drawing. `writers` exports `toDescriptors(drawing)`, `writeSvg(placed)`, and `writeTikz(placed, options)`; a placed drawing has `drawing`, `x`, `y`, and `scale`, and a page may contain more than one. `arranger` exports the canvas and the functions that turn its gestures into commands ([the canvas](docs/architecture.md#the-canvas)); `editor` is the application around it ([the editor](docs/architecture.md#the-editor)); `client` establishes boundaries only. There is no OpenAPI client, server-side loading or export endpoint yet.

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
