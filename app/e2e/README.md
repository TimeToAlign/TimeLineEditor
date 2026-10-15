# End-to-end tests (`app/e2e`)

The editor in a real browser: Playwright drives the built editor, opens
fixture workspaces through the test hook and checks what the canvas stores
and shows. This file states what proves each behaviour and the exact values
the specs expect; a spec that cannot be traced to a paragraph here does not
belong in the suite.

## Running

`node e2e/run.ts` (behind every `pnpm e2e*` script) runs Playwright inside
the Playwright image of the installed version through rootless podman, with
`app/` mounted at its own path. The packages may resolve
`@timetoalign/timeskeleton` from a schema package linked from a sibling
checkout instead of the registry; its real directory then lies outside
`app/`, so `run.ts` mounts it as well, read-only and at its identical
absolute path, where the links in `node_modules` find it. Like the app's
volume it carries podman's `z` option, so on a host that enforces SELinux
the sibling checkout is relabelled for the container to read. With the registry
package (inside `app/node_modules`) the command line is unchanged. The
arguments are built by `container.ts` and pinned in `tests/README.md`.

## How state is read

- **The store** through the test hook, `window.__tilie` (present only in
  development builds and builds made with `VITE_TILIE_TEST_HOOK=1`):
  `store().view` for placements, manifests and block order,
  `store().journal` for the commands a gesture produced, `selection()`,
  `viewport()`, `locked()` and `mode()`. A stored number is compared with
  `toEqual`/`toBe` against a literal; nothing is read back from pixels.
- **The DOM** for what the contract says is rendered: nodes
  `.svelte-flow__node[data-id="<block id>"]` (a selected block's node
  carries Svelte Flow's class `selected`), drawn elements
  `[data-address="<address>"]` inside their node (one rule in every
  manifest: a timeline or a group by its bare id, every other element by
  `<root id>/<element id>`, the manifest's title by `name`; parts append
  `/start`, `/end`, `/name`, `/label` or `/card`), `[data-selected]`,
  `[data-hovered]`, `[data-contains-selection]`, the mode buttons `[data-testid="mode-scale"
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
in steps (`support.ts`: `drag`, `dragStart`, `dragBlock`). A press on a
block's card selects the card (`<block>/<root>/card`), a press on a group's
frame the group (`<block>/<group>`), a click on its
margin (the `P` = 8 canvas units outside the card, the block's own
background) selects the block, and a drag from either moves the block. So a
click meant to select a block lands on its margin, a whole-pixel point
inside its node with no drawn element at it or at the eight points 1 px
around it (`marginPoint`, searched pixel by pixel, since the margin is 8 px
wide at zoom 1 and 4 px at zoom 1/2); a drag of a block starts on its card,
a whole-pixel point whose hit element, there and at the eight points 6 px
around it, is the block's card (`cardPoint`, found on a raster across the
node); a click on an element aims at the centre of its first
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
`@timetoalign/timeskeleton` (its `SCHEMA_VERSION`: manifests of one root at
the top, and the synthetic manifests holding groups in its `groups/` and
`bundles/`, never a `corpus_*` one) and writes it with `writeWorkspace`. The
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
| `groups.tle.json` | four manifests of one group each: `gchild0000` (`groups/group_child_member`) at (0, 0), `ggrand0000` (`groups/group_grandchild`) at (0, 240), `gmixed0000` (`groups/group_parents_mixed`) at (640, 0), `gstyled000` (`groups/group_styled`) at (640, 424) |
| `bundles.tle.json` | the three named manifests of `bundles/`: `bmixed0000` (`bundles/bundle_mixed`) at (0, 0), `bshared000` (`bundles/bundle_shared_parent`) at (640, 0), `bungroup00` (`bundles/bundle_ungrouped`) at (0, 480) |
| `grid-300.tle.json` | 300 `bare` blocks `g000000000` … `g000000299`, block `n` at (512 × (n mod 20), 80 × ⌊n / 20⌋) |
| `grid-900.tle.json` | 900 `bare` blocks, block `n` at (512 × (n mod 30), 80 × ⌊n / 30⌋) |

The group workspace takes one manifest of each shape the drawing distinguishes:
a member that is a child (one ancestor line), a grandchild (two), members
under three different roots beside a root member, and a styled frame; the
boxes it draws (558.4140625 × 190.13671875, 559.70361328125 × 224.11328125,
568.08642578125 × 374.04296875, 544.693603515625 × 212.94140625) do not
overlap at those positions, and all four lie inside a 1600 × 1000 page at
viewport (40, 40), zoom 1. The bundle workspace holds every synthetic manifest
of `bundles/` (boxes 580.484619140625 × 417.8828125, 585.39013671875 ×
452.45703125, 525.896728515625 × 217.015625).

After opening, the journal holds one `add` per block (5, 4, 3, 300, 900); a gesture
is proven to be one command by the journal growing by exactly one entry.

### Drawing facts the expected values rest on

A manifest of one root with neither `name` nor `id` is drawn as a box without
a title holding its root in a card (drawing.md section 8): the card spans `x = P = 8` to `R + K` and `y = 8` to
`8 + Hm`, its shadow 2 further right and down, and the box adds `P` beyond
the shadow, so every box is the root's own drawing (sections 3 to 6, the
card's size) plus 18 each way, and its plot origin lies 8 further right.
The boxes and plot origins of the default placement, from `draw` and the
font's advances (they equal the background `rect` of the upstream drawing
fixtures of the installed schema version):

| Manifest | Width | Height | Plot origin (root line start, box-local) | Card (`x`, `y`, `width`, `height`) |
|---|---|---|---|---|
| `bare` | 476.5771484375 | 67.37890625 | 49.5771484375 | 8, 8, 458.5771484375, 49.37890625 |
| `nested` | 477.194580078125 | 95.9765625 | 49.91552734375 | 8, 8, 459.194580078125, 77.9765625 |
| `map` | 490.53662109375 | 85.4765625 | 63.53662109375 | 8, 8, 472.53662109375, 67.4765625 |
| `flow_control` | 518.256591796875 | 102.33203125 | 90.9775390625 | 8, 8, 500.256591796875, 84.33203125 |
| `styled__score` | 528.080078125 | 136.921875 | 98.080078125 | 8, 8, 510.080078125, 118.921875 |

`width − origin − length` is 27 for `bare` and `map` (the line's 17 to the
card's right edge, `K` 8 and the shadow 2), 27.279052734375 for `nested` and
`flow_control` and 30 for `styled__score`; for every one it does not depend
on the length, so a stretch of the length moves the right edge by exactly
the length change (checked at lengths 400, 420 and 600). The vertical
padding is `8 × spacing` above and below inside the card (drawing.md
sections 6.5 and 8.4) and the card's 18 is not stretched, so `bare`'s
height is `51.37890625 + 16 × spacing` and `nested`'s is `44.9765625 + 51 ×
spacing` for `spacing ≥ 0.9146…` and `76.98828125 + 16 × spacing` below
(the kink 32.01171875 / 35 = 0.91462… is unchanged by the card).

Every block's card rectangle and its shadow carry the address `<root>/card`
(`bare/card`, `clt_1/card`, `melody/card`, `flow:quarters/card`,
`score/card`); the drawn texts of `small` are still 23 (a manifest with neither
`name` nor `id` draws no title).

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
   `score/intro`, `score/da-capo` and `score/ticks` (region, jump and C-Map,
   each addressed by its root `score`). **Every drawn text is in the bundled
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
   its origin 167.53662109375 (the nearest, `nested`'s origin
   49.91552734375, is 54.08447265625 from 104). Stored (104, 360); the journal gains exactly `{type: "set",
   changes: [{target: map0000000, values: {x: 104, y: 360}}]}`. Ctrl/Cmd+Z
   restores (0, 320) exactly and the journal to 5 entries; Ctrl/Cmd+Shift+Z
   restores (104, 360) and 6 entries.
3. **Multi-drag.** `bare000000` and `nested0000` selected, `bare` dragged by
   (21, 13): grid (24, 16); the nearest candidates (map's left edge 0 and
   origin 63.54 against bare's left edge 24 and origin 73.58) are
   10.04052734375 or more away. Stored bare (24, 16) and nested (24, 176); one `set` whose two
   changes, sorted by target, are exactly those values.
4. **Snap to a left edge.** `flow000000` is first set to x 515 by a `set`
   command (off the grid). `nested0000` dragged by (512, 0): grid 512, 3 from
   flow's left edge 515; its origin 561.92 is 44.06 from flow's origin 605.98.
   While the button is down exactly one `snap-guide` is visible; after the
   release there is none and the block is stored at (515, 160).
5. **Snap to a plot origin.** `styled0000` dragged by (−8, 160): grid
   (632, 320); its left edge is 8 from flow's left edge 640 (beyond 6); its
   origin 730.080078125 is 0.8974609375 from flow's origin 730.9775390625.
   Stored x = 730.9775390625 − 98.080078125 = 632.8974609375 (1296174/2048,
   so quantizing to 1/2048 leaves it exact), y 320; one guide during the drag.
6. **Locked drag pans.** The lock button pressed (`aria-pressed="true"`,
   `locked()` true); a drag of (50, 30) on `bare`'s card moves the
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
   (0…476.58 × 0…67.38) and `flow000000` (640…1158.26 × 0…102.33) whole, and
   `nested` (y 160…255.98) and `styled` (640…1168.08 × 160…296.92) only in
   part. A marquee selects only blocks wholly inside.
   - **Shift+drag replaces** the selection: exactly {bare000000,
     flow000000} (a partial-overlap rule would add nested and styled, an
     additive one would keep map); the viewport stays put.
   - **With the `marquee` toggle on, everything adds**: the same plain drag
     gives {bare000000, flow000000, map0000000}, the viewport stays put. With
     the toggle off again the same drag pans to (700, 220).
   - **Clicks in marquee mode add and remove.** With nothing selected and the
     toggle on: a click on `bare`'s margin → {bare000000}; a click on
     `nested0000`'s `clt_2` → {bare000000, nested0000/clt_2}; a marquee from
     canvas (600, −40) by (280, 90) pixels, to (1160, 140), which holds only
     `flow000000` whole → {bare000000, flow000000, nested0000/clt_2}; a
     click on `bare`'s margin again removes it → {flow000000,
     nested0000/clt_2}.
   - **A click on the empty canvas clears the selection in every mode;
     Shift+click there keeps it.** The selection Svelte Flow shows (the
     nodes with class `selected`) always equals the selection's block ids,
     and the elements marked `data-selected` equal its element addresses;
     both are checked after every step below, as is the journal (never
     changed). With the toggle on: a click on `bare`'s margin and on
     `nested0000`'s `clt_2` → {bare000000, nested0000/clt_2}; a click on
     the empty canvas at canvas (400, 120) → {} (no node `selected`, no
     `data-selected`); a click on `flow000000`'s margin → {flow000000}
     alone (a stale selection would bring back bare and clt_2). Then a
     click on `bare`'s margin → {bare000000, flow000000}, and
     Shift+click on the empty canvas at (400, 120) keeps exactly that, both
     nodes still `selected` (Svelte Flow itself clears its flags on a pane
     click, so the projection must restore them); the next click, on
     `map0000000`'s margin, gives {bare000000, flow000000, map0000000}.
     With the toggle off the same holds: from {bare000000, flow000000,
     map0000000}, Shift+click on the empty canvas keeps all three, a plain
     click there gives {}, a click on `nested0000`'s `clt_2` then gives
     exactly {nested0000/clt_2}. A marquee that ends is no click: the
     marquee step of the previous case already adds without clearing.
   - **A click whose pointer moves a little is still a click.** Svelte
     Flow starts a marquee once the pointer moves more than
     `paneClickDistance` (4 here), or any distance while Shift is held; a
     marquee ending within 4 px of its start counts as a click on what it
     started on. Each step presses at canvas (400, 120), moves 2 px to the
     right in two moves and releases. With the toggle on, from
     {bare000000, flow000000}: Shift → unchanged; without Shift → {}. With
     the toggle off, from {bare000000, flow000000}: Shift → unchanged;
     without Shift → {} (the 2 px also pan the view, which is not
     checked). The canvas shows the selection after every step, as above.
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
   flow000000} whenever the rectangle ends below y 160 and right of
   1158.256591796875 (flow's right edge), which the spec also checks. The other marquee specs stay ≥ 80 px inside
   the pane, out of the zone.
9. **Click (element, block, Shift).** A click on `nested0000`'s child line
   `clt_2` selects exactly `[nested0000/clt_2]`: that element carries
   `data-selected` and its node's `.tilie-block` `data-contains-selection`,
   the only block on the page that does; the card `clt_1/card` holding the
   line has the page's only dashed card mark
   `rect.tilie-holding[data-box=card]`, and no frame mark (`data-box=group`)
   is drawn. A click on `map0000000`'s card then selects exactly the card
   `[map0000000/melody/card]`. Of the two parts addressed
   `melody/card`, the second (the card itself) carries `data-selected` and,
   the pointer resting on it, `data-hovered`; the first (its shadow) carries
   no `data-selected`, and `melody/card` is the only selected address drawn.
   The card's computed `filter` holds the selection's colour
   `rgb(10, 132, 255)` and not the hover's `rgb(156, 200, 255)`: a selected
   card keeps the selection's glow under the pointer. The line `melody`
   carries `data-affected` (Delete of a selected card removes its
   timeline). A click on its margin then selects exactly `[map0000000]`,
   with no `data-selected` or `data-contains-selection` left.
   Shift+click on `styled0000`'s root line adds `styled0000/score`: then
   exactly two `.tilie-block`s carry `data-contains-selection` and two card
   marks are drawn (`clt_1/card` and `score/card`), no frame mark. Shift+click
   on `bare`'s margin adds `bare000000`, Shift+click on `clt_2` again
   removes it: {bare000000, styled0000/score}. A drag that starts on `clt_2`
   moves `nested0000` by (101, 37) to (104, 200) as one command. Escape
   clears the selection.
10. **Delete.** Selection {styled0000/score/intro}, Delete: the journal gains
    exactly `{type: "remove", targets: ["styled0000/score/intro"]}`, the
    manifest's region list is empty and the element `score/intro` is gone
    from the node; Ctrl/Cmd+Z brings it back (`["intro"]`, one element).
    Selection {map0000000}, Backspace: `{type: "remove", targets:
    ["map0000000"]}`, the node gone, the order bare, nested, flow, styled.
    Selection {bare000000/bare, styled0000/score/intro} (a root timeline and
    a region), Delete: exactly one `{type: "remove", targets:
    ["bare000000/bare", "styled0000/score/intro"]}`, as a timeline is removed
    like any other element; `bare000000`'s manifest holds no timeline, its
    node stays (the empty box; the block goes only as a block) without the
    card `bare/card`, and `score/intro` is gone. Ctrl/Cmd+Z restores every
    manifest (their JSON text equals that before the Delete) and both parts.
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
    on its margin, then the focus moves to the inspector's tab (the
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
14. **Nudges.** `map0000000` selected by a click on its margin; → (8,
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

`small`, then `bare000000` set to (40, 80) and `nested0000` to (40, 224) (two
`set` commands, journal 7), so `nested` (224…319.98) ends above `map` (from
320) and clear of every other block; viewport (300, 40), zoom 1, page 1600 ×
1000. `bare`'s box is then 40…516.5771484375 × 80…147.37890625.

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
| bare | box | right | (20, 0) | width 496.5771484375, height null, (40, 80) | 476.5771484375 + 20 = 1016990/2048, exact |
| bare | box | left | (−21, 0) | width 497.5771484375, x 19 | edge 19 (a resize never snaps to the grid); 516.5771484375 − 19 = 497.5771484375, x = right − width = 19, exact |
| bare | box | bottom-right | (20, 11) | width 496.5771484375, height 78.37890625 | 67.37890625 + 11 = 78.37890625, exact |
| bare | box | top | (0, −16) | height 83.37890625, y 64 | edge 64 on the grid; 147.37890625 − 64 = 83.37890625, exact; y = 147.37890625 − 83.37890625 = 64 |
| bare | scale | bottom-right | (229, 0) | scale 1.48046875, (40, 80) | max(705.577…/476.577…, 1) = 1.4805098… → round(3032.08) = 3032/2048 |
| bare | scale | top-left | (−229, 0) | scale 1.48046875, x −188.98046875, y 47.62646484375 | edge −189 (no grid); 705.577…/476.577… = 1.4805098… → 3032/2048; x = 516.5771484375 − 3032/2048 × 476.5771484375 and y = 147.37890625 − 3032/2048 × 67.37890625, each to 1/2048: the right and bottom edges stay exactly put |
| bare | scale | bottom-right | (−440, −60) | scale 0.125 | max(36.58/476.58, 7.38/67.38) = 0.1095… below 1/8 → floor (a rise of 49 no longer reaches it: 18.38/67.38 = 0.2728) |
| bare | stretch | right | (20, 0) | length 420, spacing 1 | width = origin + length + 27, so length + 20 |
| bare | stretch | left | (−21, 0) | length 421, x 19 | edge 19 (no grid), width + 21 |
| bare | stretch | right | (−500, 0) | length 8 | floor `MIN_LENGTH` |
| bare | stretch | bottom | (0, 32) | spacing 3, length 400, y 80 | a single timeline stretches through its padding: 67.37890625 + 32 = 99.37890625 = 51.37890625 + 16 × 3 |
| nested | stretch | bottom | (0, 51) | spacing 2, length 400, y 224 | 95.9765625 + 51 = 146.9765625 = 44.9765625 + 51 × 2 |
| nested | stretch | bottom-right | (200, 51) | length 600, spacing 2 | both at once; the pointer ends at pane x 300 + 40 + 477.19 + 200 = 1017.19, clear of the auto-pan zone |

4. **Stretch to the floor and across the kink.** `nested`'s height is
   `76.98828125 + 16 v` below the kink v = 32.01171875 / 35 = 0.91462… and
   `44.9765625 + 51 v` above it; the padding leaves it no flat piece.
   Stretch stores the largest multiple of 1/2048 (at or above the floor)
   whose height does not pass the pointer. The bottom handle dragged by
   (0, −40) asks for 55.9765625, below the height at the floor 1/4
   (80.98828125), so the solve stops at the floor (y stays 224). Dragged by
   (0, 35) from there, the target is 115.98828125, above the kink, so v ≤
   (115.98828125 − 44.9765625) / 51 = 71.01171875 / 51 = 1.392386…, i.e.
   2851/2048 = 1.39208984375.
4b. **A resize held in the edge zone pans and follows the pointer.** In box
   mode, `bare`'s right handle is pressed at screen x s₀ and moved to screen
   x s₁ = pane right − 20, inside the right edge zone, both whole pixels
   (WebKit and Firefox round pointer positions, so a fractional point would
   travel another distance), held until the viewport has moved, then
   released. The pointer's travel in canvas units is its screen travel minus
   the pan: d = (s₁ − s₀) − (v₁.x − v₀.x) at zoom 1, v₀ = (300, 40) and v₁
   the viewport read after the release. The stored width is
   476.5771484375 + d rounded to 1/2048, with x 40 unchanged, as one `set`.
5. **A no-op resize journals nothing.** In box mode `bare` (width null) has
   its right edge dragged 20 px left: the request is below the content, so
   width stays null, the value already stored; the journal stays at 7 and
   the placement is unchanged.
6. **Box never below the content.** In box mode `bare` grown by 20, then the
   right edge dragged 60 to the left (below the content's 476.58): `width`
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
(touch adjustment), so a tap meant for a block's card lands 14 px or
more from any other drawn element; and it withholds the moves inside its touch
slop (15 px) at the start of a gesture, so a one-finger node drag first
travels 20 px to the right and its delta counts from there (as with the
mouse, Svelte Flow measures a node drag from the move that starts it).

1. A tap on `map0000000`'s card selects the card, `[map0000000/melody/card]`;
   a tap on `nested0000`'s `clt_2` selects `[nested0000/clt_2]`. The margin,
   8 px wide, is narrower than a finger's 14 px, so on a touch screen a
   block is selected by the marquee (6).
2. A one-finger drag of (101, 37) from `map0000000`'s card: raw (101, 357) → grid
   (104, 360), as with the mouse. Stored (104, 360) as exactly one `set`.
3. A one-finger drag of (30, 40) on the empty canvas pans to (50, 60), zoom 1.
4. A pinch (two fingers 40 px apart moved 120 px further apart) changes the
   zoom and journals nothing; the new zoom value is Svelte Flow's and not
   pinned.
5. Taps on `mode-box`, `mode-stretch`, `mode-scale` with `map0000000` selected
   (through the hook, the margin being out of a finger's reach) set the mode, press the button and show 8, 8, 4 handles.
6. With the `marquee` toggle tapped on, at viewport (60, 60), zoom 0.4 (the
   finger stays between pane points (48, 48) and (252, 116), clear of the
   40 px auto-pan zone of the phone's narrow pane), a one-finger drag from
   canvas (−30, −30) by (204, 68) pixels (to canvas (480, 140)) selects
   exactly {bare000000} (bare ends at x 476.58 and y 67.38, flow starts at 640, nested at
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
   The YAML text's line `    name: Bare` (the root's, inside the list
   `timelines`) becomes `    name: Renamed`; Apply
   adds exactly one journal entry (5 → 6), a `set` whose only change
   targets `bare000000` with the single value `manifest`; the drawn name
   `[data-address="bare/name"]` of the block reads `Renamed` and the
   stored manifest's `timelines[0].name` is `Renamed`. After `undo()` through
   the hook the drawn name reads `Bare` again and the textarea, which holds
   no unapplied edit, shows `    name: Bare` again.
2. **A refused edit shows its exact path and keeps the text.** `    locked:
   false` becomes `    locked: yes` (a string in YAML 1.2); Apply leaves the
   journal at 5, the problem list holds exactly one item reading
   `schema_violation must be boolean at /timelines/0/locked`, and the textarea
   still holds the edited text.
3. **The properties form moves the block by the exact amount.** The field
   `x` (initially `0`) is filled with `37.5` and Enter pressed: the journal
   grows by one `set` `{target: "bare000000", values: {x: 37.5}}`, the
   stored `x` is `37.5`, and the node's bounding box has moved right by
   exactly 37.5 px (zoom 1) with its `y` unchanged.
4. **axe-core reports no violation with the drawer open and the manifest
   shown** (YAML chosen, the text beginning with its first key, `groups: []`;
   `bare000000` selected).
5. **The form follows a drag live.** `bare000000` (at (0, 0)) is pressed
   on its card and moved by (101, 37) with the button held: Svelte
   Flow has it at the grid point (104, 40) (no other left edge or origin
   lies within 6 of 104 or of its origin 153.58; the nearest, `map`'s origin 63.54, is 40.46 from 104), so the fields `x` and
   `y` show exactly `104` and `40` while the journal stays at 5 and the
   stored placement is still (0, 0). The release adds exactly one `set`
   `{x: 104, y: 40}`, and the fields show the stored `104` and `40`.
6. **The form follows a resize live, rounded to two decimals.** In box
   mode the `right` handle of `bare000000` is moved by (20, 0) with the
   button held: the field `width` shows exactly `496.58` (the preview's
   476.5771484375 + 20 = 496.5771484375), the journal stays at 5 and the
   stored `width` is still `null`. The release adds one `set` and stores
   `width` 496.5771484375, which the field shows as `496.58`.
7. **A step applies at once, from the stored value.** After a `set` of
   `x` to 10.123 through the hook (journal 6) the field `x` shows `10.12`.
   ArrowUp in the field adds exactly one entry, `{type: "set", changes:
   [{target: "bare000000", values: {x: 11.123}}]}`, and the field shows
   `11.12`; ArrowDown adds one more with `x` 10.123. A click on the field's
   upper spin button (8 px left of its right edge, past the border and
   padding, a quarter of its height from the top; all three engines show
   spin buttons there) adds exactly one entry with `x` 11.123 and the field shows
   `11.12`; undo through the hook restores `x` 10.123 and the journal to
   8 entries, so every step is a command of its own. One wheel notch up
   (`deltaY` −100) over the focused field adds exactly one entry with `x`
   11.123 (from the stored 10.123, never from the shown text). Typed text
   still waits for Enter: typing `5` dispatches nothing.
8. **Escape cancels a resize.** In box mode the `right` handle of
   `bare000000` is moved by (20, 0) with the button held, and the field
   `width` shows `496.58`; Escape ends the gesture: the field shows the
   stored value again (empty, `width` null), the node's bounding box equals
   the one before the gesture, the selection still holds `bare000000`,
   and after the release the journal is still 5.
9. **A selected timeline shows its `locked` as a disabled checkbox.** With
   the drawer open, `bundles` is loaded through the hook (journal 3) and
   the root `score` of `bungroup00` is locked by a `set` of `locked`
   `true` on `bungroup00/score` through the hook (accepted). Then three
   addresses are selected through the hook, one at a time:
   `bungroup00/score` (a root), `bungroup00/pages` (a root segment line,
   no group member) and `bungroup00/page_1` (one of its plain segments).
   Each shows exactly one checkbox named "Locked", disabled, with the
   `title` "Locking and unlocking is not available yet." (which is also
   its accessible description, there being no other), checked for
   `score` and not checked for `pages` and `page_1`: a plain segment is
   never locked, and a root segment line that is no group member keeps
   the `false` it was written with. Each also names the timeline beside
   the drawer's heading by its name: `#inspector-subject` reads exactly
   "Timeline Score", "Timeline Pages", "Timeline Page 1", and the drawer's
   heading is still exactly "Inspector". Selecting the block `bungroup00`
   itself shows no such checkbox, and the subject reads exactly "Bundle
   Sketches" (the manifest's name); selecting the group
   `bmixed0000/group_1` shows no checkbox and the subject "Group
   Performance"; selecting nothing removes the subject.
10. **A press on a card shows its timeline's checkbox.** The root `bare` of
    `bare000000` is locked by a `set` of `locked` `true` on
    `bare000000/bare` through the hook (accepted, journal 6). A press on
    the block's card (`cardPoint`) selects exactly `bare000000/bare/card`,
    and the drawer shows exactly one checkbox named "Locked", disabled and
    checked, in the cell of the form "Block properties" right after the
    `height` field's label, with no `fieldset` in the drawer; the subject
    beside the heading reads exactly "Card of timeline Bare": the card
    stands for its timeline and the value is the stored `true`, not the
    `false` the fixture was written with. A press on the block's margin
    (`marginPoint`) then selects exactly `bare000000`: the checkbox is
    gone and the subject reads exactly "Anonymous bundle" (the manifest
    has neither `id` nor `name`). Neither press adds a journal entry
    (still 6).

## `a11y.spec.ts`

axe-core (`@axe-core/playwright`) on the page with `small` open reports an
empty `violations` list, again with the element `styled0000/score/intro`
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
  476.5771484375 × 67.37890625, so the expected count is the number of grid
  cells whose box overlaps; the spec counts them for the pane's actual
  `clientWidth` × `clientHeight` (the pane's size belongs to the editor's
  layout, not to this contract) and requires exactly that many
  `.svelte-flow__node`. Worked example, pinned in the spec as a check of the
  formula itself: a 1000 × 600 pane shows columns with x in (1523.42, 3000),
  i.e. 1536, 2048 and 2560 (1536 + 476.58 = 2012.58 passes 2000; 1024 +
  476.58 = 1500.58 does not reach it), and rows with y in (32.62, 700), i.e.
  80 … 640 (row 0 ends at 67.38, before 100), eight rows: 3 × 8 = 24 nodes.

## `groups.spec.ts` (Chromium, Firefox, WebKit)

Manifests holding groups on the canvas: `groups` or `bundles` at viewport
(40, 40), zoom 1, page 1600 × 1000, unless a test states otherwise. Every expected list below is the order
of timeskeleton's `docs/drawing.md` section 8.5 (the manifest's title; per
frame the frame, its title, then per member its card and its member
drawing, ancestor lines just before the member's line; then each ungrouped
root's card and drawing), applied to the fixture by hand.

1. **A group workspace draws its frames, cards and lines.** Four nodes. In
   each node, the distinct `data-address` values of the drawn parts, in DOM
   order, kept only when they name a frame, a line or the manifest's title
   (no `/`; the title is `name`), a card (ending `/card`) or a group's title
   (`group_<n>/name`), are exactly:
   - `gchild0000`: group_1, group_1/name, second-half/card, piece,
     second-half, recording/card, recording;
   - `ggrand0000`: group_1, group_1/name, theme/card, score, movement,
     theme, recording/card, recording;
   - `gmixed0000`: group_1, group_1/name, exposition/card, sonata,
     exposition, take/card, session, take, system/card, page, system,
     audio/card, audio;
   - `gstyled000`: group_1, group_1/name, score/card, score, page/card,
     page, performance/card, performance.

   So the cards follow the display order (`graphical.order`, not
   `members`), and an ancestor line precedes its member. Each title reads
   the group's `name`: "Second half", "Theme", "Exposition", "Edition".
   Every card is two parts (shadow, card) carrying its address, every frame
   one.
2. **A bundle workspace draws the manifest's title, its frames, and its
   ungrouped roots without a frame.** Three nodes:
   - `bmixed0000`: name, group_1, group_1/name, score/card, score,
     performance/card, performance, group_2, group_2/name, page/card, page,
     excerpt/card, recording, excerpt, annotations/card, annotations
     (titles "Mixed", "Performance", "Facsimile"; `annotations` is
     ungrouped and follows the frames);
   - `bshared000`: name, group_1, group_1/name, exposition/card,
     score, exposition, take_1/card, take_1, group_2, group_2/name,
     recapitulation/card, recapitulation, take_2/card, take_2, page/card,
     page (titles "Sonata", "Exposition", "Recapitulation"; `score`, the
     parent of both members, appears once in the list of distinct values
     but is drawn in both frames);
   - `bungroup00`: name, pages/card, pages, recording/card,
     recording, score/card, score (title "Sketches"; no frame).
3. **Selecting an element drawn twice marks every copy.** In `bshared000`
   the ancestor line `score` is drawn once per frame: 8 parts carry
   `data-address="score"`, 4 whose box centre lies inside `group_1`'s frame
   (line, start circle, two chevrons running on to the right) and 4 inside
   `group_2`'s (line, two chevrons running on to the left, arrowhead). A
   click on the first part (the line in `group_1`) selects exactly
   `[bshared000/score]`; all 8 parts, in both frames, carry
   `data-selected`, and no other part does. In a manifest of one group the same holds
   for a part drawn twice: `second-half/start` in `gchild0000` is the mark
   of the member's start on `piece`'s ancestor line and its start wedge on
   its own line; a click on the first of the two (the mark) selects exactly
   `[gchild0000/second-half/start]`, both carry `data-selected`, and they
   are the only marked parts.
3b. **A card and its frame holding the selection are drawn dashed, the
   block dotted.** In `bmixed0000` nothing carries
   `data-contains-selection` and no mark `rect.tilie-holding` is drawn. A
   click on the first part of the member line `score` (in `group_1`)
   selects exactly `[bmixed0000/score]`; then exactly two `rect`s of the
   node carry `data-contains-selection`, the frame `group_1` and the card
   `score/card`, and so does the node's `.tilie-block`: three on the page.
   At zoom 1 the marks are, in order, `[block, rgb(10, 132, 255), 1px,
   1px, 2px, non-scaling-stroke, none]`, `[group, …, 2px, 6px, 4px, …]`
   and `[card, …, 3px, 6px, 4px, …]` (`data-box`, `stroke`,
   `stroke-width`, `stroke-dasharray`, `vector-effect`, `fill`): thinner
   outward, the block dotted. Only the block's mark has `shape-rendering`
   `crispedges` (the others `auto`): it lies on the node's edge, between
   two device pixels at a pixel ratio of 1, and is drawn as one pixel of
   the full colour per dot instead of two pale ones. At zoom 2 every width and dash is halved
   (`0.5px` with `0.5px, 1px`; `1px` and `1.5px` with `3px, 2px`), so that
   on screen, where the zoom doubles them, they stay 1, 2 and 3 pixels;
   `non-scaling-stroke` keeps them from scaling with the block. The frame
   and the card keep their own strokes under the marks: `rgb(209, 213,
   219)` (`#D1D5DB`) and `rgb(196, 201, 209)` (`#C4C9D1`, the card's own
   `rect`, not its shadow). Which selections mark which boxes is proven in
   arranger's unit tests; this proves the attributes reach the page and
   the stylesheet draws them.
4. **Delete removes a timeline with its subtree from its group, and a
   region.** In `gchild0000` (roots `piece`, holding `second-half`, and
   `recording`; `group_1` with members `recording`, `second-half`), with
   `{gchild0000/recording}` selected (a member line), Delete journals
   exactly `{type: "remove", targets: ["gchild0000/recording"]}`; the roots
   are then `piece` with the child `second-half`, `group_1`'s members
   `[second-half]`, and the card `recording/card` is gone. Ctrl/Cmd+Z
   brings the journal back to 4 and every block's manifest to its JSON text
   before the Delete. The same for `{gchild0000/piece}` (an ancestor line,
   a root): one `remove` of `gchild0000/piece`, the roots `recording` alone
   (the child `second-half` went with its parent), `group_1`'s members
   `[recording]` (the group stays), and the card `second-half/card` gone
   (`piece` is drawn only as the ancestor line inside that card); undo
   again restores every manifest. Then a region is added through the
   hook with one `add` into `gchild0000/second-half` (`region_1`, name
   `A`, `start` `[2, 1]` and `end` `[6, 1]`, bare values on `second-half`'s
   own `fraction` axis): journal 5, and the node shows the
   part `piece/region_1` (a region is addressed by its root, `piece`, and
   its id). With `{gchild0000/piece/region_1}` selected,
   Delete journals exactly `{type: "remove", targets:
   ["gchild0000/piece/region_1"]}`, the stored `second-half` has no region
   and the part is gone; Ctrl/Cmd+Z brings both back.
4b. **Delete refuses a selection holding the manifest's title.** The title
   is removed only with its block. In `bmixed0000`, with
   `{bmixed0000/annotations, bmixed0000/name}` selected (a root and the
   title), Delete is refused whole: the hint is visible and contains
   "select the block to delete it", the journal stays at 3, every block's
   manifest is unchanged (JSON text before and after identical) and the
   card `annotations/card` is still drawn.
5. **Hover marks the box under the pointer and a boundary; a press on a
   frame selects its group.** The pointer anywhere inside a card marks that
   card: its own rectangle (the one with a stroke), not its shadow, which
   carries the same address, and not the frame around it (the card is the
   innermost box). The mouse moved onto the centre of the first part of the
   member line `recording` in `gchild0000` marks exactly one part in the
   page, the card of `recording/card`. The pointer inside a frame and
   outside its cards marks the frame: the mouse on a point of
   `gchild0000`'s frame `group_1` clear of its cards and its title (the
   element hit there and 6 px around is the frame, `framePoint`, found on
   the same raster as `cardPoint`) marks exactly `[gchild0000/group_1]`. A
   click there selects exactly `[gchild0000/group_1]`, the frame is the one
   part carrying `data-selected`, and no part carries `data-affected` (a
   group removes itself only). In `bungroup00` the segment line `pages` (segments
   `page_1`, `page_2`, `page_3` from 0, 1754 and 3508 px) draws the
   boundaries `page_2/start` and `page_3/start` (a segment starting at 0
   has none); the mouse on `page_2/start` marks exactly, in DOM order, the
   card of `pages/card` (the pointer is inside it) and `page_2/start`, not
   `page_3/start`. With the mouse on the empty canvas no part carries
   `data-hovered`.

   The card is found from the pointer's client position read in the
   drawing's units, `(client − box.left) × drawing.width / box.width` (and
   the same vertically), where the box is the `<svg>`'s on screen; its size
   is the drawing's times the block's `scale` times the zoom. Two tests
   therefore move the pointer where that factor is not 1. In `gchild0000`'s
   drawing (558.4140625 × 190.13671875) the card `second-half/card` spans
   `x` 16 to 542.4140625, `y` 32.8046875 to 116.7578125, the card
   `recording/card` `y` 124.7578125 to 174.13671875, and the first part of
   `recording`, its line from (120.61962890625, 139.16015625) to
   (520.61962890625, 139.16015625), has its centre at (320.61962890625,
   139.16015625).
   - **Zoom 1/2.** The viewport set to (40, 40), zoom 0.5; the mouse moved
     onto the centre of `recording`'s first part marks exactly
     `[gchild0000/recording/card]`. A conversion that left out the factor
     (here 1/2) would read the drawing point (160.309814453125,
     69.580078125), on `second-half/card`, and mark that card instead.
   - **Scale 1.5.** One `set` through the hook, `{target: gchild0000,
     values: {scale: 1.5}}`, is accepted (refusal `null`, journal 5) and the
     node's `<svg>` is redrawn with `width` `837.62109375` (558.4140625 ×
     1.5); at zoom 1 the line's centre lies near canvas (481, 209), clear of
     `ggrand0000` (from `y` 240) and `gmixed0000` (from `x` 640). The mouse
     moved onto it marks exactly `[gchild0000/recording/card]`. Without the
     factor (here 1.5) the point read would be (480.929443359375,
     208.740234375), below every card and below the drawing (height
     190.13671875), and nothing would be marked.
5b. **A stretched bundle's box follows its content.** `bungroup00`
   (`bundles/bundle_ungrouped` at (0, 480)) is drawn `Wc(L) = R + 18` wide
   with `R` the end label `441000 smp` (12831 advance units at size 9,
   56.38623046875 wide) centred at `x0 + L`, `x0 = 16 + w(Recording, 11) +
   8 = 16 + 55.70361328125 + 8 = 79.70361328125` (the page of
   `drawings/bundle__bundle_ungrouped` is 557.8967 = `Wc(400) + 32` wide).
   Every right edge of the drawing is `x0 + L` plus a constant, so `Wc(L) =
   125.896728515625 + L` and `Wc(400) = 525.896728515625`. Selected through
   the hook, box mode, its bottom-right handle dragged by (40, 30): one
   `set` with a `height` request and `width` 565.89697265625, `Wc(400) + 40`
   quantized to 1/2048 (`Wc(400)` is an odd multiple of 1/4096, the half
   label's, and the half rounds up), a margin of 40.000244140625. Then
   stretch mode, its right handle dragged by (50, 0) from a whole-pixel
   press point: one `set`, `length` 450 (the target content is
   `565.89697265625 + 50 − 40.000244140625 = 575.896728515625 = Wc(450)`),
   `width` 615.89697265625 (`Wc(450)` plus the margin: it is kept),
   `height` as before, (0, 480) unchanged. The node's right edge on screen
   moves by exactly the pointer's 50 and its left edge stays put: the box
   follows the content. Without it the box would keep its 565.9 and the
   content grow inside it.
6. **Import and export of a manifest of one group and of a named one.** As in
   `files.spec.ts`, the File System Access pickers are deleted before the
   page loads, so File → Import manifest… is answered through the file
   chooser and File → Export manifest… downloads. On the fresh page (journal
   0), File → Import manifest… with the installed package's
   `fixtures/<SCHEMA_VERSION>/groups/group_styled.json` journals one `add`
   (journal 1); the store holds exactly one new block, the selection is
   exactly that block, and its manifest's JSON text equals that of
   `loadManifest` of the file's text (run in the test, outside the page).
   File → Export manifest… downloads a file named as the editor's
   `manifestFileName` names it, from the manifest's `id`, else its `name`,
   else `bundle` (`bundle.json`: the fixture has neither), whose text
   equals `dumps` of the loaded fixture (core's `saveManifest`, the
   canonical form) and the fixture file's own text, byte for byte (the
   fixtures are written in that form). Then the same with
   `bundles/bundle_mixed.json`: journal 2, one block more, selected alone,
   its manifest that of `loadManifest` of the file, exported as
   `Mixed.json` (its `name`; it has no `id`) with the text of the fixture
   file.

## `segments.spec.ts` (Chromium, Firefox, WebKit)

Deleting a segment is not supported yet: Delete on a segment is refused
in the canvas's status line and changes nothing (the refusal is
`removeCommand`'s, proven in arranger's unit tests; the menu that will ask
how to close the gap is proven there as a component and is not mounted).
This spec checks the refusal in a browser, where the keys and the status
line are real. The file chooser is answered as in `files.spec.ts` (the
open picker deleted before the page loads).

File → New workspace, then File → Import manifest… with the installed
package's `fixtures/<SCHEMA_VERSION>/segment_line.json`: journal 1, the new
block selected. Its root `form` (32 quarters) holds the segments `a` at 0,
`b` at 8 and `c` at 20. With `<block>/b` selected through the hook and the
arranger focused, Delete and then Backspace each:

- show `Deleting a segment is not supported yet.` in the status line
  (`data-testid="hint"`);
- open no menu (`[data-testid="gap-menu"]` is absent) and mark nothing
  `[data-moved]`;
- journal nothing (the journal stays where it was before the key), keep
  the selection `[<block>/b]`, and leave `form` 32 long holding `a` at
  `[0, 1]`, `b` at `[8, 1]` and `c` at `[20, 1]`.

Between the two keys the hint is cleared, so that Backspace's hint is its
own refusal and not Delete's left standing. The status line clears on the
next command the canvas stores: with the block selected through the hook,
ArrowRight nudges it (journal 2) and the status line is empty. Then
`<block>/b` is selected again and Backspace is pressed; its journal stays at
2.

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
font would otherwise become a baseline that only some runs reproduce. A
seventh screenshot, `groups.png`, is of the pane with `groups` open at the
same viewport, zoom and page, under the same font checks: frames, cards,
titles, ancestor lines and the styled frame of `gstyled000`. The
baselines are made and checked only in the pinned Playwright container
(`pnpm e2e:visual:update`, `pnpm e2e:visual`).
