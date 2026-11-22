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
fixtures of that version and the bundled faces' metrics, the package's own
export the editor draws with.
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
  `[data-testid="snap-guide"]` and the refusal hint `[data-testid="hint"]`.
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
| `small.tle.json` | `bare000000` (`bare`) at (0, 0), `nested0000` (`nested`) at (0, 160), `map0000000` (`map`) at (0, 320), `flow000000` (`flow_control`) at (640, 0), `styled0000` (`styled__score`: region `intro`, jump `da-capo`, C-Map `ticks`) at (640, 160) |
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
from the blocks as layout records them (the arranger's `drawingOf`, the
nodes by `nodePosition`, width × height, node from (left, top) to (right,
bottom)) so that no two nodes overlap (the narrowest gap is the 6.37109375
between `bmixed0000` and `bungroup00`, as before):

| Block | Drawing | Origin | Node |
|---|---|---|---|
| `gchild0000` | 921.898681640625 × 190.13671875 | (368, 0) | (−368, 0) to (553.898681640625, 190.13671875) |
| `ggrand0000` | 3309.265625 × 227.30859375 | (1170.56201171875, 3.1953125) | (−1170.56201171875, 284.8046875) to (2138.70361328125, 512.11328125) |
| `gmixed0000` | 1732.891295189951 × 377.640625 | (423.5276884191177, 0) | (216.47231158088232, 544) to (1949.3636067708335, 921.640625) |
| `gstyled000` | 546.1240234375 × 260.1875 | (0, 0) | (640, 0) to (1186.1240234375, 260.1875) |
| `bmixed0000` | 2106.70361328125 × 473.62890625 | (153.412109375, 0) | (−153.412109375, 0) to (1953.29150390625, 473.62890625) |
| `bshared000` | 1928.0259602864583 × 576.109375 | (698.6901041666667, 38.6484375) | (−58.69010416666674, 913.3515625) to (1869.3358561197915, 1489.4609375) |
| `bungroup00` | 527.3271484375 × 252.1640625 | (0, 0) | (0, 480) to (527.3271484375, 732.1640625) |
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
| `flow_control` | 518.256591796875 | 102.33203125 | 90.9775390625 | 8, 8, 500.256591796875, 84.33203125 |
| `styled__score` | 528.080078125 | 136.921875 | 98.080078125 | 8, 8, 510.080078125, 118.921875 |

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
`group_1` is `161.234375 + Sf` high (its title's slot 24.8046875, its
cards 78.953125 and 49.4765625, `Q` 8), so a vertical stretch by 44 sets
its spacing to `8 + 44 = 52`.

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
23.9765625 for `J = 2`; an ancestor row is `7 + 26.9765625 =
33.9765625` wide (its marks' labels fill one tier) and starts at the larger
of `p0 / 2 = 7` and the band before it plus `B = 4`. A frame is `8 + h(11)
+ 4 + Hm1 + 8 + … + 8 + Hmn + 8` high; the first item lies at `Pt = 8 +
h(11) + 8 = 28.8046875` below the title, each further one 8 below the one
before, all at `x = 8`.

- `bmixed0000`: `score` (two maps, `Ea = 11.5`; below the wedges, 4 and a
  flow control band of one jump row, `8 + 2 + h(9)`, so `Eb = 51.453125`)
  78.953125; `performance` and `page` (one map each) 49.4765625; `excerpt`
  (one map, then `recording`'s ancestor row from 10.5, `Ea = 44.4765625`)
  87.453125; `annotations` (both regions in one row, a regions band `6 + 2
  + h(9) + 4 − 4 = 18.4765625` wide, 4 beyond the wedges) 71.85546875. So
  `group_1` is 169.234375 high at `y` 28.8046875, `group_2` 177.734375 at
  206.0390625, and `annotations`' card lies at 391.7734375; the block is `8 +
  (391.7734375 + 71.85546875 + 2) = 473.62890625` high.
- `bshared000`: `exposition` (two maps, its own `cmap_2` and then its
  segment `exposition_second`'s `cmap_3`, and the boundary of
  `exposition_second`: its line reaches `11.5 + 2 + h(9) = 23.9765625`
  above, its maps and one tier of segment labels, and its conversion maps
  band at level 1 shares that room; `score`'s row from 27.9765625, `Ea =
  61.953125`) 104.9296875; `take_1` (one map and a boundary: its line
  reaches `8 + 2 + h(9) = 20.4765625` above, its boundary and one tier of
  segment labels, its conversion maps band sharing that room; no
  ancestor) 63.453125; `recapitulation` (no map, so no conversion maps
  band; the boundary of `recapitulation_second` and one tier of segment
  labels: its line reaches 20.4765625 above, and its children band, at
  level 1, starts `B` beyond, at 24.4765625; it holds the segment lines
  `recapitulation_first` and `recapitulation_second` in one row, its inner
  half 8 (their boundaries) and its outer half 20.4765625 (a boundary,
  `recapitulation_second`'s map and one tier of phrase labels), so it ends
  at 52.953125; `score`'s row from 56.953125, `Ea = 90.9296875`)
  133.90625; `take_2` (plain) 49.37890625. So `group_1` is 209.1875 high at `y` 28.8046875, `group_2`
  224.08984375 at 245.9921875, and `page`'s card lies at 478.08203125; the
  block is `8 + (478.08203125 + 49.37890625 + 2) = 537.4609375` high.

Their widths are those of the names, the ancestor lines' chevrons and the
labels at the lines' ends: maps span their lines (a plain segment's map its
segment, inside its line), and every label the bands add (segment,
phrase, region and jump labels) is centred at least 43
inside either end of its line at every length these tests use, against
half-widths of at most 32.53, so neither the start nor the right margin of
the one horizontal layout (drawing.md section 8.2) moves. Every item of
`bmixed0000` is `163.9150390625 + L` wide (563.9150390625 at 400); in
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
same `<svg>` at the same size. A text laid out with a stand-in font fails
either way (the fallback gives "Phrase" 34.79). `canvas.spec.ts` and
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
while it is selected) or, on the margin, the block; Delete and Backspace
remove the selection as one `remove`, a selected timeline marking its
descendants as affected; keys outside the arranger change nothing, arrows
nudge by 8 and 64 and the z-order keys reorder, one command each; the
canvas controls, bottom-left in the pane, are six buttons, top to bottom
Zoom in, Zoom out, Fit to view, the lock, the marquee toggle and Show
coordinates, each with its label and its title, and the arrow keys move
the focus through them in that order, wrapping, without a nudge or a
command; the zoom and fit keys; and the inspector drawer, closed on load
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
the view (`bmixed0000`'s `score`, its `flow_control` band released above
the conversion maps band: one `set` at `{block: "bmixed0000", id:
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
opened workspace is fitted while an import leaves the view, that a refused
file is shown with its problem code and leaves the open workspace, and that
the About pane names the editor, the bundled packages and the server
(offline in the test build, where no server answers the health check) and
links a notices file the build serves.

**`open-save.spec.ts`** (Chromium, Firefox, WebKit) proves Open… with a
manifest and Save in place. With the pickers deleted (the fallback path):
`bare.yaml` opened into the new, empty workspace is imported without a
question (one block); opened again, the question "Add bare.yaml to the
open workspace, or open it in a new, empty workspace?" is asked: Add makes
two blocks; New workspace downloads the unsaved workspace under
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

**`matchclaim-loading.spec.ts`** (Chromium) proves that Show matches loads
the MatchClaim table a manifest names, the table route replayed from the
client's recording (`match-claims.answer.bin`, `rows` read from its
header) and no server answering for the user's files (the test build's
health check fails): the table fixture opened from the Fixture menu, its
table served beside it, loads it on the `m` key without a dialog and with
one table request; the same manifest imported from the system, Show
matches (its toolbar button) opens "Load the MatchClaim table of The
manifest" with one group, "MatchClaim table match_claims.parquet", Load
disabled until a file is chosen, and loads the chosen file with one
request; a URL entered is fetched once and loaded; Cancel loads nothing
and adds no message. "Load MatchClaims…" in the Matchstamp tab's
MatchClaim filter, on the same imported manifest with Show matches off,
opens the same dialog with the same group and loads the chosen MatchClaim
table with one request (no file picker of its own). With the server's
files, `open-save.spec.ts` proves the table read beside the manifest. Each loaded table's status line in
the Matchstamp tab reads "match_claims.parquet: <rows> MatchClaims".

**`inspector.spec.ts`** (Chromium, Firefox, WebKit) opens the drawer on
`small` with `bare` selected, at zoom 1. The manifest text: a YAML edit is
applied as one `set` of the manifest and undone by Undo; a refused edit
shows its code, message and JSON pointer in the list "Problems" and keeps
the text. A block without a manifest file of its own opens with Minimal and
Include styling checked, so `bare`'s text, before the refused edit, equals
the schema package's fixture `bare.minimal` in pretty JSON
(`dumps(loads(fixture), {serialization: "json"})`); the edit states
`"locked": "yes"` on the root timeline, refused at `/timelines/0/locked`. For the complete and the minimal form, with the styling excluded
or included, the text shown equals the schema package's fixture file in
that form (without `graphical` unless included), Apply and Revert are
enabled exactly while it differs, the form options are locked meanwhile,
Apply stores the renamed fixture as `loadManifest` reads it, and an
unapplied text survives a visit to another tab. The tabs: each is paired
with one panel of its own through `aria-controls` and `aria-labelledby`,
and the arrow, Home and End keys move the selection and the focus over the
six tabs (the level tab, Properties, Metadata, Manifest, Journal,
Timestamp) with
and without an editor open; with the level tab chosen,
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

**`properties-fields.spec.ts`** (Chromium, Firefox, WebKit) opens the
drawer's Properties tab on `bundles`. With `group_1` selected, its frame
height stated 10 above the drawn one (one command, the field showing it)
and then `1`, typed and committed with Enter, is one command
unstating it (a `set` at `{block: "bmixed0000", id: "group_1"}` with
`place {height: null}`): the field shows the text it showed
before (the drawn height, the minimum), the block's drawn box has its
size on screen from before the first command, and the message bar shows
one information message (`data-kind="info"`, dismissed by itself after
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
and `group_3` of `annotations`, and the fieldset "Groups" shows `group_3`,
which has no name, checked.

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
requires an empty violation list in each. On `small`: the Timestamp tab
showing `bare`'s named `timestamp_1` (the selection opens the tab; its
"Wedge rotation" slider and an enabled Delete shown); the Timestamp tab
showing the unnamed pin a selected start mark gives (`{block:
"map0000000", id: "phrase", part: ["start"]}`, its "coordinate of
Phrase" field shown, Delete disabled); the Journal tab after a closed
bundle editor session on `bare` (one rename, "Plain") and a set of `x`
that is undone, the session's disclosure ("… (1 change)") expanded and
the undone entry listed (`[data-undone]`). On `bundles`: the Timestamp
tab of `bmixed0000`'s `timestamp_7`, on the group member `performance`,
showing the group "Group" with its GroupStamp toggle. With TimeToShare's
table fixture imported with its MatchClaim table (the user `Ana` with
the ORCID iD the fixture's `claim_1` belief names; the table route
replayed from the client's recording, after a belief from the same
recording with `claim_1`'s belief `false`, as `matchclaim-beliefs.spec.ts`
does; the provenance and events of `claim_1` as there; the belief route
answered by Parquet bytes): the block selected on the Matchstamp tab
(status "match_claims.parquet: 15 MatchClaims", the hint, the filter's
four timeline checkboxes); the named MatchStamp "Downbeat" (`claim_1`)
selected under Show matches, `claim_1` expanded (events "note_1 “C4”",
"onset_1", "0.75"), its provenance open ("Ana", "manual",
"2026-11-20"), the user's belief True pressed; then, after False, the
table changed ("…, changed", "Save MatchClaims…" shown, the difference
"MatchClaims the belief filter leaves out"). With the manifest imported
alone (no server for the user's files): the tables dialog "Load the
MatchClaim table of The manifest" with Load disabled, and again once a
file is chosen. The unnamed pin (the
rotation's degree readout beside its disabled slider) and the Journal tab
(an undone entry's text, time and author) are checked for contrast like
every other state.

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
   a point of the pane no block, toolbar or message covers: the arranger's
   status line reads "Pick a timeline or a region; Escape cancels.", the
   selection is still `cpt_2` alone, the arranger still carries
   `data-picking` and the composer is open. The block's node focused,
   Enter and Space each: the same status line, the same selection, still
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
segment lines), and the titles their texts. A part drawn twice
is marked selected in both copies: the start mark of `theme` in
`ggrand0000`, a member drawn below its two ancestor lines `score` and
`movement`, each of which marks its start (no line marks its own start);
and `score`'s line in `bshared000` (at the viewport showing that block,
`(40, 40 − 952)`, where `(40, 40)` showed it before it moved below the
others) is drawn as 14 parts, four as the ancestor line in each frame's
member card and three (line, start, end) in each of `score`'s two
ancestor cards; five part centres lie inside each frame, the four of its
member card and the line of the ancestor card behind it, whose start and
end lie beyond the frame's borders; a click on it selects `{block, id:
"score"}` and marks all 14. Delete removes a timeline with its subtree from its group (one `remove`
of `{block, id: T}`) and a region added into `second-half` (`region_1`,
removed as `{block, id: "region_1"}`), and refuses a selection holding the
manifest's title whole. Hover marks exactly one box
overlay, the card or the frame under the pointer (never a shadow or an
enclosing frame), at zoom 1/2 and at scale 1.5 too, and a hovered segment
boundary is marked with its card, the mark gone once the pointer is on the
empty pane at canvas (584, 600), between `bungroup00` and `btwogroups`;
`gchild0000` at scale 1.5 draws its
`<svg>` 1382.8480224609375 wide, 1.5 times its drawing's width
921.898681640625 (layout's record, the fixture table above: the frame's
553.898681640625, from `second-half`'s end mark label `16 ♩`,
18.55810546875 wide, centred at 520.61962890625 on `piece`'s line, then 8
each for the card, the frame and the block, plus the origin shift 368 of
`piece`'s ancestor card reaching left of the frame); a press on a frame selects the group;
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
drawing specification, section 8.8) on the schema package's
`groups/group_parent_both`, imported through the File menu, at zoom 1
with the block's place origin at (240, 80) on the pane, so that the card
reaching left of the frame stays on screen: the root `piece` (`Piece`, 16
quarters), whose child `middle` (`Middle`, 8 quarters at offset 4) is a
member of `group_1` beside `recording` (`Recording`, 10.0 seconds), runs on
to both sides of its member.

*Drawn by default, hidden and shown by one button.* With no rule stating
anything of it, the block draws `piece`'s ancestor card, shadow and card
addressed `{id: piece, part: [card]}`, at the layout's record (layout's
README, "Ancestor cards", case 2): the card at `x="8"` `y="18.8047"`,
`869.3354` × `63.3789` (869.33544921875 × 63.37890625 to four decimals),
the frame at `x="156.6318"` (8 + the block's origin shift
148.6318359375), `543.7036` wide, so the card reaches 148.6318359375
beyond the frame's left border and 869.33544921875 − 148.6318359375 −
543.70361328125 = 177 beyond its right one; the member cards at
`164.6318`, each `y`, width and height as without the card (`8`,
`32.8047`, `124.7578`; `543.7036` × `174.1367`, `527.7036` × `83.9531`,
`527.7036` × `49.3789`); the node at `(x − 148.6318359375, y)` of the
block's place `(x, y)` (each engine prints a transform's lengths to its own
precision, Chromium and Firefox to six significant digits, WebKit to six
decimals, so the node's transform is compared with the string the same
browser writes for `translate(<x>px, <y>px)` of the exact position, never
with one engine's rounding). The card lies behind the frame: its
rectangle precedes the frame's in the DOM. Selecting `piece` offers in
Properties the button "Hide card behind its groups" (`ancestor-card`),
enabled. Pressing it journals exactly one entry, `{type: "style", select:
{element: "ancestor_card", addresses: [{id: "piece", part: ["card"]}]},
set: {display: "none"}, blocks: [<block>]}`, and the card is gone: no
element is addressed `{id: piece, part: [card]}`, the frame and the cards
lie at `x` 8 and 16 with the same `y`, widths and heights, the node is at
the block's place `(x, y)`, which the store keeps throughout. The button
then reads "Show card behind its groups"; pressing it journals exactly one
entry, the same command with `set: {display: null}` (the block's own rule
hid the card, so Show unstates it rather than stating `inline`), and the
card and every box are drawn as before Hide. The drawing is compared,
never pixels.

*Raised by its editor.* A double-click on a point of the card left of the
frame, clear of everything drawn on it (`framePoint` of the card's
address), opens the timeline editor of `{block, id: piece}`, and the card
is raised over the frame: its rectangle now follows the frame's.

*Read by Show coordinates* (the points and values derived in the arranger's
tests README, "Show coordinates", on the same drawing). The points are
drawing points of the block placed where the arranger puts its node (the
block read back from the page's workspace text, drawn by `drawingOf` and
placed by `nodePosition`), the lines found in layout's `lineAxes` of that
drawing: the card's `piece` line (its axis carries `ancestor`) at y
67.78125 from 60.33544921875 to 860.33544921875 (0 to 16, 50 units a
quarter), the card's `middle` row (its axis carrying `ancestor`) at y
33.8046875, and `piece`'s ancestor line in `middle`'s member card (no
`ancestor`) at the same y 67.78125 from 260.33544921875 (start 4). The
viewport's abscissa is moved right by less than a pixel so that the card's
`piece` line starts on a whole screen pixel; every point lies a whole
number of units from it (Firefox and WebKit take whole pixels only) and
its ordinate is rounded to a whole pixel. With Show coordinates on, the
flag (`coordinate-flag`) holds one part per timeline (`data-timeline`),
top to bottom, each headed by its timeline's name, and the hovered row
carries `data-hovered="true"`:

| Point (drawing) | Arranger | `piece`'s timeline editor open, the card raised |
|---|---|---|
| (110.33544921875, 67.78125), the card's `piece` line left of the frame | parts `piece` alone, `1 ♩` (50 / 800 × 16), hovered | — |
| (760.33544921875, 67.78125), the card's `piece` line right of the frame | parts `piece` alone, `14 ♩`, hovered | — |
| (460.33544921875, 67.78125), `piece`'s ancestor line in `middle`'s card | parts `piece`, `middle`: `piece` `8 ♩` hovered (the ancestor's row), `middle` `4 ♩` | parts `middle`, `piece` (the card's `middle` row lies above its `piece` line): `piece` `8 ♩` hovered, `middle` `4 ♩` |
| (460.33544921875, 33.8046875), the card's `middle` row inside the frame | no flag: the frame covers the card there | parts `middle`, `piece`: `middle` `4 ♩` hovered, `piece` `8 ♩` |

So the card is read beyond the frame's borders, never through the frame,
and everywhere while it is raised; an ancestor line in a member's card is
read as its ancestor's. The raised card is opened through the hook
(`enter`), the viewport set back to the one measured.

**`segments.spec.ts`** (Chromium, Firefox, WebKit) proves in a browser the
refusal to delete a segment: with the schema package's `segment_line`
imported and its segment `b` selected, Delete and Backspace each show
core's refusal "Removing segment 'b' of line 'form' is not supported yet" in
the status line, open no menu and leave the journal, the selection and the root's length and
segments unchanged; the status line clears on the next stored command.

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
origin (`shift` the drawing's origin abscissa, 153.412109375, derived in
the arranger's tests README, "`bundle_mixed`'s `score`": `recording`'s line
in the card starts at −73.70849609375, the card's edge its name column
71.70361328125 further left, at −145.412109375, the block's edge the padding
8 beyond; the spec holds it as the constant `MIXED_SHIFT`, never read from
the layout), so the node moves left by `192 − (shift − 8)` = 46.587890625 and
the frame, drawn at `8 + shift` (`161.4121`), lies as much further right
in it; two items move together (the frame's and the card's `rect` at
`48 + shift`, written `201.4121`, while the drag holds); a change outside the edited element is refused (a `set` of
`group_2`'s place in `group_1`'s editor: `side_effect` at the path
`[addressKey({block: "bmixed0000", id: "group_2"})]`), and a refused
Delete shows its refusal (`excerpt` deleted in `group_2`'s editor changes
its parent `recording`, which the group does not contain: the status line reads "timeline
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
page; these are the expected values of this spec computed by the code under test.

**`selection-motion.spec.ts`** (Chromium, Firefox, WebKit) proves the
selection through changes and editors on `bundles` (block `bshared000`,
`bundle_shared_parent`, its place origin at (640, 952), below the other
blocks) at viewport (40, 80 − 952), so that the block, `score`'s ancestor
cards reaching 38.6484375 above its place origin, lies 40 lower on the
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
  after `group_2`'s editor has opened and the view has stopped moving,
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
  drawn at `x` `169.4121` (16 plus the origin shift 153.412109375 of
  `recording`'s ancestor card, derived above) and 567.915 wide (the SVG writer's text of
  567.9150390625: at length 400 every card of the block is 547.9150390625
  wide, set by `excerpt`'s end mark label `132 300 smp`, 59.2470703125
  wide, centred at 526.29150390625, so its right edge lies at
  555.9150390625; the card padding `K` 8 beyond it is the cards' right
  edge 563.9150390625, and less the card's `x` 16 (the frame's `x` 8 plus
  its padding `Q` 8) that is 547.9150390625; the stretch adds 20).
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
Properties, Metadata, Manifest, Journal and Timestamp in that order at
every level, and Done three times gives "Arranger"
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

**`bands.spec.ts`** (Chromium, Firefox, WebKit) proves a timeline's bands
as boxes of its timeline editor on `bundles` at viewport (40, 40), reduced
motion emulated. The hook reports every band drawn (its address `{id: T,
facet}`, its facet, level, elements, and its line and rectangle on the
screen); only a present band is recorded, offered, hovered and selected,
and only in the innermost timeline editor of its own timeline. A band is
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
without an entry of its own below its line; Escape during a drag
dispatches nothing, the wedge of `score`'s `origin` timestamp
(`timestamp_9`, in the markers band against the line: the schema fixture
numbers the `origin` and then the `length` timestamp of each timeline
drawn in a card, by ID, `annotations`, `excerpt`, `page`, `performance`,
`score`, from `timestamp_1`, so `score`'s `origin` is the ninth) moving
with the preview and back to its drawn `points`; no band is offered in
the bundle or group editor or on the arranger; and Delete with only a band
selected removes nothing. A hovered band keeps its mark only while the
pointer is on it: on the pane left of every block, at the markers band's
ordinate (canvas x −180 at viewport (240, 40), since `bmixed0000`'s ancestor
card of `recording` reaches 153.412109375 left of its place origin), only
the selection's mark stays.

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
(the float 37/30 rounded to three places), with one hovered wedge and one
hovered cross-section line; at `xStart + 200` `4 ♩` and `Tempo 2″` (the float
2.0); the same abscissa on `tempo`'s drawing still reads `melody` at 4
with `tempo`'s row highlighted (`data-hovered`); 30 below the line
nothing is within 8 pixels: no flag and no marks; on `phrase` at
263.53662109375 `2 ♩` with the row `Ticks 960 ticks` and no `tempo` row.
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
(`timestamp-name`) and Properties (`timestamp-properties`), the pinned wedge and line stay when the pointer
leaves, and the journal keeps its length; a click on the empty pane
clears the pin and its marks and selects Properties, the tab shown
before. In the Timestamp pane the values are exact:
"coordinate of Melody" `37/15`, "Tempo of Melody" `1.2333333333333334`
(the float 37/30); while the pin is unnamed the Display toggles and
Delete are disabled. `4` typed as "coordinate of Melody" moves the pin
there (`Tempo of Melody` `2.0`), nothing journalled; the name `Four` and
Enter then journal exactly `{type: "add", into: {block: "map0000000", id:
"melody"}, timestamp: {name: "Four", coordinate: [4, 1]}}`, Delete and
the toggles are enabled (Wedge, Name and Line pressed, ID and
Coordinate not), the pinned marks are gone and the named timestamp
`timestamp_3` (after `melody`'s default `origin` and `length`) is drawn as
an element. The inspector's top stays put: the name header is
`position: sticky` at `top: 0px` inside the panels' scroll container,
its label "Name" has `font-weight` 700, and the tab list is not inside
that scroll container; scrolled to its end, the tab list and the name
field are still in the viewport. With the drawer, closed on load, opened and the Timestamp
tab chosen, the pane's Coordinate granularity
shows "Denominator" 2520 and "Decimals" 3; typing 4 as the denominator
sets `settings.granularity` to `{denominator: 4, decimals: 3}` without a
journal entry, and the same abscissa then reads `2 1/2 ♩` (divisors 1, 2
and 4 miss 2.46 by 0.46, 0.04 and 0.04; the nearest multiple of 1/4 is
5/2); typing 0 marks the field invalid and changes nothing. A timestamp added at 4 on `melody` lets the
pointer through while Show coordinates is on (a click on it selects
nothing of it); with Show coordinates off a click on its wedge, its name
label or its line, each at its centre rounded to a whole pixel (the
rectangle lies a hair off the drawing's points, and a floored centre
misses the one-pixel line), selects exactly `{block: "map0000000", id:
"timestamp_3"}` and shows it in the Timestamp pane (Name "Four",
coordinate `4`, Delete enabled), and hovering shows no flag and no marks.

**`matchstamps.spec.ts`** (Chromium, Firefox, WebKit) proves MatchClaim
tables in the built editor on TimeToShare's table fixture
(`fixtures/tables/<version>/`: `manifest.yaml`, whose `resources` name
`match_claims.parquet`, and that Parquet file). Every `POST
/api/match-claims` is answered with the client's recording
(`packages/client/tests/data/match-claims.answer.bin`, the server's answer
for exactly this manifest and table, written by the server's
`scripts/record_answers.py`) and counted; the number of MatchClaims
is read from the recording's header (15), never restated. Importing the
manifest together with its table (Import manifest…, both files picked)
makes one block and exactly one table request; with the block selected
the Matchstamp tab's status reads "match_claims.parquet: 15 MatchClaims",
no MatchStamp is shown (the hint), and the filter lists the manifest's
four timelines as checkboxes. The workspace file never holds the table:
its text has no `claim_1`. Unchecking `cpt_1` stores the block's filter
`{timelines: ["clt_1", "clt_2", "dpt_1"], beliefs: ["true", "undecided",
"unlikely"]}` in
`settings.matchClaimFilters` and journals nothing. A MatchStamp named
through the hook (`add` of "Downbeat", one anchor [`clt_1` [0, 1],
`dpt_1` 0], `match_claims` `["claim_1"]`, no refusal) and then selected
(`{block, id: "matchstamp_1"}`) selects the Matchstamp tab, whose name
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
Properties, is selected again. Named the same way, its match timestamp
on `clt_1` (whose children band gives its line a length) is written with
`display` `["cross_section"]`, its line only; a click on that line
(`line[data-id=<it>][data-part="line"]`, dispatched on the element, the
canvas's selection reading the element clicked) selects `{block, id:
"matchstamp_1"}`, not the timestamp, and the Matchstamp tab is selected
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
found (`matchclaim-loading.spec.ts`).

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
fixture imported with its table. The user is set before the page loads
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
   reads "match_claims.parquet: 15 MatchClaims, changed", False is pressed,
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
   table. Asked again, Save downloads exactly two files in this order:
   `untitled.tle.json` with the workspace's text as it was before New,
   then `match_claims.parquet` byte-equal to the belief route's answer;
   the empty workspace is then open (no block, file name
   `untitled.tle.json`).
4. **New with only the table changed** (the workspace saved first by
   Ctrl+S) asks "The MatchClaim table match_claims.parquet has unsaved
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
most one frame at 60 Hz, 16.7 ms. These `≤` comparisons are budgets by
definition.

**`visual.spec.ts`** (`@visual`, the pinned container only) compares
zero-tolerance screenshots: each of `small`'s five nodes and the pane at
viewport (40, 40), zoom 1, nothing selected, and the pane with `groups`
open. Before the shots both faces are forced to load and the face check above
must hold, so no baseline holds text laid out with a stand-in font. The
baselines are made and checked only in the pinned container (`pnpm
e2e:visual:update`, `pnpm e2e:visual`).
