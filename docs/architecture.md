# Architecture

## Overview

TimeLineEditor (TiLiE) is a browser editor and visualization tool for musical timelines represented by `timetoalign`. Its canonical form is a TimeSkeleton document governed by the `timeskeleton` schema. A document can describe timelines with exact rational coordinates, children with exact offsets, conversion maps, regions, flow control, measure maps, and metric hierarchies.

TiLiE is local-first from the start: the browser communicates with a local Python server. The server is not an incidental wrapper. It owns loading through `timetoalign`, heavy computation, and exports, while the browser keeps a small editing core. This division keeps Python library capabilities close to the document operations that need them and keeps interaction responsive without a per-keystroke network request.

## What exists today and what is planned

The executable product today is intentionally small. `tilie-server` starts a FastAPI server on loopback, serves the built browser shell, and answers authenticated `GET /api/health`. The Svelte shell has three empty fixed panes, Arranger, Inspector, and Diagnostics, plus a health readout. Its six workspace packages currently establish exports, strict type checks, dependency boundaries, and tests, rather than document behavior.

Editing TimeSkeleton documents, data-derived layout, writers, loading, exports, generated API clients, collaboration, and automation endpoints are not implemented. The remaining sections describe the intended architecture so additions have explicit boundaries; they do not describe current behavior as available functionality.

## The canvas

The canvas is a data-driven renderer rather than a diagram engine. It has two levels. At the figure level, blocks represent a timeline with its children, and eventually may represent a group or pane. Blocks can be freely placed or coordinate-locked to each other; interaction includes drag, snap, selection, pan, and zoom.

At the block level, geometry comes from document data rather than an editable drawing surface. Time maps to x through a per-block scale with elision segments. A layout over children, conversion maps, regions, and flow arcs determines y and the other shapes. A person edits the underlying document through commands, never by dragging an arrow endpoint. This preserves the meaning of a musical relation independently of a particular display.

## The document and commands

Exact rationals travel end to end. A coordinate is one atomic value, `{ unit, number_type, value }`, never a container of separately editable parts; its value is a JSON integer, a JSON number or a `[numerator, denominator]` Fraction pair as the number type selects, following the BOPP core primitives. Canvas geometry may use floats because it is derived display data, not canonical document data.

Every user operation is a named, serializable, validated command. Commands are the single entry point for the UI, tests, and automation. Before applying an edit, command handling checks invariants such as containment, number type, and unit. The schema validates the document on load, save, and export.

A CRDT document store is intended as the persistence and synchronization base: Yjs in the browser and pycrdt on the server, with undo, history, and offline autosave. Event tables remain outside the document and move as Arrow data rather than being embedded in TimeSkeleton.

## The schema contract

`@timetoalign/timeskeleton` supplies generated types and a validator. The schema repository, not TiLiE, is the source of truth. The `timetoalign` library proves conformance in its own tests. TiLiE consumes that contract, preserving exact values and invoking validation at the document boundaries.

## Layout, writers and exports

The layout engine is intended to be a pure deterministic function that produces geometry in abstract units. A fixed input and style produces a fixed result, which lets layout be tested without the browser and lets each output use the same geometry.

Writers sit above that geometry and independently of the on-screen renderer. SVG, TikZ, PNG, and JPG are intended outputs; PNG and JPG rasterize SVG. `.drawio` and PDF are reserved for a future addition. Text-exact snapshots and golden fixtures shared with Python test writers and layout. No writer exists today.

## The server

`tilie-server` uses FastAPI and uvicorn. It binds only `127.0.0.1`, generates a random token for each run, rejects foreign Host and Origin headers, and requires `Authorization: Bearer <token>` on every `/api/` route. The current server serves the built app from its wheel and implements `/api/health`; `tilie` selects a free port and opens the browser, while `tilie --check` verifies an installation.

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

Packages for views and embedding are added only when a concrete need appears. Current packages have minimal exports, but the ladder already prevents a future core from becoming coupled to the browser.

## Testing and quality

Tests are README-first: every `tests/README.md` states the validation logic, and tests follow it. Expected values are exact. Fixtures flow from Python to TypeScript so both sides work from the same examples. Current gates include Biome, Vitest, dependency-cruiser, Ruff, and pytest. Playwright end-to-end testing and axe-core accessibility checks are intended additions.

The editor shell test does not currently cover its CSS grid layout, mobile rendering, or absent and empty-token behavior. The server static-file tests do not currently cover traversal behavior. These limits are documented coverage gaps rather than claims of behavior.

## Performance principles

Geometry is intended to be memoized per block hash. Viewport culling and semantic zoom keep the amount of rendered detail proportional to what can be seen. Heavy data stays out of the DOM, using WebGL panes and columnar tables where appropriate. Parsing and rendering work that can block interaction belongs in workers, and server calls do not occur for every keystroke. CI budgets will make these expectations measurable.

## Automation

The command layer and the server's OpenAPI document are the intended contracts for programmatic use. An MCP server and a command channel for live sessions are reserved for a future addition. At present, the only API route is the protected health endpoint.

## Dependencies and ADRs

Each dependency requires an ADR under [`decisions/`](../decisions/). The records use MADR headings, weigh writing the component ourselves, record maintenance and exit costs, name audited versions, and include review dates. See [the ADR convention](../decisions/0001-record-architecture-decisions.md), [the TypeScript choice](../decisions/0002-typescript.md), [the Svelte and Vite choice](../decisions/0003-svelte-5-with-vite.md), [the pnpm workspace choice](../decisions/0004-pnpm-workspaces.md), [the Biome choice](../decisions/0005-biome.md), [the Vitest choice](../decisions/0006-vitest.md), [the dependency-cruiser choice](../decisions/0007-dependency-cruiser.md), [the FastAPI and uvicorn choice](../decisions/0008-fastapi-and-uvicorn.md), [the Python tooling choice](../decisions/0009-uv-hatchling-ruff.md), and [the wheel bundling decision](../decisions/0010-wheel-bundles-the-built-app.md).

Manifests use compatible ranges where the contract needs them, such as `timetoalign>=1.2.0`. Lockfiles pin the resolved versions: `server/uv.lock` for Python and `app/pnpm-lock.yaml` for the application. A version must have been released at least 14 days before it enters a lockfile, and the ADR identifies the audited version. This policy deliberately separates compatibility declarations from reproducible resolutions.

## Deployment

Install the current product with `pip install tilie-server`, then run `tilie`. The installed wheel contains the built browser app, so starting it does not require Node.js or a runtime download.

The deployment model is intended to grow toward a hosted browser app that communicates with a user-run local server, a desktop wrapper, and collaborative hosting. Those deployment forms are not available today.
