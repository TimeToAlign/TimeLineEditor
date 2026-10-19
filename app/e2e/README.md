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
fixtures of that version and the bundled face's metrics, the package's own
export the editor draws with.
`support.ts` holds every helper more than one spec uses: opening a fixture,
reading the hook, selecting, closing an editor, the inspector's tabs and
panels, the marks, the points a gesture aims at and the gestures
themselves. A block's drawn structure (frames, cards, titles and lines) is
read from the hook's container records, and an address is built or taken
apart only by core's and the arranger's own functions. The hook's type is
the editor's own, imported, never copied.

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
  `[data-testid="block"]`, drawn elements
  `[data-address="<address>"]` inside their node (one rule in every
  manifest: a timeline or a group by its bare id, every other element by
  `<root id>/<element id>`, the manifest's title by `name`; parts append
  `/start`, `/end`, `/name`, `/label` or `/card`), a selected part's
  `[data-selected]`, the overlays, each a `.tilie-mark` with `data-mark`
  (`selection`, `hover` or `holding`), `data-marks` the address it marks
  and `data-box` the box's kind (`box`, `frame`, `card`, `band`; none on a
  boundary's mark), `[data-affected]`, `[data-contains-selection]` on a
  block's node, the mode buttons `[data-testid="mode-scale"
  | "mode-box" | "mode-stretch"]` and the canvas controls' `[data-testid="lock"
  | "marquee"]` with `aria-pressed`,
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
node, tenths down and twentieths across, and when no raster point is clear,
every second pixel, rows from the top; `framePoint` searches a named box,
a frame or a card, the same way: a frame's title row, the frame's only
clear strip once its cards cover the rest, may lie between the raster's
rows); a click on an element aims at the centre of its first
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
568.08642578125 × 377.640625, 544.693603515625 × 260.1875) do not
overlap at those positions, and all four lie inside a 1600 × 1000 page at
viewport (40, 40), zoom 1. The bundle workspace holds every synthetic manifest
of `bundles/` (boxes 580.484619140625 × 473.62890625, 585.39013671875 ×
537.4609375, 525.896728515625 × 252.1640625).

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

The items of the two bundles with frames lie at their default places
(drawing.md sections 6.4, 6.5, 8.4 and 8.6, `v = 1`), derived from the
fixture and the font alone. A member drawing is `Hm = y_root + max(Eb,
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
  206.0390625, and `annotations/card` lies at 391.7734375; the box is `8 +
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
  224.08984375 at 245.9921875, and `page/card` lies at 478.08203125; the
  box is `8 + (478.08203125 + 49.37890625 + 2) = 537.4609375` high.

Their widths are those of the names, the ancestor lines' chevrons and the
labels at the lines' ends: maps span their lines (a plain segment's map its
segment, inside its line), and every label the bands add (segment,
phrase, region and jump labels) is centred at least 43
inside either end of its line at every length these tests use, against
half-widths of at most 32.53, so neither the start nor the right margin of
the one horizontal layout (drawing.md section 8.2) moves. Every item of
`bmixed0000` is `162.484619140625 + L` wide (562.484619140625 at 400); in
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
  `spacing` from top and bottom, both from a corner; floors 8 and 1/4.
- A nudge moves by one grid step (8), with Shift eight steps (64), and the
  result snaps to the grid.

## The bundled face

A drawn text's width is defined by the drawing: the sum of its code points'
advances in the bundled face's advance table times the font size over 2048,
kerning off, a dyadic fraction exact as a double ("Phrase" at 11 px is
(1235 + 1298 + 842 + 1255 + 1067 + 1260) × 11 / 2048 = 37.36669921875).
Each engine stores it in its own precision: WebKit exactly, Chromium
rounded up to its 1/64 px layout unit (37.375). Firefox stores values up to
6e-4 px off by a rule no rounding grid reproduces, so there the expected
width is the same string laid out afresh, after the face has loaded, in the
same `<svg>` at the same size. A text laid out with a stand-in font fails
either way (the fallback gives "Phrase" 34.79). `canvas.spec.ts` and
`visual.spec.ts` require every text to pass.

## The specs

Each paragraph states what the spec proves and where its expected values
come from; the literals themselves are in the spec, each derived from the
fixtures, the drawing facts and the gesture rules above.

**`canvas.spec.ts`** (Chromium, Firefox, WebKit) proves the canvas with the
mouse and the keyboard on `small` at viewport (40, 40), zoom 1, page 1600 ×
1000: opening draws one node per block, the fixture menu loads `small` as
the hook does, and every text is in the bundled face; a drag is one `set`
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
canvas controls, the zoom and fit keys, and the inspector drawer, closed on
load and opening beside the pane without moving the view. Every expected
journal entry is written out whole and compared with the journal.

**`resize.spec.ts`** (Chromium, Firefox, WebKit) proves the three resize
modes on `small` after two moves place `bare` and `nested` clear of every
other block (journal 7, viewport (300, 40)): the keys 1 to 3 and the mode
buttons choose a mode and show its handles (four corners for scale, eight
for box and stretch) and the mode survives a change of selection; for a
table of handle drags in every mode the stored placement is the one the
resize rules derive from the drawn box and the drag, with the opposite edge
exactly put, one `set` journalled on release and none for a drag that
changes no stored value; box keeps the content's own size below its extent,
stretch solves the floor and the kink of `nested`'s height exactly, a resize
held in the edge zone pans and follows the pointer, and undo restores the
placement exactly. On `bundles` a frame's corner scales the group alone,
and a member's card keeps its margin in proportion while its group
shortens again.

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
the view.

**`files.spec.ts`** (Chromium, Firefox, WebKit) takes the fallback path every
engine offers: the pickers are deleted before the page loads, so a file is
read through the file chooser and written as a download. The gate is the
round trip: a new workspace, an imported `bare.json` placed at the view's
centre snapped to the grid, a drag and a stretch (three entries), then
Ctrl/Cmd+S, whose download equals the hook's `text()` and clears the
file name's unsaved mark, Open of that file, which restores the journal
and the same text, and Save again, which writes the same bytes. Further cases prove that an
opened workspace is fitted while an import leaves the view, that a refused
file is shown with its problem code and leaves the open workspace, and that
the About pane names the editor, the bundled packages and the server
(offline in the test build, where no server answers the health check) and
links a notices file the build serves.

**`inspector.spec.ts`** (Chromium, Firefox, WebKit) opens the drawer on
`small` with `bare` selected, at zoom 1. The manifest text: a YAML edit is
applied as one `set` of the manifest and undone by Undo; a refused edit
shows its code, message and JSON pointer in the list "Problems" and keeps
the text; for the complete and the minimal form, with the styling excluded
or included, the text shown equals the schema package's fixture file in
that form (without `graphical` unless included), Apply and Revert are
enabled exactly while it differs, the form options are locked meanwhile,
Apply stores the renamed fixture as `loadManifest` reads it, and an
unapplied text survives a visit to another tab. The tabs: each is paired
with one panel of its own through `aria-controls` and `aria-labelledby`,
and the arrow, Home and End keys move the selection and the focus with and
without an editor open. The properties form: a value moves the block by
exactly that amount, the fields follow a drag and a resize live (rounded to
two decimals) and show the stored values afterwards, an arrow-key step applies
at once as one command, Escape restores the stored values, and on
`bundles` the form edits a frame's and a card's places, never the block's,
following a frame's Stretch live in the bundle editor. The heading names
what is inspected: a timeline, a bundle, a group, a card's timeline, and
the anonymous bundle of a manifest without a name.

**`a11y.spec.ts`** (Chromium, Firefox, WebKit) runs axe-core on the page
with `small` open and requires an empty violation list on the canvas, with
an element selected, with the drawer open, on both of the drawer's tabs
inspecting a timeline, with the File menu, the About dialog and the
discard question open. Tab reaches the nodes in z-order, Enter selects the
focused one and Escape clears the selection.

**`culling.spec.ts`** (Chromium, Firefox, WebKit) proves that culling is off
below its threshold, so `grid-300` mounts all 300 nodes at any viewport,
and on above it: with `grid-900` at viewport (−2000, −100) exactly the
nodes whose boxes overlap the shown rectangle by a positive area are
mounted, counted from the grid's formula for the pane's actual size (the
formula itself pinned by a worked example).

**`groups.spec.ts`** (Chromium, Firefox, WebKit) proves manifests holding
groups on the canvas, `groups` and `bundles` at viewport (40, 40). The
drawn structure of every block (frames, titles, cards and lines in DOM
order) equals the order of `docs/drawing.md` section 8.5 applied to the
fixture by hand, and the titles their texts. A part drawn twice, a member's
line or an ancestor line in two frames, is marked selected in every copy.
Delete removes a timeline with its subtree from its group, and refuses a
selection holding the manifest's title whole. Hover marks exactly one box
overlay, the card or the frame under the pointer (never a shadow or an
enclosing frame), at zoom 1/2 and at scale 1.5 too, and a hovered segment
boundary is marked with its card; a press on a frame selects the group;
a click on a member's line marks its card and frame as holding the
selection and the block dotted, each in its stated colour. A stretch keeps
the margin a box resize added in proportion. Through the File menu, the
schema package's `group_styled` and `bundle_mixed` are imported and
exported byte for byte.

**`segments.spec.ts`** (Chromium, Firefox, WebKit) proves in a browser the
refusal to delete a segment: with the schema package's `segment_line`
imported and its segment `b` selected, Delete and Backspace each show
core's refusal "Removing segment b of line form is not supported yet" in
the status line, open no menu and leave the journal, the selection and the root's length and
segments unchanged; the status line clears on the next stored command.

**`editors.spec.ts`** (Chromium, Firefox, WebKit) proves the bundle, group
and timeline editors on `bundles` (and `groups` for a reorder) at viewport
(40, 40), with reduced motion emulated so that every viewport is compared
as soon as the canvas reports it. The open editors are read through the
hook as `{target, kind}`, outermost first. A double-click on the margin, a
frame or a card, and Enter on one selected box, opens the editor and the
Editor tab names it; the viewport moves to the editor and back on Done;
outside the edited element everything is faded and inert, another block as
a whole through its node; editors nest only inside the innermost; Done
folds the session into one journal entry, undone as one step, Cancel asks
only when there are changes, and Escape aborts a gesture, then clears the
selection, then acts as Done; moves in the bundle editor state every item's
place, a card moved left of the padding grows the box left, two items move
together, a change outside the edited element is refused, and a refused
Delete shows its refusal. The Journal tab shows a closed session as one
row, keeps an undone entry greyed, and undoes nested and interleaved
sessions one run at a time, newest first, redoing in mirror. A
double-click outside the edited element closes the innermost editor. The
places of the bundle's items and the editor's viewport after the drawer
changes the canvas's size come from the arranger's drawing and focus code
run on the fixture outside the page; that is the one case in the suite
whose expected values are computed by the code under test.

**`bands.spec.ts`** (Chromium, Firefox, WebKit) proves a timeline's bands
as boxes of its timeline editor on `bundles` at viewport (40, 40), reduced
motion emulated. The hook reports every band drawn (address, kind, level,
elements, and its line and rectangle on the screen); only a present band
is recorded, offered, hovered and selected, and only in the innermost
timeline editor of its own timeline. A band is hovered and clicked through
its mark; a drag across the line into a gap or along its side, and
Ctrl/Cmd+ArrowUp or ArrowDown past the next visible entry, is one `set` of
the timeline's `order` (`null` when it equals the inherited one), one undo
step and redone; a root's order change moves a child without an entry of
its own; Escape during a drag dispatches nothing; no band is offered in
the bundle or group editor or on the arranger; and Delete with only a band
selected removes nothing.

**`embed.spec.ts`** (Chromium, Firefox, WebKit) proves the embed build in a
host page it does not own. A route serves the host page at
`http://host.test/` (its own margin, font and title "Host page", an input,
two empty 600-px slots) and forwards `/tilie/…` to the embed build, so the
editor's files reach the page from the host's origin. The host imports
`mount` from `tilie.js` and mounts `small` in the first slot and `bundles`
in the second. Each slot then shows one node per block of its workspace and
each editor's `text()` equals its fixture byte for byte; the bundled face
is loaded (`document.fonts.check`, and the one face of that family
`loaded`) from `assets/` beside the bundle, which proves the relative font
URL; no request goes to an `/api/` path and no test hook is installed. A
drag in the first slot changes that editor's text alone, and the host's
body margin (7px) and title survive it. Ctrl/Cmd+S on the host's input and
Ctrl/Cmd+Z on its body reach the host with `defaultPrevented` false, read
after every listener has run. `destroy()` leaves the first slot without
children or `data-tilie` and the second editor drawn. The page's only
level-1 heading is the host's. Without a hook, the drag starts from a
named card found on the page.

**`budget.spec.ts`** (`@budget`, Chromium only) measures script time with
`grid-300` at viewport (20, 20), all nodes mounted: `ScriptDuration` from
the DevTools Protocol's performance metrics, read around 60 pointer moves
or wheel events with two frames rendered on each side, divided by 60. The
budgets are 3 ms per move for a block drag, 1 ms per move for a pan, 1 ms
per Ctrl+wheel zoom and per plain wheel pan, and 1 ms per command with a
single-block redraw within one frame; each test prints its measurement.
These `≤` comparisons are budgets by definition.

**`visual.spec.ts`** (`@visual`, the pinned container only) compares
zero-tolerance screenshots: each of `small`'s five nodes and the pane at
viewport (40, 40), zoom 1, nothing selected, and the pane with `groups`
open. Before the shots the face is forced to load and the face check above
must hold, so no baseline holds text laid out with a stand-in font. The
baselines are made and checked only in the pinned container (`pnpm
e2e:visual:update`, `pnpm e2e:visual`).
