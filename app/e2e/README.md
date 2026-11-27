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
`@timetoalign/timetoshare` from a schema package linked from a sibling
checkout instead of the registry; its real directory then lies outside
`app/`, so `run.ts` mounts it as well, read-only and at its identical
absolute path. The links in `node_modules` name it by a relative path,
which the container resolves lexically; when the sibling checkout is
reached through a symbolic link, that path differs from the real one, and
`run.ts` mounts the real directory there too. Like the app's volume each
mount carries podman's `z` option, so on a host that enforces SELinux the
sibling checkout is relabelled for the container to read. With the
registry package (inside `app/node_modules`) the command line is
unchanged. The arguments are built by `container.ts` and pinned in
`tests/README.md`.

`pnpm e2e` runs the `chromium` project only; `pnpm e2e:all` runs
`chromium`, `firefox`, `webkit` and `touch`, as CI does. A spec file name
after either runs that spec alone (`pnpm e2e resize.spec.ts`; with `--`
before it, Playwright ignores the filter and runs every spec).
`TILIE_E2E_WORKERS`, a positive integer, sets the number of workers
(default 4); `run.ts` passes it, and `CI`, into the container when set.

The web server of `playwright.config.ts` builds the editor twice with the
test hook compiled in, both into `packages/editor/dist-e2e` (never `dist`,
the folder the wheel bundles): the page at its root and the embed
(`tilie.js`, `tilie.css`, `assets/`) under `embed/`, then serves the folder
on port 4317.

Two modules hold what the specs share. `schema.ts` loads the schema
package the editor's packages resolve (installed or linked), typed as that
package's own exports (the suite's `tsconfig.json` maps the package for
types only), and gives its directory, its `SCHEMA_VERSION`, the manifest
fixtures of that version, the bundled faces' metrics, the package's own
export the editor draws with, and `validatorDetail`, the message the package's
validator gives for a manifest text, so no spec states the validator's wording.
`support.ts` holds every helper more than one spec uses: opening a fixture,
reading the hook, selecting, closing an editor, the inspector's tabs and
panels, the marks, the points a gesture aims at and the gestures
themselves. A block's drawn structure (frames, cards, titles and lines) is
read from the hook's container records. An address is an object, never a
string composed from IDs: a drawn element is found by `addressSelector`,
which matches each of `data-id`, `data-facet` and `data-part` exactly when
the address states it and requires it absent when it does not (so `{id:
"score"}` never matches `{id: "score", part: ["card"]}`), always inside
the block's drawing (`.tilie-block svg`, since Svelte Flow's node carries a
`data-id` of its own, the block's ID), with every value escaped as a CSS
string; a mark by `marksSelector`, its `data-marks` equal to the marked
element's `addressKey`. Addresses are compared as whole objects or by
core's `addressKey`, never taken apart. The hook's type is the editor's
own, imported, never copied.

## How state is read

- **The store** through the test hook, `window.__tilie` (present only in
  development builds and builds made with `VITE_TILIE_TEST_HOOK=1`, and
  never installed by an embedded editor):
  `store().view` for placements, manifests and block order,
  `store().journal` for the commands a gesture produced, `selection()`,
  `viewport()`, `locked()`, `mode()`, `boxes(block)`, the containers a
  block's drawing records, and `bands(block)`, the bands drawn in a block
  (`bands.spec.ts`). A stored number is compared with
  `toEqual`/`toBe` against a literal; nothing is read back from pixels.
- **Minted IDs**: the store in the page mints the IDs of what a command
  creates at random, so a spec never types one. A command dispatched
  through the hook gives its elements speaking IDs (`ids`), and an element
  a gesture creates is named by the IDs the store journaled with its
  command (`support.ts` `newestMinted`); the fixture workspaces' own IDs
  are the manifests' and stay.
- **The DOM** for what the editor renders: nodes
  `.svelte-flow__node[data-id="<block id>"]` (a selected block's node
  carries Svelte Flow's class `selected`), counted as
  `[data-testid="block"]`, drawn elements inside their node's drawing by
  the attributes of their element address, `data-id`, `data-facet` and
  `data-part` (the part words joined by one space), each present only when
  the address states it (a timeline, group, map, region or flow-control
  element `{id}`, a band `{id: T, facet}`, every card of a timeline `{id:
  T, part: ["card"]}`, the manifest's title `{part: ["name"]}`, a name,
  label or mark `{id, part}`; the block's background carries none), a
  selected part's `[data-selected]`, the overlays, each a `.tilie-mark`
  with `data-mark` (`selection`, `hover` or `holding`), `data-marks` the
  `addressKey` of the element address it marks (`{}` for the block) and
  `data-box` the container it outlines (`block`, `frame`, `card`, `band`;
  none on a boundary's mark), `[data-affected]`, `[data-contains-selection]` on a
  block's node, the mode buttons `[data-testid="mode-scale"
  | "mode-box" | "mode-stretch"]` and the canvas controls' `[data-testid="lock"
  | "marquee" | "coordinates"]` with `aria-pressed`,
  handles `[data-testid="handle-<handle>"]`, guides
  `[data-testid="snap-guide"]`. A refusal of the canvas is information in
  the message bar: `support.ts` `messagesAt(page, level)` gives the cards
  of one level (`[data-testid="message"][data-level=<level>]`) and
  `messageTexts(page, level)` their texts.
- **The shell and the inspector** by role, label or `data-testid`, never
  by an element id: the editor's ids are its instance's own. A tab is found
  by its name in the tab list "Inspector sections" and its panel through
  the tab's `aria-controls`; only the shown panel holds content, so a test
  chooses a tab before it reads the panel. The drawer is
  `[data-testid="inspector"]`, the name of what it inspects
  `[data-testid="inspector-subject"]`, a manifest text's refusals the list
  named "Problems", the Journal's rows as list items and a session's
  disclosure button by its name.
- **Pixels** only in `visual.spec.ts`, tagged `@visual`.
- **Time** only in `budget.spec.ts`, tagged `@budget`; its `≤` comparisons are
  budgets by definition and the only inequalities on measured values in the
  suite.

Every wait waits on state (`expect.poll`, `toHaveCount`, the hook's values, a
requested animation frame); no test sleeps. Pointer gestures move the mouse
in steps (`support.ts`: `drag`, `dragStart`, `dragBlock`). A press on a
block's card selects the card (`{block, id: <root>, part: ["card"]}`), a
press on a group's frame the group (`{block, id: <group>}`), a click on its
margin (the `P` = 8 canvas units outside the card, the block's own
background) selects the block, and a drag from either moves the block. So a
click meant to select a block lands on its margin, a whole-pixel point
inside its node with no drawn element at it or at the eight points 1 px
around it (`marginPoint`, searched pixel by pixel, since the margin is 8 px
wide at zoom 1 and 4 px at zoom 1/2); a drag of a block starts on its card,
a whole-pixel point whose hit element, there and at the eight points 6 px
around it, is the block's card (`cardPoint`, found on a raster across the
node, tenths down and twentieths across, and when no raster point is clear,
every second pixel, rows from the top; `framePoint` searches a named box,
a frame or a card, the same way: a frame's title row, the frame's only
clear strip once its cards cover the rest, may lie between the raster's
rows); a click on an element aims at the centre of its first
SVG part with the mouse (a horizontal line's box has no height, which
Playwright's actionability checks treat as invisible), each coordinate
rounded to a whole pixel (`partCentre`): Playwright hands Firefox and
WebKit whole pixels only, flooring a fractional position, and a floored
centre can miss a one-pixel line. The whole number nearest the centre lies
inside the part whenever any does; a part under a pixel wide, a line
across, may hold none, and the point then lies at most half a pixel from
its centre. The centre is that of the page's own
client rectangle, since WebKit reports a selected label's box elsewhere to
Playwright's `boundingBox`. Svelte Flow starts a
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
`@timetoalign/timetoshare` (its `SCHEMA_VERSION`: manifests of one root at
the top, and the synthetic manifests holding groups in its `groups/` and
`bundles/`, never a `corpus_*` one) and writes it with `writeWorkspace`. The
journal is deterministic: author `"Fixture Generator"`, entry times from
`2026-10-12T09:00:00.000Z`, one second apart. Each `add` gives only `id`,
`manifest`, `x` and `y`, so every other placement member is the workspace
default (`scale` 1, `length` 400, `spacing` 8, `width` and `height` null,
grid 8 with snapping on) and indices ascend in the order of adding.

`node e2e/fixtures/generate.ts` writes the files, `node
e2e/fixtures/generate.ts --check` exits 1 unless every committed `.tle.json`
equals the generator's output byte for byte and no other `.tle.json` is
present. The files are never edited by hand.

| File | Blocks |
|---|---|
| `small.tle.json` | `bare000000` (`bare`) at (0, 0), `nested0000` (`nested`) at (0, 160), `map0000000` (`map`) at (0, 320), `flow000000` (`flow_control`) at (640, 0), `styled0000` (`styled__score`: region `intro`, jump `da-capo` drawn as its symbol, C-Map `ticks`) at (640, 160) |
| `groups.tle.json` | four manifests of one group each: `gchild0000` (`groups/group_child_member`) at (0, 0), `ggrand0000` (`groups/group_grandchild`) at (0, 288), `gmixed0000` (`groups/group_parents_mixed`) at (640, 544), `gstyled000` (`groups/group_styled`) at (640, 0) |
| `bundles.tle.json` | the four named manifests of `bundles/`: `bmixed0000` (`bundles/bundle_mixed`) at (0, 0), `bshared000` (`bundles/bundle_shared_parent`) at (640, 952), `bungroup00` (`bundles/bundle_ungrouped`) at (0, 480), `btwogroups` (`bundles/bundle_shared_member`: `t` a member of `g1` and of `g2`) at (640, 560) |
| `grid-300.tle.json` | 300 `bare` blocks `g000000000` … `g000000299`, block `n` at (512 × (n mod 20), 80 × ⌊n / 20⌋) |
| `grid-900.tle.json` | 900 `bare` blocks, block `n` at (512 × (n mod 30), 80 × ⌊n / 30⌋) |

A block's `(x, y)` is the canvas position of its drawing's place origin,
the point its items are placed from; where an ancestor card (drawing.md
section 8.8) reaches left of or above the frames, the drawing's origin lies
inside it and the block's node starts left of or above `(x, y)` by that
origin (`nodePosition`). Ancestor cards are drawn by default, so the blocks
holding a member that is a child timeline draw their root whole behind the
frame and are much wider than their frames. The positions above are chosen
from the blocks as layout records them (the arranger's `drawingOf` at
layout's default view, the nodes by `nodePosition`, width × height, node
from (left, top) to (right, bottom)) so that no two nodes overlap (the
narrowest gap is the 16.87890625 between `bmixed0000`, whose `annotations`
lies below `recording`'s ancestor card, and `bungroup00`). A wider pane
widens the elided ancestor cards of `gchild0000` and `bshared000` to the
left only; at the 1304.609375 px pane of a page 1920 wide with the drawer
open, and at 1920, every gap is the same. The ancestor lines of a
child member lie below it by default, so no ancestor card reaches above
its frame and every origin's ordinate is 0, and the
member cards grow by 3.40234375 (an ancestor band below a markers band
starts beyond it); the positions above keep every node apart:

| Block | Drawing | Origin | Node |
|---|---|---|---|
| `gchild0000` | 1001.609814453125 × 173.5625 | (447.99018554687495, 0) | (−447.99018554687495, 0) to (553.61962890625, 173.5625) |
| `ggrand0000` | 1052.96923828125 × 207.5390625 | (245.69419642857133, 0) | (−245.69419642857133, 288) to (807.2750418526787, 495.5390625) |
| `gmixed0000` | 1262.9775390625 × 324.515625 | (273.0302734375, 0) | (366.9697265625, 544) to (1629.947265625, 868.515625) |
| `gstyled000` | 546.1240234375 × 257.6796875 | (0, 0) | (640, 0) to (1186.1240234375, 257.6796875) |
| `bmixed0000` | 1067.755615234375 × 463.12109375 | (121.70361328125, 0) | (−121.70361328125, 0) to (946.052001953125, 463.12109375) |
| `bshared000` | 1435.7741210937497 × 519.4765625 | (433.10493164062495, 0) | (206.89506835937505, 952) to (1642.6691894531248, 1471.4765625) |
| `bungroup00` | 527.3271484375 × 249.65625 | (0, 0) | (0, 480) to (527.3271484375, 729.65625) |
| `btwogroups` | 541.83056640625 × 323.9296875 | (0, 0) | (640, 560) to (1181.83056640625, 883.9296875) |

The ancestor cards widen `gchild0000`, `ggrand0000` and `gmixed0000`
(`group_parents_mixed` aligns two cards, so its origin is no dyadic
fraction), and `bmixed0000` and `bshared000`; every other block is drawn as
before. A card reaching across the page's width leaves room beside it for
no other block, so the blocks are stacked: in `groups`, `gstyled000` moves
up beside `gchild0000`, `ggrand0000` 48 down below both, and `gmixed0000`
below `ggrand0000`; in `bundles`, `bshared000` moves below `btwogroups`,
the only block moved. Every frame and member card of `groups` lies inside a
1600 × 1000 page at viewport (40, 40), zoom 1 (the ancestor cards reach
beyond it), and so does every block of `bundles` but `bshared000`, which
lies below it: a spec working on `bshared000` sets a viewport showing it.

The group workspace takes one manifest of each shape the drawing distinguishes:
a member that is a child (one ancestor line and an ancestor card), a
grandchild (two), members under three different roots beside a root
member, and a styled frame. The bundle workspace holds every synthetic
manifest of `bundles/` named above.

After opening, the journal holds one `add` per block (5, 4, 4, 300, 900); a gesture
is proven to be one command by the journal growing by exactly one entry.

### Drawing facts the expected values rest on

A manifest of one root with neither `name` nor `id` is drawn as a block without
a title holding its root in a card (drawing.md section 8): the card spans `x = P = 8` to `R + K` and `y = 8` to
`8 + Hm`, its shadow 2 further right and down, and the block adds `P` beyond
the shadow, so every block is the root's own drawing (sections 3 to 6, the
card's size) plus 18 each way, and its plot origin lies 8 further right.
The blocks and plot origins of the default placement, from `draw` and the
font's advances (they equal the background `rect` of the upstream drawing
fixtures of the installed schema version):

| Manifest | Width | Height | Plot origin (root line start, block-local) | Card (`x`, `y`, `width`, `height`) |
|---|---|---|---|---|
| `bare` | 476.5771484375 | 67.37890625 | 49.5771484375 | 8, 8, 458.5771484375, 49.37890625 |
| `nested` | 477.194580078125 | 95.9765625 | 49.91552734375 | 8, 8, 459.194580078125, 77.9765625 |
| `map` | 490.53662109375 | 85.4765625 | 63.53662109375 | 8, 8, 472.53662109375, 67.4765625 |
| `flow_control` | 518.256591796875 | 106.30078125 | 90.9775390625 | 8, 8, 500.256591796875, 88.30078125 |
| `styled__score` | 528.080078125 | 129.25 | 98.080078125 | 8, 8, 510.080078125, 111.25 |

`width − origin − length` is 27 for `bare` and `map` (the line's 17 to the
card's right edge, `K` 8 and the shadow 2), 27.279052734375 for `nested` and
`flow_control` and 30 for `styled__score`; for every one it does not depend
on the length, so a stretch of the length moves the right edge by exactly
the length change (checked at lengths 400, 420 and 600). A block's
`spacing` is the gap between its block's items at their default `y`
(drawing.md section 8.6); each block of `small` holds one item, so its
spacing changes nothing drawn. A vertical stretch of a container with
exactly one content (a block's one item) sets its `margin` `V` instead,
which lies above the item and again below it: the dragged edge stays under
the pointer at `V = dy / 2` (scale 1, zoom 1), so `nested` stretched by
(200, 51) at its bottom-right corner stores margin 25.5 and by 40 at its
bottom margin 20, its `spacing` staying 8. Only a shrink from margin 0
finds no other value and journals nothing. A frame's spacing is the gap between its cards: `bmixed0000`'s
`group_1` is `158.7265625 + Sf` high (its title's slot 24.8046875, its
cards 76.4453125 and 49.4765625, `Q` 8), so a vertical stretch by 44 sets
its spacing to `8 + 44 = 52`, and a drag of its bottom-right corner by
(40, 20) in Scale scales it by the larger ratio, `(166.7265625 + 20) /
166.7265625` against `(561.052001953125 + 40) / 561.052001953125`, rounded
to 1/2048: 2294 / 2048 (2293.6717117285975 / 2048).

Every block's card rectangle and its shadow carry the address `{id: <root>,
part: ["card"]}` (roots `bare`, `clt_1`, `melody`, `flow:quarters`,
`score`); the drawn texts of `small` are still 23 (a manifest with neither
`name` nor `id` draws no title).

The items of the two bundles with frames lie at their default places
(drawing.md sections 6.4, 6.5, 8.4 and 8.6, at the default spacings), derived from the
fixture and the fonts' metrics table alone. A member drawing is `Hm = y_root + max(Eb,
h(11) / 2) + 8` high, `y_root = max(8 + Ea, 8 + h(11) / 2)`, with `h(11) =
12.8046875` and `h(9) = 10.4765625`. Below every line lie its wedges with
one tier of labels, `1.5 + 13 + 2 + h(9) = 26.9765625` (a boundary's 8 is
less); a stack of `J` maps reaches `1.5 + 5J` above, the maps of a
segment line's plain segments joining its stack after its own (drawing.md
section 6.4); a line with a boundary and one tier of segment labels reaches
`max(1.5 + 5J, 8) + 2 + h(9)` above, 20.4765625 for `J` 0 or 1 and
23.9765625 for `J = 2`; an ancestor row lies below the member's line (the
default band order, drawing.md section 8.3), beyond its markers band, and
is `7 + 7` wide (nothing but its line is drawn on it: no mark of the
member's start or end), so a member card holding one ancestor row ends
`Eb + 4 + 14 + 8` below its line, `26.9765625 + 18 + 8 = 52.9765625`
with one tier of wedge labels. A frame is `8 + h(11)
+ 4 + Hm1 + 8 + … + 8 + Hmn + 8` high; the first item lies at `Pt = 8 +
h(11) + 8 = 28.8046875` below the title, each further one 8 below the one
before, all at `x = 8`.

- `bmixed0000`: `score` (two maps, `Ea = 11.5`; below the wedges, 4 and a
  flow control band holding its jump's symbol alone, the arcs hidden by
  default and the jump having no name or label of its own: its symbol row
  `2 + h(12) + 2 = 17.96875`, the symbol gap on both sides of the glyph
  box, so `Eb = 26.9765625 + 4 + 17.96875 = 48.9453125`)
  76.4453125; `performance` and `page` (one map each) 49.4765625; `excerpt`
  (one map, `y_root = 8 + 6.5`, then `recording`'s ancestor row below
  it) `14.5 + 52.9765625 = 67.4765625`; `annotations` (both regions in one
  row, a regions band `6 + 2 + h(9) + 4 − 4 = 18.4765625` wide, 4 beyond
  the wedges) 71.85546875. So `group_1` is 166.7265625 high at `y`
  28.8046875 and `group_2` 157.7578125 at 203.53125. `recording`'s
  ancestor card behind `group_2` lies from 285.8125 and is 87.453125
  high (the arranger's tests README, "`bundle_mixed`'s `score`", With
  `recording`'s ancestor card: its markers band holds the name labels of
  its derived gaps), ending at 373.265625, below `group_2`'s frame
  (361.2890625); an item lies 8 below every item before it and their
  ancestor cards (drawing.md sections 8.6 and 8.8, No room), so
  `annotations`' card lies at 381.265625 and the block is `8 +
  (381.265625 + 71.85546875 + 2) = 463.12109375` high.
- `bshared000`: `exposition` (two maps, its own `cmap_2` and then its
  segment `exposition_second`'s `cmap_3`, and the boundary of
  `exposition_second`: its line reaches `11.5 + 2 + h(9) = 23.9765625`
  above, its maps and one tier of segment labels, and its conversion maps
  band at level 1 shares that room; `score`'s row below the line) `8 +
  23.9765625 + 52.9765625 = 84.953125`; `take_1` (one map and a boundary: its line
  reaches `8 + 2 + h(9) = 20.4765625` above, its boundary and one tier of
  segment labels, its conversion maps band sharing that room; no
  ancestor) 63.453125; `recapitulation` (no map, so no conversion maps
  band; the boundary of `recapitulation_second` and one tier of segment
  labels: its line reaches 20.4765625 above, and its children band, at
  level 1, starts `B` beyond, at 24.4765625; it holds the segment lines
  `recapitulation_first` and `recapitulation_second` in one row, its inner
  half 8 (their boundaries) and its outer half 20.4765625 (a boundary,
  `recapitulation_second`'s map and one tier of phrase labels), so it ends
  at 52.953125; `score`'s row below the line) `8 + 52.953125 + 52.9765625
  = 113.9296875`; `take_2` (plain) 49.37890625. `exposition`, a child of
  `score`, draws in its member card's flow control band the repeat of
  `score`'s tree lying on its stretch (drawing.md section 6.4, Gathering),
  its symbol row `2 + h(12) + 2 = 17.96875` beyond the band spacing 4, so
  its card is `84.953125 + 21.96875 = 106.921875` high. So `group_1` is
  211.1796875 high at `y` 28.8046875 and `group_2` 204.11328125 at
  `28.8046875 + 211.1796875 + 8 = 247.984375`. `score`'s ancestor cards
  lie from 43.6015625 and 269.7890625 and are 181.3515625 high (`score`'s
  movements in one row of one band order, section 6.4; the schema
  package's drawing `bundle__bundle_shared_parent` draws them at
  `y="43.6016"` and `y="269.7891"`), each inside its frame, so the block's
  origin is the place origin, and `page`'s card lies 8 below `group_2`'s
  frame, at `247.984375 + 204.11328125 + 8 = 460.09765625`; the block is
  `460.09765625 + 49.37890625 + 2 + 8 = 519.4765625` high.

Their widths are those of the names, the ancestor lines' chevrons and the
labels at the lines' ends: maps span their lines (a plain segment's map its
segment, inside its line), and every label the bands add (segment,
phrase, region and jump labels) is centred at least 43
inside either end of its line at every length these tests use, against
half-widths of at most 32.53, so neither the start nor the right margin of
the one horizontal layout (drawing.md section 8.2) moves. Every item of
`bmixed0000` is `161.052001953125 + L` wide (561.052001953125 at 400; the arranger's
tests README, "`bundle_mixed`'s `score`", Widths); in
`bshared000` every member's card is `Wc(L) = 151.39013671875 + L` wide and
every frame and the ungrouped card `16 + Wc(L)`.

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
  `spacing` (a gap) from top and bottom, both from a corner; floors 8 and 0.
- A nudge moves by one grid step (8), with Shift eight steps (64), and the
  result snaps to the grid.

## The bundled faces

A drawn text's width is defined by the drawing: the sum of its code points'
advances in the bundled faces' one advance table (DejaVu Sans's, with Noto
Music's for what DejaVu Sans does not map) times the font size over 2048,
kerning off, a dyadic fraction exact as a double ("Phrase" at 11 px is
(1235 + 1298 + 842 + 1255 + 1067 + 1260) × 11 / 2048 = 37.36669921875).
Each engine stores it in its own precision: WebKit exactly, Chromium
rounded up to its 1/64 px layout unit (37.375). Firefox stores values up to
6e-4 px off by a rule no rounding grid reproduces, so there the expected
width is the same string laid out afresh, after the faces have loaded, in the
same `<svg>` at the same size. The same holds in every engine for a text
holding a music symbol (the Musical Symbols block, U+1D100 to U+1D1FF, drawn
in Noto Music): the table holds Noto Music's advances scaled from its 1000
units per em to 2048 and rounded, while the engine lays the glyph out with
the font's own advance (WebKit reports 𝄆 at 12 px as 555 × 12 / 1000 =
6.66, the table's 1137 × 12 / 2048 = 6.662109375). A text laid out with a
stand-in font fails either way (the fallback gives "Phrase" 34.79). `canvas.spec.ts` and
`visual.spec.ts` require every text to pass.

## The specs

Each paragraph states what the spec proves and where its expected values
come from; the literals themselves are in the spec, each derived from the
fixtures, the drawing facts and the gesture rules above.

**`canvas.spec.ts`** (Chromium, Firefox, WebKit) proves the canvas with the
mouse and the keyboard on `small` at viewport (40, 40), zoom 1, page 1600 ×
1000: opening draws one node per block, the fixture menu opens `small` as
the hook loads it, and every text is in the bundled faces; a drag is one `set`
at the grid- and block-snapped position that the gesture rules give from
the drag's delta, with undo and redo restoring both placements exactly; two
selected blocks move in one command with two changes; a snap to another
block's left edge or plot origin shows one guide at the target; a locked
canvas pans instead and allows no move, nudge or resize; the wheel pans by
half its delta, Shift+wheel sideways and Ctrl+wheel zooms about the
pointer; the marquee selects exactly the blocks wholly inside, keeps its
start while it pans in the edge zone, and its toggle makes plain drags and
clicks additive; a click selects an element, a card (marked by a selection
overlay on the card's own rectangle, never its shadow, and no hover overlay
of its own while it is selected: the pointer resting on `melody`'s card at
`cardPoint`, the first clear point of its raster, marks only the band under
it, `melody`'s children band, since a band is marked on hover in every view)
or, on the margin, the block; Delete and Backspace
remove the selection as one `remove`, a selected timeline marking its
descendants as affected; keys outside the arranger change nothing, arrows
nudge by 8 and 64 and the z-order keys reorder, one command each; the
canvas controls, bottom-left in the pane, are eight buttons on the
arranger, top to bottom Zoom in, Zoom out, Fit to view, the lock, the
Arrange toggle (titled "Arrange the blocks" there), the marquee toggle,
Show coordinates and Show matches, each with its label and its title (the
set `docs/architecture.md` names for the canvas controls), and the arrow
keys move the focus through them in that order, wrapping, without a nudge
or a command; the zoom and fit keys; and the inspector drawer, closed on load
and opening beside the pane without moving the view. Every expected
journal entry is written out whole and compared with the journal.

**`resize.spec.ts`** (Chromium, Firefox, WebKit) proves the three resize
modes on `small` after two moves place `bare` and `nested` clear of every
other block (journal 7, viewport (300, 40)): the keys 1 to 3 and the mode
buttons choose a mode and show its handles (four corners for scale, eight
for box and stretch) and the mode survives a change of selection; for a
table of handle drags in every mode the stored placement is the one the
resize rules derive from the drawn box and the drag, with the opposite edge
exactly put, one `set` at the block (`{block}`) journalled on release and
none for a drag that changes no stored value; box keeps the content's own size below its extent,
a vertical stretch of a block of one item, which has no gap, sets its
`margin` to half the vertical drag (scale 1, zoom 1) and leaves its
`spacing`, a vertical shrink of it from margin 0 journals nothing, a resize held in the edge zone pans and follows the pointer, and
undo restores the placement exactly. On `bundles` a frame's corner scales
the group alone, a frame's vertical stretch by 44 sets its spacing to 52
and states the other items where they are drawn, and a member's card of
`bshared000` (at viewport (40, 40 − 952), which shows that block, placed at
(640, 952) below the others, where (40, 40) showed it at (640, 0)) keeps
its margin in proportion while its group shortens again; the card's place
is stated inside its frame's (`places.group_1.cards.exposition`, beside
the frame's own `length`), and the card is selected by its one address
`{block, id: "exposition", part: ["card"]}`. The card address `{block:
"btwogroups", id: "t", part: ["card"]}` covers both cards of `t`; in the
editor of `g2`, the viewport put back to (−560, −480), zoom 1, after the
editor moved it (the block at (80, 80), clear of the drawer the editor
opens), the resize toolbar acts on the card `g2`'s frame holds: a
box drag of its right handle by 100 takes it from its drawn width
`509.83056640625` (the frame `525.83056640625` wide less 2 × 8 padding,
every card of the block being as wide) to `609.83056640625`, one `set`
entry of the editor's session, the journal unchanged until Done,
stating `places.g2.cards.t.width` alone (the group editor lays no item out
freely), and the card of `t` in `g1` keeps its drawn width: the first
rectangle with the address writes `509.8306`, the last `609.8306`.

**`touch.spec.ts`** (the touch project, Chromium on a Pixel 7) drives real
touch points through the DevTools Protocol, one finger or two, on `small` at
viewport (20, 20). A tap aims 14 px or more away from any other drawn
element, since Chromium moves a tap onto a nearby clickable one, and a
one-finger node drag first travels 20 px past Chromium's touch slop and
counts its delta from there. It proves that a tap selects a card or an
element, a one-finger drag moves a block by the drag in canvas units on the
grid and pans the empty canvas, a pinch zooms, the mode buttons and the
marquee toggle answer taps, a double tap on a card opens its timeline
editor and a double tap on the faded surroundings closes the innermost one,
and a band dragged with one finger moves across its line without panning
the view (`bmixed0000`'s `score`, its `flow_control` band, which holds
its jump's symbol row alone and is `h(12) = 13.96875` high, focused at
zoom 3 so that a point lies the finger's clearance of 14 px inside its
edges, and released above the conversion maps band: one `set` at `{block: "bmixed0000", id:
"score"}` of the order `children, flow_control, conversion_maps, line,
markers, regions`, after which `score` draws flow control at level 2 with
one element, conversion maps at level 1 with two and markers at level −1
with four, its default timestamps `origin` and `length` each a wedge and
a coordinate label, as in `bands.spec.ts`).

**`files.spec.ts`** (Chromium, Firefox, WebKit) takes the fallback path every
engine offers: the pickers are deleted before the page loads, so a file is
read through the file chooser and written as a download. The gate is the
round trip: a new workspace, an imported `bare.yaml` placed at the view's
centre snapped to the grid, a drag and a stretch (three entries), then
Ctrl/Cmd+S, whose download equals the hook's `text()` and clears the
unsaved mark of the header's title ("• untitled" → "untitled", the
workspace's name) and of the page's title ("untitled.tle.json –
TimeLineEditor"), Open of that file, which restores the journal
and the same text, and Save again, which writes the same bytes. Further cases prove that an
opened workspace is fitted while an import (`with_region.yaml`, a manifest
`small` does not hold) leaves the view, that a refused
file is shown with its problem code and leaves the open workspace, and that
the About pane names the editor, the bundled packages and the server
(offline in the test build, where no server answers the health check) and
links a notices file the build serves.

**`open-save.spec.ts`** (Chromium, Firefox, WebKit) proves Open… with a
manifest and Save in place. With the pickers deleted (the fallback path):
`nested.yaml` opened into the new, empty workspace is imported without a
question (one block); `bare.yaml` opened then, the question "Add bare.yaml
to the open workspace, or open it in a new, empty workspace?" is asked:
Add makes two blocks (opening a manifest a block holds already is refused,
`import.spec.ts`); New workspace downloads the unsaved workspace under
`untitled.tle.json` with exactly the hook's `text()` of before, then
leaves one block. With pickers stubbed in the page (an open picker handing
over one in-page file handle holding a workspace file, whose writes are
recorded, and a save picker that records its calls): the opened file's
name is in the page's title, a change (the workspace's rules, no rename)
marks it, Ctrl/Cmd+S writes the hook's `text()` into that handle, clears
the mark and calls no save picker; with the handle's write permission
refused, Ctrl/Cmd+S calls the save picker. Renamed in the header (a click
on the title, "Variations", Enter: the title reads "• Variations"),
Ctrl/Cmd+S calls the save picker once and writes nothing into the opened
handle, but the hook's `text()` into the picked one.
**Through the server's files** (the health route and the file routes
answered in the page: the folders `story` and `work` at the root,
`story/step1.yaml` the table fixture's manifest named LayerIt naming
`step1.match_claims.parquet`, which `story` holds too; every read and
write recorded; the table route replayed from the client's recording):
Import manifest… opens the file dialog "Open", its list "Contents of the
root folder" focused and showing `story/`, `work/`; ArrowDown and Enter
open `story`, ArrowDown and Enter take `step1.yaml` (one block).
Ctrl/Cmd+S opens "Save as" offering `untitled.tle.json`; Root, a
double-click on `work/`, the name `layerit` and Save write exactly one
file, `work/layerit.tle.json`, whose `settings.manifests` entry of the
block holds the location `../story/step1.yaml`; the page's title is then
"layerit.tle.json – TimeLineEditor". Renamed "LayerIt" in the header,
Ctrl/Cmd+S opens "Save as" offering `LayerIt.tle.json`, and Cancel writes
nothing. Saved into `story` as `layerit`, the page reloaded and the file
opened through Open… (a double-click on `story/`, then on
`layerit.tle.json`), the toolbar's Show matches reads exactly one file,
`story/step1.match_claims.parquet`, sends one table request and opens no
dialog.
**Save as… and Save by path** (the same server): `step1.yaml` imported from
`story`, the File menu's "Save as…" opens "Save as" in `story` (the folder
of the last file chosen) offering `untitled.tle.json`; the name `first`
and Save write exactly `story/first.tle.json`, holding the hook's `text()`
and the block's location `step1.yaml` (the manifest beside it), and the
page's title becomes "first.tle.json – TimeLineEditor". A change (the
workspace's rules) marks the title "• first.tle.json"; the File menu's
Save then writes `story/first.tle.json` again with the new `text()`,
opens no dialog and clears the mark. "Save as…" again offers
`first.tle.json`; Save asks "Replace first.tle.json?" once, Replace
writes the same path, and the next change's Save writes it once more,
asking nothing. Renamed "Second" in the header, the File menu's Save
writes nothing but opens "Save as" offering `Second.tle.json`, whose Save
writes `story/Second.tle.json`, the title then "Second.tle.json –
TimeLineEditor".
**Accessibility of the file dialog and the title** (the same server, a
fresh page each, an empty workspace): axe-core reports no violation in
"Open" with `story/` chosen by ArrowDown in the root's list and, after
Enter, in the list of `story`; in "Save as" at the root with the name
`a/b` refused ("A file name holds no /."); in "Save as" showing `story`,
which holds no workspace file, so its list has no option; in the
question "Replace first.tle.json?" asked when "Save as…" offers the file
just saved at the root; in the tables dialog asking where the MatchClaim
table lies (`step1.yaml` imported, the read of
`story/step1.match_claims.parquet` answered 404, Show matches turned on:
the dialog "step1.match_claims.parquet is not beside …" with its
"Locate…" button); and on the header's title after the rename "Second"
(the button "• Second" followed by the muted "— first.tle.json") and with
its field refusing an empty name (`aria-invalid`). In the folder without an
option the list holds no item, and the dialog's one status, the note
"Nothing to show here.", stands in the list's place: drawn inside the
list's frame where its first entry would stand, its box 1 px right of and
below the list's top left corner and within the list's box. In the
document the note follows the list box, which owns options only.

**`import.spec.ts`** (Chromium) proves that a manifest is imported once and
that a reload keeps the server connection. With the pickers deleted:
`flow/virtual_cards.yaml` imported (it has no `id` and no `graphical`, as
the fixtures imported by hand have none), the selection emptied and the
same file imported again, the journal stays at one entry and one block,
the imported block is selected again and one warning reads exactly
`virtual_cards.yaml was not imported: the workspace holds it already, in
the block "Virtual cards", which is now selected.`; `bare.yaml`, another
manifest without an `id`, is then imported (two entries). By `id`:
`statements/op106_work.yaml` imported (three entries), then the same file
with its `name` changed to "Op. 106, revised", which is still the manifest
`op106`: refused (three entries), its block selected, the warning naming
the block by its name, "Beethoven, Piano Sonata No. 29, Op. 106". A
refused import leaves the open editors open: `flow/virtual_cards.yaml`
imported and its bundle editor entered, the same file refused leaves that
editor the one open, one journal entry and one block, the block selected
and the same warning; `bare.yaml` then imported is added (two entries, two
blocks) and leaves the editor first (none open); the bundle editor of
`virtual_cards` entered again and `bare.yaml` imported once more, it is
refused with the warning `bare.yaml was not imported: the workspace holds
it already, in the block "Anonymous bundle".` (an editor keeps no
address of another block, so the holder is not selected and nothing is),
the editor still open, two entries and two blocks. The
connection: the server stubbed in the page's routes answers the health
check only with `Authorization: Bearer e2e-token`, else 401. Opened at
`/#token=e2e-token`, the health arrives (the hook's `health()` is the
answer), the address is the page's root without a fragment, the tab's
session storage holds the token under `tilie.token` and its local storage
nothing under that key; reloaded, the health arrives again, no "offline"
mark is shown, the address is still the root and every health request
carried `Bearer e2e-token`. A second tab of the same browser context,
opened at the root, has no token (its health request carries `Bearer`,
the empty token's header as the browser trims it)
and shows the "offline" mark: the token belongs to the tab it was handed
to.

**`matchclaim-loading.spec.ts`** (Chromium) proves that Show matches loads
the MatchClaim table a manifest names while a server answers, and asks
nothing while none does. The stubbed server is `tablesServer.ts`'s,
which `a11y-panels.spec.ts` shares. The table route is replayed from the
client's recording (`match-claims.answer.bin`, `rows` read from its
header); the health check is stubbed, answered (`{name, version,
timetoalign}`) with the user's files on the server stubbed too (`story/`
holding the table fixture's `manifest.yaml` alone, `other/` its
`match_claims.parquet`), refused with 503, or held until the test answers
or refuses it. Answered: the table fixture opened from the Fixture
menu, its table served beside it, loads it on the `m` key without a dialog
and with one table request; the same manifest imported from `story/`
through the file dialog, Show matches (its toolbar button) opens
"match_claims.parquet is not beside The manifest, at story/manifest.yaml"
with one group, "MatchClaim table match_claims.parquet", Load disabled
until something is entered, and Locate… then `other/match_claims.parquet`
in the file dialog loads it with one request; a URL entered is fetched
once and loaded; Cancel loads nothing and adds exactly one message, the
information "No MatchClaim table loaded.". "Load
MatchClaims…" in the Matchstamp tab's MatchClaim filter, on the same
imported manifest with Show matches off, opens "Load the MatchClaim table
of The manifest" with the same group and loads the located table with one
request (no file picker of its own). Each loaded table's status line in
the Matchstamp tab reads "match_claims.parquet: <rows> MatchClaims".
Refused (the header's offline mark titled "The server did not answer the
health check (503 Service Unavailable)."), with the Fixture menu's table
fixture open and no message shown: `m` turns Show matches on, opens no
dialog, requests no table, and adds exactly one message, the information
"Matches need a running tilie-server. To start it, run uv run tilie
--static-dir ../app/packages/editor/dist in the repository's server
folder (or tilie, once installed with pip install tilie-server), then
open the editor at the address it prints." (the how-to); the Matchstamp
tab's table status reads "No MatchClaim table loaded."; "Load
MatchClaims…" is disabled, its accessible description that failure
followed by the how-to. **Beside a warning** (refused, the same fixture
open, the hook asked to select `{block: "nothing", facet: "markers"}`,
which posts the warning "Some addresses could not be selected."; the
page's clock installed and paused): `m` adds the how-to as information
with the level word "Info", the warning keeping "Warning", neither card
with a `role`; the bar's status announcer (`messages-status`) reads
exactly "Info: " and the how-to, and its alert announcer (`messages-alert`)
exactly "Warning: Some addresses could not be selected."; both cards are
visible, the information's card's top at or below the warning card's
bottom (no overlap), the information's border and background
`rgb(122, 167, 217)` and `rgb(238, 245, 253)`, the warning's
`rgb(201, 162, 39)` and `rgb(255, 248, 225)`. The clock run 1 ms less
than the how-to's reading time on (the editor's `infoDurationOf`, read
by the spec, never a number of its own), the information is still shown;
1 ms more, it is gone and the warning stays, still after 60 000 ms more.
Held, with the same fixture open: `m` turns Show matches on and adds no
message (no offline mark either: nothing has failed), requesting no
table; once the check is answered, without another key, the table is
requested exactly once, the one new message is "Loaded the MatchClaims
of match_claims.parquet." and no dialog opens. Held, then refused
instead: `m` adds no message; once the check is refused, without another
key, the offline mark appears and exactly one message is added, the
how-to as information; no dialog opens, no
table is requested, the table status reads "No MatchClaim table loaded.",
and "Load MatchClaims…" is described by the failure and the sentence on
starting a server, no further message appearing. `open-save.spec.ts` proves the
table read beside the manifest.

**`inspector.spec.ts`** (Chromium, Firefox, WebKit) opens the drawer on
`small` with `bare` selected, at zoom 1. The manifest text: a YAML edit is
applied as one `set` of the manifest and undone by Undo; a refused edit
shows its code, message and JSON pointer in the list "Problems" and keeps
the text. A block without a manifest file of its own opens with Minimal and
Include styling checked, so `bare`'s text, before the refused edit, equals
the schema package's fixture `bare.minimal` in pretty JSON
(`dumps(loads(fixture), {serialization: "json"})`); the edit states
`"locked": "yes"` on the root timeline, refused at `/timelines/0/locked`
with the message the schema package's validator gives for that text
(`validatorDetail` in `schema.ts`, never a literal). For the complete and the minimal form, with the styling excluded
or included, the text shown equals the schema package's fixture file in
that form (without `graphical` unless included), Apply and Revert are
enabled exactly while it differs, the form options are locked meanwhile,
Apply stores the renamed fixture as `loadManifest` reads it, and an
unapplied text survives a visit to another tab. The tabs: each is paired
with one panel of its own through `aria-controls` and `aria-labelledby`,
and the arrow, Home and End keys move the selection and the focus over the
nine tabs (the level tab, Properties, Regions, Metadata, Manifest, Journal,
Timestamp, Matchstamp, Elisions) with and without an editor open, each key
followed by one polled reading of every tab and its panel (text,
`aria-selected`, `tabindex`, focus, the panel displayed as `toBeVisible`
reads it), so the seventeen keys stay well inside the time limit in every
engine; with the level tab chosen,
entering the bundle editor keeps it shown, renamed from "Arranger" to
"Bundle". The properties form: a value moves the block by
exactly that amount, the fields follow a drag and a resize live (rounded to
two decimals) and show the stored values afterwards, an arrow-key step applies
at once as one command, Escape restores the stored values, and on
`bundles` the form edits a frame's and a card's places, never the block's,
following a frame's Stretch live in the bundle editor; every `set` the
form journals aims at an address object, `{block}` for the block's own
placement, `{block, id: G}` for a frame's group and, through its `cards`,
for a member's card in that frame (`score`'s width 650 is `{cards: {score:
{width: 650}}}` at `group_1`), and `{block, id: T}` for an ungrouped
root's card (`annotations`). The
heading names what is inspected: a timeline, a bundle, a group, a card's
timeline (a press on `bare`'s card selects `{block: "bare000000", id:
"bare", part: ["card"]}`), and the anonymous bundle of a manifest without
a name (a press on the margin selects `{block: "bare000000"}`). The wedge's
rotation: with `bare`'s named `origin` (`timestamp_1`, its wedge displayed,
no rule) selected, the Timestamp tab's slider "Wedge rotation" reads "0
degrees"; PageUp on it journals one command and `bare`'s rules become
exactly the one rule `{select: {element: "wedge", addresses: [{id:
"timestamp_1"}]}, set: {rotation: 45}}`, and the drawn wedge's `points`
change; the stop "−135 degrees" journals one more command, the rule
stating −135, the stop pressed; axe-core reports no violation in the
control; Default journals one more, leaves `bare` without rules, hides
itself, and the wedge's `points` are those it was drawn with before.
A drag of the slider with the mouse, which only a browser can drive (its
`input`, `change` and release in their real order), is shown on the canvas
while it moves and stored once: the mouse pressed on the thumb (at 0, the
track's middle) and moved three quarters of the way along the track turns
the drawn wedge (its `points` differ from the unturned ones) while the
journal and `bare`'s rules stay as they were; Escape then draws the
unturned wedge again and sets the slider back to "0 degrees", and moving
on and releasing changes neither the wedge, the slider, the journal nor
the rules (Firefox ends a native range drag on the release by setting the
value at the pointer and firing `input` and `change`; the control ignores
them in a drag Escape ended). A second such drag turns the wedge before the release and
journals exactly one command on release, the rule stating the slider's
value then (read from the slider, a pixel's value being the browser's
own), and the wedge keeps the `points` it showed before the release.
A selected stored elision selects the Elisions tab: with the drawer
remembered open and Properties shown, `bundle_elisions_stored` imported,
a click on the name label "Development" of `elision_5` (the only part it
draws; the canvas is moved so that the label's centre lies at (400, 400)
on it, left of the drawer, the centre read from the page's own client
rectangle, `partCentre`: WebKit hands Playwright's `boundingBox` this
label's box 1,500 px left of where it is drawn, so a click there pressed
the block's rectangle) selects exactly `{block, id: "elision_5"}` and shows
the Elisions tab, its form's block expanded; Properties chosen then
stays, and stays once the selection is emptied. Selected again, the
elision shows the Elisions tab again, which stays when the selection is
emptied: nothing goes back to the tab shown before.

**`regions.spec.ts`** (Chromium, Firefox, WebKit) proves the Regions tab
and the band list in a browser, on TimeToShare's `styled_score_flow_inner`
imported (root `score` with the region `intro`, 0 to 2 quarters; children
`a` and `b`), its child `b` given the region `motif` (1 to 3) by one `add`
with the test's own ID, the card of `score` selected through the hook. The
tab list holds Regions right after Properties. On the Regions tab: the
rows `intro` and, under the heading "b", `motif`, each with its Name,
Start and End ("intro", "0", "2"; "motif", "1", "3"); a click on the head
of `motif`'s row selects exactly `{block, id: "motif"}` on the canvas and
marks the row (`aria-pressed` "true"), the list kept as it was (both rows,
the heading "b"), since a selected region of the listed timeline or of one
of its descendants keeps the list; in that list, `motif` still selected,
"Intro" typed into `intro`'s Name and Enter journals one `set` of `{name:
"Intro"}` on `intro`'s address, the selection and both rows unchanged; "3"
typed into its Start and Enter journals nothing, the field `aria-invalid`
"true" and core's message "region 'intro' ends before it starts" below
it; Escape shows "0" again; Remove on `intro` journals `{type: "remove",
targets: [{block, id: "intro"}]}`, the row gone. On the Properties tab
with the card of `score` selected: the table "Bands" lists Children,
Markers, Conversion maps, Flow control and Regions (the band order the
fixture states), every box checked; unchecking Regions journals `{type:
"style", select: {element: "band", addresses: [{id: "score", facet:
"regions"}]}, set: {display: "none"}, blocks: [block]}`, the box then
unchecked, and the hook no longer records `score`'s regions band (a band
not displayed is absent); checking it again journals the same selector
with `{display: null}` and the band is recorded again.

**`controls.spec.ts`** (Chromium, Firefox, WebKit) proves the band list's
Visible control reaching one timeline or its tree (the editor's README,
"The band list"), every box enabled, on fixtures of Beethoven's Op. 106's
shape: a root holding no regions and no conversion maps whose children
hold them, the children's regions atomic sections, which the defaults
hide. (Op. 106's own manifest lies in a dataset repository outside the
app directory, the one the browsers' container mounts, and is not this
repository's to copy.) The line of the root is selected through the hook
and the inspector opened on Properties.
- On `unknown_length_child` (root `score`, its child `movement` holding
  `region_1`), the region made an atomic section by one `set` of its
  `statements` (`{type: [<the full IRI of tts:AtomicSection>]}`): `score`'s
  "Regions visible" is enabled and not checked (its band, displayed by the
  initial value alone and drawing nothing, is absent), "Regions with its
  descendants visible" enabled, not checked and not indeterminate (no band
  of the tree shows: `score`'s is absent, `movement`'s shows none of its
  regions), and `region_1` is not drawn. One click on the tree's box
  journals one entry, one session of two commands, after which the
  manifest's rules are, in order, `{select: {element: "band", facet:
  "regions", within: "score"}, set: {display: "inline"}}` (which shows
  `score`'s empty band explicitly) and `{select: {element: "region",
  within: "score"}, set: {display: "inline"}}`; the tree's box is then
  checked, not indeterminate, the own box checked, `region_1` drawn (one
  element carrying its address) and the hook records `score`'s regions
  band. A second click journals one more entry (the bands' rule `within`
  `score` `{display: "none"}` and that region rule removed, one session),
  the rules then that one bands' rule alone; both of `score`'s Regions
  boxes are then unchecked, `region_1` is not drawn, and the hook no
  longer records `movement`'s regions band.
- The same two presses inside the open timeline editor of `score`
  (opened through the hook): the first adds one entry to the editor's
  session, the second exactly one more (its two commands one step,
  `region_1` no longer drawn); one Ctrl+Z (Cmd+Z) on the arranger then
  leaves one entry and the very view after the first press (its JSON
  text), the tree's box checked and `region_1` drawn again.
- On `map_row_moved` (root `piece` holding no map, its children `ante`
  with two maps and `cons` with one), `piece`'s "Conversion maps visible"
  is enabled and not checked (its empty band is absent) and its tree's box
  not checked, indeterminate (the children's bands show their maps); the
  hook records one conversion maps band of `ante` and one of `cons`. In
  order, each click journaling one entry:
  - the tree's box clicked → `{select: {element: "band", facet:
    "conversion_maps", within: "piece"}, set: {display: "inline"}}`, which
    shows `piece`'s empty band explicitly; both boxes then checked, both
    children's bands recorded;
  - clicked again → the same selector with `{display: "none"}`, after
    which neither child's band is recorded and the own box is unchecked
    (the rule `within` `piece` reaches `piece`'s own band too);
  - clicked again → `{display: "inline"}` (without the rule `piece`'s band
    would be absent), both bands recorded again, the own box checked.
- On `unknown_length_child` as written, `score`'s own Regions box is
  enabled and not checked (the band is absent), the hint "Timeline
  'score' holds no regions; its descendants hold some." in its row:
  checking it journals `{element: "band", addresses: [{id: "score",
  facet: "regions"}]}` `{display: "inline"}`, the box checked and the
  hook recording `score`'s regions band; unchecking it journals the same
  selector with `{display: "none"}` (without it the band is displayed by
  the initial value), the box unchecked and still enabled, the band no
  longer recorded.

**`empty-band.spec.ts`** (Chromium) proves that a band shown explicitly
that draws nothing, an empty band (TimeToShare's `docs/drawing.md`, section
6.4, Empty bands), is drawn where the pointer finds it, on
`unknown_length_child` as `controls.spec.ts` imports it, the shape of Op.
106: the root `score` holds no region, its child `movement` holds
`region_1`. The view is `{x: 40, y: 40, zoom: 1}`, so the hook's client
rectangles are the drawing's units. Before any rule the hook records no
regions band of `score`; its markers band (two wedges and their coordinate
labels, 4 elements) lies at level −1 from its line to `w / 2 + 13 + 2 +
h(9) = 26.9765625`.
- The rule the band's Visible box writes to show it, `{element: "band",
  addresses: [{id: "score", facet: "regions"}]}` `{display: "inline"}`,
  sent as one `style`: the hook records `score`'s regions band at level
  −2 holding 0 elements, its rectangle from `30.9765625` (`26.9765625 +
  S`) below the line, `Wb = 6 + 2 + h(9) = 18.4765625` high. The pointer
  moved to a point inside it (`bandPoint`, clear of every drawn element)
  marks that band alone on hover; a double-click there opens the timeline
  editor of `score` (`[{target: {block, id: "score"}, kind: "timeline"}]`).
  In it, the Regions tab's Add region adds one region into `score` (the
  editor's session, journalled when it closes): the root then holds one
  region, which is drawn (one element carries its address), and the band
  holds 1 element and keeps its place and width (`30.9765625`, `Wb`): the
  first region, its label in tier 1, makes a regions band of one row and
  one label tier, which is `Wb` wide.
- The press: `score`'s own "Regions visible" box reads
  unchecked and enabled while the band is absent (displayed by the initial
  value alone, drawing nothing); one click journals that same rule with
  `{display: "inline"}`, the box is then checked, and the hook records the
  empty band as above.
- The two boxes of a row are drawn as one control, its face and edge in the
  editor's flag colours, which the editor's root defines for the canvas and
  the inspector alike (`--tilie-flag-background` `#fff`,
  `--tilie-flag-border` `#c8c8c8`): on `unknown_length_child`, the Regions
  row's control (the box's `.reach` parent) computes `background-color`
  `rgb(255, 255, 255)` and a `1px` `solid` border of `rgb(200, 200, 200)`
  on every side, and its tree box's label a `1px` `solid` inline-start
  border of `rgb(200, 200, 200)`, the divider between the two boxes.
  Without the definitions the face computes transparent
  (`rgba(0, 0, 0, 0)`) and the edge `currentColor`, which the test refuses.

**`elisions.spec.ts`** (Chromium, Firefox, WebKit) proves that an
elision added through the Elisions tab, as a viewer adds it, is drawn on
the timeline, on a virtual timeline's placed card and on a virtual group
member. What would prove it, and why a weaker test would not: layout,
the writers and the arranger's motion each draw such an elision in their
own tests, so only the whole path of the built app can fail: the click
selecting the card (`framePoint`, the selection then exactly the card's
address), the tab's block opened by its disclosure button, its Add
elision, the store, the drawing the canvas shows and the page. After the
press exactly one command is journaled, an `add` into the card's virtual
timeline at the stretch the tab derives (below), with one minted ID `E`;
then the drawing the arranger gives of the stored block at the canvas's
pane (`drawingOf`, as `settledDrawing` computes it, once the page shows
that drawing) holds exactly three elements of `E`, in drawing order: its
gap `{id: E}` (an `elision`), its ellipsis `{id: E, part: [ellipsis]}`
and its name label `{id: E, part: [name]}` (an added elision states no
`display`, so it draws `ellipsis` and `name`, the name its timeline's);
and the page draws that ellipsis visibly, with a box of positive width and
height. Cases:

1. `flow/virtual_cards` with `allegro_default` "Allegro, default"
   (fraction quarters, 4241/2, its FlowMap `default` A B A C: no run)
   placed at (0, 200) by one `set`: Add on its card is `{start: [4241,
   6], end: [4241, 3]}`, the middle third of its played axis.
2. The same block, the flow editor opened by a double-click in
   `allegro`'s flow control band, the row `by_hand` dragged by its name
   below the pane (its FlowMap already has a virtual timeline,
   `allegro_by_hand` "Allegro, practice", so the drop places that card),
   the editor closed: the block places `allegro_by_hand`. Its FlowMap
   plays A four times (each 953/2), a gap of 4 and C (1144), 3054 in all;
   the four A's are one run drawn once (drawing.md section 8.10, Runs), so
   the card draws nothing of 953/2–1906. Add is `{start: [6866, 3], end:
   [8014, 3]}`, the middle third of 1906–3054 (the gap and C), the
   longest stretch the card draws; the middle third of the whole axis,
   1018–2036, would lie in the run gap but for its last 130 ♩, a piece
   narrower than 20 in the card. That elision, added by one `add` of
   `{start: 1018, end: 2036}`, is drawn too: a stored elision's gap draws
   its ellipsis whatever its width (drawing.md section 6.6), so its gap,
   ellipsis and name label are the drawing's three elements of it and the
   page shows its ellipsis.
3. `groups/virtual_member`: the virtual member `allegro_default`'s card
   in the frame of `performance` "Performance" clicked, the group's
   block's Add is the same `{start: [4241, 6], end: [4241, 3]}` (a group
   elision, drawn across the frame once).
4. The same fixture, the frame `{id: performance}` clicked: Add goes into
   the frame's first member in display order, `allegro_default`, with the
   same stretch, drawn alike.
5. A root drawn once behind a row (drawing.md section 8.8, Drawn once:
   a once card reads no elision property but `elision-display`, so it
   draws no card elision): `bundles/bundle_arranged_roots` arranged
   `{direction: horizontal, order: [page, group_3, group_1, group_2]}` by
   one `set`, the canvas at zoom 0.5 so that the row lies inside the
   window, `take_b`'s card clicked (its root `session`, 130.0 s, drawn once
   behind `group_1` and `group_3`). The timeline's block offers no mode:
   no radio, in their place the line "Drawn once behind the row: its
   elisions are not drawn while the bundle is arranged side by side.",
   "Gaps between groups" listing `between "Exposition" and
   "Recapitulation" 33″–44″`. Add stays: the once card is the ancestor
   card behind the row's first group, `group_1`, whose anchor `take_a`
   covers 0.0–30.0, so Add is `{start: 63.333333333333336, end:
   96.66666666666667}` into `session`, the middle third of 30.0–130.0 as
   binary64 (`session` is float). Then the summary reads "Drawn once, 1
   elision", the row carries the note "not drawn while arranged side by
   side", and the drawing holds no element of it. The arrangement set to
   `null` (free) by one `set`, each of `session`'s two ancestor cards
   (behind `group_1`, whose anchor covers 0.0–30.0, and behind `group_3`,
   100.0–130.0, neither touching 63.3–96.7) draws it under the initial
   `custom`: its gap, ellipsis and name label twice, in that order, and the
   page shows the ellipsis.

**`elision-tab.spec.ts`** (Chromium, Firefox, WebKit) proves that an
elision selected by a real pointer click on the canvas brings the Elisions
tab forward, whatever the inspector showed before, for both kinds of
elision and every part of one a viewer can click. What would prove it, and
why a weaker test would not: the click is the mouse's, at the centre of
the drawn part, never the hook's `select`, since the press rule
(`pressedIn`, which maps a part to its elision's own address) and the
drawer being told of the selection are the path under test. An elision
draws its ellipsis once in every card it crosses, and a member card covers
a group's ellipsis drawn in the ancestor card behind it, so the click aims
at the first drawing of the part the pointer reaches: each in turn is
moved, with the mouse resting outside the canvas (no hover mark over it),
so that its centre (its client rectangle's, rounded as `partCentre` does)
lies at (400, 400) on the canvas, left of the drawer, and it is clicked
where the page's `elementFromPoint` there is that drawing itself, so that
the click cannot land on the drawer, a card or a frame instead. After the click the selection is
exactly the elision's own address (`{block, id: E}` stored,
`{block, id: T, part: ["elision"]}` automatic), the Elisions tab is
selected and its form's block (`elision-form-expand`) is expanded. The
hook only sets up (a selection emptied between two clicks on parts of one
elision, since the tab follows a change of the selection only; a style or
an elision added by a command; an editor opened). The page is 1920 × 1080,
so the automatic proportions are those of a wide canvas.

1. *Automatic elisions*, the end-to-end workspace `e2e/groups` opened from
   the header's Fixture menu exactly as a viewer opens it (its blocks hold
   no stored elision: `elisions: []` in each), its ancestor cards in
   `ggrand0000` and `gmixed0000` given the mode `auto` by one `style`
   command (`{select: {element: ancestor_card}, set: {elision-mode: auto}}`;
   the initial `custom` derives no elision, drawing.md section 2.5), so the
   automatic elisions are the ones they derive: the drawer opened and
   Properties chosen before each click, a click on the ellipsis and on the
   name label "Score" of `score`'s automatic elision in `ggrand0000`, on
   the ellipsis of `movement`'s there and of `session`'s in `gmixed0000`,
   and, once a rule on `score`'s card (`elision-display: ellipsis name
   coordinate`, one `style` command) draws it, on the coordinate label
   "0–16 ♩" of `score`'s.
2. *Stored elisions*, `bundle_elisions_stored` imported, the same starting
   state: the ellipsis, the name label "Appendix" and the coordinate label
   "600–1 754 px" of `elision_2` (on `page`), the ID label "elision_4" of
   `elision_4` (on `score`) and the ellipsis of `elision_3`, a group
   elision drawn in `group_1`'s frame.
3. *A pin held*: `e2e/groups` opened as in 1 (the same `auto` rule), a
   click on a named timestamp's wedge (`timestamp_3` in
   `ggrand0000`; `timestamp_7` in `bundle_elisions_stored`) shows the
   Timestamp tab with the timestamp's name header (`timestamp-name`); a
   click on an elision (`score`'s automatic ellipsis; `elision_2`'s) then
   shows the Elisions tab, and the pin is let go: the selection emptied
   leaves Elisions shown (nothing goes back to Timestamp), and Timestamp
   chosen then shows no name header.
4. *A MatchStamp shown*: `group_child_member_stamps` imported, whose one
   MatchStamp "Middle, bar 3" has the alignment anchor `anchor_1`; a click
   on the anchor's name label "Middle, bar 3" (which covers the middle of
   its line) shows the Matchstamp tab with the MatchStamp's name
   header (`matchstamp-name`). Automatic: a rule on `piece`'s card
   (`elision-mode: proportional`, `elision-proportion: 0.25`) makes the
   ancestor card draw `piece`'s automatic elision; stored: `add` puts
   `gap` "Gap" (the ID the command gives) on `middle` from 5 to 7 quarters, a group elision of
   `group_1`. A click on the elision's ellipsis shows Elisions and lets the
   MatchStamp go: the selection emptied leaves Elisions, and Matchstamp
   chosen then shows no name header.
5. *An editor opened while the drawer is closed.* What the tab rule
   implies: an elision selected acts as a choice of the Elisions tab made
   at that moment and never opens a closed drawer, and a drawer shown
   again shows the level tab only when an editor opened since the tab was
   last chosen; the editor opens the drawer itself when the first editor
   opens. So, on `bundle_elisions_stored` with the drawer closed (a fresh
   page remembers it closed): the group editor of `group_1` opened opens
   the drawer on the level tab "Group", and a click on `elision_3`'s
   ellipsis then shows Elisions. The drawer then closed and the timeline
   editor of `recording` opened inside the group editor, the drawer stays
   closed (only the first editor opens it); a click on `elision_3`'s
   ellipsis selects it and leaves the drawer closed; opened, the drawer
   shows Elisions, not the level tab, since the elision was selected after
   the editor opened. Both editors closed and the drawer closed, a click on
   `elision_2`'s ellipsis leaves the drawer closed; the group editor then
   opened opens the drawer on the level tab "Group", since the editor
   opened after the elision was selected.

**`properties-fields.spec.ts`** (Chromium, Firefox, WebKit) opens the
drawer's Properties tab on `bundles`. With `group_1` selected, its frame
height stated 10 above the drawn one (one command, the field showing it)
and then `1`, typed and committed with Enter, is one command
unstating it (a `set` at `{block: "bmixed0000", id: "group_1"}` with
`place {height: null}`): the field shows the text it showed
before (the drawn height, the minimum), the block's drawn box has its
size on screen from before the first command (measured once the block is
drawn at the pane the open drawer leaves the canvas, `settledDrawing`: the
pane settles `PANE_SETTLE` after the drawer opened, and `excerpt`'s
ancestor card, elided at the automatic proportion, is then drawn narrower),
and the message bar shows
one information message (`data-level="info"`, dismissed by itself after
3 s, so the page's clock is paused before the command and resumed once the
message has been read) reading `To decrease the height below <that text>
px, decrease the size of the contained elements first.`. The container
width and height stand side by side in one row, the disabled Locked
checkbox right of the height, checked for `excerpt`'s card (`{id:
"excerpt", part: ["card"]}` selected) and not for `score`'s. The Name
field comes first and renames the selected group in one command. In the
group editor of `group_1` with nothing selected, the Name field shows the
edited group's name, `Performance`, and `Duo` with Enter renames the
group. The Name field is looked up inside the Properties tab panel: the
page always holds the closed "Your name" dialog, whose field is labelled
Name too.

**`memberships.spec.ts`** (Chromium, Firefox, WebKit) opens the drawer's
Properties tab on `bundles`. With `score`'s card selected, the fieldset
"Groups" shows "Performance" checked and "Facsimile" not; a click on
"Facsimile" is one command, `set {block: "bmixed0000", id: "score"}`
with `groups ["group_1", "group_2"]`, the box is then checked, and the
block, which drew one card of `score` (the hook's box records), draws two.
With `group_2` selected, the fieldset "Members" shows "Recording" disabled
(it holds the member `excerpt`), and a click on "Page" is one command,
`page`'s `groups []`, after which the box is unchecked. With
`annotations`' card selected, "New group" is one command, an `add`,
after which the manifest's groups are `group_1` and `group_2` as before
and a third of `annotations`, its ID the one the store minted and
journaled with the `add`, and the fieldset "Groups" shows that ID, the
group having no name, checked.

**`a11y.spec.ts`** (Chromium, Firefox, WebKit) runs axe-core on the page
with `small` open and requires an empty violation list on the canvas, with
an element selected, with the drawer open, on the drawer's Properties and
Manifest tabs inspecting a timeline, on its Metadata tab inspecting `cpt_1`
of the LayerIt recording (TimeToShare's `statements/layerit_recording`,
imported; every lookup request aborted) with the composer's Value listbox
open (the elements of the manifest, "is derived from, is based on"), and
with the "Your name" dialog open over it ("Change…"), in the "Type
profiles" dialog (File, "Type profiles…") after "Add profile" and "Add
service" (the profile's editor shown), with the File menu,
the About dialog and the discard question open. Tab reaches the nodes in z-order, Enter selects the
focused one and Escape clears the selection.

**`a11y-panels.spec.ts`** (Chromium, Firefox, WebKit) runs axe-core on
the whole page in the states a user meets the later panels in and
requires an empty violation list in each, in the order of the cases. On
`small`: the Timestamp tab showing `bare`'s named `timestamp_1` (the
selection opens the tab; its "Wedge rotation" slider and an enabled
Delete shown); the Timestamp tab showing the unnamed pin a selected
start mark gives (`{block: "map0000000", id: "phrase", part:
["start"]}`, its "coordinate of Phrase" field shown, Delete disabled;
the greyed keys of its Properties are in view and checked: axe-core
exempts the disabled controls, not the "Display" key, whose group is no
disabled element).
On `bundles`: the Timestamp tab of `bmixed0000`'s `timestamp_7`, on the
group member `performance`, showing the group "Group" with its
GroupStamp toggle. On `small` again: the Journal tab after a closed
bundle editor session on `bare` (one rename, "Plain") and a set of `x`
that is undone, the session's disclosure ("… (1 change)") expanded and
the undone entry listed (`[data-undone]`). With TimeToShare's table
fixture imported with its MatchClaim table (the user `Ana` with the
ORCID iD the fixture's `claim_1` belief names; the table route replayed
from the client's recording, after a belief from the same recording
with `claim_1`'s belief `false`, as `matchclaim-beliefs.spec.ts` does;
the provenance and events of `claim_1` as there; the belief route
answered by Parquet bytes; the health check held until the import is
done, as there): the block selected on the Matchstamp tab (status
"match_claims.parquet: 18 MatchClaims", the hint, the filter's four
timeline checkboxes); the named MatchStamp "Downbeat" (`claim_1`)
selected under Show matches, `claim_1` expanded (events "note_1 “C4”",
"onset_1", "0.75"), its provenance open ("Ana", "manual",
"2026-11-20"), the user's belief True pressed; then, after False, the
table changed ("…, changed", "Save MatchClaims…" shown, the difference
"MatchClaims the belief filter leaves out"). In the world of
`matchclaim-loading.spec.ts` (its stubbed server shared through
`tablesServer.ts`, the health check answered, the table fixture's
manifest imported from `story/` through the file dialog): the tables
dialog "match_claims.parquet is not beside The manifest, at
story/manifest.yaml" that Show matches opens, with "Locate…" and Load
disabled, and again once a URL is entered. On `group_elided_members`
imported: the Elisions tab with `elision_1` (a group elision of
`excerpt`) selected, the timeline's block of `piece` expanded by its
button, the group's block of "Theme" open by the selection and the
elision's form shown with its Delete elision button. On
`styled_score_flow_inner` imported, the card of `score` selected: the
Regions tab listing `intro` and, under the heading "b", the region
`motif` the test adds (one `add` with its own ID), `intro`'s row marked
once its head is pressed; then, the card selected again, the Properties tab with the table "Bands"
and its five Visible checkboxes. The unnamed pin
(the rotation's degree readout beside its disabled slider) and the
Journal tab (an undone entry's text, time and author) are checked for
contrast like every other state.

**`metadata.spec.ts`** (Chromium, Firefox, WebKit) imports the LayerIt recording
(`statements/layerit_recording.yaml` through Import manifest…) into a
fresh page, the clock fixed at `2026-11-20T12:00:00Z`; every request to
`www.wikidata.org`, `lobid.org`, `www.youtube.com` or
`commons.wikimedia.org` is answered from the editor's recorded lookups
(`packages/editor/tests/lookup/index.json`, by URL) and aborted when not
recorded. Exports are read with `loads`, so their IDs are written `#id`.
`G` = `tag:timetoalign.github.io,2026:tilie:user:Gerhardt`. Headings are
the shipped catalogue's labels.

A tile's heading is its sentence: the first tile's says what the element
is ("<name> is a <type>", the catalogue types its "is a" states), every
other one's is its verb and its label. `P` =
`https://example.org/people/editor`, `T` = `https://example.org/agents/tilie`
(the fixture's annotators), `TILIE` =
`https://github.com/TimeToAlign/TimeLineEditor`.

1. **As imported.** One block, no refusal. `cpt_1`: headings
   "C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical is
   a video.", "performed by Maria João Pires", "same as", every tile
   collapsed (its pairs hidden), no "Status" text; "performed by"
   expanded: labelled "Maria João Pires", its pairs `rel:prf
   viaf:113931950 ↗` and `wdt:P175 wd:Q235650 ↗`, each in its row beside
   a button reading "Provenance" (a pair is read from its own span, not
   from the row, which holds the button's word too), a "＋ Add vocabulary"
   button on each of the three tiles (each has a vocabulary not yet
   used); "Candidates (1)", "Believed false by you (0)"; the candidate
   "is a recording of Clair de lune". `clt_6`: "Candidates (1)", the
   candidate naming `gnd:1156628156`, whose provenance lists "P believes it
   false (2026-11-18)": another actor's belief, so it is still offered
   to the user. `dpt_1`: "Candidates (1)". The bundle: "Nothing states
   yet what LayerIt, Clair de lune mm. 1–6 (Pires) is." with "State what
   it is".
2. **A candidate believed true.** On `cpt_1`, True in the candidate's
   provenance: "is a recording of" follows "same as", the journal grows by
   one; the export's `#cpt_1` states `wdt:P2550: [{id: "wd:Q29117946"}]`,
   its entry 3 kept as made (`stated_by: [T]`, 2026-11-18, method, basis
   and note) with `beliefs: [{actor: G, belief: "true", date:
   "2026-11-20"}]`. Undo brings the candidate back.
3. **A candidate believed false.** On `dpt_1`, False: "Candidates (0)",
   "Believed false by you (1)"; the export's `#dpt_1` states no
   `dcterms:source`, its one entry kept as made with `G`'s belief
   `"false"` of 2026-11-20.
4. **Paste.** On `cpt_2`, "＋ Add statement", then
   `https://www.wikidata.org/wiki/Q235650` pasted into Value (a `paste`
   event dispatched with the text as `text/plain`, stated both in the
   standard `clipboardData` member of its initialiser and in Firefox's own
   `dataType` and `data` members, since Firefox ignores the former and the
   other engines the latter): Vocabulary
   reads "Wikidata", Value the label "Maria João Pires" (from the recorded
   entity), Verb has the focus; "perf", ArrowDown, Enter, Add: a "performed
   by Maria João Pires" tile after "Nothing states yet what cpt_2 is.",
   expanded the row `wdt:P175 wd:Q235650 ↗`; the export's `#cpt_2` states
   `{"wdt:P175": [{id: "wd:Q235650", label: "Maria João Pires"}]}`, its
   entry `manual` by `G`, no `service`, with `G`'s belief `"true"`.
5. **＋ Add vocabulary.** On `cpt_1`'s "performed by", expanded, "＋ Add
   vocabulary", GND: the first Value option is the GND's preferred name of
   record `124927521` (read from the recording), offered from Wikidata's
   P227 of `Q235650`; Add puts the row `rel:prf gnd:124927521 ↗` between
   the two rows; the export's `rel:prf` gains `{id: "gnd:124927521",
   label: <that name>, "schema:sameAs": [{id: "wd:Q235650"}], provenance:
   [the tie]}`, the tie an entry `inferred` by `TILIE` on 2026-11-20 with
   basis `http://www.wikidata.org/entity/Q235650` and the note "written by
   “＋ Add vocabulary” to keep the value with the thing it was chosen for",
   no belief; the pair's own entry `reconciled`, service
   `https://www.wikidata.org/w/api.php`, basis
   `http://www.wikidata.org/entity/Q235650`, match `exact`, with `G`'s
   belief `"true"`.
6. **The user.** File, "Your name…", "Clara Wieck" and
   `https://orcid.org/0000-0002-1825-0097`, Save: the user line reads "You
   state as Clara Wieck (ORCID iD 0000-0002-1825-0097)."; Remove in the
   provenance of the "same as" pair (`schema:sameAs youtube:Ch2mrPm1JnM`,
   its YouTube address shown as a slug) journals an entry by "Clara Wieck"; the
   candidate believed true then carries the belief `"true"` of the actor
   `https://orcid.org/0000-0002-1825-0097`; after a reload `tilie.user`
   holds `{"name":"Clara Wieck","orcid":"0000-0002-1825-0097"}`.
7. **Keyboard only.** Flow 4 from Enter on "＋ Add statement", Tab, the
   arrows, Enter and Escape (the paste dispatched as the clipboard would):
   Escape in the open Verb listbox closes it and leaves the composer open;
   Enter on the new tile's focused expand button expands it.
8. **A stated pair believed false.** On `cpt_1`, "performed by" expanded,
   the provenance of `wdt:P175 wd:Q235650`: its False button focused,
   ArrowDown and ArrowUp change nothing (no journal entry, not pressed);
   Enter: False pressed, one journal entry, the three tiles kept; the
   export's `#cpt_1` still states `wdt:P175` as imported, its entry
   holding `P`'s belief `"true"` and `G`'s `"false"` of 2026-11-20.
   Believing a pair false records the belief and never removes the pair.

**`metadata-pick.spec.ts`** (Chromium) starts as `metadata.spec.ts` does
(the import, the replayed lookups and the fixed clock are `metadata.ts`'s,
shared by both specs).

1. **Pick.** On `cpt_2`, "＋ Add statement", Verb "derived from",
   Vocabulary "An element of this manifest", "Pick on the canvas": the
   button is pressed, the status line reads "Pick a timeline or a region on
   the canvas; Escape cancels." and the arranger carries `data-picking`. A
   press on a point of `clt_6`'s card (`framePoint`): Value reads "Clair de
   lune, mm. 1–6 (MEI) (timeline)", the selection is still `cpt_2` alone,
   nothing journalled; Add: the export's `#cpt_2` states
   `{"dcterms:source": [{id: "#clt_6"}]}`.
2. **Escape cancels.** "Pick on the canvas", then Escape: the button is
   no longer pressed, the arranger no longer carries `data-picking`, the
   composer is open with Value empty; the same press on `clt_6`'s card then
   selects that card, `{block, id: "clt_6", part: ["card"]}`.
3. **Picking holds the canvas.** "Pick on the canvas" as in 1; a click on
   a point of the pane no block, toolbar or message covers: the message
   bar shows the information "Pick a timeline or a region; Escape
   cancels." alone, the
   selection is still `cpt_2` alone, the arranger still carries
   `data-picking` and the composer is open. The block's node focused,
   Enter and Space each: the same information, shown once, the same selection, still
   picking (the node is the block itself, which picks nothing). Enter sent
   to `clt_6`'s card element: Value reads "Clair de lune, mm. 1–6 (MEI)
   (timeline)", the picking ends, the selection is still `cpt_2` alone and
   nothing is journalled.
4. **Bulk.** `cpt_2` given `{"rel:prf": [{label: "Maria João Pires"}]}` by
   a `set` through the hook; on `cpt_2` the Candidates list, opened, offers
   "Propose matches for unreconciled names" beside "1 name without an
   identifier here and below"; pressed (Wikidata's and the GND's recorded
   agent searches for that text answer, `Q235650` and `1057057150` first,
   Wikidata's preferred; MusicBrainz, whose route no server answers here,
   is not pinned): one journal entry and one candidate row, the
   information "Proposed 1 match: they are listed under Candidates.", no
   message that Wikidata or the GND could not be searched, "performed
   by Maria João Pires" (the label `cpt_1` gives `wd:Q235650`); its
   provenance lists stated by "TiLiE", method "reconciled", service
   `https://www.wikidata.org/w/api.php`, the note "found for the name
   “Maria João Pires”", date 2026-11-20 (no match: Wikidata's search
   states none) and "No one has stated a belief.". True: the export's
   `#cpt_2` states exactly `{"rel:prf": [{id: "wd:Q235650", label: "Maria
   João Pires"}]}`, the label-only node gone (the one name under
   `rel:prf`), and its one entry kept as made (`stated_by: [TILIE]`,
   `method: reconciled`, the service and the note, no `match`) with `G`'s
   belief `"true"` of 2026-11-20.

**`profiles.spec.ts`** (Chromium, Firefox, WebKit) imports the LayerIt recording as
`metadata.spec.ts` does, the lookup hosts answered and aborted alike. The
profile file is written out by hand in canonical YAML: the one profile
`lecture_recording` ("lecture recording", "is a" `type
schema:AudioObject` in the fallback vocabularies, verbs `performed_by`,
`recorded_at_on`, lookup `wikidata`) and no service. File, "Type
profiles…", "Import YAML…" with that file, Save. On `cpt_2`, which states
nothing, "State what it is", Vocabulary "Other vocabularies", Value
"lecture recording", Add: the "is a" rectangle holds the pair `type
schema:AudioObject ↗` (the class is a web address, so a link). "＋ Add statement", ArrowDown in Verb: the options
begin "is a", "performed by", "recorded at, recorded on" (the profile, the
first type stating `schema:AudioObject`, puts its verbs before the shipped
"recorded performance"'s "is a recording of"). Escape, Verb "performed
by", ArrowDown in Vocabulary: the options are Wikidata, MusicBrainz, GND,
MeLODy / LRMoo, Other vocabularies, An element of this manifest (the
profile's lookup `wikidata` first, then the systems of "recorded
performance"'s lookup, `musicbrainz`, `gnd`, then the rest in catalogue
order). "Export YAML…" downloads
`profiles.yaml` holding the imported text byte for byte. The workspace is
unsaved, so the reloaded page asks whether to restore it; whether the
autosave slot is written before the reload races the autosave's delay
against the page's last write while it unloads, so the spec waits until
the slot holds the workspace, reloads, and answers Discard. Then
`tilie.profiles` holds the same text and the dialog lists "lecture
recording".

**`culling.spec.ts`** (Chromium, Firefox, WebKit) proves that culling is off
below its threshold, so `grid-300` mounts all 300 nodes at any viewport,
and on above it: with `grid-900` at viewport (−2000, −100) exactly the
nodes whose boxes overlap the shown rectangle by a positive area are
mounted, counted from the grid's formula for the pane's actual size (the
formula itself pinned by a worked example).

**`groups.spec.ts`** (Chromium, Firefox, WebKit) proves manifests holding
groups on the canvas, `groups` and `bundles` at viewport (40, 40). The
drawn structure of every block (frames, titles, cards and lines in DOM
order, each address once, compared by `addressKey`: a frame `{id: G}`, its
title `{id: G, part: ["name"]}`, a card and its shadow
`{id: T, part: ["card"]}`, a line `{id: T}`, the manifest's title
`{part: ["name"]}`) equals the order of `docs/drawing.md` section 8.5
applied to the fixture by hand, with section 8.8's ancestor cards drawn
first (after the manifest's title, before every frame, each its card, its
root's line and the lines of the root's descendants it draws, a root
behind several frames listed once), so a member's card lists only the
lines not already listed (`gchild0000`: `piece`'s card, `piece`,
`second-half`, then the frame, its title, `second-half`'s card,
`recording`'s card and line; `gmixed0000`: the ancestor cards of `sonata`,
`session` and `page` in the order of their members; `bshared000`:
`score`'s card with `score`, `exposition`, `recapitulation` and its two
segment lines, `recapitulation_second` before `recapitulation_first`),
and the titles their texts. A line elided whole by an ancestor card's
derived gap is not drawn in that card (drawing.md section 8.9): the card
of `score` behind `group_1` is drawn at the proportion `r = λ / E =
12 / 20 = 0.6` (`exposition`'s 12 quarters over the 20 of `score` it
leaves out, the least bound at the page's pane, 1600 × 968), so its one
piece, `score` from 12 to 32, natural width `n = 20 × 400 / 12`, is drawn
`W = 0.6 n = 400` wide, `h = (400 − 32) / 2 = 184`, `h / k = 5.52`, and
elides `⌊12 + 5.52⌋ = 17` to `⌈32 − 5.52⌉ = 27`: `recapitulation_first`
(20 to 26) lies in that gap whole, `recapitulation_second` (26 to 32)
does not, so the latter is drawn first, the former only in the card
behind `group_2`. An element drawn twice is marked selected in all its
drawings: `ggrand0000`'s `timestamp_3`, `theme`'s `origin`, a
groupstamp displaying wedge, coordinate and line, is drawn on `theme`'s
line in its member card and again in `score`'s ancestor card behind the
frame, which draws `score`'s tree, `theme` included; a click on its
coordinate label (two drawn) selects the timestamp `{block, id:
"timestamp_3"}`, as a part of a named timestamp selects its timestamp,
and marks, in DOM order, in each card its wedge `{id: timestamp_3}`, its
coordinate label and its line in two pieces around them (the cut of
section 6.6), the ancestor card's first, then the groupstamp's frame line
across `recording`'s card, nine in all. `score`'s line in `bshared000`
(at the viewport showing that block, `(40, 40 − 952)`, where `(40, 40)`
showed it before it moved below the others) is drawn as 16 parts: four
as the ancestor line in each frame's member card (the line, the circle
at `score`'s start in `exposition`'s card or the arrowhead at its end in
`recapitulation`'s, and two chevrons where it runs on beyond the member,
section 8.3), and four in each of `score`'s two ancestor cards (the line
in two pieces around the card's derived gap, the circle at its start, the
arrowhead at its end); six part centres lie inside each frame, the four
of its member card and, of the ancestor card behind it, the piece and
the mark that lie behind the frame (behind `group_1` the piece from 0 to
17 and the start circle, behind `group_2` the piece from 17 to 32 and the
arrowhead), the other piece and mark lying beyond the frame's borders; a
click on it selects `{block, id: "score"}` and marks all 16. Delete removes a timeline with its subtree from its group (one `remove`
of `{block, id: T}`) and a region added into `second-half` (`region_1`,
removed as `{block, id: "region_1"}`), and refuses a selection holding the
manifest's title whole. Hover marks exactly one box
overlay, the card or the frame under the pointer (never a shadow or an
enclosing frame), at zoom 1/2 and at scale 1.5 too, and a hovered segment
boundary is marked with its card, the mark gone once the pointer is on the
empty pane at canvas (584, 600), between `bungroup00` and `btwogroups`;
`gchild0000` at scale 1.5 draws its
`<svg>` 1.5 times its drawing's width, the drawing at that scale and at
the canvas's pane (the arranger's size, 1600 × 968 with the drawer
closed, which the case asserts first): `piece`'s ancestor card is elided
at the automatic proportion, which reads the scale and the pane (section
8.9), so the width depends on both (1001.609814453125 at layout's default
view and scale 1, the fixture table above); at that pane and scale it is
1551.35888671875, layout's record, pinned, and the editor's drawing code
run outside the page gives it beside; a press on a frame selects the group;
a click on a member's line marks its card and frame as holding the
selection and the block dotted (the block's mark `data-marks="{}"`,
`data-box="block"`), each in its stated colour. A stretch keeps
the margin a box resize added in proportion: `bungroup00` is drawn
527.3271484375 wide (layout's record: it holds no frame, so each of its
ungrouped cards lies at `x = P = 8`; its widest end label is
`recording`'s `441 000 smp`, 59.2470703125 wide, centred at
479.70361328125, so its right edge lies at 509.3271484375; the card
padding `K` 8 beyond it is the cards' right edge 517.3271484375 (each card
at `x` 8 and 509.3271484375 wide), their shadows 2 further 519.3271484375,
and the block's padding `P` 8 beyond the shadows 527.3271484375), so a Box
drag of its bottom-right handle by (40, 30) states `width` 567.3271484375;
a Stretch by the right handle by 50 then stores `x` 0, `y` 480, the
height kept, `width` 617.3271484375 and `length` 446.474609375
(228595/512, the largest multiple of 1/2048 whose kept width,
`567.3271484375 × (127.3271484375 + length) ÷ 527.3271484375` quantized
to 1/2048, does not pass the pointer), and the node's left edge stays
while its right edge moves 50. Through the File menu, the
schema package's `group_styled` and `bundle_mixed` are imported and
exported byte for byte.

**`ancestor-cards.spec.ts`** (Chromium, Firefox, WebKit) proves an ancestor card (TimeToShare's
drawing specification, sections 8.8 and 8.9), the blocks of the
Elisions tab beside it and a selected elision's gap on the canvas. The
page is 1920 × 1080, so that the canvas left of the open inspector drawer
(32 % of the editor's width) is wider than 1112 pixels: where an ancestor
card's proportion is automatic it depends on the canvas's size (section
8.9, The proportion), and from that width on it does not for the
fixtures here (below). The drawing is compared, never pixels; a block
of the Elisions tab, the inspector's last tab, is found by its test ID
(`elisions` the root's, a timeline's block; `group-elisions` the group's;
`elision-form` the selected elision's), its heading's disclosure button
by the same ID with `-expand`, a mode by its radio's name. Every block is
collapsed at first (its button `aria-expanded` "false", the radios out of
the accessibility tree), so a case opens the block it works in by its
button, which then reads "true"; a block holding the selected elision,
and the elision's own, are open without a click. The button's accessible
name is the kind word, the title and the essentials, which tells a
timeline's block from a group's. A gap draws nothing of its own by default (the defaults' `fill:
none`, drawing.md section 4, and no `continuation` in its display), so
each drawing of a gap is seen by its one ellipsis, three dots addressed
`{id: E, part: [ellipsis]}` for a stored elision and `{id: T, part:
[elision, ellipsis]}` for a derived one.

The first cases use the schema package's `groups/group_parent_both`,
imported through the File menu, at zoom 1 with the block's place origin
at (240, 80) on the pane: the root `piece` (`Piece`, 16 quarters),
whose child `middle` (`Middle`, 8 quarters at offset 4) is a member of
`group_1` beside `recording` (`Recording`, 10.0 seconds), runs on to
both sides of its member. Every number is layout's record of the block
(layout's README, "Ancestor cards", cases 2, 3 and 8), as the writer
prints it, four decimals.

*Drawn by default, hidden from its root and shown from its child.* With no
rule stating anything of it, the block draws `piece`'s ancestor card,
shadow and card addressed `{id: piece, part: [card]}`: the card at
`x="8"` `y="36.207"` (36.20703125, `piece`'s ancestor row 85.18359375
less its line's 48.9765625 below its top), `1013.0391` × `63.3789`
(52.33544921875 + 800 + 9 + 8 + `OL` + `OR`, with the seams `OL` =
103.70361328125 and `OR` = 40); the block's place origin moved right by
252.33544921875, so the frame at `x="260.3354"` `y="8"`, `543.7036` ×
`157.5625` (24.8046875 to its first card, `middle`'s 67.37890625, the
spacing 8, `recording`'s 49.37890625 and the padding 8), the member
cards at `x="268.3354"`, `y` `32.8047` and `108.1836`, both `527.7036`
wide, `67.3789` and `49.3789` high; the node at `(x − 252.33544921875,
y)` of the block's place `(x, y)` (each engine prints a transform's
lengths to its own precision, Chromium and Firefox to six significant
digits, WebKit to six decimals, so the node's computed transform is
compared with the one the same browser computes for `translate(<x>px,
<y>px)` of the exact position, never with one engine's rounding; computed,
since WebKit spells one specified transform `translate(0px)` or
`translate(0px, 0px)` depending on how it was set). The card lies
behind the frame: its rectangle precedes the frame's in the DOM.
Selecting `piece` and choosing the Elisions tab offers the root's block,
its button named `Timeline Parent timeline "Piece" Proportional`,
collapsed; opened, its title `Parent timeline "Piece"`,
the mode Proportional checked (the mode `auto` with no stored card
elision draws as `proportional`, and at `r = 1` it derives no gap: the
member's span 4 to 12 leaves 4 on each side, `λ / E = 1`, and the view
bounds none), the checkbox "Draw behind its groups" ticked and enabled.
Unticking it journals exactly one entry, `{type: "style", select: {addresses: [{id: "piece", part:
["card"]}]}, set: {display: "none"}, blocks: [<block>]}`, the root's one
rule (every card of `piece`), and the card is gone: nothing is addressed
`{id: piece, part: [card]}`, the frame and the member cards lie at `x` 8
and 16 with the same `y`, widths and heights (the cards take no room,
layout's case 3), the node is at the block's place `(x, y)`, which the
store keeps throughout. The checkbox is then unticked and the block offers
no mode (a hidden card reads none). The block is a property
of the grouped child too, so selecting `middle` instead offers the same
block, still open (the open state is the root's block's, whichever of
its timelines is selected), the checkbox unticked; ticking it journals
exactly one entry, the same rule with `set: {display: null}` (the block's
own rule hid the card, so showing it unstates that value), and the card
and every box are drawn as before, Proportional checked.

*Full and back by the arrow keys.* On `groups/group_elided_inside`
imported the same way (the root `piece` of 64 quarters with `first`, 32
at 0, and `second`, 32 at 32; the member `excerpt` of 8 at 8 in
`first`, a member of `group_1` "Excerpt" beside `recording`), the
canvas is first checked to be wider than 1112 pixels with the drawer
open: the automatic proportion is the least of (a) `λ / E × (L' / L)` =
8 / 56 = 1/7 and (b) the view's two bounds, of which the right one,
`(B − dr) / (L × uR)` with `B = 0.8 × VW / (2 × 5/7)` = 0.56 × VW, `dr`
= (543.70361328125 + 8) − 271.851806640625 = 279.851806640625, `L` = 400
and `uR` = 48 / 8 = 6, reaches 1/7 at `VW` = (2400 / 7 +
279.851806640625) / 0.56 ≈ 1111.98, so on a wider canvas `r` = 1/7
(section 8.9's worked example) and the default gaps are `first` 0–8,
`first` 16–32 and `second` 1–31 (layout's README, "Elisions", point 1).
Selecting `excerpt` shows Proportional checked and the three dots of
`second`'s default gap. Full journals exactly `{type: "style",
select: {addresses: [{id: "piece", part: ["card"]}]}, set:
{"elision-mode": "full"}, blocks: [<block>]}` and no dot
of `second`'s gap is drawn; ArrowRight from the checked Full moves to
Proportional, as a native radio group does, and journals the same rule
with `set: {"elision-mode": "proportional"}`, the three dots drawn
again.

*Custom: the drawn defaults stored, Add elision and Remove all.* On the
same import with `excerpt` selected, Custom with no card elision stored
journals exactly one entry, the `add` into `{block}` of the gaps as drawn
(the arranger's tests README, "Elisions on the canvas", point 12), in
drawing order: `first` `[0, 1]`–`[8, 1]` `{canvas: 57.14285714285714}`,
`first` `[16, 1]`–`[32, 1]` `{canvas: 114.28571428571428}`, `second`
`[1, 1]`–`[31, 1]` `{canvas: 128.57142857142856}` (each `W = r × n`,
`n` = 400, 800 and 1600 at 50 canvas units a quarter, the third's gap
`W` less the two visible ends of 50), each with the card's
`elision-display`, initially `["ellipsis", "name"]`, and `ids` the three
IDs the store minted for them (random in the page, so the spec reads them
from the entry, `newestMinted`, and names the gaps by them: `first0`,
`first16`, `second1`); the mode `auto`
then draws as `custom` (a stored card elision), so no rule is written.
Custom is checked, the count reads "3 elisions" and the rows (name, else
"—"; timeline; stretch) read "—", "First", "0–8 ♩"; "—", "First",
"16–32 ♩"; "—", "Second", "1–31 ♩", and the card draws the stored
`second1` (three dots) in place of `second`'s default (none). Add elision
journals one `add` into `{block, id: piece}` of `{start: [32, 1], end:
[48, 1]}` with one minted ID, `first32`: `excerpt` lies in a group, so the elision goes on the root,
on the middle third of the longest stretch of `piece` outside the
protected span 8–16, i.e. 16–64; the count reads "4 elisions". Remove all
journals one `remove` of every card elision of `piece`'s tree in the
manifest's canonical order (timeline, then start, then ID):
`first0`, `first16` (`first` 0 and 16), `first32` (`piece` 32),
`second1` (`second` 1). None is stored after it, Proportional is
checked again and the three dots of `second`'s default gap are drawn.

*A selected gap: its handles, its mode menu and one keyboard edit.* On
the same import, after Custom has stored the defaults, a click on the
row of `Second` selects `{block, id: second1}` alone; the root's block,
which holds it, and the form's block are open without a click, and the
form reads `Elision on "Second"`, From `1`, To `31`. The viewport is moved so that
the middle dot of its ellipsis lies at (400, 400) on the canvas, left of
the drawer, where its menu takes clicks. The canvas shows one
`gap-handle-start` and one `gap-handle-end` (the gap is the whole
stretch, so both edges are reachable), and the gap mode menu, its
Coordinates pressed and Width not (`aria-pressed`). A click on Width
presses it beside Coordinates, a second click releases it again. With
the arranger focused, `]` chooses the end and ArrowRight moves it one
grid step, 8 canvas units, under Coordinates: `second`'s gap lies in
`piece`'s ancestor card at 50 canvas units a quarter on the run beside
its end (`LA` = 3200 over 64 quarters, scale 1), so the step is 0.16
quarter and the reach half of it, 0.08; the pointer value 31.16 snaps to
the first multiple of `1/d` within reach for the divisors `d` of 2520
ascending (`d` = 1 to 4 give 31, 31, 31 and 31.25, all farther; `d` = 5
gives 31.2), and no snapping value of `second` (0, 32) lies between 31 and
31.2. Exactly one entry is journalled, `{type: "set", changes: [{target:
{block, id: second1}, values: {end: [156, 5]}}]}`, and `second1`
is stored ending at `[156, 5]`.

*A group's elisions.* On `groups/group_elided_members` imported the same
way (the group `group_1` "Theme", whose frame elides `elision_1`
"Development" on `excerpt` 2–8 and `elision_2` on `phrase` 2–6),
selecting the frame `{block, id: group_1}` offers the group's block,
its button named `Group Elisions in group "Theme" Custom, 2 elisions`,
collapsed, and no root's block; opened, its title `Elisions in group
"Theme"`, the checkbox "Draw the group's elisions" ticked (the
frame's mode draws its stored elisions), the count "2 elisions" and
the rows "Development", "Excerpt", "2–8 ♩"; "—", "Phrase", "2–6 ♩";
`elision_1`'s ellipsis is six dots, one across the frame and one in
`piece`'s ancestor card, which carries the frame's gaps. Unticking it journals exactly `{type: "style",
select: {addresses: [{id: "group_1"}]}, set: {"elision-mode": "full"},
blocks: [<block>]}` and no dot of `elision_1` is drawn, neither across
the frame nor carried into `piece`'s card; ticking it again journals the
same rule with `{"elision-mode": null}` (no other rule states a mode) and
the six dots are drawn again. Add
elision journals one `add` into `{block, id: excerpt}`, the frame's
first member in display order, of `{start: [16, 3], end: [32, 3]}`, the
middle third of its 16 quarters, exactly, with one minted ID,
`excerpt16`; the count reads "3 elisions".
Remove all journals one `remove` of the group's elisions in canonical
order, `elision_1` (`excerpt` 2), `excerpt16` (`excerpt` 16/3),
`elision_2` (`phrase`); the count reads "0 elisions", nothing is stored
and Remove all is disabled.

*Raised by its editor* (back on `group_parent_both`). A double-click on a
point of the card left of the frame, clear of everything drawn on it
(`framePoint` of the card's address), opens the timeline editor of
`{block, id: piece}`, and the card is raised over the frame: its
rectangle now follows the frame's.

*Unfolded out of the member card* (decision record 0034; the arranger's
tests README, "A raised card unfolding", derives the motion). The page
records, on every change of the block's node, whether the raised card's
layer (`g.tilie-raised`) was moving (`data-unfolding`) and the
`transform` of `middle`'s line in the layer when the layer first
appears. Before: no layer, the card behind the frame. After the
double-click and once the editor is open, at rest: one layer, neither
moving nor clipped (no `clip-path`, no `clipPath` in the node), no
element in it carrying a `transform`, `middle`'s line at `y1` its row in
the card (layout's `lineAxes` of the page's drawing, the axis carrying
`ancestor`), the card after the frame. On the way, the layer moved, and
it first showed `middle`'s line shifted by `translate(0 <s>)`, `s` its
row in the member card less its row in the card (both from `lineAxes`,
written as the writers write numbers): it started on the member card's
row. After Done, at rest: no layer, the card behind the frame, and the
layer moved on its way back. Under `prefers-reduced-motion: reduce` the
same double-click and Done switch at once: the layer never moves and
first appears unshifted, so no `transform` is recorded.

*Read by Show coordinates.* The points are drawing points of the block
placed where the arranger puts its node (the block read back from the
page's workspace text, drawn by `drawingOf` and placed by
`nodePosition`; `r` = 1 at any view, so the default view's drawing is the
page's), the lines found in layout's `lineAxes` of that drawing (layout's
README, "Ancestor cards", case 8): the card's `piece` line (its axes
carry `ancestor`) at y 85.18359375 in three runs cut at the seams, 0 to 4
from 60.33544921875 to 260.33544921875, 4 to 12 from 364.0390625 to
764.0390625 and 12 to 16 from 804.0390625 to 1004.0390625, 50 units a
quarter; the card's `middle` row (its axis carrying `ancestor`) at y
51.20703125, 4 below `middle`'s own line (47.20703125); and `piece`'s
ancestor line in `middle`'s member card (no `ancestor`) at the same y
85.18359375 from 364.0390625 (start 4). The frame spans x 260.33544921875
to 804.0390625. The viewport's abscissa is moved right by less than a
pixel so that the card's `piece` line starts on a whole screen pixel;
every point lies a whole number of units from it (Firefox and WebKit take
whole pixels only), 50, 504 or 844, and its ordinate is rounded to a whole
pixel. A reading snaps within half a device pixel, 0.01 quarter at zoom 1,
so 504 (x 564.33544921875, 4 + 200.29638671875 / 50 = 8.005927734375 on
`piece`) reads 8 and 844 (x 904.33544921875, 12 + 100.29638671875 / 50 =
14.005927734375) reads 14. With Show coordinates on, the flag
(`coordinate-flag`) holds one part per timeline (`data-timeline`), top
to bottom, each headed by its timeline's name, and the hovered row
carries `data-hovered="true"`:

| Point (drawing) | Arranger | `piece`'s timeline editor open, the card raised |
|---|---|---|
| (110.33544921875, 85.18359375), the card's `piece` line left of the frame | parts `piece` alone, `1 ♩` (50 / 50), hovered | — |
| (904.33544921875, 85.18359375), the card's `piece` line right of the frame | parts `piece` alone, `14 ♩`, hovered | — |
| (564.33544921875, 85.18359375), `piece`'s ancestor line in `middle`'s card | parts `middle`, `piece` (`middle`'s line lies above the ancestor line): `piece` `8 ♩` hovered (the ancestor's row), `middle` `4 ♩` | parts `middle`, `piece` (the card's `middle` row lies above its `piece` line): `piece` `8 ♩` hovered, `middle` `4 ♩` |
| (564.33544921875, 51.20703125), the card's `middle` row inside the frame | not the card, which the frame covers there: `middle`'s own line, 4 above, within the pointer's 8: parts `middle`, `piece`, `recording` (a member's line reads its group), `middle` `4 ♩` hovered | parts `middle`, `piece`: `middle` `4 ♩` hovered, `piece` `8 ♩` |

So the card is read beyond the frame's borders, never through the frame,
and everywhere while it is raised; an ancestor line in a member's card is
read as its ancestor's. The raised card is opened through the hook
(`enter`), the viewport set back to the one measured.

**`arrangement.spec.ts`** (Chromium, Firefox, WebKit) proves the Arrange
menu (TimeToShare's drawing specification, sections 1, 8.5, 8.6 and 8.8,
Drawn once) in a browser: a bundle's items switched side by side and back,
reordered by a drag and by a key, side by side refused with its reason,
and the canvas's blocks in a matrix. Reduced motion is emulated, so that
nothing a press aims at is moving (the motions themselves are the
arranger's tests'); the page is 1920 × 1080 at device scale 1, so that a
drawing of the four groups one under another fits the canvas at zoom 1.
The menu opens from the canvas controls' `arrange` toggle (`aria-expanded`)
as the panel `arrange-menu`, one button per arrangement,
`arrange-<free|vertical|horizontal|matrix>`, the one stated `aria-pressed`,
found inside that panel (the inspector's level tab draws the same menu
under the same test IDs);
every choice is one `set`, one entry more and read as the newest entry of the bundle editor's
session (`newestCommand`) or of the journal, and the store's arrangement is
read through the hook. Drawn boxes are read from the DOM as the writer
prints their rectangle's `x`, `y` (four decimals), the frame `{id: G}` by its
last part, its rectangle after its shadow; the ancestor cards from the
hook's container records (`boxes`), whose keys `{item: G, member: R}` say
behind which group each card is recorded. A value that depends on the pane
the canvas fits drawings to (an ancestor card's automatic proportion,
section 8.9: the abscissas of the groups drawn one under another) is never
compared; every value below is the same at every pane wider than 1300 px,
and the one that is not at a narrower pane (the fourth frame's top, below)
says so. With the bundle editor open the inspector drawer takes its share
of the page (32 % of 1920), and the pane the canvas measures is 1304.609375
wide.

The bundle is the schema package's `bundles/bundle_elided_layerit`,
imported through Import manifest… (no fixture workspace holds it, so none
was added): the root `clt_1` "Suite bergamasque" (1616 quarters) holds four
movements, each holding the excerpt that is its group's first member, so
each group anchors on `clt_1` with the stretch of its excerpt, offsets
summed: `group_1` 0–16, `group_2` 476–488 (356 + 120), `group_3` 668–695,
`group_4` 1600–1616; the four stretches follow the drawing order without
overlapping, so core's row is `[group_1, group_2, group_3, group_4]`
whatever order is asked, and `clt_1` is the one root any group hangs on.
Each group's frame holds its excerpt's card (a grandchild: 81.37890625
high laid out alone) and its recording's (49.37890625). One under another,
each group draws its own ancestor card of `clt_1`, whose derived elisions
are named (`elision-display` `ellipsis name`), and the member card's rows
align with the rows of that card, whose distances count every label stack
it draws (section 8.3): a member row beyond a derived elision's stack lies
one name line, 19.9765625, lower (the schema package's drawings README
derives it for `group_elided_inside`, whose member hangs on its root as
each excerpt here does), and its card grows by as much. In the card of
`clt_1` the four movements lie in one row of one band order (section 6.4,
Rows of one band order), so it is 97.35546875 high and draws one such
stack between the excerpt's line and its ancestor rows behind every
frame: the excerpt cards are 101.35546875 high, so a frame, `8 + h(11) +
4 + Hm1 + 8 + Hm2 + 8` (the drawing facts above), is 191.5390625 high,
every frame 622.8037109375 wide (section 8.9, the worked example of
`bundle_elided_layerit`). Without an arrangement and one under another
(section 8.6, the block's spacing 8 between items), each item lies 8
below the largest bottom edge of the items before it **and of their
displayed ancestor cards**, and so much lower that its own ancestor
card's top lies 8 below too (sections 8.6 and 8.8, No room). Behind every
frame the card lies 28.20703125 below the frame's top and ends at
`28.20703125 + 97.35546875 = 125.5625`, inside its frame: no card rises
above its frame or reaches below it, so each frame lies 8 below the one
before it: 28.8046875 (its title gap below the place origin), 228.34375,
427.8828125 and 627.421875 (`+ 191.5390625 + 8` each). At the
specification's default view `group_4`'s card draws the name "Clair de
Lune" in a second tier and its frame is 202.015625 high (section 8.9);
that moves no top, since `group_4` is the last item. Each group draws its
own ancestor card of `clt_1` behind it, recorded in item order, so `{id:
clt_1, part: ["card"]}` is drawn four times (eight parts, each a
rectangle after its shadow). Side by side (section 8.8, Drawn once) the
row is packed from the once card's room, the upstream drawing
`bundle__bundle_elided_layerit__horizontal`: the frames' tops are all
28.8046875, the once card not rising above them, their left edges
183.8974609375 (the once card's row name `Prelude, Menuet, Clair de L…`,
159.8974609375 wide, standing left of the first frame), then each
`622.8037109375 + 48` further (the standard gap 32 plus 8 each side, the
block's spacing being less): 854.701171875, 1525.5048828125,
2196.30859375; `clt_1` is drawn once, the card recorded behind the first
group of the row, key `{item: group_1, member: clt_1}`, two parts; the
drawing's origin is `(0, 0)`, so the node lies at the block's stated place.

1. **Side by side and back.** In the block's bundle editor the menu offers
   Free (pressed), Vertical and Horizontal, no Matrix; Horizontal is
   enabled. Horizontal sends `set {block} {arrangement: {direction:
   horizontal, order: [group_1, group_2, group_3, group_4]}}` (the items
   as shown), the store holds it and Horizontal is pressed; the frames,
   the once card and the node are as stated above; the block's stated `x`
   and `y` are unchanged. Free sends `{arrangement: null}`: the block holds
   no arrangement, Free is pressed, the four ancestor cards and the four
   tops one under another return, the place still unchanged.
2. **Reordered by a drag and by a key.** Vertical sends `{direction:
   vertical, order: [group_1, …, group_4]}` and draws as without one.
   The viewport puts the node's top left corner at (40, 40) of the pane,
   zoom 1, so a drawing ordinate is a screen pixel. `group_1`'s frame is
   pressed (`framePoint`) and dragged straight down to the drawing ordinate
   440, below `group_2`'s middle (`228.34375 + 191.5390625 / 2 =
   324.11328125`) and above `group_3`'s (`427.8828125 + 191.5390625 / 2 =
   523.65234375`), and released: one
   `set` of `{direction: vertical, order: [group_2, group_1, group_3,
   group_4]}` (`orderAt`, the middles along the direction), the dragged
   frame selected; every frame being as high and no card rising, the tops
   are those of the drawing order, 28.8046875, 228.34375, 427.8828125 and
   627.421875, and the ancestor cards are recorded in that order. With the
   arranger focused, ArrowDown moves the selected frame one place on
   (`arrangedStep`): one `set` of `[group_2, group_3, group_1, group_4]`,
   at the same four tops. Horizontal then
   sends that order as shown, and core stores its row: the store holds
   `[group_1, group_2, group_3, group_4]` and the frames lie as in case 1.
3. **Side by side refused.** `bundles/bundle_arranged_conflict`: Theme A
   (0–16) and Theme B (8–24) hang on Score and overlap on 8–16, so no row
   holds both (rule 2). In the bundle editor Horizontal is disabled, its
   title `Horizontal: "Theme A" and "Theme B" overlap on "Score" (8–16 ♩)`
   (core's reason for the drawing order, its numbers in quarters, the
   unit's symbol ♩), the menu's note `arrange-refused` says the same; Free
   (pressed) and Vertical stay enabled, and the journal is unchanged.
4. **Blocks in a matrix.** `small`, on the arranger: the menu offers Free
   (pressed), Vertical, Horizontal and Matrix. The five blocks are packed
   in index order (`bare`, `nested`, `map`, `flow_control`,
   `styled__score`) from the first one's node, `(0, 0)`, 32 apart, each
   node its drawing's size, each column as wide as its widest node, each
   row as tall as its tallest (section 8.6); every drawing's origin is
   `(0, 0)`, so a node lies at its place. The sizes are those of the
   drawing facts above.
   Matrix sends `set {} {arrangement: {direction: matrix, columns: 3}}`
   (`⌈√5⌉` columns when first chosen), shows `Columns 3`, and places the
   nodes in three columns 518.256591796875 (`flow_control`),
   528.080078125 (`styled__score`) and 490.53662109375 wide and two rows
   95.9765625 and 133.25 high: `bare` (0, 0), `nested`
   (550.256591796875, 0), `map` (1110.336669921875, 0), `flow_control` (0,
   127.9765625), `styled__score` (550.256591796875, 127.9765625). Fewer
   columns sends `{direction: matrix, columns: 2}`, shows `Columns 2`, and
   the columns are 528.080078125 and 518.256591796875 wide, the rows
   95.9765625, 110.30078125 and 133.25 high: `bare` (0, 0), `nested`
   (560.080078125, 0), `map` (0, 127.9765625), `flow_control`
   (560.080078125, 127.9765625), `styled__score` (0, 270.27734375). Every
   block's stated place is unchanged. Free sends `{arrangement: null}` and
   every node returns to its stated place. A node's position is read from
   its computed `transform`, compared with the one the browser computes for
   the exact position (`support.ts`, `placedAt`).

**`arrange.spec.ts`** (Chromium, Firefox, WebKit) proves that a bundle's
Horizontal stands its items side by side whatever arrangements came before
it (TimeToShare's drawing specification, sections 8.6 and 8.8, Drawn once,
step 3 Tops: every item that hangs on nothing has its top at the row's top),
with full motion, as the editor runs by default, every check polling until
the drawing is at rest; the page is 1920 × 1080 at device scale 1, the
viewport at (40, 40), zoom 0.5. The Arrange menu is opened from the canvas
controls as in `arrangement.spec.ts`, every choice one entry more and shown
pressed. On `bundles` the arranger's Matrix stores `{direction: matrix,
columns: 2}` (`⌈√4⌉`), then the bundle editor of a block is entered and its
Vertical chosen.

- `bungroup00` (`bundle_ungrouped`: the ungrouped roots `pages`,
  `recording`, `score`, no group, so no item hangs on a root): Vertical
  draws the three cards at `x` 8 and `y` 28.8046875, 100.2578125 and
  157.734375 (the block drawn without an arrangement; README of the
  layout package, Arrangements, item 6); Horizontal stores `{direction:
  horizontal, order: [pages, recording, score]}`, Vertical is no longer
  pressed, and the cards lie at one `y`, 28.8046875 (the first item's
  default top), and `x` 8, 565.3271484375 and 1122.654296875 (each card
  509.3271484375 wide, the row gap 48), one top on the screen too, the node
  stated 1641.9814453125 × 120.7265625 canvas units (the layout package's
  numbers: this block's placement is the default one). Before the fix the
  row's top was the smallest of no tops, every ordinate `NaN`: the node grew
  wide while the cards stayed one under another, the symptom reported.
- `bshared000` (`bundle_shared_parent`: `group_1` and `group_2` hang on one
  root): Vertical draws both frames at one `x`; Horizontal stores
  `{direction: horizontal, order: [group_1, group_2, page]}` and draws
  `group_1` at (167.4136, 35.8125) and `group_2` at (782.8037, 28.8047), as
  the writer prints them: side by side, the values the arranger's drawing
  code gives this block at the canvas's pane with the drawer open (its
  ancestor card's automatic proportion reads the pane, section 8.9), as
  `arrangement.spec.ts` reads its own.
- The arranger's level: on `bundles` with Matrix chosen and `bungroup00`
  selected, the arranger's Horizontal stores `{direction: horizontal}` on
  the workspace and nothing on the block: the four nodes stand at one top,
  and the bundle's cards stay at one `x`, one under another (the arranger's
  menu arranges blocks, a bundle editor's its items). The bundle editor of
  `bungroup00` entered then, its Horizontal stands the cards side by side as
  in the first case.

The same sequence on a large bundle is `bundle.spec.ts`.

**`bundle.spec.ts`** (Chromium) proves a large bundle side by side
(TimeToShare's drawing specification, sections 8.1, 8.6 and 8.8, Drawn
once) on `beethoven/op2_no1/manifest.json` of the musical themes dataset:
28 groups of excerpts of four CD tracks of Brendel's recording, MIDI files
and scores. The dataset is not part of this repository: the variable
`MUSICAL_THEMES_DATASET` names its directory, `run.ts` passes it into the
container and mounts the directory read-only at its own path
(`container.ts`), and without it the spec is skipped. A run of every spec
must therefore set it to a checkout of the dataset, for example
`MUSICAL_THEMES_DATASET=../../musical_themes_dataset pnpm e2e bundle.spec.ts`
from `app/` with the dataset checked out beside the repository. The page is
1920 × 1080 at device scale 1, with full motion, every check polling until
the drawing is at rest. The manifest is imported through File › Import
manifest…, its bundle editor entered and Horizontal chosen in the Arrange
menu (one entry more, shown pressed, the block's arrangement
`horizontal`). The groups and roots are read from the manifest itself, the
positions are exact, as the writer prints them (four decimals):

- the groups are taken in name order (title, then ID, by code point,
  section 8.1); tracks 1, 3 and 4 (`cpt_3856xdsl3z3hd`,
  `cpt_3p04tgywxp05z`, `cpt_323f74gjyd6li`) each hold the excerpts of two
  groups, the six EDM-alig groups of B689, B690, B692 to B695, so each is a
  shared root, drawn once; track 2 (`cpt_18o5vli1d8q4n`) holds the excerpt
  of B691's EDM-alig group alone: no shared root, its ancestor card stays
  behind that frame;
- the 28 frames' drawn `x`, in name order: 209.966, 934.4763, 1634.5461,
  2506.8127, 3446.4016, 4168.101, 4868.1708, 5740.4374, 6664.4732,
  14201.543, 14901.6129, 15773.8795, 16725.6906, 17447.6053, 18147.6752,
  19019.9418, 19942.864, 20664.4628, 21364.5326, 22064.6024, 22937.1913,
  23657.2373, 24357.3071, 25229.5737, 26155.5262, 26875.4499, 27575.5198,
  28447.7864. They are the row the layout packs, every item's row extent
  (its frame, and an ancestor card where it reaches beyond the frame)
  starting the row gap 48 right of where the previous one ends, the rule
  the layout's own test proves with exact positions on a manifest of the
  same shape (`packages/layout/tests/README.md`, "Shared roots on one
  line"). The step of 7537.0698 from B691's EDM-alig frame to the next is
  track 2's ancestor card behind that frame, which runs far beyond it;
- every frame's drawn `y` is 28.8047, the first item's default top: an
  item hanging on a shared root stands at the row's top as one hanging on
  none, as in the layout's test (28.8046875);
- the three tracks' stretches lie apart along the row, so all three take
  the first line: each track's drawn element has four horizontal line
  parts, its once card's and the ancestor lines in the frames hanging on
  it, every one at `y` 82.0117, the layout test's 82.01171875.

**`segments.spec.ts`** (Chromium, Firefox, WebKit) proves in a browser the
refusal to delete a segment: with the schema package's `segment_line`
imported and its segment `b` selected, Delete and Backspace each show
core's refusal "Removing segment 'b' of line 'form' is not supported yet" as
the message bar's one piece of information, open no menu and leave the
journal, the selection and the root's length and segments unchanged; the
first is dismissed by its button before the second key, so each key's
refusal is seen.

**`segment-lines.spec.ts`** (Chromium) proves in a browser that a virtual
card is a segment line of its chunks (TimeToShare's `docs/drawing.md`,
section 8.10), on `flow/virtual_cards` with one virtual timeline placed
alone by one `set` of its place at (0, 200). The drawing the canvas draws
is read through the test hook (as `tunnels.spec.ts` reads it), the page's
elements by their address attributes, numbers as the writers write them
(`formatNumber`). The practice card (`allegro_by_hand`, `L` 400) draws
the numbers of section 8.10's worked example, `x0` its line's start: its
one gap line, in the fixed grey `#9CA3AF`, from `x0 + 62.40995415848069`
to `x0 + 94.40995415848069` (the gap entry `[1906, 1910]`, 0.5239… wide
at full scale, widened to the least gap width 32), the line ending at `x0
+ 244.2462344466274`; the chunks' labels `A × 4`, `4 ♩` and `C` at `x0 +
31.204977079240344`, `x0 + 78.40995415848069` and `x0 +
169.328094302554`, each with its baseline above the line's ordinate (a
segment label, no brace below the line); the boundaries of chunks 4 and
5 at the gap's two ends. With the region `motto` "Motto" over `[100,
200]` added to `allegro` (inside A) and `allegro_default` placed, the
page draws `motto` and its label once (on `allegro`'s card: the virtual
card starts stripped down); the one `style` command `{facet: regions,
inside: chunk, within: allegro_default}` → `display: inline`, the rule a
switch From the sources writes, then draws it in the windows of both
chunks playing A, over `[x(100), x(200)]` and `[x(600), x(700)]` of the
virtual card, `x(t) = x0 + 400 × t / (4241/2)`, three braces and three
labels on the page.

**`segment-ui.spec.ts`** (Chromium) proves in a browser what the inspector
and a double-click do with a virtual card's windows (section 8.10,
Windows), on `flow/virtual_cards` with `allegro_default` placed alone at
(0, 200), the region `motto` "Motto" over `[100, 200]` and the conversion
map `tempo` (a LinearMap over the whole of `allegro`) added to `allegro`,
each by one command. With `allegro_default`'s line selected, the
Properties tab's band list is headed Band, Visible and From the sources;
checking "Regions from the sources visible" journals the one `style`
`{facet: regions, inside: chunk, within: allegro_default}` → `display:
inline`, checking "Conversion maps from the sources visible" the same rule
of `conversion_maps`, each one entry, each box then checked. The drawing
the canvas draws, read through the hook, then holds within the virtual
card two drawings of `motto` (the windows of the two chunks playing A) and
four of `tempo` (a map spanning its timeline is drawn once in every
stretch piece, and `default` plays four: A, B, A, C), none before. A
double-click on the second label of `motto` on the page (the first
window's), the inspector open, opens the timeline editor of `allegro`, where `motto` is written
(`{target: {block, id: "allegro"}, kind: "timeline"}`); after Done, a
click on the label of chunk 1 (`B`) shows its facts in the Properties tab
(Entry `2 of 4`, Source `Region 'B'`), and a double-click on it opens the
flow-control editor of `allegro` (`kind: "flow"`), where its FlowMap is
edited.

**`editors.spec.ts`** (Chromium, Firefox, WebKit) proves the bundle, group
and timeline editors on `bundles` (and `groups` for a reorder) at viewport
(40, 40), with reduced motion emulated so that every viewport is compared
as soon as the canvas reports it. The open editors are read through the
hook as `{target, kind}`, outermost first, each target an address object:
`{block: "bmixed0000"}` for the bundle editor, `{block: "bmixed0000", id}`
for a group's or a timeline's. A double-click on the margin, a
frame or a card, and Enter on one selected box, opens the editor and, the
drawer having been closed, the drawer opens on the level tab, named
"Bundle", "Group" or "Timeline", whose title line names the edited
element; the viewport moves to the editor and back on Done;
outside the edited element everything is faded and inert (in
`group_1`'s editor of `bmixed0000`, `recording`'s ancestor card too),
another block as a whole through its node (`btwogroups` and `bungroup00`,
which lie on the page; `bshared000` lies below it), and a click there, as
on the pane at canvas (−20, 600), below `bmixed0000` and left of
`bungroup00`, deselects;
editors nest only inside the innermost (opening `group_2` inside
`group_1`'s editor is refused with `not_inside` at the path
`[addressKey({block: "bmixed0000", id: "group_2"})]`); Done
folds the session into one journal entry, undone as one step, Cancel asks
only when there are changes, and Escape aborts a gesture, then clears the
selection, then acts as Done; moves in the bundle editor state every item's
place; a card moved left of everything drawn grows the box left: in the
bundle editor at viewport (340, 40), `annotations`' card dragged by
(−200, 16) is stored at `{x: −192, y: <its y> + 16}`, beyond the left edge
of `recording`'s ancestor card, which lies `shift − P` left of the place
origin (`shift` the drawing's origin abscissa: `recording`'s card is
elided at the automatic proportion, which reads the pane, so `shift` is
the origin of the block's drawing at the canvas's pane, the arranger's
size with the drawer open, 1087 × 968 at the page's 1600 × 1000, which
each case using it asserts first; there it is 117.44561314174106,
layout's record at that pane, pinned, and the editor's drawing code run
outside the page gives it beside; at layout's default view it is
121.70361328125, derived in the arranger's tests README, "`bundle_mixed`'s
`score`", which the case first checks), so the node moves left by `192 − (shift − 8)`, from `−shift` to
`−200` (the moved card's edge −192 and the padding 8; the node's computed
transform compared as below, `arrangement.spec.ts`), and the frame, drawn
at `8 + shift`, lies as much further right in it; two items move together
(the frame's and the card's `rect` at `48 + shift` while the drag holds);
the items' drawn places at the pane equal those at layout's default view;
a change outside the edited element is refused (a `set` of
`group_2`'s place in `group_1`'s editor: `side_effect` at the path
`[addressKey({block: "bmixed0000", id: "group_2"})]`), and a refused
Delete shows its refusal (`excerpt` deleted in `group_2`'s editor changes
its parent `recording`, which the group does not contain: the message bar's information reads "timeline
'Recording' in bundle 'Mixed' lies outside group 'Facsimile' in bundle
'Mixed': an editor changes only what it edits", each address in its words,
core's `addressWords`); Delete pressed right after the group editor of
`group_1` has opened, the edited element selected by the opening, shows
"Close its editor to delete the edited element." and journals nothing. The
Journal tab shows a closed session as one
row (a command's row reads `Set <members> of <words of its first
target>`, "Set name of timeline 'Score' in bundle 'Mixed'", the element by
its name in the view shown, so a renamed timeline by its new name), keeps an undone entry greyed, and undoes nested and interleaved
sessions one run at a time, newest first, redoing in mirror. A
double-click outside the edited element closes the innermost editor: on
the pane at canvas (−20, 600), on `btwogroups`' faded frame `g1` (inside a
group editor, then again inside the bundle editor) and on the faded frame
`group_2` of the edited block. The
places of the bundle's items and the editor's viewport after the drawer changes the canvas's size come
from the arranger's drawing and focus code run on the fixture outside the
page, at the canvas's pane, the arranger's size measured in the page
(`bmixed0000`'s ancestor card of `recording` is elided at the automatic
proportion, which reads the pane, so the block's drawing and its bounds
differ from one pane to another): the view centres the block as drawn
for the canvas's size, the drawer open and closed; these are the expected
values of this spec computed by the code under test. A pan during the
view's move is the user's and stays: with full motion and the page's clock
paused, the bundle editor of `bmixed0000` open and the drawer closed,
opening the drawer narrows the canvas (the case waits on the canvas's own
measurement: a resize observer made then reports in the same rendering
step) and starts the view's move, which has not advanced; a wheel of 40 px
then pans the view up from where it was (its x and zoom unchanged), and
after the clock has run `PANE_SETTLE` (the pane settles, the block is drawn
again for it) and `FOCUS_DURATION` more (any move the settling started
would have ended), the viewport is exactly the panned one.

**`selection-motion.spec.ts`** (Chromium, Firefox, WebKit) proves the
selection through changes and editors on `bundles` (block `bshared000`,
`bundle_shared_parent`, its place origin at (640, 952), below the other
blocks) at viewport (40, 80 − 952), so that the block lies 40 lower on the
page than a block placed at (640, 0) at viewport (40, 40), its resize
toolbar clear of the page's header, with reduced motion emulated,
and the release of a card reorder on `groups` without it. Every gesture
is a real pointer gesture; the stored state is read through the hook.

- **A change keeps the selection**, gesture by gesture: a Box resize of
  the block by its right handle on the arranger (at viewport (−660, 80 −
  952), since the block's right edge, 1869.3358561197915 with its ancestor
  cards, lies beyond the page at the other) keeps
  `[{block: "bshared000"}]`; a Stretch of `group_2`'s frame keeps
  `[{block: "bshared000", id: "group_2"}]`, and so does its undo
  (Ctrl+Z); in the bundle editor a Box resize of the block keeps the
  block; in `group_2`'s editor a Box resize of the frame, a Properties
  `height` committed with Enter and its undo keep
  `{block: "bshared000", id: "group_2"}`; in `take_2`'s timeline editor a
  Box resize of its card keeps
  `{block: "bshared000", id: "take_2", part: ["card"]}`.
- **Opening an editor selects the edited element**, whatever was
  selected: a double-click on `group_2`'s frame gives
  `[{block: "bshared000", id: "group_2"}]`; Enter on the selected card of
  `recapitulation` gives
  `[{block: "bshared000", id: "recapitulation", part: ["card"]}]`; the
  editor of its child `recapitulation_first`, which no card draws, gives
  `[{block: "bshared000", id: "recapitulation_first"}]`.
- **A click outside the edited element deselects**: in `group_2`'s
  editor, a click on the middle of `group_1`'s faded frame and one on the
  empty pane at canvas (−20, 1550), below the block, each leave the selection empty and the
  editor open; with Shift the click on the faded frame leaves the
  selection as it was; a double-click there closes the editor.
- **A double-click on the edited element centres the view on it again**:
  after `group_2`'s editor has opened and the view has stopped moving
  (the case waits on state, never on time: until the block's `<svg>` has
  the `viewBox` of its drawing at the arranger's size, as the editor's
  drawing code draws the workspace the page holds outside the page; the
  drawer opening with the editor narrows the canvas, whose pane settles
  `PANE_SETTLE` later, and the block, whose ancestor cards are elided at a
  proportion the pane gives, is then drawn anew and, with reduced motion,
  centred again in the same task),
  the viewport moved to (40, 80 − 952) returns, after a double-click on
  `group_2`'s frame, to exactly the viewport the opening settled at, the
  editing path, the journal and the session unchanged.
- **The release of a card reorder** in `group_1`'s editor of `gchild0000`,
  `second-half`'s card dragged from its upper half to canvas y 172 and
  released: on the first animation frame after the release the copy of
  the card lies exactly where it was dropped (its client rectangle equal,
  every member, to the one read just before the release; nothing rounds
  between the two, since the copy's translation is the same number before
  and after), the card itself still hidden. The copy's motion starts only
  on the next animation frame, so this holds in every engine (in WebKit a
  motion started at the release itself had already moved the copy 16 px on
  the first frame painted after it); frame by frame the copy moves
  monotonically towards the card's new place; 90 frames later the copy is
  gone and the card is shown. Where the motion ends is the arranger's
  `releaseMotion`, pinned in its tests.
- **A member's card stretched in its timeline editor stretches every
  member**: in `score`'s timeline editor of `bmixed0000`, with `score`'s
  card selected, Stretch offers the handles right, bottom-right and bottom;
  the right handle dragged by 20 stores `group_1`'s place `{length: 420}`,
  and both member cards of `group_1`, `score`'s and `performance`'s, are
  drawn at `x` `16 + shift` (the frame's `x` 8 plus its padding `Q` 8,
  plus the origin shift of `recording`'s ancestor card at the canvas's
  pane, as above) and 565.052 wide (the SVG writer's text of
  565.052001953125: a held card of the block is `Wc(L) =
  145.052001953125 + L` wide, `W(L) − 2Q` of the item width `W(L) = s0
  + L + Mr + K + Q` (the arranger's tests README, "`bundle_mixed`'s
  `score`", Widths: `s0 = 118.29150390625` for the name column and
  `recording`'s ancestor line running on to the left, `Mr =
  26.760498046875`, half of `excerpt`'s `length` label `88 200 smp`
  beyond the shared end); the stretch adds 20 to `L` 400).
- **A stretch in the group editor grows as well as shrinks**: in
  `group_2`'s editor at viewport (−400, 80 − 952), zoom 1, a Stretch by the
  right handle of the frame, and of `recapitulation`'s card, by 60 stores
  `group_2`'s place `{length: 460}` (the content follows the pointer one
  unit of length per pixel, and the frame follows the content), by −60
  `{length: 340, width: 567.39013671875}` (the cards fit, so the frame
  keeps its width), each
  undone before the next.

**`level-tab.spec.ts`** (Chromium, Firefox, WebKit) proves the level tab on
`bundles` (block `bmixed0000`, the manifest named "Mixed", group `group_1`
"Performance", timeline `score` "Score"), the editors entered through the
hook at `{block: "bmixed0000"}`, `{block: "bmixed0000", id: "group_1"}` and
`{block: "bmixed0000", id: "score"}`. With the drawer open and Properties chosen, entering the bundle, the
group and the timeline editor keeps Properties shown while the first tab
reads "Bundle", "Group", "Timeline", the tab list reading the level's word,
Properties, Regions, Metadata, Manifest, Journal, Timestamp, Matchstamp and
Elisions in that order at every level, and Done three times gives "Arranger"
back, Properties still shown. With the drawer closed, an editor entered
shows the level tab when the drawer next opens, whether the canvas opens
it (the first editor) or the viewer does (an inner editor entered after the
viewer closed it). The level panel's title line reads "Arranger untitled"
at the top level (the fixture's workspace has the default name), "Bundle
Mixed", "Group Performance" and "Timeline Score" in the editors, the word
and the name each in its own element, set in the bundled title face: the
face named "TiLiE Plex Mono" is loaded (`document.fonts`) and is the first
family of the line's computed `font-family`, compared without quotes:
Chromium serialises a family name holding spaces in double quotes, Firefox
and WebKit without them. The spec writes a screenshot of
the level panel at each of the four levels for review; it compares none.
They are written into the test's output folder, so that folder is left
behind after a passing run too, holding the four images and no trace.

The level tab's settings (same file, at 1920 × 1080, device scale 1): two
controls stand on each arrangement, the level tab's Arrangement area
(`level-arrangement`) and the canvas's Arrange menu (`arrange-menu`, opened
from the `arrange` toggle), both the arranger's one menu, so each shows
what the other set (the buttons' `aria-pressed`, Free first) and an undo
shows in both. On `bundles` at the top level the four blocks lie free at
four distinct left edges and four distinct tops; Vertical pressed in the
Arranger tab journals one entry, stores `{direction: "vertical"}`, shows
pressed in the canvas's menu and puts the four nodes at one left edge
(four tops); Horizontal pressed in the canvas's menu shows pressed in the
tab and puts them at one top (four left edges); undo shows Vertical in
both and the nodes at one left edge again. In the bundle editor of the
imported `bundle_elided_layerit` (the first editor opens the closed drawer
on the Bundle tab) the four frames lie one under another, one drawn `x`
and four `y`; Horizontal pressed in the tab adds one entry to the session,
stores `horizontal`, shows pressed in the menu and draws the frames side
by side (four `x`, one `y`); Vertical pressed in the menu shows pressed in
the tab, stores `vertical` and draws them one under another; undo shows
Horizontal in both and the frames side by side. The manifest file's
switch: in the bundle editor of `bmixed0000` the Manifest tab's YAML text
is the schema package's `bundles/bundle_mixed.minimal.yaml` byte for
byte, Minimal ticked (a block no file wrote is written minimal);
unticked in the Bundle tab, the Manifest tab shows it unticked and the
text `bundles/bundle_mixed.yaml`; ticked again there, the text is the
minimal file and the Bundle tab shows it ticked; unticked once more, no
entry is added (settings are never journalled) and an undo leaves it
unticked. The canvas lock: on `bundles` at the top level, the canvas's
lock (`lock`) pressed (`aria-pressed` "true"), every button of the
Arranger tab's arrangement and of the canvas's Arrange menu is disabled
(four each), and a click on the tab's Vertical (forced, since it is
disabled) adds no journal entry and stores no arrangement; the lock
pressed again, all eight are enabled and Vertical journals one entry. In
the bundle editor of `bmixed0000`, locked, the Bundle tab's three
buttons and the menu's three are disabled; unlocked, enabled.

**`tab-row.spec.ts`** (Chromium, Firefox, WebKit) proves that the
inspector's tab row wraps instead of making the inspector scroll sideways,
on `bundles` with `bmixed0000` selected and the drawer opened, at device
scale 1. At a 1000 × 800 page the drawer takes its least width, `22rem`
(computed `352px`: 32 % of the editor is less), and the nine tabs read
Arranger, Properties, Regions, Metadata, Manifest, Journal, Timestamp,
Matchstamp and Elisions on three rows (three distinct tops of the tab
buttons); with each
tab chosen by a click, in that order, every one of the drawer, the
inspector's body, the tab list and the panels' scroll container has its
`scrollWidth` equal to its `clientWidth`. The widest panel there is the
Properties tab's form, whose number fields have an intrinsic width that
differs between the engines (before its columns were allowed to shrink
below it, the panels' scroll container measured 385 in Firefox and 364 in
WebKit against 352): the check runs in all three engines for that reason.
The manifest text area of the Manifest tab is not one of the four: it keeps
its lines unwrapped and scrolls them inside itself, a text control, not the
inspector. The strip stays one strip: the
selected tab alone is underlined (its bottom border `rgb(26, 26, 26)`)
whichever row it lies in, Elisions in the last row and Arranger in the
first, and the tab list's border runs under the last row (the last tab's
bottom, read in the page as `getBoundingClientRect().bottom`, equals the
list's bottom less its 1 px bottom border, both read in one evaluation:
Firefox lays out in sixtieths of a pixel, and the sum of a box's `y` and
`height` as Playwright reports them differs there from the bottom by a
rounding of the last float digit). From the focused Arranger tab,
ArrowRight eight times selects and focuses each next tab in reading order
across the rows and once more wraps to Arranger; ArrowLeft nine times
goes back the same way. At the same width, with the bundle's editor
opened through the hook (`open({block: bmixed0000})`, the innermost editor
then targeting that block), the level tab reads Bundle and holds the
widest settings (the Arrangement area and the manifest file's switches);
with each of the nine tabs, Bundle, Properties, Regions, Metadata,
Manifest, Journal, Timestamp, Matchstamp and Elisions, chosen by a click in
that order, the same four have `scrollWidth` equal to `clientWidth`. At a
2400 × 900 page the drawer takes its largest width, `40rem` (`640px`),
and the nine tabs take two rows, nothing scrolling sideways: the eight
tabs before the Regions tab measured 599.59375 in all in Chromium against
the row's 616, so the ninth no longer fits beside them.

**`bands.spec.ts`** (Chromium, Firefox, WebKit) proves a timeline's bands
as boxes of its timeline editor on `bundles` at viewport (40, 40), reduced
motion emulated. The hook reports every band drawn (its address `{id: T,
facet}`, its facet, level, elements, and its line and rectangle on the
screen); only a present band is recorded, hovered and selected. A band is
marked on hover in every view, and selected only in the innermost timeline
editor of its own timeline; elsewhere a click on it selects the card. A band is
hovered and clicked through its mark (`data-marks`, the `addressKey` of
`{id: T, facet}`), and selecting it selects `{block, id: T, facet}`.
Every timeline the fixture draws in a card holds its default timestamps
`origin` and `length`, each drawn with its wedge and its coordinate label,
so its markers band holds four elements; `score` of `bmixed0000` has three
present bands, conversion maps (level 1, two elements), markers (level
−1, four) and flow control (level −2, one). A
band order is a permutation of `line` and the five facets, the default
`children, conversion_maps, line, markers, regions, flow_control`; a drag
across the line into a gap or along its side, and Ctrl/Cmd+ArrowUp or
ArrowDown past the next visible entry, is one `set` at `{block, id: T}`
of the timeline's `order` (`null` when it equals the inherited one), one
undo step and redone: `score`'s `flow_control` band dragged between the
conversion maps band and the line gives `children, conversion_maps,
flow_control, line, markers, regions`, dragged between the line and the
markers band `children, conversion_maps, line, flow_control, markers,
regions`; a root's order change (`score` of `bshared000` to `children,
line, conversion_maps, markers, regions, flow_control`) moves a child
without an entry of its own below its line: `exposition`'s member card,
whose flow control band draws the one repeat of `score`'s tree on its
stretch (section 6.4, Gathering), has its conversion maps, markers and
flow control bands at levels 1, −1 and −2 before and −1, −2 and −3
after, and `recapitulation_first`, in one row of one band order with
`recapitulation_second` (section 6.4, Rows of one band order), has an
empty conversion maps band, present since its neighbour's is, at level 1
before and −1 after, as `recapitulation_second`'s; Escape during a drag
dispatches nothing, the wedge of `score`'s `origin` timestamp
(`timestamp_9`, in the markers band against the line: the schema fixture
numbers the `origin` and then the `length` timestamp of each timeline
drawn in a card, by ID, `annotations`, `excerpt`, `page`, `performance`,
`score`, from `timestamp_1`, so `score`'s `origin` is the ninth) moving
with the preview and back to its drawn `points`; in the bundle and group
editors and on the arranger, the pointer moved off the canvas (no band
marked) and then onto `score`'s flow control band marks that band, and a
click there selects `score`'s card, the mark staying; at a point of
`recapitulation_second`'s conversion maps band (its one band, level 1, one
element) in `bshared000`, the hover marks that band in the bundle editor,
in `group_2`'s editor and on the arranger (of the bands of the card under
the pointer, the last record holding the point: the child's band before its
parent's children band), a click there selecting `recapitulation`'s card;
in `recapitulation`'s timeline editor the point lies in the root's children
band, which the hover marks and a click selects; in
`recapitulation_second`'s editor the hover marks and a click selects its
conversion maps band; the journal unchanged throughout; and Delete with
only a band selected removes nothing. A hovered band keeps its mark only while the
pointer is on it: on the pane left of every block, at the markers band's
ordinate (canvas x −180 at viewport (240, 40), since `bmixed0000`'s ancestor
card of `recording` reaches 121.70361328125 left of its place origin at
layout's default view, and less in a narrower pane), only
the selection's mark stays.

**`flow-editor.spec.ts`** (Chromium, Firefox, WebKit) proves the flow
editor on TimeToShare's `flow/virtual_cards` imported as one block. The
first case runs at the viewport that shows the block's place at canvas
pixel (40, 40), zoom 1, read from the store, so that the card, the pane
with its five rows and the point 80 px below it lie inside the 800-px
window (at viewport (40, 40) the pane runs past the window's bottom edge,
where an engine may refuse the click on the new row's Done or the drop):
in `allegro`'s timeline editor (opened through the hook) a
double-click on the repeat end's symbol `{id: "repeat_end", part:
["symbol"]}`, which `allegro`'s flow control band draws, opens the flow editor, so the store's editing path is
the timeline editor then the flow editor of `{block, id: "allegro"}`; the
pane under the card lists four rows, `default`, `printed`, `single`,
`by_hand` (computed first, each part by name, then by ID), and axe-core reports no
violation inside it. Add + shows the new row; Enter on the first entry of
`default` stores one entry in the editor's session, `{type: "add", into:
{block, id: "allegro"}, flow_map: {chunks: ["section_a"]}}`; after the
row's Done the pane lists five rows, the first four as before, the new
FlowMap's last (it keeps the place it appeared in while the editor is
open). The row
`printed` lifted by its name and released 80 px below the pane, past the
editor's border, stores two entries: the `add` of its virtual timeline
`{map: "printed", timeline: "allegro", name: "printed"}` (named as its
row) and a `set` placing it. Back at that viewport, the pointer over the
first row's drawing, a plain wheel (`deltaY` 40) pans the canvas up by
`0.5 × 40 = 20`, as anywhere else on it; with Control held a wheel of
`deltaY` −100 zooms the canvas as
anywhere else on it (Svelte Flow's zoom on scroll with the activation key
held, `2 ^ (100 × 0.002)`), to zoom exactly `2 ^ 0.2`. Done twice
closes both editors and the journal gains exactly one entry, the timeline
editor's session holding the flow editor's. On the arranger, with no
editor open and the drawing settled at viewport (40, 40), zoom 1, a double-click
at an empty point of `allegro`'s flow control band (`bandPoint`, 2 px
clear: a press there hits `allegro`'s card) opens the flow editor alone,
the editing path `[{target: {block, id: "allegro"}, kind: "flow"}]`, its
pane shown; Done closes it with the journal unchanged (an empty session
journals nothing) and the canvas back at that viewport (the editor's
focus moved it to show the pane; the symbol is measured only once it is
back); a double-click on the repeat end's symbol then opens the same flow
editor alone. A hand-made row is edited in place: the Edit button of
`by_hand` (A A A A, a gap of 4, C) makes its row the edited one (Done and
Cancel in it, no Edit button left, none on the computed rows); Delete on
its entry 4 (the gap) stores one entry, `{type: "set", changes: [{target:
{block, id: "by_hand"}, values: {chunks: [section_a ×4, section_c]}}]}`;
the row's Done keeps it and leaves no edited row.

**`editors-flow.spec.ts`** (Chromium, Firefox, WebKit) proves the
flow-control editor's tab and its closing on `flow/virtual_cards`, imported
as one block, at viewport (40, 40), zoom 1. With the drawer opened and
Journal chosen, a double-click on a free spot of `allegro`'s flow control
band (`bandPoint`, clearance 2) gives the editing path `[{target: {block,
id: "allegro"}, kind: "flow"}]`, the tab "Flow control" selected and
focused. Its panel lists the four flow-control elements; "Repeat start" at
"100" and Add store one more entry of the open session, the manifest's
`allegro` then holding exactly one new element, at `[100, 1]`, whose
address is the whole selection; the list then has five rows, one marked
selected. In a second case a double-click on the same free spot of the
open editor's card closes it (editing path `[]`), and, opened again, a
double-click on the centre of `allegro`'s line at zoom 0.5 (the drawer,
opened with the editor, covers the canvas's right part) closes it too: the press
on the line, which the pane takes for its carrying gesture, does not stop
the double-click.

**`jumps.spec.ts`** (Chromium) proves that the Flow control tab adds jumps
with what they need, on `flow/virtual_cards` imported as one block, the
flow-control editor of `allegro` opened as in `editors-flow.spec.ts`.
`allegro`'s flow control band draws three elements before (the volta fork,
the repeat end, the volta break; the second ending's jump target has no
symbol, section 6.6 of the drawing specification). "Dal segno al fine" at
"1100", its select "Segno" holding "New segno" (the only choice:
`allegro` holds no segno) at "600" and its select "Fine" holding "New Fine"
at "1000", stores one entry of the open session (its three `add`s one
step), and `allegro` then
holds exactly three new elements, read back from the manifest and written
by IDs read there: a JumpTarget `segno` at `[600, 1]`, a Break `fine` at
`[1000, 1]` with `ends: {after: {jump: <the jump>}}`, a Jump at `[1100, 1]`
whose one destination is `{to: <the segno>, manifestation:
dal_segno_al_fine, repeat_count: 1, reset: false}`; the three are the
selection, and the band draws six elements (a segno's symbol, the Fine's
flow line, the jump's symbol and arc, section 6.4). Then "First and second
ending" at "1200", "Second ending at" "1300", "Back to" holding "Start of
the section", stores one more entry and four new elements: at `[1200, 1]` a
Jump with the destinations `{by: [0, 1], manifestation: volta, passes:
[1]}` and `{to: <the second ending>, manifestation: volta, passes: [2]}`;
at `[1300, 1]` the second ending, a JumpTarget `volta`, a Break `volta` and
a Jump `{manifestation: repeat_end, repeat_count: 1}` without a place; the
four are the selection, and the band draws nine elements (the fork, the
break's flow line and the repeat end's symbol; the jump target none).
One Ctrl+Z (Cmd+Z) on the arranger takes the whole volta set back: one
entry left, `allegro`'s flow control exactly as after the dal segno al
fine, six elements drawn; a second takes the dal segno al fine back: no
entry, the flow control as at the opening, three elements drawn.

**`editors-children.spec.ts`** (Chromium, Firefox, WebKit) proves the
children editor on `nested`, imported as one block, at viewport (40, 40),
zoom 1: a double-click on a free spot of `clt_1`'s children band gives the
editing path `[{target: {block, id: "clt_1"}, kind: "children"}]` (no
longer the timeline editor), the drawer open on the level tab "Children",
whose one row names `clt_3`; a press on it selects exactly `{block, id:
"clt_3"}`; a double-click on the centre of `clt_3`'s line, at zoom 0.5
so that it lies left of the drawer, opens its
timeline editor inside (`[children clt_1, timeline clt_3]`); Done twice
leaves no editor and the journal as long as before (nothing was changed).

**`rows.spec.ts`** (Chromium, Firefox, WebKit) proves the FlowMap rows of
the flow editor in the app, on TimeToShare's `flow/virtual_cards`
imported as one block, the flow editor of `allegro` opened on the
arranger by a double-click in its flow control band (`bandPoint`), at a
viewport of zoom 1 that shows the block's place at canvas pixel (300, 40),
so that the card, the pane and the points the drags reach left and right
of the pane lie inside the 1280 × 800 window. **The wheel**: with the
pointer over the first row's drawing, a plain wheel (`deltaY` 40) pans
the canvas up by Svelte Flow's `0.5 × 40 = 20` and a wheel with Shift held
pans it left by 20 (Svelte Flow's Shift wheel, or the canvas's own where
the browser reports it as horizontal travel), the viewport read back
exactly; the pane does not keep the wheel. **Place as card**: the button
of `printed`, then of `single`, stores one entry each: for `printed` its
virtual timeline's `add` and its place's `set` as one step (a session of
the two), for `single` (which `allegro_single` applies) the `set` alone;
both cards share one x, and
`single`'s card lies below `printed`'s by exactly `16 + h` (the row's head
and `h`, the `height` of `printed`'s row drawing, at scale 1), the
distance between their rows; while the editor is open `printed`'s card's
line lies at a height inside the pane and runs on past the pane's right
edge, so the pane does not cover all of it (a hit test cannot show it: in
an open editor what lies outside the edited element takes no pointer);
after
Done the two cards stand below the root's card, their left edges right of
its left edge, `single`'s below `printed`'s. **+ Gap**: `by_hand` edited,
"+ Gap" stores at once one `set` of its chunks, `[section_a ×4, {gap: [4,
1]}, section_c, {gap: [1144, 1]}]` (the last chunk C plays 1144), and
the gap's length input shows `1144`, focused; the handle of the gap of 4
(entry 4, near the row's start, so inside the pane however narrow the
canvas leaves it) pressed at a whole pixel and moved 40 px right shows the
flag `gap 168` (`4 + 40 × 1644 / 400 = 168.4`, rounded to whole quarters,
the pixel being 4.11 quarters) and stores nothing until released;
released, exactly one more entry, the `set` with entry 4 `{gap: [168,
1]}` and every other entry as before. **Dragging a row out**: the twin of
`printed` lifted by its name, the pointer carried to 40 px left of the
pane's left border while the twin's middle (the middle of the timeline it
draws, `(54.6396484375 + 454.6396484375) / 2` px right of the pane's left
edge) is still inside, flies back and stores nothing; carried to 60 px
inside the pane's right edge, the pointer still inside the pane and the
twin's middle past its right border, it stores one entry, a step of
exactly two commands, the virtual timeline's `add` and the `set` placing
it.

**`names.spec.ts`** (Chromium, Firefox, WebKit) proves that names are cut
and never cover a line, and that a cut name shows whole on hover
(drawing.md section 6.6), on TimeToShare's `flow/virtual_cards` imported as
one block, `allegro_default` placed at (0, 200) and, in one `set`, `allegro`
named "Allegro con brio, the first movement of the sonata in full" and the
FlowMap `by_hand` "Practice: the opening four times, a breath, then the
coda", each wider than a name's `max-width` 160. **The cards**: the names
of `allegro` and of the virtual card `allegro_default` ("Allegro, default ·
unfolded from" and the long name, cut as one text) end in `…`, and each
ends left of its card's line (the line's first part, its left edge); no
name flag is shown. With the pointer 20 px into `allegro_default`'s name,
exactly one flag shows, its text the whole name `Allegro, default · unfolded
from Allegro con brio, …` and its box filled opaque white (the canvas's
token `--tilie-flag-background`); the box holds the whole text and reaches
right past the line's start, so it covers what lies behind; the topmost
element at the pointer is still the drawn name (the flag lets the pointer
through). With the pointer off the block the flag is gone. **The flow
editor's rows**: the editor of `allegro` opened as in `rows.spec.ts` (zoom
1, the block's place at canvas pixel (300, 40)), each of the four rows'
names ends left of its row's first entry, whose left edge is its line's
start; `by_hand`'s name reads `Practice: the opening four times, …` (cut
at the pane's font size 9, arranger README "The rows' names") and carries
its whole name in `data-whole`, `default`'s none; its `::after` content is
`none` until the pointer is on the name, then the whole name on an opaque
white face.

**`embed.spec.ts`** (Chromium, Firefox, WebKit) proves the embed build in a
host page it does not own. A route serves the host page at
`http://host.test/` (its own margin, font and title "Host page", an input,
two empty 600-px slots) and forwards `/tilie/…` to the embed build, so the
editor's files reach the page from the host's origin. The host imports
`mount` from `tilie.js` and mounts `small` in the first slot and `bundles`
in the second. Each slot then shows one node per block of its workspace and
each editor's `text()` equals its fixture byte for byte; both bundled
faces, DejaVu Sans and Noto Music, are loaded (`document.fonts.check`, and
the one face of each family `loaded`) from `assets/` beside the bundle, two
`.ttf` requests answered 200, which proves the relative font URLs; no request goes to an `/api/` path and no test hook is installed. A
drag in the first slot changes that editor's text alone, and the host's
body margin (7px) and title survive it. Ctrl/Cmd+S on the host's input and
Ctrl/Cmd+Z on its body reach the host with `defaultPrevented` false, read
after every listener has run. `destroy()` leaves the first slot without
children or `data-tilie` and the second editor drawn. The page's only
level-1 heading is the host's. Without a hook, the drag starts from a
named card found on the page.

**`coordinates.spec.ts`** (Chromium, Firefox, WebKit) proves Show
coordinates on `small` at viewport (40, 40), zoom 1, one device pixel per
CSS pixel, with the toolbar's "Show coordinates" button pressed. The
points are block `map0000000`'s drawing points (layout's record, the
values the arranger's unit tests pin) placed where the arranger puts the
block's node for the fixture's drawing: `melody` (8 quarters, fraction)
at y 40.5 from 63.53662109375, 50 canvas units a quarter, its map
`tempo` (×1/2 to seconds) at y 35, its child `phrase` at y 23 with
`ticks` (×480 to ticks). The viewport's abscissa is then moved right by
less than a pixel so that `melody`'s start lies on a whole screen pixel,
and every pointer position lies a whole number of pixels from it:
Playwright hands Firefox and WebKit whole pixels only (it floors a
fractional pointer position), while Chromium takes fractions, so only
whole-pixel positions read the same coordinate in every engine; an
ordinate is rounded to a whole pixel, which decides only the line
nearest. Half a device pixel is then 0.01 quarters, and
the default granularity (denominator 2520, 3 decimals) picks the
simplest fraction within it. The flag (`coordinate-flag`) writes each
value as core's pretty text, the number, a space and its unit's pretty
unit (`♩`, `ticks`), seconds with `″` and no pretty unit after, their decimals only
where they are not zero; a map's row reads the map's name, a space and
its value (the text of the two elements, separated by white space, as
Playwright normalises it); and the footer `click to pin`. The flag holds
one part per timeline the cross-section crosses (`data-timeline`), listed
top to bottom as their lines lie, so each coordinate is read from its
timeline's part, never by its place in the flag: at `xStart + 123` on
`melody` (2.46 quarters; divisors 1 to 14 miss, 15 gives 37/15) the flag
lists `phrase` (the child the line crosses, drawn above it at y 23) and
then `melody`, exactly in that order, and `melody`'s
coordinate reads `2 7/15 ♩` and `tempo`'s row `Tempo 1.233″`
(the float 37/30 rounded to three places), with one hovered wedge and the
hovered cross-section line in two pieces (across `melody`'s card, cut
where the wedge stands); at `xStart + 200` `4 ♩` and `Tempo 2″` (the float
2.0); the same abscissa on `tempo`'s drawing still reads `melody` at 4
with `tempo`'s row highlighted (`data-hovered`); 30 below the line
nothing is within 8 pixels: no flag and no marks; on `phrase` at
263.53662109375 `2 ♩` with the row `Ticks 960 ticks`, and the root
`melody` its line crosses in the same card, `4 ♩` with the row `Tempo
2″`; exactly one row is marked primary (`data-primary`), `phrase`'s
coordinate `2 ♩`, the timeline read on.
Within one timeline's part the rows follow the drawn order too, top to
bottom: a map is drawn above its line (its drawing's ordinate `yc`,
`tempo` at 35 above `melody` at 40.5, `ticks` at 17.5 above `phrase` at
23), so at `xStart + 123` `melody`'s part lists the row of `tempo`, then
its coordinate, and `phrase`'s the row of `ticks`, then its coordinate
(rows read in DOM order, a map's by `data-map`, the coordinate's without
it); after the click that pins the reading the Timestamp tab's
Coordinates list the same rows in the same order (`tbody[data-timeline]`,
row headers `Tempo`, `coordinate` and `Ticks`, `coordinate`). The former
order, the coordinate first and its maps after, is what would be wrong.
C toggles the flag. A click on a line pins the reading: the Timestamp tab
is selected and shows the pinned timestamp's name header
(`timestamp-name`) and Properties (`timestamp-properties`), the pinned wedge and the line's two pieces stay when the pointer
leaves, and the journal keeps its length; a click on the empty pane
clears the pin and its marks and selects Properties, the tab shown
before. In the Timestamp pane the values are exact:
"coordinate of Melody" `37/15`, "Tempo of Melody" `1.2333333333333334`
(the float 37/30); while the pin is unnamed the Display toggles and
Delete are disabled. `4` typed as "coordinate of Melody" moves the pin
there (`Tempo of Melody` `2.0`), nothing journalled; the name `Four` and
Enter then journal exactly `{type: "add", into: {block: "map0000000", id:
"melody"}, timestamp: {name: "Four", coordinate: [4, 1]}}` and one ID
the store minted for it (`ids`, read from the entry), Delete and
the toggles are enabled (Wedge, Name and Line pressed, ID and
Coordinate not), the pinned marks are gone and the named timestamp, by
that ID, is drawn as an element. The inspector's top stays put: the name header is
`position: sticky` at `top: 0px` inside the panels' scroll container,
its label "Name" has `font-weight` 700, and the tab list is not inside
that scroll container; scrolled to its end, the tab list and the name
field are still in the viewport. With the drawer, closed on load, opened and the Timestamp
tab chosen, the pane's Coordinate granularity
shows "Denominator" 2520 and "Decimals" 3; typing 4 as the denominator
sets `settings.granularity` to `{denominator: 4, decimals: 3}` without a
journal entry, and the same abscissa then reads `2 1/2 ♩` (divisors 1, 2
and 4 miss 2.46 by 0.46, 0.04 and 0.04; the nearest multiple of 1/4 is
5/2); typing 0 marks the field invalid and changes nothing. A timestamp added at 4 on `melody` (through the hook, given the ID `four`) lets the
pointer through while Show coordinates is on (a click on it selects
nothing of it); with Show coordinates off a click on its wedge, its name
label or its line (its lower piece, below the name label: the upper piece
runs from the card's top past `phrase`'s line; clicked 1.5 below its top,
inside its first dash, since the line is dashed `3 3` from its top and a
gap takes no click), each at its centre rounded to a whole pixel (the
rectangle lies a hair off the drawing's points, and a floored centre
misses the one-pixel line), selects exactly `{block: "map0000000", id:
"four"}` and shows it in the Timestamp pane (Name "Four",
coordinate `4`, Delete enabled), and hovering shows no flag and no marks.

**`matchstamps.spec.ts`** (Chromium, Firefox, WebKit) proves MatchClaim
tables in the built editor on TimeToShare's table fixture
(`fixtures/tables/<version>/`: `manifest.yaml`, whose `resources` name
`match_claims.parquet`, and that Parquet file). Every `POST
/api/match-claims` is answered with the client's recording
(`packages/client/tests/data/match-claims.answer.bin`, the server's answer
for exactly this manifest and table, written by the server's
`scripts/record_answers.py`) and counted; the number of MatchClaims
is read from the recording's header (18), never restated. Importing the
manifest together with its table (Import manifest…, both files picked)
makes one block and exactly one table request; with the block selected
the Matchstamp tab's status reads "match_claims.parquet: 18 MatchClaims",
no MatchStamp is shown (the hint), and the filter lists the manifest's
four timelines as checkboxes. The workspace file never holds the table:
its text has no `claim_1`. Unchecking `cpt_1` stores the block's filter
`{timelines: ["clt_1", "clt_2", "dpt_1"], beliefs: ["true", "undecided",
"unlikely"]}` in
`settings.matchClaimFilters` and journals nothing. A MatchStamp named
through the hook (`add` of "Downbeat", one anchor [`clt_1` [0, 1],
`dpt_1` 0], `match_claims` `["claim_1"]`, given the ID `downbeat`, no
refusal) and then selected (`{block, id: "downbeat"}`) selects the Matchstamp tab, whose name
header shows "Downbeat", whose Coordinates show "coordinate of clt_1"
and "coordinate of dpt_1" as disabled fields holding `0` and `0`, each
with its "Copy the value" button, and whose MatchClaims list `claim_1`;
its live regions, the MatchClaims' status line and the name's refusal
line, are present while empty: each one `status` role in the
accessibility tree (a `display: none` element is not), empty, laid out
as a 1 × 1 px box out of the flow (`display: block`, `position:
absolute`); Remove
empties `graphical.matchstamps` in exactly one journal entry, and the
selection losing the MatchStamp lets it go, so the tab shown before it,
Properties, is selected again. Named the same way (given the IDs
`downbeat`, `downbeat_clt_1`, `downbeat_dpt_1` and `downbeat_anchor`), its match timestamp
on `clt_1` (whose children band gives its line a length) is written with
`display` `["cross_section"]`, its line only; a click on that line
(`line[data-id=<it>][data-part="line"]`, dispatched on the element, the
canvas's selection reading the element clicked) selects `{block, id:
"downbeat"}`, not the timestamp, and the Matchstamp tab is selected
with the name "Downbeat" in its name header (`matchstamp-name`). Its
Lines list, in screen order (`clt_1` drawn above `dpt_1`), the line of
the match timestamp on `clt_1`, the anchor's, then the line of the one on
`dpt_1`; Wedge on the first stores that match timestamp's `display`
`["wedge", "cross_section"]` in one journal entry. The manifest imported without its table
says nothing of the table and requests nothing: once it is imported and
selected, the Matchstamp tab's status reads "No MatchClaim table loaded.",
the message bar holds no message, no `POST /api/match-claims` was answered
and no request named `match_claims` was made at all. Importing once warned
that the named table was not loaded; that warning is gone on purpose, since
the table is loaded when Show matches needs it, silently when it is found
beside the manifest, and through the tables dialog only when it cannot be
found while a server answers (`matchclaim-loading.spec.ts`).

A potential MatchStamp on a group member is drawn as naming would store
it, its groupstamps' lines across the frames, both hovered and pinned. The
manifest is the schema package's `bundles/bundle_matchstamp_groupstamp`
(`score`, 8 quarters, a member of `group_1` beside `performance` and of
`group_2` beside `page`), imported with a table file the editor gives to
its only block; no recording of the server exists for it, so the request
is answered with `matchAnswer.ts`'s `matchClaimsAnswer` of core's
`matchClaimColumns` for three MatchClaims, `g_1` score 4 ↔ performance
1.0, `g_2` score 6 ↔ page 400 and `g_3` second-half 2 ↔ performance 3.0
(the arranger's table G; the answer's layout is the client decoder's,
ADR 0030, with no beliefs, so every claim is undecided). The page is 1600 ×
1000, the block's place origin at (80, 80), zoom 1. Every place is taken
from the page's own drawing (its workspace text read back, drawn by
`drawingOf`, placed by `nodePosition`), never from a screenshot: `score`
is drawn on two lines, in `group_1`'s and in `group_2`'s card, both at the
same abscissa for 6 (layout's `abscissaOf`), and `page` on one, in
`group_2`'s; a frame's span runs from the top of its topmost member card
to the bottom of its lowest (the drawing's card records). The overlay
paths (`svg[data-matches=<block>]`, `path[data-match=potential|hovered|pinned]`)
are read as their vertical pieces `M x y1 V y2`, and at one abscissa the
union of the pieces is compared, each number as the path writes it
(`attributeText`, 4 decimals). With Show matches on (the toolbar's
`matches` button pressed) and nothing hovered, the potential path draws
score 6 on each of its lines only: the union at its abscissa is exactly
layout's `crossSectionSegment`s there, the two of `score`'s lines and the
one of `performance`'s line, since performance 3.0 of its 4 seconds lies
at the same abscissa as score 6 of its 8 quarters. Hovering `score`'s line in
`group_2`'s card at 6 (in `group_1`'s card the connector of performance
3.0 ↔ second-half 2 runs down the same abscissa across the line, from
`performance` up to `second-half`'s row, and a pointer a fraction off the
line would hover that MatchStamp) draws the hovered path, whose union at that abscissa
is exactly both frames' spans, and at page 400's abscissa exactly
`group_2`'s span (`page` is a group member, so naming would store a
groupstamp on it too); a click there pins the MatchStamp, and once the
pointer has left for the empty pane the hovered path is gone and the
pinned one (`data-belief="undecided"`, the blue of an undecided claim)
holds the same unions. What would be wrong: a hovered or pinned
MatchStamp drawn on its lines only, as the potential overlay draws it.

**`matchclaim-beliefs.spec.ts`** (Chromium, Firefox, WebKit) proves a
MatchClaim's provenance and the user's belief end to end, on the same
fixture imported with its table. The health check is held while the
import uses the browser's picker and answered once the block exists
(`tablesServer.ts`'s `holdHealth` and `answerHealth`): only a server that
answered reads tables, records beliefs and reads events, and from then on
the workspace is saved through the server's "Save as" dialog, over an
empty root whose writes are recorded. The user is set before the page loads
(`tilie.user` `{name: "Ana", orcid: "0000-0002-1825-0097"}`), so the
user's IRI is `ME` = `https://orcid.org/0000-0002-1825-0097`, the actor
whose `true` the fixture records in `claim_1`; the clock is fixed at
2026-11-22 12:00 local time. The three routes are replayed and every
request recorded: the table route with the recording, and once a belief
was sent with the same recording whose first belief word (`claim_1`'s) is
turned `false` (the server's answer for the new table; the server's own
tests prove its beliefs); the provenance route with the fixture's entry of
`claim_1` (`stated_by` [`ME`], date 2026-11-20, method `manual`, `ME`
believing it true on 2026-11-20) and no entry for any other MatchClaim;
the events route with the events of `claim_1` written in the spec
(`clt_1` event `note_1` named "C4" ↔ `dpt_1` event `onset_1`, certainty
0.75); the belief route with other Parquet bytes than the
picked file's (the
fixture's `projections.parquet`), so a saved file equal to them proves the
editor holds and saves the answered file unchanged. A MatchStamp naming
`claim_1` ("Downbeat", as in `matchstamps.spec.ts`) is selected. The
parameters of a provenance or belief request are read in the page from the
body it sends, before the request leaves: the body is a Blob, and WebKit's
network inspector, from which Playwright takes a request's post data,
leaves a Blob body out.

1. **A MatchClaim expanded, its provenance on demand.** `claim_1` is a
   collapsed disclosure button (its beliefs hidden) and no events request
   is made; expanded, exactly one events request, and its events list the
   terms "clt_1", "dpt_1", "certainty" with "note_1 “C4”", "onset_1",
   "0.75", and its one belief "Ana believes it true (2026-11-20)".
   Exactly one provenance request, for `{claims: ["claim_1"]}`. Its
   Provenance button opens the paradata as the Metadata tab shows it (one
   reader, one set of words, one order): the terms "stated by", "method",
   "date" with the definitions "Ana" (the user's own IRI is worded by the
   user's name), "manual", "2026-11-20", and no second list of beliefs.
   The user's belief buttons hold True pressed.
2. **A belief.** False sends exactly one belief `{claim: "claim_1",
   actor: ME, belief: "false", date: "2026-11-22"}` and reads the answered
   file through the table route (two table requests in all); the status
   reads "match_claims.parquet: 18 MatchClaims, changed", False is pressed,
   the journal keeps its length, and the workspace's text has no
   `claim_2`. The index is rebuilt under the block's filter, so the named
   MatchStamp now rests on a MatchClaim the filter leaves out: the
   differences list "MatchClaims the belief filter leaves out". Save
   MatchClaims… downloads `match_claims.parquet` byte-equal to the belief
   route's answer; the status then reads "match_claims.parquet: 15
   MatchClaims" and the button is gone.
3. **New with a changed table and an unsaved workspace** asks
   "untitled.tle.json and the MatchClaim table match_claims.parquet have
   unsaved changes. Save them?"; Cancel keeps the block and the changed
   table. Asked again, Save opens "Save as" offering `untitled.tle.json`
   at the root; its Save writes exactly one file on the server,
   `untitled.tle.json` with the workspace's text as it was before New,
   and the page downloads exactly one, `match_claims.parquet` byte-equal
   to the belief route's answer; the empty workspace is then open (no
   block, file name `untitled.tle.json`).
4. **New with only the table changed** (the workspace saved first by
   Ctrl+S, through "Save as" as above: one write, `untitled.tle.json`)
   asks "The MatchClaim table match_claims.parquet has unsaved
   changes. Save them?"; Discard opens the empty workspace, and New again
   asks nothing.

**`budget.spec.ts`** (`@budget`, Chromium only) measures script time with
`grid-300` at viewport (20, 20), all nodes mounted: `ScriptDuration` from
the DevTools Protocol's performance metrics, read around 60 pointer moves
or wheel events with two frames rendered on each side, divided by 60. The
budgets are 3 ms per move for a block drag, 1 ms per move for a pan, 1 ms
per Ctrl+wheel zoom and per plain wheel pan, and 1 ms per command with a
single-block redraw within one frame; each test prints its measurement.
The coordinate flag's budget opens `small` at viewport (40, 40), zoom 1,
adds to `melody` (block `map0000000`, 8 quarters) a PiecewiseMap "Pieces"
of 10^5 breaks `8k / 99999` with a LinearMap between each two, built and
dispatched inside the page (handing the 10^5 objects from the test process
to the page took about 18 of the test's 30 seconds; the store then holds
the same manifest either way), turns Show coordinates on, and moves the pointer 200 times along `melody`'s line,
each move followed by two frames, so every move is read once: the flag
shows the map's row before and after, and the script time per move is at
most one frame at 60 Hz, 16.7 ms. The workspace of virtual cards imports
TimeToShare's `flow/virtual_cards` twice, the second copy named "Virtual
cards, copy" (a file the workspace holds already is not imported again), places the cards of its three
virtual timelines in both blocks, switches the second block's root card
to "Allegro, practice", hides that root and shows it again, with the
`style` Delete's "Hide instead" and the bundle's Timelines list write
(the root's card, its line and its bands): seven commands in the journal,
viewport (20, 20), zoom 0.5. Its budgets are 1 ms of script per pointer
move over a grid of 12 × 5 points inside each block's box on screen, each
move followed by two frames, and 1 ms per Ctrl+wheel zoom (60 events over
the first block, as above); afterwards the pointer on the label of chunk 0
of `allegro_default` in the first block draws exactly one ribbon (to the
first root's line, which is not switched), so the moves reached the
drawing. On the same workspace three more budgets hold. **A view change
with a selection runs no command**: with the drawer on Properties and the
second block's root card selected (New group enabled, so its verdict was
read), 30 plain wheel pans and 30 Ctrl+wheel zooms over the first block
cost at most 1 ms of script per event, as a pan or zoom with nothing
selected; one membership verdict applies a whole command and checks its
manifest against the schema, several milliseconds, so a verdict read again
on any event would exceed it; the journal still holds its 7 entries.
**Showing a hidden root** (the second block's `allegro` hidden by the
`style` Hide instead writes, the block selected, its row's Visible box in
the Timelines list checked, until the journal holds 9 entries, two frames
on each side) costs at most 60 ms of script (24 to 41 ms measured). **A long session**
of four rounds, each a root hidden and shown, the first root's
flow-control editor opened and closed, 50 renames of that root with its
card selected, 25 undone and 25 redone, then the pans and zooms above,
holds the same number of DOM nodes and of event listeners after rounds 2,
3 and 4 (exact: nothing the rounds mount stays mounted), and its heap in
use after three garbage collections grows by at most 4 MiB from round 2
to round 4: 2.5 MiB measured, the journal's 100 entries and the views the
store keeps, against 10.8 MiB when the store kept the view of every change
(each holding the manifest that change made), which the budget refuses. These `≤` comparisons are budgets by
definition.

**`visual.spec.ts`** (`@visual`, the pinned container only) compares
zero-tolerance screenshots: each of `small`'s five nodes and the pane at
viewport (40, 40), zoom 1, nothing selected, and the pane with `groups`
open. Before the shots both faces are forced to load and the face check above
must hold, so no baseline holds text laid out with a stand-in font. The
baselines are made and checked only in the pinned container (`pnpm
e2e:visual:update`, `pnpm e2e:visual`).
