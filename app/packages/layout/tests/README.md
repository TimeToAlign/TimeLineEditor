# `@timetoalign/tilie-layout` tests

`draw(manifest, placement, layers, metrics)` returns the drawing of one
TimeSkeleton manifest as timeskeleton's drawing specification defines it
(`docs/drawing.md` in the timeskeleton repository, "the specification"
below, sections 1 to 6). The tests prove it from the specification, never
from the code's own output: every expected number below is derived here by
hand from the specification's formulas and the font's advance widths, and
the arithmetic is written out. Manifests are loaded from the 0.4.0 fixtures
of the installed schema package or built through core's commands; none is
written by hand. The metrics are the package's
`fonts/dejavu-sans-2.37.metrics.json`. All comparisons are exact (`toBe`,
`toEqual`); no tolerance anywhere.

"The default layers" means `[DEFAULT_LAYER]`, plus the manifest's own
`graphical` block when it has one; "the default placement" is
`{length: 400, spacing: 1, width: null, height: null, order: ["children",
"maps", "regions", "flow"]}`.

## Font measures (`metrics.test.ts`)

From the metrics file (`units_per_em` 2048, `ascender` 1901, `descender`
483, `fallback` 1229): the file holds 5918 advances; `♩` (9833) is 966,
`0` (48) 1303, space (32) 651. Then:

- `w("0 ♩", 9) = (1303 + 651 + 966) × 9 / 2048 = 26280 / 2048 = 12.83203125`;
- `w("16 ♩", 9) = 4223 × 9 / 2048 = 18.55810546875`;
- an unmapped code point (U+E000, U+4E00) counts 1229 and is listed:
  `w("\u{E000}", 2048) = 1229`, and the measure's `unmapped` holds 57344;
- a code point from U+0000 to U+001F becomes a space before it is measured:
  `cleanText("a\tb\u0000")` is `"a b "`, and `w("\t", 2048) = 651` once
  cleaned;
- `a(9) = 1901 × 9 / 2048 = 8.35400390625`,
  `d(9) = 483 × 9 / 2048 = 2.12255859375`,
  `h(9) = 2384 × 9 / 2048 = 10.4765625`, `h(11) = 12.8046875`.
- Every text width in the drawings below equals `A × s / 2048` for the sum
  `A` of its advances, recomputed in the test from the metrics file, for
  every name and label of every 0.4.0 fixture at the default placement.

## The default layer (`defaults.test.ts`)

`DEFAULT_LAYER` deep-equals the JSON block of section 4, parsed out of the
specification itself (the first fenced `json` block under "## 4.
Defaults").

## Hand-derived drawings (`examples.test.ts`)

Common values: `P = 8`, `G = 8`, `B = 4 × v`, `h(9) = 10.4765625`,
`a(9) = 8.35400390625`, `d(9) = 2.12255859375`, `h(11) = 12.8046875`,
`(a(11) − d(11)) / 2 = (20911 − 5313) / 4096 = 3.80810546875`. The root's
stroke width `w` is 3 (default `timeline` statement), so a wedge's tip lies
`w / 2 = 1.5` out and its base `14.5` out, and the wedge band with one tier
reaches `1.5 + 13 + 2 + 10.4765625 = 26.9765625`. Wedge labels in tier 1
start `16.5` out, so below their baseline is `y_root + 16.5 + a(9)`.
Children and maps lie above, everything else below (section 4).

### `bare`

Root `bare`, quarters, length 8, name `Bare` (`A = 1405 + 1255 + 842 + 1260
= 4762`). `N = 4762 × 11 / 2048 = 25.5771484375`. Labels `0 ♩` (u 0) and
`8 ♩` (u 1), each 12.83203125 wide, ask for at most `8 + 6.416015625` of
`x0`, so `x0 = 8 + N + 8 = 41.5771484375`; `Xe = x0 + 400 = 441.5771484375`.
No band above, so `y_root = max(8 + 0, 8 + 12.8046875 / 2) = 14.40234375`;
below one wedge band, `Eb = 26.9765625`, `Hc = 14.40234375 + 26.9765625 + 8 =
49.37890625`. Wedges: tip 15.90234375, base 28.90234375. Labels' baseline
`14.40234375 + 16.5 + 8.35400390625 = 39.25634765625`. Name baseline
`14.40234375 + 3.80810546875 = 18.21044921875`. `Wc = 8 + (441.5771484375
+ 6.416015625) = 455.9931640625`. The elements are, in order: block
(455.9931640625 × 49.37890625), `bare` (xs 41.5771484375, xe
441.5771484375, y 14.40234375), `bare/start`, `bare/end`, `bare/name`,
`bare/start/label` (coordinate 0 quarters), `bare/end/label` (coordinate 8
quarters). `unmapped` is empty.

### `nested`

Root `tl:24` length 16; child `tl:23` at 4, length 8 (4 to 12); its child
`tl:22` at 3/2, length 2 (11/2 to 15/2 on the root's axis). Names
`tl:2x` have `A = 803 + 569 + 690 + 1303 + 1303 = 4668`, width
`25.072265625`. `x0 = 8 + 25.072265625 + 8 = 41.072265625` (the `16 ♩`
label, 18.55810546875 wide, at u 1 asks nothing), `x(t) = x0 + 25 t`.
`tl:23` takes above row 1 (minimum `0 + 1`); `tl:22` row 2 (minimum `1 + 1`).
`pc = max(14, 12.8046875) = 14`; the children band is the first above and
starts at `h(11) / 2 = 6.40234375`, so `Ea = 6.40234375 + 2 × 14 =
34.40234375`, `y_root = 42.40234375`. `tl:23`: xs 141.072265625, xe
341.072265625, y `42.40234375 − 6.40234375 − 7 = 29`; `tl:22`: xs
178.572265625, xe 228.572265625, y 15. `Hc = 42.40234375 + 26.9765625 + 8
= 77.37890625`. Name descriptors run top-down: `tl:22` at baseline
18.80810546875, `tl:23` at 32.80810546875 and `tl:24` at 46.21044921875.
`Wc = 8 + 441.072265625 +
9.279052734375 = 458.351318359375`.

### `flow_control`

Root `flow:quarters` length 16, name `Flow control` (`A = 12470`,
`N = 66.9775390625`), `x0 = 82.9775390625`, `x(t) = x0 + 25 t`. Break at 12
(label `Fine`, `A = 4305`, width 18.91845703125), jump from 8 to 2 (label
`Repeat`, `A = 7301`, width 32.08447265625), both below. Below: wedge band to
26.9765625, flow band from `26.9765625 + 4 = 30.9765625`, one level, width
`8 + 0 + 2 + 10.4765625 = 20.4765625`, `Eb = 51.453125`. Above: the
break-label band of the below break, first band, `Ea = 10.4765625`, so
`y_root = 18.4765625` and `Hc = 18.4765625 + 51.453125 + 8 = 77.9296875`.
The break line: x 382.9775390625, from the flow row
`18.4765625 + 30.9765625 = 49.453125` to the top padding 8. The jump: from
x 282.9775390625 to 132.9775390625, `yf = 49.453125`, apex
`yf + 8 = 57.453125`, `yc = 49.453125 + (4 / 3) × 8` (binary64), arrowhead
base `yo = 49.453125 + 4 × 1.5 = 55.453125`. Jump label centred at
`(282.9775390625 + 132.9775390625) / 2 = 207.9775390625`, baseline
`57.453125 + 2 + 8.35400390625 = 67.80712890625`. Break label at
`382.9775390625 + 3 = 385.9775390625`, tier 1 at the top padding, baseline
`8 + 8.35400390625 = 16.35400390625`.
`Wc = 8 + 482.9775390625 + 9.279052734375 = 500.256591796875`.

### `map`

Root `melody` length 8 with map `tempo` (ScalarMap to seconds: physical,
continuous); child `phrase` at 2, length 4, with map `ticks` (QuartersToTicks
to ticks: logical, discrete). Widest name `Melody` (`A = 7361`,
`N = 39.53662109375`), `x0 = 55.53662109375`, `x(t) = x0 + 50 t`. Above:
children band row 1 starts at 6.40234375 (`pc = 14`, to 20.40234375), map
band starts at 24.40234375: `tempo` (extent
of `melody`) row 1, `ticks` (extent of `phrase`, inside `melody`'s)
row 2, `pm = max(13, 12.8046875) = 13`, to 50.40234375; `y_root =
58.40234375`. `phrase` y 45; `tempo` y 27.5; `ticks` y 14.5. `Hc =
58.40234375 + 26.9765625 + 8 = 93.37890625`,
`Wc = 8 + 455.53662109375 + 6.416015625 = 469.95263671875`. Cascade:
`tempo` stroke `#0050EF`, width 1, dash `none`; `ticks` stroke `#00CC00`,
width 1, dash `3 3`; names from the top row down are `Ticks`, `Tempo`,
`Phrase`, `Melody`.

### `with_region`

Root `tl:19` length 12; children `tl:20` at 1/3 length 4 and `tl:21` at 2
length 3; region `theme` from 2 to 6 below (`A = 6616`, width 29.07421875).
`x0 = 41.072265625`; a position `t` has `x = x0 + 400 × u` with `u` the
double nearest `t / 12`. `tl:20` takes row 1; `tl:21` starts at x(2),
before `tl:20`'s end x(13/3), so row 2: the child band starts at
6.40234375, `y_root = 42.40234375`, and the child rows remain at 29 and 15.
Below: wedge band to 26.9765625, region band from 30.9765625, one row,
width `(6 + 2 + 10.4765625 + 4) − 4 = 18.4765625`, `Eb = 49.453125`,
`Hc = 99.85546875`. Brace: `x1 = x0 + 400 × (1/6)`, `x2 = x0 + 400 ×
(1/2) = 241.072265625`, arms 73.37890625, tip 79.37890625, and exact
midpoint x 174.40559895833331. Its label has baseline 89.73291015625.
`Wc = 458.351318359375`.

## The cascade (`cascade.test.ts`)

Each rank level is tested in isolation with `Cascade` on one element key: a
statement winning on that level is written *first* (so position alone would
lose) and the loser names every lower-ranking member:

1. layer: `{}` in layer 2 beats `{ids, within, class, element, domain,
   modality}` in layer 1;
2. `ids`: beats `{within: child, class, element, domain, modality}`;
3. `within` depth: `within` the child (depth 2) beats `within` the root
   (depth 1) with `class`, `element`, `domain`, `modality`;
4. `class`: beats `{element, domain, modality}`;
5. `element`: beats `{domain, modality}`;
6. domain/modality count: `{domain, modality}` beats `{domain}`, and
   `{modality}` beats `{}`;
7. position: of two equal statements the later wins.

A style name sets its declaration; a name the layer's `styles` lacks sets
nothing, so a lower statement wins. A `within` naming an id outside the
manifest matches nothing.

Inheritance, through `draw` on fixtures with explicit layers:

- with no layers at all every element has the initial values of
  section 2.5 (`stroke none`, width 1, dash `none`, `fill none`, opacity 1,
  `font-size 9`, `rx 0`, `display inline`, `side below`, `content none`,
  `max-width none`);
- block → root: `[{select: {element: block}, set: {fill: #111111, opacity:
  0.5, rx: 4}}]` gives the root fill `#111111` (inherited) and opacity 1,
  rx 0 (not inherited);
- root → child, child → its child (`nested`): `{ids: [tl:24]}` stroke
  `#123456` reaches `tl:23` and `tl:22`;
- root → map → name (`map`): `{ids: [melody]}` stroke-width 7 reaches
  `melody/map/tempo` and `melody/map/tempo/name` when no statement sets it;
- region → label (`with_region`): `{element: region}` font-size 13 gives
  the region label font-size 13;
- map domain and modality from `target_unit` (`conversion_maps__maps_quarters`
  with the default layer): `LinearMap_1` (seconds) is `#0050EF`, no dash;
  `QuartersToTicks_1` (ticks) is `#00CC00` with dash `3 3`;
  `QuartersToFloatingMeasures_1` (floating_measures) `#00CC00`, no dash;
- a null `target_unit` (`FloorMap_1`) matches no domain selector and
  inherits its timeline's stroke: with the extra top layer
  `{ids: [maps:quarters]} stroke #ABCDEF`, `FloorMap_1` is `#ABCDEF` while
  `LinearMap_1` stays `#0050EF`; its class is its type, so
  `{class: FloorMap} stroke #FEDCBA` reaches it and no other map.

## Stretch and box (`stretch.test.ts`)

For `nested`, `map`, `flow_control` and `with_region`, at lengths 200, 400,
800 and spacings 0.5, 1, 2: every element keeps its style (stroke width,
font size) and its text; the wedge triangle stays 6 wide and 13 high; a
child's diamond and circle keep their size (stroke width). Only x and y
positions change. With `width` and `height` both 120 and 60 above the
natural box, every element except the block is identical to the natural
drawing and `W = width`, `H = height`; with a request below the natural
size, `W = Wc` and `H = Hc`.

## First fit (`properties.test.ts`, fast-check)

For generated manifests (a root of length 1 to 64 quarters with 1 to 8
children of random offset and length inside it, built through `createBlock`
and `addChild`), no two wedge labels with the same baseline on one side have
conflicting extents `[x − w/2 − 1, x + w/2 + 1]` (section 6.3), and no two
children in one row have conflicting extents `[Xs − x0, Xe − x0]`.
Changing name widths changes `x0` but never changes those rows.

## Sides (`sides.test.ts`)

For each of `child`, `map`, `region`, `jump`, `wedge` and `break`, a top
layer `{element: T} side X` with X the opposite of its default puts every
element of that type on the other side of `y_root` (`styled__score`,
`flow_control` for breaks). A break's line then starts on the new side's
flow row and ends at the other padding (`Hc − 8` instead of 8). Each case
first checks how many elements of the type the fixture draws: in
`styled__score` 1 child (`a` is hidden: its `ids` statement outranks the
`within` statement that sets `display: inline`), 1 map and 2 wedges; in
`with_region` 1 region; in `flow_control` 1 jump and 1 break.

The break of `flow_control` moved above: above, the flow band holds the
break and no jump, so it is 0 wide and is the first band, `Ea = 0`, and
`y_root = max(8 + 0, 8 + 6.40234375) = 14.40234375`. Below: the wedge band
to 26.9765625, the flow band (the jump, one level) from 30.9765625 to
`30.9765625 + 20.4765625 = 51.453125`, and the break-label band from
`51.453125 + 4 = 55.453125` with one tier, to `55.453125 + 10.4765625 =
65.9296875`. `Hc = 14.40234375 + 65.9296875 + 8 = 88.33203125`, which is
the drawing's height. The line runs from the above flow row, `y1 =
14.40234375 − 0 = 14.40234375`, to `y2 = Hc − 8 = 80.33203125`.

## Placement cases (`placement.test.ts`, `names.test.ts`)

Exact tests cover several nested jump spans and levels, a root whose
`number_type` is `float`, and both the default band order and
`["flow", "regions", "maps", "children"]`. They also cover hidden names,
mixed name sizes, name `content`, `max-width` truncation, empty drawings,
per-band label sizes, the root-name clearance before a first children or
map band, break-label tiers measured inward from the padding, and exact
midpoints for region braces and jump labels. These cases have literal
expected ordinates, rows, texts and descriptor order derived from sections
3 and 6.

**Four jumps.** Root `r`, quarters, length 16, `x(t) = x0 + 25 t`, with
jumps 4→6 `one`, 8→10 `two`, 3→11 `three` and 2→12 `four`. Canonical order
sorts jumps by `from`, so their indices are `2→12` 0, `3→11` 1, `4→6` 2 and
`8→10` 3; their spans are 10, 8, 2 and 2, and the stable sort by span gives
the placement order 2, 3, 1, 0, which the jump descriptors and their labels
follow. Extents from `x0`: jump 2 `[100, 150]`, label `one` (`A = 3811`,
16.74755859375 wide) centred at 125 inside it; jump 3 `[200, 250]`, `two`
(`A = 3731`, 16.39599609375) centred at 225; jump 1 `[75, 275]`, `three`
(`A = 5463`, 24.00732421875) centred at 175; jump 0 `[50, 300]`, `four`
(`A = 4114`, 18.0791015625) centred at 175. No label widens its extent.
First fit: jump 2 level 1, jump 3 level 1 (150 < 200), jump 1 level 2 (it
conflicts with both), jump 0 level 3. Above, no band: `y_root = max(8,
8 + 12.8046875 / 2) = 14.40234375`. Below, the wedge band to 26.9765625,
the flow row at `f0 = 26.9765625 + 4 = 30.9765625`, so every
`yf = 14.40234375 + 30.9765625 = 45.37890625`. With `pj = 10 + 10.4765625
= 20.4765625`, the apex distances are `(f0 + 8) + 0 × pj = 38.9765625`,
`38.9765625 + 20.4765625 = 59.453125` and `38.9765625 + 2 × 20.4765625 =
79.9296875`, so `apex − yf` is 8, `8 + 20.4765625 = 28.4765625` and
`8 + 2 × 20.4765625 = 48.953125` (all exact), and `yc = yf + (4 / 3) ×
(apex − yf)` in binary64.

**Float axis.** `continuous_physical`: root `tl:7`, seconds, `float`,
length 12.5; children `tl:8` at 0.5, length 4.25, and `tl:9` at 6.0,
length 3.0, both in child row 1 (`[x(0.5), x(4.75)]` and `[x(6.0), x(9.0)]`
do not conflict). No name is set, so the names are the ids; the row's
joined name `tl:8, tl:9` has `A = 2 × (803 + 569 + 690 + 1303) + 651 + 651
= 8032`, `N = 8032 × 11 / 2048 = 43.140625`, wider than `tl:7` (`A = 3365`,
18.07373046875). The label `0.0 s` (`A = 1303 + 651 + 1303 + 651 + 1067 =
4975`, 21.86279296875 wide) at u 0 asks `8 + 10.931396484375`, and `12.5 s`
at u 1 nothing, so `x0 = 8 + 43.140625 + 8 = 59.140625` and the root runs
to `59.140625 + 400 = 459.140625`. The proportions are binary64 quotients:
`0.5 / 12.5` is the double nearest 0.04, and `400 ×` it rounds to 16, so
`tl:8` starts at 75.140625; its end `0.5 + 4.25 = 4.75` gives `4.75 / 12.5`,
the double nearest 0.38, and `400 ×` it rounds to 152, so it ends at
211.140625. The labels show the floats as Python writes them: `0.0 s` and
`12.5 s`.

**Band order.** `map` (section "`map`" above) at the default order puts
`phrase` at 45, `tempo` at 27.5 and `ticks` at 14.5. With
`["flow", "regions", "maps", "children"]`, the map band is the first above
and starts at `h(11) / 2 = 6.40234375`, 2 rows of `pm = 13`, to
`6.40234375 + 2 × 13 = 32.40234375`; the children band starts at
`32.40234375 + 4 = 36.40234375`, one row of 14, to 50.40234375; `y_root =
8 + 50.40234375 = 58.40234375`. So `tempo` lies at `58.40234375 −
(6.40234375 + 1/2 × 13) = 45.5`, `ticks` at `58.40234375 − (6.40234375 +
3/2 × 13) = 32.5` and `phrase` at `58.40234375 − (36.40234375 + 1/2 × 14) =
15`. The rows themselves do not change when the name content widens `x0`.

`names.test.ts` pins the details: two non-overlapping children share row 1,
whose joined name is replaced by `content: "AAAA"` on the first name and
cut to `"A…"` by `max-width: 20`. A hidden second name at font size 20 still
sets `pc = h(20) = 23.28125`, putting the child row at 19.640625. With every
non-block element hidden, the box contains only its background, `x0 = P =
8`, `Wc = P + x0 = 16`, and `Hc = 28.8046875`.
