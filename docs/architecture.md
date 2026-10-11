# Architecture

## Overview

TimeLineEditor (TiLiE) is a browser editor and visualization tool for musical timelines represented by `timetoalign`. It works with three layers, each named by one word only:

- a **manifest** is one timeline as the `timeskeleton` schema (version 0.5.0) describes it: `{meta, timeline, graphical?}`, the timeline with exact rational coordinates, children at exact offsets, conversion maps, regions, flow control, measure maps and metric hierarchies, and the style rules of its own drawing. Every timeline, conversion map, region, break, jump and marker in it has an `id`, unique within the manifest, and a `name` where it is displayed. A manifest knows nothing about where, or how often, it is shown;
- a **block** carries one manifest, entirely its own, together with its placement, the other inputs of its drawing: position, scale, graphical length, vertical spacing, requested box size and band order. A block's styling is its manifest's `graphical`; the block has no style layer of its own;
- a **workspace** is the canvas: its blocks, their order, the workspace settings, and the command journal that produced them. Block ids are the workspace's namespace, and an address names anything in it.

TiLiE is local-first from the start: the browser communicates with a local Python server. The server is not an incidental wrapper. It owns loading through `timetoalign`, heavy computation, and exports, while the browser keeps a small editing core. This division keeps Python library capabilities close to the operations that need them and keeps interaction responsive without a per-keystroke network request.

## What exists today and what is planned

The executable product today is intentionally small. `tilie-server` starts a FastAPI server on loopback, serves the built browser shell, and answers authenticated `GET /api/health`. The Svelte shell has three empty fixed panes, Arranger, Inspector, and Diagnostics, plus a health readout.

Of the six workspace packages, `core` implements the three layers: exact numbers, validated 0.5.0 manifest load and save, the immutable workspace view with its blocks, ids and order, the four commands over addresses, a store with its command journal, and the workspace file ([The core package](#the-core-package)). `editor` autosaves a workspace's text in IndexedDB ([Autosave](#autosave)). `layout` derives a drawing from a manifest, placement, style layers, and font metrics; `writers` turns a drawing into element descriptors and writes placed drawings as SVG or TikZ ([Layout and writers](#layout-and-writers)). The other three establish exports, strict type checks, dependency boundaries, and tests, rather than editing behavior, and the editor shell uses none of these packages yet.

On-screen rendering and interaction, opening and saving a workspace file from the editor, loading through the server, raster exports, generated API clients, collaboration over a network, and automation endpoints are not implemented. Except for the core, layout and writers packages and the autosave, the remaining sections describe the intended architecture so additions have explicit boundaries; they do not describe current behavior as available functionality.

## The canvas

The canvas is a data-driven renderer rather than a diagram engine. It has two levels. At the workspace level, blocks are placed freely; interaction includes drag, snap, selection, pan, and zoom. A block draws one manifest, which today describes one timeline with its children; later versions of the schema may let a manifest describe a group of timelines or an alignment bundle instead.

At the block level, the drawing comes from the manifest rather than from an editable drawing surface. `draw` maps time to x through the placement's graphical length, applies its vertical spacing and requested box size, lays out children, regions and flow control in bands and rows in the placement's band order, and stacks each timeline's conversion maps against its own line. A placed drawing has a canvas position and a uniform scale. A person edits the underlying manifest through commands, never by dragging an arrow endpoint. This preserves the meaning of a musical relation independently of a particular display.

## Exact values and commands

Exact rationals remain exact while positions are carried to the root timeline's axis. A coordinate is one atomic value, `{ unit, number_type, value }`, never a container of separately editable parts; its value is a JSON integer, a JSON number or a `[numerator, denominator]` Fraction pair as the number type selects, following the BOPP core primitives. Layout converts a root-axis proportion to a double once and performs the remaining canvas arithmetic as binary64 in the order the drawing specification gives. The writers round the exact value of each resulting double to four decimal places, ties to even, when they serialize it. Canvas quantities of a block (position, scale, length, spacing, box size) are plain finite numbers: they place a drawing and carry no musical meaning.

Every edit is a serializable, validated command carrying its author and time. Commands are the single entry point for the UI, tests, and automation. Before applying an edit, command handling checks invariants such as containment, number type, and unit. The schema validates a manifest on load, on save, and whenever a command brings one into a block.

The workspace is a plain immutable value, changed only by applying a command. The store keeps every command it applies in a journal, which is saved in the workspace file beside the workspace it produced; replaying the journal reproduces the workspace, and the journal is also the undo history. Event tables remain outside the manifest and move as Arrow data rather than being embedded in TimeSkeleton.

## The core package

`@timetoalign/tilie-core` is framework-free: no DOM, no Svelte, no network. Its one entry point holds the numbers, the manifest types, `loadManifest`, `saveManifest` and `checkManifest`, the workspace view and blocks, ids and order keys, `parseCommand` and `apply`, the store and `replay`, `readWorkspace` and `writeWorkspace`, and the error types. The package needs Node 22.18 or later, as `@timetoalign/timeskeleton` does.

### Numbers

`Rational` is an exact fraction over `BigInt`, always normalized (positive denominator, lowest terms), with exact addition, subtraction, multiplication, division and `floor`. It is built from a `[numerator, denominator]` pair, a `bigint`, a safe integer or a decimal integer string, and never from a JavaScript float: `0.5` and `2 ** 53` are refused. A `Real` is a value as Python's numeric tower holds it, an exact `Rational` or a float; `addReal` and `compareReal` combine and compare such values as the tower does (a sum involving a float is a float, a comparison is exact), and `realOf` reads a coordinate's value as one. `fromFloat` returns the exact binary value of a float, as Python's `Fraction(float)` does, and `toFloat` the double nearest to a `Rational`; `fromFloat` serves arithmetic that must be exact on a float's value, such as the writers' page transform, and never re-expresses a coordinate. A `Coordinate` is `{unit, numberType, value}` whose value is what the axis's number type declares: a `bigint` for `int`, a `number` for `float`, a `Rational` for `fraction`. `coordinateFromDict` and `coordinateToDict` mirror timetoalign's `coordinate_from_dict` and `coordinate_to_dict`: an `int` axis reads a JSON integer, or an integral JSON number as that integer; a `float` axis reads a JSON number, or an integer as the float it equals exactly; a `fraction` axis reads only a pair; every integer is int64-bounded. Arithmetic and comparison (`addCoordinates`, `subtractCoordinates`, `compareCoordinates`, `coordinatesEqual`) work within one axis only, and throw `AxisMismatchError` across units or number types.

### The manifest value

A loaded manifest is exactly the value `@timetoalign/timeskeleton`'s `parse` returns for a valid 0.5.0 manifest, typed member by member (`Manifest`, `TimelineManifest`), including the optional `graphical` block of styles and statements. Every number in it is a `JsonNumber`: a plain `number` for a safe integer or a float with a fractional part, a `bigint` for an integer beyond 2^53, and a `JsonFloat` for an integral float, so that `600.0` stays a float and is written back as `600.0`. A command that carries a float whose value is an integer passes it as a `JsonFloat`. `core` reads, orders and writes no JSON of its own: reading, the canonical order and the standard writer, which sorts every object's keys by code point, are the schema package's.

### Load and save

`loadManifest(text)` reads the text with `parse`, which accepts only a valid 0.5.0 manifest, and then checks every invariant. It returns the manifest in canonical order, or a `LoadError` whose `problems` list `invalid_json` for text that is not JSON, the first `schema_violation` with the path the shared validator reports, or every invariant violation of a schema-valid manifest. `saveManifest(manifest)` validates the manifest and checks its invariants, throwing `InvalidManifestError` with every problem, and writes it with the schema package's `dumps`: canonical order, the standard text, byte-identical to what the Python writer produces. Every 0.5.0 manifest fixture of the schema package loads and saves to its own bytes.

### Commands

Every edit is a command, a plain JSON object `{type, ...}`, and there are four: `add`, `set`, `remove` and `style`. Each is aimed at addresses, and the kind of its target decides what it does. `apply(view, command)` is a pure reducer: it never modifies its input and returns either the new view or a `CommandError` `{code, message, path}`.

- `add {into, <kind>: value}` adds a `block` into `workspace`, or a `child`, `region`, `break`, `jump`, `marker` or `map` into a timeline's address. The value carries its id.
- `set {changes: [{target, values: {...properties}}]}` sets properties of blocks and elements; the properties are nested under `values`, so none of them (such as a jump's `target`) collides with the change's `target`. One gesture is one command, so moving five blocks is one `set` with five changes.
- `remove {targets}` removes blocks and elements, mixed; a block goes with every block whose `parent` chain reaches it, and a child timeline with its subtree.
- `style {select, set, name?, blocks?}` puts a style statement into the manifest of each listed block, or of every block with an element the selector matches when none is listed. With `name`, the declaration becomes a named style in that manifest's `styles`. A statement whose selector equals an existing one is merged into it; a property set to `null` is removed, and a statement left empty is dropped.

What each target admits:

| Target | Address | `set` | `add` into it | `remove` |
| --- | --- | --- | --- | --- |
| workspace | `workspace` | `grid {size, snap}`, `blockDefaults {scale, length, spacing, width, height, order}`, `graphical` (the default statements) | `block` | no |
| block | `<block>` | `x`, `y`, `index`, `scale`, `length`, `spacing`, `width`, `height`, `order`, `manifest` (whole) | none | yes |
| timeline (root or child) | `<block>/<id>` | `name`, `length`, `locked`, `meta`; a child also `offset` | `child`, `region`, `break`, `jump`, `marker`, `map` | a child yes; the root no (remove the block) |
| region | `<block>/<id>` | `name`, `start`, `end`, `meta` | none | yes |
| break | `<block>/<id>` | `coordinate`, `control_type`, `condition`, `repeat_count`, `label`, `name`, `meta` | none | yes |
| jump | `<block>/<id>` | `from_coordinate`, `to_coordinate`, `control_type`, `condition`, `repeat_count`, `label`, `meta`, and `target` (a marker id of the same timeline, or `null`) | none | yes |
| marker | `<block>/<id>` | `name`, `coordinate` | none | yes |
| conversion map | `<block>/<id>` | `map` (the payload, whole, its `id` unchanged) | none | yes |

A command is atomic: one refused change refuses it whole. Ids are never settable. A timeline's `class`, `unit` and `number_type`, its `measure_map` and its `metric_hierarchy` are not settable. Canvas numbers are doubles; positions of elements are coordinate dicts. The three ways of resizing a drawing are gestures that set different block properties, not commands. The caller mints the id of what it adds, so that replaying a journal is deterministic: a block id as described below, an element id with `nextId(view, block, prefix)`, the smallest `{prefix}_{N}` that no id in the block's manifest uses. An id already held is refused with `duplicate_id`.

`parseCommand(value)` reads a command from any value, as a user interface or an agent sends it, and `dispatch` and `apply` read every command through it. A refusal's path starts with the address of the target at fault, followed by the property or kind at fault (`[<address>, "length"]`), or by `"manifest"` and a location in the manifest the command would leave; only a malformed command, which has no target, names the malformed member of the command itself. The codes are stable strings, exported as `ErrorCode`:

- reading: `invalid_json`, `invalid_command`, `invalid_coordinate`, `invalid_value`, `schema_violation`;
- the workspace file: `unsupported_format`, `unsupported_version`, `unknown_member`, `missing_member`;
- the workspace: `invalid_block_id`, `block_kind_mismatch`, `unknown_parent`, `parent_cycle`, `invalid_index`, `duplicate_index`, `non_finite_number`, `non_positive_number`, `invalid_order`;
- addressing: `invalid_address`, `unknown_target`, `unknown_property`, `wrong_target_kind`, `id_not_settable`, `not_removable`, `duplicate_id`;
- manifest invariants: `unit_not_allowed`, `number_type_not_allowed`, `off_axis`, `child_unit_mismatch`, `negative_offset`, `child_exceeds_parent`, `child_not_locked`, `locked`, `length_below_content`, `region_end_before_start`, `map_source_unit_mismatch`, `metric_hierarchy_without_measure_map`, `key_mismatch`.

### Invariants

The manifest invariants are timetoalign's, checked twice: by `checkManifest` over a loaded manifest and by every command over the manifest it would leave. A class admits its units and a unit its number types; a child has its parent's unit and a non-negative offset, ends within its parent, and is locked when placed; a locked timeline's length cannot be set, and no length falls below the end of a child; a region does not end before it starts; a map's source unit is the timeline's unit; a metric hierarchy needs a measure map. A child placed past the end of an unlocked parent lengthens the parent to the child's end; a locked parent refuses. The catalogue in `app/packages/core/tests/README.md` lists every row. That ids are unique across the whole manifest, whatever the kinds of the elements carrying them, and that a jump's `target` names a marker of its timeline, are timeskeleton's identity rules, checked by its validator together with the schema; names are for display and may repeat.

Four rules go beyond what the library enforces, because the editor addresses and stores values directly and refuses a manifest the library would not have written: a child stored under a key has that key as its id, a loaded child is locked (the library writes every child with `locked: true` and would silently lock one that is not), a coordinate of a region or of flow control must already carry the axis's number type (the library would re-express it), and a parent grows only to a value its own number type holds exactly (an `int` parent cannot grow to 9/2, a `float` parent cannot grow to 1/3). What the library does not enforce, `core` does not invent: a region, break, jump or marker may lie outside its timeline, and any number of breaks or jumps may share a coordinate.

A child shares its parent's unit but may have another number type. Its end, offset plus length, and every comparison against it follow Python's numeric tower: an `int` and a Fraction are exact, a sum with a float is a float with each exact operand correctly rounded first, and a float compares with an exact value exactly.

### The workspace view

A workspace is held as a `View`, an immutable plain value: `meta` (`format: "tilie-workspace"`, `version: 1`), `settings` and `blocks`, a map from block id to block. The settings are `grid {size, snap}`, `blockDefaults` (scale 1, length 400, spacing 1, no requested box size, the band order `children`, `regions`, `flow`) and `graphical`, the workspace's default style statements, empty by default; the grid is 8 units with snapping.

A block has an `id`; a `blockKind`, `timeline` in this version, which must equal the top-level member of its manifest; a `parent`, the canvas group holding it, `null` in this version and never a timeline group, which lives in a manifest; an `index`, its order key among the blocks of the same parent; and exactly the inputs of its drawing besides the manifest's own: `x`, `y`, `scale`, `length`, `spacing`, `width` and `height` (each `null` for the content's own size), `order` (a permutation of `children`, `regions` and `flow`) and `manifest`. `checkWorkspace(view)` returns every problem of a view, by block id: a block stored under another key, a malformed id, a block kind that differs from its manifest, a missing parent, a cycle of parents, a malformed order key or one shared with a sibling, a canvas number that is not finite, a block scale, length, spacing, width or height that is not positive, a band order that is not a permutation of the three groups, and every schema or invariant problem of a block's manifest.

### Ids, addresses and order

A block id is ten characters from `0-9a-z`, drawn from the platform's cryptographic random source, rejecting bytes that would bias the alphabet. Block ids are the workspace's namespace. An address is `workspace`, a block id, or a block id followed by `/` and the id of an element of that block's manifest; a drawn part of an element appends `/start`, `/end` (the root's wedges), `/name` or `/label` to the element's address, as timeskeleton's drawing specification addresses it in the descriptors. A block id holds no `/`, so the first `/` splits an address (`parseAddress`, `formatAddress`); `mintBlockId()` draws a block id and `manifestIds(manifest)` lists every id of a manifest. Element ids live inside a manifest, unique there across every kind and freely repeated across blocks; the id a manifest carries is the id, and `nextId` mints `{prefix}_{N}` (`clt_1`, `region_1`, `break_2`) only for an element that has none, following timetoalign's scheme.

Sibling order is a fractional index: a string key that compares with ordinary string comparison, so that a block moves between two others by taking a key between theirs, without renumbering. `indexBetween(a, b)` returns one key strictly between two keys (`null` for an open end), `indicesBetween(a, b, n)` returns `n` increasing keys, and `isIndex(key)` validates one. Keys are compatible with those of Rocicorp's `fractional-indexing` 4.0.0, written in `core` ([decisions/0016](../decisions/0016-fractional-indexing.md)).

### The store and its journal

`createStore(workspace, {author?, clock?})` holds a workspace and returns `view`, `journal`, `dispatch(command)`, `undo()`, `redo()`, `canUndo`, `canRedo`, `setAuthor(name)` and `subscribe(listener)`, which returns a function that unsubscribes. `dispatch` stamps the command with its author (by default `Gerhardt`) and its time (ISO 8601, UTC, from the injected clock), applies it with the pure `apply`, and appends the entry `{command, author, time}` to the journal; it returns `null`, or the `CommandError` of a refused command, which leaves the store unchanged. The journal is the undo history: `undo` moves its last entry to a redo stack kept in memory, `redo` moves it back, and a new command clears the redo stack. `replay(journal)` applies a journal from the empty workspace and returns every view on the way; the last has the workspace's settings and blocks, so undo reaches back across sessions. Views of the current session are kept with structural sharing, and the first undo past the session's start replays the journal once to recover the earlier views. The store's decision record is [decisions/0019](../decisions/0019-workspace-store-and-journal.md).

### The workspace file

A workspace is saved as one JSON file, `<name>.tle.json`: `{meta, settings, blocks, journal}`, with every manifest embedded whole. It holds the blocks, never the canvas engine's own state, so a text diff of two files shows only real changes. `writeWorkspace(workspace)` writes a `Workspace`, `{view, journal}`, with timeskeleton's standard writer `dumps`, which sorts the keys of every object by code point. `readWorkspace(text)` reads it with timeskeleton's lossless `parseJson` and returns the `Workspace` or a `LoadError` listing every problem; it refuses another `format` (`unsupported_format`), another `version` (`unsupported_version`), any unknown or missing member, any malformed block or journal entry, and any manifest that fails the schema or an invariant, at its path in the file. This is version 1 of the format, and there is no migration code. `writeWorkspace(readWorkspace(text))` returns the text it read, byte for byte. `core` is the one implementation of the format; other programs read the file as plain JSON, and a block's manifest is a TimeSkeleton manifest that timetoalign reads with `Timeline.from_dict`.

### Autosave

The `editor` package keeps the last text of each workspace in the browser's IndexedDB, one slot per workspace key ([decisions/0018](../decisions/0018-indexeddb-autosave.md)). `createAutosave({key, delayMs})` returns `schedule(text)`, which writes the text once no further text was scheduled for `delayMs`, and `flush()`, which writes the pending text now and waits for every write; `recoverWorkspace(key)` returns the last written text or `null`, and `clear(key)` empties a slot. The autosave stores the text `writeWorkspace` returns and never parses it. A storage failure reaches the caller as a promise rejected with an `AutosaveError` whose `code` is `indexeddb_unavailable` or `indexeddb_failed`.

## The schema contract

`@timetoalign/timeskeleton` supplies the generated types, 0.5.0 validator, standard writer, drawing font and font metrics. The schema repository, not TiLiE, is the source of truth. The `timetoalign` library proves conformance in its own tests. TiLiE consumes that contract, preserving exact values and invoking validation at the manifest boundaries.

## Layout and writers

The drawing of a manifest is specified in the schema repository, not here: timeskeleton's [drawing specification](https://github.com/TimeToAlign/timeskeleton/blob/main/docs/drawing.md) defines the `graphical` block, arithmetic, default styles, font, layout, element descriptors, page, and SVG and TikZ profiles completely enough that another implementation writes the same text byte for byte. The specification, together with the SVG and TikZ fixtures of a schema version, pins the drawing. A drawing is derived and is not exchanged as JSON; there is no drawing schema.

`@timetoalign/tilie-layout` exports `draw(manifest, placement, layers, metrics)`, a pure deterministic function. The placement supplies the root's graphical length, vertical spacing, requested box size, and band order. The layers are the ordered `Graphical` blocks of the cascade, from lowest to highest precedence: the specification's defaults, the workspace settings' `graphical`, and the manifest's own `graphical`; nothing lies above the manifest. The metrics are the advance widths of the bundled drawing font. The returned `Drawing` contains its box size, its elements in descriptor order, and the code points measured with the font's fallback advance. Layout measures text, places bands and rows, and produces box-local canvas coordinates; it knows nothing about the drawing's position on a page.

The style cascade is represented by `Cascade`, `INITIAL_STYLE`, and `DEFAULT_LAYER`. Each statement selects elements by the members of its `select` object and sets a declaration directly or through a name in the same layer's `styles`. The layer order and the statement rank defined by the specification decide each property independently; inherited properties fall through the element tree, and initial values fill the rest. `display: none` removes an element from both the drawing and its layout.

`@timetoalign/tilie-writers` exports `toDescriptors(drawing)`, `writeSvg(placed)` and `writeTikz(placed, options)`. `toDescriptors` returns the ordered SVG-shaped descriptors that an on-screen renderer and both writers share. `placed` is a list of `{drawing, x, y, scale}` values. The writers find the bounding box of all placed drawings, add a margin of 16 on every side, translate each drawing to the page, and apply its uniform scale. `writeSvg` returns one SVG page. `writeTikz` returns a complete LuaLaTeX document by default; `standalone: false` returns the `tikzpicture` environment alone, and `fontDirectory` names the directory containing `DejaVuSans.ttf`. Both writers round the exact value of every double to four decimal places, ties to even, and neither depends on the on-screen renderer.

`pnpm -C app/packages/writers review`, run from the repository root, draws every 0.5.0 manifest fixture and the additional resize and style cases, then writes SVG and PNG files plus `index.html` under `app/packages/writers/review/`. It rasterizes the SVG files at twice their size with `rsvg-convert --zoom 2`. A temporary fontconfig configuration exposes only timeskeleton's bundled `DejaVuSans.ttf`; the command refuses to render if another font is visible or the rasterizer fails. This review workflow is recorded in [the rasterizer decision](../decisions/0017-rsvg-convert-for-review-renders.md).

The drawing is computed per block and can be cached by the inputs to `draw`. The review command rasterizes writer output for inspection; the application does not expose PNG, JPG, PDF, or `.drawio` export.

## The server

`tilie-server` uses FastAPI and uvicorn. It binds only `127.0.0.1`, generates a random token for each run, rejects foreign Host and Origin headers, and requires `Authorization: Bearer <token>` on every `/api/` route. `tilie` hands the token to the browser in the URL fragment (`http://127.0.0.1:<port>/#token=<token>`). A browser never sends the fragment to the server, so the token does not appear in the access log; the editor reads it, removes it from the address bar and the current history entry with `history.replaceState`, and keeps it in memory only, so reloading the page after the handoff loses the token. Every response carries `Referrer-Policy: no-referrer`, so the browser sends none of the server's URLs to another site. The current server serves the built app from its wheel and implements `/api/health`; `tilie` selects a free port and opens the browser, while `tilie --check` verifies an installation.

The server is intended to load any supported source through `timetoalign` loaders; run conversion-map batches; report unfolding and traversal diagnostics with fix suggestions; validate; export; host a committed OpenAPI document and generated TypeScript client; and proxy a GitHub token. These responsibilities are not exposed by the current API.

## Packages and the dependency ladder

The TypeScript workspace is a one-way ladder enforced by [dependency-cruiser](../app/.dependency-cruiser.cjs). Lower packages never import higher packages. Only the UI packages may import Svelte.

| Package | Intended contents | Workspace dependencies |
| --- | --- | --- |
| `@timetoalign/tilie-core` | The workspace view, blocks, ids and order keys; the manifest value with its load, save and invariants; the commands, the store and the workspace file; rationals and coordinates; framework-free. | None |
| `@timetoalign/tilie-layout` | `draw`, drawing types, the style cascade, defaults, and font measurement. | core |
| `@timetoalign/tilie-writers` | Element descriptors, page placement, and SVG and TikZ writers over drawings. | layout, core |
| `@timetoalign/tilie-arranger` | Svelte rendering of the workspace canvas and its interaction behavior; it may embed a block written by the writers. | writers, layout, core |
| `@timetoalign/tilie-client` | OpenAPI client and Arrow helpers. | core |
| `@timetoalign/tilie-editor` | The Svelte application shell, its Arranger, Inspector, and Diagnostics panes, and the autosave. | all workspace packages |

Packages for views and embedding are added only when a concrete need appears. Apart from `core`, `layout` and `writers`, the packages have minimal exports, and the ladder keeps `core` free of the browser.

## Testing and quality

Tests are README-first: every `tests/README.md` states the validation logic, and tests follow it. Expected values are exact. Fixtures flow from Python to TypeScript so both sides work from the same examples: `core` loads and saves every 0.5.0 manifest fixture of the schema package byte for byte and refuses every shared rejection at its pinned path. Property tests with fast-check run generated command sequences from every 0.5.0 manifest fixture and check that accepted commands keep the workspace and every block's manifest valid, that refused ones leave the view unchanged, that undo and redo restore every intermediate view, that replaying the journal equals the snapshot, that every journal entry carries its author and the injected clock's time, and that a workspace file reads and writes back to its own bytes. Budgets bound reading and writing a 300-block workspace with a 1,000-entry journal (250 ms each) and dispatching one command (1 ms); the store's decision record holds the figures, 10,000 blocks included. `layout` tests derive exact expected drawings from the drawing specification and cover defaults, the cascade, text metrics, side placement, map stacks and end markers, stretch, requested box size, and representative fixtures. Writer tests derive descriptors and serialized text from the same specification, check multi-drawing page placement and number formatting, parse every review SVG as XML, and compile every review TikZ document under LuaLaTeX with the bundled font. Current gates include Biome, Vitest, fast-check, dependency-cruiser, LuaLaTeX, Ruff, and pytest. Playwright end-to-end testing and axe-core accessibility checks are intended additions.

The editor shell test covers the token handoff through the fragment and the absent token; it does not currently cover its CSS grid layout, mobile rendering, or a fragment carrying an empty token. The server static-file tests do not currently cover traversal behavior. These limits are documented coverage gaps rather than claims of behavior.

## Performance principles

A derived drawing can be memoized from its manifest, placement, style layers, and metrics. Viewport culling and semantic zoom keep the amount of rendered detail proportional to what can be seen. Heavy data stays out of the DOM, using WebGL panes and columnar tables where appropriate. Parsing and rendering work that can block interaction belongs in workers, and server calls do not occur for every keystroke. CI budgets will make these expectations measurable.

## Automation

The command layer (`parseCommand` and `apply` over a workspace view) and the server's OpenAPI document are the intended contracts for programmatic use. An MCP server and a command channel for live sessions are reserved for a future addition. At present, the only API route is the protected health endpoint.

## Dependencies and ADRs

Each dependency requires an ADR under [`decisions/`](../decisions/). The records use MADR headings, weigh writing the component ourselves, record maintenance and exit costs, name audited versions, and include review dates. See [the ADR convention](../decisions/0001-record-architecture-decisions.md), [the TypeScript choice](../decisions/0002-typescript.md), [the Svelte and Vite choice](../decisions/0003-svelte-5-with-vite.md), [the pnpm workspace choice](../decisions/0004-pnpm-workspaces.md), [the Biome choice](../decisions/0005-biome.md), [the Vitest choice](../decisions/0006-vitest.md), [the dependency-cruiser choice](../decisions/0007-dependency-cruiser.md), [the FastAPI and uvicorn choice](../decisions/0008-fastapi-and-uvicorn.md), [the Python tooling choice](../decisions/0009-uv-hatchling-ruff.md), [the wheel bundling decision](../decisions/0010-wheel-bundles-the-built-app.md), [the exact rationals written in core](../decisions/0011-exact-rationals-written-in-core.md), [the schema package](../decisions/0012-timeskeleton-package.md), [the fast-check choice](../decisions/0014-fast-check.md), [TeX Live for the TikZ checks](../decisions/0015-tex-live-for-tikz-checks.md), [the fractional indices written in core](../decisions/0016-fractional-indexing.md), [rsvg-convert for review renders](../decisions/0017-rsvg-convert-for-review-renders.md), [the autosave written in `editor`](../decisions/0018-indexeddb-autosave.md), and [the workspace store and its journal](../decisions/0019-workspace-store-and-journal.md).

Package manifests (`package.json`, `pyproject.toml`) declare compatible ranges for runtime and peer dependencies, such as `fastapi>=0.141,<1` in the server and `svelte` `^5.57.1` in `editor`; development dependencies, the npm `devDependencies` and the server's `dev` group, are pinned exactly. Lockfiles pin every resolved version: `server/uv.lock` for Python and `app/pnpm-lock.yaml` for the application. A version must have been released at least 14 days before it enters a lockfile, and the ADR identifies the audited version. The one exception to that window is this project's own schema package, `@timetoalign/timeskeleton` (`minimumReleaseAgeExclude` in `app/pnpm-workspace.yaml`), so that a schema release can be consumed as soon as it is published. This policy deliberately separates compatibility declarations from reproducible resolutions.

## Deployment

Install the current product with `pip install tilie-server`, then run `tilie`. The installed wheel contains the built browser app, so starting it does not require Node.js or a runtime download.

The deployment model is intended to grow toward a hosted browser app that communicates with a user-run local server, a desktop wrapper, and collaborative hosting. Those deployment forms are not available today.
