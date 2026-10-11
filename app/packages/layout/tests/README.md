# `@timetoalign/tilie-layout` tests

`draw(manifest, placement, layers, metrics)` returns the drawing of one
TimeSkeleton manifest as timeskeleton's drawing specification defines it
(`docs/drawing.md` in the timeskeleton repository, "the specification"
below, sections 1 to 6). The tests prove it from the specification, never
from the code's own output: every expected number below is derived here by
hand from the specification's formulas and the font's advance widths, and
the arithmetic is written out. Manifests are loaded from the 0.5.0 fixtures
of the installed schema package or built through core's commands; none is written by hand. The metrics are the package's
`fonts/dejavu-sans-2.37.metrics.json`. All comparisons are exact (`toBe`,
`toEqual`); no tolerance anywhere.

"The default layers" means `[DEFAULT_LAYER]`, plus the manifest's own
`graphical` block when it has one; an "extra layer" is an application's
layer, placed between the two, since no layer lies above the manifest's own; "the default placement" is
`{length: 400, spacing: 1, width: null, height: null, order: ["children",
"regions", "flow"]}`.

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
  every name and label of every 0.5.0 fixture at the default placement.

## The default layer (`defaults.test.ts`)

`DEFAULT_LAYER` deep-equals the JSON block of section 4, parsed out of the
specification itself (the first fenced `json` block under "## 4.
Defaults"). The specification is read from the installed timeskeleton package
(`docs/drawing.md`) or, failing that, from the linked checkout beside it;
where neither holds it, the test is skipped and reported as "the installed
timeskeleton package ships no drawing specification".

## Hand-derived drawings (`examples.test.ts`)

Common values: `P = 8`, `G = 8`, `B = 4 × v`, `h(9) = 10.4765625`,
`a(9) = 8.35400390625`, `d(9) = 2.12255859375`, `h(11) = 12.8046875`,
`(a(11) − d(11)) / 2 = (20911 − 5313) / 4096 = 3.80810546875`. The root's
stroke width `w` is 3 (default `timeline` statement), so a wedge's tip lies
`w / 2 = 1.5` out and its base `14.5` out, and the wedges with one label
tier reach `1.5 + 13 + 2 + 10.4765625 = 26.9765625`. Wedge labels in tier 1
start `16.5` out, so below their baseline is `y_root + 16.5 + a(9)`.
Children and maps lie above their timelines, everything else below the root
(section 4). Every root of these fixtures has `locked: false`, so it ends
with an arrowhead whose tip is `3w = 9` beyond `Xe`; every child has
`locked: true` and ends with a diamond reaching `1.5w = 4.5` beyond `Xe`.

The root's row has the pitch `p0 = max(14, h(11)) = 14`, so a children band
starts no nearer than `p0 / 2 = 7`; a child row whose children carry no map
stack wider than `p / 2` has both halves `p / 2`. A map's stack constants
are `d = 2`, `g = 3`: on a timeline of width 3, map `j` is centred
`1.5 + 5j − 1` out (5.5 for `j = 1`, 10.5 for `j = 2`), and a stack of `J`
maps reaches `1.5 + 5J` (6.5, 11.5).

### `bare`

Root `bare`, quarters, length 8, name `Bare` (`A = 1405 + 1255 + 842 + 1260
= 4762`). `N = 4762 × 11 / 2048 = 25.5771484375`. Labels `0 ♩` (u 0) and
`8 ♩` (u 1), each 12.83203125 wide, ask for at most `8 + 6.416015625` of
`x0`, so `x0 = 8 + N + 8 = 41.5771484375`; `Xe = x0 + 400 = 441.5771484375`.
No band above, so `y_root = max(8 + 0, 8 + 12.8046875 / 2) = 14.40234375`;
below the root band holds the two wedges and no map, `Eb = 26.9765625`,
`Hc = 14.40234375 + 26.9765625 + 8 = 49.37890625`. Wedges: tip
15.90234375, base 28.90234375. Labels' baseline `14.40234375 + 16.5 +
8.35400390625 = 39.25634765625`. Name baseline `14.40234375 + 3.80810546875
= 18.21044921875`. The rightmost drawn point is the root's arrowhead tip
`441.5771484375 + 9 = 450.5771484375` (the `8 ♩` label reaches only
`441.5771484375 + 6.416015625 = 447.9931640625`), so `Wc = 8 +
450.5771484375 = 458.5771484375`. The elements are, in order: block
(458.5771484375 × 49.37890625), `bare` (xs 41.5771484375, xe
441.5771484375, y 14.40234375, not locked), `bare/start`, `bare/end`,
`bare/name`, `bare/start/label` (coordinate 0 quarters), `bare/end/label`
(coordinate 8 quarters). `unmapped` is empty.

### `nested`

Root `clt_1` length 16; child `clt_3` at 4, length 8 (4 to 12); its child
`clt_2` at 3/2, length 2 (11/2 to 15/2 on the root's axis). Names
`clt_x` have `A = 1126 + 569 + 803 + 1024 + 1303 = 4825`, width
`25.91552734375`. `x0 = 8 + 25.91552734375 + 8 = 41.91552734375` (the `16 ♩`
label, 18.55810546875 wide, at u 1 asks nothing), `x(t) = x0 + 25 t`.
`clt_3` takes above row 1 (minimum `0 + 1`); `clt_2` row 2 (minimum `1 + 1`).
Above there is no root band, so the children band is the first and starts at
`max(0, p0 / 2) = 7`; `p = 14`, both rows have halves 7 and 7, the band is
`7 + 7 + 7 + 7 = 28` wide: row 1's line lies `7 + 7 = 14` out, row 2's
`14 + 7 + 7 = 28` out, `Ea = 7 + 28 = 35`, `y_root = 8 + 35 = 43`. So the
root's row and the two child rows lie one pitch, 14, apart. `clt_3`: xs
141.91552734375, xe 341.91552734375, y `43 − 14 = 29`; `clt_2`: xs
179.41552734375, xe 229.41552734375, y `43 − 28 = 15`. `Hc = 43 + 26.9765625 +
8 = 77.9765625`. Wedges: tip 44.5, base 57.5; labels' baseline `43 + 16.5
+ 8.35400390625 = 67.85400390625`. Name descriptors run top-down: `clt_2`
at baseline 18.80810546875, `clt_3` at 32.80810546875 and `clt_1` at
46.80810546875. The `16 ♩` label reaches `441.91552734375 + 9.279052734375
= 451.194580078125`, beyond the arrowhead's tip 450.91552734375, so `Wc =
459.194580078125`.

### `flow_control`

Root `flow:quarters` length 16, name `Flow control` (`A = 12470`,
`N = 66.9775390625`), `x0 = 82.9775390625`, `x(t) = x0 + 25 t`. Break at 12
(label `Fine`, `A = 4305`, width 18.91845703125), jump from 8 to 2 (label
`Repeat`, `A = 7301`, width 32.08447265625), both below. Above nothing is
drawn: `Ea = 0`, `y_root = max(8, 8 + 6.40234375) = 14.40234375`. Below:
root band to 26.9765625; the flow band starts at `26.9765625 + 4 =
30.9765625` with one break-label tier (`T = 1`, `10.4765625`), so the flow
row lies `30.9765625 + 10.4765625 = 41.453125` out, at `yf = 14.40234375 +
41.453125 = 55.85546875`; one jump level: the band is `10.4765625 + 8 + 0 +
2 + 10.4765625 = 30.953125` wide, `Eb = 30.9765625 + 30.953125 =
61.9296875`, `Hc = 14.40234375 + 61.9296875 + 8 = 84.33203125`. Wedges: tip
15.90234375, base 28.90234375; wedge labels' baseline 39.25634765625; name
baseline 18.21044921875 (as `bare`).

The break line: x 382.9775390625, from the flow row 55.85546875 to the top
padding 8. Its label starts at `382.9775390625 + 3 = 385.9775390625`, tier 1
touching the flow row on the root's side: baseline `yf − d(9) =
55.85546875 − 2.12255859375 = 53.73291015625`.

The jump (`w = 1.5`, so the head is `4w = 6` long and `2w = 3` half-wide):
`Xf = x(8) = 282.9775390625`, `Xt = x(2) = 132.9775390625`, `q = (Xt − Xf)
/ 4 = −150 / 4 = −37.5`; the apex lies `41.453125 + 8 = 49.453125` out, at
`ya = 63.85546875`; `yc = yf + 4/3 × (ya − yf) = 55.85546875 + (4/3) × 8 =
66.52213541666667` (binary64, `(4/3) × 8 = 10.666666666666666`).
`C1 = (282.9775390625 − 37.5, yc) = (245.4775390625, yc)`, `C2 = (Cx, yc)`,
`Cx = 132.9775390625 + 37.5 = 170.4775390625`. Direction: `Xt − Cx = −37.5`,
`yf − yc = −10.666666666666671` (binary64), `ℓ² = 1406.25 +
113.77777777777787 = 1520.0277777777778`, `ℓ = sqrt(1520.0277777777778) =
38.98753362009166`, `ux = −37.5 / ℓ = −0.9618459163232351`, `uy =
−10.666666666666671 / ℓ = −0.2735917273097203`. Base centre `Bh = (Xt −
6 ux, yf − 6 uy) = (138.74861456043942, 57.49701911385832)`; `n = (−uy, ux)`;
corners `Bh − 3n = (137.92783937851027, 60.382556862828025)` and `Bh + 3n =
(139.56938974236857, 54.61148136488862)`. The shaft is `P0 = (Xf, yf)`,
`C1`, `C2`, ending at `Bh`. Jump label centred at `(282.9775390625 +
132.9775390625) / 2 = 207.9775390625`, baseline `63.85546875 + 2 +
8.35400390625 = 74.20947265625`. The `16 ♩` label reaches
`482.9775390625 + 9.279052734375 = 492.256591796875`, beyond the arrowhead
tip 491.9775390625, so `Wc = 500.256591796875`.

### `map`

Root `melody` length 8 with map `tempo` (ScalarMap to seconds: physical,
continuous); child `phrase` at 2, length 4, with map `ticks` (QuartersToTicks
to ticks: logical, discrete). Maps have no names, so the widest name is
`Melody` (`A = 7361`, `N = 39.53662109375`), `x0 = 55.53662109375`,
`x(t) = x0 + 50 t`. Above: the root band holds `melody`'s stack, `tempo`
alone, and no wedge, so it reaches 6.5; `tempo` is centred 5.5 above the
root's line. The children band starts at `max(6.5 + 4, 7) = 10.5`; `p =
14`; `phrase`'s stack above (outwards, its outer half) reaches 6.5, less
than 7, so its row has halves 7 and 7: its line lies `10.5 + 7 = 17.5`
out and `Ea = 10.5 + 14 = 24.5`, `y_root = 32.5`. `phrase` y `32.5 − 17.5 =
15`; `ticks` centred 5.5 above it, `yc = 9.5`; `tempo` `yc = 32.5 − 5.5 =
27`. `Hc = 32.5 + 26.9765625 + 8 = 67.4765625`. Wedges: tip 34, base 47;
labels' baseline `32.5 + 16.5 + 8.35400390625 = 57.35400390625`. Names,
from the top row down: `Phrase` at `15 + 3.80810546875 = 18.80810546875`,
`Melody` at `32.5 + 3.80810546875 = 36.30810546875`. The arrowhead tip
`455.53662109375 + 9 = 464.53662109375` is the rightmost point (`8 ♩`
reaches 461.95263671875), so `Wc = 472.53662109375`. Maps span their
timelines: `tempo` from 55.53662109375 to 455.53662109375, `ticks` from
155.53662109375 to 355.53662109375. Cascade: `tempo` stroke `#0050EF`,
width 1, dash `none`; `ticks` stroke `#00CC00`, width 1, dash `1 1`. The
maps are drawn before the lines, in traversal order (`tempo`, `ticks`).

### `with_region`

Root `clt_1` length 12; children `clt_2` at 1/3 length 4 and `clt_3` at 2
length 3; region `region_1`, named `theme`, from 2 to 6 below (`A = 6616`,
width 29.07421875). The names `clt_x` give `x0 = 41.91552734375` as in
`nested`; a position `t` has `x = x0 + 400 × u` with `u` the double nearest
`t / 12`. `clt_2` takes row 1; `clt_3` starts at x(2), before `clt_2`'s end
x(13/3), so row 2: as in `nested`, the rows lie 14 and
28 out, `Ea = 35`, `y_root = 43`, and the child rows lie at 29 and 15.
Below: root band to 26.9765625, region band from 30.9765625, one row,
width `(6 + 2 + 10.4765625 + 4) − 4 = 18.4765625`, `Eb = 49.453125`,
`Hc = 43 + 49.453125 + 8 = 100.453125`. Brace: `x1 = x0 + 400 × (1/6)`,
`x2 = x0 + 400 × (1/2) = 241.91552734375`, arms `43 + 30.9765625 =
73.9765625`, tip 79.9765625, and exact midpoint x `x0 + 400 × u(4/12) =
175.24886067708331`. Its
label has baseline `79.9765625 + 2 + 8.35400390625 = 90.33056640625`. The
`12 ♩` label (`A = 4223`, as `16 ♩`) reaches 451.194580078125, so
`Wc = 459.194580078125`.

## Jumps of `corpus_score_ms3` (`placement.test.ts`)

Root `clt_1` (no name), quarters, length 37, map `ScalarMap` to ticks above;
children `controls` and `notes`, each from 0 to 37, so in rows 1 and 2
above. Names at 11: `controls` `A = 8211`, 44.10205078125 (the widest),
`notes` 30.51318359375, `clt_1` (`A = 4825`) 25.91552734375; `x0 = 8 + 44.10205078125 +
8 = 60.10205078125` (no centred label asks more: `0 ♩` asks `8 +
6.416015625`, `MC 3 → MC 1` (`A = 13320`, 58.53515625) at `u = 3/37` asks
`8 + 29.267578125 − 32.432432432432435`). Above: the root band is the
one-map stack (6.5), the children band starts at `max(6.5 + 4, 7) = 10.5`,
two rows of 14, `Ea = 38.5`, `y_root = 46.5`.

Below: the wedges reach 26.9765625. The flow band starts at 30.9765625 with
one break-label tier (`fine at MC 7`), so the flow row lies `41.453125` out
and `yf = 87.953125`. Jumps in canonical order (by from): `jump_1` `6→0`,
`jump_2` `9→6`, `jump_3` `28→16`, `jump_4` `37→0`, spans 6, 3, 12, 37:
placement order `jump_2`, `jump_1`, `jump_3`, `jump_4`. Extents from `x0`
(`400 × u`, `u` the double nearest `t / 37`): `jump_2`
`[64.86486486486487, 97.2972972972973]`, widened by its label `MC 5 → MC 4`
(58.53515625, centred at `x(15/2) − x0 = 81.08108108108108`) to
`[50.81350295608108, 111.34865920608108]`, level 1; `jump_1` `[0,
64.86486486486487]` (its label inside) conflicts, level 2; `jump_3`
`[172.97297297297297, 302.7027027027027]`, level 1; `jump_4` `[0, 400]`,
level 3. With `pj = 20.4765625` the apexes lie `41.453125 + 8 = 49.453125`,
69.9296875 and 90.40625 out, at 95.953125, 116.4296875 and 136.90625. The
band is `10.4765625 + 8 + 2 × 20.4765625 + 2 + 10.4765625 = 71.90625`
wide, `Eb = 102.8828125`, `Hc = 46.5 + 102.8828125 + 8 = 157.3828125`. The
break label's baseline is `87.953125 − 2.12255859375 = 85.83056640625`.

**Short jump** (`9→6`, level 1, `w = 1.5`): `Xf = x0 + 97.2972972972973 =
157.3993480785473`, `Xt = x0 + 64.86486486486487 = 124.96691564611487`,
`q = (Xt − Xf) / 4 = −8.108108108108105`, `yc = 87.953125 + (4/3) × 8 =
98.61979166666667`, `C1 = (149.2912399704392, yc)`, `Cx = Xt − q =
133.07502375422297`. `Xt − Cx = −8.108108108108098`, `yf − yc =
−10.666666666666671`, `ℓ² = 179.5191948705462`, `ℓ = 13.398477334031138`,
`u = (−0.6051514590776749, −0.7961103639421869)`, `Bh =
(128.59782440058092, 92.72978718365312)`, corners `(126.20949330875436,
94.54524156088614)` and `(130.98615549240748, 90.91433280642009)`: it
arrives steeply.

**Long jump** (`37→0`, level 3): `Xf = x0 + 400 = 460.10205078125`, `Xt =
x0 = 60.10205078125`, `q = −100`, `yc = 87.953125 + (4/3) × 48.953125 =
153.22395833333331`, `C1 = (360.10205078125, yc)`, `Cx =
160.10205078125`. `Xt − Cx = −100`, `yf − yc = −65.27083333333331`,
`ℓ² = 14260.281684027776`, `ℓ = 119.41642133319762`, `u =
(−0.837405767846437, −0.546581723054768)`, `Bh = (65.12648538832862,
91.23261533832861)`, corners `(63.48674021916431, 93.74483264186793)` and
`(66.76623055749292, 88.7203980347893)`: it arrives flatter than the short
one (`|uy|` 0.5466 against 0.7961).

## Map stacks, the root band and the end marker (`stacks.test.ts`)

Section 6.4 "Map stacks", "The root band" and "Children", and the end
marker of section 6.6. The tests prove that a map is placed against its own
timeline's line, that `above` means up and `below` down for a map whatever
side of the root its timeline lies on, that a stack wider than `p / 2`
widens exactly its half of the row, that the root band takes the larger of
the wedge reach and the stack reach, and that `locked` alone chooses the
end marker. Values use the common values above.

**The constructed manifest.** `r`, quarters, length 8, with child `c` at 4,
length 4, carrying the maps `m1` and `m2` (ScalarMap quarters to seconds),
built through `addChild` and `addConversionMap`. Names `r` (`A = 842`) and
`c` (`A = 1126`, 6.0478515625 wide) give `x0 = 8 + 6.0478515625 + 8 =
22.0478515625`; `c` runs from `x0 + 200 = 222.0478515625` to `x0 + 400 =
422.0478515625`. Below, the root band holds the wedges only (26.9765625).

- Both maps above (`J = 2` on `c`'s outer half): row 1's halves are inner 7
  and outer `max(7, 11.5) = 11.5`. The band starts at 7, `c`'s line lies
  14 out, the band is `7 + 11.5 = 18.5` wide, `Ea = 25.5`, `y_root = 33.5`,
  `c` at `33.5 − 14 = 19.5`, `m1` at `19.5 − 5.5 = 14` (`j = 1`), `m2` at
  `19.5 − 10.5 = 9` (`j = 2`), `Hc = 33.5 + 26.9765625 + 8 = 68.4765625`.
- Both maps below (`J = 2` on the inner half): inner 11.5, outer 7; `c`'s
  line lies `7 + 11.5 = 18.5` out, `Ea = 25.5`, `y_root = 33.5`, `c` at 15,
  `m1` at `15 + 5.5 = 20.5`, `m2` at `15 + 10.5 = 25.5`.
- `m1` above, `m2` below: each stack reaches 6.5 < 7, so the row keeps
  halves 7 and 7: `c`'s line 14 out, `Ea = 21`, `y_root = 29`, `c` at 15,
  `m1` at `15 − 5.5 = 9.5`, `m2` at `15 + 5.5 = 20.5`. Both maps are `j = 1`
  of their own stack.
- `c` moved below the root, both maps left above: for a map `above` is still
  up, which is now `c`'s inner half (towards the root), `J = 2`. Above
  nothing is drawn, `Ea = 0`, `y_root = 14.40234375`. Below, the root band
  reaches 26.9765625; the children band starts at `26.9765625 + 4 =
  30.9765625` (more than 7), inner `11.5`, outer 7: `c`'s line lies
  `30.9765625 + 11.5 = 42.4765625` out, at `56.87890625`; `m1` at
  `56.87890625 − 5.5 = 51.37890625`, `m2` at `56.87890625 − 10.5 =
  46.37890625`, both between `c` and the root. `Eb = 30.9765625 + 18.5 =
  49.4765625`, `Hc = 14.40234375 + 49.4765625 + 8 = 71.87890625`.

**`map` with `tempo` below** (`{ids: [tempo]} side below`): the
root band below holds the wedges (26.9765625) and a one-map stack (6.5) and
reaches `max(26.9765625, 6.5) = 26.9765625`. Above, no root band: the
children band starts at 7, `phrase` 14 out, `Ea = 21`, `y_root = 29`;
`phrase` at 15, `ticks` at 9.5, `tempo` at `29 + 5.5 = 34.5`, `Hc = 29 +
26.9765625 + 8 = 63.9765625`. The wedge tips lie at 30.5 and their bases
at 43.5, over the map; the map's descriptor index precedes both wedges'.

**`map` with the root's line hidden** (`{ids: [melody]} display none`): a
map is drawn only when its timeline's line is drawn, so `tempo` is not drawn
and takes no room, although its own `display` is `inline`. Above, no root
band (no wedge, no drawn root map): the children band starts at 7,
`phrase` 14 out, `Ea = 21`, `y_root = 29`; `phrase` at 15, `ticks` at 9.5.
The wedges, displayed on their own, still reach 26.9765625 below:
`Hc = 29 + 26.9765625 + 8 = 63.9765625`. The drawing holds no `melody` and
no `tempo` element.

**`conversion_maps__maps_quarters`** (one root, 18 maps, all displayed):
above, a stack of 18 maps reaches `1.5 + 18 × 5 = 91.5`, `y_root = 99.5`;
map `j` (canonical order, by id in code-point order, so `cmap_1`,
`cmap_10`, …, `cmap_14`, `cmap_2`, …, `tmap_2`) is centred `1.5 + 5j − 1`
above: `cmap_1` (`j = 1`) at 94 and `tmap_2` (`j = 18`) at `99.5 − 90.5 =
9`. `Hc = 99.5 + 26.9765625 + 8 = 134.4765625`. With
every map moved below, the root band below holds the wedges (26.9765625)
and the stack (91.5) and reaches 91.5: `Ea = 0`, `y_root = 14.40234375`,
`Hc = 14.40234375 + 91.5 + 8 = 113.90234375`, `j = 1` at
`14.40234375 + 5.5 = 19.90234375`, `j = 18` at `14.40234375 + 90.5 =
104.90234375`.

**End markers.** `r` with `c` at 4, length 4, no maps, read with `locked`
changed and validated again against the schema (no command changes
`locked`, and core's invariants refuse an unlocked child, which the schema
admits and section 6.6 draws). `c`'s line lies at 15
and `y_root = 29` (as above, no stack). The `8 ♩` label reaches `422.0478515625
+ 6.416015625 = 428.4638671875`.

- `r` unlocked, `c` locked (as `addChild` makes it): the root's arrowhead tip
  `422.0478515625 + 9 = 431.0478515625` is the rightmost point,
  `Wc = 439.0478515625`.
- `r` locked, `c` locked: the diamonds reach `422.0478515625 + 4.5 =
  426.5478515625`, the label wins, `Wc = 8 + 428.4638671875 =
  436.4638671875`.
- `r` locked, `c` unlocked: `c`'s arrowhead tip 431.0478515625 is the
  rightmost point, `Wc = 439.0478515625`. The line elements carry `locked`
  as the manifest states it.

## Row spacing (`stretch.test.ts`)

At spacing `v`, `nested` has `p0 = p = max(14v, 12.8046875)`; with no map
stack, row 1's line lies `p0 / 2 + p / 2 = p` out and row 2's `2p` out, so
the root-to-child gap equals the child-to-grandchild gap:

| `v` | `p` | root `y_root` | `clt_3` y | `clt_2` y |
|---|---|---|---|---|
| 0.5 | 12.8046875 | `8 + 6.40234375 + 4 × 6.40234375 = 40.01171875` | 27.20703125 | 14.40234375 |
| 1 | 14 | 43 | 29 | 15 |
| 2 | 28 | `8 + 14 + 56 = 78` | 50 | 22 |

At length 200 and spacing 1 the root of `nested` runs from 41.91552734375 to
`41.91552734375 + 200 = 241.91552734375` at `y_root = 43`: length moves x only.

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

Selectors are matched by `core`'s `selectorMatches` against element keys,
and `core`'s `manifestElements` enumerates the same keys for the `style`
command: for every manifest fixture, every drawn element but the block has
an address that `manifestElements` lists, with the same type.

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
- root → child, child → its child (`nested`): `{ids: [clt_1]}` stroke
  `#123456` reaches `clt_3` and `clt_2`;
- root → map (`map`): `{ids: [melody]}` stroke-width 7 reaches
  `tempo` when no statement sets it; a map has no name, so no element
  `tempo/name` is drawn;
- region → label (`with_region`): `{element: region}` font-size 13 gives
  the region label font-size 13;
- map domain and modality from `target_unit` (`conversion_maps__maps_quarters`
  with the default layer): `LinearMap_1` (seconds) is `#0050EF`, no dash;
  `QuartersToTicks_1` (ticks) is `#00CC00` with dash `1 1`;
  `QuartersToFloatingMeasures_1` (floating_measures) `#00CC00`, no dash;
- a null `target_unit` (`FloorMap_1`) matches no domain selector and
  inherits its timeline's stroke: with the extra layer
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
new side's flow row and ends at the other padding (`Hc − 8` instead of 8).
Each case first checks how many elements of the type the fixture draws: in
`map` 1 child, 2 maps (`tempo` on the root, `ticks` on `phrase`) and 2
wedges; in `with_region` 1 region; in `flow_control` 1 jump and 1 break.

The break of `flow_control` moved above: above, the flow band holds the
break and its label, no jump: one break-label tier, so the band is
`10.4765625` wide and is the first band, the flow row lies 10.4765625 out,
`Ea = 10.4765625`, `y_root = 18.4765625`. Below: the root band to
26.9765625 and the flow band (the jump, one level, no break label) from
30.9765625, `8 + 0 + 2 + 10.4765625 = 20.4765625` wide, `Eb = 51.453125`.
`Hc = 18.4765625 + 51.453125 + 8 = 77.9296875`, the drawing's height. The
line runs from the above flow row, `y1 = 18.4765625 − 10.4765625 = 8`, to
`y2 = Hc − 8 = 69.9296875`; its label's tier 1 touches the flow row on the
root's side, baseline `8 + a(9) = 16.35400390625`.

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

**Four jumps.** Root `r`, quarters, length 16, `x(t) = x0 + 25 t`, with
jumps 4→6 `one`, 8→10 `two`, 3→11 `three` and 2→12 `four`, each added by an
`add` command with its label as its id. Canonical order
sorts jumps by `from`: `four` (`2→12`), `three` (`3→11`), `one` (`4→6`),
`two` (`8→10`); their spans are 10, 8, 2 and 2, and the stable sort by span
gives the placement order `one`, `two`, `three`, `four`, which the jump
descriptors and their labels follow. Extents from `x0`: `one` `[100, 150]`,
label `one` (`A = 3811`, 16.74755859375 wide) centred at 125 inside it;
`two` `[200, 250]`, label (`A = 3731`, 16.39599609375) centred at 225;
`three` `[75, 275]`, label (`A = 5463`, 24.00732421875) centred at 175;
`four` `[50, 300]`, label (`A = 4114`, 18.0791015625) centred at 175. No
label widens its extent. First fit: `one` level 1, `two` level 1 (150 <
200), `three` level 2 (it conflicts with both), `four` level 3. Above, no band: `y_root = max(8,
8 + 12.8046875 / 2) = 14.40234375`. Below, the root band to 26.9765625,
the flow row at `f0 = 26.9765625 + 4 = 30.9765625`, so every
`yf = 14.40234375 + 30.9765625 = 45.37890625`. With `pj = 10 + 10.4765625
= 20.4765625`, the apex distances are `(f0 + 8) + 0 × pj = 38.9765625`,
`38.9765625 + 20.4765625 = 59.453125` and `38.9765625 + 2 × 20.4765625 =
79.9296875`, so `apex − yf` is 8, `8 + 20.4765625 = 28.4765625` and
`8 + 2 × 20.4765625 = 48.953125` (all exact): no break, so no break-label
tier, and the flow row is the start of the flow band. `yc = yf + 4/3 ×
(ya − yf)` in binary64: `45.37890625 + (4/3) × 8`, `45.37890625 + (4/3) ×
28.4765625` and `45.37890625 + (4/3) × 48.953125`.

**Float axis.** `continuous_physical`: root `cpt_1`, seconds, `float`,
length 12.5; children `cpt_2` at 0.5, length 4.25, and `cpt_3` at 6.0,
length 3.0, both in child row 1 (`[x(0.5), x(4.75)]` and `[x(6.0), x(9.0)]`
do not conflict). No name is set, so the names are the ids; the row's
joined name `cpt_2, cpt_3` has `A = 2 × (1126 + 1300 + 803 + 1024 + 1303) +
651 + 651 = 12414`, `N = 12414 × 11 / 2048 = 66.6767578125`, wider than
`cpt_1` (`A = 5556`, 29.841796875). The label `0.0 s` (`A = 1303 + 651 + 1303 + 651 + 1067 =
4975`, 21.86279296875 wide) at u 0 asks `8 + 10.931396484375`, and `12.5 s`
at u 1 nothing, so `x0 = 8 + 66.6767578125 + 8 = 82.6767578125` and the
root runs to `82.6767578125 + 400 = 482.6767578125`. The proportions are binary64 quotients:
`0.5 / 12.5` is the double nearest 0.04, and `400 ×` it rounds to 16, so
`cpt_2` starts at 98.6767578125; its end `0.5 + 4.25 = 4.75` gives `4.75 /
12.5`, the double nearest 0.38, and `400 ×` it rounds to 152, so it ends at
234.6767578125. The labels show the floats as Python writes them: `0.0 s` and
`12.5 s`.

**Band order.** `with_region` with its region moved above (`{element:
region} side above`), so the children and region bands share the above
side. The region band has `pr = 6 + 2 + 10.4765625 + 4 = 22.4765625` and
is `22.4765625 − 4 = 18.4765625` wide. At the default order the children
band comes first, from 7, its rows 14 and 28 out, to 35; the region band
starts at `35 + 4 = 39`, to 57.4765625; `y_root = 65.4765625`: `clt_2` at
`65.4765625 − 14 = 51.4765625`, `clt_3` at 37.4765625, the brace's arms at
`65.4765625 − 39 = 26.4765625` and its tip at 20.4765625. With
`["flow", "regions", "children"]` the region band is the first, from 0 to
18.4765625 (arms at the root's line, `yb = y_root`); the children band
starts at `max(18.4765625 + 4, 7) = 22.4765625`, rows `22.4765625 + 7 =
29.4765625` and `43.4765625` out, to `22.4765625 + 28 = 50.4765625`, so
`y_root = 58.4765625`, `clt_2` at 29, `clt_3` at 15, arms 58.4765625 and
tip 52.4765625. Below, the wedges reach 26.9765625 in both, so `Hc` is
`65.4765625 + 26.9765625 + 8 = 100.453125` and `93.453125`. The child rows
and map centres of `map` do not change when the name content widens `x0`.

`names.test.ts` pins the details: two non-overlapping children share row 1,
whose joined name is replaced by `content: "AAAA"` on the first name and
cut to `"A…"` by `max-width: 20`. A hidden second name at font size 20 still
sets the band's `p = h(20) = 23.28125`: the band starts at `p0 / 2 = 7`,
row 1's inner half is `23.28125 / 2 = 11.640625`, so its line lies
`18.640625` out; `Ea = 7 + 23.28125 = 30.28125`, `y_root = 38.28125`, and
the child row lies at `38.28125 − 18.640625 = 19.640625`. With every
non-block element hidden, the box contains only its background, `x0 = P =
8`, `Wc = P + x0 = 16`, and `Hc = 28.8046875`.
