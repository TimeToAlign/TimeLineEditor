# `@timetoalign/tilie-writers` tests

`toDescriptors(drawing)`, `writeSvg(placed)` and `writeTikz(placed,
options)` implement sections 7 and 8.5 of TimeToShare's drawing
specification (`docs/drawing.md`, "the specification" below): the element
descriptors, the page, the number format and the SVG and TikZ profiles.
`placed` is a list of `{drawing, x, y, scale}`. Every expected text below is
derived here by hand from the specification; none is copied from output.
All comparisons are exact string or value equality.

A descriptor is one of seven shapes, told apart by its tag (`rect`,
`line`, `circle`, `polygon`, `polyline`, `path`, `text`), each with its
geometry as typed fields; its attributes, in the order they are written,
are derived from those fields and the element's style, and the TikZ
profile reads the typed fields. The points of a line's ends and chevrons
and of a region's brace come from the layout's geometry, the same the
layout measures its extents with; the writers compute none of their own.
Every descriptor names its **source**: the index of the element of
`Drawing.elements` it was written from, that element's type and address,
and its role, `shadow` for a card's shadow and `primary` for everything
else. The writers never serialise the source.

The writers serialise a drawing; they do not lay it out. So the unit tests
build each `Drawing` by hand, element by element, with the exact doubles
the specification gives. Only the fixture test, the review cases and the
checks on real chevrons and jumps draw manifests through the layout.

## Number format (`format.test.ts`)

`formatNumber` rounds the exact value of a double to the nearest multiple of
1/10000, ties to the even multiple. What proves it reads the double, not a
decimal spelling of it, is a double that lies a few 1e-15 off a decimal tie:

- exact ties (dyadic): `0.03125` (= 1/32, exactly 312.5 ten-thousandths) is
  `0.0312`, `0.09375` is `0.0938`, `-0.03125` is `-0.0312`;
- near ties: the double nearest `100.00495` lies 6.2e-15 below the tie, so
  it is `100.0049` (rounding the decimal half to even would give
  `100.005`); the double nearest `100.00705` lies 6.7e-15 above it, so it is
  `100.0071`; `-100.00495` is `-100.0049`; the double nearest `1.00005` lies
  1.1e-16 above, so it is `1.0001`;
- exact dyadic values: `41.5771484375` is `41.5771`, `14.40234375` is
  `14.4023`;
- `3` is `3`; `0.5` is `0.5`; `-0.00001` and `-0` are `0`; `1e21` is
  `1000000000000000000000` (no exponent);
- a non-finite value (NaN, infinity) is refused with a `RangeError`.

## Page (`page.test.ts`)

Two hand-built drawings: `bare` (`W = 476.5771484375`, `H = 67.37890625`,
below) and a block `W = 100.25`, `H = 50` with only its background.

- One drawing alone at `(0, 0)`, scale 1, has the page `W + 32` by `H + 32`,
  `508.5771484375` by `99.37890625`, and lies at `(16, 16)`.
- `bare` at `(10, 20)` scale 1 and the block at `(−30, 5)` scale 2: `left =
  −30`, `top = 5`, `right = max(10 + 476.5771484375, −30 + 100.25 × 2) =
  486.5771484375`, `bottom = max(20 + 67.37890625, 5 + 50 × 2) = 105`, so
  the page is `486.5771484375 + 30 + 32 = 548.5771484375` by `105 − 5 + 32 =
  132`; `bare` lies at `(56, 31)`, the block at `(16, 16)`. The SVG root
  carries `width="548.5771" height="132" viewBox="0 0 548.5771 132"`, and
  the groups are `<g transform="translate(56 31)">` and `<g
  transform="translate(16 16) scale(2)">`. The TikZ scopes are shifted to
  `(56, 132 − 31 − 67.37890625 = 33.62109375)`, written `33.6211`, and to
  `(16, 132 − 16 − 100 = 16)` with `,scale=2,transform shape`.
- The block alone at scale 1.5: the page `100.25 × 1.5 + 32 = 182.375` by `50 ×
  1.5 + 32 = 107`; `scale(1.5)` and `,scale=1.5,transform shape`, the scope
  at `(16, 107 − 16 − 75 = 16)`.
- An empty list is refused with a `RangeError`.

## `bare`, byte for byte (`bare.test.ts`)

The drawing of the manifest `bare` is built by hand from its derivation
(the layout's tests derive it): an anonymous block with one ungrouped root in
its card. `W = 476.5771484375`, `H = 67.37890625`; the background `fill
#F3F4F6`, `rx 10`, address `{}`; the card `{id: bare, part: [card]}` at `x
= y = 8`, `458.5771484375` by `49.37890625`, `fill #FFFFFF`, `stroke
#C4C9D1`, `stroke-width 0.75`, `rx 5`, `shadow #B8BEC8`; the line `{id:
bare}` from `x0 = 49.5771484375` to `Xe = 449.5771484375` at `y =
22.40234375`, `#00CC00`, width 3, a start circle and the arrowhead (tip `Xe
+ 3w = 458.5771484375`, base on `Xe` from `y − 4.5` to `y + 4.5`); the
wedges of its named timestamps `origin` `{id: timestamp_1}` and `length`
`{id: timestamp_2}` at `x0` and `Xe`, tip
`y + 1.5 = 23.90234375`, base `36.90234375`, at `x ∓ 3`, `#000000`; the name
`{id: bare, part: [name]}`, `Bare`, at `x = 16`, baseline `26.21044921875`,
size 11; their coordinate labels `{id: timestamp_1, part: [coordinate]}`
and `{id: timestamp_2, part: [coordinate]}`, `0 ♩` and `8 ♩`, at `x0` and
`Xe`, baseline
`47.25634765625`, size 9. Placed alone, the page is `508.5771484375 ×
99.37890625`. The SVG written is, byte for byte, the schema package's
hand-derived figure of `bare`: each element after the background carries
its address, `data-id="bare"` with the `data-part` `card` or `name`, none
for the line's three descriptors, and the timestamps' `data-id` with the
`data-part` `coordinate` on their labels.

In TikZ every ordinate becomes `H − y`: the line `44.9765625`, the
arrowhead's base corners `49.4765625` and `40.4765625`, the wedges' tips
`43.4765625` and bases `30.4765625`, the name `41.16845703125`, the labels
`20.12255859375`. A rect runs from `(x, H − y − h)` to `(x + w, H − y)`: the
background `(0,0) rectangle (476.5771,67.3789)`, the shadow `(10, 67.37890625
− 10 − 49.37890625 = 8)` to `(468.5771484375, 57.37890625)`, the card `(8,
10)` to `(466.5771484375, 59.37890625)`. `h(11) = 12.8046875`, `h(9) =
10.4765625`. The scope is shifted to `(16, 99.37890625 − 16 − 67.37890625 =
16)`. Colours used, sorted: `000000`, `00CC00`, `B8BEC8`, `C4C9D1`,
`F3F4F6`, `FFFFFF`. With `fontDirectory` `/fonts` the TikZ is exactly:

```
\documentclass{standalone}
\usepackage{fontspec}
\directlua{luaotfload.add_fallback("music", {"[/fonts/NotoMusic-Regular.ttf]:mode=node;"})}
\setsansfont{DejaVuSans.ttf}[Path=/fonts/,Kerning=Off,Ligatures={TeXOff,NoCommon},RawFeature={fallback=music}]
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}[x=1pt,y=1pt,miter limit=4,font=\sffamily]
\definecolor{ts000000}{HTML}{000000}
\definecolor{ts00CC00}{HTML}{00CC00}
\definecolor{tsB8BEC8}{HTML}{B8BEC8}
\definecolor{tsC4C9D1}{HTML}{C4C9D1}
\definecolor{tsF3F4F6}{HTML}{F3F4F6}
\definecolor{tsFFFFFF}{HTML}{FFFFFF}
\begin{scope}[shift={(16,16)}]
\path[rounded corners=10pt,fill=tsF3F4F6] (0,0) rectangle (476.5771,67.3789);
\path[rounded corners=5pt,fill=tsB8BEC8] (10,8) rectangle (468.5771,57.3789);
\path[rounded corners=5pt,fill=tsFFFFFF,draw=tsC4C9D1,line width=0.75pt] (8,10) rectangle (466.5771,59.3789);
\path[draw=ts00CC00,line width=3pt] (49.5771,44.9766) -- (449.5771,44.9766);
\path[fill=ts00CC00] (49.5771,44.9766) circle[radius=3];
\path[fill=ts00CC00] (458.5771,44.9766) -- (449.5771,49.4766) -- (449.5771,40.4766) -- cycle;
\path[fill=ts000000] (49.5771,43.4766) -- (46.5771,30.4766) -- (52.5771,30.4766) -- cycle;
\path[fill=ts000000] (449.5771,43.4766) -- (446.5771,30.4766) -- (452.5771,30.4766) -- cycle;
\node[anchor=base west,inner sep=0,font=\sffamily\fontsize{11}{12.8047}\selectfont,text=ts000000] at (16,41.1685) {Bare};
\node[anchor=base,inner sep=0,font=\sffamily\fontsize{9}{10.4766}\selectfont,text=ts000000] at (49.5771,20.1226) {0 ♩};
\node[anchor=base,inner sep=0,font=\sffamily\fontsize{9}{10.4766}\selectfont,text=ts000000] at (449.5771,20.1226) {8 ♩};
\end{scope}
\end{tikzpicture}
\end{document}
```

With `standalone: false` the output is the lines from `\begin{tikzpicture}`
to `\end{tikzpicture}` alone; the default font directory is `.`
(`[./NotoMusic-Regular.ttf]` and `Path=./`).

## The font directory (`tikz.test.ts`)

The standalone TikZ document writes the font directory verbatim twice: in a
Lua string inside `\directlua{…}` and in `fontspec`'s `Path=` key. TeX
reads both before any escaping could apply, so a character TeX or Lua
gives a meaning there (`~` an active space, `\` a control sequence, `"`
the end of the Lua string, `%` a comment, `#` a parameter, `{` and `}`
groups) would break the document or name another directory. The writer
therefore refuses such a directory rather than write a document that does
not compile: for each of the seven characters, the directory `/a<c>b`
throws an `Error` whose message is exactly `the font directory "/a<c>b"
holds '<c>', which a TikZ document cannot carry`, the directory written as
a JSON string (`"/a\\b"` for the backslash, `"/a\"b"` for the quote). It
is refused whether or not the document is standalone, since the option is
the same. Directories without them are written as given: `/fonts`, `.`
and `../fonts-2.37 (copy)` give `Path=/fonts/`, `Path=./` and
`Path=../fonts-2.37 (copy)/`.

## Descriptors and commands (`descriptors.test.ts`)

On synthetic drawings, `H = 30`. The attribute order of section 7.2 is
the address's attributes, the template's geometry, `rx`, `text-anchor`,
`font-size`, `fill`, `stroke`, `stroke-width`, `stroke-dasharray`,
`opacity`; every expected line below follows it, so each one also proves
the order. Below, an element's address is written `{id: g}`, `{id: m, part:
[card]}`.

**Address attributes.** An element's address `{id?, facet?, part?}` is
written as `data-id`, `data-facet` and `data-part`, in that order, each only
when the address has that member; `data-part` holds the part words joined by
one space. On a flow marker's line `x 10` from `y1 5` to `y2 25`, stroked
`#000000`: `{id: c}` writes `<line data-id="c" x1="10" …`, `{id: c, facet:
regions}` `<line data-id="c" data-facet="regions" x1="10" …`, `{id: c, part:
[start]}` `<line data-id="c" data-part="start" x1="10" …` and the title's
`{part: [name]}` `<line data-part="name" x1="10" …`; a wedge's label `{id: c,
part: [start, label]}` writes `data-id="c" data-part="start label"`. An ID is
written verbatim, escaped only as every attribute value is: `perf/take 2`
is `data-id="perf/take 2"`, `https://example.org/piece/score#exposition`
with the part `card` is `data-id="https://example.org/piece/score#exposition"
data-part="card"`. The background, whose address is the bundle's `{}`,
writes no address attribute, and its descriptor's source carries `{}`.

**The background, frames and cards.**

- The background follows its template and then `opacity`, without an
  address: with `opacity 0.5`, `<rect x="0" y="0" width="60" height="30"
  rx="0" fill="none" opacity="0.5"/>`, in TikZ `\path[rounded
  corners=0pt,opacity=0.5] (0,0) rectangle (60,30);` (`rx` maps one to one,
  0 included; `fill="none"` adds no option).
- A group's frame `{id: g}` at `x 8`, `y 4`, `width 40`, `height 20`, filled
  `#FFFFFF`, stroked `#D1D5DB` with width 1, `rx 6`: `<rect
  data-id="g" x="8" y="4" width="40" height="20" rx="6"
  fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1"/>`, and no shadow even
  when its style holds one; in TikZ the rectangle from `(x, H − y − h)` to
  `(x + w, H − y)`: `\path[rounded corners=6pt,fill=tsFFFFFF,draw=tsD1D5DB,line
  width=1pt] (8,6) rectangle (48,26);`.
- A card `{id: m, part: [card]}` at the same place, filled `#FFFFFF`, stroked `#C4C9D1`
  with width 0.75, `rx 5`, `shadow #B8BEC8`: first its shadow, 2 to the
  right and 2 down, with the card's size, `rx` and `fill` alone, `<rect
  data-id="m" data-part="card" x="10" y="6" width="40" height="20" rx="5"
  fill="#B8BEC8"/>`, then the card, `<rect data-id="m" data-part="card" x="8"
  y="4" width="40" height="20" rx="5" fill="#FFFFFF" stroke="#C4C9D1"
  stroke-width="0.75"/>`; in TikZ `\path[rounded corners=5pt,fill=tsB8BEC8]
  (10,4) rectangle (50,24);` and `\path[rounded
  corners=5pt,fill=tsFFFFFF,draw=tsC4C9D1,line width=0.75pt] (8,6)
  rectangle (48,26);`. With `shadow none` the card is the second rect
  alone. With `opacity 0.5` and dash `2 1` the card ends with
  `stroke-dasharray="2 1" opacity="0.5"` and the shadow with
  `fill="#B8BEC8" opacity="0.5"`: the shadow carries no stroke attribute,
  and `opacity` is written on every descriptor whose element's opacity is
  not 1.

**Line ends** (`timeline`, `child` and `ancestor` alike), `xs 10`, `xe 50`,
`y 20`, width 2, stroke and fill `#00CC00`, dash `3 3`, address `{id: c}`. The
`<line>` comes first, `<line data-id="c" x1="10" y1="20" x2="{stop}"
y2="20" stroke="#00CC00" stroke-width="2" stroke-dasharray="3 3"/>`, then
the start circle `<circle data-id="c" cx="10" cy="20" r="2"
fill="#00CC00"/>`, then the end of section 6.6:

- `arrowhead`: stop 50, then the filled `<polygon data-id="c"
  points="56,20 50,17 50,23" fill="#00CC00"/>` (tip `50 + 3 × 2`, base on
  50 at `20 ∓ 1.5 × 2`);
- `open`: stop 50, the same points with `fill="none" stroke="#00CC00"
  stroke-width="1"`, no dash although the line is dashed;
- `circle`: stop 50, then `<circle data-id="c" cx="50" cy="20" r="2"
  fill="#00CC00"/>`;
- `diamond`: stop `50 − 1.5 × 2 = 47`, then `<polygon data-id="c"
  points="47,20 50,17.6 53,20 50,22.4" fill="none" stroke="#00CC00"
  stroke-width="1"/>` (`1.2w = 2.4`);
- `unknown`, the open end of a timeline of unknown length, `xe` being `Xr`,
  the point the line runs on to: stop 50, then three chevrons, `<polyline
  data-id="c" points="52,17 55,20 52,23" fill="none" stroke="#00CC00"
  stroke-width="1"/>` (`Xr + w` to `Xr + 2.5w`), then through `55,17 58,20
  55,23` and `58,17 61,20 58,23`: stroked at `w / 2`, no dash, with the
  line's own address, so they hit the line;
- `chevrons`, a line running on (section 8.3): stop 50, then only the
  first two of those three: the two ends differ in the outer chevron alone.

**Cross-section lines** (section 7.2) are lines from `(X, y1)` to `(X, y2)`
as the layout states them, in that order, whichever is the smaller: `{id:
s, part: [line]}` at `x 10` from `y1 25` up to `y2 5`, stroked `#1BA1E2`
with width 1 and dash `3 3`, is `<line data-id="s" data-part="line" x1="10"
y1="25" x2="10" y2="5" stroke="#1BA1E2" stroke-width="1"
stroke-dasharray="3 3"/>`, in TikZ `\path[draw=ts1BA1E2,line
width=1pt,dash pattern=on 3pt off 3pt] (10,5) -- (10,25);` (`30 − 25` and
`30 − 5`). An **alignment anchor's line** (section 8.7) runs from its first
point to its second as the layout states them: `{id: anchor_1}` from `(30,
5)` to `(10, 25)`, stroked alike, is `<line data-id="anchor_1" x1="30"
y1="5" x2="10" y2="25" stroke="#1BA1E2" stroke-width="1"
stroke-dasharray="3 3"/>`, in TikZ `… (30,25) -- (10,5);`. A wedge's points are the layout's (tip, then the base's two
corners in the order section 6.6 gives them), the same an editor's unnamed
wedge is drawn with.

An ancestor line `{id: a}` running on at both sides, `xs = Xa = 20`, `xe = Xr =
40`, `y 20`, width 2, dash `3 3`, opacity 0.35: the line `x1="20" …
x2="40"` with its dash and `opacity="0.35"`; then the left chevrons, inner
first, `18,17 15,20 18,23` (`Xa − w`, `Xa − 2.5w`) and `15,17 12,20 15,23`;
then the right ones, inner first, `42,17 45,20 42,23` and `45,17 48,20
45,23`. Each is `<polyline data-id="a" points="…" fill="none"
stroke="#00CC00" stroke-width="1" opacity="0.35"/>`: width `w / 2`, no
dash, the line's opacity. In TikZ the line is
`\path[draw=ts00CC00,line width=2pt,dash pattern=on 3pt off
3pt,opacity=0.35] (20,10) -- (40,10);` and the inner left chevron
`\path[draw=ts00CC00,line width=1pt,opacity=0.35] (18,13) -- (15,10) --
(18,7);`, open, without `cycle`.

**Chevrons in real drawings** (`w = 3`). On the layout's own output, every
point is `Xr` (or `Xa`) plus its multiple of `w`:

- `unknown_length`: the open root `score` (`Xr = 465.798828125`, `y = 37`)
  writes exactly three polylines with its address, inner, middle, outer:
  `(468.798828125, 32.5) (473.298828125, 37) (468.798828125, 41.5)`, then
  `(473.298828125, 32.5) (477.798828125, 37) (473.298828125, 41.5)`, then
  `(477.798828125, 32.5) (482.298828125, 37) (477.798828125, 41.5)`, the
  outer tip `Xr + 5.5w`; in TikZ, three open three-point paths.
- `groups/group_grandchild`: the ancestor `score` runs on at both sides
  (`Xa = 99.70361328125`, `Xr = 523.70361328125`, `y = 67.78125`) and
  writes exactly four polylines, two on each side: left `(96.70361328125,
  63.28125) (92.20361328125, 67.78125) (96.70361328125, 72.28125)` and
  `(92.20361328125, 63.28125) (87.70361328125, 67.78125) (92.20361328125,
  72.28125)`; right `(526.70361328125, 63.28125) (531.20361328125,
  67.78125) (526.70361328125, 72.28125)` and `(531.20361328125, 63.28125)
  (535.70361328125, 67.78125) (531.20361328125, 72.28125)`, the outer tip
  `Xr + 4w`, never `Xr + 5.5w`.

**Other elements.**

- A brace `{id: region_1}` from `x1 = 0` to `x2 = 20`, arms at 10, tip at 16,
  `xm = 10`, has `ym = 13`, `k = 3` and the path `M0 10Q0 13 3 13L7 13Q10
  13 10 16Q10 13 13 13L17 13Q20 13 20 10` with `fill="none"` and the stroke
  attributes. In TikZ each `Q C P` from `P0` becomes the cubic with
  controls `P0 + 2/3 × (C − P0)` and `P + 2/3 × (C − P)`: `(0,20) ..
  controls (0,18) and (1,17) .. (3,17) -- (7,17) .. controls (9,17) and
  (10,16) .. (10,14) .. controls (10,16) and (11,17) .. (13,17) -- (17,17)
  .. controls (19,17) and (20,18) .. (20,20)`.
- A jump with `P0 = (10, 20)`, `C1 = (20, 40)`, `C2 = (40, 40)`, tip `P3 =
  (50, 20)`, base centre `Bh = (48, 24)` and corners `(46, 23)`, `(50, 25)`:
  the shaft `M10 20C20 40 40 40 48 24` (its last point the base centre, not
  the tip) and the filled arrowhead `50,20 46,23 50,25` (tip first, then the
  corners in order); in TikZ the shaft is `(10,10) .. controls (20,-10) and
  (40,-10) .. (48,6)`.
- For every jump of `flow_control` and `corpus_score_ms3`, drawn by the
  layout at the default placement with the default layer and their own,
  one shaft per jump origin (`jump_from`) their roots hold: the shaft's end tangent continues
  the head's axis and the base is perpendicular to it, at the written
  precision. The unit vector from `C2` to the path's last point and the one
  from that point to the tip are written alike by the number rule, the
  path's last point is the midpoint of the two corners, and the dot product
  of the base with the axis is written `0`.
- A map with `xs 10`, `xe 50`, `yc 20`, stroke `#00CC00`, dash `1 1`, is one
  closed outline at `yc ∓ d / 2 = 19, 21`: `<polygon data-id="m"
  points="10,19 50,19 50,21 10,21" fill="none" stroke="#00CC00"
  stroke-width="1" stroke-dasharray="1 1"/>`; in TikZ
  `\path[draw=ts00CC00,line width=1pt,dash pattern=on 1pt off 1pt] (10,11)
  -- (50,11) -- (50,9) -- (10,9) -- cycle;`. Both start at `(Xs, yc − d /
  2)` and run the corners in the same order, so the dash pattern starts at
  the same corner.
- A segment's boundary `{id: b, part: [start]}`, `x 10` from `y1 12` to `y2 18`, stroked
  `#000000` with width 1, is a line like a flow marker's: `<line
  data-id="b" data-part="start" x1="10" y1="12" x2="10" y2="18" stroke="#000000"
  stroke-width="1"/>`, in TikZ `\path[draw=ts000000,line width=1pt] (10,18)
  -- (10,12);`.
- A wedge `x 10`, tip `yt 5`, its corners `(dx −3, y 18)` and `(dx 3, y
  18)`, fill `#000000`: `<polygon data-id="w" points="10,5 7,18 13,18"
  fill="#000000"/>`, fill only; turned 90 about its tip, its corners `(13,
  8)` and `(13, 2)`, it is `points="10,5 23,8 23,2"`, in TikZ `(10,25) --
  (23,22) -- (23,28) -- cycle` (`30 − y`): the tip, then the corners in
  their order, never a `transform`.
- The sizes an element carries are its own, never constants of the writer:
  a wedge's corners' offsets across, a map's double-line `spacing` and a
  card's `shadowOffset`, ±3, 2 and 2 at scale 1 and multiplied by an item's
  scale (section 8.6). The wedge with offsets ±6 is `points="10,5 4,18 16,18"`; the
  map with `spacing 4` is `points="10,18 50,18 50,22 10,22"`; the card with
  `shadowOffset 4` has its shadow at `x="12" y="8"`.
- On a flow marker's line, opacity 0.5 is written last, as `opacity="0.5"` and
  `opacity=0.5`. Stroke-dasharray `2` is `dash pattern=on 2pt off 2pt` and
  `1 2 3` is `dash pattern=on 1pt off 2pt on 3pt off 1pt on 2pt off 3pt`;
  each dash number is formatted by the number rule: `1.50 0.00001` is
  written `stroke-dasharray="1.5 0"` and `dash pattern=on 1.5pt off 0pt`.
- `stroke="none"` adds no TikZ paint option: a flow marker's line `x 10`, `y1 5`,
  `y2 25` stroked `none` is `<line … stroke="none" stroke-width="1"/>` and
  `\path[line width=1pt] (10,25) -- (10,5);`.
- Escaping: SVG writes the text `a&b<c>` as `a&amp;b&lt;c&gt;`, and an
  attribute value escapes `&`, `<`, `>` and `"` (the ID `r/&<>",` is
  `data-id="r/&amp;&lt;&gt;&quot;,"`); TikZ writes `\~^#$%&_{}`
  as `\textbackslash{}\textasciitilde{}\textasciicircum{}\#\$\%\&\_\{\}`,
  and a space at the start or end or following another space as `\ ` (` a
  b ` is `\ a \ b\ `). A text descriptor is `<text …>{text}</text>`; every
  descriptor without text is self-closing.

**Every kind together, and the review cases.** A hand-built drawing holds
every kind of element: a frame and its title, a card with its shadow, an
ancestor line running on at both sides, lines ending in the diamond, the
open arrowhead, the end circle and the arrowhead, a map, a region, a jump origin,
a flow marker, a boundary, a cross-section line, a wedge and labels; the
frame's title holds the TeX specials, `♩`, which DejaVu Sans draws, and the
whole note `𝅝` (U+1D15D), which only Noto Music draws. It writes 31 descriptors, in which
every tag occurs, one of them a shadow. For it and for every review case
(drawn by the layout):

- **sources**: the descriptors' element indices never decrease, every
  element writes at least one descriptor, each names its element's type
  and address, and the role is `shadow` for the first of a card's
  descriptors when its style has a shadow and `primary` otherwise;
- **one command per descriptor**: `writeSvg` writes exactly one line per
  descriptor between `<g …>` and `</g>`, in order, equal to `descriptorSvg`
  of it, each starting with `<{tag} ` followed by the address attributes of
  its source's address, `data-id`, `data-facet` and `data-part` as present,
  in that order, and no other `data-` attribute (none for the background); `writeTikz` writes exactly one command per descriptor
  inside the scope, in the same order, of the kind its tag selects (two
  points joined by `rectangle` for a rect, by `--` for a line,
  `circle[radius=` for a circle, `-- cycle;` for a polygon, three points
  joined by `--` and no `cycle` for a polyline, `.. controls` for a path,
  `\node` for a text).

## Drawing fixtures (`fixtures.test.ts`)

The drawing fixtures of the schema package (`fixtures/<version>/drawings/`,
read from the installed `@timetoalign/timetoshare`, like the manifests and
the two fonts) are the contract between implementations of the specification.
Each directory holds `inputs.json` (the manifest's path below
`fixtures/<version>/`, the placement, the scale and the application's style
layers) and the expected `figure.svg` and `figure.tex`. For every directory
the test reads `inputs.json` alone, loads the named manifest, draws it with
the layers `[DEFAULT_LAYER, ...inputs.layers, manifestLayer(manifest)]` (no
layer lies above the manifest's own) and the schema package's font metrics,
writes the drawing placed at `(0, 0)` with the scale (`writeTikz` with its
default font directory), and requires both texts to equal the files byte
for byte. This is the oracle for every change meant to change no drawing.

The hand-derived figures among them are derived from the specification
alone, never from this writer's output: their equality with the writer
proves the specification complete for what they show. Every other figure is
emitted from the writer by `pnpm emit-drawings` and pins the implementation
against regression. With a local `link:` dependency the tests read the
fixtures the checkout's `js/` build copied, so rebuild there after
emitting.

The fixtures and the review cases cannot drift apart: the set of fixture
directories equals the set of review case names exactly, and each case's
inputs, written with TimeToShare's `dumps`, equal its `inputs.json` text.
The review cases are every manifest fixture, `groups/` (as
`group__<file>`) and `bundles/` (as `bundle__<file>`) included, but the
`corpus_*` ones and the minimal twins; `nested` at other lengths, card
spacings (its card's gap between rows and bands, 0 and 8), block sizes and
scales; the bundles with places, a scale, card sizes, a block spacing with a
card spacing, a frame's spacing (the gap between its member cards) and a
member's card spacing (their member cards' places under their group's
entry's `cards`, `{group_1: {scale: 1.25, cards: {performance: {width: 650,
height: 120}}}}` and `{group_1: {cards: {score: {spacing: 8}}}}`, as
drawing.md §8.6 nests them); and drawings with one application layer
showing a band the defaults hide, each selecting the band by `{addresses:
[{id: T, facet: F}]}` or `{element: band, facet: F}`.
`bundle__bundle_shared_member` draws a timeline that two groups have as a
member, once in each frame: the four member cards are written, shadow and
card, with `data-id` `t`, `u`, `t`, `v` and `data-part="card"`, both cards
of `t` alike, and the elements written after each card of `t` up to the
next card carry the same address attributes in both, `t`'s line (`data-id`
`t` alone) among them. `bundle__bundle_free_ids` draws IDs with a `/`, a
space and a URI's `#` (`perf/take 2`, `take 2/intro`,
`https://example.org/piece/score#exposition`), written verbatim.
`timestamp_wedge_rotation` draws wedges turned −135, −45, 0, 45, 135, 180
below their line and −45, 45, 90 above it (the layout's README derives
their corners); the three groupstamp figures (`group__group_groupstamp`,
`group__group_groupstamp_child_member`,
`bundle__bundle_groupstamp_shared_member`) draw the groupstamp's wedge
turned −45 by default, `group__group_groupstamp`'s `timestamp_1` as
`points="302.2915,48.8047 290.9779,55.8757 295.2205,60.1183"`: offsets
`13 × −0.7071 ∓ 3 × 0.7071 = −11.3136, −7.071` and distances `1.5 + 7.071`
and `1.5 + 11.3136` below the line at 47.3047, to four decimals. Among the
hand-derived figures, `map_row_siblings`, `map_row_subslots` and
`map_row_moved` pin the slots that the conversion maps bands of one row
share (two siblings with maps of two keys in different canonical orders, a
segment line's own map and its segments' maps of one key, a sibling moved
to another row), `label_float_rounding` the rounded label of a float
end, and `bundle__bundle_matchstamp_cards` the alignment anchors of
drawing.md §8.7 across cards and within one card: a score shared by two
groups is drawn in two frames, so the anchor between the performance and
the score takes the shorter of its two candidate lines, and the anchor
between the score and its child overlaps, its line horizontal, the tie
between the two cards' pairs going to the first in descriptor order. Every root of a non-corpus fixture carries the named timestamps
`origin` and `length` (`origin` alone for an unknown length), each drawing
its wedge and its coordinate label where the root's start and end were
marked before: their figures keep every number and address the wedges
`{id: timestamp_N}` and the labels `{id: timestamp_N, part: [coordinate]}`.
`timestamps` draws named timestamps of every `display`, its geometry
derived in the layout's README and in TimeToShare's drawings README: `x0 =
49.91552734375`, the root's line at 77.9296875, `clt_2`'s at 23, `H =
122.90625`. So, in block coordinates and to four decimals,
`timestamp_1`'s wedge is `<polygon data-id="timestamp_1"
points="124.9155,79.4297 121.9155,92.4297 127.9155,92.4297"
fill="#000000"/>`, its name label `<text data-id="timestamp_1"
data-part="name" x="124.9155" y="102.7837" text-anchor="middle"
font-size="9" fill="#000000">Downbeat</text>`, the stack of `timestamp_3`
its labels `data-part="name"` (`Entry`, `y="47.854"`), `data-part="id"`
(`timestamp_3`, `y="58.3306"`) and `data-part="coordinate"` (`1 ♩`,
`y="68.8071"`), the last labels written, and the drawing ends with the one
cross-section line, `<line data-id="timestamp_1" data-part="line"
x1="124.9155" y1="16" x2="124.9155" y2="77.9297" stroke="#1BA1E2"
stroke-width="1" stroke-dasharray="3 3"/>`, in TikZ `(124.9155,106.9062) --
(124.9155,44.9766)` (`122.90625 − y`, 106.90625 a tie to the even
106.9062). `timestamp_2` lists no cross-section line and `timestamp_3`'s
timeline has no band for one to cross. `bundle__bundle_matchstamps` draws
named MatchStamps as stored (drawing.md §8.7, its numbers derived in the
layout's README): the drawing ends with the lines of its two alignment
anchors and the one label, `<line data-id="anchor_1" x1="261.0928"
y1="43.207" x2="161.0928" y2="100.5859" stroke="#1BA1E2" stroke-width="1"
stroke-dasharray="3 3"/>`, `<line data-id="anchor_2" x1="261.0928"
y1="43.207" x2="161.0928" y2="157.9648" …/>` and `<text data-id="anchor_1"
data-part="name" x="211.0928" y="75.0122" text-anchor="middle"
font-size="9" fill="#000000">Bar 2, downbeat (take 1)</text>`, in TikZ
`\path[draw=ts1BA1E2,line width=1pt,dash pattern=on 3pt off 3pt]
(261.0928,159.7344) -- (161.0928,102.3555);` (`H = 202.94140625`).
There are 84 cases (among them the drawings of a groupstamp's line across its group: `group__group_groupstamp` on a member, `group__group_groupstamp_child_member` on a member's child, `bundle__bundle_groupstamp_shared_member` on a member of two groups, one line in each frame; and `timestamp_wedge_rotation`, wedges turned on both sides of a line). Every case stating a spacing, of the block, in a place or in a
member's card place, draws an SVG different from its manifest's default
case: a spacing case that draws as the default (a block of one item has no
gap) pins nothing.

## Validity (`compile.test.ts`)

Every drawing fixture's `figure.svg`, and the SVG of the every-kind drawing,
parses as XML with an SVG root (Python's ElementTree). Every `figure.tex`,
and the TikZ of the every-kind drawing, compiled in a directory holding a
copy of both of the schema package's font files, `fonts/DejaVuSans.ttf` and
`fonts/NotoMusic-Regular.ttf` (the documents find both in the directory
`.`), compiles under LuaLaTeX with exit status 0, and its log holds no
fontspec warning and no `Missing character` line: every text, `♩` and the
escaped TeX specials included, is set in the sans font, since each node's
`font` option restates `\sffamily`, and every command kind is valid TikZ.
The whole note `𝅝`, which DejaVu Sans does not map, is the proof that the
Noto Music fallback is in force: without it LuaLaTeX logs `Missing
character: There is no 𝅝 (U+1D15D) in font [./DejaVuSans.ttf]…`.
The test is skipped where `lualatex` is absent and fails without it when
`TILIE_REQUIRE_LUALATEX` is set.
