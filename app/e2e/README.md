# End-to-end tests (`app/e2e`)

The editor in a real browser: Playwright drives the built editor, opens
fixture workspaces through the test hook and checks what the canvas stores
and shows. This file states what proves each behaviour and the exact values
the specs expect; a spec that cannot be traced to a paragraph here does not
belong in the suite.

## How state is read

- **The store** through the test hook, `window.__tilie` (present only in
  development builds and builds made with `VITE_TILIE_TEST_HOOK=1`):
  `store().view` for placements, manifests and block order,
  `store().journal` for the commands a gesture produced, `selection()`,
  `viewport()`, `locked()` and `mode()`. A stored number is compared with
  `toEqual`/`toBe` against a literal; nothing is read back from pixels.
- **The DOM** for what the contract says is rendered: nodes
  `.svelte-flow__node[data-id="<block id>"]`, drawn elements
  `[data-address="<element id>"]` inside their node, `[data-selected]`,
  `[data-contains-selection]`, the mode buttons `[data-testid="mode-scale"
  | "mode-box" | "mode-stretch"]` and the canvas controls' `[data-testid="lock"
  | "marquee"]` with `aria-pressed`,
  handles `[data-testid="handle-<handle>"]`, guides
  `[data-testid="snap-guide"]` and the refusal hint `[data-testid="hint"]`.
- **Pixels** only in `visual.spec.ts`, tagged `@visual`.
- **Time** only in `budget.spec.ts`, tagged `@budget`; its `≤` comparisons are
  budgets by definition and the only inequalities on measured values in the
  suite.

Every wait waits on state (`expect.poll`, `toHaveCount`, the hook's values, a
requested animation frame); no test sleeps. Pointer gestures move the mouse
in steps (`support.ts`: `drag`, `dragStart`, `dragBlock`); a press on a block
lands on its background, a whole-pixel point inside its node with no drawn
element at it or at the eight points 6 px around it, found by hit-testing
(`backgroundPoint`); a click on an element aims at the centre of its first
SVG part with the mouse (a horizontal line's box has no height, which
Playwright's actionability checks treat as invisible). Svelte Flow starts a
node drag on the first move past its 1 px threshold and measures the node's
displacement from there, so a node drag (`nodeDragStart`, `dragBlock`)
first moves 2 px to the right and then travels exactly the stated delta;
pans, marquees and resize handles count from the press. Canvas points become screen points through
the viewport: `screen = pane origin + (viewport.x, viewport.y) + zoom × canvas`,
the pane being `.svelte-flow`; a gesture meant for the empty canvas starts at
a point whose hit element is the pane itself (`emptyPoint`), so a toolbar or
a node there fails the test loudly. Specs that move the pointer by pixels set the
viewport through the hook first; at zoom 1 a pixel is a canvas unit.

## Fixtures (`fixtures/`)

`fixtures/generate.ts` builds every workspace through `createStore` and the
`add` command from the manifest fixtures of the installed
`@timetoalign/timeskeleton` (its `SCHEMA_VERSION`) and writes it with
`writeWorkspace`. The
journal is deterministic: author `"Fixture Generator"`, entry times from
`2026-10-12T09:00:00.000Z`, one second apart. Each `add` gives only `id`,
`manifest`, `x` and `y`, so every other placement member is the workspace
default (`scale` 1, `length` 400, `spacing` 1, `width` and `height` null,
grid 8 with snapping on) and indices ascend in the order of adding.

`node e2e/fixtures/generate.ts` writes the files, `node
e2e/fixtures/generate.ts --check` exits 1 unless every committed `.tle.json`
equals the generator's output byte for byte and no other `.tle.json` is
present. The files are never edited by hand.

| File | Blocks |
|---|---|
| `small.tle.json` | `bare000000` (`bare`) at (0, 0), `nested0000` (`nested`) at (0, 160), `map0000000` (`map`) at (0, 320), `flow000000` (`flow_control`) at (640, 0), `styled0000` (`styled__score`: region `intro`, jump `da-capo`, C-Map `ticks`) at (640, 160) |
| `grid-300.tle.json` | 300 `bare` blocks `g000000000` … `g000000299`, block `n` at (512 × (n mod 20), 80 × ⌊n / 20⌋) |
| `grid-900.tle.json` | 900 `bare` blocks, block `n` at (512 × (n mod 30), 80 × ⌊n / 30⌋) |

After opening, the journal holds one `add` per block (5, 300, 900); a gesture
is proven to be one command by the journal growing by exactly one entry.

### Drawing facts the expected values rest on

The boxes and plot origins of the default placement, from `draw` and the
font's advances (they equal the `rect` of the upstream drawing fixtures):

| Manifest | Width | Height | Plot origin (root line start, box-local) |
|---|---|---|---|
| `bare` | 458.5771484375 | 49.37890625 | 41.5771484375 |
| `nested` | 459.194580078125 | 77.9765625 | 41.91552734375 |
| `map` | 472.53662109375 | 67.4765625 | 55.53662109375 |
| `flow_control` | 500.256591796875 | 84.33203125 | 82.9775390625 |
| `styled__score` | 510.080078125 | 118.921875 | 90.080078125 |

For every one, `width = origin + length + 17`, so a stretch of the length moves
the right edge by exactly the length change. The vertical padding is
`8 × spacing` above and below (drawing.md section 6.5), so `bare`'s height
is `33.37890625 + 16 × spacing` and `nested`'s is `26.9765625 + 51 ×
spacing` for `spacing ≥ 0.9146…` and `58.98828125 + 16 × spacing` below.

## The gesture rules the values follow

- A drag stores the node position Svelte Flow reports (snapped to the grid 8
  during the drag, so `8 × round(p / 8)`), then the snap to other blocks:
  the moving block's left edge and its plot origin are each compared with
  every other block's left edge and plot origin; the nearest within
  `6 / zoom` canvas units wins and is stored quantized to 1/2048 (bit-exact for every value the fixtures produce), with one
  `snap-guide` shown at the target while it applies. `y` snaps to the grid
  only.
- A drag of n blocks is one `set` with n changes `{x, y}`.
- Resize: the dragged edge ends under the pointer and the opposite edge stays
  exactly put; a resize never snaps to the grid, and every value (sizes,
  scales, and `x`/`y` = opposite edge − achieved size) rounds to 1/2048. A
  resize whose values equal the stored ones dispatches nothing. Box: a request at or below the content's
  extent stores `null`. Scale: corners only, the new scale is the larger of
  the two axis ratios, floored at 1/8. Stretch: `length` from left and right,
  `spacing` from top and bottom, both from a corner; floors 8 and 1/4.
- A nudge moves by one grid step (8), with Shift eight steps (64), and the
  result snaps to the grid.

## `canvas.spec.ts` (Chromium, Firefox, WebKit)

`small` at viewport (40, 40), zoom 1, page 1600 × 1000.

1. **Opening.** Five nodes, one per block id; `styled0000` holds the elements
   `intro`, `da-capo` and `ticks`. **Every drawn text is in the bundled
   face**: each `<text>` on the canvas has exactly the width the drawing
   defines for it. That width is the sum of the code points' advances in the
   bundled face's advance table times the font size over 2048 (kerning off),
   a dyadic fraction exact as a double; e.g. "Phrase" at 11 px is
   (1235 + 1298 + 842 + 1255 + 1067 + 1260) × 11 / 2048 = 37.36669921875.
   Each engine stores it in its own precision: WebKit exactly (37.36669921875),
   Chromium rounded up to its 1/64 px layout unit (2391.47 → 2392/64 =
   37.375); both rules were checked on all 23 texts of `small`. Firefox
   stores values up to 6e-4 px off the exact width (37.367000579833984) by a
   rule no 1/(60 k) rounding grid reproduces on those 23 texts, so in
   Firefox the expected width is the same string laid out afresh, after the
   face has loaded, in the same `<svg>` at the same size. A text laid out
   with a stand-in font before the face arrived fails either way (the
   fallback gives "Phrase" 34.79); a negative control (one text forced to
   `sans-serif`) is reported as exactly that text in all three engines.
1b. **The fixture menu** (development and test builds): choosing `small` in
   `[data-testid="fixture-select"]` and pressing `[data-testid="fixture-load"]`
   on a freshly opened editor shows exactly the five nodes of `small` and a
   journal of its 5 entries, as loading the file through the hook does.
2. **Drag, undo, redo.** `map0000000` dragged by (101, 37): raw (101, 357),
   grid (104, 360). No other left edge or origin lies within 6 of 104 or of
   its origin 159.53662109375 (the nearest, `bare`'s origin 41.58, is 62.4
   away). Stored (104, 360); the journal gains exactly `{type: "set",
   changes: [{target: map0000000, values: {x: 104, y: 360}}]}`. Ctrl/Cmd+Z
   restores (0, 320) exactly and the journal to 5 entries; Ctrl/Cmd+Shift+Z
   restores (104, 360) and 6 entries.
3. **Multi-drag.** `bare000000` and `nested0000` selected, `bare` dragged by
   (21, 13): grid (24, 16); the nearest candidates (map's left edge 0 and
   origin 55.54 against bare's left edge 24 and origin 65.58) are 10.04 or
   more away. Stored bare (24, 16) and nested (24, 176); one `set` whose two
   changes, sorted by target, are exactly those values.
4. **Snap to a left edge.** `flow000000` is first set to x 515 by a `set`
   command (off the grid). `nested0000` dragged by (512, 0): grid 512, 3 from
   flow's left edge 515; its origin 553.92 is 44 from flow's origin 597.98.
   While the button is down exactly one `snap-guide` is visible; after the
   release there is none and the block is stored at (515, 160).
5. **Snap to a plot origin.** `styled0000` dragged by (−8, 160): grid
   (632, 320); its left edge is 8 from flow's left edge 640 (beyond 6); its
   origin 722.080078125 is 0.8974609375 from flow's origin 722.9775390625.
   Stored x = 722.9775390625 − 90.080078125 = 632.8974609375 (1296174/2048,
   so quantizing to 1/2048 leaves it exact), y 320; one guide during the drag.
6. **Locked drag pans.** The lock button pressed (`aria-pressed="true"`,
   `locked()` true); a drag of (50, 30) on `bare`'s background moves the
   viewport from (40, 40) to (90, 70) at zoom 1 exactly, leaves `bare` at
   (0, 0) and the journal at 5. L unlocks.
   A locked canvas also allows no nudge or resize: with `bare000000` selected
   in box mode, 8 handles are shown; after L none is, and →, Shift+↓, ↑,
   Shift+← leave `bare` at (0, 0) and the journal at 5.
7. **A plain drag on the empty canvas pans**: from canvas (−20, 200) by
   (30, 25) (rightwards, so the pointer stays inside the page), viewport
   (70, 65), no command, no selection.
7b. **The wheel pans; Ctrl+wheel zooms.** Svelte Flow 1.7.0 pans on scroll
   by `−delta / zoom × panOnScrollSpeed`, the speed 0.5 by default
   (`@xyflow/system` `createPanOnScrollHandler`, `SvelteFlow.svelte`), with
   pixel deltas (`deltaMode` 0, what Playwright dispatches). From viewport
   (40, 40), zoom 1, the pointer on the empty canvas:
   - one wheel event of deltaY 100 → (40, −10): y − 100 × 0.5;
   - with Shift held, deltaY 100 → (−10, 40): the same distance horizontally,
     y unchanged; and the same for a Shift+wheel the browser reports as
     deltaX 100, deltaY 0. Both forms occur, so both are pinned, except that
     the deltaY form is skipped under a Mac user agent (the WebKit project's
     Desktop Safari): macOS itself reports a Shift+wheel as deltaX, and
     Svelte Flow (`isMacOs`, from the user agent) swaps nothing there;
   - with Ctrl held, deltaY −10 → zoom 2^(10 × 0.002 × f) (Svelte Flow's
     pinch zoom, `wheelDelta`: −deltaY × 0.002 × f on a pixel delta, f = 10
     under a Mac user agent and 1 otherwise; a delta of 10 keeps both below
     the maximum zoom 2), and the canvas
     point under the pointer stays under it: with the pointer at pane point
     p, the new viewport is p − (p − v) × zoom′ / zoom on each axis, as d3's
     `scaleTo` computes it;
   - no wheel event journals anything.
8. **Marquee.** Viewport (100, 100) zoom 1/2 (the gesture stays clear of the
   40 px edge zone), `map0000000` selected first; from canvas (−40, −40) by
   (600, 120) pixels, i.e. to canvas (1160, 200). The rectangle holds `bare`
   (0…458.58 × 0…49.38) and `flow000000` (640…1140.26 × 0…84.33) whole, and
   `nested` (y 160…237.98) and `styled` (640…1150.08 × 160…278.92) only in
   part. A marquee selects only blocks wholly inside.
   - **Shift+drag replaces** the selection: exactly {bare000000,
     flow000000} (a partial-overlap rule would add nested and styled, an
     additive one would keep map); the viewport stays put.
   - **With the `marquee` toggle on, everything adds**: the same plain drag
     gives {bare000000, flow000000, map0000000}, the viewport stays put. With
     the toggle off again the same drag pans to (700, 220).
   - **Clicks in marquee mode add and remove.** With nothing selected and the
     toggle on: a click on `bare`'s background → {bare000000}; a click on
     `nested0000`'s `clt_2` → {bare000000, nested0000/clt_2}; a marquee from
     canvas (600, −40) by (280, 90) pixels, to (1160, 140), which holds only
     `flow000000` whole → {bare000000, flow000000, nested0000/clt_2}; a
     click on `bare`'s background again removes it → {flow000000,
     nested0000/clt_2}.
8b. **A marquee ending in the edge zone pans.** Svelte Flow pans while the
   pointer of a marquee rests within 40 px of the pane's edge, and keeps the
   marquee's start fixed in canvas units (`selectionRect.startX/Y`), its end
   under the pointer. Viewport (100, 100) zoom 1/2, Shift held: from canvas
   (−40, −40) the pointer moves to pane point (pane width − 20, 170), inside
   the right edge zone, and stays until the viewport has moved; then the
   button is released. With the viewport v read after the release, the
   rectangle is canvas (−40, −40) to ((pane width − 20 − v.x) / ½,
   (170 − v.y) / ½), and the selection is exactly the blocks wholly inside
   it, computed from the block boxes of the fixture table: {bare000000,
   flow000000} whenever the rectangle ends below y 160 and right of 1140.26,
   which the spec also checks. The other marquee specs stay ≥ 80 px inside
   the pane, out of the zone.
9. **Click (element, block, Shift).** A click on `nested0000`'s child line
   `clt_2` selects exactly `[nested0000/clt_2]`: that element carries
   `data-selected`, its node content `data-contains-selection`, and they are
   the only ones. A click on `map0000000`'s background then selects exactly
   `[map0000000]`, with no `data-selected` or `data-contains-selection` left.
   Shift+click on `styled0000`'s root line adds `styled0000/score`, Shift+click
   on `bare`'s background adds `bare000000`, Shift+click on `clt_2` again
   removes it: {bare000000, styled0000/score}. A drag that starts on `clt_2`
   moves `nested0000` by (101, 37) to (104, 200) as one command. Escape
   clears the selection.
10. **Delete.** Selection {styled0000/intro}, Delete: the journal gains
    exactly `{type: "remove", targets: ["styled0000/intro"]}`, the manifest's
    region list is empty and the element `intro` is gone from the node;
    Ctrl/Cmd+Z brings it back (`["intro"]`, one element). Selection
    {map0000000}, Backspace: `{type: "remove", targets: ["map0000000"]}`, the
    node gone, the order bare, nested, flow, styled. Selection
    {bare000000/bare, styled0000/intro} (a root timeline and a region),
    Delete: refused whole; the hint is visible and contains "select the block
    to delete it", the journal stays at 5 and every manifest is unchanged
    (their JSON text before and after is identical).
10b. **Selecting a timeline marks its descendants.** `nested`'s root `clt_1`
    holds `clt_3`, which holds `clt_2`; the drawing addresses `clt_2`'s line
    as `clt_2` and its name as `clt_2/name`. With {nested0000/clt_3}
    selected, the distinct `data-address` values carrying `[data-affected]`
    are exactly `clt_2` and `clt_2/name`, all inside `nested0000`'s node, and
    no other node has one. Delete then journals exactly `{type: "remove",
    targets: ["nested0000/clt_3"]}` and the manifest's timeline ids are
    [clt_1] (the whole subtree went with one entry); Ctrl/Cmd+Z restores
    [clt_1, clt_2, clt_3] (sorted).
11. **Z-order keys.** The order starts bare, nested, map, flow, styled.
    `bare000000` selected: Ctrl/Cmd+Shift+] (front) → nested, map, flow,
    styled, bare; Ctrl/Cmd+[ (backward) → nested, map, flow, bare, styled;
    Ctrl/Cmd+Shift+[ (back) → bare, nested, map, flow, styled; Ctrl/Cmd+]
    (forward) → nested, bare, map, flow, styled. Each is exactly one `set`
    whose only change targets `bare000000` with the single property `index`,
    and the nodes' computed `z-index` rises strictly along the order.
12. **Keys need the focus in the arranger.** `map0000000` selected by a click
    on its background, then the focus moves to the inspector's tab (the
    button "Open inspector", outside the arranger): →, Shift+↓, Ctrl/Cmd+Shift+], 1, 2,
    3, L, Delete, Backspace and Escape journal nothing and leave the block at
    (0, 320), the selection [map0000000], the mode and the lock unchanged.
    A click on the block again and → moves it to (8, 320), so the keys are
    live when the focus is back. With the focus on the page body (the
    arranger blurred by the test), → moves nothing either: the body is not
    the arranger. A click on the empty canvas (canvas point (−20, 200))
    then focuses the arranger itself (`[role="application"][aria-label=
    "Arranger"]` is the active element; the click also clears the
    selection), and with `map0000000` selected again through the hook, →
    moves it to (16, 320).
13. **Toolbars move the focus with arrows** (roving focus): the canvas
    controls are a vertical toolbar, so from the focused "Zoom in" button ↓
    reaches "Zoom out", ↓ "Fit to view", ↓ `lock`, ↓ `marquee`, ↓ wraps to
    "Zoom in", ↑ ↑ `lock` again, and → leaves the focus on `lock`; from
    `mode-scale` → `mode-box`, → `mode-stretch`, ← `mode-box`. With
    `map0000000` selected throughout, nothing is journalled and the block
    stays at (0, 320).
14. **Nudges.** `map0000000` selected by a click on its background; → (8,
    320), Shift+↓ (8, 384), ↑ (8, 376), Shift+← (−56, 376); four `set`
    commands, each on `map0000000` only. Four undos restore (0, 320) and the
    journal to 5; four redos (−56, 376).

15. **The canvas controls.** On load the arranger holds the focus (opening
    a workspace through the hook focuses it too). Exactly one Svelte Flow
    controls panel (`.svelte-flow__controls`) exists, inside the pane
    (`.svelte-flow`), with the classes `bottom` and `left`, and its box lies
    inside the pane's box in its lower-left quarter. Its buttons, in DOM
    order, are exactly: "Zoom in", "Zoom out", "Fit to view" (their
    `aria-label`s, `title`s "Zoom in (+)", "Zoom out (-)", "Fit to view
    (0)"), `lock` (`aria-label` "Lock the canvas", `title` "Lock the
    canvas: dragging pans instead of moving blocks (L)") and `marquee`
    (`aria-label` "Add to selection (marquee)"); Svelte Flow's own lock
    button (`.svelte-flow__controls-interactive`) is absent and no other
    button is in the panel. A click on `lock` sets `aria-pressed="true"` and
    `locked()` true, a second click false; L toggles it the same way.
    A click on `marquee` sets its `aria-pressed="true"`, a second click
    `false`. From viewport (40, 40) zoom 1: "Zoom in" raises the zoom,
    "Zoom out" then lowers it below the zoomed-in value, + raises it again
    and − lowers it (the step sizes are Svelte Flow's and not pinned); "Fit
    to view" and 0 each change the viewport away from a set (500, 500)
    zoom 1, and both give the same viewport.
16. **The inspector drawer.** On load (empty `localStorage`) the drawer
    `#inspector` is hidden and the tab "Open inspector" (text «) is visible
    at the right edge of the arranger: its right edge equals the pane's
    right edge, and the pane's right edge equals the page's width (the
    canvas takes the full width). With the viewport set to (40, 40) zoom 1,
    a click on the tab shows the drawer, whose heading reads `Inspector`
    and whose close button "Close inspector" (text ») has
    `aria-expanded="true"`; the pane's right edge now equals the drawer's
    left edge, and the viewport is still exactly (40, 40) zoom 1, so
    opening re-fits nothing. A reload keeps the drawer open (the state is
    in `localStorage` under `tilie.inspector.open`). A click on the close
    button hides it again, the viewport is still (40, 40) zoom 1, and
    after a reload the drawer is closed.

## `resize.spec.ts` (Chromium, Firefox, WebKit)

`small`, then `bare000000` set to (40, 80) and `nested0000` to (40, 240) (two
`set` commands, journal 7); viewport (300, 40), zoom 1, page 1600 × 1000.
`bare`'s box is then 40…498.5771484375 × 80…129.37890625.

1. **Choosing the mode.** With `bare` selected, keys 1, 2, 3 and the buttons
   `mode-scale`, `mode-box`, `mode-stretch` set `mode()` to scale, box, stretch;
   exactly the chosen button has `aria-pressed="true"`. The handles shown are
   exactly the four corners for scale and all eight for box and stretch. The mode
   survives a change of selection (stretch chosen on `bare`, still stretch with 8
   handles on `map0000000`).
2. **Every drag previews, then journals once.** While the button is down the
   node's box differs from before and the journal is unchanged; the release
   adds exactly one `set` on the resized block.
3. **Mode × handle → stored values** (pixel deltas at zoom 1 are canvas
   deltas):

| Block | Mode | Handle | Delta | Stored | Derivation |
|---|---|---|---|---|---|
| bare | box | right | (20, 0) | width 478.5771484375, height null, (40, 80) | 458.5771484375 + 20 = 980126/2048, exact |
| bare | box | left | (−21, 0) | width 479.5771484375, x 19 | edge 19 (a resize never snaps to the grid); 498.5771484375 − 19 = 479.5771484375, x = right − width = 19, exact |
| bare | box | bottom-right | (20, 11) | width 478.5771484375, height 60.37890625 | 49.37890625 + 11 = 60.37890625, exact |
| bare | box | top | (0, −16) | height 65.37890625, y 64 | edge 64 on the grid; 129.37890625 − 64 = 65.37890625, exact; y = 129.37890625 − 65.37890625 = 64 |
| bare | scale | bottom-right | (229, 0) | scale 1.49951171875, (40, 80) | max(687.577…/458.577…, 1) = 1.4993615… → round(3070.69) = 3071/2048 |
| bare | scale | top-left | (−229, 0) | scale 1.49951171875, x −189.064453125, y 55.33447265625 | edge −189 (no grid); 687.577…/458.577… = 1.4993615… → 3071/2048; x = 498.5771484375 − 3071/2048 × 458.5771484375 and y = 129.37890625 − 3071/2048 × 49.37890625, each to 1/2048: the right and bottom edges stay exactly put |
| bare | scale | bottom-right | (−440, −49) | scale 0.125 | max(18.58/458.58, 0.38/49.38) below 1/8 → floor |
| bare | stretch | right | (20, 0) | length 420, spacing 1 | width = origin + length + 17, so length + 20 |
| bare | stretch | left | (−21, 0) | length 421, x 19 | edge 19 (no grid), width + 21 |
| bare | stretch | right | (−500, 0) | length 8 | floor `MIN_LENGTH` |
| bare | stretch | bottom | (0, 32) | spacing 3, length 400, y 80 | a single timeline stretches through its padding: 49.37890625 + 32 = 81.37890625 = 33.37890625 + 16 × 3 |
| nested | stretch | bottom | (0, 51) | spacing 2, length 400, y 240 | 77.9765625 + 51 = 128.9765625 = 26.9765625 + 51 × 2 |
| nested | stretch | bottom-right | (200, 51) | length 600, spacing 2 | both at once; the pointer ends at pane x 999, clear of the auto-pan zone |

4. **Stretch to the floor and across the kink.** `nested`'s height is
   `58.98828125 + 16 v` below the kink v = 12.8046875 / 14 = 0.91462… and
   `26.9765625 + 51 v` above it; the padding leaves it no flat piece.
   Stretch stores the largest multiple of 1/2048 (at or above the floor)
   whose height does not pass the pointer. The bottom handle dragged by
   (0, −40) asks for 37.9765625, below the height at the floor 1/4
   (62.98828125), so the solve stops at the floor (y stays 240). Dragged by
   (0, 35) from there, the target is 97.98828125, above the kink, so v ≤
   71.01171875 / 51 = 1.392386…, i.e. 2851/2048 = 1.39208984375.
4b. **A resize held in the edge zone pans and follows the pointer.** In box
   mode, `bare`'s right handle is pressed at screen x s₀ and moved to screen
   x s₁ = pane right − 20, inside the right edge zone, both whole pixels
   (WebKit and Firefox round pointer positions, so a fractional point would
   travel another distance), held until the viewport has moved, then
   released. The pointer's travel in canvas units is its screen travel minus
   the pan: d = (s₁ − s₀) − (v₁.x − v₀.x) at zoom 1, v₀ = (300, 40) and v₁
   the viewport read after the release. The stored width is
   458.5771484375 + d rounded to 1/2048, with x 40 unchanged, as one `set`.
5. **A no-op resize journals nothing.** In box mode `bare` (width null) has
   its right edge dragged 20 px left: the request is below the content, so
   width stays null, the value already stored; the journal stays at 7 and
   the placement is unchanged.
6. **Box never below the content.** In box mode `bare` grown by 20, then the
   right edge dragged 60 to the left (below the content's 458.58): `width`
   is stored `null` and the node's box equals the box it had before the
   growth, exactly.
7. **Undo** after the scale top-left resize restores the whole placement
   (`x`, `y`, `index`, `scale`, `length`, `spacing`, `width`, `height`)
   exactly.

## `touch.spec.ts` (the touch project)

Touch points go through the Chrome DevTools Protocol
(`Input.dispatchTouchEvent`), which produces the touch and pointer events of
a real screen, with one or two fingers; the spec skips on other engines.
`small` at viewport (20, 20), zoom 1. Two properties of a real touch screen
shape the gestures: Chromium moves a tap onto a nearby clickable element
(touch adjustment), so a tap meant for a block's background lands 14 px or
more from any drawn element; and it withholds the moves inside its touch
slop (15 px) at the start of a gesture, so a one-finger node drag first
travels 20 px to the right and its delta counts from there (as with the
mouse, Svelte Flow measures a node drag from the move that starts it).

1. A tap on `map0000000`'s background selects `[map0000000]`; a tap on
   `nested0000`'s `clt_2` selects `[nested0000/clt_2]`.
2. A one-finger drag of (101, 37) on `map0000000`: raw (101, 357) → grid
   (104, 360), as with the mouse. Stored (104, 360) as exactly one `set`.
3. A one-finger drag of (30, 40) on the empty canvas pans to (50, 60), zoom 1.
4. A pinch (two fingers 40 px apart moved 120 px further apart) changes the
   zoom and journals nothing; the new zoom value is Svelte Flow's and not
   pinned.
5. Taps on `mode-box`, `mode-stretch`, `mode-scale` with `map0000000` selected
   set the mode, press the button and show 8, 8, 4 handles.
6. With the `marquee` toggle tapped on, at viewport (60, 60), zoom 0.4 (the
   finger stays between pane points (48, 48) and (252, 116), clear of the
   40 px auto-pan zone of the phone's narrow pane), a one-finger drag from
   canvas (−30, −30) by (204, 68) pixels (to canvas (480, 140)) selects
   exactly {bare000000} (bare ends at x 458.58, flow starts at 640, nested at
   y 160) and leaves the viewport where it was.

## `files.spec.ts` (Chromium, Firefox, WebKit)

The pickers of the File System Access API are deleted from the page before
it loads, so every engine takes the fallback path: a file input answered
through Playwright's file chooser, and a download. Page 1280 × 800: the
header is 32 px high and the inspector closed, so the arranger measures
1280 × 768 (asserted).

1. **The gate: save, reopen, save.** File → New workspace (journal 0); the
   viewport set to (100, 50), zoom 1. File → Import manifest… with the
   installed package's `fixtures/<SCHEMA_VERSION>/bare.json`: one `add`
   (journal 1), the new block selected, its top-left at the centre of the
   view, `((1280 / 2 − 100) / 1, (768 / 2 − 50) / 1) = (540, 334)` snapped
   to the grid of 8: `(544, 336)`, scale 1 and length 400 (the defaults).
   An import never moves the view: two frames later the viewport is still
   exactly (100, 50), zoom 1 (only opening a workspace that holds blocks
   fits it into view). Dragged by (40, 24): one `set`, `(584, 360)`. In stretch mode its right
   handle dragged by (20, 0): one `set`, length 420, spacing 1 (as
   `resize.spec.ts` derives for `bare`). The header shows `• untitled.tle.json`.
   Ctrl/Cmd+S downloads `untitled.tle.json` whose text equals the hook's
   `text()` (`writeWorkspace` of the store), and the mark goes. File →
   Open… with that text clears the selection (a new store), keeps the
   journal at 3 and gives `text()` equal to the saved text; Ctrl/Cmd+S
   again downloads `untitled.tle.json` byte-identical to the first save.
1b. **An opened workspace is fitted, an import into it is not.** `small`
   opened through the hook (journal 5) is fitted once its nodes are
   measured: polled until all five nodes' boxes lie inside the pane
   `.svelte-flow`. Its viewport then, two frames later, is read; File →
   Import manifest… with `bare.json` journals one `add` (6), and two frames
   later the viewport equals the fitted one exactly.
2. **A refused file.** File → Open… with `{` (`broken.tle.json`) shows one
   message containing `broken.tle.json is not a workspace file` whose first
   problem code is `invalid_json`; the journal stays 0; Dismiss removes it.
3. **About.** The About button opens the dialog named `About
   TimeLineEditor`; its packages are exactly `@timetoalign/tilie-core`,
   `-layout`, `-writers`, `-arranger`, `-client`; the server line starts
   `offline: The server did not answer the health check (` (the preview
   server runs no `tilie-server`; the reason's text differs by engine); its
   link `THIRD_PARTY_NOTICES.txt` resolves against the page to a file the
   server answers with status 200, starting `TimeLineEditor: third-party
   notices` (the build wrote it); Escape closes it.

## `inspector.spec.ts` (Chromium, Firefox, WebKit)

The inspector drawer on `small` at zoom 1 (viewport `{x: 40, y: 40, zoom:
1}`), with `bare000000` selected through the hook and the drawer opened by
its "Open inspector" button. The text is read from the textarea labelled
"Manifest (…)", the format chosen by the radio labelled "YAML".

1. **A YAML edit reaches the canvas as one command, and Undo restores it.**
   The YAML text's line `  name: Bare` becomes `  name: Renamed`; Apply
   adds exactly one journal entry (5 → 6), a `set` whose only change
   targets `bare000000` with the single value `manifest`; the drawn name
   `[data-address="bare/name"]` of the block reads `Renamed` and the
   stored manifest's `timeline.name` is `Renamed`. After `undo()` through
   the hook the drawn name reads `Bare` again and the textarea, which holds
   no unapplied edit, shows `  name: Bare` again.
2. **A refused edit shows its exact path and keeps the text.** `  locked:
   false` becomes `  locked: yes` (a string in YAML 1.2); Apply leaves the
   journal at 5, the problem list holds exactly one item reading
   `schema_violation must be boolean at /timeline/locked`, and the textarea
   still holds the edited text.
3. **The properties form moves the block by the exact amount.** The field
   `x` (initially `0`) is filled with `37.5` and Enter pressed: the journal
   grows by one `set` `{target: "bare000000", values: {x: 37.5}}`, the
   stored `x` is `37.5`, and the node's bounding box has moved right by
   exactly 37.5 px (zoom 1) with its `y` unchanged.
4. **axe-core reports no violation with the drawer open and the manifest
   shown** (YAML chosen, `bare000000` selected).

## `a11y.spec.ts`

axe-core (`@axe-core/playwright`) on the page with `small` open reports an
empty `violations` list, again with the element `styled0000/intro`
selected, with the inspector drawer open, with the File menu open, with the
About dialog open, and with the question "… has unsaved changes. Discard
them?" open (a `set` makes the workspace unsaved, then File → New
workspace). Tab is pressed until a node holds the focus: the first is
`bare000000` (nodes follow the z-order). Enter selects exactly it, Escape
clears the selection, the next Tab focuses `nested0000` and Enter selects it.

## `culling.spec.ts`

- **300 blocks**: culling is off (the threshold is above 500 nodes), so
  `grid-300` mounts all 300 nodes, both at the opening view and at viewport
  (−2000, −100), zoom 1.
- **900 blocks**: culling is on. At viewport (−2000, −100), zoom 1, the
  pane shows canvas `[2000, 2000 + pane width] × [100, 100 + pane height]`.
  Svelte Flow mounts a node when its box overlaps that rectangle by a
  positive area. Block `n` is (512 × (n mod 30), 80 × ⌊n / 30⌋) with box
  458.5771484375 × 49.37890625, so the expected count is the number of grid
  cells whose box overlaps; the spec counts them for the pane's actual
  `clientWidth` × `clientHeight` (the pane's size belongs to the editor's
  layout, not to this contract) and requires exactly that many
  `.svelte-flow__node`. Worked example, pinned in the spec as a check of the
  formula itself: a 1000 × 600 pane shows columns with x in (1541.42, 3000),
  i.e. 2048 and 2560 (1536 + 458.58 = 1994.58 ends before 2000), and rows
  with y in (50.62, 700), i.e. 80 … 640, eight rows: 2 × 8 = 16 nodes.

## `budget.spec.ts` (`@budget`, Chromium only)

`grid-300` at viewport (20, 20), zoom 1, all 300 nodes mounted (no culling).
Script time is `ScriptDuration` from the DevTools Protocol's
`Performance.getMetrics`, read before and after a gesture of 60 moves (two
frames rendered on each side), divided by 60, as the canvas design measured
it. The frame rate is capped at 60 Hz in headless Chromium, so script time is
the discriminating number. Each test prints its measurement.

| Measured | Budget |
|---|---|
| dragging block `g000000021` by (256, 120) in 60 moves, press and release included | ≤ 3 ms per move |
| panning from the empty canvas by (300, −120) in 60 moves | ≤ 1 ms per move |
| 60 Ctrl+wheel events (30 in, 30 out), a frame after each | ≤ 1 ms per event |
| 60 plain wheel events (30 down, 30 up), which pan, a frame after each | ≤ 1 ms per event |
| one `set` dispatched through the hook's store, until `dispatch` returns (apply, journal, listeners notified; the UI's flush runs untimed before the next run) | ≤ 1 ms |
| one block's `length` changed and its node laid out again (Svelte's flush, then the node's box read) | ≤ 16.7 ms |

A fifth test proves the measured Ctrl+wheel gesture zooms: one Ctrl+wheel
event of deltaY −40 takes the zoom from 1 to exactly 2 ** (40 × 0.002).
The command and the redraw take the shortest of five runs after one warm-up run: the cost
of the code, not of whatever else the machine runs.

## `visual.spec.ts` (`@visual`, the pinned container only)

`small` at viewport (40, 40), zoom 1, page 1600 × 1000, nothing selected:
one screenshot of each of the five nodes and one of the pane, each compared
with `maxDiffPixels: 0` (animations disabled, caret hidden). Before the
shots the drawing face is forced to load (`document.fonts.load`, then
`ready` and `check`), two frames are rendered, and the face check of
`canvas.spec.ts` must hold: a screenshot of text laid out with a stand-in
font would otherwise become a baseline that only some runs reproduce. The
baselines are made and checked only in the pinned Playwright container
(`pnpm e2e:visual:update`, `pnpm e2e:visual`).
