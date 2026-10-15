# `@timetoalign/tilie-arranger` tests

The arranger's plain TypeScript turns a workspace view into Svelte Flow nodes
and turns gestures on those nodes into workspace commands. Each section
below says what would prove a function works, and why that proof is more
than a restatement of the implementation. Expected values are written here
before any test is. They are derived from timeskeleton's `docs/drawing.md`
and from the box sizes of the upstream drawing fixtures, never from running
the arranger.

Every view is built from timeskeleton's manifest fixtures through core's
commands (`add` a block, `set` a placement). No test writes a manifest
literal. `support.ts` reads the fixtures from the installed
`@timetoalign/timeskeleton` package.

## Fixture facts the expected values rest on

All values are in canvas units, for the default placement (length 400,
spacing 1, no box request) and the default style layer.

- **Every manifest is drawn as one box** (section 8). A manifest of one
  root and no name has no title and no frame, its root drawn in its card
  `T/card`. The name column starts at `xn = P + K = 16`; the card spans `x
  = P` to `R + K`, `R` the member drawing's largest right edge (section
  6.7), and is `Hm` high from `y = P`, `Hm` the member drawing's height
  (section 6.5, its padding `P v` inside the card); the card's shadow lies
  2 to the right and 2 below. The box is `P` plus the shadow's right and
  bottom edges, so `W = R + K + 2 + P = R + 18` and `H = P + Hm + 2 + P =
  Hm + 18`. The box's padding `P` is not stretched by `v`. A drawing
  fixture's page is the box plus 16 on every side (section 7.1), so `W =
  PW − 32` and `H = PH − 32` of its `figure.svg`.
- **`bare`**: the root `bare`, named "Bare" at font size 11. The DejaVu Sans
  advances of B, a, r, e are 1405, 1255, 842, 1260, which sum to 4762, so
  the name is `N = 4762 × 11 / 2048 = 25.5771484375` wide.
  - Section 8.2: the line starts at `x0 = xn + N + G' = 49.5771484375`. The
    rightmost element is the arrowhead's tip at `x0 + L + 3w` (w = 3), so
    `R = 58.5771484375 + L` and `W = R + 18 = 76.5771484375 + L`, giving
    `W(400) = 476.5771484375`: the page of `drawings/bare/figure.svg` is
    `PW = 508.5771` wide, `W + 32` written to four decimals. This holds as
    long as the root's arrowhead stays rightmost, which is true for every
    `L ≥ 8` because the end label is narrower than `2 × 9`.
  - Height (sections 6.4, 6.5, 8.4): the bare root has only its below-side
    wedges, so `Ea = 0`, the root band does not scale, and the padding
    `P v = 8v` lies above and below: `y_root = 8v + h(11) / 2` and `Hm =
    8v + 6.40234375 + 26.9765625 + 8v = 33.37890625 + 16v`, so `H = Hm + 18
    = 51.37890625 + 16v`, affine at every `v`, with `H(1) = 67.37890625`
    (the page of `drawings/bare/figure.svg` is `PH = 99.3789` high),
    `H(1/4) = 55.37890625`, `H(1/2) = 59.37890625` and `H(2) =
    83.37890625`. A single timeline stretches vertically through its
    padding alone.
- **`nested`**: the root `clt_1`, child `clt_3`, grandchild `clt_2`, both
  rows on the above side. `x0 = 49.91552734375` (pinned by layout's
  examples test) and `W = 77.194580078125 + L`, so `W(400) =
  477.194580078125`: the pages of `drawings/nested__length-200`, `-400` and
  `-800` are `PW = 309.1946`, `509.1946` and `909.1946` wide, slope 1 in
  `L`.
  - Height (sections 6.2, 6.4, 6.5): with `p = max(14v, h(11))` and
    `h(11) = 12.8046875`, the children band starts at `p0 / 2` and holds two
    rows of halves `p / 2`. So `Ea = 2.5p`, `y_root = 8v + 2.5p`, and the
    below side is the wedge reach `1.5 + 13 + 2 + h(9) = 26.9765625`, plus
    the padding `8v`.
  - Hence `Hm = 26.9765625 + 51v` for `v ≥ h(11) / 14 = 0.914620535…`, and
    `Hm = 58.98828125 + 16v` below that (`2.5 h(11) = 32.01171875`), and
    `H = Hm + 18`: `H = 44.9765625 + 51v` above the kink and `H =
    76.98828125 + 16v` below it. This gives `H(1) = 95.9765625`, `H(1.5) =
    121.4765625`, `H(2) = 146.9765625` (the pages of
    `drawings/nested__spacing-1` and `drawings/nested__spacing-2` are `PH =
    127.9766` and `178.9766` high; 1.5 interpolates), `H(1/2) =
    84.98828125` (`drawings/nested__spacing-0.5`, `PH = 116.9883`) and
    `H(1/4) = 80.98828125`. **Height is not affine in spacing**: it is
    piecewise linear, of slope 16 below the kink and 51 above it.
- **`flow_control`**: the root `flow:quarters` with `break_1` and `jump_1`.
  **`with_region`**: the root `clt_1` with `region_1`.
- **Addresses** (drawing.md section 2.2), in every manifest alike: a
  timeline, a group or the manifest by its bare id; every other element by
  its root's id, `/` and its own id (`melody/tempo`, `clt_1/region_1`,
  `score:clt_1/tmap_1`); a part follows the element's address
  (`score/region_1/label`); the manifest's title is `name`. Core reads
  such an address with `elementOf`, which the arranger uses wherever it
  folds a part into its element. Core removes any element, timelines and
  groups included (`removedBy` names what goes with it).
- **Manifests of several roots and groups** (drawing.md section 8):
  - **`group_number_types`** (one group): group `group_1` "Edition", roots
    (all three members, none with entries) `page`, `performance`, `score`.
    `numbers` below is this file with `region_1` (2 to 4 quarters, named
    "A") added to `score` through an `add` into `<block>/score`, so its
    address is `score/region_1` and its label's `score/region_1/label`.
  - **`group_child_member`** (one group): roots `piece` ⊃ `second-half`
    and `recording`; the members are `second-half` and `recording`, so
    `piece` is drawn as `second-half`'s ancestor line.
  - **`corpus_mpm`** (two groups, named): groups `group_1` (`score:clt_1`,
    `score:dlt_1`) and `group_2` (`perf:cpt_1`, `perf:dgt_1`,
    `perf:dpt_1`); the root `score:clt_1` carries the map
    `tmap_1`, addressed `score:clt_1/tmap_1`.
  - **`bundle_shared_parent`** (two groups, named): `score` (0 to 32 quarters) ⊃
    `exposition` (offset 0, 12 quarters, a member of `group_1`) and
    `recapitulation` (offset 20, 12 quarters, a member of `group_2`). So
    `score` is drawn twice, as the ancestor line of each member (section
    8.3), four descriptors addressed `score` in each card: in
    `exposition`'s its line, its start dot (they start together) and two
    chevrons at the right (it runs on past `exposition`'s end); in
    `recapitulation`'s its line, two chevrons at the left and its
    arrowhead (they end together). `exposition`'s start is marked twice
    with the address `exposition/start`: on the ancestor line and on its
    own line (section 2.2).

Block ids in the tests are `A = "0000000000"`, `B = "0000000001"` and
`C = "0000000002"`. Block A holds `bare` at `(40, 80)` unless stated
otherwise. The grid is the default `{size: 8, snap: true}`.

## `quantize` and the constants

`quantize(value, step)` is `Math.round(value / step) * step`: halves round
towards +∞, and −0 becomes 0. Pinned values:

| value | step | result |
|---|---|---|
| 19 | 8 | 16 |
| 20 | 8 | 24 (2.5 rounds up) |
| −20 | 8 | −16 (−2.5 rounds up) |
| −0.001 | 8 | 0 (not −0, `Object.is`) |
| 19.999999999999943 | 1/2048 | 20 (the noise Svelte Flow writes) |
| 478.5771484375 | 1/64 | 478.578125 |
| 478.5771484375 | 1/2048 | 478.5771484375 (already a multiple) |
| 101.3 | 1/2048 | 101.2998046875 |

Constants: `GRID_FREE = 1/2048`, the font's units per em: every text
width is an integer of advance units × size / 2048, so at sizes and scales
that are integers, text-derived edges and plot origins are multiples of it
and are stored bit-exact. The other constants are `MIN_SCALE = 1/8`, `MIN_LENGTH = 8`,
`MIN_SPACING = 1/4`.

## `drawingOf`

- The memoized drawing **equals** layout's `draw(manifest, placement,
  [DEFAULT_LAYER, settings.graphical, manifest.graphical], metrics)`,
  compared with `toEqual`. This proves the layers are passed in the order
  drawing.md section 1 prescribes.
- A second call with the same block and settings returns the **identical**
  object (`toBe`).
- A view whose settings were changed by a `set` on `workspace` (a new
  `graphical` layer) gives a new drawing for the same block object, and
  the new drawing reflects the setting: a `{select: {element: "block"},
  set: {fill: "#FFFFFF"}}` statement turns the block element's fill to
  `#FFFFFF`.
- With `preview` (`{length: 800}`), the drawing has the preview's width,
  `W(800) = 876.5771484375` for `bare`. It is never cached: the memoized
  drawing is still the length-400 one afterwards.

## `project`

What proves the projection is complete and stable:

- **Exact node shape.** Take block A (`bare`) at (40, 80), and block B
  (`nested`, added second, at (0, 0)) set to scale 2. With selection
  `{A, B/clt_3}`:
  - `A` gives `{id: A, type: "block", position: {x: 40, y: 80}, width:
    476.5771484375, height: 67.37890625, measured: {same}, handles: [],
    selected: true, zIndex: 0}`.
  - `B` has `width: 954.38916015625`, `height: 191.953125` (the drawing's
    477.194580078125 × 95.9765625, × 2), `selected: false`, `zIndex: 1`,
    `data.selectedElements = {clt_3}`
    and `data.containsSelection: true`.
  - Neither node has a `draggable` member. `data.descriptors` equals
    `toDescriptors(data.drawing)`.
- **Blocks of manifests with groups.** A block holding `numbers` with selection
  `{A/score/region_1/label}` has `data.selectedElements =
  {score/region_1/label}` (everything after the block id, slashes kept),
  `containsSelection: true` and `affectedElements = {score/region_1}`; its
  `data.drawing` equals `drawingOf(block, …)`, so every manifest is drawn
  through the one path.
- **Index order and rank.** Setting B's index below A's (core's
  `indexBetween(null, A.index)`) returns `[B, A]` with zIndex 0 and 1.
- **Reuse.** Projecting a second time with the first result as `previous`
  returns the identical node objects (`toBe` member by member).
  - After a `set` that moves only A, B's node is identical and A's is new.
  - After a selection change that touches only A, B's node is identical.
  - After a selection change of B's elements, B's node is new.
  - A `previous` node whose position differs from its block (a preview
    Svelte Flow wrote during a drag) is not reused, so an abandoned drag
    never sticks.
  - **The selection is the only authority over `selected`.** A `previous`
    node whose `selected` flag differs from the selection (Svelte Flow
    clears every node's flag on a click on the empty canvas and sets one on
    a click on a node) is not reused: with selection `{A, B/clt_3}` and a
    `previous` whose A node is that node with `selected: false` and whose B
    node has `selected: true`, the result has A `selected: true` and B
    `selected: false`, both new objects, and for every node `selected`
    equals whether the selection holds its block id; an element address
    never selects its block's node.
- **The Delete preview** (`segments.test.ts`). With `preview = {segment:
  A/t2, gap: right shift}` on a block A of theme unlocked, A's
  `data.movedElements` is exactly `movedByGap`'s set for that segment and
  gap, and without a preview it is empty. Projecting again with the same preview returns the
  identical node; with the gap changed to left shift A's node is new and
  carries the left-shift set.
- **Live placement.** `livePlacement(block, position, values)` is what the
  inspector shows during a gesture: the block's `id`, `scale`, `length`,
  `spacing`, `width` and `height` overridden by the previewed `values`, and
  `x`, `y` from the node's `position` (where Svelte Flow has the dragged or
  previewed node). For A (`bare` at (40, 80), defaults) with `position`
  (104, 40) and no values it is exactly `{id: A, x: 104, y: 40, scale: 1,
  length: 400, spacing: 1, width: null, height: null}`; with `values`
  `{width: 478.5771484375}` and `position` (40, 80) it is the same with
  `x: 40, y: 80, width: 478.5771484375`; with `values` `{x: 19, scale: 2}`
  and `position` (19, 80) it has `x: 19, scale: 2` (the position wins over
  a previewed `x`, and they agree whenever the canvas shows a preview).
- **Property (fast-check).** For any sequence of accepted move, z-order and
  remove commands drawn from the gesture functions below, projecting the
  resulting view twice (the second time with the first result as
  `previous`) returns an array whose members are identical. It has one
  node per block, and each `width` equals the drawing's width × the scale.

## `moveCommand`

`moveCommand(view, moves)` only quantizes, to `GRID_FREE`; deciding grid
versus alignment is `snap`'s job, and its result is final. The caller
passes the dragged block's snapped position, and the other blocks of a
multi-block drag at their positions moved by the same snapped delta.

View: A holds `bare` at (40, 80), B holds `nested` at (0, 0).

- Moves `[{id: A, x: 41.5771484375, y: 203}, {id: B, x:
  19.999999999999943, y: 0}]` give one `set` with changes `[{target: A,
  values: {x: 41.5771484375, y: 203}}, {target: B, values: {x: 20, y: 0}}]`,
  in the order of `moves`. A snapped origin (bare's 41.5771484375) is
  stored unchanged, being a multiple of 1/2048, and the noise Svelte Flow
  writes is gone.
- A move that quantizes to the block's stored position (`(40.0001,
  79.9999)` for A, both deltas below 1/4096) is left out; `moveCommand(view, [])` and a list of only
  such moves give `null`.
- The command is accepted by `apply`; the moved blocks carry the values
  above.

## `addCommand`

`addCommand(view, id, manifest, visible)` places a new block (an imported
manifest) with its top-left at the centre of what the canvas shows,
quantized as a move is (to the grid when it snaps, else to `GRID_FREE`).
`visible` is Svelte Flow's transform `{x, y, zoom}` (screen = canvas ×
zoom + translation) and the pane's size in screen pixels, so the centre in
canvas units is `((width / 2 − x) / zoom, (height / 2 − y) / zoom)`.

- With `visible = {x: 100, y: 50, zoom: 2, width: 1000, height: 600}` the
  centre is `(200, 125)`; under the default grid (8, snapping) the command
  is exactly `{type: "add", into: "workspace", block: {id: C, manifest:
  bare, x: 200, y: 128}}` (125 / 8 = 15.625 rounds to 16).
- With the grid's `snap` false, the same `visible` gives `(200, 125)`,
  both multiples of 1/2048; with `visible = {x: 0, y: 0, zoom: 3, width:
  1001, height: 1}` (centre `(166.8333…, 0.1666…)`) it gives
  `x = 341675 / 2048 = 166.83349609375` and `y = 341 / 2048 =
  0.16650390625` (`round(166.8333… × 2048) = round(341674.67) = 341675`;
  `round(341.33) = 341`).
- Applying the snapping command to a view holding A gives a block C at
  `(200, 128)` whose `scale`, `length`, `spacing`, `width`, `height` and
  `order` are the workspace's `blockDefaults`, its manifest equal to the
  fixture, and whose index lies above A's.

## `snap`

Hand-built boxes, grid `{8, true}`, tolerance 6. The moving box is `{x:
101, y: 203, origin: 142.5771484375}`, so its origin lies 41.5771484375 to
the right of its left edge.

| others | result |
|---|---|
| none | `{x: 104, y: 200, guides: []}` (grid only) |
| `{x: 200, origin: 260}` | `{x: 104, y: 200, guides: []}` (all beyond 6) |
| `{x: 110, origin: 300}` | `{x: 110, y: 200, guides: [{axis: "x", at: 110}]}` (left edge to left edge, distance exactly 6: inclusive) |
| `{x: 110.5, origin: 300}` | `{x: 104, …, guides: []}` (6.5 is beyond) |
| `{x: 300, origin: 147}` | origin to origin, distance 1.4228515625: `x = quantize(147 − 41.5771484375, 1/2048) = 105.4228515625`, guide at 147 |
| `{x: 107, origin: 400}` and `{x: 300, origin: 145}` | the nearest wins: origin to 145 (distance 0.5771484375) beats left edge to 107 (distance 3); see below |
| the moving box itself among `others` | ignored by id |

In the last data row: the moving origin after the grid is 145.5771484375,
which is 0.5771484375 from 145, nearer than 3. So the result is `x =
quantize(145 − 41.5771484375, 1/2048) = 103.4228515625` with the guide at 145.
This row proves the nearest candidate wins, not the first.

`snap` moves the moving box's left edge or its origin, whichever lands
nearer, onto another block's left edge or origin. A guide is emitted
exactly when such an alignment happens (never for a grid snap alone).

On a tie, the first candidate wins, in the order of `others`, a left edge
before an origin as the target, and the moving left edge before the moving
origin: with others at left edges 108 and 100 (both 4 from 104), the guide
lies at whichever is listed first. With the grid off, positions quantize to
1/2048 before the alignment step: `(101.3, 203.3)` lands at
`(101.2998046875, 203.2998046875)`. `y` only ever snaps to the grid.

## `handlesFor`

`scale` gives the four corners in the order top-left, top-right,
bottom-right, bottom-left. `box` and `stretch` give all eight in the order of
the `Handle` type.

## `resize`

The dragged edge ends under the pointer and the opposite edge stays exactly
where it was. Every number, positions included, quantizes to `GRID_FREE`
(1/2048) and never to the grid: the grid governs moves and nudges, not the
anchoring of a resize. Snapping a left edge to the grid would shift the
fixed right edge (516.5771484375 for block A below) off its place. A left or top
handle quantizes the pointer's edge, the size follows from the fixed
opposite edge, and the stored position is the opposite edge minus the
achieved size. Block A holds `bare` at (40, 80), so `right = 40 + W =
516.5771484375` and `bottom = 80 + H = 147.37890625`. Bare's extents are multiples
of 1/2048, so every row below is exact.

**Box** (sets `width`/`height`, plus `x`/`y` for left and top):

| handle | delta | values |
|---|---|---|
| right | (20, 0) | `{width: 496.5771484375}` (`W + 20`) |
| right | (−20, 0) | `{width: null}` (below the content's 476.577…) |
| left | (−21, 0) | `{width: 497.5771484375, x: 19}` (`516.5771484375 − 19`) |
| left | (100, 0) | `{width: null, x: 40}` (cannot shrink; the box stays) |
| bottom | (0, 10.5) | `{height: 77.87890625}` (`H + 10.5`) |
| top | (0, −16) | `{height: 83.37890625, y: 64}` (`147.37890625 − 64`) |
| bottom-right | (20, 10.5) | `{width: 496.5771484375, height: 77.87890625}` |
| left, grid off | (−21, 0) | `{width: 497.5771484375, x: 19}` (the grid plays no part) |

**Choice: a request at or below the content's extent stores `null`**, the
content's own size, rather than the extent's number. Then a later edit that
grows the content grows the box with it, and the stored value never
duplicates a derived one.

**Scale** (corners only; `scale`, plus `x`/`y` for the anchored left or
top). The new scale is the larger of the two axis ratios `target width / W`
and `target height / H`, so the box always reaches the pointer. It is then
quantized and floored at `MIN_SCALE`:

| handle | delta | values |
|---|---|---|
| bottom-right | (238.28857421875, 0) | `{scale: 1.5}` |
| top-left | (−238.28857421875, 0) | `{scale: 1.5, x: −198.28857421875, y: 46.310546875}` |
| bottom-right | (−440, −60) | `{scale: 0.125}` (floored at `MIN_SCALE`) |
| right | any | throws `RangeError` (no edge handles in scale mode) |

The horizontal travel is `W / 2 = 238.28857421875`, so the target width
is `714.86572265625 = 1.5 W` and, the height's ratio being 1, the scale is
1.5. For the top-left row the left edge goes to `40 − 238.28857421875 =
−198.28857421875`; then `x = 516.5771484375 − 1.5 × 476.5771484375 =
−198.28857421875` and `y = 147.37890625 − 1.5 × 67.37890625 =
46.310546875`. Both are multiples of 1/2048, so the right and bottom edges
stay exactly where they were. In the last row both ratios lie below
`MIN_SCALE`: `36.5771484375 / 476.5771484375` and `7.37890625 /
67.37890625 = 0.1095…`, so the scale is the floor.

**Stretch** (`length` from left/right, `spacing` from top/bottom, both from a
corner). How the inverse is derived:

- By drawing.md section 6.7, the content's width is `P` plus the largest of
  terms of the form `x0(L) + L × u + c`, with `x0(L)` itself a maximum of
  such terms. So `Wc(L)` is non-decreasing and piecewise linear in `L`. It
  is flat while a centred end label wider than the start label sets `x0`,
  and slope 1 once the root's arrowhead or that label leads (the `audio`
  rows below).
- By sections 6.2 to 6.5, the content's height for a fixed `L` is a sum of
  maxima of affine terms in `v`, the padding `2Pv` among them. So `Hc(v)`
  is increasing and piecewise linear, with a kink where a font height
  outgrows a pitch (`nested`); the padding leaves it no flat piece.
- `resize` stores **the largest multiple of 1/2048, at least the floor,
  whose extent does not pass the target**. The search is over that
  lattice:
  - a Newton guess from the current value, with the slope over one 1/2048
    step, and its neighbour, which settle an affine piece in four drawings;
  - then bisection between the largest value known to fit and the smallest
    known not to.
  This holds on flat pieces too: a start on a flat piece no longer stalls
  the search.
- **A target below the smallest extent** (the extent at the floor) is
  raised to that extent. A shrink past a flat piece therefore stops at the
  piece's knee: the largest lattice value that still draws the flat
  extent, never the floor. Every value below the knee draws the same and
  would be invisible state (widths have such pieces: `audio` below). An
  extent that never grows past the target leaves the value as it is; no
  drawing's width or height is such an extent.
- The target is the content's extent moved by the pointer:
  `content + (target box − box)`. When the box has no request, the content
  and the box coincide, so the edge ends under the pointer.
- **The box follows the content** (drawing.md section 1), on each axis on
  its own, once `length` and `spacing` are solved. With `content` the
  content's extent before the stretch, `content′` after it and `request`
  the stored `width` (or `height`): a `null` request stays `null` and is
  not written; a request larger than `content` keeps the space it adds,
  `request′ = content′ + (request − content)` quantized to 1/2048, written
  only when it differs from the stored one; a request at or below
  `content` draws nothing and becomes `null`. The box is then
  `max(content′, request′)`, so the dragged edge ends under the pointer
  with or without a request, and the left or top anchoring uses that box.
  This proves the margin is kept, not merely that the content moved: the
  content's extent moves by the pointer's travel, and so must the box's.

`audio` is `corpus_audio_audio` at (40, 80), with a workspace statement
hiding every name (`{select: {element: "name"}, set: {display: "none"}}`).
Its labels are "0.0 s", whose advances sum to 4975, so `w0 =
21.86279296875` at size 9, and "231.0791836734694 s", whose advances sum to
23217, so `we = 102.02783203125`. With no name drawn, section 8.2 gives
`x0 = max(xn + w0/2, xn + we/2 − L)` with `xn = 16`, the end label's right
edge `x0 + L + we/2` is `R`, and `W = R + 18`:

- Below the knee `L* = (we − w0)/2 = 40.08251953125`, `R = xn + we`, so
  `W = 34 + we = 136.02783203125` is flat.
- Above it, `R = xn + (w0 + we)/2 + L`, so `W = 95.9453125 + L`.

| fixture | handle | delta | values |
|---|---|---|---|
| bare | right | (20, 0) | `{length: 420}` |
| bare, scale 2 | right | (20, 0) | `{length: 410}` |
| bare | left | (−21, 0) | `{length: 421, x: 19}` |
| bare | right | (−500, 0) | `{length: 8}` (`MIN_LENGTH`; bare's width has no flat piece) |
| bare | bottom | (0, 30) | `{spacing: 2.875}` (67.38 → 97.38) |
| bare | top | (0, −16) | `{spacing: 2, y: 64}` |
| bare | bottom | (0, −8) | `{spacing: 0.5}` |
| bare | bottom | (0, −40) | `{spacing: 0.25}` (`MIN_SPACING`) |
| nested | bottom | (0, 51) | `{spacing: 2}` (95.98 → 146.98, as `nested__spacing-2`) |
| nested | bottom | (0, 25.5) | `{spacing: 1.5}` |
| nested | bottom-right | (400, 51) | `{length: 800, spacing: 2}` |
| nested | top | (0, −51) | `{spacing: 2, y: 29}` |
| nested | bottom | (0, −40) | `{spacing: 0.25}` (`MIN_SPACING`) |
| nested, spacing 1/4 | bottom | (0, 35) | `{spacing: 1.39208984375}` |
| nested, spacing 1873/2048 | bottom | (0, 35) | `{spacing: 1.6005859375}` |
| audio | right | (−500, 0) | `{length: 40.08251953125}` (the knee) |
| audio, length 8 | right | (50, 0) | `{length: 90.08251953125}` |
| audio, at the knee | right | (100, 0) | `{length: 140.08251953125}` |
| bare, width 496.58 | right | (20, 0) | `{length: 420, width: 516.5771484375}` |
| bare, width 496.58 | left | (−21, 0) | `{length: 421, width: 517.5771484375, x: 19}` |
| bare, width 496.58 | bottom | (0, 30) | `{spacing: 2.875}` (the width's axis is unchanged) |
| bare, height 77.88 | bottom | (0, 30) | `{spacing: 2.875, height: 107.87890625}` |
| bare, height 77.88 | top | (0, −16) | `{spacing: 2, height: 93.87890625, y: 64}` |
| bare, both requests | bottom-right | (20, 30) | `{length: 420, spacing: 2.875, width: 516.5771484375, height: 107.87890625}` |
| bare, length 500, width 496.58 | right | (20, 0) | `{length: 520, width: null}` (a request the content has overtaken) |
| child member, width 600 | right | (50, 0) | `{length: 450, width: 650}` |

How each row is derived:

- **`bare` bottom +30:** the target is `97.37890625 = 51.37890625 + 16v`,
  so `v = 46/16 = 2.875`. **`bare` top −16:** the edge 147.37890625 is
  kept, the target height is `83.37890625 = H(2)`, so `v = 2` and `y =
  147.37890625 − 83.37890625 = 64`. **`bare` bottom −8:** `59.37890625 =
  H(0.5)`. **`bare` bottom −40:** the target 27.37890625 lies below
  `H(1/4) = 55.37890625`, so the spacing stops at the floor.
- **`nested` top:** the bottom edge `80 + 95.9765625 = 175.9765625` is
  kept and the top goes to `80 − 51 = 29`, so the target height is
  `146.9765625 = H(2)`. Hence `v = 2` and `y = 175.9765625 − 146.9765625 =
  29`.
- **`nested` bottom −40:** the target 55.9765625 lies below `H(1/4) =
  80.98828125`, so the spacing stops at the floor.
- **Grow by 35 across the kink** (regression rows for a start on the lower
  piece): from spacing 1/4 (`H = 80.98828125`) the target is
  `115.98828125`, above the kink's 91.62…, so `v ≤ (115.98828125 −
  44.9765625) / 51 = 71.01171875 / 51 = 1.392386…`; `floor(× 2048) = 2851`
  gives `1.39208984375` (`H = 115.97314453125`; 2852 would draw
  `115.998046875`). From spacing `1873/2048 = 0.91455078125`, just below
  the kink (`H = 76.98828125 + 14.6328125 = 91.62109375`), the target is
  `126.62109375`, so `v ≤ 81.64453125 / 51 = 1.600873…`; `floor(× 2048) =
  3278` gives `1.6005859375` (`H = 126.6064453125`; 3279 would draw
  `126.63134765625`).
- **`audio` right −500:** the target is below the flat 136.02783203125, so
  the length stops at the knee `L* = 40.08251953125` (169/2048 past 40).
- **`audio` from length 8, right +50:** the target is `136.02783203125 + 50`,
  so `L = 186.02783203125 − 95.9453125 = 90.08251953125`.
- **`audio` from the knee, right +100:** `L = 140.08251953125`.

The last eight rows store a box request first (one `set` on block A), the
values of the box rows above: `width 496.58` is `width = W + 20 =
496.5771484375`, `height 77.88` is `height = H + 10.5 = 77.87890625`,
`both requests` both of them. With `Wc(L) = 76.5771484375 + L` and `Hc(v) =
51.37890625 + 16v` from the fixture facts, the box is `max(Wc, width)` by
`max(Hc, height)`:

- **`width 496.58` right +20:** the box is 496.5771484375 wide, its right
  edge `40 + 496.5771484375 = 536.5771484375`, so the target box is
  516.5771484375 and the target content `516.5771484375 − (496.5771484375 −
  476.5771484375) = 496.5771484375 = Wc(420)`: `L = 420`. The margin 20 is
  kept: `width = Wc(420) + 20 = 516.5771484375`, so the right edge goes to
  556.5771484375, the old one plus the pointer's 20.
- **`width 496.58` left −21:** the left edge goes to 19 and the right edge
  536.5771484375 stays, so the target box is 517.5771484375, the target
  content 497.5771484375 and `L = 421`; `width = Wc(421) + 20 =
  517.5771484375` and `x = 536.5771484375 − 517.5771484375 = 19`.
- **`width 496.58` bottom +30:** the spacing solves as in `bare` bottom
  +30 (no height request: 2.875). The width's content does not depend on
  `v`, so `width′ = Wc(400) + 20` equals the stored request and is not
  written.
- **`height 77.88` bottom +30:** the box is 77.87890625 high, its bottom
  edge 157.87890625, so the target box is 107.87890625 and the target
  content `107.87890625 − 10.5 = 97.37890625 = Hc(2.875)`: `v = 2.875`,
  `height = Hc(2.875) + 10.5 = 107.87890625`.
- **`height 77.88` top −16:** the top edge goes to 64 and the bottom edge
  157.87890625 stays, so the target box is 93.87890625, the target content
  `83.37890625 = Hc(2)`: `v = 2`, `height = 93.87890625` and `y =
  157.87890625 − 93.87890625 = 64`.
- **`both requests` bottom-right (20, 30):** both axes as in the two rows
  above with the bottom and right handles: `L = 420`, `v = 2.875`, `width =
  516.5771484375`, `height = 107.87890625`.
- **`length 500, width 496.58` right +20:** `Wc(500) = 576.5771484375`
  already passes the request, which draws nothing: the box is the content.
  The target content is `576.5771484375 + 20 = Wc(520)`, so `L = 520`, and
  the request at or below the content becomes `width: null`.
- **`child member, width 600` right +50:** `group_child_member` (a group
  file: one frame of two cards) at (40, 80) with `width` 600. By the
  timeskeleton drawing fixture `group__group_child_member`, `x0 =
  120.61962890625` (the ancestor chevron term, independent of `L`), `R =
  x0 + L + 13.79443359375` (the end label `10.0 s`; every right edge is
  `x0 + L` plus a constant), and `W = 8 + R + 8 + 8`, so `Wc(L) =
  158.4140625 + L` and `Wc(400) = 558.4140625`. The margin is `600 −
  558.4140625 = 41.5859375`; the target box is 650 and the target content
  `608.4140625 = Wc(450)`, so `L = 450` and `width = 608.4140625 +
  41.5859375 = 650`.

`resizeCommand(block, values)` is `{type: "set", changes: [{target:
block.id, values}]}`. Every row's command is accepted by `apply`, and the
resulting block carries exactly the values.

## `zOrderCommand`

Three blocks A, B, C (added in that order, so their indices ascend). The
expected result is stated as the order of ids by index after applying the
command, plus which blocks the command changed:

| ids | action | order after | changed |
|---|---|---|---|
| [A] | front | B, C, A | A |
| [C] | back | C, A, B | C |
| [A] | forward | B, A, C | A |
| [C] | backward | A, C, B | C |
| [A, B] | forward | C, A, B | A, B |
| [C] | front | — | `null` (already in front) |
| [A] | back / backward | — | `null` |
| [] | any | — | `null` |

Only selected blocks get new indices, and each new index lies strictly
between its new neighbours (core's `indicesBetween`). Core applies a
`set`'s changes in turn and refuses an index another block still holds.
So a run of chosen blocks takes its indices from the gap below the first
index a chosen block holds between the run's neighbours, and no new index
equals a held one. This is checked by `isIndex` on every new index and by
the absence of `duplicate_index` refusals. The pinned regression, found by
the property below: after [A] front (B, C, A), [A, B] front gives C, B, A,
which is accepted.

## `nudgeCommand`

Grid on: block A at (40, 80) nudged by (1, 0) moves to (48, 80), and by
(−8, 2) to (−24, 96). A block at the off-grid position (41, 80) nudged by
(1, 0) moves to 48, because the result snaps. Grid off: (41, 80) by (1, 0)
moves to 49, since a step is still the grid size, 8. An empty `ids` list or
a zero step gives `null`. This deviates from the plan's `SetCommand`
return; a `set` without changes is refused by core.

## `removeCommand`

Each selection maps to targets: an element part (`T/name`, `T/label`,
`T/start`, `T/end`, `R/label`) becomes its owning element `T` or `R`, and
duplicates collapse in selection order.

| view | selection | result |
|---|---|---|
| A nested | {A} | `{type: "remove", targets: [A]}` |
| A nested | {A/clt_3} | targets [A/clt_3] |
| A nested | {A/clt_3/name, A/clt_3} | targets [A/clt_3] |
| A with_region | {A/clt_1/region_1/label} | targets [A/clt_1/region_1]; afterwards the manifest's ids are `clt_1`, `clt_2`, `clt_3` |
| A nested | {A/clt_1} | targets [A/clt_1]; afterwards the manifest has no root |
| A nested, B bare | {B, A/clt_1/start} | targets [B, A/clt_1] |
| any | {} | refused: `Nothing is selected.` |
| A numbers | {A/score/region_1/label} | targets [A/score/region_1]; afterwards `score` has no region |
| A numbers | {A/score/region_1, A/score/region_1/label} | targets [A/score/region_1] |
| A numbers | {A/score} | targets [A/score] |
| A group_child_member | {A/second-half/start} | targets [A/second-half] (a member that is a child timeline, by a part) |
| A numbers | {A/group_1/name} | targets [A/group_1] (a group's title stands for its group) |
| A corpus_mpm | {A/name} | refused: `Block 0000000000: its title is removed only with the block; select the block to delete it.` |
| A corpus_mpm, B bare | {B, A/name} | refused whole, with the same hint for A |
| A corpus_mpm | {A/score:clt_1/tmap_1} | targets [A/score:clt_1/tmap_1]; afterwards `score:clt_1` has no map |

Every element can be removed; a manifest's title, which goes only with its
block, cannot, so a selection holding it is refused whole, and core would
find nothing to remove there (`unknown_target`).

Every non-refused command is accepted by `apply`, and the removed elements
are gone from the manifest (`manifestIds`).

**A segment** (`segments.test.ts`, like every value of this section and
the next) would leave a gap in its segment line. Deleting a segment is not
supported yet: a selection holding a segment that leaves a gap is refused
whole, with one message, before any way of closing the gap is looked up,
so the refusal does not depend on which ways would be permitted. A
segment that goes with its segment line or its block leaves no gap and is
removed with it. `segment_children` is root `piece` holding the segment
lines `intro`, `theme` (at 6, of 12) and `coda`, each locked, and `theme`
holds the segments `t1`, `t2`, `t3` (each of 4). A segment is never
locked, so reading gives the segments `locked: false` whatever the file
states. "theme unlocked" is that fixture with `locked: false` stated on
`theme` in the file before it is read (no command lifts the lock of a
segment line that is a child).

| view | selection | result |
|---|---|---|
| A segment_children | {A/t2/label} | refused: `Deleting a segment is not supported yet.` (the two extends would be permitted) |
| A theme unlocked | {A/t2} | refused the same (all four ways would be permitted) |
| A theme unlocked | {A/t2, A/t3} | refused the same (two segments) |
| A theme unlocked | {A/t2, A/coda/name} | refused the same (a segment with another element) |
| A theme unlocked | {A/theme, A/t2} | targets [A/theme, A/t2] (the segment goes with its line, no gap) |
| A theme unlocked | {A, A/t2} | targets [A, A/t2] (it goes with its block) |

What the Delete of a segment will use once it is enabled stays proven:
core's `segmentGaps(manifest, "t2")` gives the four ways left extend,
right extend, left shift, right shift in that order. For theme unlocked
every refusal is `null`. For `segment_children` the extends are `null`
(`t1` and `t3` are segments, never locked) and both shifts are refused,
`its segment line theme is locked`. These are the options the menu below
is mounted with. `preferredGap(options)` is the first permitted way in
that order: left extend for both, and `null` when none is permitted. Removing a
segment with a `gap` is core's `remove`, proven in core's tests.

## `movedByGap`

`movedByGap(manifest, segment, gap)` gives the addresses the Delete preview
marks as moving while the menu is open: every address `manifestElements`
lists whose element (folded by `elementOf`) is a timeline whose start on its
root's axis or whose length closing the gap changes (core's `movedBy`).
The timelines follow from the rule by hand; the parts are those the drawing
gives each timeline (a child its line and name, a segment its boundary when
it is not the first and its label, a root its card, line, name, both ends
and their labels).

| manifest | segment, gap | moved |
|---|---|---|
| theme unlocked | t2, left shift | {theme, theme/name, t1, t1/label} (`theme` moves on and shortens, carrying `t1`; `t3` keeps its place) |
| theme unlocked | t2, right shift | {theme, theme/name, t3, t3/start, t3/label} |
| theme unlocked | t2, left extend | {t1, t1/label} (`t1` grows; the first segment draws no boundary) |
| theme unlocked | t2, right extend | {t3, t3/start, t3/label} (`t3` starts where `t2` started and grows) |
| segment_line | b, right shift | {form/card, form, form/name, form/start, form/start/label, form/end, form/end/label, c, c/start, c/label, c1, c1/label} (`form` shortens, `c` moves back with its segment `c1`) |

`segmentAnchor(drawing, id)`, where the menu opens, is the segment's label
(its `x` and baseline), read here from the label's `<text>` descriptor
(`x`, `y`) of the same drawing: `t2` of theme unlocked. A timeline drawn
with neither label, boundary nor child line (`piece`, a root) gives `null`.

## `affectedBy`

`affectedBy(manifest, selectedElementIds)` gives the addresses that
removing the selection would also take away, so the canvas can highlight
them. The selection is given as element ids and part addresses. The rule,
using the manifest alone and core's traversal (`manifestElements`,
`timelineAncestry`, `orderedChildren`):

- **Owners:** each selected address folded into its element with core's
  `elementOf` (`T/name` → `T`, `score/region_1/label` → `score/region_1`),
  as `removeCommand` folds it. The manifest's title `name` names no
  element and takes nothing with it.
- **Removed elements:** core's `removedBy` of the owners: every timeline
  that is an owner or has an owner among its ancestors, every map, region,
  break, jump and marker of those timelines, every conversion map naming a
  removed timeline as `source_id` or `target_id`, and the owners
  themselves (a group removes itself only).
- **Result:** every address of a removed element and of its parts, as
  `manifestElements` lists them, plus marker ids, which are never drawn. It
  excludes the selected addresses and the parts of a directly selected
  element: those show as selected, not as affected.

Pinned values (derived by hand from the fixtures' trees). `nested` is
`clt_1` ⊃ `clt_3` ⊃ `clt_2`, with no entries. `map` is `melody`, with map
`tempo`, ⊃ `phrase`, with map `ticks`. `with_region` is `clt_1`, with
`region_1`, ⊃ `clt_2`, `clt_3`.

| fixture | selection | affected |
|---|---|---|
| nested | {clt_3} | {clt_2, clt_2/name} |
| nested | {clt_2} | ∅ (a leaf without entries) |
| nested | {clt_3/name} | {clt_3, clt_2, clt_2/name} (the name stands for its timeline) |
| nested | {clt_1} | {clt_3, clt_3/name, clt_2, clt_2/name} (its subtree; its own parts show as selected) |
| nested | {clt_1/start} | {clt_1/card, clt_1, clt_1/name, clt_1/start/label, clt_1/end, clt_1/end/label, clt_3, clt_3/name, clt_2, clt_2/name} (a part stands for its root, whose other parts are affected) |
| map | {phrase} | {melody/ticks} |
| map | {melody/tempo} | ∅ |
| with_region | {clt_1/region_1/label} | {clt_1/region_1} |
| any | ∅ | ∅ |
| numbers | {score/region_1/label} | {score/region_1} (folded by `elementOf`, never at the first slash) |
| numbers | {score/region_1} | ∅ (its label is its own part) |
| numbers | {score} | {score/region_1, score/region_1/label} |
| group_child_member | {piece} | {second-half/card, second-half/start, second-half/start/label, second-half/end, second-half/end/label, second-half, second-half/name} (its child, a member, goes with it, at every place it is drawn) |
| group_child_member | {recording/card} | {recording, recording/name, recording/start, recording/start/label, recording/end, recording/end/label} (a selected card stands for its timeline: Delete removes the timeline, so everything the card holds is affected; the card itself shows as selected) |
| corpus_mpm | {group_1} | ∅ (a group removes itself only; its title shows as selected) |
| corpus_mpm | {group_1/name} | {group_1} (the title stands for its frame) |
| corpus_mpm | {name} | ∅ (the title names no element) |

`project` carries the set as `data.affectedElements`, computed per block
from its `selectedElements`. A reused node keeps its identical set, since
it is only reused when the block and its selected elements are unchanged.
In the `project` example, B with `{clt_3}` selected has `affectedElements
= {clt_2, clt_2/name}`, and A has the empty set.

**Property (fast-check):** take one block holding any of eight manifests:
the five fixtures `bare`, `nested`, `flow_control`, `with_region` and
`map`, the group manifest `group_child_member`, the named manifest
`bundle_mixed`, and `numbers` (a group manifest with a root-qualified
region), and any selection of the element and part addresses that core's
`manifestElements` lists for it. `removeCommand` refuses the selection
exactly when core refuses a `remove` of the selected elements (each folded
by `elementOf`): when it holds the title of `bundle_mixed`. When it does
not, the element ids the `remove` actually deletes (`manifestIds` before
minus after) equal `(owners ∪ affectedBy) ∩ manifestIds(before)`, the
owners folded by `elementOf`. This compares the rule against core's own
removal, not against itself.

## `click` and `blockOf`

- `click(∅, "A/clt_3", false)` is `{A/clt_3}`. The element only: its block
  is not selected.
- `click({A, B}, "C", false)` is `{C}`.
- `click({A}, "B/clt_1", true)` is `{A, B/clt_1}`, and
  `click({A, B/clt_1}, "A", true)` is `{B/clt_1}`, so Shift toggles.
- The input set is never mutated.
- **`click` takes the address a press selects as it is**: what a press
  on the drawing selects is decided before, by `selectionOf` (section
  "Boxes: selection and hover"), and `click` changes nothing in it. A
  card's address stays the card's: `click(∅, "A/recording/card", false)` is
  `{A/recording/card}`, and with Shift `click({A/recording/card},
  "A/recording/card", true)` is ∅ (the card is toggled), while
  `click({A/recording}, "A/recording/card", true)` is `{A/recording,
  A/recording/card}` (the card and its timeline are two selections). The
  addresses are real: core's `manifestElements` lists `bare/card` and
  `bare` for `bare`, and `recording/card` and `recording` for
  `group_child_member`.
- `blockOf("A/clt_3/name")` is `A`, and `blockOf("A")` is `A`.
  `blockOf("workspace")` throws `RangeError`.

`existing(view, selection)` keeps the addresses that still name something
after an undo or redo. View: A holds `nested` (elements `clt_1`, `clt_3`,
`clt_2`), B does not exist.

- `existing(view, {A, A/clt_3, A/clt_3/name, A/clt_9, A/clt_9/name, B,
  B/clt_1})` is `{A, A/clt_3, A/clt_3/name}` in that order: a part stands
  or falls with its element, everything in a missing block goes.
- An address is read with core's `elementOf`. View: A holds `numbers`. `existing(view, {A/score/region_1/label,
  A/score/region_2/label, A/score/name, A/group_1/name, A/page/start,
  A/nobody/region_1})` is `{A/score/region_1/label, A/score/name,
  A/group_1/name, A/page/start}`: the region's label stays with its region,
  a missing region's label goes, a root's part, the group's title and a
  wedge stay, and an element of no root goes.
- The title `name` stays while its manifest is named (an `id` or a
  `name`): `existing` of `{A/name}` is `{A/name}` on a block of
  `bundle_mixed` (named "Mixed", no id) and `∅` on a block of `nested`
  (anonymous).
- `blockOf("A/score/region_1/label")` is `A`: an address may hold several
  slashes after its block.
- A selection whose addresses all exist is returned as the same object
  (`toBe`), so an unchanged selection does not re-render the canvas; the
  empty selection likewise.

## Gesture commands are accepted (fast-check)

For any view built by adding 1–5 blocks from the fixtures `bare`, `nested`,
`flow_control`, `with_region` and `map`, any sequence of moves (arbitrary
finite doubles), nudges, z-order actions, resizes (any mode, a valid handle
for it, any delta in ±1000) and removals produces commands that `apply`
accepts. A removal selects any subset of what a click can select: block ids
and the addresses of the drawn elements and their parts.

Markers are not drawn, so a click never selects one. Core rightly refuses
removing a marker that a jump targets (`schema_violation`). `removeCommand`
does not repeat core's integrity checks: such a refusal comes back from the
store's `dispatch`.

## Undo through the store (fast-check)

The same arbitrary gestures, dispatched to a `createStore`, and then undone
one by one, restore every block's `x`, `y`, `index`, `scale`, `length`,
`spacing`, `width` and `height` exactly at each step (`toBe`, compared
against the views recorded before each dispatch).

## Package

1. **It exports its name.** `name.test.ts` asserts the exact string
   `"@timetoalign/tilie-arranger"`. This proves the package resolves,
   compiles and runs under Vitest.
2. **It type-checks under strict settings.** `pnpm typecheck` runs
   `svelte-check` over `src` and `tests`. This is a gate of the same
   workflow, not a Vitest test.
3. **It respects the ladder.** It may depend on `writers`, `layout` and
   `core`, and import `svelte` and `@xyflow/svelte`. `.dependency-cruiser.cjs`
   encodes the rule, `pnpm lint` checks it, and `tests/ladder.test.ts` at
   the workspace root proves it is enforced.

## Components

The Svelte components render what the pure functions above compute; their
interaction (drag, snap, resize, marquee, keys, culling, touch) is proven end to end by the Playwright suite against the
running editor, not here. One property is cheap to prove in a DOM and would
be expensive to prove in a browser: the block node draws exactly what the
SVG writer exports.

`components.test.ts` mounts `BlockNode.svelte` with Svelte's own `mount`
into a jsdom document. An element tree is the list of a parent's child
elements, each as its local name, its namespace URI, its attributes as
`[name, value]` pairs in document order, and its text (`null` when the
element holds no text; Svelte leaves an empty text node in every element it
renders, which draws nothing).

1. **Screen equals export, for every drawing fixture.** For each directory
   of the installed `@timetoalign/timeskeleton` package's
   `fixtures/<SCHEMA_VERSION>/drawings/` (54 cases: 42 drawn from the
   fixtures directly in `fixtures/<SCHEMA_VERSION>/`, that is 31 fixtures,
   the ten resized `nested` drawings and `map__child-map-below`, then 9
   `group__…` and 3 `bundle__…` cases), the drawing is made from its
   `inputs.json` alone (its manifest fixture, placement and layers, exactly
   as the writers' fixture test makes it) and its `toDescriptors` are
   rendered by the node at the case's scale. The node's `<svg>` is in the
   SVG namespace, its `width` and `height` are the drawing's box times the
   scale (`String(width * scale)`), its `viewBox` is
   `0 0 <drawing width> <drawing height>`, and its element tree equals the
   element tree of the one `<g>` of the case's `figure.svg` parsed by
   `DOMParser`. So every attribute value the node sets, including path data
   and polygon points, is the exported text, and no attribute or element is
   added or lost; `nested__scale-2` proves the scale is the viewBox's alone.
2. **A selected element is marked, and nothing else changes.** With
   `selectedElements = {"score/intro"}` on `styled__score` (the region
   `intro` of its root `score`), the elements carrying `data-selected` are
   exactly `["score/intro"]` (one descriptor carries that
   address), the element tree with `data-selected` left out still equals
   `figure.svg`'s, and exactly one element carries `data-contains-selection`.
   Without a selection, no element carries either attribute.
   An element that goes with a selected one on Delete is marked apart:
   with `selectedElements = {"clt_3"}` and `affectedElements = {"clt_2"}`
   on `nested`, the elements carrying `data-affected` are exactly the three
   descriptors addressed `clt_2` (its line, start dot and end marker), those
   carrying `data-selected` exactly those addressed `clt_3`, and the tree
   with both attributes left out equals `figure.svg`'s. Without a selection
   no element carries `data-affected`. Which elements are affected is
   decided by `project`; the node only marks them.
   **A selected address marks every descriptor carrying it**, wherever and
   however often it is drawn (drawing.md section 2.2: every drawing of an
   element carries its address). On `bundle__bundle_shared_parent` with
   `selectedElements = {"score", "exposition/start"}`, the elements
   carrying `data-selected` are, in document order, the four `score`
   descriptors of `exposition`'s ancestor line, the two `exposition/start`
   marks (on that ancestor line and on `exposition`'s own line), and the
   four `score` descriptors of `recapitulation`'s ancestor line: ten
   elements; the node is given the block's manifest, so `exposition/start`
   (a part of the member `exposition`) marks its frame: inside the `<svg>`
   exactly `rect group_1` carries `data-contains-selection` (section "Boxes:
   selection and hover"), the tree with `data-selected` and
   `data-contains-selection` left out equals `figure.svg`'s, and the node's
   `div` carries `data-contains-selection` too. No fixture draws a timeline
   both as a member and as an ancestor line or child of another member
   drawing; the node marks by the whole address alone, so that drawing
   follows the same rule.
   **A selected card glows on its own rectangle only.** On
   `group__group_child_member`, drawn with its drawing's elements (so the
   node knows its boxes), `selectedElements = {"recording/card"}` marks
   exactly one element, the second `rect` addressed `recording/card` (the
   card; the first, its shadow, carries the same address and is not
   marked, section "Boxes: selection and hover"); given the block's
   manifest, the card of the member `recording` marks its frame, exactly
   `rect group_1` inside the `<svg>`; the tree with `data-selected` and
   `data-contains-selection` left out equals `figure.svg`'s, and the node's
   `div` carries `data-contains-selection` too.
3. **Text is text.** A text descriptor whose text is
   `<b id="x">C♯ & D♭</b>` and whose `data-address` is `a"<b>` renders one
   `<text>` element in the SVG namespace with exactly those attribute values
   (`x` written `1.5`) and that text, and no `b` element exists: nothing is
   parsed as markup.

4. **The toolbars follow the toolbar pattern.** `roving` (attached to the
   canvas controls, a vertical toolbar, and to the horizontal resize-mode
   toolbar) is tested on a plain toolbar
   of buttons `a`, `b` (disabled) and `c`: the tab stop starts on `a`
   (`tabIndex` 0, `c` −1); from `a`, ArrowRight focuses `c`, skipping the
   disabled `b`, and moves the tab stop to it; ArrowRight again wraps to
   `a`, ArrowLeft wraps back to `c`, Home focuses `a` and End `c`. When the
   button holding the tab stop is disabled, the stop passes to the first
   enabled button (after the mutation is observed); once detached, arrows
   no longer move focus. The same toolbar with `aria-orientation="vertical"`
   moves by ArrowDown (`a` → `c`, then wrapping to `a`) and ArrowUp (wrapping
   back to `c`), while ArrowRight and ArrowLeft leave the focus where it is.

5. **The Delete menu of a segment** (`gap-menu.test.ts`: `GapMenu.svelte`,
   mounted with the options of core's `segmentGaps` and `gap` set to
   `preferredGap(options)`). The canvas does not mount it while deleting a
   segment is not supported; the component stays exported and is proven
   here. The menu is a form named `Delete segment t2` holding one fieldset
   (legend `Closes the gap`) of four radios, in this order, each named by
   the phrase saying which neighbour moves (its accessible name, through
   `aria-labelledby`) and described by one line (its accessible
   description, through `aria-describedby`):

   | radio | name | description |
   |---|---|---|
   | `gap-left-extend` | `Left extends` | `The left neighbour grows into the gap.` |
   | `gap-right-extend` | `Right extends` | `The right neighbour starts where the deleted segment started and grows into the gap.` |
   | `gap-left-shift` | `Left shifts` | `The left neighbour and everything before it move right into the gap.` |
   | `gap-right-shift` | `Right shifts` | `The right neighbour and everything after it move left into the gap.` |

   Each radio's value is its way as `<side>-<verb>`, the `{side, verb}`
   that `onconfirm` receives. With the `segment_children` options of `t2`
   (`theme` locked, so only the extends are permitted): `Left extends` and
   `Right extends` are enabled and carry no title, and both shifts are
   disabled with the title `its segment line theme is locked`. With the
   theme-unlocked options (all four permitted), every radio is enabled and
   none carries a title; the one checked radio is `Left extends` (the
   preselection), and the focus is on it. Choosing `Right shifts` checks
   it alone. Enter on a radio calls `onconfirm` once with the checked way,
   `{side: "right", verb: "shift"}`; Escape calls `oncancel` once; OK calls
   `onconfirm` with the preselected `{side: "left", verb: "extend"}`,
   Cancel `oncancel`. With options permitting only left extend and right
   shift, `Right extends` and `Left shifts` are disabled with their own
   refusals as titles (`the following segment c is locked`, `its segment
   line is locked`), the preselection is `Left extends`, and choosing
   `Right shifts` then Enter, and `Left extends` then Enter, confirms
   `{side: "right", verb: "shift"}` then `{side: "left", verb: "extend"}`.
   The arrow keys inside the fieldset are the native radio group's own,
   which jsdom does not implement; they and axe are checked in a browser
   once the canvas mounts the menu again.

`BlockNode.svelte` has no style of its own (the canvas styles it), so
Svelte adds no scoping class to a drawn element and the trees compare
attribute for attribute. The bundled font is declared by the canvas's
stylesheet, which jsdom does not apply, so the font is not exercised here.

Which keys reach the canvas (focus inside the arranger, which is itself
focusable; undo and redo are the editor's page-wide keys), and that arrows inside a toolbar move
focus rather than nudge, need a browser and are not tested here.

## Boxes: selection and hover

A block's drawing shows three kinds of **box** (drawing.md section 8): the
block's own box (its background, the drawing element of type `block`, which
carries no address), a group's **frame** (type `group`, addressed by the
bare group id `G`) and a timeline's **card** (type `card`, addressed
`T/card`; when the card's `shadow` is not `none`, its shadow is a second
`rect` with the same address, written just before the card, section 7.2).
Every other drawn element (a line, a wedge, a map, a region, a jump, a
break, a boundary, a name, a label) is an **element**. `boxes.ts` is the
one place that maps a pointer target to what it hits, decides what a press
selects and decides what the pointer highlights.

**A hit is classified by the drawing's element types, never by the form of
an address.** A frame's address `group_1` has the same form as a timeline
line's `recording` (a bare id), so no rule on the string can tell them
apart; the drawing's element of type `group` can. `hitOf(block, drawing,
target, point?)` reads the `data-address` of the target (the element
itself, or its nearest ancestor carrying one) and returns `{block, kind,
address, boundary, within}`:

- `kind`: `"card"` when the drawing holds an element of type `card` with
  that address, `"group"` when it holds one of type `group`, `"element"`
  otherwise; `"block"` when nothing carries an address (the background
  `rect`, the `<svg>`, the node around it).
- `address`: block-qualified, `<block>/<element address>`, or the block id
  for `"block"`.
- `boundary`: whether the target is a `line` and the drawing holds an
  element of type `boundary` with that address. The tag matters: a wedge
  may carry a boundary's `S/start` form, and it is a `polygon`.
- `within`: the box under `point` (in the drawing's units), as its element
  address: the last drawn card or frame whose rectangle holds the point,
  edges included; `null` outside every drawn card and frame, and without a
  point. A frame is drawn before its cards, and cards never overlap one
  another (sections 8.4 and 8.5), so the last box holding the point is the
  innermost one. A card or frame that is not displayed is not drawn and
  holds no point.

`selectionOf(hit)`: **a press selects what it hit.** A card selects the
card (`<block>/T/card`; its shadow carries the same address and does the
same), a frame the group (`<block>/G`), the block's own box the block, any
other element that element. `click` then applies Shift.

`hoverOf(hit)` is `{box, boundary}`, element addresses as the descriptors
carry them: `box` is `within` (a card or a frame; the block's own box is
never marked, since the node shows its block), `boundary` the hit's element
address when `boundary` is true, else `null`.

`marksOf(drawing, descriptors)` names the descriptors that carry a box's or
a boundary's mark: `"card"` for a card's own rectangle (the last `rect`
carrying a card's address), `"shadow"` for the `rect` before it with the
same address, `"group"` for a frame's `rect`, `"boundary"` for a
boundary's `line`; every other descriptor is absent. The block node sets
`data-selected` on every descriptor carrying a selected address except a
card's shadow, so a selected card glows on its own rectangle only, and
`data-hovered` on the `"card"` or `"group"` descriptor whose address is the
hovered box and on the `"boundary"` line whose address is the hovered
boundary.

**A selected card elsewhere.** The card belongs to its timeline (drawing.md
section 2.2), and every other reader folds it with core's `elementOf`, as
it folds any part; nothing else changes:

- `existing(view, {A/recording/card})` on a block of `group_child_member`
  is the same set: the card stands with its timeline.
- `removeCommand(view, {A/recording/card})` is `{type: "remove", targets:
  ["A/recording"]}`: Delete of a selected card removes its timeline.
- `affectedBy(manifest, {recording/card})` is the timeline's other
  addresses (the `affectedBy` table): everything the card holds goes with
  it on Delete, and shows as affected.

`boxes.test.ts` (jsdom), block A at `(0, 0)`, default placement, values
read from the drawings' elements (canvas units). A target is an SVG element
of the descriptor's tag and `data-address`, built inside an `<svg>` inside a
`div`, as the node draws it.

1. **`segment_line`** (one root; root `form`, segments `a`, `b`, `c`, `b`
   holding `b2`; card `form/card` from `x` 8 to `469.573974609375`, `y` 8 to
   `103.9296875`).
   - Hits: `rect form/card` is the card `A/form/card`; `line form` the
     element `A/form`, no boundary; `line b2/start` the element
     `A/b2/start`, a boundary; a `polygon` addressed `b2/start` and the
     wedge `polygon form/start` elements, no boundary; a `rect` without an
     address and the `<svg>` itself the block `A`.
   - `within` is `form/card` at the start of the root's line
     `(52.294921875, 68.953125)`, at the middle of boundary `b2/start`
     `(227.294921875, 36.4765625)` and at the card's corners `(8, 8)` and
     `(469.573974609375, 103.9296875)`; `null` in the box's padding
     `(4, 4)`, just right of the card `(470, 50)`, on the shadow's rim
     `(471, 105)`, and without a point.
   - `marksOf` names, in order, the second descriptor `form/card`
     `"shadow"`, the third `form/card` `"card"`, and `b/start`, `b2/start`,
     `c/start` `"boundary"`. With the workspace statement `{select:
     {element: "card"}, set: {shadow: "none"}}` the one `rect` addressed
     `form/card`, the second descriptor, is `"card"` and no descriptor is
     `"shadow"`.
2. **`group_child_member`** (frame `group_1` from `x` 8 to `550.4140625`,
   `y` 8 to `182.13671875`, its title `group_1/name`; cards from `x` 16 to
   `542.4140625`: `second-half/card` `y` `32.8046875` to `116.7578125`,
   `recording/card` `y` `124.7578125` to `174.13671875`).
   - Hits: `rect group_1` is the group `A/group_1`, while `line recording`,
     an address of the same form, is the element `A/recording`;
     `rect recording/card` the card `A/recording/card`; `text group_1/name`
     the element `A/group_1/name`.
   - `within` is `group_1` inside the frame above the first card `(12, 12)`
     and in the gap between the cards `(100, 120)`; `second-half/card` at
     the start of the ancestor line `piece` `(108.61962890625, 67.78125)`;
     `recording/card` at the start of `recording`'s line
     `(120.61962890625, 139.16015625)` (inside the frame too: the card is
     the innermost box); `null` in the box's padding `(4, 4)` and right of
     the frame `(552, 100)`.
   - `marksOf` names, in order, `group_1` `"group"`, `second-half/card`
     `"shadow"` then `"card"`, `recording/card` `"shadow"` then `"card"`.
   - With the workspace statement `{select: {element: "card"}, set:
     {display: "none"}}` no card is drawn: `within` at `(120.61962890625,
     139.16015625)` is `group_1`, and `marksOf` names `group_1` alone.
3. **`selectionOf` and `hoverOf`.** On `group_child_member`: the card hit
   selects `A/recording/card`, and so does its shadow (the first `rect`
   addressed `recording/card`); the frame `A/group_1`; the background
   `A`; the line `A/recording`; the wedge `polygon recording/start`
   `A/recording/start`; the title `A/group_1/name`. Hover: the line
   `recording` at `(120.61962890625, 139.16015625)` is `{box:
   "recording/card", boundary: null}`; the frame at `(12, 12)` `{box:
   "group_1", boundary: null}`; the `<svg>` at `(4, 4)` `{box: null,
   boundary: null}`. On `segment_line`: the line `b2/start` at
   `(227.294921875, 36.4765625)` is `{box: "form/card", boundary:
   "b2/start"}`.
4. **A selected card elsewhere**: the three values above, through
   `existing`, `removeCommand` and `affectedBy` on a block of
   `group_child_member`; and `click(∅, selectionOf(card hit), false)` is
   `{A/recording/card}`.
5. **The block node holds what is hovered by address, so the mark
   survives a redraw.** `BlockNode.svelte` is mounted in jsdom (data as
   `project` makes it: the block, its drawing, `descriptorsOf` the drawing,
   no selection), its props read through a reactive `SvelteMap` so that a
   redraw can be passed in. jsdom does not lay the `<svg>` out, so its
   bounding box is stubbed to the drawing's own box at `(0, 0)` (scale 1:
   one client pixel is one canvas unit); the conversion itself is proven
   in the browser. One `pointermove` handler on the `<svg>` passes the
   event's target and its point in the drawing's units to `hitOf`, and
   marks what `hoverOf` gives. The events are dispatched as `MouseEvent`s
   (bubbling, except `pointerleave`), which carry `buttons`, `clientX` and
   `clientY`.
   - On `segment_line`, a `pointermove` on the `line` addressed `b2/start`
     at its middle `(227.294921875, 36.4765625)` marks, in document order,
     `[rect form/card, line b2/start]`, the `rect` being the third element
     (the shadow, the second, is not marked).
   - **Redraw.** The view is changed by the workspace statement
     `{select: {element: "boundary"}, set: {stroke: "#FF0000"}}` and the
     node is given the new block, drawing and descriptors, with no pointer
     event. Every element is new (the `{#each}` is keyed by descriptor),
     the boundary `line` addressed `b2/start` now has `stroke="#FF0000"`,
     and the marked elements are still `[rect form/card, line b2/start]`.
   - A `pointermove` on the `<svg>` itself at `(52.294921875, 68.953125)`
     (inside the card, on no drawn element) unmarks the boundary and keeps
     the card: `[rect form/card]`.
   - **No hover work during a press.** With a button held (`buttons: 1`),
     a `pointermove` on `b2/start` at `(4, 4)` neither reads the bounding
     box (the stub is called 0 times) nor changes a mark: still
     `[rect form/card]`. The same `pointermove` on the `<svg>` with no
     button held reads it once and clears the card mark (`(4, 4)` is in
     the box's padding): `[]`.
   - A `pointerleave` on the `<svg>` clears both marks: with `b2/start`
     and the card marked, it leaves `[]`.
   - On `group_child_member`, a `pointermove` on the frame `rect group_1`
     at `(12, 12)` marks `[rect group_1]`, and one on `line recording` at
     `(120.61962890625, 139.16015625)` marks `[rect recording/card]`, the
     second `rect` addressed `recording/card`: the card, not the frame
     around it, and not its shadow.

**A frame holding part of the selection.** The block node marks a block
holding a selection with `data-contains-selection` on its own `div`; a
group's frame inside it carries the same attribute, on its `rect`, exactly
when the selection holds something drawn on the frame's member cards.
`framesHolding(manifest, selected)` (element addresses, as the node holds
them) gives those frames by group id, resolved from the manifest's tree and
groups through core's readers, never from the form of an address: a
selected address is folded to its element (`elementOf`), the element to
the timeline it belongs to (the `timeline` of its key in
`manifestElements`), and a timeline is held by every frame among whose
members it is or below one of whose members it lies (`memberDrawings`).
So a frame holds:

- a member timeline;
- every timeline in a member's subtree;
- every element and part of those: a member's card `T/card`, a line's
  start and end `T/start`, a region of a timeline below a member
  (`<root>/region_1`) and its label.

A selected group, its title `G/name` and the manifest's title `name`
belong to no timeline: selecting the group alone leaves its frame
unmarked (it shows the selection's glow instead), and so does a timeline
drawn outside every frame. An ancestor line drawn on a member's card
(a timeline above a member, not inside any member's subtree) holds no
frame either. `showsContainedSelection(mark, address, holding)` is true
for a `"group"` descriptor whose address is among them, and the node
sets `data-contains-selection` on exactly those descriptors.

6. **`boxes.test.ts`, the frames' mark.** On `bundles/bundle_mixed`
   (groups `group_1`, members `performance` and `score`, and `group_2`,
   members `excerpt`, a child of the root `recording`, and `page`; the
   root `annotations` drawn outside every frame), extended through two
   `add`s: the child `dlt_1` (`samples`, offset 0, length 100) into
   `excerpt`, and the region `region_1` (name `A`, start 0, end 10) into `dlt_1`,
   addressed `recording/region_1` (a region is addressed by its root).
   `BlockNode.svelte` is mounted with the selection as `selectedElements`
   and `containsSelection` as `project` sets it (any selection); the
   expected value is every element inside the `<svg>` carrying
   `data-contains-selection`, as `<tag> <address>` in document order:

   | selected | marked |
   |---|---|
   | `score` (a member) | `rect group_1` |
   | `dlt_1` (a child of the member `excerpt`) | `rect group_2` |
   | `recording/region_1/label` (a region's label on `dlt_1`) | `rect group_2` |
   | `page/card` (a member's card) | `rect group_2` |
   | `score/start` (a member's start) | `rect group_1` |
   | `excerpt` (a member that is a child) | `rect group_2` |
   | `group_1` (the group itself) | none |
   | `group_1/name` (the group's title) | none |
   | `annotations` (outside every frame) | none |
   | `annotations/card` | none |
   | `recording` (the ancestor line on `excerpt`'s card) | none |
   | `score`, `page` | `rect group_1`, `rect group_2` |

   With `group_1` and `score` selected both apply: the frame `rect
   group_1` carries `data-selected` and `data-contains-selection`, and the
   stylesheet lets the glow win. With nothing selected nothing inside the
   `<svg>` carries the attribute, and neither does the node's `div`; with
   any selection the `div` carries it.

That the client position is converted under zoom and scale, that a press on
a card or a frame selects it, that a frame holding the selection is drawn
dashed, and that a selected card glows in the
selection's colour even under the pointer (the canvas's stylesheet, which
jsdom does not apply) are proven end to end by the Playwright suite.
