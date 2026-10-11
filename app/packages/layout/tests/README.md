# `@timetoalign/tilie-layout` tests

`layout(manifest, overrides, options)` returns the one lossless geometry
`Block` for one TimeSkeleton manifest. It implements the geometry
specification of timeskeleton (`docs/geometry.md` in the timeskeleton
repository; "the specification" below) and adds block overrides and
name-column options as cascade levels. Tests compare exact values, and text
written with `compactJson`. Manifests are loaded from the 0.4.0 fixtures or
built through core's commands; no manifest is written by hand.

## Regression against the 0.3.0 geometry (`regression.test.ts`)

timeskeleton ships a geometry JSON for every 0.3.0 envelope
(`fixtures/0.3.0/geometry/<name>/geometry.json`). Seven of them (`bare`,
`contiguous`, `nested`, `map`, `with_region`, `flow_control`, `styled`) are
derived by hand from the specification, with every row, position, cascade
decision and label and its arithmetic written out in
`fixtures/0.3.0/geometry/README.md`; the others were written by this layout
and pin it against regression.

There are exactly 34 manifests in `fixtures/0.4.0/`. For each, the block
`layout(manifest)` equals the block of the matching 0.3.0 geometry whose id is
the manifest's root id, as compact text written by `compactJson` (so a member
order, a number kind such as `4` against `[4, 1]` against `4.0`, or a float
spelling that differs fails). The matching geometry is:

- for `bare`, `contiguous`, the six continuous and discrete class manifests,
  `corpus_audio_audio`, `corpus_midi_score_midi`, `corpus_score_ms3`,
  `corpus_supra_iiif`, `flow_control`, `map`, `nested` and `with_region`: the
  sole block of the 0.3.0 geometry of the same name;
- for `styled__perf` and `styled__score`: the blocks `perf` and `score` of the
  geometry of `styled`;
- for each `conversion_maps__*` and `corpus_parangonar_parangonada__*`
  manifest: the block with that manifest's root id in the geometry of the
  unsplit 0.3.0 envelope, `conversion_maps` or `corpus_parangonar_parangonada`.

## Frames and numbers (`examples.test.ts`)

Each example builds its manifest through core's commands and asserts values
derived from the specification in the test itself.

- **Frame.** A root of int length 6 ticks has a frame of Fraction pairs: length
  `[15, 2]`, names at `[0, 1]` of length `[3, 2]`, plot at `[3, 2]` of length
  `[6, 1]`, and its timeline primitive runs from `0` to `6`. A float root of
  length `0.0` has a frame of floats: length `1.0`, names at `0.0` of length
  `1.0`, plot at `1.0` of length `0.0`, placement scalar `1.0` and offset
  `0.0`. A length-8 root with the name width `[1, 2]` has frame length
  `[12, 1]`, names length `[4, 1]`, plot at `[4, 1]` of length `[8, 1]`. With
  the name column hidden, the frame length is `[8, 1]`, names length `[0, 1]`,
  plot offset `[0, 1]`, and no name label `r/name` is emitted.
- **Mixed number types.** A float child of length `0.25` at offset `[1, 2]` in
  a Fraction root starts at `[1, 2]`, ends at the float `0.75` and carries the
  label `0.25 ♩`. A Fraction child of length `[1, 2]` at offset 3 in an int
  root of unit `number` starts at the integer `3`, ends at `[7, 2]` and
  carries the label `1/2 number`.

## Elements and rows (`examples.test.ts`)

- **Break label.** A break at 4 labelled `Fine` on a length-8 root has exactly
  the label `{kind: "label", id: "r/break/0/label", timeline: "r", at: {space:
  "root", x: [4, 1], y: [-1, 2]}, anchor: "north", text: "Fine", colour:
  "#000000"}`. With the style rule `side: "above"` on breaks it is at
  `y: [1, 2]`, anchor `south`. A break without a label emits no label.
- **Rows.** Two zero-length children at offset 2 conflict and take rows 1 and
  2 (`y`, `z`); a child of length 2 at offset 0 ending where they start takes
  row 1 (`c`). Result: `c` row 1, `y` row 1, `z` row 2.
- **Jumps nest by span.** On a length-8 root the jumps 0→8, 2→4 and 5→6 are
  `r/jump/2` and `r/jump/1` on row −1 and `r/jump/0` on row −2, each with base
  `[-1, 2]`; `rows` is `{min: -2, max: 0}`; the label `r/jump/0/label` is at
  `x: [4, 1]`, `y: [-15, 8]`, anchor `north`, text `repeat_end`.

## The cascade on drawn components (`examples.test.ts`)

On a root `r` (length 8, name `Root`) holding `a` (length 8) holding `b`
(length 2 at offset 1):

- `visible: false` on the timeline element hides `r`, `r/start` and `r/name`
  and keeps row 0: `rows` is `{min: 0, max: 2}`.
- `visible: false` on the id `a` leaves only the child `b`, on row 1, and
  `rows` is `{min: 0, max: 1}`.
- A rule setting `show_length` on wedges emits no `/length` primitive.
- A manifest rule colouring children `#000001` and a container rule on `a`
  colouring the logical domain `#000002`: `r` and `r/start` keep `#00CC00`; `a`,
  `b` and `b/start` are `#000002`.
- A container keyed by the unknown id `ghost` selects nothing: the children are
  exactly `a` and `b`.
- A rule `side: "below"` on children puts `a` on row −1 and `b` on row −2.

## The cascade module (`cascade.test.ts`)

Rank is compared as: level, whether the rule names ids, container depth,
whether it names the element type, the number of domain and modality it names;
among equal ranks the later rule wins. A rule's level is 3 for block
overrides, 2 for the manifest's own rules and timeline containers, 1 for
option defaults, and built-in defaults are level 0 (`defaultStyle`). One
example per rank, on one wedge:

- defaults follow the table of the specification;
- an id rule at depth 0 (`#000002`) beats a type-and-domain rule at depth 3
  (`#000001`);
- the nearest container (an empty selector at depth 2, `#000002`) beats a
  type-and-domain rule at depth 1, in either order;
- the type (`#000001`) beats domain plus modality (`#000002`) within one
  container, in either order;
- type plus domain beats type (`#000002`); domain plus modality beats domain
  (`#000004`); domain beats the empty selector (`#000003`);
- a tie goes to the later rule: `[first, second]` gives `#000002`,
  `[second, first]` gives `#000001`;
- each property resolves on its own: colour `#000002` from depth 2 with side
  `above` falling through from depth 1;
- a rule missing one member (`modality: "discrete"` on a continuous wedge) is
  ignored, giving the built-in `#00CC00`;
- a block override (level 3, empty selector, `#000002`) beats a manifest id
  rule (level 2, `#000001`); a manifest type rule (`#000002`) beats an
  option-defaults id rule (level 1, `#000001`); option defaults (`#000001`)
  beat only the built-ins (`#00CC00`);
- `scopedRules` lists the manifest's rules at depth 0 and each container on the
  path at its depth (a root at 1, its grandchild at 3), skipping containers
  off the path.

`resolveStyle` is also checked by fast-check over arbitrary rules (levels,
container depths 0 to 3) and elements: every property equals a reference
written in the test straight from the specification, without the module's
helpers (among the matching rules that set the property, the greatest by
level, names the id, container depth, names the type, number of domain and
modality named; the later of equals; else the default), and appending a rule
that matches nothing changes nothing.

## Properties of `layout` over edited manifests (`properties.test.ts`)

From every 0.4.0 fixture, fast-check runs command sequences from core's
generator (`core/tests/generate.ts`, reused, not copied), applying those core
accepts. After each sequence, with a graphical value drawn from a small
arbitrary (manifest rules, and rules of containers keyed by ids the manifest
may or may not hold), `layout` returns a block that satisfies, in order:

- it validates against the 0.3.0 geometry schema when wrapped as
  `{meta: {schema_version: "0.3.0"}, blocks: [block]}`;
- no two primitives of one row and one band conflict in extent (lines, maps,
  regions, jumps, by the conflict rule of the specification);
- a child starting where an earlier sibling on its side ends shares that
  sibling's row, unless it took a row nearer the root or a primitive placed
  before it in that row conflicts with it (first fit);
- every row of a primitive lies within `rows`;
- `layout` of the same manifest twice gives the same compact text.

## Gates outside Vitest

`pnpm typecheck` (strict) and `pnpm lint`, whose dependency-cruiser rules keep
this package on core alone.
