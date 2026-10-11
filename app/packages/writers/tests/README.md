# `@timetoalign/tilie-writers` tests

`toDescriptors(drawing)`, `writeSvg(placed)` and `writeTikz(placed,
options)` implement section 7 of timeskeleton's drawing specification
(`docs/drawing.md`, "the specification" below): the element descriptors,
the page, the number format and the SVG and TikZ profiles. `placed` is a
list of `{drawing, x, y, scale}`. Every expected text below is derived here
by hand from the specification and from the drawing of `bare` derived in
`packages/layout/tests/README.md`; none is copied from output. All
comparisons are exact string or value equality.

## Number format (`format.test.ts`)

`formatNumber` rounds the exact value of a double to the nearest multiple of
1/10000, ties to the even multiple: `0.03125` (= 1/32, exactly 312.5
ten-thousandths) is `0.0312`, `0.09375` is `0.0938`, `-0.03125` is
`-0.0312`; `41.5771484375` is `41.5771`; `14.40234375` is `14.4023`; `3` is
`3`; `0.5` is `0.5`; `-0.00001` and `-0` are `0`; `1e21` is
`1000000000000000000000` (no exponent). A non-finite value is refused.

## Page (`page.test.ts`)

One drawing at `(0, 0)`, scale 1, has page size `W + 32` by `H + 32` and lies
at `(16, 16)`. For `bare` (`W = 455.9931640625`, `H = 49.37890625`) and
`nested` (`W = 458.351318359375`, `H = 77.9765625`) placed at `(10, 20)`
scale 1 and `(−30, 5)` scale 2: the bounding box runs from `x = −30` to
`max(10 + 458.5771484375, −30 + 916.70263671875) = 886.70263671875` and
from `y = 5` to `max(20 + 49.37890625, 5 + 155.953125) = 160.953125`, so
the page is `886.70263671875 + 30 + 32 = 948.70263671875` by
`160.953125 − 5 + 32 = 187.953125`; `bare` lies at `(56, 31)`, `nested` at
`(16, 16)`. The SVG writes `<g transform="translate(56 31)">` for `bare`
and `<g transform="translate(16 16) scale(2)">` for `nested`; the TikZ
scopes are shifted to `(56, 187.953125 − 31 − 49.37890625 = 107.57421875)`
and `(16, 187.953125 − 16 − 155.953125 = 16)` with `,scale=2,transform
shape` on the second. One drawing alone (`bare`) has the page `458.5771484375
+ 32` by `49.37890625 + 32`.

## `bare`, byte for byte (`bare.test.ts`)

From the layout README: `x0 = 41.5771484375`, `Xe = 441.5771484375`,
`y_root = 14.40234375`, `W = 458.5771484375`, `H = 49.37890625`. Page
`490.5771484375 × 81.37890625` → `490.5771 × 81.3789`. The root is not
locked: its line runs to `Xe`; the arrowhead's base lies on `Xe` from
`y − 4.5` to `y + 4.5` (9.90234375, 18.90234375) and its tip at `Xe + 3w =
450.5771484375`. Wedges: tip 15.90234375, base 28.90234375, at
`x ∓ 3`; a wedge carries only its fill attributes. Name
baseline 18.21044921875, label baseline 39.25634765625. The SVG is exactly:

```
<svg xmlns="http://www.w3.org/2000/svg" width="490.5771" height="81.3789" viewBox="0 0 490.5771 81.3789" font-family="DejaVu Sans" style="font-kerning:none;font-variant-ligatures:none">
<g transform="translate(16 16)">
<rect x="0" y="0" width="458.5771" height="49.3789" rx="10" fill="#F3F4F6"/>
<line data-address="bare" x1="41.5771" y1="14.4023" x2="441.5771" y2="14.4023" stroke="#00CC00" stroke-width="3"/>
<circle data-address="bare" cx="41.5771" cy="14.4023" r="3" fill="#00CC00"/>
<polygon data-address="bare" points="450.5771,14.4023 441.5771,9.9023 441.5771,18.9023" fill="#00CC00"/>
<polygon data-address="bare/start" points="41.5771,15.9023 38.5771,28.9023 44.5771,28.9023" fill="#000000"/>
<polygon data-address="bare/end" points="441.5771,15.9023 438.5771,28.9023 444.5771,28.9023" fill="#000000"/>
<text data-address="bare/name" x="8" y="18.2104" text-anchor="start" font-size="11" fill="#000000">Bare</text>
<text data-address="bare/start/label" x="41.5771" y="39.2563" text-anchor="middle" font-size="9" fill="#000000">0 ♩</text>
<text data-address="bare/end/label" x="441.5771" y="39.2563" text-anchor="middle" font-size="9" fill="#000000">8 ♩</text>
</g>
</svg>
```

In TikZ every ordinate becomes `H − y`: 34.9765625 (root), 39.4765625 and
30.4765625 (arrowhead), 33.4765625 and 20.4765625 (wedges), 31.16845703125
(name), 10.12255859375 (labels); `h(11) = 12.8046875`, `h(9) = 10.4765625`.
The single scope is shifted to `(16, 81.37890625 − 16 − 49.37890625 = 16)`.
Colours used: `000000`, `00CC00`, `F3F4F6`. With `fontDirectory`
`/fonts` the TikZ is exactly:

```
\documentclass{standalone}
\usepackage{fontspec}
\setsansfont{DejaVuSans.ttf}[Path=/fonts/,Kerning=Off,Ligatures={TeXOff,NoCommon}]
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}[x=1pt,y=1pt,miter limit=4,font=\sffamily]
\definecolor{ts000000}{HTML}{000000}
\definecolor{ts00CC00}{HTML}{00CC00}
\definecolor{tsF3F4F6}{HTML}{F3F4F6}
\begin{scope}[shift={(16,16)}]
\path[rounded corners=10pt,fill=tsF3F4F6] (0,0) rectangle (458.5771,49.3789);
\path[draw=ts00CC00,line width=3pt] (41.5771,34.9766) -- (441.5771,34.9766);
\path[fill=ts00CC00] (41.5771,34.9766) circle[radius=3];
\path[fill=ts00CC00] (450.5771,34.9766) -- (441.5771,39.4766) -- (441.5771,30.4766) -- cycle;
\path[fill=ts000000] (41.5771,33.4766) -- (38.5771,20.4766) -- (44.5771,20.4766) -- cycle;
\path[fill=ts000000] (441.5771,33.4766) -- (438.5771,20.4766) -- (444.5771,20.4766) -- cycle;
\node[anchor=base west,inner sep=0,font=\sffamily\fontsize{11}{12.8047}\selectfont,text=ts000000] at (8,31.1685) {Bare};
\node[anchor=base,inner sep=0,font=\sffamily\fontsize{9}{10.4766}\selectfont,text=ts000000] at (41.5771,10.1226) {0 ♩};
\node[anchor=base,inner sep=0,font=\sffamily\fontsize{9}{10.4766}\selectfont,text=ts000000] at (441.5771,10.1226) {8 ♩};
\end{scope}
\end{tikzpicture}
\end{document}
```

With `standalone: false` the output is the lines from `\begin{tikzpicture}`
to `\end{tikzpicture}` alone; the default font directory is `.`
(`Path=./`).

## Descriptors and commands (`descriptors.test.ts`)

On synthetic drawings built in the test (a drawing is a derived value, not a
manifest):

- a brace from `x1 = 0` to `x2 = 20`, arms at 10, tip at 16 has `ym = 13`,
  `k = 3`, `xm = 10` and the path `M0 10Q0 13 3 13L7 13Q10 13 10 16Q10 13 13
  13L17 13Q20 13 20 10`. In TikZ (`H = 30`) each `Q C P` from `P0` becomes
  the cubic with controls `P0 + 2/3 (C − P0)` and `P + 2/3 (C − P)`:
  `(0,20) .. controls (0,18) and (1,17) .. (3,17) -- (7,17) .. controls
  (9,17) and (10,16) .. (10,14) .. controls (10,16) and (11,17) .. (13,17)
  -- (17,17) .. controls (19,17) and (20,18) .. (20,20)`;
- a jump is written from its points as the layout computes them: with
  `P0 = (10, 20)`, `C1 = (20, 40)`, `C2 = (40, 40)`, tip `P3 = (50, 20)`, base
  centre `Bh = (48, 24)` and corners `(46, 23)`, `(50, 25)`, the shaft is
  `M10 20C20 40 40 40 48 24` (its last point the base centre, not the tip)
  and the filled arrowhead `50,20 46,23 50,25` (tip first, then the corners
  in order); in TikZ (`H = 30`) the shaft is `(10,10) .. controls (20,-10)
  and (40,-10) .. (48,6)`;
- for every jump of `flow_control` and `corpus_score_ms3`, read back from
  the descriptors, the shaft's end tangent continues the head's axis and the
  base is perpendicular to it, exactly at the written precision: the unit
  vector from `C2` to the path's last point and the unit vector from that
  point to the polygon's first point (the tip) are written alike by the
  number rule, the path's last point is the midpoint of the polygon's two
  corners, and the dot product of the base (corner to corner) with the axis
  (base centre to tip) is written `0`;
- a locked child line `xs 10`, `xe 50`, `y 20`, width 2: line to
  `50 − 1.5 × 2 = 47`, circle `r 2`, diamond `47,20 50,17.6 53,20 50,22.4`
  with `fill="none"`, its stroke, width 1 and no dash even when the child's
  dash is `3 3`;
- the same child unlocked: line to `Xe = 50`, circle `r 2`, filled
  arrowhead `56,20 50,17 50,23` (tip `50 + 3 × 2`, base on 50 at
  `20 ∓ 1.5 × 2`), fill only; a locked root draws the diamond exactly as a
  locked child does;
- a map with `xs 10`, `xe 50`, `yc 20`, stroke `#00CC00`, dash `1 1`, is one
  closed outline at `yc ∓ d / 2 = 19, 21`: `<polygon data-address="r/map/m"
  points="10,19 50,19 50,21 10,21" fill="none" stroke="#00CC00"
  stroke-width="1" stroke-dasharray="1 1"/>`; in TikZ (`H = 30`)
  `\path[draw=ts00CC00,line width=1pt,dash pattern=on 1pt off 1pt] (10,11)
  -- (50,11) -- (50,9) -- (10,9) -- cycle;`. Both start at `(Xs, yc − d / 2)`,
  so the dash pattern starts at the same corner, and both run the corners in
  the same order;
- opacity 0.5 is written last, as `opacity="0.5"` and `opacity=0.5`;
- stroke-dasharray `2` is `dash pattern=on 2pt off 2pt` and `1 2 3` is
  `dash pattern=on 1pt off 2pt on 3pt off 1pt on 2pt off 3pt`;
- each dash number is formatted by the number rule: `1.50 0.00001` is
  written `stroke-dasharray="1.5 0"` and `dash pattern=on 1.5pt off 0pt`
  (0.00001 is a tenth of 1/10000, so it rounds to the multiple 0);
- text escaping: SVG writes `a&b<c>` as `a&amp;b&lt;c&gt;`, and attribute
  values escape `&`, `<`, `>` and `"`; TikZ writes `\~^#$%&_{}` as
  `\textbackslash{}\textasciitilde{}\textasciicircum{}\#\$\%\&\_\{\}`.
  A space at the start or end or following another space is written `\ `;
- wedges, circles and timeline and jump arrowheads are fill-only; the
  diamond and the map outline are stroke-only. `fill="none"` and `stroke="none"` add no TikZ
  paint option: a break line `x 10`, `y1 5`, `y2 25` stroked `none` is
  `\path[line width=1pt] (10,25) -- (10,5);`;
- every descriptor without text is self-closing.

For every review drawing (every 0.4.0 fixture and the resized and restyled
drawings of the review sheet), `writeSvg` writes exactly one line per
descriptor between `<g …>` and `</g>`, in order, each starting with
`<{tag} ` and carrying the descriptor's `data-address`; `writeTikz` writes
exactly one command per descriptor between `\begin{scope}` and
`\end{scope}`, in the same order, of the kind its tag selects (`rectangle`
for a rect, two points joined by `--` for a line, `circle[radius=` for a
circle, `-- cycle;` for a polygon, `.. controls` for a path, `\node` for a
text).

## Drawing fixtures (`fixtures.test.ts`)

The drawing fixtures of timeskeleton (`fixtures/<version>/drawings/<name>/`,
read from the installed `@timetoalign/timeskeleton` package, like the
manifests and the font) are the contract between
implementations of the specification: each directory holds `inputs.json`
(the manifest's file name, the placement with all five members, the scale
and the placer's style layers) and the expected `figure.svg` and
`figure.tex`. For every directory the test reads `inputs.json` alone, loads
the named manifest, draws it with the layers `[DEFAULT_LAYER,
manifest.graphical, ...inputs.layers]` and the bundled font metrics, writes
the drawing placed at `(0, 0)` with the scale (`writeTikz` with its default
font directory `.`), and requires both texts to equal the files byte for
byte.

Seven SVGs (`bare`, `nested`, `map`, `flow_control`, `with_region`,
`styled__score`, `nested__length-800-spacing-2`) are derived by hand from
the specification alone, never from this writer's output; their equality
with the writer proves the specification complete for what they show. A
missing hand-derived file is a failure, never a skip. Every other figure is
emitted by `pnpm emit-drawings --into <timeskeleton checkout>` from the
writer and pins the implementation against regression. With a local
`link:` dependency the package's `fixtures/` and `fonts/` are the copies
that `pnpm build` in the checkout's `js/` makes: rebuild there after
emitting or changing fixtures, or the tests read the previous copy.

The fixtures and the review drawings cannot drift apart: the set of
directories equals the set of `reviewCases()` names exactly, and each
case's inputs, written with timeskeleton's `dumps`, equal its `inputs.json`
text.

## Validity (`compile.test.ts`)

Every drawing fixture's `figure.svg` parses as XML with an SVG root
(Python's ElementTree). Every drawing fixture's `figure.tex`, compiled in a
directory holding a copy of the package's `fonts/DejaVuSans.ttf` (the
fixtures name the font directory `.`), compiles under LuaLaTeX, and its log holds
no fontspec warning and no `Missing character` line: every text, `♩`
included, is set in the bundled DejaVu Sans, because each node's `font`
option restates `\sffamily`. The test is skipped where `lualatex` is absent
and fails without it when `TILIE_REQUIRE_LUALATEX` is set.
