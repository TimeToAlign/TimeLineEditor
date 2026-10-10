# `@timetoalign/tilie-layout` tests

`layout(document)` implements the geometry specification of timeskeleton
(`docs/geometry.md` in the timeskeleton repository; "the specification"
below). What proves it is a correct implementation, and not a restatement of
itself:

## 1. Golden geometry, derived by hand and reproduced exactly

timeskeleton ships a golden geometry for every document fixture of the
schema version this package depends on
(`fixtures/<version>/geometry/<name>/geometry.json`). For every fixture,
`dumps(layout(parse(document)))` must equal the golden text byte for byte:
text through the standard writer, so a member order, a number kind (`4`
against `[4, 1]` against `4.0`) or a float spelling that differs fails.

Seven goldens are derived **by hand** from the specification, covering every
element type, in `fixtures/<version>/geometry/README.md` of
timeskeleton, which states every row, position, cascade decision and label
with its arithmetic: `bare` (a timeline, its wedges and labels, the frame),
`contiguous` (first-fit packing, a successor sharing its predecessor's row,
a conflict moving a child out, the joined name column), `nested` (a child
beyond its parent), `map` (the map band beyond the children band, two maps
in conflict), `with_region` (a region below, its brace heights and label),
`flow_control` (a break through the block and its label at the bottom, a
jump band, its base and apex), `styled` (every rank of the cascade across
the document and nested timeline containers, per-property fall-through, a
tie, the filter, projections, length labels, a float frame). They were written before the comparison was run and
never edited from `layout`'s output. The other goldens are written by
`scripts/emit-geometry.ts` of the writers package from `layout` and pin it
against regressions.

## 2. Examples per element and per cascade rank

Each example builds its document through core's commands (no hand-written
manifest) and asserts values derived from the specification in the test
itself:

- **Frame.** A root of int length 6 ticks has a frame of Fraction pairs:
  length `[15, 2]`, names at `[0, 1]` of length `[3, 2]`, plot at `[3, 2]`
  of length `[6, 1]`; a float root of length 0.0 has a frame of floats:
  length `1.0`, names at `0.0` of length `1.0`, plot at `1.0` of length
  `0.0`; positions on an int root are
  JSON integers, on a float root floats.
- **Mixed number types.** A float child of a Fraction root at offset `[1, 2]`
  with length 0.25 starts at `[1, 2]` and ends at the float 0.75 (the tower
  turns the sum into a float); a Fraction child of an int root (unit
  `number`) at offset 3 with length `[1, 2]` ends at `[7, 2]`.
- **Zero-length children** at one point conflict (two rows); one ending
  where a zero-length child starts shares its row.
- **Jumps nested by span**: three jumps 0→8, 2→4 and 5→6 put the two short
  ones on the first jump row and the long one beyond.
- **Break labels**: a break at 4 labelled `Fine` on a one-row block has its
  label at `(4, −1/2)`, anchor `north`, id `r/break/0/label`; with the
  break's side above, at `(4, 1/2)`, anchor `south`; a break without a label
  has none.
- **The cascade on a block**: `visible: false` on the root leaves row 0 in
  `rows` and draws no wedge or name for it, and on a child moves its
  descendants' minimum row to its parent's; a rule setting a property its
  element type does not read changes nothing; a container's rule (a domain
  rule on timeline `a`) colours `a`, its child and their wedges over a
  document rule naming the type, and nothing outside `a`; a container under
  an unknown timeline id selects nothing.
- **The cascade module**, one example per rank of section 2.5 on one wedge
  (`cascade.test.ts`): an id rule of the document over a type-and-domain
  rule at depth 3; the nearest container (an empty selector at depth 2) over
  a type-and-domain rule at depth 1, in either order; the type over domain
  plus modality in one container; type plus domain over type, domain plus
  modality over domain, domain over the empty selector; a tie to the later
  rule; colour from depth 2 with the side falling through from depth 1; a
  rule missing one member ignored. `scopedRules` lists the document's rules
  at depth 0 and each container on the path at its depth (a root at 1, its
  grandchild at 3), skipping containers off the path.

## 3. The cascade module, by properties

`resolveStyle` is checked by fast-check over arbitrary rules (with container
depths 0 to 3) and elements:

- every property equals a reference written in the test straight from the
  specification, without the module's helpers: among the matching rules that
  set the property, the greatest by (names the id, container depth, names
  the type, number of domain and modality named), the later of equals, or
  the default;
- appending a rule that matches nothing changes nothing.

## 4. Properties of `layout` over edited documents

From every golden document fixture, fast-check runs command sequences from
core's generator (`core/tests/generate.ts`, reused, not copied), applying
those core accepts. After each sequence, with a graphical block drawn from a
small arbitrary (document rules, and rules of containers keyed by ids the
document may or may not hold): `layout` returns; its output validates against
the geometry schema (`validateGeometry`); no two primitives of one row and
one band conflict in extent (lines, maps, regions, jumps, by the conflict
rule of the specification); a child starting where an earlier sibling on
its side ends shares that sibling's row, unless it took a row nearer the
root or a primitive placed before it in that row conflicts with it (first
fit); every row of a primitive lies within `rows`; `layout` of the same document twice
gives the same text.

## 5. Gates outside Vitest

`pnpm typecheck` (strict) and `pnpm lint`, whose dependency-cruiser rule
keeps this package on core alone.
