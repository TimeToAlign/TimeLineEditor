# TimeLineEditor (TiLiE)

TiLiE is a local browser editor and visualization tool for musical timelines represented by the Python `timetoalign` library. It edits a **workspace**, a canvas of **blocks**. A block places one **manifest** on the canvas: a TimeToShare manifest of the one shape every manifest has, holding one root timeline or several (each with exact coordinates, child offsets, conversion maps, regions and flow control), optionally grouped into timeline groups, beside the measure maps its conversion maps read. A manifest knows nothing about where it is shown.

**Status: alpha.** The editor described below is in the source tree. The `tilie-server` release on PyPI predates it and serves only the application shell: it installs, serves the bundled editor on `127.0.0.1` with a fresh token for each run, and reports its health.

What works in the source tree:

- **Manifests and workspaces** (`core`). Manifests of TimeToShare schema 0.2.0, the current version, with exact numbers:
  - validated load of any manifest, completed with every default it leaves out, and save in the complete or the minimal form;
  - unknown keys kept and written back, and timelines of unknown length;
  - element addresses, and the workspace view with its blocks, ids and order keys;
  - the four commands `add`, `set`, `remove` and `style` over addresses, under the library's invariants;
  - a store whose command journal gives undo and redo;
  - the workspace file `<name>.tle.json` (format version 7), named by default after the workspace.
- **Drawing** (`layout`, `writers`). Every manifest is drawn as one block opened by its title:
  - groups as frames, and each timeline as a root in a card; a member of several groups gets a card in each of their frames;
  - a member that is a child timeline drawn under the lines of its ancestors;
  - a timeline of unknown length scaled to its content and ending in three chevrons;
  - element descriptors, SVG and TikZ as the [TimeToShare drawing specification](https://github.com/TimeToAlign/TimeToShare/blob/main/docs/drawing.md) defines them.
- **The canvas** (`arranger`), built on Svelte Flow. Each completed gesture is one undoable command.
  - Blocks are dragged with snapping, reordered, selected and deleted, and so are timelines, groups and the other elements of a manifest, except segments, whose deletion is not supported yet.
  - A press on a box selects that box, a timeline's cards, a group's frame or the block; the card or frame under the pointer is highlighted.
  - Every block, frame and card is resized in the same three modes, Scale, Box and Stretch. A member's card is resized in the frame it is worked in, its size stated through that group.
- **Editors on the canvas.** A double-click opens a block, a group or a timeline in its bundle, group or timeline editor.
  - Done, or a double-click outside the edited element, keeps the changes as one journal entry; Cancel discards them.
  - Undo takes back a closed editor's changes by runs: the consecutive changes made in that editor and not in one nested in it. In the open editor its own changes are undone one at a time. Redo re-applies what undo took back, step for step.
  - In a timeline editor, the edited timeline's bands (markers, conversion maps, children, regions and flow control, stacked above and below its line) are selected and moved by drag, or by Ctrl or Cmd and an up or down arrow. Each move is one command that sets the timeline's band order in its manifest.
  - In the bundle editor, groups' frames and ungrouped timelines' cards are dragged freely. Dragging one that is in the selection moves everything selected by the same travel and keeps the selection.
- **The editor** (`editor`). One component that the page served by `tilie` uses, and that any other page can mount with `pnpm build:embed`'s `tilie.js` ([embedding](docs/architecture.md#embedding)).
  - A header with a File menu (New workspace, Open…, Save, Save as…, Import manifest…, Export manifest…, Export minimal manifest…), an Examples menu that adds one of four example manifests from TimeToShare as a new block or opens the example workspace "Timestamps" in place of the open one (asking first to save or discard unsaved changes), and an About button, the canvas, and an inspector drawer opened by a tab at the right edge.
  - Manifests are imported from any TimeToShare JSON file, each as a new block at the centre of the view, moved right past the blocks it would overlap (an open editor is closed first, as Done closes it), and exported in the complete or, on request, the minimal form, the file named after the manifest's `id`, else its `name`, else `bundle`.
  - The inspector's first tab, named by the level in view (Arranger, Bundle, Group or Timeline), names the workspace or the edited element. Its Properties tab renames the workspace or the inspected element, edits the geometry of the selected block, frame or card, puts the selected timelines into groups or takes them out (a timeline may be in several groups), lists a selected group's members to change them, and creates a new group of the selected timelines. Its Manifest tab edits the selected block's manifest as JSON, YAML or TOML and lists unknown keys as warnings. Its Journal tab lists the journal, newest first.
  - **Timestamps.** A timestamp is a timeline's cross-section at a position: the timeline's coordinate, that of every segment and displayed descendant its cross-section line crosses, and the values of their conversion maps. With Show coordinates on (the canvas toolbar, or C), hovering a timeline or one of its maps shows that timestamp in a flag, the position picked on the hovered row, and a click pins it in the Timestamp tab: there its exact values are copied with or without their unit, shown as JSON, YAML or TOML, and edited, every coordinate and every map value that can be solved for a position. Giving a pinned timestamp a name stores it in the manifest as a named timestamp, whose Display toggles choose what every export draws of it: its wedge, its name, ID and coordinate as stacked labels, and its dashed cross-section line. Every new root timeline, and every root of an imported manifest without a `graphical` object, is given the named timestamps `origin` and `length` (when its length is known), each drawing its wedge and coordinate; a timestamp at a timeline's end follows the end when the length changes. With Show coordinates off, a click on a named timestamp shows it in the tab, where it is renamed, moved by editing its values, or deleted. Two settings at the bottom of the tab cap how finely a position is picked: Denominator (2520 by default) for fraction axes and Decimals (3) for float axes, which also sets how floats are shown in the flag; the pointer takes the simplest value inside its pixel on the hovered row's axis, and zooming in reaches finer ones. Confirmations such as "Copied" appear in the message bar over the canvas and vanish after three seconds; warnings stay until dismissed.
  - Unsaved changes are marked with `•` in the header. A workspace's text is autosaved in the browser's IndexedDB and offered for restoring when the editor opens again.

Not available yet: loading sources through `timetoalign` on the server, which so far exposes `/api/health` and `/api/measure-maps`, the expansion of a manifest's measure maps.

## Install

```bash
pip install tilie-server
tilie
```

`tilie` chooses a free loopback port, starts the local server, and opens the browser. Use `tilie --check` to verify an installed distribution. `tilie --port 43129` selects a port, and `tilie --no-browser` starts without opening a browser.

## Status

The server binds only to `127.0.0.1`, creates a random bearer token for each run, rejects foreign Host and Origin headers, serves the bundled application, protects every `/api/` route, and sends `Referrer-Policy: no-referrer` with every response. `tilie` prints and opens `http://127.0.0.1:<port>/#token=<token>`: the token travels in the URL fragment, which the browser never sends to the server. The editor reads it, removes it from the address bar, and sends it with its health request. The token is held in memory only, so reloading the page loses it and the header then shows the "offline" mark; restart `tilie` for a fresh URL.

Of the six application packages, `core` implements the workspace, block, and manifest model described in [the architecture guide](docs/architecture.md#the-core-package). It reads and writes manifests of schema 0.2.0 only, the one version TimeToShare supports, and migrates nothing. `layout` exports `draw(manifest, placement, layers, metrics)`, which returns one derived drawing. `writers` exports `toDescriptors(drawing)`, `writeSvg(placed)`, and `writeTikz(placed, options)`; a placed drawing has `drawing`, `x`, `y`, and `scale`, and a page may contain more than one. `arranger` exports the canvas and the functions that turn its gestures into commands ([the canvas](docs/architecture.md#the-canvas)); `editor` is the application around it ([the editor](docs/architecture.md#the-editor)); `client` connects to the server and asks its health and the expanded rows of a manifest's measure maps. There is no generated API client, server-side loading or export endpoint yet.

## Architecture

TiLiE keeps a small browser editing core and treats the local Python server as an equal peer for loading, computation, and exports. TimeToShare manifests remain exact and schema-validated, while the screen drawing is derived from them. The package structure prevents UI dependencies from leaking into the core. Read [the architecture guide](docs/architecture.md) for the complete design and the distinction between current behavior and intended behavior.

## Development

Every application package takes the TimeToShare schema package, `@timetoalign/timetoshare`, from npm. Install and validate the application workspace (see [CONTRIBUTING.md](CONTRIBUTING.md#setup)):

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
bundled by TimeToShare and refuses to render when another font is visible.

Set up, test, and build the server separately:

```bash
cd ../server
uv sync
uv run pytest
uv build
```

The writer compile test needs `lualatex` with TikZ, `standalone`, and `fontspec`; it uses the DejaVu Sans file bundled by TimeToShare. Without `lualatex` the TikZ compilation is skipped, and with `TILIE_REQUIRE_LUALATEX=1` set its absence is a failure, as in CI. The same test parses every review SVG as XML.

The server wheel bundles the built app. From `server/`, `uv run tilie --check --static-dir ../app/packages/editor/dist` checks a development build. From the repository root, `python3 scripts/check_versions.py --tag vX.Y.Z` checks that a release tag matches both declared versions.

## Releasing

Release preparation, version checks, the tag-triggered workflow, and PyPI trusted publishing are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

TiLiE is released under the [MIT License](LICENSE). It depends on the `timetoalign` library, which is distributed separately.
