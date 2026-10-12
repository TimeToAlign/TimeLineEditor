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

- **`bare`**: the root `bare`, named "Bare" at font size 11. The DejaVu Sans
  advances of B, a, r, e are 1405, 1255, 842, 1260, which sum to 4762, so
  the name is `N = 4762 × 11 / 2048 = 25.5771484375` wide.
  - Section 6.7: the line starts at `x0 = P + N + G = 41.5771484375`. The
    rightmost element is the arrowhead's tip at `x0 + L + 3w` (w = 3), so
    `W = x0 + L + 9 + P = 58.5771484375 + L`, giving `W(400) =
    458.5771484375`. This holds as long as the root's arrowhead stays
    rightmost, which is true for every `L ≥ 8` because the end label is
    narrower than `2 × 9`.
  - The height, `H = 49.37890625` (the `rect` of `drawings/bare/figure.svg`),
    has no term in `v`. The bare root has only its below-side wedges, so
    `Ea = 0` and the root band does not scale (section 6.4). Stretching
    vertically therefore cannot move its edge.
- **`nested`**: the root `clt_1`, child `clt_3`, grandchild `clt_2`, both
  rows on the above side. `x0 = 41.91552734375` (pinned by layout's stretch
  test), so `W = 59.91552734375 + L`, and `W(400) = 459.194580078125`.
  - Height (sections 6.2, 6.4, 6.5): with `p = max(14v, h(11))` and
    `h(11) = 12.8046875`, the children band starts at `p0 / 2` and holds two
    rows of halves `p / 2`. So `Ea = 2.5p`, `y_root = 8 + 2.5p`, and the
    below side is the wedge reach `1.5 + 13 + 2 + h(9) = 26.9765625`.
  - Hence `H = 42.9765625 + 35v` for `v ≥ h(11) / 14 = 0.914620535…`, and
    `H = 74.98828125` below that. This gives `H(1) = 77.9765625`,
    `H(1.5) = 95.4765625`, `H(2) = 112.9765625`, which are the heights of
    `drawings/nested__spacing-1`, the 1.5 interpolation and
    `drawings/nested__spacing-2`. **Height is not affine in spacing**: it is
    piecewise linear, flat below the knee and of slope 35 above it.
- **`flow_control`**: the root `flow:quarters` with `break_1` and `jump_1`.
  **`with_region`**: the root `clt_1` with `region_1`.

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
  `W(800) = 858.5771484375` for `bare`. It is never cached: the memoized
  drawing is still the length-400 one afterwards.

## `project`

What proves the projection is complete and stable:

- **Exact node shape.** Take block A (`bare`) at (40, 80), and block B
  (`nested`, added second, at (0, 0)) set to scale 2. With selection
  `{A, B/clt_3}`:
  - `A` gives `{id: A, type: "block", position: {x: 40, y: 80}, width:
    458.5771484375, height: 49.37890625, measured: {same}, handles: [],
    selected: true, zIndex: 0}`.
  - `B` has `width: 918.38916015625`, `height: 155.953125` (the drawing ×
    2), `selected: false`, `zIndex: 1`, `data.selectedElements = {clt_3}`
    and `data.containsSelection: true`.
  - Neither node has a `draggable` member. `data.descriptors` equals
    `toDescriptors(data.drawing)`.
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

## `snap`

Hand-built boxes, grid `{8, true}`, tolerance 6. The moving box is `{x:
101, y: 203, origin: 142.5771484375}`, so its origin lies 41.5771484375 to
the right of its left edge, as `bare`'s does.

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
fixed right edge, for example from 498.577… to 498.552…. A left or top
handle quantizes the pointer's edge, the size follows from the fixed
opposite edge, and the stored position is the opposite edge minus the
achieved size. Block A holds `bare` at (40, 80), so `right =
498.5771484375` and `bottom = 129.37890625`. Bare's extents are multiples
of 1/2048, so every row below is exact.

**Box** (sets `width`/`height`, plus `x`/`y` for left and top):

| handle | delta | values |
|---|---|---|
| right | (20, 0) | `{width: 478.5771484375}` |
| right | (−20, 0) | `{width: null}` (below the content's 458.577…) |
| left | (−21, 0) | `{width: 479.5771484375, x: 19}` |
| left | (100, 0) | `{width: null, x: 40}` (cannot shrink; the box stays) |
| bottom | (0, 10.5) | `{height: 59.87890625}` |
| top | (0, −16) | `{height: 65.37890625, y: 64}` |
| bottom-right | (20, 10.5) | `{width: 478.5771484375, height: 59.87890625}` |
| left, grid off | (−21, 0) | `{width: 479.5771484375, x: 19}` (the grid plays no part) |

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
| bottom-right | (229.28857421875, 0) | `{scale: 1.5}` |
| top-left | (−229.28857421875, 0) | `{scale: 1.5, x: −189.28857421875, y: 55.310546875}` |
| bottom-right | (−440, −49) | `{scale: 0.125}` (floored at `MIN_SCALE`) |
| right | any | throws `RangeError` (no edge handles in scale mode) |

For the top-left row: the left edge goes to `40 − 229.28857421875 =
−189.28857421875`, so the target width is `687.86572265625 = 1.5 W`. The
height's ratio is 1, so the scale is 1.5. Then `x = 498.5771484375 − 1.5 ×
458.5771484375 = −189.28857421875` and `y = 129.37890625 − 1.5 ×
49.37890625 = 55.310546875`. Both are multiples of 1/2048, so the right
and bottom edges stay exactly where they were.

**Stretch** (`length` from left/right, `spacing` from top/bottom, both from a
corner). How the inverse is derived:

- By drawing.md section 6.7, the content's width is `P` plus the largest of
  terms of the form `x0(L) + L × u + c`, with `x0(L)` itself a maximum of
  such terms. So `Wc(L)` is non-decreasing and piecewise linear in `L`. It
  is flat while a centred end label wider than the start label sets `x0`,
  and slope 1 once the root's arrowhead or that label leads (the `audio`
  rows below).
- By sections 6.2 to 6.5, the content's height for a fixed `L` is a sum of
  maxima of affine terms in `v`. So `Hc(v)` is non-decreasing and piecewise
  linear, flat below a knee where a font height outgrows a pitch (`nested`).
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
  would be invisible state. An extent that never grows past the target
  (bare's height has no `v` term) leaves the value as it is.
- The target is the content's extent moved by the pointer:
  `content + (target box − box)`. When the box has no request, the content
  and the box coincide, so the edge ends under the pointer. When a box
  request is larger than the content, the content stretches by the
  pointer's travel inside the requested box.

`audio` is `corpus_audio_audio` at (40, 80), with a workspace statement
hiding every name (`{select: {element: "name"}, set: {display: "none"}}`).
Its labels are "0.0 s", whose advances sum to 4975, so `w0 =
21.86279296875` at size 9, and "231.0791836734694 s", whose advances sum to
23217, so `we = 102.02783203125`. With no name column, section 6.7 gives
`x0 = max(P + w0/2, P + we/2 − L)`:

- Below the knee `L* = (we − w0)/2 = 40.08251953125`, the end label's right
  edge `x0 + L + we/2 = P + we` leads, so `Wc = 2P + we =
  118.02783203125` is flat.
- Above it, `Wc = 2P + (w0 + we)/2 + L = 77.9453125 + L`.

| fixture | handle | delta | values |
|---|---|---|---|
| bare | right | (20, 0) | `{length: 420}` |
| bare, scale 2 | right | (20, 0) | `{length: 410}` |
| bare | left | (−21, 0) | `{length: 421, x: 19}` |
| bare | right | (−500, 0) | `{length: 8}` (`MIN_LENGTH`; bare's width has no flat piece) |
| bare | bottom | (0, 30) | `{spacing: 1}` (height has no `v` term) |
| nested | bottom | (0, 35) | `{spacing: 2}` (77.98 → 112.98, as `nested__spacing-2`) |
| nested | bottom | (0, 17.5) | `{spacing: 1.5}` |
| nested | bottom-right | (400, 35) | `{length: 800, spacing: 2}` |
| nested | top | (0, −35) | `{spacing: 2, y: 45}` |
| nested | bottom | (0, −40) | `{spacing: 0.91455078125}` (the knee) |
| nested, spacing 1/4 | bottom | (0, 35) | `{spacing: 1.91455078125}` |
| nested, at the knee | bottom | (0, 35) | `{spacing: 1.91455078125}` |
| audio | right | (−500, 0) | `{length: 40.08251953125}` (the knee) |
| audio, length 8 | right | (50, 0) | `{length: 90.08251953125}` |
| audio, at the knee | right | (100, 0) | `{length: 140.08251953125}` |

How each row is derived:

- **`nested` top:** the edge 45 is kept, so the target height is
  `157.9765625 − 45 = 112.9765625 = H(2)`. Hence `v = 2` and `y = 157.9765625
  − 112.9765625 = 45`.
- **`nested` bottom −40:** the target lies below the flat 74.98828125. The
  knee is `v* = (74.98828125 − 42.9765625)/35 = 0.914620535…`, and
  `floor(v* × 2048) = 1873` gives `0.91455078125`. There
  `14v = 12.8037109375 < h(11)`, so the height is still the flat
  74.98828125.
- **Shrink, then grow by 35** (from spacing 1/4 or from the knee, both at the
  flat 74.98828125): the target is 109.98828125, so `v ≤ 67.01171875/35 =
  1.914620535…`, and `floor(× 2048) = 3921` gives `1.91455078125`. These are
  the regression rows for the stall.
- **`audio` right −500:** the target is below the flat 118.02783203125, so
  the length stops at the knee `L* = 40.08251953125` (169/2048 past 40).
- **`audio` from length 8, right +50:** the target is `118.02783203125 + 50`,
  so `L = 168.02783203125 − 77.9453125 = 90.08251953125`.
- **`audio` from the knee, right +100:** `L = 140.08251953125`.

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
| A with_region | {A/region_1/label} | targets [A/region_1]; afterwards the manifest's ids are `clt_1`, `clt_2`, `clt_3` |
| A nested | {A/clt_1} | refused: `Block 0000000000: its root timeline clt_1 is removed only with the block; select the block to delete it.` |
| A nested, B bare | {B, A/clt_1/start} | refused whole, with the same hint for A |
| any | {} | refused: `Nothing is selected.` |

Every non-refused command is accepted by `apply`, and the removed elements
are gone from the manifest (`manifestIds`).

## `affectedBy`

`affectedBy(manifest, selectedElementIds)` gives the addresses that
removing the selection would also take away, so the canvas can highlight
them. The selection is given as element ids and part addresses. The rule,
using the manifest alone and core's traversal (`manifestElements`,
`timelineAncestry`, `orderedChildren`):

- **Owners:** each selected address folded into its element (`T/name`
  → `T`), as `removeCommand` folds it. The root is dropped: removing it is
  refused, so it takes nothing with it.
- **Removed elements:** every non-root timeline that is an owner or has
  an owner among its ancestors. Then every map, region, break, jump and
  marker of those timelines, plus the owners themselves.
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
| nested | {clt_1} | ∅ (the root is not removable) |
| nested | {clt_1/start} | ∅ (a root part) |
| map | {phrase} | {ticks} |
| map | {tempo} | ∅ |
| with_region | {region_1/label} | {region_1} |
| any | ∅ | ∅ |

`project` carries the set as `data.affectedElements`, computed per block
from its `selectedElements`. A reused node keeps its identical set, since
it is only reused when the block and its selected elements are unchanged.
In the `project` example, B with `{clt_3}` selected has `affectedElements
= {clt_2, clt_2/name}`, and A has the empty set.

**Property (fast-check):** take one block holding any of the five fixtures
and any selection of its drawn addresses that `removeCommand` does not
refuse. Then the element ids the `remove` actually deletes (`manifestIds`
before minus after) equal `(owners ∪ affectedBy) ∩ manifestIds(before)`.
This compares the rule against core's own removal, not against itself.

## `click` and `blockOf`

- `click(∅, "A/clt_3", false)` is `{A/clt_3}`. The element only: its block
  is not selected.
- `click({A, B}, "C", false)` is `{C}`.
- `click({A}, "B/clt_1", true)` is `{A, B/clt_1}`, and
  `click({A, B/clt_1}, "A", true)` is `{B/clt_1}`, so Shift toggles.
- The input set is never mutated.
- `blockOf("A/clt_3/name")` is `A`, and `blockOf("A")` is `A`.
  `blockOf("workspace")` throws `RangeError`.

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
interaction (drag, snap, resize, marquee, keys, undo through the keyboard,
culling, touch) is proven end to end by the Playwright suite against the
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
   `fixtures/0.5.0/drawings/` (34 cases), the drawing is made from its
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
   `selectedElements = {"intro"}` on `styled__score`, the elements carrying
   `data-selected` are exactly `["intro"]` (one descriptor carries that
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
3. **Text is text.** A text descriptor whose text is
   `<b id="x">C♯ & D♭</b>` and whose `data-address` is `a"<b>` renders one
   `<text>` element in the SVG namespace with exactly those attribute values
   (`x` written `1.5`) and that text, and no `b` element exists: nothing is
   parsed as markup.

4. **The toolbars follow the toolbar pattern.** `roving` (attached to the
   canvas toolbar and the resize-mode toolbar) is tested on a plain toolbar
   of buttons `a`, `b` (disabled) and `c`: the tab stop starts on `a`
   (`tabIndex` 0, `c` −1); from `a`, ArrowRight focuses `c`, skipping the
   disabled `b`, and moves the tab stop to it; ArrowRight again wraps to
   `a`, ArrowLeft wraps back to `c`, Home focuses `a` and End `c`. When the
   button holding the tab stop is disabled, the stop passes to the first
   enabled button (after the mutation is observed); once detached, arrows
   no longer move focus.

`BlockNode.svelte` has no style of its own (the canvas styles it), so
Svelte adds no scoping class to a drawn element and the trees compare
attribute for attribute. The bundled font is declared by the canvas's
stylesheet, which jsdom does not apply, so the font is not exercised here.

Which keys reach the canvas (focus inside it or on the page body; undo and
redo everywhere outside text inputs), and that arrows inside a toolbar move
focus rather than nudge, need a browser and are not tested here.
