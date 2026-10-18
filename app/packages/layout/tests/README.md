# `@timetoalign/tilie-layout` tests

`draw(manifest, placement, layers, metrics)` returns the drawing of one
TimeSkeleton manifest as timeskeleton's drawing specification defines it
(`docs/drawing.md` in the timeskeleton repository, "the specification"
below, sections 1 to 6 for each timeline drawn as a root and section 8 for
the box that holds them). The tests prove it from the specification, never
from the code's own output: every expected number below is derived here by
hand from the specification's formulas and the font's advance widths, and
the arithmetic is written out. Manifests are loaded from the fixtures of the
installed schema package's version or built through core's commands; none is written by hand. The metrics are the package's
`fonts/dejavu-sans-2.37.metrics.json`. All comparisons are exact (`toBe`,
`toEqual`); no tolerance anywhere.

"The default layers" means `[DEFAULT_LAYER]`, plus the manifest's own layer
when it has a `graphical` block (`manifestLayer`: its `styles` and
`statements`, without the member `order`); an "extra layer" is an application's
layer, placed between the two, since no layer lies above the manifest's own; "the default placement" is
`{length: 400, spacing: 1, width: null, height: null, order: ["children",
"regions", "flow"], bands: {}, places: {}}`.

Addresses follow section 2.2 in every manifest: a timeline or a group is
addressed by its bare id, the manifest's title by `name`, and every other
element with an id (a map, region, break, jump or marker) by the id of the
root whose tree holds it, `/`, and its own id, so `map`'s map `tempo` is
`melody/tempo` and `with_region`'s region is `clt_1/region_1`. The prose
below names such elements by their id; selectors and expectations use the
whole address. The fixtures' minimal twins (`*.minimal.json`) draw as their
complete fixtures do and are left out of every list of fixtures.

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
  every name and label of every manifest fixture at the default placement.

## The default layer (`defaults.test.ts`)

`DEFAULT_LAYER` deep-equals the JSON block of section 4, parsed out of the
specification itself (the first fenced `json` block under "## 4.
Defaults"), statement for statement and in order. The specification is
read from the installed timeskeleton package, which ships it as
`docs/drawing.md`; a missing file is a failure, never a skip.

What the layer resolves to, through `draw` with `[DEFAULT_LAYER]` alone,
each value read off section 4 and ranked by section 2.5:

- `bare`: the block has fill `#F3F4F6`, rx 10, shadow `none`; the card
  `bare/card` fill `#FFFFFF`, stroke `#C4C9D1`, stroke width 0.75, rx 5,
  shadow `#B8BEC8`, opacity 1: `{element: card}` outranks `{domain:
  logical}` (rank 5 against 7), although the card has its timeline's
  domain. The line `bare` keeps rx 0 and shadow `none` (neither is
  inherited).
- `group_child_member`: the frame `group_1` fill `#FFFFFF`, stroke
  `#D1D5DB`, stroke width 1, rx 6; the ancestor line `piece` stroke
  `#00CC00` (its logical domain), stroke width 3, dash `none`, opacity
  0.35; its two marks, `second-half/start` and `second-half/end` drawn on
  `piece`, fill `#000000` and opacity 0.35 (`{inside: ancestor}`), their
  labels fill `#000000`, font size 9, opacity 0.35; `piece/name` fill
  `#6B7280`, font size 9, opacity 1 (`{element: name, inside: ancestor}`
  outranks `{element: name}` by `inside` and `{inside: ancestor}` by
  `element`); the member's own wedges and their labels, at the same
  addresses, opacity 1; `second-half/name` fill `#000000`, font size 11,
  max width 160, opacity 1.

## Hand-derived drawings (`examples.test.ts`)

The five manifests of one root below are drawn at the default placement
with the default layers. Each is an anonymous box with one ungrouped root
in its card (section 8, "The box" below): the name column starts at `xn = P + K =
16`, the card's top lies at `P = 8`, so the root's line lies at `8 +
y_root`; the card spans `P` to `R + K` and is `Hm = Hc` high, and its
shadow, 2 further right and down, sets the box: `W = 8 + (R + K + 2)` and
`H = 8 + (8 + Hm + 2)`.

Common values: `P = 8`, `G' = 8`, `B = 4 × v`, `h(9) = 10.4765625`,
`a(9) = 8.35400390625`, `d(9) = 2.12255859375`, `h(11) = 12.8046875`,
`(a(11) − d(11)) / 2 = (20911 − 5313) / 4096 = 3.80810546875`. The root's
stroke width `w` is 3 (default `timeline` statement), so a wedge's tip lies
`w / 2 = 1.5` out and its base `w / 2 + 13 = 14.5` out, and the wedges with
one label tier reach `1.5 + 13 + 2 + 10.4765625 = 26.9765625`. Wedge labels
in tier 1 start `1.5 + 13 + 2 = 16.5` out, so below their baseline is `(y +
16.5) + a(9)`, `y` the root's line. Children and maps lie above their
timelines, everything else below the root (section 4). Every root of these
fixtures has `locked: false`, so it ends with an arrowhead whose tip is `3w
= 9` beyond `Xe`; every child ends with a diamond reaching `1.5w = 4.5`
beyond `Xe`. A jump has the default stroke width 1.

The root's row has the pitch `p0 = max(14, h(11)) = 14`, so a children band
starts no nearer than `p0 / 2 = 7`; a child row whose children carry no map
stack wider than `p / 2` has both halves `p / 2`. A map's stack constants
are `d = 2`, `g = 3`: on a timeline of width 3, map `j` is centred
`1.5 + 5j − 1` out (5.5 for `j = 1`, 10.5 for `j = 2`), and a stack of `J`
maps reaches `1.5 + 5J` (6.5, 11.5).

### `bare`

Root `bare`, quarters, length 8, name `Bare` (`A = 1405 + 1255 + 842 + 1260
= 4762`). `N = 4762 × 11 / 2048 = 25.5771484375`. Labels `0 ♩` (u 0) and
`8 ♩` (u 1), each 12.83203125 wide, ask for at most `16 + 6.416015625` of
`x0`, so `x0 = 16 + N + 8 = 49.5771484375`; `Xe = x0 + 400 = 449.5771484375`.
No band above, so `y_root = max(8 + 0, 8 + 12.8046875 / 2) = 14.40234375`
and the line lies at 22.40234375; below the root band holds the two wedges
and no map, `Eb = 26.9765625`, `Hc = 14.40234375 + 26.9765625 + 8 =
49.37890625`. Wedges: tip 23.90234375, base 36.90234375. Labels' baseline
`(22.40234375 + 16.5) + 8.35400390625 = 47.25634765625`. Name baseline
`22.40234375 + 3.80810546875 = 26.21044921875`. The rightmost drawn point
is the root's arrowhead tip `R = 449.5771484375 + 9 = 458.5771484375` (the
`8 ♩` label reaches only `449.5771484375 + 6.416015625 = 455.9931640625`),
so the card is `{8, 8, 458.5771484375, 49.37890625}`, `W = 476.5771484375`
and `H = 67.37890625`. The elements are, in order: block, `bare/card`,
`bare` (xs 49.5771484375, xe 449.5771484375), `bare/start`, `bare/end`,
`bare/name`, `bare/start/label` (coordinate 0 quarters), `bare/end/label`
(coordinate 8 quarters). `unmapped` is empty.

### `nested`

Root `clt_1` length 16; child `clt_3` at 4, length 8 (4 to 12); its child
`clt_2` at 3/2, length 2 (11/2 to 15/2 on the root's axis). Names
`clt_x` have `A = 1126 + 569 + 803 + 1024 + 1303 = 4825`, width
`25.91552734375`. `x0 = 16 + 25.91552734375 + 8 = 49.91552734375` (the `16 ♩`
label, 18.55810546875 wide, at u 1 asks nothing), `x(t) = x0 + 25 t`.
`clt_3` takes above row 1 (minimum `0 + 1`); `clt_2` row 2 (minimum `1 + 1`).
Above there is no root band, so the children band is the first and starts at
`max(0, p0 / 2) = 7`; `p = 14`, both rows have halves 7 and 7, the band is
`7 + 7 + 7 + 7 = 28` wide: row 1's line lies `7 + 7 = 14` out, row 2's
`14 + (7 + 7) = 28` out, `Ea = 7 + 28 = 35`, `y_root = 8 + 35 = 43`, the
root's line at 51. So the root's row and the two child rows lie one pitch,
14, apart. `clt_3`: xs 149.91552734375, xe 349.91552734375, y `51 − 14 =
37`; `clt_2`: xs 187.41552734375, xe 237.41552734375, y `51 − 28 = 23`.
`Hc = 43 + 26.9765625 + 8 = 77.9765625`. Wedges: tip 52.5, base 65.5;
labels' baseline `(51 + 16.5) + 8.35400390625 = 75.85400390625`. Name
descriptors run top-down: `clt_2` at baseline 26.80810546875, `clt_3` at
40.80810546875 and `clt_1` at 54.80810546875. The `16 ♩` label reaches `R =
449.91552734375 + 9.279052734375 = 459.194580078125`, beyond the
arrowhead's tip 458.91552734375: card width 459.194580078125, `W =
477.194580078125`, `H = 95.9765625`.

### `flow_control`

Root `flow:quarters` length 16, name `Flow control` (`A = 12470`,
`N = 66.9775390625`), `x0 = 90.9775390625`, `x(t) = x0 + 25 t`. Break at 12
(label `Fine`, `A = 4305`, width 18.91845703125), jump from 8 to 2 (label
`Repeat`, `A = 7301`, width 32.08447265625), both below. Above nothing is
drawn: `Ea = 0`, `y_root = 14.40234375`, the line at 22.40234375. Below:
root band to 26.9765625; the flow band starts at `26.9765625 + 4 =
30.9765625` with one break-label tier (`T = 1`, `10.4765625`), so the flow
row lies `30.9765625 + 10.4765625 = 41.453125` out, at `yf = 22.40234375 +
41.453125 = 63.85546875`; one jump level: the band is `10.4765625 + 8 + 0 +
2 + 10.4765625 = 30.953125` wide, `Eb = 30.9765625 + 30.953125 =
61.9296875`, `Hc = 14.40234375 + 61.9296875 + 8 = 84.33203125`. Wedges,
wedge labels and name as in `bare`.

The break line: x 390.9775390625, from the flow row 63.85546875 to `8 + P ×
v = 16`, counted from the member drawing's top. Its label starts at
`390.9775390625 + 3 = 393.9775390625`, tier 1 touching the flow row on the
root's side: baseline `yf − d(9) = 61.73291015625`.

The jump (`w = 1`, so the head is `4w = 4` long and `2w = 2` half-wide):
`Xf = x(8) = 290.9775390625`, `Xt = x(2) = 140.9775390625`, `q = (Xt − Xf)
/ 4 = −37.5`; the apex lies `41.453125 + 8 = 49.453125` out, at `ya =
71.85546875`; `yc = yf + 4/3 × (ya − yf) = 63.85546875 + (4/3) × 8 =
74.52213541666667` (binary64, `(4/3) × 8 = 10.666666666666666`). `C1 =
(253.4775390625, yc)`, `C2 = (178.4775390625, yc)`. Direction: `Xt − Cx =
−37.5`, `yf − yc = −10.666666666666671` (binary64), `ℓ = 38.98753362009166`,
`ux = −0.9618459163232351`, `uy = −0.2735917273097203`. Base centre `Bh =
(Xt − 4 ux, yf − 4 uy) = (144.82492272779294, 64.94983565923889)`; `n =
(−uy, ux)`; corners `Bh − 2n` and `Bh + 2n`. These are drawn positions:
the arrowhead is computed in item coordinates (`Xt = 136.9775390625`, `yf
= 14.40234375 + 41.453125 = 55.85546875`, so `Bh = (136.82492272779294,
56.94983565923888)`, corners `(136.2777392731735, 58.87352749188535)` and
`(137.37210618241238, 55.02614382659241)`) and drawn `8 +` each: `Bh =
(144.82492272779294, 64.94983565923889)`, corners `(144.2777392731735,
66.87352749188534)` and `(145.37210618241238, 63.02614382659241)` (summed
from the card's top first, the last two would be 66.87352749188535 and
63.02614382659242). The shaft is `P0 = (Xf,
yf)`, `C1`, `C2`, ending at `Bh`. Jump label centred at `x(5) =
215.9775390625`, baseline `(22.40234375 + (49.453125 + 2)) + 8.35400390625 =
82.20947265625`. The `16 ♩` label reaches `R = 490.9775390625 +
9.279052734375 = 500.256591796875`, beyond the arrowhead tip
499.9775390625: card width 500.256591796875, `W = 518.256591796875`, `H =
102.33203125`.

### `map`

Root `melody` length 8 with map `tempo` (ScalarMap to seconds: physical,
continuous); child `phrase` at 2, length 4, with map `ticks` (QuartersToTicks
to ticks: logical, discrete). Maps have no names, so the widest name is
`Melody` (`A = 7361`, `N = 39.53662109375`), `x0 = 63.53662109375`,
`x(t) = x0 + 50 t`. Above: the root band holds `melody`'s stack, `tempo`
alone, and no wedge, so it reaches 6.5; `tempo` is centred 5.5 above the
root's line. The children band starts at `max(6.5 + 4, 7) = 10.5`; `p =
14`; `phrase`'s stack above (outwards, its outer half) reaches 6.5, less
than 7, so its row has halves 7 and 7: its line lies `10.5 + 7 = 17.5`
out and `Ea = 10.5 + 14 = 24.5`, `y_root = 32.5`, the root's line at 40.5.
`phrase` y `40.5 − 17.5 = 23`; `ticks` centred 5.5 above it, `yc = 17.5`;
`tempo` `yc = 40.5 − 5.5 = 35`. `Hc = 32.5 + 26.9765625 + 8 = 67.4765625`.
Wedges: tip 42, base 55; labels' baseline `(40.5 + 16.5) + 8.35400390625 =
65.35400390625`. Names, from the top row down: `Phrase` at `23 +
3.80810546875 = 26.80810546875`, `Melody` at `40.5 + 3.80810546875 =
44.30810546875`. The arrowhead tip `R = 463.53662109375 + 9 =
472.53662109375` is the rightmost point (`8 ♩` reaches 469.95263671875):
card width 472.53662109375, `W = 490.53662109375`, `H = 85.4765625`. Maps
span their timelines: `tempo` from 63.53662109375 to 463.53662109375,
`ticks` from 163.53662109375 to 363.53662109375. Cascade: `tempo` stroke
`#0050EF`, width 1, dash `none`; `ticks` stroke `#00CC00`, width 1, dash `1
1`. The maps are drawn before the lines, in traversal order (`tempo`,
`ticks`).

### `with_region`

Root `clt_1` length 12; children `clt_2` at 1/3 length 4 and `clt_3` at 2
length 3; region `region_1`, named `theme`, from 2 to 6 below (`A = 6616`,
width 29.07421875). The names `clt_x` give `x0 = 49.91552734375` as in
`nested`; a position `t` has `x = x0 + 400 × u` with `u` the double nearest
`t / 12`. `clt_2` takes row 1; `clt_3`'s extent starts at `400 × u(2)`,
before `clt_2`'s end `400 × u(13/3)`, so row 2: as in `nested`, the rows lie
14 and 28 out, `Ea = 35`, `y_root = 43`, the root's line at 51 and the child
rows at 37 and 23. Below: root band to 26.9765625, region band from
30.9765625, one row, width `(6 + 2 + 10.4765625 + 4) − 4 = 18.4765625`, `Eb
= 49.453125`, `Hc = 43 + 49.453125 + 8 = 100.453125`. Brace: `x1 = x0 + 400
× u(2)`, `x2 = x0 + 400 × (1/2) = 249.91552734375`, arms `51 + 30.9765625 =
81.9765625`, tip `51 + (30.9765625 + 6) = 87.9765625`, and exact midpoint x
`x0 + 400 × u(4) = 183.24886067708331`. Its label has baseline `(51 +
(30.9765625 + 6 + 2)) + 8.35400390625 = 98.33056640625`. The `12 ♩` label
(`A = 4223`, as `16 ♩`) reaches `R = 459.194580078125`: card width
459.194580078125, `W = 477.194580078125`, `H = 118.453125`.

## Member drawing arithmetic (`member.test.ts`)

Sections 3.3, 5.3, 6.2 to 6.7 and the member part of 7.2 fix every number
of one member drawing, including the order in which it is computed. The
tests compare the member drawing's elements (everything but the block and
the card, in descriptor order, without styles) and its height `Hm` (its
card's height) with values derived here; the box around it is "The box"'s
concern. The rules the derivations follow:

- **Doubles in written order** (3.3): every canvas number is a binary64
  value computed left to right as its formula is written; a constant factor
  (`4/3`, `4w`, `2w`, `1.5w`, `2.5w`) is formed before it multiplies, and
  `1.2w` is the double nearest the exact `6/5 × w`.
- **Distances outwards** (3.3, 6.4): a distance from the root's line is
  summed whole, left to right as written and a label gap of 2 included,
  before it becomes an ordinate `y ∓ o`; a label's baseline is that
  ordinate `+ a(s)` or `− d(s)`. A map's centre is offset from its own
  timeline's line, a break label from the flow row. A band's outer edge is
  its start plus its width, the width summed first.
- **Label size** (6.2): the `9` in `h(9)`, `a(9)`, `d(9)` is the largest
  font size of the labels of the band in question.
- **Extents** (6.3): from the root's start, each end `L × u`, never `x −
  x0`; a centred label `[(L × u − wi / 2) − 1, (L × u + wi / 2) + 1]`, a
  break label `[(L × u + 3) − 1, ((L × u + 3) + wi) + 1]`.
- **Names** (5.3): a timeline's `name`, or its id after the last `:`.
- **Item coordinates** (8.2, 8.6): a member drawing is laid out in its
  item's coordinates, the item's left edge and top at 0, and drawn at the
  item's place: in a manifest of one root its card lies at `(8, 8)` at
  scale 1, so every drawn position is `8 + u`, the place added last to the
  finished item-coordinate value `u`. The member drawing's top `8` of the
  formulas below is that place.
- **Order** (6.6, 7.2): breaks, maps, regions, jumps, the root and the
  children in traversal order, boundaries, wedges (start before end),
  names (top row down), wedge labels (start before end), segment, region,
  jump and break labels.

**`styled__score`** (the default placement; the default layer and the
manifest's own). `score`: length 8, stroke width `w = 4`, its name's
`content` `Styled score` at size 12 (`A = 12643`, 74.080078125); child `a`
hidden (`display: none`, no row, no name); child `b` at 4, length 4, above;
map `ticks` below; region `intro` 0 to 2 below; jump `da-capo` 8 → 0 below,
`w = 2`; both wedges above. Every label is size 10, so the `9` of each band
is 10: `h(10) = 11.640625`, `a(10) = 9.2822265625`, `d(10) = 2.3583984375`;
`h(12) = 13.96875`, `(a(12) − d(12)) / 2 = 4.154296875`. `x0 = 16 +
74.080078125 + 8 = 98.080078125`, `Xe = 498.080078125`, `x(t) = x0 + 50 t`.

- Above: the root band holds the wedges, labels `0 ♩` and `8 ♩` (14.2578125
  wide) in tier 1 (extents `[−8.12890625, 8.12890625]` and `[391.87109375,
  408.12890625]`): reach `4 / 2 + 13 + 2 + 1 × h(10) = 28.640625`. The
  children band starts at `c0 = max(28.640625 + 4, 13.96875 / 2) =
  32.640625`; `b`'s row has `p = 14` and halves 7: its line lies
  `39.640625` out, `Ea = 32.640625 + 14 = 46.640625`.
- Below: the root band is `ticks`'s stack, `e = 2 + 5 = 7`, the map
  centred `2 + 5 − 1 = 6` out. The region band starts at `7 + 4 = 11`,
  `pr = 6 + 2 + 11.640625 + 4 = 23.640625`, width `pr − 4 = 19.640625`,
  edge 30.640625; brace arms 11 out, tip `11 + 6 = 17`, label `11 + 6 + 2 =
  19` out. The flow band starts at `34.640625`, no break label: the flow
  row lies there, the apex `34.640625 + 8 + 0 × pj = 42.640625` out, the
  label `42.640625 + 2` out; width `0 + 8 + 0 + 2 + 11.640625 =
  21.640625`, `Eb = 56.28125`.
- `y_root = max(8 + 46.640625, 8 + 6.984375) = 54.640625`, `Hm = 54.640625
  + 56.28125 + 8 = 118.921875`; the root's line lies at `Y = 62.640625`.

| Ordinate | Formula | Value |
|---|---|---|
| `ticks` centre | `Y + 6` | 68.640625 |
| brace arms, tip | `Y + 11`, `Y + 17` | 73.640625, 79.640625 |
| flow row `yf`, apex `ya` | `Y + 34.640625`, `Y + 42.640625` | 97.28125, 105.28125 |
| `b` | `Y − 39.640625` | 23 |
| wedge tip, base | `Y − 2`, `Y − 15` | 60.640625, 47.640625 |
| wedge labels | `(Y − 17) − d(10)` | 43.2822265625 |
| region label | `(Y + 19) + a(10)` | 90.9228515625 |
| jump label | `(Y + 44.640625) + a(10)` | 116.5634765625 |
| names `b`, `Styled score` | `23 + 3.80810546875`, `Y + 4.154296875` | 26.80810546875, 66.794921875 |

The jump (`w = 2`): `yc = 97.28125 + (4/3) × 8 = 107.94791666666667`, `C1 =
(398.080078125, yc)`, `C2 = (198.080078125, yc)`, `ℓ =
100.56727985670975`, `u = (−0.9943592005519288, −0.10606498139220578)`,
`Bh = (Xt − 8 ux, yf − 8 uy) = (106.03495172941543, 98.12976985113765)`,
corners `Bh ∓ 4n` = `(105.6106918038466, 102.10720665334537)` and
`(106.45921165498424, 94.15233304892993)`. Region `intro` from `x0` to
198.080078125, its tip and label at 148.080078125; `b` from 298.080078125 to
`Xe`; the `D.C.` label at `x(4) = 298.080078125`. Descriptor order:
`ticks`, `intro`, `da-capo`, `score`, `b`, `score/start`, `score/end`,
`b/name`, `score/name`, the two wedge labels, `intro/label`,
`da-capo/label`.

**`styled__score` stretched.** At spacings 0.89 and 2.63 every vertical
constant is a non-dyadic double (`8v`, `4v`, `14v`, `10v`), so the order of
the additions shows in the result. The values follow the formulas above
with `B = 4v`, `P × v = 8v`, `p0 = max(14v, 13.96875)`, `p = max(14v,
12.8046875)`, `pr = 6 + 2 + 11.640625 + 4v`, `pj = 10v + 11.640625`, flow
width `0 + 8v + 0 × pj + 2 + 11.640625`; `x` is unchanged.

| Quantity | v = 0.89 | v = 2.63 |
|---|---|---|
| `c0` | `max(28.640625 + 3.56, 6.984375) = 32.200625` | `max(28.640625 + 10.52, 18.41) = 39.160624999999996` |
| `b` out, `Ea` | 38.60296875, 45.0053125 | 57.57062499999999, 75.980625 |
| region start, edge | 10.56, 30.200625000000002 | 17.52, 37.160624999999996 |
| flow row, apex out | 33.760625000000005, 40.880625 | 47.68062499999999, 68.72062499999998 |
| `Eb` | 54.52125000000001 | 82.36124999999998 |
| `y_root`, `Y` | 52.1253125, 60.1253125 | 97.020625, 105.020625 |
| `Hm` | 113.76656250000002 | 200.42187499999997 |
| `ticks`, arms, tip | 66.1253125, 70.68531250000001, 76.68531250000001 | 111.020625, 122.54062499999999, 128.54062499999998 |
| `yf`, `b` | 93.88593750000001, 21.522343749999997 | 152.70125, 47.45 |
| wedge tip, base, labels | 58.1253125, 45.1253125, 40.7669140625 | 103.020625, 90.020625, 85.6622265625 |
| region, jump label | 87.96753906250001, 112.2881640625 | 139.82285156249998, 185.02347656249998 |
| names `b`, `Styled score` | 25.330449218749997, 64.279609375 | 51.25810546875, 109.174921875 |
| `yc` | 103.37927083333334 | 180.7545833333333 |
| `Bh` | (106.04427062489503, 94.64200484132338) | (105.78272270361973, 154.8620985591221) |
| corners | (105.66623695423336, 98.6241010912709), (106.42230429555671, 90.65990859137587) | (104.70229842405867, 158.71342084843195), (106.86314698318078, 151.01077626981225) |

Every ordinate of the table is `8 + (…)`, the formula evaluated with the
item-coordinate root line `y_root` in place of `Y` and the card's place
added last (section 8.6): the arms at 0.89 are `8 + (52.1253125 + 10.56) =
70.68531250000001`, the tip at 2.63 `8 + (97.020625 + (17.52 + 6)) =
128.54062499999998`, the region label at 2.63 `8 + ((97.020625 + (17.52 +
6 + 2)) + a(10)) = 139.82285156249998`.

These values tell the written order from its alternatives: at 0.89 the
region band's edge `r0 + (pr − 4v)` is 30.200625000000002 against `(r0 +
pr) − 4v = 30.200625`, `Eb` 54.52125000000001 against 54.52125 when the
flow width is not summed first, the apex `8 + (y_root + (f0 + 8v))`
101.0059375 against `8 + ((y_root + f0) + 8v) = 101.00593750000002`; at
2.63 `Ea = c0 + (i1 + o1)` is 75.980625 against 75.98062499999999, and the
region label 139.82285156249998 against 139.8228515625 when the card's top
is summed first, `((8 + y_root) + (r0 + 6 + 2)) + a(10)`: the place is
added last.

**`nested` at length 800 and spacing 2.** `x0 = 49.91552734375`, `x(t) =
x0 + 50 t`: `clt_1` to 849.91552734375, `clt_3` 249.91552734375 to
649.91552734375, `clt_2` 324.91552734375 to 424.91552734375. `P × v = 16`,
`p0 = p = 28`: the children band starts at 14, rows 28 and 56 out, `Ea =
70`, `y_root = 86`, `Hm = 86 + 26.9765625 + 16 = 128.9765625`; lines at 94,
66, 38; wedges tip 95.5, base 108.5; labels' baseline `(94 + 16.5) +
8.35400390625 = 118.85400390625`; names 41.80810546875, 69.80810546875,
97.80810546875.

**Wedge-label tiers of `bare`.** At length `L = 14.83203125` the end label's
extent `[14.83203125 − 6.416015625 − 1, …] = [7.416015625, 22.248046875]`
starts exactly where the start label's `[−7.416015625, 7.416015625]` ends,
so they do not conflict: one tier, both baselines 47.25634765625, the end
label at `x0 + L = 64.4091796875`, `Hm = 49.37890625`. At `L = 10` the end
label's extent `[2.583984375, 17.416015625]` overlaps the start label's: the
start label, placed first, keeps tier 1 and the end label takes tier 2,
`(22.40234375 + (16.5 + 10.4765625)) + 8.35400390625 = 57.73291015625`; the
wedges reach `1.5 + 13 + 2 + 2 × 10.4765625 = 37.453125`, `Hm = 14.40234375
+ 37.453125 + 8 = 59.85546875`.

**A scoped id.** A root `piece:score` with a null name (built through
`add`) is named `score` (`A = 1067 + 1126 + 1253 + 842 + 1260 = 5548`,
29.798828125 wide), drawn at `x = 16` with the address
`piece:score/name`; `x0 = 16 + 29.798828125 + 8 = 53.798828125`.

## Jumps of `corpus_score_ms3` (`placement.test.ts`)

Root `clt_1` (no name), quarters, length 37, map `ScalarMap` to ticks above;
children `controls` and `notes`, each from 0 to 37, so in rows 1 and 2
above. Names at 11: `controls` `A = 8211`, 44.10205078125 (the widest),
`notes` 30.51318359375, `clt_1` (`A = 4825`) 25.91552734375; `x0 = 16 +
44.10205078125 + 8 = 68.10205078125` (no centred label asks more: `0 ♩`
asks `16 + 6.416015625`, `MC 3 → MC 1` (`A = 13320`, 58.53515625) at `u =
3/37` asks `16 + 29.267578125 − 32.432432432432435`). Above: the root band
is the one-map stack (6.5), the children band starts at `max(6.5 + 4, 7) =
10.5`, two rows of 14, `Ea = 38.5`, `y_root = 46.5`; in the card (top 8)
the root's line lies at 54.5.

Below: the wedges reach 26.9765625. The flow band starts at 30.9765625 with
one break-label tier (`fine at MC 7`), so the flow row lies `41.453125` out
and `yf = 54.5 + 41.453125 = 95.953125`. Jumps in canonical order (by
from): `jump_1` `6→0`, `jump_2` `9→6`, `jump_3` `28→16`, `jump_4` `37→0`,
spans 6, 3, 12, 37: placement order `jump_2`, `jump_1`, `jump_3`,
`jump_4`. Extents from the root's start (`400 × u`, `u` the double nearest
`t / 37`): `jump_2` `[64.86486486486487, 97.2972972972973]`, widened by its
label `MC 5 → MC 4` (58.53515625, centred at `400 × u(15/2) =
81.08108108108108`) to `[50.81350295608108, 111.34865920608108]`, level 1;
`jump_1` `[0, 64.86486486486487]` (its label inside) conflicts, level 2;
`jump_3` `[172.97297297297297, 302.7027027027027]`, level 1; `jump_4` `[0,
400]`, level 3. With `pj = 20.4765625` the apexes lie `41.453125 + 8 =
49.453125`, 69.9296875 and 90.40625 out, at 103.953125, 124.4296875 and
144.90625. The band is `10.4765625 + 8 + 2 × 20.4765625 + 2 + 10.4765625 =
71.90625` wide, `Eb = 102.8828125`, `Hc = 46.5 + 102.8828125 + 8 =
157.3828125` and the drawing `H = 8 + (8 + 157.3828125 + 2) = 175.3828125`
high. The break label's baseline is `95.953125 − 2.12255859375 =
93.83056640625`.

Jumps have the default stroke width `w = 1`: the head is `4w = 4` long and
`2w = 2` half-wide.

**Short jump** (`9→6`, level 1): `Xf = x0 + 97.2972972972973 =
165.3993480785473`, `Xt = x0 + 64.86486486486487 = 132.96691564611487`,
`q = (Xt − Xf) / 4 = −8.108108108108105`, `yc = 95.953125 + (4/3) × 8 =
106.61979166666667`, `C1 = (157.2912399704392, yc)`, `Cx = Xt − q =
141.07502375422297`. `Xt − Cx = −8.108108108108098`, `yf − yc =
−10.666666666666671`, `ℓ² = 179.5191948705462`, `ℓ = 13.398477334031138`,
`u = (−0.6051514590776749, −0.7961103639421869)`, `Bh = (Xt − 4 ux, yf −
4 uy) = (135.38752148242557, 99.13756645576875)`, corners `Bh ∓ 2n` =
`(133.7953007545412, 100.3478693739241)` and `(136.97974221030995,
97.9272635376134)`: it arrives steeply.

**Long jump** (`37→0`, level 3): `Xf = x0 + 400 = 468.10205078125`, `Xt =
x0 = 68.10205078125`, `q = −100`, `yc = 95.953125 + (4/3) × 48.953125 =
161.22395833333331`, `C1 = (368.10205078125, yc)`, `Cx =
168.10205078125`. `Xt − Cx = −100`, `yf − yc = −65.27083333333331`,
`ℓ² = 14260.281684027776`, `ℓ = 119.41642133319762`, `u =
(−0.837405767846437, −0.546581723054768)`, `Bh = (71.45167385263575,
98.13945189221907)`, corners `(70.35851040652622, 99.81426342791194)` and
`(72.54483729874529, 96.4646403565262)`: it arrives flatter than the short
one (`|uy|` 0.5466 against 0.7961). Every jump point is computed in item
coordinates (`x0 = 8 + 44.10205078125 + 8 = 60.10205078125`, `yf = 46.5 +
41.453125 = 87.953125`) and drawn `8 +` it; only the first corner's `x`
shows it, `8 + 62.358510406526214 = 70.35851040652622` against
70.35851040652621 summed from the card's left edge first.

## Map stacks, the root band and the end marker (`stacks.test.ts`)

Section 6.4 "Map stacks", "The root band" and "Children", and the end
marker of section 6.6. The tests prove that a map is placed against its own
timeline's line, that `above` means up and `below` down for a map whatever
side of the root its timeline lies on, that a stack wider than `p / 2`
widens exactly its half of the row, that the root band takes the larger of
the wedge reach and the stack reach, and that `locked` alone chooses the
end marker. Values use the common values of "Hand-derived drawings": each
manifest is one card whose top lies at 8, so an ordinate in the box is `8`
plus its distance from the member drawing's top (the root's line at `8 +
y_root`), and the drawing is `H = Hc + 18` high and `W = R + 18` wide.

**The constructed manifest.** `r`, quarters, length 8, with child `c` at 4,
length 4, carrying the maps `m1` and `m2` (ScalarMap quarters to seconds),
built through `add` commands. Names `r` (`A = 842`) and `c` (`A = 1126`,
6.0478515625 wide) give `x0 = 16 + 6.0478515625 + 8 = 30.0478515625`; `c`
runs from `x0 + 200 = 230.0478515625` to `x0 + 400 = 430.0478515625`.
Below, the root band holds the wedges only (26.9765625).

- Both maps above (`J = 2` on `c`'s outer half): row 1's halves are inner 7
  and outer `max(7, 11.5) = 11.5`. The band starts at 7, `c`'s line lies
  14 out, the band is `7 + 11.5 = 18.5` wide, `Ea = 25.5`, `y_root = 33.5`:
  `r` at 41.5, `c` at `41.5 − 14 = 27.5`, `m1` at `27.5 − 5.5 = 22` (`j =
  1`), `m2` at `27.5 − 10.5 = 17` (`j = 2`); `Hc = 33.5 + 26.9765625 + 8 =
  68.4765625`, `H = 86.4765625`.
- Both maps below (`J = 2` on the inner half): inner 11.5, outer 7; `c`'s
  line lies `7 + 11.5 = 18.5` out, `Ea = 25.5`, `y_root = 33.5`: `r` at
  41.5, `c` at 23, `m1` at `23 + 5.5 = 28.5`, `m2` at `23 + 10.5 = 33.5`.
- `m1` above, `m2` below: each stack reaches 6.5 < 7, so the row keeps
  halves 7 and 7: `c`'s line 14 out, `Ea = 21`, `y_root = 29`: `r` at 37,
  `c` at 23, `m1` at `23 − 5.5 = 17.5`, `m2` at `23 + 5.5 = 28.5`. Both maps
  are `j = 1` of their own stack.
- `c` moved below the root, both maps left above: for a map `above` is still
  up, which is now `c`'s inner half (towards the root), `J = 2`. Above
  nothing is drawn, `Ea = 0`, `y_root = 14.40234375`, `r` at 22.40234375.
  Below, the root band reaches 26.9765625; the children band starts at
  `26.9765625 + 4 = 30.9765625` (more than 7), inner `11.5`, outer 7: `c`'s
  line lies `30.9765625 + 11.5 = 42.4765625` out, at `64.87890625`; `m1` at
  `64.87890625 − 5.5 = 59.37890625`, `m2` at `64.87890625 − 10.5 =
  54.37890625`, both between `c` and the root. `Eb = 30.9765625 + 18.5 =
  49.4765625`, `Hc = 14.40234375 + 49.4765625 + 8 = 71.87890625`, `H =
  89.87890625`.

**`map` with `tempo` below** (`{ids: [melody/tempo]} side below`): the
root band below holds the wedges (26.9765625) and a one-map stack (6.5) and
reaches `max(26.9765625, 6.5) = 26.9765625`. Above, no root band: the
children band starts at 7, `phrase` 14 out, `Ea = 21`, `y_root = 29`:
`melody` at 37, `phrase` at 23, `ticks` at 17.5, `tempo` at `37 + 5.5 =
42.5`, `Hc = 29 + 26.9765625 + 8 = 63.9765625`, `H = 81.9765625`. The wedge
tips lie at 38.5 and their bases at 51.5, over the map; the map's
descriptor index precedes both wedges'.

**`map` with the root's line hidden** (`{ids: [melody]} display none`): a
map is drawn only when its timeline's line is drawn, so `tempo` is not drawn
and takes no room, although its own `display` is `inline`. Above, no root
band (no wedge, no drawn root map): the children band starts at 7,
`phrase` 14 out, `Ea = 21`, `y_root = 29`; `phrase` at 23, `ticks` at 17.5.
The wedges, displayed on their own, still reach 26.9765625 below (tips at
38.5, bases at 51.5): `Hc = 63.9765625`, `H = 81.9765625`. The drawing holds
no `melody` and no `tempo` element.

**`conversion_maps__maps_quarters`** (one root, 18 maps, all displayed):
above, a stack of 18 maps reaches `1.5 + 18 × 5 = 91.5`, `y_root = 99.5`,
the root at 107.5; map `j` (canonical order, by id in code-point order, so
`cmap_1`, `cmap_10`, …, `cmap_14`, `cmap_2`, …, `tmap_2`) is centred `1.5
+ 5j − 1` above: `cmap_1` (`j = 1`) at 102 and `tmap_2` (`j = 18`) at
`107.5 − 90.5 = 17`. `Hc = 99.5 + 26.9765625 + 8 = 134.4765625`, `H =
152.4765625`. With every map moved below, the root band below holds the
wedges (26.9765625) and the stack (91.5) and reaches 91.5: `Ea = 0`,
`y_root = 14.40234375`, the root at 22.40234375, `Hc = 14.40234375 + 91.5 +
8 = 113.90234375`, `H = 131.90234375`, `j = 1` at `22.40234375 + 5.5 =
27.90234375`, `j = 18` at `22.40234375 + 90.5 = 112.90234375`.

**End markers.** `r` with `c` at 4, length 4, no maps, read with `locked`
changed and validated again against the schema (a manifest value built
directly, so the drawing alone is under test; section 6.6 draws every
combination). `r` lies at 37 and `c` at 23 (as above, no
stack). The `8 ♩` label reaches `430.0478515625 + 6.416015625 =
436.4638671875`.

- `r` unlocked, `c` locked (as `add` makes it): the root's arrowhead tip
  `R = 430.0478515625 + 9 = 439.0478515625` is the rightmost point, `W =
  457.0478515625`.
- `r` locked, `c` locked: the diamonds reach `430.0478515625 + 4.5 =
  434.5478515625`, the label wins, `W = 436.4638671875 + 18 =
  454.4638671875`.
- `r` locked, `c` unlocked: a child ends with the diamond whatever its
  `locked`, so the drawing equals the one before (`W = 454.4638671875`).

## Row spacing (`stretch.test.ts`)

At spacing `v`, `nested` has `p0 = p = max(14v, 12.8046875)`; with no map
stack, row 1's line lies `p0 / 2 + p / 2 = p` out and row 2's `2p` out, so
the root-to-child gap equals the child-to-grandchild gap. The vertical
padding is `P × v` (section 6.5), so `y_root = 8v + Ea`, and the box
ordinate is `8 + y_root`:

| `v` | `p` | root | `clt_3` | `clt_2` |
|---|---|---|---|---|
| 0.5 | 12.8046875 | `8 + (4 + 6.40234375 + 4 × 6.40234375) = 44.01171875` | 31.20703125 | 18.40234375 |
| 1 | 14 | `8 + 43 = 51` | 37 | 23 |
| 2 | 28 | `8 + (16 + 14 + 56) = 94` | 66 | 38 |

## Vertical padding (`stretch.test.ts`)

Section 6.5 multiplies the padding above and below the content by `v`:
`y_root = max(P v + Ea, P v + h(s) / 2)`, `Hc = y_root + max(Eb, h(s) / 2)
+ P v`, and a break line ends `P v` from the member drawing's top or
`Hc − P v` below it. This is what lets a vertical stretch grow a single
timeline, which has no rows to spread. The horizontal padding (`xn`, `x0`,
the card's span) is not stretched. Box ordinates are `8` plus the member
drawing's, `H = Hc + 18`.

- **`bare` (a root alone).** No band above (`Ea = 0`); below, the wedges
  reach `26.9765625` at every `v` (wedge and label sizes are fixed). At
  `v = 2`: `y_root = max(16, 16 + 6.40234375) = 22.40234375` (the line at
  30.40234375), `Hc = 22.40234375 + 26.9765625 + 16 = 65.37890625`, `H =
  83.37890625`. At `v = 0.5`: `y_root = 4 + 6.40234375 = 10.40234375` (at
  18.40234375), `Hc = 10.40234375 + 26.9765625 + 4 = 41.37890625`, `H =
  59.37890625`. At `v = 1` the drawing is the hand-derived one (the line at
  22.40234375, `H = 67.37890625`). The width stays `476.5771484375` at
  every `v`, and the height grows by exactly `2 × 8 × (v − 1)`.
- **`flow_control` at `v = 2`, break below.** `y_root = 22.40234375`, the
  line at 30.40234375. Below: the root band to 26.9765625, the flow band
  from `26.9765625 + 4 × 2 = 34.9765625`, one break-label tier, so the flow
  row lies `34.9765625 + 10.4765625 = 45.453125` out, `yf = 75.85546875`;
  one jump level, the band `10.4765625 + 16 + 0 + 2 + 10.4765625 =
  38.953125` wide, `Eb = 73.9296875`, `Hc = 22.40234375 + 73.9296875 + 16 =
  112.33203125`, `H = 130.33203125`. The break line runs from `y1 =
  75.85546875` to `y2 = 8 + 16 = 24`.
- **`flow_control` at `v = 2`, break moved above** (`{element: break} side
  above`). Above: the flow band holds the break-label tier alone, 10.4765625
  wide, `Ea = 10.4765625`, `y_root = max(16 + 10.4765625, 22.40234375) =
  26.4765625`, the line at 34.4765625. Below: the root band to 26.9765625
  and the flow band (the jump, no break label) from 34.9765625, `16 + 0 + 2
  + 10.4765625 = 28.4765625` wide, `Eb = 63.453125`, `Hc = 26.4765625 +
  63.453125 + 16 = 105.9296875`, `H = 123.9296875`. The break line runs
  from `y1 = 34.4765625 − 10.4765625 = 24` to `y2 = 8 + (Hc − 16) =
  97.9296875`: padding to padding.

At length 200 and spacing 1 the root of `nested` runs from 49.91552734375 to
`49.91552734375 + 200 = 249.91552734375` at 51: length moves x only.

## The cascade (`cascade.test.ts`)

`Cascade` holds the ranked statements of every layer; `resolve(key,
parent)` gives the cascaded style of one drawing of an element, `key` its
core `ElementKey` (with `inside`, the types of the elements holding it,
outermost first) and `parent` the style of its holder's drawing. The unit
tests use one key: the line of a child `c` of a root `r` (type `child`,
logical, continuous, `ContinuousLogicalTimeline`), held by the block and
the root's line (`inside: [block, timeline]`).

Each rank level of section 2.5 is tested in isolation: a statement winning
on that level is written *first* (so position alone would lose) and the
loser names every lower-ranking member:

1. layer: `{}` in layer 2 beats `{ids, within, class, element, inside,
   domain, modality}` in layer 1;
2. `ids`: beats `{within: c, class, element, inside, domain, modality}`;
3. `within` depth: `within` the child (depth 2) beats `within` the root
   (depth 1) with `class`, `element`, `inside`, `domain`, `modality`;
4. `class`: beats `{element, inside, domain, modality}`;
5. `element`: beats `{inside, domain, modality}`;
6. `inside`: `{inside: timeline}` beats `{domain, modality}`;
7. domain/modality count: `{domain, modality}` beats `{domain}`, and
   `{modality}` beats `{}`;
8. position: of two equal statements the later wins.

**`inside` (section 2.3).** On the key above, `{inside: timeline}` and
`{inside: block}` match, `{inside: child}` (the element's own type, not a
holder's) and `{inside: ancestor}` do not: a layer holding only
`{inside: child} stroke #111111` leaves the stroke `none`.

**One address drawn twice (section 2.5, last paragraph).** Two keys share
the address `m/start` (type `wedge`, timeline `m`, logical, continuous):
the mark on an ancestor line, `inside: [block, group, timeline, ancestor]`,
resolved with a parent of stroke `#111111`, and the wedge on the member's
own line, `inside: [block, group, timeline]`, with a parent of stroke
`#222222`. With the layer `[{inside: ancestor} opacity 0.5, {ids:
[m/start]} fill #654321]`, the mark has opacity 0.5 and the wedge 1; both
have fill `#654321` (the same `ids`); each takes the stroke of its own
parent, `#111111` and `#222222`. Through `draw` on `group_child_member`
with the one layer `[{ids: [piece]} stroke #111111, {inside: ancestor}
opacity 0.5]`, the two drawings of `second-half/start` have exactly the
(stroke, opacity) pairs `(#111111, 0.5)`, the mark, inheriting from the
ancestor line `piece`, and `(none, 1)`, the member's own wedge; the same
holds for `second-half/end` and for both labels, which inherit from their
wedge.

**`shadow` (sections 2.4, 2.5).** Its initial value is `none` and it is not
inherited: on the key above, a parent whose shadow is `#123456` leaves the
child's `none`; `{element: child} shadow #ABCDEF` sets it. Through `draw`
on `bare` with the one layer `{element: block} shadow #123456`, the block
has shadow `#123456` and `bare/card` `none`.

Selectors are matched by `core`'s `selectorMatches` against element keys,
and `core`'s `manifestElements` enumerates the same keys for the `style`
command: for every timeline, group and bundle fixture drawn with the
default layers, every drawn element but the block has an address that
`manifestElements` lists with the same type, and an address is drawn at
most as many times as `manifestElements` lists it (a member's start and end
twice when it has one ancestor line).

A style name sets its declaration; a name the layer's `styles` lacks sets
nothing, so a lower statement wins. A `within` naming an id outside the
manifest matches nothing. The block, which has no address, timeline,
domain or class, is matched by none of `{domain}`, `{ids}`, `{within}`,
`{class}`.

Inheritance, through `draw` on fixtures with explicit layers:

- with no layers at all every element has the initial values of
  section 2.5 (`stroke none`, width 1, dash `none`, `fill none`, opacity 1,
  `font-size 9`, `rx 0`, `shadow none`, `display inline`, `side below`,
  `content none`, `max-width none`);
- block → root: `[{select: {element: block}, set: {fill: #111111, opacity:
  0.5, rx: 4}}]` gives the root fill `#111111` (inherited) and opacity 1,
  rx 0 (not inherited);
- root → child, child → its child (`nested`): `{ids: [clt_1]}` stroke
  `#123456` reaches `clt_3` and `clt_2`;
- root → map (`map`): `{ids: [melody]}` stroke-width 7 reaches
  `tempo` when no statement sets it; a map has no name, so no element
  `tempo/name` is drawn;
- region → label (`with_region`): `{element: region}` font-size 13 gives
  the region label font-size 13;
- map domain and modality from `target_unit` (`conversion_maps__maps_quarters`
  with the default layer): `lmap_1` (seconds) is `#0050EF`, no dash;
  `cmap_11` (ticks) is `#00CC00` with dash `1 1`; `tmap_1`
  (floating_measures) `#00CC00`, no dash;
- a null `target_unit` (`cmap_6`) matches no domain selector and
  inherits its timeline's stroke: with the extra layer
  `{ids: [maps:quarters]} stroke #ABCDEF`, `cmap_6` is `#ABCDEF` while
  `lmap_1` stays `#0050EF`; its class is its type, so
  `{class: FloorMap} stroke #FEDCBA` reaches it and no other map.

## The box (`box.test.ts`, `groups.test.ts`)

Section 8: every manifest is drawn as one box (a manifest of one root as a
box holding it ungrouped, a manifest of one group as a box holding its
frame; a manifest with neither a `name` nor an `id` has no title), with
frames, cards, titles,
the shared start `x0` and the box size. The tests prove that the box is
built from the rules of sections 8.1, 8.2, 8.4 and 8.5 and nothing else:
each expected number below is derived by hand from those formulas, the font's
advance widths and the member heights `Hm` of section 6.5 (with the
ancestor band of section 8.3), never read back from the implementation.
All values are dyadic with small denominators, so every sum is exact in
binary64. A rectangle spanning `a..b`, `c..d` is the element `{x: a, y: c,
width: b − a, height: d − c}`; a card's `d` is its top plus `Hm`. A card's
shadow is no element of its own: it lies at `x + 2`, `y + 2` with the
card's size, and its edges `b + 2` and `d + 2` enter `Wb` and `Hb`.

The box has one horizontal layout (section 8.2), computed in item
coordinates: the name column `n` (`Q + K = 16` when the box holds a frame,
`K = 8` otherwise), `N` the widest name of any member drawing of the box,
the start `s0` and the right margin `Mr`, the largest `e − (s0 + Li)` over
the member drawings that draw anything; item `i`'s right edge is `Ri = s0 +
Li + Mr`, or its group's title's right edge when that is larger. Each item
is drawn at its place, a position `u` at `x + u` (scale 1, section 8.6).
The derivations below give drawn values for items at their default place
`x = P = 8`: the name column `xn = 8 + n`, the start `x0 = 8 + s0`, a right
edge `R = 8 + Ri`.

Common values: `P = Q = K = F = 8`, `G' = 8`, title gap 4, `a(11) =
10.21044921875`, `h(11) = 12.8046875`; a member drawing without ancestors
and with its two wedges below in one label tier is `Hm = 14.40234375 +
26.9765625 + 8 = 49.37890625` high, one with one ancestor row `Hm =
48.9765625 + 26.9765625 + 8 = 83.953125`, one with two `Hm = 82.953125 +
26.9765625 + 8 = 117.9296875`. Titles take the default `{element: name}`
size 11.

**`bare`** (one root: an anonymous box, no title, no frame, one ungrouped
root). `xn = P + K = 16`; `N = 25.5771484375` (`Bare`), so `x0 =
16 + 25.5771484375 + 8 = 49.5771484375` (the labels ask at most
22.416015625); the root runs from 49.5771484375 to 449.5771484375. `R` is the
arrowhead tip `449.5771484375 + 9 = 458.5771484375`. The card `bare/card`
spans `P = 8` to `R + K = 466.5771484375`: `{8, 8, 458.5771484375,
49.37890625}`; the root's line lies at `8 + 14.40234375 = 22.40234375`, its
name at `x = 16`. `Wb = 8 + (466.5771484375 + 2) = 476.5771484375` and `Hb =
8 + (8 + 49.37890625 + 2) = 67.37890625`: the shadow sets both. Elements in
order: block, `bare/card`, then the member drawing (`bare`, `bare/start`,
`bare/end`, `bare/name`, `bare/start/label`, `bare/end/label`).

**`group__group_child_member`** (one group; frame `group_1` "Second
half", display order `second-half`, `recording`). `xn = P + Q + K = 24`; `N
= 64.61962890625`; the ancestor `piece` runs on to the left with `wa = 3`,
so `x0 = 24 + 64.61962890625 + 8 + 24 = 120.61962890625`. `R =
534.4140625` (the `10.0 s` label). Frame `{8, 8, R + K + Q − 8 =
542.4140625, 174.13671875}` (`8 + 12.8046875 + 4 + 83.953125 + 8 +
49.37890625 + 8`); title `group_1/name` at `x = P + Q = 16`, baseline `8 + 8
+ a(11) = 26.21044921875`; cards span `16` to `R + K = 542.4140625`, width
526.4140625: `second-half/card` top `8 + 8 + 12.8046875 + 4 = 32.8046875`,
height 83.953125; `recording/card` top `32.8046875 + 83.953125 + 8 =
124.7578125`, height 49.37890625. Root lines at `32.8046875 + 48.9765625 =
81.78125` and `124.7578125 + 14.40234375 = 139.16015625`. `W = 8 +
550.4140625 = 558.4140625`, `H = 8 + 182.13671875 = 190.13671875`: the frame
sets both. Element order: block, `group_1`, `group_1/name`,
`second-half/card`, the member drawing of `second-half` (ancestor `piece`,
`second-half`, its marks, its wedges, `piece/name`, `second-half/name`, the
mark labels, the wedge labels), `recording/card`, the member drawing of
`recording`.

**`group__group_parents_mixed`** (frame "Exposition", members `exposition`,
`take`, `system`, `audio`; three with one ancestor row). `N =
57.0302734375`, chevron term `x0 = 24 + 57.0302734375 + 8 + 24 =
113.0302734375`; `R = 544.08642578125` (the `1323000 smp` label). Cards
`x = 16`, width `552.08642578125 − 16 = 536.08642578125`, tops 32.8046875,
124.7578125, 216.7109375, 308.6640625, heights 83.953125 (three) and
49.37890625; frame `{8, 8, 552.08642578125, 358.04296875}`; root lines at
81.78125, 173.734375, 265.6875, 323.06640625; `W = 568.08642578125`, `H =
374.04296875`.

**`group__group_grandchild`** (frame "Theme", members `theme` with two
ancestor rows and `recording`). `N = 55.70361328125`, `x0 = 24 +
55.70361328125 + 8 + 24 = 111.70361328125`; `R = 535.70361328125` (the
outer chevron tip of `score`, `x0 + L + 8w`). Cards `x = 16`, width
527.70361328125: `theme/card` `{16, 32.8046875, …, 117.9296875}`,
`recording/card` `{16, 158.734375, …, 49.37890625}`; frame `{8, 8,
543.70361328125, 208.11328125}`; root lines at 115.7578125 and
173.13671875; `W = 559.70361328125`, `H = 224.11328125`.

**`bundles/bundle_mixed`** (a manifest named "Mixed", without an `id`: groups `group_1`
"Performance" with order `score`, `performance` and `group_2` "Facsimile"
with order `page`, `excerpt`; `excerpt` is a child of `recording` at 44100
samples, 88200 long, so `recording` holds a member and is drawn only as
its ancestor line; `annotations` is the one ungrouped root). Names at 11:
`Score` 31.05029296875, `Performance` (`A = 13087`) 70.29150390625, `Page`
27.1240234375, `Excerpt` 42.09326171875, `Annotations` (`A = 12298`)
66.0537109375; the ancestor name `Recording` at 9 45.57568359375. One
layout for the box (section 8.2), in item coordinates:

- The box holds frames, so `n = Q + K = 16` for every item, the ungrouped
  card's included; `N = 70.29150390625` (`Performance`, the widest name of
  the box). `recording` starts at `ts = −44100 < 0`, so its ancestor line
  runs on to the left (`wa = 3`): `s0 = 16 + 70.29150390625 + 8 + 24 =
  118.29150390625`. No centred label asks more (the widest start label,
  the mark label `44100 smp`, `A = 11528`, 50.66015625 wide, asks `16 +
  25.330078125`).
- The right margin: `excerpt`'s end mark label `132300 smp` (`A = 12831`,
  56.38623046875 wide) is centred on the shared end, `e − (s0 + 400) =
  28.193115234375`, beyond its right chevron tip (24) and its end label
  `88200 smp` (25.330078125); `group_1`'s widest is the end label `12.5 s`
  (27.5888671875 wide, 13.79443359375) and `annotations`' its end label `12
  ♩` (9.279052734375). So `Mr = 28.193115234375` and every item has `Ri =
  118.29150390625 + 400 + 28.193115234375 = 546.484619140625` (the group
  titles end at `8 + 70.29150390625` and `8 + 51.498046875`).
- Each frame spans `0` to `Ri + K + Q = 562.484619140625`, its cards `Q =
  8` to `Ri + K = 554.484619140625` (width 546.484619140625); the ungrouped
  card spans `0` to `Ri + K + Q = 562.484619140625`, so the frames and the
  card of one length end at one x. Drawn at `x = 8`: frames and
  `annotations/card` from 8, width 562.484619140625, the member cards from
  16, width 546.484619140625, every line from `8 + 118.29150390625 =
  126.29150390625` to 526.29150390625.

These are the bytes of the box laid out once over all its items before
each item was laid out on its own (the drawing fixture `bundle__bundle_mixed`,
pinned by the writers' `fixtures.test.ts`).

- The manifest's title `name` "Mixed" lies at the box's top left corner,
  `x = Xl + P = 8`, baseline `(Yt + P) + a(11) = 18.21044921875`; the
  first frame starts at `Pt = P + h(11) + F = 28.8046875`.
- `group_1`: top 28.8046875, height `8 + 12.8046875 + 4 + 49.37890625 + 8 +
  49.37890625 + 8 = 139.5625`, title baseline `28.8046875 + (8 + a(11)) =
  47.01513671875`, cards `score/card` at 53.609375 and `performance/card`
  at `28.8046875 + 82.18359375 = 110.98828125`.
- `group_2`: top `28.8046875 + 139.5625 + 8 = 176.3671875`, height `8 +
  12.8046875 + 4 + 49.37890625 + 8 + 83.953125 + 8 = 174.13671875`, title
  baseline 194.57763671875, cards `page/card` at 201.171875 and
  `excerpt/card` at 258.55078125 (height 83.953125).
- The ungrouped card `annotations/card`: top `176.3671875 + 174.13671875 +
  8 = 358.50390625` (`F` below the largest bottom edge before it), height
  49.37890625.
- Root lines: `score` (126.29150390625, 68.01171875), `performance`
  (126.29150390625, 125.390625), `page` (126.29150390625, 215.57421875),
  `excerpt` (126.29150390625, `258.55078125 + 48.9765625 = 307.52734375`),
  `annotations` (126.29150390625, 372.90625), as `(xs, y)`.
- `W = 8 + (570.484619140625 + 2) = 580.484619140625`: the ungrouped card's
  shadow, beyond the frames' right edge 570.484619140625; `H = 8 +
  (358.50390625 + 49.37890625 + 2) = 417.8828125`, the ungrouped card's
  shadow. No item lies left of or above the padding, so the place origin is
  `(0, 0)`.
- `Drawing.cards`, one per member card in drawing order: `score` and
  `performance` in `group_1`, `page` and `excerpt` in `group_2`, addresses
  `M/card`, sizes `{546.484619140625, 49.37890625}` (three) and
  `{546.484619140625, 83.953125}` for `excerpt`, `spacing` 1 and `stated` `{}` each; the
  ungrouped card is an item, not a member card.
- Element order: block, `name`, `group_1`, `group_1/name`,
  `score/card`, its member drawing, `performance/card`, its drawing,
  `group_2`, `group_2/name`, `page/card`, …, `excerpt/card`, …,
  `annotations/card`, `annotations`, ….

**Hidden titles.** With `{ids: ["group_1/name"]} display none` on
`group_child_member`, no title is drawn and the frame loses its slot: the
first card starts at `8 + 8 = 16`, the second at `16 + 83.953125 + 8 =
107.953125`, the frame is `8 + 83.953125 + 8 + 49.37890625 + 8 =
157.33203125` high and `H = 8 + 8 + 157.33203125 = 173.33203125`. With
`{ids: ["name"]} display none` on `bundle_mixed`, the first frame
starts at `P = 8`, everything below moves up by `h(11) + F = 20.8046875`,
and `H = 397.078125`.

**Hidden cards and frames (section 8.4).** A frame or card that is not
displayed is not drawn but keeps its place: its edges enter `Wb` and `Hb`
as when it is displayed, a hidden card's shadow does not, and `xn` and
every other element stay as they are. A box that falls back to `P + x0`
and `P` would leave the member drawings outside it, so each case is
checked against the edges above, never against that fallback.

- `bare` with `{element: card} display none`: no `card` element is drawn.
  The card still spans `8` to `466.5771484375` and `8` to `8 +
  49.37890625 = 57.37890625`, without its shadow: `Wb = 8 +
  466.5771484375 = 474.5771484375` and `Hb = 8 + 57.37890625 =
  65.37890625`, the displayed `W` and `H` less the shadow's 2, since the
  shadow set both. Every element but the block and `bare/card` equals its
  displayed counterpart.
- `group_child_member` with `{element: card} display none`: no `card`
  element is drawn. The frame set both edges, beyond the cards' shadows
  (`544.4140625 < 550.4140625`, `176.13671875 < 182.13671875`), so `W =
  558.4140625` and `H = 190.13671875` are unchanged, and every element but
  `second-half/card` and `recording/card` equals its displayed counterpart.
- `group_child_member` with `{element: group} display none`: no `group`
  element is drawn, yet the frame keeps its place: `xn = P + Q + K = 24`
  (`piece/name` at `x = 24`), the cards at `x = 16`, and `W =
  558.4140625`, `H = 190.13671875` from the frame's edges, not `8 +
  544.4140625` and `8 + 176.13671875` from the cards' shadows. Every
  element but `group_1` equals its displayed counterpart.

**The box size.** `W = max(Wb, width)`, `H = max(Hb, height)`, `Wb` and
`Hb` when null. `bare` at `width` 600, `height` 100 gives `W = 600`, `H =
100`, every other element unchanged; at 300 and 20 it gives `Wb` and `Hb`;
at `width` 600 and `height` null `H = Hb`. **The box padding `P` is not
stretched:** `bare` at `spacing` 2 keeps its card at `y = 8` (the member's
own padding `P × v = 16` lies inside the card): `Hm = 22.40234375 +
26.9765625 + 16 = 65.37890625`, the root line at `8 + 22.40234375 =
30.40234375`, `H = 8 + 8 + 65.37890625 + 2 = 83.37890625`, `W`
unchanged at 476.5771484375.

**Addresses (section 2.2).** In every manifest an element with an id of
its own other than a timeline or group is prefixed by the id of the root of
`timelines` whose tree holds it: `corpus_mpm`'s map `tmap_1` on the root `score:clt_1` is
`score:clt_1/tmap_1`. A region `region_1` (2 to 6 quarters, named `Theme`)
added through `add` into the member `second-half` of `group_child_member`
is `piece/region_1`, its label `piece/region_1/label`, although
`second-half` is drawn as the root of its member drawing. A part keeps its
element's address: the cards are `M/card`, a member's wedges `M/start` and
`M/end`, on its own line and as marks on its ancestor lines.

**Cards in the tree (sections 2.1 and 8.1).** A card belongs to its
timeline and has its domain: `{element: card, domain: physical} fill
#ABCDEF` fills `recording/card` and not `second-half/card`. A card holds
nothing: `{inside: card} stroke #123456` reaches no element. In
`groups.test.ts`, with layers holding no defaults:

1. **The frame holds its title, cards and member lines.** With `{element:
   group} {stroke: #123456, font-size: 13}`, `group_child_member`'s member
   lines `second-half` and `recording`, the title `group_1/name` and the
   cards take the frame's stroke `#123456` and font size 13; the ancestor
   line `piece` takes them from its member `second-half`, and its name
   `piece/name` from the ancestor. With `{ids: [second-half]} {stroke:
   #654321}` instead, `piece` is `#654321` and `recording` keeps `none`;
   so does `second-half/card`, a sibling of the line and not its holder.
2. **The block holds the manifest's title, the frames and the ungrouped
   cards and lines.** With `{element: block} {stroke: #111111}` on
   `bundle_mixed`, `name`, `group_1`, `annotations/card` and
   `annotations` take `#111111`; with `{ids: [annotations/card]} {stroke:
   #222222}` the line `annotations` keeps `none`.

## Places and band orders (`places.test.ts`)

Sections 1, 6.4, 8.2, 8.4 and 8.6: every item of the box (a group's frame
or an ungrouped root's card) applies the box's one horizontal layout at its
own place; the box grows in every direction to hold the items, and the
drawing reports the place origin `(Ox, Oy)` within the box; a member
drawing's root takes the band order of its own id in `bands`, else that of
its group, else `order`. The readings the arithmetic below follows: an
item is laid out in item coordinates (its left edge and top at 0) and each
of its positions `u` is drawn at `x + u` (scale 1), so a width or height is
taken in item coordinates; an item's default `y` lies `F` below the largest
bottom edge `d` of the items before it (a height request included, no
shadow), summed in place coordinates; `Xl = min(0, smallest x − P)`, `Yt =
min(0, smallest y − Pt)` with `Pt = P + h(s) + F` when the manifest's title
is displayed and `P` otherwise; `(Ox, Oy) = (0 − Xl, 0 − Yt)`, so a zero
origin is `+0`; the manifest's title lies at `(Xl + P, (Yt + P) + a(s))`;
`Ox` (`Oy`) is added to each finished position last; `Wb = (P + the largest
right edge) − Xl` and `Hb = (P + the largest bottom edge) − Yt`, the edges
in place coordinates, a card's shadow and the title (its right edge `Xl +
P` plus its width, its slot ending at `Yt + P + h(s)`) included. The tests prove
each rule from the specification's sums, never from the implementation's
output, and they prove that the rules change nothing a drawing of one
item without `places` and `bands` showed before. Where the specification's order of
sums matters only in the last bit, a case with a fractional place shows a
value the other order would not give.

**The band order cascade.** `bandOrderOf(placement, timeline, group)` is
pure; with `D = ["children", "regions", "flow"]`, `F = ["flow", "regions",
"children"]` and `T = ["regions", "children", "flow"]`:

| `order` | `bands` | timeline, group | expected |
|---|---|---|---|
| `D` | `{}` | `score`, `null` | `D` |
| `F` | `{}` | `score`, `group_1` | `F` (the block's) |
| `D` | `{group_1: F}` | `score`, `group_1` | `F` (the group's over the block's) |
| `D` | `{group_1: F}` | `score`, `null` | `D` (an ungrouped root has no group) |
| `D` | `{group_1: F, score: T}` | `score`, `group_1` | `T` (the timeline's over the group's) |
| `F` | `{score: T}` | `score`, `null` | `T` (the timeline's over the block's) |
| `D` | `{}` | `toString`, `constructor` | `D` (only the object's own keys count, never inherited ones) |

The cascade must also reach the drawing. `styled__score` has child `b`
alone above, and region `intro` and jump `da-capo` below, so its drawing
depends on whether regions or flow come first: at `order: F` its elements
differ from those at `D` (the check that the cases below are not vacuous),
and at `D` with `bands: {score: T}` they equal those at `D` (`T` also puts
regions before flow). The drawings are compared whole (`toEqual` of
`elements`):

- `bands: {score: F}` draws exactly as `order: F`: the timeline's entry is
  used;
- `order: F` with `bands: {score: D}` draws exactly as the default: the
  timeline's entry wins over the block's;
- `styled__score` with its root made the one member of a group `group_1`
  (the fixture plus `groups: [{id: "group_1", name: null, meta: {},
  members: ["score"]}]`, validated against the schema): `bands: {group_1:
  F}` draws exactly as `order: F`, and `bands: {group_1: F, score: D}`
  exactly as the default (the timeline's over its group's);
- a `bands` key naming nothing drawn (`{nothing: F}`) changes nothing,
  and neither does one naming a timeline that is drawn but not as a root
  in a card (`{b: F}`, the child `b`);
- an absent band adds no `B`: `bands: {score: ["flow", "children",
  "regions"]}` (the review case `styled__score__bands-timeline`) draws
  exactly as `order: F`, since `styled__score` has no children band below,
  so between its flow band and its region band no gap is added for it; and
  it differs from the default, so the case is not vacuous;
- no inheritance from an ancestor timeline: `styled__score`'s root made
  the child of a new root `piece` (length 16 quarters, no regions, maps or
  flow, the child at offset 0 and locked) and the one member of `group_1`,
  validated against the schema. `bands: {piece: F}` draws exactly as the
  default, although `piece` is `score`'s ancestor and its line is drawn in
  `score`'s ancestor band; `bands: {score: F}` differs from the default and
  draws exactly as `order: F`.

**Defaults reproduce the stacked box.** With `places` empty, every item
takes `x = P = 8`, the placement's `length`, sizes `null`, and `y` one
under the other (section 8.6), which is the box the earlier sections of
this file derive; those expectations stay unchanged. On top: `bare`'s
drawing reports `origin {x: 0, y: 0}`, both zeros `+0` (`Object.is(…, 0)`,
since `0 − 0` is `+0`), and one item `{key: "bare", kind:
"card", address: "bare/card", place: {x: 8, y: 8, length: 400, scale: 1,
spacing: 1, width: 458.5771484375, height: 49.37890625}, stated: {}}` (its
card's rectangle; the default scale 1 and spacing 1); `group_child_member`
one item `{key: "group_1", kind: "group", address: "group_1", place: {x: 8,
y: 8, length: 400, scale: 1, spacing: 1, width: 542.4140625, height:
174.13671875}, stated: {}}`. Every reported place carries its `spacing`, 1
unless `places` states it; the places listed below leave it out where it
is 1. Stating those defaults explicitly (`places:
{bare: {x: 8, y: 8, length: 400}}`) draws the same `width`, `height`,
`origin` and `elements`; only the item's `stated` becomes that object.

**The default `y`** (section 8.6) is `F` below the largest bottom edge `d`
of the items before it, a card's shadow not counted, and an item with a
`height` request ends at its requested bottom. In `bundle_ungrouped` with
`places` empty, `recording` lies at `28.8046875 + 63.453125 + 8 =
100.2578125` below `pages` (not `+ 2` more for `pages`' shadow); with
`places: {pages: {height: 100}}` it lies at `28.8046875 + 100 + 8 =
136.8046875`, and `score` at `136.8046875 + 49.37890625 + 8 =
194.18359375`.

**Items order and `stated`.** `items` follows the drawing order of section
8.5 (frames by group id, then ungrouped roots by id) and carries each
place as `places` states it, `{}` where it states none: `bundle_mixed`
with the places below gives the keys `group_1`, `group_2`, `annotations`,
kinds `group`, `group`, `card`, addresses `group_1`, `group_2`,
`annotations/card`, and `stated` `{}`, `{x: 40, y: 200, width: 700}`, `{x:
−30, length: 300}`.

**An item left of the padding, a width request and a length of its own**
(`bundle_mixed` at `places: {group_2: {x: 40, y: 200, width: 700},
annotations: {x: −30, length: 300}}`, the review case
`bundle_mixed__places`). The box's layout is that of `bundle_mixed` above
(`n = 16`, `s0 = 118.29150390625`, `Mr = 28.193115234375`): `annotations`'
own length changes neither, since its end label sits on its shared end at
any length. In item coordinates:

- `group_1` keeps its default place and the layout derived for
  `bundle_mixed` above: `x = 8`, `y = 28.8046875`, width
  562.484619140625, height 139.5625.
- `group_2` at `x = 40`, `y = 200`: `Ri = 546.484619140625`; the request
  `700 − K − Q = 684` is larger, so `Ri = 684`: the frame spans `0` to `684
  + 8 + 8 = 700`, width 700, the requested width exactly; its cards `8` to
  `692`, width 684. Height 174.13671875 as before, bottom `374.13671875`.
- `annotations` at `x = −30`, `L = 300`, `y` its default: `F` below the
  largest bottom edge of the items before it, `max(28.8046875 + 139.5625,
  200 + 174.13671875) + 8 = 382.13671875`, although `group_2` was placed
  by hand. Its line runs from `s0` to `s0 + 300 = 418.29150390625` (the
  other items keep 400); `Ri = 418.29150390625 + 28.193115234375 =
  446.484619140625`, and the card spans `0` to `Ri + K + Q =
  462.484619140625` (the box holds frames), height 49.37890625.
- The origin (section 8.4): the smallest left edge is `−30`, so `Xl =
  min(0, −30 − 8) = −38`; the smallest top is `28.8046875`, so `Yt =
  min(0, 28.8046875 − Pt) = 0` with `Pt = 28.8046875`; `(Ox, Oy) = (38, 0)`.
- The box, in place coordinates: the largest right edge is `group_2`'s
  `40 + 700 = 740` (its cards' shadows reach `40 + 694 = 734`), so `Wb =
  (8 + 740) − (−38) = 786`; `Hb = (8 + (382.13671875 + 49.37890625 + 2)) −
  0 = 441.515625`, the card's shadow.
- Every position is the item-coordinate value plus the item's `x` and `y`,
  plus the origin last: the title `name` at `x = (Xl + P) + 38 = 8`, the
  box's top left whatever lies left of the padding, baseline
  18.21044921875; `group_1` `{46, 28.8046875, 562.484619140625,
  139.5625}`; `group_2` `{78, 200, 700, 174.13671875}`; `page/card` `{40 +
  8 + 38 = 86, 200 + 24.8046875 = 224.8046875, 684, 49.37890625}`;
  `annotations/card` `{8, 382.13671875, 462.484619140625, 49.37890625}`;
  the lines `score` from `(8 + 118.29150390625) + 38 = 164.29150390625` to
  `564.29150390625` at `y = 68.01171875`, `page` from `196.29150390625` to
  `596.29150390625` at `200 + (24.8046875 + 14.40234375) = 239.20703125`,
  `annotations` from `(−30 + 118.29150390625) + 38 = 126.29150390625` to
  `(−30 + 418.29150390625) + 38 = 426.29150390625` at `382.13671875 +
  14.40234375 = 396.5390625`.
- The items report their places unshifted, with the drawn size in item
  coordinates: `group_1 {x: 8, y: 28.8046875, length: 400, scale: 1, width:
  562.484619140625, height: 139.5625}`, `group_2 {x: 40, y: 200, length:
  400, scale: 1, width: 700, height: 174.13671875}`, `annotations {x: −30, y:
  382.13671875, length: 300, scale: 1, width: 462.484619140625, height:
  49.37890625}`.

**An item left of and above the padding and a height request**
(`bundle_ungrouped`, titled "Sketches", ungrouped roots `pages`,
`recording`, `score`, at `places: {score: {x: −60, y: −150, height: 120}}`,
the review case `bundle_ungrouped__places`). The box holds no frame: `n =
K = 8`; `N = 55.70361328125` (`Recording`, wider than `Pages`
32.85498046875 and `Score` 31.05029296875), so `s0 = 8 + 55.70361328125 +
8 = 71.70361328125`; `Mr = 28.193115234375`, `recording`'s end label
`441000 smp` (beyond `pages`' `5262 px`, 18.402099609375, and `score`'s
`16 ♩`, 9.279052734375); every card spans `0` to `Ri + K = 71.70361328125 +
400 + 28.193115234375 + 8 = 507.896728515625`. In place coordinates:
`pages` lies at its default `(8, Pt = 8 + 12.8046875 + 8 = 28.8046875)`,
height 63.453125; `recording` at `(8, 28.8046875 + 63.453125 + 8 =
100.2578125)`, height 49.37890625, although `score`, last in drawing order,
lies above both; `score` at `(−60, −150)`, its card `max(49.37890625, 120)
= 120` high, its member drawing keeping its top.

- The origin: `Xl = min(0, −60 − 8) = −68` and `Yt = min(0, −150 − Pt) =
  −178.8046875`: the title's slot and `F` lie above the highest item. So
  `(Ox, Oy) = (68, 178.8046875)`.
- The title at the box's top left corner: `x = (Xl + P) + Ox = −60 + 68 =
  8`, baseline `((Yt + P) + a(11)) + Oy = (−170.8046875 + 10.21044921875) +
  178.8046875 = 18.21044921875`; it is not drawn above `score`'s place but
  pushed up with the box's top, `F` above the item.
- In the box, each finished position plus the origin: `score/card` `{8,
  −150 + 178.8046875 = 28.8046875, 507.896728515625, 120}`, its line from
  `(−60 + 71.70361328125) + 68 = 79.70361328125` at `(−150 + 14.40234375) +
  178.8046875 = 43.20703125`; `pages/card` `{76, 207.609375,
  507.896728515625, 63.453125}`, its line from `(8 + 71.70361328125) + 68
  = 147.70361328125`; `recording/card` `{76, 279.0625, 507.896728515625,
  49.37890625}`, its line from 147.70361328125 at `(100.2578125 +
  14.40234375) + 178.8046875 = 293.46484375`.
- The box: `Wb = (8 + (8 + 507.896728515625 + 2)) − (−68) =
  593.896728515625`, from `pages`' and `recording`'s shadows, and `Hb = (8
  + (100.2578125 + 49.37890625 + 2)) − (−178.8046875) = 338.44140625`, from
  `recording`'s shadow.
- The items report their places unshifted, with the drawn sizes: `pages
  {8, 28.8046875, 400, 1, 507.896728515625, 63.453125}`, `recording {8,
  100.2578125, 400, 1, 507.896728515625, 49.37890625}`, `score {−60, −150,
  400, 1, 507.896728515625, 120}` (as `{x, y, length, scale, width,
  height}`).

**A frame's own length and height request, a card's width request**
(`bundle_mixed` at `places: {group_1: {length: 300, height: 200},
annotations: {width: 600}}`). No item lies left of or above the padding,
so the place origin is `(0, 0)` and box and place coordinates agree. Each
value below would be different under a wrong rule: the placement's
`length` for the frame, its own height for the next default `y`, or a width
request that leaves out the inset `Q` an ungrouped card has in a box
holding frames. `s0 = 118.29150390625` and `Mr = 28.193115234375` as in
`bundle_mixed` (no label sits at a fraction of the axis, so no centred
label asks more at the shorter length, and the end labels' margins do not
depend on it).

- `group_1` at its default place `(8, 28.8046875)` with `L = 300`: the
  lines `score` and `performance` run from `8 + 118.29150390625 =
  126.29150390625` to `8 + 418.29150390625 = 426.29150390625` (at 400 they
  would end at 526.29150390625), at `y = 68.01171875` and 125.390625. `Ri =
  418.29150390625 + 28.193115234375 = 446.484619140625`, so the frame spans
  `0` to `Ri + 8 + 8 = 462.484619140625`, its cards `8` to
  `454.484619140625`, width 446.484619140625. Its own height 139.5625 is
  smaller than the request, so the frame is `max(139.5625, 200) = 200`
  high: `{8, 28.8046875, 462.484619140625, 200}`; its cards keep their
  tops, `score/card` `{16, 53.609375, 446.484619140625, 49.37890625}` and
  `performance/card` at 110.98828125.
- `group_2` at its default `y`, `F` below the frame's requested bottom:
  `28.8046875 + 200 + 8 = 236.8046875` (its own height would give
  176.3671875); otherwise as derived above, `{8, 236.8046875,
  562.484619140625, 174.13671875}`, `page/card` at `236.8046875 + 24.8046875
  = 261.609375`.
- `annotations` at `y = 236.8046875 + 174.13671875 + 8 = 418.94140625`,
  `L = 400`, its line from `126.29150390625` to `526.29150390625` at
  `418.94140625 + 14.40234375 = 433.34375`. Its `Ri = 546.484619140625` is
  smaller than the request `600 − K − Q = 584`, so `Ri = 584` and the card
  spans `0` to `584 + 8 + 8 = 600`, width 600, the requested width exactly
  (without the inset, `600 − K = 592` would give width 608): `{8,
  418.94140625, 600, 49.37890625}`.
- The box: `Wb = (8 + (8 + 600 + 2)) − 0 = 618`, the card's shadow beyond
  the frames' `570.484619140625`; `Hb = (8 + (418.94140625 + 49.37890625 +
  2)) − 0 = 478.3203125`.
- The items: `group_1 {8, 28.8046875, 300, 1, 462.484619140625, 200}`,
  `group_2 {8, 236.8046875, 400, 1, 562.484619140625, 174.13671875}`,
  `annotations {8, 418.94140625, 400, 1, 600, 49.37890625}` (as `{x, y,
  length, scale, width, height}`).

**A fractional place origin: the shift is added last.** All the values
above are exact, so they cannot tell the order of sums apart. Two cases
whose origin is not a short binary fraction can:

- `bundle_ungrouped` at `places: {score: {x: −60.33, y: −150.33, height:
  120}}`: `(Ox, Oy) = (0 − (−60.33 − 8), 0 − (−150.33 − 28.8046875)) =
  (68.33, 179.1346875)`. Every card keeps its item-coordinate width
  507.896728515625, taken before the shift (laid out from the shifted `x =
  76.33`, `pages`' and `recording`'s would be 507.89672851562506);
  `pages/card` lies at `x = 8 + 68.33 = 76.33`, `y = 28.8046875 +
  179.1346875 = 207.939375`; `recording`'s line at `(100.2578125 +
  14.40234375) + 179.1346875 = 293.79484375000004`. `Wb = (8 + 517.896728515625)
  − (−68.33) = 594.226728515625` and `Hb = (8 + 151.63671875) −
  (−179.1346875) = 338.77140625000004`. The items report `pages {8,
  28.8046875, 400, 1, 507.896728515625, 63.453125}`, `recording {8,
  100.2578125, 400, 1, 507.896728515625, 49.37890625}`, `score {−60.33,
  −150.33, 400, 1, 507.896728515625, 120}`.
- `bundle_mixed` at `places: {group_1: {y: 10.01}, annotations: {x: 560,
  y: −40.1}}`: `annotations` sets the origin, `Oy = 0 − (−40.1 −
  28.8046875) = 68.9046875`; `group_2`'s default `y` is summed in place
  coordinates, `(10.01 + 139.5625) + 8 = 157.5725`, and drawn at `157.5725
  + 68.9046875 = 226.47718749999999` (summed from the shifted `group_1` top
  it would be 226.4771875).

## One layout, item scales, card sizes and vertical stretches (`items.test.ts`)

Sections 8.2, 8.4 and 8.6 as one horizontal layout for the whole box, the
scale of an item, the size a member's card requests and the vertical
stretch of an item and of a member's card. The tests prove that the name
column, the start and the right margin are found once over every item,
that an item's scale scales every position and length of it about its top
left corner and nothing else, that a member's card request widens and
heightens that card and its frame, and that a member drawing's vertical
stretch `v` is the product of the placement's, its item's and its card's
`spacing`, each from the specification's sums. The quantities of `bundle_ungrouped` ("Sketches",
ungrouped roots `pages`, `recording`, `score`, no frame) are those of
"Places and band orders": `n = K = 8`, `s0 = 71.70361328125`, `Mr =
28.193115234375`, every card `Ri + K = 507.896728515625` wide, `Pt =
28.8046875`; heights `pages` 63.453125, `recording` and `score`
49.37890625.

**The widest name and the right margin in the second item.**
`bundle_ungrouped` with `score` removed (core's `remove`), so two items,
`pages` then `recording`, and `recording` holds both the widest name
(55.70361328125 against `Pages` 32.85498046875) and the largest margin
(28.193115234375 against `pages`' 18.402099609375). `pages` takes both from
it: its line starts at `8 + 71.70361328125 = 79.70361328125`, not at the `8
+ (8 + 32.85498046875 + 8) = 56.85498046875` of its own names, and its card
is 507.896728515625 wide, not the `(71.70361328125 + 400 + 18.402099609375)
+ 8 = 498.105712890625` of its own content. Both names lie at `x = 8 + 8 =
16`. The box: `W = 8 + (8 + 507.896728515625 + 2) = 525.896728515625`, `H =
8 + (100.2578125 + 49.37890625 + 2) = 159.63671875`.

**Two items of one length are equally wide wherever they lie.**
`bundle_ungrouped` at `places: {recording: {x: 100}}`: `recording/card` is
`{100, 100.2578125, 507.896728515625, 49.37890625}`, as wide as
`pages/card` `{8, 28.8046875, 507.896728515625, 63.453125}`; its line runs
from `100 + 71.70361328125 = 171.70361328125` to `571.70361328125`; `W = 8 +
(100 + 507.896728515625 + 2) = 617.896728515625`.

**A stated length keeps the shared name column.** `bundle_ungrouped` at
`places: {recording: {length: 200}}`: `recording`'s line runs from
79.70361328125 to `8 + (71.70361328125 + 200) = 279.70361328125`, its name
at 16; its end label keeps its margin at any length, so `Mr` and `s0` are
unchanged and its card is `(71.70361328125 + 200 + 28.193115234375) + 8 =
307.896728515625` wide, while `pages` keeps 507.896728515625 and its line
from 79.70361328125 to 479.70361328125.

**The manifest's title at the box's top left, with an item placed into its
slot.** `bundle_ungrouped` at `places: {pages: {y: 20}}`: `pages` lies above
`Pt`, so `Yt = min(0, 20 − 28.8046875) = −8.8046875` and `Oy = 8.8046875`.
The title lies at `x = (Xl + P) + 0 = 8`, baseline `((Yt + P) + a(11)) + Oy
= (−0.8046875 + 10.21044921875) + 8.8046875 = 18.21044921875`; `pages/card`
is drawn at `20 + 8.8046875 = 28.8046875`, `F` below the title's slot.
`recording` and `score` take their default tops below `pages`, `20 +
63.453125 + 8 = 91.453125` and `91.453125 + 49.37890625 + 8 =
148.83203125`, so `H = (8 + (148.83203125 + 49.37890625 + 2)) − (−8.8046875)
= 217.015625`, the height of the box without `places`. Without `Pt` the
item would lie under the title (`Yt = 0`, `H` 208.2109375). The case of an
item far above the title is `bundle_ungrouped__places` in "Places and band
orders".

**A scaled ungrouped card** (`bare` at `places: {bare: {scale: 2}}`; one
item, so the layout is `bare`'s: `n = 8`, `s0 = 8 + 25.5771484375 + 8 =
41.5771484375`, the card from 0 to `Ri + K = 458.5771484375`, `Hm =
49.37890625`; place `(8, 8)`). Each position `u` is drawn at `8 + 2 × u`,
each length doubled:

- the card `{8, 8, 2 × 458.5771484375 = 917.154296875, 2 × 49.37890625 =
  98.7578125}`, its shadow offset `2 × 2 = 4`, its stroke width `2 × 0.75 =
  1.5` and corner radius `2 × 5 = 10`;
- the name `bare/name` at `x = 8 + 2 × 8 = 24`, baseline `8 + 2 × (14.40234375
  + 3.80810546875) = 8 + 2 × 18.21044921875 = 44.4208984375`, font size `2
  × 11 = 22`;
- the wedge `bare/start` at `x = 8 + 2 × 41.5771484375 = 91.154296875`, tip
  `8 + 2 × (14.40234375 + 1.5) = 39.8046875`, base `8 + 2 × (14.40234375 +
  1.5 + 13) = 65.8046875`, base width `2 × 6 = 12`; its polygon (the
  writers' descriptor) `(91.154296875, 39.8046875), (85.154296875,
  65.8046875), (97.154296875, 65.8046875)`; the root's line from
  91.154296875 to `8 + 2 × 441.5771484375 = 891.154296875` at stroke width
  `2 × 3 = 6`;
- the box: `W = 8 + (8 + 2 × (458.5771484375 + 2)) = 937.154296875` and `H
  = 8 + (8 + 2 × (49.37890625 + 2)) = 118.7578125`, the shadow's drawn
  edges; the item `{x: 8, y: 8, length: 400, scale: 2, width:
  458.5771484375, height: 49.37890625}`, its size before the scale.

**A scaled item's drawn bottom sets the next default top.**
`bundle_ungrouped` at `places: {recording: {scale: 1.5}}` (the review case
`bundle_ungrouped__scale`): `recording/card` `{8, 100.2578125, 1.5 ×
507.896728515625 = 761.8450927734375, 1.5 × 49.37890625 = 74.068359375}`;
`score` lies at `(100.2578125 + 1.5 × 49.37890625) + 8 = 182.326171875`
(at scale 1 it would be 157.63671875); `recording`'s line, a discrete
timeline's, has the dash array `3 3` at scale 1 and `4.5 4.5` here, its
name the font size `1.5 × 11 = 16.5`; `W = 8 + (8 + 1.5 × (507.896728515625
+ 2)) = 780.8450927734375`; the item `{8, 100.2578125, 400, 1.5,
507.896728515625, 49.37890625}`.

**A member's card requests a size** (`group_child_member` at `places:
{recording: {width: 650, height: 120}}`; the frame's quantities are those of
"The box" in item coordinates: `n = 16`, `s0 = 112.61962890625`, `Ri =
526.4140625`, the cards from `Q = 8` to `534.4140625`). `recording`'s card
spans `8` to `max(534.4140625, 8 + 650) = 658`, 650 wide, and is
`max(49.37890625, 120) = 120` high, its member drawing keeping its top
left: `recording/card` `{16, 124.7578125, 650, 120}`, its line still at
139.16015625. `second-half/card` keeps `{16, 32.8046875, 526.4140625,
83.953125}`. The frame spans `0` to `658 + 8 = 666` and is `8 + 12.8046875
+ 4 + 83.953125 + 8 + 120 + 8 = 244.7578125` high: `{8, 8, 666,
244.7578125}`, `W = 8 + (8 + 666) = 682`, `H = 8 + (8 + 244.7578125) =
260.7578125`. `Drawing.cards` is `[{key: "second-half", group: "group_1",
address: "second-half/card", size: {526.4140625, 83.953125}, stated: {}},
{key: "recording", group: "group_1", address: "recording/card", size: {650,
120}, spacing: 1, stated: {width: 650, height: 120}}]` (`second-half`'s
`spacing: 1` too) and the item `{8, 8, 400, 1, 666, 244.7578125}`. A
member's entry is used for `width`, `height` and `spacing` alone:
`{recording: {x: 50, y: 50, length: 100, scale: 3, width: 650}}` draws
exactly as `{recording: {width: 650}}`, and its card's `stated` is `{width:
650}`. A request no larger than the card (`{width: 100, height: 10}`)
draws exactly as no request. Under the group's scale the request is in
item coordinates: at `places: {group_1: {scale: 2}, recording: {width:
650}}` `recording/card` is drawn at `(8 + 2 × 8, 8 + 2 × 116.7578125) = (24,
241.515625)`, `2 × 650 = 1300` wide and `2 × 49.37890625 = 98.7578125`
high, the frame `2 × 666 = 1332` wide, and `Drawing.cards` still gives
`recording` the size `{650, 49.37890625}`.

**An item's vertical stretch** (section 8.6: a member drawing's `v` is the
placement's `spacing` times its item's, and for a member that product
times its card's, in that order). The vertical stretch of a member drawing
is section 6.5's: its padding above and below is `P × v`, its bands lie
`B = 4 × v` apart and a row's pitch is `max(14 v, h(s))`; the root band
(the wedges and their labels) and every horizontal quantity do not depend
on `v`, so `n`, `s0`, `Mr` and every card's width are those at `v = 1`. A
root alone with its wedges below in one label tier (`bare`'s shape:
`Ea = 0`, `Eb = 26.9765625`) has `y_root = max(8 v, 8 v + 6.40234375) = 8
v + 6.40234375` and `Hm = y_root + 26.9765625 + 8 v`; its wedge tips lie
1.5 below its line, their bases `1.5 + 13 = 14.5` below, and its labels'
baseline `16.5 + a(9) = 24.85400390625` below.

- **An ungrouped card at spacing 2** (`bundle_ungrouped` at `places:
  {recording: {spacing: 2}}`, the review case `bundle_ungrouped__spacing`;
  the block at spacing 1, so `v = 2` for `recording` and 1 for `pages` and
  `score`). `recording`: `y_root = 16 + 6.40234375 = 22.40234375`, `Hm =
  22.40234375 + 26.9765625 + 16 = 65.37890625`. `recording/card` is `{8,
  100.2578125, 507.896728515625, 65.37890625}` (16 higher than at spacing
  1, the padding `8 × (2 − 1)` above and below); its line runs from
  79.70361328125 to 479.70361328125 at `100.2578125 + 22.40234375 =
  122.66015625`; its wedge `recording/start` has its tip at `122.66015625 +
  1.5 = 124.16015625` and its base at `122.66015625 + 14.5 =
  137.16015625`, its start label's baseline at `122.66015625 +
  24.85400390625 = 147.51416015625`. `pages/card` keeps `{8, 28.8046875,
  507.896728515625, 63.453125}`; `score/card` lies at `(100.2578125 +
  65.37890625) + 8 = 173.63671875` (157.63671875 at spacing 1). `W =
  525.896728515625` unchanged, `H = 8 + (173.63671875 + 49.37890625 + 2) =
  233.015625`. The item `recording` is `{x: 8, y: 100.2578125, length: 400,
  scale: 1, spacing: 2, width: 507.896728515625, height: 65.37890625}`,
  `stated: {spacing: 2}`; `Drawing.cards` is empty (an ungrouped card is
  an item).
- **A member's card at spacing 1.5 under a frame at spacing 2**
  (`group_child_member` at `places: {group_1: {spacing: 2}, recording:
  {spacing: 1.5}}`, the block at spacing 1): `v = (1 × 2) × 1.5 = 3` for
  `recording` and `1 × 2 = 2` for `second-half`. The frame's padding `Q`,
  its title's slot and the gap `F` between cards are the frame's, not a
  member drawing's, and are not stretched.
  - `second-half` (`v = 2`): `p0 = max(28, 12.8046875) = 28`; above, the
    ancestor band alone starts at `p0 / 2 = 14`; the ancestor row `piece`
    (name size 9) has `q = max(28, 10.4765625) = 28`, inner half 14, outer
    half `max(14, 26.9765625) = 26.9765625`, so `piece`'s line lies `14 +
    14 = 28` out and `Ea = 14 + 14 + 26.9765625 = 54.9765625`; `y_root =
    16 + 54.9765625 = 70.9765625`, `Hm = 70.9765625 + 26.9765625 + 16 =
    113.953125`.
  - `recording` (`v = 3`): `y_root = 24 + 6.40234375 = 30.40234375`, `Hm =
    30.40234375 + 26.9765625 + 24 = 81.37890625`.
  - `second-half/card` `{16, 32.8046875, 526.4140625, 113.953125}`, its
    line at `32.8046875 + 70.9765625 = 103.78125`, `piece`'s at `103.78125
    − 28 = 75.78125`; `recording/card` `{16, 32.8046875 + 113.953125 + 8 =
    154.7578125, 526.4140625, 81.37890625}`, its line at `154.7578125 +
    30.40234375 = 185.16015625`. The frame `{8, 8, 542.4140625, 8 +
    12.8046875 + 4 + 113.953125 + 8 + 81.37890625 + 8 = 236.13671875}`, `W
    = 558.4140625` unchanged, `H = 8 + (8 + 236.13671875) = 252.13671875`.
  - `Drawing.cards`: `second-half` `{size: {526.4140625, 113.953125},
    spacing: 1, stated: {}}`, `recording` `{size: {526.4140625,
    81.37890625}, spacing: 1.5, stated: {spacing: 1.5}}`; the item
    `group_1` `{x: 8, y: 8, length: 400, scale: 1, spacing: 2, width:
    542.4140625, height: 236.13671875}`, `stated: {spacing: 2}`.
- **The placement's spacing multiplies too.** `group_child_member` at
  `spacing: 1.5` with `places: {group_1: {spacing: 2}}`: `v = 1.5 × 2 = 3`
  for both members. `recording` is again 81.37890625 high; `second-half`
  has `p0 = 42`, the ancestor band from 21, `q = 42`, inner half 21, outer
  half `max(21, 26.9765625) = 26.9765625`, `Ea = 21 + 21 + 26.9765625 =
  68.9765625`, `y_root = 24 + 68.9765625 = 92.9765625`, `Hm = 92.9765625 +
  26.9765625 + 24 = 143.953125`. `Drawing.cards` gives both `spacing: 1`
  (the card's own factor), the item `group_1` `spacing: 2` (its own).

## Segment lines (`segments.test.ts`)

What proves segment lines is where the specification puts each of their
parts: a segment's boundary and label on its segment line's line, a
segment that is itself a segment line as a child line in the row beyond, a
line's reach from its own boundaries and label tiers, and the order of
boundaries and labels by the traversal of their segments. Every value
below follows from sections 3, 6 and 7.2; the two drawings `segment_line`
and `segment_pages_accolades` are derived in full by hand, and the tests
take their values from those derivations. The common measures are `k = 8`,
`h(9) = 10.4765625`, `d(9) = 2.12255859375`, `(a(11) − d(11)) / 2 =
3.80810546875`, the root's stroke width 3 and the card's top at 8, so the
box-local `y_root` is `8 + P × v + Ea`. Tier `n` of a line's segment labels
has its baseline at `y − (m + 2 + (n − 1) × h(9)) − d(9)`, `y` the line's
ordinate and `m` the larger of its stack's reach above and, when it has a
drawn boundary, `k`; a label's first-fit extent is `[L × u − wi / 2 − 1,
L × u + wi / 2 + 1]`. A line has the boundaries of its own segments; the
boundary of a segment that is a segment line lies on its parent's line.

1. **`segment_line`, by its derivation.** Root `form` (quarters, length 32,
   a segment line, unlocked) with the segments `a` [0, 8], `b` [8, 20] and
   `c` [20, 32], each a segment line with the segments `a1`; `b1`, `b2`;
   `c1` (`a1` and `c1` unnamed). `x0 = 16 + w("Form", 11) + 8 =
   52.294921875`, `x(t) = x0 + 12.5 t`. The root band above reaches `8 + 2
   + h(9) = 20.4765625`, the children band starts at `24.4765625`; row 1
   (`a`, `b`, `c`) has the outer half 20.4765625 (`b`'s reach above) and
   the inner half 8 (`b`'s boundary), so its line lies `32.4765625` out and
   `Ea = 52.953125`; `y_root = 68.953125`, row 1 at `36.4765625`, the
   height 113.9296875 and the width 479.573974609375. `form` ends with the
   open arrowhead, `a`, `b`, `c` with the diamond. Boundaries `b/start`
   and `c/start` at `x(8) = 152.294921875` and `x(20) = 302.294921875`
   from `60.953125` to `76.953125` (on `form`'s line), `b2/start` at
   `x(14) = 227.294921875` from `28.4765625` to `44.4765625` (on `b`'s
   line); no boundary for a first segment. Labels `A`, `B`, `C` at `x(4)`,
   `x(14)`, `x(26)` = 102.294921875, 227.294921875, 377.294921875, baseline
   `68.953125 − 10 − d(9) = 56.83056640625`; `b1`, `b2` at `x(11) =
   189.794921875` and `x(17) = 264.794921875`, baseline `36.4765625 − 10 −
   d(9) = 24.35400390625`. The only name is `form/name`: a row of segment
   lines has none. Element order: block, card, `form`, `a`, `b`, `c`,
   `b/start`, `b2/start`, `c/start`, the wedges, `form/name`, the wedge
   labels, then `a/label`, `b/label`, `b1/label`, `b2/label`, `c/label`.
2. **`segment_pages_accolades`, by its derivation.** Root `pages` (pixels,
   int, length 7016) with four segment lines `page_N` of 1754, each with
   four segments of 400, 450, 452, 452 named `1` … `4`. `x0 =
   56.85498046875`; the same vertical arithmetic as case 1 gives `y_root =
   68.953125`, the page lines at `36.4765625`, the width 493.257080078125
   and the height 113.9296875. 15 boundaries in the order
   `page_1_accolade_2…4`, `page_2`, `page_2_accolade_2…4`, `page_3`, …,
   `page_4_accolade_2…4`: the `page_N/start` at 156.85498046875,
   256.85498046875, 356.85498046875 spanning `60.953125` to `76.953125`,
   the accolades' at `x` of 400, 850, 1302 (+ 1754 per page) spanning
   `28.4765625` to `44.4765625`, `x(400) = 79.65999757251282`, `x(850) =
   105.315641814246`, `x(1302) = 131.08531114149798` and so on, each
   `x0 + 400 × u` with `u = t / 7016` rounded once. 20 labels in the order
   `page_1`, `page_1_accolade_1…4`, `page_2`, …: `Page N` at
   106.85498046875 + 100 (N − 1), baseline 56.83056640625; the accolades at
   the midpoints 200, 625, 1076, 1528 (+ 1754 per page), baseline
   24.35400390625.
3. **A segment line among ordinary children (`segment_children`).** Root
   `piece` (quarters, 32, not a segment line) with the children `intro`
   [2, 8], `theme` [6, 18] and `coda` [22, 30], each a segment line (`i1`,
   `i2`; `t1`, `t2`, `t3`; `c1`, `c2`). They are children, not segments:
   no boundary or label of their own, and they give names. First fit:
   `intro` [25, 100] row 1, `theme` [75, 225] conflicts with it and goes to
   row 2, `coda` [275, 375] row 1. Names: `Piece`; row 1 `Intro, Coda`
   (`A = 11340`, `N = 60.908203125` at 11, the widest), carried by
   `intro/name`; row 2 `Theme` (`theme/name`); so `x0 = 16 + 60.908203125 +
   8 = 84.908203125`, `x(t) = x0 + 12.5 t`. No band above the root but the
   children band, from `p0 / 2 = 7`; each row's outer half is
   `max(7, 8 + 2 + h(9)) = 20.4765625`, its inner half `max(7, 8) = 8`:
   row 1 at `7 + 8 = 15`, row 2 at `15 + 20.4765625 + 8 = 43.4765625`,
   `Ea = 7 + 56.953125 = 63.953125`, `y_root = 79.953125`, row 1 at
   `64.953125`, row 2 at `36.4765625`, height `8 + 10 + 106.9296875 =
   124.9296875`. Boundaries `i2/start` at `x(5) = 147.408203125` and
   `c2/start` at `x(27) = 422.408203125` from `56.953125` to `72.953125`;
   `t2/start`, `t3/start` at `x(10) = 209.908203125`, `x(14) =
   259.908203125` from `28.4765625` to `44.4765625`. Labels `i1`, `i2`,
   `c1`, `c2` at `x(3.5) = 128.658203125`, `x(6.5) = 166.158203125`,
   `x(24.5) = 391.158203125`, `x(28.5) = 441.158203125`, baseline
   `64.953125 − 10 − d(9) = 52.83056640625`; `t1`, `t2`, `t3` at `x(8) =
   184.908203125`, `x(12) = 234.908203125`, `x(16) = 284.908203125`,
   baseline 24.35400390625. Name baselines from the top: `Theme`
   40.28466796875, `Intro, Coda` 68.76123046875, `Piece` 83.76123046875.
4. **A segment line whose segments are no lines (`segment_pages` and
   `segment_pages_locked`).** The pages lie on the root's line only: no
   `child` element, no children band. Above, the root band alone reaches
   20.4765625, so `y_root = 36.4765625` and the height is `8 + 10 + 63.453125
   = 81.453125`; the boundaries `page_2/start` … `page_4/start` span
   `28.4765625` to `44.4765625`, the labels' baseline is
   24.35400390625. The unlocked root ends with the open arrowhead, the
   locked one with the end circle.
5. **Two label tiers.** `segment_pages` at length 100: the labels `Page N`
   (30.779296875 wide) centred at 12.5, 37.5, 62.5, 87.5 have the extents
   `[−3.8896484375, 28.8896484375]`, `[21.1103515625, 53.8896484375]`,
   `[46.1103515625, 78.8896484375]`, `[71.1103515625, 103.8896484375]`, so
   first fit gives the tiers 1, 2, 1, 2. The root reaches `8 + 2 + 2 ×
   h(9) = 30.953125` above, `y_root = 46.953125`; tier 1's baseline is
   `46.953125 − 10 − d(9) = 34.83056640625`, tier 2's `46.953125 −
   20.4765625 − d(9) = 24.35400390625`; the labels lie at `x0 + 12.5 =
   69.35498046875`, 94.35498046875, 119.35498046875, 144.35498046875; the
   height is `8 + 10 + 73.9296875 = 91.9296875`.
6. **Only a drawn boundary counts.** `segment_line` with the extra layer
   `{ids: ["b2/start"]} display none`: `b`'s line has no drawn boundary, so
   it reaches `2 + h(9) = 12.4765625` above and 0 below; row 1's halves are
   12.4765625 and 7, its line `24.4765625 + 7 = 31.4765625` out, `Ea =
   43.953125`, `y_root = 59.953125`, row 1 at 28.4765625, `b1/label` and
   `b2/label` at baseline `28.4765625 − 2 − d(9) = 24.35400390625`, `A`,
   `B`, `C` at `59.953125 − 10 − d(9) = 47.83056640625`, height
   104.9296875; `b/start` and `c/start` still span `51.953125` to
   `67.953125`.
7. **Maps on a segment line and its segment (section 6.4).** `segment_line`
   with a ScalarMap `b_map` added into `b` and `b1_map` into `b1` through
   `add`: `b`'s stack above is `b_map` then `b1_map` (the segment line's own
   maps first), spanning `b` (152.294921875 to 302.294921875) and `b1`
   (152.294921875 to 227.294921875). The stack reaches `1.5 + 2 × 5 =
   11.5 > k`, so `m = 11.5` and `b` reaches `11.5 + 2 + h(9) = 23.9765625`
   above; row 1 at `24.4765625 + 8 = 32.4765625` out, `Ea = 56.453125`,
   `y_root = 72.453125`, row 1 at 39.9765625; the maps are centred 5.5 and
   10.5 above it (34.4765625, 29.4765625); `b1/label` at baseline
   `39.9765625 − 13.5 − d(9) = 24.35400390625`; `b2/start` spans
   31.9765625 to 47.9765625; height 117.4296875.
8. **Children below.** `segment_line` with `{element: child} side below`:
   `b`'s labels still lie above its line ("above is up"). Above, only the
   root band, `Ea = 20.4765625`, `y_root = 36.4765625`; below, the root
   band reaches 26.9765625 (the wedges), the children band starts at
   30.9765625, row 1's inner half (above) is 20.4765625 and its outer half
   (below) 8, so its line lies `51.453125` out, at 87.9296875; `b1/label` at
   baseline `87.9296875 − 10 − d(9) = 75.80712890625`, `b2/start` from
   79.9296875 to 95.9296875, `A` at 24.35400390625, height 113.9296875.
9. **Fixed `k`, stretched spacing.** `segment_line` at spacing 2: the root
   band still reaches 20.4765625; the children band starts at
   `max(14, 20.4765625 + 8) = 28.4765625`, row 1's halves are
   `max(14, 20.4765625)` and `max(14, 8) = 14`, so its line is
   `42.4765625` out and `Ea = 62.953125`; `y_root = 8 + 16 + 62.953125 =
   86.953125`, row 1 at 44.4765625; `b/start` spans `86.953125 ∓ 8`,
   `b2/start` `44.4765625 ∓ 8`; height `18 + 121.9296875 = 139.9296875`.
10. **The row's name size.** A row of segment lines counts the font size
    of its first line's name: with `{ids: ["a/name"]} font-size 40`,
    `p = h(40) = 46.5625`, both halves of row 1 become 23.28125, its line
    `24.4765625 + 23.28125 = 47.7578125` out, `Ea = 71.0390625`,
    `y_root = 87.0390625`, row 1 at 39.28125, height 132.015625; `a/name`
    is still not drawn. The same statement on `b/name` (not the row's first
    line) leaves the drawing equal to the default one.
11. **A segment that is no line has no element type (sections 2.1, 6.4).**
    `segment_pages` with one layer and no defaults: `{element: "child"}
    stroke #654321` reaches neither `page_2/start` nor `page_2/label`
    (both keep `none`: their segment is no `child`, and their holder
    `pages` is a `timeline`); `{ids: ["page_2"]} stroke #123456` reaches
    both, through the segment's node, and leaves `page_3/start` at `none`.
    In `segment_line`, `{ids: ["b"]} stroke #123456` alone reaches
    `b/start`, `b2/start` (a segment of `b`) and `b1/label`, and leaves
    `c/start` at `none`.
12. **A hidden segment line (section 6.1).** `segment_line` with `{ids:
    ["b"]} display none`: `b`'s line is not drawn, and neither are the
    boundary and labels on it (`b2/start`, `b1/label`, `b2/label`), which
    take no room; `b/start` and `b/label` lie on `form`'s line and stay.
    Row 1 holds `a` and `c`, which reach 0 on both sides, so its halves are
    7 and 7: its line lies `24.4765625 + 7 = 31.4765625` out, `Ea =
    38.4765625`, `y_root = 54.4765625`, row 1 at 23; `b/start` and
    `c/start` span `46.4765625` to `62.4765625`; `A`, `B`, `C` at baseline
    `54.4765625 − 10 − d(9) = 42.35400390625`; height `18 + 81.453125 =
    99.453125`, width 479.573974609375 as before.

## Ancestor lines (`ancestors.test.ts`)

A member that is a child timeline draws one `ancestor` line per ancestor
`A1 … Ak` (section 8.3) in the outermost band above it. What proves the rule
is the geometry of three group fixtures derived by hand from the
specification, then single changes to one of them, each moving exactly the
quantities its rule names and nothing else. Common values: every line has
`w = 3`, so a mark's tip lies `1.5` above its ancestor line and its base
`1.5 + 13 = 14.5` above; marks with one label tier reach `1.5 + 13 + 2 +
10.4765625 = 26.9765625`; tier 1's baseline is `(ya − 16.5) − d(9)`, `ya`
the ancestor line; an ancestor name (font size 9) is centred on its row,
baseline `ya + (a(9) − d(9)) / 2 = ya + 3.11572265625`; the box holds a
frame, so `xn = 24` and the first card's top is `8 + 8 + h(11) + 4 =
32.8046875`; the member's row pitch `p0 = 14`, so the ancestor band starts
no nearer than 7, and an ancestor row (name size 9) has `q = 14`, inner half
7, outer half `max(7, 26.9765625) = 26.9765625`.

**`group_child_member`.** Member `second-half` (quarters, length 8) at
offset 8 in `piece` (length 16, unlocked). `ts = −8 < 0`: `piece` runs on to
the left; `te = −8 + 16 = 8 = λ`: it ends with its own end, an arrowhead
(top-level, unlocked). `N = w("Second half", 11) = 64.61962890625`, so `xn +
N + 8 = 96.61962890625`, and the chevron term `+ 8 × 3` makes `x0 =
120.61962890625`: the ancestor line runs from `Xa = x0 − 12 =
108.61962890625` to `x0 + 400 = 520.61962890625`. Above, only the ancestor
band: line at `7 + 7 = 14`, `Ea = 7 + (7 + 26.9765625) = 40.9765625`;
below, the wedges, `Eb = 26.9765625`; `y_root = 48.9765625`, `Hm =
83.953125`. The member's line lies at `32.8046875 + 48.9765625 = 81.78125`,
`piece` at `67.78125`; mark tips `66.28125`, bases `53.28125`, at `x0` and
`x0 + 400`; mark labels `8 ♩` and `16 ♩` (`−ts = 8`, `−ts + λ = 16`, in
`piece`'s unit) at baseline `49.15869140625`; `piece/name` "Piece" at `x =
24`, baseline `70.89697265625`, fill `#6B7280`, font size 9, opacity 1. The
ancestor line, its marks and its mark labels have opacity 0.35 (`{inside:
ancestor}` reaches the marks and their labels); the member's own wedges and
their labels, at the same addresses, have opacity 1.

**`group_grandchild`.** Member `theme` (length 8) at offset 8 in `movement`
(length 16, locked) at offset 16 in `score` (length 64, unlocked). On
`score`, `ts = −(16 + 8) = −24`, `te = 40 > 8`: chevrons on both sides; on
`movement`, `ts = −8`, `te = 8 = λ`: chevrons on the left, its own diamond
(a child) on the right. `N = w("Recording", 11) = 55.70361328125`, `x0 =
24 + 55.70361328125 + 8 + 24 = 111.70361328125`; `Xa = 99.70361328125` for
both lines, `score` runs to `Xr = x0 + 400 + 12 = 523.70361328125` and
`movement` to `x0 + 400 = 511.70361328125`. Rows: `movement` (`A2`, the
nearest) at `7 + 7 = 14`, `score` at `14 + (26.9765625 + 7) =
47.9765625`; `Ea = 7 + 67.953125 = 74.953125`, `y_root = 82.953125`, `Hm =
117.9296875`. Ordinates: `theme` `115.7578125`, `movement` `101.7578125`,
`score` `67.78125`. Marks on `score`: tips `66.28125`, bases `53.28125`,
labels `24 ♩`, `32 ♩` at `49.15869140625`; on `movement`: tips
`100.2578125`, bases `87.2578125`, labels `8 ♩`, `16 ♩` at `83.13525390625`.
Names `score/name` at `70.89697265625`, `movement/name` at
`104.87353515625`. The right edge (section 6.7) is `score`'s outer chevron
tip `x0 + 400 + 24 = 535.70361328125`, wider than every label, so the box
is `8 + 535.70361328125 + 8 + 8 = 559.70361328125` wide.

**`group_parents_mixed`.** Three child members, one ancestor each: `sonata`
(quarters, locked) holds `exposition` at 16, `ts = −16`, `te = 32 = λ`:
chevrons left, its end circle right; `session` (seconds, float) holds
`take` at `30.0`, `ts = −30.0`, `te = 60.0 > 25.5`: chevrons on both sides;
`page` (pixels, int) holds `system` at 0, `ts = 0`: its start circle at
`x0`, and `te = 1754 > 600`: chevrons right. `x0 = 24 + w("Exposition", 11)
+ 8 + 24 = 113.0302734375`; `page` starts at `x0`, the others at `Xa =
101.0302734375`; `sonata` ends at `513.0302734375`, `session` and `page` at
`Xr = 525.0302734375`. Lines at `67.78125`, `159.734375` and `251.6875`;
mark labels `16 ♩`, `48 ♩` at `49.15869140625`; `30.0 s`, `55.5 s` (float
sums, Python's `repr`) at `141.11181640625`; `0 px`, `600 px` at
`233.06494140625`; names at `70.89697265625`, `162.85009765625`,
`254.80322265625`. `page` is discrete: its line carries `stroke-dasharray`
`3 3`.

**Order (section 8.5).** In `group_grandchild` the member's elements after
its card are, by type and address: the ancestor lines `score`, `movement`
(`A1` first), the line `theme`; the marks `theme/start`, `theme/end` on
`score`, then on `movement`, then the member's own wedges; the names
`score/name`, `movement/name`, `theme/name`; the mark labels of `score`
(start, end), of `movement`, then the own wedge labels.

**Single changes to `group_child_member`**, each with one extra layer:

1. *Marks ignore `side`.* `{element: wedge} side above` moves the member's
   own wedges above, so its root band above reaches `26.9765625`; the
   ancestor band starts at `max(7, 26.9765625 + 4) = 30.9765625`, its line
   `37.9765625` out; `Ea = 30.9765625 + 33.9765625 = 64.953125`, `y_root =
   72.953125`, `Hm = 72.953125 + 6.40234375 + 8 = 87.35546875`. The member
   line lies at `105.7578125`, `piece` again at `67.78125`, its marks again
   above it (tips `66.28125`, bases `53.28125`); the own wedges now point up
   from the member's line (tips `104.2578125`, bases `91.2578125`), their
   labels at `(105.7578125 − 16.5) − d(9) = 87.13525390625`.
2. *Label tiers.* At `length` 10 the mark labels `8 ♩` (extent
   `[−7.416015625, 7.416015625]`) and `16 ♩` (`[−0.279052734375,
   20.279052734375]`) conflict: two tiers, outer half `1.5 + 13 + 2 + 2 ×
   10.4765625 = 37.453125`, `Ea = 7 + 7 + 37.453125 = 51.453125`; the own
   wedge labels also take two tiers, `Eb = 37.453125`. `x0` stays
   `120.61962890625`; `y_root = 59.453125`, `Hm = 104.90625`; member line
   `92.2578125`, `piece` `78.2578125`; the start label's baseline
   `59.63525390625` (tier 1), the end label's `(78.2578125 − 26.9765625) −
   d(9) = 49.15869140625` (tier 2).
3. *Row pitch from the name's size.* `{element: name, inside: ancestor}
   font-size 20`: `q = max(14, h(20)) = 23.28125`, inner half
   `11.640625`, outer half `26.9765625`; the line lies `7 + 11.640625 =
   18.640625` out, `Ea = 45.6171875`, `y_root = 53.6171875`, `Hm =
   88.59375`; member line `86.421875`, `piece` `67.78125`, the name's
   baseline `67.78125 + (a(20) − d(20)) / 2 = 74.705078125`.
4. *No marks.* `{element: wedge, inside: ancestor} display none`: no mark
   and no mark label is drawn, the outer half is `q / 2 = 7`; `Ea = 21`,
   `y_root = 29`, `Hm = 63.9765625`; member line `61.8046875`, `piece`
   `47.8046875`, its name at `50.92041015625`. Only the member's own wedge
   carries `second-half/start`.
5. *The chevron term of `x0`.* `{element: ancestor} stroke-width 5`: `x0 =
   96.61962890625 + 8 × 5 = 136.61962890625`, `Xa = x0 − 20 =
   116.61962890625`; the marks reach `2.5 + 13 + 2 + 10.4765625 =
   27.9765625`, `Ea = 41.9765625`, `y_root = 49.9765625`, `Hm = 84.953125`;
   member line `82.78125`, `piece` `68.78125`, mark tips `66.28125`, bases
   `53.28125`, label baseline `49.15869140625`.
6. *A mark label in `x0`.* `{element: label, inside: ancestor} font-size
   150`: the start mark's label `8 ♩` is `2920 × 150 / 2048 = 213.8671875`
   wide at `u = 0`, so `x0 = 24 + 106.93359375 = 130.93359375`, above the
   chevron term `120.61962890625`. The outer half becomes `1.5 + 13 + 2 +
   h(150) = 191.109375`, `Ea = 205.109375`, `y_root = 213.109375`;
   member line `245.9140625`, `piece` `231.9140625`, the label's baseline
   `(231.9140625 − 16.5) − d(150) = 180.0380859375`.
7. *A hidden ancestor takes no room.* `{ids: [piece]} display none`: no
   `ancestor` element, no `piece/name`, no mark; `x0 = 96.61962890625`
   (no chevron), `y_root = 14.40234375`, `Hm = 49.37890625`.
8. *Marks without labels.* `{element: label, inside: ancestor} display
   none`: the marks are drawn, no mark label; the marks reach `1.5 + 13 =
   14.5`, with no label gap, so the outer half is `max(7, 14.5) = 14.5`,
   `Ea = 7 + 7 + 14.5 = 28.5`, `y_root = 36.5`, `Hm = 36.5 + 26.9765625 +
   8 = 71.4765625`; member line `69.3046875`, `piece` `55.3046875`, mark
   tips `53.8046875`, bases `40.8046875`. `x0` stays `120.61962890625`.

**The cascade per drawing (sections 2.5, 8.1).** Without the defaults, the
one layer `{ids: [piece]} fill #112233` gives `piece`'s marks, their labels
and `piece/name` the fill `#112233` by inheritance (line → mark → label,
line → name), while the member's own wedges keep `none`. With the defaults
and `{element: wedge, inside: ancestor} fill #123456`, the marks are
`#123456` and the own wedges `#000000`; `{ids: [second-half/start]} fill
#654321` reaches both drawings of that address.

## Timelines of unknown length (`unknown.test.ts`)

A `length` of null means the length is not known, and section 3.4 says how
such a timeline is drawn: scaled to its **reach**, the farthest coordinate
its content reaches on its own axis, and ended by the first of five rules,
known or open. What proves the implementation is that every rule moves
something a reader can see and that nothing else moves:

- the reach is visible as the scale: a position `t` lands at `x0 + L ×
  u(t)` with `u = t / λ`, `λ` the reach, so a child or region placed at the
  reach lies at the end of the graphical length, and a reach taken from the
  wrong content would move every position;
- an open end draws the line `4w` past `Xe` to `Xr`, then three
  chevrons (the line's `end` is `unknown`), whose outer tip `Xr + 5.5w` is
  the line's right edge (section 6.7), and no end wedge and no end label; a
  known end keeps its arrowhead, circle or diamond;
- an ancestor line that runs on keeps two chevrons (its `end`, or its
  `start` on the left, is `chevrons`), also where the member's length or its
  own is not known: three chevrons say that the line's own length is
  unknown, two that the ancestor runs on beyond the member, and the two
  values never stand in for each other;
- each end rule is shown by a case where the rules before it do not apply
  and the result differs from what the next rule would give.

The six fixtures below have hand-derived figures (two independent
derivations from the specification alone, byte-equal to each other); the
writers' fixture test compares the whole SVG. Here the layout values are
checked, taken from those derivations, and the constructed cases add what
the figures cannot show. Every value is a double that the arithmetic of
section 3.3 produces exactly; with `w = 3` the line runs on `4w = 12` past
`Xe` and the outer chevron's tip lies `9.5w = 28.5` past it (`Xr + 5.5w`).

- **`unknown_length`** (root `score` of unknown length; region 2 to 8,
  marker at 6, locked child `coda` at 10, 4 long). The reach is 14, from
  the child's end `10 + 4`, beyond the region's end 8 and the marker 6. `x0 =
  16 + 29.798828125 + 8 = 53.798828125`. The root is open (rule 2): its
  line runs from 53.798828125 to `Xr = x0 + 400 + 12 = 465.798828125` and
  ends in three chevrons (`unknown`); `coda` starts at `x(10) = x0 + 400 × 5/7 =
  339.5131138392857` (`u = 0.7142857142857143`, the reach 14 and not the
  region's 8 or the marker's 6) and ends known (rule 1) with its diamond at
  `x(14) = 453.798828125`. Only `score/start` is drawn among the wedges and
  only `0 ♩` among the labels; the box is `8 + (482.298828125 + 8 + 2) =
  500.298828125` wide, the outer chevron's tip `Xr + 5.5w = 465.798828125 +
  16.5 = 482.298828125` setting `R` (`Xr + 4w = 477.798828125`, the tip of
  two chevrons, would give 495.798828125).
- **`unknown_length_empty`** (no content). The reach is 0, so every `u` is
  0, yet the line is drawn `L` long: `Xs = 53.798828125`, `Xr =
  465.798828125` (`Xe = x0 + L` whatever the reach), three chevrons.
- **`unknown_length_locked`** (locked root, child `coda` at 12, 4 long). A
  locked timeline of unknown length ends in three chevrons, never the
  circle: `end` is `unknown` at 465.798828125, and `coda` starts at `x0 + 400 ×
  3/4 = 353.798828125`.
- **`unknown_length_child`** (root 32 long; child `movement` at 8 of unknown
  length with a region 0 to 6). Rule 5: `movement` ends at `8 + 6 = 14`,
  open. `x0 = 16 + 59.490234375 + 8 = 83.490234375`; `movement` runs from
  `x(8) = 183.490234375` to `x(14) + 12 = 258.490234375 + 12 =
  270.490234375`, three chevrons; the root keeps its arrowhead at `x(32) =
  483.490234375` and both wedges. **The chevrons take room in the row**:
  `movement`'s first-fit extent is `[L × 1/4, L × 7/16 + 9.5w] = [100,
  203.5]`, up to the outer chevron's tip. A locked child `brief` added into
  `score` at 15, 2 long, has the extent `[187.5, 212.5]`, which meets it,
  so `brief` goes to row 2, one pitch (14) further out: its line lies 14
  above `movement`'s. Without the chevrons' room the extents `[100, 175]`
  and `[187.5, 212.5]` would share row 1. `brief` at 16 (`[200, 225]`)
  starts before 203.5 and still goes to row 2, where an extent reaching
  only the two chevrons' tip (`8w`, 199) would have let it share row 1;
  `brief` at 17 (`[212.5, 237.5]`, starting past 203.5) shares row 1: both
  lines at one ordinate.
- **`groups/group_unknown_length`** (group `Edition`: `performance` in
  seconds of unknown length with a region 0.0 to 9.5, and `score` 12
  quarters). The float reach 9.5 is reached by the region's end, so the
  region ends at the shared end `x0 + L = 502.640625` (`x0 = 24 + 70.640625
  + 8 = 102.640625`), where `score` ends with its arrowhead too;
  `performance` runs on to `514.640625` into its three chevrons.
- **`unknown_length_segments`** (segment line `form` of unknown length:
  `a` at 0 of unknown length with a region 0 to 4, `b` at 8, 6 long, `c` at
  14 of unknown length with a region 0 to 3). The reach is nested: `c`
  contributes `14 + 3 = 17`, its own reach added to its offset, beyond `b`'s
  `8 + 6 = 14` and `a`'s 4. `x0 = 16 + 25.84033203125 + 8 = 49.84033203125`;
  `c`'s region ends at `x(17) = 449.84033203125`, the boundaries of `b` and
  `c` lie at `x(8) = 238.07562614889704` and `x(14) = 379.2520967371323`;
  `form` runs on to `461.84033203125`, three chevrons. **Rules 3 and 4** show in
  the segment labels: with the names `A`, `B`, `C` set on `a`, `b`, `c`
  through `set`, each label is centred on the exact midpoint of its
  segment's start and end. `a` ends where `b` starts (rule 3), so `A` lies
  at `x(4) = 143.95797909007354`, not at `x(2)` as its own reach 4 would
  give; `c` ends where `form` ends (rule 4), at the reach 17, so `C` lies
  at `x(31/2) = 414.54621438419116`; `B` lies at `x(11) =
  308.6638614430147`. The labels change no horizontal measure: none asks
  for more than `x0`.
- **The measure map counts.** `corpus_score_ms3` with its two children and
  its jump 37→0 removed and its length set to null through commands keeps
  a reach of 37 only through its last measure-map row, `qstamp` 34 plus
  `actual_length` 3; its other content reaches 30 (a marker). Its break at
  12 and its jumps therefore lie exactly where they lie at length 37: every
  break and jump element of the two drawings is equal. Its root line ends
  open, at `x0 + 400 + 12`, in three chevrons; at length 37 it ends at `x0 + 400`
  with its arrowhead.

**Ancestor lines (section 8.3).** `x0` below is the member's own line start,
the shared start of its box, and every expectation is formed from it as
section 8.3 writes it:

- `groups/group_child_member` with `second-half`'s length set to null
  (unlocked, set to null, locked again, through commands) and a region 0
  to 8 added into it, so its reach is `λ = 8`: the member's end is not
  known, so the ancestor `piece` runs on to the right to `x0 + 400 + 12`
  into two chevrons (`chevrons`) although `te = −8 + 16 = 8 = λ` would otherwise end it at
  `x0 + 400` with its arrowhead, and
  only the mark `second-half/start` and its label `8 ♩` are drawn (no
  `second-half/end`). The member's own line ends open, in three chevrons
  (`unknown`) at `x0 + 400 + 12`: the member's own unknown length and the
  ancestor's running on are told apart in one drawing.
- `groups/group_child_member` with `piece`'s length set to null: the
  ancestor's end is not known, so `piece` runs on to the right into two
  chevrons (`chevrons`, never three) at `x0 + 400 + 12` (and to the left, `ts = −8 < 0`), and both
  marks are drawn, labelled `8 ♩` and `16 ♩` (`−ts` and `−ts + λ`).
- `groups/group_grandchild` with `movement`'s length set to null and
  `score`'s length set to 28: for `score`, `ts = −(16 + 8) = −24` and `te =
  −24 + 28 = 4 < λ = 8`, which a manifest allows only because `movement`
  between them has no length; `score` ends at `x(4) = x0 + 400 × 4/8 = x0 +
  200` with its own end, the arrowhead of an unlocked top-level timeline.
  `movement` runs on to the right, into two chevrons (`chevrons`), although
  its own length is not known, at `x0 + 400 + 12`. Both
  run on to the left (`ts < 0`).

## Stretch and box (`stretch.test.ts`)

For `nested`, `map`, `flow_control` and `with_region`, at lengths 200, 400,
800 and spacings 0.5, 1, 2: every element keeps its style (stroke width,
font size) and its text; the wedge triangle stays 6 wide and 13 high; a
child's diamond and circle keep their size (stroke width). Only x and y
positions change. With `width` and `height` both 120 and 60 above the
natural box, every element except the block is identical to the natural
drawing and `W = width`, `H = height`; with a request below the natural
size, `W = Wb` and `H = Hb` (section 8.4).

## First fit (`properties.test.ts`, fast-check)

For generated manifests (a root of length 1 to 64 quarters with 1 to 8
children of random offset and length inside it, built through `add`
commands of a block and of its children), no two wedge labels with the same baseline on one side have
conflicting extents `[x − w/2 − 1, x + w/2 + 1]` (section 6.3), and no two
children in one row have conflicting extents `[Xs − x0, Xe − x0]`.
Changing name widths changes `x0` but never changes those rows.

## Sides (`sides.test.ts`)

For each of `child`, `map`, `region`, `jump`, `wedge` and `break`, a top
layer `{element: T} side X` with X the opposite of its default puts every
element of that type on the other side of its reference line. The
reference line is the root's for every type but `map`, whose reference is
its own timeline's line (section 6.4: for a map, `above` is up whatever
side of the root its timeline lies on). A break's line then starts on the
new side's flow row and ends at the other padding (`Hc − 8` instead of 8
from the member drawing's top).
Each case first checks how many elements of the type the fixture draws: in
`map` 1 child, 2 maps (`tempo` on the root, `ticks` on `phrase`) and 2
wedges; in `with_region` 1 region; in `flow_control` 1 jump and 1 break.

The break of `flow_control` moved above: above, the flow band holds the
break and its label, no jump: one break-label tier, so the band is
`10.4765625` wide and is the first band, the flow row lies 10.4765625 out,
`Ea = 10.4765625`, `y_root = 18.4765625`, the root's line at `8 + 18.4765625
= 26.4765625` in the card. Below: the root band to 26.9765625 and the flow
band (the jump, one level, no break label) from 30.9765625, `0 + 8 + 0 + 2 +
10.4765625 = 20.4765625` wide, `Eb = 51.453125`. `Hc = 18.4765625 +
51.453125 + 8 = 77.9296875`, and the drawing is `8 + (8 + 77.9296875 + 2) =
95.9296875` high. The line runs from the above flow row, `y1 = 26.4765625 −
10.4765625 = 16`, to `y2 = 8 + (Hc − 8) = 77.9296875`; its label starts at
`x(12) + 3 = 393.9775390625` and its tier 1 touches the flow row on the
root's side, baseline `16 + a(9) = 24.35400390625`.

## Placement cases (`placement.test.ts`, `names.test.ts`)

Exact tests cover several nested jump spans and levels, a root whose
`number_type` is `float`, and both the default band order and
`["flow", "regions", "children"]`. They also cover hidden names,
mixed name sizes, name `content`, `max-width` truncation, empty drawings,
per-band label sizes, the root-row clearance before a first children band,
break-label tiers measured inward from the padding, and exact
midpoints for region braces and jump labels. These cases have literal
expected ordinates, rows, texts and descriptor order derived from sections
3 and 6.

**Five jumps.** Root `r`, quarters, length 16, `x(t) = x0 + 25 t`, with
jumps 4→6 `one`, 8→10 `two`, 3→11 `three`, 2→12 `four` and 1→13 `five`, each added by an
`add` command with its label as its id, so `x0 = 16 + 4.5224609375 + 8`
(the name `r`, `A = 842`). Canonical order
sorts jumps by `from`: `five` (`1→13`), `four` (`2→12`), `three` (`3→11`),
`one` (`4→6`), `two` (`8→10`); their spans are 12, 10, 8, 2 and 2, and the
stable sort by span gives the placement order `one`, `two`, `three`,
`four`, `five`, which the jump descriptors and their labels follow. Extents from `x0`: `one` `[100, 150]`,
label `one` (`A = 3811`, 16.74755859375 wide) centred at 125 inside it;
`two` `[200, 250]`, label (`A = 3731`, 16.39599609375) centred at 225;
`three` `[75, 275]`, label (`A = 5463`, 24.00732421875) centred at 175;
`four` `[50, 300]`, label (`A = 4114`, 18.0791015625) centred at 175;
`five` `[25, 325]`, label (`A = 3762`, 16.5322265625) centred at 175. No
label widens its extent. First fit: `one` level 1, `two` level 1 (150 <
200), `three` level 2 (it conflicts with both), `four` level 3, `five`
level 4. Above, no
band: `y_root = max(8, 8 + 12.8046875 / 2) = 14.40234375`, the root's line
at 22.40234375 in the card. Below, the root band to 26.9765625, the flow row
at `f0 = 26.9765625 + 4 = 30.9765625`, so every `yf = 22.40234375 +
30.9765625 = 53.37890625`. With `pj = 10 + 10.4765625
= 20.4765625`, the apex distances are `(f0 + 8) + 0 × pj = 38.9765625`,
`38.9765625 + 20.4765625 = 59.453125`, `38.9765625 + 2 × 20.4765625 =
79.9296875` and `38.9765625 + 3 × 20.4765625 = 100.40625`, so `apex − yf`
is 8, 28.4765625, 48.953125 and `8 + 3 × 20.4765625 = 69.4296875` (all
exact): no break, so no break-label tier, and the flow row is the start of
the flow band. In `yc = yf + 4/3 × (ya − yf)` the factor 4/3 is formed
first (section 3.3): `4/3 × (ya − yf)` is the double nearest the exact
product of 4/3 and the double `ya − yf`, never the binary64 product of the
double `4 / 3` and `ya − yf`. The two readings agree on levels 1 to 3 and
part on level 4, which is why `five` is there: the exact product `4/3 ×
8887/128 = 8887/96` has the nearest double 92.57291666666667, while
`(4 / 3) * 69.4296875` rounds to 92.57291666666666, one unit in the last
place below (computed with Python's `fractions.Fraction`, `float(F(4, 3) *
F(69.4296875))` against `(4 / 3) * 69.4296875`). In item coordinates the
flow row lies at `14.40234375 + 30.9765625 = 45.37890625` and is drawn at
`8 + 45.37890625 = 53.37890625`; so `yc` is `45.37890625 +`
10.666666666666666, 37.96875, 65.27083333333333 and 92.57291666666667,
that is 56.045572916666664, 83.34765625, 110.64973958333333 and
137.95182291666669, drawn `8 +` each: 64.04557291666666, 91.34765625,
118.64973958333333 and 145.95182291666669 (the binary64-product reading
would give 145.95182291666666 for `five`; summed from the card's top
first, `one` and `two` would be 64.04557291666667).

**Float axis.** `continuous_physical`: root `cpt_1`, seconds, `float`,
length 12.5; children `cpt_2` at 0.5, length 4.25, and `cpt_3` at 6.0,
length 3.0, both in child row 1 (`[x(0.5), x(4.75)]` and `[x(6.0), x(9.0)]`
do not conflict). No name is set, so the names are the ids; the row's
joined name `cpt_2, cpt_3` has `A = 2 × (1126 + 1300 + 803 + 1024 + 1303) +
651 + 651 = 12414`, `N = 12414 × 11 / 2048 = 66.6767578125`, wider than
`cpt_1` (`A = 5556`, 29.841796875). The label `0.0 s` (`A = 1303 + 651 + 1303 + 651 + 1067 =
4975`, 21.86279296875 wide) at u 0 asks `16 + 10.931396484375`, and `12.5 s`
at u 1 nothing, so `x0 = 16 + 66.6767578125 + 8 = 90.6767578125` and the
root runs to `90.6767578125 + 400 = 490.6767578125`. The proportions are binary64 quotients:
`0.5 / 12.5` is the double nearest 0.04, and `400 ×` it rounds to 16, so
`cpt_2` starts at 106.6767578125; its end `0.5 + 4.25 = 4.75` gives `4.75 /
12.5`, the double nearest 0.38, and `400 ×` it rounds to 152, so it ends at
242.6767578125. The labels show the floats as Python writes them: `0.0 s` and
`12.5 s`.

**Band order.** `with_region` with its region moved above (`{element:
region} side above`), so the children and region bands share the above
side. The region band has `pr = 6 + 2 + 10.4765625 + 4 = 22.4765625` and
is `22.4765625 − 4 = 18.4765625` wide. At the default order the children
band comes first, from 7, its rows 14 and 28 out, to 35; the region band
starts at `35 + 4 = 39`, to 57.4765625; `y_root = 65.4765625`, the root's
line at `8 + 65.4765625 = 73.4765625`: `clt_2` at `73.4765625 − 14 =
59.4765625`, `clt_3` at 45.4765625, the brace's arms at `73.4765625 − 39 =
34.4765625` and its tip at `73.4765625 − (39 + 6) = 28.4765625`. With
`["flow", "regions", "children"]` the region band is the first, from 0 to
18.4765625 (arms at the root's line); the children band starts at
`max(18.4765625 + 4, 7) = 22.4765625`, rows `22.4765625 + 7 = 29.4765625`
and `43.4765625` out, to `22.4765625 + 28 = 50.4765625`, so `y_root =
58.4765625`, the root's line at 66.4765625, `clt_2` at 37, `clt_3` at 23,
arms 66.4765625 and tip 60.4765625. Below, the wedges reach 26.9765625 in
both, so `Hc` is `65.4765625 + 26.9765625 + 8 = 100.453125` and
`93.453125`, the drawings 118.453125 and 111.453125 high. The child rows
and map centres of `map` do not change when the name content widens `x0`.

`names.test.ts` pins the details: two non-overlapping children share row 1,
whose joined name is replaced by `content: "AAAA"` on the first name and
cut to `"A…"` by `max-width: 20`. A hidden second name at font size 20 still
sets the band's `p = h(20) = 23.28125`: the band starts at `p0 / 2 = 7`,
row 1's inner half is `23.28125 / 2 = 11.640625`, so its line lies
`18.640625` out; `Ea = 7 + 23.28125 = 30.28125`, `y_root = 38.28125`, the
root's line at 46.28125 in the card, and the child row lies at `46.28125 −
18.640625 = 27.640625`. With every non-block element hidden, nothing but
the background is drawn, yet the hidden card keeps its place (section 8.4):
no name and no label, so `x0 = R = xn = 16`, the card spans 8 to `R + K =
24`, `y_root = 8 + h(11) / 2 = 14.40234375`, `Hc = 14.40234375 +
6.40234375 + 8 = 28.8046875`, and the box is `Wb = 8 + 24 = 32` wide and
`Hb = 8 + 8 + 28.8046875 = 44.8046875` high. A manifest named "Mixed"
with no timelines and no groups holds only its displayed title at size 11,
which enters the box like a card: its advances sum to `1767 + 569 + 1212 +
1260 + 1300 = 6108` units, so `w = 6108 · 11 / 2048 = 32.806640625`, its
right edge lies at `8 + 32.806640625 = 40.806640625` and its slot ends at
`8 + h(11) = 20.8046875`; the box is `Wb = 8 + 40.806640625 =
48.806640625` wide and `Hb = 8 + 20.8046875 = 28.8046875` high. The
fallback `P + x0 = 24` wide and `P = 8` high applies only to a box that
holds no frame, no card and no displayed title: the same manifest with its
title at `display: none`.
