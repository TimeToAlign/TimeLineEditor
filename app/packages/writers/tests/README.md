# `@timetoalign/tilie-writers` tests

`toDescriptors(drawing)`, `writeSvg(placed)` and `writeTikz(placed,
options)` implement section 7 and section 8.5 of timeskeleton's drawing
specification (`docs/drawing.md`, "the specification" below): the element
descriptors, the page, the number format and the SVG and TikZ profiles.
`placed` is a list of `{drawing, x, y, scale}`. Every expected text below is
derived here by hand from the specification; none is copied from output.
All comparisons are exact string or value equality.

The writers serialize a drawing; they do not lay it out. So every test but
the review-drawing and fixture tests builds its `Drawing` by hand, element
by element, with the exact doubles the specification gives, and depends on
no layout result. Only `fixtures.test.ts`, the jump-axis check and the
one-command-per-descriptor sweep draw manifests through the layout.

## Number format (`format.test.ts`)

`formatNumber` rounds the exact value of a double to the nearest multiple of
1/10000, ties to the even multiple. What proves it reads the double, not a
decimal spelling of it, is a double that lies a few 1e-15 off a decimal tie:

- exact ties (dyadic): `0.03125` (= 1/32, exactly 312.5 ten-thousandths) is
  `0.0312`, `0.09375` is `0.0938`, `-0.03125` is `-0.0312`;
- near ties: the double nearest `100.00495` lies 6.2e-15 below the tie, so
  it is `100.0049` (rounding the decimal `100.00495` half to even would give
  `100.005`); the double nearest `100.00705` lies 6.7e-15 above it, so it is
  `100.0071` (not `100.007`); `-100.00495` is `-100.0049`; the double nearest
  `1.00005` lies 1.1e-16 above, so it is `1.0001` (not `1`);
- exact dyadic values: `41.5771484375` is `41.5771`, `14.40234375` is
  `14.4023`;
- `3` is `3`; `0.5` is `0.5`; `-0.00001` and `-0` are `0`; `1e21` is
  `1000000000000000000000` (no exponent);
- a non-finite value (NaN, infinity) is refused with a `RangeError`.

## Page (`page.test.ts`)

Two hand-built drawings: `bare` (`W = 476.5771484375`, `H = 67.37890625`,
below) and a box `W = 100.25`, `H = 50` with only its background.

- One drawing alone at `(0, 0)`, scale 1, has the page `W + 32` by `H + 32`,
  `508.5771484375` by `99.37890625`, and lies at `(16, 16)`.
- `bare` at `(10, 20)` scale 1 and the box at `(−30, 5)` scale 2: `left =
  −30`, `top = 5`, `right = max(10 + 476.5771484375, −30 + 100.25 × 2) =
  486.5771484375`, `bottom = max(20 + 67.37890625, 5 + 50 × 2) = 105`, so
  the page is `486.5771484375 + 30 + 32 = 548.5771484375` by `105 − 5 + 32 =
  132`; `bare` lies at `(56, 31)`, the box at `(16, 16)`. The SVG root
  carries `width="548.5771" height="132" viewBox="0 0 548.5771 132"`, and
  the groups are `<g transform="translate(56 31)">` and `<g
  transform="translate(16 16) scale(2)">`. The TikZ scopes are shifted to
  `(56, 132 − 31 − 67.37890625 = 33.62109375)`, written `33.6211`, and to
  `(16, 132 − 16 − 100 = 16)` with `,scale=2,transform shape`.
- The box alone at scale 1.5: the page `100.25 × 1.5 + 32 = 182.375` by `50 ×
  1.5 + 32 = 107`; `scale(1.5)` and `,scale=1.5,transform shape`, the scope
  at `(16, 107 − 16 − 75 = 16)`.
- An empty list is refused with a `RangeError`.

## `bare`, byte for byte (`bare.test.ts`)

The drawing of the manifest `bare` is built by hand from its
derivation from the specification: an anonymous box with one ungrouped
root in its card. `W = 476.5771484375`, `H = 67.37890625`; the background
`fill #F3F4F6`, `rx 10`; the card `bare/card` at `x = y = 8`, `458.5771484375`
by `49.37890625`, `fill #FFFFFF`, `stroke #C4C9D1`, `stroke-width 0.75`, `rx
5`, `shadow #B8BEC8`; the line `bare` from `x0 = 49.5771484375` to `Xe =
449.5771484375` at `y = 22.40234375`, `#00CC00`, width 3, a start circle and
the arrowhead (tip `Xe + 3w = 458.5771484375`, base on `Xe` from `y − 4.5`
to `y + 4.5`); the wedges `bare/start` and `bare/end` at `x0` and `Xe`, tip
`y + 1.5 = 23.90234375`, base `36.90234375`, at `x ∓ 3`, `#000000`; the name
`Bare` at `x = 16`, baseline `26.21044921875`, size 11; the labels `0 ♩` and
`8 ♩` at `x0` and `Xe`, baseline `47.25634765625`, size 9. Placed alone, the
page is `508.5771484375 × 99.37890625`. The SVG is exactly the hand-derived
fixture `figure.svg`:

```
<svg xmlns="http://www.w3.org/2000/svg" width="508.5771" height="99.3789" viewBox="0 0 508.5771 99.3789" font-family="DejaVu Sans" text-rendering="geometricPrecision" style="font-kerning:none;font-variant-ligatures:none">
<g transform="translate(16 16)">
<rect x="0" y="0" width="476.5771" height="67.3789" rx="10" fill="#F3F4F6"/>
<rect data-address="bare/card" x="10" y="10" width="458.5771" height="49.3789" rx="5" fill="#B8BEC8"/>
<rect data-address="bare/card" x="8" y="8" width="458.5771" height="49.3789" rx="5" fill="#FFFFFF" stroke="#C4C9D1" stroke-width="0.75"/>
<line data-address="bare" x1="49.5771" y1="22.4023" x2="449.5771" y2="22.4023" stroke="#00CC00" stroke-width="3"/>
<circle data-address="bare" cx="49.5771" cy="22.4023" r="3" fill="#00CC00"/>
<polygon data-address="bare" points="458.5771,22.4023 449.5771,17.9023 449.5771,26.9023" fill="#00CC00"/>
<polygon data-address="bare/start" points="49.5771,23.9023 46.5771,36.9023 52.5771,36.9023" fill="#000000"/>
<polygon data-address="bare/end" points="449.5771,23.9023 446.5771,36.9023 452.5771,36.9023" fill="#000000"/>
<text data-address="bare/name" x="16" y="26.2104" text-anchor="start" font-size="11" fill="#000000">Bare</text>
<text data-address="bare/start/label" x="49.5771" y="47.2563" text-anchor="middle" font-size="9" fill="#000000">0 ♩</text>
<text data-address="bare/end/label" x="449.5771" y="47.2563" text-anchor="middle" font-size="9" fill="#000000">8 ♩</text>
</g>
</svg>
```

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
\setsansfont{DejaVuSans.ttf}[Path=/fonts/,Kerning=Off,Ligatures={TeXOff,NoCommon}]
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
(`Path=./`).

## Descriptors and commands (`descriptors.test.ts`)

On synthetic drawings built in the test, `H = 30` (a drawing is a derived
value, not a manifest). The attribute order of section 7.2 is
`data-address`, the template's geometry, `rx`, `text-anchor`, `font-size`,
`fill`, `stroke`, `stroke-width`, `stroke-dasharray`, `opacity`; every
expected line below follows it, so each one also proves the order.

**The background, frames and cards.**

- The background follows its template and then `opacity`, without an
  address: with `opacity 0.5`, `<rect x="0" y="0" width="60" height="30"
  rx="0" fill="none" opacity="0.5"/>`, in TikZ `\path[rounded
  corners=0pt,opacity=0.5] (0,0) rectangle (60,30);` (`rx` maps one to one,
  0 included; `fill="none"` adds no option).
- A group's frame `x 8`, `y 4`, `width 40`, `height 20`, filled `#FFFFFF`,
  stroked `#D1D5DB` with width 1, `rx 6`: `<rect data-address="g" x="8"
  y="4" width="40" height="20" rx="6" fill="#FFFFFF" stroke="#D1D5DB"
  stroke-width="1"/>`, and no shadow even when its style holds one; in
  TikZ the rectangle from `(x, H − y − h)` to `(x + w, H − y)`:
  `\path[rounded corners=6pt,fill=tsFFFFFF,draw=tsD1D5DB,line width=1pt]
  (8,6) rectangle (48,26);`.
- A card `m/card` at the same place, filled `#FFFFFF`, stroked `#C4C9D1`
  with width 0.75, `rx 5`, `shadow #B8BEC8`: first its shadow, 2 to the
  right and 2 down, with the card's size and `rx` and `fill` alone,
  `<rect data-address="m/card" x="10" y="6" width="40" height="20" rx="5"
  fill="#B8BEC8"/>`, then the card, `<rect data-address="m/card" x="8"
  y="4" width="40" height="20" rx="5" fill="#FFFFFF" stroke="#C4C9D1"
  stroke-width="0.75"/>`; in TikZ `\path[rounded corners=5pt,fill=tsB8BEC8]
  (10,4) rectangle (50,24);` and `\path[rounded
  corners=5pt,fill=tsFFFFFF,draw=tsC4C9D1,line width=0.75pt] (8,6)
  rectangle (48,26);`. With `shadow none` the card is the second rect
  alone. With `opacity 0.5` and dash `2 1` the card ends with
  `stroke-dasharray="2 1" opacity="0.5"` and the shadow with
  `fill="#B8BEC8" opacity="0.5"` (the shadow carries no stroke attribute,
  and `opacity` is written on every descriptor whose element's opacity is
  not 1).

**Lines** (`timeline`, `child` and `ancestor` alike), `xs 10`, `xe 50`, `y
20`, width 2, stroke and fill `#00CC00`, dash `3 3`, address `c`. The
`<line>` comes first, then the start circle `<circle data-address="c"
cx="10" cy="20" r="2" fill="#00CC00"/>`, then the end:

- `arrowhead`: the line to `Xe = 50`, then the filled `<polygon
  data-address="c" points="56,20 50,17 50,23" fill="#00CC00"/>` (tip `50 +
  3 × 2`, base on 50 at `20 ∓ 1.5 × 2`);
- `open`: the line to 50, then the same points with `fill="none"
  stroke="#00CC00" stroke-width="1"`, no dash although the line is dashed;
- `circle`: the line to 50, then `<circle data-address="c" cx="50" cy="20"
  r="2" fill="#00CC00"/>`;
- `diamond`: the line to `50 − 1.5 × 2 = 47`, then `<polygon
  data-address="c" points="47,20 50,17.6 53,20 50,22.4" fill="none"
  stroke="#00CC00" stroke-width="1"/>` (`1.2w = 2.4`);
- `unknown`, the open end of a timeline of unknown length (section 6.6),
  `xe` being `Xr`, the point the line runs on to: the line to 50, then
  three chevrons, the inner one `<polyline data-address="c" points="52,17
  55,20 52,23" fill="none" stroke="#00CC00" stroke-width="1"/>` (`Xr + w`,
  `Xr + 2.5w`), the middle one through `55,17 58,20 55,23` (`Xr + 2.5w`,
  `Xr + 4w`) and the outer one through `58,17 61,20 58,23` (`Xr + 4w`, `Xr
  + 5.5w`), stroked at `w / 2`, no dash, and carrying the line's own
  address `c`, so they hit the line;
- `chevrons`, a line running on (section 8.3): the line to 50, then only
  the inner and the middle of those three, `52,17 55,20 52,23` and `55,17
  58,20 55,23`: two chevrons, never three, so the two ends differ in the
  outer chevron alone;
- each line is `<line data-address="c" x1="10" y1="20" x2="{stop}"
  y2="20" stroke="#00CC00" stroke-width="2" stroke-dasharray="3 3"/>`.

An ancestor line `a` running on at both sides (start and end `chevrons`),
`xs = Xa = 20`, `xe = Xr = 40`, `y 20`, width 2, dash `3 3`, opacity 0.35:
the line `x1="20" … x2="40"` with its dash and `opacity="0.35"`; then the
left chevrons, inner first, `18,17 15,20 18,23` (`Xa − w`, `Xa − 2.5w`) and
`15,17 12,20 15,23` (`Xa − 2.5w`, `Xa − 4w`); then the right ones, inner
first, `42,17 45,20 42,23` and `45,17 48,20 45,23`. Each chevron is
`<polyline data-address="a" points="…" fill="none" stroke="#00CC00"
stroke-width="1" opacity="0.35"/>`: width `w / 2`, no dash, the line's
opacity. In TikZ the line is `\path[draw=ts00CC00,line width=2pt,dash
pattern=on 3pt off 3pt,opacity=0.35] (20,10) -- (40,10);` and the inner
left chevron `\path[draw=ts00CC00,line width=1pt,opacity=0.35] (18,13) --
(15,10) -- (18,7);`, open, without `cycle`. An ancestor with a start circle
and a diamond end is written exactly as a child with them.

**Three chevrons and two in real drawings** (`w = 3`, section 6.6 and
8.3). The writer is checked on the layout's own output, every point formed
as `Xr` (or `Xa`) plus its constant multiple of `w`:

- `unknown_length`: the open root `score` (`Xr = 465.798828125`, `y = 37`)
  writes exactly three polylines with its address, inner, middle, outer:
  `(468.798828125, 32.5) (473.298828125, 37) (468.798828125, 41.5)`, then
  `(473.298828125, 32.5) (477.798828125, 37) (473.298828125, 41.5)`, then
  `(477.798828125, 32.5) (482.298828125, 37) (477.798828125, 41.5)`, the
  outer tip `Xr + 5.5w`, 28.5 past `Xe`; in TikZ, three `\path` commands.
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

- A brace from `x1 = 0` to `x2 = 20`, arms at 10, tip at 16 has `ym = 13`,
  `k = 3`, `xm = 10` and the path `M0 10Q0 13 3 13L7 13Q10 13 10 16Q10 13 13
  13L17 13Q20 13 20 10` with `fill="none"` and the stroke attributes. In
  TikZ each `Q C P` from `P0` becomes the cubic with controls `P0 + 2/3 ×
  (C − P0)` and `P + 2/3 × (C − P)`: `(0,20) .. controls (0,18) and (1,17)
  .. (3,17) -- (7,17) .. controls (9,17) and (10,16) .. (10,14) .. controls
  (10,16) and (11,17) .. (13,17) -- (17,17) .. controls (19,17) and (20,18)
  .. (20,20)`.
- A jump with `P0 = (10, 20)`, `C1 = (20, 40)`, `C2 = (40, 40)`, tip `P3 =
  (50, 20)`, base centre `Bh = (48, 24)` and corners `(46, 23)`, `(50, 25)`:
  the shaft `M10 20C20 40 40 40 48 24` (its last point the base centre, not
  the tip) and the filled arrowhead `50,20 46,23 50,25` (tip first, then the
  corners in order); in TikZ the shaft is `(10,10) .. controls (20,-10) and
  (40,-10) .. (48,6)`.
- For every jump of `flow_control` and `corpus_score_ms3` (each drawn by
  the layout at the default placement with the default layer and its own;
  the paths whose address is a jump's), read back from the
  descriptors, the shaft's end tangent continues the head's axis and the
  base is perpendicular to it, exactly at the written precision: the unit
  vector from `C2` to the path's last point and the unit vector from that
  point to the polygon's first point (the tip) are written alike by the
  number rule, the path's last point is the midpoint of the polygon's two
  corners, and the dot product of the base (corner to corner) with the axis
  (base centre to tip) is written `0`. `flow_control` has 1 jump,
  `corpus_score_ms3` 4.
- A map with `xs 10`, `xe 50`, `yc 20`, stroke `#00CC00`, dash `1 1`, is one
  closed outline at `yc ∓ d / 2 = 19, 21`: `<polygon data-address="m"
  points="10,19 50,19 50,21 10,21" fill="none" stroke="#00CC00"
  stroke-width="1" stroke-dasharray="1 1"/>`; in TikZ
  `\path[draw=ts00CC00,line width=1pt,dash pattern=on 1pt off 1pt] (10,11)
  -- (50,11) -- (50,9) -- (10,9) -- cycle;`. Both start at `(Xs, yc − d /
  2)`, so the dash pattern starts at the same corner, and both run the
  corners in the same order.
- A segment's boundary `x 10` from `y1 12` to `y2 18`, stroked `#000000`
  with width 1, is a line like a break's: `<line data-address="b/start"
  x1="10" y1="12" x2="10" y2="18" stroke="#000000" stroke-width="1"/>`, in
  TikZ `\path[draw=ts000000,line width=1pt] (10,18) -- (10,12);`.
- A wedge `x 10`, tip `yt 5`, base `yb 18`, fill `#000000`: `<polygon
  data-address="w" points="10,5 7,18 13,18" fill="#000000"/>`, fill only.
- Opacity 0.5 is written last, as `opacity="0.5"` and `opacity=0.5`.
- Stroke-dasharray `2` is `dash pattern=on 2pt off 2pt` and `1 2 3` is `dash
  pattern=on 1pt off 2pt on 3pt off 1pt on 2pt off 3pt`; each dash number
  is formatted by the number rule: `1.50 0.00001` is written
  `stroke-dasharray="1.5 0"` and `dash pattern=on 1.5pt off 0pt` (0.00001
  is a tenth of 1/10000, so it rounds to the multiple 0).
- `fill="none"` and `stroke="none"` add no TikZ paint option: a break line
  `x 10`, `y1 5`, `y2 25` stroked `none` is `<line … stroke="none"
  stroke-width="1"/>` and `\path[line width=1pt] (10,25) -- (10,5);`.
- Text escaping: SVG writes `a&b<c>` as `a&amp;b&lt;c&gt;`, and attribute
  values escape `&`, `<`, `>` and `"`; TikZ writes `\~^#$%&_{}` as
  `\textbackslash{}\textasciitilde{}\textasciicircum{}\#\$\%\&\_\{\}`, and a
  space at the start or end or following another space as `\ ` (` a  b `
  is `\ a \ b\ `). A text descriptor is `<text …>{text}</text>`; every
  descriptor without text is self-closing.

**One command per descriptor.** For a hand-built drawing holding every
kind of element (`everything()` in `support.ts`: a frame and its title, a
card with its shadow, an ancestor line running on at both sides, lines
ending in the diamond, the open arrowhead, the end circle and the
arrowhead, a map, a region, a jump, a break, a boundary, a wedge and
labels), and for every review drawing (drawn by the layout), `writeSvg`
writes exactly one line per descriptor between `<g …>` and `</g>`, in
order, equal to `descriptorSvg` of it, each starting with `<{tag} ` and,
except the background, `<{tag} data-address="…" `; `writeTikz` writes
exactly one command per descriptor between `\begin{scope}` and
`\end{scope}`, in the same order, of the kind its tag selects (two points
joined by `rectangle` for a rect, two points joined by `--` for a line,
`circle[radius=` for a circle, `-- cycle;` for a polygon, three points
joined by `--` and no `cycle` for a polyline, `.. controls` for a path,
`\node` for a text). `everything()` writes 30 descriptors, in which every
tag occurs.

## Drawing fixtures (`fixtures.test.ts`)

The drawing fixtures of timeskeleton (`fixtures/<version>/drawings/<name>/`,
read from the installed `@timetoalign/timeskeleton` package, like the
manifests and the font) are the contract between implementations of the
specification: each directory holds `inputs.json` (the manifest's path
below `fixtures/<version>/`, `groups/<file>` or `bundles/<file>` for a
manifest sorted there; the placement with all five members, the scale and
the application's style layers) and the expected `figure.svg` and
`figure.tex`. The manifest is the input with its whole `graphical` block,
`order` included. For every directory the test reads `inputs.json` alone,
loads the named manifest, draws it with the layers `[DEFAULT_LAYER,
...inputs.layers, manifestLayer(manifest)]` (the manifest's `styles` and
`statements` without the member `order`; no layer lies above
the manifest's own) and the bundled font metrics, writes the drawing placed
at `(0, 0)` with the scale (`writeTikz` with its default font directory
`.`), and requires both texts to equal the files byte for byte.

Eighteen SVGs are derived by hand from the specification alone, never from
this writer's output: `bare`, `nested`, `map`, `flow_control`,
`with_region`, `styled__score`, `nested__length-800-spacing-2`,
`segment_line`, `segment_pages_accolades`, `group__group_child_member`,
`group__group_parents_mixed`, `group__group_grandchild`, and the six
timelines of unknown length `unknown_length`, `unknown_length_empty`,
`unknown_length_locked`, `unknown_length_child`,
`group__group_unknown_length` and `unknown_length_segments` (`HAND_DERIVED`
in `scripts/emit-drawings.ts`). Their equality with the writer proves the
specification complete for what they show. A missing hand-derived file is
a failure, never a skip. Every other figure is emitted by `pnpm
emit-drawings --into <timeskeleton checkout>` from the writer and pins the
implementation against regression. With a local `link:` dependency the
package's `fixtures/` and `fonts/` are the copies that `pnpm build` in the
checkout's `js/` makes: rebuild there after emitting or changing fixtures,
or the tests read the previous copy.

The fixtures and the review drawings cannot drift apart: the set of
directories equals the set of `reviewCases()` names exactly, and each
case's inputs, written with timeskeleton's `dumps`, equal its `inputs.json`
text. The cases are, in this order: every manifest fixture directly in
`fixtures/<SCHEMA_VERSION>/` but the `corpus_*` ones, under its file name
(31); the ten resized `nested` drawings; `map__child-map-below`, whose
application layer selects the child's map by its address `melody/ticks`;
`group__<file>` for each fixture in `groups/` but the `corpus_*` ones (9);
`bundle__<file>` for each fixture in `bundles/` but the `corpus_*` ones
(3): 54. The manifest directories are read one by one
(`fixtures/<version>/`, its `groups/` and its `bundles/`), never
recursively, and a fixture's minimal twin (`*.minimal.json`) is no case:
it holds what its complete fixture holds and draws the same.

## Validity (`compile.test.ts`)

Every drawing fixture's `figure.svg`, and the SVG of `everything()`, parses
as XML with an SVG root (Python's ElementTree). Every drawing fixture's
`figure.tex`, and the TikZ of `everything()`, compiled in a directory
holding a copy of the package's `fonts/DejaVuSans.ttf` (the documents name
the font directory `.`), compiles under LuaLaTeX with exit status 0, and its
log holds no fontspec warning and no `Missing character` line: every text,
`♩` and the escaped TeX specials of `everything()` included, is set in the
bundled DejaVu Sans, because each node's `font` option restates
`\sffamily`, and every command kind, the polyline and the rounded
rectangle included, is valid TikZ. The test is skipped where `lualatex` is
absent and fails without it when `TILIE_REQUIRE_LUALATEX` is set.
