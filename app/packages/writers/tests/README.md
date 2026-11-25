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
one space. On a break's line `x 10` from `y1 5` to `y2 25`, stroked
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
  not 1. An ancestor card (`ancestor_card`, section 8.8) at the same place
  with the same style is written exactly as the card: the same two rects in
  SVG and the same two paths in TikZ, its source's type `ancestor_card`.

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
  first two of those three: the two ends differ in the outer chevron alone;
- `none` at either end, a line cut at a gap's edge (section 6.6,
  Elisions): no mark there, the stop at `xe` itself; with both ends `none`
  the `<line>` stopping at 50 is written alone.

**Gaps and ellipses** (section 7.2, elision and ellipsis). An elision `{id:
e}` from `x1 10` to `x2 40` and from `yt 4` to `yb 26`, stroked `#9CA3AF`
with width 1 and dash `2 2` (the defaults' style), writes its rectangle
only where its `fill` is not `none`: unfilled and without continuations it
writes nothing; unfilled with continuations at 12 and 20 it writes them
alone, `<line data-id="e" x1="10" y1="12" x2="40" y2="12" stroke="#9CA3AF"
stroke-width="1" stroke-dasharray="2 2"/>` and `… y1="20" … y2="20" …/>`;
filled `#F2F2F2` it writes first its rectangle with its `fill` alone and no
`rx`, `<rect data-id="e" x="10" y="4" width="30" height="22"
fill="#F2F2F2"/>` (width `x2 − x1`, height `yb − yt`), then those lines;
in TikZ `\path[fill=tsF2F2F2] (10,4) rectangle (40,26);`, then `…
(10,18) -- (40,18);` and `… (10,10) -- (40,10);` with
`draw=ts9CA3AF,line width=1pt,dash pattern=on 2pt off 2pt`. A derived
elision `{id: score, part: [elision]}` writes `data-id="score"
data-part="elision"`. An ellipsis `{id: e, part: [ellipsis]}` at `x 25`,
`y 12`, radius 2 and spacing 6 writes three filled circles, `<circle
data-id="e" data-part="ellipsis" cx="19" cy="12" r="2" fill="#000000"/>`,
then `cx="25"`, then `cx="31"`, in TikZ `\path[fill=ts000000] (19,18)
circle[radius=2];` and the other two.

**Rows crossing gaps** (section 6.6, Elisions). A line crossing gaps is
written in pieces from run to run, each a `<line>` from where one run
starts to where the next gap starts, a piece without length left out, then
its marks: a child `{id: c}` from 10 to 50 at 20, start `circle`, end
`none`, cut at `[10, 14]` and `[20, 30]`, writes `<line … x1="14" y1="20"
x2="20" y2="20" …/>`, `<line … x1="30" y1="20" x2="50" y2="20" …/>` (the
piece 10–10 is left out) and its start circle at 10. A map from 10 to 50
centred at 20, spacing 4, cut at `[20, 30]`, writes two closed outlines,
`points="10,18 20,18 20,22 10,22"` and `points="30,18 50,18 50,22 30,22"`.

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
stroke-dasharray="3 3"/>`, in TikZ `… (30,25) -- (10,5);`. A **leader** (section 6.6, Leaders) is a
line from the element's end `(X, y1)` to the label's `(X, y2)` as the
layout states them, at the address `{id: X, part: [leader]}`: `{id:
region_2, part: [leader]}` at `x 40` from `y1 10` to `y2 22`, stroked
`#9CA3AF` with width 0.5 and no dash (the defaults), is `<line
data-id="region_2" data-part="leader" x1="40" y1="10" x2="40" y2="22"
stroke="#9CA3AF" stroke-width="0.5"/>`, in TikZ `\path[draw=ts9CA3AF,line
width=0.5pt] (40,20) -- (40,8);` (`30 − 10` and `30 − 22`). A **symbol** (section 6.4, Symbols) is a
text centred on its element's x: `{id: jump_2, part: [symbol]}`, 𝄇
(U+1D107) at `x 30`, baseline 20, font size 12, fill `#000000`, is `<text
data-id="jump_2" data-part="symbol" x="30" y="20" text-anchor="middle"
font-size="12" fill="#000000">𝄇</text>`, in TikZ `\node[anchor=base,inner
sep=0,font=\sffamily\fontsize{12}{13.9688}\selectfont,text=ts000000] at
(30,10) {𝄇};` (`h(12) = 13.96875` written to four places). A **volta
fork** (section 6.4, Forks; section 7.2) is its stem, a line from its
stem's start to its branch point, then branch by branch its shaft, a line
from the branch point to the centre of its arrowhead's base, and its
arrowhead, a polygon of its tip and its two corners, filled and not
stroked; then its texts, start-anchored, in the order of the branches, a
branch without a text writing none: `{id: jump_1, part: [fork]}` with the
stem from `(4, 10)` to the branch point `(10, 10)`, branch 1's base `(16,
10)`, tip `(20, 10)`, corners `(16, 8)` and `(16, 12)`, text `1.` from `tx
22` on baseline 14, branch 2's base `(15, 13)`, tip `(18, 15)`, corners
`(14, 14)` and `(16, 12)`, no text, stroke and fill `#000000`, width 1,
size 9, is `<line data-id="jump_1" data-part="fork" x1="4" y1="10"
x2="10" y2="10" stroke="#000000" stroke-width="1"/>`, `<line
data-id="jump_1" data-part="fork" x1="10" y1="10" x2="16" y2="10" …/>`,
`<polygon data-id="jump_1" data-part="fork" points="20,10 16,8 16,12"
fill="#000000"/>`, `<line … x1="10" y1="10" x2="15" y2="13" …/>`,
`<polygon … points="18,15 14,14 16,12" fill="#000000"/>` and `<text
data-id="jump_1" data-part="fork" x="22" y="14" text-anchor="start"
font-size="9" fill="#000000">1.</text>`, six descriptors; in TikZ
`\path[draw=ts000000,line width=1pt] (4,20) -- (10,20);`, the shafts alike,
the arrowheads `\path[fill=ts000000] (20,20) -- (16,22) -- (16,18) --
cycle;` and the text `\node[anchor=base west,…] at (22,16) {1.};`. A wedge's points are the layout's (tip, then the base's two
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
- `groups/group_grandchild`, drawn under the layer `{element:
  ancestor_card}` `display: none` (`support.ts` `HIDDEN_ANCESTOR_CARDS`),
  since the subject is the ancestor line on the member's card and the
  ancestor card the defaults show (section 8.8) would move the frame right:
  the ancestor `score` runs on at both sides
  (`Xa = 99.70361328125`, `Xr = 523.70361328125`, `y = 99.18359375`, the
  second ancestor row below the member, as the layout's README derives) and
  writes exactly four polylines, two on each side, each from `y − 1.5w` to
  `y + 1.5w`: left `(96.70361328125, 94.68359375) (92.20361328125,
  99.18359375) (96.70361328125, 103.68359375)` and `(92.20361328125,
  94.68359375) (87.70361328125, 99.18359375) (92.20361328125,
  103.68359375)`; right `(526.70361328125, 94.68359375) (531.20361328125,
  99.18359375) (526.70361328125, 103.68359375)` and `(531.20361328125,
  94.68359375) (535.70361328125, 99.18359375) (531.20361328125,
  103.68359375)`, the outer tip
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
- The same brace widened, `x1 = 0`, `x2 = 40`, `xm = 20`, arms at 10, tip at
  16, cut at the gaps `[0, 5]`, `[8, 10]`, `[10, 12]`, `[15, 20]` and
  `[25, 30]` (section 6.6, Elisions; section 7.2): its straight parts run
  from 3 to 17 and from 23 to 37. Clipped to them the cuts are `[3, 5]`
  (from the part's start), `[8, 12]` (two touching cuts are one), `[15, 17]`
  (to the part's end) and `[25, 30]`, so the path is `M0 10Q0 13 3 13M5
  13L8 13M12 13L15 13M17 13Q20 13 20 16Q20 13 23 13L25 13M30 13L37 13Q40
  13 40 10`: every `L` to the point the pen stands at (3 and 17) left out,
  no mark at a cut, arms and tip whole. In TikZ each `M` after the first is
  a bare move `(P)`: `(0,20) .. controls (0,18) and (1,17) .. (3,17)
  (5,17) -- (8,17) (12,17) -- (15,17) (17,17) .. controls (19,17) and
  (20,16) .. (20,14) .. controls (20,16) and (21,17) .. (23,17) -- (25,17)
  (30,17) -- (37,17) .. controls (39,17) and (40,18) .. (40,20)`.
- A jump with `P0 = (10, 20)`, `C1 = (20, 40)`, `C2 = (40, 40)`, tip `P3 =
  (50, 20)`, base centre `Bh = (48, 24)` and corners `(46, 23)`, `(50, 25)`:
  the shaft `M10 20C20 40 40 40 48 24` (its last point the base centre, not
  the tip) and the filled arrowhead `50,20 46,23 50,25` (tip first, then the
  corners in order); in TikZ the shaft is `(10,10) .. controls (20,-10) and
  (40,-10) .. (48,6)`.
- For every jump of `flow_control` and `corpus_score_ms3`, drawn by the
  layout at the default placement with the default layer, the rule
  `{element: jump}` `display: inline` (the defaults hide the arcs) and
  their own,
  one shaft per destination of a jump (`jump`) their roots hold, but for a
  destination going on (`by` 0) and a destination whose `manifestation`
  is `volta`, a branch of its jump's fork, neither of which draws an arc
  (9 in `corpus_score_ms3`, whose two volta jumps hold five volta
  destinations): the shaft's end
  tangent continues
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
  `#000000` with width 1, is a line like a break's: `<line
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
- On a break's line, opacity 0.5 is written last, as `opacity="0.5"` and
  `opacity=0.5`. Stroke-dasharray `2` is `dash pattern=on 2pt off 2pt` and
  `1 2 3` is `dash pattern=on 1pt off 2pt on 3pt off 1pt on 2pt off 3pt`;
  each dash number is formatted by the number rule: `1.50 0.00001` is
  written `stroke-dasharray="1.5 0"` and `dash pattern=on 1.5pt off 0pt`.
- `stroke="none"` adds no TikZ paint option: a break's line `x 10`, `y1 5`,
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
open arrowhead, the end circle and the arrowhead, a map, a region, a jump's arc,
a break, a boundary, a cross-section line, a wedge, a filled gap
with a continuation and its ellipsis, and labels; the
frame's title holds the TeX specials, `♩`, which DejaVu Sans draws, and the
whole note `𝅝` (U+1D15D), which only Noto Music draws. It writes 36 descriptors, in which
every tag occurs, one of them a shadow. For it and for every review case
(drawn by the layout):

- **sources**: the descriptors' element indices never decrease, every
  element writes at least one descriptor but an unfilled gap without
  continuations, which writes none, each names its element's type
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
drawing.md §8.6 nests them); drawings with one application layer
showing a band the defaults hide, each selecting the band by `{addresses:
[{id: T, facet: F}]}` or `{element: band, facet: F}`; and
`group_parent_both`, `group_parent_right` and `group_parents_mixed` with
the layer `{element: ancestor_card}` `display: none`, which hides the
ancestor cards the defaults show (`group__<file>__ancestor-cards-hidden`;
each equals the drawing of its manifest without ancestor cards, and the
layout's README derives the cards' geometry in the drawings without the
layer); `group_elided_inside`, `group_grandchild`,
`group_grandchild_parent_on_top` and `group_parents_mixed` with the layer
`{element: elision}` `display: none`, which draws every ancestor card whole
(`group__<file>__full`; the last three equal, byte for byte, their
manifests' drawings before ancestor cards drew gaps); and
`bundle_elided_layerit` drawn for the view `{width: 1024, height: 640}`
(`bundle__bundle_elided_layerit__view-1024x640`, the one case whose
`inputs.json` states a `view`: a case states the placement's `view` only
where it sets one, so every other `inputs.json` is unchanged);
`group_elided_inside` with the layer `{addresses: [{id: piece, part:
[card]}]}` `elision-display: "ellipsis name coordinate"`
(`group__group_elided_inside__labels`, the derived elisions' name and
coordinate labels shown) and with `elision-mode: custom`
(`group__group_elided_inside__custom`, the card drawn whole while no card
elision is stored); `group_elided_members` with `{addresses: [{id:
group_1}]}` `elision-mode: full` (`group__group_elided_members__full`,
the frame without its group elisions); and `bundle_groupstamp_shared_member`
with `places.g2.scale` 1.5 (`bundle__bundle_groupstamp_shared_member__scaled`);
and five arranged bundles, each `inputs.json` stating the placement's
`arrangement` (only these do): `bundle_arranged_roots` with `{direction:
vertical, order: [page, group_3, group_1, group_2]}`
(`bundle__bundle_arranged_roots__vertical`, the items one under another in
that order, each ancestor card behind its frame), the same order
`horizontal` (`bundle__bundle_arranged_roots__horizontal`, hand-derived:
the worked example of drawing.md §8.8, Drawn once), and `{direction:
horizontal, order: []}` for `bundle_elided_layerit` (the suite drawn once
behind four frames of four scales, its gaps between them),
`bundle_shared_parent` (a root member in a group, an ungrouped root at the
row's end) and `bundle_arranged_conflict` (Theme A and Theme B overlap on
the score, so the row is refused and the block drawn one under another in
the item order, which the empty order leaves the drawing order: its SVG
equals `bundle__bundle_arranged_conflict`'s byte for byte).
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
unturned, as every primary coordinate's (drawing.md §2.5),
`group__group_groupstamp`'s `timestamp_1` as `points="302.2915,48.8047
299.2915,61.8047 305.2915,61.8047"`: corners `∓ 3` across and `1.5` and
`1.5 + 13` below the line at 47.3047, to four decimals. Among the
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
between the two cards' pairs going to the first in descriptor order;
`map_band_order_subset` the completion of a band order that lists two of
its six entries (`["markers", "line"]` on the root: its markers band
against the line above, its map and its child beyond); and
`group__group_child_member_stamps` the lines on a child member: the
cross-section lines of a named timestamp and of a match timestamp on
`middle` run across each card drawing `middle`'s line, the ancestor card of
`piece` (36.207 to 99.5859) and `middle`'s own card (32.8047 to 120.1602),
and the anchor from the bottom of `middle`'s card to the top of
`recording`'s (128.1602), `<line data-id="anchor_1" x1="460.3354"
y1="120.1602" x2="460.3354" y2="128.1602" …/>` (the ancestor card of
`piece` moving the origin 148.6318 to the right; TimeToShare's drawings
README derives every number); and
`group__group_grandchild_parent_on_top` an ancestor line on each side of
a member: `movement`, whose band order lays its children below its line,
above `theme`, and `score`, in the default order, below it. Every root of a non-corpus fixture carries the named timestamps
`origin` and `length` (`origin` alone for an unknown length), each drawing
its wedge and its coordinate label where the root's start and end were
marked before: their figures keep every number and address the wedges
`{id: timestamp_N}` and the labels `{id: timestamp_N, part: [coordinate]}`.
`timestamps` draws named timestamps of every `display`, its geometry
derived in the layout's README and in TimeToShare's drawings README: `x0 =
49.91552734375`, the root's line at 77.9296875, `clt_2`'s at 23, the card
from 8 to 112.90625, `H = 122.90625`. So, in block coordinates and to four decimals,
`timestamp_1`'s wedge is `<polygon data-id="timestamp_1"
points="124.9155,79.4297 121.9155,92.4297 127.9155,92.4297"
fill="#000000"/>`, its name label `<text data-id="timestamp_1"
data-part="name" x="124.9155" y="102.7837" text-anchor="middle"
font-size="9" fill="#000000">Downbeat</text>`, the stack of `timestamp_3`
its labels `data-part="name"` (`Entry`, `y="47.854"`), `data-part="id"`
(`timestamp_3`, `y="58.3306"`) and `data-part="coordinate"` (`1 ♩`,
`y="68.8071"`), and the drawing ends with the cross-section lines across
the card, each less its gap (drawing.md §6.6), the upper piece first:
`timestamp_1`'s from 8 to its wedge's tip 79.4297 (`77.9296875 + 1.5`) and
from the outer edge of its name label 104.9062 (`77.9296875 + 1.5 + 13 + 2
+ h(9)`) to 112.9062, then `timestamp_3`'s from 8 to its wedge's tip 24.5
(`23 + 1.5`, `clt_2`'s markers band below its line) and from the outer edge
of its three labels 70.9297 (`23 + 1.5 + 13 + 2 + 3 × h(9)`) to 112.9062,
written as the layout states them, `<line data-id="timestamp_1" data-part="line"
x1="124.9155" y1="8" x2="124.9155" y2="79.4297" stroke="#1BA1E2"
stroke-width="1" stroke-dasharray="3 3"/>`, `… y1="104.9062" …
y2="112.9062"`, `<line data-id="timestamp_3" data-part="line"
x1="199.9155" y1="8" x2="199.9155" y2="24.5" …/>` and `… y1="70.9297" …
y2="112.9062"`; the last in TikZ `(199.9155,51.9766) -- (199.9155,10)`
(`122.90625 − y`). `timestamp_2` lists no cross-section line. `bundle__bundle_matchstamps` draws
named MatchStamps as stored (drawing.md §8.7, its numbers derived in the
layout's README): the drawing ends with the lines of its two alignment
anchors and the one label; each anchor joins the cross-section segments of
its two match timestamps, the cards' spans (section 8.7), from the bottom
of `score`'s card (28.8046875 + 49.37890625 = 78.18359375) to the top of
`take_1`'s (86.18359375) and `take_2`'s (143.5625): `<line
data-id="anchor_1" x1="261.0928" y1="78.1836" x2="161.0928" y2="86.1836"
stroke="#1BA1E2" stroke-width="1" stroke-dasharray="3 3"/>`, `<line
data-id="anchor_2" x1="261.0928" y1="78.1836" x2="161.0928"
y2="143.5625" …/>` and `<text data-id="anchor_1" data-part="name"
x="211.0928" y="85.2993" text-anchor="middle" font-size="9"
fill="#000000">Bar 2, downbeat (take 1)</text>` (the middle 82.18359375
plus `(a(9) − d(9)) / 2`), in TikZ `\path[draw=ts1BA1E2,line width=1pt,dash
pattern=on 3pt off 3pt] (261.0928,124.7578) -- (161.0928,116.7578);` (`H =
202.94140625`).
There are 109 cases (among them the drawings of a groupstamp's line across its group: `group__group_groupstamp` on a member, `group__group_groupstamp_child_member` on a member's child, `bundle__bundle_groupstamp_shared_member` on a member of two groups, one line in each frame; and `timestamp_wedge_rotation`, wedges turned on both sides of a line). Every case stating a spacing, of the block, in a place or in a
member's card place, draws an SVG different from its manifest's default
case: a spacing case that draws as the default (a block of one item has no
gap) pins nothing.

## Drawing a manifest file (`draw-manifest.test.ts`)

`pnpm draw <manifest> --out <directory> [--name <stem>] [--length <n>]
[--scale <s>]` (`scripts/draw-manifest.ts`) draws any manifest file, YAML or
JSON, as the review cases draw a manifest fixture: the layers
`[DEFAULT_LAYER, manifestLayer(manifest)]`, the default placement with
`--length` replacing its length, the schema package's font metrics, the
drawing placed at `(0, 0)` with the scale, written as `<stem>.svg` and the
standalone `<stem>.tex`. What proves it draws exactly what the
specification's fixtures pin is the command itself, run as a separate Node
process on the manifest file a drawing fixture names: its two files equal
that fixture's `figure.svg` and `figure.tex` byte for byte. The cases cover
a group whose child member draws an ancestor card (`groups/group_parent_both`
→ `group__group_parent_both`), a bundle storing elisions
(`bundles/bundle_elisions_stored` → `bundle__bundle_elisions_stored`), the
length (`nested` with `--length 800` → `nested__length-800`) and the scale
(`nested` with `--scale 2` → `nested__scale-2`); the stem defaults to the
file's name without its extension and `--name` replaces it. The same
manifest written as pretty JSON (TimeToShare's `dumps`) draws the same two
files, so the serialization is read, not assumed. A file that is no
manifest (a manifest without `timelines`) writes nothing, and the command
exits with status 1 and names the problem on standard error; a missing
`--out` or a `--length` that is no positive number exits with status 2 and
writes nothing.

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
