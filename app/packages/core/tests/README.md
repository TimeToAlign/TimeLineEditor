# `@timetoalign/tilie-core` tests

`core` holds exact coordinates, one TimeToShare manifest of TimeToShare's
`SCHEMA_VERSION` (`{timetoshare, timelines, id?, name?, meta?, groups?,
graphical?}`: root timelines, optionally named, optionally grouped), the
elements a selector can match, the immutable workspace view of blocks, the
four commands `add`, `set`, `remove` and `style` over addresses, the store
with its command journal and editor sessions, and the workspace file. This
file states what proves each part works; a test that cannot be traced to a
paragraph here does not belong in the suite.

General rules: exact values only (`toEqual`/`toBe` against literal
expectations or against a value reached by another path); no thresholds
except the budgets, stated as the requirement they test; no network;
nothing written outside temporary state. Block ids in examples are `A =
"0000000000"`, `B = "0000000001"`, `C = "0000000002"`, or `bundle0001`
where a section says so. A view given to a command is deep-frozen, so a
mutation throws.

**Addresses in this file.** An address is an object (TimeToShare's
drawing specification, section 2.2): `{}` the workspace, `{block: A}` a
block, `{block: A, id: "score"}` the element with the ID `score` of block
`A`'s manifest, `{block: A, id: "score", facet: "regions"}` a band,
`{block: A, id: "score", part: ["end", "label"]}` a part. Where a path
below names an address, it holds the address's one string form,
`addressKey`; where a message names one (`<address>`), it holds the
address's words, `addressWords` in the view the message is about
("Addresses and containers", item 15): the path `[{block: A, id: "clt_3"}, "length"]` stands for
`['{"block":"0000000000","id":"clt_3"}', "length"]`, the workspace's
`[{}, "name"]` for `["{}", "name"]`. A path that starts with a bare block
id (`[A, "manifest", …]`, `[A, "places", …]`, `[A, "x"]` in the view
check or the guard) is a location in the view, not an address.

**Where manifests come from.** Every manifest is a fixture of the
installed TimeToShare package: `fixtures/<SCHEMA_VERSION>/` with its
`groups/` and `bundles/`, each in the complete form beside its minimal twin
(`<name>.minimal.json`), and the shared rejection cases of
`fixtures/rejections/<SCHEMA_VERSION>/`. A variant is built from a fixture
through commands, or by changing the fixture's value before loading it
(lifting a lock by stating `locked: false` is one such change). Core holds
no manifest literal of its own except where a rejection or a single rule
is asserted, and never names one like a fixture. So the suite proves core
against whatever TimeToShare ships. The manifests named most often:

- `bare.json`: root `bare` "Bare", 8 quarters.
- `nested.json`: root `clt_1` of 16, child `clt_3` at 4 of 8, its child
  `clt_2` at 3/2 of 2, both locked.
- `map.json`: root `melody` with the map `tempo`, child `phrase` at 2 with
  the map `ticks` (addressed `{id: "ticks"}`: every ID is unique across a
  manifest, so an element is addressed by its ID wherever it lies).
- `segment_line.json`: root `form` of 32 with the segments `a` 0–8, `b`
  8–20 and `c` 20–32, each a locked segment line; `b` holds `b1` 0–6 and
  `b2` 6–12, `c` holds `c1` 0–12.
- `bundles/bundle_mixed.json`: named "Mixed", no id. Roots `annotations`
  (regions `region_1` "Verse" and `region_2` "Chorus"), `score` (12
  quarters; maps `cmap_1` and `cmap_2`, jump `jump_from_1` "Repeat"),
  `performance` (seconds, map `cmap_3`), `page` (pixels, map `cmap_4`) and
  `recording` (samples, map `cmap_5`); `recording` holds the child
  `excerpt` at 44100, whose map is `cmap_6`. `group_1` "Performance" of
  `performance` and `score`, display order `score`, `performance`;
  `group_2` "Facsimile" of `excerpt` and `page`, display order `page`,
  `excerpt`. The block holds the frames `group_1` and `group_2` and the
  card of the ungrouped root `annotations` (its items); the frames hold the
  cards of the members `score`, `performance`, `page` and `excerpt`;
  `recording` holds a member, so it is drawn in no card, only as
  `excerpt`'s ancestor line.
- `bundles/bundle_shared_member.json`: roots `t` (quarters), `u` (seconds)
  and `v` (pixels); `g1` of `t`, `u` and `g2` of `t`, `v`: `t` has a card
  in each frame.
- `bundles/bundle_free_ids.json`: roots `https://example.org/piece/score`
  (quarters, region `https://example.org/piece/score#exposition`) and
  `perf/take 2` (seconds, region `take 2/intro`), both members of
  `group_1`; one statement selects `{addresses: [{id: "take 2/intro"}]}`.
- `groups/group_child_member.json`: group `group_1` "Second half", display
  order `second-half`, `recording`; root `piece` holds the member
  `second-half` at 8; root `recording`.
- `groups/group_number_types.json`: group `group_1` "Edition" of the roots
  `page`, `performance`, `score`, display order `score`, `page`,
  `performance`; `groups/group_styled.json` is the same with `graphical`
  styles and statements beside its `order`.

## Package name (`name.test.ts`)

The package exports its name, `"@timetoalign/tilie-core"`, as every
workspace package does; the editor shell lists the names it links.

## Exact numbers (`number.test.ts`)

`Rational` is the exact number behind every `fraction` coordinate.

1. **Normalization.** Every constructor result has a positive denominator
   and coprime numerator and denominator: `[2, 4]` is `1/2`, `[3, -6]` is
   `-1/2`, `[0, 5]` is `0/1`, the string `"-12"` is `-12/1`. Equality is
   exact component equality after normalization, so `[2, 4]` equals `[1, 2]`.
2. **No float constructs a Rational.** `0.5`, `2 ** 53` and `NaN` are
   refused with a `TypeError`; a safe integer (`3`) and a bigint above
   `2 ** 53` are accepted; a zero denominator is refused with a
   `RangeError`; a non-integer string (`"1.5"`, `"1/2"`) is refused.
3. **Arithmetic.** `1/3 + 1/6 = 1/2`, `1/2 - 3/4 = -1/4`; `compare`
   returns exactly `-1`, `0` or `1`, and orders `-1/2 < 1/3 < 1/2`. Values
   above `2 ** 53` add exactly (`(2^62 + 1)/1 + 1/1 = (2^62 + 2)/1`).
   `2/3 × 9/4 = 3/2`, `1/2 ÷ 3/4 = 2/3`, a division by zero is a
   `RangeError`; `floor` gives `3` for `7/2`, `-4` for `-7/2`, `-3` for `-3`
   and `0` for `1/3`. `fromFloat` gives a float's exact binary value, as
   Python's `Fraction(float)`: `0.1` is `3602879701896397/2^55`, `-2.5` is
   `-5/2`; it serves exact arithmetic on a float (a writer's page), never a
   stored coordinate. `toFloat` rounds every rational directly to binary64,
   including the subnormal range: `2^-1074` is the least positive double,
   `2^-1075` ties to even zero, `3 × 2^-1075` ties to the even second
   subnormal, and the corresponding negative values preserve their sign
   (including negative zero). Values on both sides of a normal rounding
   midpoint and the boundary between the largest subnormal and the least
   normal are pinned exactly.
4. **Bare values mirror the library.** `readAxisValue(value, numberType)`
   and `axisCoordinate(value, {unit, number_type})` follow
   `timetoalign.core.time.number_from_json`, `toAxisValue` follows
   `number_to_json`: an `int` value reads a JSON integer, or an integral JSON
   number as that integer; a `float` value reads a JSON number, or an
   integer as the float it equals exactly; a `fraction` value reads only a
   pair of integers with a positive denominator; every integer is
   int64-bounded. One accepted and one refused example per rule, refused
   ones carrying the `CoordinateError` code `invalid_coordinate` at the path
   given (`[]` by default). `toAxisValue` writes numbers as TimeToShare's
   `parse` reads them: an `int` value as a plain number (a `bigint` beyond 2^53), a
   `float` value as a plain number or, when integral, a `JsonFloat` (so 3 is
   written `3.0`), a `fraction` value as a normalized `[numerator,
   denominator]` pair. TiLiE reads no position on another axis, so it holds
   no coordinate dict reader or writer.
5. **One axis only.** Adding, subtracting or comparing coordinates of
   different units or number types throws `AxisMismatchError` (code
   `axis_mismatch`); within one axis `int` arithmetic is bigint arithmetic,
   `float` is IEEE double arithmetic (as Python's), `fraction` is `Rational`.
6. **A child's end across number types.** A child shares its parent's unit
   but may have another number type. Its end (offset plus child length) and
   the comparisons against it follow Python's numeric tower: an int or a
   Fraction is exact, a sum with a float is a float with each exact operand
   correctly rounded first, and a float compares with an exact value
   exactly. Pinned cases: int parent and Fraction child (3 + 3/2 = 9/2,
   above 4, below 5); Fraction parent and int child (7/2 + 2 = 11/2); float
   parent and int child (3.5 + 2 = 5.5); 0.1 > 1/10; the rounding of 1/3, of
   (2^62 + 1)/3 and its negative, and of
   6402900570728149493/7435617913856420575 (0.8611121019002628, where
   dividing the two doubles gives 0.8611121019002627). A value is expressed
   on an axis only when its number type holds it exactly: 9/2 not as an int,
   1/3 not as a float, 1e-300 not as an int64 Fraction.

## Manifest load and save (`manifest.test.ts`)

Reading, writing, the canonical order and the defaults are
`@timetoalign/timetoshare`'s and proven in its suite; these tests prove that
`core` uses them so that nothing is lost. A loaded manifest is held in its
complete form, every number a `JsonNumber` (a `bigint` beyond 2^53, a
`JsonFloat` for an integral float such as `600.0`) except in declarations.

Every manifest enters core through one boundary: the schema check, then
completion, canonical order, segment unlocking, the invariants and the
styles, in that order. Loading text, reading a workspace file and a
command's result all pass it. Its invariant problems come in traversal
order, root by root, with paths starting at `["timelines", <index>]` and a
child at `[…, "children", <index>]`; saving a manifest that fails it throws
`InvalidManifestError` carrying the complete exact problem list.

1. **Fixture round trip.** For every manifest fixture,
   `saveManifest(loadManifest(text))` equals `text` byte for byte, with no
   skip and no normalization in the comparison. Each minimal twin reads to
   the same manifest: `saveManifest(loadManifest(twin))` equals the
   fixture's text and `saveManifest(loadManifest(twin), {minimal: true})`
   the twin's. The twins are no fixtures of their own in the suites that
   iterate every fixture (the properties and the budgets), which would only
   run each manifest twice.
2. **Shared rejections.** Every shared rejection case, written as JSON text,
   is refused by `loadManifest` with exactly one problem whose `path` equals
   the case's `path`. These include TimeToShare's identity and
   representation rules (an ID repeated anywhere in the manifest, an ID
   holding a control character, an address of a statement of the wrong
   shape, a band order in the former string form, a jump origin's `target`
   naming no jump target of its timeline, a measure view naming no measure
   map, an `int` on a `fraction` axis),
   all `schema_violation`s from its `validate`, so `core` checks none of
   them again; a `non_finite` case is refused with its number in place.
3. **The version marker.** `bare.json` with `"timetoshare": "0.6.0"` is
   refused with exactly one problem `{code: "schema_violation", path:
   ["timetoshare"]}`; without the marker it is refused with exactly one
   `schema_violation` at `[]`. Core reads the current version only and
   migrates nothing.
4. **The minimal form in, pinned by hand.** For the twin of `bare.json`
   (its `meta` left out) the complete root is exactly `{id: "bare", name:
   "Bare", unit: "quarters", number_type: "fraction", length: [8, 1],
   locked: false, is_segment_line: false, meta: {}, children: [],
   conversion_maps: [], regions: [], flow_control: []}` and the manifest
   around it `{timetoshare, name: null, meta: {}, groups: [],
   measure_maps: [], timelines: [root]}`: no `id` and no `graphical`, whose
   default is "absent".
5. **Unknown keys survive.** `bare.json` with an unknown key at the top
   (`"x-top": 1`), on the root (`"x-root": {"a": [1, 2]}`) and on a region it
   is given (`"x-region": "kept"`) loads with all three in place; after a
   `set` of the root's `name` and an `add` of a flow marker, all three are still
   there with their values, and `saveManifest` writes them. `unknownKeys`,
   re-exported from TimeToShare, lists exactly the three `{path, key}`
   pairs, sorted by path then key.
6. **Missing styles are completed.** A graphical statement naming each of
   two absent styles produces exactly one warning naming both, the one
   TimeToShare issues (`Missing graphical styles: 'a', 'z'`, names sorted
   by code point); core adds none of its own. The loaded manifest contains
   an empty declaration for each. The input object is not mutated and a
   declaration already present is preserved.
7. **Exact integers.** `discrete_logical.json` with its length value `480`
   replaced by `9007199254740993` (2^53 + 1) loads as the `bigint` and saves
   it as written; `continuous_logical.json` with its length Fraction
   numerator `12` replaced by `9007199254740993` loads as
   `[9007199254740993n, 1]` and saves it as written.
8. **Save goes through the canonical order.** `bare.json` given two jump
   targets at the same coordinate with the ids `"\u{1F3B5}"` (a surrogate
   pair in UTF-16) and `"～"`, in that order, is written with `"～"` first:
   flow-control elements by coordinate, then id in code-point order, the
   reverse of JavaScript's default sort.
9. **A child of another number type** (a float child of a Fraction parent,
   length `4.0`) loads and saves byte for byte.
10. **Invariant refusal lists every violation.** `with_region.json` changed
    to break three invariants at once (`clt_2` given a region `region_2`
    from `[1, 1]` to `[0, 1]`, `clt_3` placed at `[-1, 1]`, the root's
    region ending at `[0, 1]`, before its start) is refused with exactly
    `negative_child_offset` at `clt_3`'s offset (`["children", 0,
    "offset"]`: at `-1` it comes first in canonical order),
    `region_end_before_start` at `clt_2`'s region (`["children", 1,
    "regions", 0, "end"]`, a child's own checks and its subtree before its
    next sibling) and `region_end_before_start` at the root's region (a
    timeline's own regions after its children), in traversal order, each
    path below `["timelines", 0]`, and `saveManifest` of the same value
    throws `InvalidManifestError`.
11. **Each invariant at load and in a command.** For each of
    `number_type_not_allowed` and `region_end_before_start`, one copy of
    `with_region.json`
    changed in exactly that respect is refused with exactly one problem:
    that code at the exact path. `invalid_coordinate` is reached through
    commands only (a value the schema's representation check would refuse
    at load). A command meets the same invariants: in a block of
    `with_region.json`, `set` of `{block: A, id: "region_1"}`'s `end` to `[0, 1]` is
    `region_end_before_start` at `[A, "manifest", "timelines", 0,
    "regions", 0, "end"]`.
12. **A child's unit and extent and a map's source unit are the
    schema's.** TimeToShare's `validate` refuses a child whose unit
    differs from its parent's, a child reaching past its parent's known
    length and a map whose non-null source unit is not its timeline's, so
    core holds no check of its own for any of them. One copy of `with_region.json` with `clt_2`'s
    unit `whole_notes` is refused with exactly one problem,
    `schema_violation` at `["timelines", 0, "children", 0, "unit"]` with
    the validator's message `child 'clt_2' has unit 'whole_notes', its
    parent 'clt_1' has 'quarters'`; one with `clt_2`'s offset `[9, 1]`
    (length 4, in a parent of 12) with exactly `schema_violation` at
    `["timelines", 0, "children", 1, "length"]` (placed at 9, it comes
    after its sibling at 2 in canonical order), message `child 'clt_2' ends
    at [13, 1], beyond the length [12, 1] of its parent 'clt_1'`. A
    conversion map's source unit is the format's rule too: one copy whose
    root `clt_1` (`quarters`) holds a `LinearMap` `seconds` with
    `source_unit` `seconds` is refused with exactly `schema_violation` at
    `["timelines", 0, "conversion_maps", 0, "source_unit"]`, message
    `LinearMap 'seconds' has source unit 'seconds', its timeline 'clt_1'
    has 'quarters'`. Each message is passed on unchanged, so a test pinning
    it fails if core rewrites it.
13. **A negative child offset is core's to refuse.** The schema accepts a
    child starting before its parent's origin; core does not support it
    yet. One copy of `with_region.json` with `clt_2`'s offset `[-1, 3]` is
    refused with exactly one problem, `negative_child_offset` at
    `["timelines", 0, "children", 0, "offset"]`, message `A negative child
    offset is not supported yet: child 'clt_2' has offset [-1, 3].` (the
    offset spelled as TimeToShare's writer writes the number). The same
    refusal on an `int` and on a `float` axis: a root `take` of 10 `ticks`
    whose child `part` of 2 lies at `-1` gives `... child 'part' has offset
    -1.`, and a root `take` of `10.0` `seconds` whose child `part` of `2.0`
    lies at `-1.0` gives `... child 'part' has offset -1.0.`, each at
    `["timelines", 0, "children", 0, "offset"]`. A root's offset may be
    negative: `negative_offset.json` (root `recording` at `-2.5`) is in the
    round trip of item 1.
14. **Segments read unlocked.** A segment that is no segment line is never
    locked, its line's lock governing it, whatever the file states:
    `segment_line.json` with `b1` stated `true` and `b2` `false` loads with
    `false` on `a1`, `b1`, `b2` and `c1` and the stated value elsewhere
    (`true` on the segment lines `a`, `b`, `c`, `false` on `form`); `b`
    stated `false` is kept. It saves `"locked": false` on each segment, its
    minimal form leaves it out, and it deep-equals the same file with the
    four segments stating `false`.
15. **Malformed text** is refused with code `invalid_json` at path `[]`.
16. **An entry given to a command** (a map, region or flow-control
    element) is checked by the schema in the timeline that will list it,
    beside the measure maps of its manifest, completed and ordered as a
    command's result is: a minimal `LinearMap` `tempo`, in `melody` of
    `map.json` and in its child `phrase`, comes back in its complete form
    (`name: null`, `offset: 0`); a region whose ID holds a tab
    (`"verse\tchorus"`) is `schema_violation` at `["regions", 0, "id"]`, its path from that
    timeline, which a command reports below its block's manifest; a
    `MeasureRecordMap` `x_record` naming the measure map `bars` reads in its
    complete form (`name: null`) beside `bars`, and without it is
    `schema_violation` at its own `measure_map` (`["conversion_maps", i,
    "measure_map"]`, `i` its place in canonical order, after `melody`'s
    own maps).
17. **Declarations are plain numbers.** `styled__score.json` with its six
    integral declaration numbers spelled `4.0`, `2.0`, … reads equal to the
    fixture and saves to its text, every key in place; 2^53 reads, 2^53 + 1
    is `invalid_value` "9007199254740993 has no exact double" at its member.
18. **An unorderable value** (a region `start` of `"later"`) is refused with
    the schema's first problem at that value.

## Unknown length (`length.test.ts`)

`length: null` means the length is not known, on any timeline: a root, a
child, a locked one. It is a fact, never a violation. Every check needing an
end runs where that end is known and is skipped where it is not. Each case
below is one inline manifest (quarters, `fraction`), so the rule it shows is
the only thing that varies:

1. **Accepted.** A root of length null; a locked root of length null; a
   child of length null at 4 in a root of 16 (`offset ≤ parent length`
   holds, `offset + child length` is not checked); a child of 8 at 4 in a
   root of length null (no upper bound); a child of length null in a root of
   length null; each loads with no problem and saves with `"length": null`.
2. **Checked.** A child of length null at 20 in a root of 16 is refused by
   the schema with exactly `schema_violation` at `["timelines", 0,
   "children", 0, "offset"]`, message `offset [20, 1] of 'part' is beyond
   the length [16, 1] of its parent 'score'`; a child of length null at −1
   is refused by core in a root of 16 and in a root of length null alike:
   exactly `negative_child_offset` at the same path, message `A negative
   child offset is not supported yet: child 'part' has offset [-1, 1].` The
   sign check needs no end, so a length of null cannot switch it off.
3. **`set length` to and from null.** On an unlocked root of 16 holding a
   child of 8 at 4: `length: null` stores null; `length: [12, 1]` on the
   result stores `[12, 1]` (12 = the child's end); `[23, 2]` is
   `length_below_content`. On a root of length null holding a child of
   length null at 6, `[5, 1]` is `length_below_content` (the child reaches
   its offset 6) and `[6, 1]` is accepted. A locked root refuses both
   directions with `locked`. Undoing a `set length` to null in a store
   restores the earlier view object.
4. **Adding content leaves a length unknown.** Into a root of length null,
   `add` a child of 8 at 4 and a region from 2 to 30: the root's length is
   still null. Into an unlocked root of 16, `add` a child of length null at
   20: the root grows to exactly 20 (its offset), as a known child grows it
   to its end.

## A length change never pushes a parent (`length.test.ts`)

A timeline's new length, set directly or grown to hold what is added into
it, stays within its parent's known length: a parent never grows because a
child grew, locked or not. A segment ends where its successor starts, and
the last one where its line ends while the line's length is known, so a
segment's length moves neither. Each case starts from a fixture whose
locks are lifted, by a `set locked` command where one may lift them and
otherwise by the fixture's value stating `locked: false`, so the only rule
in play is the one under test. Each checks the exact length of the edited
timeline and of its parent afterwards, or the exact code and path of the
refusal; none reaches `schema_violation`.

On `nested.json`, both children unlocked:

1. **Set.** `clt_3` length `[12, 1]` is accepted, `clt_1` stays `[16, 1]`;
   `[13, 1]` (end 17) is `child_exceeds_parent` at `[{block: A, id: "clt_3"},
   "length"]`, the same with `clt_1` locked.
2. **Add.** A child `g` of 6 at 5 into `clt_3` grows `clt_3` to exactly
   `[11, 1]` and leaves `clt_1` at `[16, 1]`; a child of 8 at 5 would grow
   it to 13 (end 17) and is `child_exceeds_parent` at `[{block: A, id: "clt_3"},
   "child"]`.
3. **Move.** `clt_2`'s offset `[7, 1]` grows `clt_3` to exactly `[9, 1]`,
   `clt_1` stays `[16, 1]`; `[11, 1]` would grow it to 13 and is
   `child_exceeds_parent` at `[{block: A, id: "clt_2"}, "offset"]`.
4. **A root has no parent.** A child of 4 at 14 into `clt_1` grows it to
   exactly `[18, 1]`.

On `segment_line.json` (`form` unlocked; segments read unlocked):

5. **The last segment of a line of known length.** On `b2`, its length
   `[8, 1]` and `[4, 1]` are each `segment_end_fixed` at `[{block: A, id: "b2"},
   "length"]`; `[6, 1]`, its own, changes nothing and is refused as such
   (`invalid_value`, "the command changes nothing"), never as
   `segment_end_fixed`; `null` is accepted and leaves `b` at `[12, 1]`.
6. **A segment with a successor.** On `b1`, `[4, 1]` is
   `segment_end_fixed` at `[{block: A, id: "b1"}, "length"]` (`b2` starts at 6);
   `null` is accepted.
7. **A line of unknown length.** With `b` stating `locked: false` and `b`'s
   length set to null, `b2` length `[8, 1]` is accepted and `b` stays null.
   The other way round, a segment line ends where its last segment of
   known length ends: with `c` stating `locked: false` and `form`'s length
   set to null, `c` length `[14, 1]` is `segment_end_fixed` at `[{block: A, id: "c"},
   "length"]` (`c1` ends at 12).
8. **A segment grown by what is added.** With `c` stating `locked: false`,
   adding `c2` of 4 at 12 into `c` would grow it to 16 and is
   `segment_end_fixed` at `[{block: A, id: "c"}, "child"]`; after `form`'s length is
   set to null the same `add` grows `c` to exactly `[16, 1]` and `form`
   stays null.

## Invariants (the catalogue)

Every invariant below is checked twice: when a manifest is read, over the
whole manifest, and by every command over the manifest it would leave. The
`Source` column names the timetoalign API that enforces the same rule. Two
rules are the **editor's own**: where the library accepts a manifest and
normalizes it on load (or never meets the case), the editor refuses,
because every manifest the library writes already satisfies the rule and an
editor manifest must save as it was read. They are: region and
flow-control coordinates already on the axis's number type, and a parent
growing only to a point its number type holds exactly. A length of null
bounds nothing (section "Unknown length"); `locked` states whether a
timeline's length is fixed and binds no child to it.

| Code | Invariant | Source in timetoalign |
|---|---|---|
| `number_type_not_allowed` | A timeline's unit admits its number type (discrete units `int` only; `number` all three; other continuous units `float` or `fraction`) | `timetoalign.core.enums.TimeUnit.resolve_number_type` / `allowed_number_types` |
| `invalid_coordinate` | Every own-axis value (a length, an offset, a region's start and end, a flow-control element's coordinate) reads under its axis's number type, every integer is int64-bounded; a child has an offset | `timetoalign.core.time.number_from_json`; the editor's own rule for regions and flow coordinates |
| `child_exceeds_parent` | A command never leaves a child starting past its parent's known length or, where its own length is known too, ending past it (compared as in "Exact numbers" 6). An unlocked parent grows to hold a child placed past its known end (to the child's end, or its offset when the child's length is not known), only to a value its number type holds exactly (an int parent not to 9/2, a float parent not to 1/3) and only within its own parent's known length; a locked parent refuses. Refused at the command's own path (`[address, "length"]`, `[address, "offset"]`, `[into, "child"]`); a manifest cannot break it (the schema refuses such a child) | `ChildrenMixin.add_child` (`timetoalign.timelines.engines.children`); the editor's own rule for the growth |
| `segment_end_fixed` | A segment's new length, set or grown to hold a child added into it, keeps its end where its successor starts, or, for the last segment, where its line ends while the line's length is known; a segment line's new length keeps its end where its last segment ends while that segment's length is known; a length of null is always accepted (a rule of `set` and `add`, checked before the schema's segment contiguity would refuse the manifest) | the segment line's contiguity in `timetoalign.timelines.types` |
| `locked` | A locked timeline's length cannot be set, to a value or to null (a rule of `set`) | `timetoalign.timelines.base.Timeline`, the `length` setter |
| `negative_child_offset` | A child's offset is not negative. The schema accepts it, but neither the editor nor the library supports it yet; a root's offset may be negative | `ChildrenMixin.validate_child`, called by `add_child` |
| `segment_never_locked` | A segment is never locked: reading a manifest unlocks every segment; `set locked: true` on a segment, and an `add` whose value states `locked: true` on a timeline it places as a segment, are refused | `Timeline.lock` and `ChildrenMixin.add_child` refuse to lock a segment |
| `unlocking_not_supported` | A segment line that is a child, a segment or a group member is locked: an `add` placing one locks it, and `set locked: false` on one, or an `add` stating `locked: false` on one, is refused, since lifting that lock is not supported yet. Reading keeps a lock its file states on such a line | `Timeline.lock`; `ChildrenMixin.add_child` and `TimelineGroup.add_timeline` lock a segment line that joins |
| `length_below_content` | A length is not set below the farthest point a child reaches: its end, or its offset when its length is not known (and so never negative; a rule of `set`) | the `Timeline.length` setter |
| `region_end_before_start` | A region's end is not before its start | `timetoalign.timelines.regions.Region` |

An ID unique across the whole manifest and free of control characters (any
other string is an ID: `/`, spaces, URIs and part words alike), a group's members
naming timelines of the manifest, a jump origin's `target` naming a jump
target of its timeline, a measure view's `measure_map` naming a measure map
of the manifest, a child sharing its parent's unit (`ChildrenMixin.validate_child`
in the library), a conversion map's non-null `source_unit` being its
timeline's unit (a held map's, its holder's), segment contiguity and the
representation of every
own-axis value are TimeToShare's rules, checked by its `validate`; names
may repeat.

Rules the library does **not** enforce and this package therefore does not
invent: a child may have another number type than its parent; a region may
lie outside its timeline (negative start, end past the length); flow-control
elements may lie outside it too; a locked timeline still accepts children
within its length, regions, flow control and maps; any number of
flow-control elements may share a coordinate. Measure maps and conversion-map
payloads are carried verbatim: their rules beyond the schema
(`MeasureMap.from_dict`, `ConversionMap.from_dict`) are the server's to
check, not the editor's.

## Elements and selectors (`elements.test.ts`)

A `style` command and the layout's cascade decide which elements a selector
matches by one enumeration of the drawing's tree (drawing.md sections 2.1
and 8.1) and one matcher, `manifestElements` and `selectorMatches`. Each
element is a key `{type, address, timeline, domain, modality, class, facet,
inside}`; `address` is its element address (`{}` for the block), `facet`
the facet a band draws (null for every other element), and `inside` its
holder chain, the types of the elements holding it, outermost first.

What proves it: the oracle is drawing.md. For three fixtures the whole
enumeration is written out by hand from the specification's tree, in tree
order, with every member of every key, and compared exactly; the selectors
are then run over those keys and their matches written out by hand too. A
key held by the wrong element shows as a wrong chain, so the chains are the
check of who holds what.

1. **The enumeration of `map.json`**: twenty-two keys. The block (`block`,
   address `{}`, every other member null, holding nothing), the root's card
   `{id: "melody", part: ["card"]}` beside its line `{id: "melody"}`, then
   per timeline in pre-order its line and name (`{id, part: ["name"]}`) and
   its five bands (`{id, facet}`) in `FACETS` order, each band followed by
   what it holds (children by offset then ID, maps, the root's two wedges
   `{id: "melody", part: ["start"]}` and `["end"]` with their labels
   `["start", "label"]` and `["end", "label"]`, regions, flow markers then
   jump origins with their labels). The maps are `{id: "ticks"}` and
   `{id: "tempo"}`. Every timeline lists all five bands. A band has no
   domain, modality or class, and its facet.
2. **Timeline classes.** The six classes are written out with their units:
   each unit belongs to exactly one class, and the units are exactly the
   schema's (the `const` of every entry of `TimeUnit`'s `oneOf`). A map takes its `target_unit`'s domain and modality, `number`
   included.
3. **Regions, flow markers and jump origins** of `with_region.json` and
   `flow_control.json` are addressed by their IDs, each with a label
   (`{id, part: ["label"]}`), and held by their bands (the whole (type,
   address) list of `flow_control.json` is pinned: `flow_marker`
   `{id: "flow_marker_1"}`, then the `jump_from`s `jump_from_1` and
   `jump_from_2`, each followed by its label); a jump target (`jump_to_1`,
   `jump_to_2`) is no element; in every one-root manifest fixture every
   address is distinct (compared by `addressKey`).
4. **The title** `{part: ["name"]}` follows the block for a manifest with a
   `name` or an `id`, and is absent for an anonymous one.
5. **Matching** over `map.json`, one selector per member (`element`,
   `domain`, `modality`, `class`, `facet`, `addresses`, `within`), bands
   included: a band belongs to its timeline (`within`), `facet` matches the
   bands of that facet in tree order (`{facet: "markers"}` the markers band
   of `phrase`, then `melody`'s), a band has no class (`{class: "regions"}`
   matches nothing), and no selector naming a domain or modality matches
   it; a map's class is its type (`{class: "LinearMap"}` matches both maps
   of `map.json`, `ticks` then `tempo` in tree order). `addresses` matches
   whole addresses: `[{id: "melody", part: ["end", "label"]}, {id:
   "ticks"}]` matches `ticks` and then that label, `[{id: "melody", part:
   ["label", "end"]}]` nothing, `[{id: "phrase", facet: "regions"}]` the
   band, `[{id: "melody", part: ["card"]}]` the card and `[{part:
   ["name"]}]` nothing (the manifest is anonymous). The empty selector
   matches every key. On `bundles/bundle_free_ids.json` its statement's
   selector `{addresses: [{id: "take 2/intro"}]}` matches exactly the region
   `take 2/intro` of `perf/take 2`: an ID is matched whole, never split.
6. **`inside`** matches what an element of the named type holds at any
   depth, never the holder: inside the block every key but the block, inside
   the line every key after it; a hand-built chain (`[block, frame,
   timeline, ancestor]`) proves the matcher reads the chain and nothing
   else.
7. **Segment lines** of `segment_line.json`: a segment that is a segment
   line is a `child` without a name, one that is not has type `null` (no
   selector naming `element` matches it, and it adds nothing to the chains
   below it); boundaries (`{id: "b", part: ["start"]}`) and labels are held
   by the segment line directly, in no band. The full (type, address) list,
   the boundary of `b`'s whole key and the chains of `b`'s label, `b2`'s
   marks and `a1` with its bands are pinned, and so are the matches of
   `{element: "boundary"}`, `{element: "child"}`, `{addresses: [{id:
   "b"}]}` and `{within: "b"}`.
8. **Bands of a root, a child and a segment**: `{element: "band", facet:
   "regions"}` matches every regions band, and the default statement
   `{element: "band", facet: "regions", inside: "band"}` every one but the
   root's; `{inside: "band"}` matches everything but the block, the root's
   card, line, name and bands, and its segments' parts.

The elements of manifests with several roots and groups are in "Several
roots and groups".

## Bands and band orders (`bands.test.ts`)

The band facts (drawing.md §2.2, §4, §6.4; TimeToShare's README,
"Identity" and "Groups and the `graphical` block") and the orders that stack
them. Every expected value is read from those texts. A band is addressed
`{id: T, facet: F}` (see "Addresses and containers"); a band order is a
permutation of `line` and the five facets, the same words for every
timeline. The band order cases are built so that each timeline's expected
order differs from every other candidate rule (the default, the root's
entry, its parent's entry), so a wrong rule cannot pass by coincidence; the
order problems are checked against TimeToShare's own validators, so core and
the schema agree by construction.

1. **Facets.** `FACETS` lists the five facets in the default band order's
   order (`children`, `conversion_maps`, `markers`, `regions`,
   `flow_control`); `isFacet` holds for exactly those, never for `line`,
   `region`, `card` or a number.
2. **The default band order** is drawing.md §4's: `DEFAULT_BAND_ORDER` is
   exactly `["children", "conversion_maps", "line", "markers", "regions",
   "flow_control"]`, `LINE` is `"line"`.
3. **Effective and inherited band orders** on `nested.json` under three
   pairwise different orders (the default `D`, the README's example `R` =
   `["children", "markers", "line", "conversion_maps", "regions",
   "flow_control"]`, a third `K` = `["flow_control", "line", "children",
   "conversion_maps", "markers", "regions"]`): a root without an entry
   takes `D`, a descendant its parent's order verbatim (with `clt_1: R`,
   `clt_3` and `clt_2` draw `R`; with `clt_3: K` too, `clt_2` draws `K`), an
   entry wins for its own timeline only; a member that is a child follows
   its parent (`second-half` of `group_child_member.json` under `piece: R`
   draws `R`, the root member `recording` `D`); an unknown ID gets `D`.
4. **Band order problems**, each the first in the README's order (shape,
   repeat, unknown ID, stranger, missing), with the exact message, IDs and
   entries in single quotes: `"line"`, `null`, `{}` and `["line", 1]` give
   `the band order of 'clt_3' is not an array of strings`; `D` with `line`
   appended `'line' is repeated in the band order of 'clt_3'`; `D` as the
   order of `nothing` `'nothing' names no group or timeline of this
   manifest`; `D` with `region` appended `'region' is not 'line' or a
   facet, in the band order of 'clt_3'`, and so for the timeline's own ID
   in place of `line` and for the former band address `clt_3/regions_1` in
   place of `regions` (a stranger comes before what is missing); `D`
   without `markers` `'markers' is missing from the band order of
   'clt_3'`, without `line` the same for `line`, and `[]` the same for
   `children`, the first in the default band order's order. The stranger
   and missing messages are also what TimeToShare's identity check reports
   first for the same value.
5. **Entries the schema's pattern refuses** (an empty string, an entry
   holding a control character) are refused by both: core as a stranger,
   the schema at the entry (`["graphical", "order", "clt_3", 6]`) with its
   pattern; every value core accepts the schema accepts and every value it
   refuses the schema refuses.

## Workspace view, ids and order (`workspace.test.ts`, `workspace-ids-order.test.ts`)

The view is `{meta, name, settings, blocks}`; an empty one carries the
format marker `{format: "tilie-workspace", version: 6}`, the name
`untitled` and the default settings
`{grid: {size: 8, snap: true}, blockDefaults: {scale: 1, length: 400,
spacing: 8, margin: 0, width: null, height: null}, graphical: {}}`, the
drawing specification's placement defaults plus the block's scale (the
block's `spacing` 8 is the gap between its items, its `margin` 0 the empty
space above its first item and below its last, drawing.md §8.4, §8.6). A
block has exactly its thirteen members (`id`, `parent`, `index`, `x`, `y`,
`scale`, `length`, `spacing`, `margin`, `width`, `height`, `places`,
`manifest`) and records
no kind; a band order is no placement but the manifest's.

1. **Checking a view** pins one exact code and path per rule, each under
   `["blocks", <id>, …]`: a parent cycle, a key that is not the block's id,
   an invalid id, an unknown parent, a repeated sibling index, a non-finite
   position, a non-positive size (`width` and `height` may be null), a
   negative `spacing` or `margin` (`invalid_value`; 0 is a gap or a margin
   like any other), and a manifest problem prefixed by the block's path.
2. **Block ids** are ten base-36 characters drawn byte by byte, bytes 252 to
   255 refused; fixed byte streams pin the result.
3. **Timeline prefixes** are the six classes' (`clt`, `dlt`, `cpt`,
   `dpt`, `cgt`, `dgt`), which the IDs a segment line's first segment is
   minted with take ("Segment lines gain their first segment").
4. **Fractional indices** are compatible with `fractional-indexing` 4.0.0:
   its four published vectors, refusal of invalid keys and unordered
   bounds, and generated keys strictly between their bounds.

## Addresses and containers (`address.test.ts`, `containers.test.ts`)

One resolver decides what an address names, and one registry lists every
container of a drawing with its holder. The oracle is drawing.md: the
address table of section 2.2, the tree of sections 2.1 and 8.1, and the
places of section 8.6. An address is an object compared as a whole; its one
string form is `addressKey`, and nothing splits or composes an ID.

1. **The shape of an address.** `readAddress(value, path)` gives back an
   equal object for `{}`, `{block: A}`, `{block: A, id: "score"}`,
   `{block: A, id: "score", facet: "regions"}`, `{block: A, id: "score",
   part: ["end", "label"]}`, `{block: A, id: "score", part: ["card"]}`,
   `{block: A, part: ["name"]}` and the free IDs
   `https://example.org/piece/score#exposition` and `perf/take 2`. Each
   invalid shape is `invalid_address` at the `path` given, with its
   message: a string, `null` or an array, "an address is an object";
   `{block: A, colour: "red"}`, "an address has no member colour"; a
   `block` of `"short"` or `3`, "an address's block is a block id"; an `id`
   of `""`, `"a\u0001b"` or `3`, "an address's id is a non-empty string
   without control characters"; a `facet` of `region`, "an address's facet
   is a facet"; a `part` of `[]`, `["middle"]` or `"name"`, "an address's
   part is a non-empty array of part words"; `{block: A, facet:
   "regions"}`, "a facet stands with an id"; `{block: A, id: "score",
   facet: "regions", part: ["label"]}`, "a facet never stands with a part";
   `{id: "score"}` and `{part: ["name"]}`, "an element's address names its
   block".
2. **The builders.** `BUNDLE_ADDRESS` is `{}`, `TITLE_ADDRESS` `{part:
   ["name"]}`, `idAddress("score")` `{id: "score"}`, `bandAddress("score",
   "regions")` `{id: "score", facet: "regions"}`, `cardAddress("score")`
   `{id: "score", part: ["card"]}`; `partAddress` appends its word to the
   owner's `part` (`{id: "score"}` and `end` give `{id: "score", part:
   ["end"]}`, then `label` `["end", "label"]`) and keeps the owner's
   `block`, and refuses a band's address as its owner at the type level (a
   band has no part: the test type-checks only with that call refused); `PART_WORDS` is `start`, `end`, `name`, `label`, `card`.
   `inBlock(A, element)` puts an element address into block `A`,
   `elementAddressOf` takes the block off again (`{}` for a block), and
   `isElementAddress` holds for an address stating `id`, `facet` or `part`
   only, never for `{}` or `{block: A}`. `WORKSPACE` is `{}`.
3. **The one string form.** `addressKey` writes the members an address
   states as JSON in code-point order of their names (`block`, `facet`,
   `id`, `part`), whatever order they were stated in: `{}` is `{}`, `{block:
   A}` is `{"block":"0000000000"}`, `{block: A, id: "score"}` is
   `{"block":"0000000000","id":"score"}`, `{id: "score", facet: "regions"}`
   is `{"facet":"regions","id":"score"}`, `{part: ["end", "label"], id:
   "score", block: A}` is
   `{"block":"0000000000","id":"score","part":["end","label"]}`, and an ID
   holding quotes and a slash is escaped as JSON. Different addresses give
   different keys: fourteen addresses that a composed string would confuse
   (`{id: "score/end"}` and `{id: "score", part: ["end"]}`, `{id:
   "score/regions_1"}` and `{id: "score", facet: "regions"}`, `{part:
   ["name"]}` and `{id: "name"}`, part words in another order, another
   block, no block) give fourteen keys. `sameAddress` compares whole
   addresses: equal whatever their members' order, unequal for another
   part, a part's words in another order, another facet, or a block on one
   side only.
4. **Every kind resolves.** On a block of `bundles/bundle_mixed.json` (and
   one of `map.json`), one address per kind with its expected resolution
   written by hand: the workspace `{}`, a block `{block: A}`, the title
   `{part: ["name"]}`, a frame `{id: "group_1"}` (its place key `{item:
   "group_1"}`) and its title `{id: "group_1", part: ["name"]}`, a timeline
   drawn in a card (the root member `score`, its one card keyed `{item:
   "group_1", member: "score"}`, and the child member `excerpt`) and one
   drawn in none (`recording`, no card), the cards of a member `{id:
   "score", part: ["card"]}` and of an ungrouped root `{id: "annotations",
   part: ["card"]}` (keyed `{item: "annotations"}`), a band `{id: "score",
   facet: "regions"}` with the card holding it, an entry of each list by its
   ID alone (`region_2`, index 1 of `annotations`' regions; `cmap_6`, the
   map of the child `excerpt`; `jump_from_1`), and parts nested two deep
   (`{id: "score", part: ["end", "label"]}`). Each part carries its owner,
   and every level its block. The manifest's own ID names nothing: on a
   manifest with the id `takes`, `{block: A, id: "takes"}` is
   `unknown_target`, message `'takes' in bundle 'Mixed' names nothing` at
   `[{block: A, id: "takes"}]`, while `{block: A}` is the block. A measure map (`bars`, added
   into the block) resolves by its ID to itself and its index in
   `measure_maps`; it is not drawn and has no part (`{id: "bars", part:
   ["name"]}` names nothing).
5. **What names nothing** is `unknown_target` at `[address]`, message
   `<address> names nothing`, the address worded from its members (item
   15; each case's words are written out in the test): an unknown block or ID, an ID composed from
   two (`score/cmap_1`), a band of a timeline drawn in no card (`{id:
   "recording", facet: "regions"}`), a facet of a group or a map, the cards
   of a timeline drawn in no card (`{id: "recording", part: ["card"]}`), a
   group's card, a part an owner does not have (a card's label, a frame's
   label, the title's label `{part: ["name", "label"]}`, a label without an
   owner `{part: ["label"]}`, a start's end, a region's start), the title
   of an unnamed manifest (`{block: B, part: ["name"]}` on `map.json`'s
   block): a title exists only for a named manifest, and every part nothing
   draws (drawing.md §2.2): the wedges of `recording`, drawn only as an
   ancestor line (`{id: "recording", part: ["start"]}`, `["end",
   "label"]`), a label of a timeline that is no segment (`{id: "score",
   part: ["label"]}`), the name of a region and of a jump origin, and a
   map's label and name. A malformed address is
   `invalid_address` at `[address]` with the reader's message (`{block:
   "short"}`, a facet beside a part, an element without its block).
6. **Free IDs.** On a block of `bundles/bundle_free_ids.json`, `{id:
   "https://example.org/piece/score"}` and `{id: "perf/take 2"}` resolve to
   their timelines, each with its one card in the frame of `group_1`; `{id:
   "https://example.org/piece/score#exposition"}` to the first region of
   the former; `{id: "take 2/intro", part: ["label"]}` to the label of the
   region of `perf/take 2`, and `{id: "perf/take 2", part: ["end",
   "label"]}` to the label of its end. Pieces of these IDs (`perf`, `take
   2`, `https:`, `intro`, the URI with an empty fragment) name nothing.
7. **Every drawn element resolves to its kind.** For every manifest
   fixture, every address the enumeration gives but the block's resolves
   with `resolveElement`, and to the kind its element type says (a card the
   cards, a band a band, a frame a frame, a map, region, flow marker or jump
   origin an entry, a label, wedge or boundary a part, the title the title,
   every line a timeline): the cross-check between the resolver and the
   elements. The bundle's address `{}` resolves to nothing there (the
   workspace resolver reads it as the block). The other way round, **every
   resolvable part is drawn**: for every manifest fixture, every address
   built from no ID or one of `manifestIds` with a part of one or two part
   words that `resolveElement` resolves is exactly, as a set of
   `addressKey`s, the addresses with a part of the drawing's elements
   (`indexOf(manifest).elements`). The candidates are built without the
   resolver, so a part the resolver names that nothing draws fails here.
8. **The registry** (`CONTAINERS`, `CONTAINER_KINDS` `block`, `frame`,
   `card`, `band`) states each container kind exactly: the block at the
   bundle level, styled as `block`, with no place; the frame at the group
   level, styled as `frame`, stating a whole place on the block; the card at
   the timeline level, styled as `card`, stating a whole place on the block
   and its size, spacing and margin in a frame; the band at the facet level, styled
   as `band`, with no place.
9. **The containers of `bundle_mixed.json`** in drawing order, each with
   its holder: frames by group ID, each followed by its members' cards in
   display order, then the ungrouped roots' cards on the block;
   `recording` has no card and so no bands. A frame is addressed `{id: G}`
   and keyed `{item: G}`, a member's card addressed `{id: T, part:
   ["card"]}` and keyed `{item: G, member: T}`, an ungrouped root's card
   keyed `{item: T}`; `byKey` holds exactly the seven frames and cards
   under their `placeKeyText` (`["group_1"]`, `["group_1","score"]`, …,
   `["annotations"]`), `frames` the two groups, `cards` the five carded
   timelines. A card is followed by its timeline's five bands, addressed
   `{id: T, facet}`, held by it and keyed by nothing. The block's container
   is exactly `{kind: "block", key: null, address: {}, holder: null,
   timeline: null, facet: null}`.
10. **A timeline in several groups** (drawing.md §2.2, §8.1): on
    `bundles/bundle_shared_member.json` (`g1` with `t`, `u`; `g2` with `t`,
    `v`) the frames and cards in drawing order are keyed `{item: "g1"}`,
    `{item: "g1", member: "t"}`, `{item: "g1", member: "u"}`, `{item:
    "g2"}`, `{item: "g2", member: "t"}`, `{item: "g2", member: "v"}`; `t`
    has the two cards, both addressed `{id: "t", part: ["card"]}`, each
    followed by its own drawing of `t`'s five bands, so each band of `t` is
    drawn twice under one address, held by the card in `g1` and then by the
    one in `g2`. The resolver gives `{id: "t"}` both cards, `{id: "t", part:
    ["card"]}` both cards (every card of `t`), `{id: "u", part: ["card"]}`
    its one card, `{id: "t", facet: "regions"}` both drawings, and a group's
    card nothing; `t` is a group member.
11. **A child's bands lie in the card of its nearest ancestor drawn in
    one**: on `bundles/bundle_shared_parent.json`, where the root `score`
    holds two members and is drawn in no card, the bands of segments lie in
    their member's card, `score` has none, and the count of containers is
    derived by hand (two frames, five cards, fifteen timelines' bands).
12. **Place members by holding**: a frame and a block-held card state a
    whole place, a frame-held card only its size, spacing and margin, a band and
    the block nothing; a place is cut to what its container may state (kept
    whole, cut, or dropped when nothing is left); a group member is a
    timeline whose card a frame holds.
13. **Places.** A block's `places` holds a frame's and an ungrouped root's
    place under the item's ID and a member's card's under `places[G].cards[T]`.
    With `P = {group_1: {x: 10, cards: {score: {width: 650}}}, annotations:
    {y: 4}, group_2: {cards: {page: {height: 80}}}}`: `placeKeyText` writes
    `{item: "group_1"}` as `["group_1"]` and `{item: "group_1", member:
    "score"}` as `["group_1","score"]` (and keeps `{item: "a/b"}` apart from
    `{item: "a", member: "b"}`); `samePlaceKey` compares item and member.
    `placeAt(P, key)` gives exactly `{x: 10}` for `group_1` (its `cards`
    left out), `{width: 650}` for its member `score`, nothing for its member
    `performance`, nothing for `group_2` (which states cards only), `{height:
    80}` for its member `page`, `{y: 4}` for `annotations`, nothing for a
    member of `annotations`, for `nothing` and for `constructor` (no
    inherited key). `withPlaceAt` replaces `group_1`'s own place by
    `{length: 300}` keeping its cards after it (keys `length`, `cards`);
    removes `group_1`'s own place leaving `{cards: {score: {width: 650}}}`;
    removes the card of `score` leaving `{x: 10}`; removes the card of
    `page`, and with it the entry `group_2`; adds a card for `performance`
    beside `score`'s; puts `{g: {cards: {t: {width: 2}}}}` into `{}`; and
    removes `annotations`. `placeEntries(P)` is exactly `[[{item:
    "group_1"}, {x: 10}], [{item: "group_1", member: "score"}, {width:
    650}], [{item: "annotations"}, {y: 4}], [{item: "group_2", member:
    "page"}, {height: 80}]]`. On `bundle_mixed.json`, `placedContainer`
    gives `score`'s card for `{item: "group_1", member: "score"}`, and
    `placedElement` gives `group_1`, `score` and `annotations` for the keys
    of the frame, a member's card and an ungrouped root's card, and nothing
    for `{item: "score"}` (a member's bare ID), `{item: "recording"}` and
    `{item: "group_2", member: "score"}`.
14. **Memoised by identity**: the listing and the index of a manifest are
    the same objects when asked twice; the index maps every timeline to
    itself and every entry to the timeline holding it (`region_1` to
    `annotations`, `cmap_6` to `excerpt`, `cmap_5` to `recording`, a
    group to nothing; fifteen IDs), and its elements equal the drawing's
    own.

15. **The words of an address** (`addressWords`) name it to a reader in
    messages: on the view of block `A` holding `bundles/bundle_mixed.json`
    (named `Mixed`) and block `B` holding `map.json` (no name, no id),
    `{}` is "the workspace", `{block: A}` "bundle 'Mixed'", `{block: B}`
    "the anonymous bundle", `{block: A, part: ["name"]}` "the title of
    bundle 'Mixed'", `{block: B, part: ["name"]}` (naming nothing) "the
    title of the anonymous bundle"; an element by its kind and its name,
    else its ID, followed by its bundle: `group_1` "group 'Performance' in
    bundle 'Mixed'" and its title "the title of group 'Performance' in
    bundle 'Mixed'", `performance` "timeline 'Performance' in bundle
    'Mixed'", `score`'s card "the card of timeline 'Score' in bundle
    'Mixed'", its regions band "the regions band of timeline 'Score' in
    bundle 'Mixed'", its conversion maps band "the conversion maps band of
    timeline 'Score' in bundle 'Mixed'", its end's label "the label of the
    end of timeline 'Score' in bundle 'Mixed'", `region_2` "region 'Chorus'
    in bundle 'Mixed'", `cmap_6` "conversion map 'cmap_6' in bundle
    'Mixed'", `jump_from_1` "jump origin 'jump_from_1' in bundle 'Mixed'",
    `B`'s `tempo` "conversion map 'Tempo' in the anonymous bundle", the
    measure map `bars` added to `A` "measure map 'bars' in bundle 'Mixed'".
    On a view holding block `A` alone the bundle is left out: `score`
    "timeline 'Score'". An address naming nothing is worded from its
    members: `{block: A, id: "gone"}` "'gone' in bundle 'Mixed'", the band
    of a timeline drawn in no card `{block: A, id: "recording", facet:
    "regions"}` "the regions band of timeline 'Recording' in bundle
    'Mixed'" (its ID names a timeline), `{block: A, part: ["name",
    "label"]}` "the label of the title of bundle 'Mixed'", a block the view
    does not hold `{block: "0000000009"}` "block '0000000009'" and
    `{block: "0000000009", id: "score", part: ["end", "label"]}` "the label
    of the end of 'score' in block '0000000009'".

## Commands (`commands.test.ts`)

There are four commands, each aimed at **addresses**, objects read by
`readAddress` ("Addresses and containers"): `add {into, <kind>:
value}` with exactly one kind member; `set {changes: [{target, values}, …]}`,
at least one change and one property in each `values`, the properties a
member of their own so that none (a jump origin's `target`) collides with the
change's `target`; `remove {targets}`, at least one; `style {select, set,
name?, blocks?}`. What a command does is decided by the **kind of its
target**, resolved from the address alone: `{}` the workspace, `{block:
A}` a block, `{block: A, id: "x"}` the group, timeline, measure map or
entry `x` of its manifest. Below, "`set x {…}` in `A`" aims at `{block: A,
id: "x"}`. Which property each kind of
target takes is a table in the source; the cases below are written
independently of it, from the fixtures and the rules, so a wrong table entry
fails a case rather than being restated by one.

What proves the reducer: `apply(view, command)` runs on a deep-frozen view,
and its result is compared exactly with an expectation built by hand from
the fixture, or with a value reached by another path (a minimal twin
completing to its complete fixture). A command is **atomic**: a refusal of
any change, target or block refuses it whole, the input unchanged. A
refusal is compared by code and path; its path is an address (its key)
followed by the property or kind at fault, or a manifest location below a block
(`[<block>, "manifest", …]`, the first schema or invariant problem of the
manifest the command would leave), never a member of the command, except
for a malformed command, which has no target. Messages are compared only
where they are an interface (the lock refusals, "the command changes
nothing").

**A `set` that changes nothing is refused**, `invalid_value` at its first
value's `[target, property]`, message "the command changes nothing": the
store journals what it accepts, and Cancel counts it. A value equal as JSON
to the one stored changes nothing (`[4, 2]` for a stored `[2, 1]`), and so
does a `set` whose changes undo each other; a `set` of which some values
change something is accepted, since gestures state values beside the ones
they change. Values are compared path by path, a block where a change
reached past its path (a manifest, a move, an offset, a group) whole. The
other commands are not judged by it.

### Accept paths (exact)

1. `add` a block `{id: A, manifest: bare, x: 0, y: 0}` to `createView()`:
   exactly `{id: A, parent: null, index: "a0", x: 0, y: 0, scale: 1,
   length: 400, spacing: 8, margin: 0, width: null, height: null, places: {},
   manifest: <bare.json>}`; a second block `B` given `scale: 2` has index
   `a1` and scale 2; one given `index: "Zz"` keeps it.
2. Blocks and the workspace: one `set` moving `A` to (128, 64) and `B` to
   (1, 2) changes nothing else; `scale: 2, width: 120, height: null,
   length: 800, spacing: 2, margin: 12` on `A` gives exactly those, and
   `spacing: 0` and `margin: 0` are stored as given; `blockDefaults:
   {length: 640}` and `grid: {snap: false}` change that member only,
   `graphical` replaces the settings' block whole; `manifest` replaces a
   block's manifest whole, several roots and groups for one root alike.
   The settings' `graphical` and a `style`'s `set` store a declaration's
   `2.0` as `2`, as loading does (item 17 of the manifest section).
3. Timelines, on `nested.json`: `name`, `meta` and the root's `length`
   `[12, 1]` (the end of `clt_3`) are stored as given; `clt_3`'s `offset`
   `[6, 1]` leaves the root at `[16, 1]`, `[10, 1]` grows the unlocked root
   to exactly `[18, 1]`. `add` the minimal child `{id: "clt_1", offset: [2,
   4], unit: "quarters", length: [8, 1], locked: true}` into `bare` (8):
   exactly that child complete, offset `[1, 2]`, the root grown to `[17,
   2]`.
4. Entries: the maps `tempo` and `ticks` of `map.json` added into `bare` are
   kept verbatim in id order whichever comes first; an entry may be added
   into a segment line too, as the entry is validated alone (`tempo` into
   `b` of `segment_line.json` is kept, the line's length and segments
   unchanged); `set` of `tempo`'s payload with `scalar: [1, 4]` stores
   exactly that payload. Into `bare`, the region `{id: "region_1", name:
   "A", start: [2, 1], end: [4, 1]}` is stored with `meta: {}`, and `end`
   `[6, 1]` with `name` null exactly so. On `flow_control.json`, whose
   elements in canonical order are the jump targets `jump_to_1` at 2 and
   `jump_to_2` (segno) at 4, the jump origin `jump_from_1` at 8 targeting
   `jump_to_1`, the flow marker `flow_marker_1` at 12 and the jump origin `jump_from_2`
   (dal segno) at 16 targeting `jump_to_2`, each list compared whole in
   canonical order (coordinate, then id): adding the jump target `{id:
   "coda_1", type: "jump_to", manifestation: "coda", coordinate: [12, 1]}`
   (stored with `name` and `label` null, `meta: {}`, before `flow_marker_1`,
   which shares its coordinate and follows it by id) and
   targeting it from `jump_from_1`; a copy of `flow_marker_1` as `flow_marker_2` at `[3, 1]`
   with `flow_marker_1` removed (`jump_to_1`, `flow_marker_2`, `jump_to_2`, `jump_from_1`,
   `jump_from_2`); `jump_from_1` removed; `jump_to_1` at `[2, 2]` stored
   `[1, 1]`; `jump_from_1`'s `target` set to null, which removes the member (a
   repeat end without a target leads to the timeline's start); `jump_from_1`
   replaced whole through its `flow_control` property by `{id: "jump_from_1",
   type: "flow_marker", manifestation: "double_barline", coordinate: [8,
   1]}`, stored complete: an element's type, which decides the members it
   may carry, changes only so.
5. Measure maps, a block's manifest's top-level list, their IDs unique
   across the manifest as every ID: `add {into: {block: A}, measure_map:
   {id: "bars", rows: [{count: 1, qstamp: [0, 1]}]}}` into a block of
   `bare.json` stores it with `name: null, meta: {}`; `set bars {name:
   "Bars", rows: <a second row {count: 2, qstamp: [4, 1]} appended>}`
   stores exactly both; the `MeasureRecordMap` `{id: "record",
   source_unit: "quarters", target_unit: null, measure_map: "bars"}` added
   into `bare` is stored with `name: null`; removing `{block: A, id:
   "record"}` and `{block: A, id: "bars"}` together leaves both lists
   empty.
6. `remove` on `map.json`: a child takes its map; a map goes alone; the last
   root leaves `timelines: []` and the block; two blocks go together, and a
   block goes with every block whose `parent` chain reaches it.
7. `style` over `A` (`map.json`) and `B` (`bare.json`) without `blocks`:
   `{element: "map"}` `stroke` goes into `A` only, as `{order: {}, styles:
   {}, statements: [{select: {element: "map"}, set: {stroke:
   "#C00000"}}]}`; a second property merges into that statement, a selector
   equal in canonical JSON merges, another selector is another statement;
   `null` removes a property and the last one the statement. With `blocks:
   [B]` and `name: "green"`, the declaration becomes the style `green` and
   the statement's `set` its name, `A` untouched; without `name`, a merge
   into a named statement turns it into a declaration, the style unchanged;
   a style emptied by `null` goes with every statement naming it.
8. A command keeps an integral float a float: `x: JsonFloat(2)` is read as
   given, except in a declaration (item 2).

### Where a timeline lies

A timeline is placed by one rule wherever it comes from. `add timeline`
adds a root read like a manifest's (completed, locked as its place decides,
its id free); `add group` adds a group under the rules of `set group`.
`set parent` moves a timeline with its subtree: `null` makes it a root,
dropping a child's offset; `{timeline, offset}` a child there, growing the
new parent as adding a child would. `set group` puts a timeline into a
group, or `null` takes it out; members are held in canonical order, and a
stated display order lists a new member last and drops one that leaves.
IDs never change, and so no address does; a moved timeline keeps its
drawn band order and its card's stated size, and the places are fitted to
the new drawing (a card a frame now holds keeps its size, spacing and margin, moved
from `places[T]` to `places[G].cards[T]`; a place naming no frame or card
goes).

What proves it, on `bundles/bundle_mixed.json` in block `A`:

1. **A root added.** `add timeline` of `bare.json`'s root in its minimal form
   adds exactly `bare.json`'s complete root.
2. **A group added.** With `annotations` placed at `{x: 10, width: 300,
   spacing: 2}`, `add group {id: "group_3", members: ["annotations"]}` adds
   exactly `{id: "group_3", name: null, meta: {}, members:
   ["annotations"]}`, and `places` becomes exactly `{group_3: {cards:
   {annotations: {width: 300, spacing: 2}}}}`; `{id: "group_3", members: [], color: "red"}` is added
   complete, its unknown key kept.
3. **A child made a root.** With `excerpt`'s card at `{width: 200, height:
   80}` (in `places.group_2.cards`) and `recording`'s band order turned
   (`["regions", "flow_control", "children", "conversion_maps", "line",
   "markers"]`), `parent: null` on `excerpt` leaves `recording` without
   children, `excerpt` a root exactly as it was without its `offset`, still
   a member of `group_2` with `places` exactly `{group_2: {cards: {excerpt:
   {width: 200, height: 80}}}}`, and drawn with the band order it
   inherited, that same list, as its own entry in `graphical.order`.
4. **A move that grows its new parent.** `parent: {timeline: "score",
   offset: [4, 1]}` on `annotations` makes it `score`'s only child at `[4,
   1]` and grows `score` to exactly `[16, 1]`; the roots no longer hold
   `annotations`.
5. **A group joined and left.** `group: "group_1"` on `annotations` makes
   `group_1`'s members `[annotations, performance, score]` and its display
   order `[score, performance, annotations]`; `group: null` on
   `performance` leaves `[score]` and `[score]`.
6. **Refusals**, each at `[<address>, <property>]` unless stated:
   `duplicate_id` at `[{block: A}, "timeline", "id"]` for a root added as
   `score`; `already_member` at `[{block: A}, "group", "members", 0]` for a
   group of `score` and at `[{block: A, id: "score"}, "group"]` for `score`
   into `group_2`; `nested_member` for `recording` into `group_2`, which
   holds `excerpt`, and, once a root `extra` of 4 quarters has joined
   `group_1`, for a move of `score` under `extra` or of `extra` under
   `score` (at `[{block: A, id: "score"}, "parent"]` and `[{block: A, id:
   "extra"}, "parent"]`); `schema_violation` at `[{block: A}, "group",
   "name"]` for a group named `3`; `unknown_target` for a group `ghost`;
   `invalid_value` for a `group` of `3` and a `parent` of `"score"`;
   `unit_mismatch` for `annotations` under `recording`; `cycle` for
   `recording` under `excerpt`; `unknown_target` at `[{block: A, id:
   "annotations"}, "parent", "timeline"]` for a parent named `ghost`; and,
   after a root `extra` of 4 samples is added, `child_exceeds_parent` for it
   under the locked `excerpt` (of 88,200) at 88,200. On `segment_line.json`,
   `segment_structure` for `parent: null` on the segment `b1` and on the
   segment line `b` and, after a root `extra` of 4 quarters is added, for
   `extra` under the segment line `form`.

### Previews

A gesture shows `preview(view, command)`: the command as `apply` applies
it, without the schema check, the invariants and the no-op refusal. What
proves it: on
`bundle_mixed.json`, for a move under a new parent, a group joined, a group
added and a block moved, `preview` equals `apply`; on `nested.json`, for
`clt_2`'s offset `[-1, 1]`, which the invariants refuse, `preview` gives
the view with that offset stored; for a `set` that changes nothing it gives
back the very view (`toBe`); for an unknown target it gives the same
refusal as `apply`.

### Refusals (exact code and path)

- Malformed (`invalid_command` at the malformed member): an unknown `type`
  at `["type"]`; an `add` with no kind or two at `[]`; an empty `changes` at
  `["changes"]`; missing or empty `values` at `["changes", 0, "values"]`; a
  property outside `values` at `["changes", 0, "x"]`; an empty `targets` at
  `["targets"]`; a member a command does not have (a `remove` given `gap`)
  at that member; a `style` without `select` at `["select"]`; a `blocks`
  entry not a string at `["blocks", 0]`. A `select` or `set` (nulls
  removed) the schema refuses: `schema_violation` at `["select", …]` or
  `["set", …]`.
- Addresses: the command reader reads each address with `readAddress`, so
  a malformed one is `invalid_address` at the command's member, with the
  reader's message: an `into` of `"workspace"` (the former string form) at
  `["into"]`, "an address is an object"; a `target` of `1` at `["changes",
  0, "target"]`, the same; a `target` with the facet `region` there, "an
  address's facet is a facet"; a second `remove` target `{id: "score"}` at
  `["targets", 1]`, "an element's address names its block"; and `set
  {block: "short"}` through `apply` at `["changes", 0, "target"]`. The
  reader gives back the objects it read (`{block: A, id: "perf/take 2"}`,
  `{block: A, id: "score", part: ["card"]}`). `unknown_target` at
  `[{block: "0000000009"}]`, `[{block: A, id: "nothing"}]`, and at
  `[{block: A, id: "takes"}]` on a manifest with id `takes`: the
  manifest's own ID addresses nothing.
- `set`: `id_not_settable` for an id and for a map payload with another id
  (`[{block: A, id: "tempo"}, "map", "id"]`); `unknown_property`
  (`[{block: A}, "colour"]`); `wrong_target_kind` for a property of
  another kind (`[{}, "x"]`, `[{block: A}, "grid"]`, a root's `offset`, a
  map's `start`, a region's `coordinate`); `invalid_value`,
  `non_finite_number`, `non_positive_number`, `invalid_index` and
  `duplicate_index` for block and setting values (a block's `spacing` −1
  is `invalid_value` at `[{block: A}, "spacing"]`); `invalid_coordinate` for an own-axis value its number type
  does not read (`0.5` and `8` on a `fraction` axis, a coordinate dict);
  `locked`, `length_below_content` (`[23, 2]` on `clt_1`) and
  `child_exceeds_parent` (`clt_2` at `[7, 1]` under the locked `clt_3`);
  `schema_violation` below `[{}, "graphical"]`, at `[A,
  "manifest", "timetoshare"]` for a manifest declaring `0.6.0`, and for
  the flow marker `flow_marker_1` given a jump origin's manifestation
  (`repeat_end`) or a `repeat_count`, at that member in the manifest
  (`flow_control` index 3); `unknown_property` for an element's `type`,
  which only the whole element (`flow_control`) changes, and
  `id_not_settable` at `[{block: A, id: "jump_from_1"}, "flow_control",
  "id"]` for a whole
  element of another id. Manifest locations: `negative_child_offset`
  (`clt_2` at `[-1, 1]`), `region_end_before_start` (`with_region.json`),
  `schema_violation` for a jump origin targeting no jump target (at
  `jump_from_1`'s `target`, index 2) and for removing the jump target a jump
  origin names (at its `target`, index 1 once `jump_to_1` is gone): a
  removal that leaves a reference dangling is refused, never followed by
  removing the referrer. A measure map is held to the same rule: on a
  block of `bare.json` holding `bars`, removing `{block: A, id: "bars"}` while the view
  `record` names it is `schema_violation` at `record`'s `measure_map`
  (`[A, "manifest", "timelines", 0, "conversion_maps", 0,
  "measure_map"]`), the place where adding `record` without `bars` is
  refused too; `set bars {rows: []}` is `schema_violation` at `[A,
  "manifest", "measure_maps", 0, "rows"]` and `{name: null}` changes
  nothing.
- `add`: a problem of the value lies at `[<into>, <kind>, …]`, its path in
  the command. `wrong_target_kind` for a child into a map, a region into a
  group and a child into the workspace (`[{}, "child"]`); `invalid_block_id`
  at `[{}, "block", "id"]`; for a block value `duplicate_id` at `[{},
  "block", "id"]`, `unknown_property` at `[{}, "block", "overrides"]`,
  `invalid_value` at `[{}, "block", "x"]` for a missing `x`, and
  `non_positive_number` at `[{}, "block", "scale"]` for `scale: 0`, a block
  member refused as its `set` refuses it but at its path in the value;
  `duplicate_id` for a child and a map carrying the root's ID (at `[{block:
  A, id: "bare"}, "child", "id"]` and `[…, "map", "id"]`: an ID is unique
  across the manifest); `duplicate_id` where it would lie in the manifest
  for a given ID below the value's own that the manifest holds: a root
  `fresh` whose child is `bare` at `[A, "manifest", "timelines", 1,
  "children", 0, "id"]`, that root added as a child of `bare` at `[A,
  "manifest", "timelines", 0, "children", 0, "children", 0, "id"]`, a root
  `fresh` whose map is `bare` at `[A, "manifest", "timelines", 1,
  "conversion_maps", 0, "id"]` (refused there, never later as
  `schema_violation`); `schema_violation` at its manifest location
  for a region ID holding a control character (`"a\u0001b"`; a `/` is
  allowed), a child in `seconds` under `quarters`, and a
  child whose `children` is `5` or `[5]` or whose `flow_control` is `5`
  (refused, never thrown); `unknown_property` and `invalid_value` for a block
  value; `schema_violation` at `[A, "manifest", "timelines", 0,
  "conversion_maps", 0, "source_unit"]` for a map whose `source_unit` is
  `seconds` on the `quarters` root; `negative_child_offset` for a child at
  `[-1, 1]`; for a measure map `duplicate_id` at `[{block: A},
  "measure_map", "id"]` for the id of a timeline, `schema_violation` at `[{block: A},
  "measure_map", "rows"]` for empty rows, and `wrong_target_kind` into a
  timeline.
- `remove`: `not_removable` at `[{}]`; `unknown_target` at `[{block:
  C}]` for an absent block. `style`: `unknown_target` at `[{block: C}]`
  for `blocks: [C]` (a `style` names blocks by their ids, a refusal by its
  address).
- Atomicity: a `set` of a valid and an unknown target, and a `remove` naming
  an absent block, are refused whole.
- Changes nothing, on every kind of target (blocks `A` of `nested.json` and
  `B` of `bare.json`): the settings' own values; `A`'s `x`, `index`,
  `width` and its manifest as loaded; `clt_1`'s `name: null`, `meta: {}` and
  `length: [32, 2]`; `clt_3`'s own offset; on `map.json` `tempo`'s own
  payload; on `flow_control.json` `jump_to_1` at `[4, 2]`. Judging the whole
  command: `A` at its own `x` with `B` moved is accepted; refused are both
  at their own `x` (at `[{block: A}, "x"]`), `A`'s `x` 5 then 0, `clt_1`'s
  place `{x: 3}` then `{x: null}` (at `[{block: A, id: "clt_1"},
  "place"]`) and a manifest renaming `clt_1` then `clt_1` renamed back (at
  `[{block: A}, "manifest"]`);
  accepted are that `x` pair beside `B` at 7, and `clt_3`'s offset to 12
  and back to 4, the root it pushed staying at `[20, 1]`.

### Locks by place

A timeline's place decides its lock where it is a segment or a segment
line placed inside something (the `segment_never_locked` and
`unlocking_not_supported` rows of the catalogue); every other timeline
keeps its own `locked`. `set locked` and `add child` follow the one rule: a
value that contradicts the place is refused, and an `add` gives each
timeline of the value it adds the lock its place decides. A `set locked`
to the value the timeline already has is never refused by this rule: alone
it changes nothing and is refused as such; beside a value that changes
something, it is accepted. Each case checks the exact `locked` afterwards,
or the exact code, path and message of the refusal, the view unchanged.

1. **`set locked` on a segment.** In a block of `segment_line.json`,
   `locked: true` on `b1` is `segment_never_locked` at `[{block: A, id: "b1"},
   "locked"]`, message `A segment is never locked: lock its segment line
   'b' instead.`; `locked: false` on `b1` changes nothing (refused as such
   at the same path).
2. **`set locked` on a segment line placed inside something.** In the
   same block, `locked: false` on `b` (a segment that is a segment line) is
   `unlocking_not_supported` at `[{block: A, id: "b"}, "locked"]`, message `Unlocking
   a segment line that is a child, a segment or a group member is not
   supported yet.`. The same refusal for `intro` of `segment_children.json`
   (a segment line that is a child of `piece`, no segment) and for the root
   `original_score:dgt_1` of `bundles/corpus_ieee1599.json` (a segment line
   that is a group member). Each of the three holds `locked: true`, so
   `locked: true` on it changes nothing (refused as such at `[{block: A, id: "<id>"},
   "locked"]`).
3. **`set locked` to the value a timeline has.** In a block of
   `segment_line.json` whose file states `locked: false` on `b` (kept on
   reading), `locked: false` on `b` alone changes nothing and is refused as
   such at `[{block: A, id: "b"}, "locked"]`, never as `unlocking_not_supported`;
   `{locked: false, name: "Bridge"}` on `b` is accepted and leaves `b`
   `false` and named `Bridge`, the manifest otherwise equal to the one
   before; `locked: true` on `b` is accepted and leaves it `true`.
   Unlocking it again is then `unlocking_not_supported` at `[{block: A, id: "b"},
   "locked"]`, as in case 2, so the acceptance is the no-op's and no lifted
   rule's.
4. **`set locked` elsewhere.** On the root `form` of `segment_line.json`
   (a segment line, neither a child nor a member) `locked: true` and then
   `locked: false` are both accepted, leaving `true` and then `false`.
5. **`add child` into a segment line.** Neither value stating `locked`:
   into the root `form` of `unknown_length_segments.json` (its length
   unknown), a child `d` of 4 at 20 holds `locked: false`; into the root
   `form` of `segment_line.json`, a child `e` of unknown length at 32 that
   is a segment line holding no segment holds `locked: true`. The same `d`
   stating `locked: true` is `segment_never_locked` at `[{block: A, id: "form"},
   "child"]`, message `A segment is never locked: lock its segment line
   'form' instead.`; the same `e` stating `locked: false` is
   `unlocking_not_supported` at the same path.
6. **`add child` of a subtree.** Into the root `bare` of `bare.json` (not
   a segment line), a child `sl` of 4 at 0 that is a segment line holding
   the segment `s1` of 4 at 0, neither stating `locked`, is added with
   `sl` locked and `s1` unlocked. The same value with `s1` stating `locked:
   true` is `segment_never_locked` at `[{block: A, id: "bare"}, "child"]`, message
   naming the line `sl`. A child that is no segment line added into a
   timeline that is no segment line keeps the lock it states (the accept
   paths above add `bare`'s root, locked, as a child).

## Several roots and groups (`files.test.ts`)

A manifest holds several root timelines and groups, so what core does for
one root it does for each, and its element addresses are those of
drawing.md §2.2 in every manifest alike: every ID is unique across the
whole manifest (timelines at any depth, groups, measure maps, maps,
regions, flow-control elements and the manifest's own), so an element is
addressed `{id}` wherever it lies, a band `{id: T, facet}`, every card of a
timeline `{id: T, part: ["card"]}`, parts by `part`, the manifest's title
`{part: ["name"]}`; no address is composed from IDs.

1. **Blocks hold any manifest.** A workspace holding blocks of `bare.json`,
   `group_child_member.json` and `bundle_mixed.json` writes and reads back
   deep-equal, and writes again to the same bytes; its file format is
   version 6.
2. **Invariants root by root.** `group_child_member.json` with
   `second-half`'s unit changed to `seconds` (its length written `8.0`, as
   the `float` axis of seconds represents it) is refused with exactly
   `schema_violation` at `["timelines", 0, "children", 0, "unit"]`, message
   `child 'second-half' has unit 'seconds', its parent 'piece' has
   'quarters'`: the path counts the roots of a manifest with a group.
3. **Elements of a group manifest.** The enumeration of
   `group_child_member.json` is written out whole, every member of every
   key, and compared exactly. Its order: the block; the frame `{id:
   "group_1"}` (type `frame`, chain `[block]`) and its title `{id:
   "group_1", part: ["name"]}` (`[block, frame]`), both belonging to no
   timeline, so timeline, domain, modality, class and facet are null; then
   each member in display order, `second-half` first: its card `{id:
   "second-half", part: ["card"]}` (`[block, frame]`), its ancestor line
   `piece` (type `ancestor`, `[block, frame, timeline]`) with its name and
   the member's two marks `{id: "second-half", part: ["start"]}` and
   `["end"]` (`[block, frame, timeline, ancestor]`), each followed by its
   label (`[…, ancestor, wedge]`); then the member's own line as a root's:
   `timeline` `{id: "second-half"}` (`[block, frame]`), its name and its
   five bands (`[block, frame, timeline]`), the markers band holding the
   wedges (`[…, timeline, band]`), each followed by its label (`[…, band,
   wedge]`); then `recording` the same way without ancestors. A timeline's
   keys carry its domain, modality and class (`second-half` and `piece`
   logical, continuous, `ContinuousLogicalTimeline`; `recording` physical,
   continuous, `ContinuousPhysicalTimeline`), a band its timeline, null
   domain, modality and class, and its facet. So an ancestor line holds no
   band, a member that is a child in `timelines` is a `timeline` element in
   its drawing whose bands are held by no band, and the mark addresses and
   their labels occur twice, on the ancestor line and on the member's own
   line. `{within: "piece"}` matches exactly the card of `second-half`, the
   `piece` ancestor, its name, the four mark keys on it and every element of
   the line `second-half` (eighteen keys); `{element: "frame"}` only the
   frame; `{element: "card"}` exactly the cards of `second-half` and
   `recording`; `{inside: "ancestor"}` exactly the name of `piece` and the
   four mark keys on the ancestor line; `{element: "wedge", inside:
   "ancestor"}` the two marks; `{element: "name", inside: "ancestor"}` only
   the name of `piece`; `{inside: "frame"}` every key but the block and the
   frame.
4. **Elements of a named manifest with two groups.** The addresses of
   `bundle_mixed.json`'s enumeration are written out whole: the block `{}`;
   the title `{part: ["name"]}` (whether the manifest is named, as here, or
   has an id); per frame in group order the frame, its title and its
   members' cards in display order (`group_1`: `score`, `performance`;
   `group_2`: `page`, `excerpt`), each card followed by the member's
   ancestor lines (for `excerpt`, `{id: "recording"}`, its name and the
   marks of `excerpt`'s start and end with their labels) and its line with
   its name and five bands, the bands holding its maps (`cmap_1`, `cmap_2`
   in `score`'s; `cmap_3` in `performance`'s; `cmap_4` in `page`'s;
   `cmap_6` in `excerpt`'s), its wedges with their labels and its jump with
   its label (`{id: "jump_from_1"}`, `{id: "jump_from_1", part:
   ["label"]}`); then the ungrouped root `annotations` with its card, name
   and five bands, the regions band holding `region_1`, its label,
   `region_2`, its label. Nothing of `recording`'s own is drawn on an
   ancestor line (its map `cmap_5` is not, drawing.md §8.3). A line's
   elements come in the order of "Elements and selectors" 1. The title, the
   card of `annotations` and the line `annotations` are held by the block
   alone (chain `[block]`), the line's name by the block and the line
   (`[block, timeline]`). `memberDrawings` gives the frames `group_1`
   (`score`, `performance`) and `group_2` (`page`, `excerpt`, the latter
   with the one ancestor `recording`, offset its offset there) and the
   ungrouped roots `["annotations"]`.
5. **Addresses, one root and several.** In a block of `map.json`:
   `manifestIds` is exactly `melody`, `phrase`, `tempo`, `ticks`; `set`
   reaches the map `ticks` of the child `phrase` by `{block: A, id:
   "ticks"}`, and `{id: "melody/ticks"}` and `{id: "phrase/ticks"}` are
   `unknown_target`: no ID is composed. In a block of
   `group_number_types.json`, adding the region `region_1` (`[2, 1]` to
   `[4, 1]`) into `{block: A, id: "score"}` stores it in
   `timelines[2].regions`; `manifestIds` then holds exactly `group_1`,
   `page`, `performance`, `region_1` and `score`. IDs are free: a region
   with the ID `start` or `card` (part words) added into `score` is
   accepted, listed before `region_1`, and `set` of its `name` on `{block:
   A, id: "start"}` names that region, while `{block: A, id: "score", part:
   ["start"]}` is the wedge of `score`, a part, which no command aims at:
   `unknown_target` at that address. `unknown_target` also for `{id:
   "page/region_1"}`, `{id: "score/region_1"}`, and the parts `start` and
   `label` of `region_1` (a region has a label, but no command aims at a
   part); `{block: A, id: "group_1"}` is a group, which `set` refuses by
   kind (`wrong_target_kind` for `length`). `findTimeline`, the one reader
   of a timeline by id, searches every root's tree: in `bundle_mixed.json`
   it gives for `annotations` the object at `timelines[0]` and for
   `excerpt` the object at `timelines[3].children[0]` (the very objects,
   not copies), and `undefined` for `group_1`, `name`, `recording/excerpt`,
   `cmap_6` (a map) and `nothing`. `resolveElement` reads a map, region or
   flow-control element by its ID alone and gives its kind and the very
   object: in `map.json` `{id: "tempo"}` the map
   `timelines[0].conversion_maps[0]` and `{id: "ticks"}` the map
   `timelines[0].children[0].conversion_maps[0]`, both kind `map`; in
   `flow_control.json` `flow_marker_1`, `jump_from_1` and `jump_to_1` the
   elements of `timelines[0].flow_control` with those ids (a flow marker, a
   jump origin, a jump target), each kind `flow_control`; in
   `group_number_types.json` with `region_1`, `{id: "region_1"}` the object
   `timelines[2].regions[0]`, kind `region`. It gives no entry for `{id:
   "score"}` (a timeline), `{id: "group_1"}` (a group), `{part: ["name"]}`
   (the title), `{id: "score/region_1"}`, `{id: "region_1", part:
   ["label"]}` (a part) and `{id: "nothing"}`.
6. **Commands.** `set` reaches a timeline at any depth: `name: "Late"` on
   `{block: A, id: "second-half"}` of `group_child_member.json` changes
   exactly `timelines[0].children[0].name`, and `name: "Intro"` on `{block:
   A, id: "region_1"}` that region's name. `add` the child `clt_1` (bare's
   root, locked, offset `[0, 1]`) into `score` of
   `group_number_types.json`: it is stored in `timelines[2].children`.
   `duplicate_id` is manifest-wide: a child carrying `page` (a timeline of
   another root) at `[{block: A, id: "score"}, "child", "id"]`; a second
   `region_1` into `score` and one into `page`, another root, at `[{block:
   A, id: "score"}, "region", "id"]` and `[{block: A, id: "page"}, "region",
   "id"]`. `style` with `blocks: [A]` on `group_styled.json`,
   `{select: {element: "ancestor"}, set: {opacity: 0.5}}`, adds that
   statement after the manifest's three and keeps `styles` and `order`,
   written out literally: `order` exactly `{group_1: ["score", "page",
   "performance"]}`, `styles` exactly `{"frame-highlight": {stroke:
   "#7F00FF"}}`, and `statements` exactly `{select: {element: "frame"},
   set: "frame-highlight"}`, `{select: {addresses: [{id: "group_1", part:
   ["name"]}], element: "name"}, set: {fill: "#7F00FF"}}`, `{select:
   {element: "card", inside: "frame"}, set: {rx: 2, shadow: "#C4B5FD"}}`,
   then the new one. Statements cascade (a later one wins), so a
   reordered, merged or rewritten statement would draw differently, and the
   string `set` names a style that must still resolve. Without `blocks`,
   `{select: {element: "frame"}, set: {stroke: "#C00000"}}` reaches the two
   blocks holding a group and not the one-root block beside them.
7. **Delete deletes.** `remove` takes any element, timelines and groups
   included, and `removedBy(manifest, ids)` names, by ID, exactly what
   goes, which the arranger's Delete preview reads. Each effect on its own
   case:
   - **A subtree, its ids in groups and orders.** `bundle_mixed.json`,
     removing `recording`: the roots are `annotations`, `page`,
     `performance`, `score`; `group_2`'s members are `["page"]` and its
     order `["page"]`; `group_1` and its order are unchanged. `removedBy`
     of `["recording"]` is exactly `{recording, excerpt, cmap_5, cmap_6}`.
   - **A child.** `group_child_member.json`, removing `second-half`:
     `piece` has no children; `group_1`'s members and order are
     `["recording"]`.
   - **A map belongs to its timeline only.** `group_number_types.json`
     with the `TableMap` `{id: "warp", source_unit: "quarters",
     target_unit: "seconds", x_values: [0, 12], y_values: [0, 12.5]}`
     added into `score` (stored with `name: null`, `kind: "linear"`,
     `extrapolate: "none"`), removing `performance` leaves `score`'s
     `conversion_maps` exactly `[warp]`; `removedBy` of `["performance"]`
     is exactly `{performance}`.
   - **A measure map goes alone.** The same manifest given the measure map
     `{id: "bars", rows: [{count: 1, qstamp: [0, 1]}]}` (added into
     `{block: A}`): `removedBy` of `["bars"]` is exactly `{bars}`, and
     removing `bars` leaves `measure_maps: []` and every timeline as it
     was.
   - **`addresses` entries naming a removed element.** `group_styled.json`
     with the statements `{select: {addresses: [{id: "page"}, {id: "score",
     part: ["card"]}]}, set: {opacity: 0.5}}` and `{select: {addresses:
     [{id: "page", part: ["name"]}, {id: "page", facet: "regions"}]}, set:
     {opacity: 0.4}}` styled in, removing `page`: the first keeps
     `addresses: [{id: "score", part: ["card"]}]`, the second goes (its
     part and band of `page` go with `page`), the manifest's own three
     statements are unchanged.
   - **A group left without members stays; the last root leaves an empty
     array.** `group_number_types.json`, removing `page`, `performance` and
     `score` in one command: `timelines` is `[]`, `groups` is exactly
     `[{id: "group_1", name: "Edition", meta: {}, members: []}]`, the order
     `{group_1: []}`.
   - **Deleting a group keeps its members.** `bundle_mixed.json`, removing
     `group_1`: the roots are unchanged, `groups` is `[group_2]`, the order
     holds `group_2` alone, and `memberDrawings` draws `annotations`,
     `performance` and `score` as ungrouped roots.
   - **Targets that go with another are not refused**: removing
     `recording` and `excerpt` gives the same manifest as removing
     `recording`.
8. **IDs of new elements** are unique across the manifest. On
   `bundle_mixed.json` given the id `edition`, a region and a child
   carrying `group_1`, `edition` (the manifest's own id) or `cmap_5` (a map
   of another root) added into `score` are each `duplicate_id` at
   `[{block: A, id: "score"}, "region", "id"]` and `[…, "child", "id"]`.
   On `conversion_maps__maps_quarters.json`, whose maps hold maps two
   deep, `manifestIds` is exactly `cmap_1` to `cmap_8`, `lmap_1` to
   `lmap_5`, `maps:quarters`, `measuremap_1`, `pmap_1` and `tmap_1` to
   `tmap_4`: the maps a `ChainMap`, `CombinationMap` or `PiecewiseMap`
   holds count. A region `lmap_3` (a held map's ID) into `maps:quarters`
   is `duplicate_id` at `[{block: A, id: "maps:quarters"}, "region",
   "id"]`, and `{id: "lmap_3"}` resolves to nothing: a held map is neither
   drawn nor addressed.

## Places, display orders and band orders (`places.test.ts`)

A block stores one drawing input beside its placement (drawing.md §1):
`places`, the stated places of its block's **items** (a group's frame or an
ungrouped root's card, drawing.md §8.1) and the stated sizes and vertical
stretches of its members' **cards**. So `places` is keyed by the ID of a
group or of an ungrouped root, and a member's card's place lies in its
group's entry, `places[G].cards[T]` (drawing.md §8.6: one card, and one
place, per group that has the member); a member's bare ID at the top names
nothing. A `set` of `place` aims at the group, for its frame, or at the
timeline, for the one card it is drawn in; a timeline drawn in the frames
of several groups has several cards and no one place to set, so each of
its cards is placed through its group: a `set` of `cards` on the group,
`{<member ID>: <card place>}`, merges into `places[G].cards[T]` exactly as
`place` merges a card's. What a group
or a timeline stacks is no placement: a group's **display order** and a
timeline's **band order** lie in the block's manifest, as the entries of
`graphical.order` keyed by the group's or the timeline's ID (TimeToShare's
README, "graphical"), each set by the property `order` of its group or
timeline. A place is `{x?, y?, length?, scale?, spacing?, margin?, width?,
height?}`, `x` and `y` finite, `length`, `scale` and the sizes positive,
`spacing` (a gap) and `margin` (empty space above the first element and
below the last) finite and at least 0, at least one member stated and
none null: a place without members is never stored; a group's entry adds
`cards`, an object of at least one card place by member ID. A card's place
states only `width`, `height`, `spacing` and `margin` (drawing.md §8.6: a
member is drawn with its group's length and scale, while its spacing, the
gap between its rows and its bands, and its margin are its own). These are
proved by what a stored block holds after commands and by checking a view
built as a read file would be: a stale or invented key, or a card stating
more than its size, spacing and margin, must never reach a saved file, or the file would be refused on
reading.

Block `bundle0001` holds `bundles/bundle_mixed.json`; where a case names
`groups/group_child_member.json` (whose root `piece` holds the member
`second-half` and so is no item), its block is `bundle0001` too. `set x
{…}` aims at `{block: "bundle0001", id: "x"}`, `set bundle0001 {…}` at
`{block: "bundle0001"}`, and a path `[x, …]` starts with that address's
key. The band orders below are `R` for the root `recording`, `["markers",
"children", "line", "conversion_maps", "regions", "flow_control"]` (the
markers band moved to the top and the conversion maps band below the line),
`E` for its child `excerpt`, `["line", "children", "conversion_maps",
"markers", "regions", "flow_control"]` (every band below the line), and
`D` the default band order, `["children", "conversion_maps", "line",
"markers", "regions", "flow_control"]`.

**Accepted** (expected values exact):

1. `set group_1 place {length: 300}`: `places` is `{group_1: {length:
   300}}`, and nothing else in the block changes. Then `place {length:
   null, x: 12}`: `{group_1: {x: 12}}` (a value states a member, `null`
   unstates it, unnamed members are kept). Then `place {x: null}`: `places`
   is `{}`, the emptied place deleted.
2. `set annotations place {x: -30, y: 4.5, width: 700, height: 120}` (an
   ungrouped root, negative and fractional positions allowed): exactly that
   place under `annotations`.
3. **Scale.** `set group_1 place {scale: 1.5}`: exactly `{group_1: {scale:
   1.5}}`; then `place {scale: null}`: `{}`. `set annotations place
   {scale: 1.5}`: exactly `{annotations: {scale: 1.5}}`.
4. **A member's card size.** `set score place {width: 650, height: 120}`
   (a member that is a root): exactly `{group_1: {cards: {score: {width:
   650, height: 120}}}}`; then `place {width: null}`: `{group_1: {cards:
   {score: {height: 120}}}}`. In `group_child_member.json`, `set
   second-half place {width: 650, height: 120}` (a member that is a child
   timeline): exactly `{group_1: {cards: {"second-half": {width: 650,
   height: 120}}}}`.
5. **Spacing, on every kind of place.** `set group_1 place {spacing:
   1.5}`: exactly `{group_1: {spacing: 1.5}}`; `set annotations place
   {spacing: 1.5}`: exactly `{annotations: {spacing: 1.5}}`; `set score
   place {spacing: 1.5}`: exactly `{group_1: {cards: {score: {spacing:
   1.5}}}}`, then `place {width: 650}`: `{group_1: {cards: {score:
   {spacing: 1.5, width: 650}}}}`, then `place {spacing: null}`: `{group_1:
   {cards: {score: {width: 650}}}}`. A frame's own place and its cards
   share the entry: from `{spacing: 1.5, width: 650}` on `score`'s card,
   `set group_1 place {x: 10}` gives `{group_1: {x: 10, cards: {score:
   {spacing: 1.5, width: 650}}}}` and `place {x: null}` again `{group_1:
   {cards: {score: {spacing: 1.5, width: 650}}}}`. A spacing of 0 is a gap
   like any other: `set group_1 place {spacing: 0}` gives exactly
   `{group_1: {spacing: 0}}`.
5a. **Margin, on every kind of place**, stated where `spacing` is: `set
   group_1 place {margin: 12}` gives exactly `{group_1: {margin: 12}}`;
   `set annotations place {margin: 12}` exactly `{annotations: {margin:
   12}}`; `set score place {margin: 12}` exactly `{group_1: {cards:
   {score: {margin: 12}}}}`, then `place {spacing: 1.5}` `{group_1: {cards:
   {score: {spacing: 1.5, margin: 12}}}}` (a place's order: `spacing`
   before `margin`), then `place {margin: null}` `{group_1: {cards: {score:
   {spacing: 1.5}}}}`. `set group_1 {cards: {score: {margin: 3}}}` gives
   exactly `{group_1: {cards: {score: {margin: 3}}}}`.
6. **A display order.** `set group_1 order ["performance", "score"]`:
   `graphical.order` is `{group_1: ["performance", "score"], group_2:
   ["page", "excerpt"]}`; `order: null` deletes the entry, leaving exactly
   `{group_2: ["page", "excerpt"]}`, so `memberDrawings` then lists
   `group_1`'s members as `members` states them, `performance`, `score`.
7. **A band order.** `set recording order R` (a root): `graphical.order`
   is exactly the fixture's two display orders and `recording: R`, and the
   block equals the one before with only that member of its manifest
   replaced; then `set excerpt order E` (a child): those three entries and
   `excerpt: E`; then `set recording order null`: the two display orders
   and `excerpt: E` (the child keeps its own entry while its parent's goes);
   then `set excerpt order null`: exactly the fixture's `graphical.order`.
   `set annotations order D` stores `annotations: D`: a value equal to what
   the timeline inherits is an entry like any other, deleted only by null.
8. **Both in one `set`.** `group_1`'s display order `["performance",
   "score"]` and `recording`'s order `R` write both entries beside
   `group_2`'s; `group_1`'s display order the fixture states, `["score",
   "performance"]`, with `recording`'s order `R` is accepted and writes
   exactly `recording: R` beside the fixture's two display orders (the
   command changes something, so its value that changes nothing is no
   refusal).
9. **One change, one journal entry, one undo step.** In a store with the
   injected clock holding block `bundle0001` added by `add`, `dispatch` of
   `set excerpt order E` returns `null` and appends exactly one entry,
   `{command: <that set>, author: "Gerhardt", time:
   "2026-10-11T14:03:13.418Z"}`; `undo()` gives back the very view before
   and `redo()` the very view after it, whose `graphical.order.excerpt` is
   `E`.

**Refused** (exact code, path and, where one is fixed, message):

10. `set recording place {x: 1}` (it holds a member, so it is drawn in no
    card): `not_an_item` at `[recording, "place"]`, message "'recording'
    is not drawn in a card of its own"; in `group_child_member.json`, `set
    piece place {width: 650}` the same at `[piece, "place"]`. A member's
    card states only its size: `set score place {x: 1}` is `not_an_item` at
    `[score, "place", "x"]`, message "'score' is a member: its card
    takes only width, height, spacing and margin"; `{width: 650, length: 300}` at `[…,
    "place", "length"]`, `{scale: 2}` at `[…, "place", "scale"]`, and in
    `group_child_member.json` `set second-half place {x: 10}` at
    `[second-half, "place", "x"]`. Both refusals come before the value is
    read: `set recording place {x: "a"}` is `not_an_item` at `[…, "place"]`
    and `set score place {x: "a"}` at `[…, "place", "x"]`. On
    `bundles/bundle_shared_member.json` (`t` a member of `g1` and `g2`),
    `set t place {width: 650}` is `not_an_item` at `[t, "place"]`, message
    "'t' is drawn in the frames of several groups", while `set u place
    {width: 650}` (a member of `g1` only) gives exactly `{g1: {cards: {u:
    {width: 650}}}}`.
11. `set group_1 order ["score"]` (a member missing), `["score", "score"]`
    (a duplicate id), `["score", "performance", "score"]`, `["score",
    "annotations"]` and `"score"`: each `invalid_order` at `[group_1,
    "order"]`, message "order must list every member of 'group_1' once".
12. Place values at `[x, "place", member]`: `{x: "1"}` `invalid_value`,
    `{y: Infinity}` `non_finite_number`, `{length: 0}`, `{width: -1}`,
    `{scale: 0}` and `{scale: -1}` `non_positive_number`, `{spacing: -1}`
    and `{margin: -1}` `invalid_value`, `{margin: Infinity}` and `{margin:
    NaN}` `non_finite_number` (as for `spacing`), `{depth: 1}` `unknown_property` (as every `set`
    object value naming an unknown member); `place: 5` `invalid_value` at
    `[x, "place"]`; `place: {}` `invalid_value` at `[x, "place"]`, message
    "a place value states at least one member" (an empty value would
    journal a command that changes nothing).
13. **A band order that is none**, each refused whole with `invalid_order`
    at `[excerpt, "order"]` and, as message, the first problem in the terms
    of TimeToShare's README, by the rule "Bands and band orders" checks
    against the validators (IDs and entries in single quotes): `E` with
    `flow_control` replaced by `flow`, `'flow' is not 'line' or a facet, in
    the band order of 'excerpt'`; `E` without `regions`, `'regions' is
    missing from the band order of 'excerpt'`; `E` without `line`, `'line'
    is missing from the band order of 'excerpt'`; `E` without `markers` and
    `children`, the first missing in the default band order's order,
    `'children' is missing from the band order of 'excerpt'`; `E` with
    `regions` replaced by the former band address `excerpt/regions_1` (a
    stranger before anything missing), `'excerpt/regions_1' is not 'line'
    or a facet, in the band order of 'excerpt'`, and the same for `line`
    replaced by the timeline's own ID `excerpt`; a group's display order
    `["score", "performance"]`, `'score' is not 'line' or a facet, in the
    band order of 'excerpt'`; `E` with `line` appended again, `'line' is
    repeated in the band order of 'excerpt'` (a repetition comes before a
    stranger, as the schema's rule comes before the identity rules);
    `"excerpt"` and `[1, 2]`, `the band order of 'excerpt' is not an array
    of strings`. On the root, `R` without `line`: `'line' is missing from
    the band order of 'recording'` at `[recording, "order"]`.
14. **A place or an order that changes nothing**, each refused as every
    such `set` is: `invalid_value` at `[x, <property>]`, message "the
    command changes nothing". `place {x: null}` on `annotations`, which has
    no place; `place {width: 650}` on `score` once its card states `{width:
    650}`; `set group_1 order ["score", "performance"]`, the display order
    the fixture states; `set excerpt order E` once `excerpt: E` is stored;
    `order: null` where nothing is stored: `set recording order null` and
    `set excerpt order null` (the fixture states no band order), `set
    group_1 order null` once a first one has deleted its entry, and on
    `map.json`, which has no `graphical` at all, `set melody order null` and
    `set phrase order null` (deleting an entry that is not there never adds
    an empty `graphical`). In a store holding `map.json` as block
    `bundle0001`, `dispatch` of `set phrase order null` returns exactly that
    refusal, the view stays the same object and the journal keeps its one
    entry, the `add`.
15. The target's kind: `place` and `order` on the block are
    `wrong_target_kind` at `[{block: "bundle0001"}, "place"]` / `[{block:
    "bundle0001"}, "order"]`; a group refuses every other property:
    `locked` on `group_1` is `wrong_target_kind` at `[group_1, "locked"]`.

**Pruning.** After every command, the blocks it touched keep only the
places that still lie where an item or a member's card has its place, a
member's place cut to its `width`, `height` and `spacing` (dropped when
nothing is left). A place that was a timeline's card's before the command
and names nothing after it moves to the timeline's one card (a root that
joins a group, from `places[T]` to `places[G].cards[T]`; a member whose
group goes or that leaves it, the other way) unless that card's place is
stated already; nothing else is dropped.

16. With `group_2` placed (`{x: 10}`) and the cards of `page` and
    `excerpt` sized `{width: 650}` (`places.group_2.cards`), `remove
    group_2`: `places` is exactly `{page: {width: 650}}` (`page` becomes an
    ungrouped root, an item, and keeps its size under its own ID; `excerpt`
    is then neither an item nor a group member). `recording` then holds no
    member, so it is an item: `set recording place {x: 1}` is accepted.
17. A root becoming a member: with `annotations` placed (`{x: 1}`), `set
    bundle0001 manifest` to `bundle_mixed.json` with `annotations` added to
    `group_1`'s `members` and display order: `places` is `{}`. The same
    with `annotations` placed `{x: 1, scale: 2, spacing: 1.5, width: 700}`:
    `places` is exactly `{group_1: {cards: {annotations: {spacing: 1.5,
    width: 700}}}}`.
18. **The card's place moves both ways.** With `annotations` placed `{x:
    1, width: 700, spacing: 2}`, `set annotations group "group_1"` leaves
    `places` exactly `{group_1: {cards: {annotations: {width: 700, spacing:
    2}}}}`, and `set annotations group null` then exactly `{annotations:
    {width: 700, spacing: 2}}`. With `group_1` placed `{x: 10}` and
    `score`'s card `{width: 650}`, `set score group null` leaves exactly
    `{group_1: {x: 10}, score: {width: 650}}`: the frame keeps its own
    place.
19. `remove annotations` with `annotations` placed: `places` loses its
    entry.

**Band orders go with their timelines.** Removing a timeline removes the
entries of `graphical.order` keyed by it and by each of its descendants (as
for a group's display order), and a statement's `addresses` naming one of
its bands (`{id: T, facet}`) go with it as those naming its cards (`{id: T,
part: ["card"]}`) do: the address goes with its timeline, and a statement
left without `addresses` goes.

20. With `recording: R`, `excerpt: E` and `annotations: D` set: `remove
    excerpt` leaves `graphical.order` exactly `{group_1: ["score",
    "performance"], group_2: ["page"], recording: R, annotations: D}`;
    `remove recording` instead leaves exactly `{group_1: ["score",
    "performance"], group_2: ["page"], annotations: D}` (its descendant's
    entry goes with its own).
21. With the statements `{select: {addresses: [{id: "excerpt", facet:
    "regions"}, {id: "annotations", facet: "regions"}]}, set: {display:
    "inline"}}` and `{select: {addresses: [{id: "excerpt", facet:
    "markers"}]}, set: {display: "inline"}}`, `remove excerpt` leaves
    exactly `[{select: {addresses: [{id: "annotations", facet:
    "regions"}]}, set: {display: "inline"}}]`.
22. **No command renames.** IDs are never settable, and core renames
    neither an entry of `graphical.order` nor an address in a statement. A
    timeline's ID changes only with a whole manifest (`set bundle0001
    manifest`), which brings its own `graphical`. With `excerpt: E` and the
    statement `{select: {addresses: [{id: "excerpt", facet: "regions"}]},
    set: {display: "inline"}}`, the manifest with `excerpt` renamed
    `fragment` in `recording`'s children, in `group_2`'s members and in its
    display order, its band order still keyed `excerpt`, is refused:
    `schema_violation` at `["bundle0001", "manifest", "graphical", "order",
    "excerpt"]`, message `'excerpt' names no group or timeline of this
    manifest`. The same with the entry rekeyed `fragment: E` is accepted
    (a band order names no ID, so it moves unchanged), and the statement is
    kept exactly as written, still addressing `{id: "excerpt", facet:
    "regions"}`.

**Member cards placed through their group** (on
`bundles/bundle_shared_member.json`: `t` a member of `g1` and `g2`, `u` of
`g1` only, `v` of `g2` only; `set g {cards: …}` aims at the group `g`):

- `set g1 {cards: {t: {width: 650, spacing: 2}}}` gives exactly `{g1:
  {cards: {t: {width: 650, spacing: 2}}}}`; then `set g2 {cards: {t:
  {height: 80}, v: {width: 300}}}` adds exactly `g2: {cards: {t: {height:
  80}, v: {width: 300}}}`, `t`'s two cards placed apart; `{t: {width:
  null}}` on `g1` leaves `{cards: {t: {spacing: 2}}}`, and `{t: {spacing:
  null}}` then removes `g1`'s entry whole. `set g2 {cards: {v: {width:
  300}}}` again is `invalid_value` at `[g2, "cards"]`, "the command changes
  nothing".
- On the member of one group, `set g1 {cards: {u: {width: 650}}}` gives the
  very view `set u {place: {width: 650}}` gives, places exactly `{g1:
  {cards: {u: {width: 650}}}}`.
- Refused: a card of no member, `{v: …}` on `g1`, is `unknown_place` at
  `[g1, "cards", "v"]`, message "'v' is no member of group 'g1'" (the code
  a stored `cards` key naming no member has); `{t: {x: 1}}` `not_an_item`
  at `[g1, "cards", "t", "x"]`, message "'t' is a member: its card takes
  only width, height, spacing and margin" (as `place` refuses it); `{}`
  `invalid_value` at `[g1, "cards"]`; `{t: {}}` and `{t: null}`
  `invalid_value` at `[g1, "cards", "t"]`; `{t: {width: 0}}`
  `non_positive_number` at `[g1, "cards", "t", "width"]`; `cards` on the
  timeline `t` is `wrong_target_kind` at `[t, "cards"]`.

**A block's `places` as stored** (the view check, on a view built as a file
is, codes and paths under `["blocks", "bundle0001", …]`):

23. Readers: `places: []` `invalid_value` at `[…, "places"]`; a place `{}`
    and a place `null` `invalid_value` at `[…, "places", "group_1"]`; `{x:
    null}` `invalid_value` at `[…, "places", "group_1", "x"]`; `{x:
    Infinity}` `non_finite_number`, `{height: 0}` and `{scale: 0}`
    `non_positive_number` and `{spacing: -1}` `invalid_value` at the
    member; `{depth: 1}` `unknown_member` at `[…, "places", "group_1",
    "depth"]`. `cards` of `[]` and of `{}` are `invalid_value` at `[…,
    "places", "group_1", "cards"]`, a card place `{}` at `[…, "cards", "score"]`; a card place
    `{height: 2, scale: 1}` is `unknown_member` at its `scale` and `{length:
    3, width: 2}` at its `length` (the first member in place order), a card
    place stating `cards` at its `cards`, and `{width: 0}`
    `non_positive_number` at its `width`.
24. Keys, in code-point order of the entries and then of each entry's
    `cards`: places `{score: {width: 650}, group_1: {x: 3, cards: {score:
    {x: 1}, page: {width: 650}, performance: {spacing: 1.5}}}, nowhere: {y:
    2}, recording: {x: 4}, annotations: {cards: {score: {width: 1}}},
    group_2: {cards: {page: {width: 650}}}}` give exactly `unknown_member`
    at `[…, "places", "annotations", "cards"]` ("'annotations' is no
    group: its place has no cards"), `unknown_place` at `[…, "places", "group_1",
    "cards", "page"]` ("'page' is no member of group 'group_1' of
    block 'bundle0001'"), `unknown_member` at `[…, "places", "group_1", "cards",
    "score", "x"]` ("'score' is a member: its card takes only width,
    height, spacing and margin"), `unknown_place` at `[…, "places", "nowhere"]` ("'nowhere'
    is no group and no ungrouped root of block 'bundle0001'"), and the same
    at `[…, "places", "recording"]` and `[…, "places", "score"]` (a
    member's bare ID); `group_1`'s own `{x: 3}`, the card of `performance`
    stating `{spacing: 1.5}` and the card of `page` in `group_2` are no
    problem. Keys are checked only once `places` read.
25. `add` a block with `places: {annotations: {y: 8}, group_1: {cards:
    {score: {width: 650}}}}` stores them as given; without them, `places`
    is `{}`; with `places: {group_1: {cards: {score: {x: 1}}}}`,
    `unknown_member` at `[{}, "block", "places", "group_1", "cards",
    "score", "x"]`, with `places: {recording: {x: 1}}` `unknown_place` at
    `[{}, "block", "places", "recording"]`, with `places: {group_1: {}}`
    `invalid_value` at `[{}, "block", "places", "group_1"]`, and with the
    former key `"group_1/score"` `unknown_place` at `[{}, "block",
    "places", "group_1/score"]` (the value's path in the command): an `add` states its places, so a place it
    gets wrong is refused, never dropped.

## Removing a segment (`segments.test.ts`, `commands.test.ts`)

A segment is a child of a segment line: on `segment_children.json`
exactly `i1`, `i2`, `t1`, `t2`, `t3`, `c1` and `c2`. It is not removed on
its own: removing
it would leave a gap in its segment line, and the editor offers no way to
close it yet. On `segment_children.json`, removing `{block: A, id: "t2"}`
is `segment_not_removable` at `[{block: A, id: "t2"}]`, message `Removing
segment 't2' of line 'theme' is not supported yet`, and so is removing `t2`
and `t3` together, another segment not removing its line. Removing it with
its segment line (`theme` and `t2` leave `piece` with the children `intro`
and `coda`) or with its block (`{block: A}` and `t2`) needs no gap and is
accepted.

The arithmetic of the four ways the editor will offer to close the gap is
kept for that feature and proven here. Removing
a segment S of length l from its segment line Λ: **left extend**, the
segment before S grows by l; **right extend**, the segment after S starts
where S started and grows by l; **right shift**, every later segment moves
back by l and Λ shortens by l; **left shift**, Λ's offset in its parent
grows by l as well, so the later segments keep their place there. A
segment of unknown length ends at its successor's offset (the last at Λ's
end); a length that is not known stays unknown.

What proves it: each way is applied to a line whose every number is known
(`segment_children.json`, `theme` unlocked) and to one whose lengths are
not (`unknown_length_segments.json`), and the resulting offsets and lengths
are compared with values worked out by hand from the rule above, written
out literally; what each way moves on the root's axis is written out too.
The ways come in the order of preference (left extend, right extend, left
shift, right shift), each with the reason it is refused or none: a locked
line refuses both shifts (`its segment line 'theme' is locked`), the first
and last segments lack a neighbour (`no segment precedes it`, `no segment
follows it`), a root has no offset to move (`its segment line 'form' is
a root and has no offset to move`), and a result the manifest's rules refuse
is refused with that rule's message (on `segment_line.json`, `segment 'b'
of segment line 'form' does not start where the one before it ends`). A
timeline that is no segment has no ways. A segment's neighbours are
segments, which are never locked, so they may always extend.

Statements naming a removed timeline in `within` go with it, for any
removal: on `segment_children.json` styled with three boundary statements
`within` `theme`, `t1` and `coda`, removing `theme` leaves exactly the
`coda` statement.

## The store and the journal (`store.test.ts`)

`createStore(workspace, {author?, clock?})` holds a `Workspace = {view,
journal, sessions}`. The journal is the authority: a store verifies, before
it opens, that replaying the journal from the empty workspace reproduces
the workspace's view. A journal entry is a command entry `{command, author,
time}` (the command as the command reader reads it) or a session entry
`{session, author, time}`; the author is `"Gerhardt"` until `setAuthor`, the
time `clock().toISOString()`. The tests inject a clock from
`2026-10-11T14:03:12.418Z`, one second per call, so every stamp is exact.

1. **Stamping.** Three accepted dispatches give exactly three entries,
   authored `Gerhardt`, `Gerhardt`, `Ada` (after `setAuthor("Ada")`), at
   `…12.418Z`, `…13.418Z`, `…14.418Z`; `dispatch` returns `null`.
2. **Refusal.** A refused dispatch returns its refusal, consumes no clock
   tick, leaves `view` the same object and the journal as it was, and calls
   no listener.
3. **Undo and redo** step to the very views (`toBe`) each dispatch left;
   `canUndo` and `canRedo` follow; a dispatch after an undo discards what
   was undone.
4. **Undo past the loaded view.** A store opened on another store's
   snapshot undoes its three entries to views deep-equal to the other's
   after the same prefixes, the last `createView()`, and redoes them.
5. **Listeners** hear the new view after every dispatch, undo and redo,
   until they unsubscribe.
6. **Openings.** `openings` counts the editors `open` opened, Cancel and
   Done included; a refused `open` does not count.
7. **Verification.** A snapshot opens with its own view (`toBe`). A view the
   journal does not produce throws `JournalMismatchError` naming the number
   of entries replayed and the first differing path, settings first, then
   blocks by id, then a block's members: a block moved to 99 is entry 3 at
   `["blocks", A, "x"]`; a grid of 16 is entry 3 at `["settings",
   "grid"]`; the same view with an empty journal is entry 0 at `["blocks",
   A]`. A journal entry the commands refuse (a move of a block that does
   not exist) is that entry, 1, at `["journal", 1]`.

## Editor sessions (`sessions.test.ts`)

An editor is opened on an element with `store.open(target)`; the commands
made in it until `done()` or `cancel()` are its **session**. Opening, Done
and Cancel are store operations, never commands. The open editors are the
store's `editing` path, outermost first, each `{session, target, kind,
earlier}`. Every level (the main journal, then one per open editor) keeps
its own entries and undo state; `entries`, `listed`, `canUndo` and
`canRedo` show the innermost level only. A closed session is stored once,
`sessions[id] = {target, entries}`, and journalled on the level below as
one session entry naming it: the target is never repeated in the entry.

A **change** is one command entry at any depth: an entry of a level, or an
entry of a session that a level's session entry names, recursively. A
session entry is never itself a change. A change's **owner** is the
innermost session whose own entries hold it. Undo and redo move by
**steps**: a change the level owns itself (a command of the open editor's
session, or of the main journal on the arranger) is a step of its own; a
change inside a closed session, at any depth, goes with the changes next to
it that the same session owns, a step being a maximal run of consecutive
changes owned by one closed session. Undo reverts the latest applied step
of the innermost level, redo re-applies its earliest undone one, so redo
mirrors undo step for step and on any level the undone changes are the last
ones in order. `entries` (and `journal`, the main level's) are the entries
holding at least one applied change, a partly undone session by its
unchanged entry; `listed` is every entry of the level, undone ones
included, each as `{entry, changes, applied, children}`: how many changes
it holds, how many of them are applied, and for a session entry its own
entries listed the same way ("`SA` 2 of 3" below). `changes` counts what
Cancel would discard: the applied command entries at the opening and now
are compared, and those of each beyond their common prefix are counted
together; with no editor open it is 0. A workspace **replays** when
replaying its journal and sessions from the empty workspace gives its view.

What proves step-wise undo: each undo restores the very view object the
store held before the step's first change was made (never a replay's
copy); the view between two changes of one run is never shown, while the
view between two of the open level's own changes is; a session's own
changes split by an embedded session give one step per run, newest first;
a new command keeps exactly the applied changes at every depth under the
same ids; and the file then replays. Every view named below is the very
object the store held (`toBe`) unless "deep-equal" is said.

The cases run on block `bundle0001` holding `bundles/bundle_mixed.json`,
added by the store's first dispatch. Addresses are objects: `bundle0001`
below stands for the block's address `{block: "bundle0001"}`, `G1` for
`{block: "bundle0001", id: "group_1"}`, `G2` for the same with `group_2`,
and a bare ID `x` in `open x`, `set x …` or `remove x` for `{block:
"bundle0001", id: "x"}`; a session's and an editor's `target` is such an
object, and a path or message names its key. "A `set`" in an editor of
`group_1` is `set score name` or `set performance name`, both inside the
group.

1. **Ids and kinds.** A session id is drawn from bytes exactly as
   `mintBlockId` draws a block id (a byte below 252 gives the digit `byte %
   36` of `0-9a-z`, others are skipped): bytes 0, 1, 35, 36, 252, 255, 71,
   2, 3, 4, 5, 6 give exactly `01z0z23456`; drawn at random the id matches
   `^[0-9a-z]{10}$`. `editorKindOf(view, address)`: `bundle0001` →
   `bundle`; `G1` → `group`; `annotations` (a root) and `excerpt` (a
   child) → `timeline`; the workspace `{}`, the title `{block:
   "bundle0001", part: ["name"]}`, `group_1`'s title, the cards of `score`
   (`part: ["card"]`), a band (`{block: "bundle0001", id: "score", facet:
   "regions"}`), the region `region_1` and the map `tempo` of block `A`
   (`map.json`) → `no_editor` "<address> has no editor" at `[<address>]`;
   `nothing`, `{block: "0000000009"}` and, on a manifest with the id
   `takes`, `takes` (the manifest's own ID addresses nothing) →
   `unknown_target` at `[<address>]`. The editor kind reads the resolver's
   answer.
2. **Done.** `open G1` gives `editing` exactly one editor
   `{session: <ten characters>, target: G1, kind:
   "group", earlier: null}`, `entries` `[]`, `canUndo` false, the view
   unchanged. Two `set`s give `entries.length` 2 and an unchanged `journal`
   (the `add` only). `done()` leaves `editing` empty; the journal is the
   `add` plus `{session: <that id>, author: "Gerhardt", time: <the clock's
   next tick>}`; `sessions` is exactly `{<id>: {target:
   G1, entries: <the two command entries>}}`; the view is
   the one after both sets. The two `set`s are one run of the closed
   session: `undo()` reverts both at once, giving the view at opening (the
   view after the first `set` never shown), `journal` the `add` alone,
   `canUndo` true, and `listed` the `add` `{changes: 1, applied: 1}` and the
   session `{changes: 2, applied: 0}` whose children are both `set`s undone
   (0 of 1 each). `redo()` re-applies both: the view after both sets, the
   session 2 of 2, `canRedo` false.
3. **Undo inside a session stops at its start.** In 2's editor after one
   `set`, two `undo`s leave `entries` `[]`, `listed` that one entry undone
   (`{changes: 1, applied: 0, children: []}`), the view at opening and the
   main journal the `add` alone.
4. **Cancel and its count.** Open, two `set`s, one `undo`: `changes` is 1
   (none at opening, one now). `cancel()`: `editing` empty, the view at
   opening, the journal and `sessions` deep-equal to those at opening,
   `listed` and `canRedo` as at opening. With no editor open `changes` is 0.
5. **Reopen while it is the latest entry: unfolded.** After 2's Done, `open
   G1` again: `editing[0]` has 2's session id and `earlier`
   null; `entries` are 2's two entries (the same objects), `canUndo` true,
   `changes` 0, the journal is the `add` alone and `sessions` is `{}`. The
   reopened session's own changes are the open level's again, one step
   each: the first `undo` gives the view after 2's first `set` and
   `changes` 1, the second the view after the `add` and `changes` 2, where
   on the arranger one `undo` reverted both; `done()` records nothing: the
   journal is the `add` alone and `sessions` is `{}`.
6. **Unfolded, then cancelled.** After 2's Done, reopening and one `undo`
   give `changes` 1 (two at opening, the first of them now); `cancel()`
   restores the journal (the `add` and the very same session entry),
   `sessions` deep-equal to after 2, and the view after both sets.
7. **Changes by common prefix.** In 5's unfolded editor, one `undo` and a
   new `set` give `changes` 2 (two at opening, the first of them and a
   new one now).
8. **Reopen after a later entry: fresh.** After 2's Done, a main-level `set
   bundle0001 x 40`, then `open G1`: a new session id,
   `earlier` 2's id, `entries` `[]`, `canUndo` false, the journal three
   entries (the `add`, the session, the `set`). Opening
   `G2` after 2's Done gives `earlier` null (no session of
   that target).
9. **Nested sessions.** `open bundle0001` (kind `bundle`), one `set
   annotations name "A"`, `open G1`, one `set`,
   `done()`: the bundle editor's `entries` are the command and one session
   entry of the inner session; `done()` again: the journal is the `add` and
   one session entry of the bundle session, whose `entries` are the command
   and the inner session entry; `sessions` holds both. The workspace
   replays, giving one view per entry of `journal` (3). On the main level
   the first `undo()` reverts the inner `set` only (the view after `set
   annotations`, the one the bundle editor held before it opened the inner
   editor), the second the bundle's `set`, giving the view after the `add`:
   the two are owned by different sessions, so each is a run of its own.
10. **Cancel of a nested editor.** In 9, after the inner `set`, `cancel()`
    closes only the inner editor: `editing` is the bundle editor alone,
    `entries` its one command, the view the one after it; `done()` then
    journals a session of one entry.
11. **Opening refusals.** `open {}` (the workspace) → `no_editor` at
    `[{}]`; `open
    nothing` → `unknown_target`; inside `open
    G1`: `open G1` → `not_inside`
    "<G1> does not lie inside <G1>" (each `<G1>` the words of `G1`) at
    `[G1]`; inside `open bundle0001`: `open bundle0001` →
    `not_inside`; a refused open changes neither `editing` nor the
    listeners' count. Done and Cancel with no editor open change nothing.
12. **Snapshot.** Open `G1`, one `set`; `snapshot()` gives
    the view and a journal ending with a session entry whose session is
    `{target: G1, entries: [<the set>]}`; `editing` and
    `entries` still have one each. `readWorkspace(writeWorkspace(snapshot))`
    gives the same journal and sessions (deep-equal). Nested: in 9 before
    either Done, `snapshot()` folds the inner editor into the bundle session
    first; its journal is the `add` and one session entry (`isSessionEntry`
    holds for it) naming the bundle editor's session, whose entries end with
    a session entry naming the inner editor's session, and the snapshot
    replays. With no editor open, `snapshot()` writes only applied changes:
    after 2's Done and one `undo` its journal is the `add` alone and its
    `sessions` `{}`, while the store's `sessions` still holds the session,
    to redo; a partly undone session is written with its applied changes
    only (case 24).
13. **Listeners.** Each of `open`, a dispatch inside an editor, `undo`,
    `redo`, `done` and `cancel` calls the listener exactly once.
14. **The side-effect guard through the store.** The store applies the
    guard ("Containment and the side-effect guard") to every dispatch in an
    editor. In the editor of `G1`, the commands of the
    guard's cases 6 to 11 (the block sized by `width 900` alone) are accepted
    or refused at the same paths, the refused ones journalling nothing
    (`entries` holds the four accepted); the block's `margin` 12 is refused
    as its `length` is, `side_effect` at `[{block: A}, "margin"]` (a fixed
    member of the block, as `spacing`); and `open G2` is
    `not_inside`. In the editor of `G2`, `remove excerpt` is
    refused as in guard case 25, message included, `entries` staying `[]`,
    and `remove page` is accepted as in guard case 27, `entries` holding that
    one `remove`. In the bundle editor, `remove bundle0001` is refused as in
    guard case 18, message included, `editing` the same object and `entries`
    still `[]`.
15. **Done on an emptied unfolded session clears the redo stack below.**
    After the `add`, `open G1`, `set score name "S"`,
    `done()`; a main-level `set bundle0001 x 40` and its `undo` (the redo
    stack holds that `set`, whose view was computed with the session
    applied); `open G1` unfolds the session, `undo`
    empties it and `done()` records nothing. Taking the session off the
    main level changed that level, so `canRedo` is false and `redo()`
    changes nothing: the journal is the `add` alone, the view deep-equals
    the view after the `add` (score named "Score"), and the snapshot
    replays. Were the stale `set` redone, the view would keep score named
    "S" while its journal replays to "Score".

**Three nested sessions.** Cases 16 to 22 run three nested editors: `A` is
the bundle editor of `bundle0001`, `B` the group editor of
`G1`, `C` the timeline editor of `score`. Open
`A`, `B`, `C`; in `C` the change `c` = `set score name "c-name"`, Done; in
`B` the change `b` = `set performance name "b-name"`, Done; in `A` the
change `a` = `set annotations name "a-name"`, Done. The views right after
`c`, `b` and `a` are `Vc`, `Vb`, `Va`, the view after the `add` `V0`. The
main journal is then the `add` and one session entry `SA`,
`sessions[SA].entries` `[SB, a]`, `sessions[SB].entries` `[SC, b]`,
`sessions[SC].entries` `[c]` (`SB`, `SC` the session entries of `B`'s and
`C`'s sessions): each run is one change. "A new command" on the arranger is
`set bundle0001 x 40`.

16. **Three undos, the latest session first.** On the arranger, `listed`
    is the `add` (1 of 1) and `SA` 3 of 3. `undo()` reverts `a`: the view
    `Vb`, the journal still `[add, SA]`, `SA` 2 of 3 with children `SB` (2
    of 2: `SC` 1 of 1, `b` 1 of 1) and `a` (0 of 1); the next `undo()`
    gives `Vc` (`SA` 1 of 3, `SB` 1 of 2, `b` 0 of 1), the next `V0` (`SA`
    0 of 3, `journal` the `add` alone). `canUndo` is still true there; a
    fourth `undo()` reverts the `add` and `canUndo` is false. Four
    `redo()`s give `V0`, `Vc`, `Vb`, `Va`, `canRedo` false.
17. **A new command keeps the applied changes, at every depth, under the
    same ids.** After one `undo()` (`a` undone), a new command: the journal
    is `[add, SA, <the set>]` with `SA` the same entry object; `sessions`
    has exactly the keys of `SA`, `SB`, `SC`; `sessions[SA].entries` is
    `[SB]`, `sessions[SB].entries` `[SC, b]` and `sessions[SC].entries`
    `[c]` (the same entry objects); `canRedo` is false. The snapshot
    replays, its written file does not contain `a-name`, and it reads back
    deep-equal.
18. After two `undo()`s (`a`, `b`), a new command: `sessions[SA].entries`
    is `[SB]`, `sessions[SB].entries` `[SC]`, `sessions[SC].entries` `[c]`;
    the snapshot replays.
19. After three `undo()`s, a new command: the journal is `[add, <the
    set>]` and `sessions` is `{}`.
20. **Reopening a partly undone session hands its undone changes to the
    editor.** After one `undo()`, `open bundle0001` unfolds `SA`: `editing`
    is one editor with `SA`'s session id and `earlier` null, `entries`
    `[SB]`, `listed` `SB` (2 of 2) and `a` (0 of 1), `canRedo` true,
    `changes` 0, the view still `Vb`, the main journal the `add` alone.
    `redo()` gives `Va` and `changes` 1 (`[c, b]` at opening, `[c, b, a]` now).
    `cancel()` restores the main level exactly: the journal `[add, SA]`
    with the very same entry, `SA` 2 of 3, `canRedo` true, `sessions`
    deep-equal to before `open`, the view `Vb`; a `redo()` then gives `Va`.
21. **Inside an editor a closed sub-session undoes by its run and undo
    stops at the opening.** `open bundle0001`, `open G1`,
    `set score name "S"`, `set performance name "P"`, Done: the bundle
    editor's `entries` are `[SB]`, whose two `set`s are one run. `undo()`
    reverts both: the view at the bundle editor's opening, `entries` `[]`,
    `SB` 0 of 2, `canUndo` false; a second `undo()` changes nothing (the
    same view, the main journal the `add` alone); `redo()` gives the view
    after both `set`s, the one the group editor held, `SB` 2 of 2,
    `canRedo` false.
22. **Cancel's count counts changes.** The scenario without `a` (`A`
    closed with Done holding only `SB`): reopening `A` unfolds it with
    `changes` 0; one `undo()` reverts `b` (the run `[b]` of `SB`; `c` is
    `SC`'s) and gives `changes` 1 (`[c, b]` at opening, `[c]` now); a new command
    in `A` (`set annotations name "z"`) discards `b`, rebuilds `SB`'s
    session as `[SC]` under the same id and gives `changes` 2 (`[c, b]`
    against `[c, z]`, common prefix 1): the comparison is by the command entries,
    which the rebuilt session keeps, never by the session objects. On the
    arranger the full scenario's `SA` is listed `{changes: 3}`, its nested
    changes counted.

**The interleaved scenario.** Cases 23 to 27 split a session's own changes
by an embedded session. With the editors `A`, `B` and `C` above: open `A`,
`a1` = `set annotations name "name-a1"`; open `B`, `b1` = `set performance
name "name-b1"`; open `C`, `c1` = `set score name "name-c1"`, `c2` = `set
score name "name-c2"`, Done; `b2` = `set performance name "name-b2"`, Done;
`a2` = `set annotations name "name-a2"`, then Done unless a case keeps `A`
open. The views right after each change are `Va1`, `Vb1`, `Vc1`, `Vc2`,
`Vb2` and `Va2`; `V0`, the view after the `add`, is also `A`'s opening
view. The six changes in order, `a1 b1 c1 c2 b2 a2`, are owned by `SA SB SC
SC SB SA`, so the runs are `[a1] [b1] [c1 c2] [b2] [a2]`. With `A` closed
the main journal is `[add, SA]`, `sessions[SA].entries` `[a1, SB, a2]`,
`sessions[SB].entries` `[b1, SC, b2]` and `sessions[SC].entries` `[c1,
c2]`. The names hold a hyphen, so a search of a file's text for one never
matches a session id (`[0-9a-z]` only).

23. **Five undos on the arranger: `a2`, `b2`, `c1 c2`, `b1`, `a1`.**
    `listed` is the `add` (1 of 1) and `SA` 6 of 6, its children `a1`,
    `SB` (4 of 4: `b1`, `SC` 2 of 2 holding `c1` and `c2`, `b2`) and `a2`.
    Each `undo()` gives: `Vb2` (`SA` 5 of 6, `a2` 0 of 1); `Vc2` (`SA` 4 of
    6, `SB` 3 of 4, `b2` 0 of 1); `Vb1` (`SA` 2 of 6, `SB` 1 of 4, `SC` 0
    of 2: `c1` and `c2` undone by the one undo, `Vc1` never shown); `Va1`
    (`SA` 1 of 6, `SB` 0 of 4); `V0` (`SA` 0 of 6). The journal is `[add,
    SA]` until the fifth, then the `add` alone; `canUndo` is still true and
    a sixth `undo()` reverts the `add`. Six `redo()`s give `V0`, `Va1`,
    `Vb1`, `Vc2`, `Vb2`, `Va2`, `listed` after each deep-equal to `listed`
    before the matching undo, and then `canRedo` is false.
24. **A new command after undoing a run discards the whole run.** After
    three `undo()`s (`a2`, `b2`, then `c1` and `c2` together), `snapshot()`
    writes only the applied changes: its journal `[add, SA]`, its
    `sessions` exactly `SA` `[a1, SB]` and `SB` `[b1]`, no `SC`, and it
    replays, while the store's `sessions` still holds all three, to redo. A
    new command: the journal is `[add, SA, <the set>]` with `SA` the same
    entry object; `sessions` has exactly the keys of `SA` and `SB`,
    `sessions[SA].entries` `[a1, SB]` and `sessions[SB].entries` `[b1]`
    (the same entry objects); `canRedo` is false. The snapshot replays, its
    written file contains `name-a1` and `name-b1` and none of `name-c1`,
    `name-c2`, `name-b2` and `name-a2`, and it reads back deep-equal.
    Loaded into a new store, it keeps the owners: the next `undo()`s revert
    the move, then `b1` alone (`SB`'s run), then `a1` alone (`SA`'s),
    giving views deep-equal to `Vb1`, `Va1` and `V0`, with `canUndo` still
    true. A load that gave a nested change the outermost session as its
    owner would merge `a1` and `b1` into one step.
25. **In the open editor its own changes undo one at a time, a closed
    sub-session by its runs.** The scenario with `A` kept open and `a3` =
    `set annotations name "name-a3"` made after `a2` (view `Va3`): `A`'s
    `entries` are `[a1, SB, a2, a3]`; `a2` and `a3` are consecutive like
    `c1` and `c2`, but owned by the open level. Each `undo()` gives: `Va2`
    (`a3`), `Vb2` (`a2`), `Vc2` (`b2`), `Vb1` (`c1` and `c2`), `Va1`
    (`b1`), then `V0` (`a1`) with `entries` `[]` and `canUndo` false; a
    seventh `undo()` changes nothing, and the main journal is the `add`
    alone throughout. Six `redo()`s mirror them: `Va1`, `Vb1`, `Vc2`,
    `Vb2`, `Va2`, `Va3`. After two more `undo()`s (`a3`, `a2`), `changes`
    is 5 (none at opening, `[a1, b1, c1, c2, b2]` now), and `cancel()` leaves
    `editing` `[]`, the view `V0`, the journal `[add]`, `sessions` `{}` and
    `listed` deep-equal to those before `A` opened.
26. **Reopened, a session's own changes are the open level's again; its
    closed sub-sessions keep their runs.** After the scenario and one
    `undo()` on the arranger (`a2`), `open bundle0001` unfolds `SA`:
    `editing` is one editor with `SA`'s id and `earlier` null, `entries`
    `[a1, SB]`, `listed` `a1` (1 of 1), `SB` (4 of 4) and `a2` (0 of 1),
    `canRedo` true, `changes` 0, the view `Vb2`, the main journal the `add`
    alone. `redo()` re-applies `a2` alone (`Va2`, `changes` 1); each
    `undo()` then gives `Vb2` (`a2`), `Vc2` (`b2`), `Vb1` (`c1` and `c2`),
    `Va1` (`b1`) and `V0` (`a1`), `canUndo` false and `changes` 5 (`[a1,
    b1, c1, c2, b2]` at opening, none now). `cancel()` restores the main level
    exactly: the journal `[add, SA]` with the very same entry, `SA` 5 of 6,
    `canRedo` true, `sessions` deep-equal to before `open`, the view `Vb2`;
    a `redo()` then gives `Va2`.
27. **Loaded from its file, the scenario keeps its runs.** The scenario's
    written file (`A` closed, nothing undone), read back deep-equal to the
    snapshot and loaded into a new store, shows a view deep-equal to `Va2`.
    Each `undo()` then gives a view deep-equal to `Vb2` (`a2`), `Vc2`
    (`b2`), `Vb1` (`c1` and `c2` together, `Vc1` never shown), `Va1` (`b1`)
    and `V0` (`a1`), `canUndo` still true. The file states no owner: the
    load derives each change's owner from the sessions, the innermost one
    whose own entries hold it. A load that gave every change no owner would
    make each change a step of its own, and the third `undo()` would show
    `Vc1`; one that gave a nested change the outermost session `SA` would
    revert all six at the first `undo()`. Case 24's reload catches only the
    second, since no run of two changes is left in the file it loads.

## Containment and the side-effect guard (`contains.test.ts`, `guard.test.ts`)

An editor changes only the element it edits and what that element holds;
the block adapting to it is no side effect. Two pure rules decide it,
and the store applies the second to every command made in an editor, with
the innermost editor's target.

`contains(manifest, container, element)` says whether an element address
(a part, a band or a card allowed) lies inside the timeline or group with
the ID `container`; an element belongs to the timeline its ID names, or,
for an entry, to the timeline holding it, whatever its root. What it must get right
is the boundary drawing.md §2.2 draws with "Belongs to": a timeline holds
everything belonging to it or to a descendant, parts included, while an
ancestor line, drawn inside a member's card, carries the ancestor's address
and so belongs to the ancestor; a group holds its frame, its title and what
its members hold, never what their ancestors hold. The proof is the exact
list of contained addresses over a whole enumeration, which catches an
element wrongly in as well as one wrongly out.

The **guard** compares the view before and after a command for an editor's
target and returns the first change outside the target as `side_effect`,
message `<what> lies outside <target>: an editor changes only what it
edits`, or nothing. Its rules are checked in a fixed order and the first hit
decides the path, so each rule is proved once by its path, and the order by
changes that hit several rules at once. The manifest is compared on a
projection that hides the edited element's own object (a group's object and
each member's), the entries of `graphical.order` keyed by what it contains
(the group's display order, the band orders of the timelines it holds), and
the statements and styles that reach only inside; a test that changes
exactly one hidden thing must be accepted and one that changes exactly one
visible thing must be refused at that thing's address. An element the
target contains before and that no longer exists after is removed inside
the target, never a difference. A refusal and an acceptance are asserted
as the whole result. Given the command's change set, the guard compares
only the settings and blocks it touched, and projects no manifest whose
written paths all lie inside the target with none reaching past it, or
that is the same object. A table of commands (settings, other blocks,
renames, band and display orders, a group's place from a member's editor,
an offset, each inside and outside) gives the same result with the change
set and without it; a `NaN` in an outside `meta`, which only a projection
reads, is accepted with it and throws without it.

Block `bundle0001` holds `bundles/bundle_mixed.json`; `R`, `E` and `D`
are the band orders of "Places, display orders and band orders". `before`
is the view of that block alone, added by `add`; `after` is reached by
`apply` unless a case says it is built by replacing one member of
`before`'s block. As in "Editor sessions", `bundle0001` stands for the
block's address `{block: "bundle0001"}`, `G1` for `{block: "bundle0001",
id: "group_1"}`, and a bare ID `x` as an editor's target or a command's
for `{block: "bundle0001", id: "x"}`; in a path `[x]` is that address's
key, and in a message `<x>` is its words (`<group_2>` is "group
'Facsimile'", `<bundle0001>` is "bundle 'Mixed'": the view holds that
block alone).

**`contains`** (`contains.test.ts`):

1. **A group.** Over `bundle_mixed.json`'s enumeration, `group_2` contains
   exactly, in enumeration order: its frame `{id: "group_2"}` and title
   `{id: "group_2", part: ["name"]}`; for each member in display order its
   card (`{id, part: ["card"]}`), its line, name and five bands with
   everything they hold (`cmap_4` in `page`'s, `cmap_6` in `excerpt`'s, the
   wedges and their labels in each markers band), and for `excerpt` the
   marks `{id: "excerpt", part: ["start"]}` and `["end"]` with their labels
   on its ancestor line, never that line `{id: "recording"}` or its name. A
   band belongs to its timeline, so a member's five bands are in, empty
   ones too. `group_1` contains neither `{id: "group_2"}` nor `{id:
   "annotations", part: ["card"]}`.
2. **A root holding a member.** `recording` contains exactly the elements
   of `excerpt`'s card: its card, `{id: "recording"}`, its name, the marks
   on that line with their labels, `{id: "excerpt"}`, its name, and the
   bands of `excerpt` with what they hold, as in 1.
3. **A child.** `excerpt` contains exactly 2's list without `recording` and
   its name. The ancestor's own map `cmap_5` and its band `{id:
   "recording", facet: "regions"}` lie outside it: `excerpt` contains
   neither and `recording` both. That map is not drawn in `excerpt`'s card
   (drawing.md §8.3), so the enumeration cannot show it; the second answer
   proves that the first is the boundary's, not that of an address
   `contains` does not know.
4. **Entries belong to the timeline holding them.** In `map.json`,
   `phrase` contains `{id: "ticks"}` (its map) and not `{id: "tempo"}`;
   `melody` contains both, `{id: "phrase", part: ["name"]}` and `{id:
   "ticks", part: ["label"]}`.
5. **Anything else contains nothing.** The map `tempo` and the unknown
   `nothing` contain not even themselves, nor `{id: "melody"}`; no
   container contains the title `{part: ["name"]}`, the bundle `{}` or an
   unknown address; `group_1` does not contain the title either.

**The guard, the exact cases** (`guard.test.ts`), each in the editor of
`G1` unless named:

6. `set group_1 place {length: 300}` (`places` replaced) → nothing.
7. `set group_2 place {x: 10}` (`places` replaced) → `side_effect` at
   `[group_2]`, message `the place of <group_2> lies
   outside <G1>: an editor changes only what it edits`.
8. `set score name "S"` → nothing.
9. `set annotations name "A"` → `side_effect` at
   `[annotations]`, message `<annotations> lies
   outside <G1>: …`: the first element of the enumeration
   that differs is the card of `annotations` (`{id: "annotations", part:
   ["card"]}`), reported as its element, `annotations`.
10. `set bundle0001 length 500` → at `[{block: "bundle0001"}, "length"]`; `set
    bundle0001 {x: 40, y: -8, width: 900, height: 300}` → nothing.
11. `style {select: {element: "timeline"}, set: {stroke: "#FF0000"}}` → at
    `["bundle0001", "manifest", "graphical", "statements"]`; the same with
    `select: {addresses: [{id: "score"}]}` → nothing.

**Each rule's path, once:**

12. **Settings.** `grid` replaced by `{size: 16, snap: true}` → at
    `[{}, "grid"]`, message `the workspace setting grid lies
    outside …`, in `G1`'s editor and in the bundle editor alike.
13. **Another block.** With a second block `0000000000` holding
    `bare.json`: `set {block: "0000000000"} x 50`, `add` of block
    `0000000001` (`bare.json`) and `remove {block: "0000000000"}` → at the
    blocks' addresses `[{block: "0000000000"}]`, `[{block: "0000000001"}]`,
    `[{block: "0000000000"}]`, message `the anonymous bundle lies outside
    …` (`bare.json` has neither name nor id);
    the bundle editor refuses the move alike.
14. **Band orders.** A timeline's band order lies inside every editor that
    holds the timeline, and outside one that does not, refused there where
    a display order is, at `["bundle0001", "manifest", "graphical",
    "order"]`, message `the graphical order of bundle 'Mixed' lies
    outside …`. `set excerpt order E` → nothing in the editors of
    `excerpt` (its own), `recording` (its parent's)
    and `group_2` (its group's); from there, `set excerpt order
    null` → nothing in the editor of `excerpt`. `set recording
    order R` → refused in the editor of `excerpt` (the parent's
    order changes the child's drawing, but the child's editor does not hold
    the parent) and in the editor of `group_2` (`recording` is
    the ancestor of a member, outside the group). In `G1`'s editor, `set
    score order E` → nothing (a member) and `set annotations order D` (an
    entry the fixture lacks) → refused.
15. **A top-level member.** The manifest's `name` replaced by `"Other"` →
    at `["bundle0001", "manifest", "name"]`. A measure map is compared on
    its own, as a group is, since no timeline or group contains it: the
    measure map `{id: "bars", name: null, meta: {}, rows: [{count: 1,
    qstamp: [0, 1]}]}` appearing in `measure_maps` → at
    `[bars]`, message `<bars> lies outside …`.
16. **A named style.** After `style {select: {element: "timeline"}, set:
    {stroke: "#FF0000"}, name: "accent"}`, the same with `stroke:
    "#00FF00"` (the statement unchanged) → at `["bundle0001", "manifest",
    "graphical", "styles"]`; with `select: {addresses: [{id: "score"}]}` for both, the
    style is used only by an inside statement → nothing.
17. **A display order.** `graphical.order.group_1` replaced by
    `["performance", "score"]` → nothing in `G1`'s editor; at
    `["bundle0001", "manifest", "graphical", "order"]` in the editor of
    `score`.
18. **The edited element removed.** `remove G1` → at
    `[G1]`, message `the removal of <G1>
    lies outside …`; the block removed (`remove bundle0001`) → the same. In
    the editor of the root `annotations`, `remove annotations` →
    at `[annotations]`, message `the removal of
    <annotations> lies outside <annotations>: …`. In the
    bundle editor, `remove bundle0001` → at `["bundle0001"]`, message `the
    removal of <bundle0001> lies outside <bundle0001>: …`: an editor never
    removes the element it edits, whatever its kind.

**The order of the rules:**

19. With the second block of 13, the `style` of 11 without `blocks`
    touches both blocks and is refused at `["0000000000"]` (another block),
    not at the statements (the manifest).
20. One `after` with `grid` replaced, the block's `length` 500, `places`
    `{group_2: {x: 10}}` and the name of `annotations` "A" → at
    `[{}, "grid"]`; without the grid → at `["bundle0001",
    "length"]`; without the length too → at `[group_2]`; with
    the name alone → at `[annotations]`.

**Statements, inside and outside:**

21. **Inside in both manifests.** A statement lies inside a container when
    every element it matches in each manifest compared is contained there.
    With `after`'s manifest built with `group_1`'s members `[performance]`
    (its display order removed), `{select: {addresses: [{id: "score"}]}}` is inside
    `group_1` judged on `before` alone and outside judged on both;
    `{select: {element: "timeline"}}` is outside on `before`; `{select:
    {addresses: [{id: "nothing"}]}}` matches nothing and is inside. The guard refuses
    such an `after` already at `[score]`, since `score`'s
    object is hidden only while it is a member: a statement can move across
    the boundary only with a change the projection shows, so this rule is
    tested on its own, without a command.
22. **Statements selecting bands.** A band belongs to its timeline, so a
    statement lies inside when every band it matches belongs to a timeline
    the editor holds. `style {select: {addresses: [{id: "excerpt", facet:
    "regions"}]}, set: {display: "inline"}}` → nothing in the editors of `excerpt`
    and `recording`, and at `["bundle0001", "manifest",
    "graphical", "statements"]` in the editor of `score`; `style
    {select: {element: "band", facet: "regions"}, set: {display:
    "inline"}}`, which matches the regions band of every timeline, → at the
    statements in `G1`'s editor and nothing in the bundle editor.

**Editors of a timeline and of the bundle:**

23. **A child's editor.** In the editor of `excerpt`, `set
    recording name "R"` → at `[recording]`; `set excerpt name
    "E"` → nothing.
24. **The bundle editor.** In the editor of `bundle0001`, `set annotations
    name "A"`, `set bundle0001 length 500`, the `style` of 11, and `places`
    replaced by `{group_2: {x: 10}}` each → nothing; only the settings
    rule, the other-block rule and its own removal (18) apply to it.

**The element a manifest refusal names.** Of the differing elements, a
refusal names the first, in the enumeration's order, that the target
contains neither before nor after. A differing element the target contains
on one side only (a member joining or leaving its group) is named only when
nothing outside differs, as in 21.

25. **A member removed in its group's editor.** In the editor of
    `group_2`, `remove excerpt` → `side_effect` at
    `[recording]`, message `<recording> lies outside
    <group_2>: an editor changes only what it edits`. The
    enumeration meets the card of `excerpt` first, but that is a removal inside
    `group_2`; what lies outside is its parent `recording`, whose
    `children` lose it.
26. **A timeline's editor.** In the editor of `recording`, `set
    excerpt name "E"` differs only inside its subtree → nothing, while
    `remove excerpt` reaches `group_2`, which names it as a member → at
    `[group_2]`, message `<group_2> lies outside
    <recording>: …`. In the editor of `excerpt`, one
    `set` naming `excerpt` "E" and `recording` "R" → at
    `[recording]`, message `<recording> lies outside
    <excerpt>: …`.

**Removals inside the target.** A group's editor may remove a root
member: its object, `members` and display order lie inside the group. A
timeline's editor hides its subtree, so only what names a removed
descendant from outside (a group, 26) is refused. The proof is the
manifest after the removal, next to two removals that reach outside.

27. **A root member removed in its group's editor.** In the editor of
    `group_2`, `remove page` → nothing; the manifest after has
    no timeline `page`, and `group_2`'s `members` and
    `graphical.order.group_2` are `["excerpt"]`.
28. **Removals that reach outside stay refused.** In the same editor,
    `remove excerpt` → at `[recording]` (25); `page` leaving
    `group_2` while it stays an ungrouped root (`after` built with
    `group_2`'s `members` and display order `["excerpt"]`) → `side_effect`
    at `[page]`, message `<page> lies outside
    <group_2>: an editor changes only what it edits`: `page` then
    lies outside, its whole object visible.

**Geometry in the editors.** A member is drawn with its group's length
and scale (drawing.md §8.6), so in a member's editor these members of the
group's place are its own, as is its card's place. A horizontal stretch
from a member's card keeps the frame's and every card's requested width in
proportion (drawing.md §1), and a change of its spacing the frame's
requested height, so the group's `width` and `height` and every sibling card's
`width` are the member's too; the group's `spacing` and a sibling's
`height` and `spacing` are not. A group's editor holds its frame's place
and its members' card places; an ungrouped root's editor its whole place.
A card's place lies at `places[G].cards[T]` (`places[T]` for an ungrouped
root's), and lies inside an editor exactly when the editor contains the
card (a card belongs to its timeline); a refusal names the place by the
element a `set` of it aims at, the group or the timeline (`the place of
performance`). The exception is proved narrow by a refusal beside every acceptance:
another member of the group's place, another member of a sibling's card,
another group's place, and the group's place in the editor of a timeline
that holds a member without being one.

29. **A member's editor.** In the editor of `score`: `set
    group_1 place {length: 500}`, `set group_1 place {scale: 1.5}`, `set
    score place {width: 650}`, `set score place {spacing: 1.5, height:
    120}` and one `set` of the first three → nothing each; with `group_1`
    placed `{x: 10}` before, `set group_1 place {length: 500}` → nothing.
    One `set` of `group_1` `place {length: 500, width: 900}` and
    `performance` `place {width: 650}` → nothing; `set group_1 place
    {height: 300}` and one `set` of `group_1` `place {height: 300}` and
    `score` `place {spacing: 2}` → nothing each; with `performance` placed
    `{width: 650, height: 120, spacing: 1.5}` before, `set performance
    place {width: null}` → nothing. `set group_1 place {x: 10}` →
    `side_effect` at `[group_1]`, message `the place of
    <G1> lies outside <score>: an editor changes
    only what it edits`; `set group_1 place {spacing: 1.5}` → the same;
    `set performance place {spacing: 1.5}` and `set performance place
    {height: 120}`, alone or beside the stretch's `set` of `group_1`
    `{length: 500}` in one command → at `[performance]`,
    message `the place of <performance> lies outside
    <score>: …`; `set group_2 place {length: 500}` and `set
    group_2 place {width: 900}` → at `[group_2]`; `set page
    place {width: 650}` (a card of another group) → at
    `[page]`.
30. **A child member's editor.** In the editor of `excerpt`,
    `set group_2 place {length: 500}` → nothing. In the editor of
    `recording`, which holds `excerpt` but is no member: the
    same `set` → at `[group_2]`.
31. **A group's editor.** In `G1`'s editor, `set score place {width: 650,
    height: 120, spacing: 1.5}` and `set group_1 place {spacing: 1.5}` →
    nothing each.
32. **An ungrouped root's editor.** In the editor of
    `annotations`, `set annotations place {scale: 1.5, width:
    700}` → nothing.
33. **The bundle editor.** In the editor of `bundle0001`, `set bundle0001
    scale 2` → nothing: the bundle itself resizes.

## The workspace file (`file.test.ts`)

`writeWorkspace(workspace)` is TimeToShare's `dumps` (keys sorted) of
`{meta, name, settings, blocks, journal, sessions}`, format version 6
(since a block and its defaults carry `margin`, which a version-5 file
lacks);
`readWorkspace(text)` reads with TimeToShare's `parseJson` (lossless) and
returns a `Workspace` or a `LoadError`. An entry is exactly `{command,
author, time}` or `{session, author, time}` (chosen by the presence of
`session`); a session is exactly `{target, entries}`, its target an
address object as `readAddress` reads it (so are the addresses of the
commands its entries and the journal's hold), its entries entries, at least one (Done never closes a session
without entries); a session id is ten characters of `0-9a-z`, as a key of
`sessions` and in an entry. Every session is reached exactly once from
`journal` through session entries.

1. **Round trip.** A workspace built by a store (blocks of `bare.json` and
   `map.json`, a move, a style, an undone command excluded) is written; the
   text read back deep-equals the workspace, and writing it again gives the
   same bytes. Its members are exactly `blocks`, `journal`, `meta`,
   `name`, `sessions`, `settings`; `meta` is exactly `{format:
   "tilie-workspace", version: 6}`; `name` is `untitled`; `sessions` is
   `{}`.
2. **Replay.** Replaying the read journal from `createView()` gives exactly
   the read `settings` and `blocks`.
3. **Refusals**, each exactly one problem `{code, path}`: text `{` →
   `invalid_json` at `[]`; `format: "other"` → `unsupported_format` at
   `["meta", "format"]`; `version: 7` → `unsupported_version` at `["meta",
   "version"]`; a block without `margin` → `missing_member` at `["blocks",
   A, "margin"]`; a block's `margin` −1 → `invalid_value` at `["blocks", A,
   "margin"]`; `blockDefaults` without `margin` → `missing_member` at
   `["settings", "blockDefaults", "margin"]`; a top-level member `extra` → `unknown_member` at
   `["extra"]`; `meta.created` → `unknown_member` at `["meta", "created"]`;
   `settings.styles` → `unknown_member` at `["settings", "styles"]`; a
   block's `overrides` → `unknown_member` at `["blocks", A, "overrides"]`; a
   journal entry's `note` → `unknown_member` at `["journal", 0, "note"]`; no
   `journal` → `missing_member` at `["journal"]`; no `sessions` →
   `missing_member` at `["sessions"]`; a block's `x` given as `"0"` →
   `invalid_value` at `["blocks", A, "x"]`; a block's `blockKind` →
   `unknown_member` at `["blocks", A, "blockKind"]`; a block manifest
   declaring `0.6.0` → `schema_violation` at `["blocks", A, "manifest",
   "timetoshare"]`; a block manifest with a region ending before it starts
   → `region_end_before_start` at its path below `["blocks", A,
   "manifest"]`; an entry time `yesterday` → `invalid_value` at
   `["journal", 0, "time"]`; an entry command aimed at `into:
   "workspace"`, the former string form, → `invalid_address` at
   `["journal", 0, "command", "into"]`; an entry command of type `move` →
   `invalid_command` at `["journal", 0, "command", "type"]`.
4. **Version 4.** A version-4 file (the round trip's text with `version:
   4` and its commands' addresses written as that format wrote them,
   strings: the `add`s `into: "workspace"`, each `set` aimed at the bare
   block id) is refused for its version alone: exactly one problem,
   `unsupported_version` at `["meta", "version"]`, message `workspace
   version 4 is not supported; this editor reads version 6 only`. There is
   no migration. **Version 5** likewise: the round trip's text with
   `version: 5` and every block's and the block defaults' `margin` removed,
   as that format wrote them, is refused with exactly one problem,
   `unsupported_version` at `["meta", "version"]`, message `workspace
   version 5 is not supported; this editor reads version 6 only`.
5. **Sessions in the file.** On the text of a workspace whose journal is
   the `add` of block `A` holding `bundles/bundle_mixed.json` and one entry
   naming session `s = "session001"`, `{target: {block: A, id: "group_1"},
   entries: [<set {block: A, id: "score"} name "S">]}` (written by a store
   and then edited as text,
   so the file is read without any editor), each change gives exactly the
   problems listed, `{code, path}` in this order: first every session entry
   in turn, the journal's, then each session's in key order (one naming no
   session is `unknown_session`, one naming a session an earlier entry
   named is `session_referenced_twice`); then every session not reached
   from the journal, in key order, `unreferenced_session`; nothing of this
   is checked while another problem stands. The journal entry naming
   `0000000099` instead of `s` → `unknown_session` at `["journal", 1,
   "session"]` and `unreferenced_session` at `["sessions", s]`; an extra
   session `0000000098` (holding `s`'s entries) that nothing names →
   `unreferenced_session` at `["sessions", "0000000098"]`; two sessions
   `0000000097` and `0000000098` naming each other and nothing else naming
   them → `unreferenced_session` at `["sessions", "0000000097"]` and at
   `["sessions", "0000000098"]` (exactly these two); `s`'s entries gaining
   a second entry naming `s` itself → `session_referenced_twice` at
   `["sessions", s, "entries", 1, "session"]`; an entry with both `command`
   and `session` → `unknown_member` at `["journal", 1, "command"]`; a
   session's `note` → `unknown_member` at `["sessions", s, "note"]`; a
   session without `target` → `missing_member` at `["sessions", s,
   "target"]`; a session target `nowhere`, one in the former string form
   `"<A>/group_1"` and one naming no block, `{id: "group_1"}`, → each
   `invalid_address` at `["sessions", s, "target"]`; the entry naming
   `Session001` (upper case)
   → `invalid_value` at `["journal", 1, "session"]`; a key `bad` of
   `sessions` → `invalid_value` at `["sessions", "bad"]`; `s`'s entries
   `[]` → `invalid_value` at `["sessions", s, "entries"]`, message "a
   session holds at least one entry". The unchanged text reads back to a
   workspace that replays.
6. **Block manifests in either form.** The round-trip workspace's text with
   every block manifest written in its minimal form reads as a workspace
   deep-equal to the one read from the original text: a block holds the
   complete form.
7. **Places in the file.** A store's workspace of block `A` holding
   `bundles/bundle_mixed.json` with `set {block: A, id: "group_1"} place
   {length: 300, scale: 1.25, spacing: 2, margin: 3}` and `set {block: A,
   id: "score"} place {width: 650, spacing: 1.5, margin: 1}` is written;
   the text reads back deep-equal and writes the same bytes, `places`
   exactly `{group_1: {length: 300, scale: 1.25, spacing: 2, margin: 3,
   cards: {score: {width: 650, spacing: 1.5, margin: 1}}}}`. That text
   with `length: 300` added to `score`'s card place is refused with exactly
   one problem, `unknown_member` at `["blocks", A, "places", "group_1",
   "cards", "score", "length"]`, message `'score' is a member: its card
   takes only width, height, spacing and margin`; with `score`'s `spacing`
   `-1`, `invalid_value` at `["blocks", A, "places", "group_1", "cards",
   "score", "spacing"]`; with its `margin` `-1`, `invalid_value` at
   `[…, "score", "margin"]`; with `group_1`'s
   `scale` `0`, `non_positive_number` at `["blocks", A, "places",
   "group_1", "scale"]`.

## Names (`names.test.ts`)

The workspace has a name, the default name of its file; a manifest, a
group, a timeline, a conversion map, a region and a flow-control element
have the schema's nullable `name`, each settable by `set` on its own target
(the manifest's on its block's address). What proves it: each value is
read back from the view, or from the file, exactly; each refusal by code
and path, the view unchanged.

1. **The workspace's name in the view and the file.** `createView().name`
   is `untitled`. A store's workspace after `set {target: {}, values:
   {name: "Eroica sketches"}}` writes `"name": "Eroica sketches"`
   between `meta` and `sessions` (keys sorted), and reads back with that
   name, writing the same bytes. The round trip's text without its `name`
   member reads as a workspace named `untitled`, and writing it again
   gives the text with `"name": "untitled"` added and nothing else
   changed; `createStore` over it opens a workspace named `untitled`. A
   stated `name` of `""` is refused with exactly one problem,
   `invalid_value` at `["name"]`; of `3`, the same.
2. **Setting the workspace's name.** `set {target: {}, values: {name:
   "Eroica sketches"}}` changes the name and nothing else (the settings and
   the blocks are the same objects); `""`, `null` and `3` are
   `invalid_value` at `[{}, "name"]`; the name it already
   has is `invalid_value` "the command changes nothing" at the same path.
   The journal replays to the name: `createStore` over that workspace's
   `{view, journal, sessions}` succeeds, and over the same view named
   `other` with the journal unchanged throws `JournalMismatchError` at
   `["name"]`. Every replay starts from the empty workspace, named
   `untitled`: the renamed workspace, written and read back, opens named
   `Eroica sketches`, and undoing the rename there gives `untitled`;
   renamed back to `untitled` before it is written, it writes `"name":
   "untitled"`, opens named so, and undoing that rename gives `Eroica
   sketches`. The one-block workspace whose journal never names it, its
   file stating `"name": "sketches"`, is refused with
   `JournalMismatchError` after its one entry (`entry` `1`) at `["name"]`:
   no command gave it that name.
3. **An editor does not rename the workspace.** With the bundle editor of
   block `A` (`{block: A}`) open, the same `set` is `side_effect` at `[{},
   "name"]`, message `the workspace name lies outside the anonymous
   bundle: an editor changes only what it edits` (`bare.json` has neither
   name nor id).
4. **Names in a manifest**, on `bundles/bundle_mixed.json` in block `A`
   (the manifest named `Mixed`): `set {target: {block: A}, values: {name:
   "Op. 35"}}` leaves the manifest's `name` `Op. 35`, the rest of the
   manifest equal; `null` leaves it `null`. `set {block: A, id: "group_1"}
   {name: "Duo"}` leaves `group_1` named `Duo` and every other member of it
   and of the manifest equal; `null` leaves it `null`; `3` is
   `invalid_value` at `[{block: A, id: "group_1"}, "name"]`. On
   `map.json`, `set {block: A, id: "tempo"} {name: "Beat"}` stores
   `name: "Beat"` in the map `tempo` (named `Tempo`), its payload otherwise
   equal. Each
   value the target already holds is refused as changing nothing. An
   `add` of a block whose value carries `name` is `unknown_property` at
   `[{}, "block", "name"]` (the value's own path in the command): a block's
   value states the block's own members, the manifest its own name.

## Segment lines gain their first segment (`segment-lines.test.ts`)

A segment line's segments end where it ends, so a segment line of known
length without children cannot exist. Every manifest an edit leaves (a
whole manifest set on a block, as the Manifest tab's Apply sends it; a
timeline set to be a segment line; a timeline added) is given, for every
segment line of known length that holds no segment, one segment from 0
covering its whole length: a child of the line's unit, stating the line's
`number_type` when the line states one, at offset 0 in the line's number
type (`0`, `0.0` or `[0, 1]`), as long as the line (the same JSON value),
unlocked (a segment is never locked), its id the smallest `{prefix}_{N}`
of its unit's class that no ID of the manifest (the manifest's own and
its elements', never a string under `meta` or `graphical`), nor of the
manifest a timeline is added into, equals. A segment line of unknown length is left
without segments: nothing fixes where they would end. Reading a manifest
from a file applies nothing. The replay of a journal reproduces it, since
the rule is part of the command.

What proves it, each manifest compared exactly:

1. **Apply.** On `bundles/bundle_mixed.json` in block `A`, the manifest
   with `is_segment_line: true` on `page` (pixels, int, length 1920, a
   member of `group_2`, no children) set as `A`'s `manifest` is accepted:
   `page` holds exactly one child, `{id: "dgt_1", unit: "pixels",
   number_type: "int", offset: 0, length: 1920, locked: false,
   is_segment_line: false, …the defaults}`, and the tree of every line
   given a segment takes the locks its places decide, as the setter of
   case 2 gives them: `page`, a segment line that is a group member, holds
   `locked: true` although the applied text states `false`. The same manifest
   read by `loadManifest` is refused with `schema_violation` at
   `["timelines", 1, "length"]`, message `the segments of segment line
   'page' do not end at its length`.
2. **The setter.** `set {block: A, id: "page"} {is_segment_line: true}` gives the same
   `page`, except that its place now decides its lock: a segment line that
   is a group member is locked, so `page` holds `locked: true`. The
   command is one journal entry, and `createStore` over the workspace it
   leaves verifies (the replay reproduces the segment). `{is_segment_line:
   true}` on `{block: A, id: "score"}` (fraction quarters, length `[12, 1]`, no
   children) gives the segment `{id: "clt_1", unit: "quarters",
   number_type: "fraction", offset: [0, 1], length: [12, 1], …}`;
   `performance` (float seconds, 12.5) the segment `cpt_1` at offset `0.0`
   (a `JsonFloat`) of length `12.5`.
3. **The id is free in the manifest.** On `bundle_mixed.json` with a root
   `dgt_1` (pixels, 10) added first, the segment of `page` is `dgt_2`. An
   `id` under `meta` is no ID of the manifest: `page` applied as a segment
   line with `meta: {id: "dgt_1", note: {id: "dgt_2"}}` gains `dgt_1`.
4. **Unknown length.** On a root `open` of unknown length (quarters)
   added to `bare.json`'s block, `set {block: A, id: "open"} {is_segment_line: true}`
   leaves `open` a segment line without children, its length `null`.
5. **Turning it off.** The schema lets a timeline that is no segment line
   hold any children within its length, so turning the flag off keeps the
   segments as children. On `segment_line.json`, `set {block: A, id: "form"}
   {is_segment_line: false}` leaves `form` with the children `a`, `b` and
   `c` exactly as they were (offsets, lengths, their own segments): each
   is still a segment line, now a child, and so still locked; their
   segments stay unlocked. Turning off `b` alone, a segment beside the
   segment lines `a` and `c`, is refused by the schema: `schema_violation`
   at `[A, "manifest", "timelines", 0, "children", 1, "is_segment_line"]`.
   Setting the flag to the value held is refused as changing nothing at
   `[{block: A, id: "form"}, "is_segment_line"]`; `"yes"` is `invalid_value` there.
   Turning the flag off lifts the lock the place rule gave the line for
   being a segment line, and keeps a lock no place decided: on
   `bundle_mixed.json`, the member `performance` (unlocked) turned on holds
   `locked: true`, turned off again `locked: false`, its segment `cpt_1`
   unlocked; the same for a child `c` (quarters, `[0, 1]`, `[4, 1]`, no
   `locked` stated) added into `bare.json`'s root. The root `form`, no
   child and no member, set `locked: true` and then turned off keeps
   `locked: true`.
6. **Adding a segment line.** `add {into: {block: A, id: "bare"}, child: {id: "sl", unit:
   "quarters", offset: [0, 1], length: [4, 1], is_segment_line: true}}`
   into `bare.json`'s root adds `sl` holding the segment `clt_1` from `[0,
   1]` of `[4, 1]`, `sl` locked by its place (a segment line that is a
   child).
7. **Preview.** `preview` of the setter of case 2 gives the same manifest
   as `apply`.

## Properties (`properties.test.ts`, fast-check)

Commands of every kind, over every target kind, are generated against the
current view from seeds (a command kind and natural numbers), so a sequence
stays valid input whatever the earlier commands did. Targets are address
objects drawn from what the view holds plus unknown ones (`ghost`, an
absent block), ones no command aims at (a band, the cards of a timeline,
a block's title) and malformed ones (`{block: "short"}`, a facet without
an ID); properties from
the target's table, another kind's table and unknown names; coordinates on
the axis, off it, negative and past the end, and lengths of null; payloads
include ones the schema refuses (an ID holding a control character among
them); selectors include `addresses`, `facet` and the element `frame`. A
`margin` is generated wherever a `spacing` is, from the same values: on a
block, on an item's place (`places[K]`) and on a member's card
(`places[G].cards[T]`). Among them are `place` (members stated,
unstated with null, empty, unknown, on items and members' cards) and
`order` (a display order or band order turned, null, missing an entry,
holding an entry that is neither `line` nor a facet, not an array), so every saved file also
proves that no stale `places` key or `graphical.order` entry survives a
command; and the topology commands `parent` (`null`, another timeline,
itself, an unknown id), `group` (a group, `null`, an unknown id, a number)
and `add` of a root timeline or a group (fresh or taken ids, members
existing or not), so a reshaped manifest still saves, reloads and replays.
Each manifest fixture starts as block `A` beside a block `B` of
`bare.json`, in a store with an injected clock, for ten sequences.

1. After every accepted command the view check finds nothing, and every
   block's manifest saves and reloads deep-equal with identical text.
2. A refused command leaves the view the same object.
3. Undoing every entry restores every intermediate view (the same objects),
   and redoing every entry restores them again.
4. Replaying the journal from `createView()` gives `settings` and `blocks`
   deep-equal to the store's.
5. Every entry carries the author and the injected clock's time.
6. `writeWorkspace(readWorkspace(text))` equals `text` byte for byte, and the
   read workspace deep-equals the store's.
7. The generator reaches every refusal the commands produce on these
   targets: over a fixed sample (seed `20261011`, 150 sequences per fixture)
   the set of codes observed is exactly `already_member`,
   `child_exceeds_parent`, `cycle`, `duplicate_id`, `duplicate_index`,
   `id_not_settable`, `invalid_address`, `invalid_coordinate`,
   `invalid_index`, `invalid_order`, `invalid_value`,
   `length_below_content`, `locked`, `negative_child_offset`,
   `nested_member`, `non_finite_number`, `non_positive_number`, `not_an_item`, `not_removable`,
   `number_type_not_allowed`, `region_end_before_start`, `schema_violation`,
   `segment_end_fixed`, `segment_never_locked`, `segment_not_removable`,
   `segment_structure`, `unit_mismatch`, `unknown_property`,
   `unknown_target`, `unlocking_not_supported`, `wrong_target_kind`.
   `unlocking_not_supported` is reached in
   `bundles/bundle_shared_parent.json`, whose `exposition` and
   `recapitulation` are segment lines that are children of `score` and
   group members, locked by their place. The sample runs in one test,
   measured at 9.8 to 10.7 s at a load average of 6, with an explicit
   timeout of 32 s, about three times the slowest measurement. The refusals
   of the store's editors (`no_editor`, `not_inside`, `side_effect`) are
   pinned by the session and guard tests.

**Editing sequences.** The same fixtures, in the same store, run sequences
of up to 30 steps, ten per fixture, each step a seed with an operation: a
command, opening an editor, a reopen (the target of the latest session of
the innermost level, so the reopen rule unfolds it), a whole session (open,
one or two commands, Done), an unfold (reopen, undo until nothing is left to
undo or one step, Done), Done, Cancel, undo and redo. A command in an open
editor is mostly one that stays inside it (a name or a band order of a
timeline it holds, its place's `x`, `scale`, `spacing`, `margin` or `width`, a group's
display order, for a member its group's `length` and `scale`, the block's
width), sometimes any generated command, so the guard both accepts and
refuses; a target to open is mostly one the innermost editor holds, so
editors nest, sometimes one outside it, one without an editor or one naming
nothing.

8. A step that changes nothing (a refused command or opening, undo or redo
   with nothing to do, Done or Cancel with no editor open) leaves the view
   and the editing path the same objects.
9. After every other step the snapshot replays, and
   `readWorkspace(writeWorkspace(snapshot()))` deep-equals the snapshot
   (view, journal and sessions).
10. After every such step, redoing step by step on the innermost level as
    long as `canRedo` holds gives a snapshot that replays too; as many
    undos as there were redos then undo them again. Undone changes kept
    across a change of the level below them (a Done that took a session off
    it), or a partly undone session written with its undone changes, fail
    here. Once undone again, the view is the very object (`toBe`) the step
    left: undo returns to the level's recorded views, never to a rebuilt
    copy, and redo mirrors undo step for step.
11. Cancel is exact. At every opening the store's `view`, `journal`,
    `sessions` and `listed` are recorded, and a Done that closes an editor
    forgets the innermost record. A Cancel that closes an editor gives back
    that record: `view` the same object, `journal`, `sessions` and `listed`
    deep-equal, after any nesting, unfold or partial undo in between.
12. Undo and redo never split a run. After every step, in `listed`, no
    session entry at any depth holds two adjacent command entries of which
    one is applied and the other undone. The level's own entries are not
    checked, since they undo one at a time.

## Budgets (`budget.test.ts`)

The budgets time the code, so they do not run with the default suite, whose
files run in parallel: `pnpm test` excludes this file and `pnpm
test:budget` (in `app/`) runs it alone. Each figure is the minimum of 5 runs
after one warm-up run, so it measures the code rather than the load of the
machine. A budget that fails is reported, never loosened.

The workspace is generated: 300 blocks (the package's one-root fixtures in
turn) with a journal of 1,000 entries (300 `add`, 700 `set` moves).
`readWorkspace` of its text, validation included, takes at most 250 ms,
`writeWorkspace` at most 250 ms, one `dispatch` of a move at most 1 ms (the
limits and the figures behind them are in the repository's
`decisions/0019-workspace-store-and-journal.md`). Opening it,
`readWorkspace` and `createStore` with the journal's verification, is
measured and printed, not held to a budget: 497 to 501 ms over three runs,
each the minimum of 5, at a load average of 4. With `TILIE_MEASURE=<file>`
the test also builds 10,000 blocks (10,000 entries) and writes the figures
of both sizes into that file.

## External gates

Strict type checking, Biome, dependency-cruiser and the whole Vitest suite
pass.
