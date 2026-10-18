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
    own line (section 2.2). `score`'s map `cmap_1`, its region
    "Development" and its jump are not drawn: an ancestor line draws
    nothing else of its timeline (section 8.3). `exposition` is a segment
    line (map `cmap_2`, segments "First theme" and "Second theme" at 0 and
    6, the second carrying the tempo map `cmap_3`, which joins
    `exposition`'s stack after `cmap_2` and spans its segment, section
    6.4), `take_1` too (map `cmap_1`, segments at 0.0 and 14.0 s), and
    `recapitulation` a segment line whose two segments are segment lines
    themselves ("First theme" with the segments "Phrase 1" and "Phrase 2",
    "Second theme" with the map `cmap_4` and the same two), drawn as child
    lines in one row above it.
  - Its items, in the order of the box: the frames `group_1`
    "Exposition" (members `exposition`, `take_1`) and `group_2`
    "Recapitulation" (`recapitulation`, `take_2`), then the ungrouped root
    `page`, at `x = 8` and `y` 28.8046875, 245.9921875 and 478.08203125
    (`F = 8` apart; `group_1` 209.1875 high, `group_2` 224.08984375). The
    card heights (sections 6.4, 6.5, 8.3, 8.4; `Ew = 26.9765625` the
    wedges below with their labels, a line with a drawn boundary and one
    tier of segment labels reaching `max(e, k) + 2 + h(9)` above, `e = 1.5
    + 5J` for a stack of `J` maps: `8 + 2 + 10.4765625 = 20.4765625` for
    `J ≤ 1`, `11.5 + 2 + 10.4765625 = 23.9765625` for `exposition`'s two):
    `take_1` `8 + 20.4765625 + Ew + 8 = 63.453125`; `exposition`, its
    ancestor band starting at `23.9765625 + B = 27.9765625` and `7 +
    26.9765625` wide, `8 + 61.953125 + Ew + 8 = 104.9296875`;
    `recapitulation`, its children
    band from `24.4765625`, one row of inner half `k = 8` and outer half
    20.4765625 (the child lines' reach with their phrase labels), so to
    52.953125, then its ancestor band from `52.953125 + B = 56.953125`, `8
    + 90.9296875 + Ew + 8 = 133.90625`; `take_2` and `page` `bare`'s
    49.37890625. So `group_1` is `24.8046875 + 104.9296875 + 8 + 63.453125
    + 8` and `group_2` `24.8046875 + 133.90625 + 8 + 49.37890625 + 8`
    high. Every item is the
    timeskeleton drawing fixture `bundle__bundle_shared_parent`'s
    567.3901 wide, `Wf = 2324030 / 4096 = 567.39013671875` (the only
    multiple of 1/4096 that rounds to it), and every member's card
    551.3901, `Wf − 16`. Every term of `s0` and `Mr` is a constant offset
    from the start or the shared end (the ancestor line's chevrons, the
    names, the labels of marks at a member's start and end; the maps end
    at the shared end, the boundaries and segment labels lie inside it,
    and every segment label is narrower than `2 (s0 − n)`, so none sets
    `s0` at any length), so each grows
    by exactly the length: `Wf(L) = 167.39013671875 + L` for a frame or
    the ungrouped card, `Wc(L) = 151.39013671875 + L` for a member's card
    (spanning `Q = 8` to `Ri + K`), and the box `Wb(L) = Wf(L) + 18 =
    185.39013671875 + L` (585.3901 at 400, the fixture's box).

- **`bundle_mixed`, item by item** (drawing.md section 8.6): groups
  `group_1` "Performance" (members `performance`, `score`, displayed
  `score`, `performance`) and `group_2` "Facsimile" (members `excerpt`,
  `page`, displayed `page`, `excerpt`; `excerpt` is a child of the root
  `recording`, drawn as its ancestor line), then the ungrouped root
  `annotations`. Its bands: `score` carries the maps `cmap_1`
  (QuartersToTicks) and `cmap_2` (a ScalarMap to seconds) and the jump
  `jump_1` "Repeat" (8 to 0 quarters); `performance` the map `cmap_1`
  (SecondsToSamples); `page` `cmap_1` (a ScalarMap to points); `excerpt`
  `cmap_2` (SamplesToSeconds, addressed `recording/cmap_2`); `recording`'s
  own map is not drawn (an ancestor line draws nothing else of its
  timeline, section 8.3); `annotations` the regions `region_1` "Verse" (0
  to 4 quarters) and `region_2` "Chorus" (4 to 12). Maps lie above their
  lines, jumps and regions below (drawing.md section 4). With `places`
  empty the box holds three **items** at
  their default places (`x = P = 8`, `y` one under the other, `F = 8`
  apart, the first `P + h(11) + F = 28.8046875` below the title "Mixed"),
  laid out with the box's one horizontal layout (drawing.md section 8.2),
  as layout's `draw` gives them and its own tests pin (layout's test
  README, `bundles/bundle_mixed`):

  | item | address | `x` | `y` | `length` | `width` | `height` |
  |---|---|---|---|---|---|---|
  | `group_1` | `group_1` | 8 | 28.8046875 | 400 | 562.484619140625 | 169.234375 |
  | `group_2` | `group_2` | 8 | 206.0390625 | 400 | 562.484619140625 | 177.734375 |
  | `annotations` | `annotations/card` | 8 | 391.7734375 | 400 | 562.484619140625 | 71.85546875 |

  The heights (drawing.md sections 6.4, 6.5, 8.3, 8.4; section "Items"
  states each root card's height as a function of the vertical stretch):
  the cards are `score` 78.953125 high (two maps above, its jump's flow
  band below the wedges), `performance` and `page` 49.4765625 (one map),
  `annotations` 71.85546875 (one row of regions below the wedges), and
  `excerpt` 87.453125: its map reaches `e = 1.5 + 5 = 6.5` above its line,
  so its ancestor band starts at `max(p0 / 2, 6.5 + B) = max(7, 10.5) =
  10.5` and is `7 + 26.9765625 = 33.9765625` wide (`recording`'s row:
  half its pitch inside, its marks and their labels `1.5 + 13 + 2 + h(9)`
  outside), so `y_root = 8 + 10.5 + 33.9765625 = 52.4765625` and the card
  is `52.4765625 + 26.9765625 + 8` high. A frame is its title's slot and
  gap `Q + h(11) + 4 = 24.8046875`, its cards `F = 8` apart and `Q = 8`
  below: `group_1` `24.8046875 + 78.953125 + 8 + 49.4765625 + 8`,
  `group_2` `24.8046875 + 49.4765625 + 8 + 87.453125 + 8`.

  The widths, in item coordinates: the box holds frames, so the name
  column starts at `n = Q + K = 16` in every item, the ungrouped card's
  included; `N = 70.29150390625` (`Performance`, the widest name of the
  box); `recording`'s ancestor line runs on to the left (`excerpt` starts
  at 44100 samples), so the start is `s0 = n + N + G' + 8 × 3 = 16 +
  70.29150390625 + 8 + 24 = 118.29150390625`; the right margin is `Mr =
  28.193115234375`, half of `excerpt`'s end mark label `132300 smp`
  centred on the shared end (the bands add no right edge past it: a map
  ends at the shared end, and the regions, the jump and their labels lie
  within it). So every item has `Ri = 118.29150390625 +
  400 + 28.193115234375 = 546.484619140625`, every frame spans 0 to `Ri +
  K + Q = 562.484619140625` and so does the ungrouped card. The box is
  `W = P + (8 + 562.484619140625 + 2) = 580.484619140625` (the ungrouped
  card's shadow) by `H = 8 + (391.7734375 + 71.85546875 + 2) =
  473.62890625`, its place origin at `(0, 0)`. The member cards span `Q =
  8` to `Ri + K = 554.484619140625` in item coordinates, so all four lie
  at x 16 and are 546.484619140625 wide: `score/card` at y 53.609375
  (78.953125 high), `performance/card` at 140.5625 (49.4765625 high);
  `page/card` at 230.84375 (49.4765625 high), `excerpt/card` at
  288.3203125 (87.453125 high). Every line runs from `8 + s0 =
  126.29150390625` to 526.29150390625.
  - Widths as functions of an item's own `length` `L`: neither `s0` (set
    by the ancestor line's chevrons) nor `Mr` (set by a label centred on
    the shared end) depends on any item's length, so every item, frame or
    ungrouped card, is `W(L) = s0 + L + Mr + K + Q = 162.484619140625 + L`
    wide (`Wn(L)` for a frame).
  - **Moved left and up:** with `annotations` placed at `{x: −30, y: −20}`
    (one `set` of its `place`), the box reaches `−30 − P = −38` on the
    left and `−20 − Pt = −48.8046875` at the top, `Pt = P + h(11) + F =
    28.8046875` since the title is displayed (drawing.md section 8.4: the
    title's slot is the items' top border), so the place origin lies at
    `(38, 48.8046875)`. The box is `Wb = (8 + 570.484619140625) − (−38) =
    616.484619140625` wide (the frames' right edge `8 +
    562.484619140625`; the moved card ends at `−30 + 562.484619140625 + 2
    = 534.484619140625`) and `Hb = (8 + 383.7734375) − (−48.8046875) =
    440.578125` high (`group_2`'s bottom `206.0390625 + 177.734375`).
    With `{x: −30}` alone the card keeps its default `y` and the origin is
    `(38, 0)` in `616.484619140625 × 473.62890625`.
  - **`mixed`** is `bundle_mixed` with the child `dlt_1` (`samples`,
    offset 0, length 44100, half of `excerpt`) added to `excerpt`: it is
    drawn on `excerpt`'s card as the `child` line from x `8 + s0 =
    126.29150390625` to `8 + s0 + 400 × 1/2 = 326.29150390625`, in the
    children band above `excerpt`'s line (drawing.md section 6.4). That
    band follows the root band of `excerpt`'s map (reach 6.5, above), so
    it starts at `max(p0 / 2, 6.5 + B) = 10.5`; its one row puts the line
    `10.5 + 7 = 17.5` above `excerpt`'s and ends the band at `10.5 + 14 =
    24.5`. The ancestor band, 33.9765625 wide as above, then starts at
    `24.5 + B = 28.5` instead of 10.5, so `excerpt`'s line lies `y_root =
    8 + 28.5 + 33.9765625 = 70.4765625` below its card's top and the card
    is `70.4765625 + 26.9765625 + 8 = 105.453125` high, 18 more than in
    `bundle_mixed`. With the card at y 288.3203125, `excerpt`'s line lies at
    358.796875 and `dlt_1`'s at `358.796875 − 17.5 = 341.296875`; the name
    `dlt_1/name` "dlt_1", anchored at x `8 + n = 24` and 26.85009765625
    wide, is centred on that line and spans y 334.89453125 to 347.69921875
    (its baseline less the font's ascent at size 11 to its baseline plus
    the descent, `h(11) = 12.8046875`). The child changes neither `N`
    (26.85… is less than 70.29…), nor `s0`, nor `Mr` (its diamond lies
    inside the shared end). `mixed`'s box is `580.484619140625 ×
    491.62890625`: `group_2`'s frame is 195.734375 high and `annotations`
    lies at y 409.7734375, the rest as in the table.

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
- The placement carries all seven members, `bands` and `places` among
  them: on `bundle_mixed` with `annotations` placed at `{x: −30}` the
  drawing equals `draw` with `places: {annotations: {x: -30}}` and has the
  origin `(38, 0)`. A preview may replace the places and the manifest (a
  reorder drawn before its drop): with `{places: {}}` the origin is `(0,
  0)` again, and with the manifest of `withMemberOrder` (below) the cards
  are drawn in that order.

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
    and `data.selectedElements = {clt_3}`.
  - Neither node has a `draggable`, a `selectable` or a `class` member
    (no editor is open). `data.descriptors` equals
    `toDescriptors(data.drawing)`, `data.editing` is `null`, and
    `data.inside` holds every address the drawing draws: for `bare`,
    exactly `bare/card`, `bare`, `bare/start`, `bare/end`, `bare/name`,
    `bare/start/label`, `bare/end/label`, in drawing order.
- **A block's `x`, `y` are its place origin's** (drawing.md section 8.6):
  the node lies at `(x − Ox × scale, y − Oy × scale)`, so a box growing
  left or up moves nothing it holds. `bundle_mixed` at (40, 80) with
  `annotations` placed at `{x: −30, y: −20}` (origin `(38, 48.8046875)`,
  section "Fixture facts") gives the node `position: {x: 2, y:
  31.1953125}` (`80 − 48.8046875`), `width: 616.484619140625`, `height:
  440.578125`; at scale 2 `position: {x: −36, y: −17.609375}` (`40 − 2 ×
  38`, `80 − 2 × 48.8046875`) and the box doubled, `1232.96923828125 ×
  881.15625`. With places empty the origin is `(0, 0)` and the node lies at
  the block's `x`, `y` (every other case in this file).
  `nodePosition(block, drawing)` is that position.
- **Editors.** `project(..., editing)` takes the innermost open editor
  `{target, kind}`. View: A holds `bundle_mixed` at (40, 80), B `bare` at
  (600, 0); no selection.
  - `{target: A, kind: "bundle"}`: A's node has `draggable: false` and no
    `selectable` or `class` member, `data.editing` the editor, and
    `data.inside` every drawn address of A (the identical set object as
    with no editor: `insideOf` memoizes by drawing and element). B's node
    has `selectable: false`, `draggable: false`, `class: "tilie-outside"`
    and an empty `inside`.
  - `{target: A/group_1, kind: "group"}`: A's `inside` is, in drawing
    order (drawing.md sections 7.2 and 8.5: per card the card, then the
    maps, jumps, line, wedges, names, wedge labels and jump labels),
    `group_1`, `group_1/name`, `score/card`, `score/cmap_1`,
    `score/cmap_2`, `score/jump_1`, `score`, `score/start`, `score/end`,
    `score/name`, `score/start/label`, `score/end/label`,
    `score/jump_1/label`, `performance/card`, `performance/cmap_1`,
    `performance`, `performance/start`, `performance/end`,
    `performance/name`, `performance/start/label`,
    `performance/end/label`: what core's `contains` puts inside the group,
    the members' maps and `score`'s jump with its label among them, never
    the title `name`, `group_2`'s drawing or `annotations`.
  - `{target: A/annotations, kind: "timeline"}`: A's `inside` is, in
    drawing order (the regions before the line, their labels after the
    wedge labels), `annotations/card`, `annotations/region_1`,
    `annotations/region_2`, `annotations`, `annotations/start`,
    `annotations/end`, `annotations/name`, `annotations/start/label`,
    `annotations/end/label`, `annotations/region_1/label`,
    `annotations/region_2/label`.
  - **Reuse.** Projecting again with an equal editor (a new object of the
    same target and kind) returns the identical nodes; with another
    editor, or none, both nodes are new.
- **Blocks of manifests with groups.** A block holding `numbers` with selection
  `{A/score/region_1/label}` has `data.selectedElements =
  {score/region_1/label}` (everything after the block id, slashes kept)
  and `affectedElements = {score/region_1}`; its
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
- **Live placement.** `livePlacement(block, position, values, drawing)` is
  what the inspector shows during a gesture: the block's `id`, `scale`,
  `length`, `spacing`, `width` and `height` overridden by the previewed
  `values`, `drawing` the drawing the node shows, and `x`, `y` the place
  origin of the node's `position` (where Svelte Flow has the dragged or
  previewed node): `position + drawing.origin × scale`. With the drawing of
  the case above (origin `(38, 48.8046875)`) and `position` (2,
  31.1953125) it gives `x: 40, y: 80`, at scale 2 (`values` `{scale: 2}`)
  and `position` (−36, −17.609375) also `x: 40, y: 80`. With the origin
  `(0, 0)`: for A (`bare` at (40, 80), defaults, its memoized drawing `D`)
  with `position` (104, 40) and no values it is exactly `{id: A, x: 104,
  y: 40, scale: 1, length: 400, spacing: 1, width: null, height: null,
  drawing: D}`; with `values` `{width: 478.5771484375}` and `position`
  (40, 80) it is the same with `x: 40, y: 80, width: 478.5771484375`; with
  `values` `{x: 19, scale: 2}` and `position` (19, 80) it has `x: 19,
  scale: 2` (the position wins over a previewed `x`, and they agree
  whenever the canvas shows a preview).
- **Property (fast-check).** For any sequence of accepted move, z-order and
  remove commands drawn from the gesture functions below, projecting the
  resulting view twice (the second time with the first result as
  `previous`) returns an array whose members are identical. It has one
  node per block, and each `width` equals the drawing's width × the scale.

## `moveCommand`

`moveCommand(view, moves, metrics)` only quantizes, to `GRID_FREE`;
deciding grid versus alignment is `snap`'s job, and its result is final.
The caller passes the dragged node's snapped position, and the other nodes
of a multi-block drag at their positions moved by the same snapped delta.
A move holds a **node position** (the box's top-left corner on the canvas),
and the command stores the block's place origin, `position + origin ×
scale` (`nodePosition` inverted): on `bundle_mixed` at (40, 80) with
`annotations` at `{x: −30, y: −20}` (origin `(38, 48.8046875)`, node at
(2, 31.1953125)), a drop at (10, 60) stores `{x: 48, y: 108.8046875}`, and
at scale 2 `{x: 10 + 76 = 86, y: 60 + 97.609375 = 157.609375}`; a drop at
(2, 31.1953125) is no move (`null`). 48.8046875 is 1648 / 2048, so every
sum is already a multiple of 1/2048. Every case below has the
origin `(0, 0)`, where node and place origin coincide.

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
- The target is the box's extent at the pointer: the stretch stores the
  largest value whose box, the content together with the request that
  follows it (below), does not pass the pointer. When the box has no
  request, the box is the content, so the edge ends under the pointer.
- **The box follows the content** (drawing.md section 1), on each axis on
  its own, at every value the search tries. With `content` the content's
  extent before the stretch, `content′` at the value tried and `request`
  the stored `width` (or `height`): a `null` request stays `null` and is
  not written; a request larger than `content` keeps its proportion to
  the content, `request′ = request × content′ ÷ content` (multiplied
  first, in binary64) quantized to 1/2048, written only when it differs
  from the stored one; a request at or below `content` draws nothing and
  becomes `null`. The box is `max(content′, request′)`, so the dragged
  edge ends under the pointer with or without a request, and the left or
  top anchoring uses that box. Since `request′` grows with `content′`, the
  box's extent is non-decreasing in the value on every piece where the
  content's is, so the search stays monotone: a pointer moved back always
  finds a smaller value, never the knee of a flat piece a request would
  otherwise draw. This proves every margin stretches with its content,
  not merely that the content moved.

`kept(request, content, stretched)` is that rule, the one helper of the
block's stretch and of every item's and card's (section "Items"):

| request | content | stretched | result |
|---|---|---|---|
| 700 | 553 | 691.25 | 875 (`700 × 691.25 = 483875`, ÷ 553 = 875 exactly) |
| 700 | 553 | 600 | 759.49365234375 (`420000 / 553 = 759.4936708…`, 1555443.04 steps, rounded) |
| 700 | 553 | 553 | 700 (no stretch, no change) |
| 553 | 553 | 600 | `null` (at the content: it draws nothing) |
| 500 | 553 | 600 | `null` |
| `null` | 553 | 600 | `null` |

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
| bare, width 953.15 | right | (40, 0) | `{length: 420, width: 993.154296875}` |
| bare, width 953.15 | left | (−42, 0) | `{length: 421, width: 995.154296875, x: −2}` |
| bare, width 953.15 | bottom | (0, 30) | `{spacing: 2.875}` (the width's axis is unchanged) |
| bare, height 134.76 | bottom | (0, 32) | `{spacing: 2, height: 166.7578125}` |
| bare, height 134.76 | top | (0, −32) | `{spacing: 2, height: 166.7578125, y: 48}` |
| bare, both requests | bottom-right | (40, 32) | `{length: 420, spacing: 2, width: 993.154296875, height: 166.7578125}` |
| bare, length 500, width 496.58 | right | (20, 0) | `{length: 520, width: null}` (a request the content has overtaken) |
| child member, width 600 | right | (50, 0) | `{length: 446.53466796875, width: 650}` |

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

The last eight rows store a box request first (one `set` on block A):
`width 953.15` is twice the content's width, `width = 2 Wc(400) =
953.154296875`, `height 134.76` twice its height, `height = 2 Hc(1) =
134.7578125`, `both requests` both of them, and `width 496.58` is `W + 20
= 496.5771484375`. With `Wc(L) = 76.5771484375 + L` and `Hc(v) =
51.37890625 + 16v` from the fixture facts, a request twice the content
stays twice the content, `request′ = 2 × content′` exactly (every factor
is a short multiple of 1/2048, so the binary64 product and quotient are
exact), and the box is `2 Wc` by `2 Hc`:

- **`width 953.15` right +40:** the right edge `40 + 953.154296875` goes
  40 further, so the box must be at most `993.154296875 = 2 Wc(L)`: `Wc(L)
  = 496.5771484375`, `L = 420`, `width = 993.154296875`. The margin, as
  wide as the content before, is as wide as the content after.
- **`width 953.15` left −42:** the left edge goes to −2 and the right edge
  `993.154296875` stays, so `2 Wc(L) ≤ 995.154296875`: `L = 421`, `width =
  995.154296875` and `x = 993.154296875 − 995.154296875 = −2`.
- **`width 953.15` bottom +30:** the spacing solves as in `bare` bottom
  +30 (no height request: 2.875). The width's content does not depend on
  `v`, so `width′ = width × Wc(400) ÷ Wc(400)` equals the stored request
  and is not written.
- **`height 134.76` bottom +32:** `2 Hc(v) ≤ 134.7578125 + 32 =
  166.7578125` gives `Hc(v) = 83.37890625 = Hc(2)`: `v = 2`, `height =
  166.7578125`.
- **`height 134.76` top −32:** the top edge goes to 48 and the bottom edge
  `80 + 134.7578125 = 214.7578125` stays: `v = 2`, `height = 166.7578125`
  and `y = 214.7578125 − 166.7578125 = 48`.
- **`both requests` bottom-right (40, 32):** both axes as in the rows
  above: `L = 420`, `v = 2`, `width = 993.154296875`, `height =
  166.7578125`.
- **`length 500, width 496.58` right +20:** `Wc(500) = 576.5771484375`
  already passes the request, which draws nothing: the box is the content.
  The target is `576.5771484375 + 20 = Wc(520)`, so `L = 520`, and the
  request at or below the content becomes `width: null`.
- **`child member, width 600` right +50:** `group_child_member` (a group
  file: one frame of two cards) at (40, 80) with `width` 600. By the
  timeskeleton drawing fixture `group__group_child_member`, `x0 =
  120.61962890625` (the ancestor chevron term, independent of `L`), `R =
  x0 + L + 13.79443359375` (the end label `10.0 s`; every right edge is
  `x0 + L` plus a constant), and `W = 8 + R + 8 + 8`, so `Wc(L) =
  158.4140625 + L` and `Wc(400) = 558.4140625`. The box is `q(600 ×
  Wc(L) ÷ 558.4140625)` and must be at most 650. A quantized value is at
  most 650 while the product is below `650 + 1/4096`, so `Wc(L) < (650 +
  1/4096) × 558.4140625 / 600 = 604.94879…`, `L < 446.53473…`: the largest
  lattice length is `914503 / 2048 = 446.53466796875` (914504 steps would
  draw 650.00048828125). Then `600 × 604.94873046875 / 558.4140625 =
  649.99987…` rounds to `width = 650`: the margin grows with the line, so
  the line grows by less than the pointer's 50.

**The shortening lock, through the block.** A stretch back must shrink
the box. On `bundle_shared_parent` at (40, 80) (fixture facts: its box
`Wb(L) = 185.39013671875 + L`), Box right by (585.39013671875, 0) gives
`{width: 1170.7802734375}`, twice the content. Stretch right by (100, 0)
then gives `{length: 450, width: 1270.7802734375}` (`2 Wb(L) ≤ 1270.78…`,
`Wb(450) = 635.39013671875`), and from there Stretch right by (−200, 0)
gives `{length: 350, width: 1070.7802734375}`: the length goes down by
the travel's half, since the box is twice the content, and the request
stays twice the content each time.

`resizeCommand(block, values)` is `{type: "set", changes: [{target:
block.id, values}]}`. Every row's command is accepted by `apply`, and the
resulting block carries exactly the values.

**The node's edges stay, not the place origin.** A block's `x`, `y` are
its place origin's (section `project`), so the fixed opposite edge is the
node's and the stored `x`, `y` follow from it: for a left or top handle
the node's new edge is the opposite edge less the achieved size, and the
stored value is that edge plus the resized drawing's origin times the
scale. On `bundle_mixed` at (40, 80) with `group_2` at `{width: 600}` (its
frame's right edge at 608, the box's content at `608 + P = 616`) and
`annotations` at `{x: −30}` (origin `(38, 0)`, node at x 2, box `616 + 38
= 654` wide, right edge 656), Box from the left by (−21, 0) gives `{width:
675, x: 19}`: the node's left edge goes to −19 and `x = −19 + 38`.
Applied, the node lies at x −19 and its right edge is still 656. (The
width request is quantized to 1/2048 like every value: a box whose width
is an odd multiple of 1/4096, as `bundle_mixed`'s 553.768798828125, would
move its right edge by 1/4096, so the case states a frame width that keeps
the box on the lattice.)

**A stretch keeps the arrangement** (the items' sizes and distances scale,
section 8.6). `blockStretchPlaces(block, length, spacing)` scales every
stated `x`, `length` and `width` by `length / block.length` and every
stated `y` and `height` by `spacing / block.spacing`, quantized to 1/2048:

- places `{group_2: {x: 40, y: 200, width: 700}, annotations: {x: −30,
  length: 300}}` on a block of length 400 and spacing 1, stretched to
  length 500 and spacing 1.5, become `{group_2: {x: 50, y: 300, width:
  875}, annotations: {x: −37.5, length: 375}}`;
- `{annotations: {x: 1, y: 1}}` stretched to length 401 becomes
  `{annotations: {x: 1.00244140625, y: 1}}` (`1.0025 × 2048 = 2053.12`
  steps, rounded to 2053);
- stretched to the block's own length and spacing it returns the block's
  own `places` object (`toBe`), and so does a block without places, so a
  stretch states `places` only when they change.

`resize` in stretch mode solves `length` and `spacing` on drawings whose
places are stretched with them, and sets `places` when they change. On
`bundle_mixed` at (40, 80) with `group_2` placed at `{x: 40, y: 200, width:
700}`, the box's content ends at `P + 40 + 700 = 748` (the other items end
left of 740 at every length up to 440: `group_1`'s frame at `132.0859375 +
L`), so its width is `W(L) = 8 + q(40 L / 400) + q(700 L / 400)`. Right
by (74, 0): the target is 822, so `L = 440` (`8 + 44 + 770`; one step more
draws 822.0009765625), and the values are `{length: 440, places:
{group_2: {x: 44, y: 200, width: 770}}}`. `resizeCommand` writes the
block's own members in one change and each item's place in one change of
its own, aimed at the item: `[{target: A, values: {length: 440}},
{target: A/group_2, values: {place: {x: 44, y: 200, width: 770}}}]`.
Applied, the box is 822 wide, its right edge at `40 + 822 = 862`, the old
edge 788 plus the pointer's 74, and `group_2` lies at `x = 44`, 770 wide.

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
a zero step gives `null` rather than a `set` without changes, which core
refuses.

What moves and snaps is the **node** (the box the user sees), and the
command stores its place origin, as `moveCommand` does. On `bundle_mixed` at
(40, 80) with `annotations` at `{x: −30, y: −20}` (origin `(38,
48.8046875)`, node at (2, 31.1953125)): nudged by (1, 0) under the default
grid the node goes to (10, 31.1953125) and snaps to (8, 32) (10 / 8 = 1.25
rounds to 1; 31.1953125 / 8 = 3.899… rounds to 4), stored as `{x: 46, y:
80.8046875}`; with the grid not snapping it goes to (10, 31.1953125),
stored as `{x: 48, y: 80}`.

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

## Editors: what opens, and what each level offers

An editor is a mode of the canvas on one element: the bundle editor on a
block, the group editor on a group, the timeline editor on a root or a
child timeline. What proves the dispatch is that the target comes from the
kind of box that was hit, never from what the box holds, and that inside an
editor nothing outside the edited element, nor the element itself, opens.
Anything drawn that is neither a box nor a timeline's line (a name, a
label, a region, a boundary) opens the last drawn card or frame holding it,
the innermost where none overlap, `within`, which `hitOf` reads from the
pointer's point (section "Boxes"); a hit without a
point (Enter on a selected element) has `within` null and opens nothing.
Hits are written as `boxes.ts` makes them (`{block, kind, address,
boundary, within}`), `within` null unless a row names it, so the cases do
not depend on a DOM. View: A holds `mixed` (section "Fixture facts"), B
holds `bare`.

`editorTargetOf(view, hit, editing)`:

| editing | hit (kind, address) | target |
|---|---|---|
| none | block, `A` | `A` |
| none | group, `A/group_1` | `A/group_1` |
| none | card, `A/score/card` | `A/score` |
| none | element, `A/score` (a member's line) | `A/score` |
| none | element, `A/annotations` (an ungrouped root's line) | `A/annotations` |
| none | element, `A/excerpt` (a member that is a child) | `A/excerpt` |
| none | element, `A/dlt_1` (a child's line) | `A/dlt_1` |
| none | element, `A/recording` (an ancestor line, the root's own line drawn on its member's card) | `A/recording` |
| none | element, `A/score/name` within `score/card`; `A/score/start` within `score/card` | `A/score` |
| none | element, `A/group_1/name` within `group_1` (a frame's name) | `A/group_1` |
| none | element, `A/dlt_1` within `excerpt/card` (a child's line keeps opening the child) | `A/dlt_1` |
| none | element, `A/score/start`, `A/score/name`, `A/group_1/name` with `within` null; `A/name` (the title, in no card or frame) | `null` |
| bundle `A` | block, `A` (the edited element) | `null` |
| bundle `A` | group, `A/group_1`; card, `A/annotations/card` | `A/group_1`; `A/annotations` |
| bundle `A` | block, `B` (another block) | `null` |
| group `A/group_1` | group, `A/group_1` (itself) | `null` |
| group `A/group_1` | card, `A/score/card`; element, `A/performance` | `A/score`; `A/performance` |
| group `A/group_1` | card, `A/page/card`; group, `A/group_2`; block, `A` | `null` |
| group `A/group_1` | element, `A/score/name` within `score/card` | `A/score` |
| group `A/group_1` | element, `A/group_1/name` within `group_1` (itself); `A/page/name` within `page/card` (outside) | `null` |
| timeline `A/excerpt` | element, `A/dlt_1` | `A/dlt_1` |
| timeline `A/excerpt` | card, `A/excerpt/card` (itself); element, `A/recording` (its ancestor, outside) | `null` |
| timeline `A/dlt_1` | element, `A/dlt_1` | `null` |

An unknown block in the hit gives `null`. `sameEditing` is true for two
editors of equal target and kind and for two absent ones, false otherwise;
`editedElement("A/group_1")` is `{block: A, element: "group_1"}`,
`editedElement("A")` `{block: A, element: null}`.

`GESTURES` is the permission table of the gestures besides resizing, one
row per level, each member stated:

| level | moveBlocks | moveItems | reorderMembers | marquee |
|---|---|---|---|---|
| `arranger` | true | false | false | `"blocks"` |
| `bundle` | false | true | false | `"elements"` |
| `group` | false | false | true | `"elements"` |
| `timeline` | false | false | false | `"elements"` |

`gesturesOf(editing)` is the arranger's row without an editor and its
kind's row otherwise (`toBe` the table's row).

**What resizes** is one table by box kind, `RESIZING`: for each kind the
levels where it resizes and what each mode writes, a stretch by its axis
(`length` along time, `spacing` vertically). What proves it is the
table itself, compared whole (`toStrictEqual`), and `resizes(kind, level,
own)` checked for every kind, level and `own` (4 × 4 × 2 cases): a box
resizes where its reach is `"inside"` whatever `own` says, where it is
`"edited"` only when it is the edited element's own box, and nowhere else.
Every box offers the three modes wherever it resizes, so there is no
per-mode permission. The rows (`·` no entry):

| kind | arranger | bundle | group | timeline | scale | box | length | spacing |
|---|---|---|---|---|---|---|---|---|
| `block` | inside | edited | · | · | block | block | block | block |
| `frame` | inside | inside | edited | · | item | item | item | item |
| `card` (ungrouped) | inside | inside | · | edited | item | item | item | item |
| `member` (a member's card) | inside | inside | inside | edited | item | card | item | card |

So on the arranger every block, frame and card resizes; in the bundle
editor the edited block itself and every frame and card in it; in the group
editor the edited frame itself and its members' cards; in the timeline
editor only the edited card itself (a child timeline has no box). A
member's card scales its group and stretches it along time ("item": the
group's place), and sizes its own box and stretches its own card
vertically ("card": the member's own place); every other box writes its
own item's place.

## Items: moving and resizing frames and cards

A box's items, its groups' frames and its ungrouped roots' cards, lie at
places stated in the block, and its members' cards may state their own
size (drawing.md section 8.6). What proves a gesture on an item is that
applying its command moves or resizes exactly that item and **nothing else
on the canvas**: every other item keeps its drawn place, and the dragged
edge's opposite edge keeps its canvas position even when the box grows
left or up. Each case therefore applies the command (core accepts it) and
reads the drawing again. View: A holds `bundle_mixed` at (40, 80) unless
stated. Under the box's one horizontal layout (drawing.md section 8.2)
its three items are equally wide, each drawn 562.484619140625 wide in item
coordinates at scale 1 (`group_1` at (8, 28.8046875), 169.234375 high;
`group_2` at (8, 206.0390625), 177.734375 high; `annotations`'s card at
(8, 391.7734375), 71.85546875 high; section "Fixture facts"), and every
member's card spans x 16 to 562.484619140625, 546.484619140625 wide
(`score`'s at y 53.609375, 78.953125 high, and `performance`'s at y
140.5625, 49.4765625 high). Each width grows by exactly the length added
(`W(L) = 162.484619140625 + L`): the bands the members draw lie within
the shared start and end.
562.484619140625 is an odd multiple of 1/4096, so a width quantized to
1/2048 from it rounds half up.

`itemMoveCommand(view, block, key, x, y, metrics, together = [])` (`x`,
`y` in drawing units from the place origin, quantized to 1/2048;
`together` the keys of the other items that move with `key`):

- `group_2` to (40, 200) gives exactly `{type: "set", changes: [{target:
  A/group_2, values: {place: {x: 40, y: 200}}}, {target: A/group_1,
  values: {place: {x: 8, y: 28.8046875}}}, {target: A/annotations, values:
  {place: {x: 8, y: 391.7734375}}}]}`: every other item states its drawn
  position. Applied, `group_2` lies at (40, 200), `group_1` and
  `annotations` where they were drawn: `annotations` would otherwise follow
  `group_2`'s bottom edge up to `200 + 177.734375 + 8 = 385.734375`.
- An item that states one member gets only the other: with `group_1` at
  `{x: 12}`, the move of `group_2` states `{place: {y: 28.8046875}}` for
  `group_1`.
- To (40.0001, 200) it is the same command (`40.0001 × 2048 = 81920.2`
  steps); to its drawn place (8, 206.0390625) it is `null`. A key that is
  no item (`score`, a member) throws `RangeError`.
- **Several items move by one travel.** The pressed item's place is
  quantized as above, and every item of `together` moves by exactly the
  travel that gave it, so it keeps its offset to the pressed item. With
  `together` `[annotations]`, `group_2` to (40, 200) travels `(40 − 8, 200
  − 206.0390625) = (32, −6.0390625)`, so `annotations` goes from its drawn
  (8, 391.7734375) to (40, 385.734375), its offset to `group_2` staying
  `(0, 185.734375)` (`391.7734375 − 206.0390625` before, `385.734375 −
  200` after). The command is exactly `{type: "set", changes: [{target:
  A/group_2, values: {place: {x: 40, y: 200}}}, {target: A/annotations,
  values: {place: {x: 40, y: 385.734375}}}, {target: A/group_1, values:
  {place: {x: 8, y: 28.8046875}}}]}`: the pressed item, then the items
  moving with it in the order given, then every other item stating its
  drawn position. Applied, the three items are drawn at exactly those
  places. Every number is a multiple of 1/2048, so the sums are exact.
- With `together` `[group_1, annotations]`, the same move takes every
  item: `group_1` from (8, 28.8046875) to (40, 22.765625), `annotations` to
  (40, 385.734375). The command holds exactly three changes, `group_2`'s,
  `group_1`'s and `annotations`', each `{x, y}` as named, and no other;
  applied, the items are drawn there.
- With `together` `[annotations]`, `group_2` to its drawn place (8,
  206.0390625) is `null`: no item travels. A key of `together` that is no
  item (`score`) throws `RangeError`.

`itemsMovedWith(manifest, drawing, selected, key)` decides what a drag of
the item `key` does with the selection, given as the element addresses
selected in the block (`BlockNodeData.selectedElements`). Each selected
address puts items in the selection. A box's address, a frame `G`, an
ungrouped root's card `U/card` or a member's card `M/card`, puts there
only the item that draws the box, as the drawing records it: the item
whose `address` it is, or for a member's card the item of the frame
holding it (`Drawing.cards`, its `group`). Every other address puts there
every item containing it by core's `contains`, the item's key naming the
container: every element the group or the root holds by address (core's
README, "Containment"). Where an item lies plays no part. When `key` is in
the selection, the result is every other item in it, in the drawing's
item order (`group_1`, `group_2`, `annotations`), possibly none: the drag
moves them all with `key` and keeps the selection, however many items it
holds. When `key` is not in it, the result is `null`: the drag selects
`key` alone and moves it alone. What would prove this is a case of each
kind, cases where where things lie and the addresses disagree, so that a
rule of rectangles would give another answer, and a case where a selected
card is drawn in one frame while two groups contain it by address. On
`bundle_mixed`'s drawing:

- `{group_2, annotations/card}`: for `group_2` `[annotations]`, for
  `annotations` `[group_2]`, for `group_1`, which is not in the
  selection, `null`.
- `{group_1, group_2, annotations/card}`: for `annotations` `[group_1,
  group_2]`, in the drawing's order.
- `{score, annotations/name}`, two elements and no box: `group_1` contains
  its member `score`, `annotations` its own name, so both items are in
  the selection: for `group_1` `[annotations]`, for `annotations`
  `[group_1]`, for `group_2` `null`.
- `{group_2, page, excerpt/card}`: `group_2` contains its member `page`'s
  line and its member `excerpt`'s card, so the selection holds one item:
  for `group_2` `[]`, a drag that keeps the selection; for `group_1` and
  `annotations` `null`.
- `{name, group_2}`: the manifest's title lies in no item: for `group_2`
  `[]`, for `group_1` `null`.
- `{recording}`: the ancestor line drawn on `excerpt`'s card inside
  `group_2`'s frame carries the address of the root `recording`, which no
  group and no ungrouped root contains (core's `contains`, case 1, lists
  `group_2`'s addresses without it): for `group_2` `null`, although the
  line is drawn inside its frame.
- The empty selection gives `null` for every key.
- **A card over a frame.** The view `over` is `view` after
  `itemMoveCommand(view, A, annotations, 8, 60, metrics)` applied: one `set`
  stating `annotations` at (8, 60) and `group_1` and `group_2` at their
  drawn (8, 28.8046875) and (8, 206.0390625), so every item states both
  `x` and `y`. `annotations`' card, 562.484619140625 by 71.85546875, then
  spans x 8 to 570.484619140625 and y 60 to 131.85546875, wholly inside
  `group_1`'s frame (x 8 to 570.484619140625, y 28.8046875 to
  `28.8046875 + 169.234375 = 198.0390625`), so everything drawn on the
  card, its name included, is drawn inside that frame too. With
  `{annotations/name, group_2}`: for `group_2` `[annotations]`, never
  `group_1`; for `annotations` `[group_2]`; for `group_1`, which contains
  neither address, `null`.
- **A member's card drawn in one frame, contained by two groups.** The
  view `twice` is `view` with `recording` made a member of `group_1`, as
  in section "Boxes", case 6, "A copy hidden in one drawing only" (one
  `set` of the block's `manifest`). `group_1` then holds `recording` and,
  a timeline holding its descendants with their parts, its child
  `excerpt` with the card `excerpt/card`; `group_2` holds its member
  `excerpt` and that card too. Yet the card is drawn once, in `group_2`'s
  frame: `recording`'s card draws `excerpt` as a child line, with no card
  (`Drawing.cards` holds `excerpt/card` once, its `group` `group_2`). With
  `{excerpt/card}`: for `group_1` `null`, so a drag on `group_1` selects
  it and moves it alone; for `group_2` `[]`, so a drag on `group_2` keeps
  the selection and moves `group_2` alone. The test asserts both premises,
  the one card in `group_2` and `contains` holding for both groups: by
  `contains` alone both groups would be in the selection, `group_1`
  giving `[group_2]` and `group_2` `[group_1]`. With `{excerpt}`, the
  child's line, an element, `contains` decides: for `group_1`
  `[group_2]`, for `group_2` `[group_1]`.

`placesWith(places, key, values)` merges like core's `place`:
`placesWith({group_1: {x: 12, length: 300}}, "group_1", {length: null})`
is `{group_1: {x: 12}}`, with `{x: null, length: null}` it is `{}`, and
`placesWith({}, "group_2", {y: 5})` is `{group_2: {y: 5}}`.
`placesAfter(block, command)` applies a command's places to the block's:
for the first move above, the drawing previewed with them equals
(`toEqual`) the drawing of the applied view.

`resizedItemOf(drawing, element)` names the box a selection's element
address shows: `group_1` is `{kind: "frame", key: group_1, item:
group_1}`, `annotations/card` `{kind: "card", key: annotations, item:
annotations}`, `performance/card` `{kind: "member", key: performance,
item: group_1}`, `excerpt/card` (a child member) `{kind: "member", key:
excerpt, item: group_2}`; a line (`score`) or a title (`group_1/name`) is
none (`undefined`).

`itemHandlesFor(mode, kind, level)`: a frame or an ungrouped card offers a
block's handles, the four corners to scale and all eight to size its box
or stretch it; in the group editor its Stretch leaves out the left edge
and the left corners, `["top", "top-right", "right", "bottom-right",
"bottom"]` (the frame does not grow along time there, so its left edge
stays; vertically it adapts). A member's card, whose top left corner its
frame decides, offers at every level `["bottom-right"]` to scale and
`["right", "bottom-right", "bottom"]` to size its box and to stretch.

`itemResizeValues(block, settings, metrics, level, resized, mode, handle,
delta)`, `delta` in canvas units as for a block, gives the places to set,
a map from each key of `places` to its values in order; positions are in
drawing units from the place origin and sizes in item coordinates (before
the item's scale). Every value is quantized to 1/2048, as a block's are;
a handle the box does not offer throws `RangeError`. Below, a map is
written as an object, keys in order.

Heights as functions of a vertical stretch `v` of the member drawing, from
the fixture facts (drawing.md sections 6.2 to 6.5): a root card is `y_root
+ Eb + 8v` high, its line at `y_root = 8v + max(Ea, h(11) / 2)`, `Ea` and
`Eb` the outer edges of its sides. Every root card of `bundle_mixed` has
its wedges below, their labels in one tier, reaching `Ew = 1.5 + 13 + 2 +
h(9) = 26.9765625`, and its maps above, a stack of `J` maps reaching
`1.5 + 5J` (`w / 2 + J × (g + d)`), none of which depends on `v`. So:

- `performance` and `page`, one map each (6.5, more than `h(11) / 2 =
  6.40234375`): `Hp(v) = 8v + 6.5 + 26.9765625 + 8v = 33.4765625 + 16v`
  (49.4765625 at 1);
- `score`, two maps (11.5) and below the wedges, after the gap `B = 4v`,
  the flow band of its one jump, `8v + 2 + h(9)` wide: `Hs(v) = 8v +
  11.5 + (26.9765625 + 4v + 8v + 12.4765625) + 8v = 50.953125 + 28v`
  (78.953125 at 1);
- `annotations`, no map (`y_root = 8v + 6.40234375`) and below the
  wedges, after `B`, its region band: "Verse" (0 to 4) and "Chorus" (4 to
  12) meet end to start and share one row (drawing.md section 6.3), so
  the band is `pr − 4v = 6 + 2 + h(9) = 18.4765625` wide: `Ha(v) =
  8v + 6.40234375 + (26.9765625 + 4v + 18.4765625) + 8v = 51.85546875 +
  20v` (71.85546875 at 1).

By drawing.md section 8.6, `v` is the placement's `spacing` times the
item's `spacing` times, for a member, its card's `spacing`, and only the
member drawings stretch: the frame's title slot 24.8046875 above the first
card, the gap 8 between cards and the 8 below the last are not stretched.
So `group_1`'s frame is `H(s) = 24.8046875 + Hs(s) + 8 + Hp(s) + 8 =
125.234375 + 44s` high at its own `spacing` `s` (169.234375 at 1). Each
value of `Hp`, `Hs`, `Ha` and `H` at the spacings below is a short
multiple of 1/2048, exact in binary64. The vertical rows choose their
pointer travel so that the spacing found is 2 (or 1/2): 16 per unit of
spacing on `performance`'s card, 20 on `annotations`'s, 44 on `group_1`'s
frame.

**Scale** sets the item's `scale` to its scale times the larger of the two
axis ratios of the dragged corner's distance from the fixed corner, after
the drag over before (a block's rule, section `resize`), floored at 1/8;
scale 1 unstates it. On `annotations`'s card (left 8, top 391.7734375,
right 570.484619140625, bottom 463.62890625) on the arranger, for the key
`annotations`:

| case | handle | delta | values |
|---|---|---|---|
| | bottom-right | (40, 20) | `{scale: 1.2783203125}`: `max(602.484619140625 / 562.484619140625, 91.85546875 / 71.85546875) = 1.27833650…`, 2618.03 steps rounded; `x`, `y` unchanged, so not set |
| | top-left | (−40, −20) | `{scale: 1.2783203125, x: −148.55078125, y: 371.7744140625}`: the dragged corner at (−32, 371.7734375), the same ratios; then the fixed bottom right corner less the scaled size, `570.484619140625 − 1.2783203125 × 562.484619140625 = −148.55089…` (−304232.23 steps) and `463.62890625 − 1.2783203125 × 71.85546875 = 371.77460…` (761394.38 steps), quantized |
| | bottom-right | (−1000, −1000) | `{scale: 0.125}` (the floor) |
| block at scale 2 | bottom-right | (80, 40) | `{scale: 1.2783203125}` (80 canvas units are 40 drawing units) |
| `scale` 2 stated | bottom-right | (−562.484619140625, −71.85546875) | `{scale: null}`: the drawn extents halve, `2 × 1/2 = 1`, the default |

On `performance`'s card the scale is its group's: the fixed corner is
`group_1`'s top left (8, 28.8046875) and the dragged one the card's bottom
right (562.484619140625, 190.0390625); by (40, 20), `max(594.484619140625 /
554.484619140625, 181.234375 / 161.234375) = 1.12404302…`, 2302.04 steps,
so `{group_1: {scale: 1.1240234375}}`. A right handle on a card, and a
top-left one on a member's card, throw `RangeError`.

**Box** sets `width` and `height`; a request at or below the box's own
content stores `null`. On `group_2` with `width` 580 stated (left edge 8,
right edge 588, top 206.0390625, bottom 383.7734375; its content is
562.484619140625 wide and 177.734375 high) in the bundle editor, for the
key `group_2`:

| handle | delta | values |
|---|---|---|
| right | (20, 0) | `{width: 600}` |
| right | (−20, 0) | `{width: null}` (560, below the content) |
| left | (−21, 0) | `{width: 601, x: −13}` |
| left | (100, 0) | `{width: null, x: 25.515625}` (the content's width from the right edge, `588 − 562.484619140625 = 25.515380859375`, 52255.5 steps rounded up) |
| bottom | (0, 10.5) | `{height: 188.234375}` |
| top | (0, −16) | `{height: 193.734375, y: 190.0390625}` |
| right, block at scale 2 | (20, 0) | `{width: 590}` (20 canvas units are 10 drawing units) |

The left row grows the box left: applied in the bundle editor
(`itemResizeCommand`), the place origin moves to `(21, 0)` (`−13 − P`),
the node to x `40 − 21 = 19`, and `group_2`'s right edge stays at canvas x
`19 + 21 + (−13) + 601 = 628 = 40 + 588`, where it was; `group_1` and
`annotations` keep their drawn places.

On a member's card Box sets the card's own size, in item coordinates, for
the member's key: with `group_1` at `scale` 1.25, `performance`'s card is
still 546.484619140625 × 49.4765625 before the scale, so bottom-right by
(50, 30) on the arranger gives `{performance: {width: 586.48486328125,
height: 73.4765625}}` (`546.484619140625 + 50 / 1.25`, 1201120.5 steps
rounded up, and `49.4765625 + 30 / 1.25`); right by (−50, 0) asks for
less than the card's content, `{performance: {width: null}}`; a left
handle throws `RangeError`.

**Stretch** sets `length` from a left or right handle and `spacing` from
a top or bottom one, both from a corner, by a block's rule (section
`resize`): the largest value whose box, its content with its requests
following it, does not pass the pointer, floored at `MIN_LENGTH` and
`MIN_SPACING`; every stated size of the stretched boxes follows its own
content by `kept`. On the card of `annotations` (`W(L) =
162.484619140625 + L`, `Ha(s)` high, left edge 8, right edge
570.484619140625, top 391.7734375, bottom 463.62890625) in the bundle
editor, for the key `annotations`:

| case | handle | delta | values |
|---|---|---|---|
| | right | (20, 0) | `{length: 420}` |
| | left | (−21, 0) | `{length: 421, x: −13}` (`570.484619140625 − W(421)`) |
| | right | (−500, 0) | `{length: 8}` (`MIN_LENGTH`) |
| | bottom | (0, 20) | `{spacing: 2}` (`Ha(2) = 91.85546875`) |
| | top | (0, −20) | `{spacing: 2, y: 371.7734375}` (`463.62890625 − Ha(2)`) |
| | bottom-right | (20, 20) | `{length: 420, spacing: 2}` |
| | bottom | (0, −10) | `{spacing: 0.5}` (`Ha(1/2) = 61.85546875`) |
| | bottom | (0, −40) | `{spacing: 0.25}` (`MIN_SPACING`: the target 31.85546875 lies below `Ha(1/4) = 56.85546875`) |
| `width` 1124.97 stated | right | (40, 0) | `{length: 420, width: 1164.96923828125}` |
| `width` 1124.97 stated | left | (−42, 0) | `{length: 421, width: 1166.96923828125, x: −34}` |
| `height` 143.71 stated | bottom | (0, 40) | `{spacing: 2, height: 183.7109375}` |

`width` 1124.97 is twice the card's content, `2 W(400) =
1124.96923828125`, and stays twice it: right +40 needs `2 W(L) ≤
1164.96923828125`, so `L = 420`; left −42 keeps the right edge `8 +
1124.96923828125 = 1132.96923828125` and moves the left one to −34, so `2
W(L) ≤ 1166.96923828125`, `L = 421` and `x = 1132.96923828125 −
1166.96923828125 = −34`. `height` 143.71 is twice the card's height, `2
Ha(1) = 143.7109375`: bottom +40 needs `2 Ha(s) ≤ 183.7109375`, so `s =
2` and the height `2 Ha(2)`. (Every product and quotient of these rows is
exact in binary64.)

**A frame stretches its members' cards with it.** On `group_1` in the
bundle editor, for the key `group_1` unless named:

| case | handle | delta | values |
|---|---|---|---|
| | bottom | (0, 44) | `{group_1: {spacing: 2}}` (`H(2) = 213.234375`) |
| | top | (0, −44) | `{group_1: {spacing: 2, y: −15.1953125}}` (`28.8046875 − 44`) |
| `performance` `height` 98.95 | bottom | (0, 60) | `{group_1: {spacing: 2}, performance: {height: 130.953125}}` |

With `performance`'s card stating twice its height, `2 Hp(1) =
98.953125`, the frame is `24.8046875 + Hs(s) + 8 + 2 Hp(s) + 8 =
158.7109375 + 60s` high (218.7109375 at 1); the pointer's 60 needs `s =
2`, and the card's request follows its content to `2 Hp(2) = 130.953125`.
Every card of the frame is stretched by `s`, so every stated card height
follows its own content.

**A member's card** stretches its group's `length` (horizontally, from
the card's right edge: the dragged card's drawn width follows the
pointer) and its own `spacing` (vertically), in the member's timeline
editor too. A horizontal stretch keeps every stated width of the frame
and of the group's members' cards in proportion to its own content, so the
members' lines keep one length and every margin stretches with them; a
vertical one sets only that card's `spacing`, and the stated heights of the
card and of its frame follow their content (drawing.md section 1: a
vertical Stretch of a card rescales its own requested height and its
frame's). On `bundle_mixed` (every card `Wc(L) = 146.484619140625 + L`
wide):

| case | card | handle | delta | values |
|---|---|---|---|---|
| | `score` | right | (20, 0) | `{group_1: {length: 420}}` |
| | `performance` | bottom | (0, 16) | `{performance: {spacing: 2}}` |
| | `performance` | bottom-right | (20, 16) | `{group_1: {length: 420}, performance: {spacing: 2}}` |
| `performance` `height` 98.95 | `performance` | bottom | (0, 32) | `{performance: {spacing: 2, height: 130.953125}}` |
| `group_1` `height` 338.47 | `performance` | bottom | (0, 16) | `{performance: {spacing: 2}, group_1: {height: 370.46875}}` |
| `group_1` `width` 1124.97 | `score` | right | (30, 0) | `{group_1: {length: 415, width: 1154.96923828125}}` |
| `performance` `width` 1092.97 | `score` | right | (30, 0) | `{group_1: {length: 430}, performance: {width: 1152.96923828125}}` |
| `performance` `width` 1092.97 | `performance` | right | (60, 0) | `{group_1: {length: 430}, performance: {width: 1152.96923828125}}` |

The `performance` `height` 98.95 row is the card's own: its box `2 Hp(c)`
must reach `98.953125 + 32 = 130.953125`, so `c = 2`. `group_1` `height`
338.47 is twice the frame's height, `2 H(1) = 338.46875`. With
`performance`'s card at `spacing` `c` the frame's content is `24.8046875
+ Hs(1) + 8 + Hp(c) + 8 = 153.234375 + 16c` high; the pointer's 16 brings
the card to `Hp(c) = 65.4765625`, so `c = 2`, the content to 185.234375
and the frame's request to `338.46875 × 185.234375 ÷ 169.234375 =
370.46875`, still twice it (exact in binary64). The card's spacing is set
first, then the frame's height, which holds the card.

`group_1` `width` 1124.97 is twice the frame's content `W(400)`. A
frame's width widens its cards, which end at one x inside it (drawing.md
section 8.6: `Ri` is taken as the larger of its `Ri` and `width − K −
Q`), so `score`'s card is drawn `2 W(L) − 16` wide, 1108.96923828125 at
400; the pointer's 30 needs `2 W(L) − 16 ≤ 1138.96923828125`, `W(L) ≤
577.484619140625`, so `L = 415` and the frame's request `2 W(415) =
1154.96923828125`: the dragged card's edge follows the pointer, and the
group's lines grow by half the travel, the margin being as wide as the
content. `performance` `width` 1092.97 is twice that
card's content, `2 Wc(400) = 1092.96923828125`: dragging `score`'s card
(no request) by 30 gives `L = 430` and the request `2 Wc(430)`; dragging
`performance`'s own card, twice its content, by 60 needs `2 Wc(L) ≤
1152.96923828125`, the same `L = 430`. A left handle on a member's card
throws `RangeError`. Each row's `itemResizeCommand`, dispatched to a
store with the member's timeline editor open, is accepted (the group's
`length`, `scale`, `width` and `height` and its members' card widths are
shared by the members, the card's own place is the member's), and so on
the arranger and in the bundle editor.

**The shortening lock**: a
member's card widened by Box, then the group stretched, must keep its
margin in proportion, and a stretch back must shorten the group again. On
`bundle_shared_parent` at (40, 80) on the arranger (fixture facts: every
member's card `Wc(L) = 151.39013671875 + L`, every frame `Wf(L) =
167.39013671875 + L`), one gesture after the other, each command applied:

1. Box on `exposition`'s card, right by (551.39013671875, 0): `{exposition:
   {width: 1102.7802734375}}`, twice its content. The frame spans to the
   card's right edge plus 8, `16 + 1102.7802734375 = 1118.7802734375`
   wide; `take_1`'s card stays 551.39013671875.
2. Stretch on `exposition`'s card, right by (100, 0): its box is `2
   Wc(L)` and must reach `1202.7802734375`, so `{group_1: {length: 450},
   exposition: {width: 1202.7802734375}}`. Drawn: `take_1`'s card
   `Wc(450) = 601.39013671875`, `exposition`'s twice that, the frame
   1218.7802734375. The members' lines keep one length.
3. Stretch on the frame `group_1`, right by (−200, 0): the frame is `16 + 2
   Wc(L)` and must shrink to 1018.7802734375, so `{group_1: {length: 350},
   exposition: {width: 1002.7802734375}}`: the group is shorter than at
   the start.
4. Stretch on `exposition`'s card, right by (−50, 0): `2 Wc(L) ≤
   952.7802734375`, so `{group_1: {length: 325}, exposition: {width:
   952.7802734375}}`.

At each step the card's width is exactly twice its content, the margin
kept in proportion, and each length is smaller than the one before from
step 2 on.

A card's content is its own, never the width its frame lends it: a
frame's stated width widens its cards (drawing.md section 8.6), so a card
measured with the frame's request in place would read the frame's width
as its content. With `group_1` at `width` `2 Wf(400) = 1134.7802734375`
and `exposition`'s card at `3 Wc(400) = 1654.17041015625`, the frame's
content before the stretch is `16 + 1654.17041015625 = 1670.17041015625`,
past its request, which becomes `null`; Stretch on `exposition`'s card,
right by (90, 0), needs `3 Wc(L) ≤ 1744.17041015625`, so `{group_1:
{length: 430, width: null}, exposition: {width: 1744.17041015625}}`. Read
with the frame's request, the card's content would be `1134.7802734375 −
16 = 1118.7802734375` and its request would not stay three times its
content.

**The group editor's stretch** changes the members' common `length` with
the frame pinned horizontally: `width` is stated at the frame's drawn
width, quantized (562.484619140625 rounds up to 562.48486328125), and the
length stops where the cards would pass it; the members' cards' stated
widths follow their content as above. Vertically the frame adapts, as on
the arranger. The frame is pinned, so neither its edge nor a card's can
follow the pointer past it: the frame's content (its own width left out,
its cards' widths following) is what follows the pointer, and a stretch
of the frame and one of a member's card give the same values. On
`group_1` (`Wn(L) = 162.484619140625 + L`):

| case | box | handle | delta | values |
|---|---|---|---|---|
| | frame or `score` | right | (20, 0) | `{group_1: {length: 400, width: 562.48486328125}}` (capped: the frame does not grow; 400 + 1/4096 is no lattice step) |
| | frame or `score` | right | (−100, 0) | `{group_1: {length: 300, width: 562.48486328125}}` |
| `width` 600 stated | frame or `score` | right | (30, 0) | `{group_1: {length: 430, width: 600}}` |
| `width` 600 stated | frame or `score` | right | (200, 0) | `{group_1: {length: 437.51513671875, width: 600}}` (`600 − 162.484619140625 = 437.515380859375`, floored to the lattice) |
| | frame | bottom | (0, 44) | `{group_1: {spacing: 2}}` (`H(2) = 213.234375`) |
| | frame | bottom-right | (20, 44) | `{group_1: {length: 400, width: 562.48486328125, spacing: 2}}` |
| `performance` `width` 1092.97 | frame or `score` | right | (20, 0) | `{group_1: {length: 400, width: 1108.96923828125}}` |
| `performance` `width` 1092.97 | frame or `score` | right | (−100, 0) | `{group_1: {length: 350, width: 1108.96923828125}, performance: {width: 992.96923828125}}` |

With `performance`'s card at twice its content, the frame is drawn `16 +
1092.96923828125 = 1108.96923828125` wide, its pinned width, and its
content is `16 + 2 Wc(L)`. The frame's right +20 asks for a content of
1128.96923828125, `L = 410`, capped at 400 where the content reaches the
pin. Its right −100 asks for 1008.96923828125, `2 Wc(L) =
992.96923828125`, `L = 350`, `performance`'s request `2 Wc(350)`. A left
handle on the frame there throws `RangeError`.

**A typed length or spacing is a stretch to that value.** One helper,
`stretchChanges(block, settings, metrics, level, resized, factor, value)`,
gives the places a Stretch of the box `resized` at `level` writes once its
`length` (`factor` `"length"`) or `spacing` (`"spacing"`) is `value`: the
factor on its key (`RESIZING`'s `writes`), then every stated width (or
height) in scope following its own content by `kept`, and in the group
editor, horizontally, the frame's `width` pinned at its drawn width and
the length capped at the largest lattice length whose content, the
cards' widths following, does not pass it. The Stretch above solves the
value from the pointer and calls it; the inspector's form calls it with a
typed or stepped value. So a typed value writes exactly what a Stretch to
that value writes. Every row is checked through a frame and, where a
member's card is named, through that card too, with the same values. On
`bundle_mixed`:

| case | box | level | factor | values |
|---|---|---|---|---|
| | `group_1` or `score` | arranger | `length` 300 | `{group_1: {length: 300}}` |
| `performance` `width` 1092.97 | `group_1` or `score` | arranger | `length` 430 | `{group_1: {length: 430}, performance: {width: 1152.96923828125}}` |
| `annotations` `width` 1124.97 | `annotations` | bundle | `length` 420 | `{annotations: {length: 420, width: 1164.96923828125}}` |
| | `group_1` or `score` | group | `length` 500 | `{group_1: {length: 400, width: 562.48486328125}}` |
| | `group_1` or `score` | group | `length` 300 | `{group_1: {length: 300, width: 562.48486328125}}` |
| `group_1` `width` 600 | `group_1` or `score` | group | `length` 430 | `{group_1: {length: 430, width: 600}}` |
| `group_1` `width` 600 | `group_1` or `score` | group | `length` 500 | `{group_1: {length: 437.51513671875, width: 600}}` |
| `performance` `width` 1092.97 | `group_1` or `score` | group | `length` 350 | `{group_1: {length: 350, width: 1108.96923828125}, performance: {width: 992.96923828125}}` |
| `performance` `width` 1092.97 | `group_1` or `score` | group | `length` 500 | `{group_1: {length: 400, width: 1108.96923828125}}` |
| `performance` `height` 98.95 | `group_1` | bundle | `spacing` 2 | `{group_1: {spacing: 2}, performance: {height: 130.953125}}` |
| `group_1` `height` 338.47 | `performance` | arranger | `spacing` 2 | `{performance: {spacing: 2}, group_1: {height: 370.46875}}` |

The rows follow from the Stretch rows above: the card's request `2
Wc(430)`; the ungrouped card's `2 W(420)`; in the group editor `W(400)`
already fills the frame (562.484619140625, pinned as 562.48486328125, so
500 is capped at 400 and 300 stays), with `width` 600 the content `W(L)`
reaches 600 at `L = 437.515380859375`, floored to the lattice, and 430
fits; with `performance`'s card at twice its content the frame is drawn
1108.96923828125 wide, its content `16 + 2 Wc(L)`, so 350 fits and the
request follows to `2 Wc(350) = 992.96923828125`, while 500 is capped at
400, where `performance`'s request stays its stated `2 Wc(400)` and is not
written. The two `spacing` rows are the frame's and the member card's
vertical Stretch rows at `s = 2` and `c = 2`.

`itemResizeCommand(view, block, places, level, metrics)` is the `set` of
each key's place in the map's order; on the arranger and in the bundle
editor it also states the drawn position of every other item without
one, as a move does (never the frame holding an edited member's card): for
`group_2`'s left Box row, at both levels, `[{target: A/group_2, values:
{place: {width: 601, x: −13}}}, {target: A/group_1, values: {place: {x: 8,
y: 28.8046875}}}, {target: A/annotations, values: {place: {x: 8, y:
391.7734375}}}]`; in the group editor, for the first group-editor row,
`[{target: A/group_1, values: {place: {length: 400, width:
562.48486328125}}}]` alone, and in the timeline editor, for `annotations`'s
first stretch row, `[{target: A/annotations, values: {place: {length:
420}}}]` alone (the group and timeline editors change only their element,
the container adapting). A member card's box on the arranger is the `set`
of the member's own place followed by the drawn position of every item
but the frame holding the card, whose top left corner a card's size never
moves: `[{target: A/performance, values: {place: {width: 586.48486328125,
height: 73.4765625}}}, {target: A/group_2, …}, {target: A/annotations,
…}]` with the positions above (`group_2` at (8, 206.0390625)), never a
change of `A/group_1`; applied, `places.performance` is exactly that size
and `group_1` states no place. A member's horizontal stretch writing
`{group_1: {length: 430}, performance: {width: 1152.96923828125}}` on the
arranger is those two changes, in that order, followed by `group_2`'s and
`annotations`'s positions. Values that are all stated already give
`null`: `{group_2: {width: null}}` and `{annotations: {scale: null}}`,
which state neither.

## Reordering a group's members

`memberOrderAt(drawing, group, dragged, y)` reads only the drawing: the
member cards of a frame are the cards layout records for its group
(`Drawing.cards` with that `group`, in drawing order), each displayed
card's rectangle the first element of its range. Neither the frame's
rectangle nor the next item decides, so a frame that is not displayed
still orders its cards. On `bundle_mixed`'s drawing (section "Fixture facts"),
`score/card`'s middle lies at `53.609375 + 78.953125 / 2 = 93.0859375`,
`performance/card`'s at `140.5625 + 49.4765625 / 2 = 165.30078125`,
`page/card`'s at `230.84375 + 49.4765625 / 2 = 255.58203125`,
`excerpt/card`'s at `288.3203125 + 87.453125 / 2 = 332.046875`, and the
card of `annotations` (no member) has its middle at `391.7734375 +
71.85546875 / 2 = 427.701171875`:

| group | dragged | y | order |
|---|---|---|---|
| `group_1` | `score` | 100 | `[score, performance]` |
| `group_1` | `score` | 170 | `[performance, score]` |
| `group_1` | `score` | 165.30078125 | `[performance, score]` (a middle at `y` is not below it) |
| `group_1` | `performance` | 50 | `[performance, score]` |
| `group_1` | `performance` | 93.0859375 | `[score, performance]` |
| `group_2` | `page` | 440 | `[excerpt, page]` (below the middle of `annotations`'s card, which is no member) |

**A hidden frame.** On `group_child_member` (block A at (0, 0)) with the
workspace statement `{select: {element: group}, set: {display: none}}`,
no frame is drawn, and every other element is the one drawn with the
frame displayed (layout's README, "Hidden cards and frames"), so the
cards keep the places of section "Boxes", case 2: `second-half/card`'s
middle lies at `32.8046875 + (116.7578125 − 32.8046875) / 2 = 74.78125`
and `recording/card`'s at `124.7578125 + (174.13671875 − 124.7578125) /
2 = 149.447265625`. A rule reading the cards drawn after the frame's
rectangle would find no rectangle to start from. Each order is the same
with the frame displayed, and the test asserts it on both drawings:

| group | dragged | y | order |
|---|---|---|---|
| `group_1` | `second-half` | 100 | `[second-half, recording]` |
| `group_1` | `second-half` | 160 | `[recording, second-half]` |
| `group_1` | `recording` | 50 | `[recording, second-half]` |

A group the drawing has no item of (`group_9`) throws `RangeError`.

`withMemberOrder(manifest, "group_1", ["performance", "score"])` is the
manifest with `graphical.order` `{group_1: [performance, score], group_2:
[page, excerpt]}`, its statements and styles kept and the original
unchanged; drawn as a preview (`drawingOf` with `{manifest}`),
`performance/card` lies at y 53.609375 and `score/card` at `53.609375 +
49.4765625 + 8 = 111.0859375`.

`reorderCommand(block, group, order)`:

- on `bundle_mixed`, `group_1` and `[score, performance]` (displayed
  already) give `null`; `[performance, score]`, which is `members`, gives
  `{type: "set", changes: [{target: A/group_1, values: {order: null}}]}`:
  the entry is deleted instead of repeating the members;
- on `group_number_types` (members `page`, `performance`, `score`,
  displayed `score`, `page`, `performance`), `[score, page, performance]`
  gives `null`, `[page, performance, score]` `{order: null}`, and
  `[performance, score, page]` `{order: [performance, score, page]}`.
  Applied, the manifest's `graphical.order.group_1` is that array.

## Focus: the editor's viewport

`targetBounds(node, target, metrics)` is the canvas rectangle an editor
centres. Nodes are `project`'s. On `mixed` at (40, 80), scale 1: the block
`A` gives `{x: 40, y: 80, width: 580.484619140625, height: 491.62890625}`;
the frame `A/group_1` `{x: 48, y: 108.8046875, width: 562.484619140625,
height: 169.234375}`; `A/annotations` its card, `{x: 48, y: 80 +
409.7734375 = 489.7734375, width: 562.484619140625, height:
71.85546875}` (the items share one horizontal layout, section "Fixture
facts"); the child `A/dlt_1`, which has no card, the rectangle around its
drawn elements, its line and its name: x from 24 to 326.29150390625, y
from 334.89453125 to 347.69921875 (its name, which reaches further up and
down than its line, its start dot and its diamond), so `{x: 64, y:
414.89453125, width: 302.29150390625, height: 12.8046875}`. At scale 2
the frame is `{x: 40 + 2 × 8 = 56, y: 80 + 2 × 28.8046875 = 137.609375,
width: 1124.96923828125, height: 338.46875}`. A target outside the
node's block throws `RangeError`.

`focusViewport(bounds, pane, drawerWidth)` centres `bounds` in the pane
less the drawer, with 10 % free on each side (`FOCUS_MARGIN`), the zoom
clamped to `[0.05, 4]`; Svelte Flow shows a canvas point `p` at `p × zoom
+ (x, y)`. With the pane 1200 × 800 and a drawer 400 wide the area is 800
× 800, of which 640 × 640 is filled:

| bounds | viewport |
|---|---|
| `{x: 100, y: 50, width: 320, height: 160}` | `{x: −120, y: 140, zoom: 2}` (`min(640/320, 640/160)`; `400 − 260 × 2`, `400 − 130 × 2`) |
| `{x: 100, y: 50, width: 10, height: 10}` | `{x: −20, y: 180, zoom: 4}` (64 clamped) |
| `{x: 100, y: 50, width: 100000, height: 100}` | `{x: −2105, y: 395, zoom: 0.05}` (0.0064 clamped) |

With no drawer, the pane 1000 × 500 and `{x: 0, y: 0, width: 400, height:
100}`: `{x: 100, y: 150, zoom: 2}`. `FOCUS_DURATION` is 1000.

## Marquee inside an editor

`elementsInRect(node, rect, inside, metrics)` selects elements, never
boxes, and only inside the edited element. An element's bounds are the
rectangle of the coordinates its drawing states, a text's from its
measured width and the font's ascent and descent (`elementBounds`); an
address drawn more than once is taken only when every drawing of it lies
in the rectangle. On `mixed` with a region `region_1` (`A`, 0 to 10
samples) added to `dlt_1` (so addressed `recording/region_1`), at (40,
80), scale 1:

- The rectangle of `score/card` on the canvas (`{x: 56, y: 133.609375,
  width: 546.484619140625, height: 78.953125}`) with every address inside
  gives, in drawing order (drawing.md section 7.2: maps, jumps, the line,
  wedges, names, wedge labels, jump labels), `A/score/cmap_1`,
  `A/score/cmap_2`, `A/score/jump_1`, `A/score`, `A/score/start`,
  `A/score/end`, `A/score/name`, `A/score/start/label`,
  `A/score/end/label`, `A/score/jump_1/label`: the maps above the line
  and the jump and its label below it, everything drawn on the card, but
  not the card.
- The region `region_1` lies in the region band below `excerpt`'s line
  (section 6.4: the regions of every timeline of a member drawing share its
  root's bands), which starts at `26.9765625 + B = 30.9765625` and is one
  row, `pr − 4 = 18.4765625`, wide; so `excerpt`'s card is `70.4765625 +
  49.453125 + 8 = 127.9296875` high (section "Fixture facts", `mixed`),
  from y 288.3203125 to 416.25, its line at 358.796875. `{x: 40, y: 410,
  width: 600, height: 86.25}` (drawing y 330 to 416.25, the bottom of
  `excerpt`'s card) gives `A/recording/cmap_2`, `A/recording/region_1`,
  `A/excerpt`, `A/dlt_1`, `A/dlt_1/name`, `A/excerpt/name`,
  `A/recording/region_1/label`: `excerpt`'s map, the region and its label
  (y 389.7734375 to 408.25), the two lines and their names. `excerpt/start`,
  `excerpt/end` and their labels are drawn twice, on the ancestor line
  above (its wedges y 308.796875 to 321.796875) as well, and are left
  out; the ancestor line `recording` (y `358.796875 − 35.5 =
  323.296875`) and its name (down to 328.53515625) lie above the
  rectangle, whose top lies above `dlt_1`'s name (from 334.89453125).
- The same rectangle with the timeline editor's `inside` of `dlt_1`
  gives `A/recording/region_1`, `A/dlt_1`, `A/dlt_1/name`,
  `A/recording/region_1/label`: `dlt_1`'s region lies inside it,
  `excerpt`'s map `recording/cmap_2` does not; with the group editor's of
  `group_1` nothing.

## Gesture commands are accepted (fast-check)

For any view built by adding 1–5 blocks from the fixtures `bare`, `nested`,
`flow_control`, `with_region`, `map` and `bundles/bundle_mixed` (frames, the
cards of a root member and of a child member, an ungrouped card), any
sequence of moves (arbitrary finite doubles), nudges, z-order actions,
resizes (any mode, a valid handle for it, any delta in ±1000), resizes of
a frame or card on the arranger (any of the drawing's items and members'
cards, any mode, a valid handle of `itemHandlesFor` for it, so vertical
and corner stretches included, any delta in ±1000, the command
`itemResizeCommand` builds from the places `itemResizeValues` gives),
stated box requests (a `set` of any item's or member card's `width` and
`height`, each absent or any multiple of 1/2048 in [1, 2000], so later
stretches meet requests above, at and below their content) and removals
produces commands that `apply` accepts.

A member's horizontal Stretch at any level but the group editor: for
`bundle_mixed` at (40, 80) with any stated width of the group and of one
of its members' cards (each none, or any multiple of 1/2048 in [1, 2000]),
any member's card of either group (`score`, `performance`, `page`,
`excerpt`), any level among the arranger, the bundle editor and the
member's own timeline editor, and any delta in ±1000 from the right
handle, `itemResizeValues` sets only the group's place and its members'
cards' places, the group's with `length` and at most `width`, each card's
with `width` alone; a group or card width that was not stated stays not
stated; and its `itemResizeCommand`, dispatched to a store with that
level's editor open, is accepted.

**A stretch follows the pointer, and a stretch back returns.** For
`bare`, `nested` and `bundle_mixed` at (40, 80), the block, any of its
items (a frame or the ungrouped card) or any member's card (whose
horizontal stretch is its group's length, and whose extent is the card's
own), with its width and height requests each absent or the multiple of
1/2048 at or just above any ratio in [1, 3] of its drawn size, stretched
from the right handle by any travel in [−200, 400] (or from the bottom
handle by any travel in [−8, 200]), and each stretch applied:

- (a) **Monotone.** From the same view, two travels `d1 ≤ d2` give
  lengths (spacings) `value(d1) ≤ value(d2)` (`toBeLessThanOrEqual`):
  a shorter pointer never finds a longer length. This is the sentence
  that rules out the shortening lock directly: were a member card's
  stated width to stay as stated, it would pin its frame, the box would
  stay flat below it, and a pointer shortened past that knee would stop
  there instead of shortening the group.
- (b) **Back.** After a first stretch by `d`, a second stretch from the
  same handle that brings the pointer back to where the first began (its
  travel is the original edge less the edge drawn after the first
  stretch) gives `value(twice) ≤ value(once)` when `d > 0` and
  `value(twice) ≥ value(once)` when `d < 0`: the way back never moves
  further away.
- (c) **Exact restoration.** When the box states no request, the
  stretch back gives exactly the original length (spacing), `toBe`.
  With a request, each request is quantized to the lattice twice on the
  way, so the box drawn at the original length may differ from the
  original edge by less than a step; (a) and (b) hold there exactly,
  and no closeness bound is asserted.

Markers are not drawn, so a click never selects one. Core rightly refuses
removing a marker that a jump targets (`schema_violation`). `removeCommand`
does not repeat core's integrity checks: such a refusal comes back from the
store's `dispatch`.

## Undo through the store (fast-check)

The same arbitrary gestures, dispatched to a `createStore`, and then undone
one by one, restore every block's `x`, `y`, `index`, `scale`, `length`,
`spacing`, `width` and `height` exactly at each step (`toBe`, compared
against the views recorded before each dispatch), and its `places`, the
frames' and cards' placement (`toStrictEqual`).

## The drawing properties' timeout

Every property of `properties.test.ts` but `affectedBy`'s draws boxes in
its runs: the two gesture properties, a member's Stretch (which draws
`bundle_mixed` in each of its 60 runs), the three stretch properties and
the projection property (section `project`). Each runs its whole sample
in one test.
Measured alone, five times one after the other through a lock that kept
other test runs out, with other work loading the machine to load averages
of 14 to 22 on 12 cores, the slowest runs took 2.1 s (gestures accepted),
3.2 s (undo), 6.6 s (a member's Stretch), 11.5 s (monotone), 13.2 s
(back), 4.6 s (exact restoration) and 1.2 s (projection): a member's
Stretch exceeds Vitest's default 5 s even alone, and a whole-project run
slows every one of them further. Each therefore carries the explicit
timeout `DRAWING_TIMEOUT` of 40 s, about three times the slowest
measurement. The samples are kept whole: smaller ones would reach fewer
of the boxes and levels. `affectedBy`'s property draws nothing (at most
1.7 s in the same runs) and keeps the default.

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
running editor, not here, except how the canvas opens, follows and leaves
editors (section "The canvas in an editor"). One property is cheap to prove in a DOM and would
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
   address). Inside the `<svg>` exactly `rect score/card` carries
   `data-contains-selection` (the region is drawn on that card, section
   "Boxes: selection and hover"), and so does the node's `div`; two marks
   are drawn after the drawing's elements, `data-box` `block` then `card`,
   and the element tree without the marks and with `data-selected` and
   `data-contains-selection` left out still equals `figure.svg`'s.
   Without a selection, no element carries either attribute and no mark
   is drawn.
   An element that goes with a selected one on Delete is marked apart:
   with `selectedElements = {"clt_3"}` and `affectedElements = {"clt_2"}`
   on `nested`, the elements carrying `data-affected` are exactly the three
   descriptors addressed `clt_2` (its line, start dot and end marker), those
   carrying `data-selected` exactly those addressed `clt_3`, exactly `rect
   clt_1/card` (the root's card, on which `clt_3` is drawn) carries
   `data-contains-selection`, and the tree without the marks and with those attributes and
   `data-contains-selection` left out equals `figure.svg`'s. Without a selection
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
   elements. The ancestor line `score` is drawn on both members' cards, so
   inside the `<svg>` exactly `rect group_1`, `rect exposition/card`,
   `rect group_2` and `rect recapitulation/card` carry
   `data-contains-selection` (section "Boxes: selection and hover"), the
   tree without the marks and with `data-selected` and
   `data-contains-selection` left out equals `figure.svg`'s, and the node's
   `div` carries `data-contains-selection` too. No fixture draws a timeline
   both as a member and as an ancestor line or child of another member
   drawing; the node marks by the whole address alone, so that drawing
   follows the same rule.
   **A selected card glows on its own rectangle only.** On
   `group__group_child_member`, drawn with its drawing's elements, items
   and cards (so the node knows its boxes and what each drew),
   `selectedElements = {"recording/card"}` marks exactly one element, the
   second `rect` addressed `recording/card` (the card; the first, its
   shadow, carries the same address and is not marked, section "Boxes:
   selection and hover"); the card is drawn as
   part of its frame, so exactly `rect group_1` inside the `<svg>` carries
   `data-contains-selection`; the tree without the marks and with
   `data-selected` and `data-contains-selection` left out equals
   `figure.svg`'s, and the node's `div` carries `data-contains-selection`
   too.
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

## The canvas in an editor

`Canvas.svelte` turns gestures into store operations: a double-click, a
double tap or Enter opens an editor (`store.open`), Escape and a
double-click or double tap outside the edited element close it
(`store.done`, as the Done button does), and the view follows the store's
editing path and the canvas's size. What proves this is that each gesture
reaches the store with exactly the target `editorTargetOf` names for what
it hit (section "Editors"), that nothing else opens, that "outside" is
exactly where a press selects nothing (`selectionOf` over
`BlockNodeData.inside`, the test that also fades and prunes, section
"Boxes"), and that the viewport lands exactly where `focusViewport` puts
the edited element's `targetBounds`, again whenever the canvas changes
size, and comes back exactly to where each level was. The store, not the canvas, is read for the result
(`store.editing`, `store.entries`, `store.view`), so a test cannot pass by
the canvas merely drawing something.

`canvas-editors.test.ts` mounts the real canvas inside a real Svelte Flow
in jsdom, through `tests/CanvasHarness.svelte`, which reads the store
through `liveStore` (section "The store as Svelte state") as the editor
does, holds the bound selection and viewport and exposes them
(`current()`, `select`, `showAt`).
jsdom lays nothing out, so the harness stubs `ResizeObserver` and
`matchMedia`; the `matchMedia` stub matches the reduced-motion query, so
every move of the view takes 0 ms and lands before the next assertion. The
`ResizeObserver` stub records each observer with the elements it observes
(kept across cases: Svelte observes element sizes through one observer
made once per module), so a case can measure the arranger anew
(`clientWidth`, `clientHeight`) and report the change to the observer
watching it, as a browser does when the drawer opens or closes. Events are
dispatched on the drawn elements the block node renders (`rect group_1`
is the `rect` whose `data-address` is `group_1`; a card is the last `rect`
carrying `<T>/card`, its shadow the first), on the block's background (its
first `rect`, which carries no address) and on Svelte Flow's pane. View:
A holds `mixed` at (40, 80) (section "Fixture facts"), B holds `bare` at
(1000, 0); an editor is opened through `store.open` unless the case opens
it by a gesture.

1. **A double-click opens the editor of the box hit.** One `dblclick` on
   the arranger opens, as `store.editing`'s `{target, kind}`: on A's
   background `{A, bundle}`, on `rect group_1` `{A/group_1, group}`, on
   `rect score/card` `{A/score, timeline}`, on `line dlt_1` (a child's
   line) `{A/dlt_1, timeline}`; on the pane nothing (`store.editing` stays
   empty). In A's bundle editor, a `dblclick` on A's background (the
   edited element) leaves the path at `[A]`. In `A/group_1`'s group
   editor, `rect group_1` (itself) leaves it at `[A/group_1]`, and
   `rect score/card` opens on top: `[A/group_1, A/score]` (a double-click
   outside closes, case 12). Svelte Flow's
   double-click zoom is off, so no double-click moves the view: after the
   pane's, the viewport is as before.
   **Text opens the box holding it.** A's `<svg>` is measured at client
   (0, 0) with the drawing's own width and height (its `viewBox`), so a
   client point is a drawing point. A `dblclick` on `text score/name` at
   its own `x`, `y` (its anchor on the baseline, inside `score`'s card)
   opens `{A/score, timeline}`, one on `text group_1/name` at its `x`, `y`
   opens `{A/group_1, group}`, and one on the title `text name` at its
   `x`, `y` (in no card or frame) opens nothing.
2. **Enter opens the editor of the single selected address.** With the
   focus on the canvas, Enter with the selection `{A/group_1}` opens
   `{A/group_1, group}`, with `{A/score/card}` `{A/score, timeline}`, with
   `{A}` `{A, bundle}`. With `{A/score/start}` (a boundary, no box and no
   timeline), with `{A/group_1, A/group_2}` (two addresses) and, inside
   `A/group_1`'s group editor, with `{A/group_1}` (the edited element),
   nothing opens.
3. **Two taps open an editor.** A tap is a touch (`pointerType` `touch`)
   pressed and released at one point; each tap's `timeStamp` is set on its
   event. Taps on `rect group_1` at (100, 100) at 1000 ms and at (105, 105)
   at 1250 ms (7.07 px apart) open `{A/group_1, group}`. Nothing opens for
   taps 301 ms apart at one point (1000 ms and 1301 ms), for taps 11 px
   apart ((100, 100) and (111, 100), 100 ms apart), for a tap on
   `rect group_1` followed within both bounds by a tap on `rect group_2`
   (another target), or for two mouse presses (`pointerType` `mouse`)
   within both bounds.
4. **Escape aborts the gesture, then clears the selection, then closes the
   editor.** In `A/group_1`'s group editor with the selection
   `{A/group_1}` (the frame, an item, so the resize toolbar shows its box
   handles), a press on `handle-right` and a move of 20 px start a resize.
   The first Escape ends it: no command (`store.entries` stays empty), the
   selection and the path unchanged. The second clears the selection, the
   path unchanged; the third closes the editor (`store.editing` empty).
   **The same order for a drag inside a drawing.** The canvas's key
   listener on the window was added before any drag's, so it hears Escape
   first and must end the drag itself. In `A`'s bundle editor with the
   selection `{A/group_2}`, the node's `<svg>` given the identity screen
   CTM (jsdom has none, and a drag starts only on a drawn `<svg>`), a press
   on `rect group_2` at (100, 200) and a move to (140, 224) start an item
   drag. The first Escape on the arranger ends it: the selection still
   `{A/group_2}`, the path still the bundle editor; after the release
   `store.entries` is empty and A's places `{}`. The second Escape clears
   the selection, the third closes the editor.
5. **The view moves to the edited element and back.** The viewport is set
   to `{x: 12, y: −34, zoom: 0.5}` and the canvas measured 10000 × 10000
   px (the area left of the drawer). A `dblclick` on `rect group_1` opens
   its group editor and the viewport becomes `{x: 3683.03076171875, y:
   4226.3125, zoom: 4}`: `group_1`'s frame is `{x: 48, y: 108.8046875,
   width: 562.484619140625, height: 169.234375}` (section "Focus"), the
   fitting zoom `8000 / 562.484619140625` is clamped to 4, and `x = 5000 −
   (48 + 281.2423095703125) × 4`, `y = 5000 − (108.8046875 + 84.6171875) × 4`. A
   `dblclick` on `rect score/card` then opens `A/score`'s timeline editor:
   its card is `{x: 56, y: 133.609375, width: 546.484619140625, height:
   78.953125}` (its centre at the frame's x, `56 + 273.2423095703125`) (section "Marquee inside an editor"), so `{x: 3683.03076171875,
   y: 4307.65625, zoom: 4}` (`5000 − (133.609375 + 39.4765625) × 4`).
   Escape (nothing selected) closes it and the viewport is again `{x:
   3683.03076171875, y: 4226.3125, zoom: 4}`; Escape again closes the group
   editor and it is `{x: 12, y: −34, zoom: 0.5}`. Each value is exact
   (`toEqual`). The 1000 ms move without reduced motion is seen in the
   browser.
6. **Outside the edited element nothing is selectable or draggable, and a
   press changes nothing; the empty pane clears.** On the arranger both
   nodes carry Svelte Flow's `selectable` and `draggable` classes. In A's
   bundle editor, B's node carries `tilie-outside` and neither class, and
   A's node `selectable` but not `draggable`. With the viewport at `{x:
   100, y: 100, zoom: 1}` (client = canvas + 100) and the selection
   `{A/group_1}`: a click on B's background leaves it `{A/group_1}`; a
   click on the pane at client (1110, 110), the canvas point (1010, 10)
   that B's box holds (B lies at (1000, 0)), also leaves it: in a browser
   a click on a faded block reaches the pane, since the block takes no
   pointer, and it changes nothing. A click on the pane at client (50,
   50), the canvas point (−50, −50) in no block's box, clears it to `{}`,
   as on the arranger. In `A/group_1`'s group editor, a click on
   `rect group_2` (outside) leaves the selection unchanged, and a click
   on `rect score/card` (inside) selects `{A/score/card}`. That a drag
   outside pans, and that the outside is drawn at opacity 0.3 without
   taking the pointer, needs a browser.
7. **The marquee selects elements inside the editor.** The view of section
   "Marquee inside an editor" (`mixed` with `region_1` added to `dlt_1`).
   Once the editor is open, the viewport is set to `{x: 100, y: 100, zoom:
   1}` and the pane measured 1000 × 1000 px, so the marquee lies outside
   Svelte Flow's 40 px edge band and nothing pans while it is drawn. With
   Shift held, a marquee on the pane between the canvas points (40, 410)
   and (640, 496.25) (client (140, 510) and (740, 596.25)) selects, in
   `A/dlt_1`'s timeline editor, exactly `[A/recording/region_1, A/dlt_1,
   A/dlt_1/name, A/recording/region_1/label]` (in that order): the
   rectangle of section "Marquee inside an editor", where `excerpt`'s map
   `recording/cmap_2` also lies, outside `dlt_1`. In `A/group_1`'s group
   editor it selects nothing (the selection becomes empty). The
   rectangle's first corner is the canvas point under the press when it
   was pressed, so a pan during the marquee does not move it.
8. **A refusal reaches the status line.** In `A/group_1`'s group editor
   with the selection `{A/annotations}`, Delete is refused by the store:
   the status line (`data-testid="hint"`) reads exactly the message of the
   refusal the same `remove` gets from a store in the same state, whose
   code is `side_effect`, and `store.view` is the view before.
9. **The resize toolbar offers what the level allows** (`RESIZING`, section
   "Editors"), read as the mode buttons shown: Scale, Box and Stretch on
   the arranger with `{A}`, `{A/group_2}` (a frame), `{A/score/card}` (a
   member's card) and `{A/annotations/card}` (an ungrouped card), none with
   `{A/score}` (a line, no box); in A's bundle editor the three with `{A}`
   (the edited block itself), `{A/group_2}` and `{A/score/card}`; in
   `A/group_1`'s group editor the three with `{A/group_1}` (the edited
   frame) and `{A/score/card}`; in `A/annotations`'s timeline editor the
   three with `{A/annotations/card}`; in `A/score`'s the three with
   `{A/score/card}` (a member's own card); in `A/recording`'s none with
   `{A/excerpt/card}` (a member's card inside the edited root, but not its
   own box); in `A/dlt_1`'s none with `{A/dlt_1}` (a child has no box).
10. **Opening an editor prunes the selection to what lies inside it**, so
    no gesture is offered that the store would refuse. Each editor is
    opened through `store.open` with the selection given, and the kept
    selection is exact and in its order: opening A's bundle editor with
    `{A, B, A/group_1, A/annotations/card}` keeps `{A, A/group_1,
    A/annotations/card}` (another block goes; the bundle editor keeps its
    block); opening `A/group_1` with `{A, A/group_1, A/score/card,
    A/performance, A/page/card}` keeps `{A/score/card, A/performance}`
    (the block, the edited frame itself and `group_2`'s member go);
    opening `A/score` on top with `{A/score/card, A/score/start,
    A/performance}` keeps `{A/score/start}` (the edited timeline's own
    card goes, as does a sibling); opening `A/score` from the arranger
    with `{A/score, A/score/name}` keeps `{A/score/name}`.
11. **A level opened while the view is still moving returns to where that
    move was heading.** Here the `matchMedia` stub matches no query, so
    every move of the view takes `FOCUS_DURATION` (1000 ms) of real time.
    As in case 5, the viewport is set to `{x: 12, y: −34, zoom: 0.5}` and
    the canvas measured 10000 × 10000 px. A `dblclick` on `rect group_1`
    starts the move to `{x: 3683.03076171875, y: 4226.3125, zoom: 4}`; while
    it is under way (the next task), a `dblclick` on `rect score/card`
    opens `A/score` on top. After 1100 ms the view is at `A/score`'s
    `{x: 3683.03076171875, y: 4307.65625, zoom: 4}`; Escape closes it, and
    1100 ms later the view is exactly `{x: 3683.03076171875, y: 4226.3125,
    zoom: 4}`, the group editor's place, not a point the first move was
    passing when `A/score` opened. Svelte Flow ends a move on its exact
    target (d3-zoom sets the end transform at the end), so `toEqual`
    holds.
12. **A double-click outside the edited element is Done.** Outside is
    where a press selects nothing: the pane, another block (whose node
    takes no pointer in a browser, so the press reaches the pane; in jsdom
    the event is dispatched on its background, where `selectionOf` gives
    `null`), and, in a group or timeline editor, the rest of the edited
    block (a faded element takes no pointer, so in a browser the press
    reaches the block's background; in jsdom it is dispatched on the
    element or on the background, both giving `null`). Each `dblclick`
    closes exactly the innermost editor, read as `store.editing`: in A's
    bundle editor one on the pane gives `[]`; with A's bundle editor and
    `A/group_1`'s group editor open, one on B's background gives `[A]`
    and a second one `[]`; in `A/group_1`'s group editor opened from the
    arranger, one on `rect page/card` (`group_2`'s member, faded) gives
    `[]`, and again opened, one on A's background gives `[]`. No session
    held a command, so `store.journal` stays `[]` (Done stores a session
    only with entries). Inside nothing changes: in `A/group_1`'s group
    editor a `dblclick` on `rect group_1` (the edited element) leaves
    `[A/group_1]`, and one on `rect performance/card` (a member) opens
    `[A/group_1, A/performance]`. The view returns as Done's does: with
    the viewport `{x: 12, y: −34, zoom: 0.5}` and the canvas measured
    10000 × 10000 px, a `dblclick` on `rect group_1` moves it to case 5's
    `{x: 3683.03076171875, y: 4226.3125, zoom: 4}`, and a `dblclick` on the
    pane closes the editor and gives back exactly `{x: 12, y: −34, zoom:
    0.5}`. **Two taps outside close the innermost editor, once.** With
    A's bundle editor and `A/group_1`'s group editor open, taps on the
    pane at (50, 50) at 1000 ms and at (55, 55) at 1250 ms give `[A]`; a
    `dblclick` on the pane right after (the double-click a browser may
    derive from a double tap; the last press was a touch) leaves `[A]`;
    taps at (50, 50) 301 ms apart (2000 ms, 2301 ms) leave `[A]`. **On
    the arranger** (no editor) a `dblclick` on the pane with the selection
    `{A/group_1}` opens nothing and changes no journal.
13. **The canvas recentres the edited element when its size changes.**
    As in case 5, the viewport `{x: 12, y: −34, zoom: 0.5}`, the canvas
    10000 × 10000 px, and a `dblclick` on `rect group_1` gives `{x:
    3683.03076171875, y: 4226.3125, zoom: 4}`. The canvas measured 6000 ×
    10000 px and its size reported (the drawer opening beside it) gives
    `{x: 1683.03076171875, y: 4226.3125, zoom: 4}`: the zoom stays clamped
    at 4 (`4800 / 562.484619140625` is larger), `x = 3000 − 329.2423095703125 ×
    4`,
    `y` as before. The viewport then set to `{x: 5, y: 6, zoom: 1}` (a
    pan inside the editor) stays there when the same 6000 × 10000 px is
    reported again (no size change); 10000 × 10000 px reported gives `{x:
    3683.03076171875, y: 4226.3125, zoom: 4}` again. Escape closes the editor
    and the viewport is the one it was entered from, `{x: 12, y: −34,
    zoom: 0.5}`, unchanged by the recentring; 6000 × 10000 px reported
    without an editor leaves it there.
14. **The mode menu sits centred above the resized box, 10 px clear of
    its top.** The menu (the `role="toolbar"` "Resize mode" element) is
    placed by its wrapper's `transform`, `translate(<cx>px, <top>px)
    translate(-50%, -100%)`: `<cx>` the screen x of the box's top centre,
    `(x + width / 2) × zoom + vx`, `<top>` its screen y less the gap,
    `y × zoom + vy − 10` (`MENU_GAP`, Svelte Flow's `NodeToolbar`
    default), the menu then moved left by half its width and up by its
    whole height, so its bottom lies 10 px above the box. The expected box
    is read independently of the canvas: the node's position from the
    `translate` Svelte Flow gives its element, plus the frame's or card's
    rectangle in `drawingOf(block, settings, metrics)` at the block's
    scale (exact; the drawn `rect` rounds its attributes). In A's bundle
    editor at `{x: 100, y: 100, zoom: 1}` with `{A/group_2}` selected,
    `group_2`'s box is `{x: 48, y: 80 + 206.0390625 = 286.0390625, width:
    562.484619140625}` (node at (40, 80)), so `translate(429.2423095703125px,
    376.0390625px) translate(-50%, -100%)`, not the block's
    `translate(…, 170px)`. It follows the box: at `{x: −20, y: 30, zoom:
    2}` `translate(638.484619140625px, 592.078125px)`; back at zoom 1, a
    box resize by `handle-right` 60 px to the right, released, widens the
    frame to `622.48486328125` and gives `translate(459.242431640625px,
    376.0390625px)`; an item drag of `rect group_2` by (40, 24), released,
    moves it to `{x: 88, y: 310.0390625}` and gives
    `translate(499.242431640625px, 400.0390625px)`. In
    `A/annotations`'s timeline editor with `{A/annotations/card}` the card
    `{x: 48, y: 489.7734375, width: 562.484619140625}` gives
    `translate(429.2423095703125px, 579.7734375px)`. On the arranger,
    with `{A}` selected at zoom 1, the menu sits above the block's node,
    `{x: 40, y: 80}` and the drawing's width 580.484619140625 at scale 1:
    `translate(430.2423095703125px, 170px)`. Each value is compared
    exactly (`toBe`) with the formula over the box read as above.

15. **On the arranger a click selects a frame, which resizes in one
    `set`.** At `{x: 100, y: 100, zoom: 1}` with nothing open, a click on
    `rect group_1` selects `{A/group_1}` and shows the eight box handles
    (the bound mode is Box); a drag of `handle-right` by 60 px, released,
    dispatches exactly one command, accepted (`store.journal` grows by
    one, `store.entries` is that journal), the `set` of
    `[{target: A/group_1, values: {place: {width: w + 60}}}, {target:
    A/group_2, values: {place: {x, y}}}, {target: A/annotations, values:
    {place: {x, y}}}]`, `w` the frame's drawn width and each `x`, `y` the
    item's drawn place in `drawingOf(block, settings, metrics)` before the
    gesture (`w + 60` on the 1/2048 lattice: `w` is a multiple of 1/4096,
    so it is rounded as `quantize` rounds it), so no other item moves;
    `store.undo()` restores the block exactly (`toStrictEqual` the block
    before).

16. **The bundle editor resizes its own block, as the arranger does.**
    In A's bundle editor at `{x: 100, y: 100, zoom: 1}` with `{A}`
    selected (the bound mode Box), `handle-right` dragged by 60 px and
    released records one entry in the session, and the block's `width` is
    exactly its drawing's width plus 60, quantized to 1/2048 (`resize`'s
    box rule at scale 1).

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
  point. The last box holding the point is the one drawn on top: a frame
  is drawn before its cards (section 8.5), and items that overlap, as a
  free move in the bundle editor allows, are drawn in item order. On the
  view `over` of case 6, the middle of `score`'s line lies inside
  `score`'s card and inside `annotations`' card, drawn after it, and
  `within` there is `annotations/card`. A card or frame that is not
  displayed is not drawn and holds no point.

`selectionOf(hit, editing, inside)`: **a press selects what it hit.** A
card selects the card (`<block>/T/card`; its shadow carries the same
address and does the same), a frame the group (`<block>/G`), the block's
own box the block, any other element that element. `click` then applies
Shift. **Inside an editor only what lies inside the edited element is
selected**: an element when `inside` (the node's `data.inside`) holds its
element address, the block's own box on the arranger (`editing` null) and
in its own bundle editor only; anything else selects nothing (`null`). On
the arranger `inside` holds every drawn address, so every press selects
as before. On `bundle_mixed` with `inside` the group editor's of
`group_1` (section `project`) and `editing` `{target: A/group_1}`: the
card `score/card` selects `A/score/card`, the frame `group_1` selects
`A/group_1`, the line `score` `A/score`; the card `page/card`, the line
`annotations`, the title `name` and the block's own box select `null`.
With `editing` `{target: A}` and every address inside, the block's own box
selects `A`; with `{target: B}` (another block's bundle editor) it selects
`null`.

`hoverOf(hit)` is `{box, boundary}`, element addresses as the descriptors
carry them: `box` is `within` (a card or a frame; the block's own box is
never marked, since the node shows its block), `boundary` the hit's element
address when `boundary` is true, else `null`.
`showsHover(mark, address, hover, inside)` marks a descriptor only when
`inside` holds its address: with `group_1`'s `inside`, the `"card"`
descriptor `score/card` under the hover `{box: "score/card"}` is marked,
`page/card` under `{box: "page/card"}` is not, nor the frame `group_2`
under `{box: "group_2"}`; with every address inside both are.

`marksOf(drawing, descriptors)` names the descriptors that carry a box's or
a boundary's mark: `"block"` for the block's background (the first
descriptor, a `rect` with no address), `"card"` for a card's own rectangle (the last `rect`
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
   - `marksOf` names, in order, the first descriptor (the background, no
     address) `"block"`, the second descriptor `form/card` `"shadow"`, the third `form/card` `"card"`, and `b/start`, `b2/start`,
     `c/start` `"boundary"`. With the workspace statement `{select:
     {element: "card"}, set: {shadow: "none"}}` the one `rect` addressed
     `form/card`, the second descriptor, is `"card"`, after the background's
     `"block"`, and no descriptor is `"shadow"`.
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
     `(120.61962890625, 139.16015625)` (inside the frame too: the card,
     drawn after its frame, is the last drawn box there); `null` in the
     box's padding `(4, 4)` and right of
     the frame `(552, 100)`.
   - `marksOf` names, in order, the background `"block"`, `group_1`
     `"group"`, `second-half/card`
     `"shadow"` then `"card"`, `recording/card` `"shadow"` then `"card"`.
   - With the workspace statement `{select: {element: "card"}, set:
     {display: "none"}}` no card is drawn: `within` at `(120.61962890625,
     139.16015625)` is `group_1`, and `marksOf` names the background and
     `group_1` alone.
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
     event. Every descriptor is new, while every element is the one drawn
     before (the `{#each}` is keyed by address, tag and occurrence, section
     "The block node in the editors"), now showing its new descriptor: the boundary `line` addressed `b2/start` now has `stroke="#FF0000"`,
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

**The boxes holding part of the selection.** One rule marks every box: the
block's own box, a group's frame and a timeline's card each carry
`data-contains-selection` (the block on its node's `div`, a frame or card
on its own `rect`, never on a card's shadow) exactly when an element drawn
as part of the box carries a selected address, the box itself excepted.
`holdingOf(drawing, selected)` (element addresses, as the node holds
them) decides it from the drawing alone, never from where a box lies, the
manifest's tree or the form of an address. Every item and member card of
the drawing reports the range of `drawing.elements` it emitted (layout's
`range`): its own rectangle when displayed, then everything drawn as part
of it. So a card holds the elements of its member drawing (its timeline
and everything drawn with it, ancestor lines included), a frame holds its
title, its members' cards and what they hold, and the block's own box
holds every drawn element. Only a displayed card or frame holds anything:
the elements of a hidden card are held by its frame. Items that overlap,
which a free move in the bundle editor allows, change no answer. So:

- a line, a part of it and a region's label mark the card they are drawn
  in, that card's frame and the block;
- an ancestor line marks every card it is drawn in, and their frames;
- a selected card marks its frame and the block, not itself;
- a group's title marks its frame; a selected group marks only the block;
- the manifest's title marks only the block;
- an address that is not drawn marks nothing.

`showsContainedSelection(mark, address, holding)` is true for a card's or
a frame's own `rect` whose address is among the holding boxes. The node
draws each mark as a `rect.tilie-holding` after the drawing's elements,
with its box's `x`, `y`, `width`, `height` and `rx` and `data-box` the
box's mark (`marksOf`): `block` (a copy of the background) when the block
holds part of the selection, and `group` or `card` for a holding frame or
card that is not selected, a selected box keeping the selection's glow
instead. The canvas's stylesheet draws the marks in the selection's colour
`#0a84ff`, thinner outward: a card 3 px dashed, a frame 2 px dashed (both
dashes of 6 and gaps of 4), the block 1 px dotted (dots of 1, gaps of 2,
with crisp edges, since it lies on the node's edge), all in screen pixels
at any block scale and any zoom; this is proven end to end.

6. **`boxes.test.ts`, the boxes' marks.** On `bundles/bundle_mixed`
   (groups `group_1`, members `performance` and `score`, drawn in the order
   `score`, `performance`, and `group_2`, members `excerpt`, a child of the
   root `recording`, and `page`, drawn `page`, `excerpt`; the root
   `annotations` drawn outside every frame), extended through two `add`s:
   the child `dlt_1` (`samples`, offset 0, length 100) into `excerpt`, and
   the region `region_1` (name `A`, start 0, end 10) into `dlt_1`,
   addressed `recording/region_1` (a region is addressed by its root).
   `recording` is drawn only as the ancestor line on `excerpt`'s card.
   `BlockNode.svelte` is mounted with the selection as `selectedElements`;
   the expected value is every element inside the `<svg>` carrying
   `data-contains-selection`, as `<tag> <address>` in document order (the
   frames and cards are drawn `group_1`, `score/card`, `performance/card`,
   `group_2`, `page/card`, `excerpt/card`, `annotations/card`):

   | selected | marked |
   |---|---|
   | `score` (a member's line) | `rect group_1`, `rect score/card` |
   | `score/start` (a member's start) | `rect group_1`, `rect score/card` |
   | `dlt_1` (a child's line on `excerpt`'s card) | `rect group_2`, `rect excerpt/card` |
   | `recording/region_1/label` (a region's label on `dlt_1`) | `rect group_2`, `rect excerpt/card` |
   | `excerpt` (a member that is a child) | `rect group_2`, `rect excerpt/card` |
   | `recording` (the ancestor line on `excerpt`'s card) | `rect group_2`, `rect excerpt/card` |
   | `page/card` (a member's card) | `rect group_2` |
   | `group_1` (the group itself) | none |
   | `group_1/name` (the group's title) | `rect group_1` |
   | `name` (the manifest's title) | none |
   | `annotations` (a root outside every frame) | `rect annotations/card` |
   | `annotations/card` | none |
   | `score`, `page` | `rect group_1`, `rect score/card`, `rect group_2`, `rect page/card` |

   In every row the node's `div` carries `data-contains-selection`, and
   the marks drawn are one `rect.tilie-holding` for the block, then one per
   marked box in the same order, its `data-box` the box's kind (`block`,
   then `group` for a frame, `card` for a card) and its `x`, `y`, `width`,
   `height` and `rx` those of the background (the `<svg>`'s first child)
   and of each box's own `rect`. With `group_1` and `score` selected the
   frame carries both `data-selected` and `data-contains-selection` and
   `score/card` carries `data-contains-selection`, but the frame has no
   mark: `[block, card]`. With nothing selected nothing carries the
   attribute, neither the node's `div`, and no mark is drawn.

   On `bundles/bundle_ungrouped` (roots `pages`, `recording` and `score`,
   no group, so every card lies on the block's own box), `recording` marks
   exactly `rect recording/card`, and the boundary `page_2/start` drawn on
   `pages`'s line exactly `rect pages/card`; the `div` carries the
   attribute both times.

   **A hidden box holds nothing.** On `mixed` with one workspace
   statement hiding every box of a kind (`{select: {element: card}, set:
   {display: none}}` or `{select: {element: group}, set: {display:
   none}}`), the hidden boxes are not drawn while what they hold still is,
   their ranges kept (layout's README, "Hidden cards and frames"). With
   the cards hidden, `score`'s line is drawn as part of `group_1`'s frame
   and of no displayed card, so it marks the frame alone. With the frames
   hidden, it is drawn as part of `score`'s card, which it marks alone,
   and the title `group_1/name`, still drawn as part of the hidden frame,
   is drawn as part of no displayed box and marks only the block. The
   `<svg>` cannot show a mark on a box it does not draw, so each row also
   asserts `holdingOf(drawing, selected)` itself, where a hidden box would
   still appear:

   | hidden | selected | marked | `holdingOf` |
   |---|---|---|---|
   | cards | `score` | `rect group_1` | block, `{group_1}` |
   | frames | `score` | `rect score/card` | block, `{score/card}` |
   | frames | `group_1/name` | none | block, `{}` |

   The node's `div` carries the attribute in every row.

   **Overlapping items change nothing.** On the view `over` of section
   "Items" (`annotations`' card moved to (8, 60), every item stating its
   place), `annotations`' card spans x 8 to 570.484619140625 and y 60 to
   131.85546875, inside `group_1`'s frame (x 8 to 570.484619140625, y
   28.8046875 to 198.0390625), and lies over `score`'s card (x 16 to
   562.484619140625, y 53.609375 to `53.609375 + 78.953125 = 132.5625`,
   section "Fixture facts"). Each card's member drawing lies inside the
   other card's rectangle. `score`'s line runs from x 126.29150390625 to
   526.29150390625, at least the padding 8 below its card's top and the
   padding and the wedges' reach `8 + 26.9765625` above its bottom, so
   between y 61.609375 and 97.5859375, inside `annotations`' card. The
   name `annotations/name` is anchored at x `8 + n = 24` on its baseline,
   within `h(11) / 2 = 6.40234375` of its line, which lies between y `60
   + 8 = 68` and `131.85546875 − 34.9765625 = 96.87890625`, so inside
   `score`'s card. The test asserts the three rectangles exactly and that
   the line's middle and the name's anchor lie inside the other card. Each
   element marks the boxes it is drawn as part of, and nothing else:

   | selected | marked |
   |---|---|
   | `annotations/name` | `rect annotations/card` |
   | `score` | `rect group_1`, `rect score/card` |
   | `annotations/card` | none |

   The node's `div` carries the attribute in every row. A rule of
   rectangles would mark `group_1` and `score/card` for the name as well,
   `annotations/card` for the line, and `group_1` for the card.

   **A copy hidden in one drawing only.** `bundle_mixed` with `recording`
   made a member of `group_1` (one `set` of the block's `manifest`: the
   fixture's manifest with `group_1`'s `members` `[performance, recording,
   score]` and display order `[score, performance, recording]`; a member
   may not nest with another member of its own group, so `recording` and
   its child `excerpt` lie in different groups). `recording` is then drawn
   on a card of its own in `group_1`'s frame, its whole tree with it: its
   child `excerpt` as a child line carrying `excerpt`'s map
   `recording/cmap_2`. `excerpt` stays a member of `group_2`, its map on
   its own line. So `recording/cmap_2` is drawn twice, a `map` on each of
   the two cards. The workspace statement `{select: {element: map,
   inside: child}, set: {display: none}}` hides the copy on `recording`'s
   card only: there the map belongs to the child line `excerpt`, its
   holder chain `block, group, timeline, child`; on `excerpt`'s card it
   belongs to the member's own line, `block, group, timeline`. With
   `recording/cmap_2` selected (the frames and cards are drawn `group_1`,
   `score/card`, `performance/card`, `recording/card`, `group_2`,
   `page/card`, `excerpt/card`, `annotations/card`):

   | statement | marked |
   |---|---|
   | none | `rect group_1`, `rect recording/card`, `rect group_2`, `rect excerpt/card` |
   | the map hidden inside a child line | `rect group_2`, `rect excerpt/card` |

   The node's `div` carries the attribute both times. A box is marked
   only for a copy it draws: a rule asking only whether the drawing draws
   a map of that address anywhere, and where the manifest's tree puts
   each one, would mark `recording/card` and `group_1` in the second row
   too.

That the client position is converted under zoom and scale, that a press on
a card or a frame selects it, that a card and its frame holding the
selection are drawn dashed and the block dotted, with those widths, and
that a selected card glows in the selection's colour even under the
pointer (the canvas's stylesheet, which jsdom does not apply) are proven
end to end by the Playwright suite.

## Drags inside a drawing, `slide`, and the resize toolbar's modes

Moving an item and reordering a group's member cards happen inside a
block's drawing, an SVG whose user units are drawing units shown at the
block's scale times the canvas zoom. What would prove these work is that
an item move's screen-pixel travel becomes exactly the travel divided by
the canvas zoom and the block's scale, read at the press, and never by the
drawing's screen CTM (an engine lays the `<svg>` out at its own layout
unit, 1/64 px in Chromium and WebKit, so the CTM's scale is off in the last
digits: measured 0.9999813045672942 for a block at scale 1 and zoom 1,
which turns a 40 px travel into 40.00074… units and, quantized, 40 +
2/2048); that a reorder reads the pointer's point through the drawing's
screen CTM of the moment (the `<svg>`'s, never the pressed element's own,
which a sliding reorder transforms); that a press stays a click until the
pointer leaves `CLICK_DISTANCE` (4 screen pixels), and that a drag ends in
exactly one command or, aborted, in none with its preview withdrawn.
jsdom draws nothing and has no CTM and no pointer capture, so the `<svg>`
below is given a `getScreenCTM` returning a fixed matrix, the pressed
element one returning another matrix that must never be read, and
pointer-capture methods recording their calls; the pointer events are
dispatched as a browser would dispatch them (bubbling from the element to
the window), and a click as a pointer's click (`detail` 1) unless a case
says otherwise. The values are chosen so every expected number is exact
in binary.

`gestures.test.ts` (jsdom), with a `rect` holding the class `card` inside
an `<svg>` in the document, the `<svg>`'s CTM `{a: 2, b: 0, c: 0, d: 2,
e: 10, f: 20}` (drawing units shown twice as large, the drawing's origin
at screen `(10, 20)`), the `rect`'s own `{a: 1, b: 0, c: 0, d: 1, e: 0,
f: −1000}` (a card sliding: read, it would change every value below),
and a click listener on the `<svg>` that records each click reaching it.
The item drags run at zoom 4 in a block of scale 1/2 unless a case says
otherwise, a drawing unit being 2 screen pixels as the CTM says, so the
values below hold whichever of the two the drag read; cases 3a and 3b
tell them apart:

1. **The marks.** Attached, the element's classes are `card nodrag nopan`;
   detached, `card` again. A press with the secondary button (`button`
   2) captures nothing and nothing follows from it.
2. **A press within the click distance is a click.** `itemDrag` with the
   place `{x: 40, y: 200}`: press at `(100, 100)`, move to `(103, 102)`
   (√13 < 4) and to `(104, 100)` (exactly 4), release there, then the
   click: no preview, no command, no dispatch, and the click reaches the
   `<svg>` (one recorded click). The press captured pointer 1 and the
   release let it go.
3. **An item drag previews, then dispatches one command.** Press at `(100,
   100)`, move to `(110, 96)`: the screen travel `(10, −4)` is `(5, −2)`
   in drawing units, so the preview is `{x: 45, y: 198}`; the same move
   again previews nothing new; a move to `(121, 100)` previews `{x: 50.5,
   y: 200}`; the release there calls `command` once with `{x: 50.5, y:
   200}`, `dispatch` once with that command, and only then the preview
   with `null`. The calls, in order: preview `{45, 198}`, preview `{50.5,
   200}`, command `{50.5, 200}`, dispatch, preview `null`. The click that
   follows does not reach the `<svg>`.
   **Quantized to `GRID_FREE`:** from the press at `(100, 100)`, a move to
   `(100.0004, 110)` is `(0.0002, 5)` in drawing units, and `40.0002` is
   `81920.4096` steps of 1/2048, so the preview is `{x: 40, y: 205}`; a move
   to `(100.0006, 110)` gives `40.0003`, `81920.6144` steps, so the preview
   is `{x: 40.00048828125, y: 205}` (81921 steps).
3a. **The travel is divided by the zoom and the scale, never by the CTM.**
   The `<svg>`'s CTM set to `{a: 0.9999813045672942, b: 0, c: 0, d:
   0.9999813045672942, e: 40, f: 72}` (the value measured in Chromium and
   WebKit), zoom 1, scale 1: press at `(100, 100)`, release at `(140,
   124)`: the calls are preview `{x: 80, y: 224}`, command `{80, 224}`,
   dispatch, preview `null` (through the CTM they would be `{x:
   80.0009765625, y: 224.00048828125}`).
3b. **The zoom and the scale are read at the press.** Zoom 1 at the press,
   scale 2.5 (a drawing unit 2.5 pixels): the zoom changed to 8 before a
   move to `(125, 110)`, the preview is `{x: 50, y: 204}` (`25 / 2.5`, `10
   / 2.5`).
4. **A command that changes nothing is not dispatched.** With `command`
   returning `null`, the same drag calls `command` once, `dispatch` never,
   and ends with the preview `null`.
5. **Escape aborts.** After the press and the move to `(110, 96)`, Escape
   pressed on the document's body: the calls are preview `{45, 198}`,
   preview `null`; `command` and `dispatch` are never called; the Escape
   is taken (its default prevented, and a keydown listener on the
   document does not receive it). The release that follows calls nothing
   and the click does not reach the `<svg>`. An Escape before the pointer
   passes the click distance is not taken: the document's listener
   receives it, and nothing is previewed.
   **A cancelled pointer aborts the same way:** after the move,
   `pointercancel` gives preview `null` and nothing else.
   **`abortDrag` aborts the same way, and says whether it did:** `false`
   before the press and after a move within the click distance (to `(103,
   102)`); after the move to `(110, 96)`, `true`, and `false` when called
   again; the calls are preview `{45, 198}`, preview `null`, the release
   calls nothing and its click does not reach the `<svg>`.
6. **A member drag previews orders, reading the CTM at every move.** With
   `order(y)` giving `[score, performance]` below `y = 50` and `[performance,
   score]` from it: press at `(30, 110)` (drawing `y = 45`), move to `(30,
   116)` (6 pixels, drawing `y = 48`): preview `[score, performance]`; to
   `(30, 122)` (`y = 51`): preview `[performance, score]`; to `(30, 130)`
   (`y = 55`): nothing new; release: `command` once with `[performance,
   score]`, `dispatch` once, preview `null`. Changing the `<svg>`'s CTM's
   `f` to 0 after the first move (the drawing panned 20 pixels up) makes
   the move to `(30, 106)` drawing `y = 53` and so previews `[performance,
   score]`: the ordinate is read through the CTM of the moment.
7. **Only the click a drag's release fires is taken.** After the item drag
   of case 3 is released, a click with `detail` 0 (a key on a button, or
   `element.click()`) reaches the `<svg>`, and the pointer's click after
   it is still taken. After another drag released with no click (a moved
   touch fires none), a click one task later (a `setTimeout` of 0
   awaited) reaches the `<svg>`. After a drag aborted by Escape with the
   pointer still down, a task passes, then the release and its click: the
   click is taken, and a click one task after that release reaches the
   `<svg>`.

`motion.test.ts` (jsdom), `slide` on a `rect` given a CTM, measured from
`from` to `to` as Svelte measures them (screen rectangles):

8. **The screen offset becomes drawing units.** CTM `{a: 2, b: 0, c: 0,
   d: 0.5, e: 100, f: 50}`, `from` at left 130, top 80, `to` at left 100,
   top 100, `{duration: 200}`: the offset `(30, −20)` is `(15, −40)` in
   drawing units; `css(0, 1)` is `transform: translate(15px, -40px);`,
   `css(1, 0)` is `transform: translate(0px, 0px);`, the duration 200, the
   delay 0. With the CTM of a quarter turn `{a: 0, b: 1, c: −1, d: 0}` the
   same offset is `(−20, −30)` (`(0·−20 − 1·−30, 1·−20 + 0·−30) = (30,
   −20)` back on screen). An element's own transform is kept in front:
   with the style `transform: translate(1px, 2px)`, `css(0, 1)` is
   `transform: translate(1px, 2px) translate(15px, -40px);`.
9. **The duration.** By default a function of the screen distance as
   `flip`'s, `√d × 120`: an offset of `(0, 16)` lasts 480. With the
   parameter `{duration: 0}` (the block node's, whenever its elements are
   not to slide, reduced motion included) the duration is 0, the movement
   the same. An element without a CTM, or with one that cannot be
   inverted (`a = b = c = d = 0`), does not animate: duration 0 and no
   `css`. `drawingMatrix` of the `rect` is its `<svg>`'s CTM, and of an
   `<svg>` its own.

**The resize toolbar's modes** (`resizeModes(level, kind)` in
`gestures.test.ts`), read from `RESIZING`: all three, Scale, Box and
Stretch, for every kind at every level where it resizes, and none
elsewhere, checked for all 4 × 4 pairs:

| level | block | frame | card | member |
|---|---|---|---|---|
| `arranger` | all | all | all | all |
| `bundle` | all | all | all | all |
| `group` | none | all | none | all |
| `timeline` | none | none | all | all |

**The toolbar renders exactly those modes, with the handles of each box**
(`resize-toolbar.test.ts`, jsdom): `ResizeToolbar.svelte` is mounted by
`ToolbarHarness.svelte` inside a Svelte Flow canvas of one node, the block
`A` holding `bundles/bundle_mixed` (Svelte Flow's `ResizeObserver` and
`matchMedia` stubbed, which jsdom lacks). Read are the mode buttons' labels
in order, the pressed and the disabled ones, the handles' names in order,
and the buttons' titles. The handles are `handlesFor`'s for a block and
`itemHandlesFor`'s for an item, so a frame and an ungrouped card offer a
block's (the corners to scale, all eight to size the box or stretch it,
in the group editor every stretch handle but the left edge and the left
corners, the frame not growing along time there), and a member's card,
whose top left corner its frame decides, offers its bottom right corner
to scale and its right, bottom right and bottom handles to size its box
or stretch it:

| level | subject | bound mode | buttons | pressed | handles |
|---|---|---|---|---|---|
| `arranger` | the block | stretch | Scale, Box, Stretch | Stretch | all eight |
| `arranger` | the block | scale | (the same) | Scale | the four corners |
| `arranger`, locked | the block | box | the three, all disabled | Box | none |
| `arranger` | frame `group_1` | scale | Scale, Box, Stretch | Scale | the four corners |
| `bundle` | the block (the edited one) | box | Scale, Box, Stretch | Box | all eight |
| `bundle` | card `annotations` | stretch | Scale, Box, Stretch | Stretch | all eight |
| `group` | frame `group_1` | box / stretch | Scale, Box, Stretch | | all eight / top, top-right, right, bottom-right, bottom |
| `group` | member card `performance` | scale / box / stretch | Scale, Box, Stretch | | bottom-right / right, bottom-right, bottom / right, bottom-right, bottom |
| `timeline` | card `annotations` | box | Scale, Box, Stretch | Box | all eight |
| `timeline` | member card `score` | stretch | Scale, Box, Stretch | Stretch | right, bottom-right, bottom |
| `group` | the block | box | none | | none |
| `timeline` | frame `group_1` | box | none | | none |

The titles say what each mode does: for a frame (and an ungrouped card)
"Scale: scale everything, proportions kept (1)", "Box: resize the box,
the content stays (2)", "Stretch: stretch lengths and distances (3)", as
for a block; for a member's card the Scale and Stretch titles name the
whole group, "Scale: scale the whole group (1)" and "Stretch: stretch
every member's length, this card's distances (3)".

The values of an item resize are `itemResizeValues`'s and its command
`itemResizeCommand`'s (their own sections); a drag on a handle, which
travels through Svelte Flow's viewport, is left to the Playwright suite.

## The block node in the editors

`BlockNode.svelte` applies what the modules above compute: it fades what
lies outside the edited element, keys its elements so that a reorder moves
them, and attaches the item and member drags. What would prove this is that
the right elements carry the marks and the attachments, that the same
element survives a reorder, and that a drag simulated on a mounted node
ends in exactly the calls the editor's command functions predict, with
nothing but those calls reaching the canvas. The canvas's side of an edit
is the `NodeActions` context (`nodeActions.ts`: `dispatch`, `select`,
`preview`, `metrics`, `view`, `reducedMotion`), which the canvas sets. Here
`NodeHarness.svelte` sets it, with actions that record every call, and
mounts the node. The other component tests mount the node through the same
harness with actions that do nothing.

`block-node.test.ts` (jsdom). View: A holds `bundle_mixed` at (40, 80) and B
holds `bare` at (2000, 0). Each node's data is `project`'s for that view
with the given editor and selection (empty unless a case names one), so
the node gets exactly what the canvas gives it.
The element order is the order of `bundle__bundle_mixed`'s `figure.svg`:
the block's background (no address), the title `name`, the frame `group_1`
and its name, the members `score` and `performance`, then the frame
`group_2` and everything drawn in it, then the card of `annotations` and
everything drawn on it. A member's elements follow drawing.md section 7.2:
the card's shadow and card (both `rect score/card`), its maps, its jumps
(each a shaft `path` and an arrowhead `polygon`), the line, start dot and
arrowhead, the start and end wedges, the name, the two wedge labels and
the jumps' labels. So `score`, with the maps `cmap_1` and `cmap_2` and the
jump `jump_1`, has 15 elements, and `performance`, with the map `cmap_1`,
11.

1. **`data-outside` marks exactly what lies outside the edited element.**
   On the arranger and in A's bundle editor, no element carries it. In the
   group editor of `A/group_1`, the elements without it are exactly the 28
   (`2 + 15 + 11`) from `rect group_1` through `text
   performance/end/label`, in document order, the members' maps and
   `score`'s jump and its label among them, and every other element
   carries it, the background included (the block's box is no part of the
   group). In the timeline editor of `A/score`, the elements without it
   are exactly `score`'s 15, its maps and its jump included. The node of
   B in A's group editor marks nothing: another block is faded as a whole,
   through its node's class `tilie-outside`.
2. **The keys survive a reorder.** In the group editor of `A/group_1`, the
   node is redrawn with the view after `reorderCommand(A, group_1,
   [performance, score])` applied. The two `rect score/card` and the two
   `rect performance/card` are the same DOM elements as before (the same
   objects), `performance`'s card now comes before `score`'s in document
   order, and the node still holds as many elements as there are
   descriptors. Two descriptors of one address and tag are told apart by
   their occurrence (`<address>#<tag>#<n>`): the shadow and the card of
   `score` remain two elements, as do `excerpt`'s two start wedges.
3. **The drags are attached exactly where an editor allows them.** Both
   attachments mark their element `nodrag nopan`. On the arranger, no
   element carries `nodrag`. In A's bundle editor exactly three do, in
   document order `rect group_1`, `rect group_2` and the second `rect
   annotations/card` (the card, not its shadow): the items. In the group
   editor of `A/group_1` exactly two, the second `rect score/card` and the
   second `rect performance/card`: the member cards, not `group_2`'s. In the
   timeline editor of `A/score`, none. The node of B in A's bundle editor
   carries none.
4. **A member drag reorders through the canvas.** In the group editor of
   `A/group_1`, the node's `<svg>` is given the identity screen CTM
   (client coordinates are drawing coordinates) and `score`'s card the
   identity too and recorded pointer capture. After the press the card's
   own CTM becomes `{a: 1, b: 0, c: 0, d: 1, e: 0, f: 60}`, as when it
   slides 60 pixels to a previewed slot; every value below is the
   `<svg>`'s reading (through the card's, the first move would read `y =
   16` and the copy's transform would be `translate(0 -54)`). On
   `bundle_mixed`'s drawing `score`'s card's middle lies at `53.609375 +
   78.953125 / 2 = 93.0859375` and `performance`'s at `140.5625 +
   49.4765625 / 2 = 165.30078125` (section "Reordering a group's
   members"). Press at (100, 70), move to (100, 76) (6 pixels, past the
   click distance; 76 lies above `performance`'s middle), move to (110, 170)
   (below it), release there. The recorded calls are, in order:
   - `select("A/score/card")`: the press that became a drag selects the card;
   - `preview("A", {manifest})` with `graphical.order` `{group_1: [score,
     performance], group_2: [page, excerpt]}`;
   - `preview("A", {manifest})` with `graphical.order` `{group_1:
     [performance, score], group_2: [page, excerpt]}`;
   - `dispatch({type: "set", changes: [{target: "A/group_1", values:
     {order: null}}]})`: `[performance, score]` is `group_1`'s `members`, so
     the entry is deleted;
   - `preview("A", null)`.

   **The dragged card follows the pointer.** After the move to (100, 76) the
   node draws one `g.tilie-dragged` with the transform `translate(0 6)`, and
   after the move to (110, 170) `translate(10 100)`: the pointer's travel in
   drawing units. It holds a copy of `score`'s 15 elements, in their order
   and without `data-address`, and the 15 elements of `score` themselves
   carry `visibility="hidden"`. After the release there is no
   `g.tilie-dragged` and no element carries `visibility`.
   A press that is released within the click distance calls nothing.
5. **An item drag moves the item through the canvas.** In A's bundle editor,
   the node's `<svg>` is given the identity CTM. `group_2` is drawn at (8,
   206.0390625) (section "Items"). Press at (100, 200), move to (132,
   193.9609375), release there: the place moves by `(32, −6.0390625)` to
   (40, 200). The calls are `select("A/group_2")`; `preview("A", {places:
   {group_2: {x: 40, y: 200}, group_1: {x: 8, y: 28.8046875}, annotations:
   {x: 8, y: 391.7734375}}})`, the places of `itemMoveCommand`'s command;
   `dispatch` with exactly that command (section "Items"); `preview("A",
   null)`. No `g.tilie-dragged` is drawn: the item is drawn where the
   preview places it. The canvas's zoom is 1 and A's scale 1.
   **The travel is read by the canvas's zoom and the block's scale.** With
   A at scale 1.25 and the canvas's `zoom()` 2 (a drawing unit 2.5 pixels;
   the `<svg>`'s identity CTM says 1), a press at (100, 200) released at
   (180, 184.90234375) dispatches exactly the command above: the travel
   `(80, −15.09765625)` is `(32, −6.0390625)` drawing units (an item's place
   is in drawing units whatever the scale).
   **Two selected items move together, the selection kept.** With
   `A/group_2` and `A/annotations/card` selected (the node's data is
   `project`'s for that selection), the same press, move and release on
   `group_2`'s frame make exactly three calls: `preview("A", {places:
   {group_2: {x: 40, y: 200}, annotations: {x: 40, y: 385.734375},
   group_1: {x: 8, y: 28.8046875}}})`, the places of `itemMoveCommand`'s
   command with `together` `[annotations]` (section "Items"); `dispatch`
   with exactly that command, one `set` for both; `preview("A", null)`. No
   `select`: the selection is left as it was.
   **A pressed item outside the selection moves alone.** With `A/group_1`
   and `A/annotations/card` selected, the same drag of `group_2` makes
   exactly the four calls of the first case, `select("A/group_2")` first.
   **One item in the selection moves alone and keeps it.** With
   `A/group_2` and `A/page` selected (the frame and a member's line it
   contains), the same drag of `group_2` makes exactly the first case's
   calls without its `select`: the single-item preview, its dispatch,
   `preview("A", null)`. The node changes the selection only through
   `select`, so after the move the selection is the one before it.
   **A frame under a card stays where it is.** On the view `over` of
   section "Items" (`annotations`' card drawn at (8, 60), over `group_1`'s
   frame), with `A/annotations/name` and `A/group_2` selected, the same
   press, move and release on `group_2`'s frame make exactly three calls:
   `preview("A", {places: {annotations: {x: 40, y: 53.9609375}, group_1:
   {x: 8, y: 28.8046875}, group_2: {x: 40, y: 200}}})`, `annotations`
   moved from (8, 60) by the travel `(32, −6.0390625)` and `group_1` as
   the block states it; `dispatch({type: "set", changes: [{target:
   "A/group_2", values: {place: {x: 40, y: 200}}}, {target:
   "A/annotations", values: {place: {x: 40, y: 53.9609375}}}]})`, with no
   change for `group_1`, which states its whole position already;
   `preview("A", null)`. No `select`. The frame underneath does not move:
   under a rule of where things are drawn, `group_1` would hold the card's
   name and travel with it to (40, 22.765625).
   **Escape withdraws the whole preview; a drag back to its start stores
   nothing.** With the two items selected, a press on `group_2`'s frame,
   a move to (132, 193.9609375) and Escape (a `keydown` on the window)
   make exactly the moved preview above and `preview("A", null)`; the
   release that follows calls nothing. A press, a move to (132,
   193.9609375), a move back to (100, 200) and the release there make
   exactly the moved preview, `preview("A", {places: {}})` (back at its
   drawn place the move gives `null`, so the block's own places, which
   state nothing, are shown) and `preview("A", null)`, and no `dispatch`.
6. **The elements slide only while a member drag previews an order.**
   Svelte's `animate:` measures every element of the keyed each on every
   redraw and animates each whose screen rectangle changed, so `slide`'s
   parameters decide. jsdom lays nothing out and has no Web Animations, so
   every element's `getBoundingClientRect` returns a rectangle further
   right on each call (every element always "moved"), every SVG element's
   `getScreenCTM` the identity, `getAnimations` an empty list, and
   `Element.prototype.animate` is a recording stub (Svelte calls it, a
   microtask after a measurement, only for an animation of non-zero
   duration). In the group editor of `A/group_1`:
   - the node redrawn with the view after `reorderCommand(A, group_1,
     [performance, score])` applied, as an edit, an undo or the
     inspector would change it: `animate` is never called;
   - a member drag on `score`'s card (as in case 4) moved to (110, 170),
     the node then redrawn with that same view, as the canvas draws the
     preview: `animate` is called exactly once for each element of the
     node's keyed each (as many as the redrawn drawing has descriptors),
     every one having "moved";
   - the same drag with `reducedMotion()` true: `animate` is never called.
   The drop's own redraw slides too (it is still part of the reorder), and
   the redraw after it does not; jsdom cannot tell those two apart from
   the preview's, so they are seen in the browser.

## The store as Svelte state

`liveStore(store)` (`liveStore.svelte.ts`) gives the store's state to the
components as Svelte state: one adapter, created once by the editor and
handed down, rather than a copy of the view or the editing path in every
component. What proves it is that each getter returns exactly the store's
own value (the same object, read when asked, so nothing is mirrored), that
an effect reading it runs again exactly once for each change of the store
and then reads the new value, and that the store is subscribed only while
something reads reactively.

`live-store.svelte.test.ts` (jsdom; the effects run inside `$effect.root`
and are flushed with `flushSync`). The store is `createStore` of `mixed`'s
view (A, section "Fixture facts") with an empty journal and no sessions;
the change is the `add` of block B holding `bare` at (1000, 0).

1. **The getters are the store's.** `live.store` is the store, and
   `view`, `editing`, `entries`, `listed`, `journal`, `sessions` and
   `changes` are each `toBe` the store's own (the store computes `entries`,
   `listed` and `journal` once per change, so two reads between changes
   give the same object), read outside any effect,
   before the change and after it (the view after it is the store's new
   view, not the first).
2. **An effect follows the store.** An effect records `[live.view,
   live.editing.length, live.changes]` on each run. Flushed once mounted
   it has run once, with `[view before, 0, 0]`; after the change and a
   flush, twice, the second `[store.view, 0, 0]`; after `store.open(A)`
   and a flush, three times, the third `[store.view, 1, 0]`; after an
   `add` of `region_1` to `A/dlt_1` inside that editor and a flush, four
   times, the fourth `[store.view, 1, 1]`. Nothing else runs it: a flush
   without a change leaves it at four.
3. **The store is subscribed only while read reactively.** The store's
   `subscribe` is wrapped to count the listeners it holds. Creating the
   adapter and reading `live.view` outside an effect holds none; two
   effects reading it in one root hold exactly one; once the root is
   destroyed and a tick has passed, none.

## The live placement of items and cards (`live-items.test.ts`)

During a gesture the canvas reports through `onlive` the placement of the
block it changes (`livePlacement`) together with the drawing the block's
node shows, so that what shows the block's items and cards (the editor's
Properties form) follows them live, as it follows the block's own fields,
without laying the block out a second time. What proves it is that during
the gesture the reported drawing is exactly the block's drawing with the
places its release then stores, the very function and values the node
draws its preview with (`drawingOf(block, settings, metrics, {places})`),
and differs from the stored drawing only in the item the gesture changes;
and that nothing is reported before the gesture previews anything and
`null` after its release.

jsdom, `Canvas.svelte` mounted directly with an `onlive` that records every
value, on a store of `mixedPlain()` (A holds `bundle_mixed` at (40, 80);
its items as in section "Items": `group_1` at (8, 28.8046875), 400 long,
562.484619140625 wide, 169.234375 high; `group_2` at (8, 206.0390625);
`annotations` at (8, 391.7734375); each width `W(L) = 162.484619140625 +
L`). The bundle editor of A is opened, the viewport set to `{x: 100, y:
100, zoom: 1}` and the pane measured 1000 × 1000 px (no auto-pan), with
reduced motion and pointer capture stubbed, so one screen pixel is one
drawing unit of A (block scale 1). The drawing's place origin is (0, 0),
so the reported `x`, `y` are the block's 40, 80.

1. **A frame's Stretch.** `A/group_1` selected, mode Stretch, the right
   handle pressed at (0, 0) and moved to (60, 0). Before the press the last
   reported value is `null` (a selection is no gesture). After the move,
   before release, the last reported placement is `{id: A, x: 40, y: 80,
   scale: 1, length: 400, spacing: 1, width: null, height: null}` (the
   block's own fields, unchanged). After release the last reported value
   is `null` and A's `places` are exactly `{group_1: {length: 460},
   group_2: {x: 8, y: 206.0390625}, annotations: {x: 8, y: 391.7734375}}`
   (60 units more width is 60 more length; the other items state their
   drawn positions, the bundle editor's rule, section "Items"). The
   placement reported before release has `drawing` `toStrictEqual` to the
   block's drawing with those stored `places`; its `group_1` item's place is
   exactly `{x: 8, y: 28.8046875, length: 460, scale: 1, spacing: 1,
   width: 622.484619140625, height: 169.234375}` (a horizontal stretch
   leaves the height), and `group_2`'s and
   `annotations`'s places equal the stored drawing's.
2. **An item drag.** `A/group_2` selected; its frame pressed at (100,
   200) and moved to (140, 224), the drawing's screen matrix the identity.
   After release the last reported value is `null` and A's `places` are
   exactly `{group_2: {x: 48, y: 230.0390625}, group_1: {x: 8, y:
   28.8046875}, annotations: {x: 8, y: 391.7734375}}` (8 + 40 and
   206.0390625 + 24, both multiples of 1/2048). The placement reported
   before release has `drawing` `toStrictEqual` to the block's drawing with
   those stored `places`, its `group_2` item at (48, 230.0390625).
