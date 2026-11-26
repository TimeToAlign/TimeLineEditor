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

**Minted IDs.** What a command creates beyond the IDs it gives (`ids`)
is minted by a minter of a fixed seed: one for the test file where a view
is changed (`changed`), one per store (`storeOf`), so the IDs are the
same every run. A test names only an ID its command gives (a speaking
one: `four`, `mark`, `gap`, `late_origin`) or one a fixture states, never
a minted one.

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

**Ancestor cards.** The defaults show every ancestor card (section 8.8):
the root of a member that is a child timeline, drawn whole behind its
frame, aligned to that member. It takes no room, but the block grows to
hold it, so the place origin moves by as much as it reaches left of the
padding or above it, and every other element lies where it lies without
it, moved by that origin. In `group_child_member` `piece`'s card reaches
368 left of the frame (TimeToShare's derivation of
`group__group_child_member`): the origin is (368, 0) and everything else
lies 368 further right; in `bundle_mixed` `recording`'s card lies behind
`group_2`'s frame, aligned to `excerpt`; in `bundle_shared_parent`
`score` has one behind each frame. The values of this file are derived
without the ancestor cards wherever a test's subject is something else (a
box under a point, a mark, a place origin, a resize, a viewport): those tests draw under the workspace rule `{"select":
{"element": "ancestor_card"}, "set": {"display": "none"}}` (`support.ts`
`withoutAncestorCards`), which hides them, so their cards take no room and
the origin does not move. The tests of what the user sees by default (the
descriptors and boxes a drawing records, the holding of an element drawn
in an ancestor card, the ancestor cards themselves) keep the defaults, and
their values below count the ancestor cards.

**Whole ancestor cards (the Full view).** The defaults also elide an
ancestor card (section 8.9, Elided and full): a stretch of the root far
from the member is cut out and drawn as a gap, which changes where the
card's lines lie and what a point on them reads. In `bundle_mixed`,
`bundle_shared_parent`, `group_grandchild` and `group_parents_mixed`
(and `group_parent_both` at a larger scale) the defaults elide. The
values of the tests whose subject is an ancestor card but not its
elision (where its lines lie, what a reading or a pin on them lists, what
the marquee and the viewport take of it, the screen order of its
matches) are derived on whole cards: those tests draw under the
workspace rule `{"select": {"element": "elision"}, "set": {"display":
"none"}}` (`support.ts` `withFullCards`), which draws every ancestor card
whole. Whole, a card still keeps the frame's room (section 8.8, step 2):
its axis has a seam at each border of the frame it lies behind, so what
lies of the root before the member lies left of the frame, what lies
after it right of the frame, and every item lies further right by as much
as the card then reaches left; each line of the card crossing a border
is drawn in runs, one axis each (layout's `lineAxes`, the second run on
keyed `#1`, `#2`), and a position at a seam lies on the run under the
frame (section 3.2). A reading on an elided card is the subject of its
own tests.

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
  high), `recording` (49.4765625) and `score` (81.921875: its flow
  control band, below its line, holds one flow label tier, the break
  `break_1`'s own label "Fine", `h(9) = 10.4765625`, and the symbol row of
  the break's "Fine" and its jump's 𝄊, `Hs = 2 + h(12) + 2 = 2 +
  13.96875 + 2 = 17.96875` (the symbol gap 2 on both sides of the glyph
  box); the defaults hide the jump's arc, whose row and label tier took
  `(4 + S) + 2 + h(9) = 20.4765625`, drawing.md sections 4 and 6.4), all
  527.3271484375 wide in the block, `W(L) = 127.3271484375 + L`. At the
  block's spacing `s` they lie at `28.8046875`, `92.2578125 + s` and
  `(92.2578125 + s) + 49.4765625 + s`, so the block is `H(s) = 8 + ((141.734375
  + 2s) + 83.921875)`, `233.65625 + 2s`, affine with the slope 2 of its
  two gaps: `H(8) = 249.65625`, `H(0) = 233.65625`, `H(24) =
  281.65625`. With `score` stated at `{y: 200}` (its shadow's bottom
  283.921875) the block is `8 + max(283.921875, 143.734375 + s)`: flat up
  to its knee `s = 140.1875`, slope 1 beyond.
- **`flow_control`**: the root `flow:quarters` with the break
  `break_1`, the jumps `jump_1` and `jump_2` and their jump targets
  `jump_target_1` and `jump_target_2`, which are not drawn.
  **`with_region`**: the root `clt_1` with `region_1`.
- **IDs** are unique across a whole manifest, so every element is
  addressed by its own ID wherever it lies (`{id: "tempo"}`,
  `{id: "region_1"}`, `{id: "cmap_1"}`), a part by its owner's ID and its
  words (`{id: "region_1", part: ["label"]}`), the title by `{part:
  ["name"]}`. A part, a card or a label stands for the element whose ID it
  carries; core removes any element, timelines and groups included, naming
  what goes with it, but a flow-control element, which goes only with its
  timeline: it is rejected by a belief, never deleted.
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
    `score:clt_1` carries the map `cmap_1`; a timeline without a name is
    named by its whole ID (`score:clt_1`).
  - **`bundle_shared_parent`**: `score` (0 to 32 quarters) ⊃ `exposition`
    (offset 0, 12 quarters, in `group_1` "Exposition" with `take_1`) and
    `recapitulation` (offset 20, 12 quarters, in `group_2`
    "Recapitulation" with `take_2`), then the ungrouped root `page`.
    `score` is drawn as the ancestor line of each member (section 8.3),
    four descriptors addressed `{id: "score"}` in each card: in `exposition`'s its
    line, its start dot and two chevrons at the right; in
    `recapitulation`'s its line, two chevrons at the left and its
    arrowhead. `{id: "exposition", part: ["start"]}` is drawn once, on the ancestor line (no
    line marks its own start). Every item is the drawing fixture
    `bundle__bundle_shared_parent`'s 567.3901 wide, `Wf = 2324030 / 4096 =
    567.39013671875` (the only multiple of 1/4096 that rounds to it), and
    every member's card 551.3901, `Wf − 16`. Every term of the start `s0`
    and the right margin `Mr` is a constant offset from the start or the
    shared end, and no segment label is wide enough to set `s0`, so every
    width grows by exactly the length: `Wf(L) = 167.39013671875 + L` for a
    frame or the ungrouped card, `Wc(L) = 151.39013671875 + L` for a
    member's card, the block `Wb(L) = 185.39013671875 + L` (585.3901 at 400,
    the fixture's block without its two ancestor cards of `score`, the
    figure `bundle__bundle_shared_parent` draws them).
  - **`bundle_shared_member`**: roots `t` (quarters), `u` (seconds) and
    `v` (pixels), groups `g1` of `t`, `u` and `g2` of `t`, `v`: `t` has a
    card in each frame, `{item: "g1", member: "t"}` and `{item: "g2",
    member: "t"}`, both addressed `{id: "t", part: ["card"]}`.
- **`bundle_mixed`** (section 8.6): groups `group_1` "Performance"
  (members `performance`, `score`, displayed `score`, `performance`) and
  `group_2` "Facsimile" (members `excerpt`, `page`, displayed `page`,
  `excerpt`; `excerpt` is a child of the root `recording`, drawn as its
  ancestor line), then the ungrouped root `annotations`. `score` carries
  the maps `cmap_1` and `cmap_2` and the jump `jump_1`, its destination labelled "Repeat";
  `performance` the map `cmap_3`; `page` `cmap_4`; `recording` `cmap_5`;
  `excerpt` `cmap_6`; `annotations` the regions `region_1` "Verse" and
  `region_2` "Chorus". Maps lie above their lines, jumps and
  regions below (section 4). Every value of this item but the bullet "With
  `recording`'s ancestor card" is derived without
  `recording`'s ancestor card behind `group_2`'s frame (the workspace rule
  above), which, drawn by the defaults, reaches left of the padding and
  moves the place origin, and lowers `annotations`; the tests whose subject is a canvas position, a
  place origin or a size of this block draw it so. With `places` empty the block holds three items
  at their default places, `x = P = 8`, one under the other the block's
  spacing 8 apart, the first `P + h(11) + F = 28.8046875` below the title
  "Mixed" (`F = 8` the gap after the title):

  | item | place key | address | `x` | `y` | `length` | `width` | `height` |
  |---|---|---|---|---|---|---|---|
  | `group_1` | `{item: "group_1"}` | `{id: "group_1"}` | 8 | 28.8046875 | 400 | 561.052001953125 | 166.7265625 |
  | `group_2` | `{item: "group_2"}` | `{id: "group_2"}` | 8 | 203.53125 | 400 | 561.052001953125 | 157.7578125 |
  | `annotations` | `{item: "annotations"}` | `{id: "annotations", part: ["card"]}` | 8 | 369.2890625 | 400 | 561.052001953125 | 71.85546875 |

  - Heights (sections 6.4, 6.5, 8.3, 8.4): the cards are `score` 76.4453125
    (two maps above; below the wedges, `S` further out, its flow control
    band, which draws nothing but the symbol 𝄇 of its jump `jump_1`, whose
    destination is a `repeat_end`: the defaults hide the jump's arc and
    with it the arc's label "Repeat", and the jump has no `label` of its
    own to stack (sections 4 and 6.4, Flow control and Symbols), so the
    band is its symbol row alone, `Hs = 2 + h(12) + 2`, the symbol gap 2
    on both sides of the glyph box, `h(12) = 2384 × 12 / 2048 = 13.96875`,
    so `Hs = 17.96875` wide, where the arc's row and label tier took `(4 +
    S) + 2 + h(9) = 20.4765625`), `performance`
    and `page` 49.4765625 (one map), `annotations` 71.85546875 (one row of
    regions), and `excerpt` 67.4765625: its map reaches `e = 1.5 + 5 = 6.5`
    above its line, so `y_root = 8 + 6.5 = 14.5`; below its line lie its
    markers band (`Eb = 26.9765625`) and, outermost, the ancestor band of
    `recording` (section 8.3, below the member in the default band order),
    from `max(p0 / 2, Eb + S) = 30.9765625`, one row `i1 + o1 = 7 + 7`
    wide: nothing but the line is drawn on an ancestor line by default (no
    mark of the member's start or end, section 8.3), so `o1 = q1 / 2`. The
    card is `14.5 + 44.9765625 + 8` high. A
    frame is its title's slot `Q + h(11) + 4 = 24.8046875`, its cards its
    spacing 8 apart and `Q = 8` below them.
  - Widths: the block holds frames, so the name column starts at `n = Q + K
    = 16` in every item; `N = 70.29150390625` (`Performance`, the widest
    name); `recording`'s ancestor line runs on to the left, so `s0 = n + N
    + G' + 8 × 3 = 118.29150390625`; `Mr = 12179 × 9 / 4096 =
    26.760498046875`, half of the coordinate label `88 200 smp` (12179
    units at size 9) of `excerpt`'s `length` timestamp `timestamp_4`,
    centred on the shared end, the widest label there. So every item spans
    0 to `s0 + 400 + Mr + K + Q = 561.052001953125`, and as neither `s0`
    nor `Mr` depends on a length, `W(L) = 161.052001953125 + L`. The held
    cards span `Q = 8` to `Ri + K` in item coordinates: they lie at x 16
    and are 545.052001953125 wide, `Wc(L) = 145.052001953125 + L` (the cards `{item: "group_1", member: "score"}` at y 53.609375,
    `{item: "group_1", member: "performance"}` at 138.0546875, `{item:
    "group_2", member: "page"}` at 228.3359375 and `{item: "group_2", member:
    "excerpt"}` at 285.8125). Every line runs from `8 + s0 =
    126.29150390625` to 526.29150390625. The block is
    `P + 561.052001953125 + 2 + P = 579.052001953125` by `369.2890625 +
    71.85546875 + 2 + P = 451.14453125` (the ungrouped card's shadow), its
    place origin at `(0, 0)`.
  - **With `recording`'s ancestor card** (the defaults, which the tests of
    the item commands draw: `itemMoveCommand`, `itemResizeValues`,
    `itemResizeCommand`, `placeEdit`, the item move of `BlockNode` and the
    live placements). The card takes no room in the horizontal layout or in
    `group_2`'s frame, but an item's default `y` lies the block's spacing
    below the largest bottom edge of the items before it **and of their
    displayed ancestor cards** (sections 8.6 and 8.8, No room; the first
    item keeps its `y`, shadows not counted). `recording`'s card behind
    `group_2`, elided by default (section 8.9), is aligned to `excerpt`
    (section 8.8): above `recording`'s line it holds `excerpt`'s row as
    `excerpt`'s card holds `excerpt`'s line above `recording`'s ancestor
    row, so its top is `excerpt`'s card's, 285.8125; below its line its
    markers band holds the name labels of its derived gaps, one line,
    reaching `w/2 + 13 + 2 + h(9) = 1.5 + 13 + 2 + 10.4765625 = 26.9765625`
    below the line (sections 6.4, 6.6), where the ancestor row of
    `excerpt`'s card reaches only its half pitch 7: the card is `67.4765625
    + (26.9765625 − 7) = 87.453125` high and ends at 373.265625,
    11.9765625 below `group_2`'s frame (`203.53125 + 157.7578125 =
    361.2890625`). So `annotations` lies at `373.265625 + 8 = 381.265625`
    (not the table's 369.2890625), `group_1` and `group_2` where the table
    puts them, and the block is `381.265625 + 71.85546875 + 2 + P =
    463.12109375` high. Every value below that reads `annotations`' drawn
    `y` at the defaults is derived from 381.265625; a test drawing the card
    hidden reads the table's.
  - **Moved left and up:** with `annotations` placed at `{x: −30, y: −20}`
    the block reaches `−30 − P = −38` on the left and `−20 − 28.8046875` at
    the top (section 8.4: the title's slot is the items' top border), so
    the place origin lies at `(38, 48.8046875)`, and the block is `(8 +
    569.052001953125) + 38 = 615.052001953125` wide and `(8 + 203.53125
    + 157.7578125) + 48.8046875 = 418.09375` high. With `{x: −30}` alone
    the origin is `(38, 0)` in `615.052001953125 × 451.14453125`.
  - **`mixed`** is `bundle_mixed` with the child `dlt_1` (`samples`,
    offset 0, length 44100, half of `excerpt`) added to `excerpt`, drawn
    on `excerpt`'s card from x 126.29150390625 to `126.29150390625 + 400 ×
    1/2` in the children band above `excerpt`'s line (section 6.4). That
    band starts at `max(p0 / 2, 6.5 + S) = 10.5` and ends at `10.5 + 14`,
    the child's line `10.5 + 7 = 17.5` above `excerpt`'s, so `y_root = 8 +
    24.5 = 32.5`; below the line lie its markers band (`Eb =
    26.9765625`) and, outermost, the ancestor band of `recording`
    (`recording`'s band order puts its children above its line, so its
    line lies below the member; layout's README, "Ancestor lines"), from
    `max(7, 26.9765625 + 4) = 30.9765625`, one row `7 + 7`: the
    card is `32.5 + 44.9765625 + 8 = 85.4765625` high, 18 more than
    without `dlt_1` (`14.5 + 44.9765625 + 8`). From the card's top
    285.8125, `excerpt`'s line lies at 318.3125, `dlt_1`'s at
    300.8125 and `recording`'s ancestor line at 356.2890625; `dlt_1`'s
    name `{id: "dlt_1", part: ["name"]}`, anchored at x `8 + n = 24` and
    26.85009765625 wide, is centred on its line and spans y 294.41015625
    to 307.21484375 (`h(11)` high). The child
    changes neither `N`, `s0` nor `Mr`. `mixed`'s block is `579.052001953125
    × 469.14453125`: `group_2` is 175.7578125 high and `annotations` lies at
    y 387.2890625.

## Numbers on the canvas (`numbers.test.ts`)

Every stored position and size is a multiple of a step: the grid's size
when it snaps, else 1/2048, the metrics table's units per em, so text-derived
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
workspace, manifest, in that order (section 1); the workspace layer is
the workspace's own `graphical`, never a setting. Asked twice for one
block and one workspace `graphical` it is the identical object, also after
the grid is configured (the settings are no input of a drawing); after a
`set` of the workspace's `graphical` it shows the rule (a block fill of
`#FFFFFF`). Overrides draw the placement they give: drawn at length 800
`bare` is `W(800) = 876.5771484375` wide and the block's own drawing stays
the length-400 one; `bundle_mixed` with `annotations` at `{x: −30}`, its
ancestor card hidden, has the origin `(38, 0)`, overridden with no places
`(0, 0)`.

**Equal placements share a drawing.** A resize measures the block at many
placements on every pointer move, and the preview then draws the block it
stores, so drawings are also remembered by the manifest and the values of
the placement (`length`, `spacing`, `margin`, `width`, `height` and
`places`, compared by value), the 32 placements of a
manifest drawn last. What proves it: `bare` overridden to length 800 twice
is the identical drawing, and the block `set` to length 800, a new block
object, draws that identical drawing too; places equal by value but built anew
(`{annotations: {x: −30}}` written twice) share one drawing, while
`{x: −30}` and `{x: −31}` do not. Such a drawing is never served under
another workspace `graphical`: after the `set` of the workspace's `graphical` the length
800 drawing is a new one that shows the fill. After 32 other placements
of `bare` (lengths 801 to 832) the length-800 drawing is drawn anew, equal
to the first but not identical; asked again right after it is identical.

**The arrangement is part of the placement.** A block's `arrangement`
reaches layout as the placement's, and drawings are remembered by it as
by the other members. What proves it, on `bundle_arranged_roots` with
`{direction: horizontal, order: [page, group_3, group_1, group_2]}` set
on the block (core stores its row, `[page, group_1, group_2, group_3]`,
as the order): its drawing equals layout's drawing of the manifest with
that arrangement in the placement, states the arrangement (direction
horizontal, that row, roots `[score, session]`, nothing refused), and is
not the
drawing of the same manifest object in the block before the `set`, which
states none; overriding with an equal arrangement built anew serves the
block's own drawing.

**The reading of flow control comes from the pane.** A canvas's pane
carries the host's reading of flow control per block (`readingOf`), and
the block's drawing is layout's drawn with that reading (drawing.md
section 1), remembered by it as by the placement. What proves it, on
`flow/repairs` (the actor `https://example.org/people/editor` believes
`jump_1` `false`, `jump_2` `true`, nothing of `barline_1`): read for that
actor with the states `true`, `unlikely`, the drawing equals layout's
drawing with that reading, and `barline_1` is faded (0.35, undecided and
not kept). No pane, a pane without `readingOf` and a pane reading `null`
serve one identical drawing, `barline_1` at 1; a pane reading for another
actor with `true` alone draws a different one, `barline_1` at 0.35,
served identically when asked again.

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
  the wedges of its named timestamps `origin` and `length` (`{id:
  "timestamp_1"}`, `{id: "timestamp_2"}`), its name `{id: "bare", part:
  ["name"]}`, and their coordinate labels (`{id: "timestamp_1", part:
  ["coordinate"]}`, then `timestamp_2`'s), in drawing order.
- **A node lies at its place origin** (section 8.6): `bundle_mixed` at
  (40, 80) with `annotations` at `{x: −30, y: −20}`, its ancestor card
  hidden, lies at `(2,
  31.1953125)`, `615.052001953125 × 418.09375`; at scale 2 at `(−36,
  −17.609375)`, `1230.10400390625 × 836.1875`. With no places the node
  lies at the block's `x`, `y`.
- **Editors.** A holds `bundle_mixed` at (40, 80), B `bare` at (600, 0).
  In A's bundle editor A's node is not draggable and holds every drawn
  address inside; B's node is unselectable, undraggable, of class
  `tilie-outside`, nothing inside. In the group editor of `group_1`
  what lies inside is what core's containment puts inside the group, in
  drawing order: the frame `{id: "group_1"}` and its title `{id:
  "group_1", part: ["name"]}`, then each member's card and every address
  drawn on it (`score`'s card, its maps `cmap_1`, `cmap_2`, its line,
  the wedges of its named timestamps `origin` and `length`
  (`timestamp_9`, `timestamp_10`), its name, their coordinate labels, the
  jump's symbol `{id: "jump_1", part: ["symbol"]}`, the defaults hiding
  its arc and the arc's label; `performance`'s card, its map `cmap_3`, its
  line, `timestamp_7`'s and `timestamp_8`'s wedges, its name, their
  labels), never the manifest's title, `group_2` or `annotations`; in
  `annotations`' timeline editor its card and every address drawn on it,
  its named timestamps `timestamp_1` and `timestamp_2` among them.
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

`audio` is `corpus_audio_audio` at (40, 80) as the editor imports it
(core's `importedManifest`: a manifest without `graphical` gets its root's
named timestamps `origin` at 0 and `length` at its length, each drawing
its wedge and its coordinate label) with every name hidden. Its one
timeline is an audio file in samples (an int axis of length 10188800,
with a map to seconds, which sets neither margin): its labels, core's pretty
texts, are "0 smp" and "10 188 800 smp" (the digits grouped in threes),
6316 × 9 / 2048 = 27.755859375 and 16739 × 9 / 2048 = 73.56005859375 wide
(the bundled font's advances at size 9). With no name drawn the start is
`s0 = 16 + max(27.755859375 / 2, 73.56005859375 / 2 − L)` in the block and
the end label sets the right margin, so `W` is flat at `16 +
73.56005859375 + 18 = 107.56005859375` below the knee `L* =
(73.56005859375 − 27.755859375) / 2 = 22.902099609375` and
`84.657958984375 + L` above it. `L*` is no multiple of 1/2048 (46903.5
steps): the lattice knee is `46903 / 2048 = 22.90185546875`, the last step
on the flat piece.

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
| ungrouped, `score` at `{y: 200}` | bottom | (0, 50) | `{spacing: 190.1875}` (across the knee: `143.734375 + s ≤ 333.921875`) |
| audio | right | (−500, 0) | `{length: 22.90185546875}` (the lattice knee) |
| audio, length 8 | right | (50, 0) | `{length: 72.90185546875}` (8 lies below the knee, so the travel adds to the flat 107.56005859375: `L ≤ 72.902099609375`) |
| audio, at the knee (length 22.90185546875) | right | (100, 0) | `{length: 122.90185546875}` |
| bare, width `2 Wc(400)` | right / left | (40, 0) / (−42, 0) | `{length: 420, width: 993.154296875}` / `{length: 421, width: 995.154296875, x: −2}` |
| ungrouped, height `2 H(8)` = 499.3125 | bottom / top | (0, 32) / (0, −32) | `{spacing: 16, height: 531.3125}` / the same with `y: 48` (the request keeps its proportion 2, so `2 H(s) ≤ 499.3125 + 32` and `H(s) = 265.65625` at `s = 16`) |
| ungrouped, width `2 W(400)` = 1054.654296875 and height `2 H(8)` | bottom-right | (40, 32) | `{length: 420, spacing: 16, width: 1094.654296875, height: 531.3125}` |
| bare, length 500, width 496.58 | right | (20, 0) | `{length: 520, width: null}` (a request the content overtook) |
| child member, width 600 (its ancestor card hidden) | right | (50, 0) | `{length: 446.134765625, width: 650}` (the block's content `Wb(L) = 153.61962890625 + L`: `s0 = 16 + 64.61962890625 + 8 + 8 × 3`, the right margin `Mr = 3w = 9`, the tips of the arrowheads of `piece`'s ancestor line and of `recording`'s line past the shared end (no mark of the member's end on the ancestor line, so no label there, section 8.3), the frame and the block 32 wider than the card; 913685 steps would draw 650.0003…) |

**The shortening lock.** On `bundle_shared_parent`, its ancestor cards
hidden (`Wb(L) = 185.39013671875 + L`): Box right by 585.39013671875 gives `{width:
1170.7802734375}`, twice the content; Stretch right by 100 `{length: 450,
width: 1270.7802734375}`; back by 200 `{length: 350, width:
1070.7802734375}`: a stretch back shrinks the block.

**The node's edges stay, not the place origin.** On `bundle_mixed`, its
ancestor card hidden, with `group_2` at `{width: 600}` and `annotations`
at `{x: −30}` (node at x 2,
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
places. On `bundle_mixed`, its ancestor card hidden, with `group_2` at
`{x: 40, y: 200, width: 700}`, right by 74 gives the changes `[{target: {block: A}, values: {length:
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
command not refused is accepted, the removed IDs gone from the manifest
and every other ID kept (`with_region` keeps `clt_1`, `clt_2`, `clt_3` and
the named timestamps `timestamp_1`, `timestamp_2` without `region_1`;
`nested` keeps `clt_1`, `timestamp_1`, `timestamp_2` without `clt_3`).
The tables of this section write an address by its members: `A` for
`{block: A}`, `A: clt_3` for `{block: A, id: "clt_3"}`, `A: clt_3 [name]`
for `{block: A, id: "clt_3", part: ["name"]}`, `A: [name]` for the title
`{block: A, part: ["name"]}`; without the `A:` the element address alone
(`second-half [start, label]` is `{id: "second-half", part: ["start",
"label"]}`).

| view | selection | result |
|---|---|---|
| nested | {A} / {A: clt_3} / {A: clt_3 [name], A: clt_3} | targets [A] / [A: clt_3] / [A: clt_3] |
| with_region | {A: region_1 [label]} | [A: region_1] |
| nested; B bare | {B, A: clt_1 [name]} | [B, A: clt_1] |
| any | {} | refused: `Nothing is selected.` |
| numbers | {A: region_1 [label]} or with the region | [A: region_1] |
| group_child_member | {A: second-half [start]} | [A: second-half] |
| numbers | {A: group_1 [name]} | [A: group_1] |
| corpus_mpm | {A: [name]}, or {B, A: [name]} | refused: `The title of bundle 'Beethoven_op35_1971Curzon_Var14only' is removed only with its block; select the block to delete it.` (the title's words, `addressWords`) |
| corpus_mpm | {A: cmap_1} | [A: cmap_1] |
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

On the canvas the refusal is reported to the host through `onrefuse`, as
every key refusal is, exactly once, with exactly that text: the group
editor of `group_1` opened, its group selected, Delete pressed.

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

**A flow-control element is never deleted.** On `flow_control`, the break
`break_1`, the jump `jump_1`, its label and the jump target
`jump_target_1`, each selected alone, and `break_1` with `jump_2`'s
label, are refused with `A flow-control element is not deleted; state your
belief in it in the Properties tab to reject it.`. Selected beside
something else it is left out: `{A: jump_1, A: timestamp_1, A:
break_1 [label]}` gives the targets `[A: timestamp_1]`, and the
five flow-control elements stay, in their order (`jump_target_1`, `jump_target_2`,
`jump_1`, `break_1`, `jump_2`). Its timeline takes it
along: `{A: jump_1, A: flow:quarters}` gives `[A: flow:quarters]`,
which leaves no timeline.

**A virtual card is hidden, never deleted** (`commands.test.ts`). On
`flow/virtual_cards` with `allegro_default` placed at (0, 200) and
`allegro_by_hand` at (0, 400) (each one `set` of its place), Delete on the
card `{A: allegro_default [card]}` stores one `set` unstating every member
of its stated place, `{type: "set", changes: [{target: {block: A, id:
"allegro_default"}, values: {place: {x: null, y: null}}}]}`; core applies
it, `places` no longer holds `allegro_default` and `virtual_timelines`
still holds all three. Both cards selected give one `set` with one change
each, in selection order. A place stating more members (`allegro_default`
also given `width: 300`) unstates each: `{x: null, y: null, width:
null}`. The virtual timeline's own address `{A: allegro_default}` (its
line) is removed, `remove` [`A: allegro_default`], as any element is; the
Properties tab offers the same as "Delete virtual timeline" (the editor's
README). A virtual card hidden beside an element deleted is refused whole
with `Virtual cards are hidden apart from what is deleted; select the
virtual cards alone to hide them.`: `{A: allegro_default [card], A:
section_b}`. A chunk, `{A: allegro_default [regions] [1]}` (its brace) or
its label `[1, label]`, is changed in its FlowMap, never deleted on the
canvas: alone it is refused with `A chunk is changed in its FlowMap; open
the flow editor of its root to change it.`, beside `section_b` it is
left out (`remove` [`A: section_b`]). On `groups/virtual_member` the
card of `allegro_default` in `performance`'s frame has no place of its
own to unstate: alone it is refused with `A virtual card in a frame is
not hidden; delete its virtual timeline in the Properties tab.`. A
selected virtual card takes nothing away (below): `{allegro_default
[card]}` affects nothing.

**What a deletion also takes away** is highlighted before it happens. The
rule reads the manifest alone: the owners are the IDs the selected
element addresses carry (the title carries none, a band is no owner, nor
is a flow-control element, which a deletion never takes alone); core
names what removing them removes; the result is the keys (`addressKey`) of
every drawn address of a removed element and of its parts, without the
selected addresses and the parts of a directly selected element. A
timeline's named timestamps go with it (core's `removedBy`). Hand-derived
from the fixtures' trees (`nested` `clt_1` ⊃ `clt_3` ⊃ `clt_2`; `map`
`melody`, map `tempo`, ⊃ `phrase`, map `ticks`) and their named
timestamps, each drawing its wedge and its coordinate label (`ts N` below
stands for `timestamp_N` and `timestamp_N [coordinate]`): `origin` and
`length` of `nested`'s `clt_1` (`ts 1`, `ts 2`), of `numbers`'s `score`
(`ts 5`, `ts 6`), of `group_child_member`'s `recording` (`ts 1`, `ts 2`)
and `second-half` (`ts 3`, `ts 4`, a member card's), of `map`'s `melody`
(`ts 1`, `ts 2`). A root draws no start or end marks of its own; a member
drawn below its ancestor still has the marks of its start and end on the
ancestor's line.

| fixture | selection | affected |
|---|---|---|
| nested | {clt_3} / {clt_2} / {clt_3 [name]} | {clt_2, clt_2 [name]} / ∅ / {clt_3, clt_2, clt_2 [name]} |
| nested | {clt_1} | {clt_3, clt_3 [name], clt_2, clt_2 [name], ts 1, ts 2} |
| nested | {clt_1 [name]} | {clt_1 [card], clt_1, clt_3, clt_3 [name], clt_2, clt_2 [name], ts 1, ts 2} |
| map | {phrase} / {tempo} | {ticks} / ∅ |
| map | {timestamp_1 [coordinate]} | {timestamp_1} |
| with_region | {region_1 [label]} | {region_1} |
| numbers | {region_1 [label]} / {region_1} / {score} | {region_1} / ∅ / {region_1, region_1 [label], ts 5, ts 6} |
| group_child_member | {piece} | {second-half [card], second-half, second-half [name], ts 3, ts 4, ts 3 [line], ts 4 [line]} (no mark of `second-half`'s start or end on `piece`'s ancestor line, section 8.3; its `origin` and `length` are groupstamps whose `display` holds `cross_section`, so each also draws its line) |
| group_child_member | {recording [card]} | {recording, recording [name], ts 1, ts 2} |
| corpus_mpm | {group_1} / {group_1 [name]} / {[name]} | ∅ / {group_1} / ∅ |

The element an open editor edits is never deleted, so selecting it, or a
part of it, takes nothing away; the rest of the selection still does:

| fixture | edited | selection | affected |
|---|---|---|---|
| nested | clt_3 | {clt_3} / {clt_3 [name]} | ∅ / ∅ |
| nested | clt_1 | {clt_1 [name]} / {clt_1 [name], clt_3} | ∅ / {clt_2, clt_2 [name]} |
| corpus_mpm | group_1 | {group_1 [name]} | ∅ |
| group_child_member | recording | {recording [card]} | ∅ |

On the canvas (`project.test.ts`): `mixed` with the group editor of
`group_1` open and `group_1 [name]` selected marks nothing affected; with
no editor open the same selection marks `group_1`.

**Property** (`properties.test.ts`): for one block of `bare`, `nested`,
`flow_control`, `with_region`, `map`, `group_child_member`,
`bundle_mixed` or `numbers` and any selection of its element, part and
band addresses, a selection of bands alone is refused with `A band is not
deleted; select its elements to delete them.`, and one that names beside
bands only flow-control elements with the hint above; otherwise the
command is refused exactly when core refuses a `remove` of the owners that
are no flow-control elements, and the IDs it deletes equal those owners,
the selected flow-control elements a removed timeline takes along (core's
`removedBy` of those owners) and the manifest's IDs whose addresses
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
  `group_1`'s name, the coordinate label and the name label of `page`'s
  named timestamp `timestamp_1` (`origin`, displaying its wedge and its
  coordinate) and `{id: "nobody"}` keep the first, the third, the fourth
  and the fifth (a part resolves only where its timestamp's `display`
  draws it); the title `{block: A, part:
  ["name"]}` stays while its manifest is named (`bundle_mixed`), goes on an
  anonymous one (`nested`), as core resolves it. A selection wholly kept
  is returned as the identical object, so the canvas does not re-render.
  On opening editors over `bundle_mixed` with `bare` beside it: the bundle
  editor keeps `{block: A}`, `{block: A, id: "group_1"}` and `{block: A,
  id: "annotations", part: ["card"]}` and drops `{block: B}`; `group_1`'s
  keeps `{block: A, id: "group_1"}`, `{block: A, id: "score", part:
  ["card"]}` and `{block: A, id: "performance"}` and drops `{block: A}` and
  `{block: A, id: "page", part: ["card"]}`; `score`'s, opened inside it,
  keeps `score`'s card and `score`'s named timestamp `{block: A, id:
  "timestamp_9"}` and drops `{block: A, id: "performance"}`; opened alone it keeps `{block: A,
  id: "score"}` and `{block: A, id: "score", part: ["name"]}`; opened
  inside `group_1`'s it keeps `score`'s band `{block: A, id: "score",
  facet: "conversion_maps"}` and `timestamp_9` and drops `performance`'s
  band.
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
  ["start"]}` boundaries, the wedge of `form`'s named timestamp `{id:
  "timestamp_1"}` an element; on `group_child_member`: `{id: "group_1"}`
  a frame, `{id: "recording"}` an element, `{id: "recording", part:
  ["card"]}` a card, `{id: "group_1", part: ["name"]}` an element. (No
  mark of a member's start or end is drawn on its ancestor lines any
  more, drawing.md section 8.3, so no wedge carries a member's `{id: S,
  part: ["start"]}`.)
- **An affordance** (the canvas's own wedge for a named timestamp that
  draws nothing, below in "Show coordinates") is no element of the
  drawing: its source names no element index, only the kind `affordance`
  and the timestamp's address. On `timestamps` with `display` `[]` on
  `timestamp_2`, a press on it hits the element `{block: A, id:
  "timestamp_2"}`, no box, no boundary, and selects exactly that address
  on the arranger; in the timeline editor of `clt_1` it is hit before the
  markers band under it, as a drawn element is, and selects the same.
- **The box on top under a point** is the last displayed frame or card in
  drawing order whose rectangle holds the point, edges included; a frame
  or card that is not displayed holds no point. On `segment_line` a point
  on the root's line, the middle of `b2`'s boundary and the card's two
  corners lie in `{item: "form"}`; the block's padding, just right of the
  card and the shadow's rim in none; without a point there is none. On
  `group_child_member` without its ancestor card the frame above the
  first card and the gap between the cards (`second-half`'s card ends at
  `32.8046875 + 67.37890625 = 100.18359375`, its ancestor row of `piece`
  7 + 7 wide with no mark on it, section 8.3; `recording`'s begins 8
  lower; the point (100, 104)) are the frame `{item: "group_1"}`, the
  ancestor line's start (108.61962890625, 85.18359375: the line below
  `second-half`'s, layout's README, "Ancestor lines") `{item: "group_1",
  member: "second-half"}`, `recording`'s start (120.61962890625,
  `108.18359375 + 14.40234375 = 122.5859375`) `{item: "group_1", member:
  "recording"}`. With its ancestor card, as the defaults draw it, and the
  cards hidden (`{element: card}` hides no `ancestor_card`), `recording`'s
  start lies 447.99018554687495 further right (the place origin layout
  records for the card, elided by default), at (568.609814453125,
  122.5859375), and is the frame; the point (120.61962890625,
  122.5859375) lies left of the frame (from 455.99018554687495) and below
  the ancestor card (its bottom 36.20703125 + 83.953125 = 120.16015625),
  in no box.
- **What each descriptor draws** comes from its source alone: on
  `segment_line` the block (address `{}`), the card's shadow, the card and
  the three boundaries; on `group_child_member`, as the defaults draw it,
  the roles of the descriptors 0, 1, 2, 24, 26, 27, 45 and 46 are
  asserted: the block (0), the ancestor card of `piece` `{id: "piece",
  part: ["card"]}`, its shadow (1) and its own rectangle (2), drawn after
  the block's background and before the frame (section 8.8), then the
  frame (24), `second-half`'s shadow and card (26, 27) and `recording`'s
  (45, 46). These indices follow from what lies between, which is not
  asserted descriptor by descriptor: the 21 descriptors of the ancestor
  card (3 to 23: `piece`'s line (four descriptors), `second-half`'s row
  (three), the wedges, names and coordinate labels of `second-half`'s
  `origin` and `length` groupstamps, their four cross-section pieces, then
  the card's derived elision, its ellipsis' three circles and its name
  label, the default `elision-display` `ellipsis name`), the frame's
  title (25), the 17 descriptors of `second-half`'s card (28 to 44). With
  the cards hidden: the block, the ancestor card's shadow and rectangle
  (1, 2) and the frame (24) only.
  An elision's gap, its ellipses and its continuation lines are elements,
  never a box: on `bundle_elisions_stored` every descriptor written from
  an `elision` or `ellipsis` element has the role "element", and those
  descriptors draw exactly the elisions whose gaps draw something (an
  ellipsis or a continuation; a gap writes no rectangle while unfilled),
  one element after another: `elision_4`'s gap (its continuation) and its
  ellipsis, then the carried `elision_3`'s ellipsis on `score`'s ancestor
  card, the carried `elision_3`'s on `session`'s, `elision_2`'s on
  `page`'s card, then the frame's `elision_3`'s, in that order (one
  ellipsis per gap, drawing.md section 8.9; layout's README, "Elisions",
  point 5). `elision_5` (`display` `[name]`) and `elision_6` (`[]`) draw
  neither, so no descriptor is written from their gaps.
- **What a press selects** is what it hit, inside what the level offers:
  on the arranger a card selects `{block: A, id: "recording", part:
  ["card"]}`, the frame `{block: A, id: "group_1"}`, the background
  `{block: A}`, a line, a wedge (`recording`'s named timestamp `{id:
  "timestamp_1"}`) or a title itself. The block is selected
  only on the arranger and in its own bundle editor; in the group editor
  of `group_1` on `bundle_mixed`, `score`'s card, `{id: "group_1"}` and
  `{id: "score"}` select themselves, `page`'s card, `{id: "annotations"}`,
  the title `{part: ["name"]}` and the block nothing. A selected card
  stands for its timeline for every other reader: it still exists, its
  deletion removes `{block: A, id: "recording"}`, and what it takes away
  is the timeline's other drawn addresses: `{id: "recording"}`, its name,
  and its named timestamps `timestamp_1` and `timestamp_2` (`origin`,
  `length`) with their coordinate labels.
- **What the pointer highlights** is the box on top by its place key
  (`placeKeyText`), the boundary pressed and the band pressed by their
  addresses' keys (`addressKey`): on `group_child_member` without its
  ancestor card the line `recording` highlights `{item: "group_1", member: "recording"}`, the
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
`dlt_1` under `excerpt` and a region `region_3` on `excerpt`, as the
defaults draw it (holding boxes by place key, `G › T` written for `{item:
G, member: T}`, `G` for `{item: G}`; `recording`'s ancestor card behind
`group_2`'s frame has the key `{item: "group_2", member: "recording"}`,
written group_2 ⟵ recording). The ancestor card draws `recording`'s
member drawing whole (section 8.8): `recording`'s line, the row of its
child `excerpt` and the row of `excerpt`'s child `dlt_1`, with
`excerpt`'s regions band, which the defaults show for a child as for a
root (section 4), so `region_3` is drawn there too:

| selected | holding boxes |
|---|---|
| `{id: "score"}`, or `{id: "timestamp_9"}` (the wedge of `score`'s `origin`) | group_1, group_1 › score |
| `{id: "region_3", part: ["label"]}` | group_2, group_2 › excerpt, group_2 ⟵ recording |
| `{id: "dlt_1"}`; `{id: "excerpt"}`; `{id: "recording"}` (the ancestor line on `excerpt`'s card, and `recording`'s own line in the ancestor card) | group_2, group_2 › excerpt, group_2 ⟵ recording |
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
part: ["name"]}` by none. **An item over another** (`over`, drawn
without `recording`'s ancestor card, which would move the place origin):
`annotations`' card moved to (8, 60) lies inside `group_1`'s frame, each
drawn as in the table above, and the middle of `score`'s line lies on the
card on top, `{item: "annotations"}`; yet `{id: "annotations", part:
["name"]}` is held by `{item: "annotations"}` alone, `{id: "score"}` by
`{item: "group_1"}` and `{item: "group_1", member: "score"}`, the card on
top by none. **One element drawn twice** (`twice`, with `recording` a
member of `group_1`): `excerpt`'s map `{id: "cmap_6"}` is drawn on both
cards and in `recording`'s ancestor card behind `group_2` (still drawn,
`excerpt` being a child member of `group_2`), and held by group_1, group_1
› recording, group_2, group_2 › excerpt and group_2 ⟵ recording; hidden
inside children (`{element: map, inside: child}`), on `recording`'s card
and in the ancestor card alike, by group_2 and group_2 › excerpt. **One
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

## Ancestor cards (`ancestor-cards.test.ts`, `keys.test.ts`, `raise.test.ts`)

An ancestor card (drawing.md §8.8) is a card the block holds behind a
frame: the root of a member that is a child timeline, drawn whole. It has
no place, so nothing on the canvas moves, resizes, nudges or reorders it;
it is hit, selected and opened as a card. The views are
`groups/group_parent_both` (the root `piece` behind `group_1`, aligned to
`middle`) and `groups/group_parents_mixed` (`sonata`, `session`, `page`
behind `group_1`), each as the defaults draw it, every ancestor card shown;
layout's README derives the geometry the points below are taken from.

1. **A record, no item.** `piece`'s card is recorded once, `ancestor
   {group: group_1, member: middle, groups: [group_1]}` (it lies behind
   one frame alone); `isAncestorCard` holds for it and
   for no other record; `isItem`, `isCard` and `isHeld` do not, so it is
   no key of `keyedBox`. It never resizes (`resizes` false at every level)
   and has no place fields (`fieldsOf` empty at every level).
2. **Hit as a card.** A press on its rectangle at `(20, 40)`, left of the
   frame (which starts at 260.33544921875), hits kind `card` at `{block: A,
   id: piece, part: [card]}` with its record as `box` and `within`; its
   shadow hits the same; a press there selects that address on the
   arranger. At `(300, 40)`, where the frame lies over it, `within` is
   `middle`'s card, never the ancestor card.
3. **Opens its root.** A double-click on that hit opens `{block: A, id:
   piece}` on the arranger (`editorTargetOf`); `workedBox` gives its record
   for `{id: piece, part: [card]}`, while a member's card address keeps its
   own card.
4. **Raised while a timeline of its root drawn in no member card is
   edited** (`raisedLayers` with the root `raisedRoot` names, the one
   decision the pointer's coverage and "Show matches" read too). With the
   descriptors in drawing order: on the
   arranger, in the editor of the member `middle` and in that of the group,
   nothing raised and every descriptor below, the same array; in the
   timeline editor of `piece`, one raised card, `piece`'s record, holding
   the descriptors of its range (elements 1 to 13, layout's record: the
   card, `piece`'s line, the row of `middle`, the wedges of `middle`'s
   groupstamps `timestamp_1` and `timestamp_2`, the two names, their two
   coordinate labels and their cross-section lines, two pieces each) in
   their order, and
   every other descriptor below in its order. In `group_parents_mixed` the
   editor of `session` raises `session`'s card alone, that of the member
   `take` nothing. With the workspace's rule `{element: ancestor_card}`
   `display: none` (every ancestor card hidden) the editor of `piece`
   raises nothing.
5. **Delete leaves it alone** (`keys.test.ts`, the view `bundle_mixed`,
   `recording`'s ancestor card behind `group_2`): Delete with `{block: A,
   id: recording, part: [card]}` selected sends nothing, refuses nothing
   and keeps the selection; with `dlt_1` selected beside it, it removes
   `dlt_1` alone: the manifest it leaves equals, whole, the one Delete
   leaves with `dlt_1` selected by itself.
6. **A root standing in another group rises on double-click**
   (`raise.test.ts`). A root that is a member of one group and the
   parent of a member of another stands twice: as a member card in its
   own group's frame and as an ancestor card behind the other frame. Its
   timeline editor raises the ancestor card exactly as it raises the card
   of a root in no group: the covered card comes to the front over the
   frame, showing whose timeline editor is open. `raisedRoot` therefore
   names the edited timeline's root where no timeline from the root's
   child down to the edited one is a member (the edited timeline is drawn
   in no member card below the root) and the root is either in no group
   or a member that draws an ancestor card (another member descends from
   it); a root member drawing none raises nothing, as before. The view:
   `group_parent_both` in block A at (0, 0) with a second group `group_2`
   ("Parents", members `[piece]`) added by one `add`. Layout's README
   derives `group_parent_both`'s geometry (above, and "A covered line is
   not read"); `group_2`'s frame is laid out below `group_1`'s, so
   nothing of `group_1` moves: its frame lies at y 190.13671875 (8 +
   174.13671875 + 8), its card of `piece` at y 214.94140625 (the frame's
   top plus the title band, 24.8046875, as `group_1`'s first card), and
   that card, drawn as the ancestor card is (63.37890625 high), holds
   `middle`'s row at 229.94140625 (+ 15) and `piece`'s line at
   263.91796875 (+ 48.9765625).
   - `raisedRoot` gives `piece` in `piece`'s timeline editor, and `null`
     on the arranger, in the editors of `group_1` and `group_2`, of the
     member `middle` and of the root member `recording` (which draws no
     ancestor card).
   - On the canvas, the rectangles of frames and cards in the node's
     order are, by `data-id` and `x`: before, the ancestor card's shadow
     and card (`piece` 10, 8), `group_1` (260.3354), `middle`'s and
     `recording`'s shadows and cards (270.3354, 268.3354 each),
     `group_2`, `piece`'s member card (270.3354, 268.3354). A
     double-click on the ancestor card's rectangle opens `{block: A, id:
     piece}` as a timeline editor, and then the ancestor card's two
     rectangles come last, every other one in its order before them.
   - The place rule reads its rows (`placesAt`): `piece` at 8 (abscissa
     564.0390625, 4 quarters right of the start of `middle`'s span on the
     card's run under the frame, 50 a quarter) lies on the arranger on its
     ancestor line in `middle`'s card (85.18359375, below `middle`'s
     line) and on its line in `group_2` (247.34375: `group_2`'s frame
     lies 8 below `group_1`'s, which ends at `8 + 157.5625`); in
     `piece`'s editor on the raised card's line (card `{item: group_1,
     member: piece}`, 85.18359375) and on `group_2`'s. `middle` at 4 (the
     same abscissa) lies on the arranger on its own line (47.20703125)
     and on its row in `group_2`'s card (213.3671875, 33.9765625 above `piece`'s
     line there as in every drawing of `piece` as a root); raised, on its
     row in the ancestor card (51.20703125) in the place of its own line,
     which the raised card covers, and on `group_2`'s row.
   What would be wrong: the card staying covered (the bug this point
   pins: the root's own group made `raisedRoot` give `null`), a member's
   editor raising the card over the member card it edits, the member
   card in `group_2` covered by the raise.

## A raised card unfolding (`unfold.test.ts`, `unfolding.svelte.test.ts`)

Opening a root's timeline editor raises its ancestor cards; each unfolds
out of the member card it is aligned to, and closing the editor folds it
back (decision record 0034). Three parts are proven apart: the pure
motion between two drawings, the canvas's reading of layout's records
into it, and the progress that drives it. The rows are a drawn line and
what belongs to its timeline; a progress `t` runs from 0 (the member
card's places) to 1 (the drawing at rest).

**The motion between two drawings** (`unfold.ts`, literal rows). The
rows of a member card of `theme`, a grandchild with two ancestors: `from`
= `theme` 120, `movement` 104, `score` 72 (ordinates). The rows of its
root's card: `to` = `top` 10, `theme` 24, `sibling` 40, `movement` 56,
`score` 72, `extra` 90.

1. **Pairing by key** (`pairRows`): `theme` shifts 96 (120 − 24),
   `movement` 48, `score` 0, none entering. `sibling` lies between the
   paired `theme` (24, 96) and `movement` (56, 48): 96 + (48 − 96) × 16 /
   32 = 72, entering. `top` lies above every paired row and takes the
   nearest one's, 96; `extra` below them all takes `score`'s, 0; both
   enter. With no row paired every row shifts 0 and enters. A key twice in
   `from` pairs with its first row (`theme` 120 and 130: 96); twice in
   `to`, its first row is kept.
2. **Frames** (`frameAt`) at `t` = 0, ½, 1: `theme` lies at `dy` 96, 48,
   0, opacity 1 each; `sibling` at 72, 36, 0 with opacity 0, ½, 1; an
   element of no row at `dy` 0, opacity 0, ½, 1.
3. **The clip** (`rectAt`) from `{0, 0, 10, 10}` to `{−20, 4, 50, 30}`:
   at ½ `{−10, 2, 30, 20}`, at 0 and 1 the ends exactly.
4. **Durations** (`durationOf`): the whole way 400 ms each direction;
   from 0.25 back to 0 100 ms, the reversal from where the motion stands
   taking its part of the time; 0 under reduced motion, whatever the
   distance; 0 for no distance.

What would be wrong: rows paired by ordinate or by order instead of by
timeline, an entering row jumping to its place or showing at once, a row
beyond the paired ones left behind, a reversal taking the whole time.

**A raised card's reading** (`raise.ts`, `groups/group_grandchild`,
`theme` the member, its root `score` with `movement` between, both
ancestor lines displayed; and `groups/group_parent_both`). Every
expected value is derived from the drawing's own records, never written
here, so the facts hold whatever the layout's ordinates are:

5. **Rows from the records.** For each timeline layout draws a line of in
   both the member card (`{item: group_1, member: theme}`, its own and its
   ancestor lines) and the ancestor card (lines marked `ancestor`), the
   motion is the member card's ordinate less the ancestor card's, not
   entering: `theme`, `movement`, `score`. The root's shift is exactly 0:
   layout lays the card's root line on the member card's ancestor line of
   it.
6. **Each element travels with its row.** Every line element of the card
   (`timeline`, `child`) lies at `t` = 0 exactly on its timeline's line in
   the member card (its `y` plus `dy`), at ½ half-way, at 1 at its own
   `y`; every element of the card's range whose address names a timeline
   or an entry or named timestamp of one (core's owners) takes that
   timeline's motion; the card's rectangle takes none (it blends in, the
   member card beneath blending out), nor do its gaps, which run from
   the card's top to its bottom as the rectangle does (`group_grandchild`
   is drawn elided by the defaults: three gaps), nor their ellipses, which
   stand on every crossing row; a gap's labels travel with the row of the
   timeline the elision lies on.
7. **The clip** opens from the member card's record rectangle and ends
   at a rectangle holding the card's record rectangle and its shadow
   (`shadowOffset` right and down) and the bounds of every element of the
   card.

What would be wrong: a row read from another card (the frame's other
member, the unraised order), an element moving apart from its line, the
clip cutting the card at rest.

**The progress** (`Unfolding`, under Vitest's fake timers faking
`requestAnimationFrame` and `performance`, the clock it reads; a frame
every 16 ms from 0). `raised` is a `$state` root,
`reduced` a `$state` flag.

8. **Made raised, at rest.** Made while `raised` is `R`: `root` `R`,
   `progress` 1, not moving, before any frame.
9. **Opening.** `raised` from `null` to `R`: at once `root` `R`,
   `progress` 0, moving; after 192 ms (twelve frames) `progress` is
   `UNFOLD_EASING(192 / 400)`; after 416 ms 1, not moving.
10. **Reversal from where it stands.** At 192 ms, with `p` that
    progress, `raised` back to `null`: `root` stays `R` while it folds,
    the progress `p` at once (no jump to either end), and the way back
    takes `400p` ms (`durationOf`), not 400: at the next frame (208 ms) it
    is `p − p × UNFOLD_EASING(16 / (400p))`. `p` is `UNFOLD_EASING(0.48)`
    = 0.442368, so `400p` is 176.9472 ms: at 352 ms, the last frame
    before the end, `p − p × UNFOLD_EASING(160 / (400p))`, above 0, with
    `root` `R`; at 384 ms 0 and `root` `null`.
11. **Reduced motion.** With `reduced` true, raising gives `progress` 1
    and closing 0 with `root` `null` at once, before any frame.
12. **Another root.** From `R` at rest to `Q`: `root` `Q` at once,
    `progress` 0, then 1 after 416 ms.

What would be wrong: a motion restarting from an end on reversal, the
folding card dropped before it is folded, motion under reduced motion, a
re-mounted node animating a raise that happened before it.

## Elisions moving (`elide.test.ts`, `card-motions.svelte.test.ts`)

A card keeps its rows whatever its gaps, but for the label stacks of its
gaps (decision record 0034: rows move when labels show): a mode switched,
a gap changed, added or removed and a changed proportion move the card's
elements sideways, and its rows by exactly as much as the label stacks
above them change (a frame's group elisions move its member cards so, and the
frame's rectangle, title and gaps by the proportions of its axis); an
ancestor card shown or hidden also unfolds out of its member card or folds
back into it, as a raise does (decision record 0034). The same three
parts are proven apart: the pure motion, the canvas's reading of two
drawings into it, and the progress that drives it. A progress `t` runs
from 0 (where the drawing before drew it) to 1 (the drawing at rest).

**The pure motion sideways** (`unfold.ts`, literal knots; a knot is an
abscissa and the position it draws on the card's root). `full` = (0, 0),
(100, 100): one run at scale 1. `elided` = (0, 0), (10, 10), (19, 100):
a run of 10, then a gap 9 wide eliding 10 to 100.

13. **Positions and abscissas** (`positionAt`, `abscissaAt`): on `full`,
    50 draws 50; on `elided`, 55 is drawn at 10 + 9 × 45 / 90 = 14.5, a
    knot's own position exactly at it (100 at 19), beyond the knots
    their nearer end (−5 at 0, 120 at 19); without knots `null`. A seam's
    two knots share a position: `abscissaAt` draws it at the knot not
    marked `across` (the side the position lies on, `docs/drawing.md` in
    TimeToShare, section 3.2), and `positionAt` reads each knot's own.
14. **Where an abscissa starts** (`startOf(elided, full, 5, x)`, the
    place origin moved by 5): 55 starts at 14.5 + 5 = 19.5; −8, left of
    `full`'s first knot, starts as far left of that knot's start, 0 + 5
    − 8 = −3; 108 at 19 + 5 + 8 = 32; without knots on either side `x`
    moved by 5 (3 → 8).
15. **An element at a progress** (`spanAt`, `placedAt`): an extent 0 to
    100 starting at 5 to 24, down by 12, not entering: at 0 the span 5 to
    24, the map `sx` 0.19, `dx` 5, `dy` 12, opacity 1; at ½ the span 2.5
    to 62, `sx` 0.595, `dx` 2.5, `dy` 6; at 1 exactly at rest (`sx` 1,
    `dx` 0, `dy` 0, opacity 1). A text at 7 starting at 3, entering: at 0
    `sx` 1, `dx` −4, opacity 0; at ½ `dx` −2, opacity ½. Composing
    (`composed`) `{sx 2, dx 1, dy 3, opacity ½}` after `{sx ½, dx 4, dy
    1, opacity ½}` gives `{sx 1, dx 9, dy 4, opacity ¼}`; a raise's
    frame `{dy 3, opacity ½}` is `{sx 1, dx 0, dy 3, opacity ½}`.
16. **The attributes** (`placedAttributes`): none at rest; a move
    alone a `translate(2 0)`; a stretch the `matrix(0.5 0 0 1 1 2)`, the
    opacity `own` × the placed one (0.8 × 0.5 = 0.4).

What would be wrong: an abscissa beyond the line's ends left behind while
the line moves, a stretch rounded at rest, a position the start drawing
elides drawn outside its gap.

**Elided ↔ Full** (`elide.ts`, `groups/group_elided_inside` and
`groups/group_grandchild` in block A, drawn by the defaults (Elided) and
with `withFullCards` (Full); every expected abscissa is read from the
drawing records, never written here). The oracle reads both cards
through their **pieces**: each full run of the Elided card (an axis of
it) and each gap, its two abscissas in the Elided card against the two
abscissas the Full card draws the same values at, each read on that
value's own timeline's line, which the Full card draws whole. An
abscissa of one card stands for the abscissa of the other through the
first piece holding it, linear in it (an end exactly at its abscissa).

17. **One card moves.** Each way, `blockMotion` moves exactly the
    ancestor card (`{item: group_1, member: piece}`,
    `{item: group_1, member: score}`), nothing leaves.
18. **Rows move by the label stacks.** Elided, the card draws the names
    of its derived elisions (the initial `elision-display` `ellipsis
    name`) in label stacks that the card's rows below them make room for
    (drawing.md section 8.3: the ancestor-row distance counts every stack
    the card draws); Full, it draws none. Each line element of the card
    has at 0 the `dy` of its row, its line's ordinate in the drawing
    before less the one after, at ½ half of it, at 1 nothing: a row above
    the stacks moves 0, a row below them 19.9765625 (one stack line),
    down Full → Elided and up Elided → Full; no other distance occurs.
19. **Lines travel sideways.** Each line element of the card (`timeline`,
    `child`: in `group_elided_inside` `piece`, `first`, `excerpt`,
    `second`, in `group_grandchild` `score`, `movement`, `theme`) keeps
    its own ends `xs` and `xe` at rest; at 0 they lie where the pieces
    read them in the other card, moved by the change of the place origin
    (`origin.x` after less before); at ½ half-way (`from + (own − from) ×
    ½` each end); at 1 at their own. A piece's ends are read on the runs
    starting and ending there, so a position at a seam of the frame's
    room keeps its side (a line starting at the member's span starts
    under the frame in both cards).
20. **What enters.** Full → Elided: what lies in a new gap enters
    (opacity 0, ½, 1), in place, and nothing else: every gap (in
    `group_elided_inside` `first` twice and `second`, in
    `group_grandchild` `score`, `movement` and `score`), every
    ellipsis and every default gap's label (a label whose address has the
    part `elision`). Elided → Full: no line enters, since a default gap
    leaves out a stretch's middle and keeps both its ends (no line lies
    wholly in a gap of these two fixtures). An element inside a gap that
    stays (a gap changed) travels with it instead, from the same share of
    the gap before.

**A group elision changed** (`group_elided_members`, `elision_1` set to
`{canvas: 60}`): the frame and every card drawing its gaps move, nothing
else: the member cards of `excerpt`, `voice` and `sketch`, `piece`'s
ancestor card (its carried gaps) and the frame `{item: group_1}` itself.
The frame's rectangle starts where the drawing before drew it: its left
side as it was (moved by the place origin), its right side as far right of
the frame axis's end before (the last run's end, `place.x + scale × (x0 +
L × u1 − D)`) as it lies right of that end after, so the right border
travels with the gaps.

**Elision labels shown** (`group_elided_inside`, a rule on `{id: piece,
part: [card]}` setting `elision-display` to `ellipsis name coordinate`):
the labels take room in their markers bands, so the card's rows move
(section 2.1 of the drawing specification: rows stay unless elision labels
are shown): every line of the ancestor card starts `dy` below its own row,
the row's ordinate before less its ordinate after (each from its drawing's
place origin), and some row moves.

**Hidden ↔ Elided** (`withoutAncestorCards` against the defaults, the
same two fixtures):

21. **The card unfolds.** Hidden → Elided moves the ancestor card alone,
    nothing leaving. Each element's `dy` is the raise's row shift of its
    row (`raiseUnfold`), 0 for its rectangle, gaps and ellipses: so `movement`
    in `group_grandchild` lies at 0 on its ancestor line in the member
    card (`y + dy` = that line's ordinate) and moves down; sideways each
    end starts at the member line's start or end in the member card
    (`theme`'s `xStart` and `xEnd` there, 253.69419642857133 and
    653.6941964285713) where it lies left or right of the member's span,
    and on itself inside it (every element but the row names and the
    card's rectangle, which lie beyond the root line's ends and move by
    what those ends move): the root line starts as wide as the member
    line, a gap left of the span starts with both edges at its start,
    one right of it at its end. Both move: some element has `dy` ≠ 0
    and some has its start ≠ its own extent. The card's rectangle, its
    gaps, ellipses and labels enter; the member's lines do not.
22. **The card folds back.** Elided → Hidden moves no card of the drawing
    after and leaves one card: its key the ancestor card's, its
    descriptors those of the card's range in the drawing before (in
    order), each placed at `t` as the unfolding of item 21 places it at
    `1 − t`, moved by the change of the place origin (`dx` and `dy`
    added): at 0 at rest but for that move, at 1 folded.

What would be wrong: a row moving vertically between Elided and Full, an
element starting at its abscissa in the other drawing's coordinates
without the origin's move, an ellipsis jumping instead of travelling
with its gap, a hidden card vanishing without folding.

**The progress** (`CardMotions`, fake timers as for `Unfolding`; the
drawing a `$state` holding `group_elided_inside`'s Elided, Full or Hidden
drawing; `reduced` and `still` `$state` flags).

23. **Made, at rest.** Nothing moves: `moving` false, `progress` 1,
    `placedOf` of the card's root line `null`, `leaving` empty.
24. **A switch moves.** Elided → Full: at once `moving`, `progress` 0 and
    the root line placed as `placedAt` of its motion at 0; after 192 ms
    at `UNFOLD_EASING(192 / 400)`; after 416 ms at rest (`null`, not
    moving). An element outside the card is `null` throughout.
25. **A hidden card folds back over the same time**: Elided → Hidden
    gives one leaving card while moving and none at rest.
26. **No motion while `reduced` or `still`**, and none for the same
    drawing given again: at once `null`, not moving.

What would be wrong: a preview animating behind the pointer, motion under
reduced motion, a leaving card staying drawn at rest.

## Picking an element (`picking.test.ts`)

While a panel asks the canvas to pick an element (the Canvas's `picking`),
a press picks a timeline or a region instead of selecting. What proves the
reading is that every answer comes from what the press hit, resolved in the
block's manifest by core's resolver, exactly as the inspector reads a
selected address for its statements: a card, a band or a part counts as its
timeline, a region's label as its region; nothing is read from an
address's shape. Each case presses a descriptor of the drawing (its source,
as a press reports it) and names the `{block: A, id}` picked or `null`.

- **`with_region`** (root `clt_1`, children `clt_2` and `clt_3`,
  `region_1`): the line `{id: "clt_1"}`, the card `{id: "clt_1", part:
  ["card"]}`, the card's shadow and the name `{id: "clt_1", part:
  ["name"]}` pick `clt_1`; the child line `{id: "clt_2"}` and its name pick
  `clt_2`; the region `{id: "region_1"}` and its label `{id: "region_1",
  part: ["label"]}` pick `region_1`; the block's background, the wedge of
  the named timestamp `timestamp_1` and its coordinate label pick nothing.
  In `clt_1`'s timeline editor, a press on the background at the middle of
  the regions band (layout's record: x 42.49951171875 + 417.695068359375 /
  2, y 81.9765625 + 18.4765625 / 2) hits the band `{id: "clt_1", facet:
  "regions"}` and picks `clt_1`.
- **`group_child_member`**: the frame `{id: "group_1"}` and the group's
  title `{id: "group_1", part: ["name"]}` pick nothing; the ancestor line
  `{id: "piece"}` drawn in `second-half`'s card picks `piece` (no mark of
  `second-half`'s start or end is drawn on it, drawing.md section 8.3).
- **`segment_line`**: the boundary `{id: "b", part: ["start"]}` picks the
  segment `b`.
- **`flow_control`**: the break `break_1` and the symbol of the jump
  `jump_1` (𝄇, `{id: "jump_1", part: ["symbol"]}`; the defaults hide its
  arcs, drawing.md section 4) pick nothing.
- **`with_region` with a stored elision**: after `add {into: {block: A, id:
  "clt_1"}, elision: {start: [1, 1], end: [2, 1]}, ids: [gap]}` the manifest holds
  `gap` on `clt_1` (the ID the command gives), which core resolves to the kind `elision`; a press
  on `{id: "gap"}` picks nothing, exactly as on a named timestamp: an
  elision names no timeline or region of its own to pick. A default gap
  and its parts pick nothing alike (Elisions on the canvas, below), though
  core resolves them as parts of their timeline.

The canvas (`CanvasHarness` on `with_region` at the default viewport,
`picking` given): the arranger carries `data-picking`, absent without
`picking`. A primary press on `clt_1`'s card calls `picking` once with
`{block: A, id: "clt_1"}`; the press and the click after it leave the
selection empty and the journal as it was, where without `picking` the
same press selects `{block: A, id: "clt_1", part: ["card"]}`. A press on the block's
background calls nothing, reports exactly "Pick a timeline or a region;
Escape cancels." through `onrefuse`, and its click selects nothing
either. In
`clt_1`'s timeline editor (nothing selected), Escape on the arranger
leaves the editor open while `picking` is given (the caller cancels), and
closes it without `picking`.

Picking holds the whole canvas, so the panel that asked keeps its subject:
with the block `{block: A}` selected, a press on the pane (its press,
release and click) calls nothing, reports the same refusal and leaves
`[{block: A}]` selected, as does a click on the pane alone; without
`picking` that click clears the selection, which proves the click reaches
Svelte Flow's pane handler and is swallowed only while picking. Keys pick
the way a press does, from the element the key is sent to: Enter on
`clt_1`'s card element calls `picking` once with `{block: A, id:
"clt_1"}` and selects nothing; Enter and Space on the focused block node
(the block itself, which `pickable` maps to nothing) call nothing, report
the same refusal and leave the selection empty, where without `picking`
Enter on it selects `{block: A}`.

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
| timeline `{block: A, id: R}`, R a root | R's flow control band `{id: R, facet: "flow_control"}`, or an element it draws (a flow-control element of R's tree) | that band, which opens the flow editor of R (section "The flow subeditor") |
| flow `{block: A, id: R}` | anything | nothing |

Two editors are equal by target, compared as a whole address, and kind. **What each level permits** is
one row per level, compared whole; with an editor open, the innermost
editor's row applies:

| level | move | nudge | reorder | bands | marquee | items free | frame width pinned | remove | raise, lower | open | lock | resize |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| arranger | yes | yes | | | blocks | yes | | yes | yes | yes | yes | yes |
| bundle | yes | | | | elements | yes | | yes | | yes | yes | yes |
| group | | | yes | | elements | | yes | yes | | yes | yes | yes |
| timeline | | | | yes | elements | | | yes | | yes | yes | yes |
| flow | | | | | elements | | | yes | | | yes | yes |

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
`bundle_mixed` at (40, 80), its items as in the fixture facts; a place,
a size and a travel are item and block values, which `recording`'s
ancestor card does not change, and the one test reading the node's canvas
position after a box grows left draws the block with the card hidden.
561.052001953125 is 1149034.5 / 2048, so a width quantized from it to
1/2048 (halves rounding up) is 561.05224609375.

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
its drawn position at the defaults (`group_1` (8, 28.8046875), `annotations` (8,
381.265625), below `recording`'s ancestor card: `bundle_mixed`, "With
`recording`'s ancestor card"), else `annotations` would follow `group_2`
and its card up to `200 + 157.7578125 + 11.9765625 + 8 = 377.734375`; an
item stating `{x: 12}` gets only its `y`. To (40.0001, 200)
the same; to its drawn place no command; a key that is no item (`{item:
"score"}`, a member's ID) throws.
**Several items move by one travel**: with `annotations` along, `group_2`
travels `(32, −3.53125)` from its drawn (8, 203.53125) and `annotations`
lands at (40, `381.265625 − 3.53125 = 377.734375`),
its offset kept; the command lists the pressed item, the items moving with
it in order, then the others' positions. With both others along, `group_1`
lands at (40, `28.8046875 − 3.53125 = 25.2734375`). No travel, or a key along that is no item, no
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
((26.9765625 + S) + (2 + h(12) + 2)) + 8 = 72.4453125 + S` (the gap
before its flow control band, which holds its jump's symbol row alone,
`2 + 13.96875 + 2 = 17.96875` with the symbol gap on both sides, the
defaults hiding the arc: `bundle_mixed` above), `annotations` `Ha(S) =
14.40234375 + ((26.9765625 + S) + 18.4765625) + 8 = 67.85546875 + S` (the
gap before its regions band); `group_1`'s frame `H(Sf) = 24.8046875 +
76.4453125 + Sf + 49.4765625 + 8 = 158.7265625 + Sf`. No spacing multiplies
another: a frame's spacing changes none of its cards, a card's none of its
frame's gaps.

**Scale** (on `annotations`' card, arranger): bottom-right by (40, 20)
`{scale: 1.2783203125}` (2618.03 steps); top-left by (−40, −20) the same
with `x: −148.15234375, y: 361.2666015625` (the drawn `y` 381.265625 at
the defaults less the card's growth `0.2783203125 × 71.85546875 =
19.9990234375`); by (−1000, −1000) the floor;
at block scale 2 by (80, 40) the same 1.2783203125; with `scale` 2 stated,
halving gives `{scale: null}`, the default. On a held card the scale is
its group's, from the frame's top left to the card's bottom right:
`group_1 › performance` by (40, 20) gives `{group_1: {scale: 1.1259765625}}`
(the card's bottom lies `138.0546875 + 49.4765625 − 28.8046875 =
158.7265625` below the frame's top: `(158.7265625 + 20) / 158.7265625`,
2306.05 steps, rounds to 2306 / 2048).
Only an offered corner scales.

**Box** (on `group_2` with `width` 580, bundle editor): right by 20
`{width: 600}`, by −20 `{width: null}`; left by −21 `{width: 601, x:
−13}`, by 100 `{width: null, x: 26.9482421875}`; bottom by 10.5 `{height:
168.2578125}`; top by −16 `{height: 173.7578125, y: 187.53125}`; at block
scale 2 right by 20 `{width: 590}`. Applied, the left row moves the place
origin to (21, 0) and keeps `group_2`'s right edge at canvas x 628 (drawn
with the ancestor card hidden, so the other items lie at the table's
places, `annotations` at y 369.2890625). A held
card sizes its own card in item coordinates: with `group_1` at scale 1.25,
`group_1 › performance` bottom-right by (50, 30) gives `{group_1 › performance: {width:
585.05224609375, height: 73.4765625}}`, right by −50 `{width: null}`.

**Stretch** follows a block's rule, every stated size of the stretched
boxes following its own content. On `annotations`' card (bundle editor):

| case | handle | delta | values |
|---|---|---|---|
| | right / left | (20, 0) / (−21, 0) | `{length: 420}` / `{length: 421, x: −13}` |
| | right | (−500, 0) | `{length: 8}` |
| | bottom / top | (0, 20) / (0, −20) | `{spacing: 24}` / `{spacing: 24, y: 361.265625}` (`381.265625 − 20`) |
| | bottom-right | (20, 20) | `{length: 420, spacing: 24}` |
| | bottom | (0, −2) / (0, −40) | `{spacing: 2}` / `{spacing: 0}` (the floor) |
| width `2 W(400)` | right / left | (40, 0) / (−42, 0) | `{length: 420, width: 1162.10400390625}` / `{length: 421, width: 1164.10400390625, x: −34}` |
| height `2 Ha(4)` | bottom | (0, 40) | `{spacing: 24, height: 183.7109375}` |

A frame's stretch widens the gap between its cards, each card keeping its
size: `group_1` bottom by 44 `{group_1: {spacing: 52}}`, top by −44 also
`y: −15.1953125`; with `performance` at height `2 Hp` bottom by 60
`{group_1: {spacing: 68}}` alone (the frame `208.203125 + Sf` high, the
card's request unchanged). A held card stretches its group along time and
its own card vertically, and has no left handle:

| case | card | handle | delta | values |
|---|---|---|---|---|
| | group_1 › score | right | (20, 0) | `{group_1: {length: 420}}` |
| | group_1 › score | bottom | (0, 16) | `{group_1 › score: {spacing: 20}}` (one gap: 16 per unit) |
| | group_1 › score | bottom-right | (20, 16) | both of the above |
| score height `2 Hs(4)` = 152.890625 | group_1 › score | bottom | (0, 32) | `{group_1 › score: {spacing: 20, height: 184.890625}}` |
| group_1 height `2 H(8)` | group_1 › score | bottom | (0, 16) | `{group_1 › score: {spacing: 20}, group_1: {height: 365.453125}}` (`333.453125 × 182.7265625 ÷ 166.7265625`) |
| group_1 width `2 W(400)` | group_1 › score | right | (30, 0) | `{group_1: {length: 415, width: 1152.10400390625}}` (the frame's width widens its cards, so the card is drawn `2 W(L) − 16`) |
| performance width `2 Wc(400)` | group_1 › score, or group_1 › performance by (60, 0) | right | (30, 0) | `{group_1: {length: 430}, group_1 › performance: {width: 1150.10400390625}}` |

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
width, quantized (561.05224609375), while the content, the cards' widths
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
| | right | (20, 0) / (−100, 0) | `{group_1: {length: 420, width: null}}` / `{length: 300, width: 561.05224609375}` |
| width 600 | right | (30, 0) / (200, 0) | `{group_1: {length: 430, width: 600}}` / `{length: 600, width: null}` (content 761.052001953125) |
| | bottom (frame) | (0, 44) | `{group_1: {spacing: 52}}` |
| | bottom-right (frame) | (20, 44) | `{group_1: {length: 420, width: null, spacing: 52}}` |
| performance width `2 Wc(400)` | right | (20, 0) / (−100, 0) | `{group_1: {length: 410, width: null}, group_1 › performance: {width: 1110.10400390625}}` (the frame 1106.10400390625 + 20) / `{group_1: {length: 350, width: 1106.10400390625}, group_1 › performance: {width: 990.10400390625}}` |

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
| performance width `2 Wc(400)` | group_1 or group_1 › score | arranger | length 430 | `{group_1: {length: 430}, group_1 › performance: {width: 1150.10400390625}}` |
| annotations width `2 W(400)` | annotations | bundle | length 420 | `{annotations: {length: 420, width: 1162.10400390625}}` |
| | group_1 or group_1 › score | group | length 500 / 300 | `{group_1: {length: 500, width: null}}` / `{group_1: {length: 300, width: 561.05224609375}}` |
| group_1 width 600 | group_1 or group_1 › score | group | length 430 / 500 | `{length: 430, width: 600}` / `{length: 500, width: null}` |
| performance width `2 Wc(400)` | group_1 or group_1 › score | group | length 350 / 500 | the pointer's row above / `{group_1: {length: 500, width: null}, group_1 › performance: {width: 1290.10400390625}}` (`2 Wc(500)`) |
| score height `2 Hs(4)` | group_1 / group_1 › score | bundle | spacing 16 / 12 | `{group_1: {spacing: 16}}` (no card's height follows) / `{group_1 › score: {spacing: 12, height: 168.890625}}` |
| group_1 height `2 H(8)` | group_1 | bundle | spacing 16 | `{group_1: {spacing: 16, height: 349.453125}}` |
| group_1 height `2 H(8)` | group_1 › score | arranger | spacing 12 | `group_1 › score: {spacing: 12}` then `group_1: {height: 349.453125}`, in that order |

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
hidden by a workspace rule (`display: none` on `{id: performance,
facet: markers}` and `{id: performance, facet: conversion_maps}`) it holds
its row alone: its card is `Hp′ = (8 + h(11) / 2) + h(11) / 2 + 8 =
28.8046875` high (no band reaches past the name's half row), `H(m) = Hp′ +
2m`, so bottom by 16 at every level gives `{group_1 › performance:
{margin: 8}}`, its `spacing` unstated; bottom by −40 floors at 0, the
margin it has, so no place and no command. With `group_1`'s height
requested at twice its content, `2 × (24.8046875 + 76.4453125 + 8 +
28.8046875 + 8) = 292.109375`, the same drag gives `group_1 › performance:
{margin: 8}` then `group_1: {height: 324.109375}` (`292.109375 × 162.0546875 /
146.0546875`, its content 16 higher), in that order.

**The command of a resize** sets each place in order and, where the
level's items lie freely (arranger and bundle editor), the drawn position
of every other item without one, never the frame holding an edited held
card: `group_2`'s left Box row gives `group_2`'s place, then `group_1`'s
and `annotations`' positions, at both levels; in the group editor
`[{target: {block: A, id: "group_1"}, values: {place: {length: 400,
width: 561.05224609375}}}]` alone; in a timeline editor `[{target:
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
member: "performance"}` are `53.609375 + 76.4453125 / 2 = 91.83203125`
and `138.0546875 + 49.4765625 / 2 = 162.79296875` (their `y` plus half
their height).

| group | dragged | y | order |
|---|---|---|---|
| group_1 | score | 100 / 170 | [score, performance] / [performance, score] |
| group_1 | score | 162.79296875 | [performance, score] (a middle at `y` is not below it) |
| group_1 | performance | 50 / 91.83203125 | [performance, score] / [score, performance] |
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

## Arrangements on the canvas (`arrangement.test.ts`, `arrangement-motion.test.ts`)

An arrangement places the contents of a level in an order instead of at
their places, and a drag or an arrow moves one content to another place
of that order (TimeToShare's `docs/drawing.md`, section 8.6 and "Drawn
once"; core's README, "Arrangements", owns the rules, the stored state and
the commands; layout's, "Arrangements", where items lie). Two levels are
arranged on the canvas: the arranger's **blocks** (the workspace's
`arrangement`: Vertical, Horizontal or a Matrix of `columns` columns, in
the order of the blocks' `index`) and, in a bundle editor, the edited
block's **items** (its `arrangement`: Vertical, or Horizontal with every
root its groups hang on drawn once behind the row). A group editor's cards
keep their display order, but side by side two of their drops are refused.
What proves the canvas's side is that each value below follows from the
records of the drawings (node sizes are a drawing's `width` and `height`
times its block's scale, items' rectangles their boxes) by the arithmetic
written here, and each command is applied through core and read back.

Facts of `bundle_arranged_roots` drawn Horizontal (layout's oracle, read
from its records): the row `group_1` "Exposition", `group_2`
"Development", `group_3` "Recapitulation", `page` (core's row from the
stored order `[]`: groups by ID, then ungrouped roots), the roots `score`
"Score" and `session` "Session"; the anchors on `score` `exposition` 0–16,
`development` 16–32, `recapitulation` 32–48, on `session` `take_a` 0–30
and `take_b` 100–130; the frames at x 167.41357421875, 782.8037109375 and
1398.19384765625, each 567.39013671875 wide, `page`'s card at
2013.583984375; the once card of `score` `{item: group_1, member: score}`
lists the groups `[group_1, group_2, group_3]`, that of `session` `[group_1,
group_3]`; `session`'s once card draws one arrangement gap, 33–44.

**The rules of a level** (`containers.ts`):

1. `arrangedOf`: the arranger without a workspace arrangement `null`; with
   `{vertical}` `{vertical, columns 1}`; with `{matrix}` over five blocks
   `{matrix, columns 3}` (⌈√5⌉), with `{matrix, columns 2}` two; a bundle
   editor of `bundle_arranged_roots` stated Horizontal `{horizontal, 1}`, of
   `bundle_arranged_conflict` stated Horizontal `{vertical, 1}` (drawn one
   item under another, the conflict kept); a group or timeline editor
   `null`, whatever the block states.
2. `rulesOf` with an arrangement: the arranger's and the bundle editor's
   rows with `move` and `nudge` false and `arranged` the arrangement; locked
   or read-only, exactly the rows without an arrangement (the lock turns the
   arranged drag off as it turns off moving); a group or timeline editor the
   level's own row, unchanged.

**Where a content drops** (`reorder.ts` `orderAt`, literal rectangles,
each 10 × 10): along `vertical` `a`, `b`, `c` at y 0, 20, 40: `a` at y 24
keeps `[a, b, c]`, at 25 (`b`'s middle, not below it) and 26 gives `[b, a,
c]`, at 100 `[b, c, a]`; along `horizontal` the same at x 0, 20, 40: `c` at
x 12 gives `[a, c, b]`; a `matrix` of five in two columns, `a` (0, 0), `b`
(20, 0), `c` (0, 20), `d` (20, 20), `e` (0, 40): `e` at (25, 5) lies in
the first row right of `b`'s middle, `[a, b, e, c, d]`; `a` at (2, 30) in
the second row left of `c`'s middle, `[b, a, c, d, e]`; `a` at (100, 100)
last. `memberOrderAt` is its vertical call: the table of "Reordering a
group's member cards" holds unchanged. `steppedOrder([a, b, c], b, 1)` is
`[a, c, b]`; a step beyond either end, and a step of 0, `null`.
`arrangedStep`: vertical Down 1, Up −1, Left and Right 0; horizontal Right
1, Left −1, Up 0; a matrix of 3 columns Down 3, Up −3, Left −1.

**Blocks** (`project.ts`, `blockDrag.ts`, `keys.ts`; blocks `A` `bare` at
(40, 80), `B` `group_number_types` at (600, 0), `C` `group_child_member` at
(0, 600), each node `w × h` its drawing's size, `P(X)` its `nodePosition`):

Every block is packed from the **packing origin** `O`, the top left of the
blocks' stated places: `O = (min P(X).x, min P(X).y)` over `A`, `B`, `C`
(and `D`, `E` where added), so the arrangement stays where it is whichever
block comes first.

- **Vertical**: `A` at `O`, `B` at `(O.x, O.y + hA + 32)`, `C` at `(O.x,
  y(B) + hB + 32)`: packed from the origin, 32 apart.
- **Horizontal**: `B` at `(O.x + wA + 32, O.y)`, `C` at `(x(B) + wB + 32,
  O.y)`.
- **Matrix** of five blocks (`D` `bare`, `E` `bare` added at (0, 0)) in two
  columns: column widths `max(wA, wC, wE)` and `max(wB, wD)`, row heights
  `max(hA, hB)`, `max(hC, hD)`, `hE`; each block at its cell's top left,
  the first cell at the origin of the five.
- **A drop**: `A`'s node dragged with its middle below `C`'s middle gives
  the order `[B, C, A]` and the places of `B`, `C`, `A` packed in that
  order from the same `O`; the release stores one `set` of `A`'s `index`,
  `indexBetween(C's index, null)`, nothing else, and the canvas then draws
  the blocks at those places. Dropped where it lay (its middle above `B`'s),
  nothing is stored.
- **Free restores**: the `set` of `arrangement: null` puts every node at
  its `P(X)` again: the stated places were kept.
- **Ctrl+]** (one place forward, as on a free canvas): `A` raised gives the
  order `[B, A, C]`, packed from the same `O`: `B` takes `A`'s former place.
- **Keys**: Down on the one selected `A` (Vertical) stores `A`'s index
  between `B`'s and `C`'s; Up on it stores nothing and takes the key; in a
  Matrix of two columns Down on `A` moves it two places, `[B, C, A, D, E]`;
  the arrows nudge nothing while arranged.

**Items** (`gestures/arranged.ts`, `gestures/held.ts`, `reorder.ts`, on
`bundle_arranged_roots` Horizontal, its bundle editor open; a drop's point
is the pointer's drawing point):

- **The stretches order the row** (`rowRefusal`): `group_3` moved first, `[group_3, group_1,
  group_2, page]`, is refused: `"Recapitulation" stays right of
  "Exposition", "Development" on "Score"; "Recapitulation" stays right of
  "Exposition" on "Session"`; `group_1` moved after `group_3` (`[group_2,
  group_3, group_1, page]`): `"Exposition" stays left of "Development",
  "Recapitulation" on "Score"; "Exposition" stays left of "Recapitulation"
  on "Session"`; `group_2` moved last: `"Development" stays left of
  "Recapitulation" on "Score"`; `page`, hanging on nothing, anywhere: `null`.
  The drag: `group_3`'s frame pressed and dropped at x 100 (left of
  `group_1`'s middle) previews the stored order, stores nothing and shows
  the reason (`NodeActions.refuse`); `page`'s card dropped at x 100 stores
  one `set` of the block's arrangement, `{direction: horizontal, order:
  [page, group_1, group_2, group_3]}`, which core keeps as the row.
- **Vertical items**: on the block stated Vertical, `page` dropped at y 0
  stores `{direction: vertical, order: [page, group_1, group_2, group_3]}`;
  nothing is refused.
- **Anchors pinned side by side** (`isPinned`): side by side `recapitulation` and `take_b` (anchors of
  `group_3`) are pinned, `annotations` (a root member) is not; on the
  block stated Vertical none is. In `group_3`'s editor a press on
  `recapitulation` is not taken; `annotations` dropped above it gives the
  order `[annotations, recapitulation, take_b]`, accepted (`heldRefusal`
  `null`), one `set` of `group_3`'s `order`: `null`, that order being the
  group's `members`.
- **An order changing an anchor** (`heldRefusal`): `score` given a child `coda` at 40, 8 quarters,
  joined to `group_3` (core's `add` and `set groups`), the order `[coda,
  recapitulation, annotations, take_b]` is refused `would anchor "coda" on
  "Score" instead of "Recapitulation"` (core's `anchorChange`); a refused
  drop stores nothing and shows the reason.
- **Items by key**: `page` selected, Left stores the order `[group_1,
  group_2, page, group_3]` (`page` hangs on nothing); `group_3` selected,
  Left is refused with `"Recapitulation" stays right of "Development" on
  "Score"` and stores nothing.

**What an arrangement gap gives the canvas** (`cardAxis.ts`, `gaps.ts`):
`group_3` stretched to the length 600 (`set place`), `session`'s once card
draws the arrangement gap 33–63 between `take_a`'s run (frame `L` 400 over
30 seconds) and `take_b`'s (600 over 30): the scale beside its
start is 1733.3333333333335 / 130 = 13.333333333333334 canvas units a
second, beside its end 2600.0000000000005 / 130 = 20.000000000000004 (each
the run's `L` over `λ` 130, the session's length); no arrangement gap is a
subject of an edit (`subjectOf` `null`), as a default gap is not.

**The editor's zoom** (`focus.ts`, `elidedReach`): side by side, a once
card counts for every group it lies behind (`ancestor.groups`). Block A
lies at (0, 0), scale 1, so a record's rectangle is its canvas rectangle.
`session`'s once card (groups `[group_1, group_3]`, drawing the
arrangement gap) gives `group_3`'s editor the reach `max(c − x, x + w −
c)` from `group_3`'s frame centre `c`, both read from the records, though
the card is keyed by `group_1`; `score`'s once card (groups `[group_1,
group_2, group_3]`, Proportional at 0.342…, no gap, only seams) elides
nothing, so `group_2`'s editor, behind it alone, has no reach (`null`).

**Motion** (`arrangement-motion.test.ts`, `animation/elide.ts`):
`itemMotions` between `bundle_arranged_roots` drawn Vertical and drawn
Horizontal moves every item that changed place by the change of its box
less the change of the place origin: at progress 0 an element of
`group_2`'s frame is drawn translated by exactly `(x_v − O_v.x) − (x_h −
O_h.x)` and the like downwards (`placedAt`), at 1 at rest; an item drawn at
the same place moves nothing. `blockMotion` from Vertical to Horizontal:
the item motions come first, so a member card of a moving frame takes the
frame's motion; the once card `{item: group_1, member: score}` (same key)
moves sideways; the cards `{item: group_2, member: score}` and `{item:
group_3, member: score}` and `{item: group_3, member: session}` leave
fading (opacity 1 at 0, ½ at ½, nothing at 1 as they are gone), none
unfolding; back from Horizontal to Vertical they enter fading (opacity 0
at 0). The workspace's arrangement of the blocks redraws no block: a block
drawn before and after it is set is the same drawing.

What would be wrong: a block or an item snapping to a free place while
arranged, an order stored that the rules repair into another (the
preview would then lie), a pinned card that moves, a refused drop that
stores anything, a reason that names a group on the wrong side.

## The Arrange menu's model (`arrange-menu.test.ts`)

`arrangeMenuOf(view, editing, disabled, dispatch)` is the one reading of
the stated arrangement and the one place a choice becomes a command, which
every control on an arrangement draws: the canvas's Arrange menu and the
editor's level tab. What proves it is that its state equals what the view
states, read independently from `view.arrangement` and `Block.arrangement`,
and each choice hands `dispatch` exactly the `set` the rules of
"Arrangements on the canvas" give, or nothing; applied through core, the
view then states what was chosen.

1. **The arranger** (`bare` ×5, no arrangement stated): level `arranger`,
   Free chosen, columns 3 (⌈√5⌉), no reason, `disabled` as given. Vertical
   hands `{type: set, changes: [{target: {}, values: {arrangement:
   {direction: vertical}}}]}`, Matrix the same with `{direction: matrix,
   columns: 3}`; with `{matrix, columns 2}` stated, Matrix chosen, columns
   2, More (`oncolumns(3)`) hands `{direction: matrix, columns: 3}`, Matrix
   hands nothing (it is stated), Free hands `arrangement: null`.
2. **A bundle editor** (`bundle_arranged_conflict`): level `bundle`, Free
   chosen, columns 1, the reason `"Theme A" and "Theme B" overlap on
   "Score" (8–16 ♩)`; Vertical hands the block's `set` of `{direction:
   vertical, order: [group_1, group_2]}` (its items in drawing order);
   Free with nothing stated hands nothing. On `bundle_arranged_roots`
   no reason.
3. **Group and timeline editors** arrange nothing: `null`.

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

**A stated subset.** A band order may list `line` and only some facets;
core completes it (an omitted facet keeps its side of the line, beyond the
stated ones), and a move reads and writes the completed order. On
`map_band_order_subset` (`melody` states `[markers, line]`, which core
completes to `[children, conversion_maps, markers, line, regions,
flow_control]`), stepping `melody`'s markers band down in `melody`'s
editor passes the line and gives `D`, the default a root inherits, so the
command is `set order: null` on `{block: A, id: "melody"}`; the store
accepts it and `melody` then has no entry. Stepping it up gives `[children,
markers, conversion_maps, line, regions, flow_control]`, written whole and
accepted.

**On layout's drawing of `styled__score`** the offered bands of `score`
are children 2, markers 1, conversion maps −1, regions −2, flow control
−3, holding 1, 4, 1, 1, 1 elements (the markers band the wedges and
coordinate labels of the named timestamps `origin` and `length`), each
at the ordinate of `score`'s line; each steps as on S, gives nothing released at its own middle, and is
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

## A child's read-only flow control band (`flow-overlay.test.ts`)

Flow control holds across a root's whole tree, and only the root's flow
control band draws it (TimeToShare's drawing specification, section 6.4,
Gathering), so a child drawn as a line in its root's card shows none of it
in its own row. In the timeline editor of a child timeline the canvas shows
beside the child a read-only band of what applies there (`flowOverlays`):
an editor overlay, like the marks, never part of the drawing, of its
descriptors or of the manifest. What proves it:

- **When it appears.** Exactly one band per drawing of the edited child's
  line in a card that is neither the child's own member card nor an ancestor
  card, while that card's flow control band draws an element on the
  child's stretch; none on the arranger, in the bundle editor, in a root's
  timeline editor (`piece` of `child_flow_control`), in the timeline
  editor of another block, nor for a child whose root's tree states no
  flow control (`clt_3` of `nested`). In `group_child_member`, with a
  barline added to `piece` at 12 quarters, inside `second-half`'s stretch
  (8 to 16), `second-half`'s timeline editor shows none: its member card
  draws its root's flow control itself (section 6.4, Gathering), and
  `piece`'s ancestor card is left out.
- **What it holds** (`child_flow_control`, `verse`'s editor): `piece`
  (16 quarters, its line at y 37 from x 55.3134765625, 400 long, so 25 a
  quarter) holds `verse` (offset 4, 8 quarters) in its children band above
  its line, `verse`'s line at y 23 from 155.3134765625 to 355.3134765625.
  `piece`'s flow control band lies below its markers band, from
  `37 + 26.9765625 + 4 = 67.9765625`, `h(9) + Hs = 10.4765625 +
  17.96875 = 28.4453125` wide: one flow label tier and the symbol row,
  `Hs = 2 + h(12) + 2 = 2 + 13.96875 + 2` (the symbol gap 2 on both sides
  of the glyph box). It
  draws `verse`'s break `fine` at `verse` 4 = `piece` 8 (x
  255.3134765625; its line, its stack's label "Fine" and its symbol
  "Fine") and its jump `da_capo_al_fine` at `verse` 8 = `piece` 12 (x
  355.3134765625, the stretch's end, included; its symbol 𝄊, the defaults
  hiding its arc, and no stack, its `label` being null). The band holds
  these four elements, in drawing order, and nothing else; each written
  with its descriptor's attributes but `data-id`, `data-facet` and
  `data-part`, so none is read as the element; the break's line runs
  across the band, from 67.9765625 to 96.421875, not across the card.
- **Where it lies.** `verse` draws no band of its own, so its row ends at
  its line: the band's rectangle starts `4` below it, at y 27, and `4`
  left of the stretch, at x 151.3134765625; it is `200 + 2 × 4 = 208`
  wide (the stretch, wider than its label) and `4 + h(9) + 28.4453125 + 4
  = 46.921875` high; its label "Flow control (from Piece)" (the root's
  name) starts at the stretch's start, baseline `27 + 4 + a(9) =
  39.35400390625`; the band's elements move by `27 + 4 + h(9) −
  67.9765625 = −26.5`.
- **An element of the root on the child's stretch** (`flow/ossia`,
  `ossia`'s editor, `ossia` at 16 of `score`'s 24 quarters): `score`'s
  break `break_1` at 16, at the stretch's start, is shown although `ossia`
  states nothing; `jump_target_1` at 12 lies before the stretch, and
  `jump_2` at 24 draws nothing (an `ossia` destination has no symbol, its
  arc is hidden and it has no stack). `score`'s band, holding a flow line
  alone, is 0 wide, so the line runs a label line high, `h(9)`, from the
  band's place 63.3046875 to 73.78125 (written `63.3047` and `73.7812`,
  the SVG writer's four places), and the overlay is `4 + 2 × h(9)
  + 4 = 28.953125` high; its label names "Score".
- **On the canvas** (`BlockNode`): in `verse`'s editor the node draws one
  `g.tilie-flow-overlay` (`data-flow-overlay="verse"`, `pointer-events`
  `none`, `aria-hidden`) holding its rectangle, its label and its four
  elements, none of them with `data-id`; the drawing's own elements are
  unchanged in number; on the arranger the node draws none.

What would be wrong: the band drawn in the root's or a member card's
editor, an element off the stretch in it, an element of it carrying an
address (it would be hovered, selected or read as the element), or the
band changing the drawing or its exports.

## The flow subeditor (`flow-editor.test.ts`, `flow-editor-pane.test.ts`)

The flow editor is the editor of a root's FlowMaps: a mode of the canvas
on the root's card, its FlowMaps folded out in a pane under the card, an
overlay never part of the drawing. Every case runs on block A holding
TimeToShare's `flow/virtual_cards` at (40, 80): the root `allegro` (1644
quarters, fraction; atomic sections A [0, 953/2), B [953/2, 500), C [500,
1644)), its computed FlowMaps `default` (A B A C, 4241/2), `printed` (A B
C) and `single` (A C), each a convention with an inferred provenance, and
the hand-made `by_hand` "Practice" (A A A A, a gap of 4, C: 3054); the
virtual timelines `allegro_default`, `allegro_single`, `allegro_by_hand`
apply three of them, none `printed`. IDs minted by the store are never
written here: a test reads a new FlowMap's, Region's or virtual
timeline's ID through the result, as the one ID the manifest gained.

**Opening.** The flow editor opens from a root's flow control band on
the arranger and in the root's timeline editor. On the arranger no band
is hit (section "What a press hits"): a press on `allegro`'s card hits the
card, and the drawing point decides: a double-click, a double tap at the
middle of the flow control band's recorded rectangle (layout's record of
`{id: "allegro", facet: "flow_control"}`, read from the drawing) names
that band (`editorTargetOf` with the drawing point), which opens the flow
editor of `{block: A, id: "allegro"}` (`editorOf`: kind `flow`), and the
store then holds that one editor, of kind `flow`; the same card hit at
its own top left corner, outside every band, opens `allegro`'s timeline
editor, as does the card hit with no point (Enter on the selected card).
In the timeline editor of `allegro`, a band is hit, and the band hit
itself names the band; the store then holds two editors, the innermost
`{target: {block: A, id: "allegro"}, kind: "flow"}`. In both, an element
that band draws (the volta jump `{id: "volta_jump"}`, hit before the
band) names the band, with or without the card it lies in, so Enter on
the selected volta jump opens the flow editor too. Every other band opens
nothing: `allegro`'s regions band in its timeline editor, the flow control
band hit in the bundle editor and in another timeline's editor; in the
bundle editor a press on the card at the band's middle opens the
timeline editor of `allegro`, as any press on the card there. Inside the
flow editor nothing opens (the card, its line, the band). Every other
address opens what it opened before (`editorOf` gives it back unchanged,
no kind).

**Rows** (`flowRows`): one per FlowMap of `allegro`, the computed ones
first, each part ordered by the row's name, compared by Unicode code
point, then by ID (never the manifest's order, which is the order of IDs,
and IDs are minted at random): `default`, `printed`, `single`, `by_hand`,
named `default`, `printed`, `single`, `Practice` (a FlowMap's name, else
its convention, else its ID); computed for the first three;
the virtual timeline giving each its axis `allegro_default`, none,
`allegro_single`, `allegro_by_hand`; chips, compared whole: for a
computed one its convention (`{kind: "convention", text: "default",
title: "Convention: default"}`) and provenance (`{kind: "provenance",
text: "inferred", title: "Provenance: inferred"}`), for `by_hand` only
`{kind: "provenance", text: "manual", title: "Provenance: manual"}`. With
findings `{default: ["one", "two"]}` the `default` row gains `{kind:
"findings", text: "2 findings", title: "one\ntwo"}` and no other row
changes; one finding reads `1 finding`. The order is proved on `allegro`
with three hand-made FlowMaps added beside `by_hand` (each playing
`section_a`): `z_first` named `Zeta`, `a_last` named `\u{1D11E}` (U+1D11E,
two UTF-16 units starting 0xD834) and `m_mid` named `\uFF5E` (U+FF5E): by
code point `Practice` < `Zeta` < U+FF5E < U+1D11E, so the hand-made rows
read `by_hand`, `z_first`, `m_mid`, `a_last` (UTF-16 order would put
`a_last` before `m_mid`, ID order `a_last` first); a fourth, `b_tie`
named `Practice`, lies before `by_hand` (one name, IDs `b_tie` <
`by_hand`). A computed FlowMap stays above every hand-made one whatever
its name.

**Rows keep their place while the flow editor is open** (`keptOrder`,
which the pane applies to the rows it shows for as long as it is open:
another flow editor, or the same one opened again, starts from
`flowRows`'s order). Given the order shown before and the rows now in
`flowRows`'s order, every row already shown keeps its place, a row not
shown before is appended at the end in the order given, and a row gone is
dropped. So a FlowMap created in the open editor appears at the end and
stays there, and one renamed keeps its place, until the editor closes.
Cases: shown `[d, p, s, h]`, then given `[d, p, s, F, h]` (F new, sorting
before `h`): `[d, p, s, h, F]`; then given `[d, p, h, s, F]` (`s` renamed
after `h`): `[d, p, s, h, F]` unchanged; then given `[d, p, s, F]` (`h`
removed): `[d, p, s, F]`.

**The pane as drawn** (`flowPaneOf`, on the drawing of block A at the
default placement, `length` 400). Its oracle is layout's drawing of a
virtual card (section 8.10): each row is drawn as the card of a virtual
timeline applying its FlowMap, at the graphical length `400 × Λ / 1644`,
`Λ` its played length, so a played stretch is as long as the written
stretch it plays. `allegro`'s card lies from x 8, 471.6396484375 wide, its
line from x 62.6396484375 (layout's card); so the pane lies at x 8, its
rows' lines start at 54.6396484375 in the pane, and the row of `default`
ends at `54.6396484375 + 400 × 2120.5 / 1644 = 570.5763880968674`. Its
entries are drawn at `54.6396484375 + L × u`, `L = 400 × 2120.5 / 1644`:
entry 0 (A) from 54.6396484375 to 170.5763880968674, exactly as long as
section A on the card (`400 × 476.5 / 1644 = 115.9367396593674`); entries
1 to 3 follow, each its own index (`last` = `index`), no gap. `by_hand`
draws its run of four As once: one span for entries 0 to 3 (`index` 0,
`last` 3), the gap entry 4 a span of its own (`gap` true), and C entry 5,
its texts `A × 4`, `4 ♩` and `C`; its line runs `D` short of its length
(section 8.10, Runs). Rows carry no address attribute (an overlay), and
draw no card rectangle, name or band of their own: every item a row draws
is a line, a brace, a label, a leader or a boundary of the row's virtual
card.

**What each action stores** (`FlowEditorSession` on a store opened in
`allegro`'s flow editor), each command compared whole. The **edited row**
is the new FlowMap's (Add +) or a hand-made FlowMap's (`edit`); one row at
a time is edited, with its own Done and Cancel, and every gesture below
acts on it, whichever it is:

1. Without the new row (Add +), a drop stores nothing and says "Add a new
   FlowMap (Add +) to drop into it"; Add + stores nothing.
2. Dropping section B from the card: `{type: "add", into: {block: A, id:
   "allegro"}, flow_map: {chunks: ["section_b"]}}`; the new row's FlowMap
   is then the one FlowMap `allegro` gained, F.
3. Dropping entry 0 of `default` (`section_a`) before index 0: `{type:
   "set", changes: [{target: {block: A, id: F}, values: {chunks:
   ["section_a", "section_b"]}}]}`.
4. Dropping the card's own line (the whole root) at the end: first `{type:
   "add", into: {block: A, id: "allegro"}, region: {start: [0, 1], end: [1644,
   1]}}` (0 written in the axis's number type), then the `set` with the new Region R appended; the root dropped
   again lands as R and stores the `set` alone. A Region over the whole
   root is found by value, never by spelling: with a Region `whole`
   written `[0, 2]` to `[3288, 2]` on `allegro` (its length `[1644, 1]`),
   the root lands as `whole` and nothing more is written.
5. Dropping the row `printed`, which no virtual timeline applies: `{type:
   "add", into: {block: A}, virtual_timeline: {map: "printed", timeline:
   "allegro", name: "printed"}}` (the row's name, so its card is named
   as the row is, never by the minted ID), then the `set` with the new
   virtual timeline appended;
   the row `default` lands as `allegro_default` with the `set` alone.
6. Moving entry 0 before index 2 stores the entries with it moved
   (`[section_b, section_a, …]`), Alt copies it there
   (`[section_a, section_b, section_a, …]`); removing entry 0 drops it.
7. "+ Gap" `4` stores a gap `{gap: [4, 1]}` at the end; `0` says "a gap
   is longer than 0: 0", `-4` "a gap is longer than 0: -4", `x` the
   parser's message, and nothing is stored. The text is read by the one
   reader of a typed axis value, `typedValue`, which the inspector's
   fields import from this package. "+ Gap" proposes the length of the
   row's last chunk (`proposedGap`, from `resolveFlowMap`'s chunks, the
   played stretch's end less its start, exact, written as the text
   `typedValue` reads back to the same value): `by_hand` ends with C
   [500, 1644): `1144`; a FlowMap playing `section_a` alone: `953/2`; one
   ending with the gap `[4, 1]`: `4`; on a float axis a gap `{gap: 2.0}`
   (an integral float): `2`, read back as the float 2; the new row before
   its first entry, or a FlowMap that does not resolve: the empty text.
   **A gap's length changed** (`regap`): on the edited `by_hand`, entry
   4 given `8` stores one `set` of its chunks with `{gap: [8, 1]}` at 4
   and every other entry as written; `0` says "a gap is longer than 0:
   0" and stores nothing; entry 0 (a Region, no gap) says "entry 1 is no
   gap" and stores nothing.
8. The new row's Cancel undoes every step since Add + (the store's
   entries back to their count at Add +, the Regions and virtual
   timelines written for it gone, `allegro`'s FlowMaps as before) and
   closes the row; its Done closes the row and keeps the FlowMap.
9. A Shift sweep opens the new row where none is and lands as the Region
   it writes: `{type: "add", into: {block: A, id: "allegro"}, region:
   {start: [10, 1], end: [20, 1]}}` for the stretch [10, 20], then the FlowMap's
   `add`.
12. **A hand-made row edited.** `edit` makes `by_hand` the edited row (its
    FlowMap `by_hand` from the start, its mark the session's entries then)
    and refuses the computed `default` (read only) and a second row while
    one is edited. On it: moving entry 5 (C) before 0 stores `set
    by_hand` with `[section_c, section_a, section_a, section_a, section_a,
    {gap: [4, 1]}]`; Alt copies entry 1 to before 1 (five As); removing
    entry 6 (the gap by then) drops it; dropping `section_b` from the card
    lands it at the end; "+ Gap" `2` appends `{gap: [2, 1]}`. Removing
    entry 4 of `by_hand` as written (its gap) and Done keep `[section_a ×
    4, section_c]`, one more entry in the session. Each change is one `set`
    of `chunks` (Done keeps them, as for the new row). Its Cancel undoes
    every one of them: the store's entries back to the mark and `by_hand`
    as written; its Done keeps them and ends the edit. Moving an entry to
    where it is (`move(0, 0)`, `move(0, 1)`) stores nothing: the entries
    are compared by value (a gap `[8, 2]` and `[4, 1]` are one length).

**Findings** are asked of the server only from a handler: when the flow
editor opens (the canvas's `openEditor`) and after Recompute; the pane's
rows read the answer kept for the root (`findingsOf`), which never asks.
With a server answering `{default: ["one"]}`, `findingsOf` is empty
before `askFindings` and `{default: ["one"]}` after it, with no further
request however often it is read; Recompute asks once more; a failed
request keeps none. On the canvas (`flow-editor-pane.test.ts`, a server
answering `{default: ["one"]}`), Enter on the selected repeat sign
`{id: "repeat_end", part: ["symbol"]}`, an element the flow control band
draws, opens the flow editor and sends the request once; the row
`default` shows the chip "1 finding"; Add + and an entry landed by Enter
change the manifest and send none, the chip kept.
10. A row placed as a card at (120, 400): its virtual timeline written
    where none is (`printed`), then one `set` of exactly one change,
    `{target: {block: A, id: V}, values: {place: {x: 120, y: 400}}}` (the
    flow editor changes no other item's place, which its guard refuses);
    `default` places `allegro_default` with the `set` alone.
11. Recompute (`recomputeCommands`): an answer equal to the manifest
    stores nothing; an answer whose `single` plays A B C instead stores
    one `set` of the held `single`, `{target: {block: A, id: "single"},
    values: {computed: {chunks: ["section_a", "section_b", "section_c"],
    provenance}}}` (the answer's provenance), never a `remove` and `add`:
    a virtual timeline applies `single`, so core refuses its removal; an
    answer with an atomic section the manifest lacks first adds it as a
    Region, whole. Through the session (`recompute`, a server answering
    `default` as A C A C and `single` as A B C), every command is accepted
    in the open flow editor, nothing is said, and the store holds
    `default` playing `section_a section_c section_a section_c` and
    `single` `section_a section_b section_c`, their convention and
    provenance as before, and the virtual timelines applying them with the
    new played lengths: `allegro_default` `[3241, 1]` (2 × (953/2 + 1144)),
    `allegro_single` `[1644, 1]` (the whole written axis).

**Carrying a twin.** Its opacity is a function of the pointer's distance
`d` (screen pixels) inside the editor's border (`twinOpacity`): `0.2 +
0.8 × max(0, 1 − d / 96)` inside, 1 on and beyond the border: at −5, 0,
24, 48, 72, 96, 200: 1, 1, 0.8, 0.6000000000000001, 0.4, 0.2, 0.2. The
distance inside a rectangle is the nearest edge's (`insideDistance`), the
editor's rectangle the union of the card's and the pane's. A release
decides (`dropAt`): on the new row it inserts, inside the editor the twin
flies back, beyond the border a row becomes a card and anything else
flies back. An entry lands before the first drawn entry whose middle lies
right of the pointer (`dropIndex`), else at the end.

**The pane on the canvas** (`flow-editor-pane.test.ts`, the canvas in
jsdom on that store, the viewport at the identity, so a client point is
a canvas point; block A at (40, 80), scale 1, the grid 8 and snapping): opening the flow editor shows the pane with four
rows in the order above and Recompute disabled, saying "Recomputing needs
a server", with no server; Add + shows the new row with Done and Cancel;
Enter on entry 0 of `default` lands it (the `add` of item 2's form with
`section_a`); a press on the card's region brace moved past the click
distance and released over the pane but outside the new row writes
nothing (the twin flies back), and released on the new row lands the
Region; Escape during a drag writes nothing; the new row's Cancel leaves
the store's entries as they were at Add +. The row `printed` lifted by its
name and released inside the pane flies back and stores nothing; carried
past the editor's right border (the pane from x 0 to 800 on screen) and
brought back inside before the release it flies back too and stores
nothing (the release decides, never the path); released past the border
at (900, 340), pressed at (100, 300) with the row's drawing lying at
(0, 0) on screen (jsdom lays nothing out), it stores its virtual
timeline's `add` and its place's `set`, two entries, and the new virtual
timeline's place is the twin's top left `(900 − 100, 340 − 300)` less the
block's (40, 80), each rounded to the grid's 8: exactly `{x: 760, y:
-40}`. A hand-made row's Edit button makes it the edited row (class
`draft`, its Done and Cancel shown, no Edit button left on any row);
computed rows have none. The pane offers no list of the card's elements
(no `select`): every row has its Insert button, and the card itself is
dragged.

**Rows on the canvas keep their place.** Add + and Enter on entry 0 of
`default` write the new FlowMap F: the rows read `default`, `printed`,
`single`, `by_hand`, F, and no separate new row is shown. Renaming F
`Aaa` and `by_hand` `Zzz` through the store (`set name`), and another
entry landed, change nothing in that order. Done, the flow editor closed
(`store.done()`) and opened again: `default`, `printed`, `single`, F
(`Aaa`), `by_hand` (`Zzz`), the order by name.

**The gap control at its row.** "+ Gap" on the new row before its first
entry shows the input inside that row (`[data-testid="flow-draft"]`),
empty; `4` and Enter store `{gap: [4, 1]}` as the new FlowMap's first
entry and close the input; "+ Gap" on that row (now drawn with its gap)
shows the input in its row with `4`. `by_hand` edited: "+ Gap" shows
`1144`; a click on its gap entry (index 4) shows the input with `4`, `8`
and Enter store one entry, `by_hand`'s entry 4 `{gap: [8, 1]}`, and close
the input. Escape closes it without storing.

**Ctrl+scroll over the rows.** With the viewport at `{x: 0, y: 0, zoom:
1}`, a wheel with Ctrl (`deltaY` −100, pixels) over a row's drawing zooms
the canvas as anywhere else on it: Svelte Flow's pinch zoom, `2 ^ (100 ×
0.002) = 2 ^ 0.2 = 1.148698354997035` outside macOS, about the pointer;
the zoom read back is exactly that. A plain wheel (`deltaY` 40) and a
Shift wheel reported as horizontal travel (`deltaX` 40, the form the
canvas pans itself outside macOS, `shiftWheel`) over the same row, sent
first, neither pan nor zoom: the viewport stays `{x: 0, y: 0, zoom: 1}`.

## The editor's viewport (`focus.test.ts`)

The rectangle an editor centres is its target's container on the canvas,
read from the drawing's records: on `mixed` at (40, 80), its ancestor
card hidden, the block `{block:
A}` `{40, 80, 579.052001953125 × 469.14453125}`, `{block: A, id:
"group_1"}`'s frame `{48, 108.8046875, 561.052001953125 × 166.7265625}`,
`{block: A, id: "annotations"}`'s card `{48, 467.2890625,
561.052001953125 × 71.85546875}`; a child with no card the rectangle
around the geometric bounds of its drawn elements (layout's `boundsOf`,
the drawing specification's section 6.7: a line with its start circle
and its end's mark, no stroke width counted), `{block: A, id:
"dlt_1"}`'s line and name `{64, 374.41015625, 306.79150390625 ×
12.8046875}`: the name's left at 64, its top and height, and on the
right the line's open diamond (a child whose end is known), whose right
corner lies `1.5w = 4.5` past the line's end (child `stroke-width` 3,
section 4's defaults), the end at 166.29150390625 + 200 =
366.29150390625 (`excerpt`'s start, below, and 44100 samples at 2000 over
441000), so the right 370.79150390625; the start circle's radius 3 stays
within the name's height and right of it; at scale 2 the frame
`{56, 137.609375, 1122.10400390625 × 333.453125}`; a target in another
block (`{block: "0000000009", id: "group_1"}`) throws. What an ancestor
card draws counts only while the card is raised, as for the marquee
(below): on `mixed` drawn with the defaults in the Full view
(`withFullCards`, "Whole ancestor cards" in the fixture facts: the subject is the viewport,
not the elision), `recording`'s ancestor card shown whole behind
`group_2`'s frame, `dlt_1`'s rectangle is the same `{64,
374.41015625, 306.79150390625 × 12.8046875}` (every element outside the
card keeps its canvas place), not one stretched over the copy of `dlt_1`
the card draws; in `recording`'s own timeline editor, which raises the
card, `recording`'s rectangle spans the card's drawings with the ones
outside it. The card draws `recording`'s 441000 samples at
`excerpt`'s proportions (2000 for its 88200 samples' 400) with the two
seams of the frame's room (section 8.8; drawing.md section 3.2, Seams):
`OL = x0 − frame.x = 118.29150390625` at `excerpt`'s start and `OR = Fw
− (x0 + L') = 561.052001953125 − 118.29150390625 − 400 =
42.760498046875` at its end, so the card's `recording` line starts at
`126.29150390625 − 200 − OL = −192` and ends at `−192 + 2000 + OL + OR
= 1969.052001953125` in the block; its name column (`K = 8`, "Recording"
`N = 55.70361328125`, `G' = 8`) puts the card's left edge at
`−263.70361328125`, so the place origin moves to x 271.70361328125 and
the node lies at 40 − 271.70361328125 = −231.70361328125. The card's
left edge lies 8 right of the node, its names 8 further, so x
−215.70361328125; the right end is the tip of the arrowhead of the
card's `recording` line (a root whose end is known and whose `locked` is
false), `3w = 9` past the line's end, `40 + 1978.052001953125 =
2018.052001953125`, width 2233.755615234375; the top is the line of the
groupstamps `origin` and `length` of `excerpt` (`timestamp_3`,
`timestamp_4`, each `display` holding `cross_section`) across
`group_2`'s frame, from the top of `page`'s card (228.3359375 in the
drawing, section 8.7's `groupSpans`) down to `excerpt`'s card, so
`80 + 228.3359375 = 308.3359375`; the bottom is the end of their
cross-section pieces at the lower border of `excerpt`'s member card,
`80 + 285.8125 + 85.4765625 = 451.2890625`, height 142.953125. The
card's own rectangle and
`excerpt`'s card are containers and do not count. What would be wrong: an
editor fitting a child's view to a copy the user does not see. The viewport centres it in the pane less the drawer with 10 % free
on each side, the zoom clamped to [0.05, 4]: in a 1200 × 800 pane with a
400 drawer, `{100, 50, 320 × 160}` gives `{x: −120, y: 140, zoom: 2}`,
`{100, 50, 10 × 10}` `{x: −20, y: 180, zoom: 4}`, `{100, 50, 100000 ×
100}` `{x: −2105, y: 395, zoom: 0.05}`; no drawer, 1000 × 500, `{0, 0, 400
× 100}` gives `{x: 100, y: 150, zoom: 2}`. The move takes 1000 ms.

**A group's frame with elided ancestor cards** (`elidedReach`; the zoom
`zE = min(zG, f · W / (2 · reach))`): the group's subeditor
centres the frame as above and zooms out until every displayed ancestor
card behind the frame that elides fits on both sides of the
frame's centre `c`: `reach` is the largest of `c` less a card's left edge
and its right edge less `c` (canvas units), `f` = 0.8, `W` the pane
width, `zG` the zoom fitting the frame. The view is the drawing's
default, 1280 × 720, the pane the test passes.

The cards' places and widths are layout's record (its tests are the
oracle for an elided card, section 8.9); what is derived here is the
reach and the zoom from them.

- `groups/group_grandchild` in block A at (0, 0), its group's editor
  open: the node lies at x −245.69419642857133 (the place origin the
  elided card `score` moves); the frame at 8, width 543.70361328125,
  height 191.5390625 (the ancestor rows of section 8.3 at 7/7, the
  member card's rows beyond the derived elisions' name stack 19.9765625
  lower, as the card behind draws them), so `c` = 8
  + 543.70361328125 / 2 = 279.851806640625; the card `score` at 8 −
  245.69419642857133 = −237.69419642857133, width 1034.96923828125, right
  edge 797.2750418526787. Left 517.5460030691963, right
  517.4232352120537: `reach` 517.5460030691963. `zG` = min(4, 1024 /
  543.70361328125, 576 / 191.5390625) = 1.8833790598156273, the viewport
  `{x: 112.932967521475, y: 164.56263779686665}` without the reach;
  `zE` = 1024 / (2 × 517.5460030691963) = 0.9892840384500954, which the
  viewport takes, `{x: 363.14707455900725, y: 257.3424590569266}` (640
  and 360 less the bounds' centre (279.851806640625, 103.76953125) times
  the zoom).
- `bundles/bundle_elided_layerit`, each of its four groups' editors: the
  node at −405.3981445312529, every frame at 413.3981445312529 in the
  drawing, 8 on the canvas, width 622.8037109375, `c` 319.40185546875,
  `zG` 1024 / 622.8037109375 = 1.6441777433512452. The cards (drawing
  x, width): `group_1` 241.5075195312529, 1209.371533203128 (left
  483.29248046875, right 726.0790527343779: `reach` the right side, `zE`
  0.7051573765581493); `group_2` 122.80427763598891, 1211.9733886718823
  (left 601.995722364014, right 609.9776663078683: `reach`
  609.9776663078683, `zE` 0.8393749940044248); `group_3`
  69.3446105918647, 1215.9802246093786 (left 655.4553894081382, the card's
  widest row name being `Prelude, Menuet, Clair de L…`, 159.8974609375
  wide, right 560.5248352012404: `reach` the left side, `zE` 1024 / (2 ×
  655.4553894081382) = 0.7811363035130807);
  `group_4` 8, 1005.4809082031279 (left 319.40185546875 +
  397.3981445312529 = 716.8000000000029, `zE` 0.7142857142857114). The
  smallest zoom fits the excerpt at the work's start (about 0.71).
- In the Full view (`withFullCards`) no card elides: `reach` is
  `null` and the viewport is the frame's alone, `zG` (the root runs past
  the screen). A timeline's editor and the bundle's give `null` too.
- `focusViewport` with a reach, 1000 × 500 and no drawer: `{0, 0, 400 ×
  100}` and `reach` 400 give zoom 800 / 800 = 1, `{x: 300, y: 200}`;
  `reach` 100 keeps 2 (800 / 200 = 4 is larger); `reach` 10⁶ gives
  0.05, the smallest zoom.

What would be wrong: the zoom fitted to the frame alone while elided cards run
off the screen, the Full view zoomed out to a root of thousands of units.

## The marquee inside an editor (`marquee.test.ts`)

A marquee selects elements, never containers, and only inside the edited
element; an element's bounds are its geometric bounds as layout's
`boundsOf` gives them (the drawing specification's section 6.7, no
stroke width counted: a line with its start circle and its end's
arrowhead, circle, diamond or chevrons, a map with its double line, a
region by its brace's points, a jump with its arrowhead, a text
from its measured width, ascent and descent), and an address drawn more
than once is taken only when every copy lies inside. What an ancestor card draws counts only while that card is
raised, that is while the timeline editor of its root is open (the
canvas then shows it over every frame): otherwise it lies behind the
frames, and the marquee reads the drawings outside ancestor cards alone,
so an address drawn there and in the card is taken by its drawings
outside, and one drawn only in the card is never taken (an affordance on
the card's lines included). This is the one stated exception to "a
coordinate is placed wherever it is seen" (above, "Show coordinates"): a
marquee selects addresses, not places, and what an unraised card alone
shows beside the frames is taken once the card is raised; which drawings
lie below the frames is the stacking's (`stackingOf`, the order the
block node shows them in), read for elements and affordance lines alike.
While the card is raised, its drawings count as any other, inside the
edited element. On
`mixed` with the region `region_3` (0 to 10 samples) on `excerpt` and the
map `cmap_7` on `dlt_1` (`region_1` and `cmap_3` are taken: an ID is
unique across the manifest), at (40, 80), drawn with the defaults, so
`recording`'s ancestor card lies behind `group_2`'s frame, aligned to
`excerpt` (it draws `recording` with its map `cmap_5`, `excerpt`, `dlt_1`,
`cmap_6`, `cmap_7`, `region_3` with its label, `timestamp_3`,
`timestamp_4` and the three names once more, a child's regions band being
shown by the defaults, drawing.md section 4; the place origin moves left by as much as the card reaches beyond
the frames, and every other element keeps its place on the canvas, so the
canvas rectangles below are the ones of the drawing without the card),
each result an address in block A, written below by its element address:

- The rectangle of `score`'s card gives, in drawing order, `{id:
  "cmap_1"}`, `{id: "cmap_2"}`, `{id: "score"}`,
  `score`'s named timestamps `{id: "timestamp_9"}` and `{id:
  "timestamp_10"}` (`origin`, `length`: each its wedge and its coordinate
  label, which stand for the timestamp), `{id: "score", part: ["name"]}`
  and the symbol of its jump `{id: "jump_1", part: ["symbol"]}` (the
  defaults hide the jump's arc and its label), never the card. Every part of
  a named timestamp (its wedge, its labels, its line) stands for the
  timestamp, taken where its first part is drawn, and only when every
  part lies inside.
- `cmap_7` lies in `dlt_1`'s conversion maps band, centred `1.5 + 5 − 1 =
  5.5` above `dlt_1`'s line; its reach 6.5 stays within the row's half
  pitch 7, so nothing else moves. The region lies in `excerpt`'s regions
  band, `26.9765625 + B` below its line, one row wide. `excerpt`'s card
  then spans y 288.3203125 to 416.25: from its top, `P`, the children
  band (`dlt_1`'s row, 14, from 296.3203125), `S`, `excerpt`'s maps band
  (6.5) and its line at 320.8203125; below it the markers band (to
  347.796875), the regions band (351.796875 to 370.2734375) and, outermost
  below (`recording`'s band order puts its children above its line), the
  ancestor band with `recording`'s ancestor line, below 374 (layout's
  record), on which no line marks `excerpt`'s start or end (section 8.3).
  `excerpt`'s named timestamps `timestamp_3` and `timestamp_4` (its
  `origin` and `length`) are groupstamps (a child joining a group gets
  them so), whose cross-section lines cross every member card of
  `group_2`, `page`'s above `excerpt`'s included.
- `{40, 370, 600 × 84}` (drawing y 290 to 374: from above `cmap_7`'s and
  `dlt_1`'s name's tops, 296.8203125 and 296.91796875, to between the
  lowest labels of the member, 370.7734375, and the ancestor line,
  376.7734375) gives `{id: "cmap_6"}` (`excerpt`'s map), `{id:
  "cmap_7"}`, `{id: "region_3"}`, `{id: "excerpt"}`, `{id: "dlt_1"}`,
  `{id: "dlt_1", part: ["name"]}`, `{id: "excerpt", part: ["name"]}`,
  `{id: "region_3", part: ["label"]}`; the ancestor line `{id:
  "recording"}` below, and `timestamp_3` and `timestamp_4`, whose lines
  run up through `page`'s card, are left out.
- Inside `dlt_1` only `{id: "cmap_7"}`, `{id: "dlt_1"}`, `{id: "dlt_1",
  part: ["name"]}`: core's containment decides by what an element belongs
  to; inside `group_1` nothing. A child's line is taken with its end's
  mark: `dlt_1`'s line ends at the canvas abscissa 366.29150390625 and
  its open diamond reaches `1.5w = 4.5` further (the focus section
  above), so inside `dlt_1` the rectangle from (40, 370) to the abscissa
  370.79150390625 (width 330.79150390625, height 84) takes all three,
  and one 0.5 narrower takes `cmap_7` (a map ends at its line's end) and
  the name but not `dlt_1`. What would be wrong: bounds stopping at the
  line's end, which take a line whose diamond the rectangle cuts. Without the rule above, `cmap_7`, `dlt_1`
  and its name would each have a second drawing in the card, outside the
  rectangle, and nothing would be taken.
- A rectangle 2 larger on every side than `excerpt`'s member card (as the
  drawing records it, moved and scaled onto the canvas) takes, in the
  order their first drawings outside the card come: `cmap_6`, `cmap_7`,
  `region_3`, `recording` (its ancestor line in the member card),
  `excerpt`, `dlt_1`, the names of `recording`, `dlt_1` and `excerpt` and
  `region_3`'s label: the member, its maps, its child and its name, though
  their second drawings in the card lie outside the rectangle (the lines
  and maps above it, the names in the card's name column left of it);
  not `timestamp_3` and `timestamp_4`, whose lines reach into `page`'s
  card. One 2 larger than `group_2`'s frame takes, before those,
  `group_2`'s name and `page`'s card's `cmap_4`, `page`, `timestamp_5`,
  `timestamp_6` and `page`'s name, and `timestamp_3` and `timestamp_4`
  after `dlt_1`, whole inside the frame; the names are taken too.
- The ancestor card's two points below draw in the Full view
  (`withFullCards`, "Whole ancestor cards" in the fixture facts): their subject is what the
  marquee takes of the card, not its elision, so the card is whole.
- A rectangle 2 larger than the ancestor card itself (as layout records
  it, y 282.3125, 106.85546875 high: it lies on `recording`'s ancestor
  row, and the regions band of `excerpt` it draws, below `excerpt`'s row,
  puts that row and `dlt_1`'s further above `recording`'s line, so the
  card covers the member card from above `dlt_1`'s row, whose map
  `cmap_7` reaches up to 290.3125 and whose name to 290.41015625, down to
  the ancestor line) takes, unraised, only what the member card draws
  inside it: `cmap_6`, `cmap_7`, `region_3`, `recording`'s ancestor line,
  `excerpt`, `dlt_1`, the names of `recording`, `dlt_1` and `excerpt` and
  `region_3`'s label; never `cmap_5`, which only the card draws, nor
  `timestamp_3` and `timestamp_4` (their lines reach into `page`'s card). Its part left
  of the frame
  (to 2 left of the frame's left edge), the only part of the card the
  user sees there, takes nothing. In `recording`'s timeline editor the
  card is raised and the editor's own inside applies: the whole card's
  rectangle takes, in the order of their first drawings (the card's
  first), `cmap_5`, `cmap_6`, `cmap_7`, `region_3`, `recording`,
  `excerpt`, `dlt_1`, the names of `dlt_1`, `excerpt` and `recording`,
  and `region_3`'s label (`timestamp_3` and `timestamp_4` have lines in
  `page`'s card); the part left of the frame still
  takes nothing, since each name drawn in it is drawn once more in the
  member card, right of it.
- An affordance on an ancestor card's line counts by the same rule: with
  a timestamp `mark` "Mark" (22050 samples, `display` `[]`) added to `recording`,
  the only marked line holding `recording` is the card's, so its
  affordance lies there, behind the frame. A rectangle over the whole
  drawing takes the ten timestamps `timestamp_1` to `timestamp_10` and not
  `mark`; in `recording`'s editor it takes `timestamp_3`,
  `timestamp_4` and `mark`. The node's `inside` (the projection's
  `insideOf`) and the marquee read the affordances with the root the
  node's editor raises, as the block node draws them, so what the marquee
  can take is what is drawn: `mark` is inside the node only in
  `recording`'s editor. What would be wrong: the marquee reading the
  affordances of nothing raised while the node draws the raised ones (an
  affordance drawn on the raised card that no marquee takes).
- A named timestamp that draws nothing is taken by its affordance (its
  bounds those of the affordance's three points, `affordancesOf`), whole,
  as one address: on `timestamps`
  with `display` `[]` on `timestamp_2` (6 on `clt_1`, its wedge at the
  drawing's abscissa 349.91552734375, 3 to each side), the rectangle of
  the whole drawing takes `timestamp_1`, `timestamp_2` and `timestamp_3`,
  each once and no part of them; one ending at the drawing's abscissa 340
  takes `timestamp_1` (at 3/2, abscissa 124.91552734375) and
  `timestamp_3` (1 on `clt_2` at offset 2, 199.91552734375) without
  `timestamp_2`.
- The bounds the marquee reads (layout's `boundsOf`) of the two elements
  whose points may come in any order: an alignment anchor's line spans
  its two end points, whichever is first: from (120, 80) to (40, 30)
  `{left: 40, top: 30, right: 120, bottom: 80}`; a horizontal one from
  (40, 64.5) to (300, 64.5) `{left: 40, top: 64.5, right: 300, bottom:
  64.5}`. A wedge spans its tip and its base's two corners, as it is
  turned: tip (10, 5) and corners `(dx −3, y 18)`, `(dx 3, y 18)` give
  `{left: 7, top: 5, right: 13, bottom: 18}`; turned 90, corners `(13,
  8)` and `(13, 2)`, `{left: 10, top: 2, right: 23, bottom: 8}`; with both
  corners up and to the left, `(dx −11.3136, y 5 + (−2.8284))` and `(dx
  −7.071, y 5 + (−7.071))`, `{left: 10 + (−11.3136), top: 5 + (−7.071),
  right: 10, bottom: 5}` in doubles, the tip the right and the bottom.

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

## Show coordinates (`coordinates.test.ts`, `on-screen.test.ts`)

With "Show coordinates" on, the pointer reads a timeline where it comes
near its line or any map drawn at that line, and the reading is the
timestamp of one position, held as the pin a click there makes. A
timestamp is the cross-section of the hovered line's timeline (the
anchor): everything its cross-section line crosses. What would be wrong
is shown by four questions, each answered with exact values: is the right
thing hovered, is the cross-section handed to core the one the drawing
crosses, is the position picked on the hovered row, and is a named
timestamp read as a click at its coordinate reads it. The values a map
gives, the snapping rule and the timestamp itself are core's (proven
there against timetoalign and by hand); the tests here prove that the
arranger hands core the anchor, the members, their offsets and the maps
the drawing shows, the right row and the right `p` and `h`, and nothing
else. Where a line lies and which lines a cross-section line crosses is
layout's: the tests read the lines and maps of a drawing from layout's
`lineAxes` record and `crossedLines`, the oracles for geometry, and derive
every point from them; the numbers quoted below are that record's for
block A holding the fixture at (40, 80), scale 1.

**Hovering.** A line is read where it draws coordinate markers (a line
`crossedLines` crosses), and an ancestor line, which draws none, is read
as its ancestor's (below, "An ancestor line"); a line covered where the
pointer is (below, "A covered line") is not read. Each is read over its
drawn span, from `xStart` to `xEnd`, which stands for
the coordinates of layout's record `drawnLength`: its length where known,
else up to its reach (section 3.2), on the scale every line of its card
shares; a line whose drawn length is 0 (a zero-length line, or one of
unknown length reaching no further than its start) stands for no
coordinate and is never hovered. A line is hovered anywhere in its zone: from the line out to
the outermost map drawn at it, 8 device pixels beyond, over the line's
span widened by 8 device pixels on each side, so the reading never stops
between the line and a map or between two maps, at any zoom. One canvas
unit covers zoom × the block's scale × the device pixel ratio device
pixels, so at 1, 1, 1 the tolerance is 8 canvas units, at zoom 2 on ratio
2 it is 2. Within the zone the nearest in ordinate of the line and of
each map whose span (widened alike) holds the abscissa is hovered, the
line on a tie, an earlier map before a later one. Where two lines' zones
hold the point, the line nearer by what is hovered in it wins. The
abscissa is held to the span of what is hovered. A point that is not
finite reads nothing: in `groups/group_parent_both` (below) the points
(564.0390625, NaN) and (NaN, 47.20703125) give no reading (what would be
wrong: with the ordinate NaN every distance is NaN and the first line
whose span holds the abscissa would be read, `middle`'s; with the abscissa
NaN core's `snapOnRow` would throw). In `map` (`melody` y
40.5 from 63.53662109375 to 463.53662109375, its map `tempo` at 35 over
the same span; `phrase` y 23 from 163.53662109375 to 363.53662109375 with
`ticks` at 17.5), at the abscissa 263.53662109375:

| Point y | Hovered | Why |
|---|---|---|
| 48.5 | `melody`'s line | 8 below, the bound included |
| 48.515625 | nothing | 8.015625 below |
| 37 | `tempo` of `melody` | 2 from the map, 3.5 from the line |
| 37.75 | `melody`'s line | 2.75 from both: the tie goes to the line |

At (471.53662109375, 40.5), 8 right of `melody`'s end, the line is
hovered with the abscissa held to 463.53662109375; at 471.55224609375
nothing is. At (156, 20) `phrase`'s line (3 away) and its `ticks` (2.5)
are both in reach and `ticks` wins, held to 163.53662109375. In
`unknown_length` the line of `score` (length unknown, y 37 from
53.798828125 to 453.798828125) reaches 14 (its child `coda` at 10, 4
long; its region ends at 8, its segno at 6): its drawn length is 14, so
14/400 = 0.035 a canvas unit, and `coda`'s line starts at 53.798828125 +
10/0.035 = 339.5131138392857 (layout's record). At (353.798828125, 37),
on the line 300 right of its start, `p` = 300 · 0.035 = 10.5 and `h` =
0.035 / 2 = 0.0175: the position is **21/2** (exact on divisor 2), and
the timestamp holds `score` at 21/2 and `coda` at 1/2. A root of unknown
length added to `map` without content, `late` (block A, `add {into:
{block: A}, timeline: {id: late, unit: quarters, number_type: fraction,
length: null}, ids: [late_origin]}`, which brings its `origin` `late_origin` at 0), reaches 0:
its line is drawn (y 22.40234375 from 63.53662109375 to 463.53662109375)
but its drawn length is 0, so it is not among the lines read and nothing
is hovered on it.

At zoom 2 on device-pixel ratio 2 (tolerance 2), with a second map
`tempo_2` (`tempo` under another ID) added to `melody`, the line lies at
45.5, `tempo` in slot 1 at 40 and `tempo_2` in slot 2 at 35 (layout's
record), so the zone runs from 33 to 47.5. At the abscissa
263.53662109375:

| Point y | Hovered | Why |
|---|---|---|
| 42.5 | `tempo` | between line and slot 1, beyond 2 of both; 2.5 from `tempo`, 3 from the line |
| 43 | `melody`'s line | between line and slot 1; 2.5 from the line, 3 from `tempo` |
| 37.75 | `tempo` | between the slots; 2.25 from `tempo`, 2.75 from `tempo_2` |
| 37.25 | `tempo_2` | between the slots; 2.75 from `tempo`, 2.25 from `tempo_2` |
| 33 | `tempo_2` | 2 beyond the outermost map, the bound included |
| 32.984375 | nothing | 2.015625 beyond it |
| 47.5 | `melody`'s line | 2 below the line, the bound included |
| 47.515625 | nothing | 2.015625 below it |

The three rules below are proven on `groups/group_parent_both` (block A at
(40, 80), scale 1), whose `group_1` lists `middle` (`piece`'s child at
offset 4, 8 of `piece`'s 16 quarters, fraction) and `recording` (10.0
seconds). Its drawing shows `piece`'s **ancestor card** behind the frame
(drawn by default; layout's README, "Ancestor cards", point 2), which
moves every item right by 252.33544921875: the card's axis has a seam at
each border of the frame (`docs/drawing.md` in TimeToShare, section 8.8,
step 2: the frame's room `OL = 103.70361328125` from its left edge to the
members' lines and `OR = 40` from their end to its right edge), so what
lies of `piece` before `middle` (0 to 4) lies left of the frame and what
lies after it (12 to 16) right of it. Layout's record, the oracle: the
frame from (260.33544921875, 8), 543.70361328125 × 157.5625, so its
borders lie at x 260.33544921875 and 804.0390625; `middle`'s card from
(268.33544921875, 32.8046875), 527.70361328125 × 67.37890625, holding
`middle`'s own line at y 47.20703125 (the card's top plus `y_root =
14.40234375`; span 364.0390625 to 764.0390625, 0 to 8: `260.33544921875
+ OL`) above `piece`'s ancestor line at 85.18359375 (37.9765625 below it:
`piece`'s default band order puts its children band above its line, so
its line lies below the member, layout's README, "Ancestor lines"; same
span, start 4, drawn length 8: clipped to `middle`); `recording`'s card
from y `32.8046875 + 67.37890625 + 8 = 108.18359375`, its line at
122.5859375; the ancestor card from (8, 36.20703125) (`85.18359375 −
48.9765625`, the distance of `piece`'s line below its card's top),
1013.0390625 × 63.37890625 (its bottom at 99.5859375), keyed `{item:
group_1, member: piece}`, its lines (each carrying `ancestor {group:
group_1, member: middle}`, listed after every item's) `piece` at
85.18359375 in three runs, 60.33544921875 to 260.33544921875 (0 to 4),
364.0390625 to 764.0390625 (4 to 12) and 804.0390625 to 1004.0390625
(12 to 16), 50 units a quarter on each, and `middle`'s row at 51.20703125
(the card's top plus `P = 8` and the row's half pitch 7) from 364.0390625
to 764.0390625 (0 to 8). The card lies on `piece`'s ancestor row and is
aligned to `middle`, so a coordinate of `piece` under the frame has the
same abscissa on both of its lines; 4 and 12, at the seams, lie on the
run under the frame (section 3.2: a position at a seam lies on the
span's side).

**An ancestor line is read as its ancestor's** (`axesOf`,
`crossSectionSpec`). A child member's card draws its ancestors' lines
beside its own (below it under the default band orders); they draw no markers, but the pointer reads them as any
line over their drawn span: the position is picked on the ancestor's own
axis (`p` from the line's `start` and drawn length as on any line), the
hovered row is the ancestor's coordinate, and the cross-section is the
one the member's line gives at the same abscissa, anchored on the
ancestor: the ancestor at the ordinate of its ancestor line, its own
ancestors, then the member (and any timeline between the two) and what
the member's cross-section line crosses, each at its offset from the
ancestor's zero summed down the manifest, at its line's ordinate in that
card. The timestamp is the ancestor's, so a click pins and naming names
what they do on the ancestor's own line; and as there, the reading holds
no group (the ancestor is no member: a group is read only from the lines
of its members, `holds` naming the hovered timeline). What would be
wrong: nothing read there (a name label lying on such a line silencing
the reading), the member's timestamp instead of the ancestor's, or the ancestor read without the member. On
`group_parent_both`'s ancestor line at a quarter, the middle and three
quarters of its span (x 464.0390625, 564.0390625, 664.0390625, y
85.18359375, the arranger, nothing raised): `p` = 4 +
share × 8 = 6, 8, 10 and `h` = 8 / 400 / 2 = 0.01, so the positions are
**6, 8, 10** (integers); the hovered timeline `piece`, the row `{timeline:
piece, map: null}`, the line's card `{item: group_1, member: middle}`;
the spec's anchor `piece` (ordinate 85.18359375) and its one member
`middle` at offset 4 (ordinate 47.20703125); the parts `piece` 6, 8, 10 and
`middle` 6 − 4 = 2, 4, 6; `readsGroup` false. The flag lists `Piece`
(its coordinate the hovered row) above `Middle`.

**Two ancestor lines, an ancestor of unknown length, and the scales.**
The same rules hold for a grandchild, for an ancestor whose length is
not known, and at an item scale, a block scale and a zoom other than 1
(`group_grandchild`, and `group_parent_both` at the scales, drawn in the
Full view, `withFullCards`, "Whole ancestor cards" in the fixture facts:
the subject is the ancestor lines and the cards' rows, not the elision,
so the cards are whole):

- `groups/group_grandchild` (block A at (40, 80)): `theme` (8 quarters)
  is `movement`'s child at 8, `movement` (16) `score`'s at 16, `score`
  64 long. Layout's record, the oracle (layout's README, "Ancestor
  lines": `theme`'s line at 47.20703125, its ancestor lines below it,
  the nearest 37.9765625 further, the next 14 beyond): `theme`'s member
  card in `group_1`'s frame (from 1282.265625 to 1825.96923828125) draws
  `theme`'s line at 47.20703125, `movement`'s ancestor line at
  85.18359375 (start 8, drawn length 8) and `score`'s at 99.18359375
  (start 24, drawn length 8), each from 1385.96923828125 to
  1785.96923828125 (50 a quarter); `score`'s ancestor card (its top
  `99.18359375 − 62.9765625 = 36.20703125`) draws `score` at
  99.18359375 in three runs (82.265625 to 1282.265625, 0 to 24;
  1385.96923828125 to 1785.96923828125, 24 to 32; 1825.96923828125 to
  3425.96923828125, 32 to 64) and its `movement` row 14 above, at
  85.18359375 (882.265625 to 1282.265625, 0 to 8; 1385.96923828125 to
  1785.96923828125, 8 to 16). At x 1585.96923828125 (`theme` 4 = 200 /
  50): on `score`'s ancestor line the anchor is **`score` 28** at the
  ordinate 99.18359375, its members `movement` at offset 16
  (85.18359375) and `theme` at 24 (47.20703125); on `movement`'s
  ancestor line the anchor is **`movement` 12** at 85.18359375, its
  members `score` at −16 (99.18359375) and `theme` at 8 (47.20703125);
  the timestamp's parts keep the anchor first, and the flag lists them
  top to bottom **`theme` 4, `movement` 12, `score` 28**, as the user
  sees the three lines in `theme`'s card. The card's `movement` row lies
  at the ordinate of `movement`'s ancestor line: at (1585.96923828125,
  85.18359375), in the frame, the card's row is covered and the ancestor
  line in `theme`'s card is read (`movement` 12, card `{item: group_1,
  member: theme}`); left of the frame, at (1032.265625, 85.18359375), the
  card's row is read: `movement` 3 (150 / 50), `score` 19.
- `group_parent_both` with `piece`'s length set to null: its reach is
  `middle`'s end, 12, so the card's line runs in two runs, 60.33544921875
  to 260.33544921875 (0 to 4, its length 4) and 364.0390625 to
  764.0390625 (4 to 12, length unknown, drawn length 8): 12 lies at the
  seam at the span's end, on the span's side (section 8.8, step 2), so
  the line ends under the frame; the ancestor line keeps its place (4 to
  12, 364.0390625 to 764.0390625). On the ancestor line at its middle
  (564.0390625) `piece` 8, `middle` 4; at its end (764.0390625) `piece`
  12, `middle` 8; left of the frame (110.33544921875) the card's line,
  `piece` 1.
- `group_parent_both` with `group_1`'s place scale 2, block A's scale
  0.5 and zoom 3 (so the tolerance is 8 / (3 × 0.5) = 16/3 units): the
  frame from 512.6708984375 to 1600.078125, `piece`'s ancestor line at
  `8 + (85.18359375 − 8) × 2 = 162.3671875` from 720.078125 to
  1520.078125 (4 to 12, 100 a quarter), the card's `piece` line on it at
  162.3671875 in three runs, 112.6708984375 to 512.6708984375 (0 to 4),
  720.078125 to 1520.078125 and 1600.078125 to 2000.078125 (12 to 16).
  Left of the frame (212.6708984375) the card's line: `piece` 1; on the
  ancestor line (1120.078125) `piece` 8, `middle` 4; inside the frame
  left of the ancestor line (612.6708984375, in the frame's room):
  nothing.

What would be wrong: an ancestor line read from the wrong ancestor (a
grandchild's two lines confused), the parts in another order than the
lines lie in the card, the covered card row read through the frame, an
unknown length or a scale breaking the abscissas.

**A covered line is not read** (`stackingOf`, `raisedRoot`). One
stacking order says what lies over what, the order the block node shows
its drawing in (`raisedLayers`): from the bottom, the ancestor cards
that are not raised, in record order (a later one over an earlier one),
then every frame and card the block holds (one level), then the raised
ancestor cards, in record order. A root's cards are raised while a
timeline editor is open on a timeline of that root drawn in no member
card below the root, the root being in no group or a member drawing an
ancestor card (`raisedRoot` gives the root, else `null`; "Ancestor
cards", point 6).
A line takes the level of the card drawing it, and it is covered at a
point where a displayed frame or card of a higher level holds the point;
a box whose rectangle is not drawn covers nothing. The pointer reads a
line only where it is not covered at the abscissa the reading lands on,
on the line itself (the pointer's abscissa held to what is hovered, at
the line's ordinate), so it reads a line exactly where that line is a
place (below, "A coordinate's place"). So an unraised ancestor card's
lines are read beyond the frame's borders, never inside the frame or a
member card; raised, they are read everywhere but inside a raised card
recorded after their own, and every other line is covered inside a raised
card's rectangle. Items laid over one another by the user (a frame placed
over another frame or card) lie on one level: a member's line is read
under a frame drawn over it. What would be wrong: the
card's `middle` row read inside the frame, where the user sees the frame
and `middle`'s card; the card not read beyond the
frame; the card not read once raised. At the abscissa
564.0390625 (inside the frame and both cards) and beyond the frame's
borders, on the arranger and with `piece`'s timeline editor open:

| Point | Arranger | `piece`'s editor open, its card raised |
|---|---|---|
| (564.0390625, 51.20703125), the card's `middle` row | not the row, covered by the frame: `middle`'s own line, 4 above it and uncovered, is read: `middle` **4**, `piece` 8, `recording` 5.0 (the group), card `{item: group_1, member: middle}` | the card's `middle` row: `middle` **4** (`p` = 200 / 400 × 8), then its ancestor `piece` 8 at the card's `piece` line (85.18359375) |
| (564.0390625, 85.18359375), the card's `piece` line | `piece`'s ancestor line in `middle`'s card (below `middle`): `piece` **8**, `middle` 4 | the card's `piece` line, card `{item: group_1, member: piece}`: `piece` **8**, `middle` 4 (its row in the card, 51.20703125); the ancestor line under the card is covered |
| (564.0390625, 47.20703125), `middle`'s own line | `middle` **4**, `piece` 8, `recording` 5.0 (the group) | not the line, inside the raised card (from 36.20703125 to 99.5859375): the card's `middle` row, 4 below it, is read: `middle` **4**, `piece` 8, card `{item: group_1, member: piece}` |
| (110.33544921875, 85.18359375), left of the frame | the card's `piece` line: `piece` **1** (50 / 200 × 4, its run from 0 to 4) alone, `middle` starting at 4 | the same |
| (904.0390625, 85.18359375), right of the frame | the card's `piece` line: `piece` **14** (12 + 100 / 200 × 4, its run from 12 to 16) alone, `middle` ending at 12 | the same |

`raisedRoot` gives `piece` in `piece`'s timeline editor, and `null` on
the arranger, in the group editor of `group_1`, in `middle`'s timeline
editor (a member) and in `recording`'s.

**A later ancestor card covers an earlier one** (`stackingOf`; drawing
specification section 8.8 point 4: ancestor cards are written in record
order, a later one over an earlier one where they meet). In
`bundles/bundle_shared_parent` (block A at (0, 0)) with `group_2`'s frame
set to the place (1200, 70), so that the two cards overlap, drawn in the
Full view (`withFullCards`, "Whole ancestor cards" in the fixture facts; the subject is the
cards' stacking, not their elision), layout's
record, the oracle: `score`'s card behind `group_1`'s frame (`{item:
group_1, member: score}`) from (8, 43.6015625), 1410.7494303385415 ×
155.875 (its bottom 199.4765625), recorded first: its `score` line lies on
`score`'s ancestor row in `exposition`'s member card, at 145.53125, and
the card's top 101.9296875 above that row (`score` drawn alone, whose
children `exposition` and `recapitulation` form a row of one band order:
layout's README, "Ancestor cards", point 11), below the frame's top 28.8046875,
so the card reaches above nothing and the origin's ordinate is 0
(`exposition`'s card draws, below its line, the flow control band of
`score`'s tree on its stretch, the symbol 𝄇 of `score`'s `jump_1` at 12,
drawing.md section 6.4, Gathering, which puts its ancestor row `S + Hs =
4 + (2 + h(12) + 2) = 21.96875` lower, the symbol row keeping the symbol
gap 2 on both sides of the glyph box; the card itself draws `score`'s
flow control band as the symbol row alone, `Hs = 17.96875` wide, the
defaults hiding the arc); the one behind `group_2`'s (`{item:
group_2, member: score}`) from (533.3333333333333, 91.8046875),
1370.7494303385417 × 155.875 (`recapitulation`'s stretch, 20 to 32
quarters, holds none of `score`'s flow control, so its card draws no band
below its line and its row lies where it lay): `group_2`'s frame at 70,
`recapitulation`'s card 24.8046875 below (`Q`, the title and its gap),
its line `8 + 52.953125` below that, `score`'s ancestor row 37.9765625
further at 193.734375, and the card's top 101.9296875 above that row;
`group_1`'s frame from x 167.41357421875 to 734.8037109375, `group_2`'s
from 1359.41357421875 to 1926.8037109375 (each frame's room: `exposition`
starts where `score` starts, so the first card's `score` line starts
under its frame and runs in two runs, 294.8037109375 to 694.8037109375,
0 to 12, then from the frame's right border on); the first card's
`score` line at `43.6015625 + 101.9296875 = 145.53125`, the second
card's `exposition` row at `91.8046875 + 64.453125 = 156.2578125`
(692.7469075520833 to 1092.7469075520833). Inside both cards and in no
frame or member card: at x 1200 (right of the second card's `exposition`
row, whose map's zone reaches within 8 of the `score` line at x 900) the
first card's `score` line (145.53125) lies inside the second card's
rectangle and is **not read** (nothing else within 8); at x 900 the
second card's `exposition` row (156.2578125) lies inside the first
card's rectangle and **is read** (`exposition`, card `{item: group_2,
member: score}`). With `score`'s
timeline editor open, both cards raised, the same two answers: the
raised cards are drawn in record order, so the later still lies over
the earlier. `score` 45/4 (each card's `score` line under its frame runs
400 for 12 quarters, the second card's left of its frame 666.66… for 20,
100 / 3 a quarter on both, so 375 right of a line's start) is placed on
the arranger on `score`'s ancestor line in `exposition`'s member card at
(669.8037109375, 145.53125) (294.8037109375 + 375; the first card's
line covered there by the frame and by the second card) and on the
second card's line at (1067.7469075520833, 193.734375) (its start
692.7469075520833 + 375, the first card's ordinate 145.53125 moved down
by 48.203125 with the card); raised, on the second card's
line alone (the ancestor line now lies under the raised cards, and the
first card's line under the second card). What would be wrong: the
earlier card read over the later, or the later covered by the earlier,
raised or not.

**A coordinate is placed wherever it is seen, without exception**
(`linesOf`, `seenOn`, `placesAt`, `placeOf`, `pinnedPlace`,
`affordancesOf`, `namedPin`, `timelinePin`). The lines a timeline is
drawn on are every marked line of its own, in any card (an ancestor
card's row of it included), else every marked line whose segment it is,
and every ancestor line of it in a member's card; the topmost in the
stacking first (a raised card's line, then a frame's or card's, then an
unraised ancestor card's), else in the drawing's order of lines. Each is
kept where the user sees it, the parts not covered (`seenOn`, cut at the
borders of every displayed frame and card, each part tested at its
middle; below, "Show matches", "Where a timeline is seen"). A value of
the timeline has its **places** on those parts (`placesAt`): wherever a
part's drawn span holds it (from 0, up to a segment's length). Every
reader of a coordinate's place reads them and nothing else, and every
reader of one place takes the place on the line it was read on while
that is one, else the first (`placeOf`): screen order (the topmost, then
leftmost place), the affordance of a named timestamp displaying nothing
(one at each place), the mark of a pin (on any line where its value lies,
a segment line and a zero-length line included), and the cross-section a
named timestamp or a position on a timeline is read with (where the value
has no place, on its own axis with all its maps and its ancestors alone:
nothing seen is read). The pointer reads a line exactly where it is not
covered (above), so a reading's line is always a place of its position.
So a member drawn in its own card and as a row of an ancestor card is
placed on both where each is seen (the row beyond the frames: in
`bundles/bundle_shared_parent` `recapitulation`, `recapitulation_first`
and `recapitulation_second` on `{group_1, score}`'s card right of
`group_1`'s frame, `exposition` on `{group_2, score}`'s left of
`group_2`'s); a timeline drawn only in an ancestor card and as an
ancestor line is placed on the ancestor line inside the member's card
where one runs at that abscissa, on the card's line where the card is
visible, on the card's line everywhere while the card is raised, and
**nowhere** where the card is covered and no ancestor line runs: no
affordance, no pin mark, no screen place there. While a root's cards are
raised, every timeline they draw is placed first on the raised card's
line that holds it, then on its other lines where the raised cards leave
them uncovered. What would be wrong: a place on a line the user does not
see there (the card's line behind the frame), a line the user sees and
the pointer reads that is no place (the flag and the Timestamp tab
disagreeing), or a reader with a rule of its own.

In `group_parent_both` `linesOf` gives `middle` its member card's line
(47.20703125, offset 0), then the card's row of it (51.20703125); `piece`
its ancestor line in `middle`'s card, then the card's three runs (all
85.18359375); `recording` its member card's line (122.5859375); with
`piece`'s card raised the card's line or row first. A pin of `piece` at
8 is marked on `piece`'s ancestor line in `middle`'s card at 564.0390625
without a preferred line and with the card's line preferred (that line
is covered there, so it is no place), and on the card's run under the
frame at the same abscissa while the card is raised, whichever line is
preferred (the ancestor line lies under the raised card). A pin of
`piece` at 3 is marked on the card's run left of the frame
(210.33544921875 = 60.33544921875 + 3 × 50), raised or not: with the
frame's room every value outside the member's span lies outside the
frame, so the card is seen there. A timestamp read on a value that no
line draws, `piece` 3 with the ancestor cards hidden, having no place,
is read on `piece`'s own axis: the anchor `piece` with all its own maps
and no ordinate, no members; with the cards shown, on the card's line
(ordinate 85.18359375), raised or not. What would be wrong: a line read
that the user does not see (its cross-section would add what that card
crosses there). A named timestamp on `piece` at 3 displaying nothing has
one affordance, raised or not, on the card's run left of the frame, at
the points `wedgeAt` gives there: (210.33544921875, 86.68359375),
(207.33544921875, 99.68359375), (213.33544921875, 99.68359375) (its
markers band below the line: the tip 85.18359375 + 1.5, the base 13
further), and none with the ancestor cards hidden. In `group_grandchild`
(above, in the Full view) a named timestamp on `movement` at 12
displaying nothing has one affordance, on `movement`'s ancestor line in
`theme`'s card, at the points of that line's mark at 1585.96923828125
(layout's README, "The marks at any position"; the line below the
member, so its tip at `85.18359375 + 1.5` and its base 13 further, away
from the member): (1585.96923828125, 86.68359375), (1582.96923828125,
99.68359375), (1588.96923828125, 99.68359375); none on the card's
`movement` row (at the same ordinate), which the frame covers there; a
pin of `movement` at 12 is marked on the same ancestor line at
1585.96923828125. In `groups/group_child_member_stamps` (the lines of
`group_parent_both`, every one at the same place) `timestamp_1`
(`middle` 2) with its `display` emptied gives one affordance, on
`middle`'s member card's line at 464.0390625 (364.0390625 + 2 × 50), its
points `wedgeAt` there ((464.0390625, 48.70703125), (461.0390625,
61.70703125), (467.0390625, 61.70703125): its own markers band below its
line, the tip `47.20703125 + 1.5`); none on the card's row of `middle`
(51.20703125), which would lie over the frame.

**A member in the raised card.** In `group_parent_both` with `piece`'s
timeline editor open (its card raised), `middle` 4 has one place, the
card's `middle` row at (564.0390625, 51.20703125) (364.0390625 + 4 × 50;
`middle`'s own line at 47.20703125 lies inside the raised card, from
36.20703125 to 99.5859375); on the arranger its one place is its own line
at (564.0390625, 47.20703125). The flag read on that row (`middle` 4,
then `piece` 8) and the pin `timelinePin` gives for `middle` 4 with the
card raised list the same parts and values, and that pin is marked on
the row at 564.0390625. A named timestamp on `middle` at 4 displaying
nothing has its affordance on `middle`'s own line on the arranger and on
the card's row while the card is raised, its points `wedgeAt` on that
line at 564.0390625 each time. "Show matches" draws and hits `middle`
there too (below, "Where a timeline is seen").

**A reading belongs to the line it was read on.** A timeline's rows
depend on the line read: an ancestor line draws no maps, and another
card may cross the timeline's descendants at other ordinates. So
`timelinePin` and `namedPin` take the line the position was read on
(`preferred`) and read the cross-section there while that line is one of
the position's places (`placesAt`), else at the first place (a timestamp
selected from a list, reloaded, or whose line is gone). Read on the
second place of a value and named there (`add {timestamp}`), the named
pin on the read line lists the flag's rows exactly, the named pin
without a line the first place's (drawn in the Full view, `withFullCards`,
"Whole ancestor cards" in the fixture facts: the subject is the line read, not the elision):

| Fixture, editor | Value, places (y) | Flag and named pin on the line | First place |
|---|---|---|---|
| `bundle_shared_parent`, none | `score` 9; the ancestor line in `exposition`'s card 145.53125, `group_2`'s ancestor card's line `247.984375 + 24.8046875 + (8 + 52.953125) + 37.9765625 = 371.71875` (`group_2`'s frame 8 below `group_1`'s, `28.8046875 + 211.1796875`; `recapitulation`'s card, its line and `score`'s ancestor row below it, as above) | exposition [`cmap_2` 4 320 ticks, 9 ♩] / exposition_second [`cmap_3` 1.5″, 3 ♩] / score [`cmap_1` 4 320 ticks, 9 ♩] | exposition […] / exposition_second […] / score 9 ♩ (an ancestor line, no map) |

The reading hovers the place's own line and reads the value exactly. A
preferred line that is no place of the position (`theme`'s line for
`movement` 8 in `group_grandchild`, a key no line has) reads as no line.
What would be wrong: the tab of a timestamp named on a second place
built from the first place's card (other map rows).

A raised card leaves no ancestor line beside it: it lies on its root's
ancestor row in the member's card (drawing specification section 8.8)
and reaches from there up over the rows its root's drawing holds above
its line, so, with the ancestor rows below the member (the default band
orders), it covers every ancestor line of that card and the member's own
line too unless the root's rows above reach less far up than the
member's line lies. In `group_grandchild` (drawn by default, its card
elided) `score`'s card lies from 36.20703125 to 154.13671875, over
`theme`'s line (47.20703125) and both ancestor lines; its `movement` row
lies at the ordinate of `movement`'s ancestor line, 85.18359375 (its rows
lie at the heights of the member card's ancestor rows, section 8.3). So
with `score`'s card raised, `movement` 8 has one place, the card's row
at 85.18359375; with `recording`'s card raised in `bundle_mixed` (its top
`338.2890625 − 52.4765625 = 285.8125`, 87.453125 high), `excerpt` 33075
has one place, the card's row at 300.8125 (`excerpt`'s own line at
300.3125 lies inside it). A reading there hovers that row and reads
the value. What would be wrong: a place left
on a line the raised card covers.

**A GroupStamp read under the raised card.** A member of a group that
the raised card draws is read on the card's row of it, as its own
reading is placed there: in `group_parent_both` the GroupStamp pin of
`recording` at 2.5 (`timelinePin`, `groupstamp`) reads, in traversal
order, the ancestor `piece` at 85.18359375 and `middle` at 47.20703125
(its member card's line) on the arranger, both scaled 4/5 (`middle` 4 ♩
↔ `recording` 5 s at the frame's common abscissa); with `piece`'s editor
open `piece` at 85.18359375 (the card's line) and `middle` at 51.20703125
(the card's row). Its rows, top to bottom, are middle 2 ♩ / piece 6 ♩ / recording
2.5″ both on the arranger and raised (the card's row lies above the
card's line as the member's line lies above the ancestor line). What
would be wrong: `middle` read on its own line the raised card covers.

**A held pin read again under another raised card** (`rereadPin`, what
the drawer does with an unnamed pin while an editor opens or closes): it
is read as a fresh reading at its mark reads, with the group reading the
caller gives (`groupScoped` of the editor open). The pin of a reading of
`middle` 4 on its own line on the arranger (a group read, so `recording`
too: middle 4 ♩ / piece 8 ♩ / recording 5″), read again with `piece`'s
card raised and no group (a timeline editor is open) lists middle 4 ♩ /
piece 8 ♩, as a fresh reading on the card's row of `middle` with that
editor open does, and is marked on that row at 564.0390625 without
the group's line; read again with nothing raised and the group it lists
middle 4 ♩ / piece 8 ♩ / recording 5″, as read. Once `middle` is removed
it is `null`. What would be wrong: a group read kept where no fresh
reading reads one, so rows naming the pin does not store.

**A pin stays on the card it was pinned on.** A timeline drawn in
several cards has a place in each, and its pin is marked on the line it
was pinned on, never moved to the first place. In
`bundles/bundle_shared_member` (`t` a member of `g1` and `g2`) the value
half of `t`'s length has two places, `t`'s card in `g1`'s frame, then in
`g2`'s; the reading there on the second place hovers that line, and its
pin is marked there with that line preferred (across the group, the
reading holding it), on the first place without a preferred line; the
same with every ancestor card hidden. What would be wrong: the mark
jumping to `g1`'s card.

**The pin's mark on segment lines and zero-length lines.** A pin is
marked at its place like any reader's: every timeline's unnamed pin at 0
(`timelinePin`, no preferred line) is marked at the first place of 0, in
pre-order:

| Fixture | Marked |
|---|---|
| `segment_line` | `form`, `a`, `a1`, `b`, `b1`, `b2`, `c`, `c1` |
| `segment_children` | `piece`, `intro`, `i1`, `i2`, `theme`, `t1`, `t2`, `t3`, `coda`, `c1`, `c2` |
| `unknown_length_empty` | `score`, of unknown length and without content: a zero-length line |
| `bundles/bundle_ungrouped` | `pages`, `page_1`, `page_2`, `page_3`, `recording`, `score` |

The segments are marked on their segment line at their offset, a
zero-length line at its start. What would be wrong: a pin whose value is
seen left unmarked, or marked elsewhere than at its first place.

**The cross-section.** A timestamp's coordinates in a card are what its
cross-section line, drawn across the whole card, crosses there (drawing.md
section 2): every timeline the card draws whose line spans the position,
ends included, and every map drawn there. The spec of a hovered line
names its timeline as the anchor with the maps drawn for it in the line's
card, then as members every other timeline that card draws: the root and
every line of its member drawing (siblings, children and parents of the
anchor alike), the ancestor lines of a member's card, and every segment
without a line of its own of each segment line there, each once, in
traversal order (pre-order, children by offset). An ancestor card (section
8.8) is a card of its own: its lines never join a member card's. Each
member's offset is its zero on the root's axis less the anchor's, summed
exactly down the manifest's tree (negative for a parent, an earlier
sibling or a segment line); each carries its name (its ID without one),
unit, number type, length and the maps drawn for it at the card's lines,
in drawing order, as the manifest holds them. Which members a position
crosses is core's (`timestampAt`: the closed span), so the spec does not
depend on where the pointer lies. A timeline the card does not draw is no
member: what the line does not cross is not listed.
Every timeline of the spec, the anchor included, carries the **ordinate**
of the line at which the reading crosses it in the hovered line's card:
its own line there, its ancestor line there (a member drawn in a card of
its own), or the line there whose segment it is. Each timeline with maps
drawn in the card also carries their **map ordinates**: per map, the
ordinate of its drawing's centre there (layout's `AxisMap.yc` at that
line); a timeline without a drawn map carries none. Both are read off
layout's record of the same drawing (its `axes`), the oracle, and they are
what the rows are ordered by (below, "The flag"). What would be wrong: a
sibling or the root drawn in the card and spanning the position left out
of the flag, or a timeline the card does not draw listed.

- **From a root, with its children and their maps.** `map`'s `melody`:
  the anchor `melody` ("Melody", quarters, fraction, 8, `[tempo]`), one
  member `phrase` ("Phrase", 4, `[ticks]`) at offset 2 (its start 100
  canvas units right of `melody`'s at 50 a quarter, and its manifest
  offset).
- **From a child, with the root its card draws.** `phrase`'s line: the
  anchor `phrase` with `[ticks]`, then `melody` at −2 (8 long) with
  `[tempo]`, the map drawn for `melody` in the same card; read at
  `melody` 4, `phrase` 2 as before. A child that is a group's member, in
  its own card: `bundle_mixed`'s `excerpt` (at 44100 in `recording`, 88200
  long) hovered at the middle of its line on the line reads `excerpt`
  44100 (an int axis steps by 1) and `recording` 88200, then, on the
  arranger (below, "Above a timeline editor"), its group `group_2`'s other
  member `page` (1920 pixels) at 44100 × 1920 / 88200 = 960.
- **Segment lines and segments, each once.** `segment_line` with `b2_ticks`
  (`map`'s `ticks` under another ID) added to `b`'s segment `b2`: `form`'s
  line crosses the lines of `a`, `b` and `c`, which are also `form`'s
  segments, and those carry the segments `a1`, `b1`, `b2`, `c1`. The
  members are `a` 0 (8), `a1` 0 (8), `b` 8 (12), `b1` 8 (6), `b2` 14 (6),
  `c` 20 (12), `c1` 20 (12), offset (length), `b2` with `[b2_ticks]` drawn
  at `b`'s line, every other without maps; `form` has none.
- **A segment's map.** On `b`'s line (y 36.4765625 from 152.294921875 to
  302.294921875, 12 quarters over 150) `b2_ticks` is drawn at 30.9765625
  from 227.294921875 with `b2` as its owner; hovered, it is the row
  `{timeline: "b2", map: "b2_ticks"}`, the line the row `{timeline: "b",
  map: null}`. `b`'s spec: anchor `b` without maps, members every other
  timeline of `form`'s card in traversal order: `form` −8 (32), its
  sibling segment line `a` −8 (8) with `a1` −8 (8), `b`'s own segments
  `b1` 0 (6) and `b2` 6 (6, `[b2_ticks]`), then `c` 12 (12) with `c1` 12
  (12).

**What a timestamp's line crosses, card by card** (`coordinates.test.ts`,
"what a timestamp's line crosses in its card"). The flag and the
Timestamp tab list a timestamp's coordinates in a card: every timeline
and map that card draws whose span holds the position, ends included,
top to bottom, the primary coordinate (the anchor's) marked; nothing the
card does not draw. Each case adds what the old reading (the anchor's
ancestors and crossed descendants only) would miss, so it fails on it:

- **A child, its sibling and its root.** `map` with a second child
  `motif` of `melody` (offset 3, 4 quarters, so 3 to 7, overlapping
  `phrase`'s 2 to 6). The pin of `phrase` at 2 (`timelinePin`, no group)
  lists `melody` 4 with `tempo`, `phrase` 2 with `ticks` and the sibling
  `motif` at 4 − 3 = 1, its parts in the order of the ordinates of their
  lines in layout's record (the oracle), the primary `phrase` (the
  spec's anchor). At `phrase` 0.5 (`melody` 2.5) `motif` (3 to 7) is not
  crossed and not listed. What would be wrong: `motif` missing at 2, or
  listed at 0.5.
- **An ancestor line in a member card, and the card behind.**
  `group_parent_both` with a child `intro` of `piece` (offset 8, 4
  quarters, 8 to 12), no group member. `piece` at 10 read on the
  arranger lies on its ancestor line in `middle`'s card (inside the frame
  the card's own line is covered) and lists `piece` 10 and `middle` 6,
  never `intro`: `middle`'s card does not draw it, though it spans 10.
  With `piece`'s timeline editor open (the card raised, its line the
  place) the same position lists `piece` 10, `middle` 6 and `intro` 2,
  all three drawn in the raised card. What would be wrong: `intro` read
  where it is not drawn, or missing where it is.
- **A groupstamp in another member's card.** `group_groupstamp_child_member`
  with a child `bridge` of `score` (offset 2, 4 quarters, 2 to 6,
  overlapping `second-half`'s 4 to 8) and a groupstamp named on
  `second-half` at 2 (`score` 6). Its named pin lists `second-half` 2,
  `score` 6, `bridge` 6 − 2 = 4 (a sibling of the anchor in `score`'s
  card) and, read by the group from `score`'s card, `performance` 3.0 (6
  / 2: 4.0 seconds over 8 quarters); `second-half` is the primary.
- **A timeline of unknown length ends where its line ends.** `map` with
  a child `open` of `melody` (offset 1, length unknown) holding a region
  from 0 to 3: its reach is 3, so its line in `melody`'s card is drawn
  from `melody` 1 to 4 (layout's record: `start` 0, drawn length 3). The
  pin of `melody` at 4 lists `open` at 3 (the line's end, ends included);
  at 5 it does not list `open`, whose line ends left of it. What would be
  wrong: `open` listed at 5 (at 4, past its drawn end), the flag naming a
  timeline the cross-section line does not cross.
- **An ancestor is listed wherever it is drawn or not** (the anchor's
  ancestors are part of every timestamp, on hover and stored, also for a
  child taking part in a group). `bundle_mixed` with the rule `{select:
  {element: ancestor}, set: {display: none}}` for block A: `excerpt`'s
  card no longer draws `recording`'s ancestor line, yet the reading at
  the middle of `excerpt`'s line still lists `excerpt` 44100, `recording`
  88200 (its parent, offset 44100) and, through `group_2`, `page` 960.
  `recording`, drawn nowhere in the card, has no ordinate: the flag lists
  it after every drawn row, and `timestampJson`'s `mapping` holds it as
  `{unit: samples, number_type: int, value: 88200}`. Read from the other
  member, `page` at the middle of its line (960), the group adds
  `excerpt` 44100 (960 × 88200 / 1920) and its hidden parent `recording`
  88200, read at `excerpt`'s offset and scale. What would be wrong:
  `recording` missing from the flag or the stored timestamp because its
  line is hidden.
- **A MatchStamp flag inside a timeline editor** stays the claim's two
  coordinates (`matches.test.ts`): on `bundle_matchstamp_groupstamp` with
  G, `matchFlag` of MatchStamp 1 without group reading lists `Score`
  `6 ♩` then `Page` `400 px` (screen order: `group_1`'s card above
  `group_2`'s), nothing a groupstamp's line or a card would add.

**The position: snapping on the hovered row.** The position is core's
`snapOnRow` of the hovered row with `p` the pointer's coordinate on the
line's axis (its abscissa held to the hovered span, from `xStart`, times
the line's drawn length over its width) and `h` half a device pixel in
the line's units: the drawn length over the width, over zoom × scale ×
ratio, halved. Core proves the rule on these very rows (its README, "Snapping on
a row"); here the inputs are proven, by positions the rule gives only
for the right row, `p` and `h`.

- **`bundle_mixed`'s `score`**, drawn in the Full view (`withFullCards`,
  "Whole ancestor cards" in the fixture facts: the subject is the snap, not the elision)
  (y 73.109375 from 397.9951171875 to 797.9951171875, 12 quarters over
  400, so 0.03 a canvas unit; `cmap_1` 480·x onto ticks at 67.609375,
  `cmap_2` x/2 onto seconds at 62.609375). The abscissas: with no
  ancestor card every line runs from `8 + s0 = 126.29150390625` (above,
  "Fixture facts"). `recording`'s ancestor card, drawn by default behind
  `group_2`'s frame, is aligned to `excerpt` (88200 samples at 44100 in
  `recording`'s 441000, drawn over 400), and its axis has a seam at the
  frame's left border, the frame's room `s0 = 118.29150390625` wide
  (`docs/drawing.md` in TimeToShare, section 8.8, step 2), so
  `recording`'s run from 0 to 44100 ends at the frame's left edge and
  starts `400 × 44100 / 88200 = 200` left of it, and the card's left edge
  lies its name column `s0' = 8 + w("Recording", 11) + 8` further left
  (layout's README, "Ancestor cards"); `w("Recording", 11) = (1423 + 1260
  + 1126 + 1253 + 842 + 1300 + 569 + 1298 + 1300) × 11 / 2048 = 10371 × 11
  / 2048 = 55.70361328125` (DejaVu Sans advances of R, e, c, o, r, d, i,
  n, g), so `s0' = 71.70361328125`, and the edge lies `271.70361328125`
  left of the frame's. The block grows left until that edge lies at its
  padding `P = 8`: the frames lie at x 279.70361328125, every item moved
  right by 271.70361328125, nothing vertically, and `score`'s line runs
  from `126.29150390625 + 271.70361328125 = 397.9951171875`, its
  ordinates unchanged.
  At zoom 3.75, ratio 1, `h` = 0.03 / 3.75 / 2 = 0.004, and the abscissa
  397.9951171875 + 3.13 / 0.03 gives `p` = 3.13 (the doubles nearest,
  within 10⁻¹⁴, where every margin below is at least 0.001), core's own
  pointer. On the line (y 73.109375) the position is **47/15**; on
  `cmap_1` (y 67.609375) **751/240**; on `cmap_2` (y 62.609375) with
  decimals 1 **16/5**, and with the default decimals 3 the value 1.565
  itself (0 places 2, 1 place 1.6, 2 places 1.57 lie 0.435, 0.035, 0.005
  from it, all beyond `hv` 0.002): **313/100**. The tolerance there is
  8 / 3.75 = 2.1333 canvas units and the line and the maps lie 5 and 5.5
  apart, so each pointer hovers exactly its row.
- **`b2_ticks`** at zoom 1 (`h` = 12 / 150 / 2 = 0.04) at the abscissa
  152.294921875 + 119.125 (`p` = 119.125 × 0.08 = 9.53): on `b`'s line,
  9.53 on `b`'s fraction axis, divisor 1 gives 10 (0.47 away), 2 gives
  19/2 (0.03 ≤ 0.04): **19/2**. On `b2_ticks` (y 30.9765625) the value is
  (9.53 − 6)·480 = 1694.4 with `hv` = 0.08·480/2 = 19.2; ticks are int, so
  `2·hv` = 38.4 admits multiples of 10: 1690 lies 4.4 away, inverted
  1690/480 = 169/48 on `b2`, plus its offset 6: **457/48**. The timestamp
  there holds `b` at 457/48, its ancestor `Form` at 457/48 + 8 = 841/48,
  then `b2` at 169/48 with `b2_ticks` the int 1690 on ticks; `b1` (0 to
  6) is not crossed.
- **Other number types, through the line's own row**: `maps_seconds`
  (`maps:seconds`, 2 seconds, float, over 400) at `xStart` + 123.75, `p`
  0.61875, `h` 0.0025: 1 and 0.6 miss, 0.62 lies 0.00125 away: **31/50**,
  read as the float 0.62; with decimals 1 the fallback **3/5**, read 0.6.
  `discrete_physical`'s `dpt_1` (44100 samples over 400) at `xStart` +
  123.75, `p` 13643.4375, `h` 55.125: an int axis steps by 1 whatever a
  device pixel spans (core's rule), the nearest integer: **13643**, read
  as the int 13643.
- **Held to the line's span.** `map`'s `melody` at 4 canvas units past its
  end reads 8, at 4 before its start 0.

`p` and `h` read the line's drawn length, so a line of unknown length is
read up to its reach exactly as a line of that length would be
(`unknown_length` above).

**Above a timeline editor a reading holds the group** (`groupScoped` of the
node's editor, the rule of a groupstamp's default): on the arranger, in a
bundle editor and in a group editor the reading's cross-section also holds
every other member of each group whose frame draws the hovered line's
timeline, read by the group as a groupstamp's pin reads them; in a timeline
editor it stays on its timeline. In `groups/group_groupstamp`, `score`
hovered at the middle of its line (8 quarters over 400) reads the parts
`score` 4, `performance` the float 2.0 on the arranger, in a bundle editor
and in a group editor, `score` 4 alone in a timeline editor; `readsGroup`
of the pin is true, resp. false. Without groups (`map`) nothing changes.

**A reading across the group holds each member's card**, where active,
exactly as a groupstamp's pin does (one reading of a groupstamp's members,
below): every other member of the frame comes with every timeline its card
draws (what the groupstamp's line crosses there, as the hovered line's
own card above), each at the member's offset plus its own offset from the
member's zero divided by the member's scale, with the member's scale, so
that its coordinate is the member's less that offset; and the member card
holding the hovered line adds the timelines it draws not yet held,
unscaled. What proves it
is the child that the hovered line's own cross-section never reaches: in
`groups/group_groupstamp_child_member` (`group_1` lists `score` (8
quarters) and `performance` (4.0 seconds); `second-half` is `score`'s
child at offset 4, 4 quarters long, and holds the groupstamp
`timestamp_1` at 2), `performance` hovered at three quarters of its line
reads `performance` the float 3.0, `score` 6, `second-half` 2 (`score` at
offset 0, scale 2; `second-half` at offset 4/2 = 2, scale 2: (3 − 2) × 2);
at a quarter it reads `performance` 1.0 and `score` 2 alone, since
`second-half` (`(1 − 2) × 2 = −2`) lies outside its span. On `score`'s
line the same: at three quarters `score` 6, `second-half` 2 (its own
cross-section), `performance` 3.0; at a quarter `score` 2, `performance`
1.0. What would be wrong: the member's own line read alone, without the
descendants, so the first case lacking `second-half`.

**A reading across the group holds each other member's ancestors**, which
the member's card draws as ancestor lines: the members of that card in
traversal order, the ancestor first, at the member's offset plus the
ancestor's (negative) offset divided by the member's scale, with the
member's scale, so that its coordinate is the member's less that offset,
read at its ancestor line's ordinate in that card. In
`groups/group_parent_both` (`group_1` lists `middle`, offset 4 and 8
quarters long in `piece` of 16, and `recording`, 10.0 seconds),
`recording` hovered at the middle of its line holds the members `piece`
at `0 + (−4) / (4/5) = −5`, scale 4/5, and `middle` at 0, scale 8/10 =
4/5, and the parts `recording` the float 5.0, `piece` `(5 + 5) × 4/5 = 8`,
`middle` 4; the anchor stays the timestamp's first part.
What would be wrong: the ancestors left out, so `piece` missing, although
its line is drawn in `middle`'s card and the group's line crosses it. The
flag shows what
the reading's pin holds, so the timelines of `flagParts` of the reading at
`timestamp_1`'s place on `performance`'s line are, as a set, those of
`timestamp_1`'s named pin, which the Timestamp tab shows (`second-half`,
`score`, `performance`).

The reading's pin is unnamed (`named` `null`), reads its MeasureMaps as
the reading does (`no_server` without a server) and holds the reading's
timestamp; its spec carries the granularity it was read with (the same
object), which the flag shows floats with.

**A named timestamp's pin** (`namedPin`) has its own timeline as the
anchor, always, at its own coordinate: read as a click at its coordinate
reads it, on the line it was named from while that is one of its places,
else on the line of its first place (above, "A coordinate's place"),
with that line's cross-section (`{spec, knots, timestamp, named}`,
`named` the manifest's own entry, the same object). With `mark` (given by the command; `map`
holds `origin` and `length` as `timestamp_1` and `timestamp_2`) at 4 on
`melody`, the spec is `melody`'s from the root above and the timestamp
core's `timestampAt(spec, 4)`: `melody` 4, `phrase` 2. A timestamp of a
segment without a line of its own is read on its segment line's line
anchored on the segment (`crossSectionSpec` with the segment as the
anchor): its members are every other timeline of that line's card, as a
hovered line's. `segment_line` with `b2_ticks` and a timestamp at 1 on
`b2` (no children) reads the spec anchor `b2` ("b2", quarters, fraction,
6, `[b2_ticks]`, the map drawn at `b`'s line for it), members in
traversal order `form` ("Form", 32) at −14, `a` ("A", 8) and `a1` (8) at
−14, `b` ("B", 12) and `b1` (6) at −6, `c` ("C", 12) and `c1` (12) at 6,
all without maps (the anchor, `b` and `b1` read at `b`'s line,
36.4765625, `a` and `a1` at `a`'s, `c` and `c1` at `c`'s, `form` at its
own, 87.9296875; the anchor's map ordinates `b2_ticks` 30.9765625, its
drawing above `b`'s line),
and the timestamp `b2` at 1 with `b2_ticks` 480 (1·480), then the members
whose span holds 1 + 14 = 15 on `form`'s axis, in the spec's order: `form`
15 and `b` 7; `a`, `a1` (0 to 8), `b1` (8 to 14), `c` and `c1` (20 to 32)
are no part of it, the line at 15 crossing none of them. The same
holds on a line of unknown length: `unknown_length`'s `origin`
(`timestamp_1` at 0 on `score`) reads `score`'s spec (anchor `score`,
length unknown, no maps; member `coda` at 10, 4 long) and the timestamp
`score` 0 alone (`coda` starts at 10), and on a zero-length line: `late`'s
`origin` (`late_origin`, above) reads anchor `late` (length unknown, its
reach there 0, no maps, at its line's ordinate 22.40234375), no members,
`late` 0. Where no line draws its timeline (its line
hidden by a `style` of `{id: "melody"}`, `display: "none"`, so that the
editor can still show it), it reads on its own axis with all its own maps
and no members: anchor `melody` with `[tempo]`, `melody` 4 alone. An ID
the manifest does not hold gives `null`. A groupstamp's pin holds the
whole GroupStamp: every other member of each group whose frame draws it
(a line drawn in a card of the frame holds the timestamp; layout's
`frameMemberLines` names the frame's members, the one statement both the
drawing and the pin read), after its own members, read from the member
card holding the timestamp's timeline: at that member's offset from the
anchor's zero (0 where the anchor is the member, the ancestor offset where
it is a descendant) with the scale of the other member's drawn end over
that member's (the members of a frame start and end together), each
followed by the descendants its line's cross-section crosses (above). In
`groups/group_groupstamp` the groupstamp `timestamp_1` at 4 on `score` (8
quarters) gives the member `performance` (4.0 seconds) at offset 0, scale
1/2, and the parts `score` 4, `performance` the float 2.0, each with the
map ordinates of its own card (`score`'s `cmap_1`, `performance`'s
`cmap_2`, each the `yc` of its drawing in layout's record); `timestamp_3`
(`length`, no groupstamp) on `performance` holds `performance` alone. On a
member's descendant: with a child `motif` (offset 2, 4 quarters) added to
`score` and the groupstamp `motif_mark` at 1 on it, the members are
`score` at −2 (its ancestor), then `performance` at −2, scale 1/2, and the
parts `motif` 1, `score` 3, `performance` the float 1.5. In
`groups/group_groupstamp_child_member` the groupstamp `timestamp_1` at 2
on `second-half` holds the members `score` at −4 (its ancestor), then
`performance` at −4, scale 1/2, and the parts `second-half` 2, `score` 6,
`performance` the float 3.0. **A length of the group not known**
(drawing.md §6.6): a group maps a position by the proportion of its
members' lengths and never carries one member's length to another, so
where the length of the other member, or of the member card holding the
timestamp's timeline, is not known (layout's `readsAcrossGroup`), every
timeline read for that member is `valueless` (core's form: listed, its
rows without a value, core's one text instead, not editable). In
`groups/group_groupstamp` with `performance`'s length `null` (its reach
4.0), and again with `score`'s instead (its reach 8), `timestamp_1`'s pin
holds `performance` at offset 0, scale 1/2 (the drawn lengths still place
it), `valueless`; its flag lists the same parts in the same order as with
both lengths known, `score`'s rows equal, `performance`'s two rows
(`cmap_2` above its line, then its coordinate) with the value `null`, not
editable, each core's `VALUELESS_TEXT`. With both lengths known no member is
`valueless`, the oracle of the rest. **On an ancestor line too**: in
`groups/group_child_member_stamps` (`group_1` of `middle`, quarters 8 at
4 in `piece` 16, and `recording`, seconds 10.0) a groupstamp `Half` added
on `recording` at the float 5.0 reads `middle`, scaled, and `piece`, the
ancestor line `middle`'s card draws, scaled the same (the pin's members
in the card's traversal order, `piece` then `middle`; the flag top to
bottom, `middle` then `piece`). With `recording`'s
length `null` (its reach 10.0, its `length` timestamp's) both are
`valueless` and their flag rows carry `VALUELESS_TEXT` in place of a
value; with it known neither is, `middle` reads 4 ♩ (5.0 of 10.0 × 8) and
`piece` 8 ♩ (4 + 4), the oracle.

**The flag equals the tab on an ancestor line.** A timestamp named from a
reading on an ancestor line is read back where it was named: its first
place is that ancestor line, so its Timestamp tab lists what the flag
listed there, the ancestor's coordinate and what is drawn at the crossed
lines of the member's card, never the ancestor's own maps, which are not
drawn there. In `bundles/bundle_mixed` (block A at (40, 80)), drawn in
the Full view (`withFullCards`, "Whole ancestor cards" in the fixture facts: the subject is the
ancestor line, not the elision), `recording` is drawn as `excerpt`'s ancestor line in `excerpt`'s card (layout's
record: card `{item: group_2, member: excerpt}`, y 338.2890625, below
`excerpt`'s line at 300.3125, from
397.9951171875 to 797.9951171875, start 44100 samples, drawn length
88200: `excerpt`'s 2 seconds at its offset of 1) and in its ancestor
card, whose line, which draws `recording`'s map `cmap_5`, the frame
covers there. The reading at the ancestor line's middle
(597.9951171875: 44100 + 200 / 400 × 88200 = 88200 samples) flags
`excerpt` [`cmap_6` 1″, its coordinate 44 100 smp], then `recording` [its
coordinate 88 200 smp], top to bottom; a timestamp named there (`add` on `recording` at
88200) gives `namedPin` the same `flagParts`, and the same with every
ancestor card hidden (the ancestor line then from 126.29150390625 to
526.29150390625, read at 326.29150390625). What would be wrong:
`recording`'s `cmap_5` listed (the card's line), or `excerpt` missing
(the tab listing `recording` alone).

**A position's pin on a timeline** (`timelinePin`, the Matchstamp tab's
coordinates) is read with the one spec a named timestamp's pin is read
with, unnamed: with `mark` at 4 on `melody` in `map`, the pin of
`melody` at 4 equals `namedPin`'s for `mark` but for `named`,
which is `null`; with `melody`'s line hidden as above, its spec is the
own-axis one above (anchor with `[tempo]`, no members). It never reads a
group: in `groups/group_groupstamp` the pin of `score` at 4 holds
`score` 4 alone, where the groupstamp `timestamp_1` there holds
`performance` too. A timeline the manifest does not hold gives `null`.

**The affordance of a named timestamp that draws nothing**
(`affordancesOf`): a named timestamp whose `display` is emptied (`set
{display: []}`), unless it is a match timestamp, gets one affordance at every place of its
coordinate (above, "A coordinate's place": on its own lines, else its
segment line's at the segment's offset, where the user sees them),
whatever the line's length: the timestamp's address `{id}`, the line's
key, and the three points of the wedge layout would draw there (`wedgeAt`
at the abscissa of its coordinate on the line's drawn scale, layout's
`abscissaOf`: `xStart` + (coordinate − start) / drawn length × width, and
`xStart` where the drawn length is 0; on an ancestor line its mark). It is the one place the
affordance's geometry is computed: the block node draws those points,
the marquee takes their bounds and the projection's `inside` its address,
none of them calling `wedgeAt` again; for one drawing it is the same
list, object for object. A timestamp displaying anything has none, and
so has a match timestamp displaying nothing, which leaves no placeholder:
in `bundle_matchstamps`, the match timestamp `timestamp_1` with its
`display` emptied gives none; with the ordinary `timestamp_4` emptied too,
the one affordance is `timestamp_4`'s.
`unknown_length` with `origin` emptied (a new root of unknown length,
which gets an `origin` by default): one affordance, `timestamp_1` on
`score`'s line, its points `wedgeAt` at 53.798828125 (0 / 14). `map` with
`late` added and its `origin` emptied: one affordance, `late_origin` on
`late`'s line at its start 63.53662109375, the line being zero-length;
`melody`'s `origin` and `length` display their wedge and coordinate, so
neither has one.

**The flag** lists core's `timestampRows` grouped by part, in their order:
the parts top to bottom where the reading crosses their timelines (each
one's ordinate in the spec; core's README, "The rows"), each part's
heading its timeline's name (its coordinate row's label, wherever that
row lies), then its rows top to bottom as they are drawn: its coordinate
(labelled `coordinate`) at its line and its maps' values (labelled by
name, else ID) at their map ordinates, so a map drawn above the line
(the default band order: conversion maps above the line) comes before
the coordinate and one drawn below it after; each value as core's pretty text in its own number type and
unit, rounded with the granularity's `decimals` (display rounding is the
flag's alone; a value without a unit is its number alone, a measure its
name and the word `measure`); a missing value says why in core's
words. The hovered row is highlighted, the coordinate of the hovered
line's timeline or the hovered map. Values: `b`'s spec at 457/48, read on
`b2_ticks`, gives the parts `B` (`coordinate` `9 25/48 ♩`) and its
segment `b2` (`coordinate` `3 25/48 ♩`, then `Ticks` `1 690 ticks`, the
hovered row: an int is grouped by threes), both at `b`'s line (36.4765625,
the timestamp's order kept), `b2`'s rows `Ticks` first (its drawing at
30.9765625, above the line), then `coordinate`; then its ancestor `Form` (`17 25/48 ♩`,
87.9296875, below), though the timestamp's parts stay `b`, `form`, `b2`;
in `groups/group_parent_both`, read at the middle of `recording`'s line
and of `middle`'s, the flag lists `middle` `4 ♩` (47.20703125), `piece`
`8 ♩` (its ancestor line in `middle`'s card, 85.18359375), `recording`
`5″` (142.5625), whichever line is hovered; in the timestamp's order of
parts (`recording`, `middle`, `piece` for the reading on `recording`'s
line) it fails;
`bundle_mixed`'s `score` at 16/5 shows `cmap_2`, a float of seconds, as
`1.6″` at 3 places (its rows `cmap_2`, `cmap_1`, then `coordinate`: both
maps are drawn above `score`'s line, the first in the manifest nearest
it); `map`'s `melody` read at 4 on its line flags `Phrase` (`Ticks` `960
ticks`, `coordinate` `2 ♩`), then `Melody` (`Tempo` `2″`, `coordinate`
`4 ♩`); `map_root_band_order` (`melody`'s order puts its maps below its
line, and `phrase` follows it) flags each part's coordinate first,
`Phrase` (`coordinate`, `Ticks`), `Melody` (`coordinate`, `Tempo`);
`map_child_band_order` (only `phrase`'s order does) flags `Phrase`
(`coordinate`, `Ticks`), `Melody` (`Tempo`, `coordinate`). On all three
the spec's map ordinates are exactly the `yc` of each map's drawing in
layout's record (`tempo` on `melody`, `ticks` on `phrase`);
in `group_measure_map` the `MeasureRecordMap` `cmap_1` of `score` has no
value without its expanded rows and its row says `needs a server to
expand its measure map`. The footer says `click to pin`.

**The flag hangs at its pole** (`flagPlace`). The pole, 1 pixel wide, is
centred on the marked abscissa `x`, from 22 pixels above `top` (the
topmost of the line, its maps and its cross-section line), never above
the canvas's top edge, down to the line. The flag's top is the pole's
top, and it always opens to the right, its left edge touching the pole's
right side (`x + 0.5`), whatever the canvas's width: it never flips to
the pole's other side; near a border only the shift below moves it. At
`x` 100, `y` 200, `top` 150: the pole from 128 to 200, the flag at
(100.5, 128); at `x` 700 the flag at (700.5, 128), still right of the
pole (a flag starting there and leaving an 800-wide canvas is the
shift's to move, not this place's); with `top` 10 the pole and the flag
start at 0. What would be wrong: a flag starting on the pole's left
(the former flip at the right border, which ruled out the exact shift
by moving the flag a whole flag's width plus the pole instead of the
overflow), or a start depending on the flag's or the canvas's width.

**The flag stays on screen** (`onScreen.ts`, `on-screen.test.ts`). The
flag starts where `flagPlace` hangs it, beside its wedge, and is then
shifted by exactly the amount that keeps its rectangle inside the
canvas's visible area, on every side, and not at all when it lies
inside: past the right or bottom border it moves left or up until that
edge lies on the border, past the left or top border right or down
until that edge lies on it. A flag larger than the canvas along an axis
keeps its left or top edge on the border (its beginning stays
readable). Along an axis where the canvas or the flag measures 0 (not
laid out yet) nothing moves. The pole is never moved: it stands at the
marked abscissa. What would
be wrong: a flag cut by a border (the bottom of the screen, where a
flag hanging from a low line was cut), a flag moved more than needed
(snapped to a corner, flipped instead of shifted), a flag moved where
it fits, a moved pole. On a canvas 800 × 600, a flag 180 × 100 (pole
kept, the same object returned where nothing moves):

| Starts at (left, top) | Kept at | Shift |
|---|---|---|
| (100.5, 128) | (100.5, 128) | none, the same object |
| (700, 128) | (620, 128) | 80 left |
| (−30.5, 128) | (0, 128) | 30.5 right |
| (100.5, −12) | (100.5, 0) | 12 down |
| (100.5, 550) | (100.5, 500) | 50 up |
| (700, 550) | (620, 500) | the corner: 80 left, 50 up |
| (620, 500) | (620, 500) | none: both edges exactly on the borders |

A flag 900 wide at (100.5, 128) is kept at (0, 128); on a canvas of
height 0, or a flag of height 0, the flag at (100.5, 550) stays there.
In the component (`Flag.svelte`, mounted with a body of its own) the
canvas's height is the flag layer's, which covers the canvas; with `x`
700, `y` 580, `top` 560 on a canvas 800 wide and a layer 600 high, a
flag 180 × 100: `flagPlace` hangs it right of its pole at 700.5 (the
pole's right side), from the pole's top 538 (560 − 22), so its right
edge would lie at 880.5 and its bottom at 638; it is drawn at (620,
500), shifted by exactly the overflow, 80.5 left and 38 up, the pole
still from 538 to 580 (left 699.5, height 42). With the layer not
measured (height 0) it is drawn at (620, 538): shifted left by 80.5,
not vertically. Before, the flag flipped to the pole's left first and
was drawn at 519.5, 100.5 pixels further left than needed.

**Measure maps.** The expanded MeasureMaps are asked once per manifest
object (one version of a manifest) that has MeasureMaps, and never for
one without; until the answer arrives they are `pending`, so hovering
never waits. A second reading of the same manifest asks nothing; the
answer, once there, is handed to every later reading of that manifest,
the same array each time. A request that fails leaves them `failed`, an
answer that the server cannot expand them `unsupported`, one that no
server answered `unreachable`; each is announced once (`changed`) and
nothing is asked again. In
`group_measure_map` the `MeasureRecordMap` `cmap_1` of `score` has no
value without them and says why in core's words: with no server
(`no_server`) `needs a server to expand its measure map`, while pending
`waiting for the server`, `unsupported` `the server cannot expand
measure maps`, `unreachable` `no server answered, so its measure map is
not expanded`, `failed` `the server did not expand its measure map`.

**One reading per frame.** Pointer moves are coalesced: three moves
before an animation frame run one reading, with the last point.

**The cross-section of a hovered line, made once.** What a reading on a
line is read with (its cross-section, with the group where the reading
reads one) depends on the drawing, the block, the line, the raised root,
the group reading, the manifest and the granularity, never on where the
pointer lies on the line, so it is made once and every later reading on
the line takes the same object. In `groups/group_groupstamp` the readings
at a quarter and three quarters of `score`'s line on the arranger hold
the identical spec (`toBe`), its members `performance` (the group); with
another granularity object (equal values) another spec, holding that
granularity; in `score`'s timeline editor one without members. What
would be wrong: the spec made again on every pointer frame, which the
budget below would also show.

**Budget** (`coordinates-budget.test.ts`, run alone by `pnpm
test:budget`). `bundles/bundle_shared_parent` (block A at (40, 80),
nothing open, the cards shown: 19 lines the pointer reads) read at 64
points along every one of those lines, each a pointer frame (the
reading and its flag's rows, `flagParts`), zoom 1, ratio 2: the fastest
of five sweeps after one warm-up, divided by the 1,216 points, is a
pointer frame and stays below 0.15 ms. Measured 0.062 ms; with the spec
made on every frame 0.232 ms, which the bound fails. The figure is
printed with the number of points read.

## A reading and the pin made from it (`reading-places.test.ts`)

The rule the Timestamp tab rests on: a coordinate is placed wherever it
is seen, so every point the pointer reads lies on a place of the value
read, and the flag a reading shows (`readingAt`) and the pin made from it
list the same rows (`flagParts`, each row's value compared exactly, never
as a rounded text). The pin made from it is `timelinePin` of the
reading's anchor at the reading's position, reading a group where the
reading does (`groupScoped` of the editor open), under the same raised
root, the read line preferred: what the drawer holds for a canvas pin and
what `namedPin` reads after naming, both through the one `timelineSpec`.
Two passes prove it, one from the places and one from the points read:

- **Subjects**: the fixtures holding a grouped child, the ones drawing
  ancestor cards: `groups/group_parent_both`, `group_parent_right`,
  `group_parent_exact`, `group_child_member`,
  `group_child_member_stamps`, `group_grandchild`,
  `group_parents_mixed`, `bundles/bundle_mixed`,
  `bundle_shared_parent`; block A at (40, 80), each with its ancestor
  cards shown and hidden (`withoutAncestorCards`). Shown, the cards are
  drawn whole (`withFullCards`, "Whole ancestor cards" above): the rule
  is the same on an elided card, but its places and points are counted
  there on whole cards, and a reading on an elided card (one axis per
  run) is the subject of its own tests.
- **States**: nothing open, then for each root an ancestor card draws
  its timeline editor, kept where `raisedRoot` gives that root (a root
  in a group raises nothing).
- **The readings** are `readingAt` at zoom 2^20 and ratio 1: half a
  device pixel there spans less than the gap between the value and any
  simpler value the snap would prefer (two fractions of denominators up
  to 2520 lie at least 1/2520² apart; an int axis's value is the integer
  nearest), so a reading at a place reads its value itself.

**From the places.** Every timeline in pre-order, of known length `L`, at
`k × L / 8` for `k` from 0 to 8 on its own axis (an int axis floored, a
float axis rounded to three decimals, a fraction exact); every place of
each (`placesAt` under the state's root), read at the place's abscissa on
its line's ordinate. At every place the value read is the value sampled,
whatever the reading's anchor: the sampled value plus the offsets of the
timeline and its ancestors below their root (read from the manifest)
equals the reading's position plus those of its anchor, on the same root.
A place whose anchor lies under another root could not be checked; their
list is asserted empty, so none can appear unnoticed. The places read
with another anchor than the timeline sampled are counted per timeline
and asserted: all in `bundle_shared_parent`, the segments read on their
segment line, cards shown 36 places each of `exposition_first`,
`exposition_second`, `recapitulation_first_1`, `recapitulation_first_2`,
`recapitulation_second_1`, `recapitulation_second_2`, 9 each of
`take_1_first` and `take_1_second` (on the arranger alone: with `score`
raised `take_1`'s line lies under the raised card, below), and 4 of
`recapitulation_second` (the boundary below); cards hidden 9 each of the
eight and 1 of `recapitulation_second`.

How many places there are follows from the frame's room (`docs/drawing.md`
in TimeToShare, section 8.8, step 2): an ancestor card's axis has a seam
at each border of the frame it lies behind, so whatever lies left of the
member's span lies left of the frame, whatever lies right of it right of
the frame, and the span itself under the frame; a value at a seam lies on
the span's side (section 3.2), under the frame (`placesAt`'s seam rule).
Nothing open, a value is so seen either on the card outside the frame or
in the frame (on a member's line or the ancestor line of it), never both;
with the root raised, on the raised card's run of it. So in the seven
`groups/` fixtures and `bundle_mixed` every sampled value has exactly one
place in every state, and the places compared, cards shown, are the
values sampled times the states: `group_parent_both`,
`group_parent_right`, `group_parent_exact`, `group_child_member` and
`group_child_member_stamps` 3 timelines × 9 values × 2 states (nothing
open, `piece` raised) = 54; `group_grandchild` 4 × 9 × 2 = 72;
`group_parents_mixed` 7 × 9 × 4 states (`sonata`, `session` and `page`
raised) = 252; `bundle_mixed` 6 × 9 × 2 = 108. In `bundle_shared_parent`
`score` has two cards, behind `group_1` and behind `group_2`, both drawing
the 11 timelines of `score`'s tree, so each of their 99 values has two
places in both states (outside or under each frame nothing open, on both
cards raised); `page`'s 9 values have one in both states; `take_2`'s 9
one nothing open and none with `score` raised, its card lying under the
raised card behind `group_2`'s frame; `take_1`, `take_1_first` and
`take_1_second` (27 values) likewise one nothing open and none with
`score` raised: `exposition`'s card draws `score`'s flow control on its
stretch (drawing.md section 6.4, Gathering), the symbol row `2 + h(12) +
2 = 17.96875` wide, so `take_1`'s card lies below it in `group_1`'s
frame, its line at 197.0078125; `score`'s raised card lies on `score`'s
ancestor row in `exposition`'s card, below that band, and draws the same
symbol row below its own line, so its bottom lies at 199.4765625
(layout's records, the card from 43.6015625, 155.875 high), below
`take_1`'s line, which the card covers: 99 × 2 × 2 + 9 × 2 + 9 + 27 =
450. Cards hidden (nothing raised), a value is
seen on the lines of its member cards, or nowhere where no member card
draws it at that value (`piece`'s values left or right of its member's
span, `score`'s outside its members'): 23, 23, 27, 23, 23, 25, 47, 47 and
143. In all 1,533 places, none differing. Where two lines lie at one point
the reading hovers the earlier (`lineAt`'s tie): only in
`bundle_shared_parent`, the segments `recapitulation_second` and
`recapitulation_second_1` at 0, which lie where `recapitulation_first`
ends, are read on `recapitulation_first`'s line: with the cards shown
twice each on the arranger (`group_2`'s `recapitulation` card and the
card's row of it) and twice each with `score` raised, hidden once each
on the arranger. Then the reading's own anchor and line are compared,
which agree too.

**From the points read.** Every line the pointer reads (`axesOf`), at 65
abscissas from its start to its end (both ends included, evenly spaced),
on its ordinate: each point reads nothing (the line is covered there, or
a nearer line is read) or a line that is a place of the reading's
position on its anchor's timeline (`placesAt` holds a place on the read
line), and the pin made there lists the flag's rows. An ancestor card's
line of a timeline whose span crosses the frame's borders is drawn in runs, one left of the frame, one under it
and one right of it (each an axis of its own, `axesOf`), so more lines
are read than the timelines drawn; a run under the frame reads nothing
where the frame covers it and no member line lies at its ordinate, and
the end of a run at a frame's border lies on that border, covered. With a
root raised, a reading at the end of a run at a seam reads the position
at the seam, which lies on the run under the frame: the reading lies
there (`readingAt`'s seam rule), so its line is a place again. The points
read and those reading nothing, cards shown then hidden:
`group_parent_both` 776 and 134, 195 and 0; `group_parent_right` 648 and
132, 195 and 0; `group_parent_exact` 520 and 130, 195 and 0;
`group_child_member` 648 and 132, 195 and 0; `group_child_member_stamps`
776 and 134, 195 and 0; `group_grandchild` 1,164 and 136, 260 and 0;
`group_parents_mixed` 3,689 and 731, 455 and 0; `bundle_mixed` 1,231 and
69, 390 and 0; `bundle_shared_parent` 2,142 and 588 (with `score` raised
the 65 points of `take_1`'s line, which the raised card covers, read
nothing), 585 and 0; none differing. Each pair is 65 points times the lines `axesOf` gives in each
state. With the cards hidden no line is covered, so every point reads.
What would be wrong: a point read on a line that is no place there, as a
place rule dropping a member's ancestor-card rows gives in
`bundle_shared_parent`, or a reading at a run's end at a seam left on that
run (its line is then no place of the position, with the root raised).

What would be wrong in either: any place or point whose flag and pin
differ. Without the read line (the first place always) places differ in
`group_grandchild`, `group_parents_mixed`, `bundle_mixed` and
`bundle_shared_parent`, and points in the same four.

## Show matches (`matches.test.ts`, `matches-budget.test.ts`)

"Show matches" draws the potential MatchStamps of each block's loaded
MatchClaim table over that block alone, on its lines drawing a timeline
the table names (by ID): every block's manifest names its own table and
filter, and every table numbers its own MatchStamps from 0. The
anchor index, its coordinates, anchors and potential MatchStamps, is
core's (`anchorIndexOf`, proven there); where a cross-section line lies
and the line of an alignment anchor are layout's (`crossSectionSegment`,
`anchorLine`, proven there against the drawing specification). What the
arranger owns, and what is proven here, is where each coordinate is put
(the lines holding its timeline, at the abscissa of its position), which
coordinates are drawn for a view (at most one per device pixel column of
a card, only what is in view), which connectors are drawn, what the
pointer hovers, the flag's groups and order, and the colours of the
MatchStamps shown: each anchor of the pinned and of every named one by the
user's belief in the MatchClaims stating it, a named one out of date all
red. What would be wrong: a coordinate on the wrong line or abscissa, a
connector unlike the named one between the same two timestamps, more than
one line in a column, a cost that grows with the table instead of the
view, a hit on the wrong MatchStamp, a flag in table order instead of
screen order, an anchor in the colour of a belief its MatchClaims do not
hold or of one less critical than theirs, a named MatchStamp out of date
drawn anywhere but red, or one up to date drawn red.

**The block.** Block A holds `bundles/bundle_matchstamps` at (40, 80),
scale 1, its node at (40, 80). Its three ungrouped roots are drawn in
cards stacked top to bottom (layout's record): `score` ("Score",
quarters, fraction, 8) on the line y 43.20703125, `take_1` ("Take 1",
samples, int, 352800) on y 100.5859375, `take_2` ("Take 2", samples, int,
396900) on y 157.96484375, each from x 61.0927734375 to 461.0927734375
(400 units: 50 a quarter, 882 samples a unit on `take_1`, 992.25 on
`take_2`). A cross-section segment on a line spans its card (drawing.md
section 8.7), from its upper border to its lower one (layout's record:
each card 49.37890625 high, its line 14.40234375 below its top, the cards
8 apart): `score` 28.8046875 to 78.18359375, `take_1` 86.18359375 to
135.5625, `take_2` 143.5625 to 192.94140625. A coordinate's line spans
its card so; a connector joins the nearer ends of two such segments (no
two overlap), from the lower border of the upper card to the upper border
of the lower one, exactly as for the named MatchStamps of the drawing
(`anchor_1` joins `timestamp_1`, score 4, to `timestamp_2`, take_1 88200;
`anchor_2` joins `timestamp_1` to `timestamp_3`, take_2 99225). Abscissas:
score 4 → 261.0927734375, 6 → 361.0927734375; take_1 88200 →
161.0927734375, 176400 → 261.0927734375, 264600 → 361.0927734375; take_2
297675 → 361.0927734375 (297675 / 992.25 = 300).

**The table T.** Timelines in the table's order `take_2` (int), `score`
(fraction), `take_1` (int), `other` (float, in no manifest); claims:
`claim_1` and `claim_2` score 4 ↔ take_1 88200, `claim_3` score 6 ↔
take_1 264600, `claim_4` take_1 264600 ↔ take_2 297675, `claim_5` take_2
297675 ↔ take_1 176400, `claim_6` score 6 ↔ other 0.5, `claim_7` a
NOMATCH between score and take_2. By core's numbering (coordinates by
timeline number then position, anchors by their pair of coordinate
numbers, MatchStamps by their first coordinate) the coordinates are c0
take_2 297675, c1 score 4, c2 score 6, c3 take_1 88200, c4 take_1 176400,
c5 take_1 264600, c6 other 0.5; the anchors a0 (c0, c4), a1 (c0, c5), a2
(c1, c3), a3 (c2, c5), a4 (c2, c6); MatchStamp 0 = {c0, c2, c4, c5, c6},
MatchStamp 1 = {c1, c3}.

**The lines.** The lines holding T's timelines are `score`'s, `take_1`'s
and `take_2`'s, in the drawing's order; `other` has none. Each line's
card is the one layout's line record names (`LineAxis.card`): the three
ungrouped roots' own cards, `{item: score}`, `{item: take_1}`, `{item:
take_2}`. They are the lines `linesOf` gives (above, "Show
coordinates", "A coordinate is placed wherever it is seen"): every line
of a timeline, an ancestor card's row of a member included, so a
member's coordinates are drawn twice where the user sees both its own
card and the row an ancestor card draws of it beside the frame; a
coordinate is drawn, and hit, only where the user sees its line (below).

**Where a timeline is seen** (`seenOn`, `matchLinesOf`). A coordinate is
drawn where the user sees a line of its timeline, and the pointer hits it
there and nowhere else: its lines are those of `linesOf`, its own lines
(else its segment lines) and its ancestor lines in its descendants'
member cards; each line is kept where it is not covered (the stacking
the pointer reads lines by, `stackingOf` with the raised root,
`raisedRoot`, above): an ancestor
card's line beyond the frames, member cards and later ancestor cards
drawn over it, everywhere
while the card is raised, and every other line nowhere inside a raised
card's rectangle. A line is cut at the left and right borders of every
displayed frame and card, each part kept or left out by the coverage at
its middle on the line, neighbours joined, both ends kept (a coordinate on
a border is drawn on the uncovered side). A part is a line of
`matchLinesOf` whose positions run from its left to its right end. On an
ancestor line, which draws no cross-section line, a coordinate's line
spans the cross-section of the member's line it belongs to (layout's
`crossSectionSegment` there), which reaches the ancestor line on its side
(below the member under the default band orders), as a coordinate's line
on the card spans the card's line and its children band.
What would be wrong: a coordinate drawn over the frame on the card's line
the frame covers, not drawn on the ancestor line the user sees inside the
member's card, not drawn on the card's line while it is raised, or drawn
where the pointer does not hit it, or hit where it is not drawn.

In `groups/group_parent_both` (block A at (40, 80); above, "Show
coordinates"): the table P over `middle` (fraction) and `piece`
(fraction), in that order, `p_1` `middle` 2 ↔ `piece` 6, `p_2` `middle` 0 ↔
`piece` 1, `p_3` `middle` 8 ↔ `piece` 14, `p_4` `middle` 1 ↔ `piece` 3: by
core's numbering c0 `middle` 0, c1 `middle` 1, c2 `middle` 2, c3 `middle`
8, c4 `piece` 1, c5 `piece` 3, c6 `piece` 6, c7 `piece` 14, the anchors
a0 (c0, c4), a1 (c1, c5), a2 (c2, c6), a3 (c3, c7), the MatchStamps 0 =
{c0, c4}, 1 = {c1, c5}, 2 = {c2, c6}, 3 = {c3, c7}. `piece`, the root,
is drawn on the ancestor card's line (y 85.18359375) in three runs, 0 to
4 from 60.33544921875 to 260.33544921875, 4 to 12 from 364.0390625 to
764.0390625 and 12 to 16 from 804.0390625 to 1004.0390625 (50 units a
quarter on each), and as the ancestor line in `middle`'s card (y
85.18359375, x 364.0390625 to 764.0390625, 4 to 12), both at one abscissa
for one position under the frame. **The partition.** The card's axis has
its seams at the frame's borders, 260.33544921875 and 804.0390625 (the
frame's room, `docs/drawing.md` in TimeToShare, section 8.8, step 2): the
frame covers exactly the run from 4 to 12, which the ancestor line draws
inside `middle`'s card, and the card's runs left and right of the frame
are seen. So the card's line is seen from 0 to 4 and from 12 to 16, the
ancestor line from 4 to 12: the cases cover the root's whole extent, and
every coordinate of `piece` is drawn and hit somewhere.

On the arranger (nothing raised), the lines in the drawing's order: the
ancestor line (`piece`, card `{item: group_1, member: middle}`, y
85.18359375, positions 4 to 12, cross-section segment the span of
`middle`'s card, 32.8046875 to 100.18359375: `middle`'s line's, whose
card it lies in), `middle`'s own line (y 47.20703125, 364.0390625 to
764.0390625, 0 to 8, card `{item: group_1, member: middle}`, the same
segment), then the card's line twice (card `{item: group_1, member:
piece}`, segment the ancestor card's span, 36.20703125 to 99.5859375),
its run from 0 to 4 and its run from 12 to 16; `middle` nowhere on the
card's row (51.20703125). With `piece`'s timeline editor open (the card
raised): the card's three runs, 0 to 4, 4 to 12 and 12 to 16, then the
card's `middle` row (y 51.20703125, 364.0390625 to 764.0390625, 0 to 8,
card `{item: group_1, member: piece}`, the same segment as the card's
line, 36.20703125 to 99.5859375); `middle`'s own line lies inside the
raised card (from 36.20703125 to 99.5859375) and is not seen.

A connector joins two segments that overlap vertically at the middle of
their overlap (layout's `anchorLine`): the ancestor card's span lies
within `middle`'s card's, so every connector here runs at `(36.20703125 +
99.5859375) / 2 = 67.896484375`, raised or not.

| MatchStamp | Arranger: lines `[coordinate, x, y1, y2]`, connectors | Card raised |
|---|---|---|
| 0 | c0 [0, 364.0390625, 32.8046875, 100.18359375], c4 [4, 110.33544921875, 36.20703125, 99.5859375] (left of the frame); a0 from (364.0390625, 67.896484375) to (110.33544921875, 67.896484375) | c0 [0, 364.0390625, 36.20703125, 99.5859375] on the card's row, c4 as on the arranger; a0 as on the arranger |
| 1 | c1 [1, 414.0390625, 32.8046875, 100.18359375], c5 [5, 210.33544921875, 36.20703125, 99.5859375] (left of the frame); a1 from (414.0390625, 67.896484375) to (210.33544921875, 67.896484375) | c1 [1, 414.0390625, 36.20703125, 99.5859375], c5 as on the arranger; a1 as on the arranger |
| 2 | c2 [2, 464.0390625, 32.8046875, 100.18359375] on `middle`'s line and c6 [6, 464.0390625, 32.8046875, 100.18359375] on the ancestor line; a2 has no length | c2 [2, 464.0390625, 36.20703125, 99.5859375], c6 [6, 464.0390625, 36.20703125, 99.5859375] on the card's run under the frame; a2 has no length |
| 3 | c3 [3, 764.0390625, 32.8046875, 100.18359375], c7 [7, 904.0390625, 36.20703125, 99.5859375] (right of the frame); a3 from (764.0390625, 67.896484375) to (904.0390625, 67.896484375) | c3 [3, 764.0390625, 36.20703125, 99.5859375], c7 as on the arranger; a3 as on the arranger |

The hit test (tolerance 8, connectors those of the whole view's overlay,
a0, a1 and a3; the pole of a hit on a line lies at the line's ordinate,
its top the segment's upper end):

| Point | Arranger | Card raised |
|---|---|---|
| (110.33544921875, 85.18359375), left of the frame | c4, MatchStamp 0, distance 0, pole at (110.33544921875, 85.18359375), top 36.20703125 | the same |
| (464.0390625, 74), inside `middle`'s card | c6 on the ancestor line (tied with c2 on `middle`'s, the earlier line wins), MatchStamp 2, distance 0, top 32.8046875 | c6 on the card's line, distance 0, top 36.20703125 |
| (464.0390625, 91.40234375), below the ancestor line | c6 on the ancestor line, distance 0 (its segment reaches `middle`'s card's bottom, 100.18359375; tied with c2), MatchStamp 2, top 32.8046875 | c6 on the card's line, distance 0 (the card reaches 99.5859375), top 36.20703125 |
| (210.33544921875, 80), `piece` 3 left of the frame | c5, MatchStamp 1, distance 0, top 36.20703125 (a1 lies 12.103515625 above) | the same |
| (904.0390625, 85.18359375), right of the frame | c7, MatchStamp 3, distance 0, top 36.20703125 | the same |
| (414.0390625, 51.20703125), the card's `middle` row at 1 | not the row, covered by the frame: c1 on `middle`'s own line, whose segment holds the point, MatchStamp 1, distance 0, pole at 47.20703125, top 32.8046875 | c1 on the card's row, MatchStamp 1, distance 0, top 36.20703125 |

With every ancestor card hidden (the workspace's rule) `piece` is drawn
on no marked line, only as the ancestor line in `middle`'s card: it is
seen there, the whole line, the positions 4 to 12 (layout's record gives
its place: start 4, drawn length 8 over 400 units), so P's `piece` 6 is
drawn on it 100 right of its start, across `middle`'s card (from its
upper to its lower border, layout's record of that card), and its screen
place is the point on the ancestor line. What would be wrong: `piece`
drawn nowhere, its ancestor line not taken for a line it is seen on.

**A coordinate at a seam is drawn once** (`docs/drawing.md` in
TimeToShare, section 3.2, Seams; section 8.8, step 2): the card's runs
meet at the seams at 4 and 12, and a position at a seam lies on one side
of it alone, the side of `middle`'s span, so on the run from 4 to 12 (the
place rule, "Show coordinates": `holdsAt`). A line's part ends at a
position it draws, both ends included, except an end at a seam the run
does not hold: the run from 0 to 4 does not draw 4, the run from 12 to 16
does not draw 12. P has no coordinate at a seam; the table S does:
`middle` (fraction) and `piece` (fraction), `s_1` `middle` 0 ↔ `piece`
4, `s_2` `middle` 8 ↔ `piece` 12; by core's numbering c0 `middle` 0, c1
`middle` 8, c2 `piece` 4, c3 `piece` 12, the anchors a0 (c0, c2), a1 (c1,
c3), MatchStamps 0 = {c0, c2}, 1 = {c1, c3}. Each MatchStamp, hovered
or pinned, draws each of its coordinates exactly once, its two at one
abscissa, so neither has a connector of any length:

| MatchStamp | Arranger | Card raised |
|---|---|---|
| 0 | c0 [0, 364.0390625, 32.8046875, 100.18359375] on `middle`'s line, c2 [2, 364.0390625, 32.8046875, 100.18359375] on the ancestor line | c0 and c2 at 364.0390625 from 36.20703125 to 99.5859375, on the card's row and its run from 4 to 12 |
| 1 | c1 and c3 at 764.0390625 from 32.8046875 to 100.18359375 | c1 and c3 at 764.0390625 from 36.20703125 to 99.5859375 |

The whole view (1000 × 600 at (0, 0), as below) draws c2 at 364.0390625
and c3 at 764.0390625 and nothing else, raised or not: one line per device
pixel column of a card, and `piece`'s line comes before `middle`'s in the
drawing's order in either card (the ancestor line in `middle`'s card, the
run from 4 to 12 in the raised card); no connector. Nothing is drawn at the
frame's borders, 260.33544921875 (the run from 0 to 4 ending at 4) and
804.0390625 (the run from 12 to 16 starting at 12), and nothing is hit there (tolerance 8, raised or not); a press at
(364.0390625, 85.18359375) hits c2, MatchStamp 0, distance 0: on the
arranger on the ancestor line, top 32.8046875 (tied with c0 on `middle`'s
line, the earlier line wins), raised on the card's run, top 36.20703125.
What would be wrong: a coordinate at a seam drawn on both runs (a
connector between its two drawings' MatchStamp partners 103.70361328125
or 40 long), or on neither.

**What is drawn, in view.** At the view (0, 0), zoom 1, one device pixel
per CSS pixel, the canvas 1000 × 600, everything is in view. Line by line
in the drawing's order, each by position: c1 at 261.0927734375 and c2 at
361.0927734375 on score; c3 at 161.0927734375, c4 at 261.0927734375 and
c5 at 361.0927734375 on take_1 (its own card, so c4 shares no column with
c1); c0 at 361.0927734375 on take_2; each line across its card, `M x y1
V y2` (score 28.8046875 to 78.18359375, take_1 86.18359375 to 135.5625,
take_2 143.5625 to 192.94140625).
Then every anchor of a drawn coordinate once, in the order the drawn
coordinates reach them (c1: a2; c2: a3, a4; c4: a0; c5: a1), each between
the nearer ends of its two segments (no two cards overlap): a2 from
(261.0927734375, 78.18359375) to (161.0927734375, 86.18359375), exactly
the drawn `anchor_1` element's `x1, y1, x2, y2`; a3 from (361.0927734375,
78.18359375) to (361.0927734375, 86.18359375); a4 is not drawn (`other`
has no line); a0 from (361.0927734375, 143.5625) to (261.0927734375,
135.5625) (take_2 below take_1: from the upper end of the first to the
lower end of the second); a1 from (361.0927734375, 143.5625) to
(361.0927734375, 135.5625).

**One line per device pixel column of a card.** The table D holds 1601
claims `score k/200` ↔ `take_1 220k`, k = 0 … 1600. On score a quarter is
50 units, so k lies at 61.0927734375 + k/4 and on the screen at 101.0927734375
+ k/4 (node at 40): four coordinates a column, the column ⌊101.0927734375
+ k/4⌋, so exactly the k divisible by 4 are drawn, 401 lines at
61.0927734375 + k/4 (D's score coordinates are numbered first, by k, then
take_1's). On take_1, 220k
samples lie 220k/882 units right of the start, less than one unit apart,
from the column 101 to ⌊101.0927734375 + 352000/882⌋ = 500: every column
taken once, 400 lines. In every case no two lines of one card share a
column, and the connectors are exactly the anchors of the drawn
coordinates, each once. The view decides, never the table: at the view
(−200, 0) the score coordinates drawn are those from k = 396 (−200 + 40 +
61.0927734375 + 99 = 0.0927734375, the first column 0; k = 392 lies left
of the view) to 1600, every fourth: 302 lines; take_1's 301 (columns 0 to
300). At zoom 2 on two device pixels per CSS pixel the column of k on
score is ⌊4 · (101.0927734375 + k/4)⌋ = ⌊404.37109375 + k⌋, one for every k,
and the view ends at the canvas unit 500, the position (460 −
61.0927734375)/50 = 7.97814453125: k from 0 to 1595, 1596 lines.

**Hovering** (`matchHitAt`, tolerance 8 canvas units at zoom 1, scale 1,
ratio 1, as for "Show coordinates"). A line is hovered by its coordinate
nearest the pointer on the line's axis (core's `coordinateNear`, whatever
was drawn) at the Euclidean distance from the pointer to its
cross-section segment; a connector by the distance to its nearest point;
the nearest wins, a line before a connector on a tie. On T:

| Point | Hovered | Why |
|---|---|---|
| (364.0927734375, 78.18359375) | c2's line, MatchStamp 0, distance 3 | 3 right of c2's line at its lower end (`score`'s card's bottom), where a3 begins: as near, the tie goes to the line |
| (365.0927734375, 81.18359375) | a3, MatchStamp 0, distance 4 | 4 from a3's vertical line (78.18359375 to 86.18359375), 5 from c2's line's lower end |
| (311.0927734375, 144.5625) | a0, MatchStamp 0 | 5 below a0's midpoint (311.0927734375, 139.5625), 500 / √(100² + 8²) ≈ 4.98 from the diagonal; the nearest line is 50 away |
| (461.0927734375, 70) | nothing | no coordinate or connector within 8 |
| (364.0927734375, 40.20703125) at zoom 2, ratio 2 | nothing | the tolerance is 2, c2's line 3 away |

A coordinate hovered on its line puts the flag's pole at its abscissa,
foot the line's ordinate, top its cross-section line's top (c2: x
361.0927734375, y 43.20703125, top 28.8046875); on a connector at the
nearest point (a3: (361.0927734375, 81.18359375)). On D, the pointer at
(61.5927734375, 43.20703125), on k = 2's place, hovers k = 2 (coordinate
2), which is not drawn.

**Screen order** (`screenPlace`, `screenOrder`, `inScreenOrder`). The one
screen order of a MatchStamp's coordinates, which the flag here and the
editor's Matchstamp tab and naming read: a coordinate (a timeline's ID and
an exact value on its own axis) shows first at the topmost, then leftmost
of its places (`placesAt`, above, "Show coordinates", "A coordinate's
place": the parts of lines "Show matches" draws it on, its own lines,
else the segment line holding it, where the user sees them, with the
root the block's editor raises, none by default), a place counted only
where the part holds the value exactly (from 0, up to a segment's length,
within the line's drawn span, both ends included), its abscissa layout's
`abscissaOf`; coordinates top to bottom,
then left to right, those the block draws nowhere last; equal places, and
the undrawn, keep their given order. What would be wrong: the first line in
drawing order taken for a timeline drawn in several cards (so the flag and
the tab disagree), a place beyond a line's or a segment's span, an unstable
order.

Block A holds `bundles/bundle_shared_member` at (0, 0): `t` ("Score",
quarters, fraction, 8) is a member of both groups, so it is drawn in a card
of `g1`'s frame (with `u`, seconds, float, 4) and in one of `g2`'s (with
`v`, pixels, int, 800). At the default places (layout's record) `g1`'s
frame lies at (0, 0), its `t` line on y 68.01171875 and `u`'s on
125.390625, each from x 102.29150390625 to 502.29150390625 (400 units: 50 a
quarter, 100 a second, one per 2 pixels). `set place` moves `g1`'s frame to
(0, 100) and `g2`'s to (400, 0), each frame's lines shifted by its place:
`g1`'s `t` on y 168.01171875, `u` on 225.390625, from x 102.29150390625;
`g2`'s `t` on y 68.01171875, `v` on 125.390625, from x 502.29150390625.
`g1`'s `t` line is drawn first and lies left; `g2`'s lies on top.

| Coordinate | Place |
|---|---|
| `t` 4 | (702.29150390625, 68.01171875): `g2`'s line, the topmost, not `g1`'s (302.29150390625, 168.01171875) |
| `t` 6 | (802.29150390625, 68.01171875) |
| `t` 8 | (902.29150390625, 68.01171875): the end is drawn |
| `v` 400 | (702.29150390625, 125.390625) |
| `u` 2.0 | (302.29150390625, 225.390625) |
| `t` 17/2, `t` −1 | none: beyond the drawn span, before 0 |
| `w` 1 | none: no line holds `w` |

So [`u` 2.0, `t` 6, `v` 400, `t` 4] in screen order is [`t` 4, `t` 6, `v`
400, `u` 2.0] (by the first line in drawing order it would be [`v` 400,
`t` 4, `t` 6, `u` 2.0]); [`t` 17/2, `u` 2.0, `w` 1] is [`u` 2.0, `t` 17/2,
`w` 1]; `t` 4 written as the integer 4 and as the fraction 4/1 lie at one
place and keep their given order either way. `screenOrder` puts a place
before none and none after a place, two nones level (0).

On `segment_pages` at (0, 0) the segment line `pages` (pixels, int, 7016)
lies on y 36.4765625 from x 56.85498046875 to 456.85498046875 (layout's
record, 7016 pixels over 400 units), its segments `page_1` … `page_4` of
1754 pixels at the offsets 0, 1754, 3508, 5262, none drawn on a line of
its own: `page_2` 0 is at (156.85498046875, 36.4765625) (1754 / 7016 × 400
= 100 right of the start), `page_2` 1754 at (256.85498046875, 36.4765625),
its end; `page_2` 1755 is beyond the segment: none.

In `groups/group_parent_both` (block A at (40, 80); above, "Show
coordinates") `middle` 4 is at (564.0390625, 47.20703125), its member
card's line, not at (564.0390625, 51.20703125), the ancestor card's row
of it the frame covers; `piece` 8 at (564.0390625, 85.18359375), the
point of its ancestor line below `middle` (the card's line there is
covered); `piece` 1 at (110.33544921875, 85.18359375), on the card's run
left of the frame. So [`piece` 8, `middle` 4] in screen order is
[`middle` 4, `piece` 8], as drawn top to bottom in `middle`'s card.
`piece` 3, left of the frame (above, "Where a timeline is seen"), lies at
(210.33544921875, 85.18359375) on the card's run there, raised or not.
`middle` 1 lies at (414.0390625, 47.20703125) on the arranger and at
(414.0390625, 51.20703125), the card's row, while the card is raised, so
[`piece` 3, `middle` 1] is [`middle` 1, `piece` 3] in screen order on
the arranger and raised alike. In `groups/group_grandchild` (above,
"Show coordinates"), drawn in the Full view (`withFullCards`, "Whole
ancestor cards" in the fixture facts: the subject is the screen order,
not the elision), `score` 28, `movement` 12 and `theme` 4 lie at x
1585.96923828125 on `theme`'s card: `theme`'s line at 47.20703125,
`movement`'s ancestor line at 85.18359375, `score`'s at 99.18359375; so
[`movement` 12, `score` 28, `theme` 4] in screen order is [`theme` 4,
`movement` 12, `score` 28] (never the card's covered `movement` row at
the ordinate of the ancestor line); with every ancestor card hidden the
same order at the same ordinates (the block's origin is not lifted by
the card).

**The flag** (`matchFlag`, 3 decimals). One group per run of rows on one
timeline, named as the manifest names it and keyed by its first row, each
coordinate a row in core's `prettyText` with the timeline's unit, keyed by
its number; rows in screen order (above), what the block does not draw
last. Read
without groups (no table here has a group; inside a timeline editor
every flag is read so) the flag lists the MatchStamp's own coordinates
alone. MatchStamp 0 of T: `Score` [`6 ♩`], `Take 1`
[`176 400 smp`, `264 600 smp`] (176400 at 261.09… left of 264600 at
361.09…), `Take 2` [`297 675 smp`], `other` [`0.5`] (no line, the table's
number type, no unit); the table's order (take_2 first) is not the
screen's. MatchStamp 1: `Score` [`4 ♩`], `Take 1` [`88 200 smp`].

**Colours by belief.** The user's beliefs B in T's MatchClaims, per row
as core's `believedBy` gives them (its numbers: false 0, unlikely 1,
undecided 2, true 3): `claim_1` true, `claim_2` unlikely, `claim_3` true,
`claim_4` false, `claim_5` undecided, `claim_6` true, `claim_7` undecided.
An anchor takes the most critical belief among the MatchClaims stating it
(core's `anchorBelief`): a0 (`claim_5`) undecided, a1 (`claim_4`) false,
a2 (`claim_1`, `claim_2`) unlikely, a3 (`claim_3`) true. The colours:
undecided `#1BA1E2`, true `#339933`, unlikely `#E07000`, false `#E51400`.

**The pinned MatchStamp by colour** (`pinnedOverlays`). Its overlay
(`stampOverlay`) split into one part per colour that has anything, true
first, then undecided, unlikely, false, so the most critical lies on top;
the cross-section lines go with undecided, in the cross-section blue. With
B, MatchStamp 0: true a3 (`M361.0928 43.207L361.0928 100.5859`), undecided
its lines c0, c2, c4, c5 and a0, false a1; MatchStamp 1: undecided its
lines c1, c3, unlikely a2. Without beliefs every connector is undecided:
one part, the whole overlay. The same overlay and beliefs give the same
parts again.

**The hovered and the pinned MatchStamp drawn as named** (`stampOverlay`
with `namedGroupstamps`). A potential MatchStamp shown is drawn as naming
it would draw it: where naming would store a coordinate as a groupstamp
(core's `namedAsGroupstamp`, proven there: the `groupstamp` of the match
timestamp the manifest holds at it, else whether its timeline lies in a
group), each of its lines is followed by the lines a groupstamp there draws
across the frame holding the line's card, exactly layout's
`groupCrossSections` at the same abscissa (proven there against the
drawing specification). What would be wrong: a groupstamp line missing
where naming stores a groupstamp, one drawn where naming stores none, a
piece unlike the named groupstamp's at the same place. Block A holds
`bundles/bundle_matchstamp_groupstamp` at (40, 80): `score` (quarters,
fraction, 8) is a member of `group_1` (with `performance`, seconds, float,
4) and of `group_2` (with `page`, pixels, int, 800); its child
`second-half` (4 quarters at offset 4) is drawn in each of `score`'s
cards. Layout's record: every line from x 102.29150390625 to
502.29150390625 (400 units: 50 a quarter, 100 a second, one per 2
pixels; `second-half` from 302.29150390625); `group_1`'s frame holds
`second-half` on y 68.609375 and `score` on 82.609375 in `score`'s card
(53.609375 to 117.5859375), and `performance` on 139.98828125 in its card
(125.5859375 to 174.96484375); `group_2`'s holds `second-half` on
230.76953125 and `score` on 244.76953125 in `score`'s card (215.76953125
to 279.74609375), and `page` on 302.1484375 in its card (287.74609375 to
337.125). A coordinate's line spans the card of its line (section 8.7),
`second-half`'s as `score`'s; a groupstamp's group piece is the frame's
span (from its topmost card's upper border to its bottommost card's lower
border) less that card: one piece. The manifest holds the match timestamps
`timestamp_1` (score 4, a groupstamp), `timestamp_2` (performance 1.0, no
groupstamp) and `timestamp_3` (second-half 2, no groupstamp). The table G
(timelines `score`, `performance`, `second-half`, `page`): `g_1` score 4 ↔
performance 1.0, `g_2` score 6 ↔ page 400, `g_3` second-half 2 ↔
performance 3.0; so the coordinates c0 score 4, c1 score 6, c2
performance 1.0, c3 performance 3.0, c4 second-half 2, c5 page 400 and
the MatchStamps 0 = {c0, c2}, 1 = {c1, c5}, 2 = {c3, c4}. Naming stores
a groupstamp at c0 (`timestamp_1`'s), c1, c3, c5 (unheld, on group
members), none at c2 and c4 (held by `timestamp_2` and `timestamp_3`,
which are none).

| MatchStamp | Lines, as `[coordinate, x, y1, y2]` |
|---|---|
| 0 | c0 on `group_1`'s `score` [0, 302.29…, 53.609375, 117.5859375], then [0, 302.29…, 117.5859375, 174.96484375]; on `group_2`'s [0, 302.29…, 215.76953125, 279.74609375], then [0, 302.29…, 279.74609375, 337.125]; c2 [2, 202.29…, 125.5859375, 174.96484375] alone |
| 1 | c1 as c0 at 402.29…; c5 [5, 302.29…, 287.74609375, 337.125], then [5, 302.29…, 215.76953125, 287.74609375] |
| 2 | c3 [3, 402.29…, 125.5859375, 174.96484375], then [3, 402.29…, 53.609375, 125.5859375]; c4 [4, 402.29…, 53.609375, 117.5859375] and [4, 402.29…, 215.76953125, 279.74609375] alone |

(302.29… = 102.29150390625 + 200, 402.29… = + 300, 202.29… = + 100.)
Each group piece is exactly what `groupCrossSections` gives on that line at
that abscissa, and MatchStamp 0's four pieces of c0 are exactly the four
`cross_section` elements the drawing holds for the named groupstamp
`timestamp_1` at the same place: "exactly as a named one". Without
`namedGroupstamps`, and on `bundles/bundle_matchstamps` (three ungrouped
roots: no frame) with it, the overlay is the one above, its segment
pieces alone. The group pieces are cut by the line's own cross-section
extent only (`groupCrossSections`), where a named groupstamp's are also
cut by the lines its label stack lies on (layout's `groupstampElements`):
the two differ only where a match timestamp displays a label (its name,
ID or coordinate), never with the default `display` of a match timestamp,
`[cross_section]`, which G's three hold, so the equality above holds.
Without `namedGroupstamps`, MatchStamp 1 then is c1's two extents and c5's point. The
connectors are unchanged. The potential MatchStamps' overlay
(`overlayOf`, the view of "What is drawn, in view") draws no groupstamps:
on G its lines are c0 and c1 on `group_1`'s `score`, c2 and c3 on
`performance`, c0 and c1 on `group_2`'s `score`, c5 on `page`, each its
segment piece alone (c4 shares its device column on `score`'s card with
c1, which `score`'s line, earlier in the drawing's order, took).

**A length of the group not known** (drawing.md §6.6; a coordinate is
placed wherever it is seen). Every line of the overlay carries its
opacity: 1 on a line holding the coordinate and on a group piece where
the group gives a value, the group piece's own where it gives none
(`groupCrossSections`: `FADED_OPACITY` 0.35 in place of the line's). The
overlay draws its lines at opacity 1 and its connectors as one path
(`pathOf`), and the lines at each other opacity as one more path each,
in the order first met (`fadedPathsOf`), which `MatchOverlay.svelte`
draws at that opacity in the hovered or the pinned colour. With
`performance`'s length `null` in block A (its reach 4.0, its `length`
timestamp's, so every abscissa and card is as above), with
`namedGroupstamps`: MatchStamp 0's lines are the table's, c0's
`group_1` piece cut at `performance`'s card's top, [0, 302.29…,
117.5859375, 125.5859375] at 1, then [0, 302.29…, 125.5859375,
174.96484375] at 0.35; MatchStamp 1's likewise at 402.29… for c1; and
MatchStamp 2's c3 piece, on `performance` itself (the member of unknown
length holds the coordinate), whole at 0.35. Every other line is at 1.
`fadedPathsOf` of MatchStamp 0's overlay is one path at 0.35,
`M302.2915 125.5859V174.9648`, and `pathOf` the rest. With both lengths
known every line is at 1 and `fadedPathsOf` gives none: the oracle of the
geometry, which equals the table's piece for piece but for the one cut.

**The flag of a MatchStamp crossing groupstamps** (`matchFlag` with the
groups read, `namedGroupstamps`, as the canvas reads it above a timeline
editor). A flag lists every coordinate the MatchStamp's lines show: its
own, and for each where naming would store a groupstamp, the coordinates
its groupstamp reads on the other members of its groups (the members its
GroupStamp pin reads by the group, scaled: `timelinePin` with the group,
as the Matchstamp tab's Coordinates read it), each value once per
timeline, an own coordinate before an equal one read by a group; rows in
the order they are drawn, top to bottom, then left to right (an own
coordinate at its screen place, a groupstamp's at the ordinate its pin
reads the member at, on its coordinate's abscissa), grouped by runs: one
group for each run of consecutive rows on one timeline, keyed by its first
row, so the flag reads top to bottom exactly as drawn; a timeline whose
rows lie apart in that order heads each run, one whose rows are adjacent
heads them once. A row read by a group is keyed by its timeline and exact
value and has no coordinate number. On G (above; `score` 8 quarters,
`performance` 4.0 s and `page` 800 px start and end together, so a
member's value is `score`'s × 1/2, resp. × 100; `second-half` 4 quarters
at `score`'s 4):

| MatchStamp | Groups and rows |
|---|---|
| 0 | `score` [c0 `4 ♩`]; `performance` [c2 `1″`, read `2″`]; `page` [read `400 px`] |
| 1 | `score` [c1 `6 ♩`]; `performance` [read `3″`]; `second-half` [read `0 ♩`]; `score` [read `4 ♩`]; `page` [c5 `400 px`, read `600 px`] |
| 2 | `second-half` [c4 `2 ♩`]; `score` [read `6 ♩`]; `performance` [c3 `3″`] |

MatchStamp 0: c0 `score` 4 is a groupstamp (`timestamp_1`), read on
`performance` 4 / 2 = 2 (its card's line, 139.98828125, at 302.29…, right
of c2 at 202.29…) and on `page` 4 × 100 = 400 (302.1484375); c2 is none.
MatchStamp 1: c1 `score` 6 reads `performance` 3 and `page` 600; c5
`page` 400 reads `score` 4 in `group_2`'s card (244.76953125) with its
crossed child `second-half` at 4 − 4 = 0 (230.76953125, above it). So
by ordinate `score` 6 (82.609375), `performance` 3 (139.98828125),
`second-half` 0, `score` 4, then `page` 400 and 600 on one line, left to
right: `score` 4 lies below `performance` 3, so `score` heads two runs,
keyed `1` and `score 4` (the groups' keys `1`, `performance 3`,
`second-half 0`, `score 4`, `5`), while `page`'s two adjacent rows share
one head. MatchStamp 2: c3 `performance` 3 reads `score` 6 (82.609375) and
its crossed child `second-half` 2, equal to c4 and so listed once, as c4
(68.609375, the topmost); c4 is none. Without the groups read the flags
are MatchStamp 0 `score` [`4 ♩`], `performance` [`1″`] and MatchStamp 1
`score` [`6 ♩`], `page` [`400 px`]. With `performance`'s length `null`
(above) the group gives `performance` no value from `score` and no member
a value from `performance`: a row read by the group on a member without a
value says core's `VALUELESS_TEXT` in place of its value, keyed as before,
in the same place. MatchStamp 0: `performance` [c2 `1″`, read
`VALUELESS_TEXT`]; MatchStamp 1: `performance` [read `VALUELESS_TEXT`];
MatchStamp 2: `score` [read `VALUELESS_TEXT`], c3 still `3″` and c4 `2 ♩`
(its own row). Every other row is the table's, the flag with both lengths
known the oracle. What would be wrong: a groupstamp's
coordinates missing above a timeline editor, listed inside one, listed
twice, or listed in another order than drawn (a timeline's rows gathered
under its first head although another timeline's lie between them).

**Named MatchStamps painted** (`namedPaint`). The named MatchStamps
compared with T by core's `checkMatchStamp`: `matchstamp_1` (`anchor_1`,
score 4 ↔ take_1 88200, claims `claim_1`, `claim_2`) is stated by a2 and
up to date; `matchstamp_2` (`anchor_2`, score 4 ↔ take_2 99225, `claim_3`)
is not stated, so out of date. The paint, by address key: `anchor_1`'s
line stroked by a2's belief (with B unlikely `#E07000`, without beliefs
undecided `#1BA1E2`); `matchstamp_2` all red `#E51400`: `anchor_2`'s line
(stroke), its name label (fill, marked `! `), the lines of `timestamp_1`
and `timestamp_3` (stroke); nothing else, so `timestamp_2`'s line keeps its
style. `timestamp_1` is also `matchstamp_1`'s and is red all the same.
`matchstamp_1` compared with D instead is out of date (D has no take_1
88200): `anchor_1`'s line, its label (marked) and the lines of
`timestamp_1` and `timestamp_2` red.

**What a press on a match timestamp's line selects** (`ownerOf`,
`holdingMatchStamp`). Its MatchStamp: of those whose anchors join it, the
first in the manifest's order whose anchor joining it shows the name, else
the first. `timestamp_1` is joined by `anchor_1` (`display` [line, name],
`matchstamp_1`) and `anchor_2` ([line], `matchstamp_2`): `matchstamp_1`,
the name's, though both hold it; with `anchor_1` showing no name, the
first, `matchstamp_1` again; with the MatchStamps in the other order and
`anchor_1` still showing the name, `matchstamp_1`, now the second.
`timestamp_3`'s line: `matchstamp_2`. Any other part of a match timestamp
(`timestamp_3`'s name label), and a part of an ordinary timestamp, is
owned and selected as the timestamp; an anchor's line and label as its
MatchStamp.

**The path.** `pathOf` writes the lines, then the connectors, each a
subpath, numbers as the writers write them (four decimals, as the
drawing's own elements are written): for T at zoom 1 `M261.0928
43.207V43.207` and so on, then `M261.0928 43.207L161.0928 100.5859` and
so on, in the order above. A path is written once per overlay object (an
overlay never changes), so the same overlay gives the same string again
without writing it; each number is written once per path.

**Budget** (`matches-budget.test.ts`, run alone by `pnpm test:budget` in
`app/`, after core's budgets, through `vitest.budget.config.ts`; excluded
from the default run). 250,000 claims made as core's anchor-index budget makes them
(the same generator, seed and shares: 70 % instants, 25 % intervals, 5 %
NOMATCH), their steps spread over the three lines' spans (score in steps
of 1/25001 quarter, take_1 and take_2 in whole samples), so all of them
lie in view with the whole block at zoom 1 on a canvas 1000 × 600, two
device pixels per CSS pixel (twice the columns of one): the overlay of a
view is found within 16 ms (one frame) at zoom 1 and at zoom 4; a hover is
answered within 1 ms, the whole of what the canvas does for one: the hit
(`matchHitAt` among the connectors drawn at zoom 1, tolerance 8 device
pixels, 4 canvas units), the potential MatchStamps' path again (a lookup,
written once per overlay), the hovered MatchStamp's overlay
(`stampOverlay`, given `namedGroupstamps` as the canvas gives it; the
fixture has no group, so no groupstamp line is drawn and the measurement
holds the lookups naming makes, never the lines across a frame) and path, and its flag (`matchFlag`); the shortest of
five runs after a warm-up. The path of a view's overlay, written anew for
each new overlay, is measured and printed, not bounded (the writers'
exact number text decides its cost). The lines of a drawing
(`matchLinesOf`) are built once per drawing and table and are not timed.

## Elisions on the canvas (`gaps.test.ts`, `card-axis.test.ts`, `gap-keys.test.ts`, `gap-gesture.test.ts`, `gap-handles.test.ts`, `pane.svelte.test.ts`)

An elision is drawn as gaps (TimeToShare's `docs/drawing.md`, sections 2,
3.2, 6.6 and 8.9; layout's README, "Elisions", is the oracle of every
abscissa, width and elided coordinate used here, read from the drawing's
records): a stored elision `E` addressed `{id: E}`, a default one lying on
`T` `{id: T, part: ["elision"]}`, each piece one `elision` element, the
gap, holding its ellipses and labels. What proves the canvas's side is that
every value below follows from those records by the arithmetic written
here, never from the arranger's output; blocks lie at (0, 0), scale 1, zoom
1, so a block point is a canvas point.

Facts of `bundle_elisions_stored` (layout's point 5): `score` (64
quarters, fraction) in its ancestor card `{item: group_1, member: score}`
at `LA = 3200`, so `k` = 3200 / 64 = 50 canvas units a quarter on every run,
its line at ordinate `105.98828125`, its protected span `theme`'s, 16–24;
the stored gaps `elision_4` (stored 0–20, drawn 0–16, natural 800, drawn
400 by `{ratio: 0.5}`), `elision_5` (32–48, 800 and 200 by `{span: 4}`,
from `1432.2615751378676` to `1632.2615751378676`: right of the
protected span, so right of the frame's room, `OL + OR = 143.70361328125`,
section 8.8, step 2), `elision_6` (stored
40–56, drawn 48–56, 400 and 30 by `{canvas: 30}`), and `elision_3`
carried from the frame; `session`'s card (Full) draws only the carried
`elision_3`; the frame `group_1` draws `elision_3` on `recording` 0–2
(seconds, float, length 10, frame `L` 400, so `k` = 40), `recording`'s
line at `218.76953125`; `page`'s card draws `elision_2` (pixels, int,
600–1754, the standard gap, `L` 400 over 1754, so `k` =
`0.22805017103762829`), its line at `284.1484375`. Facts of
`group_elided_members` (layout's point 3): the frame (`L` 400) draws
`elision_1` on `excerpt` 2–8 (`λ` 16, `k` 25, the standard gap; its line at
`47.20703125`) and `elision_2` on `phrase` 2–6 (on `voice`, `λ` 24, `k` =
400 / 24 = `16.666666666666668`; `{ratio: 0.5}`, natural
`66.66666666666666`; `phrase`'s line at `133.66015625`), listing
`elision_2` on `excerpt` at 28/3–12; `piece`'s ancestor card draws the
default gaps `piece` 1–15 and 33–47 (`74.33333333333334` wide) and both
group elisions carried. Facts of `group_elided_inside` (layout's point 1):
the default gaps `first` 0–8 and 16–32 and `second` 1–31, drawn
`57.14285714285714`, `114.28571428571428` and `128.57142857142856` wide.

**What is drawn and what it stands for** (`gaps.ts`):

1. **The pieces** (`gapsOf`): `bundle_elisions_stored` draws, in drawing
   order, `elision_4`, `elision_3` (carried), `elision_5`, `elision_6` in
   `score`'s ancestor card, `elision_3` (carried) in `session`'s, `elision_2`
   in `page`'s card, then `elision_3` in the frame `group_1` (written after
   every item, so recorded by the frame, not by a card's range).
2. **A gap and its parts** (`gapOf`): `{id: elision_4}` and its parts
   `[ellipsis]`, `[name]`, `[id]`, `[coordinate]` stand for `{id:
   elision_4}`; on `group_elided_inside` `{id: first, part: [elision]}`,
   `[elision, ellipsis]` and `[elision, coordinate]` for `{id: first, part:
   [elision]}`, `[elision, id]` (a default has no ID label) for nothing; the
   line `{id: score}` for nothing. `isDefaultGap` holds for the default
   address alone.
3. **What a gap says** (`gapText`, the stretch as a gap's coordinate label
   writes it): "Score, 0–16 ♩, elided", "Recording, 0″–2″, elided" (clock
   units keep the unit on both ends), "Page, 600–1 754 px, elided",
   "Piece, 1–15 ♩, elided".
4. **What takes handles** (`subjectOf`): a stored elision's gap in the
   container deciding it, its edges those its piece reaches: `elision_4` the
   start alone, `elision_5` both, `elision_6` the end alone, `elision_2` and
   the frame's `elision_3` both; a carried and a default gap none (`null`).
   What an edge never crosses (`kept`): `score`'s protected span 16–24 for
   its card's gaps, nothing for `page`'s; in a frame the frame's other gaps
   on the timeline, exactly where the frame lists them (`elision_1` keeps
   28/3–12 of `excerpt`), else read back from their proportions
   (`elision_2` keeps −9–0 of `phrase`: `elision_1`'s `1/8`–`1/2` of
   `voice`, 3–12, less `phrase`'s offset 12).

**The axis of a container** (`cardAxis.ts`, `card-axis.test.ts`):

5. **Scales by run** (`edgeScale`, `unitScale`): beside each edge of every
   gap, `place.scale × L / λ`: 50 for `score`'s gaps, 40 for the frame's
   `elision_3`, `0.22805017103762829` for `elision_2` on `page`, 25 for
   `elision_1` and `16.666666666666668` for `elision_2` in
   `group_elided_members`. The base of a timeline (`baseOf`): in a card its
   root, in a frame the member holding it (`phrase` → `voice`, zero 12,
   `λ` 24); `null` for a timeline the container does not draw.
6. **Abscissas** (`abscissaOf`, `valueAt`, `proportionAt`): `score` at 32
   and 48 lies at the edges of `elision_5` (`1432.2615751378676`,
   `1632.2615751378676`); 40, inside it, has none; at `1532.2615751378676`
   no value is read. On the run after `elision_6` (30 wide, so from
   `1662.2615751378676`) the abscissa `1662.2615751378676 + 200` reads 60
   (56 + 200 / 50). `zeroOf(score
   tree)`: `theme` lies at 16 on `score`.

**Handles and keys** (`gapDrag`, `gapStep`, `gapCommand`, the elision
design's table: the right edge dragged by `Δx`, the left one mirrored):

7. **Coordinates** (tolerance 8, reach 0.5 canvas units): `elision_5`'s
   start dragged −100 is 30 (32 − 100 / 50), dragged −400 is 24 (the
   protected edge and `theme`'s end, a snapping value), dragged −450 held
   at 24 (its piece lies right of the protected span); its end +50 is 49;
   `elision_6`'s end +50 is 57, +450 held at 64, `score`'s length;
   `elision_4`'s start −50 changes nothing (0, the timeline's start); the
   frame's `elision_1` end +50 (8 + 2 = 10) is held at 28/3, where the
   frame's next gap starts, exactly; `elision_2` on `page` start −50 is
   381 (600 − 50 / `0.22805017103762829` = 380.75, the nearest integer).
8. **Width** (the coordinates kept): `elision_4`'s start −50 widens it to
   450 / 800, `{ratio: 0.5625}`; `elision_6`'s end +15 to `{canvas: 45}`,
   +50 to `{canvas: 80}`; `elision_5`'s end +50 to 250 canvas units,
   `{span: 5}` (250 × 64 / 3200, exact); `elision_2` on `page` (the
   standard gap) +50 to `{canvas: 82}`, a standard gap being written in
   canvas units; never wider than the natural width: the frame's
   `elision_2` +50 is `{ratio: 1}`.
   A canvas width is in the frame's own units: in
   `bundle_groupstamp_shared_member` with `g2`'s place `scale` set to
   1.5, `elision_1` (on the shared `t`, `{canvas: 24}`) dragged 15 right
   in `g2`'s frame is `{canvas: 34}` (24 + 15 / 1.5), in `g1`'s (scale 1)
   `{canvas: 39}`. Each frame drawing the shared member's elision records
   its own gap: a gap written after every item belongs to the frame whose
   box holds it.
9. **Both**: the drawn width follows the natural width, so what lies
   beyond the edge stays: `elision_5`'s end +50 sets end 49 and `{span:
   5}`; `elision_6`'s end +50 end 57 and `{canvas: 80}`; the frame's
   `elision_2` end +50 is held at `phrase`'s length 8, the natural width
   then `66.66666666666666 + 2 × 16.666666666666668` (= 100), the drawn
   `33.33333333333333 + (100 − 66.66666666666666)`, `{ratio:
   0.6666666666666667}`.
10. **The command** (`gapCommand`): one `set` on `{block: A, id: E}` of
   the members that change, values written in the timeline's number type
   (`start: [30, 1]` on `score`, `start: 381` on `page`); `null` where
   nothing changes.
11. **A step** (`gapStep`, one grid step of 50 canvas units, one quarter on
   `score`): `elision_5`'s start Left is 31, its end Right 49; a step of
   500 left from 32 stops at 24 on the way; `elision_4`'s start Left
   changes nothing; with Width alone `elision_6`'s end Right is `{canvas:
   80}` and `elision_4`'s start Left `{ratio: 0.5625}`.

**Defaults** (the switch to Custom and Remove all):

12. **Persisting** (`defaultsStored`): `piece`'s ancestor card in
   `group_elided_inside` stores, in one `add` into `{block: A}`, `first`
   0–8 `{canvas: 57.14285714285714}`, `first` 16–32 `{canvas:
   114.28571428571428}`, `second` 1–31 `{canvas: 128.57142857142856}`,
   each `display: [ellipsis, name]` (the card's `elision-display`, the
   initial `ellipsis name`) and its coordinates as Fraction pairs; after
   it, dispatched with `ids: [gap_1, gap_2, gap_3]`, `storedAs` finds
   `first` 16–32 at `{block: A, id: gap_2}` (the second ID, in list order). In `group_elided_members` the two `piece` gaps 1–15 and 33–47,
   `{canvas: 74.33333333333334}`. A card drawing no default (`score`'s in
   `bundle_elisions_stored`) is refused: "The card draws no automatic
   elision."
13. **Remove all** (`defaultsRemoval`): `score` in
   `bundle_elisions_stored` removes, in one `remove`, its card elisions in
   core's canonical order (`elisionsUnder`); `piece` in
   `group_elided_members`, whose only elisions are its frame's, gives
   `null`.

**On the canvas**:

14. **Nothing is read in a gap** (`readingAt`, `gapHoverAt`): in the middle
   of `elision_5` (`1532.2615751378676`, `105.98828125`) nothing is read
   and the gap's flag says "Score, 32–48 ♩, elided".
15. **A press, the holding mark, the marquee** (`pressedIn`, `holdingOf`,
   `elementsInRect`): the ellipsis `{id: elision_4, part: [ellipsis]}`
   selects `{block: A, id: elision_4}`; selecting the group elision
   `elision_3` holds the frame `group_1` and both ancestor cards (its
   carried gaps), selecting `elision_5` `score`'s ancestor card; a
   marquee over `page`'s card from (700, 265) to (880, 335), around the
   gap (from 777.0916777604447 to 809.0916777604447, the card's height,
   269.74609375 to 329.6015625) and its labels, takes `{id: elision_2}`
   once and none of its parts; one ending short of the gap's bottom (at
   320) none.
16. **Picking** (`pickable`): a gap and its parts pick nothing.

The keys (`gap-keys.test.ts`, the arranger's rules, the default
granularity, grid 50):

17. Delete on `{block: A, id: elision_5}` removes it; on a default gap it
   refuses, "Automatic elisions are not deleted one by one: choose Custom
   to edit them.", and dispatches nothing.
18. `]` then Right on `elision_5` sets its end to 49; `[` then Left its
   start to 31, each one `set`; `[` and `]` are read by the character
   typed (`event.key`), never the physical key; with nothing selected they
   are not the canvas's. `1` and `2` toggle the gap modes on a selected
   elision and are the resize modes otherwise; the last pressed mode stays
   pressed. A plain Left on a default gap is taken and changes nothing;
   read-only, the arrows dispatch nothing.

The gesture (`gap-gesture.test.ts`, the strategy with recorded node
actions, viewport (0, 0) zoom 1): `elision_5`'s start handle moved 100 left
under Coordinates previews and stores `set {start: [30, 1]}`, its flag
saying "Score, 30–48 ♩" at the previewed gap's left edge on `score`'s line;
`elision_6`'s end moved 15 right under Width stores `set {width: {canvas:
45}}`, the flag "Score, 40–56 ♩, 45 canvas units wide" (the stored
stretch); a press on
`elision_6`'s start (it reaches none) and any press on a read-only canvas
are not taken.

The handles (`gap-handles.test.ts`, `CanvasHarness`): with `{block: A, id:
elision_5}` selected the canvas shows two handles, `start` and `end`, and
the mode menu with Coordinates pressed and Width not; with `elision_4` the
start alone; with the group elision `elision_3` both (its frame's gap; its
carried gaps take none); with a default gap selected, or a line, no handle
and no menu. Pressing Width presses it; pressing Coordinates then leaves Width
alone pressed; pressing Width again changes nothing.

The pane (`pane.svelte.test.ts`): a `Pane` gives no view before it is
measured; the first size settles at once; a later size only
`PANE_SETTLE` (150) ms after the last one measured (fake timers: none at
149 ms, the last size at 150 ms); a size equal to the settled one cancels
a pending one; a size 0 × 360, −5 × 100 or NaN wide is skipped; `release`
withdraws it. A `$derived` reading `view` is read again when it settles.
`drawingOf` with a pane draws a manifest with an ancestor card for it
(`group_grandchild` at 640 × 360 draws what layout draws for that view,
another drawing than the default's) and never reads it for a manifest
without one (the same drawing object either way).

What would be wrong: a handle dragged by one card scale across runs of
another, a width rounded, a default gap edited alone, a group elision's gap
held by no frame, the pane of one canvas redrawing another's blocks.

## Virtual cards, ribbons, the flow flag and the flow switch (`virtual-cards.test.ts`, `ribbons.test.ts`, `flow-flag.test.ts`, `flow-switch.test.ts`)

TimeToShare's drawing specification, section 8.10, draws a virtual
timeline as a card of its own (a placed one, `places` holding its ID) or
in its group's frame, and a card whose `flow` names a FlowMap of its root
on that FlowMap's virtual axis (a switched card). Layout owns that drawing;
these tests own what the canvas does with it. The cases are TimeToShare's
fixtures `flow/virtual_cards` (the root `allegro`, 1644 quarters, the atomic
sections A [0, 953/2), B [953/2, 500), C [500, 1644); the FlowMaps
`by_hand` "Practice" A A A A, a gap of 4, C; `default` A B A C; `printed`;
`single` A C; the virtual timelines `allegro_by_hand` "Allegro, practice",
`allegro_default` "Allegro, default", `allegro_single` "Allegro, single",
none placed), `groups/virtual_member` (the same, with `allegro_default`
and the seconds root `recording` members of `performance`, `allegro` an
ungrouped root), `flow/switched_card` (`virtual_cards` with the rule
`flow: default` on `{id: "allegro", part: ["card"]}`) and
`groups/switched_frame` (that rule, `allegro` and `recording` members of
`performance`, no virtual timeline). In `virtual_cards` block A places
`allegro_default` at (0, 200) and `allegro_by_hand` at (0, 400), each by
one `set` of its place, so both cards are drawn after `allegro`'s, by ID.

**Played positions.** `default` plays A over [0, 953/2), B over [953/2,
500), A again over [500, 1953/2), C over [1953/2, 4241/2). `by_hand` plays
A at 0, 953/2, 953 and 2859/2, the gap over [1906, 1910), C over [1910,
3054). Its first four entries are a run drawn once in a card of its own
(section 8.10, Runs): only entry 0's brace is drawn, labelled `A × 4`, and
entries 1 to 3 draw nothing.

**Virtual cards are cards** (`virtual-cards.test.ts`). Nothing in the
arranger tells a virtual card from a root's: what proves it is that the
existing card code, run on it, gives what it gives a root's card. A press
on its rectangle hits a `card` with the place key `{item:
"allegro_default"}` and the address `{block: A, id: "allegro_default",
part: ["card"]}`; a move of it to (16, 240) is one `set` of its place to
`{x: 16, y: 240}` and `allegro`'s drawn place `{x: 8, y: 28.8046875}`, as
for any item; a resize by 60 to the right sets `width` its drawn width
plus 60 (Box, right handle) and `length` 460 (Stretch, right handle), and
from the bottom-right handle (Scale) the `scale` the same gesture gives
`allegro`'s card, which is as wide; each applied by core lands in its
place beside its `x` and `y`, and `allegro`'s card gets the same values
from the same gestures. A press on a chunk's brace
hits the element `{id: "allegro_default", facet: "regions", part: [k]}`,
as a press on a region hits the region.

**Ribbons** (`ribbons.test.ts`). `chunkOf` reads a chunk from an address
of a virtual timeline's regions facet whose part starts with a chunk
index (the brace, `[k, "label"]`, `[k, "leader"]`, `[k, "start"]`) and
nothing else: not `{id: "allegro", facet: "regions"}`, not a timeline
line, not a region of `allegro`. A chunk's ribbon geometry is derived from
the drawing alone:

- its **virtual end** lies on the line of its virtual timeline in the card
  drawing its brace, at that line's ordinate `y`, from the brace element's
  `x1` to its `x2` (one stretch per chunk here; a chunk naming a virtual
  timeline plays several, each over its share of the brace);
- its **written end** lies on every line of the root in the block, at that
  line's `y`, from `xStart + (s − start) / L × (xEnd − xStart)` to the same
  of `e`, `[s, e)` the written stretch, `start` and `L` the line's own
  start and drawn length (layout's `abscissaOf`), clipped to what the line
  draws;
- its path is `M a1 ya L a2 ya C a2 m b2 m b2 yb L b1 yb C b1 m a1 m a1 ya Z`,
  `a` the virtual end, `b` the written end, `m = (ya + yb) / 2`.

`allegro_default`'s chunk 1 (B) has one ribbon to [953/2, 500) on
`allegro`'s line and lights nothing (no other chunk names B). Its chunk 0
(A) has one ribbon to [0, 953/2) and lights `allegro_by_hand`'s brace 0
(`A × 4`) and `allegro_default`'s brace 2, in that order (drawing order;
the cards are drawn by ID). `allegro_by_hand`'s chunk 5 (C) reaches
`allegro` over [500, 1644) from its brace, which lies after the run's
shrink: its `x1` is the brace element's, never the linear abscissa of
1910 over the drawn line from its `xs` to its `xe`; it lights `allegro_default`'s brace 3, the other C. Its chunk 1, the second entry of the run, draws no
brace, so no ribbon, and lights `allegro_by_hand`'s brace 0 and
`allegro_default`'s braces 0 and 2. Its chunk 4 (the gap) shows nothing.
In `groups/virtual_member` chunk 1 of the member card reaches `allegro`'s
card from the member card's line. Several chunks shown at once give the
ribbons of each in turn, each key prefixed by its chunk's address key,
and light each other brace once, never one of the shown chunks.

On the node (`ribbons.test.ts`, `NodeHarness`): a pointer moving onto a
chunk's brace draws one `path.tilie-ribbon` per ribbon, its `d` the
ribbon's path, inside one `g.tilie-ribbons` that lets the pointer through
and carries no address attribute, and one `.tilie-lit` copy per lit brace,
its `d` the brace's, without `data-id`, `data-facet` or `data-part`;
leaving the node removes them. With the brace's address among the
selected elements they are drawn without a pointer; with nothing hovered
or selected the node draws no `g.tilie-ribbons`.

**The flag** (`flow-flag.test.ts`). The pin is read on a line of the
drawing (`crossSectionSpec`, core's `timestampAt`), as the canvas reads
it, on the axis of the line holding the position: a line drawn with a run
once has one axis per run (layout's README, Virtual cards, 9), so 1907 on
`allegro_by_hand` is read on its second, from 1906. Values are written as core's `prettyText` writes a coordinate. On
`allegro_default`'s line at the played 600 (in chunk 2, the second A) the
flag adds the part `written allegro_default`, named `Allegro`, with the
rows `coordinate` 100 and `occurrence` `2 of 2`; at 1000 (in C) `523 1/2`
written and `1 of 1`. On `allegro_by_hand`'s line at 1907 (in the gap) the
one row `coordinate` `in a gap`. On `allegro`'s line at 100 the part
`played allegro`, named `Allegro played`, has one row per virtual card in
the block's order (`allegro_by_hand`, then `allegro_default`): "Allegro,
practice" `100, 1053/2, 953 + 100, 2859/2 + 100` and "Allegro, default"
`100, 600`; at 600 (in C) "Allegro, practice" `2010` and "Allegro,
default" `1953/2 + 100`. In `groups/virtual_member` the member card's row
is named "Allegro, default in Performance". A pin on `allegro` in a block
placing no virtual card adds nothing. A virtual timeline is read as the
root its card draws (section 8.10), named by its `name`: a line of a
virtual card is hovered and pinned as any root's, and the named timestamp
`timestamp_4` of `allegro_default` in `groups/virtual_member` pins at
4241/2 on its own axis, its part named "Allegro, default".

**The switch** (`flow-switch.test.ts`, the pure functions, then
`ToolbarHarness`). A card of `allegro` offers "As written", then the
FlowMaps `by_hand` ("Practice"), `default`, `printed`, `single` (no name,
labelled by ID), then the virtual timelines "Allegro, practice", "Allegro,
default", "Allegro, single"; a virtual card offers nothing, nor
`recording`'s card, nor a band or the block. `performance`'s frame in
`groups/switched_frame` offers `allegro`'s list (its member `recording`
has none). The entry shown chosen is `default` in `switched_card` and in
`switched_frame`'s frame, "As written" in `virtual_cards`. Choosing on a
card sends one `style` command, `{type: "style", select: {addresses:
[{id: "allegro", part: ["card"]}]}, set: {flow: F}, blocks: [A]}`, with `F`
the chosen ID, `null` for "As written"; choosing what is shown sends
nothing; on a frame "As written" removes the flow of every member setting
one. Each command applied by core leaves the chosen ID as the card's
`flow` (core's `cardFlow`) and passes the validators. Mounted above `allegro`'s
card, the select `flow-switch` lists those labels in that order, the
chosen one selected; choosing entry 6 ("Allegro, default") dispatches
exactly that command once; a locked canvas disables it. It stands `10 +
h + 4` screen pixels above the box, `h` the mode menu's measured height,
`10` where no mode menu is shown (`switchOffset`).

**The switch's motion.** Where a card becomes switched its chunks move from
their written stretch on the card's line to their brace on the virtual
axis (`switchMorphs`); between two drawings of the same manifest nothing
moves (the switched drawing against itself). `flow/switched_card` drawn as written (its rule's `flow` removed
by the switch's own command) and as switched moves four chunks, in chunk
order, `default`'s A B A C, each its elements in the switched drawing
(every element addressed `{id: "allegro", facet: "regions", part: [k,
…]}`, in drawing order: its brace `[k]`, from k = 1 its boundary `[k,
"start"]`, its label `[k, "label"]`), from its written stretch on the as-written card's line
(`xs + (s / 1644) × 400` to the same of `e`, the line's `xs` and its 400
units as drawn, layout's `abscissaOf`) to its brace on the switched line
(`x(t) = x0 + 400 × u`, `x0` that line's start, `u = t / (4241/2)`,
layout's README, Switched cards, 2): A from `[0, 953/2]` to `[x(0),
x(953/2)]`, B from `[953/2, 500]` to `[x(953/2), x(500)]`, A again from
`[0, 953/2]` to `[x(500), x(1953/2)]`, C from `[500, 1644]` to
`[x(1953/2), x(4241/2)]`. A moving brace or boundary at progress `t` is stretched onto the
span `from + (to − from) × t`: `matrix(s 0 0 1 x1(t) − to.x1 × s 0)`, `s` the
span's width at `t` over `to`'s; a text moves by its span's middle; at
`t = 1` nothing.

## Package (`name.test.ts`)

The package exports its exact name `"@timetoalign/tilie-arranger"`; its
surface is `Canvas`, `liveStore`, `addCommand`, the readers of a typed
axis value `axisValueAt` and `typedValue` (the inspector's fields and the
flow editor's "+ Gap" share them), the selection helpers
`resolveSelection`, `blockOf`, `existing`, `editedSelection`,
`selectionOf`, `isSelected` and `NOTHING_SELECTED`, the key helpers
`isTextInput` and `within`, `drawingOf`, `styleLayers`, `placeChange`
and `changedPlace`, the inspector's readers `blockBox`, `boxOf`,
`keyedBox`, `isItem`, `isHeld`, `fieldsOf`, `levelOf` and `shownValues`,
`placeEdit`, the stamp tabs' `namedPin` and `timelinePin` and the type `KnotsOf`
(the MeasureKnots source is the canvas's own), and the types
`MatchOverlayInput` and `NamedComparison` the canvas's `matches` takes;
and the type `MatchStampPin` its `pinnedMatchStamp` and
`onmatchstamppin` take; the one screen order of a MatchStamp's
coordinates, `screenPlace`, `screenOrder`, `inScreenOrder` and the type
`ScreenCoordinate`; tests import everything else from its modules.
`pnpm typecheck` type-checks
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
   `{id: "score"}` and `{id: "exposition", part: ["start"]}` mark all
   sixteen descriptors drawing them, in drawing order (the figure's
   elements at `data-id="score"` without a part): `score`'s own line in
   each of its two ancestor cards (section 8.8; behind `group_1`'s frame,
   then `group_2`'s, both drawn before the frames, each eliding a stretch
   of `score` by a derived gap), four each (its line in two pieces, one
   each side of the gap, its start circle, its arrowhead; the gap's
   ellipsis and name label are its parts `[elision, …]`, not `{id:
   "score"}`), then both ancestor lines, four each (in `exposition`'s card
   its line, its start circle and two chevrons; in `recapitulation`'s its
   line, two chevrons and its arrowhead). No line marks a member's start
   on its ancestor line any more, so `{id: "exposition", part: ["start"]}`
   marks nothing.
   The holding marks are the block's, then each ancestor card's (`{id:
   "score", part: ["card"]}` twice, each card holding `score`'s line,
   recorded after the block and before every frame), then `group_1`,
   `exposition`'s card, `group_2` and `recapitulation`'s card. Nothing
   selected,
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
   `group_child_member`, its ancestor card hidden (the points are those
   without it), the frame under the pointer is marked, a point on
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
   the band (the wedge of `score`'s named timestamp `origin`) store nothing; outside its timeline's editor no band is
   marked or moved.
7. **Fading, keys and slides.** Outside the edited element everything is
   `data-outside`, on the arranger and in the bundle editor nothing;
   another block fades through its node. A reorder keeps every element
   (by key) and slides them only while a reorder previews an order, never
   under reduced motion; the dragged card's own elements, hidden under its
   copy, never slide (the 13 of `score`'s card), so the card always lies
   where it drops, and nor does the block's rectangle, drawn under
   everything (below an ancestor card leaving) and never moved by a
   reorder: on `bundle_mixed` in `group_1`'s editor 110 descriptors (its
   jump drawing its symbol 𝄇 alone, the defaults hiding its arc), 96
   slide.
8. **An affordance follows the raised card.** The node draws the
   affordances of the named timestamps displaying nothing at their places
   with the root its editor raises (`affordancesOf` with `raisedRoot` of
   its block and editor), the one rule the pin mark, Show matches and the
   marquee read. On `group_parent_both` with a named timestamp `Blank` on
   `piece` at 6 quarters displaying nothing, inside `middle`'s span, and
   the workspace rule `{element: ancestor}` `display: none`, which hides
   the ancestor lines in the member cards (its place lies where
   `group_1`'s frame covers `piece`'s ancestor card and no ancestor line
   runs: "Show coordinates", the place rule; outside `middle`'s span the
   seams of the frame's room put the card's line outside the frame, so
   no stretch there is covered): on the arranger the node draws no
   `.tilie-timestamp-affordance`; with `piece`'s timeline editor open (its
   card raised) it draws exactly one, `data-affordance` the timestamp's
   key, on the card's line at the points `wedgeAt` gives there,
   `440.0391,58.4766 437.0391,71.4766 443.0391,71.4766`: with no ancestor
   row drawn the card lies aligned on `middle`'s line (section 8.8), at
   56.9765625, and no ancestor line runs on to the left, so `middle`'s
   line starts at 340.0390625 and `piece` 6 = `middle` 2 lies at
   `340.0390625 + 2 × 50`; its markers band below: tip `+ 1.5`, base 13
   further, written to four places; not
   `data-outside` (it belongs to `piece`). What would be wrong: no
   affordance on the raised card, or one drawn on the covered card on the
   arranger.
9. **The toolbars' keys.** On a toolbar of `a`, `b` (disabled) and `c`,
   the arrows move the focus and the tab stop past `b` and wrap, Home and
   End go to the ends, a vertical toolbar uses Up and Down instead, and a
   disabled or detached button hands the tab stop on.
10. **Only MatchStamp parts read the paint.** The paint of a block's named
    MatchStamps (`matchPaint`) is recomputed by the canvas at every change
    of the view, so an element that reads it is drawn again each time;
    only the parts of a named MatchStamp or of a match timestamp
    (`Owner.match`) are ever painted, so only they may read it. On
    `bundles/bundle_matchstamps` the node draws 40 elements: the bundle's
    name label and the block's own element, ten for each of `score`,
    `take_1` and `take_2` (the card's shadow and card, the line with its
    start dot and arrowhead, the name label, and for its two named
    timestamps `origin` and `length`, both `[wedge, coordinate]`, a wedge
    and a coordinate label each), and eight MatchStamp parts:
    `anchor_1`'s line and name label (its `display` is `[line, name]`),
    `anchor_2`'s line (no `display`: `[line]`), `timestamp_1`'s and
    `timestamp_2`'s cross-section lines (no `display`: `[cross_section]`;
    each one piece across its card, no wedge or label cutting it), and
    `timestamp_3`'s name label ("Take 2, bar 2") and its cross-section line
    in two pieces, cut where that label stands (`[name, cross_section]`).
    The paint is a map counting the reads of its size and its
    lookups of a part. The out-of-date marks read the size once and look
    up every one of the 40 elements; each MatchStamp part reads the size
    once and looks itself up once: 1 + 8 = 9 size reads and 40 + 8 = 48
    lookups when the node is mounted with a paint stroking `anchor_1`
    `#E51400`, and 9 and 48 of a new paint stroking it `#E07000` once the paint changes, the
    first paint read no more and `anchor_1`'s line now `#E07000` (the
    change reached the parts that read it). What would be wrong: every
    drawn element reading the paint, which makes every command mark every
    element of the node dirty.

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
   element: in `dlt_1`'s editor on the marquee's view (drawn with the
   defaults, as in the marquee section) the rectangle of the
   marquee section selects `{block: A, id: "cmap_7"}`, `{block: A, id:
   "dlt_1"}` and `{block: A, id: "dlt_1", part: ["name"]}`, in `group_1`'s
   nothing. A refusal of the store is reported through `onrefuse` with the
   store's own message, exactly once.
4. **The view.** Opening moves the view to the edited element: opening
   `group_1` on a canvas of 10000 × 10000 px shows it at (3685.89599609375,
   4231.328125), zoom 4: block A at (40, 80) is drawn with `recording`'s
   ancestor card reaching 121.70361328125 left of its padding (its frame's
   room and name column; "Show coordinates", `bundle_mixed`'s `score`), so
   its node lies at x −81.70361328125 and `group_1`'s frame, from
   129.70361328125, 561.052001953125 wide, centred at canvas x
   328.5260009765625: `5000 − 4 × 328.5260009765625`; from y 28.8046875,
   166.7265625 high (`bundle_mixed`'s table), centred at canvas y `80 +
   28.8046875 + 83.36328125 = 192.16796875`: `5000 − 4 × 192.16796875`.
   `score`'s card inside it, from y 53.609375, 76.4453125 high, then
   shows at y `5000 − 4 × (80 + 53.609375 + 38.22265625) = 4312.671875`.
   Closing returns it to where each level was entered
   from. A level opened during a move returns to where that move was
   heading. A canvas that changes size centres the edited element again
   (6000 px wide: x `3000 − 4 × 328.5260009765625 = 1685.89599609375`),
   unless the size is the one it was focused at. The pane settles at the
   new size `PANE_SETTLE` later and the block is drawn anew for it
   (`bundle_mixed`'s ancestor card of `recording` is elided at the
   automatic proportion, which reads the pane): in the bundle editor of
   block A, opened at 1600 × 1000 and narrowed to 600 px, the view then
   moves again, to exactly the viewport a double-click on the block
   centres it at once settled (the oracle: the opening's centring run on
   the drawing shown); a view moved by the user before the pane settles
   stays where it was moved, also with full motion while the view is
   still moving to the edited element: in that editor, opened at 1600 ×
   1000 and narrowed to 600 px, a wheel of 40 px right after the
   narrowing pans the view `PAN_SPEED × 40 = 20` px up from where it was
   (the move to the narrower centring is interrupted where it began), and
   the view is exactly there after the pane has settled and 1100 ms more
   (past any move the settling would start). A double-click on the
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
(no other block to snap to), its ancestor card hidden where a test
compares a node position with the stored place, with the canvas at (100, 100), zoom 1, and
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
   stored, exactly (848, 763.53125). Derivation: before the press the
   bounds' corner is A's node position (40, 80) plus `group_2`'s place (8,
   203.53125) (`bundle_mixed`'s table; `dlt_1` only lengthens `excerpt`
   below it), (48, 283.53125). Opening the editor centres `group_2`'s
   frame: jsdom lays the pane out at 0 by 0, so the fitting zoom is 0 and
   is clamped to the focus's least zoom, 0.05, the zoom at the press. The
   frame's place moves by the screen travel divided by that zoom and by
   A's scale 1, (40 / 0.05, 24 / 0.05) = (800, 480), to (808,
   683.53125), quantized to `GRID_FREE` unchanged. Every item stays
   right of and below the block's border, so A's place origin stays (0, 0)
   and its node position (40, 80): the corner is (40 + 808, 80 +
   683.53125). The same press and move ended by Escape, or by a cancelled
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
the drawing of the places stored on release, `group_1` at length 460,
the other items at their drawn positions (`group_2` (8, 203.53125),
`annotations` (8, 381.265625): `bundle_mixed`, "With `recording`'s
ancestor card"). An
item drag of `group_2`, pressed on its frame's own rectangle (the one
element of the node's drawing carrying `data-id="group_2"` and neither
`data-facet` nor `data-part`), reports, before release, the drawing of what the
release stores: `group_2` at (48, 227.53125). Both report `null` once
the gesture ends.

### A transient command (`transient.test.ts`)

The host may hand the canvas a command to show and never store (its
`transient` prop, `{block, command}`: the editor's wedge rotation while
its slider is dragged). What proves it: the node shows the block exactly
as the store would after that command, and the store is untouched; so
the expected drawing is not derived again here but read off a second
canvas mounted on the store that took the same command (core applies it,
layout draws it, both proven in their own suites). Specimen:
`timestamp_wedge_rotation` in block A, its named timestamp `timestamp_1`
turned −135 by a rule addressed to its wedge alone.

- *Shown.* The command `{type: "style", select: {element: "wedge",
  addresses: [{id: "timestamp_1"}]}, set: {rotation: 45}, blocks: [A]}`
  given as transient: the `points` of the node's `polygon` with
  `data-id="timestamp_1"` equal those of the canvas whose store took the
  command, and differ from the stored drawing's; the node's width and
  height are that canvas's too. The store's journal is as long as before,
  its view the same object.
- *Each step.* Handed 46 next, the polygon shows the rotation 46 the same
  way; nothing is journalled.
- *Withdrawn.* `null`: the polygon's `points` are the stored drawing's
  again.
- *Another block.* A transient command for block A whose `style` names a
  block the view does not hold shows block A as stored.

### The coordinate marks and the mode split (`coordinate-marks.test.ts`)

Where a wedge and a cross-section line lie, and how they are styled, is
layout's (`wedgeAt`, `crossSection`, proven there against the drawing
specification); the canvas owns only where it draws them and when. So
what proves the marks is equality with layout's own output, never a
number read off the screen. Block A holds `map` at (40, 80), the view at
(0, 0) zoom 1, one device pixel per CSS pixel; `melody`'s line lies at
y 40.5, its 4 quarters at the abscissa 263.53662109375 and 2 at
163.53662109375 (layout's record, 50 units a quarter), and both are
dyadic, so a pointer there picks exactly 4 and 2. `map` holds the named
timestamps `origin` (`timestamp_1`, at 0) and `length` (`timestamp_2`, at
8) on `melody`, each displaying its wedge and its coordinate label; a
named timestamp added there, given the ID `four`, is "Four" (, at 4, the default
display: wedge, name label, cross-section line).

- **Hover.** With Show coordinates on, the pointer on `melody` at 4
  draws one wedge and the line in the pieces whose attributes are exactly
  those of `wedgeAt` and `crossSection` at 263.53662109375 on `melody`'s
  line key (two: from the card's top 8 to the wedge's tip 42, half the
  line's stroke width 3 below the line at 40.5, and from the wedge's base
  55, 13 further down, to the card's bottom 8 + 67.4765625 = 75.4765625):
  `points` as the writers write points, `fill`; `x1` = `x2`, `y1`, `y2`,
  `stroke`, `stroke-width`, `stroke-dasharray`, no `opacity` (the default
  styles are opaque). They are drawn in an `<svg>` whose `width`, `height`
  and `viewBox` equal the block node's own and whose left and top are the
  node's position, so they are in the drawing's units and scale with the
  zoom as the drawing does. With `four` added, the hovered marks
  equal its drawn wedge's and its two cross-section line pieces'
  attributes, but for where the lower piece starts: the named line's gap
  holds its label stack too (the name label "Four", down to 67.4766), the
  hovered one draws no label, so its gap ends at the wedge's base, 55. With Show
  coordinates off nothing is marked and no flag is shown. A hovered
  position read across its group (`readsGroup` of the reading's pin) is
  marked across the group's frame as a groupstamp's line is drawn: in
  `groups/group_groupstamp`, the pointer on `score`'s line at its middle
  draws, beside the wedge and line, exactly the one line layout's
  `groupCrossSections` gives there (`coordinate-group-line`, its
  attributes those): the frame's span (from the upper border of `score`'s
  card, 32.8046875, to the lower border of `performance`'s, 139.7578125)
  less `score`'s own card (32.8046875 to 82.28125), which its own line
  crosses already, so from 82.28125 to 139.7578125; on `melody` of a block
  without groups, none.
- **Hover and pin on an ancestor line.** An ancestor line draws no
  timestamp and no cross-section line; the mark of a position on it is
  layout's `wedgeAt` there, the ancestor line's mark (layout's README,
  "The marks at any position": on the side away from the member, its tip
  on the line's edge, in the style the cascade gives a wedge of the
  ancestor drawn on that ancestor line, so the default rule that fades
  what lies inside an ancestor line fades it too), so no rule on the
  member's start and end changes it. In `groups/group_parent_both`
  (above, "Show coordinates") the pointer on `piece`'s ancestor line at 8
  (564.0390625, 85.18359375; the line below `middle`) draws one wedge, its
  tip half the line's stroke width 3 below the line, its base 13 further
  down, `564.0391,86.6836 561.0391,99.6836 567.0391,99.6836` as the
  writers write points, fill `#000000` (the defaults' wedge fill) and
  opacity `0.35` (the defaults' rule for what lies inside an ancestor
  line), and no `coordinate-line`; no mark of `middle`'s start is drawn
  there (no line marks a member's start or end, layout's README); the
  flag lists `Middle` above `Piece`, `Piece`'s coordinate `8 ♩` the
  hovered row. With a rule hiding wedges at `middle`'s start (`{element:
  wedge, addresses: [{id: middle, part: [start]}]}`, `display: none`) the
  hover mark is the same. A click there pins `piece` at 8
  (`oncoordinatepin`, the anchor `piece`, handed over with the key of that
  ancestor line), and the pin's mark is the same wedge at the same place.
  What would be wrong: no mark, or a mark that a rule on the member's
  start hides or recolours.
- **The pin's mark follows the place.** The canvas marks a pinned
  timestamp at its place with the root the node's editor raises
  (`pinnedPlace` with `raisedRoot` of the node's block and editor). In
  `group_parent_both` the pin of `piece` at 3 (`timelinePin`, unnamed)
  lies left of the frame (the frame's room, "Show coordinates"): on the
  arranger and with `piece`'s timeline editor open (its card raised) alike
  the pin mark's wedge lies on the card's run at 210.33544921875, its
  points `210.3354,86.6836 207.3354,99.6836 213.3354,99.6836` (the card's
  line at 85.18359375, its markers band below its line), with a
  `coordinate-line`. What would be wrong: a mark on a line the user does
  not see, or none where the card is seen.
- **The flag on the canvas.** The flag's place is `flagPlace` (above) of
  the reading turned into canvas pixels: the node's position plus the
  drawing point, times the zoom, plus the view's offset. Hovering
  `melody` at 4 on a canvas 1000 pixels wide, with the flag 180 wide, `top`
  is `melody`'s cross-section line's top, the card's upper border 8 (below
  it `tempo` at 35 and the line at 40.5): the pole's left edge is the
  node's left + 263.53662109375 − 0.5, its top the node's top + 8 − 22,
  its height 40.5 − 8 + 22 = 54.5; the flag's left edge is the node's left + 263.53662109375 + 0.5,
  its top the pole's. On a canvas 400 pixels wide the flag keeps its side
and is shifted by exactly its overflow: its unshifted right edge, the
node's left 40 + 263.53662109375 + 0.5 + 180 = 484.03662109375, lies
84.03662109375 beyond 400, so its left edge is 400 − 180 = 220, its top
and the pole unchanged (formerly it flipped to the
pole's left, at the node's left + 263.53662109375 − 0.5 − 180). It holds two parts,
  top to bottom as their lines lie (`phrase`'s at 23 above `melody`'s at
  40.5), each part's rows top to bottom as drawn (its maps' band above its
  line by the default band order): `Phrase` (`Ticks` `960 ticks`, then
  `coordinate` `2 ♩`), then `Melody` (`Tempo` `2″` at 35, then
  `coordinate` `4 ♩` at 40.5), and exactly one row is highlighted:
  `melody`'s coordinate, and with the pointer on `tempo` (y 35) `tempo`'s.
  Exactly one row is marked primary (`data-primary`, drawn bold with a
  bar on its left): the coordinate of the timeline read on, the
  timestamp's anchor, whose wedge the mark is: `melody`'s on `melody`'s
  line, `phrase`'s with the pointer on `phrase`'s line (23) at the same
  abscissa. What would be wrong: no row or a map's row marked, or the
  mark staying on `melody` while `phrase` is read.
- **Pin.** Given an unnamed pin at 4 (the one a reading there makes), the
  pinned marks equal layout's at 263.53662109375; the pin replaced by the
  same pin moved to 2 (core's `pinAt`) moves them to 163.53662109375. A
  pin with `named` set, and no pin, draw no pinned marks. A pin read
  across its group (`readsGroup`) also draws the lines layout's
  `groupCrossSections` gives at its abscissa on its line (`coordinate-group-line`,
  their attributes exactly those): in `groups/group_groupstamp`, `score`'s
  pin at its middle draws the same one as the hovered position;
  the same pin read in a timeline editor, and every pin on `map`, none.
- **Pinning.** With Show coordinates on, a press released where it began
  on `melody` at 4 calls `oncoordinatepin` once with an unnamed pin of
  `melody` at exactly 4 and the key of `melody`'s line (the line it was
  read on, which the drawer keeps for the pin and the timestamp named
  from it) and announces `Pinned Melody at 4 ♩`; one 30 below the line,
  where nothing is hovered, calls it with `null` and no line; turning
  Show coordinates off calls it with `null` and no line once more; with
  it off, a click on the line calls nothing.
- **Mode split.** With Show coordinates on, exactly the drawn elements
  that carry an address of a named timestamp (core resolves it to the
  timestamp or one of its parts) carry `pointer-events="none"`, in the
  drawing's order; they are eight, `timestamp_1`'s and `timestamp_2`'s
  wedges and coordinate labels and `four`'s wedge, name label and
  the two pieces of its line (the order among them is layout's); so the browser's hit test
  passes a press on them to what lies beneath (the end-to-end suite
  asserts the hit test). With it off, none do, and the node's element
  tree stays the exported figure's. With Show coordinates off a click on
  `four`'s wedge, name label or line selects exactly `{block: A,
  id: "four"}`, and all of them then show the selection (in drawing
  order, the wedge, the name label, the line's two pieces); a selected name label part
  alone shows it on the label only. A groupstamp's line across the other
  members of its group is the timestamp's line too: in
  `groups/group_groupstamp` the node draws as many lines at `timestamp_1`'s
  address as layout's drawing holds `cross_section` elements there (the
  group's, above and below its label, and its own where it has a length),
  and a click on each selects
  exactly `{block: A, id: "timestamp_1"}`, the primary timestamp.
- **A timestamp that draws nothing.** In `timestamps` (`clt_1`, 8
  quarters over 400 from 49.91552734375) with `display` `[]` set on
  `timestamp_2` ("Climax", at 6 on `clt_1`) the drawing draws no element
  of `timestamp_2` (layout's, so the SVG writer's figure holds no
  `data-id="timestamp_2"`), and the canvas alone draws one
  `.tilie-timestamp-affordance` polygon for it, its `points` exactly
  `wedgeAt` on `clt_1`'s line at 49.91552734375 + 6 × 50 =
  349.91552734375; it carries no `fill` attribute (its light grey is the
  canvas stylesheet's, as every canvas colour is) and no address
  attribute, so it is never counted as a drawn element. `timestamp_1` and `timestamp_3`, which
  display something, get none, and nor does any timestamp of `map`. With
  Show coordinates off a click on it selects exactly `{block: A, id:
  "timestamp_2"}` and it shows the selection; with Show coordinates on it
  lets the pointer through, as every drawn part does.
- **Delete.** With `four` selected, Delete on the canvas removes
  it (one `remove` of `{block: A, id: "four"}`): the block's
  manifest then holds `timestamp_1` and `timestamp_2` only, and the
  selection is empty.
- **Zoom.** The zoom ranges from 0.05 to 256: `+` from 250 is 256 (300
  held), from 2 it is 2.4 (beyond Svelte Flow's default 2), `-` from
  0.055 is 0.05.
- **The canvas's MeasureMaps for others.** The canvas's `knotsOf(manifest)`
  hands out the answers of its one source of expanded MeasureMaps (the
  "Measure maps" rules above), so the editor reads a named timestamp with
  the rows its readings use, and no second request is made. On
  `group_measure_map` with a `measureMaps` that answers one array of rows:
  the first call gives `pending`; a reaction reading it (a derived value
  in the harness) gives that same array once the answer arrives, without
  another call from outside; every later call gives it again; `measureMaps`
  was called exactly once. For a manifest without MeasureMaps (`map`) it
  gives `undefined` and asks nothing; a canvas without `measureMaps` gives
  `undefined` for any manifest.

### Show matches on the canvas (`match-overlay.test.ts`)

The canvas with block A as in "Show matches", the view (0, 0, zoom 1),
the arranger resized to 1000 × 600, one device pixel per CSS pixel.

- **The mode.** The toolbar's "Show matches (M)" button and the key `m`
  (`M` too) toggle it (`aria-pressed`); turning it on turns "Show
  coordinates" off and turning "Show coordinates" on turns it off: one at
  a time. Turning it off calls `onmatchstamppin` with `null`.
- **Without a table.** With `matches` empty and the mode on, nothing is
  drawn and the canvas says nothing itself: no element of the canvas holds
  text about the tables, and nothing is reported through `onrefuse`; what
  is missing is the host's to say (`onmatches` tells it the mode).
- **The overlay.** With T, one `<svg>` for block A whose `width`,
  `height` and `viewBox` equal the node's own and whose left and top are
  the node's position; its one potential path has `d` exactly as in
  "The path", `fill="none"`, `stroke="#C8C8C8"`, `stroke-width="1"`,
  `stroke-dasharray="3 3"`, `opacity="0.7"`; no hovered or pinned path.
  With the mode off, no overlay.
- **Show matches follows the raised card.** The canvas reads each
  block's lines with the root that block's editor raises (`matchLinesOf`
  with `raisedRoot` of the node's block and editor), so it draws and hits
  what the user sees. Block A holds `groups/group_parent_both` at (40, 80)
  with the table P of "Show matches" ("Where a timeline is seen"). At
  the drawing's point (414.0390625, 51.20703125) (the client point
  252.33544921875 further left than block A's position plus that point
  would give: the node lies left of the block's place origin by as much as
  the ancestor card reaches beyond the frame), the card's `middle` row at
  1, which the frame covers, on the arranger the pointer hovers c1 on
  `middle`'s own line (its segment holds the point), MatchStamp 1, whose
  flag lists `Middle` [`1 ♩`], `Piece` [`3 ♩`] and, read by the group on
  the arranger, `Recording` [`1.25″`] (1 of `middle`'s 8 quarters, of
  `recording`'s 10 seconds); with `piece`'s
  timeline editor open (`store.open`, the card raised) the potential path
  holds the card's lines: c4, c5, c6, c7 at 110.3354, 210.3354, 464.0391,
  904.0391, each across the card from 36.207 to 99.5859 (36.20703125 and
  99.5859375 written to four places; c6 on the card's run under the
  frame), then on the card's `middle` row, across the same card, c0, c1,
  c3 at 364.0391, 414.0391, 764.0391 (c2 shares c6's device column in the
  same card, so the card draws one coordinate there, c6, as "What is
  drawn, in view" below draws one per column of a card), then the
  connectors a0, a1, a3 at 67.8965 (the table "Card raised" above), and
  the drawing point (210.33544921875, 80), `piece` 3 on the card's run
  left of the frame (c5), taken through the view and the node's place the
  editor shows, hovers MatchStamp 1, whose flag lists `Middle` [`1 ♩`]
  then `Piece` [`3 ♩`] (`middle` 1 on the card's row above `piece` 3 on
  its line).
  What would be wrong: the canvas drawing as if nothing were raised while
  the card is.
- **Hover and flag.** At (364.0927734375, 40.20703125) of block A the
  hovered path (`stroke="#6E6E6E"`, no opacity) is MatchStamp 0's: its
  coordinates c0, c2, c4, c5 on their lines (c6 has none), then its
  anchors a0, a1, a3 (a4 not drawn); the flag lists `Score`, `Take 1`,
  `Take 2`, `other` with the values `6 ♩`, `176 400 smp`, `264 600 smp`,
  `297 675 smp`, `0.5`, its pole at the node's left + 361.0927734375.
- **Hover cost.** A move from (364.0927734375, 40.20703125) to
  (363.0927734375, 41.20703125), both on MatchStamp 0, calls
  `stampOverlay`, `matchFlag` and `pathOf` 0 times; a move on to
  (264.0927734375, 40.20703125), MatchStamp 1, calls them 1, 1 and 2 times
  (the potential path's lookup and the hovered path), and the potential
  path element stays the same.
- **Device ratio.** At one device pixel per CSS pixel the point 5 right
  of MatchStamp 0's line (c2's) on `score`'s line hovers it (5 ≤ 8); once
  the window's ratio is 2 and the canvas's resolution query reports the
  change, it does not (5 > 4), and the canvas watches `(resolution:
  2dppx)`.
- **Pin.** A click there calls `onmatchstamppin({block: A, matchStamp:
  0})`; a click at (461.0927734375, 70), on nothing, calls it with
  `null`. Given `pinnedMatchStamp` `{block: A, matchStamp: 0}`, the
  pinned path (`stroke="#1BA1E2"`) is MatchStamp 0's, and hovering it
  draws no hovered path; given `{block: A, matchStamp: 1}`, MatchStamp
  1's (c1, c3, a2).
- **The pinned MatchStamp by belief.** With T and the beliefs B, the
  pinned MatchStamp 0 draws three pinned paths, in this order: `true`
  (`#339933`, a3), `undecided` (`#1BA1E2`, its lines and a0), `false`
  (`#E51400`, a1), each `d` as in "The pinned MatchStamp by colour".
- **Named MatchStamps painted.** Each of score, take_1 and take_2 is
  given a child spanning it (`add child`), so every card draws a children
  band (every match timestamp's line is drawn across its card with or
  without one). With T and the
  comparisons of "Named MatchStamps painted", without beliefs: the drawn line of `anchor_1` has
  `stroke="#1BA1E2"`, that of `anchor_2` `#E51400`, the lines of
  `timestamp_1` and `timestamp_3` `#E51400`, that of `timestamp_2` its
  style's `#1BA1E2`, with the mode on or off; with B, `anchor_1` turns
  `#E07000`; with `matches` empty everything keeps `#1BA1E2`. With
  `matchstamp_1` compared with D, its name label keeps its text `Bar 2,
  downbeat (take 1)` with `fill="#E51400"`, and the out-of-date mark is its
  own text `! ` (`.tilie-out-of-date`, `fill="#E51400"`, no address
  attribute, passing the pointer) at the label's baseline and size, its
  `x` the label's start (its anchor `x` less half its measured width) less
  the mark's measured width, so the label keeps the width the layout
  measured; `anchor_1` and the lines of `timestamp_1` and `timestamp_2`
  are `#E51400`. Without a table there is no mark.
- **A match timestamp's line selects its MatchStamp.** With the children
  above and the mode off
  (and "Show coordinates" off), a click on `timestamp_1`'s line selects
  `{block: A, id: "matchstamp_1"}`, and then `anchor_1`'s line and label
  and the lines of `timestamp_1` and `timestamp_2` show the selection; on
  `timestamp_3`'s line `matchstamp_2`; on `timestamp_3`'s name label the
  timestamp `{block: A, id: "timestamp_3"}`, which both pieces of its line
  show too.
- **One table per block.** Block B holds the same manifest at (40, 330),
  so every drawing point of B lies 250 below A's. With `matches` holding
  T for A alone, the mode on: one overlay `<svg>`, A's; B's `anchor_2`
  keeps `#1BA1E2` while A's is red; a click on B where MatchStamp 0 lies
  in A (250 lower) calls `onmatchstamppin` with `null`. With T for both A
  and B: two overlays; that click calls it with `{block: B, matchStamp:
  0}`, the same number A's MatchStamp 0 has; given `pinnedMatchStamp`
  `{block: B, matchStamp: 0}`, B's overlay alone has a pinned path, equal
  to A's MatchStamp 0 path (the drawings are equal), and A's has none.
- **The hovered and the pinned MatchStamp drawn as named.** Block A holds
  `bundles/bundle_matchstamp_groupstamp` at (40, 80) with the table G, as
  in "The hovered and the pinned MatchStamp drawn as named" above. Given
  `pinnedMatchStamp` `{block: A, matchStamp: 0}` (no beliefs: one pinned
  path), its `d` is MatchStamp 0's lines of that table, the four pieces of
  c0 and c2's line across `performance`'s card, each `M x y1 V y2` as "The path" writes it,
  then its one connector, exactly the drawn `anchor_1`'s line (`anchor_1`
  joins `timestamp_1` and `timestamp_2`, the same two places), its ends in
  the other order: `anchor_1` lists `timestamp_2` first, the connector
  runs from its anchor's lower coordinate, c0. The pointer on `group_1`'s `score` line at score 6 (402.29…,
  82.609375) hovers MatchStamp 1, whose hovered path holds c1's four
  pieces and c5's two the same way, and whose flag (no editor open, so
  the groups read) heads Score, Performance, Second half, Score, Page
  over `6 ♩`, `3″`, `0 ♩`, `4 ♩`, `400 px`, `600 px`: `matchFlag`'s runs
  for MatchStamp 1 (above), `score` heading two of them. So a potential MatchStamp shows its
  groupstamps across both frames before it is named, as `timestamp_1`
  does once it is.
- **A length of the group not known, in the DOM.** The same block A and
  table G with `performance`'s length `null` (`set` on its address, as
  "A length of the group not known" above), `pinnedMatchStamp` `{block: A,
  matchStamp: 0}`, no beliefs, the mode on. The overlay holds two pinned
  paths, both `data-belief="undecided"`: the one at the pinned colour
  without an `opacity` attribute (the opacity-1 lines and the connector),
  and a second, after it, with `opacity="0.35"` and `d` exactly
  `M302.2915 125.5859V174.9648`, the `group_1` piece of c0 over
  `performance`'s card, the one place the group gives no value. With both
  lengths known (the oracle, as the bullet above) the overlay holds one
  pinned path and none with an `opacity`. What would be wrong: the overlay
  drawing the opacity-1 path alone, so the piece over the card of unknown
  length is not drawn faded.
- **The mode split.** With "Show matches" on, exactly the drawn elements
  that draw part of a named MatchStamp or of a match timestamp (`ownerOf`
  `match`) let the pointer through: `anchor_1`'s and `anchor_2`'s lines,
  `anchor_1`'s name label, the cross-section lines of `timestamp_1` and
  `timestamp_2` (one piece each) and of `timestamp_3` (two pieces, cut by
  its name label), and `timestamp_3`'s name label; with "Show
  coordinates" on, every drawn element owned by a named timestamp or a
  named MatchStamp does (`ownerOf` not `null`), the MatchStamps' anchor
  lines and name labels among them, as every timestamp part, so that the
  lines beneath them are read; none with both off. With both off, a click
  on `anchor_1`'s line or its name label selects `{block: A, id:
  "matchstamp_1"}`, and then both show the selection.
