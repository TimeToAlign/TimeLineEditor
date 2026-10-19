# `@timetoalign/tilie-layout` tests

`draw(manifest, placement, layers, metrics)` returns the drawing of one
TimeSkeleton manifest as timeskeleton's drawing specification defines it
(`docs/drawing.md` in the timeskeleton repository, "the specification"
below: sections 1 to 6 for each timeline drawn as a root, section 8 for the
box that holds them). The tests prove it from the specification, never from
the code's own output: every expected number is derived by hand from the
specification's formulas and the font's advance widths, and the arithmetic
is written out below. The drawing fixtures of the schema package, byte-equal
in the writers' tests, are the serialisation oracle; core is the oracle for
manifest facts (element keys, ancestry, member drawings). Manifests are
loaded from the schema package's fixtures or built through core's commands;
only the groups of one records case and the synthetic manifest of the
operation-count test are written by hand. The font metrics are the schema
package's. All comparisons are exact (`toBe`, `toEqual`); no tolerance
anywhere.

"The default layers" means `[DEFAULT_LAYER]`, plus `manifestLayer` of the
manifest when it has a `graphical` block (its `styles` and `statements`,
without its `order`); an "extra layer" is an application's layer, placed
between the two, since no layer lies above the manifest's own. "The default
placement" is `DEFAULT_PLACEMENT`, `{length: 400, spacing: 1, width: null,
height: null, places: {}}`. A timeline's band order is its entry of the
manifest's `graphical.order` (section 6.4), set through core's `set` of the
property `order` and written `[above] | [below]`: the kinds above the line
from the top down, then those below.

Every timeline drawn with a line of its own has its five bands at its own
line (section 6.4). By the default band order (section 4) the conversion
maps band lies above its line at level 1 and the children band beyond it,
and the markers, regions and flow control bands lie below, in that order;
the defaults hide the markers, regions and flow control bands of every
timeline but a member drawing's root. Only a present band has a level and
takes room. The band at level 1 or −1 starts at `c = 0` when it is the
markers or the conversion maps band, and otherwise `B` beyond the larger of
the line's reach on its side and `w / 2`: at `1.5 + 4 = 5.5` for a line of
width 3 that reaches nothing there. A children band starts no nearer than
`pl / 2`, half the pitch of the row its line lies in, so with no map it
starts at `14 / 2 = 7`.

Addresses follow section 2.2: a timeline or a group is addressed by its
bare id, the manifest's title by `name`, and every other element with an id
by the id of the root whose tree holds it, `/`, and its own id, so `map`'s
map `tempo` is `melody/tempo`. The prose names such elements by their id;
selectors and expectations use the whole address. The fixtures' minimal
twins (`*.minimal.json`) draw as their complete fixtures do and are left out
of every list of fixtures.

## Font measures (`metrics.test.ts`)

Hand-summed strings prove the width, ascent, descent and line-height
formulas (`0 ♩` at 9 is 12.83203125, `h(9) = 10.4765625`, `h(11) =
12.8046875`); an unmapped code point counts the fallback advance and is
listed; a control character becomes a space. Font metrics that record every
read of the advance table prove that a text is read once whatever its
sizes, and that cutting `AAAA` to width 20 at size 9 reads the text and the
ellipsis once each and returns `A…` with the width measuring it gives,
15.15673828125. Every name and label of every manifest fixture has the
width of the formula.

## The default layer (`defaults.test.ts`)

The oracle is the JSON block of section 4, parsed from the installed schema
package's `docs/drawing.md`: `DEFAULT_LAYER` equals it. Resolved alone, it
gives `bare`'s block and card their fill, stroke, `rx` and shadow; in
`group_child_member` the frame its own, the ancestor line `piece`, its marks
and their labels opacity 0.35, its name grey at size 9 and not faded. It
hides exactly the markers, regions and flow control bands of every timeline
held by a band (`with_region`'s `clt_2` and `clt_3`,
`unknown_length_segments`' `a`, `b` and `c`) and no band of a member
drawing's root, a member that is a child included.

## The cascade (`cascade.test.ts`)

One key, the child `c` of a root `r`, exercises the eight ranks of section
5 in order, each statement against the next lower one: layer, ids, depth of
`within`, class, element, `inside`, the count of domain and modality, then
statement order. A missing named style sets nothing, a `within` outside the
manifest matches nothing, and the block is never matched by domain, class,
ids or `within`. Recording which statements the cascade tests proves that
it tests only the general statements and those of the key's element, class
and id, in layer order. On the regions bands of `c` and `r`, each selector
field matches as section 5 says. Drawings prove the holder chain: a band
passes its timeline's style through to what it holds; a band's `display:
none` hides what it holds, its children's bands included, and nothing of
another timeline; an address drawn twice matches `inside` by each drawing's
own holders. Inheritance is a column of the property table: stroke,
stroke-width, stroke-dasharray, fill and font-size inherit (a root's stroke
reaches its grandchild, a region's font size its label), never `shadow`,
`opacity` or `rx`. A map is drawn in the domain and modality it
converts to, with its type as class. For every manifest fixture, every
drawn element's address and type are among the element keys core
enumerates.

## Hand-derived drawings (`examples.test.ts`)

The manifests below are drawn at the default placement with the default
layers, and every element's geometry, text and coordinate is compared. Each
is an anonymous box with one ungrouped root in its card (section 8, "The
box" below): the name column starts at `xn = P + K = 16`, the card's top
lies at `P = 8`, so the root's line lies at `8 + y_root`; the card spans `P`
to `R + K` and is `Hm = Hc` high, and its shadow, 2 further right and down,
sets the box: `W = 8 + (R + K + 2)` and `H = 8 + (8 + Hm + 2)`.

Common values: `P = 8`, `G' = 8`, `B = 4 × v`, `h(9) = 10.4765625`,
`a(9) = 8.35400390625`, `d(9) = 2.12255859375`, `h(11) = 12.8046875`,
`(a(11) − d(11)) / 2 = (20911 − 5313) / 4096 = 3.80810546875`. The root's
stroke width `w` is 3, so a wedge's tip lies `w / 2 = 1.5` out and its base
`w / 2 + 13 = 14.5` out, and the wedges with one label tier reach `1.5 + 13
+ 2 + 10.4765625 = 26.9765625`. Wedge labels in tier 1 start `16.5` out, so
their baseline below is `(y + 16.5) + a(9)`, `y` the root's line. Every
root here has `locked: false` and ends with an arrowhead whose tip is `3w =
9` beyond `Xe`; every child ends with a diamond reaching `1.5w = 4.5`
beyond `Xe`. A jump has the default stroke width 1. The root's row has the
pitch `p0 = max(14, h(11)) = 14`; a child row whose children carry no map
stack wider than `p / 2` has both halves `p / 2`. A map's stack constants
are `d = 2`, `g = 3`: on a timeline of width 3, map `j` is centred `1.5 +
5j − 1` out, and a stack of `J` maps reaches `1.5 + 5J` (6.5 for one).

### `bare`

Root `bare`, quarters, length 8, name `Bare` (`A = 1405 + 1255 + 842 + 1260
= 4762`). `N = 4762 × 11 / 2048 = 25.5771484375`. Labels `0 ♩` and `8 ♩`,
each 12.83203125 wide, ask for at most `16 + 6.416015625` of `x0`, so `x0 =
16 + N + 8 = 49.5771484375`; `Xe = x0 + 400 = 449.5771484375`. No band
above, so `y_root = max(8 + 0, 8 + 12.8046875 / 2) = 14.40234375` and the
line lies at 22.40234375; below, the markers band holds the two wedges, `Eb
= 26.9765625`, `Hc = 14.40234375 + 26.9765625 + 8 = 49.37890625`. Wedges:
tip 23.90234375, base 36.90234375. Labels' baseline `(22.40234375 + 16.5) +
8.35400390625 = 47.25634765625`. Name baseline `22.40234375 + 3.80810546875
= 26.21044921875`. The rightmost drawn point is the arrowhead tip `R =
458.5771484375` (the `8 ♩` label reaches only 455.9931640625), so the card
is `{8, 8, 458.5771484375, 49.37890625}`, `W = 476.5771484375` and `H =
67.37890625`. The elements are, in order: block, `bare/card`, `bare`,
`bare/start`, `bare/end`, `bare/name`, `bare/start/label` (coordinate 0
quarters), `bare/end/label` (8 quarters). `unmapped` is empty. The default
layer gives the line and its fill `#00CC00` at width 3, the wedges `#000000`,
the name size 11 and the labels size 9.

### `nested`

Root `clt_1` length 16; child `clt_3` at 4, length 8; its child `clt_2` at
3/2, length 2 (11/2 to 15/2 on the root's axis). Names `clt_x` have `A =
4825`, width `25.91552734375`. `x0 = 16 + 25.91552734375 + 8 =
49.91552734375` (the `16 ♩` label, 18.55810546875 wide, asks nothing), `x(t)
= x0 + 25 t`. The rows are `{clt_1}`, `{clt_3}` and `{clt_2}`, every pitch
14; each children band lies above its line at level 1 and starts at 7. From
the deepest row up: the row `{clt_2}` has halves 7 and 7, its line 14 above
`clt_3`'s, `clt_3`'s band 14 wide and its above edge `7 + 14 = 21`; so the
row `{clt_3}` has the inner half 7 and the outer half `max(7, 21) = 21`, its
line 14 above the root's, `clt_1`'s band `7 + 21 = 28` wide, `Ea = 35`,
`y_root = 43`, the root's line at 51. `clt_3`: xs 149.91552734375, xe
349.91552734375, y 37; `clt_2`: xs 187.41552734375, xe 237.41552734375, y
23. `Hc = 43 + 26.9765625 + 8 = 77.9765625`. Wedges: tip 52.5, base 65.5;
labels' baseline `(51 + 16.5) + 8.35400390625 = 75.85400390625`. Names, top
down: `clt_2` at 26.80810546875, `clt_3` at 40.80810546875, `clt_1` at
54.80810546875. The `16 ♩` label reaches `R = 449.91552734375 +
9.279052734375 = 459.194580078125`, beyond the arrowhead's tip: `W =
477.194580078125`, `H = 95.9765625`.

### `flow_control`

Root `flow:quarters` length 16, name `Flow control` (`N =
66.9775390625`), `x0 = 90.9775390625`, `x(t) = x0 + 25 t`. Break at 12
(label `Fine`), jump from 8 to 2 (label `Repeat`), both below; the line at
22.40234375 as in `bare`. The flow control band starts at `26.9765625 + 4 =
30.9765625` with one break-label tier, so the flow row lies 41.453125 out,
at `yf = 63.85546875`; one jump level makes the band `10.4765625 + 8 + 0 + 2
+ 10.4765625 = 30.953125` wide, `Eb = 61.9296875`, `Hc = 84.33203125`. The
break line runs at x 390.9775390625 from the flow row to `8 + P × v = 16`;
its label starts at 393.9775390625, baseline `yf − d(9) =
61.73291015625`.

The jump (`w = 1`: the head 4 long and 2 half-wide): `Xf = 290.9775390625`,
`Xt = 140.9775390625`, `q = (Xt − Xf) / 4 = −37.5`; the apex 49.453125 out,
`ya = 71.85546875`; `yc = yf + 4/3 × (ya − yf) = 74.52213541666667`, `C1 =
(253.4775390625, yc)`, `C2 = (178.4775390625, yc)`; the head's axis `u =
(−0.9618459163232351, −0.2735917273097203)` from `Xt − Cx = −37.5` and `yf
− yc = −10.666666666666671`. The head is computed in item coordinates and
drawn `8 +` each: `Bh = (144.82492272779294, 64.94983565923889)`, corners
`(144.2777392731735, 66.87352749188534)` and `(145.37210618241238,
63.02614382659241)` (summed from the card's top first, their `y` would be
66.87352749188535 and 63.02614382659242). The shaft runs `(Xf, yf)`, `C1`,
`C2` to `Bh`. The jump label is centred at `x(5) = 215.9775390625`,
baseline 82.20947265625. The `16 ♩` label reaches `R = 500.256591796875`:
`W = 518.256591796875`, `H = 102.33203125`.

### `map`

Root `melody` length 8 with map `tempo` (ScalarMap to seconds: physical,
continuous); child `phrase` at 2, length 4, with map `ticks`
(QuartersToTicks: logical, discrete). Maps have no names, so the widest
name is `Melody` (`N = 39.53662109375`), `x0 = 63.53662109375`, `x(t) = x0
+ 50 t`. The conversion maps band holds `tempo` and reaches 6.5; the
children band starts at `max(6.5 + 4, 7) = 10.5`; `phrase`'s maps reach
6.5, less than 7, so its row has halves 7 and 7: `Ea = 24.5`, `y_root =
32.5`, the root's line at 40.5, `phrase` at 23, `ticks` at `yc = 17.5`,
`tempo` at 35. `Hc = 67.4765625`; names top down at 26.80810546875 and
44.30810546875. The arrowhead tip `R = 472.53662109375` is the rightmost
point: `W = 490.53662109375`, `H = 85.4765625`. Maps span their timelines
(`tempo` 63.53662109375 to 463.53662109375, `ticks` 163.53662109375 to
363.53662109375), are drawn before the lines in traversal order, and
cascade to `tempo` stroke `#0050EF`, dash `none`, and `ticks` `#00CC00`,
dash `1 1`, both width 1.

### `with_region`

Root `clt_1` length 12; children `clt_2` at 1/3 length 4 and `clt_3` at 2
length 3; region `region_1`, named `theme`, from 2 to 6 below. `x0 =
49.91552734375` as in `nested`; `x = x0 + 400 × u` with `u` the double
nearest `t / 12`. `clt_3` starts before `clt_2`'s end, so row 2: the rows
lie as in `nested`, the root's line at 51. Below: the regions band from
30.9765625, one row, `(6 + 2 + 10.4765625 + 4) − 4 = 18.4765625` wide, `Eb
= 49.453125`, `Hc = 100.453125`. Brace: `x1 = x0 + 400 × u(2)`, `x2 =
249.91552734375`, arms at 81.9765625, tip at 87.9765625, midpoint x `x0 +
400 × u(4) = 183.24886067708331`; its label's baseline `(51 + (30.9765625
+ 6 + 2)) + 8.35400390625 = 98.33056640625`. `R = 459.194580078125` as in
`nested`: `W = 477.194580078125`, `H = 118.453125`.

## Member drawings (`member.test.ts`)

`styled__score`, whose root has a band on every side, and `nested` at
length 800 and spacing 2 are compared element by element with member
drawings summed from sections 3 and 6. Two spacings of `styled__score`
fix the order of the sums, each where the other order gives another double:
at 0.89 each distance outwards is summed whole before it becomes an
ordinate, at 2.63 each band's width is summed before its start is added.
Wedge labels share tier 1 when the end label's extent starts where the
start label's ends, and the end label goes to tier 2, start before end,
when they overlap. A timeline whose name is null is named by its id after
the last colon.

## One timeline's bands (`timeline.test.ts`)

Each timeline of a member drawing is laid out alone and its bands compared
top to bottom as kind, level, start, width, outer edge and elements held,
against the band rules above: sides and levels by the band order (a child
without an entry following its parent band by band id, a member that is a
child following its parent), and a side without a band has the line's reach
as its outer edge. A children band starts at the larger of the rule's start and half its
row's pitch (`map`'s `melody` at 10.5 for the pitch 14 and 15 for 30,
`segment_line`'s `form` at 24.4765625, `unknown_length_child`'s `score` at
7). The conversion maps band is the line's stack only at level ±1; a segment
line with boundaries reaches `k` both ways, its segment labels above only
(`b`: 20.4765625 above, 8 below). Segments without a line join their
displayed bands to their segment line's, after its own, in its band order.
An open end runs on `9.5w`; an extent holds the drawn labels and break
points. A root's break ends at the padding of the opposite side, any other
`max(E, h(s) / 2)` beyond its line (`child_flow_control`'s `verse` with a
map: 93.5).

## Stacks, band orders and rows (`stacks.test.ts`, `order.test.ts`, `rows.test.ts`)

Drawings of fixtures and of manifests built by command, each value summed
from sections 4 and 6.4:

- **Stacks.** A child's conversion maps band lies above its line by
  default, below by its own entry or its parent's, and towards the root when
  the child lies below the root. The markers band alone lies against the
  root's line, on the side the band order gives it. In
  `conversion_maps__maps_quarters` the maps lie against the line above (the
  root at 107.5, `cmap_1` at 102, `tmap_2` at 17, `H = 152.4765625`); with
  the markers band on that side the two lie `B` apart, and ordered after it
  the maps lie beyond it and the line has no stack.
- **The end mark.** `r` (length 8) ends in the arrowhead unlocked (`xe`
  430.0478515625, `W = 457.0478515625`) and the circle locked (`W =
  454.4638671875`); its child `c` ends in the diamond whatever its `locked`.
- **Band orders.** A band moved across its line moves everything it holds;
  a child's band order follows its parent's by band id without an entry,
  is its own entry when it has one, and returns to its parent's when the
  entry is set to null. A break runs from its flow row across its line, the
  root's to the padding, a child's to `max(E, h(s) / 2)` beyond it.
- **Rows.** In `joint_rows` the children bands of each row's lines are laid
  out together at two depths, one name per row, at the size of the
  hand-derived figure. A row takes the room of the children bands on both
  sides of its lines, one name size and pitch for every row of a joint
  layout; a hidden child takes no room; a joint row mixing segment lines
  and a child counts the child's name alone, and its pitch.

## Jumps, a float axis and band orders (`placement.test.ts`)

**Five jumps.** Root `r`, quarters, length 16, `x(t) = x0 + 25 t`, with
jumps 4→6 `one`, 8→10 `two`, 3→11 `three`, 2→12 `four` and 1→13 `five`,
each added with its label as its id; `x0 = 16 + 4.5224609375 + 8` (the
name `r`, `A = 842`). Canonical order sorts by `from`: `five`, `four`,
`three`, `one`, `two`; their spans are 12, 10, 8, 2 and 2, and the stable
sort by span gives the placement order `one`, `two`, `three`, `four`,
`five`, which the jumps and their labels are drawn in. Extents from `x0`:
`one` `[100, 150]`, `two` `[200, 250]`, `three` `[75, 275]`, `four` `[50,
300]`, `five` `[25, 325]`; no label widens its extent. First fit: `one` and
`two` level 1, `three` 2, `four` 3, `five` 4. No band above: the root's line at
22.40234375. No break, so no break-label tier: the flow row is the flow
control band's start `f0 = 26.9765625 + 4 = 30.9765625`, `yf =
53.37890625`. With `pj = 10 + 10.4765625 = 20.4765625`, `apex − yf` is 8,
28.4765625, 48.953125 and 69.4296875. In `yc = yf + 4/3 × (ya − yf)` the
factor 4/3 is formed first (section 3.3): the double nearest the exact
product, never the binary64 product of the double `4 / 3`. The readings part
on level 4 only, which is why `five` is there: `4/3 × 8887/128 = 8887/96`
has the nearest double 92.57291666666667, while `(4 / 3) * 69.4296875`
gives 92.57291666666666. Summed in item coordinates (the flow row at
45.37890625) and drawn `8 +` each, `yc` is 64.04557291666666, 91.34765625,
118.64973958333333 and 145.95182291666669 (summed from the card's top
first, `one` and `two` would be 64.04557291666667).

**`corpus_score_ms3`.** Root `clt_1` (no name), quarters, length 37, a
ScalarMap above; children `controls` and `notes`, each from 0 to 37, in
rows 1 and 2. The widest name is `controls` (44.10205078125); `x0 =
68.10205078125` (no centred label asks more: `MC 3 → MC 1`, 58.53515625
wide, at `u = 3/37` asks `16 + 29.267578125 − 32.432432432432435`). Above:
the one-map stack (6.5), the children band from 10.5, two rows of 14, `Ea
= 38.5`, `y_root = 46.5`, the root's line at 54.5. Below: the markers band
to 26.9765625, the flow control band from 30.9765625 with one break-label
tier (`fine at MC 7`): the flow row lies 41.453125 out, `yf = 95.953125`,
the break label's baseline `95.953125 − 2.12255859375 = 93.83056640625`.
Jumps by `from`: `jump_1` `6→0`, `jump_2` `9→6`, `jump_3` `28→16`,
`jump_4` `37→0`, spans 6, 3, 12, 37: placement order `jump_2`, `jump_1`,
`jump_3`, `jump_4`. Extents (`400 × u`, `u` the double nearest `t / 37`):
`jump_2` `[64.86486486486487, 97.2972972972973]`, widened by its label `MC
5 → MC 4` centred at 81.08108108108108 to `[50.81350295608108,
111.34865920608108]`, level 1; `jump_1` `[0, 64.86486486486487]` conflicts,
level 2; `jump_3` `[172.97297297297297, 302.7027027027027]`, level 1;
`jump_4` `[0, 400]`, level 3. With `pj = 20.4765625` the apexes lie at
103.953125, 124.4296875 and 144.90625. The band is `10.4765625 + 8 + 2 ×
20.4765625 + 2 + 10.4765625 = 71.90625` wide, `Eb = 102.8828125`, `Hc =
157.3828125`, `H = 175.3828125`.

- **Short jump** (`9→6`, level 1): `Xf = 165.3993480785473`, `Xt =
  132.96691564611487`, `yc = 95.953125 + (4/3) × 8 = 106.61979166666667`,
  `C1 = (157.2912399704392, yc)`, `u = (−0.6051514590776749,
  −0.7961103639421869)`, `Bh = (135.38752148242557, 99.13756645576875)`,
  corners `(133.7953007545412, 100.3478693739241)` and
  `(136.97974221030995, 97.9272635376134)`: it arrives steeply.
- **Long jump** (`37→0`, level 3): `Xf = 468.10205078125`, `Xt =
  68.10205078125`, `yc = 161.22395833333331`, `C1 = (368.10205078125, yc)`,
  `u = (−0.837405767846437, −0.546581723054768)`, `Bh =
  (71.45167385263575, 98.13945189221907)`, corners `(70.35851040652622,
  99.81426342791194)` and `(72.54483729874529, 96.4646403565262)`: it
  arrives flatter. Summed from the card's left edge first, the first
  corner's `x` would be 70.35851040652621.

**Float axis.** `continuous_physical`: root `cpt_1`, seconds, `float`,
length 12.5; children `cpt_2` at 0.5, length 4.25, and `cpt_3` at 6.0,
length 3.0, both in child row 1. The row's joined name `cpt_2, cpt_3` (`A =
12414`, `N = 66.6767578125`) is the widest; `0.0 s` (21.86279296875 wide)
asks `16 + 10.931396484375`, so `x0 = 90.6767578125`, the root running to
490.6767578125. The proportions are binary64 quotients: `0.5 / 12.5` is the
double nearest 0.04 and `400 ×` it rounds to 16, so `cpt_2` starts at
106.6767578125; `4.75 / 12.5` is the double nearest 0.38 and `400 ×` it
rounds to 152, so it ends at 242.6767578125. The labels show the floats as
Python writes them: `0.0 s` and `12.5 s`.

**Band order.** `with_region` with the regions and children bands above
its root's line (no map, so no conversion maps band) and the markers and
flow control bands below. The regions band is `22.4765625 − 4 =
18.4765625` wide, the children band `7 + 7 + 7 + 7 = 28`; below, the
markers band reaches 26.9765625.

- `[regions, children, conversion_maps] | [markers, flow_control]`: the
  children band at level 1 from `max(1.5 + 4, 7) = 7`, its rows 14 and 28
  out, to 35; the regions band at level 2 from 39 to 57.4765625; `y_root =
  65.4765625`, the root's line at 73.4765625, `clt_2` at 59.4765625,
  `clt_3` at 45.4765625, the brace's arms at 34.4765625 and its tip at
  28.4765625; `H = 118.453125`.
- `[children, regions, conversion_maps] | [markers, flow_control]`: the
  regions band at level 1 from `1.5 + 4 = 5.5` to 23.9765625; the children
  band at level 2 from 27.9765625, its rows 34.9765625 and 48.9765625 out,
  to 55.9765625; `y_root = 63.9765625`, the root's line at 71.9765625,
  `clt_2` at 37, `clt_3` at 23, the arms at 66.4765625 and the tip at
  60.4765625; `H = 116.953125`.

The child rows and map centres of `map` do not change when a name's
`content` widens `x0`: first fit is independent of the name column.

## Row names and empty boxes (`names.test.ts`)

Two non-overlapping children share row 1, whose joined name is replaced by
`content: "AAAA"` on the first name and cut to `"A…"` by `max-width: 20`.
A hidden second name at font size 20 still sets the band's `p = h(20) =
23.28125`: the band starts at `p0 / 2 = 7`, row 1's inner half is
11.640625, so its line lies 18.640625 out; `Ea = 30.28125`, `y_root =
38.28125`, the root's line at 46.28125, the child row at 27.640625. With
every element but the block hidden the hidden card keeps its place
(section 8.4): `x0 = R = xn = 16`, the card spans 8 to 24, `Hc =
14.40234375 + 6.40234375 + 8 = 28.8046875`, the box 32 by 44.8046875. A
manifest named "Mixed" with no timelines and no groups holds only its title
at size 11, which enters the box like a card: `w = 6108 × 11 / 2048 =
32.806640625`, its slot ending at `8 + h(11) = 20.8046875`; the box is
48.806640625 by 28.8046875. The fallback `P + x0 = 24` by `P = 8` applies
only to a box holding no frame, no card and no displayed title: the same
manifest with its title at `display: none`.

## Stretch (`stretch.test.ts`)

**Sizes.** For `nested`, `map`, `flow_control` and `with_region`, at
lengths 200, 400 and 800 and spacings 0.5, 1 and 2, every element keeps its
style and its text, the wedge stays 6 wide and 13 high, and a child's
diamond and circle keep their size: only positions change. Length moves x
only: at length 200 the root of `nested` runs from 49.91552734375 to
249.91552734375 at 51.

**Row spacing.** At spacing `v`, `nested` has `p0 = p = max(14v,
12.8046875)`; with no map each children band starts at `p / 2`, so each
row lies one pitch beyond the last, and `y_root = 8v + Ea`:

| `v` | `p` | root | `clt_3` | `clt_2` |
|---|---|---|---|---|
| 0.5 | 12.8046875 | `8 + (4 + 6.40234375 + 4 × 6.40234375) = 44.01171875` | 31.20703125 | 18.40234375 |
| 1 | 14 | `8 + 43 = 51` | 37 | 23 |
| 2 | 28 | `8 + (16 + 14 + 56) = 94` | 66 | 38 |

**Vertical padding.** Section 6.5 multiplies the padding by `v`: `y_root =
max(P v + Ea, P v + h(s) / 2)`, `Hc = y_root + max(Eb, h(s) / 2) + P v`,
and a break line ends `P v` from the member drawing's top or `Hc − P v`
below it. The horizontal padding is not stretched; `H = Hc + 18`.

- `bare` at `v = 2`: `y_root = 22.40234375`, the line at 30.40234375, `Hc =
  65.37890625`, `H = 83.37890625`; at `v = 0.5`: `y_root = 10.40234375`,
  `Hc = 41.37890625`, `H = 59.37890625`. The width stays 476.5771484375:
  the height grows by exactly `2 × 8 × (v − 1)`.
- `flow_control` at `v = 2`: the flow control band from `26.9765625 + 8 =
  34.9765625`, 38.953125 wide, `yf = 75.85546875`, `H = 130.33203125`; the
  break line from `yf` to `8 + 16 = 24`. With `[flow_control, children,
  conversion_maps] | [markers, regions]` the band lies alone above, from
  `1.5 + 8 = 9.5`, `y_root = 64.453125`, `H = 125.4296875`; the break line
  runs from the flow row at 52.4765625 to the padding below, `8 + (Hc − 16)
  = 99.4296875`.

**Box size.** With `width` and `height` 120 and 60 above the natural box,
every element but the block is identical to the natural drawing and `W =
width`, `H = height`; a request of 1 by 1 draws the natural drawing.

## Segment lines (`segments.test.ts`)

`segment_line` and `segment_pages_accolades` are checked against the box
size, lines, boundaries, labels and names summed from sections 3.4 and 6:
the segment lines are children in row 1, each boundary on its segment
line's line, each label above it centred on its segment, both in the
traversal order of their segments, and only the root's row named. Among
ordinary children (`segment_children`) segment lines take rows by first
fit, each named. Segments that are no lines stay on the root's line with no
children band. A line's reach counts `k` only for a drawn boundary, keeps it
fixed when the spacing stretches, and a hidden line takes no room. A row of
segment lines takes its first line's name size. A segment that is no line
(`segment_pages`) is matched neither by `{element: child}` nor by its own
id: its segment line holds its boundary and label, so that line's id and a
`within` the segment reach them, never the segment line's own boundary.
The regions of segments without a line join their segment line's regions
band when shown and are hidden by default.

## Ancestor lines (`ancestors.test.ts`)

`group_child_member`, `group_grandchild` and `group_parents_mixed` are
checked against section 8.3, every value derived from the member's offsets
and length: an ancestor line runs on to the left with its own arrowhead,
marks the member's start and end above itself, faded, labelled on its own
axis in its unit and number type, under a small grey name; one row per
ancestor, the parent nearest; the outer chevron's tip counts in the right
edge; the ancestors' elements come first within each frame (section 8.5).
Single changes prove the room taken: mark labels in first-fit tiers, a
row's pitch from its name's size, `q / 2` for a row without marks, eight
stroke widths of `x0` for a line running on to the left, a mark label as a
centred label, none for a hidden ancestor, and the ancestor band `B` beyond
the stroke of a wide member's line. `inside: ancestor` matches the marks, never
the member's own wedges.

## Timelines of unknown length (`unknown.test.ts`)

Every end rule of section 6.6 is drawn. `unknown_length`'s root is scaled
to its reach (`score` from 53.798828125, running on to 465.798828125), with
its start wedge and `0 ♩` only, its outer chevron's tip setting `W =
500.298828125`; empty, it is drawn `L` long; locked, it still ends in three
chevrons. `corpus_score_ms3` without its children and `jump_4` draws the
same flow control with its length set to null, the measure map's last row
in its reach. A child of unknown length ends at its offset plus its reach,
open, with room for its chevrons, `9.5w`; a group member runs on at the
shared end; a segment ends at the next one's start, the last at its
segment line's end. Ancestor lines run on where the member's or the
ancestor's length is not known and end short of the member where a
timeline between has no length. Counting reads of a timeline's children
proves that its reach is computed once per drawing.

## The box (`box.test.ts`, `groups.test.ts`)

Section 8 draws every manifest as one box: a manifest of one root as a box
holding it ungrouped, one of one group as a box holding its frame; a
manifest with neither a `name` nor an `id` has no title. Positions are
checked against the quantities below, derived from sections 8.1, 8.2 and
8.4, the advance widths and the member heights `Hm` of section 6.5 (with
the ancestor band of section 8.3); the drawing fixtures pin the same boxes
byte for byte. Order is checked against sections 7.2 and 8.5, and
`Drawing.boxes` holds one `DrawnBox` per container, the box first, then in
drawing order each frame, card and band, each naming its holder. A record's
`range` is the half-open range of `elements` it emitted, whatever is
displayed; `displayed`, stated on every record, says whether its own
rectangle opens that range:
always for the box, for a frame or card unless its style hides it, never
for a band. Every value is dyadic, so every sum is exact. A rectangle
spanning `a..b`, `c..d` is `{x: a, y: c, width: b − a, height: d − c}`. A
card's shadow, 2 right and 2 down, is its first descriptor, and its edges
enter `Wb` and `Hb`.

**The quantities.** One horizontal layout for the whole box (section 8.2),
in item coordinates: the name column `n` (`Q + K = 16` when the box holds a
frame, else `K = 8`), `N` the widest drawn name, the start `s0` past the
name column, the gap `G' = 8` and `8 wa` for an ancestor running on to the
left, the right margin `Mr`, the largest `e − (s0 + Li)` over the member
drawings, and item `i`'s right edge `Ri = s0 + Li + Mr`, or its title's
right edge when larger. At the default place `x = P = 8`: `xn = 8 + n`, `x0
= 8 + s0`, `R = 8 + Ri`. Common values: `P = Q = K = F = 8`, the title gap
4, `a(11) = 10.21044921875`, `h(11) = 12.8046875`. A member drawing with its
two wedges below in one label tier is `Hm = 14.40234375 + 26.9765625 + 8 =
49.37890625` high with no ancestor, `48.9765625 + 26.9765625 + 8 =
83.953125` with one ancestor row and `82.953125 + 26.9765625 + 8 =
117.9296875` with two. One map above gives `y_root = 14.5`, `Hm =
49.4765625`; under one ancestor row an ancestor band starts at `max(7, 6.5
+ 4) = 10.5`, so `y_root = 52.4765625`, `Hm = 87.453125`, the ancestor's
line 17.5 above the member's. Maps end at their line's `Xe` and change no
horizontal quantity.

| case | `xn` | `x0` | `R` | heights | `W`, `H` set by |
|---|---|---|---|---|---|
| `bare` | 16 | `16 + 25.5771484375 + 8 = 49.5771484375` | arrowhead tip 458.5771484375 | 49.37890625 | 476.5771484375, 67.37890625: the shadow |
| `group_child_member` | 24 | `24 + 64.61962890625 + 8 + 24 = 120.61962890625` | 534.4140625 (`10.0 s`) | 83.953125, 49.37890625 | 558.4140625, 190.13671875: the frame |
| `group_parents_mixed` | 24 | `24 + 57.0302734375 + 8 + 24 = 113.0302734375` | 544.08642578125 (`1323000 smp`) | 83.953125, 87.453125, 83.953125, 49.4765625 | 568.08642578125, 377.640625 |
| `group_grandchild` | 24 | `24 + 55.70361328125 + 8 + 24 = 111.70361328125` | 535.70361328125 (`score`'s outer chevron, `x0 + L + 8w`) | 117.9296875, 49.37890625 | 559.70361328125, 224.11328125 |

A frame at `(P, P)` spans `0` to `Ri + K + Q` and `Q + h(11) + 4 + Σ Hm +
(m − 1) F + Q` high for `m` cards; its title lies at `x = P + Q = 16`,
baseline `P + Q + a(11) = 26.21044921875`; its cards span `Q` to `Ri + K`,
the first at `P + Q + h(11) + 4 = 32.8046875`, each further one `F` below
the last; each root line lies `y_root` below its card's top. A box-held card
spans `0` to `Ri + K`, `Q` further when the box holds a frame, so frames and
cards of one length end at one x.

**`bundle_mixed`** ("Mixed", no `id`; frames `group_1` with `score`,
`performance` and `group_2` with `page`, `excerpt`, a child of `recording`
at 44100 samples drawn under `recording`'s ancestor line; the ungrouped
root `annotations`) is the case of every rule at once:

- `n = 16`; `N = 70.29150390625` (`Performance`); `recording` runs on to
  the left, so `s0 = 16 + 70.29150390625 + 8 + 24 = 118.29150390625`.
- `Mr = 28.193115234375`, half of `excerpt`'s end mark label `132300 smp`
  (56.38623046875) past the shared end; every item has `Ri =
  546.484619140625`, every member's card is 546.484619140625 wide.
- Heights: `score` 78.953125 (two maps, `y_root = 19.5`; its flow control
  band from 30.9765625, 20.4765625 wide), `performance` and `page`
  49.4765625, `excerpt` 87.453125, `annotations` 71.85546875 (its two
  regions share one row, 18.4765625 wide, from 30.9765625).
- The title at `(8, 18.21044921875)`, `Pt = 8 + h(11) + 8 = 28.8046875`;
  `group_1` at 28.8046875, 169.234375 high, its cards at 53.609375 and
  140.5625; `group_2` at 206.0390625, 177.734375 high, its cards at
  230.84375 and 288.3203125; `annotations/card` at 391.7734375. Every line
  runs from 126.29150390625 to 526.29150390625; `W = 580.484619140625`, `H
  = 473.62890625`, both from `annotations/card`'s shadow.
- Element order: block, `name`, `group_1`, `group_1/name`, `score/card`,
  `score/cmap_1`, `score/cmap_2`, `score/jump_1`, `score`, …,
  `excerpt/card`, `recording/cmap_2`, `recording` (the ancestor line),
  `excerpt`, …: a member drawing opens with its breaks, maps, regions and
  jumps, its ancestor lines just before its line.
- Records: a root with its two wedges emits 6 elements, each map 1, each
  region or jump 2, each ancestor row 6. So of 58 elements: the box `[0,
  58)`; `group_1` `[2, 23)` holding `score/card` `[4, 15)` and
  `performance/card` `[15, 23)`; `group_2` `[23, 47)` holding `page/card`
  `[25, 33)` and `excerpt/card` `[33, 47)`; `annotations/card` `[47, 58)`.
  The frames and `annotations/card` are the items and carry `item`, their
  place; every card carries `card`, its size in item coordinates (a
  member's card `{546.484619140625, Hm}`), its `spacing` 1 and its request
  `{}`, and its rectangle is its drawn one. Every band is held by the card
  whose member drawing draws its line, and its range is empty.

**Hidden titles.** With `{ids: ["group_1/name"]} display none` on
`group_child_member` the frame loses its title slot: cards at 16 and
107.953125, the frame 157.33203125 high, `H = 173.33203125`. With `{ids:
["name"]} display none` on `bundle_mixed` everything below moves up by
`h(11) + F = 20.8046875`: `annotations/card` at 370.96875, `H =
452.82421875`.

**Hidden cards and frames keep their place** (section 8.4): not drawn, but
their edges enter `Wb` and `Hb`, a hidden card's shadow does not, and every
other element stays as it is.

- `bare` with `{element: card} display none`: `Wb = 474.5771484375`, `Hb =
  65.37890625`; the card's range `[1, 7)`, its 6 elements.
- `group_child_member` with `{element: card} display none`: the frame still
  sets `W` and `H`; the cards' ranges `[3, 15)` and `[15, 21)`, the frame's
  `[1, 21)`.
- `group_child_member` with `{element: group} display none`: `xn = 24`, the
  cards at `x = 16`, `W` and `H` from the frame's edges; the title moves to
  1, the cards `[2, 15)` and `[15, 22)`, the frame `[1, 22)`.

**The box size.** `W = max(Wb, width)`, `H = max(Hb, height)`: `bare` at
600 and 100 gives 600 and 100, every other element unchanged; at 300 and 20
it gives `Wb` and `Hb`; at 600 and null `H = Hb`. The box padding `P` does
not stretch: `bare` at `spacing` 2 keeps its card at `y = 8`, `Hm =
65.37890625`, `H = 83.37890625`.

**Addresses (section 2.2).** `corpus_mpm`'s map `tmap_1` is
`score:clt_1/tmap_1`; a region added into the member `second-half` of
`group_child_member` is `piece/region_1`, its label `piece/region_1/label`.
The cards are `M/card`, a member's wedges `M/start` and `M/end`, on its own
line and as marks on its ancestors'.

**Cards and frames in the tree (sections 2.1 and 8.1).** A card belongs to
its timeline and has its domain: `{element: card, domain: physical} fill
#ABCDEF` fills `recording/card` and not `second-half/card`. A card holds
nothing: `{inside: card} stroke #123456` reaches no element. With layers
holding no defaults (`groups.test.ts`):

1. **The frame holds its title, cards and its members' lines.** With `{element:
   group} {stroke: #123456, font-size: 13}`, `group_child_member`'s members'
   lines, the title `group_1/name` and the cards take the frame's stroke and
   font size; the ancestor line `piece` takes them from its member, and
   `piece/name` from the ancestor. With `{ids: [second-half]} {stroke:
   #654321}` instead, `piece` is `#654321` and `recording` keeps `none`; so
   does `second-half/card`, a sibling of the line.
2. **The block holds the manifest's title, the frames and the box-held cards
   and lines.** With `{element: block} {stroke: #111111}` on `bundle_mixed`,
   `name`, `group_1`, `annotations/card` and `annotations` take `#111111`;
   with `{ids: [annotations/card]} {stroke: #222222}` the line
   `annotations` keeps `none`.

## Places (`places.test.ts`)

Sections 1, 8.4 and 8.6: every item applies the box's one horizontal layout
at its own place, and the box grows in every direction to hold the items.
An item is laid out in item coordinates and each position `u` drawn at `x +
u`; its default `y` lies `F` below the largest bottom edge before it (its
requested height included, no shadow), summed in place coordinates; `Xl =
min(0, smallest x − P)`, `Yt = min(0, smallest y − Pt)`, `Pt = P + h(s) +
F` under a displayed title and `P` otherwise; the place origin `(0 − Xl, 0
− Yt)`, so a zero origin is `+0`, is added to every finished position last;
the title lies at `(Xl + P, (Yt + P) + a(s))`; `Wb = (P + largest right
edge) − Xl`, `Hb = (P + largest bottom edge) − Yt`, shadows and the title
included. The fixtures `bundle_mixed__places` and
`bundle_ungrouped__places` pin the drawn elements; here the records' places
and the sums are proved, two of them with a fractional origin that tells
the order of the sums apart.

- **Defaults reproduce the stacked box.** `bare`'s records: the box `{0, 0,
  476.5771484375, 67.37890625}` `[0, 8)` and its card at `(8, 8)`,
  `458.5771484375 × 49.37890625`, `[1, 8)`, its place `{8, 8, 400, 1, 1,
  458.5771484375, 49.37890625}` (as `{x, y, length, scale, spacing, width,
  height}`) stated `{}`; the origin `(+0, +0)`. `group_child_member`'s
  frame `{8, 8, 400, 1, 1, 542.4140625, 174.13671875}`, `[1, 23)`. Stating
  the defaults (`{bare: {x: 8, y: 8, length: 400}}`) draws the same; only
  `stated` changes.
- **The default `y`** in `bundle_ungrouped` (heights `pages` 63.453125,
  `recording` 49.4765625): `recording` at `28.8046875 + 63.453125 + 8 =
  100.2578125`, `score` at 157.734375; with `{pages: {height: 100}}` at
  136.8046875 and 194.28125.
- **`bundle_mixed__places`** (`{group_2: {x: 40, y: 200, width: 700},
  annotations: {x: −30, length: 300}}`): the items in drawing order with
  their stated places; `group_2`'s request gives `Ri = 700 − K − Q = 684`,
  the frame exactly 700 wide; `annotations` at `L = 300`, its default `y`
  `max(28.8046875 + 169.234375, 200 + 177.734375) + 8 = 385.734375`, its
  card `418.29150390625 + 28.193115234375 + 16 = 462.484619140625` wide;
  origin `(38, 0)`, `Wb = (8 + 740) + 38 = 786`, `Hb = 467.58984375`. Every
  item's lines start at the box's one start, each at its own length.
- **`bundle_ungrouped__places`** (`{score: {x: −60, y: −150, height:
  120}}`; no frame, `s0 = 71.70361328125`, every card 507.896728515625
  wide, `score` 84.4296875 high on its own and 120 by request): origin
  `(68, 178.8046875)`, the title pushed up with the box's top to `(8,
  18.21044921875)`, `score/card` at `(8, 28.8046875)`, `W =
  593.896728515625`, `H = 338.5390625`; the other items keep their default
  places.
- **A frame's own length and height request, a card's width request**
  (`bundle_mixed` at `{group_1: {length: 300, height: 200}, annotations:
  {width: 600}}`): `group_1`'s lines end at 426.29150390625, the frame `{8,
  28.8046875, 462.484619140625, 200}`; `group_2` at 236.8046875;
  `annotations/card` at 422.5390625, `Ri = 600 − K − Q = 584`, exactly 600
  wide (without the inset `Q` it would be 608); `W = 618`, `H =
  504.39453125`.
- **A fractional origin: the shift is added last.** `bundle_ungrouped` at
  `{score: {x: −60.33, y: −150.33, height: 120}}`: origin `(68.33,
  179.1346875)`, every card keeps 507.896728515625 (laid out from the
  shifted `x` it would be 507.89672851562506), `recording`'s line at
  293.89250000000004, `Wb = 594.226728515625`, `Hb = 338.86906250000004`.
  `bundle_mixed` at `{group_1: {y: 10.11}, annotations: {x: 560, y:
  −40.1}}`: `Oy = 68.9046875`, `group_2`'s default `y` `(10.11 + 169.234375)
  + 8 = 187.344375` in place coordinates, drawn at 256.24906250000004
  (256.2490625 if summed after the shift).

## One layout, scales, card sizes and stretches (`items.test.ts`)

Sections 8.2, 8.4 and 8.6: the name column, the start and the right margin
are found once over every item; an item's scale scales every position and
length about its top left corner and nothing else; a member's card request
widens and heightens that card and its frame; a member drawing's vertical
stretch is the product of the placement's, its item's and its card's
`spacing`. The records report what was stated and what was drawn, in item
coordinates. `bundle_ungrouped`'s quantities are those of "Places".

- **One layout.** `bundle_ungrouped` without `score`: `pages` takes the
  widest name and the margin from `recording`, its line from
  79.70361328125, its card 507.896728515625 wide; `W = 525.896728515625`,
  `H = 159.734375`. Two items of one length are equally wide wherever they
  lie (`{recording: {x: 100}}`: from 171.70361328125); a stated length
  keeps the shared name column (`{recording: {length: 200}}`: the card
  307.896728515625 wide).
- **The title in its slot.** `{pages: {y: 20}}`: `Oy = 8.8046875`, the
  title's baseline 18.21044921875, the items at 20, 91.453125 and
  148.9296875 in place coordinates, `H = 252.1640625`.
- **Scale.** `bare` at `{bare: {scale: 2}}`: the card `{8, 8,
  917.154296875, 98.7578125}`, its shadow offset 4, stroke 1.5, `rx` 10;
  the name at `x = 24`, baseline 44.4208984375, size 22; the wedge at
  91.154296875 from 39.8046875 to 65.8046875, base 12; the line to
  891.154296875 at width 6; `W = 937.154296875`, `H = 118.7578125`; the
  place `{8, 8, 400, 2, 1, 458.5771484375, 49.37890625}`, its size before
  the scale. `bundle_ungrouped` at `{recording: {scale: 1.5}}`: `score`'s
  default top `(100.2578125 + 1.5 × 49.4765625) + 8 = 182.47265625`, the
  dash `4.5 4.5`, the name size 16.5.
- **A member's card size** (`group_child_member`, `{recording: {width:
  650, height: 120}}`): `recording/card` `{16, 124.7578125, 650, 120}`, the
  frame `{8, 8, 666, 244.7578125}`, `W = 682`, `H = 260.7578125`; the
  cards' records `second-half` `{526.4140625, 83.953125}` `[3, 16)`,
  `recording` `{650, 120}` stated `{width: 650, height: 120}` `[16, 23)`. A
  member's entry is read for `width`, `height` and `spacing` alone; a
  request no larger than the card changes nothing; under the group's scale
  2 the card is drawn 1300 wide and its record keeps `{650, 49.37890625}`.
- **Vertical stretch** (`v` the placement's `spacing` times its item's, for
  a member times its card's too): the padding `P v`, the gaps `B = 4 v` and
  the pitch `max(14 v, h(s))` stretch; the markers and conversion maps bands
  at level ±1 and every horizontal quantity do not. A box-held card at
  spacing 2 (`bundle_ungrouped`, `recording`): `Hm = (16 + 6.5) +
  26.9765625 + 16 = 65.4765625`, the card at 100.2578125, its line at
  122.7578125, `score` at 173.734375, `H = 268.1640625`; its record's place
  and card carry `spacing` 2. A member at 1.5 under a frame at 2
  (`group_child_member`): `second-half` at `v = 2`, `Hm = 113.953125`, its
  line at 103.78125, `piece`'s at 75.78125; `recording` at `v = 3`, `Hm =
  81.37890625`, its line at 185.16015625; the frame 236.13671875 high, its
  `spacing` 2, the cards' 1 and 1.5. The placement's spacing 1.5 under a
  frame at 2 gives both members `v = 3`: heights 143.953125 and
  81.37890625, the cards' `spacing` 1, the frame's 2.

## Container records and axes (`records.test.ts`)

A band's record says where the band lies, from the band layout of section
6.4, and which card holds it; every drawn line has an axis whose ends are
its semantic start and end; `coordinateAt` reads a position exactly.

**Bands.** A band record `T/<kind>_1` carries its timeline, kind, signed
level, `line` (the ordinate of its timeline's line), `elements` (the
displayed elements it holds directly, no label), its holder (the card of
the member drawing its line lies in) and its rectangle: from its start `c`
to its outer edge `E` beyond the line `yl`, along its timeline's extent
from `x0 + a` to `x0 + b`, drawn as its card is. A band draws nothing: no
element's address is a band's, and its range is empty, at its card's end.

| case | records |
|---|---|
| `styled__score` (`x = 89.951171875`, width 416.2578125, `line` 62.640625) | `children_1` level 2, 1 element, `y` 16, 14 high; `markers_1` 1, 2, 34, 28.640625; `conversion_maps_1` −1, 1, 62.640625, 7; `regions_1` −2, 1, 73.640625, 19.640625; `flow_control_1` −3, 1, 97.28125, 21.640625 |
| `r` with the child `c` and its region, defaults | `r/children_1` 1, 1, `y` 16, 14; `r/markers_1` −1, 2, 37, 26.9765625; `line` 37, `x` 22.6318359375, width 414.83203125 |
| the same with `c/regions_1` shown | `r`'s at `line` 53.9765625, the children band 30.9765625 high; `c/regions_1` −1, 1, held by `r/card`, `x` 130.0478515625, `y` 28.5, 200 × 18.4765625, `line` 23 |
| the same, `r` hidden | none: a hidden line hides its timeline's whole drawing; the card 16 × 28.8046875 alone, the box 34 × 46.8046875 |
| the same at `{r: {x: −12, y: −20, scale: 2}}` | origin `(20, 28)`; `c/regions_1` at `x` 252.095703125, `y` 49, 400 × 36.953125, `line` 38 |
| `unknown_length_segments`, regions shown (`x` 42.42431640625, width 435.916015625, `line` 24) | `form/markers_1` −1, 1, `y` 24, 26.9765625; `form/regions_1` −2, 2 (its segments' regions), 54.9765625, 18.4765625 |
| `r` with an unlabelled break | `r/flow_control_1` −2, 1, `y` 53.37890625, 0 high |

**Core's listing.** Over every manifest fixture, the box, frame and card
records carry core's kind, address and holder in core's order, displayed
or hidden; each drawn band is recorded once with core's address and holder,
except a timeline drawn twice (below), whose second set the card drawing it
holds.

**A timeline drawn twice.** `with_region` with the map `tempo` on `clt_2`
and the groups `g1 {clt_1}` and `g2 {clt_2}` (written onto the built
manifest, since no command adds a group, and validated): `clt_2` is a child
line in `clt_1/card` and the root of `clt_2/card`. Its `conversion_maps_1`
is recorded twice under one address, at `line` 61.8046875 held by
`clt_1/card` (`x` `8 + (73.91552734375 + 400 × u(1/3)) =
93.02663845486111`, width 133.33333333333331) and at 226.5390625 held by
`clt_2/card` (`x` 74.49951171875, width 414.83203125), both 6.5 high.

**Axes.** `Drawing.axes` holds one `DrawnAxis` per line element, in their
order, at the line's ordinate. A timeline's or child's axis runs from
`Xs`, its zero, to `Xe`, its end on its own axis (its length, or for a
segment the end the next segment or its segment line gives it, section
3.4): `xStart` and `xEnd` are the line element's `xs` and `xe` when the end
is known; the end mark, a diamond's stop and chevrons are no part of it. An
open end is not known: `end` is null and `xEnd` is the reach's `x0 + L`
(`unknown_length_segments`: 49.84033203125 to 449.84033203125, the line
drawn on to 461.84033203125). An ancestor's axis is clipped to the member,
from `x0` (not the chevrons' start) to the member's end `x0 + L` or the
ancestor's own end short of it, with the ancestor's coordinates there:
`piece` over `second-half` in `group_child_member` from 8 to 16 quarters,
`recording` over `excerpt` in `bundle_mixed` from 44100 to 132300 samples,
running on. Each axis lists the maps of its own timeline that the member
drawing displays: in `bundle_mixed` `score` `cmap_1` and `cmap_2`,
`performance`, `page` `cmap_1`, `excerpt` `cmap_2`, none for the ancestor
`recording`, whose line draws no map.

**`coordinateAt(axis, x)`** is `start + (x − xStart) / (xEnd − xStart) ×
(end − start)`, every double read as its exact value, computed exactly and
rounded once into the axis's number type (a fraction kept, an int to the
nearest integer with ties to even, a float to the nearest double); null
outside `[xStart, xEnd]` and where the end is not known. On
`styled__score`'s fraction axis `score` (0 to 8 quarters) it gives 0, 8
and 4 at `xStart`, `xEnd` and their midpoint (both multiples of 2⁻⁹); on
`discrete_logical`'s int axis `dlt_1` (0 to 480 ticks) 0, 480 and 240. Over
`[0, 3]`: from 0 to 1 a fraction axis gives 1/3 at 1; an int axis gives 0
at 1.5 (1/2, ties to even), 1 at 2.25 and 0 at 0.75, and from 0 to 3, 2 at
1.5 (3/2); a float axis from 0 to 0.1 gives 0.1 at 3; −0.5 and 3.5 give
null.

## First fit (`properties.test.ts`, fast-check)

For generated manifests (a root of length 1 to 64 quarters with 1 to 8
children of random offset and length inside it, built through `add`
commands), no two wedge labels on one baseline, which the markers band's
first fit placed in one tier, have conflicting extents `[x − wi/2 − 1, x +
wi/2 + 1]`, `wi` the label's width (section 6.3), and no two child lines at
one ordinate, which one children band's first fit placed in one row, have
conflicting drawn extents `[Xs, Xe]`.

## Redraw operation counts (`scale.test.ts`)

A synthetic manifest has exactly 1,000 element keys, as core enumerates
them: one root, 60 children with maps, regions, markers, breaks and a jump,
and a segment line of 40 segments. Every count comes from the inputs a
draw is given, never from watching the code: each statement counts reads
of its selector, the font the code points asked, the manifest listings of
its keys. The statement with no element, class or id is tested exactly
1,000 times, so each key is resolved once; three whose id, class or element
no key has, 0 times; one per drawn address as often as core lists keys
there. The font is read 203 times, the code points of the eleven distinct
texts as a multiset; the manifest's keys are listed 0 times, so a draw
copies nothing. No count is a timing.
