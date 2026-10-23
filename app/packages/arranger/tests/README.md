# `@timetoalign/tilie-arranger` tests

The arranger turns a workspace view into one Svelte Flow node per block,
and every completed gesture on those nodes into one workspace command.
Each section states what proves one behaviour: what a press at a point
hits, which boxes hold a selection, which command a gesture or a drop
produces, the exact values a resize stores. Tests stand at the gesture
boundary: a press, its moves and its release go in, one command comes out.

The expected values are written here before any test, derived by hand
from TimeToShare's specification (`docs/drawing.md`, cited below by
section) and the boxes of its drawing fixtures, never from running the
arranger. Layout's tests are the oracle for the drawing and core's for
what a command does: every command a test produces is applied through
core and the drawing read again. Every view is built from TimeToShare's
manifest fixtures, read from the installed `@timetoalign/timetoshare`
package, through core's commands (`add` a block, `set` a placement); no
test writes a manifest literal, and only the band records of section
"Bands" are written by hand.

Block ids are `A = "0000000000"`, `B = "0000000001"` and `C =
"0000000002"`. Block A holds `bare` at (40, 80) unless stated otherwise.
The grid is the default `{size: 8, snap: true}`.

**Addresses in this file.** An address is an object (TimeToShare's
drawing specification, section 2.2), compared as a whole object, never a
string composed from IDs: `{}` the workspace, `{block: A}` a block,
`{block: A, id: "score"}` the element with the ID `score` of block A's
manifest (a timeline's line, a group, a map, a region, a flow-control
element), `{block: A, id: "score", facet: "regions"}` a band,
`{block: A, id: "score", part: ["card"]}` every card of `score`,
`{block: A, id: "score", part: ["start", "label"]}` a part, and
`{block: A, part: ["name"]}` the manifest's title. Within one block the
`block` member is left out (`{id: "score", part: ["name"]}`, the element
address a drawing and its descriptors carry); `{}` there is the bundle,
which the block draws. Where a test needs an address's string form, as a
map key, a set member or the `data-marks` attribute of a mark, it is the
one string form `addressKey`, never written by hand.

**Place keys.** A frame or a card is told apart by where its place lies in
the block's `places`: `{item: "group_1"}` the frame of `group_1`,
`{item: "annotations"}` the card of the ungrouped root `annotations`,
`{item: "group_1", member: "score"}` the card of `score` in `group_1`'s
frame; where a table is dense, `group_1 › score` stands for `{item:
"group_1", member: "score"}` and `group_1` for `{item: "group_1"}`. A held
card is the only box a member's address does not name alone: a member of two groups has a card in each frame, both addressed
`{id: T, part: ["card"]}`, told apart by their place keys.

## Fixture facts the expected values rest on

All values are in canvas units, for the default placement (length 400,
the block's spacing 8, no box request) and the default style layer. Every
container's `spacing` is the gap between its own contents (section 8.6),
none multiplying another: the block's between its items at their default
`y` (default 8), a frame's between its cards (default 8), a card's, its
member drawing's card spacing `S`, between its rows and between its bands
(default 4).

- **Every manifest is drawn as one block** (section 8). A manifest of one
  root and no name has no title and no frame; its root is drawn in its
  card `{id: T, part: ["card"]}`. The name column starts at `xn = P + K = 16`; the card
  spans `x = P` to `R + K`, `R` the member drawing's largest right edge
  (section 6.7), and is `Hm` high from `y = P`, `Hm` the member drawing's
  height (section 6.5, its padding `P` inside the card); the card's
  shadow lies 2 to the right and 2 below. So the block is `W = R + K + 2 +
  P = R + 18` by `H = Hm + 18`, and no spacing changes its padding. A block
  of one item has no gap between items, so the block's spacing changes
  nothing drawn in it.
  A drawing fixture's page is the block plus 16 on every side (section
  7.1), so `W = PW − 32` and `H = PH − 32` of its `figure.svg`.
- **`bare`**: the root `bare`, named "Bare" at font size 11. The DejaVu Sans
  advances of B, a, r, e sum to 4762, so the name is `N = 4762 × 11 / 2048
  = 25.5771484375` wide.
  - Width (section 8.2): the line starts at `x0 = xn + N + G' =
    49.5771484375`; the rightmost element is the arrowhead's tip at `x0 + L
    + 3w` (w = 3), so `W = R + 18 = 76.5771484375 + L` and `W(400) =
    476.5771484375` (the page of `drawings/bare/figure.svg` is `PW =
    508.5771` wide). The arrowhead stays rightmost for every `L ≥ 8`, the
    end label being narrower than `2 × 9`.
  - Height (sections 6.4, 6.5, 8.4): the bare root has only its below-side
    wedges, in its markers band against its line, so it has no gap between
    bands and one row: `Hm = 8 + 6.40234375 + 26.9765625 + 8`, `H =
    67.37890625` (`PH = 99.3789`) at every spacing.
- **`nested`**: the root `clt_1`, child `clt_3`, grandchild `clt_2`, both
  rows on the above side. With `x0 = 49.91552734375` from layout's record,
  `W = 77.194580078125 + L`, so `W(400) = 477.194580078125`: the pages of
  `drawings/nested__length-200`, `-400` and `-800` are `PW = 309.1946`,
  `509.1946` and `909.1946` wide, slope 1 in `L`.
  - Height (sections 6.2, 6.4, 6.5): at its card's default spacing the
    pitch is 14 and the children band starts at 7 with two rows: `y_root =
    8 + 35`, the below side the wedge reach `1.5 + 13 + 2 + h(9) =
    26.9765625`, `H = 95.9765625` (`PH = 127.9766`). One item: the block's
    spacing changes nothing drawn.
- **`ungrouped`** is `bundle_ungrouped` at (40, 80), the title "Sketches"
  and three block-held cards at their default places, `pages` (63.453125
  high), `recording` (49.4765625) and `score` (84.4296875), all
  525.896728515625 wide in the block, `W(L) = 125.896728515625 + L`. At the
  block's spacing `s` they lie at `28.8046875`, `92.2578125 + s` and
  `(92.2578125 + s) + 49.4765625 + s`, so the block is `H(s) = 8 + ((141.734375
  + 2s) + 86.4296875)`, `236.1640625 + 2s`, affine with the slope 2 of its
  two gaps: `H(8) = 252.1640625`, `H(0) = 236.1640625`, `H(24) =
  284.1640625`. With `score` stated at `{y: 200}` (its shadow's bottom
  286.4296875) the block is `8 + max(286.4296875, 143.734375 + s)`: flat up
  to its knee `s = 142.6953125`, slope 1 beyond.
- **`flow_control`**: the root `flow:quarters` with the flow marker
  `flow_marker_1`, the jump origins `jump_from_1` and `jump_from_2` and their jump targets
  `jump_to_1` and `jump_to_2`, which are not drawn.
  **`with_region`**: the root `clt_1` with `region_1`.
- **IDs** are unique across a whole manifest, so every element is
  addressed by its own ID wherever it lies (`{id: "tempo"}`,
  `{id: "region_1"}`, `{id: "tmap_1"}`), a part by its owner's ID and its
  words (`{id: "region_1", part: ["label"]}`), the title by `{part:
  ["name"]}`. A part, a card or a label stands for the element whose ID it
  carries; core removes any element, timelines and groups included, naming
  what goes with it.
- **Manifests of several roots and groups** (section 8):
  - **`group_number_types`**: group `group_1` "Edition", roots (all three
    members, none with entries) `page`, `performance`, `score`. `numbers`
    is this file with `region_1` (2 to 4 quarters, named "A") added to
    `score` by an `add` into `{block: A, id: "score"}`.
  - **`group_child_member`**: roots `piece` ⊃ `second-half` and
    `recording`, one group whose members are `second-half` and
    `recording`, so `piece` is drawn as `second-half`'s ancestor line.
  - **`corpus_mpm`**: groups `group_1` (`score:clt_1`, `score:dlt_1`) and
    `group_2` (`perf:cpt_1`, `perf:dgt_1`, `perf:dpt_1`); the root
    `score:clt_1` carries the map `tmap_1`; a timeline without a name is
    named by its whole ID (`score:clt_1`).
  - **`bundle_shared_parent`**: `score` (0 to 32 quarters) ⊃ `exposition`
    (offset 0, 12 quarters, in `group_1` "Exposition" with `take_1`) and
    `recapitulation` (offset 20, 12 quarters, in `group_2`
    "Recapitulation" with `take_2`), then the ungrouped root `page`.
    `score` is drawn as the ancestor line of each member (section 8.3),
    four descriptors addressed `{id: "score"}` in each card: in `exposition`'s its
    line, its start dot and two chevrons at the right; in
    `recapitulation`'s its line, two chevrons at the left and its
    arrowhead. `{id: "exposition", part: ["start"]}` is drawn twice, on the ancestor line and
    on `exposition`'s own. Every item is the drawing fixture
    `bundle__bundle_shared_parent`'s 567.3901 wide, `Wf = 2324030 / 4096 =
    567.39013671875` (the only multiple of 1/4096 that rounds to it), and
    every member's card 551.3901, `Wf − 16`. Every term of the start `s0`
    and the right margin `Mr` is a constant offset from the start or the
    shared end, and no segment label is wide enough to set `s0`, so every
    width grows by exactly the length: `Wf(L) = 167.39013671875 + L` for a
    frame or the ungrouped card, `Wc(L) = 151.39013671875 + L` for a
    member's card, the block `Wb(L) = 185.39013671875 + L` (585.3901 at 400,
    the fixture's block).
  - **`bundle_shared_member`**: roots `t` (quarters), `u` (seconds) and
    `v` (pixels), groups `g1` of `t`, `u` and `g2` of `t`, `v`: `t` has a
    card in each frame, `{item: "g1", member: "t"}` and `{item: "g2",
    member: "t"}`, both addressed `{id: "t", part: ["card"]}`.
- **`bundle_mixed`** (section 8.6): groups `group_1` "Performance"
  (members `performance`, `score`, displayed `score`, `performance`) and
  `group_2` "Facsimile" (members `excerpt`, `page`, displayed `page`,
  `excerpt`; `excerpt` is a child of the root `recording`, drawn as its
  ancestor line), then the ungrouped root `annotations`. `score` carries
  the maps `cmap_1` and `cmap_2` and the jump origin `jump_from_1` "Repeat";
  `performance` the map `cmap_3`; `page` `cmap_4`; `recording` `cmap_5`;
  `excerpt` `cmap_6`; `annotations` the regions `region_1` "Verse" and
  `region_2` "Chorus". Maps lie above their lines, jumps and
  regions below (section 4). With `places` empty the block holds three items
  at their default places, `x = P = 8`, one under the other the block's
  spacing 8 apart, the first `P + h(11) + F = 28.8046875` below the title
  "Mixed" (`F = 8` the gap after the title):

  | item | place key | address | `x` | `y` | `length` | `width` | `height` |
  |---|---|---|---|---|---|---|---|
  | `group_1` | `{item: "group_1"}` | `{id: "group_1"}` | 8 | 28.8046875 | 400 | 562.484619140625 | 169.234375 |
  | `group_2` | `{item: "group_2"}` | `{id: "group_2"}` | 8 | 206.0390625 | 400 | 562.484619140625 | 177.734375 |
  | `annotations` | `{item: "annotations"}` | `{id: "annotations", part: ["card"]}` | 8 | 391.7734375 | 400 | 562.484619140625 | 71.85546875 |

  - Heights (sections 6.4, 6.5, 8.3, 8.4): the cards are `score` 78.953125
    (two maps above, its jump's flow band below the wedges), `performance`
    and `page` 49.4765625 (one map), `annotations` 71.85546875 (one row of
    regions), and `excerpt` 87.453125: its map reaches `e = 1.5 + 5 = 6.5`
    above its line, so its ancestor band starts at `max(p0 / 2, 6.5 + S) =
    10.5` and is `7 + 26.9765625` wide, `y_root = 8 + 10.5 + 33.9765625 =
    52.4765625`, and the card is `52.4765625 + 26.9765625 + 8` high. A
    frame is its title's slot `Q + h(11) + 4 = 24.8046875`, its cards its
    spacing 8 apart and `Q = 8` below them.
  - Widths: the block holds frames, so the name column starts at `n = Q + K
    = 16` in every item; `N = 70.29150390625` (`Performance`, the widest
    name); `recording`'s ancestor line runs on to the left, so `s0 = n + N
    + G' + 8 × 3 = 118.29150390625`; `Mr = 28.193115234375`, half of
    `excerpt`'s end label `132300 smp` centred on the shared end. So every
    item spans 0 to `s0 + 400 + Mr + K + Q = 562.484619140625`, and as
    neither `s0` nor `Mr` depends on a length, `W(L) = 162.484619140625 +
    L`. The held cards span `Q = 8` to `Ri + K` in item coordinates: they
    lie at x 16 and are 546.484619140625 wide, `Wc(L) = 146.484619140625 +
    L` (the cards `{item: "group_1", member: "score"}` at y 53.609375,
    `{item: "group_1", member: "performance"}` at 140.5625, `{item:
    "group_2", member: "page"}` at 230.84375 and `{item: "group_2", member:
    "excerpt"}` at 288.3203125). Every line runs from `8 + s0 =
    126.29150390625` to 526.29150390625. The block is
    `P + 562.484619140625 + 2 + P = 580.484619140625` by `391.7734375 +
    71.85546875 + 2 + P = 473.62890625` (the ungrouped card's shadow), its
    place origin at `(0, 0)`.
  - **Moved left and up:** with `annotations` placed at `{x: −30, y: −20}`
    the block reaches `−30 − P = −38` on the left and `−20 − 28.8046875` at
    the top (section 8.4: the title's slot is the items' top border), so
    the place origin lies at `(38, 48.8046875)`, and the block is `(8 +
    570.484619140625) + 38 = 616.484619140625` wide and `(8 + 206.0390625
    + 177.734375) + 48.8046875 = 440.578125` high. With `{x: −30}` alone
    the origin is `(38, 0)` in `616.484619140625 × 473.62890625`.
  - **`mixed`** is `bundle_mixed` with the child `dlt_1` (`samples`,
    offset 0, length 44100, half of `excerpt`) added to `excerpt`, drawn
    on `excerpt`'s card from x 126.29150390625 to `126.29150390625 + 400 ×
    1/2` in the children band above `excerpt`'s line (section 6.4). That
    band starts at `max(p0 / 2, 6.5 + S) = 10.5` and ends at `10.5 + 14`,
    the child's line `10.5 + 7 = 17.5` above `excerpt`'s; the ancestor
    band starts at `24.5 + S = 28.5`, so `y_root = 8 + 28.5 + 33.9765625 =
    70.4765625` and the card is 105.453125 high, 18 more. `excerpt`'s line
    lies at 358.796875 and `dlt_1`'s at 341.296875; its name `{id: "dlt_1",
    part: ["name"]}`,
    anchored at x `8 + n = 24` and 26.85009765625 wide, is centred on that
    line and spans y 334.89453125 to 347.69921875 (`h(11)` high). The child
    changes neither `N`, `s0` nor `Mr`. `mixed`'s block is `580.484619140625
    × 491.62890625`: `group_2` is 195.734375 high and `annotations` lies at
    y 409.7734375.

## Numbers on the canvas (`numbers.test.ts`)

Every stored position and size is a multiple of a step: the grid's size
when it snaps, else 1/2048, the font's units per em, so text-derived
edges at integer sizes and scales are stored bit-exact. Rounding is to
the nearest multiple, halves towards +∞, never −0:

| value | step | stored |
|---|---|---|
| 19 | 8 | 16 |
| 20 | 8 | 24 (2.5 rounds up) |
| −20 | 8 | −16 (−2.5 rounds up) |
| −0.001 | 8 | 0, not −0 |
| 19.999999999999943 | 1/2048 | 20 (the noise Svelte Flow writes) |
| 478.5771484375 | 1/64 | 478.578125 |
| 478.5771484375 | 1/2048 | 478.5771484375 (a multiple already) |
| 101.3 | 1/2048 | 101.2998046875 |

The floors of a resize are scale 1/8, length 8 and spacing 0, a gap.

## A block's drawing (`drawing.test.ts`)

The oracle is layout called directly: a block's drawing equals layout's
drawing of its manifest at its placement with the layers default,
workspace, manifest, in that order (section 1). Asked twice for one block
and one settings object it is the identical object; after a `set` of the
workspace's `graphical` it shows the statement (a block fill of
`#FFFFFF`). Overrides are never cached: drawn at length 800 `bare` is
`W(800) = 876.5771484375` wide and the block's own drawing stays the
length-400 one; `bundle_mixed` with `annotations` at `{x: −30}` has the
origin `(38, 0)`, overridden with no places `(0, 0)`.

## The projection (`project.test.ts`, `properties.test.ts`)

What proves the projection complete and stable is the exact shape of every
node and the identity of every node that did not change.

- **Exact node shape.** A holds `bare` at (40, 80); B holds `nested` at
  (0, 0), scale 2; selection `{block: A}`, `{block: B, id: "clt_3"}`. A's
  node is exactly `{id: A,
  type: "block", position: {x: 40, y: 80}, width: 476.5771484375, height:
  67.37890625, measured: {same}, handles: [], selected: true, zIndex: 0}`;
  B's is `954.38916015625 × 191.953125` (`nested`'s block doubled), not
  selected, `zIndex` 1, its selected elements `{id: "clt_3"}` (a map by
  their keys) and the keys of the elements removing them takes away,
  `{id: "clt_2"}` and `{id: "clt_2", part: ["name"]}`. A node's descriptors
  are the writers' descriptors of its drawing; what lies inside is the key
  of every drawn address but the block's background, for `bare` exactly
  the card `{id: "bare", part: ["card"]}`, the line `{id: "bare"}`, then
  its parts `start`, `end`, `name`, `start label`, `end label` (`part:
  ["start"]` … `part: ["end", "label"]`), in drawing order.
- **A node lies at its place origin** (section 8.6): `bundle_mixed` at
  (40, 80) with `annotations` at `{x: −30, y: −20}` lies at `(2,
  31.1953125)`, `616.484619140625 × 440.578125`; at scale 2 at `(−36,
  −17.609375)`, `1232.96923828125 × 881.15625`. With no places the node
  lies at the block's `x`, `y`.
- **Editors.** A holds `bundle_mixed` at (40, 80), B `bare` at (600, 0).
  In A's bundle editor A's node is not draggable and holds every drawn
  address inside; B's node is unselectable, undraggable, of class
  `tilie-outside`, nothing inside. In the group editor of `group_1`
  what lies inside is what core's containment puts inside the group, in
  drawing order: the frame `{id: "group_1"}` and its title `{id:
  "group_1", part: ["name"]}`, then each member's card and every address
  drawn on it (`score`'s card, its maps `cmap_1`, `cmap_2`, its jump
  origin, its line and parts, the jump's label; `performance`'s card, its
  map `cmap_3`, its line and parts), never the manifest's title, `group_2`
  or `annotations`; in `annotations`' timeline editor its card and every
  address drawn on it.
- **Several roots.** A block of `numbers` with `{block: A, id: "region_1",
  part: ["label"]}` selected holds the selected element `{id: "region_1",
  part: ["label"]}` and affects `{id: "region_1"}`.
- **Order and reuse.** B's index below A's projects `[B, A]`, zIndex 0 and
  1, and the view's blocks in that order, the identical array when asked
  twice. Projected again with the first result as the previous nodes, every
  node is the identical object; a `set` moving A renews A's node only; a
  selection change touching only A keeps B's node; a previous node whose
  position differs from its block (a drag Svelte Flow abandoned) is
  renewed; an equal editor (an equal target, built anew) keeps both nodes,
  another renews them.
- **The selection alone decides `selected`.** Previous nodes whose flags
  Svelte Flow flipped come back as the selection says, renewed; an
  element's address never selects its block's node.
- **The live placement** a gesture shows is the block's placement
  overridden by the previewed values, the node's drawing, and `x`, `y` the
  place origin of the node's position (`position + origin × scale`): from
  (2, 31.1953125) with origin `(38, 48.8046875)` it is `x: 40, y: 80`, and
  so at scale 2 from (−36, −17.609375). For `bare` at (104, 40) it is
  exactly `{id: A, x: 104, y: 40, scale: 1, length: 400, spacing: 8,
  margin: 0, width: null, height: null, drawing}`; the position wins over a previewed
  `x`.
- **Property.** For any accepted sequence of gesture commands, projecting
  twice returns identical nodes, one per block, each as wide as its
  drawing times its scale.

## Moving, nudging and adding blocks (`commands.test.ts`)

A move holds a node position (the block's top-left corner) and stores the
block's place origin, `position + origin × scale`, quantized to 1/2048;
snapping is decided before it (section "Snapping a moved block").

- A at `bare` (40, 80), B `nested` (0, 0): moves `(41.5771484375, 203)`
  and `(19.999999999999943, 0)` give one `set`, in the moves' order, `{x:
  41.5771484375, y: 203}` at `{block: A}` and `{x: 20, y: 0}` at `{block:
  B}`. A move that quantizes to
  the stored position, `(40.0001, 79.9999)`, is left out; no moves, or
  only such, give no command.
- On `bundle_mixed` at (40, 80) with `annotations` at `{x: −30, y: −20}`
  (node at (2, 31.1953125)), a drop at (10, 60) stores `{x: 48, y:
  108.8046875}`, at scale 2 `{x: 86, y: 157.609375}`; a drop on the node's
  own place is no command.
- **Nudges** move by grid steps and snap when the grid snaps: A (40, 80)
  by (1, 0) to 48, by (−8, 2) to (−24, 96); from (41, 80) by (1, 0) to 48;
  with the grid not snapping to 49. The node is what moves and snaps: the
  case above nudged by (1, 0) goes to node (10, 31.1953125), snaps to (8,
  32), and stores `{x: 46, y: 80.8046875}`; not snapping, `{x: 48, y:
  80}`. No ids or a zero step give no command.
- **Adding** starts the new block at the centre of what the canvas
  shows, `((width / 2 − x) / zoom, (height / 2 − y) / zoom)`, quantized
  as a move: in an empty workspace `{x: 100, y: 50, zoom: 2, width:
  1000, height: 600}` gives `(200, 128)` under the default grid (125 / 8
  = 15.625 rounds to 16), `(200, 125)` without snapping; `{x: 0, y: 0,
  zoom: 3, width: 1001, height: 1}` without snapping gives
  `(166.83349609375, 0.16650390625)`, an `add` into the workspace `{}`.
  Applied, the block carries the workspace's block defaults and an index
  above every other.
- **An added block is never placed on top of another.** Its node
  rectangle is its drawing at the block defaults, `W × H` times its
  scale, from its node position (the place origin minus `origin ×
  scale`). While that rectangle's interior meets the node rectangle of a
  root block grown by the grid size (8) on every side, its `x` moves to
  the right edge of the rightmost such block plus 8, plus `origin.x ×
  scale`, rounded up to the position step, and the test runs again; `y`
  never changes and edges that only touch do not count. The proof is the
  exact stored `x`, with the view `{x: 100, y: 50, zoom: 2, width: 1000,
  height: 600}` and `bare` imported as C. `bare`'s origin is `(8, 8)` (its
  card from `P` on both axes, no title), so a `bare` block whose place
  origin is `(x, y)` has the node rectangle `x − 8` to `x − 8 +
  476.5771484375`, `y − 8` to `y − 8 + 67.37890625`; the new block at
  `(200, 128)` spans `192` to `668.5771484375` and `120` to
  `187.37890625`.
  - A `bare` at `(200, 128)`, the centre: it grows to `184` to
    `676.5771484375`, which the new block meets, so `x = ⌈(668.5771484375
    + 8 + 8) / 8⌉ × 8 = 688` (node from 680, clear of 676.5771484375);
    the add is `(688, 128)`.
  - `bare` at `(100, 128)` and, touching it on the right, `bare` at
    `(576.5771484375, 128)` (node `568.5771484375` to `1045.154296875`):
    the new block meets both, the rightmost ends at `1045.154296875`, so
    `x = ⌈1061.154296875 / 8⌉ × 8 = 1064`: `(1064, 128)`, past both in
    one step.
  - `bare` at `(200, 128)` and `bare` at `(688, 128)` (node 680 to
    `1156.5771484375`, grown from 672): the new block first meets only
    the first, moves to 688, then meets the second and moves to `⌈(1156.5771484375
    + 16) / 8⌉ × 8 = 1176`: `(1176, 128)`.
  - A `bare` above the centre row: at `(200, 40)` its grown rectangle ends
    at `107.37890625`, above 120, and at `(200, 52.62109375)` exactly at
    120, touching: both are ignored, `(200, 128)`. At `(200, 53)` it ends
    at `120.37890625` and is met: `(688, 128)`.

## Snapping a moved block (`snap.test.ts`)

Hand-built boxes, grid `{8, true}`, tolerance 6; the moving box `{x: 101,
y: 203}` has its origin 41.5771484375 right of its left edge.

| others | result |
|---|---|
| none | `(104, 200)`, no guide |
| left edge 200, origin 260 | `(104, 200)` (all beyond 6) |
| left edge 110 | `(110, 200)`, guide at 110 (exactly 6: inclusive) |
| left edge 110.5 | `(104, 200)`, no guide |
| origin 147 | `x = 147 − 41.5771484375 = 105.4228515625`, guide at 147 |
| left edge 107; another's origin 145 | the nearer wins: `x = 103.4228515625` |
| the moving box among the others | ignored |

On a tie the first candidate wins (in the others' order, a left edge
before an origin, the moving left edge before its origin). Without
snapping, `(101.3, 203.3)` lands at `(101.2998046875, 203.2998046875)`.
`y` only ever snaps to the grid, and a guide appears exactly when an
alignment happens.

## Resizing a block (`resize.test.ts`)

The dragged edge ends under the pointer and the opposite edge stays
exactly where it was. Every value is quantized to 1/2048, never to the
grid, so a left or top handle never shifts the fixed opposite edge. A
holds `bare` at (40, 80): right edge `516.5771484375`, bottom
`147.37890625`. The scale mode offers the four corners, the box and
stretch modes all eight handles.

**Box** sets the block's request; a request at or below the content's
extent stores `null`, so the block grows with its content and no stored
value duplicates a derived one:

| handle | delta | values |
|---|---|---|
| right | (20, 0) | `{width: 496.5771484375}` |
| right | (−20, 0) | `{width: null}` |
| left | (−21, 0) | `{width: 497.5771484375, x: 19}` |
| left | (100, 0) | `{width: null, x: 40}` |
| bottom | (0, 10.5) | `{height: 77.87890625}` |
| top | (0, −16) | `{height: 83.37890625, y: 64}` |
| bottom-right | (20, 10.5) | `{width: 496.5771484375, height: 77.87890625}` |

**Scale** takes the larger of the two axis ratios, so the block always
reaches the pointer, floored at 1/8: bottom-right by `W / 2 =
238.28857421875` gives `{scale: 1.5}`; top-left by the same also `x =
516.5771484375 − 1.5 × 476.5771484375 = −198.28857421875` and `y =
46.310546875`; bottom-right by (−440, −60) the floor 0.125; an edge
handle throws.

**Stretch** stores the largest multiple of 1/2048, at least the floor,
whose block does not pass the pointer. That is well defined: the content's
width (section 6.7) is a maximum of affine terms in the length, so
non-decreasing and piecewise linear, flat while a centred end label sets
the start; the height (sections 8.4, 8.6) is a maximum of the items'
bottom edges, each affine in the block's spacing with the number of gaps
above it as its slope, so non-decreasing and piecewise linear, flat for a
block of one item and up to a knee where an item at its default `y` passes
one whose `y` is stated. **A block of one item has no gap, so its vertical
Stretch changes its `margin` instead** (section 1: a container with
exactly one content), the empty space above its item and below it: the height is
then `H(0) + 2m`, affine with slope 2 in the margin `m`, so the margin is
half the travel, floored at 0. A block of two or more items changes its
`spacing` exactly as before, and a block of none its `spacing` (drawing
alike). Vertically only the block's `spacing` or `margin` changes: every
stated `y` and `height` is kept, and neither changes the other. So the search is bracketed on the lattice (a Newton guess and its
neighbour, then bisection), evaluates each lattice value once, and
returns the value with what it measured there: on the extent `max(10,
2x)` from 8, the target 30 gives 15, the target 4 the knee 5, never the
floor; an extent that never grows leaves the start. A target below the
smallest extent stops at the knee of a flat piece, since every value
below draws the same and would be invisible state. **The block follows the
content**: a request larger than the content keeps its proportion,
`request × content′ ÷ content` (multiplied first) quantized; one at or
below draws nothing and becomes `null`; the block is the larger of content
and request, so the search stays monotone with or without a request.

| request | content | stretched | kept |
|---|---|---|---|
| 700 | 553 | 691.25 | 875 (exact) |
| 700 | 553 | 600 | 759.49365234375 |
| 700 | 553 | 553 | 700 |
| 553 or 500 | 553 | 600 | `null` |
| `null` | 553 | 600 | `null` |

`audio` is `corpus_audio_audio` at (40, 80) with every name hidden: its
labels "0.0 s" and "231.0791836734694 s" are 21.86279296875 and
102.02783203125 wide, so `W` is flat at 136.02783203125 below the knee
`L* = 40.08251953125` and `95.9453125 + L` above it.

| fixture | handle | delta | values |
|---|---|---|---|
| bare | right | (20, 0) | `{length: 420}` |
| bare, scale 2 | right | (20, 0) | `{length: 410}` |
| bare | left | (−21, 0) | `{length: 421, x: 19}` |
| bare | right | (−500, 0) | `{length: 8}` (no flat piece) |
| bare | bottom | (0, 30) | `{margin: 15}` (one item: its margin, half the travel; `spacing` untouched) |
| bare | top | (0, −30) | `{margin: 15, y: 50}` (the bottom edge kept, the top 30 higher) |
| bare, margin 15 | bottom | (0, −40) | `{margin: 0}` (the floor; past the content) |
| bare | bottom | (0, −40) | `{margin: 0}`, no command (the margin it has) |
| nested | top | (0, −51) | `{margin: 25.5, y: 29}` (one item) |
| nested | bottom-right | (400, 51) | `{length: 800, margin: 25.5}` |
| ungrouped | bottom | (0, 32) / (0, 5) | `{spacing: 24}` / `{spacing: 10.5}` (half the travel, two gaps) |
| ungrouped | top | (0, −32) | `{spacing: 24, y: 48}` |
| ungrouped | bottom | (0, −16) / (0, −40) | `{spacing: 0}` / `{spacing: 0}` (the floor) |
| ungrouped | bottom-right | (40, 32) | `{length: 440, spacing: 24}` |
| ungrouped, `score` at `{y: 200}` | bottom | (0, 50) | `{spacing: 192.6953125}` (across the knee: `143.734375 + s ≤ 336.4296875`) |
| audio | right | (−500, 0) | `{length: 40.08251953125}` (the knee) |
| audio, length 8 | right | (50, 0) | `{length: 90.08251953125}` |
| audio, at the knee | right | (100, 0) | `{length: 140.08251953125}` |
| bare, width `2 Wc(400)` | right / left | (40, 0) / (−42, 0) | `{length: 420, width: 993.154296875}` / `{length: 421, width: 995.154296875, x: −2}` |
| ungrouped, height `2 H(8)` = 504.328125 | bottom / top | (0, 32) / (0, −32) | `{spacing: 16, height: 536.328125}` / the same with `y: 48` |
| ungrouped, width `2 W(400)` = 1051.79345703125 and height `2 H(8)` | bottom-right | (40, 32) | `{length: 420, spacing: 16, width: 1091.79345703125, height: 536.328125}` |
| bare, length 500, width 496.58 | right | (20, 0) | `{length: 520, width: null}` (a request the content overtook) |
| child member, width 600 | right | (50, 0) | `{length: 446.53466796875, width: 650}` (`Wc(L) = 158.4140625 + L`; 914504 steps would draw 650.00048828125) |

**The shortening lock.** On `bundle_shared_parent` (`Wb(L) =
185.39013671875 + L`): Box right by 585.39013671875 gives `{width:
1170.7802734375}`, twice the content; Stretch right by 100 `{length: 450,
width: 1270.7802734375}`; back by 200 `{length: 350, width:
1070.7802734375}`: a stretch back shrinks the block.

**The node's edges stay, not the place origin.** On `bundle_mixed` with
`group_2` at `{width: 600}` and `annotations` at `{x: −30}` (node at x 2,
right edge 656), Box from the left by 21 gives `{width: 675, x: 19}`;
applied, the node lies at −19 and its right edge stays at 656.

**A stretch keeps the arrangement.** Along time stated places scale with
the stretch (`x`, `length`, `width` by the length ratio, quantized; `y`,
`height`, `scale`, `spacing` and `margin` kept, a container's spacing and
margin being its own): `{group_2: {x: 40, y: 200, width: 700}, annotations: {x: −30,
length: 300}}` stretched from 400 to 500 becomes `{group_2: {x: 50, y:
200, width: 875}, annotations: {x: −37.5, length: 375}}`; `{annotations:
{x: 1, y: 1, height: 90, spacing: 2}}` to length 401 gives `x:
1.00244140625` and keeps the rest; a member's card place, under its
frame's `cards`, scales alike: `{group_1: {x: 4, cards: {score: {width:
700, spacing: 2}}}}` to length 500 gives `{group_1: {x: 5, cards: {score:
{width: 875, spacing: 2}}}}`; an unchanged length keeps the identical
places. On `bundle_mixed` with `group_2` at `{x: 40, y: 200, width: 700}`,
right by 74 gives the changes `[{target: {block: A}, values: {length:
440}}, {target: {block: A, id: "group_2"}, values: {place: {x: 44, y:
200, width: 770}}}]`, the block's own change then the item's (a place's
target is the address of the group or timeline whose place it is);
applied, the right edge lies at 862, the old 788 plus 74, and the frame
`{item: "group_2"}` is drawn at `x` 44, 770 wide.

**No change, no command.** A resize whose values the block holds already
(`bare` right by −20, `{width: null}`) gives no command; every other row's
command is accepted and the block carries exactly its values.

## Raising and lowering blocks (`commands.test.ts`)

Three blocks A, B, C added in that order; a change targets `{block: X}`
for each block X changed:

| ids | action | order after | changed |
|---|---|---|---|
| [A] | front | B, C, A | A |
| [C] | back | C, A, B | C |
| [A] | forward | B, A, C | A |
| [C] | backward | A, C, B | C |
| [A, B] | forward | C, A, B | A, B |
| [C] front; [A] back or backward; [] | | | no command |

Only chosen blocks get indices, each strictly between its new neighbours.
Core applies a `set`'s changes in turn and refuses an index another block
holds, so a run of chosen blocks takes its indices below the first index
a chosen block holds there: [A] front then [A, B] front (C, B, A) is
accepted.

## Deleting (`commands.test.ts`, `segments.test.ts`, `affected.test.ts`)

A selected part or card stands for the element whose ID it carries, the
target `{block, id}`; duplicates collapse in selection order, and every
command not refused is accepted, the removed IDs gone from the manifest.
The tables of this section write an address by its members: `A` for
`{block: A}`, `A: clt_3` for `{block: A, id: "clt_3"}`, `A: clt_3 [name]`
for `{block: A, id: "clt_3", part: ["name"]}`, `A: [name]` for the title
`{block: A, part: ["name"]}`; without the `A:` the element address alone
(`clt_1 [start, label]` is `{id: "clt_1", part: ["start", "label"]}`).

| view | selection | result |
|---|---|---|
| nested | {A} / {A: clt_3} / {A: clt_3 [name], A: clt_3} | targets [A] / [A: clt_3] / [A: clt_3] |
| with_region | {A: region_1 [label]} | [A: region_1] |
| nested; B bare | {B, A: clt_1 [start]} | [B, A: clt_1] |
| any | {} | refused: `Nothing is selected.` |
| numbers | {A: region_1 [label]} or with the region | [A: region_1] |
| group_child_member | {A: second-half [start]} | [A: second-half] |
| numbers | {A: group_1 [name]} | [A: group_1] |
| corpus_mpm | {A: [name]}, or {B, A: [name]} | refused: `The title of bundle 'Beethoven_op35_1971Curzon_Var14only' is removed only with its block; select the block to delete it.` (the title's words, `addressWords`) |
| corpus_mpm | {A: tmap_1} | [A: tmap_1] |
| bundle_shared_member | {A: t [card]} | [A: t]: the one address of both cards of `t` |

**The edited element is never deleted from inside its editor**
(`keys.test.ts`, `canvas-editors.test.ts`). Opening an editor selects the
edited element, so Delete right after opening would ask core to remove
the element the editor changes, which core can only refuse as a side
effect. The Delete key goes through the store of `mixed` (below) with the
level's own rules; the edited element, or a part or card standing for it,
is left out of the targets, and a selection naming nothing else is
refused with `Close its editor to delete the edited element.`: the
refusal is shown, nothing is journalled and the selection stays.

| editor | selection | result |
|---|---|---|
| bundle `{block: A}` | {`{block: A}`} | refused |
| group `{block: A, id: "group_1"}` | {`{block: A, id: "group_1"}`} / {`{block: A, id: "group_1", part: ["name"]}`} | refused |
| timeline `{block: A, id: "score"}` | {`{block: A, id: "score", part: ["card"]}`} / {`{block: A, id: "score", part: ["name"]}`} | refused |
| timeline `{block: A, id: "excerpt"}` | {`{block: A, id: "excerpt", part: ["card"]}`, `{block: A, id: "dlt_1"}`} | `remove` [`{block: A, id: "dlt_1"}`], accepted; `excerpt` holds no child, the selection cleared |
| none | {`{block: A}`} | `remove` [`{block: A}`], accepted |

On the canvas the refusal appears in the status line (`data-testid="hint"`),
as every key refusal does: the group editor of `group_1` opened, its
group selected, Delete pressed.

**A segment** that would leave a gap is dispatched like any target, and
the tests assert core's exact refusal of the command, whatever ways would
close the gap: `segment_not_removable`, `Removing segment 't2' of line 'theme'
is not supported yet`. `segment_children` is `piece`
holding the locked segment lines `intro`, `theme` and `coda`, `theme`
holding `t1`, `t2`, `t3`; "theme unlocked" states `locked: false` on
`theme` in the file. Refused, at the path `[addressKey({block: A, id:
"t2"})]`: `{A: t2 [label]}`, and on theme unlocked `{A: t2}`, `{A: t2, A:
t3}`, `{A: t2, A: coda [name]}`. A segment going with its line or its
block leaves no gap: `{A: theme, A: t2}` gives targets `[A: theme, A:
t2]`, which removes all four, and `{A, A: t2}` `[A, A: t2]`.

**What a deletion also takes away** is highlighted before it happens. The
rule reads the manifest alone: the owners are the IDs the selected
element addresses carry (the title carries none, a band is no owner); core
names what removing them removes; the result is the keys (`addressKey`) of
every drawn address of a removed element and of its parts, without the
selected addresses and the parts of a directly selected element.
Hand-derived from the fixtures' trees (`nested` `clt_1` ⊃ `clt_3` ⊃
`clt_2`; `map` `melody`, map `tempo`, ⊃ `phrase`, map `ticks`):

| fixture | selection | affected |
|---|---|---|
| nested | {clt_3} / {clt_2} / {clt_3 [name]} | {clt_2, clt_2 [name]} / ∅ / {clt_3, clt_2, clt_2 [name]} |
| nested | {clt_1} | {clt_3, clt_3 [name], clt_2, clt_2 [name]} |
| nested | {clt_1 [start]} | {clt_1 [card], clt_1, clt_1 [name], clt_1 [start, label], clt_1 [end], clt_1 [end, label], clt_3, clt_3 [name], clt_2, clt_2 [name]} |
| map | {phrase} / {tempo} | {ticks} / ∅ |
| with_region | {region_1 [label]} | {region_1} |
| numbers | {region_1 [label]} / {region_1} / {score} | {region_1} / ∅ / {region_1, region_1 [label]} |
| group_child_member | {piece} | {second-half [card], second-half [start], second-half [start, label], second-half [end], second-half [end, label], second-half, second-half [name]} |
| group_child_member | {recording [card]} | {recording, recording [name], recording [start], recording [start, label], recording [end], recording [end, label]} |
| corpus_mpm | {group_1} / {group_1 [name]} / {[name]} | ∅ / {group_1} / ∅ |

The element an open editor edits is never deleted, so selecting it, or a
part of it, takes nothing away; the rest of the selection still does:

| fixture | edited | selection | affected |
|---|---|---|---|
| nested | clt_3 | {clt_3} / {clt_3 [name]} | ∅ / ∅ |
| nested | clt_1 | {clt_1 [start]} / {clt_1 [start], clt_3} | ∅ / {clt_2, clt_2 [name]} |
| corpus_mpm | group_1 | {group_1 [name]} | ∅ |
| group_child_member | recording | {recording [card]} | ∅ |

On the canvas (`project.test.ts`): `mixed` with the group editor of
`group_1` open and `group_1 [name]` selected marks nothing affected; with
no editor open the same selection marks `group_1`.

**Property** (`properties.test.ts`): for one block of `bare`, `nested`,
`flow_control`, `with_region`, `map`, `group_child_member`,
`bundle_mixed` or `numbers` and any selection of its element, part and
band addresses, a selection of bands alone is refused with `A band is not
deleted; select its elements to delete them.`; otherwise the command is
refused exactly when core refuses a `remove` of the owners, and the IDs
it deletes equal the owners and the manifest's IDs whose addresses
(`{id}`) are among the affected. The rule is compared against core's own removal, never
against itself.

## The selection (`selection.test.ts`)

A selection holds addresses under their keys (`addressKey`), each once,
however its object was built: `selectionOf` builds one, in the order
given, and `isSelected` asks for an address by its key.

- **One rule reads an address**: the block and the element address, `null`
  for the block itself (`{block: A, id: "region_1", part: ["label"]}` is
  block A, element `{id: "region_1", part: ["label"]}`; `{block: A, id:
  "score", facet: "markers"}` block A, element `{id: "score", facet:
  "markers"}`); `blockOf` gives the block; the workspace `{}`, which names
  no block, throws.
- **A click selects what a press hit, as it is**: an element alone, never
  its block; without Shift it replaces the selection, with Shift it
  toggles, an address built anew toggling the equal one selected; its
  input is never mutated. A card's address stays the card's: the card and
  its timeline are two selections, both addresses core lists (`{id:
  "bare", part: ["card"]}` and `{id: "bare"}`, `{id: "recording", part:
  ["card"]}` and `{id: "recording"}` on `group_child_member`).
- **`existing` is the one prune rule**, run after every change of the
  store: it keeps what core resolves, a band only where bands are offered,
  and in an editor only what lies inside the edited element, the element
  itself and its cards included, so a change never drops an address that
  still names something there. On `nested`, `{block: A}`, `{block: A,
  id: "clt_3"}`, `{block: A, id: "clt_3", part: ["name"]}`, `{block: A,
  id: "clt_9"}`, `{block: A, id: "clt_9", part: ["name"]}`, `{block: B}`,
  `{block: B, id: "clt_1"}` keep the first three in order (a part stands or falls with its element); on `numbers`, the
  label of `region_1`, the label of `region_2`, `score`'s name,
  `group_1`'s name, `page`'s start and `{id: "nobody"}` keep the first,
  the third, the fourth and the fifth; the title `{block: A, part:
  ["name"]}` stays while its manifest is named (`bundle_mixed`), goes on an
  anonymous one (`nested`), as core resolves it. A selection wholly kept
  is returned as the identical object, so the canvas does not re-render.
  On opening editors over `bundle_mixed` with `bare` beside it: the bundle
  editor keeps `{block: A}`, `{block: A, id: "group_1"}` and `{block: A,
  id: "annotations", part: ["card"]}` and drops `{block: B}`; `group_1`'s
  keeps `{block: A, id: "group_1"}`, `{block: A, id: "score", part:
  ["card"]}` and `{block: A, id: "performance"}` and drops `{block: A}` and
  `{block: A, id: "page", part: ["card"]}`; `score`'s, opened inside it,
  keeps `score`'s card and `{block: A, id: "score", part: ["start"]}` and
  drops `{block: A, id: "performance"}`; opened alone it keeps `{block: A,
  id: "score"}` and `{block: A, id: "score", part: ["name"]}`; opened
  inside `group_1`'s it keeps `score`'s band `{block: A, id: "score",
  facet: "conversion_maps"}` and its start and drops `performance`'s band.
- **An opened editor selects its edited element** (`editedSelection`), by
  the address a click on its box selects, read through core's resolver:
  on `bundle_mixed`, the bundle editor of `{block: A}` gives `{block: A}`,
  `group_1`'s `{block: A, id: "group_1"}`, `score`'s (a member, drawn in a
  card) `{block: A, id: "score", part: ["card"]}`; on `nested`, the
  timeline editor of the child `clt_3`, which no card draws, gives
  `{block: A, id: "clt_3"}`, and that of the root `clt_1` `{block: A, id:
  "clt_1", part: ["card"]}`; on `bundle_shared_member`, that of `t`, drawn
  in a card in each frame, the one address of both, `{block: A, id: "t",
  part: ["card"]}`.

## What a press hits (`boxes.test.ts`)

A drawing's containers are the block, the groups' frames, the timelines'
cards and, in a timeline's editor, that timeline's bands. Layout records
each once, the block first, with its kind, place key, address, holder,
rectangle and the range of elements it drew; every descriptor names the
element it was written from (its index), its address and its role,
primary or a card's shadow. What proves the reader is that every answer
comes from those records and sources, never from an address's shape or
from where elements lie: the frame `{id: "group_1"}` and the line `{id:
"recording"}` have the same shape, and only the records tell them apart.
Element addresses below are a drawing's, without `block`; a hit and a
selection carry `block: A`. Boxes are named by their place keys. Points
are named by what they lie on (a line's start, a card's corner); their
coordinates are layout's.

- **Classification.** A press on a descriptor hits the frame or card
  whose own rectangle it draws (a card's shadow hits its card), else the
  element it draws; a press on nothing, or on the background, hits the
  block, `{block: A}`. A boundary is a boundary's line only, never a wedge
  carrying the same `{id: S, part: ["start"]}` address. On
  `segment_line`: `{id: "form", part: ["card"]}` a card, `{id: "form"}`
  an element, `{id: "b", part: ["start"]}` and `{id: "b2", part:
  ["start"]}` boundaries, `{id: "form", part: ["start"]}`'s wedge an
  element; on `group_child_member`: `{id: "group_1"}` a frame, `{id:
  "recording"}` an element, `{id: "recording", part: ["card"]}` a card,
  `{id: "group_1", part: ["name"]}` an element.
- **The box on top under a point** is the last displayed frame or card in
  drawing order whose rectangle holds the point, edges included; a frame
  or card that is not displayed holds no point. On `segment_line` a point
  on the root's line, the middle of `b2`'s boundary and the card's two
  corners lie in `{item: "form"}`; the block's padding, just right of the
  card and the shadow's rim in none; without a point there is none. On
  `group_child_member` the frame above the first card and the gap between
  the cards are the frame `{item: "group_1"}`, the ancestor line's start
  `{item: "group_1", member: "second-half"}`, `recording`'s start `{item:
  "group_1", member: "recording"}`; with the cards hidden, that last point
  is the frame.
- **What each descriptor draws** comes from its source alone: on
  `segment_line` the block (address `{}`), the card's shadow, the card and
  the three boundaries; on `group_child_member` the block, the frame, and
  each card's shadow and card; with the cards hidden the block and the
  frame only.
- **What a press selects** is what it hit, inside what the level offers:
  on the arranger a card selects `{block: A, id: "recording", part:
  ["card"]}`, the frame `{block: A, id: "group_1"}`, the background
  `{block: A}`, a line, a wedge or a title itself. The block is selected
  only on the arranger and in its own bundle editor; in the group editor
  of `group_1` on `bundle_mixed`, `score`'s card, `{id: "group_1"}` and
  `{id: "score"}` select themselves, `page`'s card, `{id: "annotations"}`,
  the title `{part: ["name"]}` and the block nothing. A selected card
  stands for its timeline for every other reader: it still exists, its
  deletion removes `{block: A, id: "recording"}`, and what it takes away
  is the timeline's other drawn addresses: `{id: "recording"}`, its name,
  its start and end wedges and their labels.
- **What the pointer highlights** is the box on top by its place key
  (`placeKeyText`), the boundary pressed and the band pressed by their
  addresses' keys (`addressKey`): on `group_child_member` the line
  `recording` highlights `{item: "group_1", member: "recording"}`, the
  frame's corner `{item: "group_1"}`, the padding nothing.
- **Enter's hit** of a selected address comes from the drawing alone: the
  block itself for `{block: A}`, a displayed frame or card itself, an
  element its first drawn copy; an address no drawing shows, another
  block's and a hidden card give none. Of the cards one card address
  covers, Enter takes the card of the frame worked in, else the first
  displayed one, so a hidden card never hides a shown one (below, "One
  address, two cards").
- **Bands** are hit only in the editor of their own timeline in this
  block (`score`'s on S, `phrase`'s and `melody`'s on M, section
  "Bands"): where the hit is the card or nothing, the band holding the
  point; a drawn element inside a band is hit before it; a gap between
  bands, no point, an absent band, another timeline's band, the bundle or
  group editor and the arranger give the card. A band hit selects and
  highlights the band's address `{id: T, facet: F}`, with its card as the
  box under the point.

**Which boxes hold part of the selection.** A displayed frame or card
holds the selection when an element of its range carries a selected
address, the box's own rectangle excepted; the block holds every drawn
address. Where a box lies plays no part. On `bundle_mixed` with a child
`dlt_1` under `excerpt` and a region `region_3` on `excerpt` (holding
boxes by place key, `G › T` written for `{item: G, member: T}`, `G` for `{item: G}`):

| selected | holding boxes |
|---|---|
| `{id: "score"}`, or `{id: "score", part: ["start"]}` | group_1, group_1 › score |
| `{id: "dlt_1"}`; `{id: "region_3", part: ["label"]}`; `{id: "excerpt"}`; `{id: "recording"}` (the ancestor line) | group_2, group_2 › excerpt |
| `{id: "page", part: ["card"]}` | group_2 |
| `{id: "group_1"}`; the title `{part: ["name"]}`; `{id: "annotations", part: ["card"]}` | none (the block alone) |
| `{id: "group_1", part: ["name"]}` | group_1 |
| `{id: "annotations"}` | annotations |
| `{id: "score"}` and `{id: "page"}` | group_1, group_1 › score, group_2, group_2 › page |
| `{id: "group_1"}` and `{id: "score"}` | group_1, group_1 › score |

Nothing selected, or an address not drawn (`{id: "nobody"}`), holds
nothing, the block neither. Without groups (`bundle_ungrouped`) `{id:
"recording"}` is held by `{item: "recording"}`, the boundary `{id:
"page_2", part: ["start"]}` by `{item: "pages"}`. With the cards hidden
`{id: "score"}` is held by `{item: "group_1"}` alone; with the frames
hidden by `{item: "group_1", member: "score"}`, and `{id: "group_1",
part: ["name"]}` by none. **An item over another** (`over`):
`annotations`' card moved to (8, 60) lies inside `group_1`'s frame, each
drawn as in the table above, and the middle of `score`'s line lies on the
card on top, `{item: "annotations"}`; yet `{id: "annotations", part:
["name"]}` is held by `{item: "annotations"}` alone, `{id: "score"}` by
`{item: "group_1"}` and `{item: "group_1", member: "score"}`, the card on
top by none. **One element drawn twice** (`twice`, with `recording` a
member of `group_1`): `excerpt`'s map `{id: "cmap_6"}` is drawn on both
cards and held by group_1, group_1 › recording, group_2, group_2 › excerpt;
hidden on `recording`'s card, by group_2 and group_2 › excerpt. **One
address, two cards** (`bundle_shared_member`): `t`'s cards `{item: "g1",
member: "t"}` and `{item: "g2", member: "t"}` share the address `{id:
"t", part: ["card"]}`; selected, it is held by both frames `{item: "g1"}`
and `{item: "g2"}` and by neither card (a box is not part of itself, and
the two cards are one address); `{id: "t"}`, drawn on both cards, is held
by g1, g1 › t, g2 and g2 › t. A band counts as its timeline's line. The
card the address names where an editor works (`workedBox`) is the one in
the frame worked in: in the editor of `g1` the card `{item: "g1", member:
"t"}`, in that of `g2` `{item: "g2", member: "t"}`; on the arranger, in
the bundle editor and in a group editor of another block, where no frame
tells the two apart, none; an address of one card (`u`'s) or of a frame
(`g2`) names that box wherever. The resize toolbar acts on that card and
the inspector reads it, for the card address and for what stands for it
(the line `{id: "t"}` in `g1`'s editor, the name `{id: "t", part:
["name"]}` in `g2`'s): neither has a box on the arranger or in the bundle
editor, `u`'s card has its own on the arranger. Enter on `{block: A, id: "t", part:
["card"]}` hits `t`'s card in `g2` in `g2`'s editor and the first, in
`g1`, on the arranger; with the card in `g1` drawn hidden (its record not
displayed), the one in `g2` on the arranger, in the bundle editor and in
`g2`'s editor, and nothing in `g1`'s.

## Editors: what opens and what each level permits (`editors.test.ts`)

An editor is a mode of the canvas on one element. What proves the dispatch
is that the target comes from the container hit, never from what it
holds, and that inside an editor nothing outside the edited element, nor
the element itself, opens. A frame stands for its group and a card for
its timeline, read from the box's place key through core (a member's
card `{id: "score", part: ["card"]}`, keyed `{item: "group_1", member:
"score"}`, opens `{block: A, id: "score"}`), and a line, addressed by its
timeline's ID alone, for its timeline; never from an address's or a
key's text. Hits are built from the drawing's records, so the cases need
no DOM. A holds `mixed`, B `bare`. In the table a hit names the element
address it carries in block A, "in" the frame or card under the point by
its place key, and an opened target is `{block: A, id: X}`, written `X`;
the block's own hit is `{block: A}`.

| editing | hit | opens |
|---|---|---|
| none | the block A; the frame `{id: "group_1"}`; the card `{id: "score", part: ["card"]}` | `{block: A}`; group_1; score |
| none | the lines `{id: X}` for X = score, annotations, excerpt, dlt_1, recording | each its own timeline X |
| none | `{id: "score", part: ["name"]}` or `["start"]` in `{item: "group_1", member: "score"}`; `{id: "group_1", part: ["name"]}` in `{item: "group_1"}`; `{id: "dlt_1"}` in `{item: "group_2", member: "excerpt"}` | score; group_1; dlt_1 |
| none | score's start and name, group_1's name in no box; the title `{part: ["name"]}` | nothing |
| bundle `{block: A}` | the block A; another block B | nothing |
| bundle `{block: A}` | the frame `{id: "group_1"}`; the card `{id: "annotations", part: ["card"]}` | group_1; annotations |
| group `{block: A, id: "group_1"}` | the frame group_1 itself; the card of `page`; the frame group_2; the block | nothing |
| group `{block: A, id: "group_1"}` | the card of `score`; the line `performance`; score's name in `{item: "group_1", member: "score"}` | score; performance; score |
| group `{block: A, id: "group_1"}` | group_1's name in `{item: "group_1"}`; page's name in `{item: "group_2", member: "page"}` | nothing |
| timeline `{block: A, id: "excerpt"}` | the line `dlt_1` | dlt_1 |
| timeline `{block: A, id: "excerpt"}` | the card of `excerpt`; the line `recording` (its ancestor) | nothing |
| timeline `{block: A, id: "dlt_1"}` | the line `dlt_1` | nothing |
| any | a band `{id: "excerpt", facet: "children"}`; a block the view does not hold | nothing |

Two editors are equal by target, compared as a whole address, and kind. **What each level permits** is
one row per level, compared whole; with an editor open, the innermost
editor's row applies:

| level | move | nudge | reorder | bands | marquee | items free | frame width pinned | remove | raise, lower | open | lock | resize |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| arranger | yes | yes | | | blocks | yes | | yes | yes | yes | yes | yes |
| bundle | yes | | | | elements | yes | | yes | | yes | yes | yes |
| group | | | yes | | elements | | yes | yes | | yes | yes | yes |
| timeline | | | | yes | elements | | | yes | | yes | yes | yes |

A locked canvas changes no placement, so it moves and nudges nothing,
moves no band and resizes nothing, at every level, and keeps every other
permission; a
read-only canvas writes nothing, so it also reorders, removes, raises,
lowers, opens and locks nothing, locked or not.

**What resizes** is one row per kind of container, a held card's beside
the card's, compared whole, and the reach checked for every container,
level and "is the edited element's own" (4 × 4 × 2):

| container | arranger | bundle | group | timeline | scale | box | length | spacing |
|---|---|---|---|---|---|---|---|---|
| the block | inside | edited | | | block | block | block | block |
| a frame | inside | inside | edited | | item | item | item | item |
| a card the block holds | inside | inside | | edited | item | item | item | item |
| a card a frame holds | inside | inside | inside | edited | item | own | item | own |
| a band | | | | | | | | |

"inside" resizes every such container inside the edited element,
"edited" only the edited element's own; the three modes are offered
wherever a container resizes, none elsewhere. A held card scales its group
and stretches it along time (its item's place), and sizes and stretches
vertically its own card (its own place).

**The Properties fields** come from the same tables, compared whole per
container and level: the place members in core's order (`x`, `y`,
`length`, `scale`, `spacing`, `margin`, `width`, `height`), each with whose
place it writes and whether the level edits it (the block's scale, length,
spacing and margin only where it resizes, an item's position only in an
editor that moves; a held card's length and scale its group's, its spacing
and margin its own, the vertical stretch's column; a band none).

## Moving and resizing frames and cards (`items.test.ts`, `properties.test.ts`)

What proves a gesture on an item is that applying its command moves or
resizes exactly that item and nothing else: every other item keeps its
drawn place, and the dragged edge's opposite edge keeps its position even
when the box grows left or up. Whatever a gesture measures before release
it measures on the view its command would leave, so a move's preview
equals the drawing of the applied view by construction. A holds
`bundle_mixed` at (40, 80), its items as in the fixture facts.
562.484619140625 is an odd multiple of 1/4096, so a width quantized from
it rounds half up.

**Notation.** A gesture names the frame or card it acts on by its place
key, and its place changes are a map of place keys to values. In this
section a place key is written by its members: `group_1` for the frame
`{item: "group_1"}`, `annotations` for the card `{item: "annotations"}`,
`group_1 › score` for the card `{item: "group_1", member: "score"}`. Place
changes are written `{group_1: {length: 420}, group_1 › score: {spacing:
12}}`, each place once, compared without regard to their order unless
the order is stated; a command's change targets the address of the group
or timeline whose place it is, `{block: A, id: "group_1"}` for the frame
and `{block: A, id: "score"}` for `score`'s card in it.

A held card's item is its frame (`group_1 › performance`'s `group_1`,
`group_2 › excerpt`'s `group_2`), and a frame or block-held card is held by
its own item. A line `{id: "score"}` and a group's title `{id: "group_1",
part: ["name"]}` are no resized box: no record carries their addresses.

**Moves.** `group_2` to (40, 200) states it there and every other item at
its drawn position (`group_1` (8, 28.8046875), `annotations` (8,
391.7734375)), else `annotations` would follow `group_2` up to
385.734375; an item stating `{x: 12}` gets only its `y`. To (40.0001, 200)
the same; to its drawn place no command; a key that is no item (`{item:
"score"}`, a member's ID) throws.
**Several items move by one travel**: with `annotations` along, `group_2`
travels `(32, −6.0390625)` and `annotations` lands at (40, 385.734375),
its offset kept; the command lists the pressed item, the items moving with
it in order, then the others' positions. With both others along, `group_1`
lands at (40, 22.765625). No travel, or a key along that is no item, no
command.

**Which items a drag moves with the pressed one** depends on the
selection by address, never by where things lie: a selected frame or card
puts in only the items drawing it (a held card its frame, every frame of
a member of two groups), any other address every item containing it by
core's containment. With the pressed item in the selection the drag moves
the other selected items, in item order, possibly none; otherwise it
moves the pressed item alone (none). The selection is the block's
selected element addresses:

| selection | pressed: result |
|---|---|
| `{id: "group_2"}`, `{id: "annotations", part: ["card"]}` | group_2: [annotations]; annotations: [group_2]; group_1: none |
| `{id: "group_1"}`, `{id: "group_2"}`, `{id: "annotations", part: ["card"]}` | annotations: [group_1, group_2] |
| `{id: "score"}`, `{id: "annotations", part: ["name"]}` | group_1: [annotations]; annotations: [group_1]; group_2: none |
| `{id: "group_2"}`, `{id: "page"}`, `{id: "excerpt", part: ["card"]}` | group_2: []; group_1, annotations: none |
| the title `{part: ["name"]}`, `{id: "group_2"}` | group_2: []; group_1: none |
| `{id: "recording"}` (an ancestor line, contained by no item) | group_2: none |
| ∅ | none for every key |
| `over`: `{id: "annotations", part: ["name"]}`, `{id: "group_2"}` | group_2: [annotations]; annotations: [group_2]; group_1: none |
| `twice`: `{id: "excerpt", part: ["card"]}` | group_1: none; group_2: [] |
| `twice`: `{id: "excerpt"}` | group_1: [group_2]; group_2: [group_1] |
| `bundle_shared_member`: `{id: "t", part: ["card"]}` | g1: [g2]; g2: [g1] |

`twice` draws the card of `excerpt` once, `group_2 › excerpt` in
`group_2`'s frame, though both groups contain `{id: "excerpt", part:
["card"]}` by address: the test asserts both premises. On
`bundle_shared_member` the one address names `t`'s card in each frame, so
both frames draw it.

**Handles.** A frame or a block-held card offers a block's handles; where
the level pins the frame's width its stretch leaves out the left edge and
corners. A held card, whose top left its frame decides, offers
bottom-right to scale and right, bottom-right, bottom otherwise, at every
level. A handle not offered throws.

**Heights** as functions of the spacings (sections 6.2 to 6.5, 8.4), a
card's of its own card spacing `S`, a frame's of its spacing `Sf`, each
alone: `performance` and `page` `Hp = 49.4765625` at every `S` (both their
bands lie against their lines: no gap), `score` `Hs(S) = 19.5 +
((26.9765625 + S) + ((4 + S) + 2 + h(9))) + 8 = 70.953125 + 2S` (the gap
before its flow control band and its jump's depth), `annotations` `Ha(S) =
14.40234375 + ((26.9765625 + S) + 18.4765625) + 8 = 67.85546875 + S` (the
gap before its regions band); `group_1`'s frame `H(Sf) = 24.8046875 +
78.953125 + Sf + 49.4765625 + 8 = 161.234375 + Sf`. No spacing multiplies
another: a frame's spacing changes none of its cards, a card's none of its
frame's gaps.

**Scale** (on `annotations`' card, arranger): bottom-right by (40, 20)
`{scale: 1.2783203125}` (2618.03 steps); top-left by (−40, −20) the same
with `x: −148.55078125, y: 371.7744140625`; by (−1000, −1000) the floor;
at block scale 2 by (80, 40) the same 1.2783203125; with `scale` 2 stated,
halving gives `{scale: null}`, the default. On a held card the scale is
its group's, from the frame's top left to the card's bottom right:
`group_1 › performance` by (40, 20) gives `{group_1: {scale: 1.1240234375}}`.
Only an offered corner scales.

**Box** (on `group_2` with `width` 580, bundle editor): right by 20
`{width: 600}`, by −20 `{width: null}`; left by −21 `{width: 601, x:
−13}`, by 100 `{width: null, x: 25.515625}`; bottom by 10.5 `{height:
188.234375}`; top by −16 `{height: 193.734375, y: 190.0390625}`; at block
scale 2 right by 20 `{width: 590}`. Applied, the left row moves the place
origin to (21, 0) and keeps `group_2`'s right edge at canvas x 628. A held
card sizes its own card in item coordinates: with `group_1` at scale 1.25,
`group_1 › performance` bottom-right by (50, 30) gives `{group_1 › performance: {width:
586.48486328125, height: 73.4765625}}`, right by −50 `{width: null}`.

**Stretch** follows a block's rule, every stated size of the stretched
boxes following its own content. On `annotations`' card (bundle editor):

| case | handle | delta | values |
|---|---|---|---|
| | right / left | (20, 0) / (−21, 0) | `{length: 420}` / `{length: 421, x: −13}` |
| | right | (−500, 0) | `{length: 8}` |
| | bottom / top | (0, 20) / (0, −20) | `{spacing: 24}` / `{spacing: 24, y: 371.7734375}` |
| | bottom-right | (20, 20) | `{length: 420, spacing: 24}` |
| | bottom | (0, −2) / (0, −40) | `{spacing: 2}` / `{spacing: 0}` (the floor) |
| width `2 W(400)` | right / left | (40, 0) / (−42, 0) | `{length: 420, width: 1164.96923828125}` / `{length: 421, width: 1166.96923828125, x: −34}` |
| height `2 Ha(4)` | bottom | (0, 40) | `{spacing: 24, height: 183.7109375}` |

A frame's stretch widens the gap between its cards, each card keeping its
size: `group_1` bottom by 44 `{group_1: {spacing: 52}}`, top by −44 also
`y: −15.1953125`; with `performance` at height `2 Hp` bottom by 60
`{group_1: {spacing: 68}}` alone (the frame `210.7109375 + Sf` high, the
card's request unchanged). A held card stretches its group along time and
its own card vertically, and has no left handle:

| case | card | handle | delta | values |
|---|---|---|---|---|
| | group_1 › score | right | (20, 0) | `{group_1: {length: 420}}` |
| | group_1 › score | bottom | (0, 16) | `{group_1 › score: {spacing: 12}}` (two gaps: 8 per unit) |
| | group_1 › score | bottom-right | (20, 16) | both of the above |
| score height `2 Hs(4)` = 157.90625 | group_1 › score | bottom | (0, 32) | `{group_1 › score: {spacing: 12, height: 189.90625}}` |
| group_1 height `2 H(8)` | group_1 › score | bottom | (0, 16) | `{group_1 › score: {spacing: 12}, group_1: {height: 370.46875}}` (`338.46875 × 185.234375 ÷ 169.234375`) |
| group_1 width `2 W(400)` | group_1 › score | right | (30, 0) | `{group_1: {length: 415, width: 1154.96923828125}}` (the frame's width widens its cards, so the card is drawn `2 W(L) − 16`) |
| performance width `2 Wc(400)` | group_1 › score, or group_1 › performance by (60, 0) | right | (30, 0) | `{group_1: {length: 430}, group_1 › performance: {width: 1152.96923828125}}` |

Each row's command is accepted on the arranger, in the bundle editor and
in the member's timeline editor, where a held card's stretch writes its
group's length alone.

**The shortening lock** (`bundle_shared_parent`, `Wc(L) =
151.39013671875 + L`): Box on `exposition`'s card `group_1 › exposition`
right by its content gives `{group_1 › exposition: {width:
1102.7802734375}}`, the frame 1118.7802734375 wide and `group_1 › take_1`
still 551.39013671875; then Stretch on the card right by 100 `{group_1:
{length: 450}, group_1 › exposition: {width: 1202.7802734375}}`
(`group_1 › take_1` then 601.39013671875, the frame 1218.7802734375); on
the frame by −200 `{group_1: {length: 350}, group_1 › exposition: {width:
1002.7802734375}}`; on the card by −50 `{group_1: {length: 325},
group_1 › exposition: {width: 952.7802734375}}`: the card stays twice its
content and the group shortens again. A card's content is its own, never
the width its frame lends it: with `group_1` at `2 Wf(400)` and the card
at `3 Wc(400)`, Stretch right by 90 gives `{group_1: {length: 430, width:
null}, group_1 › exposition: {width: 1744.17041015625}}`.

**The group editor keeps the frame's width** along time at its drawn
width, quantized (562.48486328125), while the content, the cards' widths
following, fits in it: a stretch that shrinks the members states that
width. Once the content is wider the frame follows it (`width: null`), so
the members stretch larger and the frame grows with them, its right edge
under the pointer: the stated length is the last lattice step whose
content does not pass the pointer, the next one passes it. The frame and
any held card give the same values, the frame's left edge stays, and
vertically the frame adapts. The content of `group_1` grows by 1 per unit
of length, and a card kept at twice its content `2 Wc(L)` with `Wc(L) =
Wc(400) + (L − 400)`, its frame 16 wider:

| case | handle | delta | values |
|---|---|---|---|
| | right | (20, 0) / (−100, 0) | `{group_1: {length: 420, width: null}}` / `{length: 300, width: 562.48486328125}` |
| width 600 | right | (30, 0) / (200, 0) | `{group_1: {length: 430, width: 600}}` / `{length: 600, width: null}` (content 762.48486328125) |
| | bottom (frame) | (0, 44) | `{group_1: {spacing: 52}}` |
| | bottom-right (frame) | (20, 44) | `{group_1: {length: 420, width: null, spacing: 52}}` |
| performance width `2 Wc(400)` | right | (20, 0) / (−100, 0) | `{group_1: {length: 410, width: null}, group_1 › performance: {width: 1112.96923828125}}` (the frame 1108.96923828125 + 20) / `{group_1: {length: 350, width: 1108.96923828125}, group_1 › performance: {width: 992.96923828125}}` |

Each row is given alike by the frame `group_1` and by the card
`group_1 › score`. On `bundle_shared_parent` (whose recapitulation group's
frame is as wide as its content, 567.39013671875 at length 400), the
frame `group_2`, the card `group_2 › recapitulation` and the card
`group_2 › take_2` stretched right by 50 in the group
editor give `{group_2: {length: 450, width: null}}`, by −50 `{group_2:
{length: 350, width: 567.39013671875}}`.

**A typed length or spacing writes what a Stretch to it writes**: the
same stretch, built from the drawing before it, serves the pointer (which
solves the value) and the inspector (which types it), checked through the
frame and a held card alike:

| case | box | level | value | values |
|---|---|---|---|---|
| | group_1 or group_1 › score | arranger | length 300 | `{group_1: {length: 300}}` |
| performance width `2 Wc(400)` | group_1 or group_1 › score | arranger | length 430 | `{group_1: {length: 430}, group_1 › performance: {width: 1152.96923828125}}` |
| annotations width `2 W(400)` | annotations | bundle | length 420 | `{annotations: {length: 420, width: 1164.96923828125}}` |
| | group_1 or group_1 › score | group | length 500 / 300 | `{group_1: {length: 500, width: null}}` / `{group_1: {length: 300, width: 562.48486328125}}` |
| group_1 width 600 | group_1 or group_1 › score | group | length 430 / 500 | `{length: 430, width: 600}` / `{length: 500, width: null}` |
| performance width `2 Wc(400)` | group_1 or group_1 › score | group | length 350 / 500 | the pointer's row above / `{group_1: {length: 500, width: null}, group_1 › performance: {width: 1292.96923828125}}` (`2 Wc(500)`) |
| score height `2 Hs(4)` | group_1 / group_1 › score | bundle | spacing 16 / 12 | `{group_1: {spacing: 16}}` (no card's height follows) / `{group_1 › score: {spacing: 12, height: 189.90625}}` |
| group_1 height `2 H(8)` | group_1 | bundle | spacing 16 | `{group_1: {spacing: 16, height: 354.46875}}` |
| group_1 height `2 H(8)` | group_1 › score | arranger | spacing 12 | `group_1 › score: {spacing: 12}` then `group_1: {height: 370.46875}`, in that order |

A Stretch starts from the spacing drawn, stated else the container's
default: `group_1` 8, `group_1 › score` and `annotations` 4; with
`group_1` at `{spacing: 0}` and `score` at `{spacing: 2}`, 0 and 2. A
vertical Stretch that finds the spacing it started from states nothing: a
card without gaps (`performance`) draws alike at every spacing, so its
bottom by 16 gives no place and no command, and bottom-right by (20, 16)
`{group_1: {length: 420}}` alone.

**A container with exactly one content** (section 1) stretches its
`margin`, not its `spacing`: its contents are read from the drawing's
records alone, the `contentCount` layout records on each (a block's
items, a frame's cards, a card's rows and bands), by one rule that the
block's resize and every frame's and card's share. `performance` (its
row, its markers and its conversion maps band: three contents) keeps the
spacing rule above. With both its bands
hidden by a workspace statement (`display: none` on `{id: performance,
facet: markers}` and `{id: performance, facet: conversion_maps}`) it holds
its row alone: its card is `Hp′ = (8 + h(11) / 2) + h(11) / 2 + 8 =
28.8046875` high (no band reaches past the name's half row), `H(m) = Hp′ +
2m`, so bottom by 16 at every level gives `{group_1 › performance:
{margin: 8}}`, its `spacing` unstated; bottom by −40 floors at 0, the
margin it has, so no place and no command. With `group_1`'s height
requested at twice its content, `2 × (24.8046875 + 78.953125 + 8 +
28.8046875 + 8) = 297.125`, the same drag gives `group_1 › performance:
{margin: 8}` then `group_1: {height: 329.125}` (`297.125 × 164.5625 /
148.5625`, its content 16 higher), in that order.

**The command of a resize** sets each place in order and, where the
level's items lie freely (arranger and bundle editor), the drawn position
of every other item without one, never the frame holding an edited held
card: `group_2`'s left Box row gives `group_2`'s place, then `group_1`'s
and `annotations`' positions, at both levels; in the group editor
`[{target: {block: A, id: "group_1"}, values: {place: {length: 400,
width: 562.48486328125}}}]` alone; in a timeline editor `[{target:
{block: A, id: "annotations"}, values: {place: {length: 420}}}]` alone:
an ungrouped root's card is placed on its timeline.
A held card's size on the arranger (`group_1 › performance`) is its own
place, set through its group, `{target: {block: A, id: "group_1"},
values: {cards: {performance: …}}}`, then `group_2`'s and
`annotations`' positions; applied, the card's place lies in its frame's
`cards` (`places.group_1` is exactly `{cards: {performance: …}}`) and the
frame `group_1` states no place of its own. Values all stated already
give no command.

**`placeEdit`, the inspector's edit** of one property of the selected
block, frames or cards, is that same command: a block's own member (scale
2 on A; scale 1, or width null, no command); a frame's place with the
others' positions in the bundle editor (`group_2` width 601); a held
card's size on its own place through its group (`{target: {block: A, id:
"group_1"}, values: {cards: {performance: {width}}}}`), whether the card
`{block: A, id: "performance", part: ["card"]}`, its line `{block: A, id:
"performance"}` or its name `{block: A, id: "performance", part:
["name"]}` is selected; a card of a member of two groups
(`bundle_shared_member`, `t`) in the frame of the editor it is edited in:
its width 600 in `g2`'s editor is `{target: {block: A, id: "g2"},
values: {cards: {t: {width: 600}}}}` alone (the group editor lays no item
out freely), and on the arranger, where no frame is, the selection names
no place (`wrong_target_kind`);
a held card's scale on its group, once for two cards of the group; a
length or spacing as a Stretch to it (`group_1` length 300 on the
arranger; `{block: A, id: "score", part: ["card"]}` length 500 in the
group editor, the frame then following the content, `{length: 500,
width: null}`); a step from each element's shown value (`group_1`
spacing 8 + 1 = 9), the value stated, else drawn, which the inspector's
fields read too. Refused, typed and located, each path starting with the
key (`addressKey`) of the address refused: a selection naming nothing
(`unknown_target` at `["width"]`), the title `{block: A, part: ["name"]}`,
a block mixed with a frame (at the block `{block: A}`), or frames in two
blocks (at the first) (`wrong_target_kind`), a held card's `x`
(`unknown_property` at its card `{block: A, id: "performance", part:
["card"]}`), an
empty `scale`, a non-finite length (`invalid_value`).

**Properties.** For any view of 1 to 5 blocks of `bare`, `nested`,
`flow_control`, `with_region`, `map` and `bundle_mixed`, any sequence of
moves, nudges, raises and lowers, block resizes, item and held-card
resizes (any mode, an offered handle, any delta in ±1000), stated box
requests and deletions gives commands core accepts, and a gesture that
changes nothing gives none. A held card's horizontal stretch on
`bundle_mixed` at any level but the group editor, with any widths stated,
writes only its group's `length` (and at most its `width`) and its
members' card widths, never a width that was not stated, and is accepted
with that level's editor open. **A stretch follows the pointer and a
stretch back returns**: for the block, any item or any held card of
`bare`, `nested` and `bundle_mixed`, with requests absent or at any ratio
in [1, 3] of its size, (a) a shorter pointer never finds a longer value,
(b) a second stretch bringing the pointer back never moves further away,
(c) without a request it restores the value exactly. **Undo** through the
store restores every block's placement and places exactly at each step.

**The drawing properties' timeout.** These properties draw boxes in every
run; measured alone under load the slowest took 13.2 s, so each carries a
40 s timeout and keeps its whole sample.

## Reordering a group's member cards (`reorder.test.ts`)

Where a dragged card drops reads only the drawing's records: the displayed
cards a frame holds, in drawing order, each at the middle of its
rectangle. Neither the frame's rectangle nor the next item decides, so a
hidden frame still orders its cards. On `bundle_mixed` the middles of
the cards `{item: "group_1", member: "score"}` and `{item: "group_1",
member: "performance"}` are 93.0859375 and 165.30078125 (their `y` plus
half their height).

| group | dragged | y | order |
|---|---|---|---|
| group_1 | score | 100 / 170 | [score, performance] / [performance, score] |
| group_1 | score | 165.30078125 | [performance, score] (a middle at `y` is not below it) |
| group_1 | performance | 50 / 93.0859375 | [performance, score] / [score, performance] |
| group_2 | page | 440 | [excerpt, page] |

On `group_child_member` with the frame hidden, `second-half` and
`recording` give at each drop the order they give with the frame
displayed, asserted on both drawings, and no element of type `frame` is
drawn. A group not drawn throws.

**The preview of a drop is its command applied**: dropping `performance`
first on `bundle_mixed` draws the card `{id: "performance", part:
["card"]}` at the y 53.609375 of `score`'s card and `{id: "score", part:
["card"]}` `49.4765625 + 8` below it, at 111.0859375, everything else
kept, and the stored order is left as it was. **The command** is a `set`
of `order` on the group, `{block: A, id: "group_1"}`: none for the
displayed order, `order: null` for the members' own order
(`[performance, score]` on `bundle_mixed`), and the order itself
otherwise: on `group_number_types` (members `page`, `performance`,
`score`, displayed `score`, `page`, `performance`) `[score, page,
performance]` none, `[page, performance, score]` null, `[performance,
score, page]` itself, which core stores.

**The release's motion** starts where the dragged copy was dropped and
ends where the card is drawn after the gesture, both as travels from the
card's place at the press, in drawing units, read from the two drawings'
records by the card's place key: on `bundle_mixed`, the card `{item:
"group_1", member: "score"}` dropped with a travel of
`(10, 100)` and stored after `performance` moves from `(10, 100)` to
`(0, 57.4765625)` (111.0859375 less 53.609375); with the order unchanged
(Escape, a release in place, a refusal) to `(0, 0)`. A copy dropped
exactly at its card's place, and a card the shown drawing does not draw
(`{item: "nobody"}`), give no motion.

## Bands (`bands.test.ts`)

Every timeline drawn with a line of its own has five bands, one per
facet, `{id: T, facet: F}` (section 6.4); its band order lists `line` and
the five facets, top to bottom, the default being `[children,
conversion_maps, line, markers, regions, flow_control]`. A band is
present when it draws an element; layout records each present band of
each line with its facet, its level, its line's ordinate, its element
count and its rectangle; a band draws nothing. A band is offered, hit,
highlighted, selected and moved only in its own timeline's editor when
that editor is innermost. A move writes the timeline's own band order in
one `set` of `order` on the timeline `{block: A, id: T}`, `null` when the
new order equals what it inherits (a root the default order, a child its
parent's, verbatim).

**What proves it**: where a band lands depends only on the records and the
order, so drops and steps are checked on hand-written records with orders
derived by hand; the commands on the manifests' orders as core states
them; every command is dispatched through core's store with its
timeline's editor open; and one case runs on layout's own drawing of
`styled__score`, its values derived from the band order alone.

**The records.** S (`styled__score`, own order `E = [children, markers,
line, conversion_maps, regions, flow_control]`), drawing 600 × 200, the
card (8, 8, 584 × 184), every record at line 100, x 100, width 400:

| band | level | y | height | middle | elements |
|---|---|---|---|---|---|
| children | 2 | 40 | 30 | 55 | 1 |
| markers | 1 | 80 | 20 | 90 | 2 |
| conversion_maps | −1 | 100 | 10 | 105 | 1 |
| regions | −2 | 114 | 20 | 124 | 1 |
| flow_control | −3 | 138 | 22 | 149 | 1 |

M (`map`: `melody`, map `tempo`, ⊃ `phrase`, map `ticks`; both with the
default order `D`), drawing 600 × 140, the card `{item: "melody"}` (8, 8,
584 × 124): `{id: "melody", facet: "children"}` line 70, level 2, (100,
16, 400 × 20); `{id: "melody", facet: "conversion_maps"}` 70, 1, (100,
56, 400 × 14); `{id: "melody", facet: "markers"}` 70, −1, (100, 70, 400
× 16); `{id: "phrase", facet: "conversion_maps"}` line 30, level 1, (200,
20, 200 × 10), held by the card `{item: "melody"}`. T:
`excerpt`'s children and conversion maps bands at lines 50 (y 10 and 36)
and 150 (y 110 and 136), each 14 high, x 100, width 400.

**The band under a point** is the first offered record holding it, edges
included: on S (150, 55) and (100, 40) children, (500, 160) flow control,
(150, 100) markers (the first of two), (150, 75), (99, 55), (501, 55)
none; a band 0 high holds its edge (150, 138) only. The offered bands of
`score` are S's five records, of `b` none, of `excerpt` on T all four.

**Where a dragged band lands.** Of the visible entries of its own line
(its timeline's present bands' facets and `line`, in the order), without
the dragged band, `k` lie strictly above `y`; the band moves just after
the `k`-th (before the first when `k` is 0), and nothing changes when it
already lies between those two in the order:

| band | y | new order (from `E`) |
|---|---|---|
| conversion_maps | 140 | [children, markers, line, regions, conversion_maps, flow_control] |
| flow_control | 103 | [children, markers, line, flow_control, conversion_maps, regions] |
| children | 95 | [markers, children, line, conversion_maps, regions, flow_control] |
| markers | 30 | [markers, children, line, conversion_maps, regions, flow_control] |
| regions | 75 | [children, regions, markers, line, conversion_maps, flow_control] |
| markers | 112 | [children, line, conversion_maps, markers, regions, flow_control] |
| regions | 100 | [children, markers, regions, line, conversion_maps, flow_control] (the line is not above itself) |
| regions at 124 or 108; children at 10; markers at 99 | | none: released in place |
| conversion_maps | 170 | [children, markers, line, regions, flow_control, conversion_maps] |
| flow_control | 5 | [flow_control, children, markers, line, conversion_maps, regions] |

On M an absent band between the neighbours changes nothing seen, so a
release in place writes nothing (`melody`'s markers band at 78, its
children band at 20, each with the absent regions band before it).
`phrase`'s conversion maps band at 33 lands after `line`. On T the children
band at line 50 released at 45 lands after its own line's conversion maps
band, never read across the other line.

**Steps** pass the next visible entry in the arrow's direction, the line
included, and give nothing at the ends:

| band (on S) | up | down |
|---|---|---|
| children | none | [markers, children, line, …] |
| markers | [markers, children, line, …] | [children, line, markers, conversion_maps, …] |
| conversion_maps | [children, markers, conversion_maps, line, …] | [children, markers, line, regions, conversion_maps, flow_control] |
| regions | [children, markers, line, regions, conversion_maps, flow_control] | [children, markers, line, conversion_maps, flow_control, regions] |
| flow_control | [children, markers, line, conversion_maps, flow_control, regions] | none |

On M absent bands are passed over (`melody`'s markers band steps down to
nothing though regions and flow control follow it in `D`).

**The command.** On `map_root_band_order` (`melody` states `R =
[children, line, conversion_maps, markers, regions, flow_control]`,
`phrase` states none and so inherits `R` verbatim): `melody` at `D` writes
`null`; at a new order that order; `phrase` at `R` `null`; at `D` `D`,
since a child inherits its parent's order, not the default. Every order of
the drops and steps above writes itself; a block the view does not hold
throws. Each is accepted with its timeline's editor open, and the
manifest then holds it (or no entry); `phrase` at `R` is the order it
has, so core refuses it exactly with `{code: "invalid_value", message:
"the command changes nothing", path: [addressKey({block: A, id:
"phrase"}), "order"]}`, and no move gives that command.

**On layout's drawing of `styled__score`** the offered bands of `score`
are children 2, markers 1, conversion maps −1, regions −2, flow control
−3, holding 1, 2, 1, 1, 1 elements, each at the ordinate of `score`'s
line; each steps as on S, gives nothing released at its own middle, and is
hit at its centre through the card in `score`'s editor; the markers band's
step down is accepted.

**The selection of bands.** A band is selected by its address; read back,
`{block: A, id: "melody", facet: "markers"}` is block A, timeline
`melody`, facet markers, and `{block: A}`, `{block: A, id: "melody"}`,
`{block: A, id: "tempo"}`, `{block: A, id: "melody", part: ["start",
"label"]}` and `{block: A, id: "nobody", facet: "regions"}` are no band.
A band is offered and kept while its timeline exists and its editor is
innermost; with `mb = {block: A, id: "melody", facet: "markers"}`, `pb =
{block: A, id: "phrase", facet: "conversion_maps"}` and `ticks = {block:
A, id: "ticks"}`:

| editing | `{mb, pb, ticks, {block: A, id: "nobody", facet: "regions"}}` keeps |
|---|---|
| timeline `{block: A, id: "melody"}` | {mb, ticks} |
| timeline `{block: A, id: "phrase"}` | {pb, ticks} |
| timeline `{block: A, id: "nobody"}`, timeline `{block: B, id: "melody"}` | ∅ |
| bundle `{block: A}`, none | {ticks} |

A selection wholly kept is the identical object. Through a store, opening
`phrase` inside `melody` drops `melody`'s band, and each Done drops the
bands of the editor closed. A band is never deleted (a selection of bands
alone is refused, a band beside an element is left out), takes nothing
away, is held by its timeline's card (on M `phrase`'s band by the card
`{item: "melody"}`; on S a band of the hidden `a` by none), and no
marquee selects one.

## The editor's viewport (`focus.test.ts`)

The rectangle an editor centres is its target's container on the canvas,
read from the drawing's records: on `mixed` at (40, 80) the block `{block:
A}` `{40, 80, 580.484619140625 × 491.62890625}`, `{block: A, id:
"group_1"}`'s frame `{48, 108.8046875, 562.484619140625 × 169.234375}`,
`{block: A, id: "annotations"}`'s card `{48, 489.7734375,
562.484619140625 × 71.85546875}`; a child with no card the rectangle
around its drawn elements, `{block: A, id: "dlt_1"}`'s line and name
`{64, 414.89453125, 302.29150390625 × 12.8046875}`; at scale 2 the frame
`{56, 137.609375, 1124.96923828125 × 338.46875}`; a target in another
block (`{block: "0000000009", id: "group_1"}`) throws. The viewport centres it in the pane less the drawer with 10 % free
on each side, the zoom clamped to [0.05, 4]: in a 1200 × 800 pane with a
400 drawer, `{100, 50, 320 × 160}` gives `{x: −120, y: 140, zoom: 2}`,
`{100, 50, 10 × 10}` `{x: −20, y: 180, zoom: 4}`, `{100, 50, 100000 ×
100}` `{x: −2105, y: 395, zoom: 0.05}`; no drawer, 1000 × 500, `{0, 0, 400
× 100}` gives `{x: 100, y: 150, zoom: 2}`. The move takes 1000 ms.

## The marquee inside an editor (`marquee.test.ts`)

A marquee selects elements, never containers, and only inside the edited
element; an element's bounds are the rectangle of the coordinates its
drawing states (a text's from its measured width, ascent and descent), and
an address drawn more than once is taken only when every copy lies
inside. On `mixed` with the region `region_3` (0 to 10 samples) on
`excerpt` and the map `cmap_7` on `dlt_1` (`region_1` and `cmap_3` are
taken: an ID is unique across the manifest), at (40, 80), each result an
address in block A, written below by its element address:

- The rectangle of `score`'s card gives, in drawing order, `{id:
  "cmap_1"}`, `{id: "cmap_2"}`, `{id: "jump_from_1"}`, `{id: "score"}`,
  `{id: "score", part: ["start"]}`, `["end"]`, `["name"]`, `["start",
  "label"]`, `["end", "label"]` of `score`, and `{id: "jump_from_1", part:
  ["label"]}`, never the card.
- `cmap_7` lies in `dlt_1`'s conversion maps band, centred `1.5 + 5 − 1 =
  5.5` above `dlt_1`'s line; its reach 6.5 stays within the row's half
  pitch 7, so nothing else moves. The region lies in `excerpt`'s regions
  band, `26.9765625 + B` below its line, one row wide. `excerpt`'s card
  then spans y 288.3203125 to 416.25.
- `{40, 410, 600 × 86.25}` (drawing y 330 to 416.25) gives `{id:
  "cmap_6"}` (`excerpt`'s map), `{id: "cmap_7"}`, `{id: "region_3"}`,
  `{id: "excerpt"}`, `{id: "dlt_1"}`, `{id: "dlt_1", part: ["name"]}`,
  `{id: "excerpt", part: ["name"]}`, `{id: "region_3", part: ["label"]}`;
  `excerpt`'s wedges and labels, drawn on the ancestor line above too, and
  the ancestor line `{id: "recording"}` are left out.
- Inside `dlt_1` only `{id: "cmap_7"}`, `{id: "dlt_1"}`, `{id: "dlt_1",
  part: ["name"]}`: core's containment decides by what an element belongs
  to; inside `group_1` nothing.

## The segment's Delete menu (`gap-menu.test.ts`)

The menu asking how to close the gap a deleted segment leaves is not
mounted by the canvas yet; its test mounts it alone on the options core
gives for `t2` of `segment_children`, written out literally (all four
permitted with `theme` unlocked; as the file is, both shifts refused with
`its segment line theme is locked`), which core's own segment tests pin. It offers the four ways in core's order, each named
by the neighbour that moves; a way not permitted is disabled with its
reason as its title, a permitted one enabled without a title; the first
permitted way is preselected and takes the focus; Enter and OK confirm,
Escape and Cancel cancel, and only a permitted way can be chosen.

## Package (`name.test.ts`)

The package exports its exact name `"@timetoalign/tilie-arranger"`; its
surface is `Canvas`, `liveStore`, `addCommand`, the selection helpers
`resolveSelection`, `blockOf`, `existing`, `editedSelection`,
`selectionOf`, `isSelected` and `NOTHING_SELECTED`, the key helpers
`isTextInput` and `within`, `drawingOf`, `placeChange` and
`changedPlace`, the inspector's readers `blockBox`, `boxOf`, `keyedBox`,
`isItem`, `isHeld`, `fieldsOf`, `levelOf` and `shownValues`, and
`placeEdit`; tests import everything else from its modules. `pnpm typecheck` type-checks
`src` and `tests` strictly, and the workspace's dependency rules keep it
on `writers`, `layout`, `core`, `svelte` and `@xyflow/svelte`.

## The canvas components

The components are mounted in jsdom with Svelte's `mount`, with the
screen APIs jsdom lacks (media queries, resize observers, pointer capture,
screen matrices) stubbed. They own no arithmetic: every command a gesture
or a key stores, and every preview it shows, is the one the sections
above derive. So a component test proves the wiring at the gesture
boundary: for a press, its moves and its release, that command reaches
the store exactly once, each preview is that command applied by core,
and the preview is withdrawn at the end. A number in these tests is a
screen position chosen for the case or a value derived above.

### The block node (`components.test.ts`, `block-node.test.ts`)

1. **Screen equals export.** For every case of the installed schema
   package's drawing fixtures, the drawing is made from its `inputs.json`
   alone and rendered by the node at the case's scale. The node's `<svg>`
   is in the SVG namespace, its `width` and `height` are the drawing's box
   times the scale, its `viewBox` is the drawing's box, and its element
   tree (local name, namespace, attributes in order, text) equals that of
   the case's `figure.svg` (its `data-id`, `data-facet` and `data-part`
   included). Text and attribute values are set as text, never parsed as
   markup. A test reads the address a drawn element draws from the source
   of its descriptor (`sourceAt`), never from its attributes.
2. **A selection marks, and changes nothing else.** On `styled__score`
   with the region `{id: "intro"}` selected, exactly that element carries
   `data-selected`, the block's node alone carries
   `data-contains-selection`, and holding marks are drawn after the drawing
   for the block and for `score`'s card, no drawn rectangle marked. On
   `nested`, the three descriptors of `{id: "clt_2"}` are `data-affected`
   beside the selected `{id: "clt_3"}`. On `bundle__bundle_shared_parent`,
   `{id: "score"}` and `{id: "exposition", part: ["start"]}` mark all ten
   descriptors drawing them, on both ancestor lines. Nothing selected,
   nothing marked. Each time, the tree without the marks and those
   attributes still equals `figure.svg`.
3. **Boxes are marked over the drawing**, in one vocabulary: every mark is
   a `.tilie-mark` element named by `data-mark` (`selection`, `hover` or
   `holding`), `data-marks` (the key, `addressKey`, of the element address
   marked: `{}` for the block) and `data-box` (`block`, `frame`, `card` or
   `band`, none for a boundary). A mark writes no `data-id`, `data-facet`
   or `data-part`. A selected frame or card is never marked on itself: its
   mark copies its own rectangle's outline (`x`, `y`, `width`, `height`,
   `rx`), never its shadow's. **One address, two cards**: on
   `bundle_shared_member` with `{id: "t", part: ["card"]}` selected, both
   cards of `t` carry a selection mark, `data-box="card"`, `data-marks` that
   address's key, each the outline of its own rectangle, the element its
   record (`{item: "g1", member: "t"}`, then `{item: "g2", member: "t"}`)
   names as the first of its range. A hover mark copies the box under the
   pointer, or a boundary's line with every attribute but its address: on
   `segment_line`, the middle of `b2`'s boundary marks the card of `form`
   and `{id: "b2", part: ["start"]}`. A redraw with a restyled boundary keeps every drawn element
   and both marks; moving onto the card removes one mark and changes no
   drawn element, which a mutation observer records. With a button held
   the drawing's matrix is not read; it is read once on the next move. On
   `group_child_member`, the frame under the pointer is marked, a point on
   the line `recording` marks its card rather than the frame around it,
   and a selected frame shows its selection mark rather than a hover mark;
   the marks then are the block's holding mark (`data-marks="{}"`), the
   frame's selection mark and the card's hover mark, in that order.
   A hover marks only inside the edited element: in `group_1`'s editor on
   `bundle_mixed`, the centre of the member `score`'s card marks it, and
   the centre of the ungrouped `annotations`'s card marks nothing.
4. **What a press is taken for.** On the arranger nothing in a drawing
   takes a press. In the bundle editor every item's own rectangle does,
   in a group's editor each card the edited frame holds, and in a
   timeline editor, in another block or on a locked canvas nothing.
5. **Each gesture ends in the calls its command predicts.** An item drag
   of `group_2` in `bundle_mixed` to (40, 200) stores the place the items
   section derives, the other items' drawn places stated; in `over`,
   moving `annotations`' card along leaves `group_1`'s frame under it
   where it is. Dragged with `annotations`
   selected, both move by one travel in one `set`; dragged while outside
   the selection, it moves alone and is selected. At zoom 2 and block
   scale 1.25 the travel is divided by both, not read through the
   drawing's matrix. A reorder of a frame's cards selects the card
   (`{block: A, id: "score", part: ["card"]}`), previews each order and
   stores one `set` (`{target: {block: A, id: "group_1"}, values: {order:
   null}}`); its copy, which writes no address, then settles. At the
   release the copy is drawn where it was dropped (`transform`
   `translate(10 100)`) and no animation has started, so the first frame
   painted after the release shows it there whenever an engine dates an
   animation's start; on the next animation frame one Web Animation moves
   the copy from `translate(10px, 100px)`, the travel at the drop, to the
   card's place in the shown view (`translate(0px, 0px)`, the recording
   actions storing nothing), over `√d × 120` ms (`d` the screen distance,
   `√(10² + 100²)` at the identity matrix), easing
   `cubic-bezier(0.33, 1, 0.68, 1)`, holding its end (`fill: forwards`),
   the card hidden until it finishes. A copy gone before that frame (the
   node unmounted) starts no animation. Under reduced motion the copy goes
   at once. A click within the click distance, a drag back to its start
   and Escape store nothing.
6. **Bands in the timeline editor**, on **stated records** of `score`
   (its conversion maps, markers and flow control bands on its line at
   100, 540 wide from x 16, held by `{item: "group_1", member: "score"}`):
   the band under the pointer gets a hover mark (`data-box="band"`,
   `data-marks` the key of its address `{id: "score", facet: "markers"}`,
   the record's rectangle), a selected band a selection mark after the
   holding marks (`block`, `frame`, `card`), a band both only the
   selection's. A drag past the click distance selects the band (`{block:
   A, id: "score", facet: "markers"}`), previews and stores one `set` of
   `order` (`[children, conversion_maps, markers, line, regions,
   flow_control]` on `{block: A, id: "score"}`), reading every drop against
   the drawing at the press, never a preview's. A click, a release in
   place, Escape, a locked canvas, Shift and a press on an element over
   the band store nothing; outside its timeline's editor no band is
   marked or moved.
7. **Fading, keys and slides.** Outside the edited element everything is
   `data-outside`, on the arranger and in the bundle editor nothing;
   another block fades through its node. A reorder keeps every element
   (by key) and slides them only while a reorder previews an order, never
   under reduced motion; the dragged card's own elements, hidden under its
   copy, never slide (the 15 of `score`'s card), so the card always lies
   where it drops.
8. **The toolbars' keys.** On a toolbar of `a`, `b` (disabled) and `c`,
   the arrows move the focus and the tab stop past `b` and wrap, Home and
   End go to the ends, a vertical toolbar uses Up and Down instead, and a
   disabled or detached button hands the tab stop on.

### The canvas in an editor (`canvas-editors.test.ts`)

Mounted on a store holding `bundle_mixed` at (40, 80) and `bare` at
(1000, 0). The editor targets are those the editors section derives.

1. **Opening.** A double-click opens the box it hits: the block's
   background, a frame, a card, or the timeline a line belongs to. Text
   opens the box drawn under it. The edited element itself opens nothing
   and closes nothing, while a box inside it opens on top. Enter opens the single selected
   address, read from the drawing and never the document. Two taps within
   300 ms and 10 px on one target act as one double-click.
2. **Closing.** A double-click outside the edited element closes the
   innermost editor, as Done does; a double tap there closes one level
   only. On the arranger it does nothing, and nothing is journalled.
   Escape first ends a gesture (an item drag included), then clears the
   selection, then closes the editor.
3. **Surroundings.** Other blocks are neither selectable nor draggable.
   A click outside the edited element clears the selection wherever it
   lands: on another block's faded node, on the pane, and on a faded
   frame of the edited block (`group_2` in `group_1`'s editor) alike;
   Shift and such a click leave it. A click inside still selects what it
   hits (`score`'s card, `{block: A, id: "score", part: ["card"]}`, in
   `group_1`'s editor). A marquee selects only elements inside the edited
   element: in `dlt_1`'s editor on the marquee's view the rectangle of the
   marquee section selects `{block: A, id: "cmap_7"}`, `{block: A, id:
   "dlt_1"}` and `{block: A, id: "dlt_1", part: ["name"]}`, in `group_1`'s
   nothing. A refusal of the store is shown in the status line with the
   store's own message.
4. **The view.** Opening moves the view to the edited element: opening
   `group_1` on a canvas of 10000 × 10000 px shows it at (3683.03…,
   4226.3125), zoom 4. Closing returns it to where each level was entered
   from. A level opened during a move returns to where that move was
   heading. A canvas that changes size centres the edited element again,
   unless the size is the one it was focused at. A double-click on the
   edited element (in `group_1`'s editor, on its frame) moves a view
   panned away back to exactly the viewport opening gave, and changes
   neither the editing path nor the journal; under reduced motion at once,
   otherwise by the time the opening's own move has ended (read 1100 ms
   later, past `FOCUS_DURATION`), since it is the opening's centring run
   again.
5. **The resize toolbar** offers the modes each level allows and sits
   above the selected item rather than its block (above the block on the
   arranger), following it. It stores a frame's resize in one `set` that
   moves nothing else, and resizes the edited block in the bundle editor
   as on the arranger.
6. **Bands.** A click selects a band, also on a locked canvas, and
   opens nothing. Ctrl or Cmd with an arrow steps the single selected
   band past the next visible entry, in one `set` per step; the key is
   the canvas's whenever a band is selected, and nothing is stored where
   the band cannot step, several are selected, or the canvas is locked.
   On `bundle_mixed`, `score` has the default order; its markers band
   `{block: A, id: "score", facet: "markers"}` stepped up stores `[children,
   conversion_maps, markers, line, regions, flow_control]`, stepped down
   again the entry goes (the inherited order).

### The gesture engine (`gestures.test.ts`, `motion.test.ts`)

A recording strategy stands for the four the canvas uses (an item, a held
card, a band, a resize handle), so the engine is proven once.

1. **A press** is read in the drawing's units through its `<svg>`'s
   screen matrix, never the element's, and at its screen point outside a
   drawing. A refused press leaves the element unmarked and uncaptured.
   A taken one marks it `nodrag nopan` and captures the pointer until the
   release, keeping marks it carried of its own. Only the primary button
   presses.
2. **The click distance** is 4 screen px unless the gesture states its
   own. A press released within it starts, previews and dispatches
   nothing.
3. **A gesture** starts once, previews each new value once, reading every
   point through the matrix of the moment, and dispatches one command on
   release. It previews nothing for a point with no value and dispatches
   nothing when the command changes nothing. It is withdrawn when its
   element goes away.
4. **Ending without a command**: the canvas's slot, Escape (taken from
   the page, but left to the canvas before the click distance) and a
   cancelled pointer each withdraw the preview. The click a release fires
   is swallowed, but not one without a pointer nor one a task later.
5. **Pointer targets** are read back as the descriptor they draw and
   nothing else, in the drawing's units through their `<svg>`'s matrix,
   and give no point off a drawing or under a singular matrix.
6. **Sliding.** A screen offset becomes drawing units through the
   inverse of the element's whole linear matrix, behind its own
   transform. It lasts √d × 120 ms, or no time when asked, and does not
   animate an element without an invertible matrix.

### The resize toolbar (`resize-toolbar.test.ts`)

Mounted inside a canvas of one node, on the box of `bundle_mixed`'s
drawing found by an element address: `{}` for the block, `{id: "group_1"}` for
a frame, `{id: "annotations", part: ["card"]}` or `{id: "performance",
part: ["card"]}` for a card. The modes and handles follow the
editors section: every mode for a block on the arranger, a frame scaled
from its corners, the edited block and its cards in the bundle editor,
the edited frame and its held cards in a group's editor, and the edited
card in a timeline editor. Nothing is shown where the level does not
resize the box, and a locked canvas shows no handle and disables the
modes. A handle's drag by (60, 0) previews and stores exactly the command
the resize sections derive for that delta, for a block and for a frame.
A click and an Escape store nothing.

### The resize toolbar while boxes move (`resize-toolbar-moves.test.ts`, `gestures.test.ts`)

A move leaves no handle behind: while boxes are being moved the resize
toolbar is not in the document at all, neither a `handle-*` nor a
`mode-*` element, and once the move ends it is there again at the bounds
the store leaves. A resize is not a move: through a handle's drag every
handle and the mode menu stay. Keys move without a drag and hide nothing.

The expected bounds are never read off the toolbar: a block's are its
node position derived from the block as stored (its place origin less
its drawing's origin times its scale), a frame's that node position plus
the frame's rectangle in the block's drawing times the scale. The
`handle-top-left` element sits at the bounds' top-left corner in canvas
units (its `left` and `top`). Mounted on `bundle_mixed` alone at (40, 80)
(no other block to snap to), with the canvas at (100, 100), zoom 1, and
the resize mode Box (8 handles: four corners, four sides).

1. **A block dragged on the arranger.** `{block: A}` selected shows 8
   handles and the three mode buttons, the top-left handle at A's node
   position. A press on A's node moved 32 by 24 screen px (past Svelte
   Flow's drag threshold) removes every handle and mode button; they stay
   absent through a further move by (8, 6). The release stores one entry at the
   level (`entries`), and the 8 handles and three buttons are back, the top-left
   handle at A's node position derived from the block now stored, exactly
   (48, 88). Derivation: A's drawing origin is (0, 0) (`mixed`), so its node
   position before the press is its place, (40, 80). Svelte Flow's drag
   threshold is 1 screen px, so the drag starts at the first move, (32, 24),
   and takes the node's offset from the pointer there: at that point the
   node stays at (40, 80). The further move by (8, 6) at zoom 1 puts it at
   (48, 86), which Svelte Flow's grid (the workspace's default, size 8,
   snapping) rounds to (48, 88) (86 / 8 = 10.75, rounded to 11). The
   arranger's snap quantizes that to the same grid, (48, 88), and finds no
   other block to align to; with the origin (0, 0) the stored place is
   `{x: 48, y: 88}` and the node position (48, 88).
2. **A block drag that stores nothing** (the grid not snapping, the
   press moved 32 by 24 and released there: Svelte Flow starts the drag
   where the pointer passes its threshold and moves the node from that
   point on, so the node has not moved, no command is made, and the canvas
   shows the projection again, as when the store refuses a command): no
   entry is stored
   and the toolbar is back at the original node position.
3. **A frame moved in the bundle editor.** `{block: A}` opened,
   `{block: A, id: "group_2"}` selected: a press on the frame's own
   rectangle moved by (40, 24) hides the toolbar; the release stores one
   entry and shows it at `group_2`'s bounds derived from the block now
   stored, exactly (848, 766.0390625). Derivation: before the press the
   bounds' corner is A's node position (40, 80) plus `group_2`'s place (8,
   206.0390625) (`bundle_mixed`'s table; `dlt_1` only lengthens `excerpt`
   below it), (48, 286.0390625). Opening the editor centres `group_2`'s
   frame: jsdom lays the pane out at 0 by 0, so the fitting zoom is 0 and
   is clamped to the focus's least zoom, 0.05, the zoom at the press. The
   frame's place moves by the screen travel divided by that zoom and by
   A's scale 1, (40 / 0.05, 24 / 0.05) = (800, 480), to (808,
   686.0390625), quantized to `GRID_FREE` unchanged. Every item stays
   right of and below the block's border, so A's place origin stays (0, 0)
   and its node position (40, 80): the corner is (40 + 808, 80 +
   686.0390625). The same press and move ended by Escape, or by a cancelled
   pointer, stores nothing and shows it at the original bounds.
4. **A handle's resize.** With `{block: A}` selected on the arranger, a
   press on `handle-right` moved by 60 px keeps the 8 handles and the
   three mode buttons in the document during the drag and after the
   release.
5. **The slot hears the move** (`gestures.test.ts`, with the recording
   strategy): a slot told of every change hears nothing for a press
   within the click distance; a strategy that moves boxes makes it hear
   `true` once the press passes the click distance and `false` once it
   ends, by release, by Escape and by a cancelled pointer alike; one that
   does not move boxes makes it hear `false` at its start and its end. The
   item, held-card and band strategies declare that they move boxes, the
   resize handle's does not.
6. **A block drag Svelte Flow never stops.** Svelte Flow skips
   `onnodedragstop` when it aborts a drag itself (a second touch, the
   dragged node removed), so the end of the press and the dragged block
   leaving the view end the move as well. On the view of case 2 (the grid
   not snapping), the press on A's node moved 32 by 24 hides the toolbar;
   a `pointercancel` on the window, with no mouse release before it, shows
   the 8 handles and three buttons again at the node position before the
   press. The mouse release that ends Svelte Flow's gesture afterwards, at
   that same point, stores nothing and keeps them there.
7. **The dragged block removed mid-drag.** Only mouse events are sent,
   so no pointer event ends the press. The press on A's node moved 32 by
   24 hides the toolbar; a `remove` of `{block: A}` is accepted by the
   store; a further mouse move by (8, 6), on which Svelte Flow aborts the
   drag (its node gone), and the mouse release, after which it calls no
   `onnodedragstop`, follow. Undoing the removal brings A back, still
   selected, and with it the 8 handles and three buttons at A's node
   position before the press: a move still marked in progress would keep
   them hidden.

### The store as Svelte state (`live-store.svelte.test.ts`)

`liveStore` returns every value of the store as its own, never a copy,
including the count of opened editors. An effect reading the view, the
editing path, the changes and that count runs once per change of the
store. The store is subscribed only while an effect reads it.

### The live placement of items and cards (`live-items.test.ts`)

Nothing is reported before a gesture. In the bundle editor of
`bundle_mixed` (opened on `{block: A}`), with `{block: A, id: "group_1"}`
selected, a Stretch of `group_1` by 60 px reports the block's
placement as stored, with the drawing its node shows; that drawing equals
the drawing of the places stored on release, `group_1` at length 460. An
item drag of `group_2`, pressed on its frame's own rectangle (the one
element of the node's drawing carrying `data-id="group_2"` and neither
`data-facet` nor `data-part`), reports, before release, the drawing of what the
release stores: `group_2` at (48, 230.0390625). Both report `null` once
the gesture ends.
