# `@timetoalign/tilie-layout` tests

`draw(manifest, placement, layers, metrics)` returns the drawing of one
TimeToShare manifest as TimeToShare's drawing specification defines it
(`docs/drawing.md` in the TimeToShare repository, "the specification"
below: sections 1 to 6 for each timeline drawn as a root, section 8 for the
block that holds them). The tests prove it from the specification, never from
the code's own output: every expected number is derived by hand from the
specification's formulas and the fonts' advance widths, and the arithmetic
is written out below. The drawing fixtures of the schema package, byte-equal
in the writers' tests, are the serialisation oracle; core is the oracle for
manifest facts (element keys, ancestry, member drawings). Manifests are
loaded from the schema package's fixtures or built through core's commands;
only the groups of one records case and the synthetic manifests of the
operation-count tests are written by hand. The specification marks no
timeline's start or end of its own: every root of the schema package's
non-corpus fixtures carries the named timestamps an editor gives a new
root, `origin` at 0 and `length` at its length (none for an unknown
length), each drawing its wedge and its coordinate label, and a manifest
built through commands starts from a root that carries them too (`bare`'s,
moved to the new root and its length); the corpus fixtures carry none. The
defaults show every ancestor card (section 8.8), which takes no room but
moves the origin: a test whose subject is not the ancestor card (the
ancestor lines, the block, places, items, records, unknown lengths) draws a
group with a child member with the application layer
`HIDDEN_ANCESTOR_CARDS` (`{element: ancestor_card}` `display: none`), so
its numbers, derived without the cards, stand; that the layer removes the
cards and moves nothing else is proven under "Ancestor cards". The metrics table of the two fonts
is the schema package's. All comparisons are exact (`toBe`, `toEqual`); no tolerance
anywhere.

"The default layers" means `[DEFAULT_LAYER]`, plus `manifestLayer` of the
manifest when it has a `graphical` block (its `styles` and `rules`,
without its `order`); an "extra layer" is an application's layer, placed
between the two, since no layer lies above the manifest's own. "The default
placement" is `DEFAULT_PLACEMENT`, `{length: 400, spacing: 8, width: null,
height: null, places: {}}`. Every container has its own spacing, the gap
between its direct contents, and none multiplies another (section 8.6):
the block's, the placement's `spacing` (default 8), between its items at
their default `y`; a frame's, its group's entry of `places` (default 8),
between its cards; a card's, the card spacing `S` of its member drawing,
the entry of `places` of an ungrouped root, or of a member under its
group's entry's `cards` (default 4), between its rows and between its
bands. `places` is keyed by group ID and ungrouped root ID; a member's card
lies at `places[G].cards[T]`, never under a key composed of both. A
timeline's band order is its entry of the manifest's `graphical.order`
(section 6.4), a permutation of `line` and the five facets, set through
core's `set` of the property `order` and written `[above] | [below]`: the
facets above `line` from the top down, then those below; a child without an
entry follows its parent's band order verbatim.

Every timeline drawn with a line of its own has its five bands at its own
line (section 6.4). By the default band order (section 4) the conversion
maps band lies above its line at level 1 and the children band beyond it,
and the markers, regions and flow control bands lie below, in that order;
the defaults hide the regions and flow control bands of every timeline but
a member drawing's root, and show every markers band, which draws nothing
but on a timeline with a named timestamp. Only a present
band has a level and
takes room. The band at level 1 or −1 starts at `c = 0` when it is the
markers or the conversion maps band, and otherwise `S` beyond the larger of
the line's reach on its side and `w / 2`: at `1.5 + 4 = 5.5` for a line of
width 3 that reaches nothing there. A children band starts no nearer than
`pl / 2`, half the pitch `max(10 + S, h(s))` of the row its line lies in,
so with no map it starts at `14 / 2 = 7`.

Addresses follow section 2.2: an address is an object `{id?, facet?,
part?}`, built as an object and compared as a whole, never a string
composed from IDs. Every element with an ID, a timeline, a group, a map, a
region or a flow-control element, at any depth, is `{id}` by its whole ID
alone (`map`'s map `tempo` is `{id: "tempo"}`); a part of an element appends
part words, `{id: "timestamp_1", part: ["coordinate"]}` for the coordinate
label of `bare`'s named timestamp `timestamp_1`, `{id: T, part: ["name"]}`
for a timeline's or group's name; every card of `T` is
`{id: T, part: ["card"]}`, with no group in it; the band drawing the facet
`F` of `T` is `{id: T, facet: F}`; the manifest's title is `{part:
["name"]}` and the block `{}`. The prose names elements in words (`bare`'s
card, the coordinate label of `origin`); selectors and expectations use the
whole address. A container record's `key` and `holder` are place keys,
`{item: G}` for the frame of `G`, `{item: G, member: T}` for the card of `T`
in it and `{item: T}` for an ungrouped root's card. The fixtures' minimal
twins (`*.minimal.yaml`) draw as their complete fixtures do and are left out
of every list of fixtures.

## Font measures (`metrics.test.ts`)

Hand-summed strings prove the width, ascent, descent and line-height
formulas (`0 ♩` at 9 is 12.83203125, `h(9) = 10.4765625`, `h(11) =
12.8046875`); the one table holds 6,467 advances, DejaVu Sans's and those
of Noto Music for what DejaVu Sans does not map from U+0020 up, so the whole note `𝅝`
(U+1D15D), which only Noto Music draws, measures its own advance (1053 at
size 2048) and is not listed; a code point neither font maps (U+4E00,
U+E000) counts the fallback advance and is listed; a control character
becomes a space. Font metrics that record every
read of the advance table prove that a text is read once whatever its
sizes, and that cutting `AAAA` to width 20 at size 9 reads the text and the
ellipsis once each and returns `A…` with the width measuring it gives,
15.15673828125. Every name and label of every manifest fixture has the
width of the formula.

## The default layer (`defaults.test.ts`)

The oracle is the JSON block of section 4, parsed from the installed schema
package's `docs/drawing.md`: `DEFAULT_LAYER` equals it. That file is the
copy of the TimeToShare repository's `docs/drawing.md` which the schema
package's `pnpm build` puts into the package (`js/docs/`, not tracked); an
edit of the repository's specification reaches this test and that of
the constants below only after that build; until then both compare with
the text built last. Resolved alone, the default layer
gives `bare`'s block and card their fill, stroke, `rx` and shadow; in
`group_child_member` the frame its own, the ancestor line `piece`, its marks
and their labels opacity 0.35, its name grey at size 9 and not faded, while
`piece`'s ancestor card, drawn first, draws `piece`'s line, its name (black,
11) and `second-half`'s name and its `origin` and `length` wedges and labels
unfaded, each address so drawn twice. It
hides exactly the regions and flow control bands of every timeline held by
a band (`with_region`'s `clt_2` and `clt_3`, `unknown_length_segments`'
`a`, `b` and `c`, `timestamps`' `clt_2`, and `group_child_member`'s
`second-half` as the child row it is in `piece`'s ancestor card) and no
band of a member drawing's root, a member that is a child included: every
markers band is shown, so every named timestamp stays visible. It shows
every ancestor card (section 8.8): no rule of it sets `display`. It hides
every wedge and label of a secondary coordinate and turns its wedge −45
(the last rule, `{coordinates: secondary}`), and keeps at opacity 1 the
cross-section line and the primary wedge and labels of a timestamp named
on an ancestor line (the two rules after the fading `{inside: ancestor}`,
each outranking it by naming `element` or `coordinates`).

## The constants (`defaults.test.ts`)

The oracle is the specification's own text, read from the installed schema
package's `docs/drawing.md`, as the default layer is. The table of section
6.2 is parsed row by row (its first cell the constant's description, its
second the value in canvas units); the test lists every row it expects and
fails on a row added, renamed or removed. Each row's value is compared, as
text, with the text the layout's constants give it:

- a fixed size is the constant itself: `P`, `G`, `d`, `g`, the wedge's base
  and height (one row, `6, 13`), the label gap, the brace height, the
  flow-marker label offset, `k`, `Q`, `K`, `F`, the gap after a frame's
  title and the card shadow offset; `g` is also `1.5 × d`, as its row says;
- a size depending on the card spacing is the formula of its row with the
  fixed parts the constants hold: the row pitch `max(10 + S, h(s))`, the
  region row pitch `6 + 2 + h(9) + S` (the brace height and the label gap),
  the first jump depth `4 + S` and the jump row pitch `6 + S + h(9)`; the
  gap between bands is `S` itself;
- the label separation, 2, has no constant: it is the width of the extent
  section 6.3 gives a label of width 0 (`[L × u − wi / 2 − 1, L × u + wi /
  2 + 1]`).

Three numbers the constants hold are stated outside the table, each read
from its sentence: the card spacing `S`'s default, 4 ("With the default `S
= 4`", section 6.2), and the frame's, 8 ("`spacing`: 8 for a frame, 4 for a
card", section 8.6, which states the card's 4 again); and the initial
`rotation`, 0, the last of section 2.5's initial values ("`max-width`
`none`, `rotation` 0."): no wedge has another initial rotation, a
secondary coordinate's −45 being a default rule's (section 4).

## The cascade (`cascade.test.ts`)

One key, the child `c` of a root `r`, exercises the eight ranks of section
5 in order, each rule against the next lower one: layer, `addresses`,
depth of `within`, class, element, `inside`, the count of domain and
modality, then rule order; `facet` ranks exactly where class does (on
the regions band of `c`, `{facet: regions}` outranks `{element: band,
inside: child}` and is outranked by `{within: c}`), and so does
`coordinates` (on the wedge of a primary coordinate in `c`'s markers band,
`{coordinates: primary}` outranks `{element: wedge, inside: band}` and is
outranked by `{within: c}`; of it and `{class: …}`, both of rank 4, the
one naming `element` too wins wherever it stands; `{coordinates:
secondary}` sets nothing on that wedge). A missing named style
sets nothing, a `within` outside the manifest matches nothing, and the
block is never matched by domain, class, facet, an element's address or
`within`. Recording which rules the cascade tests proves that it tests
only the general rules and those of the key's element, class, facet
and address, in layer order: a line's key tests no rule selecting a
facet, and the regions band of `c` tests those selecting `band`, the facet
`regions` and the address `{id: c, facet: regions}`, never the line's
`{id: c}`. On the regions bands of `c` and `r`, each selector field matches
as section 5 says, and a timeline's address `{id: c}` matches none of its
bands. Drawings prove the holder chain: a band
passes its timeline's style through to what it holds; a band's `display:
none` hides what it holds, its children's bands included, and nothing of
another timeline; an address drawn twice matches `inside` by each drawing's
own holders. Inheritance is a column of the property table: stroke,
stroke-width, stroke-dasharray, fill and font-size inherit (a root's stroke
reaches its grandchild, a region's font size its label), never `shadow`,
`opacity`, `rx` or `rotation`. `rotation` is set by a rule alone: a wedge
no rule turns reads it as its initial value, 0 (section 2.5), a
groupstamp's too, and carries that number in its style; every other
element keeps it unset (`null`). So, without layers, every element of
`with_region` has the initial values but its wedges, whose `rotation` is
0; in `groups/group_groupstamp` every wedge, the groupstamp
`timestamp_1`'s included, has 0; an extra layer's rule `{element: wedge}`
setting 0 gives `timestamp_1`'s wedge 0, one setting 30 gives every wedge
30; a rule setting 30 on `score`'s markers band (`{id: score, facet:
markers}`) turns none of the wedges it holds. A map is drawn in the domain and modality it
converts to (`conversion_maps__maps_quarters`: the top-level LinearMap
`lmap_5` to seconds physical and continuous, the FloatingMeasureMap
`tmap_1` logical and continuous; `conversion_maps__maps_seconds`: the
LinearMap `cmap_1` to samples physical and discrete), a map converting to
no time axis (the ConstantMap `cmap_8`) taking its timeline's stroke, with
its type as class (`ConstantMap` matches `cmap_8` alone). For every manifest fixture, every
drawn element's address and type, the block's `{}` included, are among the
element keys core enumerates, and no address is drawn more often than core
enumerates it. A drawing is one element, but for the pieces of a
cross-section line: the up to two pieces in one card, on either side of
its gap, are one drawing of that card, and the pieces a groupstamp's line
is drawn in across a frame lie in no card (outside every card's range of
elements), and those inside one frame's box are one drawing of that
frame, which core enumerates once (held by the frame) beside the
timestamp's own line in its card; the pieces themselves are counted under
"Groupstamps". Without core's frame keys `groups/group_groupstamp` fails:
`timestamp_1`'s line is drawn twice (its own line in `score`'s card and
`group_1`'s pieces). A test of one address drawn twice without the
default layer hides the secondary coordinates by a rule of its own
(`{coordinates: secondary}`, `display: none`), so that it compares the
primary ones, which the defaults alone show.

## Hand-derived drawings (`examples.test.ts`)

The manifests below are drawn at the default placement with the default
layers, and every element's geometry, text and coordinate is compared. Each
is an anonymous block with one ungrouped root in its card (section 8, "The
block" below): the name column starts at `xn = P + K = 16`, the card's top
lies at `P = 8`, so the root's line lies at `8 + y_root`; the card spans `P`
to `R + K` and is `Hm = Hc` high, and its shadow, 2 further right and down,
sets the block: `W = 8 + (R + K + 2)` and `H = 8 + (8 + Hm + 2)`.

Common values: `P = 8`, `G' = 8`, the card spacing `S = 4`, `h(9) = 10.4765625`,
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
line lies at 22.40234375; below, the markers band holds the wedges and
coordinate labels of `bare`'s named timestamps `origin` (`timestamp_1`, at
0) and `length` (`timestamp_2`, at 8), each `[wedge, coordinate]`, one
line of labels, `Eb = 26.9765625`, `Hc = 14.40234375 + 26.9765625 + 8 = 49.37890625`. Wedges:
tip 23.90234375, base 36.90234375. Labels' baseline `(22.40234375 + 16.5) +
8.35400390625 = 47.25634765625`. Name baseline `22.40234375 + 3.80810546875
= 26.21044921875`. The rightmost drawn point is the arrowhead tip `R =
458.5771484375` (the `8 ♩` label reaches only 455.9931640625), so the card
is `{8, 8, 458.5771484375, 49.37890625}`, `W = 476.5771484375` and `H =
67.37890625`. The elements are, in order: the block, `bare`'s card, its
line, the wedges of `timestamp_1` and `timestamp_2`, its name, the
coordinate label of `timestamp_1` (carrying 0 quarters) and of
`timestamp_2` (8 quarters). `unmapped` is empty. The default
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
66.9775390625`), `x0 = 90.9775390625`, `x(t) = x0 + 25 t`. Its flow
control holds the jump targets `jump_to_1` at 2 and `jump_to_2` at 4, which
draw nothing, the jump origin `jump_from_1` (label `Repeat`) from 8 to
`jump_to_1`, the flow marker `flow_marker_1` (label `Fine`) at 12 and the jump
origin `jump_from_2` (label `D.S.`) from 16 to `jump_to_2`, all below; the line
at 22.40234375 as in `bare`. The flow control band starts at `26.9765625 +
4 = 30.9765625` with one flow-marker label tier, so the flow row lies
41.453125 out, at `yf = 63.85546875`. By span, `jump_from_1` (6) is placed
before `jump_from_2` (12); their extents `[50, 200]` and `[100, 400]` (the
labels, `Repeat` 32.08447265625 and `D.S.` 18.36474609375 wide, lie
inside them) conflict, so `jump_from_1` takes jump row 1, its apex `30.9765625
+ 10.4765625 + 8 = 49.453125` out, and `jump_from_2` row 2, `pj = 6 + 4 +
10.4765625 = 20.4765625` further, 69.9296875 out. The band is `10.4765625
+ 8 + 20.4765625 + 2 + 10.4765625 = 51.4296875` wide, `Eb = 82.40625`,
`Hc = 14.40234375 + 82.40625 + 8 = 104.80859375`. The flow marker's line
runs at x 390.9775390625 from the flow row to `8 + P = 16`; its label
starts at 393.9775390625, baseline `yf − d(9) = 61.73291015625`.

Each jump has `w = 1`: the head 4 long and 2 half-wide. The head is
computed in item coordinates and drawn `8 +` each.

- `jump_from_1`: `Xf = 290.9775390625`, `Xt = 140.9775390625`, `q = (Xt − Xf) /
  4 = −37.5`; `ya = 71.85546875`; `yc = yf + 4/3 × (ya − yf) =
  74.52213541666667`, `C1 = (253.4775390625, yc)`, `C2 =
  (178.4775390625, yc)`; the head's axis `u = (−0.9618459163232351,
  −0.2735917273097203)` from `Xt − Cx = −37.5` and `yf − yc =
  −10.666666666666671`. `Bh = (144.82492272779294, 64.94983565923889)`,
  corners `(144.2777392731735, 66.87352749188534)` and
  `(145.37210618241238, 63.02614382659241)` (summed from the card's top
  first, their `y` would be 66.87352749188535 and 63.02614382659242). The
  label is centred at `x(5) = 215.9775390625`, baseline `8 + ((14.40234375
  + (49.453125 + 2)) + 8.35400390625) = 82.20947265625`.
- `jump_from_2`: `Xf = 490.9775390625`, `Xt = 190.9775390625`, `q = −75`; `ya =
  92.33203125`; `yc = 63.85546875 + 4/3 × 28.4765625 = 101.82421875`,
  `C1 = (415.9775390625, yc)`, `C2 = (265.9775390625, yc)`; `u =
  (−0.8921856025539521, −0.4516689612929382)` from `Xt − Cx = −75` and `yf
  − yc = −37.96875`, `ℓ = 84.06322606563764`. `Bh = (194.5462814727158,
  65.66214459517175)`, corners `(193.64294355012993, 67.44651580027966)`
  and `(195.44961939530168, 63.87777339006385)`. The label is centred at
  `x(10) = 340.9775390625`, baseline `8 + ((14.40234375 + (69.9296875 +
  2)) + 8.35400390625) = 102.68603515625`.

The shaft of each runs `(Xf, yf)`, `C1`, `C2` to `Bh`; the jump origins and
their labels follow the order of first fit, `jump_from_1` before `jump_from_2`. The
`16 ♩` label reaches `R = 500.256591796875`: `W = 518.256591796875`, `H =
8 + (8 + 104.80859375 + 2) = 122.80859375`.

### `map`

Root `melody` length 8 with map `tempo` (a LinearMap to seconds: physical,
continuous); child `phrase` at 2, length 4, with map `ticks` (a LinearMap
to ticks: logical, discrete). Maps have no names, so the widest
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
length 800 and card spacing 8 are compared element by element with member
drawings summed from sections 3 and 6. `styled__score`'s root carries its
markers band above at level 1, from 0 and `2 + 13 + 2 + h(10) =
28.640625` wide (the wedges and coordinate labels of its `origin` and
`length`, `timestamp_1` and `timestamp_2`), its children band beyond it from `max(28.640625 + S,
p0 / 2)`, its row `max(10 + S, h(11))` high; below, its map stack to 7,
the regions band from `7 + S`, `pr − S` wide with `pr = 6 + 2 + h(10) +
S`, and the flow control band `S` beyond it, `(4 + S) + 2 + h(10)` wide,
its jump's apex `4 + S` beyond the flow row; `y_root = 8 + Ea`, every
ordinate summed in item coordinates and drawn `8 +` it. Two card spacings
of `styled__score` (its card's entry of `places`) fix the order of the
sums, each where the other order gives another double: at 2.63 each
distance outwards is summed whole before it becomes an ordinate (the jump
label's baseline `(y_root + ((f0 + (4 + S)) + 2)) + a(10)` is
101.8881640625 in item coordinates, 101.88816406249998 summed outwards
step by step), at 0.7 each band's width is summed before its start is
added (`Eb = f + (4.7 + 2 + h(10)) = 46.381249999999994`, against 46.38125
added band by band, so `Hm` is 104.5265625, not 104.52656250000001). At
card spacing 8 `nested` has the pitch 18 and each children band starts at
`max(1.5 + 8, 9) = 9.5`: its lines at 62, 43.5 and 25, `Hm =
88.9765625`, as the drawing fixture `nested__length-800-card-spacing-8`
derives.
The one-line stacks of `bare`'s `origin` and `length` (their coordinate
labels `0 ♩` and `8 ♩`) share tier 1 when the extent of `length`'s starts
where `origin`'s ends (at length 14.83203125), and `length`'s goes to tier
2, `origin` placed first, when they overlap (at length 10). A timeline whose name is null is named by its whole id:
the root `piece:score` of a manifest built by command is named
`piece:score` (`A = 1300 + 569 + 1260 + 1126 + 1260 + 690 + 1067 + 1126 +
1253 + 842 + 1260 = 11753`, `N = 11753 × 11 / 2048 = 63.12646484375`), so
its line starts at `x0 = 16 + 63.12646484375 + 8 = 87.12646484375`.

## One timeline's bands (`timeline.test.ts`)

Each timeline of a member drawing is laid out alone and its bands compared
top to bottom as facet, level, start, width, outer edge and elements held
(a markers band counts its wedges and the labels of its named timestamps:
4 for a root with `origin` and `length`, 2 for one with `origin` alone),
against the band rules above: sides and levels by the band order (a child
without an entry following its parent's band order verbatim, a member that
is a child following its parent), and a side without a band has the line's reach
as its outer edge. A children band starts at the larger of the rule's start and half its
row's pitch (`map`'s `melody` at 10.5 for the pitch 14 and 15 for 30,
`segment_line`'s `form` at 24.4765625, `unknown_length_child`'s `score` at
7). Laid out alone, a line's conversion maps band takes the slots of its
own maps (section 6.4, Conversion maps, a row of one line); its width and
the line's reach come from those slots, never from the band before them.
The conversion maps band is the line's stack only at level ±1; a segment
line with boundaries reaches `k` both ways, its segment labels above only
(`b`: 20.4765625 above, 8 below). Segments without a line join their
displayed bands to their segment line's, after its own, in its band order.
An open end runs on `9.5w`; an extent holds the drawn labels and flow
markers' points. In `flow_control` the flow control band's extents are the
flow marker's point `[300, 300]` (`400 × 12/16`), its label `[300 + 3 − 1,
300 + 3 + 18.91845703125 + 1] = [302, 322.91845703125]`, and the jump
origins in placement order, `jump_from_1` `[50, 200]` and `jump_from_2` `[100,
400]`; the root's extent `[−7.416015625, 410.279052734375]` runs from its
`origin`'s coordinate label (`0 − 6.416015625 − 1`) to `length`'s (`400 +
9.279052734375 + 1`). A root's flow marker ends at the padding of the opposite side, any other
`max(E, h(s) / 2)` beyond its line (`child_flow_control`'s `verse` with a
map: 93.5).

## Stacks, band orders and rows (`stacks.test.ts`, `order.test.ts`, `rows.test.ts`)

Drawings of fixtures and of manifests built by command, each value summed
from sections 4 and 6.4:

- **Stacks.** A child's conversion maps band lies above its line by
  default, below by its own entry or its parent's, and towards the root when
  the child lies below the root. The markers band alone lies against the
  root's line, on the side the band order gives it. In
  `conversion_maps__maps_quarters` the twelve top-level maps (nested maps
  are not drawn), none named, take their slots by type (section 6.4,
  Conversion maps; code-point order `ChainMap`, `CombinationMap`,
  `ConstantMap`, `FloatingMeasureMap`, `LinearMap`, `MeasureBeatMap`,
  `MeasureNumberMap`, `MeasureRecordMap`, `PiecewiseMap`, `TableMap`), so
  `cmap_4` takes slot 1, `cmap_1` (the MeasureRecordMap) slot 8, and the
  three TableMaps `tmap_2` to `tmap_4`, which span one timeline and so
  conflict, the sub-slots 10 to 12 in canonical order; they lie against the
  line above: the stack reaches `1.5 + 12 × 5 = 61.5`, `y_root = 69.5`, the
  root at 77.5, `cmap_4` (`j = 1`, 5.5 out) at 72, `cmap_1` (`j = 8`, 40.5
  out) at 37, `tmap_4` (`j = 12`, 60.5 out) at 17, `Hc = 69.5 + 26.9765625
  + 8 = 104.4765625`, `H = 122.4765625`. The maps are still drawn in the
  order they are taken, canonical order, `cmap_1` first. With the markers
  band on that side, after the maps, the two lie `B` apart: nothing above,
  so the root at 22.40234375, `cmap_1` at 62.90234375 and `tmap_4` at
  82.90234375; the markers band from `61.5 + 4
  = 65.5`, the wedges from `65.5 + 1.5 = 67` to 80 out (89.40234375 to
  102.40234375), `Eb = 65.5 + 26.9765625 = 92.4765625`, `Hc = 114.87890625`,
  `H = 132.87890625`. Ordered after it the maps lie beyond it and the line
  has no stack.
- **The end mark.** `r` (length 8) ends in the arrowhead unlocked (`xe`
  430.0478515625, `W = 457.0478515625`) and the circle locked (`W =
  454.4638671875`); its child `c` ends in the diamond whatever its `locked`.
- **Band orders.** A band moved across its line moves everything it holds;
  a child's band order follows its parent's verbatim without an entry,
  is its own entry when it has one, and returns to its parent's when the
  entry is set to null. An entry listing a subset of the facets draws what
  its completed order draws (core's rule: an omitted facet keeps its side
  of the line and lies beyond the stated ones): the fixture
  `map_band_order_subset`, whose root `melody` states `[markers, line]`,
  draws every element exactly as `map` does with `melody`'s entry set to
  the whole order `[children, conversion_maps, markers, line, regions,
  flow_control]`, and not as `map` draws without an entry (its markers
  band lies above the line). A flow marker runs from its flow row across its line, the
  root's to the padding, a child's to `max(E, h(s) / 2)` beyond it. In
  `flow_control` both jump origins and the flow marker move with their
  band. With the flow control band moved above the line, next to it, it
  lies at level 1 from `1.5 + 4 = 5.5` (no map, so no stack): the flow row
  `5.5 + 10.4765625 = 15.9765625` out, the band `51.4296875` wide as below
  the line (two jump rows), `Ea = 56.9296875`, `y_root = 64.9296875`, `Hc =
  64.9296875 + 26.9765625 + 8 = 99.90625` and `H = 8 + (8 + 99.90625 + 2)
  = 117.90625`. Drawn `8 +` each: the root's line at 72.9296875, the flow
  row at `8 + (64.9296875 − 15.9765625) = 56.953125`, where `jump_from_1`
  starts at `x(8) = 290.9775390625`; the flow marker from there down to the
  bottom padding `8 + (Hc − P) = 99.90625`, its label at 393.9775390625
  with its baseline `yf + a(9)`, `8 + (48.953125 + 8.35400390625) =
  65.30712890625`.
- **Rows.** In `joint_rows` the children bands of each row's lines are laid
  out together at two depths, one name per row, at the size of the
  hand-derived figure. A row takes the room of the children bands on both
  sides of its lines, one name size and pitch for every row of a joint
  layout; a hidden child takes no room; a joint row mixing segment lines
  and a child counts the child's name alone, and its pitch.

## Conversion map slots (`slots.test.ts`)

Section 6.4, Conversion maps: the present conversion maps bands of the
lines of one row on one side at one level share one sequence of slots.
What proves it is a drawing in which the slot a map takes differs from the
place it would take in a stack of its own line alone: maps of one key on
two lines of a row at one height although their lines hold them in a
different order; the same row split in two by a first fit, which then
draws the same map one slot lower; and a common start that only another
line of the row explains. The maps are LinearMaps added by command, named
where a name is given, so every map of these manifests has one type and the
key is the name. Each map is centred `c0 + w / 2 + j × (g + d) − d / 2`
from its line, `g + d = 3 + 2 = 5`, so with `c0 = 0` and `w = 3` slot 1 lies
5.5 out, slot 2 10.5, slot 3 15.5, slot 4 20.5 and slot 5 25.5; `J` slots
make every band of the set `e = 1.5 + J × 5` wide. Children are 3 wide and
their names 11 high, so a row's pitch is 14 and each half at least 7; the
root's children band starts at `max(1.5 + 4, 7) = 7`; a drawn ordinate is
`8 +` the card's, the card's line `8 +` its own (`y_root = P + Ea`, `Ea`
above `h(11) / 2`).

- **Siblings.** `r` (length 8) holds `ante` at 0 and `cons` at 4, each 4
  long, extents `[0, 200]` and `[200, 400]`: one row. `ante` holds
  `a_ticks` (named Ticks) and `b_tempo` (Tempo), `cons` `a_tempo` (Tempo)
  and `b_ticks` (Ticks). Keys in order Tempo, Ticks; each key's two maps
  span timelines that only meet, so they share one sub-slot: Tempo slot 1,
  Ticks slot 2 on both lines, `J = 2`, `e = 11.5`, although `ante` takes
  Ticks first. The row's outer half is 11.5, `Ea = 7 + 7 + 11.5 = 25.5`:
  `r` at 41.5, both children at `41.5 − 14 = 27.5`, the Tempo maps at 22,
  the Ticks maps at 17, `H = 86.4765625` (as `r` with one child of two
  maps). Maps are drawn in the order they are taken: `a_ticks`, `b_tempo`,
  `a_tempo`, `b_ticks`.
- **The widest stroke.** The same with `ante`'s line 5 wide: `w = 5` for
  both bands, slot 1 at `2.5 + 5 − 1 = 6.5`, slot 2 at 11.5, `e = 12.5`;
  `Ea = 26.5`, `r` at 42.5, the children at 28.5, the Tempo maps at 22 and
  the Ticks maps at 17 on both lines.
- **A first fit moves a line.** `ante` (0 to 4) holds Tempo and Ticks,
  `cons` Ticks alone. With `cons` at 4 the row holds both: `cons`'s Ticks
  shares slot 2 at 17, `J = 2` and the drawing is the siblings' (`r` at
  41.5, the children at 27.5, `ante`'s Tempo at 22). With `cons` at 3 (to
  7) its extent `[150, 350]` conflicts with `ante`'s and the first fit puts
  it in row 2: row 1 has `J = 2` (outer half 11.5), row 2 holds `cons`
  alone, `J = 1`, `e = 6.5` (outer half 7); `l1 = 7 + 7 = 14`, `l2 = 14 +
  (11.5 + 7) = 32.5`, `Ea = 7 + 32.5 = 39.5`: `r` at 55.5, `ante` at
  41.5 with Tempo at 36 and Ticks at 31, `cons` at 23 with its Ticks in
  slot 1 at 17.5, `H = 100.4765625`.
- **Sub-slots on a segment line.** The root `form` (length 32, unnamed) is
  a segment line of three segments without a line, `A` 0 to 8, `B` 8 to
  20 and `C` 20 to 32, by command. `form` holds `form_ticks` (Ticks), `B`
  holds `b_ticks` (Ticks): the segment's map joins `form`'s band, its
  timeline `[100, 250]` conflicts with `form`'s `[0, 400]`, so the key
  Ticks has two sub-slots: `form_ticks` slot 1, `b_ticks` slot 2, `J = 2`.
  The line reaches `max(11.5, k) = 11.5` above (no segment label: the
  segments have no name), `Ea = 11.5`, `form` at 27.5, `form_ticks` at 22,
  `b_ticks` at 17. With further maps on `form` whose IDs sort against
  their names, `a_ticks` (Ticks), `b_tempo` (Tempo), `c_samples` (Samples)
  and `d_bars` (Bars), and `B`'s `e_ticks` (Ticks), the key order Bars,
  Samples, Tempo, Ticks gives `d_bars` 1, `c_samples` 2, `b_tempo` 3,
  `a_ticks` 4 and `e_ticks` 5, `J = 5`, `e = 26.5`: `form` at 42.5 and the
  maps at 37, 32, 27, 22 and 17; drawn `a_ticks`, `b_tempo`, `c_samples`,
  `d_bars`, `e_ticks`.
- **Named before unnamed.** On `r` with one child `c` (4 to 8), maps added
  as `z` (named Zeta), `m` (unnamed) and `a` (named Alpha): Alpha slot 1,
  Zeta slot 2, the unnamed LinearMap slot 3; `c` at 27.5 with `J = 3`,
  `e = 16.5`, `Ea = 7 + 7 + 16.5 = 30.5`, so `r` at 46.5, `c` at 32.5,
  `a` at 27, `z` at 22 and `m` at 17.
- **One common start beyond level 1.** `ante` and `cons` as in Siblings,
  with one map named Tempo each, the regions band of every timeline shown,
  and `r`'s band order (followed by both) `[children, conversion_maps,
  regions] | [markers, flow_control]`, so each child's regions band lies at
  level 1 and its maps band at level 2 above. `ante` holds two unnamed
  regions, 0 to 2 and 1 to 3, which conflict: two rows, its regions band
  `2 × 22.4765625 − 4 = 40.953125` wide from 5.5, its maps band's own start
  `5.5 + 40.953125 + 4 = 50.453125`; `cons` one region, 0 to 2: one row,
  18.4765625 wide, own start `27.9765625`. Both bands start at `c0 =
  50.453125`, the larger, one shared slot each: the maps lie `50.453125 +
  1.5 + 5 − 1 = 55.953125` from their lines, both edges `50.453125 + 6.5 =
  56.953125`, the row's outer half that, `Ea = 7 + 7 + 56.953125 =
  70.953125`: `r` at 86.953125, the children at 72.953125, both maps at
  17. Laid out apart, `cons`'s map would lie at 39.4765625.
- **Kept apart by the children band.** Maps bands of one level whose
  lines' children bands lie nearer the line are laid out together apart
  from the others, so no start waits on itself; the starts are then found
  step by step. `r` (length 8) holds `A` (0 to 4) and `B` (4 to 8), each
  with one map named Tempo; the regions bands shown. `A`'s band order
  `[conversion_maps, children] | [markers, regions, flow_control]` puts
  its children band at level 1 and its maps band at level 2 above; `B`'s
  `[children, conversion_maps, regions] | [markers, flow_control]` its
  regions band at 1, maps at 2, children at 3. `A` holds the child `A1` (0
  to 4), `B` holds `B1` (0 to 4) and the region 0 to 2. Steps: `B`'s maps
  band (children further out) from `5.5 + 18.4765625 + 4 = 27.9765625`, `J
  = 1`, to 34.4765625; the children bands of `A` and `B`, own starts
  `max(5.5, 7) = 7` and `34.4765625 + 4 = 38.4765625`, together from
  38.4765625, one row holding `A1` and `B1` (halves 7 and 7), each band 14
  wide, to 52.4765625; `A`'s maps band (children nearer) from `52.4765625 +
  4 = 56.4765625`, its own `J = 1`, to 62.9765625. The row's outer half is
  62.9765625, `Ea = 7 + 7 + 62.9765625 = 76.9765625`: `r` at 92.9765625,
  `A` and `B` at 78.9765625, `A1` and `B1` at `78.9765625 − (38.4765625 +
  7) = 33.5`, `A`'s map at `78.9765625 − 61.9765625 = 17` and `B`'s at
  `78.9765625 − 33.4765625 = 45.5`. One common start for the two maps
  bands would wait on itself.
- **Two slot sequences in one row.** The same band orders with `B`
  holding no child and the maps `b_tempo` (Tempo) and `b_ticks` (Ticks),
  `A` its child `A1` and `a_tempo` (Tempo). `B`'s set has `J = 2`: from
  27.9765625, Tempo 33.4765625 and Ticks 38.4765625 out, to 39.4765625.
  `A`'s set has `J = 1`: its children band from 7 to 21, its maps band from
  25, the map 30.5 out, to 31.5. Outer half 39.4765625, `Ea = 53.4765625`:
  `r` at 69.4765625, `A` and `B` at 55.4765625, `A1` at 41.4765625,
  `a_tempo` at 24.9765625, `b_tempo` at 22 and `b_ticks` at 17. Shared,
  the two Tempo maps would take one slot of one sequence of 2.
- **What decides the slots.** The slots of the row's bands, a band's start
  and width, and every line's reach are read by the layout from the row
  membership the first fits give, the displayed maps, and each band's
  side, level and children band alone; a
  row holding only one line with maps of one key in canonical order draws
  its maps in canonical order (every drawing fixture but
  `conversion_maps__maps_quarters`, whose twelve unnamed maps take their
  slots by type, draws its maps in canonical order).

## Jumps, a float axis and band orders (`placement.test.ts`)

**Five jumps.** Root `r`, quarters, length 16, `x(t) = x0 + 25 t`, with
jumps 4→6 `one`, 8→10 `two`, 3→11 `three`, 2→12 `four` and 1→13 `five`,
each a jump origin at its `from` with its label as its id, added after the
jump target `<id>_to` at its `to` that it names; `x0 = 16 + 4.5224609375 +
8` (the name `r`, `A = 842`). Canonical order sorts the jump origins by
their coordinate, `from`: `five`, `four`,
`three`, `one`, `two`; their spans are 12, 10, 8, 2 and 2, and the stable
sort by span gives the placement order `one`, `two`, `three`, `four`,
`five`, which the jumps and their labels are drawn in. Extents from `x0`:
`one` `[100, 150]`, `two` `[200, 250]`, `three` `[75, 275]`, `four` `[50,
300]`, `five` `[25, 325]`; no label widens its extent. First fit: `one` and
`two` level 1, `three` 2, `four` 3, `five` 4. No band above: the root's line at
22.40234375. No flow marker, so no label tier: the flow row is the flow
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

**`corpus_score_ms3`.** Root `clt_1` (no name), quarters, length 37, two
maps above (the LinearMap `cmap_1` and the MeasureRecordMap `cmap_2`; the
measure map `cmap_2` reads, which belongs to no timeline, is not drawn);
children `notes` and `controls`, each from 0 to 37, in rows 1 and 2. The widest name is `controls` (44.10205078125); `x0 =
68.10205078125` (no centred label asks more: `MC 3 → MC 1`, 58.53515625
wide, at `u = 3/37` asks `16 + 29.267578125 − 32.432432432432435`). Above:
the two-map stack (`1.5 + 2 × 5 = 11.5`), the children band from `11.5 + 4
= 15.5`, two rows of 14, `Ea = 15.5 + 28 = 43.5`, `y_root = 51.5`, the
root's line at 59.5. Below: a corpus fixture names no timestamp, so no
markers band is present, and the flow control band lies at level −1 from
`1.5 + 4 = 5.5` with one flow-marker label tier (`fine at MC 7`): the flow
row lies `5.5 + 10.4765625 = 15.9765625` out, `yf = 8 + (51.5 + 15.9765625)
= 75.4765625`, the flow-marker label's baseline `75.4765625 −
2.12255859375 = 73.35400390625`.
Jump origins by coordinate, each to its target's coordinate or to 0
without one: `jump_from_1` `6→0`, `jump_from_2` `9→6`, `jump_from_3` `28→16`, `jump_from_4`
`37→0`, spans 6, 3, 12, 37: placement order `jump_from_2`, `jump_from_1`,
`jump_from_3`, `jump_from_4`. Extents (`400 × u`, `u` the double nearest `t / 37`):
`jump_from_2` `[64.86486486486487, 97.2972972972973]`, widened by its label `MC
5 → MC 4` centred at 81.08108108108108 to `[50.81350295608108,
111.34865920608108]`, level 1; `jump_from_1` `[0, 64.86486486486487]` conflicts,
level 2; `jump_from_3` `[172.97297297297297, 302.7027027027027]`, level 1;
`jump_from_4` `[0, 400]`, level 3. With `pj = 20.4765625` the apexes lie
8, 28.4765625 and 48.953125 beyond the flow row. The band is `10.4765625 +
8 + 2 × 20.4765625 + 2 + 10.4765625 = 71.90625` wide, `Eb = 5.5 + 71.90625
= 77.40625`, `Hc = 51.5 + 77.40625 + 8 = 136.90625`, `H = 154.90625`. No
`x` depends on the maps above or on the band's ordinates.

- **Short jump** (`9→6`, level 1): `Xf = 165.3993480785473`, `Xt =
  132.96691564611487`, `yc = 75.4765625 + (4/3) × 8 = 86.14322916666667`,
  `C1 = (157.2912399704392, yc)`, `u = (−0.6051514590776749,
  −0.7961103639421869)`, `Bh = (135.38752148242557, 78.66100395576875)`,
  corners `(133.7953007545412, 79.8713068739241)` and
  `(136.97974221030995, 77.4507010376134)`: it arrives steeply.
- **Long jump** (`37→0`, level 3): `Xf = 468.10205078125`, `Xt =
  68.10205078125`, `yc = 75.4765625 + (4/3) × 48.953125 =
  140.74739583333331`, `C1 = (368.10205078125, yc)`, `u =
  (−0.837405767846437, −0.546581723054768)`, `Bh = (71.45167385263575,
  77.66288939221907)`, corners `(70.35851040652622, 79.33770092791194)` and
  `(72.54483729874529, 75.9880778565262)`: it
  arrives flatter. Summed from the card's left edge first, the first
  corner's `x` would be 70.35851040652621.

**Float axis.** `continuous_physical`: root `cpt_1`, seconds, `float`,
length 12.5; children `cpt_2` at 0.5, length 4.25, and `cpt_3` at 6.0,
length 3.0, both in child row 1. The row's joined name `cpt_2, cpt_3` (`A =
12414`, `N = 66.6767578125`) is the widest; `0″` (9.087890625 wide)
asks `16 + 4.5439453125`, so `x0 = 90.6767578125`, the root running to
490.6767578125. The proportions are binary64 quotients: `0.5 / 12.5` is the
double nearest 0.04 and `400 ×` it rounds to 16, so `cpt_2` starts at
106.6767578125; `4.75 / 12.5` is the double nearest 0.38 and `400 ×` it
rounds to 152, so it ends at 242.6767578125. The coordinate labels of its
`origin` and `length` show the floats as Python writes them, seconds
split: `0″` and `12.5″`.

**Float labels** (section 5.2). A float is labelled as Python's `round(x,
3)` rounds it (the exact double to the nearest thousandth, ties to even),
then as `repr` spells the result, seconds split into minutes `′` and
seconds `″` (core's pretty text at three places, its tests the oracle of
the split). `continuous_physical` with its children
removed and its root's length set by command (its `length` timestamp
following the length), the coordinate label of `length` reads
`5′12.49″` for 312.48979591836735, `6″` for 6, `6.719″` for 6.71875 (no
tie: 6718.75 thousandths), `0.062″` for 0.0625 (a tie, 62.5 thousandths,
to even) and `0″` for 1e-05; `origin`'s reads `0″`. The label
carries the exact coordinate, the length as given, whatever its text.

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

## Row names and empty blocks (`names.test.ts`)

Two non-overlapping children share row 1, whose joined name is replaced by
`content: "AAAA"` on the first name and cut to `"A…"` by `max-width: 20`.
A hidden second name at font size 20 still sets the band's `p = h(20) =
23.28125`: the band starts at `p0 / 2 = 7`, row 1's inner half is
11.640625, so its line lies 18.640625 out; `Ea = 30.28125`, `y_root =
38.28125`, the root's line at 46.28125, the child row at 27.640625. With
every element but the block hidden the hidden card keeps its place
(section 8.4): `x0 = R = xn = 16`, the card spans 8 to 24, `Hc =
14.40234375 + 6.40234375 + 8 = 28.8046875`, the block 32 by 44.8046875. A
manifest named "Mixed" with no timelines and no groups holds only its title
at size 11, which enters the block like a card: `w = 6108 × 11 / 2048 =
32.806640625`, its slot ending at `8 + h(11) = 20.8046875`; the block is
48.806640625 by 28.8046875. The fallback `P + x0 = 24` by `P = 8` applies
only to a block holding no frame, no card and no displayed title: the same
manifest with its title at `display: none`.

## Stretch (`stretch.test.ts`)

**Sizes.** For `nested`, `map`, `flow_control` and `with_region`, at
lengths 200, 400 and 800 and card spacings 0, 4 and 8 (the root's card's
entry of `places`), every element keeps its style and its text, the wedge
stays 6 wide and 13 high, and a child's diamond and circle keep their size:
only positions change. Length moves x only: at length 200 the root of
`nested` runs from 49.91552734375 to 249.91552734375 at 51.

**Row spacing.** At card spacing `S`, `nested` has `p0 = p = max(10 + S,
12.8046875)`; with no map each children band starts at `c = max(1.5 + S,
p / 2)`, so each row lies `c + p / 2` beyond the last, and `y_root = 8 +
Ea`, `Ea = c + (p / 2 + (c + p))`:

| `S` | `p` | `c` | root | `clt_3` | `clt_2` |
|---|---|---|---|---|---|
| 0 | 12.8046875 | 6.40234375 | `8 + (8 + 32.01171875) = 48.01171875` | 35.20703125 | 22.40234375 |
| 4 | 14 | 7 | `8 + 43 = 51` | 37 | 23 |
| 8 | 18 | 9.5 | `8 + 54 = 62` | 43.5 | 25 |

**The padding.** Section 6.5 keeps the padding `P` above and below a
member drawing at every spacing: `y_root = max(P + Ea, P + h(s) / 2)`,
`Hc = y_root + max(Eb, h(s) / 2) + P`, and a root's flow marker's line ends `P`
from the member drawing's top or `Hc − P` below it. `H = Hc + 18`.

- `bare`, one row and no gap between bands (its markers band lies against
  its line), draws the same at card spacings 0 and 8: the line at
  22.40234375, `W = 476.5771484375`, `H = 67.37890625`.
- `flow_control` at card spacing 8: the flow control band from `26.9765625
  + 8 = 34.9765625`, one flow-marker label tier, so the flow row 45.453125 out,
  `yf = 8 + (14.40234375 + 45.453125) = 67.85546875`; two jump rows with
  `pj = 6 + 8 + 10.4765625 = 24.4765625` make the band `10.4765625 + (4 +
  8) + 24.4765625 + 2 + 10.4765625 = 59.4296875` wide, `Eb = 94.40625`,
  `Hc = 14.40234375 + 94.40625 + 8 = 116.80859375`, `H = 134.80859375`;
  the flow marker's line from `yf` to `8 + 8 = 16`. With `[flow_control,
  children, conversion_maps] | [markers, regions]` the band lies alone
  above, from `1.5 + 8 = 9.5`, its flow row `9.5 + 10.4765625 =
  19.9765625` out, `Ea = 9.5 + 59.4296875 = 68.9296875`, `y_root =
  76.9296875`, the line at 84.9296875, `yf = 8 + (76.9296875 − 19.9765625)
  = 64.953125`, `Hc = 76.9296875 + 26.9765625 + 8 = 111.90625`, `H =
  129.90625`; the flow marker's line runs to the padding below, `8 + (Hc −
  8) = 111.90625`.

**Block size.** With `width` and `height` 120 and 60 above the natural block,
every element but the block is identical to the natural drawing and `W =
width`, `H = height`; a request of 1 by 1 draws the natural drawing.

## Segment lines (`segments.test.ts`)

`segment_line` and `segment_pages_accolades` are checked against the block
size, lines, boundaries, labels and names summed from sections 3.4 and 6:
the segment lines are children in row 1, each boundary on its segment
line's line, each label above it centred on its segment, both in the
traversal order of their segments, and only the root's row named. Among
ordinary children (`segment_children`) segment lines take rows by first
fit, each named. Segments that are no lines stay on the root's line with no
children band. A line's reach counts `k` only for a drawn boundary, keeps it
fixed at every card spacing (`segment_line` at 8: its segment labels reach
20.4765625 above `form`, whose children band starts at `20.4765625 + 8`,
its row's inner half `max(9, k) = 9`, so `form` lies at 73.953125 and `b`
at 36.4765625, each boundary `k = 8` both ways, `H = 118.9296875`), and a
hidden line takes no room. A row of
segment lines takes its first line's name size. A segment that is no line
(`segment_pages`) is matched neither by `{element: child}` nor by its own
id: its segment line holds its boundary and label, so that line's id and a
`within` the segment reach them, never the segment line's own boundary.
The regions of segments without a line join their segment line's regions
band when shown and are hidden by default.

## Ancestor lines (`ancestors.test.ts`)

`group_child_member`, `group_grandchild`, `group_parents_mixed` and
`group_grandchild_parent_on_top` are checked against section 8.3, every
value derived from the member's offsets and length and the quantities
below: an ancestor line runs on to the left with its own arrowhead, lies on
the side of the member opposite to where its own completed band order puts
its `children` band (the default order puts `children` above the line, so
every ancestor line of these fixtures but `movement`'s in
`group_grandchild_parent_on_top` lies below the member), marks the
member's start and end on its side away from the member, faded, labelled
on its own axis in its unit and number type, under a small grey name; one
row per ancestor, the deeper ancestor nearest the member on its side; the
outer chevron's tip counts in the right edge; the ancestors' elements come
first within each frame, from `A1` to `Ak` whatever their side (section
8.5). Single changes prove the room taken: mark labels in first-fit tiers,
a row's pitch from its name's size, `q / 2` for a row without marks, eight
stroke widths of `x0` for a line running on to the left, a mark label as a
centred label, none for a hidden ancestor, and the ancestor band `S`
beyond the stroke of a wide member's line. The marks `{id: M, part:
[start]}` and `{id: M, part: [end]}` lie on the ancestor lines alone: the
member's own start and end are its named timestamps `origin` and `length`
(in `group_child_member` and `group_grandchild` `timestamp_3` and
`timestamp_4`), wedges of its own markers band below its line, which the
member's own band order moves and which hiding the marks leaves drawn.
`inside: ancestor` matches the marks, never the member's own wedges.

**The quantities.** The member's card lies at `y = 32.8046875` (the
frame's top 8, `Q`, the title's `h(11) = 12.8046875` and the gap 4); `P =
8`, the card spacing `S = 4`, `p0 = max(10 + S, h(11)) = 14`, an ancestor
row's pitch `q = max(14, h(9) = 10.4765625) = 14` (names of size 9), the
member's line `w = 3`. A member whose markers band below holds its `origin`
and `length` in one label tier has `Eb = w / 2 + 13 + 2 + h(9) =
26.9765625`; with nothing above its line `Ea = 0` and `y_root = max(P + 0,
P + h(11) / 2) = 14.40234375`, so its line lies at `32.8046875 +
14.40234375 = 47.20703125`. An ancestor band below starts at `c0 = max(p0
/ 2, max(Eb, w / 2) + S) = max(7, 30.9765625) = 30.9765625`; a row has the
inner half `q / 2 = 7` and the outer half `max(7, w / 2 + 13 + 2 + h(9)) =
26.9765625` with labelled marks, so the nearest ancestor line lies
`30.9765625 + 7 = 37.9765625` below the member's, each further one
`26.9765625 + 7 = 33.9765625` beyond, and a band of `k` rows reaches `c0 +
33.9765625 k`. `Hc = y_root + Eb' + 8` with `Eb'` that reach. On a line at
`ya` below the member a mark's tip lies at `ya + 1.5`, its base at `ya +
14.5`, its label's baseline at `ya + 16.5 + a(9) = ya + 24.85400390625`
(`a(9) = 8.35400390625`); above the member, mirrored, `ya − 1.5`, `ya −
14.5`, `ya − 16.5 − d(9) = ya − 18.62255859375` (`d(9) =
2.12255859375`). A name of size 9 has its baseline `(a(9) − d(9)) / 2 =
3.11572265625` below its row's line. The member's own wedges lie at `y +
1.5` and `y + 14.5`, their labels at `y + 24.85400390625`. Horizontal
values are those of the drawing fixtures, which no side changes.

- `group_child_member` (`second-half` 8 at 8 in `piece` 16): `second-half`
  at 47.20703125, `piece` at `47.20703125 + 37.9765625 = 85.18359375`, its
  marks at 86.68359375 and 99.68359375, their labels at 110.03759765625,
  its name at 88.29931640625; the member's own wedges at 48.70703125 and
  61.70703125, labels 72.06103515625; the card `14.40234375 + 64.953125 + 8
  = 87.35546875` high.
- `group_grandchild`: `movement` at 85.18359375 and `score` at
  `85.18359375 + 33.9765625 = 119.16015625`, marks 120.66015625 and
  133.66015625 on `score`, labels 144.01416015625, names 88.29931640625 and
  122.27587890625; the card `14.40234375 + 98.9296875 + 8 = 121.33203125`.
- `group_parents_mixed`: the cards at 32.8046875, `+ 87.35546875 + 8 =
  128.16015625` and `+ 87.453125 + 8 = 223.61328125`; `take` has a map
  above (`Ea = 6.5`, `y_root = 14.5`, its card `14.5 + 64.953125 + 8 =
  87.453125`), so the lines lie at 47.20703125 / 85.18359375 (`sonata`),
  142.66015625 / 180.63671875 (`session`) and 238.015625 / 275.9921875
  (`page`); mark labels at 110.03759765625, 205.49072265625,
  300.84619140625; ancestor names at 88.29931640625, 183.75244140625,
  279.10791015625.
- `group_grandchild_parent_on_top` (`group_grandchild` with `movement`'s
  band order `[line, children, conversion_maps, markers, regions,
  flow_control]`, which `theme` follows, its markers band still below):
  `movement` alone above, its band starting at `max(7, max(0, 1.5) + 4) =
  7`, its line 14 above the member's and the band `7 + 7 + 26.9765625 =
  40.9765625` wide, so `y_root = 48.9765625`; `score` alone below at
  37.9765625. `theme` at 81.78125, `movement` at 67.78125 (marks 66.28125
  and 53.28125, labels `8 ♩` `16 ♩` 49.15869140625, name 70.89697265625),
  `score` at 119.7578125 (marks 121.2578125 and 134.2578125, labels `24 ♩`
  `32 ♩` 144.61181640625, name 122.87353515625); the member's own wedges
  83.28125 / 96.28125, labels 106.63525390625; the card `48.9765625 +
  64.953125 + 8 = 121.9296875` high and its record's `contentCount` 4 (row,
  markers band, two ancestor bands).
- Single changes to `group_child_member`: its own band order with markers
  above (`Ea = 26.9765625`, `Eb = 0`): the ancestor band below starts at 7,
  `second-half` at `32.8046875 + 8 + 26.9765625 = 67.78125`, `piece` at
  81.78125, the card 83.953125; the member's wedge at 66.28125 / 53.28125,
  label 49.15869140625. `L = 10`: both pairs of labels take two tiers
  (`Eb = 37.453125`), the band starts at 41.453125, `piece` at 95.66015625,
  the start label (first fit, tier 1) at 120.51416015625, the end label
  (tier 2) at 130.99072265625, the card 108.30859375. Ancestor names of
  size 20: `q = h(20) = 23.28125`, `piece` at `47.20703125 + 30.9765625 +
  11.640625 = 89.82421875`, its name at `+ 6.923828125`, the card
  91.99609375. Marks hidden: the row `7 + 7`, the card 67.37890625. An
  ancestor stroke of 5: `x0` 136.61962890625, the marks' reach 27.9765625,
  tip 87.68359375, base 100.68359375, label 111.03759765625, the card
  88.35546875. Labels hidden: outer half 14.5, the card 74.87890625. Labels
  of size 150: outer half `16.5 + h(150) = 191.109375`, start label at
  `85.18359375 + 16.5 + a(150) = 240.9169921875`, the card 251.48828125.
  The member's line hidden: both edges 0, the band from `max(7, 0 + 4) =
  7`, `piece` at `32.8046875 + 14.40234375 + 14 = 61.20703125`, the card
  63.37890625. A member stroke of 16 under `piece`'s order with children
  below (so `piece` lies above and the member's markers band, following
  that order, below): the band starts at `max(7, 8 + 4) = 12`, `piece` 19
  above the member at 67.78125, the member at 86.78125, the card 95.453125.

**A member's cross-section lines cross its whole card** (section 6.6):
a named timestamp's line runs from its card's upper border to its lower
border, the ancestor lines on either side included, less its gap, which
a timestamp drawing its line alone does not have. What proves it: the
ordinates are read off other records of the same drawing (the card boxes
keyed by their place keys, the ancestor lines' `y`), and every drawn
line's marker (`AxisMarker.crossSection.span`) is its card's span.

- `group_parent_both` (`middle`, offset 4, length 8 in `piece` of 16) with
  the named timestamp `Here` at 2 on `middle`, `display` `[cross_section]`
  (`timestamp_5`): `middle` at 47.20703125, `piece`'s ancestor line below
  at 85.18359375; one line at `x0 + 400 × 2 / 8 = 211.70361328125` from
  the top of `middle`'s card to its bottom, across the ancestor line.
- The same with a child `inner` of `middle` (offset 1, length 2) and a
  named timestamp at 1 on `inner`, `display` `[cross_section]`: its line
  crosses `middle`'s whole card too, at the same abscissa (1 + 1 of
  `middle`'s 8): a descendant's line is the card's, as the member's.
- Hiding the ancestor line (`{addresses: [{id: piece}]}`, `display: none`)
  leaves the line across the card.
- `group_grandchild_parent_on_top`: `theme`'s marker spans its card, and
  `Here` at 2 on `theme` (`timestamp_5`) draws its line at 211.70361328125
  from the card's top, above `movement`'s line, to its bottom, below
  `score`'s.
- `data/clair-de-lune-session.yaml` (a session of a score image, its time
  axis, a six-measure excerpt drawn on it, a recording and the score's
  encoding; the grouped child `cgt_3` "mm. 1-6" in `cgt_2` in `cgt_1`, both
  its ancestors displayed, every order the default): every drawn line's
  marker spans its card.

**Named timestamps of an ancestor** (section 8.3): a timestamp named on an
ancestor `A` of the member is drawn on `A`'s ancestor line in the member's
card when its position lies within the member's span, `0 ≤ coordinate +
ts ≤ λ` on the member's axis, exactly, both ends included; its wedge on
the line's outer side as the marks', its stack after the marks' in one
first fit (marks, then `A`'s timestamps in canonical order, then the
secondary coordinates on `A`, hidden ones taking no room), tiers counted
in lines; its cross-section line across the member's card, its gap
measured out from the ancestor line on that side (`c` 0, `w` its stroke
width 3); full opacity for its line, primary wedge and labels by the
defaults, while the marks stay faded; and a cross-section segment in the
member's card for an alignment anchor, never one in the ancestor card
that draws `A` as a root (section 8.8). What proves it:
`group_child_member` (`second-half` 8 at 8 in `piece` 16, the window 8 to
16, the quantities above: `x0 = 120.61962890625`, `piece` at
85.18359375) with four timestamps added on `piece` through commands,
minted in this order: `timestamp_5` at 4 (wedge, name, line), outside, of
which nothing is drawn; `timestamp_6` "B" at 8 (wedge, name), the start;
`timestamp_7` "C" at 12 (wedge, name, line); `timestamp_8` at 16 (wedge),
the end. The wedges lie at `x0`, `x0 + 200`, `x0 + 400`, tip `85.18359375
+ 1.5`, base `+ 14.5`. The first fit places the start mark's label `8 ♩`
(tier 1, at `x0`), the end mark's `16 ♩` (tier 1), "B" at `x0`, which
meets `8 ♩` and so takes tier 2, and "C" at `x0 + 200` in tier 1: "B"'s
baseline `85.18359375 + (1.5 + 13 + 2 + h(9)) + a(9)`, "C"'s `85.18359375
+ (1.5 + 13 + 2) + a(9)`, and the card one `h(9)` higher than with one
line of labels (87.35546875). Opacities: the three wedges, both name
labels and "C"'s line 1, the start mark and its label 0.35. "C"'s line
runs from the card's top to the tip, `85.18359375 + 1.5`, and from the end
of its label, `85.18359375 + (1.5 + 13 + 2 + h(9))`, to the card's bottom.
Drawn with the defaults (the ancestor card shown), "C"'s line is drawn in
four pieces, two in the ancestor card and two in the member's, and
`timestampSegments` gives the member card's span alone, at the member's
`x0 + 200`.

## Ancestor cards (`ancestor-cards.test.ts`)

Section 8.8 is the oracle. Every number below is derived from its rules,
the fixtures' offsets and lengths, `L = 400`, the constants `P = Q = K = G
= 8`, the advance widths `w(text, s) = A × s / 2048` (section 5.1) and the
layout's existing values, which the figures of the drawings with the
hiding layer pin (`group__group_parent_both__ancestor-cards-hidden` and
the others, byte for byte); the defaults show the cards, and the layer
`HIDDEN_ANCESTOR_CARDS`, `{rules: [{select: {element: ancestor_card}, set:
{display: none}}]}`, hides them. A card whose default proportion is below
1 draws strips (section 8.9; "Elisions" below derives them); where its
whole geometry is the subject, it is drawn with the layer `FULL_CARDS`,
`{rules: [{select: {element: elision}, set: {display: none}}]}`, which
draws every ancestor card whole (section 8.9, Elided and full), as
`group_parent_both` and `group_parent_right` are with the defaults alone
(`r = 1`). The frame's start `s0` is section 8.2's: `n
= Q + K = 16`, plus the widest drawn name `N`, plus `G`, plus `8w = 24`
when an ancestor line runs on to the left. Each card's own start is `s0' =
K + N' + G`, `N'` the widest name of the root's own drawing; its width
`s0' + LA + Mr + K`, `Mr` the furthest a drawn right edge lies past `s0' +
LA` (the root's arrowhead `3w = 9` with `w = 3`, or the half of a centred
coordinate label at the root's end).

1. **Shown by default, hidden by a rule.** For every manifest fixture
   drawn with the default layer, the `ancestor_card` elements and the
   records carrying `ancestor` number one per group and root of a child
   member (section 8.8, Which): two in `bundle_shared_parent` (`score`
   behind both frames), three in `group_parents_mixed` (`sonata`,
   `session`, `page`), four in `bundle_elided_layerit` (the Suite behind
   each of its four frames), two in `bundle_elisions_stored` (`score` and
   `session`), one in `bundle_mixed`, `group_child_member`,
   `group_child_member_stamps`, `group_elided_inside`, `group_grandchild`,
   `group_grandchild_parent_on_top`, `group_parent_both`,
   `group_parent_exact` and `group_parent_right`, none in any other. With
   `HIDDEN_ANCESTOR_CARDS` no element is an `ancestor_card`, no axis
   carries `ancestor` and no record carries
   `ancestor`: those drawings are the figures of the drawing fixtures
   `group__<file>__ancestor-cards-hidden`, drawn under the same rule.
2. **`group_parent_both`** (`piece` 16 quarters, `middle` at 4, 8 long).
   `N = w("Recording", 11) = 10371 × 11 / 2048 = 55.70361328125`, `piece`
   runs on to the left, so `s0 = 16 + 55.70361328125 + 8 + 24 =
   103.70361328125`, the frame at `x = P = 8`. `ts = −4`, `λ = 8`, `te =
   −4 + 16 = 12`: `us = −0.5`, `ue = 1.5`, `xs = 103.70361328125 − 200 =
   −96.29638671875`, `xe = 703.70361328125`, `LA = 800`. `N' = w("Middle",
   11) = 6765 × 11 / 2048 = 36.33544921875` (wider than `Piece`'s
   29.2724609375), `s0' = 52.33544921875`; the card's left in the frame
   `xs − s0' = −148.6318359375`, place `−140.6318359375`; its width
   `52.33544921875 + 800 + 9 + 8 = 869.33544921875`. The block grows left
   to `Xl = −140.6318359375 − P`: origin `(148.6318359375, 0)`, `W =
   P + (−140.6318359375 + 869.33544921875 + 2) + 148.6318359375 =
   887.33544921875`, `H` unchanged (`193.5390625`): the card's bottom lies
   above the frame's. Vertically the card is `piece` as the one ungrouped
   root of a block holding nothing else: its height and the distance of
   its line below its top are those of `piece` in the drawing of the same
   manifest after core's `remove` of `group_1` and `recording` at `L =
   800` (63.37890625 and 48.9765625); its line lies on `piece`'s ancestor
   row in `middle`'s card, below `middle`'s line (section 8.3; the
   quantities of "Ancestor lines"), `y = 85.18359375` in the block, so its
   top is `85.18359375 − 48.9765625 = 36.20703125`. In the block: the
   card's record at `x = 8`, `y = 36.20703125`, `869.33544921875 ×
   63.37890625`, key
   `{item: group_1, member: piece}`, address `{id: piece, part: [card]}`,
   holder null, `ancestor {group: group_1, member: middle}`, no `item` or
   `card` member; `piece`'s line from `−88.29638671875 + 148.6318359375 =
   60.33544921875` to `860.33544921875` at `85.18359375`; `middle`'s row
   (at `36.20703125 + 15 = 51.20703125`) from
   `111.70361328125 + 148.6318359375 = 260.33544921875` to
   `660.33544921875`. Its whole drawing is the reference block's (every
   element of `piece`'s card there, its rectangle a `card`, here an
   `ancestor_card`) moved by the difference of the two cards' corners,
   exactly (every value is dyadic).
3. **Nothing moves.** Every element after the ancestor cards, every record
   but theirs, and every axis of an item's card equal those of the drawing
   with the hiding layer moved by the change of the origin,
   `(148.6318359375, 0)`: the cards take no room, and their own axes
   follow every item's (point 8). The order: the block's background, the
   ancestor card's rectangle and its drawing (records' ranges 1 to 10),
   then the frame.
4. **`group_parent_right`** (`first-half` at 0, 8 long). `s0 = 16 +
   55.70361328125 + 8 = 79.70361328125` (no line runs on to the left), `us
   = 0`, `ue = 16 / 8 = 2`, `xs = s0`, `LA = 800`; `N' = w("First half",
   11) = 8953 × 11 / 2048 = 48.08740234375`, `s0' = 64.08740234375`; left
   `8 + 79.70361328125 − 64.08740234375 = 23.6162109375`, width
   `64.08740234375 + 800 + 9 + 8 = 881.08740234375`; the origin stays `(0,
   0)`, `W = 23.6162109375 + 881.08740234375 + 2 + 8 = 914.70361328125`,
   `H = 193.5390625`; top `36.20703125` as in case 2 (same rows).
5. **`group_parents_mixed`** (one frame, display order `exposition`,
   `take`, `system`, `audio`), drawn with `FULL_CARDS`: three cards, in
   that order, behind it.
   `N = w("Exposition", 11) = 57.0302734375`, chevrons: `s0 =
   105.0302734375`. `sonata` (`ts = −16`, `λ = 32`, `λR = 48`): `us =
   −0.5`, `ue = 1`, `LA = 600`, `s0' = 8 + 57.0302734375 + 8 =
   73.0302734375`, left `−94.9697265625 − 73.0302734375 = −168` (item),
   `Mr` the half of `w("32 ♩", 9) = 18.55810546875`, width `73.0302734375
   + 600 + 9.279052734375 + 8 = 690.309326171875`. `session` (seconds,
   floats: `ts = −30.0`, `λ = 25.5`, `te = 60.0`): `us = −30 / 25.5`, `ue
   = 60 / 25.5` in binary64, `xs = s0 + 400 × us = −365.5579618566177`,
   `xe = 1046.2067440257354`, `LA = xe − xs = 1411.7647058823532`, `s0' = 8
   + w("Session", 11) + 8 = 57.9697265625`, left `−423.5276884191177`,
   width `57.9697265625 + LA + 9 + 8 = 1486.7344324448532`. `page` (int
   pixels: `ts = 0`, `λ = 600`, `λR = 1754`): `ue = 1754 / 600` exactly
   then rounded, `2.9233333333333333`, `LA = 1169.3333333333333`, `s0' = 8
   + w("System", 11) + 8 = 57.01904296875`, left `105.0302734375 −
   57.01904296875 = 48.01123046875`, width `1243.3523763020833`. The block
   grows left to `session`'s card: origin `(423.5276884191177, 0)`; the
   records at `x` 263.5276884191177, 8, 479.5389188878677 (each left `+ 8 +
   423.5276884191177`), tops `36.20703125`, `131.66015625`, `227.015625`
   (each member's ancestor row, `85.18359375`, `180.63671875`,
   `275.9921875`, less 48.9765625: every root has one child row with two
   labelled wedges);
   `W = 479.5389188878677 + 1243.3523763020833 + 2 + 8 =
   1732.891295189951`, `H` unchanged.
6. **One hidden of several.** The same with the defaults, `session`'s
   cards hidden by `{addresses: [{id: session, part: [card]}]}` `display:
   none` in a second layer: two cards, the block grown left to `sonata`'s
   only (drawn whole, `r = 1`), origin `(168, 0)`, nothing of `session`
   drawn but its ancestor line.
7. **No ancestor line.** With the ancestor lines hidden (`{element:
   ancestor}` `display: none`), `piece`'s card in `group_parent_both` lies
   on `middle`'s own line instead: its line's ordinate equals `middle`'s.
8. **An ancestor card's axes.** Its lines are drawn lines as any card's,
   so the coordinates over them read as over any card. In
   `group_parent_both` the drawing's axes are those of the hiding layer's
   drawing moved by `(148.6318359375, 0)`, then two more, in the order of
   the card's lines: `piece` and `middle`, each keyed `{item: group_1,
   member: piece}` (the card's key) and carrying `ancestor {group:
   group_1, member: middle}` (its record's). From the card's corner `(8,
   36.20703125)`, `s0' = 52.33544921875` and `LA = 800` (point 2):
   `piece`'s axis at `36.20703125 + 48.9765625 = 85.18359375` from `8 +
   52.33544921875 = 60.33544921875` to `+ 800 = 860.33544921875`, quarters,
   fraction, from 0 to 16, drawn end 16, the ends of its line element;
   `middle`'s at `36.20703125 + 15 = 51.20703125` (the card's padding and the
   row's half pitch 7) from `60.33544921875 + 800 × 4 / 16 =
   260.33544921875` to `+ 400 = 660.33544921875`, from 0 to 8, drawn end 8,
   its line element starting there (a child's line stops short of its end
   mark). `lineAxes` lists both with these numbers, drawn lengths 16 and 8,
   and the same `ancestor`.
9. **No member of the frame.** An ancestor card's key has a member card's
   shape and `piece`'s line in it names the key's member, yet
   `frameMemberLines(axes, group_1)` stays `middle` and `recording`; so a
   groupstamp ignores the card. With `timestamp_1` of
   `group_child_member_stamps` ("Bar 2" at 2 on `middle`, its cross-section
   line alone) made a groupstamp, `groupstampElements` draws, with the
   hiding layer, one piece at `x0 + 100 = 211.70361328125`, the frame's
   member cards less `middle`'s, which its own line crosses: from the
   bottom of `middle`'s card to the bottom of `recording`'s (both read off
   the card boxes, equal with the card shown); with the card shown, the
   same piece `148.6318359375` further right, and none across the ancestor
   card.
10. **No segment for an alignment anchor.** An ancestor card gives no
   cross-section segment to an alignment anchor (sections 8.7, 8.8 point
   5), though the named timestamps of its drawing are marked on its lines.
   In `group_child_member_stamps` drawn with the defaults,
   `timestampSegments(axes, timestamp_2)` is `middle`'s segment in its own
   card alone, `{x: 311.70361328125 + 148.6318359375 = 460.33544921875,
   y1, y2}` with `y1` and `y2` the top and bottom of `middle`'s member card
   (its box; TimeToShare's drawings README, moved by the origin), though
   `middle`'s row in `piece`'s card holds `timestamp_2` at 460.33544921875
   too; the drawn `anchor_1` is the hiding layer's moved by the origin.
   With `timestamp_2` moved onto the root `piece` at quarter 8 (the fixture
   with that one timestamp changed, validated), the ancestor card, which
   draws `piece`'s line and marks `timestamp_2` on it, still gives no
   segment, but `middle`'s member card draws `timestamp_2` on `piece`'s
   ancestor line (8 lies within `middle`'s span, section 8.3), and that
   gives it the segment of the member card, the `x` and `segment` its axis
   records: one `alignment_anchor` is drawn, the hiding layer's moved by
   the origin.
11. **`bundle_shared_parent`: one root behind two frames** (section 8.8,
   Which), drawn with `FULL_CARDS`. `score` (32 quarters) holds the members `exposition` (12 at 0)
   of `group_1` and `recapitulation` (12 at 20) of `group_2`; no line runs
   on to the left of `exposition`, but `score` does to the left of
   `recapitulation`, so the block's one horizontal layout has the chevron
   term: `N = w("Recapitulation", 11) = 14781 × 11 / 2048 =
   79.39013671875`, `x0 = 16 + 79.39013671875 + 8 + 24 =
   127.39013671875`, the frames at `x = P = 8`. The card's own name
   column holds the row of `exposition` and `recapitulation`, named
   together: `N' = w("Exposition, Recapitulation", 11) = 26701 × 11 /
   2048 = 143.41357421875`, `s0' = 159.41357421875`; its right margin is
   the half of `w("12 ♩", 9) = 18.55810546875` centred at
   `recapitulation`'s end, which is `score`'s, `Mr = 9.279052734375`. In
   binary64:
   - behind `group_1` (aligned to `exposition`): `ts = 0`, `λ = 12`, `te =
     32`, `us = 0`, `ue = 32 / 12 = 2.6666666666666665`, `xs = x0`, `xe =
     x0 + 400 × ue = 1194.0568033854165`, `LA = 1066.6666666666665`; left
     `8 + (xs − s0') = −24.0234375` (place), width `s0' + LA + Mr + 8 =
     1243.3592936197915`;
   - behind `group_2` (aligned to `recapitulation`): `ts = −20`, `te = 12`,
     `us = −20 / 12 = −1.6666666666666667`, `ue = 1`, `xs = x0 + 400 × us
     = −539.2765299479167`, `xe = 527.39013671875`, `LA =
     1066.6666666666667`; left `8 + (xs − s0') = −690.6901041666667`, width
     `1243.3592936197917`: the two widths differ in their last bit, each
     card laid out with its own frame's proportions.
   Vertically each card is `score` as the one ungrouped root of a block
   holding nothing else (the fixture after core's `remove` of both groups,
   both takes and `page`, at `L = LA`): `154.8828125` high, its line
   `98.4296875` below its top; its line lies on `score`'s ancestor row in
   its member's card, below the member's line, at `123.5625`
   (`exposition`'s card) and `369.7265625` (`recapitulation`'s), the
   ordinates of the drawing with the hiding layer, whose place origin is
   the block's corner: each member card's top (53.609375 and 270.796875)
   plus `y_root = 8 + Ea` (`Ea` the edge of its children and maps bands
   above, 23.9765625 and 52.953125) plus 37.9765625 (its markers band below
   holds one label tier; each card keeps its height, 104.9296875 and
   133.90625, the band having moved from one side to the other); so the
   tops lie at `25.1328125` and `271.296875`. The block grows left to the
   second card, `Xl = −698.6901041666667`, and up to the first, `Yt =
   25.1328125 − Pt = −3.671875` with `Pt = 28.8046875`, the first frame's
   top in the drawing with the hiding layer: origin `(698.6901041666667,
   3.671875)`, `W = (8 + (−24.0234375 + 1243.3592936197915 + 2)) − Xl =
   1928.0259602864583`, `H = 537.4609375 + 3.671875 = 541.1328125` (the
   hiding layer's height, its bottom unchanged). Records: two cards, both
   addressed `{id: score, part: [card]}`, keyed `{item: group_1, member:
   score}` at `(674.6666666666667, 28.8046875)` and `{item: group_2,
   member: score}` at `(8, 274.96875)`, carrying `ancestor {group:
   group_1, member: exposition}` and `{group: group_2, member:
   recapitulation}`. `lineAxes` lists `score`'s line in each, keyed by its
   card: at `127.234375` from `834.0802408854167` to
   `1900.7469075520833` and at `373.3984375` from `167.41357421875` to
   `1234.0802408854167` (`8 + xs` and `8 + xe` plus the origin), drawn
   length 32 both.
12. **The hover readers answer for a card's line.** `crossSection`,
   `crossedLines` and `wedgeAt` read an ancestor card's lines by their
   keys as any card's. In `group_parent_both` (point 2), at `x =
   460.33544921875`: `piece`'s unnamed cross-section line in the card runs
   from the card's top down to the tip of the wedge, the wedge's base lying
   past the card's bottom, so one piece is left, in the style of the
   defaults' unnamed cross-section line (stroke `#1BA1E2`, width 1, dashes
   `3 3`); `crossedLines` is `piece`'s key then `middle`'s in the card; the
   wedge in `piece`'s markers band below the line, from `c = 0`, its tip at
   `85.18359375 + 1.5 = 86.68359375`, its base corners at `x ∓ 3` and
   `86.68359375 + 13 = 99.68359375`, styled as `middle`'s wedge in its
   member card (the same defaults and domain, turned 0). `middle`'s line in
   the card crosses the card whole too, cut by its own wedge: from the
   card's top to the wedge's tip, `51.20703125 + 1.5 = 52.70703125`, and
   from its base, `65.70703125`, to the card's bottom; `crossedLines` is
   its key alone.

## Elisions (`elisions.test.ts`)

Sections 3.2 (the elided axis), 6.6 (Elisions), 7.2, 8.5, 8.8 and 8.9 are
the oracle, at the default placement and view (`1280 × 720`, so `0.8 ×
VW = 1024`, `0.8 × VH = 576`, `Z` the double nearest 5/7 and `B = 716.8`
wherever `zG` exceeds `Z`). Every number is derived in binary64 in the
order the specification writes it: a strip's natural width `n = LA × ub −
LA × ua`, its drawn width `w = r × n` (or its stored form), its shrink `n −
w`, `x(t) = s0' + (LA × u − D)` in the root's own drawing, `D` the shrinks
of the strips ending at or before `t` summed from the left, then the card
moved by `dx = (xs + DL) − s0'`, drawn at its frame's place `8` and moved
by the origin: a drawn abscissa is `Ox + (8 + (dx + x))`. The same chain,
computed apart from the layout (in Python's floats, exact proportions by
`Fraction`), gave every abscissa below. Ordinates are those of the card
drawn whole (strips move x only, section 3.2): a strip spans its card's
rectangle, a continuation lies at its line's ordinate, a `name` label's
baseline is `y − (w / 2 + 2) − d(9) = y − 5.62255859375` and a `coordinate`
label's `y + (w / 2 + 2) + a(9) = y + 11.85400390625` (`w = 3`).

1. **`group_grandchild`** (`theme` 8 at 8 in `movement` 16 at 16 in
   `score` 64; the frame `543.70361328125 × 211.515625`, `x0 =
   103.70361328125`, `σ = 8 + w("Movement", 11) + 8 = 74.265625`): `ts =
   −24`, `EL = 24`, `ER = 32`; `zG = 1024 / 543.70361328125`, `zb = Z`,
   `c = 271.851806640625`, `dl = 242.413818359375`, `dr =
   239.851806640625`; the terms `λ / E = 8 / 56 = 0.14285714285714285`,
   left `(716.8 − dl) / (400 × 3) = 0.39532181803385413`, right `(716.8 −
   dr) / (400 × 4) = 0.29809262084960936`: `r = 0.14285714285714285`, set
   by (a). Generation 2 holds `movement`, generation 1 `score`; the
   protected span is 24 to 32. Three default elisions, from the left:
   `{id: score, part: [elision]}` over 0–16, `{id: movement, part:
   [elision]}` over 16–24 (0–8 on its own axis), `{id: score, part:
   [elision]}` over 32–64; at `LA = 3200` natural widths 800, 400, 1600,
   drawn `800 / 7`, `400 / 7`, `1600 / 7` in binary64, `DL =
   1028.5714285714287`, `dx = −141.99058314732133`. Drawn: the origin
   `(141.99058314732133, 0)`, the block `909.265625 × 227.515625`, the
   card at `(8, 56.18359375)`, `891.265625 × 77.37890625` (`s0' + LA + Mr +
   K` with `Mr = −2391`, the arrowhead past the elided end); the strips from
   `x1` to `x2`: `82.265625` to `196.55133928571422`,
   `196.55133928571422` to `253.69419642857133` and `653.6941964285713`
   to `882.265625`, each from `56.18359375` to `133.5625`; only the second
   has a rule (it starts where the first ends); the continuations `[119.16015625]`
   (`score`), `[119.16015625, 105.16015625]` (`score`, then `movement`,
   traversal order), `[119.16015625]`; each carries its stretch on its own
   timeline: `score` 0–16, `movement` 0–8, `score` 32–64. Labels, strip by
   strip, name then coordinate, centred on `(x1 + x2) / 2`
   (`139.4084821428571`, `225.12276785714278`, `767.9799107142857`):
   `Score` and `0–16 ♩` at `113.53759765625` and `131.01416015625`,
   `Movement` and `0–8 ♩` at `99.53759765625` and `117.01416015625`,
   `Score` and `32–64 ♩` as the first; addressed `{id: T, part: [elision,
   name]}` and `[elision, coordinate]`. `score`'s line runs from
   `82.265625` to `882.265625` (`800 = L + 400`, the frame's length and
   the strips' widths), `movement`'s from `196.55133928571422` and
   `theme`'s row from `253.69419642857133`, the frame's `x0` drawn.
2. **Order** (section 8.5). In the card's range the strips follow the
   last element of its member drawing, and their six labels follow the
   strips; the frame comes after all of them.
3. **`group_grandchild_parent_on_top`**: the same abscissas; the card at
   `y = 56.78125`, the continuations at `119.7578125` (`score`) and
   `71.78125` (`movement`), the labels of the `score` strips at
   `114.13525390625` and `131.61181640625`, of the `movement` strip at
   `66.15869140625` and `83.63525390625`.
4. **`group_parents_mixed`**. `sonata` has `λ / E = 2`, `r = 1`: no
   strip, its card drawn whole (`690.309326171875` wide). `session`:
   `r = 25.5 / 64.5 = 0.3953488372093023`, strips 0.0–30.0 from
   `94.98376180959303` to `281.0302734375` and 55.5–90.0 from
   `681.0302734375001` to `894.9837618095931`, labelled `Session` and
   `0″–30″`, `Session` and `55.5″–1′30″` (seconds are clocks at both
   ends), no rule (they do not touch), each continuing `session`'s line at
   `180.63671875`; its card at `x = 37.014035247093034`, `874.9697265625001`
   wide. `page`: `r = 600 / 1154 = 0.5199306759098787`, one strip
   600–1754 from `681.0302734375` to `1081.0302734375`, labelled `Page`
   and `600–1 754 px`; its card at `224.01123046875`, `874.01904296875`
   wide. The origin `(168, 0)` (`sonata`'s card is now the leftmost), the
   block `1108.0302734375 × 384.4453125`.
5. **`group_elided_inside`** (`excerpt` 8 at 8 in `first` 32 at 0 in
   `piece` 64, beside `second` 32 at 32): generation 2 holds `first` and
   `second`, which leave generation 1 nothing: three default elisions,
   `first` 0–8, `first` 16–32, `second` 0–32, none on `piece`; `r = 1 / 7`
   by (a); strips from `95.4248046875` to `152.5676618303571`, from
   `552.5676618303571` to `666.8533761160713` and from there to
   `895.4248046875`, the third with a rule, each continuing `piece`'s line
   at `119.16015625` and its own row at `105.16015625`. The origin
   `(40.86404854910711, 0)`, the block `922.4248046875 × 227.515625`, the
   card `904.4248046875` wide.
6. **Stored elisions** (`bundle_elisions_stored`). In `score`'s ancestor
   card (`LA = 3200`, protected span 16–24): `elision_4` (0–20, `{ratio:
   0.5}`) clipped to 0–16, 400 of 800 wide; `elision_5` (32–48, `{span: 4}`)
   200 wide (`3200 × 4 / 64`); `elision_6` (40–56, `{canvas: 30}`) clipped
   by `elision_5` to 48–56, 30 wide, with a rule; their labels `Score` and
   `0–16 ♩`, `Score` and `32–48 ♩`, `Score` (25.40478515625, within the
   26 left) and `48–…` (`48–56 ♩` cut to the strip less 2 on either side).
   The strips' widths, `x2 − x1`, are 400, 200 and 30 exactly (dyadic). No
   default elision is drawn anywhere (stored elisions lie on `score`), no
   `elision_1` (its timeline `coda` is hidden), no `elision_3` (on
   `recording`, a member: drawn nowhere), no `elision_7` (hidden by the rule
   `{element: elision, within: session}`, so `session`'s card is whole,
   `1486.7344324448532` wide, as before strips existed). On `page`'s
   ungrouped card (`L = 400`, `λR = 1754`), `elision_2` (600–1754, no
   width): `E = 1154`, `Rf = 600`, `r = 0.5199306759098787`, `n = 400 −
   400 × 0.34207525655644244 = 263.169897377423`, the strip from
   `673.3880644791947` to `810.2181671017717`, where `page`'s line ends,
   the line from `536.5579618566177`.
7. **One axis per full run.** `score`'s line in its card of
   `bundle_elisions_stored` is drawn in two runs, 16–32 and 56–64, and has
   two axes, both addressed `{id: score}` and keyed by the card, the second
   carrying `run: 1`: from `elision_4`'s right edge to `elision_5`'s left
   edge, coordinates 16 to 32 (end known), and from `elision_6`'s right edge
   to the line's end, 56 to 64; `lineAxes` lists both, drawn lengths 16
   and 8. In `group_grandchild` `score`'s card line has one run, 24–32, its
   axis from the strip edge `253.69419642857133` to `653.6941964285713`,
   coordinates 24 to 32, without `run`.
8. **What lies in a strip is not drawn.** `group_grandchild` with a named
   timestamp `Here` added on `score` at 4 (in the strip 0–16): no element
   carries its address, and no axis lists it; with `FULL_CARDS` its wedge is
   drawn in the card. `bundle_elisions_stored` with a child `inner` (16
   quarters at 8) added to `score`: its start lies in `elision_4`'s strip,
   so its line starts at that strip's right edge without a circle
   (`start: none`) and ends at 24, where `theme`'s line ends, with its
   diamond.
9. **Elided and full.** With `FULL_CARDS` no `elision` element is drawn
   and `group_grandchild`'s card is `74.265625 + 3200 + 9 + 8 =
   3291.265625` wide; with `{element: elision, within: score}` hidden
   alone, the same (the rule reaches `movement`'s default elision, a
   descendant's). A `display` without `strip` draws nothing: with
   `elision_4`'s `display` `[name, coordinate]` (the fixture changed,
   validated) no `elision_4` element is drawn and `elision_5` is the first
   strip; with `[strip]` the strip is drawn without labels.
10. **The view.** `group_grandchild` drawn for the view `640 × 360`: `zG =
   512 / 543.70361328125 = 0.9416895299078136`, `zb = Z`, `B = 358.4`;
   left `(358.4 − dl) / 1200 = 0.09665515136718748`, right `(358.4 − dr) /
   1600 = 0.07409262084960937`, so (b) binds: `r =
   0.07409262084960937`, `dx` follows, and the origin is
   `(59.47315673828143, 0)`; the strips run from `82.265625` to
   `141.53972167968755`, on to `171.17677001953143`, and from
   `571.1767700195314` to `689.7249633789065`.
11. **Other ancestor cards.** `bundle_shared_parent`'s `score` (its
   members its own children, so generation 1 alone) draws one strip in
   each of its two cards, on the side of `score` beyond the member;
   `bundle_mixed` two; the cards whose default proportion is 1
   (`group_parent_both`, `group_parent_right`, `group_parent_exact`,
   `group_child_member`, `group_child_member_stamps`) draw none.

## Named timestamps (`timestamps.test.ts`)

A named timestamp `X` of `graphical.timestamps` draws the elements its
`display` lists (sections 2, 2.1, 6.4 Markers, 6.6): its wedge `{id: X}`
and its labels `{id: X, part: [name]}`, `{id: X, part: [id]}`, `{id: X,
part: [coordinate]}`, all held by its timeline's markers band (the labels
beside the wedge, never by it), and its cross-section line `{id: X, part:
[line]}`, held by its timeline's line and drawn last, taking no room: from
its card's upper border to its lower border, less one gap from the nearest
to the farthest of its wedge (tip and corners, where the vertical meets
its body) and its stack (where it lies across the line's `x`), up to two
pieces from the top. The
labels it draws form its **stack**, one per line, name, ID, coordinate
outwards from the wedge's base; the stacks are placed by the band's one
first fit, each as wide as its widest label; a tier is as many lines high as
its highest stack. The cascade's `display` may still hide any one element,
and never draws a word its `display` leaves out. Every manifest below is a
fixture, a fixture with named timestamps or rules written onto it and
validated, or built through commands. Label widths at size 9: `Downbeat`
`10421 × 9 / 2048 = 45.79541015625`, `Climax` `7030 → 30.8935546875`,
`Entry` `5449 → 23.94580078125`, `timestamp_3` `13374 → 58.7724609375`,
`1 ♩` 12.83203125, `Mid` `3636 → 15.978515625`, `Late` `4459 →
19.59521484375`. A wedge's base is 6, so its extent is `[L × u − 3, L × u +
3]` unturned; turned by `r`, from `L × u` plus the smallest to `L × u` plus
the largest of 0 and its corners' offsets across (section 6.4): `[L × u,
L × u + 13]` at 90, `[L × u − 13, L × u]` at −90. The numbers of `timestamps` are those of the drawing fixture's
derivation in TimeToShare's `fixtures/0.2.0/drawings/README.md`.

**`timestamps`, by hand.** Root `clt_1`, quarters, length 8, unlocked, no
name (its row shows `clt_1`, 25.91552734375 wide); child `clt_2` at 2,
length 4, locked. Its named timestamps, in canonical order: `timestamp_1`
`Downbeat` at 3/2 (`display` the default: wedge, name, cross-section line)
and `timestamp_2` `Climax` at 6 (wedge, name) on `clt_1`, `timestamp_3`
`Entry` at 1 on `clt_2` (all five words), so at `2 + 1 = 3` on the root's
axis. No rule.

- Horizontal: `x0 = 16 + 25.91552734375 + 8 = 49.91552734375` (no label
  reaches left of it), `x(t) = x0 + 50t`: `Downbeat` at 124.91552734375,
  `Climax` at 349.91552734375, `Entry` at 199.91552734375; `clt_2` from
  149.91552734375 to 349.91552734375.
- The root's markers band (below, level −1, `c = 0`): the stacks of
  `Downbeat` and `Climax`, one line each, extents `[51.102294921875,
  98.897705078125]` and `[283.55322265625, 316.44677734375]`, share tier 1:
  `Eb = 1.5 + 13 + 2 + 10.4765625 = 26.9765625`. It holds two wedges and two
  labels: `band.elements` 4.
- `clt_2`'s markers band, below its line at level −1 from 0, holds the stack
  of `Entry`, three lines, one item as wide as `timestamp_3`, `[150 −
  29.38623046875 − 1, 150 + 29.38623046875 + 1]`, alone in tier 1, three
  lines high: `T = 3`, the band `16.5 + 3 × 10.4765625 = 47.9296875` wide,
  towards the root; one wedge and three labels, `band.elements` 4. `clt_2`
  lies in the root's children band above, from `max(1.5 + 4, 14 / 2) = 7`;
  its row's inner half is `max(7, 47.9296875)`, its outer half 7: `l1 = 7 +
  47.9296875 = 54.9296875`, the band 54.9296875 wide, `Ea = 61.9296875`,
  `y_root = 8 + 61.9296875 = 69.9296875`. The root's line lies at
  77.9296875 and `clt_2`'s at `77.9296875 − 54.9296875 = 23`; `Hc =
  69.9296875 + 26.9765625 + 8 = 104.90625`, the card `{8, 8,
  458.91552734375, 104.90625}` (the arrowhead's tip is the right edge), `W
  = 476.91552734375`, `H = 122.90625`.
- **The child row change.** With `graphical.timestamps` emptied, `clt_2`'s
  markers band is absent, its row's halves are 7 and 7, `Ea = 21`, `y_root
  = 29`: the root's line lies at 37 and `clt_2`'s at 23. The stack on
  `clt_2` moves the root's line down by `77.9296875 − 37 = 40.9296875`.
- Wedges: the root's tips at `77.9296875 + 1.5 = 79.4296875`, bases at
  92.4296875; `timestamp_3`'s tip at 24.5, base 37.5. Labels, line `n`
  starting `1.5 + 13 + 2 + (n − 1) × 10.4765625` out, baseline `a(9)`
  beyond: `Downbeat` and `Climax` at `(77.9296875 + 16.5) + 8.35400390625
  = 102.78369140625`; `Entry` at 47.85400390625, `timestamp_3` (line 2,
  26.9765625 out) at 58.33056640625, `1 ♩` (line 3, 37.453125 out) at
  68.80712890625. The coordinate label carries the exact coordinate `1` in
  quarters, the timestamp's own, not the root's 3; the name label none.
- Cross-section lines (section 6.6): each across the card, 8 to
  112.90625, less its gap: `timestamp_1`'s at 124.91552734375 from 8 to its
  wedge's tip `77.9296875 + 1.5 = 79.4296875` and from the end of its name
  label, `77.9296875 + (1.5 + 13 + 2 + h(9)) = 104.90625`, to 112.90625;
  `timestamp_3`'s at 199.91552734375 from 8 to its tip `23 + 1.5 = 24.5`
  and from the end of its three labels, `23 + (1.5 + 13 + 2 + 3 × h(9)) =
  70.9296875`, to 112.90625. `#1BA1E2`, width 1, dash `3 3`. `timestamp_2`
  does not list `cross_section`.
- The elements, in order: the block; the card; `clt_1`'s line, `clt_2`'s;
  the wedges of `timestamp_1`, `timestamp_2`, `timestamp_3`; the names
  `clt_2` and `clt_1`; the labels `Downbeat`, `Climax`, `Entry`,
  `timestamp_3`, `1 ♩`; last the two pieces of `timestamp_1`'s line, then
  the two of `timestamp_3`'s.

**Display, each on its own** (section 2.4), on `timestamps` with its
timestamps written again:

- Hiding the wedge `{id: timestamp_3}` keeps its three labels at the same
  baselines and the band as wide (the room of the wedges lies between the
  line and the labels whether or not a wedge is drawn): the root's line
  stays at 77.9296875; its line keeps its two pieces.
- Hiding `clt_2`'s markers band hides the wedge and all three labels; the
  band is absent, the root's line lies at 37 and `clt_2`'s at 23;
  `timestamp_3`'s line crosses the card whole, nothing of it standing on
  the line to leave a gap, and `timestamp_1`'s runs from 8 to `37 + 1.5`
  and from `37 + (1.5 + 13 + 2 + h(9))` to the card's bottom.
- Hiding `clt_2`'s line hides its whole drawing: nothing of `timestamp_3`;
  `timestamp_1` draws its wedge, its name label and its line in two pieces
  across the card; the root's line lies at `8 + max(8, 8 + 6.40234375) =
  22.40234375`.
- `timestamp_3` with `display` `[name, id]`: two labels, no wedge, the
  stack two lines: the band `16.5 + 2 × 10.4765625 = 37.453125` wide, `l1 =
  7 + 37.453125 = 44.453125`, the root's line at `8 + (8 + (7 + (37.453125
  + 7))) = 67.453125`, `clt_2`'s at 23, the labels at 47.85400390625 and
  58.33056640625.
- `timestamp_1` with `display` `[]` draws nothing; `Climax` alone keeps tier
  1, the root's line at 77.9296875.
- A rule setting `display: inline` on `timestamp_2`'s line and ID label
  draws neither: `timestamp_2` draws its wedge and name label only.

**Secondary coordinates, shown by a rule** (sections 2, 2.3, 6.4 Markers,
6.6). A named timestamp has a secondary coordinate on every other timeline
its card draws whose span holds its position (core's `cardStamps`); the
defaults hide them and turn their wedges −45. With an extra layer's rule
`{coordinates: secondary}` setting `display: inline` on `timestamps`
(written again with its own timestamps): `clt_2` (2 to 6) holds
`timestamp_2` (6, its end), `clt_1` holds `timestamp_3` (3); each is drawn
in that timeline's markers band at the primary's `X` (349.91552734375 and
199.91552734375), its wedge turned −45 about its tip 1.5 below the line
(corners `wedgeCorners(−45)` out from the tip, from `rotation.test.ts`),
its stack the labels its `display` lists (`Climax`; `Entry`,
`timestamp_3`, `3 ♩`) carried by that wedge as "Stacks carried by their
wedges" derives, each stack in tier 1 of its band: `t = 15 + W / 2 ×
0.7071 + H / 2 × 0.7071`, `W` the widest label at size 9, `H` its lines'
height, the labels at `X + t × −0.7071` and line `i` starting `1.5 + t ×
0.7071 − H / 2 + i × h(9)` out, baseline `a(9)` beyond. The root's markers
band's elements come first, then the child's, so `timestamp_3`'s
secondary wedge and labels precede its primary ones. Its coordinate
label carries 3 quarters, its value on `clt_1`'s axis, its primary's 1 on
`clt_2`'s. `timestamp_1` (3/2) lies on `clt_1` alone. The room: hidden
(the defaults), nothing of them is drawn and the card keeps 104.90625
(every number above holds with them listed); their wedges alone shown
(`{element: wedge, coordinates: secondary}`) take none either, the band
being `w / 2 + 13` deep without labels; all shown, `clt_1`'s band holds
`timestamp_3`'s three lines in tier 1 beside `Downbeat` and `Climax`
(extents apart), so the card grows by `2 × h(9)`; `clt_2`'s band keeps
its three lines (`Climax` beside `Entry`'s stack), its line stays at 23
and `clt_1`'s at 77.9296875. Each ordinate is summed in the order the
specification gives: the distance out first, then the line's ordinate,
then `a(9)`.

**Stacks in tiers.** `bare` (`x0 = 49.5771484375`, line at 22.40234375)
with `origin` (`timestamp_1`, 0) and `length` (`timestamp_2`, 8), each
`[wedge, coordinate]`, `timestamp_3` `Mid` at 4 with `[name, id,
coordinate]` and `timestamp_4` `Late` at 9/2 with `[name]`. In canonical
order the stacks are `0 ♩` `[−7.416015625, 7.416015625]`, the stack of
`timestamp_3` as wide as `timestamp_3`, `[200 − 29.38623046875 − 1, 200 +
29.38623046875 + 1] = [169.61376953125, 230.38623046875]`, `Late` `[225 −
9.797607421875 − 1, 225 + 9.797607421875 + 1] = [214.202392578125,
235.797607421875]`, which conflicts with it, and `8 ♩`: tier 1 holds the
first, second and fourth and is three lines high, tier 2 holds `Late` on
line `3 + 1 = 4`. `T = 4`, the band `16.5 + 4 × 10.4765625 = 58.40625`
wide (its record 58.40625 high, holding 2 wedges and 6 labels), `Hc =
14.40234375 + 58.40625 + 8 = 80.80859375`. Baselines: line 1 `(22.40234375
+ 16.5) + 8.35400390625 = 47.25634765625` (`0 ♩`, `Mid`, `8 ♩`), line 2
57.73291015625 (`timestamp_3`), line 3 68.20947265625 (`4 ♩`), line 4
`(22.40234375 + 47.9296875) + 8.35400390625 = 78.68603515625` (`Late`),
the labels in the order of their timestamps, each stack's in its order.

**A child's extent counts its wedges.** `contiguous` (root `piece`, length
8, children `a` [0, 3], `c` [1, 3], `b` [3, 8], none named, every pitch
14): `a` takes row 1, `c` row 2, `b` row 1 (it starts where `a` ends), so
the children band, from 7, is `7 + 7 + 7 + 7 = 28` wide, `Ea = 35`, the
root's line at `8 + (8 + 35) = 51` and `b`'s at `51 − 14 = 37`. With
`timestamp_1` at 0 on `b` drawing its wedge alone, `b`'s extent holds the
wedge's `[150 − 3, 150 + 3]`, which conflicts with `a` (`[0, 150]`) in row 1
and `c` (`[50, 150]`) in row 2, so `b` takes row 3, whose inner half is
`max(7, 1.5 + 13) = 14.5` (`b`'s markers band, no label): `l3 = ((7 + 7) +
(7 + 7)) + (7 + 14.5) = 49.5`, the band `49.5 + 7 = 56.5` wide from 7, the
root's line at `8 + (8 + 56.5) = 72.5` and `b`'s at `72.5 − 49.5 = 23`.
With a rule turning that wedge 90 (`{addresses: [{id: timestamp_1}]}`), its
extent is `[150, 163]`, within `b`'s own `[150, 400]`, so `b` takes row 1
again, whose inner half is now `max(7, 1.5 + 13) = 14.5`: `l1 = 7 + 14.5 =
21.5`, `l2 = (7 + 14.5) + (7 + 7) = 35.5`, the band `35.5 + 7 = 42.5` wide
from 7, the root's line at `8 + (8 + 42.5) = 58.5` and `b`'s at `58.5 −
21.5 = 37`; turned −90, its extent `[137, 150]` conflicts with `a` and `c`
as before, so the lines lie at 72.5 and 23.

**Segments without a line.** `segment_line` with `timestamp_1` at 2 on the
segment `b1` (at 0 in `b`, at 8 in `form`, so at 10 on `form`'s axis): its
wedge joins `b`'s markers band and lies on `b`'s line at `X = form.xs + 400
× 10 / 32 = form.xs + 125`, its tip 1.5 below that line and its base 14.5
below. Its line crosses `form`'s whole card at that `X`, its gap from the
tip, `y + 1.5`, to the end of its name label, `y + (1.5 + 13 + 2 +
h(9))`, `y` `b`'s line.

**The reach** (section 3.4). `unknown_length` with `timestamp_1` `Mark` at
20 on `score`: `score`'s reach becomes 20 (it was 14, `coda`'s end), so
`coda` is drawn from `53.798828125 + 400 × 10 / 20 = 253.798828125` to
`53.798828125 + 280 = 333.798828125`, and the wedge lies at
`53.798828125 + 400 = 453.798828125`.

**A band order of its own, built through commands.** A quarters root `r` of
length 8 (with `origin` and `length`), the locked child `c` at 2, length
4, the LinearMap `m`, the band order `[conversion_maps, line, children,
markers, regions, flow_control]` set on `r`, and the timestamp `Here` added
at 3 (`timestamp_3`, the default `display`). Above `r`'s line its
conversion maps band at level 1 from 0, one slot: `e = 1.5 + 5 = 6.5`, `Ea
= 6.5`, `y_root = max(8 + 6.5, 8 + 6.40234375) = 14.5`, the line at 22.5.
Below, the children band at level −1 from `max(1.5 + 4, 7) = 7`, `c`'s row
with halves 7 and 7 (`c` follows `r`'s order and draws no band): `c`'s
line at `22.5 + 14 = 36.5`, the band's edge 21; the markers band at level
−2 from `21 + 4 = 25`, its wedges' tips at `22.5 + 26.5 = 49`, bases at 62.
The cross-section line runs at `r.xs + 150` across the card, from its top
to the wedge's tip, 49, and from the end of its name label, `22.5 + (26.5
+ 13 + 2 + h(9))`, to its bottom; `crossSection` at any other abscissa,
which no named timestamp holds, gives the card cut by the unnamed wedge
alone, from the top to 49 and from its base 62 to the bottom, and the
line crosses `r` and `c`.

**The lines a cross-section line crosses** (`crossedLines`): the key of
its own line first, then those of its timeline's displayed descendants
drawn with a line of their own in the same member drawing, in traversal
order (section 6.1), each key the card's place key text followed by the
timeline's address key. `contiguous`: `piece`, `a`, `c`, `b` (by offset,
although `b` shares `a`'s row); `nested`: `clt_1`, `clt_3`, `clt_2`, and
`clt_3`, `clt_2` from `clt_3`; `segment_line`: `form`, `a`, `b`, `c` (the
segments without a line, `a1`, `b1`, `b2`, `c1`, are no lines), and `b`
alone from `b`; `timestamps` with `clt_2` hidden: `clt_1` alone; an
ancestor line and a key naming no line: none.

**The marks at any position.** A drawn line's axis carries where a wedge
and a cross-section line of its timeline lie at any abscissa, drawn by the
code that draws a named timestamp's; an editor draws its unnamed marks so.
For a line keyed as `lineAxes` keys it, at the abscissa `x`:

- in `timestamps`, on `clt_1` at 124.91552734375 the cross-section is
  `timestamp_1`'s drawn line as it would be without labels, its gap the
  wedge's alone (its upper piece as drawn, its lower piece from the
  wedge's base), and the wedge's points equal its wedge's tip and base
  corners, with the same style; on `clt_2` at 199.91552734375 likewise
  with `timestamp_3`'s;
- with a rule hiding `timestamp_1`'s line, that line is not drawn, but
  the unnamed cross-section on `clt_1` at 124.91552734375 still runs from
  8 to 79.4296875 and from 92.4296875 to 112.90625 in the default style,
  displayed: a rule naming addresses never styles an unnamed mark;
- in `timestamps` with `places` `{clt_1: {scale: 2}}`, the same agreements
  hold with every drawn value scaled, the line's style width 2 and dash
  `6 6`;
- in `nested`, whose child `clt_3` (line at 37, above the root's at 51,
  its children band holding `clt_2` from 7 to 21) has no markers band: at
  200 its wedge lies where that band would start, from 0 below its line,
  `[[200, 38.5], [197, 51.5], [203, 51.5]]`, its cross-section the card
  less that wedge, from its top to 38.5 and from 51.5 to its bottom; the
  root's from the top to 52.5 and from 65.5 to the bottom, its wedge
  `[[200, 52.5], [197, 65.5], [203, 65.5]]` below;
- an ancestor line has no unnamed cross-section line (`marksAt` gives no
  piece there) but the mark its marks are drawn as (section 8.3): on the
  line's
  side away from the member, its tip on the line's edge, `y ± w / 2`, `w`
  the drawn ancestor line's stroke width, its base 13 further out, turned
  by its style's
  `rotation`, in the style the cascade gives a wedge held by the ancestor
  line that no named timestamp holds (a wedge of the ancestor's timeline,
  its parent the ancestor line, no rule naming `addresses` applied). With
  the defaults (section 4) that style is, property by property: stroke
  `#00CC00`, the logical-domain rule (and the line's, inherited); stroke
  width 3 and dashes `none`, inherited from the line (`{element: ancestor}`
  and its continuous rule), since no rule sets them on a wedge; fill
  `#000000`, `{element: wedge}`, which outranks the domain rule by naming
  the element; **opacity 0.35, `{inside: ancestor}`, the rule that decides**
  (opacity is not inherited, so the faded line alone would leave it 1);
  font size 9, rx 0, shadow `none`, display `inline`, content `none`,
  max-width `none`, the initial values; rotation 0, a wedge's initial
  value. These are the values of the drawn marks of the member's
  start and end on the same line, which the same rules style, so the hover
  mark is faded as they are. In `group_child_member` `piece`'s ancestor line
  in `second-half`'s card lies below the member at 85.18359375 (`w` 3, the
  defaults' ancestor stroke width; the quantities of "Ancestor lines"; the
  ancestor card, shown by the defaults, moves no origin), so at 100 the mark is `[[100,
  86.68359375], [97, 99.68359375], [103, 99.68359375]]` (`85.18359375 +
  1.5`, then 13 down, `∓ 3` across). A rule
  hiding the drawn mark of `second-half`'s start and one recolouring and
  turning the mark of its end (each naming its address) change nothing of
  it: the hover mark depends on no styled element. A rule on every wedge
  (`{element: wedge}` with fill `#123456`, naming no address) recolours it,
  as it does every unnamed wedge. In `group_parent_both` `piece`'s
  ancestor line in `middle`'s card lies at 85.18359375 alike, so at 200 the
  mark is `[[200, 86.68359375], [197, 99.68359375], [203, 99.68359375]]`
  and its
  style is the whole style above, equal to the drawn mark `{id: middle,
  part: [start]}`'s; a rule recolouring that mark (`addresses: [{id:
  middle, part: [start]}]`, fill `#FF0000`) recolours the drawn mark and
  leaves the hover mark equal to the one without it; a rule on the wedges
  of ancestor lines (`{element: wedge, inside: ancestor}`, fill `#123456`,
  opacity 1) gives it fill `#123456` and opacity 1 and leaves the unnamed
  wedge of `middle`'s own line as it was (fill `#000000`, opacity 1); with
  `group_1` at scale 2 the mark is scaled with its line: at `x` its tip
  lies at `y + 3` and its corners at `x ∓ 6` and `y + 3 + 26`, `y` the
  ancestor line's ordinate in that drawing (its axis record), its style's
  lengths doubled as every scaled style's (stroke width 6, font size 18). What would be wrong: none (the hover on an ancestor line
  then shows no mark), the mark of the member's start moved there (a rule
  on that mark would hide or recolour the hover), the member line's
  unnamed wedge (opacity 1: an unfaded mark on a faded line), a mark that
  keeps its unscaled size in a scaled card, or a mark below the line;
- a key naming no line has neither;
- in `nested`, an extra layer's rule `{element: wedge, within: clt_3}`
  setting `rotation` 90 turns `clt_3`'s mark at 200 about its tip (section
  6.6 at `s = 1`, `k = 0`: both corners 13 across, `3` and `−3` beyond
  the tip): `[[200, 38.5], [213, 37 + (1.5 + 3)], [213, 37 + (1.5 − 3)]]`
  `= [[200, 38.5], [213, 41.5], [213, 35.5]]`; the root's stays unturned;
  a rule `{element: wedge, addresses: [{id: clt_3}]}` setting 90 turns
  neither mark, since a rule naming addresses never styles an unnamed
  mark.

## Wedge rotation (`rotation.test.ts`)

A wedge's `rotation` `r` turns it about its tip (section 6.6). The sine
`s` and cosine `k` of `r` degrees are each rounded to four decimal places,
ties to even, and read as doubles; the corners of the base lie at the
offsets across `13 × s − 3 × k` and `13 × s + 3 × k` and the distances
beyond the tip `13 × k + 3 × s` and `13 × k − 3 × s`, each added to the
tip's distance from the line before it becomes an ordinate, outwards on
the band's side. What proves it:

1. **The table.** The sines of 0 to 90 degrees, rounded, equal a reference
   computed to 60 digits (Machin's π and the sine's series) and rounded
   half to even: `0, 0.0175, 0.0349, …, 0.7071, …, 0.9998, 1` (all 91 in
   the test). No sine of a whole degree from 0 to 90 lies within 1e-9 of a
   halfway point between two four-place decimals (the closest lies 1.05e-6
   away), measured on `Math.sin`: the rounding breaks no tie, so engines
   whose sines differ in the last places round alike.
2. **All 361 angles.** For every whole `r` from −180 to 180, `s` and `k`
   are the reference's `S` by quadrant: `s = ±S(|r|)`, `k = S(90 − |r|)`
   up to 90; `s = ±S(180 − |r|)`, `k = −S(|r| − 90)` beyond; the sign of
   `s` that of `r`; neither is −0; −180 and 180 give the same `s` and `k`,
   so the same wedge. A rotation that is no whole number from −180 to 180
   (181, −181, 45.5, NaN) is refused with a `RangeError`.
3. **The seven stops**, their corners `(dx, out)`: 0 `(−3, 13)`, `(3,
   13)`; 90 `(13, 3)`, `(13, −3)`; −90 `(−13, −3)`, `(−13, 3)`; 180 `(3,
   −13)`, `(−3, −13)`, and −180 the same; ±45 and ±135 by the formula over
   `s = ±0.7071`, `k = ±0.7071`, written out in the test. The span across,
   `[min(0, dx1, dx2), max(0, dx1, dx2)]`: `[−3, 3]` at 0, `[0, 13]` at 90,
   `[−13, 0]` at −90.
4. **Both sides, in a drawing.** TimeToShare's `timestamp_wedge_rotation`:
   root `melody` (markers band below its line), its child `phrase`
   (markers band above its line, by its band order); `timestamp_1` to
   `timestamp_6` on `melody` turned −135, −45, 0, 45, 135 and 180 by
   addressed rules, `timestamp_7` and `timestamp_8` on `phrase` −45 and 45
   by addressed rules, `timestamp_9` on `phrase` 90 by the rule `{element:
   wedge, within: phrase}` alone, the `origin` and `length` wedges turned
   by no rule. Each wedge lies at its timestamp's abscissa `X` as its
   line's axis record lists it (`AxisTimestamp.x`), its tip `w / 2 = 1.5`
   from its line's ordinate `y` (both bands start at `c = 0`: `y + 1.5`
   below, `y − 1.5` above; the test states the 1.5 between the line's
   ordinate and `timestamp_3`'s tip below `melody` and `timestamp_7`'s
   above `phrase` first), each corner at `X + dx` and `y + (1.5 + out)`
   below, `y − (1.5 + out)` above, `(dx, out)` the rotation's, each
   ordinate summed in item coordinates (`y` less the `y` of `melody`'s
   card, 8) and drawn the card's `y` plus it (section 8.6); its style
   carries the rotation; the `origin` and `length` wedges have 0. So a −45
   wedge's base lies left of and below its tip on `melody`, left of and
   above it on `phrase`.

## Stacks carried by their wedges (`carry.test.ts`)

A named timestamp's labels stack at the thick end of its wedge, whether the
wedge is drawn or not (sections 6.4 Markers, 6.6 Labels of named timestamps
and Cross-section lines, 8.3); `stacks.ts` holds the four rules every band
and ancestor line uses, each proved on its own here and in drawings
elsewhere ("Named timestamps", "Ancestor lines", "Groupstamps"). The
oracle is the specification's text and values derived from it for the
figure `timestamp_wedge_rotation` (`t` computed by the formula below, in
its summation order, in binary64); `s` and `k` are the four-place sine
and cosine of "Wedge rotation", `h = h(9) = 10.4765625`.

- **Tiers** (`tiersOf`, section 6.3): one first fit of the stacks in order,
  each as wide as its widest label at its unturned place (`[x − w/2 − 1, x
  + w/2 + 1]`), a tier as many lines high as its highest stack, a stack's
  first line `n1 = m1 + … + m(k − 1) + 1`: stacks at 0 (one line, 10 wide),
  5 (three lines) and 100 (two lines) give tiers {0, 100} and {5}, the
  first lines 1, 3, 1 and `T = 5` lines; none gives none.
- **Unturned** (`carried` at 0): line `n` starts `tip + 13 + 2 + (n − 1) ×
  h` out, no carry across, outwards: a stack of two lines with `n1 = 2`
  and the tip 1.5 out starts at `1.5 + 13 + 2 + h` and `+ 2h`, its box
  from the first start to `+ 2h`.
- **Turned** (`carried`): `t = D + W / 2 × |s| + H / 2 × |k|`, `D = 13 + 2
  + (n1 − 1) × h`, `H` the stack's lines' height, `W` its widest label;
  the labels centred `t × s` across, the box's centre `tip + t × k` out,
  its lines from its side nearer the tip; for `k < 0` they start inwards.
  The values derived from it, each a stack of one label in tier 1 with the
  tip 1.5 out: `-45°` (`W = 19.19970703125`, the width the metrics give at size 9)
  at −45, `t = 25.492045092773434`, across `t × −0.7071`, starting `1.5 +
  t × 0.7071 − h / 2`; `180°` (`W = 21.67822265625`) at 180, `t =
  20.23828125`, no carry across, starting inwards at `1.5 − t + h / 2 =
  −13.5`; `135°` at 135, `t = 26.368324291992185`, across `t × 0.7071`,
  starting inwards at `1.5 − t × 0.7071 + h / 2`. Drawn in the figure
  (`melody`'s line at 56.9765625, its band below), the name labels lie at
  `x` 145.5112, 363.5366 and 332.1817, baselines 79.6177, 41.354 and
  42.9472, to four decimals.
- **The gap** (`gapOf`, section 6.6): from the smallest to the largest of
  the wedge's tip and corners out from the line, counted while it is drawn
  and the vertical meets its body, `|r| ≤ 12` or `|r| ≥ 168` (so 12, −12,
  168, −168 and 180 count, 13, −13, 167, −167 and 90 do not; the corners
  from `wedgeCorners`), and the box of its stack, counted while the stack
  lies across the tip's abscissa, `X + vx − W / 2 ≤ X ≤ X + vx + W / 2`.
  Unturned with a stack of one line: `[1.5, 1.5 + 13 + 2 + h]`; the wedge
  alone `[1.5, 14.5]`; the stack alone `[16.5, 16.5 + h]`; neither, none.
  At −45 a stack 19.2 wide is carried 18.03 across, beyond its half width,
  and the wedge's body leaves the vertical: no gap. At −20 a stack 40 wide
  is carried 9.15 across, less than its half width: its box alone.
- **The cut** (`cut`): the span less the gap as up to two pieces from the
  top, none of no length: `[0, 100]` less `[10, 20]` is `[0, 10]`, `[20,
  100]`; less `[−5, 10]`, `[10, 100]`; less `[90, 120]`, `[0, 90]`; less
  `[0, 100]`, nothing; less a gap touching an end from outside (`[100,
  120]`, `[−10, 0]`) or none, the span whole.

## Groupstamps (`groupstamps.test.ts`)

A named timestamp with `groupstamp: true` lies on a group's member (a
timeline the group's `members` list, or a descendant of one, drawn inside
the listed member's card `M`), and its line extends across every member of
each group whose frame draws it. The members of a frame share its start and
its length (section 8), so the timestamp's abscissa is one proportion of
every member's drawn length: the other members' coordinates and lines
derive from the group and are never stored. Its own line crosses `M`'s
card as every named timestamp's does ("Named timestamps"), cut by its gap.
The block draws, after every item and before the alignment anchors, for
each groupstamp listing `cross_section` and each frame that holds it,
vertical `cross_section` elements at the timestamp's line address `{id: X,
part: ["line"]}` and its abscissa there, spanning the frame's member cards
from the upper border of the topmost to the lower border of the bottommost
(each card's box as drawn in that frame), less `M`'s card, which its own
line crosses: up to two pieces, above `M`'s card and below it, without a
gap, crossing the secondary coordinates and whatever else lies there; in
the timestamp's line style, without a wedge or a label. Its own wedge
marks its primary coordinate and is turned by 0 unless a rule sets its
`rotation`. What proves it: positions derived from the other records of
the same drawing (the member lines' abscissas and ordinates, the member
cards' box records `{kind: card, key: {item: group_1, member: T}}` and
their `y` and `y + height`), never from the element itself; the element's
absence whenever the timestamp is no groupstamp, its line is not listed or
its line is hidden; and the order of elements. With `a(9) =
8.35400390625` and `h(9) = 10.4765625` every number but a turned wedge's
is dyadic, so the sums are exact; an ordinate is summed in item
coordinates, the distance out first, then the line's ordinate less the
top of `score`'s card, then that top.

The manifest is TimeToShare's `groups/group_groupstamp.yaml` with every
conversion map removed (`remove`): `group_1` ("Performance", display order
`score`, `performance`), `score` quarters 8, `performance` seconds 4.0,
the groupstamp `timestamp_1` "Bar 2" at 4 on `score` (`display` wedge,
name, cross-section line); the four `origin` and `length` timestamps are
no groupstamps. Below, `top(T)` and `bottom(T)` are the upper and lower
borders of `T`'s card in `group_1`'s frame; a stack of one label in tier 1
ends `1.5 + 13 + 2 + h(9)` below its line.

1. **Its own card and the frame.** At `x` the middle of `score`'s line
   (4 of 8), which is the middle of `performance`'s too (2.0 of 4.0):
   `timestamp_1`'s own line from `top(score)` to its wedge's tip, 1.5
   below `score`'s line, and from the end of its label "Bar 2" to
   `bottom(score)`; then, the last element of the drawing, the frame's
   line from `bottom(score)` to `bottom(performance)`; style stroke
   `#1BA1E2`, width 1, dash `3 3` (the default cross-section style).
2. **A member's descendant**: with a child `motif` (quarters, offset 2,
   length 4) added to `score` and a groupstamp `timestamp_6` "Motif" at 1
   on it, its lines lie at the abscissa of 1 on `motif`'s line (`score`'s
   abscissa of 3): from `top(score)` to the tip below `motif`'s line, from
   the end of its label to `bottom(score)`, then from `bottom(score)` to
   `bottom(performance)`.
3. **None**: `set timestamp_1 {groupstamp: false}` leaves its own two
   pieces alone; `{display: ["wedge", "name"]}`, or a rule `{addresses:
   [{id: timestamp_1, part: [line]}]}` setting `display: "none"`, leaves
   no element at the address.
4. **Its wedge is not turned** where no rule sets its `rotation`: its tip
   where the unturned mark of `score`'s line at its abscissa has it, its
   corners `∓ 3` across and `1.5 + 13` below the line, its style's
   `rotation` 0, its label's line starting at the mark's base plus 2; the
   `origin` and `length` wedges 0 too. An extra layer's rule `{element:
   wedge}` setting 0, and `set timestamp_1 {groupstamp: false}`, draw it
   alike.
5. **At any abscissa** (`groupCrossSections`, what the canvas marks for a
   position read across the group): at the abscissa of `timestamp_1` on
   `score`'s line key, one piece from `bottom(score)` to
   `bottom(performance)`, in the style of a cross-section line of `score`
   that no named timestamp holds; on a line in no frame (`nested`), none.
6. **Its secondary coordinates on the frame's other members** (section 2,
   6.6), with `timestamp_1`'s `display` `[wedge, name, coordinate,
   cross_section]`: by default only its primary wedge and its two labels
   are drawn, and `performance`'s card is as high as without them. With an
   extra layer's rule `{coordinates: secondary}` setting `display:
   inline`, `performance`'s markers band draws a second wedge at
   `timestamp_1`'s address at the same `x`, turned −45 (corners
   `wedgeCorners(−45)` out from its tip 1.5 below `performance`'s line),
   and its two labels, the coordinate label carrying 2 seconds, its value
   on `performance`'s axis; the stack lies in tier 1 (the `origin` and
   `length` labels lie at the ends), carried as "Stacks carried by their
   wedges" derives: `t = 15 + W / 2 × 0.7071 + H / 2 × 0.7071` (`W` the
   wider of the two labels, `H = 2 h(9)`), both labels at `x + t ×
   −0.7071`, their baselines at `1.5 + t × 0.7071 − H / 2` and `h(9)`
   further below `performance`'s line, plus `a(9)`. Shown, the stack takes
   room: `performance`'s card grows by one `h(9)`. The frame's line still
   runs uncut from `bottom(score)` to the new `bottom(performance)`.
7. **A secondary coordinate's label is written in its timeline's number
   type** (section 2, "read on that timeline's axis"; core's `cardStamps`
   derives the value, "Secondary coordinates" there): with a groupstamp
   `timestamp_6` "Beat" added on `performance` at the float 1.0, `display`
   `[wedge, coordinate]`, and the same rule, its secondary coordinate on
   `score` (fraction) lies at 1.0 / 4.0 × 8 = 2 quarters, and its
   coordinate label reads `2 ♩` with the coordinate `{unit: quarters,
   value: 2}`, the exact 2 (a `Rational`), as the coordinate flag's row for
   `score` reads it, never the float label `2.0 ♩`. Its primary label on
   `performance` follows, unchanged: `1″` (a whole float in seconds, a
   clock, drawing.md §5.2), the coordinate the float 1.0. In drawing
   order: `score`'s card first.
8. **A length of the group not known** (section 6.6): a group maps a
   position by the proportion of its members' lengths and never carries
   one member's length to another, so where the length of a member, or of
   the member `M` the groupstamp lies on, is not known, the groupstamp has
   no coordinate on that member; it is still drawn where the drawn lengths
   (a reach) place it, and the undefinedness is shown by a rule of the
   drawing: opacity `FADED_OPACITY` (0.35, the defaults' opacity of
   ancestor lines) in place of the cascaded one. With `performance`'s
   length `null` (its reach 4.0, its `length` timestamp's, so every
   abscissa is item 1's): `timestamp_1`'s own two pieces on `score`'s card
   are item 1's, and the frame's line is cut at `top(performance)`: from
   `bottom(score)` to `top(performance)` in the default style, then from
   `top(performance)` to `bottom(performance)` in that style with opacity
   0.35; with a rule setting the line's opacity 0.5, the first piece keeps
   0.5 and the second is 0.35 (replaced, not multiplied). With `score`'s
   length `null` instead (`M` of unknown length, its reach the exact 8 of
   its `length` timestamp) the frame's line is one piece, whole and uncut,
   from `bottom(score)` to `bottom(performance)`, at 0.35. With item 6's
   display and rule, in either case `performance`'s secondary wedge is
   drawn at item 6's place with opacity 0.35, and its stack holds the name
   label alone, no coordinate label. What proves the fading and the missing
   label is the drawing of the same manifest with both lengths known (item
   6) read as the oracle: every other property of the wedges equal, the
   secondary one's opacity 0.35.
9. **On an ancestor line** (section 8.3): `groups/group_child_member_stamps.yaml`
   (`group_1` of the child `middle`, quarters 8 at 4 in `piece` 16, and
   `recording`, seconds 10.0), with a groupstamp `Half` added on
   `recording` at the float 5.0 (`display` wedge, name, coordinate) and the
   rule of item 6: on `middle`'s card its secondary coordinates lie on
   `middle`'s line and on its ancestor line `piece`. With `recording`'s
   length known the two wedges have their cascaded opacities (the ancestor
   line's 0.35, then 1) and three coordinate labels are drawn (its primary
   one and two secondary ones); with it `null` (its reach 10.0, its
   `length` timestamp's) the same wedges at the same places, both secondary
   ones at 0.35, and its primary coordinate label alone.
10. **At any abscissa, a length not known** (section 6.6; a coordinate
    is placed wherever it is seen): the lines `groupCrossSections` gives
    at `timestamp_1`'s abscissa on `score`'s line key are the pieces the
    frame's line of item 8 draws there, piece for piece: the same `x`,
    `y1`, `y2` and opacity. With `performance`'s length `null`, two
    pieces, from `bottom(score)` to `top(performance)` at opacity 1 and
    from `top(performance)` to `bottom(performance)` at 0.35; with
    `score`'s `null`, one piece from `bottom(score)` to
    `bottom(performance)` at 0.35. The oracle is the card records of the
    same drawing; both readers are compared with it, so neither is read
    off the other.

## Alignment anchors (`anchors.test.ts`)

A named MatchStamp's alignment anchor `A` joins the cross-section segments
of its two match timestamps (section 8.7): a timestamp has one segment in
every card that draws its timeline's line (its segment line's for a
segment without a line), or its timeline as an ancestor line where its
position lies within the member's span (section 8.3), never in an
ancestor card (section 8.8): the card's span at its `X`, from its upper
border to its lower border, its gap included, whether or not its
cross-section line is displayed. The line `{id: A}` is the shortest between
one segment of each, the label `{id: A, part: [name]}` the MatchStamp's
name centred on its midpoint, baseline `ym + (a(9) − d(9)) / 2 = ym +
3.11572265625`; both drawn after every item (lines, then labels), neither
taking room. A match timestamp without a name draws no name label.
Manifests are fixtures, or fixtures with match timestamps and one
MatchStamp written onto them and validated (`matchstamp: true`, the
complete form); card spans are read off the drawing's card boxes.

- **`anchorLine` alone**, segments written `(x, [y1, y2])`: overlapping
  `(1, [0, 10])` and `(5, [4, 20])` give the horizontal line at `(4 + 10) /
  2 = 7`, from `(1, 7)` to `(5, 7)`; two points at one ordinate `(2, 5)` to
  `(6, 5)`; `A` above `B`, `(0, [0, 2])` and `(3, [5, 9])`, from `A`'s lower
  end `(0, 2)` to `B`'s upper `(3, 5)`; `A` below, `(0, [10, 12])` and `(3,
  [1, 4])`, from `(0, 10)` to `(3, 4)`. Of the points `(0, 0)` and `(0, 100)`
  against `(10, 90)` the second pair (square 200 against 8200); of equal
  squares the first of the first timestamp's (`(0, 0)`, `(20, 0)` against
  `(10, 0)`: from `(0, 0)`), then of the second's (`(0, 0)` against `(10, 0)`,
  `(−10, 0)`: to `(10, 0)`). Two equal points give the line of no length;
  no segment on either side gives none.
- **`bundle_matchstamps`**, three ungrouped roots. The widest name `Take 1`
  (`A = 6906`, `N = 37.0927734375`) puts `x0 = 16 + N + 8 =
  61.0927734375` in every card. The title `MatchStamps` puts the first
  card at `Pt = 8 + h(11) + 8 = 28.8046875`; every card is `bare`'s, `Hc =
  49.37890625` high, its line `14.40234375` below its top: `score`'s card
  from 28.8046875 to 78.18359375 (line 43.20703125), `take_1`'s from
  86.18359375 to 135.5625, `take_2`'s from 143.5625 to 192.94140625.
  `timestamp_1` lies at 4 of 8 quarters, `x0 + 200 = 261.0927734375`;
  `timestamp_2` at 88200 of 352800 samples and `timestamp_3` at 99225 of
  396900, both a quarter, `x0 + 100 = 161.0927734375`. Each segment is its
  card's span. `anchor_1` (`[line, name]`) runs from the bottom of
  `score`'s card, `(261.0927734375, 78.18359375)`, to the top of
  `take_1`'s, `(161.0927734375, 86.18359375)`; `anchor_2` (`[line]`) from
  the same point to the top of `take_2`'s, `(161.0927734375, 143.5625)`.
  The label `Bar 2, downbeat (take 1)` lies at `x = 211.0927734375`, `ym =
  82.18359375`, baseline 85.29931640625. The last three elements are the
  two lines and the label; the block's record holds every element; the
  block stays `W = 8 + (8 + 490.71630859375 + 2) = 508.71630859375` by `H =
  8 + (143.5625 + 49.37890625 + 2) = 202.94140625`, as without them. The
  default rule (section 4) styles the lines `#1BA1E2`, width 1, dash `3
  3`; the label takes fill `#000000` and size 9 from the label rule, the
  rest from its line. The cross-section lines: `timestamp_1` and
  `timestamp_2`, listing `cross_section` alone and nameless, cross their
  cards whole; `timestamp_3` draws its name below `take_2`'s line in tier
  1, its band starting at 0, so its line runs from the card's top to `1.5
  + 13 + 2` below the line and from `h(9)` further to the card's bottom;
  `timestamp_1` draws no name label. `crossSectionSegment` at 100 on
  `score`'s line is `score`'s card span at 100, and none for a key naming
  no line. Hiding `{id: anchor_1}` keeps its label in place; hiding `{id:
  anchor_1, part: [name]}` keeps both lines.
- **`nested`** with match timestamps on the root `clt_1` at 8 (`x0 + 25 × 8
  = 249.91552734375`) and on `clt_2` at 1 of its own axis, `3/2 + 4 + 1 =
  13/2` of the root's (`212.41552734375`): both lines cross the one card
  whole, so their segments are the same span and overlap: the anchor is
  horizontal at the card's middle, `(top + bottom) / 2`, from
  `249.91552734375` to `212.41552734375`. Hiding the root's cross-section
  line leaves `clt_2`'s and keeps the anchor.
- **`bundle_shared_member`**, `t` a member of `g1` and of `g2`, with match
  timestamps at the half of `t` (4 of 8), `u` (2.0 of 4.0) and `v` (400 of
  800), all at `x0 + 200 = 302.29150390625` (`x0 = 24 + N(Performance) + 8`,
  `A = 13087`, `N = 70.29150390625`). `t`'s two segments are its cards'
  spans in `g1` and in `g2`, in that order. `t`–`u` takes `t` in `g1`, from
  the bottom of that card to the top of `u`'s; `v`–`t` takes `t` in `g2`,
  from the top of `v`'s card to the bottom of `t`'s there, each from the
  first timestamp's end. An anchor displaying `[name]` alone draws its
  label, centred on the middle of the bottom of `t`'s card in `g1` and the
  top of `u`'s, and no line; `t`'s nameless match timestamp listing `name`
  draws no name label.

## Timelines of unknown length (`unknown.test.ts`)

Every end rule of section 6.6 is drawn. `unknown_length`'s root is scaled
to its reach (`score` from 53.798828125, running on to 465.798828125), with
its `origin`'s wedge and `0 ♩` only (a root of unknown length has no
`length` timestamp), its outer chevron's tip setting `W =
500.298828125`; empty, it is drawn `L` long; locked, it still ends in three
chevrons. `corpus_score_ms3` without its children draws the same flow
control (the flow marker `flow_marker_1`, then the jump origins `jump_from_2`,
`jump_from_1`, `jump_from_3`, `jump_from_4`) with its length set to null, `jump_from_4` at 37
in its reach; without `jump_from_4` too, it draws the same flow control at
length null as at length 30, the coordinate of the jump target `jump_to_2`,
which draws nothing: every flow-control coordinate counts, and a measure
map, which belongs to no timeline, does not. A child of unknown length ends at its offset plus its reach,
open, with room for its chevrons, `9.5w`; a group member runs on at the
shared end; a segment ends at the next one's start, the last at its
segment line's end. Ancestor lines run on where the member's or the
ancestor's length is not known and end short of the member where a
timeline between has no length. Counting reads of a timeline's children
proves that its reach is computed once per drawing.

## The block (`block.test.ts`, `groups.test.ts`)

Section 8 draws every manifest as one block: a manifest of one root as a block
holding it ungrouped, one of one group as a block holding its frame; a
manifest with neither a `name` nor an `id` has no title. Positions are
checked against the quantities below, derived from sections 8.1, 8.2 and
8.4, the advance widths and the member heights `Hm` of section 6.5 (with
the ancestor bands of section 8.3); the drawing fixtures pin the same boxes
byte for byte. Order is checked against sections 7.2 and 8.5, and
`Drawing.boxes` holds one `DrawnBox` per container, the block first, then in
drawing order each frame, card and band, each naming its holder. A record's
`range` is the half-open range of `elements` it emitted, whatever is
displayed; `displayed`, stated on every record, says whether its own
rectangle opens that range:
always for the block, for a frame or card unless its style hides it, never
for a band. Every value is dyadic, so every sum is exact. A rectangle
spanning `a..b`, `c..d` is `{x: a, y: c, width: b − a, height: d − c}`. A
card's shadow, 2 right and 2 down, is its first descriptor, and its edges
enter `Wb` and `Hb`.

**The quantities.** One horizontal layout for the whole block (section 8.2),
in item coordinates: the name column `n` (`Q + K = 16` when the block holds a
frame, else `K = 8`), `N` the widest drawn name, the start `s0` past the
name column, the gap `G' = 8` and `8 wa` for an ancestor running on to the
left, the right margin `Mr`, the largest `e − (s0 + Li)` over the member
drawings, and item `i`'s right edge `Ri = s0 + Li + Mr`, or its title's
right edge when larger. At the default place `x = P = 8`: `xn = 8 + n`, `x0
= 8 + s0`, `R = 8 + Ri`. Common values: `P = Q = K = 8`, the gap after the
manifest's title `F = 8`, the frame's spacing `Sf = 8`, the title gap 4,
`a(11) = 10.21044921875`, `h(11) = 12.8046875`. Every root of these
fixtures has its named timestamps `origin` and `length` (each a wedge and a
coordinate label) unless its length is unknown (`origin` alone). A member
drawing with their two wedges below in one label tier is `Hm = 14.40234375 + 26.9765625 + 8 =
49.37890625` high with no ancestor. Its ancestor lines, in the default band
orders, lie below it, beyond those wedges (section 8.3): the band starts at
`max(7, 26.9765625 + 4) = 30.9765625` and each row with labelled marks adds
`7 + 26.9765625`, so `Hm = 14.40234375 + 64.953125 + 8 = 87.35546875` with
one ancestor row and `14.40234375 + 98.9296875 + 8 = 121.33203125` with two,
the member's line at `y_root = 14.40234375` and the nearest ancestor's
37.9765625 below it. One map above gives `y_root = 14.5`, `Hm =
49.4765625`, and with one ancestor row below `Hm = 14.5 + 64.953125 + 8 =
87.453125`. Maps end at their line's `Xe` and change no
horizontal quantity.

Per case, `xn`; `x0`; `R`, with what sets it; the member drawings'
heights; and `W`, `H`, with what sets them:

- `bare`: 16; `16 + 25.5771484375 + 8 = 49.5771484375`; the arrowhead's
  tip 458.5771484375; 49.37890625; 476.5771484375, 67.37890625, set by the
  shadow.
- `group_child_member`: 24; `24 + 64.61962890625 + 8 + 24 =
  120.61962890625`; 529.898681640625 (`second-half`'s end
  mark `16 ♩` on `piece`'s line, 18.55810546875 wide; `recording`'s end
  label `10″` reaches only 528.026611328125); 87.35546875, 49.37890625;
  553.898681640625, 193.5390625, set by the frame.
- `group_parents_mixed`: 24; `24 + 57.0302734375 + 8 + 24 =
  113.0302734375`; 546.947265625 (`1 323 000 smp`); 87.35546875, 87.453125,
  87.35546875, 49.4765625; 570.947265625, 384.4453125.
- `group_grandchild`: 24; `24 + 55.70361328125 + 8 + 24 =
  111.70361328125`; 535.70361328125 (`score`'s outer chevron, `x0 + L +
  8w`); 121.33203125, 49.37890625; 559.70361328125, 227.515625.

A frame at `(P, P)` spans `0` to `Ri + K + Q` and `Q + h(11) + 4 + Σ Hm +
(m − 1) Sf + Q` high for `m` cards; its title lies at `x = P + Q = 16`,
baseline `P + Q + a(11) = 26.21044921875`; its cards span `Q` to `Ri + K`,
the first at `P + Q + h(11) + 4 = 32.8046875`, each further one `Sf` below
the last; each root line lies `y_root` below its card's top. A block-held card
spans `0` to `Ri + K`, `Q` further when the block holds a frame, so frames and
cards of one length end at one x.

**`bundle_mixed`** ("Mixed", no `id`; frames `group_1` with `score`,
`performance` and `group_2` with `page`, `excerpt`, a child of `recording`
at 44100 samples drawn under `recording`'s ancestor line; the ungrouped
root `annotations`) is the case of every rule at once:

- `n = 16`; `N = 70.29150390625` (`Performance`); `recording` runs on to
  the left, so `s0 = 16 + 70.29150390625 + 8 + 24 = 118.29150390625`.
- `Mr = 29.62353515625`, half of `excerpt`'s end mark label `132 300 smp`
  (59.2470703125) past the shared end; every item has `Ri =
  547.9150390625`, every member's card is 547.9150390625 wide.
- Heights: `score` 78.953125 (two maps, `y_root = 19.5`; its flow control
  band from 30.9765625, 20.4765625 wide), `performance` and `page`
  49.4765625, `excerpt` 87.453125, `annotations` 71.85546875 (its two
  regions share one row, 18.4765625 wide, from 30.9765625).
- The title at `(8, 18.21044921875)`, `Pt = 8 + h(11) + 8 = 28.8046875`;
  `group_1` at 28.8046875, 169.234375 high, its cards at 53.609375 and
  140.5625; `group_2` at 206.0390625, 177.734375 high, its cards at
  230.84375 and 288.3203125; `annotations`' card at 391.7734375. Every line
  runs from 126.29150390625 to 526.29150390625; `W = 581.9150390625`, `H
  = 473.62890625`, both from `annotations`' card's shadow.
- Element order: the block, the title, `group_1`, its title, `score`'s
  card, `score`'s maps `cmap_1` and `cmap_2`, its jump origin
  `jump_from_1`, its line, …, `excerpt`'s card, `excerpt`'s map `cmap_6`,
  `recording` (the ancestor line), `excerpt`, …: a member drawing opens with
  its flow markers, maps, regions and jumps, its ancestor lines just before
  its line. The member drawings of `performance` and `page` open with their
  maps `cmap_3` and `cmap_4`, `annotations`' with its regions `region_1` and
  `region_2`.
- Records: a root with `origin` and `length` emits 6 elements, each map 1, each
  region or jump 2, each ancestor row 6. So of 58 elements: the block `[0,
  58)`, key and holder null, address `{}`; `group_1` `[2, 23)` holding the
  cards of `score` `[4, 15)` and `performance` `[15, 23)`; `group_2` `[23,
  47)` holding the cards of `page` `[25, 33)` and `excerpt` `[33, 47)`;
  `annotations`' card `[47, 58)`. A frame's key is `{item: G}`, its address
  `{id: G}`; a member's card's key `{item: G, member: T}`, its holder its
  frame's key `{item: G}`; `annotations`' card's key `{item: annotations}`,
  its holder null.
  The frames and `annotations`' card are the items and carry `item`, their
  place; every card carries `card`, its size in item coordinates (a
  member's card `{547.9150390625, Hm}`), its `spacing` 4 and its request
  `{}`, and its rectangle is its drawn one. Every band is held by the card
  whose member drawing draws its line, its holder that card's key, and its
  range is empty.

**Hidden titles.** With `{addresses: [{id: group_1, part: [name]}]}
display none` on `group_child_member` the frame loses its title slot: cards
at 16 and 107.953125, the frame 157.33203125 high, `H = 173.33203125`. With
`{addresses: [{part: [name]}]} display none` on `bundle_mixed` everything
below moves up by `h(11) + F = 20.8046875`: `annotations`' card at
370.96875, `H = 452.82421875`.

**Hidden cards and frames keep their place** (section 8.4): not drawn, but
their edges enter `Wb` and `Hb`, a hidden card's shadow does not, and every
other element stays as it is.

- `bare` with `{element: card} display none`: `Wb = 474.5771484375`, `Hb =
  65.37890625`; the card's range `[1, 7)`, its 6 elements.
- `group_child_member` with `{element: card} display none`: the frame still
  sets `W` and `H`; the cards' ranges `[3, 15)` and `[15, 21)`, the frame's
  `[1, 21)`.
- `group_child_member` with `{element: frame} display none`: `xn = 24`, the
  cards at `x = 16`, `W` and `H` from the frame's edges; the title moves to
  1, the cards `[2, 15)` and `[15, 22)`, the frame `[1, 22)`.

**The block size.** `W = max(Wb, width)`, `H = max(Hb, height)`: `bare` at
600 and 100 gives 600 and 100, every other element unchanged; at 300 and 20
it gives `Wb` and `Hb`; at 600 and null `H = Hb`. The block padding `P`
changes with no spacing: `bare` at the block's `spacing` 24 and its card's 0
keeps its card at `y = 8`, `Hm = 49.37890625`, `H = 67.37890625`.

**Addresses (section 2.2).** `corpus_mpm`'s map `tmap_1`, of the root
`score:clt_1`, is `{id: tmap_1}`; a region `region_1` added into the member
`second-half` of `group_child_member` is `{id: region_1}`, its label `{id:
region_1, part: [label]}`, and these two are the only elements whose
address carries that ID. Every card of `M` is `{id: M, part: [card]}`,
whether `M` is a member or an ungrouped root, its place key telling cards
apart; a member's wedges are `{id: M, part: [start]}` and `{id: M, part:
[end]}`, on its own line and as marks on its ancestors'.

**Cards and frames in the tree (sections 2.1 and 8.1).** A card belongs to
its timeline and has its domain: `{element: card, domain: physical} fill
#ABCDEF` fills `recording`'s card and not `second-half`'s. A card holds
nothing: `{inside: card} stroke #123456` reaches no element. With layers
holding no defaults (`groups.test.ts`):

1. **The frame holds its title, cards and its members' lines.** With `{element:
   frame} {stroke: #123456, font-size: 13}`, `group_child_member`'s members'
   lines, `group_1`'s title and the cards take the frame's stroke and
   font size; the ancestor line `piece` takes them from its member, and
   `piece`'s name from the ancestor. With `{addresses: [{id: second-half}]}
   {stroke: #654321}` instead, `piece` is `#654321` and `recording` keeps
   `none`; so does `second-half`'s card, a sibling of the line.
2. **The block holds the manifest's title, the frames and the block-held cards
   and lines.** With `{element: block} {stroke: #111111}` on `bundle_mixed`,
   the title, `group_1`, `annotations`' card and `annotations` take
   `#111111`; with `{addresses: [{id: annotations, part: [card]}]} {stroke:
   #222222}` the line `annotations` keeps `none`.

## Places (`places.test.ts`)

Sections 1, 8.4 and 8.6: every item applies the block's one horizontal layout
at its own place, and the block grows in every direction to hold the items.
An item is laid out in item coordinates and each position `u` drawn at `x +
u`; its default `y` lies the block's spacing (8) below the largest bottom
edge before it (its requested height included, no shadow), summed in place
coordinates; `Xl =
min(0, smallest x − P)`, `Yt = min(0, smallest y − Pt)`, `Pt = P + h(s) +
F` under a displayed title and `P` otherwise, each plus the block's margin
(0 here; "Margins" below); the place origin `(0 − Xl, 0
− Yt)`, so a zero origin is `+0`, is added to every finished position last;
the title lies at `(Xl + P, (Yt + P) + a(s))`; `Wb = (P + largest right
edge) − Xl`, `Hb = (P + largest bottom edge) − Yt`, shadows and the title
included, the block's margin added to the largest item edge. The fixtures `bundle_mixed__places` and
`bundle_ungrouped__places` pin the drawn elements; here the records' places
and the sums are proved, two of them with a fractional origin that tells
the order of the sums apart.

- **Defaults reproduce the stacked block.** `bare`'s records: the block `{0, 0,
  476.5771484375, 67.37890625}` `[0, 8)` and its card at `(8, 8)`,
  `458.5771484375 × 49.37890625`, `[1, 8)`, its place `{8, 8, 400, 1, 4,
  458.5771484375, 49.37890625}` (as `{x, y, length, scale, spacing, width,
  height}`, the spacing a card's default 4) stated `{}`; the origin `(+0,
  +0)`. `group_child_member`'s frame `{8, 8, 400, 1, 8, 537.898681640625,
  177.5390625}` (a frame's default spacing 8), `[1, 23)`. Stating
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
  card `418.29150390625 + 29.62353515625 + 16 = 463.9150390625` wide;
  origin `(38, 0)`, `Wb = (8 + 740) + 38 = 786`, `Hb = 467.58984375`. Every
  item's lines start at the block's one start, each at its own length.
- **`bundle_ungrouped__places`** (`{score: {x: −60, y: −150, height:
  120}}`; no frame, `s0 = 71.70361328125`, every card 509.3271484375
  wide, `score` 84.4296875 high on its own and 120 by request): origin
  `(68, 178.8046875)`, the title pushed up with the block's top to `(8,
  18.21044921875)`, `score`'s card at `(8, 28.8046875)`, `W =
  595.3271484375`, `H = 338.5390625`; the other items keep their default
  places.
- **A frame's own length and height request, a card's width request**
  (`bundle_mixed` at `{group_1: {length: 300, height: 200}, annotations:
  {width: 600}}`): `group_1`'s lines end at 426.29150390625, the frame `{8,
  28.8046875, 463.9150390625, 200}`; `group_2` at 236.8046875;
  `annotations`' card at 422.5390625, `Ri = 600 − K − Q = 584`, exactly 600
  wide (without the inset `Q` it would be 608); `W = 618`, `H =
  504.39453125`.
- **A fractional origin: the shift is added last.** `bundle_ungrouped` at
  `{score: {x: −60.33, y: −150.33, height: 120}}`: origin `(68.33,
  179.1346875)`, every card keeps 509.3271484375 (laid out from the
  shifted `x` it would be 507.89672851562506), `recording`'s line at
  293.89250000000004, `Wb = 595.6571484375`, `Hb = 338.86906250000004`.
  `bundle_mixed` at `{group_1: {y: 10.11}, annotations: {x: 560, y:
  −40.1}}`: `Oy = 68.9046875`, `group_2`'s default `y` `(10.11 + 169.234375)
  + 8 = 187.344375` in place coordinates, drawn at 256.24906250000004
  (256.2490625 if summed after the shift).

## One layout, scales, card sizes and spacings (`items.test.ts`)

Sections 8.2, 8.4 and 8.6: the name column, the start and the right margin
are found once over every item; an item's scale scales every position and
length about its top left corner and nothing else; a member's card request
widens and heightens that card and its frame; each container's `spacing`
is the gap between its own contents and multiplies no other. The records report what was stated and what was drawn, in item
coordinates. `bundle_ungrouped`'s quantities are those of "Places".

- **One layout.** `bundle_ungrouped` without `score`: `pages` takes the
  widest name and the margin from `recording`, its line from
  79.70361328125, its card 509.3271484375 wide; `W = 527.3271484375`,
  `H = 159.734375`. Two items of one length are equally wide wherever they
  lie (`{recording: {x: 100}}`: from 171.70361328125); a stated length
  keeps the shared name column (`{recording: {length: 200}}`: the card
  309.3271484375 wide).
- **The title in its slot.** `{pages: {y: 20}}`: `Oy = 8.8046875`, the
  title's baseline 18.21044921875, the items at 20, 91.453125 and
  148.9296875 in place coordinates, `H = 252.1640625`.
- **Scale.** `bare` at `{bare: {scale: 2}}`: the card `{8, 8,
  917.154296875, 98.7578125}`, its shadow offset 4, stroke 1.5, `rx` 10;
  the name at `x = 24`, baseline 44.4208984375, size 22; the wedge at
  91.154296875 from 39.8046875 to 65.8046875, base 12; the line to
  891.154296875 at width 6; `W = 937.154296875`, `H = 118.7578125`; the
  place `{8, 8, 400, 2, 4, 458.5771484375, 49.37890625}`, its size before
  the scale. `bundle_ungrouped` at `{recording: {scale: 1.5}}`: `score`'s
  default top `(100.2578125 + 1.5 × 49.4765625) + 8 = 182.47265625`, the
  dash `4.5 4.5`, the name size 16.5.
- **A member's card size** (`group_child_member`, `{group_1: {cards:
  {recording: {width: 650, height: 120}}}}`): `recording`'s card `{16,
  128.16015625, 650, 120}`, the
  frame `{8, 8, 666, 248.16015625}`, `W = 682`, `H = 264.16015625`; the
  cards' records, keyed `{item: group_1, member: second-half}` and `{item:
  group_1, member: recording}`, held by `{item: group_1}`: `second-half`
  `{521.898681640625, 87.35546875}` `[3, 16)`, `recording` `{650, 120}` stated
  `{width: 650, height: 120}` `[16, 23)`. A member's entry (under its
  group's entry's `cards`, by member ID) is read for `width`, `height` and
  `spacing` alone: one also stating `x`, `y`, `length` and `scale` draws as
  the one stating `width` alone; a
  request no larger than the card changes nothing; under the group's scale
  2 the card is drawn 1300 wide and its record keeps `{650, 49.37890625}`.
- **Spacings.** The block's spacing 24 (`bundle_ungrouped`) moves the items
  at their default `y` alone: `pages` at 28.8046875, `recording` at
  `28.8046875 + 63.453125 + 24 = 116.2578125`, `score` at `116.2578125 +
  49.4765625 + 24 = 189.734375`, every card's record as at 8, `H =
  284.1640625`; with `{recording: {y: 40}}` `recording` keeps its stated
  40 and `score` lies 24 below the larger bottom edge, `pages`' 92.2578125:
  116.2578125. A block-held card's spacing 8 (`score`) widens only its own
  gaps: its flow control band from `26.9765625 + 8`, its flow row
  45.453125 out, the band `10.4765625 + 12 + 2 + 10.4765625 = 34.953125`
  wide, `Hm = 14.5 + 69.9296875 + 8 = 92.4296875`, its line at 172.234375,
  the flow marker from 217.6875 to `157.734375 + 8`, `H = 260.1640625`; `pages`
  and `recording` unchanged, the records `spacing` 4, 4 and 8. A frame's
  spacing 16 (`group_child_member`) lies between its cards alone:
  `recording`'s card at `8 + (((8 + 12.8046875) + 4) + 87.35546875 + 16) =
  136.16015625`, the frame `185.5390625` high, `H = 201.5390625`, both
  cards' spacing 4. A member's card spacing 8 (`{group_1: {cards:
  {second-half: {spacing: 8}}}}`, one ancestor row below its line) starts
  its ancestor band at `max(18 / 2, 26.9765625 + 8) = 34.9765625`, the
  row's pitch `max(18, h(9)) = 18`, its halves 9 and 26.9765625: `Eb' =
  70.953125`, `y_root = 14.40234375`, `Hm = 93.35546875`, its line at
  47.20703125, `piece` 43.9765625 below it at 91.18359375, `recording`'s
  card at 134.16015625, the frame 183.5390625 high. All three together,
  with the block's spacing 24 on the one frame, give the cards 93.35546875
  and 49.37890625 at spacings 8 and 4, `recording`'s card at 142.16015625
  and the frame 191.5390625 high: no spacing multiplies another.

## Margins (`margin.test.ts`)

Sections 1, 6.4, 6.5, 8.4 and 8.6: a container's `margin` is empty space
inside its padding, above its first content and below its last, so it
makes the container exactly `2 × margin` higher, moves everything inside
it exactly `margin` down, and changes no width and nothing outside it but
what lies below it. Every value here is a sum of dyadic numbers, so each
"exactly" is binary64 equality. The proof compares a drawing at margin 12
with the same drawing at margin 0, element by element: an element inside
the container must equal the margin-0 element moved by `(0, 12)` (layout's
own `placedAt`, so every ordinate of every element type is checked), the
container's own rectangle keeps its `x`, `y` and `width` and is 24
higher, and what lies before it (a frame's title) is unchanged. A
fixture-shaped restatement cannot pass this: every element of the drawing
is compared.

- **The block** (`bare`, placement `margin: 12`): the block is
  `476.5771484375` wide at both, `67.37890625 + 24 = 91.37890625` high;
  the card at `y = P + 12 = 20` (its default top, the block having no
  title), its height 49.37890625 unchanged; every element but the
  background moved by `(0, 12)`, the line at `22.40234375 + 12 =
  34.40234375`; the place origin `(+0, +0)` at both, since the margin lies
  between the top padding and the item.
- **A frame of one card** (`bare` made the one member of a group `g`
  through `add group`, `{g: {margin: 12}}`): the frame keeps `x`, `y` and
  width and is 24 higher, its title unchanged; the card and everything in
  it moved by `(0, 12)`; the block 24 higher, as wide.
- **A card of one row**, block-held (`bare`, `{bare: {margin: 12}}`): the
  card at `y = 8`, `49.37890625 + 24 = 73.37890625` high, the line at
  34.40234375, the block 91.37890625 high and as wide; its record states
  `margin` 12. Held by a frame (`g` above, `{g: {cards: {bare: {margin:
  12}}}}`): the card and the frame each 24 higher, the frame's title
  unchanged, everything in the card moved by `(0, 12)`.
- **A member with an ancestor band** (`group_child_member`, `{group_1:
  {cards: {second-half: {margin: 12}}}}`): `second-half`'s card `87.35546875
  + 24 = 111.35546875` high, everything in it, its ancestor line `piece`
  included, moved by `(0, 12)`; `recording`'s card and everything in it
  moved by `(0, 24)`, the card from 128.16015625 to 152.16015625; the frame
  `177.5390625 + 24 = 201.5390625` high.
- **Flow markers** (`flow_control`, its root `flow:quarters` at `{margin:
  12}`): the root's flow marker runs to `P + V` and `Hc − P − V` (section
  6.4), so it too is moved by `(0, 12)`, both its ends; the card is 24
  higher. Only the flow marker is compared there: a jump's arrowhead
  corners are rotated points, not dyadic, so a jump drawn 12 lower is not
  the jump moved by `(0, 12)` to the last bit.
- **Margin 0 draws as no margin**: `bundle_mixed` with the placement's
  margin, each item's and each member card's stated 0 draws exactly the
  elements, width and height of `bundle_mixed` with none stated (the
  drawing fixtures pin margin 0 byte for byte).
- **The records**: every block, frame and card record carries its
  `contentCount`, the number of its contents (section 1), counted where
  layout lays them out: the block its items (`bare` 1), a frame its cards
  (`g` 1), a card its root's row, its root's present bands and its
  ancestor bands, one on each side holding an ancestor line (none, one or
  two; `group_grandchild_parent_on_top`'s `theme` 4, under "Ancestor
  lines"): `bare` 2 (row, markers band); in
  `group_child_member` `second-half` 3 (row, markers, ancestor band) and
  `recording` 2; in `bundle_mixed` `score` 4 (row, markers, conversion
  maps, flow control), `performance` and `page` 3 (row, markers,
  conversion maps), `excerpt` 4 (row, markers, conversion maps, ancestor
  band). A card's record carries its `margin` (stated, else 0), an item's
  record place `margin` beside `spacing`.

## Container records and axes (`records.test.ts`)

A band's record says where the band lies, from the band layout of section
6.4, and which card holds it; every drawn line has an axis whose ends are
its semantic start and end.

**Bands.** A band record, addressed `{id: T, facet: F}` with key null,
carries its timeline `T`, its facet `F`, signed level, `line` (the ordinate
of its timeline's line), `elements` (the displayed elements it holds
directly: no label but a named timestamp's, which its markers band holds,
so a markers band with `origin` and `length` holds 4), its holder (the place key of the card of the member
drawing its line lies in: `{item: T}` for an ungrouped root's) and its
rectangle: from its start `c` to its outer edge `E` beyond the line `yl`,
along its timeline's extent from `x0 + a` to `x0 + b`, drawn as its card
is. A band draws nothing: no element's address carries a facet, and its
range is empty, at its card's end. The table names each band by its
timeline and facet.

| case | records |
|---|---|
| `styled__score` (`x = 89.951171875`, width 416.2578125, `line` 62.640625) | `score` children level 2, 1 element, `y` 16, 14 high; markers 1, 4, 34, 28.640625; conversion maps −1, 1, 62.640625, 7; regions −2, 1, 73.640625, 19.640625; flow control −3, 1, 97.28125, 21.640625 |
| `r` with the child `c` and its region, defaults | `r` children 1, 1, `y` 16, 14; `r` markers −1, 4, 37, 26.9765625; `line` 37, `x` 22.6318359375, width 414.83203125 |
| the same with `c`'s regions band shown (`{addresses: [{id: c, facet: regions}]}`) | `r`'s at `line` 53.9765625, the children band 30.9765625 high; `c` regions −1, 1, held by `r`'s card `{item: r}`, `x` 130.0478515625, `y` 28.5, 200 × 18.4765625, `line` 23 |
| the same, `r` hidden | none: a hidden line hides its timeline's whole drawing; the card 16 × 28.8046875 alone, the block 34 × 46.8046875 |
| the same at `{r: {x: −12, y: −20, scale: 2}}` | origin `(20, 28)`; `c` regions at `x` 252.095703125, `y` 49, 400 × 36.953125, `line` 38 |
| `unknown_length_segments`, regions shown (`x` 42.42431640625, width 435.916015625, `line` 24) | `form` markers −1, 2, `y` 24, 26.9765625; `form` regions −2, 2 (its segments' regions), 54.9765625, 18.4765625 |
| `r` with an unlabelled flow marker | `r` flow control −2, 1, `y` 53.37890625, 0 high |

**Core's listing.** Over every manifest fixture, the block, frame and card
records carry core's kind, address and holder (the holder's place key) in
core's order, displayed or hidden, the ancestor cards included under the
defaults (and with every frame and card hidden) and left out under
`HIDDEN_ANCESTOR_CARDS`, a hidden ancestor card having no record; each drawn band is recorded once per
card that core lists as drawing it, with core's address and holder,
except a timeline drawn twice (below), whose second set the card drawing it
holds.

**A timeline drawn twice.** `with_region` with the map `tempo` on `clt_2`
and the groups `g1 {clt_1}` and `g2 {clt_2}` (written onto the built
manifest, since no command adds a group, and validated; drawn with
`HIDDEN_ANCESTOR_CARDS`, `clt_1`'s ancestor card behind `g2`'s frame
moving the origin): `clt_2` is a child
line in the card `{item: g1, member: clt_1}` and the root of the card
`{item: g2, member: clt_2}`. Its conversion maps band is recorded twice
under one address `{id: clt_2, facet: conversion_maps}`, at `line`
61.8046875 held by `{item: g1, member: clt_1}` (`x` `8 + (73.91552734375 +
400 × u(1/3)) = 93.02663845486111`, width 133.33333333333331) and at
188.5625 held by `{item: g2, member: clt_2}` (`x` `x0` 81.91552734375,
width 400: as the root of its member drawing `clt_2` names no timestamp,
so its extent is its line's, `[0, 400]`, and it has no markers band; its
card lies at 174.0625, its map band above, `y_root = 14.5`, its ancestor
`clt_1` below it), both 6.5 high.

**A timeline in several groups** (sections 2.2, 8.1, 8.6).
`bundles/bundle_shared_member` (`g1` {`t`, `u`}, `g2` {`t`, `v`}) records
the frame of `g1`, the cards of `t` and `u`, the frame of `g2`, the cards of
`t` and `v`, in that order, keyed `{item: g1}`, `{item: g1, member: t}`,
`{item: g1, member: u}`, `{item: g2}`, `{item: g2, member: t}`, `{item: g2,
member: v}`; both cards of `t` carry the one address `{id: t, part:
[card]}`, their keys telling them apart. `t` is drawn in both frames, and
the elements of its two member drawings carry the same addresses (its
line, name, the wedges and coordinate labels of its `origin` and `length`
in each, in the same order), so every
address of `t`, its cards' included, occurs twice; `t`'s one present band
under the defaults, its markers band `{id: t, facet: markers}`, is
recorded twice under that address, held first by `{item: g1, member: t}`
and then by `{item: g2, member: t}`. Each card is laid out with its own
entry: with `places` `{g2: {cards: {t: {width: 650}}}}` only the card keyed
`{item: g2, member: t}` is 650 wide and the one keyed `{item: g1, member:
t}` keeps its drawn width, and a rule `{addresses: [{id: t}]} stroke
#123456` strokes both lines of `t`.

**Axes.** `Drawing.axes` holds one `DrawnAxis` per line element, in their
order, at the line's ordinate, the lines of the items' cards first and
then those of the ancestor cards (proven under "Ancestor cards"; the
cases here are drawn with `HIDDEN_ANCESTOR_CARDS`). A timeline's or child's axis runs from
`Xs`, its zero, to `Xe`, its end on its own axis (its length, or for a
segment the end the next segment or its segment line gives it, section
3.4): `xStart` and `xEnd` are the line element's `xs` and `xe` when the end
is known; the end mark, a diamond's stop and chevrons are no part of it. An
open end is not known: `end` is null and `xEnd` is the reach's `x0 + L`
(`unknown_length_segments`: 49.84033203125 to 449.84033203125, the line
drawn on to 461.84033203125). Every axis also records `drawnEnd`, the
coordinate at `xEnd` on the scale its member drawing shares: `end` where
known, else the reach's (section 3.2): `unknown_length_segments`' `form`
17, the largest of `a`'s reach 4 (its region to 4), `b`'s end 8 + 6 =
14 and `c`'s 14 + 3 (its region to 3); `styled__score`'s `score` 8 and
`b` 4, their ends; the ancestor `piece` over `second-half` in
`group_child_member` 16, the member's end on it. An ancestor's axis is clipped to the member,
from `x0` (not the chevrons' start) to the member's end `x0 + L` or the
ancestor's own end short of it, with the ancestor's coordinates there:
`piece` over `second-half` in `group_child_member` from 8 to 16 quarters,
`recording` over `excerpt` in `bundle_mixed` from 44100 to 132300 samples,
running on. Each axis names the card that draws it (its place key) and
lists the maps drawn at its line, in the order they are drawn, each with
the ID of the timeline it spans (its owner) and its `xs`, `xe` and `yc`:
in `bundle_mixed` `score` `cmap_1` and `cmap_2`, `performance` `cmap_3`,
`page` `cmap_4`, `excerpt` `cmap_6`, each owned by its axis's timeline,
none for the ancestor `recording`, whose line draws no map (its own
`cmap_5` included). An axis lists the segments of its timeline when it is a
segment line, each with its ID, its offset and its length on the line's
own axis (section 3.4), none otherwise.

**`lineAxes(drawing)`** gives the same lines for a hit test, one entry per
axis, keyed by the card's place key text followed by the timeline's address
key, so two drawings of one timeline keep two entries: `timeline` the ID,
`card` the place key of the card drawing it (the axis's own, so a reader
needs no second walk to tell the cards apart), `y` the ordinate, `xStart` and `xEnd`, `start`, `length` (`end − start`,
null where the end is not known), `drawnLength` (`drawnEnd − start`, the
coordinates the line spans as drawn), `numberType`, `unit`, the segments and the
maps as the axis lists them. For the segment line `form` of the slots
section (`x0 = 16 + 25.84033203125 + 8 = 49.84033203125`, `x(t) = x0 + 12.5
t`): one entry keyed by `form`'s card `{item: form}`, its `card` that key, `y` 27.5, `xStart`
49.84033203125, `xEnd` 449.84033203125, start 0, length 32, drawn length
32, segments `A`
(0, 8), `B` (8, 12), `C` (20, 12); maps `form_ticks` (owner `form`, `yc`
22, from 49.84033203125 to 449.84033203125) and `b_ticks` (owner `B`, `yc`
17, from 149.84033203125 to 299.84033203125). `bundle__bundle_shared_member`
draws `t` in two cards: two entries for `t`, keyed by `{item: g1, member:
t}` and `{item: g2, member: t}`, each carrying its key as its `card`.

**`abscissaOf(line, t)`** is the abscissa of the coordinate `t` on the
line's own axis on its drawn scale, `xStart + (t − start) / drawnLength ×
(xEnd − xStart)`, and `xStart` where the drawn length is 0 (a line drawing
no coordinates). On `form`: 0, 8 and 32 lie at 49.84033203125,
149.84033203125 (`x0 + 12.5 · 8`) and 449.84033203125; with a drawn length
of 0, 0 lies at `xStart`, 49.84033203125.

## First fit (`properties.test.ts`, fast-check)

For generated manifests (a root of length 1 to 64 quarters with 1 to 8
children of random offset and length inside it, built through `add`
commands), no two wedge labels on one baseline, which the markers band's
first fit placed in one tier, have conflicting extents `[x − wi/2 − 1, x +
wi/2 + 1]`, `wi` the label's width (section 6.3), and no two child lines at
one ordinate, which one children band's first fit placed in one row, have
conflicting drawn extents `[Xs, Xe]`.

**The rows of first fit** (`fit.test.ts`). The oracle is section 6.3 read
literally, written out in the test file alone: an item tries rows 1, 2, 3,
… in turn and goes to the first one in which it conflicts with no item, an
item conflicting with another when `a1 < b2` and `a2 < b1`, or when `a1 =
a2`, every item of the row compared. The layout's first fit must give every
item the row the oracle gives it and leave every row holding the same
extents in the same order, for every sequence of extents, so the sequences
are generated (fast-check, seeded, so a failure reproduces) to reach every
case the definition distinguishes: ends drawn from a small set of integers
and halves, so starts tie, items touch at their ends (`b1 = a2`, which
share a row) and contain one another; zero-length items (`a = b`), alone,
at another item's start, inside it and at its end; sequences in ascending
order of start, as the children and the labels arrive, in descending order
and in any order; long sequences (up to 400 items) beside short ones; and
extents the layout never makes but the definition still decides: a start
after its end, NaN at either end, infinities and −0 beside 0 (equal starts,
so they conflict). Four sequences are also written out with their rows
derived by hand from the definition: `[0, 1]`, `[1, 2]`, `[2, 3]` touch
and share row 1; `[0, 2]`, `[0, 1]`, `[1, 3]` give rows 1, 2, 2 (`[0, 1]`
starts where `[0, 2]` starts, `[1, 3]` starts inside `[0, 2]` and where
`[0, 1]` ends); `[0, 4]`, `[2, 2]`, `[4, 4]`, `[4, 6]` give rows 1, 2, 1, 2
(the zero-length `[2, 2]` lies inside `[0, 4]`, `[4, 4]` touches its end,
`[4, 6]` starts where `[4, 4]` starts); `[5, 6]`, `[3, 4]`, `[4, 5]`,
`[3.5, 4.5]`, arriving out of order, give rows 1, 1, 1, 2.

## Redraw operation counts (`scale.test.ts`)

A synthetic manifest has exactly 1,004 element keys, as core enumerates
them: one root with its named timestamps `origin` and `length` (a wedge and
a coordinate label each), 60 children with maps, regions, jump targets, flow
markers and a jump origin, and a segment line of 40 segments; four of them
are the secondary coordinates of `origin` (at 0) on `child_0` (its reach 1)
and `nested_unknown` (its reach 0), a wedge and a coordinate label each
(`length` at 200 lies on no child, each ending at its reach, nor on the
segment line, 120 to 160). Every count comes from the inputs a
draw is given, never from watching the code: each rule counts reads
of its selector, the metrics table the code points asked, the manifest listings of
its keys. The rule with no element, class or address is tested
exactly `1,004 + 2 × 63 = 1,130` times: each key is resolved once, and
each of the 63 lines (the root, its 60 children, the nested child and the
segment line, the keys of type `timeline` or `child`) resolves once each
the wedge and the cross-section line of a position no named timestamp
holds; three whose address,
class or element no key has, 0 times; one per address the keys carry, the
block's `{}` included, as often as core lists keys there. The metrics table is read 203 times, the code points of the eleven distinct
texts as a multiset; the manifest's keys are listed 0 times, so a draw
copies nothing. No count is a timing.

**Work per timeline.** A draw's work grows with the number of timelines
and no faster: no timeline is visited again for every other timeline, as a
search of the manifest's tree per timeline would. Two manifests of one
shape, written by hand, prove it: 100 and 1,000 roots of length 4 ♩, root
`r<i>` holding the child `c<i>` (length 2 ♩ at offset 1 ♩), which holds the
child `g<i>` (length 1 ♩ at offset 0), so 300 and 3,000 timelines; the
manifest's `graphical.order` states the band order of the last root,
`[markers, line]`, and of its child, `[line, children]`, so the last chain
reads two stated entries and the others inherit the default band order,
the grandchild through its stated parent. Every timeline is wrapped so that
each read of its `children` member is counted, the step every walk of the
tree takes at every timeline. The oracle is the smaller manifest: the six
timelines of the first and the last chain are read exactly as often in the
larger as in the smaller, and the most-read timeline of each is read
equally often. A tree search per timeline reads every earlier timeline's
`children` once more for each later one, about 300 against 3,000 reads in
the two manifests, and fails both equalities, whether the layout searches
the tree itself or asks core for each timeline's band order and core
searches it per question: the draw asks the band order of every timeline
drawn with a line, so the counts guard core's lookup as much as the
layout's own walk.

**Work per placement.** A first fit's work per item grows no faster than
the logarithm of the number of items a row already holds: no item is
compared again with every item placed before it, as a scan of the whole
row per placement would. The case is the one a timeline with thousands of
short children gives, every child in one row: 300 and 3,000 extents `[i,
i + 1]`, placed in that order, each touching the one before it, so first
fit puts all of them in row 1 (the rows are checked too). The work that
grows when placement goes quadratic is the comparisons between ends, so
those are what is counted: every end is a value that counts each
conversion to a number, and a comparison of two ends (`<`, `<=`, `>`)
converts both. The count sees a comparison only while the row compares
the values it was given: a row that converted every end to a number on
entry would convert each end once, 600 and 6,000 times, whatever it
compared afterwards, a scan of the whole row included. So the test first
proves that the row keeps the very values passed in: every extent of row
1 holds, as its start and end, the two counting values of the placement
that added it (compared by identity, which converts nothing). The starts
are distinct, so the identity comparison of two starts (`===` on the
counting values) answers as their values would; it converts nothing.

The counts, derived for a row that keeps its ordered extents sorted by
start and checks a new one against its neighbours found by binary search:
the first extent meets no row and is only added, 1 comparison (whether it
is ordered, `a <= b`). An extent `k` (from 1) placed among `k` others is
checked (whether it is ordered, 1; a binary search for the last start at
or before its own, `⌊log₂(k + 1)⌋` comparisons, since every start held is
smaller; the one neighbour before it, `a1 < b2`, false since it touches,
1) and added (whether it is ordered, 1; the same search again). That is
`3 + 2⌊log₂(k + 1)⌋` comparisons, so `1 + Σₖ₌₁ⁿ⁻¹ (3 + 2⌊log₂(k + 1)⌋)`
in all, twice that in conversions: 9,388 for 300 extents (4,694
comparisons) and 133,664 for 3,000 (66,832), both below `2 + 6(n − 1) +
4n·log₂ n`. A scan of the row compares a new extent with every extent of
the row, `n(n − 1)/2` comparisons: the literal reading of section 6.3
(`fit.test.ts`'s reference) converts 89,700 and 8,997,000 times, and a
row that scans every extent besides its binary search converts 99,088 and
9,130,664 times, so either fails the counts. The counts are exact: a
change that alters how many comparisons a placement makes, even within
`n log n`, is re-derived here before the test changes. The counts are
never re-derived over a row that converts the ends on entry: the identity
check fails there, and its counts would be the conversions on entry, not
the comparisons.
