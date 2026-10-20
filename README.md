# TimeLineEditor (TiLiE)

TiLiE is a local browser editor and visualization tool for musical timelines represented by the Python `timetoalign` library. It edits a **workspace**, a canvas of **blocks**. A block places one **manifest** on the canvas: a TimeSkeleton manifest of the one shape every manifest has, holding one root timeline or several (each with exact coordinates, child offsets, conversion maps, regions and flow control), optionally grouped into timeline groups, beside the measure maps its conversion maps read. A manifest knows nothing about where it is shown.

**Status: alpha.** `tilie-server` installs from PyPI, serves the bundled editor on `127.0.0.1` with a fresh token for each run, and reports its health. The release on PyPI predates the editor described here, which is in the source tree: it serves only the application shell. In the source tree, the `core` package holds the workspace and its manifests of schema 0.7.0, the current version: exact numbers, validated manifest load (any manifest, completed with every default it leaves out) and save (the complete form, or the minimal one), unknown keys kept and written back, timelines of unknown length, element addresses, the workspace view with its blocks, ids and order keys, the four commands `add`, `set`, `remove` and `style` over addresses with the library's invariants, a store whose command journal gives undo and redo, and the workspace file `<name>.tle.json` (format version 4), named by default after the workspace. The `editor` package opens, saves, imports and exports files, inspects and edits the selected block's manifest as JSON, YAML or TOML, listing its unknown keys as warnings, and autosaves a workspace's text in the browser's IndexedDB. The `layout` package derives a drawing from a manifest, every manifest drawn as one box opened by its title: groups as frames, each timeline drawn as a root in a card, a member that is a child timeline under the lines of its ancestors, and a timeline of unknown length scaled to its content and ending in three chevrons. The `writers` package turns drawings into element descriptors, SVG, and TikZ as the [timeskeleton drawing specification](https://github.com/TimeToAlign/timeskeleton/blob/main/docs/drawing.md) defines them. The `arranger` package shows a workspace's blocks on a canvas built on Svelte Flow, where blocks are dragged with snapping, reordered, selected and deleted, and so are timelines, groups and the other elements of a manifest except segments, whose deletion is not supported yet, and the element an open editor edits, each completed gesture one undoable command; a press on a box selects that box, a timeline's card, a group's frame or the block, the card or frame under the pointer is highlighted, and every box, a block, a frame or a card, is resized in the same three modes, Scale, Box and Stretch. A double-click opens a block, a group or a timeline in its bundle, group or timeline editor on the same canvas, where Done, or a double-click outside the edited element, keeps the changes as one journal entry, and Cancel discards them. Undo takes back a closed editor's changes by runs, a run being the consecutive changes made in that editor and not in one nested in it, so the changes of an editor in which no other editor made changes are undone at once; in the open editor its own changes are undone one at a time, and redo re-applies what undo took back, step for step. In a timeline editor, the bands of the edited timeline (its markers, conversion maps, children, regions and flow control, stacked above and below its line in its band order) are selected and moved, by drag or by Ctrl or Cmd and an up or down arrow, each move one command that sets the timeline's band order in its manifest. In the bundle editor, groups' frames and ungrouped timelines' cards are dragged freely, and a drag on one that is in the selection (the selection holds its frame or card, a member's card in its frame, or an element other than a frame or card that its group or timeline contains) moves every one in the selection by the same travel and keeps the selection. The `editor` package mounts the canvas in one component, which the page served by `tilie` uses and any other page can mount with `pnpm build:embed`'s `tilie.js` ([embedding](docs/architecture.md#embedding)); its inspector's first tab, named by the level in view (Arranger, Bundle, Group or Timeline), names the workspace or the edited element, its Properties tab renames the workspace or the inspected element and edits the geometry of the selected block, frame or card, and its Journal tab lists the journal, newest first.

The editor is a header with a File menu (New workspace, Open…, Save, Save as…, Import manifest…, Export manifest…, Export minimal manifest…) and an About button, the canvas, and an inspector drawer that a tab at the right edge opens. Workspaces are `.tle.json` files; manifests are imported from any TimeSkeleton JSON file and exported in the complete form, or in the minimal form on request, an exported file named after the manifest's `id`, else its `name`, else `bundle`. Unsaved changes are marked with `•` in the header, and an autosaved workspace is offered for restoring when the editor opens again. Loading sources through `timetoalign` on the server is not available yet; the local server exposes `/api/health`.

## Install

```bash
pip install tilie-server
tilie
```

`tilie` chooses a free loopback port, starts the local server, and opens the browser. Use `tilie --check` to verify an installed distribution. `tilie --port 43129` selects a port, and `tilie --no-browser` starts without opening a browser.

## Status

The server binds only to `127.0.0.1`, creates a random bearer token for each run, rejects foreign Host and Origin headers, serves the bundled application, protects `/api/health`, and sends `Referrer-Policy: no-referrer` with every response. `tilie` prints and opens `http://127.0.0.1:<port>/#token=<token>`: the token travels in the URL fragment, which the browser never sends to the server. The editor reads it, removes it from the address bar, and sends it with its health request. The token is held in memory only, so reloading the page loses it and the header then shows the "offline" mark; restart `tilie` for a fresh URL.

Of the six application packages, `core` implements the workspace, block, and manifest model described in [the architecture guide](docs/architecture.md#the-core-package). It reads and writes manifests of schema 0.7.0 only, the one version timeskeleton supports, and migrates nothing. `layout` exports `draw(manifest, placement, layers, metrics)`, which returns one derived drawing. `writers` exports `toDescriptors(drawing)`, `writeSvg(placed)`, and `writeTikz(placed, options)`; a placed drawing has `drawing`, `x`, `y`, and `scale`, and a page may contain more than one. `arranger` exports the canvas and the functions that turn its gestures into commands ([the canvas](docs/architecture.md#the-canvas)); `editor` is the application around it ([the editor](docs/architecture.md#the-editor)); `client` connects to the server and asks its health. There is no generated API client, server-side loading or export endpoint yet.

## Architecture

TiLiE keeps a small browser editing core and treats the local Python server as an equal peer for loading, computation, and exports. TimeSkeleton manifests remain exact and schema-validated, while the screen drawing is derived from them. The package structure prevents UI dependencies from leaking into the core. Read [the architecture guide](docs/architecture.md) for the complete design and the distinction between current behavior and intended behavior.

## Development

Every application package takes the TimeSkeleton schema package from a timeskeleton checkout beside this repository (a `link:` to `../timeskeleton/js`), so clone and build that first. Then install and validate the application workspace (see [CONTRIBUTING.md](CONTRIBUTING.md#setup)):

```bash
git clone https://github.com/TimeToAlign/timeskeleton.git
(cd timeskeleton/js && pnpm install && pnpm build)
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
