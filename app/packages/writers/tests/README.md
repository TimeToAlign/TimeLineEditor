# `@timetoalign/tilie-writers` tests

`writeSvg(block, options)` and `writeTikz(block, options)` implement the page,
the number formatting rule and the two output profiles of the timeskeleton
geometry specification (`docs/geometry.md`, section 8). Both take one block
laid out by `layout(manifest)`, with width 400 and row height 32 by default.
`writeSvg` adds a 16-unit margin on every side of the page, so the page of a
one-row block is 432 by 64; `writeTikz` adds no margin, and its coordinates
start at the block's own top-left corner (specification section 8.1).
`writeBlockSvg` writes the block alone as a group.

## 0.3.0 figures, byte for byte (`figures.test.ts`)

There are exactly 16 specimens whose 0.4.0 manifest equals the single root of
a 0.3.0 envelope: `bare`, `contiguous`, the six continuous and discrete class
manifests, `corpus_audio_audio`, `corpus_midi_score_midi`, `corpus_score_ms3`,
`corpus_supra_iiif`, `flow_control`, `map`, `nested` and `with_region`. For
each, `writeSvg(layout(manifest))` equals the `figure.svg`, and
`writeTikz(layout(manifest))` equals the `figure.tex`, of
`fixtures/0.3.0/geometry/<name>/` in timeskeleton, byte for byte, with the
default options. The column of several blocks that the specification defines
for an envelope with several top-level timelines is not drawn: a manifest is
always one block.

## Embedded SVG (`figures.test.ts`)

`writeBlockSvg(block)` returns `<g>`, a newline, the block's SVG elements, and
`</g>` with a final newline. The group carries no transform: the block's
top-left corner is the group's origin. For every specimen, let `B` be the
exact lines between the opening `<svg …>` tag and the closing `</svg>` of
`writeSvg`; then `writeBlockSvg` is exactly `<g>\n` + `B` + `\n</g>\n`, so the
page margin stays in the outer SVG's view box (`-16 -16 …`) and not in the
group. For `bare`, the first line is `<g>`, the second is the page's first
element, the last two are `</g>` and the empty string, and the text contains
no `transform`. The comparison is of strings, without XML normalization.

## Hand-derived values (`examples.test.ts`)

Computed from the specification in the test, on `bare`, `flow_control` and
literal numbers:

- **Number formatting** (four decimal places, ties to even): `80`, `12.5`,
  `1/3` → `0.3333`, `2/3` → `0.6667`, `-6`, `-1/3` → `-0.3333`, `1/40000` →
  `0` (and `-1/40000` → `0`, never `-0`), `0.00025` → `0.0002` and `0.00035` →
  `0.0004` (ties to even), `0.99995` → `1` and `1.00005` → `1` (ties to even
  at the integer), the float `0.1` (exactly 3602879701896397/2^55) → `0.1`,
  the integer `123456789012345678` unchanged.
- **The page of `bare`**: frame 10, so a root position `x` lies at
  `(2 + x) × 400 / 10`. The SVG opens `width="432" height="64" viewBox="-16
  -16 432 64"`, the background rectangle is `x=0 y=0 width=400 height=32`
  filled `#BAC8D3`; the line runs from 80 to 396 at SVG ordinate 16 (`0 + (0 +
  1/2 − 0) × 32`), and in TikZ from `(80,16)` to `(400,16)` (ordinate `32 − 0
  − 32 + (0 − 0 + 1/2) × 32 = 16`); the end wedge is `M400 16L397 20L403 20Z`
  (base at row `-1/8`, ordinate `16 + 4 = 20`); the wedge label `8 ♩` has its
  SVG baseline at `20 + 7.25 = 27.25` and its TikZ node at `(400,12)`; the
  name label is at `x = 0 + 2`, baseline `17.75`.
- **`flow_control`**: frame 20, rows −1 to 0, height 64; the break at 12 lies
  at `(4 + 12) × 20 = 320`, from SVG ordinate 0 to 64; the jump from 8 (240) to
  2 (120) has its ends at row −1/2 (SVG 32), its controls at row `−1/2 + 4/3 ×
  (−7/8 + 1/2) = −1` (SVG 48), the path `M240 32C240 48 120 48 120 32`, and its
  stealth `M120 32L118 38L120 36L122 38Z` pointing up.
- **The name column ellipsis**: with `width` 100 the name column of `bare`
  (frame `[5, 1]`, names `[1, 1]`) is 20 wide, so `⌊(20 − 4) / 4.2⌋ = 3` code
  points fit: `Bare` becomes `Ba…`; with `width` 40 the column is 8 wide and no
  code point fits, so the label is not written.
- **Escaping**: a label `a<b&c<TAB>d` is written `a&lt;b&amp;c d` in SVG (the
  tab becomes a space), and a label `50% #1 {x}_y \ ~ ^ $ &` as `50\% \#1
  \{x\}\_y \textbackslash{} \textasciitilde{} \textasciicircum{} \$ \&` in
  TikZ.
- **Rotation**: a label with `rotate` 90 is written in SVG with
  `transform="rotate(-90 400 20)"` about its point, and in TikZ as
  `\node[anchor=north,rotate=90,text=ts000000] at (400,12)`; a float `45.0` is
  written `rotate=45,`.
- **Unknown kinds** are skipped: a block with an extra primitive of kind
  `strip` writes the same SVG and the same TikZ as without it.
- **TikZ without the preamble** (`standalone: false`) is the `tikzpicture`
  environment alone: the lines of the full file after its six-line preamble and
  before `\end{document}`, with the final newline. The full file begins with
  `\documentclass{standalone}` and `\begin{document}` and ends with
  `\end{document}`.

## The SVG parses, the TikZ compiles (`compile.test.ts`)

- Every 0.3.0 `figure.svg` of the 16 specimens is parsed by Python's
  `xml.etree.ElementTree` (run with `python3`, no package added), and its root
  is the SVG element.
- Every 0.3.0 `figure.tex` of the 16 specimens is compiled by `lualatex` and
  must exit 0. Where `lualatex` is absent the test is skipped with that
  reason, unless `TILIE_REQUIRE_LUALATEX` is set, as the CI job installing
  TeX Live sets it: then its absence fails.

## The figure emitter (`emit.test.ts`)

`scripts/emit-geometry.ts` writes the drawings of a timeskeleton checkout for
the schema version this workspace depends on. For each manifest
`fixtures/<version>/<name>.json` it writes only `figure.svg`
(`writeSvg(layout(manifest))`) and `figure.tex` (`writeTikz(layout(manifest))`)
into `fixtures/<version>/drawings/<name>/`; it writes no geometry JSON. The
hand-derived specimens are the SVG files that
`fixtures/<version>/drawings/README.md` lists, each as the code span
`<name>/figure.svg`. For a README that mentions `nested/figure.svg`,
`bare/figure.svg`, `nested/figure.svg` again, `bare/figure.tex` and a plain
`figure.svg`, `handDerived` returns exactly `["nested", "bare"]`: each name
once, in order of first mention.

Over a temporary checkout holding the manifests `bare` and `nested`:

- without `drawings/README.md`, `emit` throws `no hand-derived drawings for
  0.4.0` and writes nothing;
- with a README listing nothing, it returns `["bare", "nested"]` and each
  directory holds exactly `figure.svg` and `figure.tex`, equal to the writers'
  output;
- when the README lists `bare/figure.svg` and that file is exactly
  `writeSvg(layout(bare))`, it succeeds and also writes `nested`;
- when that file is `<svg/>`, it throws `bare: layout disagrees with the
  hand-derived figure.svg`, and nothing is written: `bare` still holds only the
  hand-derived file and `nested` has no directory;
- when the tag `v0.4.0` exists, it throws `v0.4.0 is released; its drawings
  are frozen` and writes nothing;
- for version `0.3.0` it throws `fixtures/0.3.0 is released and is never
  written`.

## Gates outside Vitest

`pnpm typecheck` (which also checks the emitter) and `pnpm lint`, whose
dependency-cruiser rule keeps this package on layout and core.
