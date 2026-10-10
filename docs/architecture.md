# Architecture

## Overview

TimeLineEditor (TiLiE) is a browser editor and visualization tool for musical timelines represented by `timetoalign`. Its canonical form is a TimeSkeleton document governed by the `timeskeleton` schema. A document can describe timelines with exact rational coordinates, children with exact offsets, conversion maps, regions, flow control, measure maps, and metric hierarchies.

TiLiE is local-first from the start: the browser communicates with a local Python server. The server is not an incidental wrapper. It owns loading through `timetoalign`, heavy computation, and exports, while the browser keeps a small editing core. This division keeps Python library capabilities close to the document operations that need them and keeps interaction responsive without a per-keystroke network request.

## What exists today and what is planned

The executable product today is intentionally small. `tilie-server` starts a FastAPI server on loopback, serves the built browser shell, and answers authenticated `GET /api/health`. The Svelte shell has three empty fixed panes, Arranger, Inspector, and Diagnostics, plus a health readout.

Of the six workspace packages, `core` implements the editable document: exact numbers, validated load and save, the command vocabulary with the library's invariants, and a Yjs binding with undo ([The core package](#the-core-package)). The other five establish exports, strict type checks, dependency boundaries, and tests, rather than document behavior, and the editor shell does not use `core` yet.

Data-derived layout, writers, loading through the server, exports, generated API clients, collaboration over a network, and automation endpoints are not implemented. Except for the core package, the remaining sections describe the intended architecture so additions have explicit boundaries; they do not describe current behavior as available functionality.

## The canvas

The canvas is a data-driven renderer rather than a diagram engine. It has two levels. At the figure level, blocks represent a timeline with its children, and eventually may represent a group or pane. Blocks can be freely placed or coordinate-locked to each other; interaction includes drag, snap, selection, pan, and zoom.

At the block level, geometry comes from document data rather than an editable drawing surface. Time maps to x through a per-block scale with elision segments. A layout over children, conversion maps, regions, and flow arcs determines y and the other shapes. A person edits the underlying document through commands, never by dragging an arrow endpoint. This preserves the meaning of a musical relation independently of a particular display.

## The document and commands

Exact rationals travel end to end. A coordinate is one atomic value, `{ unit, number_type, value }`, never a container of separately editable parts; its value is a JSON integer, a JSON number or a `[numerator, denominator]` Fraction pair as the number type selects, following the BOPP core primitives. Canvas geometry may use floats because it is derived display data, not canonical document data.

Every user operation is a named, serializable, validated command. Commands are the single entry point for the UI, tests, and automation. Before applying an edit, command handling checks invariants such as containment, number type, and unit. The schema validates the document on load, save, and export.

A CRDT document store is the persistence and synchronization base: Yjs in the browser (implemented in `core`, with undo) and pycrdt on the server (intended), with history and offline autosave to follow. Event tables remain outside the document and move as Arrow data rather than being embedded in TimeSkeleton.

## The core package

`@timetoalign/tilie-core` is framework-free: no DOM, no Svelte, no network. It has two entry points. The root export holds the numbers, the document types, `loadDocument` and `saveDocument`, `checkDocument`, `parseCommand` and `apply`, and the error types; it never imports Yjs. The subpath `@timetoalign/tilie-core/yjs` holds the Yjs binding: `createYDoc`, `toDocument`, `applyCommand`, `createUndoManager` and `LOCAL_ORIGIN`. Yjs is an optional peer dependency, so a host that needs only the reducers installs no CRDT. Two dependency-cruiser rules keep it so: only `src/yjs/` (and the tests of `core`) may import `yjs`, and nothing else in `core` may import `src/yjs/`. The package needs Node 22.18 or later, as `@timetoalign/timeskeleton` does.

### Numbers

`Rational` is an exact fraction over `BigInt`, always normalized (positive denominator, lowest terms). It is built from a `[numerator, denominator]` pair, a `bigint`, a safe integer or a decimal integer string, and never from a JavaScript float: `0.5` and `2 ** 53` are refused. A `Coordinate` is `{unit, numberType, value}` whose value is what the axis's number type declares: a `bigint` for `int`, a `number` for `float`, a `Rational` for `fraction`. `coordinateFromDict` and `coordinateToDict` mirror timetoalign's `coordinate_from_dict` and `coordinate_to_dict`: an `int` axis reads a JSON integer, or an integral JSON number as that integer; a `float` axis reads a JSON number, or an integer as the float it equals exactly; a `fraction` axis reads only a pair; every integer is int64-bounded. Arithmetic and comparison (`addCoordinates`, `subtractCoordinates`, `compareCoordinates`, `coordinatesEqual`) work within one axis only, and throw `AxisMismatchError` across units or number types.

### The document value

A loaded document is exactly the value `@timetoalign/timeskeleton`'s `parse` returns for a valid document, typed member by member. Every number in it is a `JsonNumber`: a plain `number` for a safe integer or a float with a fractional part, a `bigint` for an integer beyond 2^53, and a `JsonFloat` for an integral float, so that `600.0` stays a float and is written back as `600.0`. A command that carries a float whose value is an integer passes it as a `JsonFloat`. `core` reads, orders and writes no JSON of its own: reading, the canonical order and the standard writer are the schema package's.

### Load and save

`loadDocument(text)` reads the text with `parse` (which validates it against the schema version it declares), migrates an older document to the latest version, validates it, and then checks every invariant. It returns the document in canonical order, or a `LoadError` whose `problems` list `invalid_json` for text that is not JSON, the first `schema_violation` or `migration_failed` with the path the shared validator reports, or every invariant violation of a schema-valid document. `saveDocument(document)` validates the document and checks its invariants, throwing `InvalidDocumentError` with every problem, and writes it with the schema package's `dumps`: canonical order, the standard text, byte-identical to what the Python writer produces. Every golden fixture of the schema package loads and saves to its own bytes.

### Commands

Every edit is a command, a plain JSON object `{type, ...}`. The vocabulary has eighteen commands: `createTimeline`, `removeTimeline`, `setName`, `setLength`, `addChild`, `setChildOffset`, `removeChild`, `addRegion`, `setRegion`, `removeRegion`, `addBreak`, `removeBreak`, `addJump`, `removeJump`, `setMarker`, `removeMarker`, `addConversionMap` and `removeConversionMap`. A timeline is addressed by its id, which is unique across the document; a region or a marker by its name; a conversion map by its id; a break or a jump by its full value. Nothing is addressed by an array index. `addChild` places a new timeline or an existing root timeline in a parent at an offset and locks it; `removeChild` and `removeTimeline` delete the subtree. Class, unit and number type are fixed when a timeline is created. Conversion-map payloads, `meta`, `measure_map` and `metric_hierarchy` are carried verbatim, never edited member by member.

`parseCommand(value)` reads a command from any value, as a user interface or an agent sends it, and normalizes its coordinates as the library does (`[2, 4]` is stored as `[1, 2]`); a coordinate on another unit or number type is refused, never converted. `apply(document, command)` is a pure reducer: it never modifies its input and returns either the new document or a `CommandError` `{code, message, path}`, the path pointing into the command. The codes are stable strings, exported as `ErrorCode`:

- reading: `invalid_command`, `invalid_coordinate`, `schema_violation`;
- addressing: `unknown_timeline`, `unknown_region`, `unknown_break`, `unknown_jump`, `unknown_marker`, `unknown_map`, `not_a_root`, `not_a_child`, `child_is_ancestor`;
- invariants: `unit_not_allowed`, `number_type_not_allowed`, `off_axis`, `child_unit_mismatch`, `negative_offset`, `child_exceeds_parent`, `locked`, `length_below_content`, `negative_length`, `duplicate_region`, `region_end_before_start`, `duplicate_map`, `map_source_unit_mismatch`, `duplicate_timeline`;
- loading only: `invalid_json`, `migration_failed`, `child_not_locked`, `key_mismatch`, `metric_hierarchy_without_measure_map`.

### Invariants

The invariants are timetoalign's, checked twice: by `checkDocument` over a loaded document and by each reducer before its edit applies. A class admits its units and a unit its number types; a child has its parent's unit and a non-negative offset, ends within its parent, and is locked when placed; a locked timeline's length cannot be set, and no length falls below the end of a child; region names and conversion-map ids are unique on a timeline; a region does not end before it starts; a map's source unit is the timeline's unit; a metric hierarchy needs a measure map. A child placed past the end of an unlocked parent lengthens the parent to the child's end; a locked parent refuses. The catalogue in `app/packages/core/tests/README.md` names the library source of every row.

Five rules go beyond what the library enforces, because the editor addresses and stores values directly and refuses a document the library would not have written: timeline ids are unique across the whole document, a timeline stored under a key has that key as its id, a loaded child is locked (the library writes every child with `locked: true` and would silently lock one that is not), a coordinate of a region or of flow control must already carry the axis's number type (the library would re-express it), and a parent grows only to a value its own number type holds exactly (an `int` parent cannot grow to 9/2, a `float` parent cannot grow to 1/3). What the library does not enforce, `core` does not invent: a region, break, jump or marker may lie outside its timeline, and any number of breaks or jumps may share a coordinate.

A child shares its parent's unit but may have another number type. Its end, offset plus length, and every comparison against it follow Python's numeric tower: an `int` and a Fraction are exact, a sum with a float is a float with each exact operand correctly rounded first, and a float compares with an exact value exactly.

### The Yjs binding

One root `Y.Map` named `document` holds `meta` and `manifest`; `manifest.timelines` is a `Y.Map` by id and every timeline a `Y.Map` of its members. `children` is a `Y.Map` by id of `{offset, timeline}` maps, `conversion_maps` a `Y.Map` by map id, `regions` and `markers` `Y.Map`s by name. Breaks and jumps are `Y.Map`s keyed by an insertion key unique to the replica, not `Y.Array`s: in Yjs 13.6, once the creation of an array's parent has been undone and redone, redoing the removal of one entry also removes the entry after it, because adjacent array items are merged ([decisions/0013](../decisions/0013-yjs.md) has a reproduction). Map entries are never merged. No Yjs collection carries an order; the canonical order is derived when the document is materialized.

Every coordinate dict, conversion-map payload, region, break and jump entry, and `meta`, `measure_map` and `metric_hierarchy`, is one atomic value: one string holding its `compactJson` text, read back with `parseJson`. Yjs would otherwise turn a `JsonFloat` into a plain object and wrap integers at 2^63; the text keeps every number and the order of every member.

`applyCommand(ydoc, command)` materializes the document with `toDocument`, runs the pure reducer, and writes the minimal difference in one transaction whose origin is `LOCAL_ORIGIN`; a refused command writes nothing and returns its `CommandError`. `createUndoManager(ydoc)` tracks only that origin and never merges steps, so one command that changes the document is one undo step, and a command that changes nothing adds none.

Yjs merges concurrent edits from other replicas without the reducers, so a merged document can break an invariant: two replicas that move one timeline under different parents leave it in both. `checkDocument` reports such a document and `saveDocument` refuses to write it.

## The schema contract

`@timetoalign/timeskeleton` supplies generated types and a validator. The schema repository, not TiLiE, is the source of truth. The `timetoalign` library proves conformance in its own tests. TiLiE consumes that contract, preserving exact values and invoking validation at the document boundaries.

## Layout, writers and exports

The layout engine is intended to be a pure deterministic function that produces geometry in abstract units. A fixed input and style produces a fixed result, which lets layout be tested without the browser and lets each output use the same geometry.

Writers sit above that geometry and independently of the on-screen renderer. SVG, TikZ, PNG, and JPG are intended outputs; PNG and JPG rasterize SVG. `.drawio` and PDF are reserved for a future addition. Text-exact snapshots and golden fixtures shared with Python test writers and layout. No writer exists today.

## The server

`tilie-server` uses FastAPI and uvicorn. It binds only `127.0.0.1`, generates a random token for each run, rejects foreign Host and Origin headers, and requires `Authorization: Bearer <token>` on every `/api/` route. `tilie` hands the token to the browser in the URL fragment (`http://127.0.0.1:<port>/#token=<token>`). A browser never sends the fragment to the server, so the token does not appear in the access log; the editor reads it, removes it from the address bar and the current history entry with `history.replaceState`, and keeps it in memory only, so reloading the page after the handoff loses the token. Every response carries `Referrer-Policy: no-referrer`, so the browser sends none of the server's URLs to another site. The current server serves the built app from its wheel and implements `/api/health`; `tilie` selects a free port and opens the browser, while `tilie --check` verifies an installation.

The server is intended to load any supported source through `timetoalign` loaders; run conversion-map batches; report unfolding and traversal diagnostics with fix suggestions; validate; export; host a committed OpenAPI document and generated TypeScript client; run a CRDT room; and proxy a GitHub token. These responsibilities are not exposed by the current API.

## Packages and the dependency ladder

The TypeScript workspace is a one-way ladder enforced by [dependency-cruiser](../app/.dependency-cruiser.cjs). Lower packages never import higher packages. Only the UI packages may import Svelte.

| Package | Intended contents | Workspace dependencies |
| --- | --- | --- |
| `@timetoalign/tilie-core` | Document binding, commands, invariants, rationals, and schema types; framework-free. | None |
| `@timetoalign/tilie-layout` | Layout engine, style cascade, and filters. | core |
| `@timetoalign/tilie-writers` | Writers over derived geometry. | layout, core |
| `@timetoalign/tilie-arranger` | Svelte SVG rendering and interaction behavior. | layout, core |
| `@timetoalign/tilie-client` | OpenAPI client, Arrow helpers, and CRDT provider. | core |
| `@timetoalign/tilie-editor` | The Svelte application shell and its Arranger, Inspector, and Diagnostics panes. | all workspace packages |

Packages for views and embedding are added only when a concrete need appears. Apart from `core`, the packages have minimal exports, and the ladder keeps `core` free of the browser.

## Testing and quality

Tests are README-first: every `tests/README.md` states the validation logic, and tests follow it. Expected values are exact. Fixtures flow from Python to TypeScript so both sides work from the same examples: `core` loads and saves every golden fixture of the installed schema package byte for byte and refuses every shared rejection at its pinned path. Property tests with fast-check run generated command sequences from every golden fixture and check that accepted commands keep the document valid, that refused ones leave it unchanged, that the Yjs binding agrees with the reducers, that undo and redo restore every intermediate document, and that replicas converge. Current gates include Biome, Vitest, fast-check, dependency-cruiser, Ruff, and pytest. Playwright end-to-end testing and axe-core accessibility checks are intended additions.

The editor shell test covers the token handoff through the fragment and the absent token; it does not currently cover its CSS grid layout, mobile rendering, or a fragment carrying an empty token. The server static-file tests do not currently cover traversal behavior. These limits are documented coverage gaps rather than claims of behavior.

## Performance principles

Geometry is intended to be memoized per block hash. Viewport culling and semantic zoom keep the amount of rendered detail proportional to what can be seen. Heavy data stays out of the DOM, using WebGL panes and columnar tables where appropriate. Parsing and rendering work that can block interaction belongs in workers, and server calls do not occur for every keystroke. CI budgets will make these expectations measurable.

## Automation

The command layer and the server's OpenAPI document are the intended contracts for programmatic use. An MCP server and a command channel for live sessions are reserved for a future addition. At present, the only API route is the protected health endpoint.

## Dependencies and ADRs

Each dependency requires an ADR under [`decisions/`](../decisions/). The records use MADR headings, weigh writing the component ourselves, record maintenance and exit costs, name audited versions, and include review dates. See [the ADR convention](../decisions/0001-record-architecture-decisions.md), [the TypeScript choice](../decisions/0002-typescript.md), [the Svelte and Vite choice](../decisions/0003-svelte-5-with-vite.md), [the pnpm workspace choice](../decisions/0004-pnpm-workspaces.md), [the Biome choice](../decisions/0005-biome.md), [the Vitest choice](../decisions/0006-vitest.md), [the dependency-cruiser choice](../decisions/0007-dependency-cruiser.md), [the FastAPI and uvicorn choice](../decisions/0008-fastapi-and-uvicorn.md), [the Python tooling choice](../decisions/0009-uv-hatchling-ruff.md), [the wheel bundling decision](../decisions/0010-wheel-bundles-the-built-app.md), [the exact rationals written in core](../decisions/0011-exact-rationals-written-in-core.md), [the schema package](../decisions/0012-timeskeleton-package.md), [the Yjs choice](../decisions/0013-yjs.md), and [the fast-check choice](../decisions/0014-fast-check.md).

Manifests declare compatible ranges for runtime and peer dependencies, such as `fastapi>=0.141,<1` in the server and the optional peer `yjs` `^13.6.33` in `core`; development dependencies, the npm `devDependencies` and the server's `dev` group, are pinned exactly. Lockfiles pin every resolved version: `server/uv.lock` for Python and `app/pnpm-lock.yaml` for the application. A version must have been released at least 14 days before it enters a lockfile, and the ADR identifies the audited version. The one exception to that window is this project's own schema package, `@timetoalign/timeskeleton` (`minimumReleaseAgeExclude` in `app/pnpm-workspace.yaml`), so that a schema release can be consumed as soon as it is published. This policy deliberately separates compatibility declarations from reproducible resolutions.

## Deployment

Install the current product with `pip install tilie-server`, then run `tilie`. The installed wheel contains the built browser app, so starting it does not require Node.js or a runtime download.

The deployment model is intended to grow toward a hosted browser app that communicates with a user-run local server, a desktop wrapper, and collaborative hosting. Those deployment forms are not available today.
