---
status: accepted
date: 2026-10-12
---

# Arrange blocks with Svelte Flow, one node per block

## Context

The arranger is the canvas on which the blocks of a workspace are placed:
drag, snap, marquee and keyboard selection, pan and zoom, resize handles,
touch gestures, culling of off-screen blocks and keyboard accessibility. A
block's drawing is ours (an SVG rendered from the layout, identical to the
export); only the placement of whole blocks is interactive.

The arranger keeps the workspace as the single source of truth. The canvas
receives a projection of it as nodes, shows its own preview while a gesture
runs, and the finished gesture becomes one command; the store's next value
then replaces the preview.

## Considered options

- `@xyflow/svelte` 1.7.0 (Svelte Flow), MIT, Svelte 5 components over
  `@xyflow/system` 0.0.83, the framework-neutral core shared with React Flow.
- `@xyflow/react` 12.12.0 (React Flow): the same core and feature set, but it
  would bring React into an editor built with Svelte (decision 0003).
- maxGraph 0.25.0, Apache-2.0: pre-1.0, owns its own graph model, no culling
  and no keyboard accessibility.
- Excalidraw 0.18.1, MIT: a closed element set drawn on Canvas2D in React;
  custom nodes need a fork.
- JointJS core (MPL-2.0) and diagram-js (MIT): each owns a model we would
  have to mirror, and neither provides keyboard accessibility.
- Write it ourselves over `d3-zoom` and `d3-drag`: pan and zoom are small, but
  marquee selection, snapping, resize handles, touch, keyboard moves, culling
  and focus management are the long tail Svelte Flow already carries.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | Svelte Flow | React Flow | maxGraph | Excalidraw | Own code |
| --- | ---: | ---: | ---: | ---: | ---: |
| Maintenance cost | 4 | 4 | 2 | 3 | 2 |
| Size and transitive dependencies | 4 | 3 | 3 | 2 | 5 |
| Licence | 5 | 5 | 5 | 5 | 5 |
| Fit (custom block nodes, controlled state, accessibility) | 5 | 4 | 2 | 1 | 3 |
| Exit cost | 4 | 3 | 2 | 2 | 5 |
| **Total** | **22** | **19** | **14** | **13** | **20** |

## Decision

Use `@xyflow/svelte` (range `^1.7.0`, locked at 1.7.0) in
`packages/arranger` only; dependency-cruiser forbids importing
`@xyflow/svelte` or `@xyflow/system` from any other package. The arranger
also imports `@xyflow/system` directly (range `^0.0.83`, which on a 0.0.x
version admits only 0.0.83) for its auto-pan curve, `calcAutoPan`, so both
packages must be upgraded together, to the `@xyflow/system` version the new
`@xyflow/svelte` depends on.

One Svelte Flow node per block. Every node is projected *complete*: `width`,
`height`, `measured: { width, height }` and `handles: []` are set from the
layout, never left for the engine to measure. The nodes are bound with
`bind:nodes` to a writable `$derived` of the store, so a gesture writes only
the preview and the store's next value replaces it.

## Parity check

Executed on 2026-10-12 against `@xyflow/svelte` 1.7.0, `@xyflow/system`
0.0.83 and Svelte 5.57.1, in a throwaway Vite application outside the
repository, driven by Playwright 1.63.0 in Chromium 153.0.8010.12,
Firefox 155.0 and WebKit 26.6 (WebKit inside
`mcr.microsoft.com/playwright:v1.63.0-noble`; see decision 0021). Viewport
1200 × 800, blocks of 100 × 50 at `x = 100 + 200·i`, `y = 100`. The node
array is `$derived` from a `$state` store and bound through
`bind:nodes={() => nodes, (v) => (nodes = v)}`; the drag-stop handler commits
`round(x / 10) · 10 + 5` so that the committed value differs visibly from the
preview. All three engines gave identical numbers; no console errors.

| Item | Result | Evidence |
| --- | --- | --- |
| (a) Tab focus, arrow keys | passed | Tab visits the nodes in order `b0, b1, b2, b3`. On focused `b0`, Enter selects it; ArrowRight, ArrowDown, Shift+ArrowRight move it from (100, 100) to (125, 105): 5 px per key, 4 × 5 px with Shift. |
| (b) Culling, complete node not force-mounted | passed | 300 blocks, `onlyRenderVisibleElements`: 36 nodes mounted. Complete projection: 0 mounts during a drag and 0 after release. Control without `measured`/`handles`: 300 initial mounts, 264 during the drag, 528 by release (every off-screen node remounted), because a node without handle bounds is always treated as visible. |
| (c) `NodeResizer` | passed | Bottom-right handle dragged by (40, 10) in 10 steps: free node reports 10 `onResize` calls and one `onResizeEnd`, final `{ width: 140, height: 60, x: 100, y: 100 }`; with `keepAspectRatio` 10 calls and one end, final `{ width: 140, height: 70 }` (ratio 2:1 kept). |
| (d) `snapGrid` | passed | `snapGrid={[25, 25]}`, drag of (37, 61) from (100, 100): preview and drag-stop position (125, 150). |
| (e) `bind:nodes` on a writable `$derived` | passed | 5 writes into the binding during one drag; mid-drag the preview is (125, 150) while the store still holds (100, 100); after release store and node agree at (135, 155) and the DOM shows `translate(135px, 155px)`. A later store change to (400, 300) replaces the bound value again (`translate(400px, 300px)`). |
| (f) Drag on a non-draggable node pans | passed | Node with `draggable: false`, and separately all nodes with `nodesDraggable={false}`: drag of (80, 40) changes the viewport from `translate(0px, 0px)` to `translate(80px, 40px)`; the node and the store stay at their positions; the node lacks the `nopan` class. A node-level `draggable: true` overrides `nodesDraggable={false}`, so the projection leaves `draggable` unset unless it means to override. |
| (g) `NodeToolbar` | passed | No toolbar before selection; after clicking `b0` exactly one toolbar, for `b0`, visible; after clicking `b3` exactly one, for `b3`. |
| (h) Marquee | passed | Shift+drag from (80, 80) over `b0` and `b1` selects `[b0, b1]` with the viewport unchanged. With `selectionOnDrag` false a plain drag pans by (340, 90) and selects nothing; switched to true at runtime the same plain drag selects `[b0, b1]` without panning; switched back, a drag pans again. |

One observation confirms the complete-projection rule. With nodes projected
without `measured`, a re-derivation during a marquee in WebKit (selection
changes re-derive the nodes) briefly left nodes without handle bounds, and
the marquee then selected all four nodes instead of two; with the complete
projection WebKit selected exactly `[b0, b1]`. Keyboard moves do not raise
the drag-stop event, so the arranger turns them into commands separately.

## Maintenance and dependencies

Svelte Flow and React Flow are developed by xyflow (webkid GmbH, Berlin) in
one monorepository; the npm publishers are `peterkogo` and `webk1d`. The
library has 129 published versions since 2023-06-13. 1.0.0 (2025-05-14) was
the rewrite for Svelte 5; the 1.6 line had seven patch releases between
2026-06-01 and 2026-09-01; 1.7.0 was released on 2026-09-24, together with
`@xyflow/system` 0.0.83. A `2.0.0-next` channel exists. `@xyflow/system` is
still versioned below 1.0, so a minor release of Svelte Flow can change it.

Registry metadata checked on 2026-10-12 (unpacked bytes):

| Package | Release | Licence | Size (bytes) | Dependencies |
| --- | --- | --- | ---: | --- |
| `@xyflow/svelte` 1.7.0 | 2026-09-24 | MIT | 332,612 | `@xyflow/system`, `@svelte-put/shortcut`; peer `svelte ^5.25.0` |
| `@xyflow/system` 0.0.83 | 2026-09-24 | MIT | 694,317 | `d3-drag`, `d3-interpolate`, `d3-selection`, `d3-zoom` and their `@types` |
| `@svelte-put/shortcut` 4.2.0 | 2026-06-21 | MIT | | |
| `d3-*` 3.x (color, dispatch, drag, ease, interpolate, selection, timer, transition, zoom) | 2021-06 to 2022-03 | ISC, BSD-3-Clause (`d3-ease`) | | none outside d3 |

Attribution is hidden through `proOptions.hideAttribution`, which the MIT
licence permits; the editor is to credit Svelte Flow in its About pane instead.

Primary sources: <https://registry.npmjs.org/@xyflow/svelte>,
<https://registry.npmjs.org/@xyflow/system>,
<https://github.com/xyflow/xyflow>,
<https://github.com/xyflow/xyflow/blob/main/LICENSE>,
<https://svelteflow.dev/api-reference/svelte-flow>,
<https://svelteflow.dev/api-reference/components/node-resizer>,
<https://svelteflow.dev/api-reference/components/node-toolbar>,
<https://svelteflow.dev/learn/advanced/accessibility>.

## Consequences

The arranger depends on a pre-1.0 core through a 1.x wrapper; upgrades re-run
the parity check. The end-to-end tests of the arranger cover items a, b and
d–h through the editor; item (c) is not, because the arranger draws its own
resize handles instead of `NodeResizer`, so an upgrade re-runs (c) in a
throwaway harness only if `NodeResizer` is adopted.
Nodes are HTML, so the engine's own export would be raster; this does not
matter, because every export is written from the workspace by our writers.
The exit cost is the arranger package alone: blocks, their drawings and
their text are our records and our SVG, and nothing outside
`packages/arranger` imports the engine.

## Review date

2027-04-12, or when `@xyflow/svelte` 2.0.0 is released.
