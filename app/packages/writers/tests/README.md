# `@timetoalign/tilie-writers` tests

`writeSvg` and `writeTikz` implement the page, the number formatting rule
and the two output profiles of the timeskeleton geometry specification
(`docs/geometry.md`, section 8). What proves them:

## 1. Golden figures, byte for byte

For every golden geometry of timeskeleton
(`fixtures/<version>/geometry/<name>/`), `writeSvg(geometry)` must equal
`figure.svg` and `writeTikz(geometry)` must equal `figure.tex`, byte for
byte, with the default options. The geometry is read from the golden
`geometry.json` with `parseJson`, so the writers are checked against the
golden geometry and not against `layout`.

## 2. Hand-derived values

The examples below are computed from the specification in the test, on the
`bare` and `flow_control` goldens and on literal numbers:

- **Number formatting**: `80`, `12.5`, `1/3` → `0.3333`, `2/3` → `0.6667`,
  `-6`, `-1/3` → `-0.3333`, `1/40000` → `0` (never `-0` for `-1/40000`),
  `0.00025` → `0.0002` and `0.00035` → `0.0004` (ties to even),
  `0.99995` → `1` and `1.00005` → `1` (ties to even at the integer),
  the float `0.1` (exactly 3602879701896397/2^55) → `0.1`, the integer
  `123456789012345678` unchanged.
- **The page of `bare`**: frame 10, so a root position `x` lies at
  `(2 + x) × 400 / 10`: the line runs from 80 to 400, one row of 32, the
  SVG canvas 432 by 64 with view box `-16 -16 432 64`; the line at SVG
  ordinate `0 + (0 + 1/2 − 0) × 32 = 16` and TikZ ordinate
  `32 − 0 − 32 + (0 − 0 + 1/2) × 32 = 16`; the end wedge's base at row
  `-1/8`, SVG ordinate `16 + 4 = 20`; the wedge label (anchor `north`) has
  its SVG baseline at `20 + 7.25 = 27.25`; the name label at `x = 0 + 2`.
- **`flow_control`**: frame 20, rows −1 to 0, height 64; the break at 12
  lies at `(4 + 12) × 20 = 320`, from SVG ordinate 64 (bottom, row −3/2) to
  0 (top, row 1/2); the jump from 8 (240) to 2 (120) has its ends at row
  −1/2 (SVG 32), its controls at row `−1/2 + 4/3 × (−7/8 + 1/2) = −1`
  (SVG 48), and its stealth at `(120, 32)` pointing up.
- **Blocks stacked**: two blocks of heights 32 and 64 have SVG tops 0 and
  48 and a page 112 high.
- **The name column ellipsis**: with `width` 100 the name column of a frame
  `[5, 1]` with names `[1, 1]` is 20 wide, so `⌊(20 − 4) / 4.2⌋ = 3` code
  points fit: `Bare` becomes `Ba…`; with `width` 40 the column is 8 wide and
  no code point fits, so the label is not written.
- **Escaping**: a label `a<b&c` is written `a&lt;b&amp;c` in SVG and a
  label `50% #1 {x}_y \ ~ ^ $ &` as `50\% \#1 \{x\}\_y \textbackslash{}
  \textasciitilde{} \textasciicircum{} \$ \&` in TikZ; a tab becomes a
  space in both.
- **Unknown kinds** are skipped: a geometry with an extra primitive of kind
  `strip` writes the same text as without it.
- **TikZ without the preamble** (`standalone: false`) is the
  `tikzpicture` environment alone, the same lines as inside the document.

## 3. The SVG parses, the TikZ compiles

- Every golden `figure.svg` is parsed by Python's `xml.etree.ElementTree`
  (run with `python3`, no package added), and its root is the SVG element.
- Every golden `figure.tex` is compiled by `lualatex` and must exit 0. Where
  `lualatex` is absent the test is skipped with that reason, unless
  `TILIE_REQUIRE_LUALATEX` is set, as the CI job installing TeX Live sets it:
  then its absence fails.

## 4. Gates outside Vitest

`pnpm typecheck` and `pnpm lint`, whose dependency-cruiser rule keeps this
package on layout and core.
