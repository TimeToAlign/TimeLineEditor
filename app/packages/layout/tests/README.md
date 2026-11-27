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
moved to the new root and its length); the corpus fixtures carry none.
The commands of such a manifest are applied with a minter of a fixed seed
(`MINTER_SEED`), so what they create is the same every run; a test names
only the IDs its commands give (`ids`, a speaking ID such as `here` or
`gap_1`), never one the minter gives. The IDs a corpus fixture's loader
mints are named through the fixture likewise: its one root (`rootOf`), a
flow-control element by its role and quarter (`flowControlAt`), a map by
its type (`conversionMapOf`), never by a typed spelling. The
defaults show every ancestor card (section 8.8), which takes no room in
its frame but moves the origin, and moves the items after its frame where
it reaches beyond it ("Ancestor cards" point 14): a test whose subject is not the ancestor card (the
ancestor lines, the block, places, items, records, unknown lengths) draws a
group with a child member with the application layer
`HIDDEN_ANCESTOR_CARDS` (`{element: ancestor_card}` `display: none`), so
its numbers, derived without the cards, stand; that the layer removes the
cards and moves nothing else is proven under "Ancestor cards". Likewise
the defaults hide the arcs of jumps and draw every flow-control element's
symbol and a jump's volta fork (section 6.4): a test whose subject is
an arc, or not flow control at all, of a fixture holding a jump (the
ancestor cards, the block, places, items, member drawings, records,
elisions, unknown lengths, the padding and band orders of `flow_control`)
draws with `ARCS_ALONE` (`{element: jump}` `display: inline`, `symbol` and
`fork` `display: none`), and, where a member that is a child timeline
would draw its root's jump on its stretch (section 6.4, Gathering), with
`ROOT_ARCS_ALONE` (the same, and `{element: jump, inside: frame}`
`display: none`, so that only the cards held by the block draw arcs), so
its numbers, derived with the arcs and without symbols, stand; and a test
whose subject is not a child's regions, which the defaults show, draws
with `CHILD_REGIONS_HIDDEN` (`{element: band, facet: regions, inside:
band}` `display: none`). The metrics table of the two fonts
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
the defaults hide no band, and every markers band draws nothing but on a
timeline with a named timestamp; only the root of a member drawing lays
out a flow control band, which draws the flow control of its whole tree
(section 6.4, Gathering). Only a present
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
package's `docs/drawing.md`: `DEFAULT_LAYER` equals it, rule for rule.
Every element type the layer selects, by `element`
or `inside`, is one of the schema's `ElementType`, and of the four
flow-control types it selects `jump`, `break`, `section_break`, `barline`,
in that order. That file is the
copy of the TimeToShare repository's `docs/drawing.md` which the schema
package's `pnpm build` puts into the package (`js/docs/`, not tracked); an
edit of the repository's specification reaches this test and that of
the constants below only after that build; until then both compare with
the text built last. Resolved alone, the default layer
gives `bare`'s block and card their fill, stroke, `rx` and shadow; in
`group_child_member` the frame its own, the ancestor line `piece` opacity
0.35 (no mark of the member is drawn on it), its name grey at size 9 and not
faded, while
`piece`'s ancestor card, drawn first, draws `piece`'s line, its name (black,
11) and `second-half`'s name and its `origin` and `length` wedges and labels
unfaded, each address so drawn twice. It
hides no band (`with_region`, `unknown_length_segments`, `timestamps`,
`group_child_member`, `bare`): a child's regions are shown, and every
markers band, so every named timestamp stays visible. It shows
every ancestor card (section 8.8): no rule of it sets `display`. It cuts
every name at 160 but the manifest's title, whose rule after the names'
sets `max-width: none` (a change this package makes ahead of section 4,
so the comparison with the specification's block fails until section 4
lists the rule; "Row names and empty blocks"). It hides
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
  label offset of a break, a section break or a barline (the specification's
  row "flow-line label offset"), `k`, `Q`, `K`, `F`, the gap after a frame's
  title and the card shadow offset; `g` is also `1.5 × d`, as its row says;
- a size depending on the card spacing is the formula of its row with the
  fixed parts the constants hold: the row pitch `max(10 + S, h(s))`, the
  region row pitch `6 + 2 + h(9) + S` (the brace height and the label gap),
  the first jump depth `4 + S` and the jump row pitch `6 + S + h(9)`; the
  gap between bands is `S` itself;
- the label separation, 2, has no constant: it is the width of the extent
  section 6.3 gives a label of width 0 (`[L × u − wi / 2 − 1, L × u + wi /
  2 + 1]`);
- the gap line of a FlowMap's gap holds one constant, its fixed stroke
  colour `GAP_LINE_STROKE` (`#9CA3AF`); its stroke width and dash pattern
  are its line's own, which the writers apply; its row is compared as that
  text.

Three numbers the constants hold are stated outside the table, each read
from its sentence: the card spacing `S`'s default, 4 ("With the default `S
= 4`", section 6.2), and the frame's, 8 ("`spacing`: 8 for a frame, 4 for a
card", section 8.6, which states the card's 4 again); and the initial
`rotation`, 0, the four elision properties' initial values,
`label-display`'s and `flow`'s, the last of section 2.5's ("`rotation` 0,
`elision-mode` `auto`, `elision-proportion` `auto`, `elision-depths`
`auto`, `elision-display` `ellipsis name`, `label-display` `name label`,
and `flow` none"): no wedge
has another initial rotation, a secondary coordinate's −45 being a default
rule's (section 4). The table's last two rows are the standard gap of an
elision, 32, and an ellipsis's dot radius 2, dot spacing 6 and narrowest
gap 20.

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
`cmap_15` to seconds physical and continuous, the FloatingMeasureMap
`cmap_3` logical and continuous; `conversion_maps__maps_seconds`: the
LinearMap `cmap_1` to samples physical and discrete), a map converting to
no time axis (the ConstantMap `cmap_11`) taking its timeline's stroke, with
its type as class (`ConstantMap` matches `cmap_11` alone). For every manifest fixture, and for
the switched frame carrying a child member of "Switched cards", 12 (no
fixture draws one), every
drawn element's address and type, the block's `{}` included, are among the
element keys core enumerates, and no address is drawn more often than core
enumerates it. A drawing is one element, but for the arcs of a jump and
their labels (a jump draws one arc per destination, each with a label of
its own, all at the jump's address and its label's: within one card they
are one drawing of the jump, and one of its label) and for the pieces of a
cross-section line: the up to two pieces in one card, on either side of
its gap, are one drawing of that card, and the pieces a groupstamp's line
is drawn in across a frame lie in no card (outside every card's range of
elements), and those inside one frame's box are one drawing of that
frame, which core enumerates once (held by the frame) beside the
timestamp's own line in its card; the pieces themselves are counted under
"Groupstamps". Without core's frame keys `groups/group_groupstamp` fails:
`timestamp_1`'s line is drawn twice (its own line in `score`'s card and
`group_1`'s pieces). A gap of an elision is one drawing of the card or
the frame it lies in, and its one ellipsis, written after it (section
8.5), is one drawing with it: core lists one ellipsis key per gap. An address drawn
twice matches `inside` by each drawing's own holders: in
`group_child_member` without the default layer (so the secondary
coordinates shown) and with its ancestor card hidden by a rule, the
member's `origin` and `length` (`timestamp_3`, `timestamp_4`) and their
coordinate labels are drawn on `piece`'s ancestor line in the member's
card, inside the ancestor (`piece`'s stroke by a rule on its address,
opacity 0.5 by `{inside: ancestor}`), on the member's own line (the
initial stroke `none`, opacity 1) and, groupstamps, on `recording`'s line
in its card (likewise), in that order.
The one exception is the default elisions (section 8.9) and their labels,
the elements at `{id: T, part: ["elision"]}` and `{id: T, part:
["elision", "name" | "coordinate"]}`: they are left out of the comparison,
and only they. Whether a default elision exists, and where, follows from
the ancestor card's proportion `r`, which depends on the drawing's
geometry and the view (the text widths of the name column, the frame's
size, `Placement.view`), so core, which never lays out, resolves their
addresses but cannot list them. Stored elisions (`{id: E}` and its two
labels) are compared like every other element.

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
control holds the jump targets `jump_target_1` at 2 and `jump_target_2` at 4, which
draw nothing, the jump `jump_1` from 8 to `jump_target_1` (its
destination labelled `Repeat`), the break `break_1` (name `fine`, label
`Fine`) at 12 and the jump `jump_2` from 16 to `jump_target_2` (labelled
`D.S.`), all below; the line at 22.40234375 as in `bare`. Its arcs are
shown and its symbols hidden (`ARCS_ALONE`). The flow control band starts
at `26.9765625 + 4 = 30.9765625`; `break_1`'s stack holds, by the initial
`label-display` `name label`, its name `fine` and its label `Fine`, one
tier two lines high, `T = 2`, so the flow row lies `30.9765625 + 2 ×
10.4765625 = 51.9296875` out, at `yf = 74.33203125`. By span, `jump_1`
(6) is placed before `jump_2` (12); their extents `[50, 200]` and `[100,
400]` (the labels, `Repeat` 32.08447265625 and `D.S.` 18.36474609375
wide, lie inside them) conflict, so `jump_1` takes jump row 1, its apex
`51.9296875 + 8 = 59.9296875` out, and `jump_2` row 2, `pj = 6 + 4 +
10.4765625 = 20.4765625` further, 80.40625 out. The band is `20.953125 +
8 + 20.4765625 + 2 + 10.4765625 = 61.90625` wide, `Eb = 92.8828125`, `Hc
= 14.40234375 + 92.8828125 + 8 = 115.28515625`. The break's line runs at
x 390.9775390625 from the flow row to `8 + P = 16`; its stack starts at
393.9775390625, `fine` on line 1, baseline `yf − d(9) = 72.20947265625`,
`Fine` on line 2, `h(9)` further in, baseline 61.73291015625.

Each jump has `w = 1`: the head 4 long and 2 half-wide. The head is
computed in item coordinates and drawn `8 +` each.

- `jump_1`: `Xf = 290.9775390625`, `Xt = 140.9775390625`, `q = (Xt − Xf) /
  4 = −37.5`; `ya = 82.33203125`; `yc = yf + 4/3 × (ya − yf) =
  84.99869791666667`, `C1 = (253.4775390625, yc)`, `C2 =
  (178.4775390625, yc)`; the head's axis `u = (−0.9618459163232351,
  −0.2735917273097203)` from `Xt − Cx = −37.5` and `yf − yc =
  −10.666666666666671`. `Bh = (144.82492272779294, 75.42639815923889)`,
  corners `(144.2777392731735, 77.35008999188535)` and
  `(145.37210618241238, 73.50270632659242)`. The label is centred at
  `x(5) = 215.9775390625`, baseline `8 + ((14.40234375 + (59.9296875 +
  2)) + 8.35400390625) = 92.68603515625`.
- `jump_2`: `Xf = 490.9775390625`, `Xt = 190.9775390625`, `q = −75`; `ya =
  102.80859375`; `yc = 74.33203125 + 4/3 × 28.4765625 = 112.30078125`,
  `C1 = (415.9775390625, yc)`, `C2 = (265.9775390625, yc)`; `u =
  (−0.8921856025539521, −0.4516689612929382)` from `Xt − Cx = −75` and `yf
  − yc = −37.96875`, `ℓ = 84.06322606563764`. `Bh = (194.5462814727158,
  76.13870709517175)`, corners `(193.64294355012993, 77.92307830027966)`
  and `(195.44961939530168, 74.35433589006385)`. The label is centred at
  `x(10) = 340.9775390625`, baseline `8 + ((14.40234375 + (80.40625 +
  2)) + 8.35400390625) = 113.16259765625`.

The shaft of each runs `(Xf, yf)`, `C1`, `C2` to `Bh`; the jumps and
their labels follow the order of first fit, `jump_1` before `jump_2`, and
the stack's labels follow the arcs' labels, name before label. The
`16 ♩` label reaches `R = 500.256591796875`: `W = 518.256591796875`, `H =
8 + (8 + 115.28515625 + 2) = 133.28515625`.

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
An open end runs on `9.5w`; an extent holds the drawn labels and the
breaks' points. In `flow_control` the flow control band's extents are the
break's point `[300, 300]` (`400 × 12/16`), its stack (its name `fine`
and its label `Fine`, as wide as the wider, `Fine`) `[300 + 3 − 1, 300 +
3 + 18.91845703125 + 1] = [302, 322.91845703125]`, and the jumps
in placement order, `jump_1` `[50, 200]` and `jump_2` `[100,
400]`; the root's extent `[−7.416015625, 410.279052734375]` runs from its
`origin`'s coordinate label (`0 − 6.416015625 − 1`) to `length`'s (`400 +
9.279052734375 + 1`), drawn with the layer `ARCS_ALONE` (support:
arcs shown, symbols and forks hidden). A break ends at the padding of
the opposite side: laid out alone with its line at 100 in a drawing 200
high (top 0), `flow_control`'s break runs from its flow row `30.9765625 +
2 × 10.4765625 = 51.9296875` below (its stack two lines, one tier) to the
padding 8, and with its band moved above, next to the line from `5.5`,
from `100 − 26.453125 = 73.546875` to `200 − 8 = 192`; only the root of a
member drawing has a flow control band, so `child_flow_control`'s `verse`
lays out none of its own.

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
  `cmap_5` takes slot 1, `cmap_1` (the MeasureRecordMap) slot 8, and the
  three TableMaps `cmap_16` to `cmap_18`, which span one timeline and so
  conflict, the sub-slots 10 to 12 in canonical order; they lie against the
  line above: the stack reaches `1.5 + 12 × 5 = 61.5`, `y_root = 69.5`, the
  root at 77.5, `cmap_5` (`j = 1`, 5.5 out) at 72, `cmap_1` (`j = 8`, 40.5
  out) at 37, `cmap_18` (`j = 12`, 60.5 out) at 17, `Hc = 69.5 + 26.9765625
  + 8 = 104.4765625`, `H = 122.4765625`. The maps are still drawn in the
  order they are taken, canonical order, `cmap_1` first. With the markers
  band on that side, after the maps, the two lie `B` apart: nothing above,
  so the root at 22.40234375, `cmap_1` at 62.90234375 and `cmap_18` at
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
  band lies above the line). A break runs from its flow row across its line to
  the padding. In `flow_control`, drawn with `ARCS_ALONE` (arcs shown,
  symbols and forks hidden), both jumps and the break move with their
  band. With the flow control band moved above the line, next to it, it
  lies at level 1 from `1.5 + 4 = 5.5` (no map, so no stack): its break's
  stack (`fine`, `Fine`) one tier two lines high, the flow row `5.5 + 2 ×
  10.4765625 = 26.453125` out, the band `61.90625` wide as below the line
  (two jump rows), `Ea = 67.40625`, `y_root = 75.40625`, `Hc = 75.40625 +
  26.9765625 + 8 = 110.3828125` and `H = 8 + (8 + 110.3828125 + 2) =
  128.3828125`. Drawn `8 +` each: the root's line at 83.40625, the flow
  row at `8 + (75.40625 − 26.453125) = 56.953125`, where `jump_1` starts
  at `x(8) = 290.9775390625`; the break from there down to the bottom
  padding `8 + (Hc − P) = 110.3828125`, its stack at 393.9775390625, `fine`
  on line 1 with its baseline `yf + a(9)`, `8 + (48.953125 +
  8.35400390625) = 65.30712890625`, `Fine` on line 2, `h(9)` nearer the
  line, `8 + (59.4296875 + 8.35400390625) = 75.78369140625`.
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
each a jump at its `from` with its label as its id and one destination
labelled with it, added after the jump target `<id>_to` at its `to` that
the destination names, drawn with `ARCS_ALONE` (the arcs shown, no symbol;
no jump has a label of its own, so no stack); `x0 = 16 + 4.5224609375 + 8`
(the name `r`, `A = 842`). Canonical order sorts the jumps by
their coordinate, `from`: `five`, `four`,
`three`, `one`, `two`; their spans are 12, 10, 8, 2 and 2, and the stable
sort by span gives the placement order `one`, `two`, `three`, `four`,
`five`, which the jumps and their labels are drawn in. Extents from `x0`:
`one` `[100, 150]`, `two` `[200, 250]`, `three` `[75, 275]`, `four` `[50,
300]`, `five` `[25, 325]`; no label widens its extent. First fit: `one` and
`two` level 1, `three` 2, `four` 3, `five` 4. No band above: the root's line at
22.40234375. No break, so no label tier: the flow row is the flow
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

**`corpus_score_ms3`**, drawn with `ARCS_ALONE`. Its loader mints every
ID it writes, so the test names the root through the fixture (`rootOf`) and
each flow-control element by its role and the quarter it stands at
(`flowControlAt`; no two jumps share a quarter), here `J`*q* for the jump at
*q*. The root states no name, and an unnamed timeline is labelled with its
ID, whose spelling the loader mints: the test names it `score` by command,
narrower than `controls`, so no `x` below depends on that spelling. Root,
quarters, length 37, two maps above (the FloatingMeasureMap and the
MeasureRecordMap; the measure map both read, which belongs to no timeline,
is not drawn); children `controls` and `notes`, each from 0 to 37, in rows
1 and 2. The widest name is `controls` (44.10205078125); `x0 =
68.10205078125`, `x(t) = x0 + 400 × u`, `u` the double nearest `t / 37`.
Above: the two-map stack (`1.5 + 2 × 5 = 11.5`), the children band from
`11.5 + 4 = 15.5`, two rows of 14, `Ea = 15.5 + 28 = 43.5`, `y_root =
51.5`, the root's line at 59.5. Below: a corpus fixture names no
timestamp, so no markers band is present, and the flow control band lies
at level −1 from `1.5 + 4 = 5.5`. Of its breaks and barlines only
the break at 12 has a name, `fine`, and none a label, so by the initial
`label-display` `name label` its stack is `fine` alone, one tier one line
high: the flow row lies `5.5 + 10.4765625 = 15.9765625` out, `yf = 8 +
51.5 + 15.9765625 = 75.4765625`, and `fine` starts at `x(12) + 3 =
200.83178051097974` (`400 × u = 129.72972972972974`), its baseline `yf −
d(9) = 73.35400390625`.
The arcs, each labelled with its destination's manifestation (the score
loader writes no label; the To Coda's destination is labelled `coda`),
widths at 9 by the advance sums `volta` 5092 → 22.376953125, `repeat_end`
11602 → 50.9853515625, `coda` 4934 → 21.6826171875, `dal_segno_al_coda`
19132 → 84.076171875, `da_capo_al_fine` 16233 → 71.33642578125. A
destination without a place goes to 0 (no section break lies before any
jump), one with `by` 0 draws none, and one whose `manifestation` is
`volta` draws none either, being a branch of its jump's fork (hidden
here): `J7` (three volta destinations) and `J32` (two) draw no arc. The
arcs: `J6` `6→0`, `J9` `9→6`, `J16` `16→0`, `J20` `20→30`, `J24` `24→20`,
`J28` `28→16`, `J30` `30→16`, `J34` `34→0`, `J37` `37→0`. Sorted stably by
span: `J9` (3), `J24` (4), `J6` (6), `J20` (10), `J28` (12), `J30` (14),
`J16` (16), `J34` (34), `J37` (37), the drawing's order of the arcs. Rows
by the arcs' own extents (`400 × u`; only `J20` has a label, `coda`, so
every row keeps one label tier): `J9` `[64.86, 97.30]`, row 1; `J24`
`[216.22, 259.46]`, row 1; `J6` `[0, 64.86]` only touches `J9`, row 1;
`J20` `[216.22, 324.32]` starts with `J24`, row 2; `J28` `[172.97,
302.70]`, row 3; `J30` `[172.97, 324.32]`, row 4; `J16` `[0, 172.97]`
starts with `J6` and meets nothing in row 2, row 2; `J34` `[0, 367.57]`,
row 5; `J37` `[0, 400]`, row 6. With `pj =
6 + 4 + 10.4765625 = 20.4765625` the apexes lie `8 + (k − 1) × pj` beyond
the flow row, `yc = yf + 4/3 × that` (the factor formed first, in item
coordinates, the flow row at 67.4765625, then drawn `8 +`):
86.14322916666667, 113.4453125, 140.74739583333331, 168.04947916666669,
195.3515625 and 222.65364583333334 for rows 1 to 6. The band is
`10.4765625 + 8 + 5 × 20.4765625 + 2 + 10.4765625 = 133.3359375` wide,
`Eb = 5.5 + 133.3359375 = 138.8359375`, `Hc = 51.5 + 138.8359375 + 8 =
198.3359375`, `H = 216.3359375`. No `x` depends on the maps above or on
the band's ordinates.

The head is computed in item coordinates (8 left of and 8 above the drawn
ones), `q = (Xt − Xf) / 4`, `C1 = (Xf + q, yc)`, `C2 = (Xt − q, yc)`, `u`
the unit vector from `C2` to the tip, `Bh = tip − 4u`, the corners `Bh ∓ 2n`
with `n = (−u_y, u_x)`, then drawn 8 right and 8 down.

- **Short jump** (`J9`, `9→6`, row 1): `Xf = 165.3993480785473`,
  `Xt = 132.96691564611487`, `C1 = (157.2912399704392, 86.14322916666667)`,
  `C2 = (141.07502375422297, 86.14322916666667)`, `Bh =
  (135.38752148242557, 78.66100395576875)`, corners `(133.7953007545412,
  79.8713068739241)` and `(136.97974221030995, 77.4507010376134)`: it
  arrives steeply.
- **Longest jump** (`J37`, `37→0`, row 6): `Xf = 468.10205078125`,
  `Xt = 68.10205078125`, `C1 = (368.10205078125, 222.65364583333334)`,
  `C2 = (168.10205078125, 222.65364583333334)`, `u =
  (−0.5620009405474009, −0.8271365926035654)`, `Bh = (70.3500545434396,
  78.78510887041426)`, corners `(68.69578135823247, 79.90911075150906)`
  and `(72.00432772864673, 77.66110698931946)`: it arrives flatter.

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

## The flow fixtures (`flow.test.ts`)

The fixtures of `flow/` are drawn with the default layer, `ARCS_ALONE`
(the arcs shown, no symbol, no fork) and their own.
Each is a named manifest of one root `score`, name `Score` (`A = 1300 +
1126 + 1253 + 842 + 1260 = 5781`, `N = 5781 × 11 / 2048 =
31.05029296875`), `x0 = 16 + N + 8 = 55.05029296875`, `L = 400`, and no
named timestamp, so no markers band. The manifest's title lies above the
card: the card's top is `P + h(11) + F = 8 + 12.8046875 + 8 = 28.8046875`,
the root's line at `28.8046875 + 14.40234375 = 43.20703125`, and a line of
the flow control band below it ends at the card's top plus the padding,
`36.8046875`. Every jump has `w = 1`; an arc is computed as the jumps of
`flow_control` are (item coordinates, the head from `Xt − Cx` and `yf −
yc`, then drawn 8 right and 28.8046875 down). A break, a section break
and a barline are drawn alike: a vertical line at its coordinate from the
flow row to that end, its label 3 right of it.

The rules proved, beyond the geometry `flow_control` and
`corpus_score_ms3` already prove: **one arc per destination** of a jump
whose `by` is not 0, in the canonical order of its `targets` (without a
place, then by `by`, then by `to`), in whatever order they were given,
every arc and every label at the jump's one address and its label's; the
**place** of a
destination is its jump target's coordinate, its region's start, its
child's offset, 0 for the timeline itself, the jump's coordinate plus its
`by`, and without either the coordinate of the nearest section break
strictly before the jump that is not rejected, else 0; a `to` naming
nothing, or a jump target that is rejected, is **no place**, and its
destination draws no arc (only a rejected jump may hold one); an arc's
**text** is its destination's `label`, never that destination's
manifestation (its symbol shows that) nor its jump's own `label` or
`name`, which the jump's stack draws once (its `label` by the defaults'
`label-display`); a **rejected** element (a belief `false` in
its provenance) and its label are drawn at opacity 0.35, the defaults'
opacity of ancestor lines, in their rows as any other.

- **`flow/sonata_exposition`** (length 24, `x(t) = x0 + 400 × u`, `u` the
  double nearest `t / 24`), its atomic sections shown by the rule
  `{element: region, class: "tts:AtomicSection"}` `display: inline`: three regions in one row, so the regions band
  lies at level −1 from 5.5, `6 + 2 + 10.4765625 = 18.4765625` wide, and
  the flow control band from `5.5 + 18.4765625 + 4 = 27.9765625`; no line
  has a label, so no tier: `yf = 43.20703125 + 27.9765625 = 71.18359375`.
  `jump_1` at 12 holds `by` 0 and `to` `jump_target_1` at 16, both
  `volta`, branches of its fork, which draw no arc. `jump_2` at 16 holds
  one destination without a place: no section break, so the arc 16→0,
  extent `[0, 266.66666666666663]`, row 1. No destination has a label, so no arc has
  a text (row pitch `6 + 4 + 1 × h(9)` all the same). The
  break `break_1` at 16 runs at `x(16) = 321.71695963541663` from `yf` to
  36.8046875. Arc 16→0 (row 1): `yc = yf + 4/3 × 8 = 81.85026041666666`,
  `C1 = (255.05029296874997, yc)`, `C2 = (121.71695963541666, yc)`, `Bh
  = (59.00005549641682, 71.8155557544267)`, corners
  `(58.68407449420347, 73.79043701826009)` and `(59.31603649863017,
  69.84067449059327)`.
- **`flow/repeat_end_and_dal_segno`** (length 24): no region, no labelled
  line: the band from 5.5, `yf = 48.70703125`. The one jump `jump_1` at 16
  holds two destinations, in canonical order `to` `jump_target_1` at 4
  (no label: no text) and `to` `jump_target_2` at 8 (label `D.S.`). By
  span the arc 16→8 is placed first, row 1 (`[133.33333333333331,
  266.66666666666663]`), the arc 16→4 conflicts, row 2: two `jump`
  elements at `{id: "jump_1"}`, then the one label `D.S.` at its label's
  address. Arc 16→8: `yc = 59.373697916666664`, `C1 =
  (288.3836263020833, yc)`, `C2 = (221.71695963541663, yc)`, tip
  `(188.38362630208331, yf)`, `Bh = (192.1933228908806,
  49.92613415841514)`, corners `(191.58377143667303, 51.830982452813785)`
  and `(192.80287434508818, 48.02128586401649)`; label `D.S.` at `x(12) =
  255.05029296875`, baseline 67.06103515625. Arc 16→4: `yc =
  86.67578125`, `C1 = (271.71695963541663, yc)`, `C2 =
  (171.71695963541666, yc)`, tip `(121.71695963541666, yf)`, `Bh =
  (124.90256731729734, 51.12610208342815)`, corners `(123.69303190058326,
  52.71890592436849)` and `(126.11210273401142, 49.5332982424878)`.
- **`flow/sections`** (length 32, `x(t) = x0 + 12.5 t`): the break
  `break_1` at 8 has the label `Fine` (one tier), the section break
  `section_break_1` at 16 none: the flow row `5.5 + 10.4765625 =
  15.9765625` out, `yf = 59.18359375`; the lines at 155.05029296875 and
  255.05029296875, `Fine` from 158.05029296875 at the baseline `yf − d(9)
  = 57.06103515625`. `jump_1` at 16 has no place: the section break at 16
  is not before it, so the arc 16→0; its destination has no label, so
  the arc has no text, and the jump's own label `D.C. al Fine` is its
  stack, from `x(16) + 3 = 258.05029296875` on the line of `Fine`
  (baseline 57.06103515625); `jump_2` at 32 has no place either and lands
  at the section break, the arc 32→16, no text, its stack `D.C.` from
  458.05029296875 (the three stacks' extents do not meet: one tier). Both
  spans are 16 and their extents `[0, 200]` and `[200, 400]` only touch:
  both in row 1, `yc =
  69.85026041666666`, in canonical order. Arc 16→0: `C1 =
  (205.05029296875, yc)`, `C2 = (105.05029296875, yc)`, `Bh =
  (58.96226431444723, 60.01814763708208)`, corners `(58.54498737090619,
  61.97413330993069)` and `(59.37954125798827, 58.06216196423346)`; arc
  32→16 the same 200 further right. The labels follow the arcs: `Fine`,
  `D.C. al Fine`, `D.C.`, none centred on an arc. With `section_break_1`
  rejected by a belief `false`, it is drawn at opacity 0.35
  and no longer starts a section: `jump_2`'s arc runs 32→0.
- **`flow/repairs`** (length 16, `x(t) = x0 + 25 t`): the barline
  `barline_1` at 8 runs at 255.05029296875 from `yf = 48.70703125` to
  36.8046875, at opacity 1. The rejected `jump_1` (16→0, no place) and its
  replacement `jump_2` (16→`jump_target_1` at 8) both draw, neither with a
  text (their destinations have no label): by span `jump_2`'s arc first (row 1, `C1 =
  (405.05029296875, 59.373697916666664)`, tip `(255.05029296875, yf)`),
  then `jump_1`'s (row 2, `C1 = (355.05029296875, 86.67578125)`, tip
  `(x0, yf)`); `jump_1`'s arc has opacity 0.35, `jump_2`'s 1.
- **The reading in force** (drawing.md §1, §6.4 Arcs; `flow/repairs`,
  arcs shown; the actor `https://example.org/people/editor` believes
  `jump_1` `false`, `jump_2` and `jump_target_1` `true`, and holds no
  belief in `barline_1`): `draw` fades a flow-control element the reading
  does not read (core's `isRead`, the oracle of which element is read
  being the beliefs written in the fixture). Read for the editor with the
  states `true`, `unlikely` (a filter dropping `undecided`): `barline_1`
  0.35 (undecided), `jump_2` 1, `jump_1` 0.35. Read for another actor with
  `true`, `unlikely`, `undecided`: all three at 1, `jump_1` included,
  and the arcs (from, apex control, tip) exactly those drawn without a
  reading, since in `flow/repairs` every destination's place is read
  under both readings. Without a reading (`null`): `jump_1` alone at
  0.35, as above.
- **The reading decides the places** (drawing.md §1, §3.1, §6.4 Arcs;
  `flow/sections`, arcs shown). `section_break_1` (at 16, `x =
  255.05029296875`) rejected by `https://example.org/a`, read by
  `https://example.org/b` with `true`, `unlikely`, `undecided`: `b` holds
  no belief, so the break is read and starts `jump_2`'s section, its arc
  455.05029296875 → 255.05029296875, as in the fixture without the
  rejection; `jump_1`, at the break's own position, lands at 0 (`x0`).
  The fixture unchanged, read by `b` with `true`, `unlikely` only: the
  break is unread, so both jumps land at 0, as where it is rejected
  without a reading.
- **The reading decides what a `to` names** (the jumps `kept`, `lost`,
  `stray` of "A `to` that names no place" below, `struck` rejected by `a`):
  read by `b` with `undecided`, `struck` and the three rejected jumps are
  read, so `stray` draws its arc 14→4 (405.05029296875 to
  155.05029296875) and all three are at opacity 1. With `struck` not
  rejected, read by `b` without `undecided`: neither `struck` nor
  `jump_target_1` is read, so `stray`, `kept` and `jump_2` name nothing
  and draw no arc; `lost` (to the region `gone`, no flow-control element)
  draws 12→2 and `jump_1` 16→0 (no section break), both faded.
- **`flow/volta_passes`**: the two destinations of `jump_1`, `by` 0 and
  `to` `jump_target_1`, are `volta`, branches of its fork, and draw no
  arc with the arcs shown; the drawing holds the two arcs of the other
  destinations, `jump_2`'s and `jump_3`'s (`repeat_end`), in that order.
- **The arcs of one jump.** No fixture holds a `by` other than 0, so a jump
  `jump_3` is added to `flow/sections` at 24, `x(24) = 355.05029296875`.
  With the destinations `by` 4 and `by` −4 it draws 24→20 (tip at
  305.05029296875) before 24→28 (tip at 405.05029296875): both span 4, so
  the stable sort by span keeps the canonical order, `by` −4 first,
  whether the command gives `by` 4 first or last. With `by` 0 and `by` 4
  it draws the one arc 24→28. Only a `by` that is 0 is going on: on the
  float axis of `flow/loop` (root `Take`, `A = 1251 + 1255 + 1186 + 1260 =
  4952`, `N = 26.59765625`, `x0 = 50.59765625`, length 10.0, `x(8.0) = x0
  + 320`), a jump added at 8.0 with `by` 1e-17 lands at the double `8.0 +
  1e-17 = 8.0` and still draws its arc, leaving and arriving at `x0 +
  320`.
- **The texts of one jump's arcs.** A jump `jump_3` added to
  `flow/sections` at 24 with the label `Leap`, the name `Named` and three
  destinations: `by` −4 with the label `back`, `by` 4 with the
  manifestation `volta` and no label, `by` −8 with neither. It draws two
  arcs, in the order of first fit (span 4, 8), none for the `volta`
  destination, a branch of its fork, and one arc label, `back` centred at
  `x(22) = 330.05029296875`, none for the other (an arc without a
  `label` has no text); then its stack, by the initial
  `label-display` `name label` its name `Named` and its own label `Leap`
  (`{id: jump_3, part: [name]}` and `[label]`), each from `x(24) + 3 =
  358.05029296875`, start-anchored.
- **A `to` that names no place.** `flow/repairs` gains, by commands, a
  region `gone` from 2 to 6; a jump target `struck` at 4, rejected when it
  is added; and three jumps, each rejected when it is added: `kept` at 10
  to `jump_target_1` (at 8, not rejected), `lost` at 12 to `gone`, `stray`
  at 14 to `struck`. `kept` draws its arc 10→8 (`x(10) = 305.05029296875`
  to 255.05029296875) and `lost` its arc 12→2 (355.05029296875 to
  105.05029296875), both faded; `stray` draws nothing, neither arc nor
  label: the target it names is rejected. With `struck` added without a
  rejection instead, `stray` draws 14→4 (405.05029296875 to
  155.05029296875). With `gone` then removed (accepted: only a rejected
  jump names it), `lost` draws nothing either, and the arcs left are, in
  the order of first fit by span, `kept` (2), `jump_2` 16→8 (8) and
  `jump_1` 16→0 (16).

## Flow control over a tree: symbols, forks and stacks (`flow.test.ts`)

The rules proved (drawing.md §6.4, Gathering, Flow control, Flow labels,
Symbols, Forks and Arcs; §6.2; §4): the root's flow control band draws the
flow control of its **whole tree**, each element at its timeline's start
plus its coordinate on the root's axis, and no other timeline draws a flow
control band; the defaults **hide the arcs** (`jump` `display: none`), so
a jump shows its symbol, its fork and its stack alone until a rule
shows its arcs; every element draws its **symbol** (core's `flowSymbols`)
on the symbol row, its text line starting at the **symbol gap** 2 beyond
the flow row, the row `Hs = 2 + h(zs) + 2` wide, so that no glyph meets
the flow lines ending at the flow row; a jump with `volta` destinations
whose places resolve (its **branches**) draws one **fork** on the fork
row beyond the symbol row, `Hf = (h(zf) / 2 + 18 × sM) + h(zf) / 2`
wide, `sM` the `sk` of the last branch of a fork of `N` branches: its
stem from `X − 8` to its branch point `X` at the distance `e = (f0 + Hs)
+ h(zf) / 2`, then per branch, in the order of the branches' places
(ties in the canonical order of `targets`), an arrow 18 long, the first
straight on and, of a fork of `N` branches, branch `k` at the angle
`min(35°, 70° / (N − 1)) × (k − 1)` away from the root's line, its
direction `(ck, sk)` the cosine and sine of that angle rounded to ten
decimal places (the specification's examples: 0°: `(1, 0)`, 35°:
`(0.8191520443, 0.5735764364)`, 70°: `(0.3420201433, 0.9396926208)`;
for four branches `(0.9182161069, 0.396079766)` at 70°/3 and
`(0.6862416379, 0.7273736416)` at 140°/3), ending in an arrowhead of length `4w` and half-width
`2w` (`a = 18 − 4w`: tip `(X + 18 × ck, e + 18 × sk)`, base centre `(X +
a × ck, e + a × sk)`, corners `((X + a × ck) ± (2 × w) × sk, (e + a ×
sk) ∓ (2 × w) × ck)`), and its passes as printed at its own tip, from
`(X + 18 × ck) + 3`, its text line centred on the tip, starting at `t =
(e + 18 × sk) − h(z) / 2`, baseline `yl + t + a(z)` below the line; the
fork counts for the extents as a centred label of width 16 on its jump's
position; the fork has one size whatever the axis's scale
and is never placed by first fit; a `volta` destination draws **no
arc**, whatever the `display` of `jump`; hiding the root's flow control
band hides the flow control of its whole tree, the band then absent
(§2.4); the defaults colour a break red `#D62728`, dotted `1.5 1.5`, 1.5
wide, a section break `#4B5563`, dashed `4 2`, 1.5, a barline `#6B7280`,
solid, 1, and a fork black, 1 wide, its texts at the font size 9.

- **Op. 106** (`data/op106.manifest.json`, a copy of the manifest of
  Beethoven's Piano Sonata No. 29 in the public repository
  `TimeToAlign/beethoven_piano_sonatas`, `sonata_29_op106/manifest.json`
  at `7db6693`), drawn with the default layer alone at the default
  placement: the root `clt_1` (`Op. 106`, quarters, length 15833/4) holds
  no flow control, its four movements `clt_2` (at 0, 1644 long), `clt_3`
  (at 1644, 516), `clt_4` (at 2160, 561) and `clt_5` (at 2721, 4949/4)
  hold it all; every region is an atomic section, hidden. So the root's
  band is the one flow control band of the drawing, at level −1 from `c =
  1.5 + 4 = 5.5` below the root's line `yl` (the drawing's root line; its
  ordinate is the children band's derivation, read from the drawing), and
  holds no stack (every `label` is null): `f0 = 5.5`, `yf = yl + 5.5`.
  With `x(t) = x0 + 400 × u`, `u` the double nearest `t / (15833/4)`
  (`x0` the drawing's root line's start), the flow lines, in the band's
  order (`clt_2` before `clt_3` before …, each in canonical order), are
  the break `break_1` at 500 (`400u = 50.527379523779445`), red `#D62728`,
  1.5, dashed `1.5 1.5`, and the barlines `barline_1` at 824
  (83.26912145518854), `barline_2` at 1644 (166.13402387418682),
  `barline_3` at 1644 + 138 = 1782 (180.07958062274994), `barline_4` at
  2160 (218.2782795427272), `barline_5` at 2721 (274.96999936840774),
  `barline_6` at 2721 + 75/4 (276.8647761005495), `barline_7` at 2721 +
  269/4 (281.7659319143561) and `barline_8` at 15833/4 (400), each grey
  `#6B7280`, 1, solid, each from `yf` to the card's top plus the padding,
  `28.8046875 + 8 = 36.8046875` (the manifest's title above the card, as
  in the flow fixtures). The symbols, in the band's order, at the
  baseline `(yl + (5.5 + 2)) + a(12) = (yl + 7.5) + 11.138671875`, the
  symbol gap 2 beyond the flow row: 𝄇 (U+1D107) of `jump_2` at
  500, then 𝄁 of `barline_1`, 𝄂 of `barline_2`, 𝄁 of `barline_3`, 𝄂 of
  `barline_4`, 𝄂 of `barline_5`, 𝄁 of `barline_6` and `barline_7`, 𝄂 of
  `barline_8`; the volta break and jump target draw none. `Hs = 2 + h(12)
  + 2 = 2 + 13.96875 + 2 = 17.96875`. `jump_1` at 953/2 holds `by` 0
  (passes `[1]`, place 953/2) and `to` `jump_target_1` at 500 (passes
  `[2]`): its fork has two branches, `1.` (place 953/2) then `2.` (place
  500), and is the band's one fork: `N = 2`, `zf = 9`, `sM = s(35°) =
  0.5735764364`, `Hf = (10.4765625 / 2 + 18 × 0.5735764364) + 10.4765625
  / 2 = 20.8009383552`; `e = (5.5 + 17.96875) + 5.23828125 =
  28.70703125`, `w = 1`, `a = 14`, `X = x(953/2)` (`400u =
  48.15259268616182`). The stem from `(X − 8, yl + e)` to `(X, yl + e)`.
  Branch 1 (0°): tip `(X + 18 × 1, yl + (e + 18 × 0))`, base `(X + 14 ×
  1, yl + (e + 14 × 0))`, corners `((X + 14) + 2 × 0, yl + ((e + 0) − 2 ×
  1))` and `((X + 14) − 2 × 0, yl + ((e + 0) + 2 × 1))`, its text `1.`
  from `(X + 18) + 3`, `t1 = (28.70703125 + 0) − 5.23828125 = 23.46875`,
  baseline `(yl + 23.46875) + 8.35400390625`. Branch 2 (35°): tip `(X + 18
  × 0.8191520443, yl + (e + 18 × 0.5735764364))`, base `(X + 14 ×
  0.8191520443, yl + (e + 14 × 0.5735764364))`, corners `± 2 ×
  0.5735764364` across and `∓ 2 × 0.8191520443` outwards from the base,
  as above; its text `2.` from `(X + 18 × 0.8191520443) + 3`, `t2 = (e +
  18 × 0.5735764364) − 5.23828125 = 33.7931258552`, so each text sits at
  its own tip. No bracket and no arc: the band is `0 + 17.96875 +
  20.8009383552` wide, from `yl + 5.5`, and draws no `jump` element. With the
  rule `{element: jump} display: inline` it draws one arc, `jump_2`'s
  repeat 500 → 0 (the start of its section, `clt_2`'s 0, the root's 0);
  `jump_1`'s two destinations are `volta`, branches of its fork, and draw
  none.
- **No band but the root's.** In `child_flow_control` (`piece` 16 long,
  its child `verse` at 4, 8 long, holding the break `fine` at 4 and the
  jump `da_capo_al_fine` at 8), the band records list one flow control
  band, `piece`'s; `verse`'s break is drawn at `x(4 + 4)`, and hiding
  `verse`'s flow control band (`{addresses: [{id: verse, facet:
  flow_control}]}`) hides its break and the symbol `Fine` with it, and
  hiding `piece`'s own band hides the flow control of the whole tree, the
  break and both symbols, and leaves no flow control band record.
- **A child member's band** (`groups/group_child_member`, given by
  commands barlines on `piece` at 4, 8, 16 and a section break at 12, and
  a barline on `second-half` at 2): `second-half`'s member card draws, on
  its own axis (`piece` at −8), `barline_2` at 0, `section_break_1` at 4,
  `barline_3` at 8 and its own `barline_4` at 2, in that order, and not
  the barline at 4; `piece`'s ancestor card, drawn whole (`FULL_CARDS`),
  draws all five.
- **Symbols of one jump** (`flow/repeat_end_and_dal_segno`): `jump_1`'s
  two destinations, `repeat_end` then `dal_segno`, draw one symbol `𝄇𝄉`
  at `x(16)`; the jump targets `jump_target_1` (`repeat_start`) at 4 and
  `jump_target_2` (`segno`) at 8 draw 𝄆 and 𝄋 at their positions, in the
  band's order (`jump_target_1`, `jump_target_2`, `jump_1`).
- **A fork of a run** (`flow/volta_passes`, 16 long, `x(t) = x0 + 25
  t`, drawn with the defaults: no stack, so `f0 = 5.5`; the symbols `Fine`
  of `break_2` and 𝄇 of `jump_2` and `jump_3`, `Hs = 17.96875`): `jump_1`
  at 8 holds `by` 0 with passes `[1, 3]` (place 8) and `to`
  `jump_target_1` at 12 with `[2]` (place 12): one fork at `X = x(8) = x0
  + 200`, its stem from `X − 8`, the branch `1., 3.` straight on, its
  text from `X + 18 + 3`, then `2.` at 35°, its text from `X + 18 ×
  0.8191520443 + 3`; the same `e = 28.70703125` and `Hf` as Op. 106's.
- **Branches by their places.** Added by commands, a jump target
  `jump_target_2` at 2 and a jump `jump_4` at 6 with the destinations
  `by` 0 (volta, passes `[2]`, place 6) and `to` `jump_target_2` (volta,
  passes `[1]`, place 2): canonical order lists the `by` first, but the
  branches follow their places, `1.` straight on and `2.` at 35°, the
  stem from `x(6) − 8`.
- **One size on the canvas.** `flow/volta_passes` drawn at the lengths
  400 and 800 (`x(t) = x0 + 25 t` and `x0 + 50 t`): `jump_1`'s fork lies at
  `X = x(8)`, `x0 + 200` and `x0 + 400`, with the same ordinates, its
  stem from `X − 8`, its tips at `X + 18` and `X + 18 × 0.8191520443`,
  its texts 3 right of them, in both.
- **Five branches share 70°.** A jump `jump_6` at 1 added to
  `flow/volta_passes` with five `volta` destinations `by` 0, 1, 2, 3 and 4,
  passes `[1]` … `[5]`: the step is `min(35°, 70° / 4) = 17.5°`, so its
  five branches take 0°, 17.5°, 35°, 52.5° and 70°, the directions `(1,
  0)`, `(0.9537169507, 0.3007057995)`, `(0.8191520443, 0.5735764364)`,
  `(0.608761429, 0.7933533403)` and `(0.3420201433, 0.9396926208)` (the
  cosines and sines at 20 digits, `bc -l`, rounded to ten places), no two tips alike; `N = 5`, `sM =
  s(70°) = 0.9396926208`, so `Hf = (10.4765625 / 2 + 18 × 0.9396926208) +
  10.4765625 / 2` and its fifth text's line starts at `t5 = (28.70703125
  + 18 × 0.9396926208) − 5.23828125 = 40.3832171744`; the band, no stack,
  is `0 + 17.96875 + Hf` wide.
- **Four branches.** The same jump with four destinations `by` 0 to 3:
  the step is `70° / 3`, and the four tips lie at `(X + 18 × ck, e + 18
  × sk)` for the specification's four directions of `N = 4` (above),
  each text from 3 right of its tip.
- **One branch.** A jump `jump_7` at 1 with one destination `by` 0
  (volta, passes `[1]`) added to `flow/sections` (no fork else, no other
  volta): `N = 1`, `sM = 0`, `Hf = (10.4765625 / 2 + 0) + 10.4765625 / 2
  = 10.4765625`, one text line; the band, one stack tier (Stacks, below)
  and the symbols `Fine`, 𝄂 and the jumps' 𝄊, is `10.4765625 + 17.96875
  + 10.4765625` wide.
- **A destination without a place** (`child_flow_control`, `x(t) = x0 +
  25 t` on `piece`'s axis, arcs shown): given by commands a section break
  `section_break_a` of `piece` at 2, a jump `jump_x` of `verse` at 6 (10
  on `piece`'s axis) and a jump `jump_y` of `piece` at 14, each with one
  destination without a place, `jump_x`'s arc runs from `x(10)` to
  `verse`'s start `x(4)` (`section_break_a` lies before it) and
  `jump_y`'s from `x(14)` to `x(2)`; a section break `section_break_c` of
  `verse` at 2, 6 on `piece`'s axis, takes both: `x(10) → x(6)` and
  `x(14) → x(6)` (core's `destinationPlace`, section 3.1).
- **Stacks** (`flow/sections`, `x(t) = x0 + 12.5 t`): with the initial
  `label-display` `name label` (no element of it has a name), `break_1` draws its label `Fine`, `jump_1` its
  own label `D.C. al Fine` and `jump_2` `D.C.`, each start-anchored at
  `x + 3`, all in tier 1 (their extents do not meet), on line 1, baseline
  `yl + f0 − d(9)`; `section_break_1` has no label and draws no stack.
  With `{element: break} label-display: "id label"`, `break_1`'s stack is
  `break_1` on line 1 and `Fine` on line 2 (`h(9)` further in), and its
  tier is two lines high.

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
manifest with its title at `display: none`. The defaults cut no title of
the manifest (their rule `{addresses: [{part: [name]}]}` sets `max-width:
none` after the names' 160): named "LayerIt, Clair de lune mm. 1–6
(Pires)", wider than 160 at size 11, the title is that whole text; a later
layer's `{element: name}` rule stating `max-width: 160` reaches it, a
later layer outranking the defaults (section 2.5), and cuts it to
"LayerIt, Clair de lune mm. …", as the manifests of the LayerIt figures
were cut before.

**A cut name keeps its whole text** (section 6.6: the drawing writes the
cut text alone, and the name lets an application find the whole). A name
cut to its `max-width` carries the whole text it stands for, the names
joined or the `content`, as `whole`, which no writer writes; a name drawn
whole carries none, so its absence means "nothing is cut". The row above
cut to `"A…"` carries `whole` `"AAAA"` (its `content`), the root's `"r"`
none. On `flow/virtual_cards` with its three virtual timelines placed,
every name at size 11 under the defaults' `max-width` 160, that is an
advance sum of at most `160 × 2048 / 11 = 29789.09…` (`…` is 2048), each
virtual card's whole name (`V · unfolded from T`, section 8.10) is cut as
one text, so its suffix gives way first: `"Allegro, practice ·
unfolded…"` (sum 29777, the next space 651 too many), `"Allegro, default
· unfolded …"` (29353, the next `f` 721 too many) and `"Allegro, single ·
unfolded fr…"` (29773, the next `o` 1253 too many), whole `"Allegro, practice
· unfolded from Allegro"` and so on; `"Allegro"` and the title "Virtual
cards" are whole and carry none. The name column `N` is measured on the
cut names (section 8.2): `N = 29777 × 11 / 2048 = 159.93505859375`, so
every name, drawn from `n = P + K = 16`, ends at most at `n + N =
175.93505859375`, and every line of the block, the root's and the three
virtual cards', starts at `s0 = n + N + G' = 183.93505859375`: no name
covers a line.

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
`Hc = y_root + max(Eb, h(s) / 2) + P`, and a root's break's line ends `P`
from the member drawing's top or `Hc − P` below it. `H = Hc + 18`.

- `bare`, one row and no gap between bands (its markers band lies against
  its line), draws the same at card spacings 0 and 8: the line at
  22.40234375, `W = 476.5771484375`, `H = 67.37890625`.
- `flow_control` at card spacing 8: the flow control band from `26.9765625
  + 8 = 34.9765625`, its break's stack (`fine`, `Fine`) one tier two lines
  high, so the flow row `34.9765625 + 2 × 10.4765625 = 55.9296875` out,
  `yf = 8 + (14.40234375 + 55.9296875) = 78.33203125`; two jump rows with
  `pj = 6 + 8 + 10.4765625 = 24.4765625` make the band `20.953125 + (4 +
  8) + 24.4765625 + 2 + 10.4765625 = 69.90625` wide, `Eb = 104.8828125`,
  `Hc = 14.40234375 + 104.8828125 + 8 = 127.28515625`, `H =
  145.28515625`; the break's line from `yf` to `8 + 8 = 16`. With
  `[flow_control, children, conversion_maps] | [markers, regions]` the
  band lies alone above, from `1.5 + 8 = 9.5`, its flow row `9.5 +
  20.953125 = 30.453125` out, `Ea = 9.5 + 69.90625 = 79.40625`, `y_root =
  87.40625`, the line at 95.40625, `yf = 8 + (87.40625 − 30.453125) =
  64.953125`, `Hc = 87.40625 + 26.9765625 + 8 = 122.3828125`, `H =
  140.3828125`; the break's line runs to the padding below, `8 + (Hc −
  8) = 122.3828125`.

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
band; the defaults show them (`unknown_length_segments`' two), and the
layer `CHILD_REGIONS_HIDDEN` (support: the regions band of every timeline
held by a band hidden) hides them.

## Ancestor lines (`ancestors.test.ts`)

`group_child_member`, `group_grandchild`, `group_parents_mixed` and
`group_grandchild_parent_on_top` are checked against section 8.3, every
value derived from the member's offsets and length and the quantities
below: an ancestor line runs on to the left with its own arrowhead, lies on
the side of the member opposite to where its own completed band order puts
its `children` band (the default order puts `children` above the line, so
every ancestor line of these fixtures but `movement`'s in
`group_grandchild_parent_on_top` lies below the member), under a small grey
name; one row per ancestor, the deeper ancestor nearest the member on its
side; the outer chevron's tip counts in the right edge; the ancestors'
elements come first within each frame, from `A1` to `Ak` whatever their
side (section 8.5). No ancestor line marks the member's start or end:
nothing is drawn at `{id: M, part: [start]}` or `{id: M, part: [end]}`.
The member's start and end are its named timestamps `origin` and `length`,
groupstamps with the `display` `[wedge, coordinate, cross_section]` (in
`group_child_member` and `group_grandchild` `timestamp_3` and
`timestamp_4`): wedges of its own markers band below its line, which the
member's own band order moves, and, on each ancestor line their
cross-section lines cross, secondary coordinates, which the defaults hide
and which so take no room. Shown by a rule (`{coordinates: secondary}`
`display: inline`), each is drawn on the ancestor line, faded with it,
its coordinate label in the ancestor's unit and number type; `inside:
ancestor` matches that drawing and never the member's own wedge. With
nothing drawn on it, a row is its pitch alone: the inner and the outer half
`q / 2`. Single changes prove the room taken: a row's pitch from its name's
size, eight stroke widths of `x0` for a line running on to the left (and a
wider stroke widening no row), a wedge of the ancestor's own named
timestamp reaching `w / 2 + 13` without a label, its coordinate label a
centred label for `x0`, none for a hidden ancestor, and the ancestor band
`S` beyond the stroke of a wide member's line.

**The quantities.** The member's card lies at `y = 32.8046875` (the
frame's top 8, `Q`, the title's `h(11) = 12.8046875` and the gap 4); `P =
8`, the card spacing `S = 4`, `p0 = max(10 + S, h(11)) = 14`, an ancestor
row's pitch `q = max(14, h(9) = 10.4765625) = 14` (names of size 9), the
member's line `w = 3`. A member whose markers band below holds its `origin`
and `length` in one label tier has `Eb = w / 2 + 13 + 2 + h(9) =
26.9765625`; with nothing above its line `Ea = 0` and `y_root = max(P + 0,
P + h(11) / 2) = 14.40234375`, so its line lies at `32.8046875 +
14.40234375 = 47.20703125`. An ancestor band below starts at `c0 = max(p0
/ 2, max(Eb, w / 2) + S) = max(7, 30.9765625) = 30.9765625`; a row with
nothing drawn on it has the inner half `q / 2 = 7` and the outer half `q /
2 = 7`, so the nearest ancestor line lies `30.9765625 + 7 = 37.9765625`
below the member's, each further one `Δ = 7 + 7 = 14` beyond (the ancestor
card hidden, `Δ` takes no `d` of section 8.3), and a band of `k` rows
reaches `c0 + 14 k`: `Eb' = 44.9765625` for one row, `58.9765625` for two.
`Hc = y_root + Eb' + 8`. A name of size 9 has its baseline `(a(9) − d(9)) /
2 = 3.11572265625` below its row's line (`a(9) = 8.35400390625`, `d(9) =
2.12255859375`). The member's own wedges lie at `y + 1.5` and `y + 14.5`,
their labels at `y + 16.5 + a(9) = y + 24.85400390625`. A wedge on an
ancestor line below the member has its tip at `ya + 1.5` and, not turned,
its base at `ya + 14.5`; its label's baseline at `ya + 24.85400390625`.
Horizontal values are those of the drawing fixtures, which no side
changes. These are TimeToShare's drawings README's (Shared quantities and
the sections `group__group_child_member`, `group__group_grandchild`,
`group__group_parents_mixed`, `group__group_grandchild_parent_on_top`).

- `group_child_member` (`second-half` 8 at 8 in `piece` 16): `second-half`
  at 47.20703125, `piece` at `47.20703125 + 37.9765625 = 85.18359375`, its
  name at 88.29931640625, nothing else on its line; the member's own
  wedges at 48.70703125 and 61.70703125, labels `0 ♩` and `8 ♩` at
  72.06103515625; the card `14.40234375 + 44.9765625 + 8 = 67.37890625`
  high. With the secondary coordinates shown, `timestamp_3` and
  `timestamp_4` are drawn in the member's card on `piece`'s line too, at `x0` and `x0 + 400`,
  tips at 86.68359375, opacity 0.35, rotation −45 (the defaults' rule for
  a secondary coordinate), their coordinate labels `8 ♩` and `16 ♩`
  (`coordinate` `{quarters, 8}` and `{quarters, 16}`), drawn before the
  member's own (section 8.5).
- `group_grandchild`: `movement` at 85.18359375 and `score` at
  `85.18359375 + 14 = 99.18359375`, names 88.29931640625 and
  102.29931640625, nothing on either line; the member's own wedges and
  labels as in `group_child_member`; the card `14.40234375 + 58.9765625 +
  8 = 81.37890625`. The member's card writes, after its rectangle: the
  ancestor lines of `score` and `movement`, `theme`'s line, the wedges of
  `timestamp_3` and `timestamp_4`, the names of `score`, `movement` and
  `theme`, the coordinate labels `0 ♩` and `8 ♩`, then the two pieces of
  each of the two cross-section lines, `timestamp_3`'s first (section
  6.6: the last descriptors of the member drawing).
- `group_parents_mixed`: the cards at 32.8046875, `+ 67.37890625 + 8 =
  108.18359375` and `+ 67.4765625 + 8 = 183.66015625`; `take` has a map
  above (`Ea = 6.5`, `y_root = 14.5`, its card `14.5 + 44.9765625 + 8 =
  67.4765625`), so the lines lie at 47.20703125 / 85.18359375 (`sonata`),
  122.68359375 / 160.66015625 (`session`) and 198.0625 / 236.0390625
  (`page`); ancestor names at 88.29931640625, 163.77587890625,
  239.15478515625. With the secondary coordinates shown, each member's
  `origin` and `length` (`timestamp_3`, `timestamp_4` on `exposition`,
  `timestamp_7`, `timestamp_8` on `take`, `timestamp_5`, `timestamp_6` on
  `system`) label their ancestor line in the ancestor's number type, as
  section 5.2 writes it, before the member's own label in the member's
  card: `16 ♩` / `48 ♩` on `sonata` (fraction), `30″` / `55.5″` on
  `session` (float seconds), `0 px` / `600 px` on `page` (int).
- `group_grandchild_parent_on_top` (`group_grandchild` with `movement`'s
  band order `[line, children, conversion_maps, markers, regions,
  flow_control]`, which `theme` follows, its markers band still below):
  `movement` alone above, its band starting at `max(7, max(0, 1.5) + 4) =
  7`, its line 14 above the member's and the band `7 + 7 + 7 = 21` wide, so
  `y_root = 29`; `score` alone below at 37.9765625. `theme` at
  61.8046875, `movement` at 47.8046875 (name 50.92041015625), `score` at
  99.78125 (name 102.89697265625); the member's own wedges 63.3046875 /
  76.3046875, labels 86.65869140625; the card `29 + 44.9765625 + 8 =
  81.9765625` high and its record's `contentCount` 4 (row, markers band,
  two ancestor bands).
- Single changes to `group_child_member` (the ancestor card hidden):
  - its own band order with markers above (`Ea = 26.9765625`, `Eb = 0`):
    the ancestor band below starts at 7, `second-half` at `32.8046875 + 8
    + 26.9765625 = 67.78125`, `piece` at 81.78125, the card `34.9765625 +
    21 + 8 = 63.9765625`; the member's wedge at 66.28125 / 53.28125, label
    49.15869140625.
  - Ancestor names of size 20: `q = h(20) = 23.28125`, `piece` at
    `47.20703125 + 30.9765625 + 11.640625 = 89.82421875`, its name at `+
    6.923828125`, the card `14.40234375 + 30.9765625 + 23.28125 + 8 =
    76.66015625`.
  - An ancestor stroke of 5: `x0` 136.61962890625 (`xn + N + G' + 8 × 5`),
    `piece` from 116.61962890625, still at 85.18359375, the card still
    67.37890625: the stroke widens no row without a wedge.
  - A named timestamp of `piece` at 12 with the `display` `[wedge]`: its
    wedge at `x0 + 200`, tip 86.68359375, base 99.68359375; the row's outer
    half `max(7, 1.5 + 13) = 14.5`, the card `67.37890625 + 7.5 =
    74.87890625`.
  - A named timestamp of `piece` at 8, the member's start, with the
    `display` `[wedge, coordinate]`, its labels inside the ancestor of size
    150: its label `8 ♩` (`w(8 ♩, 9) = 12.83203125`, so `213.8671875` wide
    at 150) is a centred label at `u = 0`, so `x0 = 24 + 106.93359375 =
    130.93359375`; the outer half `1.5 + 13 + 2 + h(150) = 191.109375`, the
    label's baseline `85.18359375 + 16.5 + a(150) = 240.9169921875`, the
    card `67.37890625 − 7 + 191.109375 = 251.48828125`.
  - `piece` hidden: no ancestor element, `x0` back to `xn + N + G' =
    96.61962890625`, the card `14.40234375 + 26.9765625 + 8 =
    49.37890625`.
  - The member's line hidden: both edges 0, the band from `max(7, 0 + 4) =
    7`, `piece` at `32.8046875 + 14.40234375 + 14 = 61.20703125`, the card
    `14.40234375 + 21 + 8 = 43.40234375`; the card writes its rectangle,
    `piece`'s ancestor line and its name alone.
  - A member stroke of 16 under `piece`'s order with children below (so
    `piece` lies above and the member's markers band, following that order,
    below, `Eb = 8 + 13 + 2 + h(9) = 33.4765625`): the band starts at
    `max(7, 8 + 4) = 12`, `piece` 19 above the member, the band `12 + 7 +
    7 = 26` wide, `y_root = 34`: the member at 66.8046875, `piece` at
    47.8046875, the card `34 + 33.4765625 + 8 = 75.4765625`.
- The cascade on each drawing: a rule on `piece`'s address styles its
  ancestor line, its name and the secondary coordinates on it (wedges and
  labels, held by the line), never the member's own drawing of the same
  timestamp; without the default layer (so the secondary coordinates
  shown) and with the ancestor card hidden, `timestamp_3` is drawn three
  times, on `piece`'s line in `second-half`'s card (the rule's fill), on
  `second-half`'s line (the initial `none`) and, being a groupstamp, on
  `recording`'s line in its card (`none`). `{element: wedge, inside:
  ancestor}` matches the first alone, under the default layer with the
  secondary coordinates shown.

**A member's cross-section lines cross its whole card** (section 6.6):
a named timestamp's line runs from its card's upper border to its lower
border, the ancestor lines on either side included, less its gap, which
a timestamp drawing its line alone does not have. What proves it: the
ordinates are read off other records of the same drawing (the card boxes
keyed by their place keys, the ancestor lines' `y`), and every drawn
line's marker (`AxisMarker.crossSection.span`) is its card's span.

- `group_parent_both` (`middle`, offset 4, length 8 in `piece` of 16) with
  the named timestamp `Here` at 2 on `middle`, `display` `[cross_section]`
  (given the ID `here`): `middle` at 47.20703125, `piece`'s ancestor line below
  at 85.18359375; one line at `x0 + 400 × 2 / 8 = 211.70361328125` from
  the top of `middle`'s card to its bottom, across the ancestor line.
- The same with a child `inner` of `middle` (offset 1, length 2) and a
  named timestamp `in` at 1 on `inner`, `display` `[cross_section]`: its line
  crosses `middle`'s whole card too, at the same abscissa (1 + 1 of
  `middle`'s 8): a descendant's line is the card's, as the member's.
- Hiding the ancestor line (`{addresses: [{id: piece}]}`, `display: none`)
  leaves the line across the card.
- `group_grandchild_parent_on_top`: `theme`'s marker spans its card, and
  `Here` at 2 on `theme` (`here`) draws its line at 211.70361328125
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
the line's outer side, its stack in one first fit (`A`'s timestamps in
canonical order, then the secondary coordinates on `A`, hidden ones taking
no room), tiers counted in lines; its cross-section line across the
member's card, its gap measured out from the ancestor line on that side
(`c` 0, `w` its stroke width 3); full opacity for its line, primary wedge
and labels by the defaults, on the faded line; and a cross-section segment
in the member's card for an alignment anchor, never one in the ancestor
card that draws `A` as a root (section 8.8). What proves it:
`group_child_member` (`second-half` 8 at 8 in `piece` 16, the window 8 to
16, the quantities above: `x0 = 120.61962890625`, `piece` at
85.18359375) with four timestamps added on `piece` through commands,
each given its name in lower case as its ID: `before` at 4 (wedge, name,
line), outside, of which nothing is drawn; `b` "B" at 8 (wedge, name), the
start; `c` "C" at 12 (wedge, name, line); `d` at 16 (wedge), the end. The wedges lie at `x0`, `x0 + 200`, `x0 + 400`, tip `85.18359375
+ 1.5`, base `+ 14.5`. The first fit places "B" at `x0` and "C" at `x0 +
200`, both in tier 1 (the secondary coordinates of `origin` and `length`
on `piece` are hidden and take no room): baselines `85.18359375 + (1.5 +
13 + 2) + a(9)`; the row's outer half `1.5 + 13 + 2 + h(9) = 26.9765625`,
so the card is `67.37890625 − 7 + 26.9765625 = 87.35546875` high.
Opacities: the three wedges, both name labels and "C"'s line 1. "C"'s line
runs from the card's top to the tip, `85.18359375 + 1.5`, and from the end
of its label, `85.18359375 + (1.5 + 13 + 2 + h(9))`, to the card's bottom.
Drawn with the defaults (the ancestor card shown), "C"'s line is drawn in
four pieces, two in the ancestor card and two in the member's, and
`timestampSegments` gives the member card's span alone, at the member's
`x0 + 200`.

**Only the coordinate label carries a coordinate.** A label of a stack
carries the value it shows on its timeline's axis (`coordinate`), and only
the coordinate label shows one: a name or ID label carries none, on an
ancestor line as in a markers band, both built by one function. What
proves it: `group_child_member` with `start` "Start" added on `piece`
at 8 through a command, its `display` listing the wedge, name, ID and
coordinate. Drawn with the default layer and the ancestor card hidden, its
labels on `piece`'s ancestor line in the member's card are, in order,
"Start", "start" and "8 ♩", carrying no coordinate, no coordinate
and 8 quarters; drawn with the default layer alone, the same three labels
come first in `piece`'s markers band of its own card with the same
coordinates, then once more on the ancestor line.

## Ancestor cards (`ancestor-cards.test.ts`)

Section 8.8 is the oracle. Every number below is derived from its rules,
the fixtures' offsets and lengths, `L = 400`, the constants `P = Q = K = G
= 8`, the advance widths `w(text, s) = A × s / 2048` (section 5.1) and the
layout's existing values, which the figures of the drawings with the
hiding layer pin (`group__group_parent_both__ancestor-cards-hidden` and
the others, byte for byte); the defaults show the cards, and the layer
`HIDDEN_ANCESTOR_CARDS`, `{rules: [{select: {element: ancestor_card}, set:
{display: none}}]}`, hides them. A card whose default proportion is below
1 draws gaps (section 8.9; "Elisions" below derives them); where its
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

**The frame's room.** What of a card lies outside its member's span lies
outside the frame (section 8.8, step 2, as this package draws it): the
card's axis has a seam at each end of the protected span, where it jumps
right without leaving anything out, `OL = s0` wide at its start (the
frame's left edge lies at 0 in item coordinates) and `OR = Fw − (s0 +
L')` wide at its end, `Fw` the frame's width; a position at a seam lies
on the span's side (one seam concept with the seams of a root drawn once,
"Arrangements" point 4, section 3.2: a jump of the card's axis that leaves
out nothing and draws nothing, no rectangle, ellipsis, continuation or
label, that the exposure lists as no gap; only a seam between two anchors
puts a line's start, a region's start and a jump's target at it on its
right side). So `dx = xs + DL − s0'` with `DL` counting `−OL`:
everything left of the span, the card's names and left edge included,
lies `OL` further left than without the seams, the span stays over the
member's line, everything right of it lies `OR` further right, and the
card is `OL + OR` wider, or `OL` where the root ends with the span. A line
crossing a seam is drawn whole across it (the frame covers it) and has an
axis per side. In every fixture below `OR = 8w + K + Q = 40`, the room of
the chevrons of the ancestor line running on to the right, but in
`group_parents_mixed`, where the frame reaches to its widest right edge:
`OR = 554.947265625 − 505.0302734375 = 49.9169921875`.

1. **Shown by default, hidden by a rule.** For every manifest fixture
   drawn with the default layer, the `ancestor_card` elements and the
   records carrying `ancestor` number one per group and root of a child
   member (section 8.8, Which): two in `bundle_shared_parent` (`score`
   behind both frames), three in `group_parents_mixed` (`sonata`,
   `session`, `page`), four in `bundle_elided_layerit` (the Suite behind
   each of its four frames), two in `bundle_elisions_stored` (`score` and
   `session`), two in `bundle_arranged_conflict` (`score` behind each of
   its two frames), five in `bundle_arranged_roots` (`score` and `session`
   behind `group_1` and `group_3`, `score` behind `group_2`), one in
   `bundle_mixed`, `group_child_member`, `group_child_member_stamps`,
   `group_elided_inside`, `group_elided_members`, `group_grandchild`,
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
   `xs − OL − s0' = −252.33544921875` (`OL = s0`), place
   `−244.33544921875`; its width `52.33544921875 + 800 + 9 + 8 + OL + OR
   = 1013.0390625`. The block grows left to `Xl = −244.33544921875 − P`:
   origin `(252.33544921875, 0)`, `W = P + (−244.33544921875 +
   1013.0390625 + 2) + 252.33544921875 = 1031.0390625`, `H` unchanged (`8 + 8 + 157.5625 = 173.5625`, the
   frame holding `middle`'s card of 67.37890625 and `recording`'s of
   49.37890625): the card's bottom lies above the frame's. Vertically the card is `piece` as the one ungrouped
   root of a block holding nothing else: its height and the distance of
   its line below its top are those of `piece` in the drawing of the same
   manifest after core's `remove` of `group_1` and `recording` at `L =
   800` (63.37890625 and 48.9765625); its line lies on `piece`'s ancestor
   row in `middle`'s card, below `middle`'s line (section 8.3; the
   quantities of "Ancestor lines"), `y = 85.18359375` in the block, so its
   top is `85.18359375 − 48.9765625 = 36.20703125`. In the block: the
   card's record at `x = 8`, `y = 36.20703125`, `1013.0390625 ×
   63.37890625`, key
   `{item: group_1, member: piece}`, address `{id: piece, part: [card]}`,
   holder null, `ancestor {group: group_1, member: middle}`, no `item` or
   `card` member; `piece`'s line from `8 + xs − OL + 252.33544921875 =
   60.33544921875` to `60.33544921875 + 800 + OL + OR = 1004.0390625` at
   `85.18359375`; `middle`'s row (at `36.20703125 + 15 = 51.20703125`)
   from `8 + s0 + 252.33544921875 = 364.0390625` to `764.0390625`. The card writes 13 elements, its range `[1, 14)`:
   its rectangle, `piece`'s line, `middle`'s line, the wedges of `middle`'s
   `origin` and `length`, the names `Middle` and `Piece`, their two
   coordinate labels and the two pieces of each groupstamp's cross-section
   line across the card, below `middle`'s row (TimeToShare's drawings
   README, `group__group_child_member`'s ancestor card alike). Its whole drawing is the reference block's (every
   element of `piece`'s card there, its rectangle a `card`, here an
   `ancestor_card`) moved by the difference of the two cards' corners,
   and then every abscissa at or right of `middle`'s start (`260.33544921875`
   there) by `OL` more and every one right of its end (`660.33544921875`)
   by `OR` more, a rectangle's width by what its two edges move apart,
   exactly (every value is dyadic).
3. **Nothing moves.** Every element after the ancestor cards, every record
   but theirs, and every axis of an item's card equal those of the drawing
   with the hiding layer moved by the change of the origin,
   `(252.33544921875, 0)`: the cards take no room, and their own axes
   follow every item's (point 8). The order: the block's background, the
   ancestor card's rectangle and its drawing (records' ranges 1 to 14),
   then the frame.
4. **`group_parent_right`** (`first-half` at 0, 8 long). `s0 = 16 +
   55.70361328125 + 8 = 79.70361328125` (no line runs on to the left), `us
   = 0`, `ue = 16 / 8 = 2`, `xs = s0`, `LA = 800`; `N' = w("First half",
   11) = 8953 × 11 / 2048 = 48.08740234375`, `s0' = 64.08740234375`; left
   `8 + 79.70361328125 − OL − 64.08740234375 = −56.08740234375` (`OL =
   s0`: the seam at `piece`'s start moves its names out of the frame,
   its line starting under it), width `64.08740234375 + 800 + 9 + 8 + OL +
   OR = 1000.791015625`; origin `(64.08740234375, 0)`, `W = 8 +
   1000.791015625 + 2 + 8 = 1018.791015625`, `H = 173.5625`; top
   `36.20703125` as in case 2 (same rows); `piece`'s line starts at
   `xs`, `8 + 79.70361328125` plus the origin.
5. **`group_parents_mixed`** (one frame, display order `exposition`,
   `take`, `system`, `audio`), drawn with `FULL_CARDS`: three cards, in
   that order, behind it. The values below are those without the seams;
   then `OL = s0 = 105.0302734375` moves every left edge left and widens
   every card, and `OR = 49.9169921875` widens `session`'s and `page`'s,
   which run on past their members' ends (`sonata` ends with
   `exposition`).
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
   grows left to `session`'s card: origin `(423.5276884191177 + OL =
   528.5579618566177, 0)`; the records at `x` 263.5276884191177, 8,
   479.5389188878677 (each left `− OL + 8 + 528.5579618566177`), widths
   795.339599609375, 1641.6816980698532 and 1398.2996419270833, tops `36.20703125`, `111.68359375`, `187.0625`
   (each member's ancestor row, `85.18359375`, `160.66015625`,
   `236.0390625` ("Ancestor lines"), less 48.9765625: every root has one
   child row with two labelled wedges);
   `W = 479.5389188878677 + 1398.2996419270833 + 2 + 8 =
   1887.838560814951`, `H` unchanged, `8 + 8 + 308.515625 = 324.515625`.
   Each card is its root drawn alone at its `LA`, which the reference
   draws `OL` (`sonata`) or `OL + OR` narrower.
6. **One hidden of several.** The same with the defaults, `session`'s
   cards hidden by `{addresses: [{id: session, part: [card]}]}` `display:
   none` in a second layer: two cards, the block grown left to `sonata`'s
   only (drawn whole, `r = 1`), origin `(168 + OL, 0) = (273.0302734375,
   0)`, nothing of `session` drawn but its ancestor line.
7. **No ancestor line.** With the ancestor lines hidden (`{element:
   ancestor}` `display: none`), `piece`'s card in `group_parent_both` lies
   on `middle`'s own line instead: its line's ordinate equals `middle`'s.
8. **An ancestor card's axes.** Its lines are drawn lines as any card's,
   so the coordinates over them read as over any card. In
   `group_parent_both` the drawing's axes are those of the hiding layer's
   drawing moved by `(252.33544921875, 0)`, then four more, in the order of
   the card's lines: `piece`'s three runs and `middle`, each keyed `{item:
   group_1, member: piece}` (the card's key) and carrying `ancestor
   {group: group_1, member: middle}` (its record's). From the card's
   corner `(8, 36.20703125)`, `s0' = 52.33544921875`, `LA = 800`, `OL =
   103.70361328125` and `OR = 40` (point 2): `piece`'s axes at `36.20703125
   + 48.9765625 = 85.18359375`, quarters, fraction, cut at the seams at 4
   and 12: from `8 + 52.33544921875 = 60.33544921875` to `+ 200 =
   260.33544921875` (0 to 4), from `+ OL = 364.0390625` to `+ 400 =
   764.0390625` (4 to 12) and from `+ OR = 804.0390625` to `+ 200 =
   1004.0390625` (12 to 16, drawn end 16), its line element's start and
   end the first's start and the last's end; `middle`'s at `36.20703125 +
   15 = 51.20703125` (the card's padding and the row's half pitch 7) from
   `364.0390625` to `764.0390625`, from 0 to 8, drawn end 8, its line
   element starting there (a child's line stops short of its end mark).
   `lineAxes` lists all four with these numbers, drawn lengths 4, 8, 4
   and 8, and the same `ancestor`.
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
   same piece `252.33544921875` further right (the origin, as in
   `group_parent_both`), and none across the ancestor card. (`middle`'s `origin` and `length`, groupstamps of the fixture,
   draw their own pieces at `x0` and `x0 + 400`, left out of this count.)
10. **No segment for an alignment anchor.** An ancestor card gives no
   cross-section segment to an alignment anchor (sections 8.7, 8.8 point
   5), though the named timestamps of its drawing are marked on its lines.
   In `group_child_member_stamps` drawn with the defaults,
   `timestampSegments(axes, timestamp_2)` is `middle`'s segment in its own
   card alone, `{x: 311.70361328125 + 252.33544921875 = 564.0390625,
   y1, y2}` with `y1` and `y2` the top and bottom of `middle`'s member card
   (its box; TimeToShare's drawings README, moved by the origin), though
   `middle`'s row in `piece`'s card holds `timestamp_2` at 564.0390625
   too, that row starting at 364.0390625; the drawn `anchor_1` is the hiding layer's moved by the origin.
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
   both takes and `page`, at `L = LA`): `158.3828125` high, its line
   `101.9296875` below its top. Its children `exposition` and
   `recapitulation` share one row and one band order, so they lay out their
   bands together (section 6.4, Rows of one band order): `recapitulation`,
   which holds no map, has a conversion maps band all the same, at level 1
   with `exposition`'s slots, `e = 1.5 + 2 × 5 = 11.5`, so its segment
   labels lie at `m = max(11.5, k) = 11.5` (the row's one `m`) rather than
   `k = 8`, its line reaching `11.5 + 2 + 10.4765625 = 23.9765625` above as
   `exposition`'s does, and both children bands start at `c0 = 23.9765625 +
   4 = 27.9765625` (`24.4765625` before), each `28.4765625` wide (an empty
   one `exposition`'s, as wide as the other): the row's outer half and so
   `score`'s children band and card 3.5 more than `score` laid out line by
   line would give; its line lies on `score`'s ancestor row in
   its member's card, below the member's line, at `123.5625`
   (`exposition`'s card) and `369.7265625` (`recapitulation`'s), the
   ordinates of the drawing with the hiding layer, whose place origin is
   the block's corner: each member card's top (53.609375 and 250.8203125)
   plus `y_root = 8 + Ea` (`Ea` the edge of its children and maps bands
   above, 23.9765625 and 52.953125) plus 37.9765625 (its markers band below
   holds one label tier; the ancestor row holds nothing, `7 + 7`, so the
   cards are 84.953125 and 113.9296875 high); so `score`'s line lies at
   `123.5625` and `349.75`, and the tops at `123.5625 − 101.9296875 =
   21.6328125` and `247.8203125`. The block grows left to the
   second card, `Xl = −698.6901041666667 − OL = −826.0802408854167` (`OL
   = x0 = 127.39013671875`, `OR = 40`), and up to the first, `Yt =
   21.6328125 − Pt = −7.171875` with `Pt = 28.8046875`, the first frame's
   top in the drawing with the hiding layer: origin `(826.0802408854167,
   7.171875)`, `W = (8 + (−24.0234375 − OL + 1243.3592936197915 + OL + OR
   + 2)) − Xl = 2095.416097005208`, `H = 497.5078125 + 7.171875 = 504.6796875` (the
   hiding layer's height, its bottom unchanged). Records: two cards, both
   addressed `{id: score, part: [card]}`, keyed `{item: group_1, member:
   score}` at `(674.6666666666667, 28.8046875)`, `OL + OR` wider,
   1410.7494303385415, and `{item: group_2, member: score}` at `(8,
   254.9921875)`, `OL` wider (`score` ends with `recapitulation`),
   1370.7494303385417, carrying `ancestor {group: group_1, member:
   exposition}` and `{group: group_2, member: recapitulation}`.
   `lineAxes` lists `score`'s line in each, keyed by its card, cut at the
   seams: at `123.5625 + 7.171875 = 130.734375` from `8 + xs + OL` plus the origin,
   `961.4703776041667`, to `+ 400 = 1361.4703776041667` (0 to 12) and
   from `+ OR = 1401.4703776041667` to `2068.137044270833` (12 to 32);
   at `356.921875` from `167.41357421875` to the frame's left edge,
   `834.0802408854167` (0 to 20), and from `+ OL = 961.4703776041667` to
   `1361.4703776041667` (20 to 32); drawn lengths 12, 20, 20 and 12.
12. **The hover readers answer for a card's line.** `crossSection`,
   `crossedLines` and `wedgeAt` read an ancestor card's lines by their
   keys as any card's. In `group_parent_both` (point 2), at `x =
   564.0390625` (`piece`'s 8): `piece`'s unnamed cross-section line in the card runs
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
13. **A root of unknown length ending at the end seam** (section 3.2: a
   position at a seam lies on the side the section placing it states;
   section 8.8, step 2: at either seam, the side of `M`'s span). In
   `group_parent_both` with `piece`'s length set to null by core's `set`,
   `piece`'s reach is `middle`'s end, 12, so its open end lies exactly at
   the seam at the end of `middle`'s span: on the span's side, under the
   frame, and nothing of the root lies right of that seam. `ts = −4`, `λ =
   8`, `te = −4 + 12 = 8`: `ue = 1`, `xe = s0 + 400`, `LA = 600`. So the
   card is `piece` drawn alone (core's `remove` of `group_1` and
   `recording`, at `L = 600`; its width `s0' + 600 + 9.5w + 8 =
   688.83544921875`, the open end's three chevrons `9.5w = 28.5` past its
   end, "Timelines of unknown length") moved to the card's corner and then
   through the start seam alone: every abscissa at or right of `middle`'s
   start (`260.33544921875` there) `OL = 103.70361328125` further right,
   none by `OR`, the chevrons following the open end they mark. The card
   is `688.83544921875 + OL = 792.5390625` wide, its record otherwise point
   2's (corner `(8, 36.20703125)`, height 63.37890625, range `[1, 14)`);
   it ends inside the frame, so the block is the hiding layer's moved by
   the origin `(252.33544921875, 0)`: `W = 559.70361328125 +
   252.33544921875 = 812.0390625`. `piece`'s axes in the card: from
   `60.33544921875` to `260.33544921875` (0 to 4, drawn end 4) and from
   `364.0390625` to `764.0390625` (4 on, its end not known, drawn end 12),
   the second run ending where `middle`'s line ends, at the members' drawn
   end, not `OR = 40` further right; `piece`'s line element from
   `60.33544921875` to `764.0390625 + 4w = 776.0390625`.
14. **No card overlaps another item's** (section 8.8, No room, as this
   package draws it: an ancestor card takes no room in its frame, but an
   item's default `y` lies the placement's spacing below the lowest edge of
   the items before it and of the ancestor cards behind their frames, and
   so low that its own ancestor cards' tops lie that spacing below too; the
   first item keeps its default `y`, the block growing upwards for its
   cards; shadows count nowhere, as in section 8.6). What proves it: the
   item that follows a card reaching below its frame moves down by exactly
   the reach, and nothing else moves; a frame whose card rises above it
   moves down by exactly the rise; and over every fixture no two items'
   extents meet.
   - **Below** (`bundle_mixed`, the defaults). `recording`'s card behind
     `group_2` is `excerpt`'s card's rows with one line more: above
     `recording`'s line it holds `excerpt`'s row as `excerpt`'s card holds
     `excerpt`'s line above `recording`'s ancestor row, so its top is
     `excerpt`'s card's, 288.3203125 ("The block" below); below
     the line its markers band holds the derived gaps' name labels, one
     line, reaching `w/2 + 13 + 2 + h(9) = 26.9765625` below the line
     ("Elisions" point 1) where the ancestor row reaches its half pitch 7:
     `67.4765625 + 19.9765625 = 87.453125` high, its bottom at
     375.7734375, 11.9765625 below `group_2`'s (`206.0390625 +
     157.7578125 = 363.796875`). So `annotations`' card lies at `375.7734375
     + 8 = 383.7734375`, not 371.796875, and `H = 383.7734375 + 71.85546875
     + 2 + 8 = 465.62890625`. Against the drawing with the card's gaps
     hidden (`FULL_CARDS`, where the card ends inside its frame's bottom
     and `annotations` lies at 371.796875): `annotations`' record lies
     11.9765625 lower, the same size and drawing as many elements, and
     every other record of an item or a member's card lies where it lies
     there (its range aside, since the card's gaps draw elements of their
     own), both moved by the difference of the two place origins.
   - **Above** (`bundle_arranged_conflict`, the defaults, not arranged;
     the title's `Pt = 28.8046875`). `score`'s two children `theme_a`
     (0–16) and `theme_b` (8–24) overlap, so its card behind each frame
     draws them in two children rows (section 6.4, Children), while each
     frame holds one member of 16 quarters with its one ancestor row of
     `score`: both cards draw the same rows and both frames are equally
     high, so each card rises above its frame by the same `ρ > 0`. The
     card behind `group_1` rises `ρ` above its frame and the block grows
     upwards by it (`origin.y = ρ`, the first frame keeping its default
     `y`, `ρ + 28.8046875`); the card ends inside its frame's bottom, so
     the card behind `group_2` lies 8 below `group_1`'s frame, and
     `group_2`'s frame exactly `ρ` lower than its card. `ρ` is each card's
     record top less its frame's (the cards' rows are the subject of
     "Elisions", not of this point).
   - **Every fixture** drawn with the defaults: taking each item with the
     ancestor cards behind it as one extent from its least top to its
     largest bottom (records, shadows not counted), each item after the
     first lies exactly the placement's spacing 8 below the largest bottom
     of the extents before it, at its least top, compared in the block's
     binary64 exactly as the layout sums it.

## Elisions (`elisions.test.ts`)

Sections 2, 2.4, 3.2 (the elided axis, the frame's elided axis), 5.3, 6.4
(Markers), 6.6 (Elisions), 7.2, 8.2, 8.3, 8.5, 8.8 and 8.9 are the oracle,
at the default placement and view (`1280 × 720`). The worked examples of
section 8.9 give the numbers; each is derived there in binary64 in the
order the specification writes it, and the tests compare them exactly. What
a container decides of its elisions is read from the drawing's
`elisions` (one record per ungrouped root's card, drawn ancestor card and
frame: its cascaded and resolved mode, its proportion and depths, its gaps
with their origin, elided coordinates and widths, and its runs); what it
draws, from the elements: a gap writes an `elision` element, its one
ellipsis an `ellipsis` element and its labels `label` elements, the gap's
rectangle being its extent whether it is filled or not. **One ellipsis per
gap** (section 6.6): a gap draws, where its display lists `ellipsis`,
exactly one, a stored elision's gap (its own or carried into an ancestor
card) whatever its width, so that every stored elision a card draws is
seen, a derived one's where it is at least 20 wide, at its middle `xm = (x(a) + x(b)) / 2`
and the middle `ym = (yt + yb) / 2` of the card drawing it (of a frame's
member cards together for a group elision); its labels, whether or not the
ellipsis is drawn, are centred on `xm` just below it, the `i`-th with its
baseline at `ym + 2 + 2 + (i − 1) × h(9) + a(9)` (`a(9) = 1901 × 9 / 2048 =
8.35400390625`, `h(9) = 2384 × 9 / 2048 = 10.4765625`), their room still
taken in the markers band of their timeline (section 6.4). The defaults
name every elision: `elision-display` starts as `ellipsis name`, a stored
elision without `display` draws `["ellipsis", "name"]`.

1. **Derived elisions with their middles left out** (`group_elided_inside`,
   `auto` read as `proportional`): `r = 0.14285714285714285`, set by (a);
   depths `1 2` (`piece`, then `first` and `second`); three gaps from the
   left, each a derived elision `{id: T, part: [elision]}`: `first` 0–8 and
   16–32, whole (their `h / k`, `0.2514285714285714` and
   `0.8228571428571427`, round outwards to their own ends), natural 400 and
   800, drawn `57.14285714285714` and `114.28571428571428`; `second` 1–31,
   its natural width `1500` (30 quarters at 50 canvas units each), drawn
   `128.57142857142856` = `W − 50 − 50`. `r` reads the frame laid out
   before its rows align (section 8.9, `Fw` and `Fh`), `543.70361328125 ×
   171.5625`, so it is the worked example's. The labels take their room
   in the markers band of `first` and `second`, below their row, between
   it and `piece`'s line: `first` lies `7 + (w/2 + 13 + 2 + h(9)) = 7 +
   26.9765625 = 33.9765625` above `piece` on the card behind, and `dr`
   counts that stack (section 8.3: every stack the card draws, derived
   ones included), so in `excerpt`'s card `piece`'s ancestor row lies
   `Δ1 = max(33.9765625, 7 + 7) = 33.9765625` beyond `first`'s, not 14:
   the card, its frame and every row below `first`'s are `33.9765625 − 14
   = 19.9765625` lower or higher than with 14 (the frame `171.5625 +
   19.9765625 = 191.5390625` high), and the ancestor card, `97.35546875`
   high, its line on `piece`'s ancestor line, reaches from `16.23046875 +
   19.9765625 = 36.20703125` to `113.5859375 + 19.9765625 = 133.5625`
   (16.23046875 and 113.5859375 its ends with 14). Each gap draws one
   ellipsis at the middle of the card, at `ym = 84.884765625`, and its
   name label (`elision-display` `ellipsis name`) below it, `First` twice
   and `Second`, the baseline at `ym + 4 + a(9) = 97.23876953125`; no
   continuation; it writes no rectangle (its `fill` is `none`). `piece`'s
   line in the card is cut at all three gaps, `first`'s at its two (it
   starts at the first's edge and ends at the second's), `second`'s at its
   one. `piece`'s line and its ancestor line lie at one height, and so do
   `first`'s line and its ancestor line.
2. **Middles on a fraction axis** (`bundle_elided_layerit`, the card of
   `clt_1` behind `group_3`): `r = 0.016991818753933293`; the gaps leave out
   Prelude 1–355, Menuet 1–311, Clair de Lune 28–323 and Passepied 4–620,
   drawn `59.986481131855626`, `48.91033261077412`, `45.13437288767693` and
   `38.561405962287324` wide.
3. **Group elisions** (`group_elided_members`). The frame draws two gaps:
   `elision_1` (natural 150, drawn the standard 32) and `elision_2`
   (`66.66666666666666`, drawn `33.33333333333333`); its last run's shrink
   is `DG = 151.33333333333331`, so `voice`'s line ends at `x0 + (400 −
   DG)`, `x0` the exposure's start. The elided coordinates are listed on
   every timeline a member card draws whose span holds the gap's stretch
   (section 8.9, Group elisions: the positions at the gap's proportions of
   each member's length, less the timeline's start on the member's axis,
   written in its number type as a groupstamp's coordinate there), card by
   card in display order, each card's member first, then its tree's other
   timelines in traversal order, then its ancestor lines from its parent
   up. `elision_1` (`1/8` to `1/2`): `excerpt` 2–8, `piece` 18–24 (`excerpt`
   starts at 16 on `piece`), `voice` 3–12, `sketch` none (unknown length);
   `phrase` (12–20 on `voice`) does not hold 3–12 and is not listed.
   `elision_2` (`7/12` to `3/4`, exact): `excerpt` 28/3–12, `piece`
   76/3–28, `voice` 14–18, `phrase` 2–6 (14–18 less its offset 12),
   `sketch` none. `elision_1`'s label stack, `Development`
   and `2–8 ♩`, is drawn once, its room in `excerpt`'s markers band;
   `elision_2`, which states no `display`, draws its name `Phrase`, its
   room in `phrase`'s band. Each gap across the frame draws one ellipsis,
   centred on the member cards together, from the top of `excerpt`'s card,
   32.8046875, to the bottom of `sketch`'s, `210.61328125 + 49.37890625`, at
   `ym = 146.3984375`, its labels below it at `ym + 4 + a(9)` and `ym + 4 +
   h(9) + a(9)`; carried into the ancestor card (46.68359375 to
   130.63671875) each draws one more, at that card's middle
   88.66015625, and no label. The groupstamp `timestamp_1` at 15 of `voice`
   lies in the second gap: no element carries its address; `timestamp_2` at
   21 is drawn, its frame line over `sketch` faded (opacity 0.35).
4. **The ancestor card behind a frame with group elisions** (`piece` in
   `group_elided_members`): `r = 0.31083333333333335` (`0.5 × (L' / L)`,
   set by (a)), depths `1` (`piece` is the member's parent); its gaps from
   the left: `piece` 1–15 (drawn `74.33333333333334`), the carried
   `elision_1` and `elision_2` (origin `carried`, the frame's natural and
   drawn widths taken: 150 and 32, `66.66666666666666` and
   `33.33333333333333`), `piece` 33–47; the carried gaps draw no label.
   A carried gap lies over `−ts + p × λ` to `−ts + q × λ` on `piece`'s
   fraction axis, `p` and `q` the exact quotients (section 8.9, Carried
   gaps), so it is exact: `ts = −16`, `λ = 16`, `elision_1` `16 + 1/8 × 16
   = 18` to `16 + 1/2 × 16 = 24`, `elision_2` `16 + 7/12 × 16 = 76/3` to
   `16 + 3/4 × 16 = 28` (not the doubles `0.5833333333333334 × 16`). So
   `piece`'s line in the card is drawn in seven runs, one axis each, every
   end exact: 0–1, 15–16, 16–18, 24–76/3, 28–32, 32–33 and 47–48, the
   seams at the protected span's ends, 16 and 32, cutting two of them
   ("Ancestor cards", The frame's room). The number type of
   `piece`'s axis decides, never the kind of `λ`: with `excerpt` turned
   `float` before loading (`number_type: float`, `length: 16.0`,
   `elision_1` from `2.0` to `8.0`, its groupstamps at `0.0` and `16.0`;
   its offset `[16, 1]` keeps `piece`'s number type), `λ = 16.0` is a
   float, read at its exact binary value 16, and `P = 2.0 / 16.0 = 1/8`
   exactly, so the seven runs are the same exact values, each end a
   `Rational`, none a JS number. Across the frame the gaps' elided
   coordinates on `excerpt` are then doubles, `2`–`8` and `28/3 →
   9.333333333333334`–`12` (each the double nearest the exact position),
   on `piece` still exact, `18`–`24` and `76/3`–`28`.
5. **Stored elisions** (`bundle_elisions_stored`). `score`'s ancestor card
   draws, under `auto` read as `custom`: `elision_4` clipped to 0–16
   (natural 800, drawn 400, `{ratio: 0.5}`), the carried `elision_3`
   (natural 80, drawn 32), `elision_5` (800, 200 by `{span: 4}`) and
   `elision_6` clipped to 48–56 (400, 30 by `{canvas: 30}`); `elision_1`
   (on `coda`, whose line a rule hides) is not drawn. `elision_4` draws its
   one ellipsis at the middle of its gap and of its card, its `id` label
   `elision_4` and a continuation on each row whose line or map it cuts; `elision_5` its `name` label `Development` alone; `elision_6`
   nothing but its gap. `session`'s card (`full`) draws the carried
   `elision_3` alone, `elision_7` kept. The frame's gap of `elision_3`:
   natural 80, drawn 32, on `theme` 0–8/5. `page`'s ungrouped card draws
   `elision_2` (natural `263.169897377423`, the standard 32) with its labels
   `Appendix` and `600–1 754 px`. `score`'s line in its card is drawn in three
   runs, one axis each, from 88/5 to 24, from 24 to 32 (the seam at the
   protected span's end, 24, cutting it) and from 56 to 64: the carried gap
   of `elision_3` ends at `16 + 1/5 × 8 = 88/5` exactly (`1/5` the exact
   quotient of 2.0 and 10.0, `−ts = 16`, `λ = 8` of `theme`), the run 16–16
   before it and 48–48 between `elision_5` and `elision_6` having no
   length. `session`'s card lies on a float axis: its carried gap lies over
   `30.0 + 0.0 × 25.5 = 30.0` to `30.0 + 0.2 × 25.5 = 35.1` in binary64
   (`1/5` converted to the double 0.2, section 3.1), and its line's three
   runs are the doubles 0–30, 35.1–55.5 and 55.5–90, the seam at the
   protected span's end, `30.0 + 25.5 = 55.5`, cutting the second. The gap's elided coordinates
   across the frame, card by card (`theme`, `take`, `recording`): `theme`
   0–8/5 and its ancestor `score` 16–88/5 (fraction); `take` 0–5.1 (`1/5
   × 25.5 = 51/10`, its nearest double) and its ancestor `session` 30–35.1
   (`51/10 + 30`, its nearest double); `recording` 0–2, the elision's own
   stretch. `elision_1` lies first in canonical order (on `coda`, 56–64 on
   `score`) and is not drawn, so it takes nothing from the elisions after
   it (point 11); `elision_6` is clipped by `elision_5` alone.
6. **Modes** (section 8.9, Modes), by a layer of one rule on `{id: piece,
   part: [card]}` over `group_elided_inside`: `elision-mode: full` draws no
   gap (resolved `full`); `custom` none, no card elision being stored;
   `proportional` with `elision-proportion: 0.05` takes `r = 0.05` (not
   automatic): the pieces' `W` 20, 40 and 80 round to their own ends, three
   whole gaps 20, 40 and 80 wide; `elision-depths: "1"` derives on `piece`
   alone at `r = 1/7`: 0–8 whole (`57.14285714285714`) and 19–61 (of the
   piece 16–64: `W = r × 2400`, `h / k = (W − 32) / 2 / 50`, 150 at full
   scale on either side, the gap `W − 150 − 150`); `elision-display:
   "ellipsis name coordinate"` labels every derived gap with its
   timeline's name and its elided coordinates (`First`, `0–8 ♩`; `First`,
   `16–32 ♩`; `Second`, `1–31 ♩`); `display: none` hides the card and
   records no exposure. A rule `{addresses: [{id: group_1}]}`
   `elision-mode: full` over `group_elided_members` leaves the frame
   without gaps and the card behind without carried gaps, at `r = 0.5`.
7. **Widths written back** (`widthAs`, section 8.9, Widths): of
   `elision_5`'s gap (drawn 200 of 800, `L = 3200`, `λ = 64`, fraction):
   `{ratio: 0.25}`, `{span: 4}` exact, `{canvas: 200}`, the standard gap
   `null`; of `elision_2`'s gap on `page` (int, `L = 400`, `λ = 1754`, drawn
   32): `{span: 140}`, `32 × 1754 / 400 = 140.32` to the nearest integer.
8. **No marks of a member's start and end** (section 8.3): no element of
   `group_child_member` is addressed `{id: M, part: [start]}` or `[end]`.
9. **Rows at the heights of the card behind** (section 8.3): in
   `group_elided_inside`, the member card's ancestor lines of `first` and
   `piece` lie at the ordinates of `first`'s and `piece`'s lines in the
   ancestor card behind, the derived gaps' name labels between them
   counted (point 1).
10. **The row distance counts a stored card elision's labels** (section
   8.3, `dr`). `group_grandchild` with one more elision added by core's
   `add` into `movement`: `intro` from 1 to 6, named `Intro`, `display
   [ellipsis, name]`. `movement` lies in no group, so it is a card elision
   of `score`; the ancestor card of `score` behind `group_1` (aligned to
   `theme`: `ts = −24`, `λ = 8`, `LA = 400 × 64 / 8 = 3200`, 50 per
   quarter) reads `auto` as `custom` and draws it over `score` 17–22,
   outside the protected span 24–32: natural `5 × 50 = 250`, the standard
   gap 32, `r = 1`. Its label stack, one line, stands in `movement`'s
   markers band below `movement`'s line, between `movement`'s row and
   `score`'s line in `score`'s drawing. With nothing on it the row of
   `movement` reaches its outer half `7` below its line; with the stack it
   reaches `w / 2 + 13 + 2 + h(9) = 1.5 + 13 + 2 + 10.4765625 =
   26.9765625`, so in `score`'s drawing alone, laid out on that stored
   gap, `movement`'s line lies `26.9765625 + 7 = 33.9765625` above
   `score`'s, not 14: `dr = 33.9765625`. In `theme`'s card (its top
   32.8046875, its line 47.20703125, the ancestor band from `c0 =
   30.9765625`, "Ancestor lines") `movement`'s row lies at `47.20703125 +
   30.9765625 + 7 = 85.18359375`, `score`'s `Δ1 = max(33.9765625, 7 + 7) =
   33.9765625` beyond, at 119.16015625; the band is `7 + 33.9765625 + 7 =
   47.9765625` wide, so the card is `14.40234375 + 30.9765625 + 47.9765625
   + 8 = 101.35546875` high. The ancestor card lies with `score`'s line on
   that row, 119.16015625, and draws `movement`'s row 33.9765625 above it,
   at 85.18359375: each of the two rows at its height in the member card.
   (Laid out without the stored gap, `dr` would be 14, `score`'s row in
   `theme`'s card would lie at 99.18359375 and the card's row of `movement`
   at `99.18359375 − 33.9765625`, off the member card's.)
11. **An elision that is not drawn takes nothing** (section 8.9, Pieces).
   Card elisions: `group_grandchild` with two elisions added into `score`,
   `hidden` 0–12 and `later` 4–14 (canonical order: `hidden` first, by
   start), `hidden` hidden by a layer `{addresses: [{id: hidden}]}`
   `display: none`: the ancestor card of `score` draws `later` whole,
   4–14 on `score`, natural `10 × 50 = 500`, the standard gap 32; were
   `hidden` to take 0–12, `later` would be clipped to 12–14 (natural
   100). Group elisions: `group_elided_members` with `opening` added into
   `voice`, 0–12 (proportions 0 to `1/2`), `elision_1` (on `excerpt`,
   `1/8` to `1/2`, first in canonical order) hidden likewise: the frame
   draws `opening` whole, `voice` 0–12, natural `400 × 0.5 = 200`,
   drawn 32, then `elision_2`; were `elision_1` to take `1/8` to `1/2`,
   `opening` would be clipped to 0–3 (natural 50).
12. **A cut piece keeps its exact ends** (section 8.9, Group elisions and
   Carried gaps). `group_elided_members` with `elision_2` hidden (so it
   takes nothing) and two overlapping group elisions added into `voice`
   (`λ = 24`): `cut` 10–14 and `after` 12–20, in canonical order (by start)
   after `elision_1` (`excerpt`, `1/8` to `1/2`). Pieces are clipped on
   exact proportions: `cut` (`5/12` to `7/12`) loses `5/12`–`1/2` to
   `elision_1` and draws `1/2` to `7/12`; `after` (`1/2` to `5/6`)
   loses `1/2`–`7/12` to the two before it and draws `7/12` to `5/6`, its
   start cut at `7/12`, the double `0.5833333333333334` of which is not
   7/12. The frame's gaps: `elision_1` as in point 3, `cut` on
   `voice` 12–14 (natural `400 × 0.5833333333333334 − 400 × 0.5 =
   33.33333333333334`, the standard 32), `after` on `voice` 14–20
   (natural `400 × 0.8333333333333334 − 400 × 0.5833333333333334 =
   100.00000000000003`, 32): a cut piece's elided coordinates on an exact
   axis are its exact proportions times `λ`, so `after` starts at 14
   exactly where `cut` ends. Their elided coordinates across the
   frame are exact on every fraction timeline: `cut` `excerpt`
   8–28/3, `piece` 24–76/3, `voice` 12–14, `phrase` 0–2, `sketch` none;
   `after` `excerpt` 28/3–40/3, `piece` 76/3–88/3, `voice` 14–20,
   `phrase` 2–8 (its span 12–20 on `voice` holds 14–20, ends included),
   `sketch` none.
13. **A member reads its frame's gaps at their exact proportions** (section
   8.9, Carried gaps: the number type of the axis decides). In
   `group_elided_members` the card of `voice` (`λ = 24`, fraction) draws
   `elision_2` (`phrase` 2–6, `7/12` to `3/4` of `voice`) on its own axis
   over `7/12 × 24 = 14` to `3/4 × 24 = 18` exactly, not over the doubles
   `0.5833333333333334 × 24` and `0.75 × 24` taken at their exact binary
   values: `voice`'s line has three runs, the second ending at `voice` 14
   and the third starting at 18, written `14` and `18`; `phrase`'s first
   run ends at its own 2 and its second starts at 6. Read at the double's
   exact binary value, the second run would end at
   15762598695796737/1125899906842624 instead of 14.
14. **One ellipsis per gap, on no row** (section 6.6). Over every manifest
   fixture drawn with the defaults, each drawing of a gap in a member,
   block-held card or across a frame writes exactly one ellipsis, at
   `(xm, ym)`, where its display lists `ellipsis` and the gap is a stored
   elision's (origin `stored` or `carried`) or at least 20 wide, and none
   otherwise: a stored gap's display is its elision's
   `display`, a derived one's its card's `elision-display`, which no
   fixture states, so the initial `ellipsis name` (the test checks that no
   fixture's text names `elision-display`). Its labels lie at `xm` with the
   baselines above, its first on line 1: no stack of these drawings meets
   a neighbour's (point 18 moves one to a later line). An ancestor card's
   elements are drawn in its own coordinates and moved, so its middles are
   the moved ones: its gaps are covered by points 1, 3, 16 and 18. In `bundle_shared_parent` each of
   `score`'s two ancestor cards derives one gap cutting `score`'s map
   `cmap_1` and its line (125.234375 and 130.734375, 351.421875 and
   356.921875): its one ellipsis lies at the middle of its card, not on a
   row, its name `Score` below it.
15. **The frame's room** ("Ancestor cards", The frame's room). In
   `group_elided_inside` (`r` and the gaps of point 1), the ancestor card
   of `piece` has a seam at each end of `excerpt`'s span, 8 and 16 on
   `piece`'s axis, where `first`'s gaps 0–8 and 16–32 end and start: the
   gap ending at 8 ends at the frame's left edge, `x0 − OL` with `OL = x0 =
   103.70361328125`, and the gap starting at 16 starts at its right edge,
   `x0 + L' + OR` with `OR = Fw − (x0 + L') = 543.70361328125 −
   503.70361328125 = 40`, both in block coordinates the frame's record's
   `x` and `x + width`, while `piece`'s run from 8 to 16 lies over
   `excerpt`'s line, from `x0` to `x0 + L'`: what lies outside the span
   lies outside the frame. No gap, ellipsis or label is drawn for a seam:
   the card draws the three gaps of point 1 alone.
16. **An ancestor card of length 0** (`warnings/several_depths`, its
   manifest: `perf`, of unknown length and no reach, the one member of
   `together`, a child of `score` (32 quarters) at 4). `perf` draws at
   length 0, so `score`'s card behind the frame does too, `LA = 0`, and
   `r = (λ / E) × (L' / L) = 0` (`L' = 0`). Its derived pieces 0–4 and
   4–32 have the natural width `n = LA × Δu = 0`, so `W = r × n = 0`, `h =
   0` and nothing of either is kept: each is elided whole, `start` and
   `end` its own ends, natural and drawn width 0, `x(b) − x(a) = 0`; the
   offset `h / k` is 0 where `h` is 0, never `0 / 0` (`k = n / (b − a) =
   0`), so the drawing does not fail.
17. **The row distance counts a derived elision's labels at a stated
   proportion** (section 8.3, `dr`; the shape of a suite drawn behind an
   excerpt at a telling proportion). `bundle_elided_layerit` under a layer
   of one rule on `{id: clt_1, part: [card]}`, `elision-mode:
   proportional` and `elision-proportion: 0.125`: every one of the four
   ancestor cards of `clt_1` takes `r = 0.125` (not automatic) and derives
   on depths 1 and 2, each movement's pieces outside the protected span a
   derived gap named by its movement (`Prelude`, `Menuet`, `Clair de
   Lune`, `Passepied`), one label in one tier of that movement's markers
   band, below its line: one piece of each movement per card, and two of
   `Menuet` behind `group_2`, whose excerpt lies at 120–132 inside it, so
   4, 5, 4 and 4 name labels. `clt_2`
   (Prelude) lies in the row of `clt_1`'s children band nearest `clt_1`'s
   line, so, as in point 10, `clt_2`'s line lies `26.9765625 + 7 =
   33.9765625` above `clt_1`'s on the card behind it, `dr = 33.9765625`.
   In the card of
   `clt_6` (Prelude mm. 1–4, its ancestors `clt_1` and `clt_2`), laid out
   as `theme`'s in point 10 (one row of the member, the ancestor band from
   `c0 = 30.9765625` below its line), `clt_2`'s row lies `30.9765625 + 7`
   below `clt_6`'s line and `clt_1`'s `33.9765625` beyond it, the band `7
   + 33.9765625 + 7 = 47.9765625` wide and the card `14.40234375 +
   30.9765625 + 47.9765625 + 8 = 101.35546875` high, not `81.37890625`
   (`Δ1 = 14`). In each of the four member cards every ancestor line lies
   at the ordinate of its timeline's line in the card behind.

18. **Neighbouring gaps' label stacks keep apart** (section 6.6; section
   6.3 the first fit). The stacks drawn below the ellipses of one card, or
   across one frame, are placed by one first fit at their drawn places,
   from the left, each as wide as its widest label centred on `xm`: a
   stack that would cover an earlier one starts on a later line below the
   ellipses, no gap widens and no abscissa moves; its markers band takes
   the room of the lines down to its last. Three proofs:
   - **Built, exact** (the case of "Region braces cut at gaps" below, six
     stored elisions on `score`, each named `score`, 24.380859375 wide):
     `elision_2` (its extent 62.3095703125 to 88.6904296875 from `x0`
     across both neighbours) starts on line 2, the other five on line 1;
     each label at `xm`, its baseline `ym + 4 + (n − 1) × h(9) + a(9)`;
     every gap as wide as its stated `canvas` (8, 10, 5, 6, 8, 4).
   - **LayerIt** (`bundle_elided_layerit`, the defaults; ancestor cards,
     moved, so the line a label lies on is read as the whole number of
     lines `h(9)` its baseline lies below line 1 under its ellipsis, the
     move adding at most a rounding of the last place). The card behind
     `group_4` draws `Prelude`, `Menuet`, `Clair de Lune`, `Passepied` at
     205.8683…, 254.613…, 301.0227… and 369.0317…: `Menuet`'s extent
     ends at `254.613… + 33.7763671875 / 2 + 1 = 272.501…`, after `Clair
     de Lune`'s starts (`301.0227… − 59.431640625 / 2 − 1 = 270.306…`),
     so the lines are 1, 1, 2, 1; the other three cards draw their stacks
     on line 1. Drawn for the view 1024 × 640 (the review case
     `__view-1024x640`) the card behind `group_4` takes lines 1, 2, 3, 1
     (`Menuet` meets `Prelude`, `Clair de Lune` both) and the card behind
     `group_2` 1, 1, 1, 2, 1 (its second `Menuet` meets `Clair de Lune`).
   - **No label covers another**: over every manifest fixture drawn with
     the defaults and LayerIt for the view 1024 × 640, no two labels of
     gaps on one baseline have conflicting extents `[x − w / 2 − 1, x + w
     / 2 + 1]` (section 6.3), `w` measured at the label's font size.

## Arrangements (`arrangement.test.ts`)

Sections 1, 8.5, 8.6 (Arrangements) and 8.8 (Drawn once) are the oracle; the
row, the roots and the anchors are core's (`rowOf`, proven in core's tests),
so these tests prove what the layout places from them. The numbers are the
worked example of section 8.8 and its figure's derivation in TimeToShare's
drawings README, every one compared exactly, in binary64 as the
specification orders the operations.

1. **Packing** (`packed`, section 8.6 and the arranger's levels). Five
   contents of sizes 10 × 5, 20 × 15, 5 × 8, 7 × 3 and 12 × 9, gap 2, from
   `(1, 1)`: `vertical` at `x` 1 and `y` 1, 8, 25, 35, 40 (each the previous
   `y` plus its height plus 2); `horizontal` at `y` 1 and `x` 1, 13, 35, 42,
   51; `matrix` in 2 columns, the columns 12 and 20 wide (the widest of
   10, 5, 12 and of 20, 7), the rows 15, 8 and 9 high, so the columns start
   at 1 and 15 and the rows at 1, 18 and 28: `(1, 1)`, `(15, 1)`, `(1,
   18)`, `(15, 18)`, `(1, 28)`. A matrix of 0 or 1.5 columns is a
   `RangeError`. Nothing contents: no offsets.
2. **Vertical in the item order**: `bundle_arranged_roots` with `{direction:
   vertical, order: [page, group_3, group_1, group_2]}` and a place stating
   `group_1` at `x` 500, `y` 300: the items are recorded and written in that
   order, `page` at the first item's default top `28.8046875` and every
   item at `x = P = 8` in place coordinates (the block grows to the left for
   the ancestor cards), the stated `x` and `y` kept in the place record's
   `stated` and not used; the drawing states `{direction: vertical, row:
   [page, group_3, group_1, group_2], roots: []}`, and the ancestor cards
   are recorded in the item order, `group_3`'s first.
3. **Horizontal, the worked example** (`bundle_arranged_roots` with
   `{direction: horizontal, order: [page, group_3, group_1, group_2]}`): the
   drawing states the row `[page, group_1, group_2, group_3]` and the roots
   `[score, session]`; the items lie at `x` 8, 623.39013671875,
   1238.7802734375 and 1854.17041015625, `page` and the frames at `y`
   28.8046875 (the tops are −77.18359375 for the three frames, −59.453125
   and 83.78125 for the once cards, so `T0` = −77.18359375 and everything
   moves by 105.98828125); Exposition (`group_1`) and Recapitulation are
   232.94140625 high, Development 157.5625, the card of `take_a` padded to
   `y` 186.3671875 (28.8046875 + 157.5625), as `take_b`'s; the block is
   2429.560546875 × 283.72265625, its origin `(0, 0)` (its bottom the once
   card of `session`'s, 273.72265625, plus the shadow 2 and `P`). Two
   ancestor cards are recorded, the once cards, each the card behind
   `group_1`: `score`'s at `(451.322265625, 46.53515625)`,
   1947.517333984375 × 73.85546875, its line at 59.453125 of it (the three
   movements lie in one row of one band order, section 6.4, Children,
   their stacks in two tiers), its `ancestor` `{group: group_1, member:
   exposition, groups: [group_1, group_2, group_3]}`, then `session`'s at
   `(525.13720703125, 189.76953125)`, 1873.42333984375 × 83.953125,
   `groups: [group_1, group_3]`: its gap's name label `Session` (section
   6.6, the default `elision-display` `ellipsis name`) takes its room in
   `session`'s markers band, below the line by the default band order and
   empty without it, which is so present and `w/2 + 13 + 2 + h(9) = 1.5 +
   13 + 2 + 10.4765625 = 26.9765625` wide, more than the name's half
   height `h(11)/2 = 6.40234375` it replaces below the line: `63.37890625
   − 6.40234375 + 26.9765625`, the line still `48.9765625` below the
   card's top; no other ancestor card is recorded or written. Both lie
   `s1 × (OL + s0')` left of their first stretch's start 750.7802734375,
   `OL = x0 = 127.39013671875` being the room `group_1`'s frame leaves
   left of its member drawings (section 8.8, step 2, taken by a once card
   left of its first stretch, `sN × OR` right of its last), so that their
   names stand left of the frame: `score`'s with `s0'` = 172.06787109375
   (its movements' row name cut to `Exposition, Development, …`),
   `session`'s with `s0'` = 98.2529296875. Neither root reaches right of
   its last stretch (`score`'s ends at 48 with `recapitulation`,
   `session`'s at 130 with `take_b`), so `OR` moves nothing.
4. **Runs, seams and the gap.** `score`'s line lies at 105.98828125 in three
   runs, 0–16 from 750.7802734375 to 1150.7802734375, 16–32 from
   1366.17041015625 to 1766.17041015625 and 32–48 from 1981.560546875 to
   2381.560546875; `exposition` ends on the left run (at 1150.7802734375),
   `development` starts on the right one (at 1366.17041015625). The axis
   jumps at the seams at 16 and at 32 (from 1150.7802734375 to
   1366.17041015625, from 1766.17041015625 to 1981.560546875) and leaves
   nothing out, so a seam is no gap: the card's exposure lists none of
   `score`'s, no elision element is written at `score`, and `score`'s line
   is one piece from 750.7802734375 to 2381.560546875 without cuts, drawn
   whole across both seams under the frames.
   `session`'s line, at 238.74609375, has two runs, 0.0–33.0 to
   1190.7802734375 and 44.0–130.0 from 1234.8938802083335, its gap of
   origin `arrangement` eliding 33.0 to 44.0 (floats, the session's axis
   being float) with its one ellipsis at `(1212.8370768229167,
   231.74609375)`, the middle of the card's height `(189.76953125 +
   273.72265625) / 2`, and its label `Session` centred on the same `x`
   with its baseline at `231.74609375 + 2 + 2 + a(9) = 244.10009765625`,
   `a(9) = 1901 × 9 / 2048 = 8.35400390625`.
5. **The fallback**: `bundle_arranged_conflict` asked `horizontal` is
   refused: the drawing states `{direction: horizontal, row: [group_1,
   group_2], roots: [], refused: {groups: [group_1, group_2], roots:
   [score], reason: "\"Theme A\" and \"Theme B\" overlap on \"Score\"
   (8–16 ♩)"}}` and draws every element and record as the bundle drawn
   without an arrangement (the item order being the drawing order).
6. **Side by side with nothing to hang on** (section 8.8, Vertically, step
   3: every item that hangs on nothing has its top at the row's top `T0`,
   and everything moves so that the highest item lies where the first item
   would): `bundle_ungrouped`, three ungrouped roots and no group, asked
   `horizontal` with the stored order `[score, pages]`, has no group top and
   no once card, so no `T0` is found among them and every item lies at the
   first item's default top, `28.8046875` (where `pages` lies drawn without
   an arrangement). The drawing states the row `[score, pages, recording]`
   (the stored order, then the item left out) and no roots; the three
   cards, each `509.3271484375` wide as without an arrangement, lie at `x`
   8, `8 + 509.3271484375 + 48 = 565.3271484375` and `1122.654296875`, the
   row gap `max(S, 48) = 48`; no ancestor card is recorded; the block is
   `1122.654296875 + 509.3271484375 + 2 + P = 1641.9814453125` wide and,
   `score` the highest card (81.921875), `28.8046875 + 81.921875 + 2 + P =
   120.7265625` high, every number finite (the defect this case guards:
   the smallest of no tops is infinite and put every ordinate at `NaN`).

## Labels in tiers and leader lines (`labels.test.ts`)

Sections 6.4 (Regions, Segment lines), 6.6 (Regions, Leaders), 2.3 (the
selector member `class` on regions), 4 and 7.2 are the oracle. A region
keeps the row its own extent gives it whatever its label's width; the
labels of a row then take that row's label tiers by first fit, row `k`
with `Tk` tiers having the pitch `prk = 6 + 2 + Tk × h(9) + S`, and a
label in tier `j ≥ 2` gets a `leader` at `{id: R, part: ["leader"]}` from
the brace's tip `ak + 6` to `ak + 6 + 2 + (j − 1) × h(9)`, where its tier's
line starts. A segment label in segment-label tier `n ≥ 2` gets one from
`m` above its segment line to `m + 2 + (n − 1) × h(9)`. Until the default
layer of this package holds the rules of section 4 that hide the atomic
sections, show every band and stroke leaders (`#9CA3AF`, 0.5, solid), the
tests add those three rules as an application layer `SECTION_4`, which
changes nothing once the default layer holds them.

1. **Two adjacent regions, the short one's label too wide.** `build("score",
   16)` (`x(t) = x0 + 25 t`, `x0 = 53.798828125`, the line at 22.40234375,
   as in "Region braces cut at gaps" without its elisions) with `region_1`
   `development` from 0 to 2 and `region_2` `recapitulation` from 2 to 3.
   The labels are `A = 1300 + 1260 + 1212 + 1260 + 569 + 1253 + 1300 +
   1995 + 1260 + 1298 + 803 = 13510` and `14200` (`r e c a p i t u l a t
   i o n`: 842, 1260, 1126, 1255, 1300, 569, 803, 1298, 569, 1255, 803,
   569, 1253, 1298) units, `w1 = 59.3701171875` and `w2 = 62.40234375` at
   9, centred on `L × u` = 25 and 62.5. **Before**, a region's extent was
   widened to its label's: `region_1` `[−5.68505859375, 55.68505859375]`,
   `region_2` `[30.298828125, 94.701171875]`, which conflict, so `region_2`
   lay in row 2, `pr = 22.4765625` further out. **Now** the braces' own
   extents `[0, 50]` and `[50, 75]` meet only where one ends (section 6.3):
   both lie in row 1, arms at `Yb = 22.40234375 + 30.9765625 = 53.37890625`
   (the regions band starts `S` beyond the markers band, `1.5 + 13 + 2 +
   h(9) = 26.9765625` wide), tips at `Ya = 59.37890625`, `xm` = `x0 + 25 =
   78.798828125` and `x0 + 62.5 = 116.298828125`. The label extents above
   conflict, so `development` lies in tier 1, its line at `53.37890625 + 6
   + 2 = 61.37890625`, baseline `+ a(9) = 8.35400390625`, 69.73291015625,
   and `recapitulation` in tier 2, `h(9)` further: line 71.85546875,
   baseline 80.20947265625. Its leader runs at `x = 116.298828125` from
   `y1 = 59.37890625` to `y2 = 71.85546875`, at `{id: "region_2", part:
   ["leader"]}`, stroked as section 4 states; `region_1` has none. The
   leader is drawn after the marker labels and before the region labels
   (section 7.2). Hiding `region_2`'s label (`{addresses: [{id:
   "region_2", part: ["label"]}]}` `display: none`) hides its leader and
   leaves both braces in row 1; hiding the leader (`{element: leader}`)
   leaves the label in tier 2.
2. **A segment label in tier 2.** `segment_line` with `b`'s segments
   renamed `b1` `development section` (21537 units, 94.64501953125 wide)
   and `b2` `recapitulation`: centred on `L × u` = 137.5 and 212.5 (8 to 14
   and 14 to 20 of 32 at 12.5 a quarter), their extents `[89.177490234375,
   185.822509765625]` and `[180.298828125, 244.701171875]` conflict, so
   `b2`'s label lies in tier 2 and has the one leader of the drawing, at
   `{id: "b2", part: ["leader"]}`, at the label's `x`: from the distance `m
   = k = 8` above `b`'s line (it draws `b2`'s boundary), where that
   boundary's upper end lies, to `m + 2 + h(9) = 20.4765625` above it, the
   bottom of the label's line, so `y1 − y2 = 12.4765625` and `y2` is the
   label's baseline plus `d(9) = 483 × 9 / 2048`. `b1`'s label in tier 1
   lies `h(9)` lower than `b2`'s.
3. **Op. 106's regions and movements.** The manifest of Beethoven's Piano
   Sonata No. 29, Op. 106, as far as these rules read it, built through
   commands: the root `op106` of 15833/4 quarters holding the movements
   `clt_2` Allegro (0, 1644), `clt_3` Scherzo. Assai vivace (1644, 516),
   `clt_4` Adagio sostenuto (2160, 561) and `clt_5` Introduzione. Largo –
   Allegro risoluto (2721, 4949/4), and the atomic sections of each,
   lettered as their regions are named, every one stating `type:
   [AtomicSection]` (the absolute IRI, since a command refuses a prefix the
   context does not declare): `clt_2` A (0 to 953/2), B (953/2 to 500), C
   (500 to 1644), and one A over the whole of each other movement. With the
   default layers (and `SECTION_4`) no region is drawn: every region is an
   atomic section, so no regions band is present, and no leader. With the
   manifest's own layer stating `{element: region, class:
   "tts:AtomicSection"}` `display: inline` (the toggle "Atomic sections"
   on), all six braces lie in row 1 of their movements' regions bands, at
   one `yb`, each movement's band `S` beyond its line (`1.5 + 4 = 5.5`),
   and their six labels in tier 1, at `yb + 6 + 2 + a(9)`, with no leader:
   the labels are one letter, 1401 (A), 1405 (B) or 1430 (C) units, and
   no two centres of one row lie within a label's width of each other.
   **Before**, B's label (6.17431640625 wide) widened its 23.5-quarter
   brace past A's end and C's start, so B lay in row 2, `pr` further out.
   The four movements lie in one row both ways, a child's extent holding
   its regions and labels: the name of that row is `Allegro, Scherzo.
   Assai viv…`, the names joined and cut at 160 (`Allegro, Scherzo. Assai
   viv` and the ellipsis are 29003 units, 155.77783203125 at 11; one more
   letter, 30258, 162.5185546875), drawn at the address of `clt_2`'s name;
   so `x0 = 16 + 155.77783203125 + 8 = 179.77783203125`, where the root's
   line starts.


**A row of one band order** (section 6.4, Children and Rows of one band
order). Children bands laid out together are aligned when every child they
place has one band order; such a band places each child by its line's
extent and its own children's alone, and the lines of each of its rows lay
out their bands together: their region labels by one first fit, so a
label reaching over another line's span takes a later tier there, with a
leader, instead of moving that line to another row. `piece` built by
commands, 16 long (`x(t) = x0 + 25 t`), its children `a` at 0 and `b` at
8, each 8 long (the bare template, no band order of their own, no named
timestamp), `a` holding the region `ra` from 6 to 8 named `Development
section` (95.8623046875 wide at 9) and `b` the region `rb` from 0 to 2 of
its axis (8 to 10 on `piece`'s) named `Coda` (23.0185546875): `a` and `b`
lie in one row (their lines `[0, 200]` and `[200, 400]` meet); the regions
`[150, 200]` and `[200, 250]` share regions row 1, and the label extents
`[175 − 47.93115234375 − 1, …]` reaching `223.93115234375` and `[225 −
11.50927734375 − 1, …]` from `212.49072265625` conflict, so `ra`'s label
lies in tier 1 and `rb`'s in tier 2. Each child's regions band lies at
level −1 from `max(0, 1.5) + 4 = 5.5` (no markers band, no map), row 1's
arms at 5.5 and its tip at 11.5: `ra`'s label centred at `x0 + 175`, its
baseline `5.5 + 6 + 2 + a(9) = 21.85400390625` below `a`'s line; `rb`'s at
`x0 + 225`, `(5.5 + 6 + 2 + 10.4765625) + a(9) = 32.33056640625` below
`b`'s line, with one leader at `x0 + 225` from `11.5` to `23.9765625`
below it. Both regions bands are `6 + 2 + 2 × 10.4765625 + 4 − 4 =
28.953125` high in their records, `a`'s with its one tier of labels as
tall as `b`'s. With `a` given its own band order `[regions, line]` the
band is not aligned: `a`'s extent holds its label, which reaches over
`b`'s line, so `b` takes the next row, its label lies in its own tier 1
(`21.85400390625` below its line) and no leader is drawn.
## Region braces cut at gaps (`region-cuts.test.ts`)

Sections 3.2 (the elided axis), 6.6 (Regions, Elisions) and 7.2 (the
brace) are the oracle. No fixture draws a region across a gap, so the case
is built through core's commands: `build("score", 16)` (quarters,
fraction, `x(t) = x0 + 25 t` at full scale), with the region `region_1`
`theme` from 2 to 14 (midpoint 8) and six stored card elisions on `score`,
given the IDs `gap_1` to `gap_6`, each with a `canvas` width (drawn `g`, natural `n = 25 × (b − a)`, shrink
`n − g`):

| elision | stretch | `n` | `g` | edges `x(a)`, `x(b)` less `x0` |
|---|---|---|---|---|
| `gap_1` | 2–5/2 | 12.5 | 8 | 50, 58 |
| `gap_2` | 3–5 | 50 | 10 | 70.5, 80.5 |
| `gap_3` | 5–6 | 25 | 5 | 80.5, 85.5 |
| `gap_4` | 15/2–8 | 12.5 | 6 | 123, 129 |
| `gap_5` | 10–12 | 50 | 8 | 179, 187 |
| `gap_6` | 14–15 | 25 | 4 | 237, 241 |

The edges are `25 a − D` and `25 b − D'`, `D` the shrinks of the gaps
before, `D'` with the gap's own (4.5, 44.5, 64.5, 71, 113, 134). The row
name is the ID `score` (`A = 1067 + 1126 + 1253 + 842 + 1260 = 5548`, `N =
5548 × 11 / 2048 = 29.798828125`), so `x0 = 16 + N + 8 = 53.798828125`;
the line lies at 22.40234375, as in `bare` and `with_region`. Each gap
draws its name label `score` (the default display `ellipsis name`), `w =
5548 × 9 / 2048 = 24.380859375` wide, below its ellipsis at its middle
`xm − x0` = 54, 75.5, 83, 126, 183 and 239. Their one first fit (section
6.6; extents `xm − x0 ± (w / 2 + 1)`, `± 13.1904296875`) keeps
`gap_1`, `gap_3` (its extent starts at 69.8095703125, after
`gap_1`'s end 67.1904296875) and the last three on line 1 and moves
`gap_2` (62.3095703125 to 88.6904296875, across both neighbours) to
line 2. Its stack takes that room in `score`'s markers band, which so
holds two lines (the timestamps' labels `0 ♩` and `16 ♩` on line 1), one
`h(9) = 10.4765625` more than in `with_region`: the regions band starts
at `30.9765625 + 10.4765625 = 41.453125`, so the arms lie at `Yb =
63.85546875`, the tip at `Ya = 69.85546875`, `Ym = 66.85546875`, `k = 3`.
Every number here is a multiple of 2^−9, so each sum is exact.

The region's start, end and midpoint lie in no gap (2, 8 and 14 are
edges), so it is drawn at its elided x: `X1 = x0 + 50`, `Xm = x0 + 129`,
`X2 = x0 + 350 − 113 = x0 + 237`. Its brace spans the gaps of `gap_1`
to `gap_5` (each whole between 2 and 14) and not `gap_6`, which
starts at the region's end: the element's `cuts` are those five gaps'
edges, from the left. The straight parts run from `X1 + k = x0 + 53` to `Xm
− k = x0 + 126` and from `x0 + 132` to `X2 − k = x0 + 234`. Clipped to
them: `gap_1` leaves out `x0 + 53` to `x0 + 58` (its left edge lies on
the arm's curve), `gap_2` and `gap_3` touch and are one cut, `x0 +
70.5` to `x0 + 85.5`, `gap_4` leaves out `x0 + 123` to `x0 + 126` (its
right edge is the tip's abscissa), and `gap_5` `x0 + 179` to `x0 + 187`
of the right part. So the path is `M X1 Yb Q X1 Ym X1+k Ym`, then `M x0+58
Ym` (the `L` to `x0 + 53`, where the pen stands, left out), `L x0+70.5 Ym M
x0+85.5 Ym L x0+123 Ym M x0+126 Ym` (the `L` to `Xm − k` left out), `Q Xm
Ym Xm Ya Q Xm Ym Xm+k Ym`, `L x0+179 Ym M x0+187 Ym L X2−k Ym`, `Q X2 Ym X2
Yb`: no tick at a cut, arms and tip whole. A brace spanning no gap (the
same region without elisions) keeps its one `L` per part, as before, at
`Ym − h(9) = 56.37890625`: without the elisions no stack takes a second
line.

## Virtual cards (`virtual.test.ts`)

Section 8.10 (Resolution, Runs, The virtual card), with sections 2.2 (the
chunk addresses), 6.4 (Level 0, Regions), 6.6 (Boundaries, Gap lines,
Regions) and 8.1 (placed virtual timelines), is the oracle. The fixtures
are `flow/virtual_cards` and `groups/virtual_member`: the root `allegro`
(quarters, fraction, 1644) with the regions `section_a` "A" [0, 953/2),
`section_b` "B" [953/2, 500) and `section_c` "C" [500, 1644), its
FlowMaps `default` (A B A C), `single` (A C), `printed` (A B C) and
`by_hand` "Practice" (A A A A, a gap of 4, C), and the virtual timelines
`allegro_default` "Allegro, default" (4241/2), `allegro_single` "Allegro,
single" (3241/2) and `allegro_by_hand` "Allegro, practice" (3054). Every
x below is `x0 + (L × u − D)`, `x0` the start of the card's line as drawn
(its `xs`), `L` 400, `u` the exact quotient of the position and the
virtual length rounded once to a double, `D` 0 before every run gap; a
position at or after the end `b` of a run gap `[a, b]` lies at `x0 + (L ×
u(a) + (L × u − L × u(b)))` instead (section 8.10, Runs); every ordinate of a boundary is the line's `y`
less and plus `k` = 8.

1. **Places decide.** `flow/virtual_cards` at the default placement
   (`places` empty) draws one card, `allegro`'s: no element of any
   virtual timeline. With `places` stating `{}` for the three virtual
   timelines, the block holds four cards, `allegro`'s first (the
   ungrouped root), then the placed virtual timelines by ID:
   `allegro_by_hand`, `allegro_default`, `allegro_single`; each card is
   `{id: V, part: ["card"]}`.
2. **The line.** Each virtual card's line is a `timeline` element at
   `{id: V}`, starting in a circle and ending in the end circle of a
   locked root at `x(λ)`: `x0 + 400` for `allegro_default` and
   `allegro_single`, the run-gap rule's `x(3054)` for `allegro_by_hand`
   (item 5). A
   virtual timeline's line is green as `allegro`'s, its unit's.
3. **The chunks of `default`.** Pieces `[0, 953/2]` at 0, `[953/2, 500]`
   at 953/2, `[0, 953/2]` at 500, `[500, 1644]` at 1953/2; λ = 4241/2.
   Four `region` elements at `{id: "allegro_default", facet: "regions",
   part: [k]}`, k = 0 … 3, from `x(0)`, `x(953/2)`, `x(500)`, `x(1953/2)`
   to `x(953/2)`, `x(500)`, `x(1953/2)`, `x(4241/2)`, each with its label
   at `part: [k, "label"]` reading A, B, A, C, and three `boundary`
   elements at `part: [k, "start"]`, k = 1, 2, 3, at the drawn starts of
   entries 1 to 3, from `y − 8` to `y + 8`. No run (no two consecutive
   entries name one ID), so no gap line: the line has no `gapLines`.
4. **`single`.** Pieces `[0, 953/2]` at 0 and `[500, 1644]` at 953/2;
   braces 0 and 1 labelled A and C, one boundary at `x(953/2)`.
5. **A run drawn once, and a gap: `by_hand`.** Pieces of A at 0, 953/2,
   953, 2859/2, the gap `[1906, 1910]`, C at 1910 to 3054. Entries 0 to 3
   are a run of four in a card the block holds: its run gap spans `[953/2,
   1906]`, so every position `t` from 1906 on lies at `x0 + (400 ×
   u(953/2) + (400 × u(t) − 400 × u(1906)))`, and 1906 itself exactly where
   brace 0 ends; the line ends there for `t` = 3054. Brace 0 runs from `x0` to
   `x0 + 400 × u(953/2)` and is labelled `A × 4` (U+00D7); entries 1 to 3
   draw no brace, label or boundary. Entry 4, the gap, draws no brace and
   its label `4 ♩` (the pretty text of its length on `allegro`'s axis)
   centred on `x(1908)`. Brace 5 runs from `x(1910)` to `x(3054)`,
   labelled C. Boundaries at entries 4 and 5, at `x(1906)` and `x(1910)`.
   The line's `gapLines` are `[[x(1906), x(1910)]]`. Since the gap entry
   starts exactly where brace 0 ends, its label lies on the first row,
   at brace 0's label's baseline (a `D` rounded once more would start it an
   ulp left of that end and move it to a second row).
6. **The name.** With names drawn whole (`max-width: none`), the cards'
   names read `Allegro, practice · unfolded from Allegro`, `Allegro,
   default · unfolded from Allegro` and `Allegro, single · unfolded from
   Allegro` (U+00B7).
7. **A virtual member.** `groups/virtual_member` draws the frame
   `performance` with two cards in its display order, `allegro_default`
   then `recording`, and `allegro`'s card below it (an ungrouped root).
   The virtual card draws the four braces and three boundaries of 3, at
   its own `x0`, and its named timestamps `timestamp_3` (0) and
   `timestamp_4` (4241/2) as wedges at `x(0)` and `x(4241/2)`, labelled
   `0 ♩` and `2120 1/2 ♩`. No ancestor line, no ancestor card.
8. **No run in a frame.** The same manifest with `allegro_by_hand` as the
   frame's member in `allegro_default`'s place (its members and its
   display order so changed, nothing else): the frame's virtual card draws
   every entry, braces 0 to 3 labelled A, the gap's label `4 ♩`, brace 5
   C, boundaries at entries 1 to 5, at `x(953/2)`, `x(953)`, `x(2859/2)`,
   `x(1906)`, `x(1910)` with `D` = 0, and the gap line `[[x(1906),
   x(1910)]]`.
9. **The axes follow the run.** What a hover, a pin and the coordinate
   flag read on a line is its axes (`lineAxes`, read by `abscissaOf`), so
   on `allegro_by_hand`'s card of 5 the line has one axis per run, as an
   elided line has one per run between its gaps: run 0 over `[0, 953/2]`
   from `x0` to `x0 + 400 × u(953/2)`, start 0, length and drawn length
   953/2; run 1 over `[1906, 3054]` from `x(1906)`, which is exactly
   `x0 + 400 × u(953/2)` (where brace 0 ends), to `x(3054)`, the line's
   end, start 1906, length and drawn length 1148. No axis holds a
   position strictly inside the run gap (`953/2 < t < 1906`), which the
   drawing does not draw. A position is read on the axis holding it by
   the one linear rule of `abscissaOf`, `xStart + (t − start) / drawn
   length × (xEnd − xStart)`, each operand a double: 0 at `x0`, 1906 at
   run 1's `xStart` (the coordinate the drawing shows where the brace
   ends), 1908 (the gap's middle) at `xStart + (2 / 1148) × (xEnd −
   xStart)` of run 1. A single straight axis over `[0, 3054]` would put
   1906 at `x0 + 400 × u(1906)`, about 187.2 to the right of that end. The
   virtual cards placed beside it, without a run, keep one axis each, from
   `x0` to `x0 + 400`.
10. **Elisions of a placed virtual card** (section 8.10, Elisions of a
    virtual timeline, and Runs). The specification's worked example: a
    root `score` (16 quarters) with the regions `region_1` "A" over `[0,
    8]` and `region_2` "B" over `[8, 16]`, the FlowMap `flow_map_1`
    playing `region_1`, `region_1`, `region_2`, and the virtual timeline
    `virtual_1` (24 quarters) applying it, placed (`places` holding
    `virtual_1`), at `L` = 400. Entries 0 and 1 are a run drawn once, its
    run gap over `[8, 16]`. An elision `elision_1` on `virtual_1` over
    `[10, 14]` lies wholly in the run gap: it has no piece, the card draws
    no `elision` element, and its line is drawn as without it, from `x0`
    to `x0 + 266.6666666666667`, uncut. An elision over `[17, 19]` with
    the width `{canvas: 8}` lies in entry 2: its one piece has the natural
    width 33.33333333333326, the drawn width 8 and the shrink
    25.333333333333258, so its `elision` element runs from `x(17) = x0 +
    150.00000000000006` to `x(19) = x0 + 158.00000000000006` (each `x0 +
    (133.33333333333331 + (L × u − 266.66666666666663 − D))`, `D` 0 at 17
    and the shrink at 19); the line is cut there (`cuts` that one pair)
    and ends at `x(24) = x0 + 241.33333333333343` in its end circle; the
    brace of chunk 2 (`B`, midpoint 20, in no gap) is drawn from `x(16) =
    x0 + 133.33333333333331` to `x(24)`, cut at the gap; the gap draws its one
    ellipsis at its middle, `((x(17) + x(19)) / 2, (yt + yb) / 2)`, the
    gap being a stored elision's, drawn whatever its width (section 6.6).
    The card of `score` drawn as
    written draws no elision of `virtual_1` (the elision lies on another
    timeline), and switched to `virtual_1` by the manifest's rule it draws
    none either (section 8.10, Switched cards).
11. **An elision on a virtual member** (section 8.10, Elisions of a
    virtual timeline, and section 8.9, Group elisions). `allegro_default`
    is a member of `performance` and lies in no tree, so an elision on it
    is a group elision of that frame, drawn across it as any member's.
    `groups/virtual_member` given `gap` on `allegro_default` from 500 to
    1000, display `[ellipsis, name]`, no `width`, at the default placement
    (`L` 400): `allegro_default` is its own member `M`, `λ` its length
    4241/2, so the proportions are `p = 1000/4241` and `q = 2000/4241`
    rounded once to doubles (0.23579344494223062 and 0.47158688988446124),
    the natural width `n = 400 × q − 400 × p` = 94.31737797689225, the
    drawn width the standard 32 and the shrink `s = n − 32` =
    62.317377976892246. With `x0` the start of `allegro_default`'s line:
    - one `elision` element `{id: "gap"}`, from `x0 + 400 × p` to `x0 +
      (400 × q − s)` (`x0 +` 94.31737797689225 and 126.31737797689225),
      from the top of `allegro_default`'s card to the bottom of
      `recording`'s (the frame's topmost and bottommost member cards),
      its elided coordinates 500 to 1000 on `allegro_default`;
    - both members' lines start at `x0`, are cut at that pair and end at
      `x0 + (400 − s)` (`x0 +` 337.68262202310774): the gap is carried to `recording`'s axis as to any
      member's, the frame drawn shorter by `s`;
    - its ellipsis centred in it, at the middle of its edges, and its
      `name` label reading `Allegro, default`, the name of the timeline it
      lies on (section 5.3), not its card's name `Allegro, default ·
      unfolded from Allegro`;
    - the frame's exposure lists that one gap with its elided
      coordinates on every member, card by card: `allegro_default` 500 to
      1000 (exact), `recording` 702500/4241 and 1405000/4241 rounded once
      to doubles (165.644895071917 and 331.289790143834, the exact
      proportions times the float length 702.5);
    - no other `elision` element: no card draws it as a card elision.

## Switched cards (`switched.test.ts`)

Section 8.10 (Switched cards, Switched frames, Runs), with sections 2.4
and 2.5 (`flow`), is the oracle. The fixtures are `flow/switched_card`
(the root `allegro` of `flow/virtual_cards`, its card switched to the
FlowMap `default` by the manifest's own rule) and `groups/switched_frame`
(the same, `allegro` a member of the frame `performance` with `recording`,
702.5 seconds, and the named timestamps `timestamp_1` (0) and
`timestamp_2` (1644) on `allegro`, `timestamp_3` (0.0) and `timestamp_4`
(702.5) on `recording`); a variant is the fixture with its rule's `flow`,
its FlowMaps or its timeline's children written onto it, nothing else.
The pieces of `default` are `[0, 953/2]` at 0, `[953/2, 500]` at 953/2,
`[0, 953/2]` at 500 and `[500, 1644]` at 1953/2, `Λ` = 4241/2; every x
below is `x0 + 400 × u`, `x0` the `xs` of the card's first line element,
`u` the exact quotient of the played position and `Λ` rounded once to a
double, every ordinate of a boundary the line's `y` less and plus 8. What
proves the switch is that every position is the played one computed from
the FlowMap alone, every label the written one, and that a rule outside
the manifest's own layer or with another selector switches nothing.

1. **The cascade.** `flow` is no style a drawing takes: which card is
   switched is read by core from the manifest's own layer (`cardFlow`,
   `switchOf`, core's README, "Elements and selectors", 16), and layout
   draws by it. The rule `{flow: "default"}` on `{addresses: [{id:
   "allegro", part: ["card"]}]}` leaves the card's cascaded style without
   a `flow` member.
2. **The switched card.** `flow/switched_card` draws one `timeline`
   element `{id: "allegro"}` from `x(0)` to `x(4241/2)`, start and end
   circles; braces `{id: "allegro", facet: "regions", part: [k]}`, k = 0 …
   3, from `x(0)`, `x(953/2)`, `x(500)`, `x(1953/2)` to `x(953/2)`,
   `x(500)`, `x(1953/2)`, `x(4241/2)`, labelled A, B, A, C; boundaries at
   k = 1, 2, 3 at their starts; the row name `Allegro · default`; its
   flow control drawn unfolded (13).
3. **Drawn as written.** The same rule in an application layer instead
   of the manifest's (the manifest's rule removed) draws the card as
   written: one line from `x0` to `x0 + 400`, no chunk element, the row
   name `Allegro`, the flow control drawn.
4. **A virtual timeline named.** `flow` naming `allegro_single` switches
   to `single`: braces A over `[x(0), x(953/2)]` and C over `[x(953/2),
   x(3241/2)]` (`Λ` = 3241/2), the row name `Allegro · Allegro, single`.
5. **A run drawn once.** `flow` naming `by_hand` on the ungrouped card:
   brace 0 `A × 4` to `x(953/2)`, entries 1 to 3 drawn not, the gap's
   label `4 ♩`, brace 5 C, the line ending at `x0 + (400 × u(953/2) +
   (400 − 400 × u(1906)))`, as on the virtual card (Virtual cards, 5).
6. **Regions unfolded.** With an application layer showing every region
   (`{element: "region"}` → `display: inline`, over the default hiding of
   atomic sections), `allegro`'s regions follow the chunks piece by piece:
   `section_a` over `[x(0), x(953/2)]`, `section_b` over `[x(953/2),
   x(500)]`, `section_a` over `[x(500), x(1953/2)]`, `section_c` over
   `[x(1953/2), x(4241/2)]`, each with its label (A, B, A, C).
7. **A child cut by the pieces.** `allegro` with a locked child `motif`
   (offset 400, length 200, so over `[400, 600]`): four `child` elements
   `{id: "motif"}`, over `[x(400), x(953/2)]` (circle, no end mark),
   `[x(953/2), x(500)]` (no marks), `[x(900), x(1953/2)]` (circle, no end
   mark) and `[x(1953/2), x(2153/2)]` (no start mark, diamond), all on one
   row named `motif` once.
8. **Named timestamps at every played position.** In
   `groups/switched_frame`, `allegro`'s card draws the wedge of
   `timestamp_1` at `x(0)` and `x(500)` and of `timestamp_2` at
   `x(4241/2)` (the last piece holds its end), labelled `0 ♩`, `0 ♩` and
   `1644 ♩`, the written coordinates.
9. **A switched frame.** In `groups/switched_frame`, `recording` is
   carried through the group (`t = m × 1644 / 702.5`) and its line is
   drawn once per piece: four `timeline` elements `{id: "recording"}` over
   the four pieces' x, the marks (circle, none), (none, none), (circle,
   none), (none, arrowhead): a start circle where a piece starts at its
   zero, its arrowhead at its end. Its timestamps draw at `x(0)`, `x(500)`
   (`0″` twice) and `x(4241/2)` (`11′42.5″`). Only `allegro`'s card draws
   chunks; no elision is drawn.
10. **Two switched cards.** With a region `take` "Take" over the whole of
    `recording`, `[0.0, 702.5]`, a FlowMap `twice` of `recording`
    (`["take", "take"]`) and the rule switching `recording`'s card to it
    beside `allegro`'s, the frame is drawn as written: one line each, no
    chunk element.
11. **A carried virtual member.** `groups/virtual_member` with that
    region, that FlowMap `twice` and `recording`'s card switched to it: the frame is
    switched by `recording`'s card, `Λ` = 1405.0, and the virtual card of
    `allegro_default` (4241/2) is carried (`t = m × 702.5 / (4241/2)`): its
    line is drawn twice, its four chunk braces twice (eight, k = 0, 1, 2,
    3, 0, 1, 2, 3) and its boundaries k = 1, 2, 3 twice; `recording`'s
    card draws the braces of `twice`, k = 0 and 1, both labelled `Take`
    (no run is drawn once in a frame).
12. **A carried child member: its ancestor lines unfolded.**
    `groups/group_child_member` (the frame `group_1` of `second-half`, 8
    quarters at offset 8 in `piece`, 16 quarters, and `recording`, 10.0
    seconds) with a region `take` "Take" over `[0.0, 10.0]` of
    `recording`, a FlowMap `twice` of `recording` (`["take", "take"]`),
    the rule switching `recording`'s card to it, and a named timestamp
    `bar_7` "Bar 7" of `piece` at 12 (display wedge and coordinate), drawn
    with the ancestor cards hidden (`HIDDEN_ANCESTOR_CARDS`). The frame is
    switched: pieces `[0.0, 10.0]` at 0.0 and at 10.0, `Λ` = 20.0;
    `second-half` is carried (`t = m × 10.0 / 8`, in binary64), so its 0,
    4 and 8 lie at 0.0, 5.0 and 10.0 of `recording`'s axis, played at
    0.0, 5.0, 10.0 in the first piece and 10.0, 15.0, 20.0 in the second.
    With `x0` the start of `recording`'s line and `x(t) = x0 + 400 × (t /
    20.0)`: `recording`'s card draws the braces of `twice`, k = 0 over
    `[x(0), x(10)]` and k = 1 over `[x(10), x(20)]`, both labelled `Take`;
    `second-half`'s line is drawn twice. The ancestor line of `piece`
    (`ts` = −8, so it runs on to the left; `te` = 8 = λ, so it ends with
    `piece`'s own end, an arrowhead, `piece` being a root) is drawn once
    per piece, over the played stretch of the member's `[0, 8]`, both
    ancestor elements at `{id: "piece"}` on one ordinate: from `x(0) −
    4w` in chevrons to `x(10)` in an arrowhead, and from `x(10) − 4w` in
    chevrons to `x(20)` in an arrowhead, `w` the ancestor line's stroke
    width (section 8.10, Switched frames). Its axes are two, `{id:
    "piece"}` then the same with `run` 1, each from `x(0)` and `x(10)` to
    `x(10)` and `x(20)`, on `piece`'s own axis from 8 to 16 (start, end
    and drawn end), each with `piece`'s unit and number type. `bar_7`
    lies at the member's 4, so its wedge is drawn at `x(5)` and `x(15)`,
    both labelled `12 ♩` (the written coordinate), and each axis holds
    the one at its own x. The ancestor's name `Piece` is drawn once. Drawn
    as written (the rule removed), the frame draws one ancestor line from
    `x0' − 4w` to `x0' + 400` and no chunk (`x0'` the start of its
    members as written). Core lists the elements so drawn (`piece`'s
    ancestor line once per piece), which the cascade's enumeration test
    checks on this manifest too.
13. **Flow control unfolded.** A switched card keeps the band
    configuration of the card drawn as written (section 8.10), its flow
    control band among them, and draws each flow-control element at every
    played position of its position. In `flow/switched_card` the jump
    `volta_jump` (953/2) ends piece 0, which a stretch starting at 953/2
    follows, and piece 2, which one starting at 500 follows: its fork
    `{id: volta_jump, part: [fork]}` has its branch point at `x(953/2)` and
    `x(1953/2)`. `repeat_end`, `second_ending` and `volta_break` (500) end
    piece 1 and start piece 3: the symbol `{id: repeat_end, part:
    [symbol]}` is drawn at `x(500)` and `x(1953/2)`, the flow line
    `{id: volta_break}` (a `break`) at `x(500)` and `x(1953/2)`; the jump
    target `second_ending` draws nothing; these six drawings are all
    those of the four IDs, and the card has a flow control band record. With
    the arcs shown (`ARCS_ALONE`'s first rule) the card draws no `jump`
    element: the arc of `repeat_end` runs from 500 back to 0 (the start of
    its section, no section break lying before it), and no piece holds
    both. A jump `dal_segno` added at 1000 with the destination `to:
    section_c` (whose start is 500) lies in piece 3 alone, which also holds
    500: it draws one arc, from `x(2953/2)` (played 1953/2 + (1000 − 500))
    to `x(1953/2)`. Its flow control band hidden by the manifest's rule
    `{addresses: [{id: allegro, facet: flow_control}]}` → `display: none`,
    the card draws no element of the four IDs, as the card drawn as
    written would not. In `groups/switched_frame` `allegro`'s card in the
    frame draws its flow line `volta_break` at `x(500)` and `x(1953/2)`
    alike.
14. **Conversion maps unfolded.** `flow/switched_card` with a LinearMap
    `tempo` on `allegro` (support's `linearMap`) draws it once in each
    piece, clipped to it: four `map` elements `{id: tempo}`, from `x(0)`,
    `x(953/2)`, `x(500)`, `x(1953/2)` to `x(953/2)`, `x(500)`,
    `x(1953/2)`, `x(4241/2)`, each one item of the slots' first fit;
    since an item starting where another ends shares its row (section
    6.3), all four lie in slot 1, on one ordinate.
15. **Segment boundaries at every played position.** `allegro` made a
    segment line holding the segments `s1` "S1" (offset 0) and `s2` "S2"
    (offset 500), neither with a length: `s2`'s start, 500, is held by
    piece 1 (its closed end) and piece 3 (its start), so its boundary
    `{id: s2, part: [start]}` is drawn at `x(500)` and `x(1953/2)`, and
    `s1`, the first, has none. `s1` over `[0, 500]` reaches into pieces 0,
    1 and 2 and `s2` over `[500, 1644]` into piece 3 alone, so the labels
    are S1, S1, S1, S2, in the order of the pieces, each centred on its
    drawing's played midpoint: `x(953/4)`, `x(1953/4)`, `x(2953/4)`
    and `x(6194/4)` (the midpoints of `[0, 953/2]`, `[953/2, 500]`, `[500,
    1953/2]` and `[1953/2, 4241/2]`).

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

**A child's extent counts its wedges where its band is not aligned.**
`contiguous` (root `piece`, length 8, children `a` [0, 3], `c` [1, 3], `b`
[3, 8], none named, every pitch 14), with `c` given by command its own band
order `[regions, line]` (completed `[children, conversion_maps, regions,
line, markers, flow_control]`, so `piece`'s children band is not aligned;
`c` has no regions, so it draws as before): `a` takes row 1, `c` row 2,
`b` row 1 (it starts where `a` ends), so the children band, from 7, is `7
+ 7 + 7 + 7 = 28` wide, `Ea = 35`, the root's line at `8 + (8 + 35) = 51`
and `b`'s at `51 − 14 = 37`. With `timestamp_1` at 0 on `b` drawing its
wedge alone, `b`'s extent holds the wedge's `[150 − 3, 150 + 3]`, which
conflicts with `a` (`[0, 150]`) in row 1 and `c` (`[50, 150]`) in row 2, so
`b` takes row 3, whose inner half is `max(7, 1.5 + 13) = 14.5` (`b`'s
markers band, no label): `l3 = ((7 + 7) + (7 + 7)) + (7 + 14.5) = 49.5`,
the band `49.5 + 7 = 56.5` wide from 7, the root's line at `8 + (8 + 56.5)
= 72.5` and `b`'s at `72.5 − 49.5 = 23`. With a rule turning that wedge 90
(`{addresses: [{id: timestamp_1}]}`), its extent is `[150, 163]`, within
`b`'s own `[150, 400]`, so `b` takes row 1 again, whose inner half is now
`max(7, 1.5 + 13) = 14.5`: `l1 = 7 + 14.5 = 21.5`, `l2 = (7 + 14.5) + (7 +
7) = 35.5`, the band `35.5 + 7 = 42.5` wide from 7, the root's line at `8 +
(8 + 42.5) = 58.5` and `b`'s at `58.5 − 21.5 = 37`; turned −90, its extent
`[137, 150]` conflicts with `a` and `c` as before, so the lines lie at 72.5
and 23.

**A child keeps its row where its band is aligned.** `contiguous` as it is
(its children follow one band order): the extents are the lines alone, so
`b` takes row 1 beside `a` whatever its wedge (section 6.4, Children); with
the wedge, at every rotation (none, 90, −90), `b`'s markers band is present
below its line, and so is `a`'s, both `1.5 + 13 = 14.5` wide (Rows of one
band order), so row 1's inner half is 14.5 and the lines lie at 58.5 and 37
as above; without it, at 51 and 37.

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
at 3 (given the ID `here`, the default `display`). Above `r`'s line its
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
  value. So the hover mark is faded as the line is. No mark of the
  member's start or end is drawn there (section 8.3). In
  `group_child_member` `piece`'s ancestor line
  in `second-half`'s card lies below the member at 85.18359375 (`w` 3, the
  defaults' ancestor stroke width; the quantities of "Ancestor lines"; the
  ancestor card, shown by the defaults, moves no origin), so at 100 the mark is `[[100,
  86.68359375], [97, 99.68359375], [103, 99.68359375]]` (`85.18359375 +
  1.5`, then 13 down, `∓ 3` across). A rule
  hiding the wedge of `second-half`'s `origin` (`timestamp_3`) and one
  recolouring and turning that of its `length` (`timestamp_4`), each
  naming its address, change nothing of it: the hover mark depends on no
  styled element. A rule on every wedge
  (`{element: wedge}` with fill `#123456`, naming no address) recolours it,
  as it does every unnamed wedge. In `group_parent_both` `piece`'s
  ancestor line in `middle`'s card lies at 85.18359375 alike, so at 200 the
  mark is `[[200, 86.68359375], [197, 99.68359375], [203, 99.68359375]]`
  and its
  style is the whole style above, nothing being drawn at `{id: middle,
  part: [start]}`; a rule recolouring the wedge of `middle`'s `origin`
  (`addresses: [{id: timestamp_1}]`, fill `#FF0000`) leaves the hover mark
  equal to the one without it; a rule on the wedges
  of ancestor lines (`{element: wedge, inside: ancestor}`, fill `#123456`,
  opacity 1) gives it fill `#123456` and opacity 1 and leaves the unnamed
  wedge of `middle`'s own line as it was (fill `#000000`, opacity 1); with
  `group_1` at scale 2 the mark is scaled with its line: at `x` its tip
  lies at `y + 3` and its corners at `x ∓ 6` and `y + 3 + 26`, `y` the
  ancestor line's ordinate in that drawing (its axis record), its style's
  lengths doubled as every scaled style's (stroke width 6, font size 18). What would be wrong: none (the hover on an ancestor line
  then shows no mark), a wedge of a named timestamp moved there (a rule
  on its address would hide or recolour the hover), the member line's
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
   length 4) added to `score` and a groupstamp `motif_beat` "Motif" at 1
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
   `beat` "Beat" added on `performance` at the float 1.0, `display`
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
   `recording`, seconds 10.0), with a groupstamp `half` "Half" added on
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
chevrons. `corpus_score_ms3` without its children and unlocked (the fixture
states the lock its loader set; a command sets a length on an unlocked
timeline, whose known end is an arrowhead; its elements named by role and
quarter as in `placement.test.ts`, its root through the fixture) draws the
same flow control (the breaks at 9, 10, 12 and 34, then the arcs in their
placement order of `placement.test.ts`, `J9` to `J37`) with its length set
to null, `J37` in its reach; given without `J32`, the break and the jump
at 34 and `J37` (a flow-control element is never removed by a command, so
the manifest is given without them, and its Fine without the condition
naming `J37`), it draws the same flow control at length null as at length
34, the coordinate of the jump target there, which draws nothing: every flow-control coordinate counts, and a measure
map, which belongs to no timeline, does not. The place a destination
reaches by its `by` counts too: `unknown_length` reaches 14, the end of
`coda` (offset 10, length 4); with a jump added at 4 whose destinations
are `by` 16 and `by` −4 its reach is 20, so `score` runs from `xs =
53.798828125` over 400 to its chevrons, `coda` from `xs + 400 × 10 / 20 =
xs + 200` to `xs + 400 × 14 / 20 = xs + 280`, and the jump's arcs, the
shorter first, from `x(4) = xs + 80` to `x(0) = xs` and to `x(20) = xs +
400`, the end of the line. A child of unknown length ends at its offset plus its reach,
open, with room for its chevrons, `9.5w`; a group member runs on at the
shared end; a segment ends at the next one's start, the last at its
segment line's end. Ancestor lines run on where the member's or the
ancestor's length is not known, marking nothing of the member, and end
short of the member where a timeline between has no length. Counting reads of a timeline's children
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
`max(7, 26.9765625 + 4) = 30.9765625` and each row, with nothing drawn on
it (a member's `origin` and `length` are groupstamps, whose secondary
coordinates on the ancestor lines the defaults hide), adds `7 + 7`, so `Hm =
14.40234375 + 44.9765625 + 8 = 67.37890625` with one ancestor row and
`14.40234375 + 58.9765625 + 8 = 81.37890625` with two, the member's line at
`y_root = 14.40234375` and the nearest ancestor's 37.9765625 below it. One
map above gives `y_root = 14.5`, `Hm = 49.4765625`, and with one ancestor
row below `Hm = 14.5 + 44.9765625 + 8 = 67.4765625`. Maps end at their
line's `Xe` and change no horizontal quantity. A member's `origin` and
`length` groupstamps each cross their card in two pieces, above and below
their gap (the last descriptors of the member drawing), and, after every
item, the frame less their member's card (section 8.5).

Per case, `xn`; `x0`; `R`, with what sets it; the member drawings'
heights; and `W`, `H`, with what sets them:

- `bare`: 16; `16 + 25.5771484375 + 8 = 49.5771484375`; the arrowhead's
  tip 458.5771484375; 49.37890625; 476.5771484375, 67.37890625, set by the
  shadow.
- `group_child_member`: 24; `24 + 64.61962890625 + 8 + 24 =
  120.61962890625`; 529.61962890625 (the arrowheads of `piece`'s ancestor
  line and of `recording`, `x0 + L + 3w`; `recording`'s end label `10″`
  reaches only 528.026611328125); 67.37890625, 49.37890625;
  553.61962890625, 173.5625, set by the frame. The member's card writes,
  after its rectangle, `piece`'s ancestor line, its line, the wedges of
  `timestamp_3` and `timestamp_4`, the names of `piece` and `second-half`,
  the two coordinate labels and the two pieces of each groupstamp's line;
  `recording`'s card its line, wedges, name and labels; then `timestamp_3`'s
  and `timestamp_4`'s lines across the frame, one piece each, over
  `recording`'s card.
- `group_parents_mixed`: 24; `24 + 57.0302734375 + 8 + 24 =
  113.0302734375`; 546.947265625 (`1 323 000 smp`); 67.37890625, 67.4765625,
  67.37890625, 49.4765625; 570.947265625, 324.515625.
- `group_grandchild`: 24; `24 + 55.70361328125 + 8 + 24 =
  111.70361328125`; 535.70361328125 (`score`'s outer chevron, `x0 + L +
  8w`); 81.37890625, 49.37890625; 559.70361328125, 187.5625.

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
- `Mr = 26.760498046875`, half of `excerpt`'s `length` label `88 200 smp`
  (5 × 1303 + 2 × 651 + 1067 + 1995 + 1300 = 12179 advances,
  53.52099609375 wide at size 9) past the shared end, beyond the outer
  chevron tip of `recording`'s ancestor line, `8w = 24` past it; every item
  has `Ri = 118.29150390625 + 400 + 26.760498046875 = 545.052001953125`,
  every member's card is 545.052001953125 wide, every frame and
  `annotations`' card 561.052001953125.
- Heights: `score` 78.953125 (two maps, `y_root = 19.5`; its flow control
  band from 30.9765625, 20.4765625 wide), `performance` and `page`
  49.4765625, `excerpt` 67.4765625, `annotations` 71.85546875 (its two
  regions share one row, 18.4765625 wide, from 30.9765625).
- The title at `(8, 18.21044921875)`, `Pt = 8 + h(11) + 8 = 28.8046875`;
  `group_1` at 28.8046875, 169.234375 high, its cards at 53.609375 and
  140.5625; `group_2` at 206.0390625, `8 + 12.8046875 + 4 + 49.4765625 + 8
  + 67.4765625 + 8 = 157.7578125` high, its cards at 230.84375 and
  288.3203125; `annotations`' card at `206.0390625 + 157.7578125 + 8 =
  371.796875`, its line at 386.19921875. Every line runs from
  126.29150390625 to 526.29150390625; `W = 8 + 561.052001953125 + 2 + 8 =
  579.052001953125`, `H = 371.796875 + 71.85546875 + 2 + 8 =
  453.65234375`, both from `annotations`' card's shadow.
- Element order: the block, the title, `group_1`, its title, `score`'s
  card, `score`'s maps `cmap_1` and `cmap_2`, its jump
  `jump_1`, its line, …, `excerpt`'s card, `excerpt`'s map `cmap_6`,
  `recording` (the ancestor line), `excerpt`, …: a member drawing opens with
  its breaks, maps, regions and jumps, its ancestor lines just before
  its line. The member drawings of `performance` and `page` open with their
  maps `cmap_3` and `cmap_4`, `annotations`' with its regions `region_1` and
  `region_2`.
- Records: a root with `origin` and `length` emits 6 elements, each map 1, each
  region or jump 2, each ancestor row 2 (its line and its name), a member's
  `origin` and `length` groupstamps 4 more in its card (two pieces of each
  line), and each groupstamp 1 across its frame (over `page`'s card) after
  the last item. So of 60 elements: the block `[0, 60)`, key and holder
  null, address `{}`; `group_1` `[2, 23)` holding the cards of `score` `[4,
  15)` and `performance` `[15, 23)`; `group_2` `[23, 47)` holding the cards
  of `page` `[25, 33)` and `excerpt` `[33, 47)`; `annotations`' card `[47,
  58)`; `timestamp_3`'s and `timestamp_4`'s lines across `group_2` at 58
  and 59. A frame's key is `{item: G}`, its address
  `{id: G}`; a member's card's key `{item: G, member: T}`, its holder its
  frame's key `{item: G}`; `annotations`' card's key `{item: annotations}`,
  its holder null.
  The frames and `annotations`' card are the items and carry `item`, their
  place; every card carries `card`, its size in item coordinates (a
  member's card `{545.052001953125, Hm}`), its `spacing` 4 and its request
  `{}`, and its rectangle is its drawn one. Every band is held by the card
  whose member drawing draws its line, its holder that card's key, and its
  range is empty.

**Hidden titles.** With `{addresses: [{id: group_1, part: [name]}]}
display none` on `group_child_member` the frame loses its title slot: cards
at 16 and `16 + 67.37890625 + 8 = 91.37890625`, the frame `8 + 67.37890625
+ 8 + 49.37890625 + 8 = 140.7578125` high, `H = 156.7578125`. With
`{addresses: [{part: [name]}]} display none` on `bundle_mixed` everything
below moves up by `h(11) + F = 20.8046875`: `annotations`' card at
350.9921875, `H = 432.84765625`.

**Hidden cards and frames keep their place** (section 8.4): not drawn, but
their edges enter `Wb` and `Hb`, a hidden card's shadow does not, and every
other element stays as it is.

- `bare` with `{element: card} display none`: `Wb = 474.5771484375`, `Hb =
  65.37890625`; the card's range `[1, 7)`, its 6 elements.
- `group_child_member` with `{element: card} display none`: the frame still
  sets `W` and `H` (553.61962890625, 173.5625); the cards' ranges `[3,
  15)` and `[15, 21)`, the frame's `[1, 21)` (the groupstamps' lines across
  the frame follow it).
- `group_child_member` with `{element: frame} display none`: `xn = 24`, the
  cards at `x = 16`, `W` and `H` from the frame's edges; the title moves to
  1, the cards `[2, 15)` and `[15, 22)`, the frame `[1, 22)`.

**The block size.** `W = max(Wb, width)`, `H = max(Hb, height)`: `bare` at
600 and 100 gives 600 and 100, every other element unchanged; at 300 and 20
it gives `Wb` and `Hb`; at 600 and null `H = Hb`. The block padding `P`
changes with no spacing: `bare` at the block's `spacing` 24 and its card's 0
keeps its card at `y = 8`, `Hm = 49.37890625`, `H = 67.37890625`.

**Addresses (section 2.2).** `corpus_mpm`'s one TableMap, whose ID `M`
its loader mints (`conversionMapOf`), is `{id: M}`; a region `region_1` added into the member
`second-half` of `group_child_member` is `{id: region_1}`, its label `{id:
region_1, part: [label]}`, and these two are the only elements whose
address carries that ID. Every card of `M` is `{id: M, part: [card]}`,
whether `M` is a member or an ungrouped root, its place key telling cards
apart; no element is drawn at `{id: M, part: [start]}` or `{id: M, part:
[end]}`: a member's start and end are its named timestamps.

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
  +0)`. `group_child_member`'s frame `{8, 8, 400, 1, 8, 537.61962890625,
  157.5625}` (a frame's default spacing 8), `[1, 23)`. Stating
  the defaults (`{bare: {x: 8, y: 8, length: 400}}`) draws the same; only
  `stated` changes.
- **The default `y`** in `bundle_ungrouped` (heights `pages` 63.453125,
  `recording` 49.4765625): `recording` at `28.8046875 + 63.453125 + 8 =
  100.2578125`, `score` at 157.734375; with `{pages: {height: 100}}` at
  136.8046875 and 194.28125.
- **`bundle_mixed__places`** (`{group_2: {x: 40, y: 200, width: 700},
  annotations: {x: −30, length: 300}}`): the items in drawing order with
  their stated places (`Mr = 26.760498046875` and `Ri = 545.052001953125`
  as in "The block"); `group_1` 561.052001953125 × 169.234375;
  `group_2`'s request gives `Ri = 700 − K − Q = 684`, the frame exactly
  700 wide and 157.7578125 high; `annotations` at `L = 300`, its default
  `y` `max(28.8046875 + 169.234375, 200 + 157.7578125) + 8 = 365.7578125`,
  its card `118.29150390625 + 300 + 26.760498046875 + 16 =
  461.052001953125` wide, its line at 380.16015625; origin `(38, 0)`, `Wb
  = (8 + 740) + 38 = 786`, `Hb = 365.7578125 + 71.85546875 + 2 + 8 =
  447.61328125`. Every item's lines start at the block's one start, each at
  its own length.
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
  28.8046875, 461.052001953125, 200}` (`Ri = 418.29150390625 +
  26.760498046875`), its cards 445.052001953125 wide; `group_2` at
  236.8046875, 561.052001953125 × 157.7578125; `annotations`' card at
  `236.8046875 + 157.7578125 + 8 = 402.5625`, its line at 416.96484375, `Ri
  = 600 − K − Q = 584`, exactly 600 wide (without the inset `Q` it would
  be 608); `W = 618`, `H = 402.5625 + 71.85546875 + 2 + 8 =
  484.41796875`.
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
  108.18359375, 650, 120}`, the
  frame `{8, 8, 666, 228.18359375}`, `W = 682`, `H = 244.18359375`; the
  cards' records, keyed `{item: group_1, member: second-half}` and `{item:
  group_1, member: recording}`, held by `{item: group_1}`: `second-half`
  `{521.61962890625, 67.37890625}` `[3, 16)`, `recording` `{650, 120}` stated
  `{width: 650, height: 120}` `[16, 23)`. A member's entry (under its
  group's entry's `cards`, by member ID) is read for `width`, `height` and
  `spacing` alone: one also stating `x`, `y`, `length` and `scale` draws as
  the one stating `width` alone; a
  request no larger than the card changes nothing; under the group's scale
  2 the card is drawn 1300 wide at `y = 8 + 2 × (108.18359375 − 8) =
  208.3671875` and its record keeps `{650, 49.37890625}`.
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
  the break from 217.6875 to `157.734375 + 8`, `H = 260.1640625`; `pages`
  and `recording` unchanged, the records `spacing` 4, 4 and 8. A frame's
  spacing 16 (`group_child_member`) lies between its cards alone:
  `recording`'s card at `8 + (((8 + 12.8046875) + 4) + 67.37890625 + 16) =
  116.18359375`, the frame `165.5625` high, `H = 181.5625`, both cards'
  spacing 4. A member's card spacing 8 (`{group_1: {cards: {second-half:
  {spacing: 8}}}}`, one ancestor row below its line, nothing drawn on it)
  starts its ancestor band at `max(18 / 2, 26.9765625 + 8) = 34.9765625`,
  the row's pitch `max(18, h(9)) = 18`, its halves 9 and 9: `Eb' =
  52.9765625`, `y_root = 14.40234375`, `Hm = 75.37890625`, its line at
  47.20703125, `piece` 43.9765625 below it at 91.18359375, `recording`'s
  card at 116.18359375, the frame 165.5625 high. All three together, with
  the block's spacing 24 on the one frame, give the cards 75.37890625 and
  49.37890625 at spacings 8 and 4, `recording`'s card at `32.8046875 +
  75.37890625 + 16 = 124.18359375` and the frame 173.5625 high: no
  spacing multiplies another.

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
  {cards: {second-half: {margin: 12}}}}`): `second-half`'s card `67.37890625
  + 24 = 91.37890625` high, everything in it, its ancestor line `piece`
  included, moved by `(0, 12)`, but the ends of the four pieces of its
  groupstamps' cross-section lines that lie on the card's borders (section
  6.6: a cross-section line runs from the card's top to its bottom), which
  stay on the top and follow the bottom, 24 lower; `recording`'s card and
  everything in it moved by `(0, 24)`, the card from 108.18359375 to
  132.18359375; the frame `157.5625 + 24 = 181.5625` high.
- **Breaks** (`flow_control`, its root `flow:quarters` at `{margin:
  12}`): the root's break runs to `P + V` and `Hc − P − V` (section
  6.4), so it too is moved by `(0, 12)`, both its ends; the card is 24
  higher. Only the break is compared there: a jump's arrowhead
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
| `r` with an unlabelled break | `r` flow control −2, 1, `y` 53.37890625, 0 high |

**Core's listing.** Over every manifest fixture, the block, frame and card
records carry core's kind, address and holder (the holder's place key) in
core's order, displayed or hidden, the ancestor cards included under the
defaults (and with every frame and card hidden) and left out under
`HIDDEN_ANCESTOR_CARDS`, a hidden ancestor card having no record; each drawn band is recorded once per
card that core lists as drawing it, with core's address and holder,
except a timeline drawn twice (below), whose second set the card drawing it
holds. Core lists a block-held card for every virtual timeline in no group,
which the block draws only where `places` holds its ID (section 8.10), so
without places those cards have no record and the rest of the listing is
recorded in order; on `groups/virtual_member` with `allegro_by_hand` and
`allegro_single` placed (`{x: 0}` each) every card core lists is recorded,
the block-held ones `allegro`, `allegro_by_hand`, `allegro_single` in that
order (the ungrouped root, then the placed virtual timelines by ID). Every
card record takes its container from core's listing (a virtual card's
included), never one of its own.

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

A synthetic manifest has exactly 1,118 element keys, as core enumerates
them: one root with its named timestamps `origin` and `length` (a wedge and
a coordinate label each), 60 children with maps, regions, jump targets
(`repeat_start`), breaks (`fine`, labelled `stop`) and a jump (`repeat_end`,
its destination labelled `jump`), and a segment line of 40 segments; 114 of
them are the stacks' ID labels and the symbols of the flow control (26
breaks with an ID label and the symbol `Fine` each, the jump its ID label
and 𝄇, the 60 jump targets 𝄆 each: `26 × 2 + 2 + 60`); four are the
secondary coordinates of `origin` (at 0) on `child_0` (its reach 1)
and `nested_unknown` (its reach 0), a wedge and a coordinate label each
(`length` at 200 lies on no child, each ending at its reach, nor on the
segment line, 120 to 160). Every count comes from the inputs a
draw is given, never from watching the code: each rule counts reads
of its selector, the metrics table the code points asked, the manifest listings of
its keys. The rule with no element, class or address is tested
exactly `1,118 − 27 + 2 × 63 + 39 = 1,256` times: each key is resolved once
but the 27 ID labels of the breaks and the jump, which the initial
`label-display` `name label` leaves out of their stacks and so never resolves,
and each of the 63 lines (the root, its 60 children, the nested child and the
segment line, the keys of type `timeline` or `child`) resolves once each
the wedge and the cross-section line of a position no named timestamp
holds, and each of the 39 leaders of the region labels beyond their first
tier, which no key lists, once. The children have one band order, so the
root's children band is aligned and places each child by its line alone:
child `i` at `2i` with the reach 1 and an open end, drawn without the
default layer (stroke width 1), has the extent `[4i, 4i + 2 + 9.5] = [4i,
4i + 11.5]` (`x(t) = 2t`), so first fit puts child `i` in row `i mod 3 +
1`, 20 children a row, and the segment line `[240, 320]` in row 1 after
child 57 (`[228, 239.5]`). Each row is a row of one band order: its
regions bands place their 20 regions `[4i, 4i + 2]`, 12 apart, in one
regions row, and their labels `region` (28.6611328125 wide at 9, the
extent 30.6611328125) by one first fit into three label tiers, the labels
of the row cycling through tiers 1, 2, 3; 13 of each row's 20 lie beyond
tier 1, `3 × 13 = 39`; three whose address,
class or element no key has, 0 times; one per address the keys carry, the
block's `{}` included, as often as core lists keys there that are
resolved (an ID label's address 0 times). The metrics table is read 332
times, the code points of the twelve distinct texts as a multiset (the
symbols `𝄆`, `Fine` and `𝄇` among them; the children, which draw no flow
control band of their own, fill three rows of names, two of 20 `voice`, one
text measured once, 138 code points, and one of 20 `voice` and the segment
line's `segments`, 148; the other ten texts 46); the manifest's keys are
listed 0 times, so a draw copies nothing. No count is a timing.

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
