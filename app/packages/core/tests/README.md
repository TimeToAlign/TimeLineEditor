# `@timetoalign/tilie-core` tests

`core` holds exact coordinates, one TimeToShare manifest of TimeToShare's
`SCHEMA_VERSION` (`{timetoshare, timelines, "@context"?, id?, name?,
meta?, groups?, measure_maps?, resources?, statements?, provenance?,
graphical?}`: root timelines, optionally named, optionally grouped,
optionally described by property–value statements, naming the files beside
it, its `graphical` holding named timestamps and named MatchStamps), the
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
`groups/`, `bundles/` and `flow/`, each in the complete form beside its minimal twin
(`<name>.minimal.yaml`, canonical YAML), and the shared rejection cases of
`fixtures/rejections/<SCHEMA_VERSION>/`. A variant is built from a fixture
through commands, or by changing the fixture's value before loading it
(lifting a lock by stating `locked: false` is one such change). Core holds
no manifest literal of its own except where a rejection or a single rule
is asserted, and the arrangement cases no fixture holds, built by
`arrangement.test.ts`'s builder (section "Arrangements"); it never names
one like a fixture. So the suite proves core
against whatever TimeToShare ships. The manifests named most often:

- `bare.yaml`: root `bare` "Bare", 8 quarters.
- `nested.yaml`: root `clt_1` of 16, child `clt_3` at 4 of 8, its child
  `clt_2` at 3/2 of 2, both locked.
- `map.yaml`: root `melody` with the map `tempo`, child `phrase` at 2 with
  the map `ticks` (addressed `{id: "ticks"}`: every ID is unique across a
  manifest, so an element is addressed by its ID wherever it lies).
- `segment_line.yaml`: root `form` of 32 with the segments `a` 0–8, `b`
  8–20 and `c` 20–32, each a locked segment line; `b` holds `b1` 0–6 and
  `b2` 6–12, `c` holds `c1` 0–12.
- `bundles/bundle_mixed.yaml`: named "Mixed", no id. Roots `annotations`
  (regions `region_1` "Verse" and `region_2` "Chorus"), `score` (12
  quarters; maps `cmap_1` and `cmap_2`, jump `jump_1`, its destination labelled "Repeat"),
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
- `bundles/bundle_shared_member.yaml`: roots `t` (quarters), `u` (seconds)
  and `v` (pixels); `g1` of `t`, `u` and `g2` of `t`, `v`: `t` has a card
  in each frame.
- `bundles/bundle_free_ids.yaml`: roots `https://example.org/piece/score`
  (quarters, region `https://example.org/piece/score#exposition`) and
  `perf/take 2` (seconds, region `take 2/intro`), both members of
  `group_1`; one rule selects `{addresses: [{id: "take 2/intro"}]}`.
- `groups/group_child_member.yaml`: group `group_1` "Second half", display
  order `second-half`, `recording`; root `piece` holds the member
  `second-half` at 8; root `recording`.
- `groups/group_number_types.yaml`: group `group_1` "Edition" of the roots
  `page`, `performance`, `score`, display order `score`, `page`,
  `performance`; `groups/group_styled.yaml` is the same with `graphical`
  styles and rules beside its `order`.

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
   pair of integers with a positive denominator, in any terms, each member
   any JSON integer or integral JSON number, as TimeToShare reads it (the
   number type fixes the form, the spelling within it is free): `[1,
   JsonFloat(8)]` is 1/8 and `[1, JsonFloat(8.5)]` is refused with
   `invalid JSON Fraction [1,8.5]: components must be integers`; every
   integer is int64-bounded. TimeToShare's acceptance table
   (`fixtures/acceptances/<version>/numbers.yaml`, 14 rows of number type,
   value and what is read) is run row by row: an accepted row's value is
   read and written back (`toAxisValue`) exactly as the row's `read`
   (`[2, 4]` → `[1, 2]`, `480.0` on `int` → `480`, `2` on `float` →
   `2.0`), a refused row (`refused: representation`) is a `CoordinateError`
   `invalid_coordinate`. One accepted and one refused example per rule, refused
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
7. **Rounding a float to decimal places** is Python's `round(x, places)`:
   the exact binary value of the double is scaled by `10^places`, rounded
   to an integer half to even, and the result is the double nearest to that
   integer over `10^places`. The oracle is Python's own `round`; every value
   below is what CPython 3 prints for `round(x, 3)`: 312.48979591836735 →
   312.49; 2.675 → 2.675; 0.0005 → 0.001 and 0.0015 → 0.002 (both doubles
   lie just above the decimal half, so neither is a tie); 1e-05 → 0.0;
   6.71875 → 6.719. A true tie goes to even, which only an exactly
   representable half shows: `round(0.125, 2)` is 0.12 and `round(0.375,
   2)` 0.38. The sign survives a rounding to zero (`round(-0.0001, 3)` is
   −0.0, compared with `Object.is`), and an infinity or NaN is returned as
   given.
8. **One rounding to an integer**, half to even, serves every rounding
   above, the decimal places of a shown fraction and a value expressed on
   an int axis: `n/d` rounds to the nearest integer, a tie to the even one
   and the sign kept symmetric (5/2 → 2, 7/2 → 4, −5/2 → −2, −7/2 → −4,
   7/3 → 2, −8/3 → −3, 6/1 → 6); a denominator that is not positive is a
   `RangeError`.
9. **The exact value of a `Real`**: a Rational is returned as it is (the
   same object), a float as its exact binary value (0.1 →
   3602879701896397/36028797018963968, −2.5 → −5/2).

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

1. **Fixture round trip.** For every manifest fixture (canonical YAML, the
   complete form), `saveManifest(loadManifest(text), {minimal: false})`
   equals `text` byte for byte, with no skip and no normalization in the
   comparison. Each minimal twin reads to the same manifest:
   `saveManifest(loadManifest(twin), {minimal: false})` equals the
   fixture's text and `saveManifest(loadManifest(twin))`, the minimal form
   being the default, the twin's. The twins are no fixtures of their own in
   the suites that iterate every fixture (the properties and the budgets),
   which would only run each manifest twice.
2. **Shared rejections.** Every shared rejection case, written as JSON text,
   is refused by `loadManifest` with exactly one problem whose `path` equals
   the case's `path`. These include TimeToShare's identity and
   representation rules (an ID repeated anywhere in the manifest, an ID
   holding a control character, an address of a rule of the wrong
   shape, a band order in the former string form, a jump's destination
   whose `to` names no place of its timeline, a measure view naming no measure
   map, an `int` on a `fraction` axis),
   all `schema_violation`s from its `validate`, so `core` checks none of
   them again; a `non_finite` case is refused with its number in place.
3. **The version marker.** `bare.yaml` with `"timetoshare": "0.6.0"` is
   refused with exactly one problem `{code: "schema_violation", path:
   ["timetoshare"]}`; without the marker it is refused with exactly one
   `schema_violation` at `[]`. Core reads the current version only and
   migrates nothing.
4. **The minimal form in, pinned by hand.** For the twin of `bare.yaml`
   (its `meta` and `graphical` left out) the complete root is exactly `{id: "bare", name:
   "Bare", unit: "quarters", number_type: "fraction", length: [8, 1],
   locked: false, is_segment_line: false, meta: {}, children: [],
   conversion_maps: [], regions: [], flow_control: []}` and the manifest
   around it `{timetoshare, name: null, meta: {}, groups: [],
   measure_maps: [], timelines: [root]}`: no `id` and no `graphical`, whose
   default is "absent", and no `@context`: core holds none of the format's
   terms, and the manifest declares no prefix of its own.
5. **Unknown keys survive.** `bare.yaml` with an unknown key at the top
   (`"x-top": 1`), on the root (`"x-root": {"a": [1, 2]}`) and on a region it
   is given (`"x-region": "kept"`) loads with all three in place; after a
   `set` of the root's `name` and an `add` of a break, all three are still
   there with their values, and `saveManifest` writes them. Core's
   `unknownKeys` (TimeToShare's of the manifest's file form) lists exactly
   the three `{path, key}` pairs, sorted by path then key.
6. **Missing styles are completed.** A graphical rule naming each of
   two absent styles produces exactly one warning naming both, the one
   TimeToShare issues (`Missing graphical styles: 'a', 'z'`, names sorted
   by code point); core adds none of its own. The loaded manifest contains
   an empty declaration for each. The input object is not mutated and a
   declaration already present is preserved.
7. **Exact integers.** `discrete_logical.yaml` with its length value `480`
   replaced by `9007199254740993` (2^53 + 1) loads as the `bigint` and saves
   it as written; `continuous_logical.yaml` with its length Fraction
   numerator `12` replaced by `9007199254740993` loads as
   `[9007199254740993n, 1]` and saves it as written.
8. **Save goes through the canonical order.** `bare.yaml` given two jump
   targets at the same coordinate with the ids `"\u{1F3B5}"` (a surrogate
   pair in UTF-16) and `"～"`, in that order, is written with `"#～"` first:
   flow-control elements by coordinate, then id in code-point order, the
   reverse of JavaScript's default sort.
9. **A child of another number type** (a float child of a Fraction parent,
   length `4.0`) loads and saves byte for byte.
10. **Invariant refusal lists every violation.** `with_region.yaml` changed
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
11. **Each invariant at load and in a command.** For
    `region_end_before_start`, one copy of `with_region.yaml` changed in
    exactly that respect is refused with exactly one problem: that code at
    the exact path. **The number types a unit admits** are TimeToShare's
    unit table (`UNITS`), which its schema enforces, and core holds no copy:
    for each of the 18 units with each of `int`, `float` and `fraction`, the
    root of `with_region.yaml` alone (no children, no regions, no
    `graphical` object, its length null, so that no value on the axis is
    read) loads exactly when `UNITS` lists the number type for the unit,
    and is otherwise refused with exactly one problem, `schema_violation`
    at `["timelines", 0, "number_type"]`; 33 of the 54 pairs load (the four
    discrete units `int` only, `number` all three, the thirteen other units
    `float` and `fraction`). `invalid_coordinate` is reached through
    commands only (a value the schema's representation check would refuse
    at load). A command meets the same invariants: in a block of
    `with_region.yaml`, `set` of `{block: A, id: "region_1"}`'s `end` to `[0, 1]` is
    `region_end_before_start` at `[A, "manifest", "timelines", 0,
    "regions", 0, "end"]`.
12. **A child's unit and extent and a map's source unit are the
    schema's.** TimeToShare's `validate` refuses a child whose unit
    differs from its parent's, a child reaching past its parent's known
    length and a map whose non-null source unit is not its timeline's, so
    core holds no check of its own for any of them. One copy of `with_region.yaml` with `clt_2`'s
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
    yet. One copy of `with_region.yaml` with `clt_2`'s offset `[-1, 3]` is
    refused with exactly one problem, `negative_child_offset` at
    `["timelines", 0, "children", 0, "offset"]`, message `A negative child
    offset is not supported yet: child 'clt_2' has offset [-1, 3].` (the
    offset spelled as TimeToShare's writer writes the number). The same
    refusal on an `int` and on a `float` axis: a root `take` of 10 `ticks`
    whose child `part` of 2 lies at `-1` gives `... child 'part' has offset
    -1.`, and a root `take` of `10.0` `seconds` whose child `part` of `2.0`
    lies at `-1.0` gives `... child 'part' has offset -1.0.`, each at
    `["timelines", 0, "children", 0, "offset"]`. A root's offset may be
    negative: `negative_offset.yaml` (root `recording` at `-2.5`) is in the
    round trip of item 1.
14. **Segments read unlocked.** A segment that is no segment line is never
    locked, its line's lock governing it, whatever the file states:
    `segment_line.yaml` with `b1` stated `true` and `b2` `false` loads with
    `false` on `a1`, `b1`, `b2` and `c1` and the stated value elsewhere
    (`true` on the segment lines `a`, `b`, `c`, `false` on `form`); `b`
    stated `false` is kept. It saves `"locked": false` on each segment, its
    minimal form leaves it out, and it deep-equals the same file with the
    four segments stating `false`.
15. **Malformed text** is refused at path `[]`: with code `invalid_json`
    when it is read as JSON (`{"timetoshare": `), with `invalid_yaml` when
    it is read as YAML (`timelines: [`, and a mapping key repeated,
    `timetoshare: "0.2.0"` twice).
16. **An entry given to a command** (a map, region or flow-control
    element) is checked by the schema where it will lie: in the timeline
    that will list it, within the whole manifest, whose measure maps and
    elements it may name, completed and ordered as a
    command's result is: a minimal `LinearMap` `tempo`, in `melody` of
    `map.yaml` and in its child `phrase`, comes back in its complete form
    (`name: null`, `offset: 0`); a region whose ID holds a tab
    (`"verse\tchorus"`) is `schema_violation` at `["regions", 0, "id"]`, its path from that
    timeline, which a command reports below its block's manifest; a
    `MeasureRecordMap` `x_record` naming the measure map `bars` reads in its
    complete form (`name: null`) in `map.yaml` given `bars`, and without it is
    `schema_violation` at its own `measure_map` (`["conversion_maps", i,
    "measure_map"]`, `i` its place in canonical order, after `melody`'s
    own maps).
17. **Declarations are plain numbers.** `styled__score.yaml` with its six
    integral declaration numbers spelled `4.0`, `2.0`, … reads equal to the
    fixture and saves to its text, every key in place; 2^53 reads, 2^53 + 1
    is `invalid_value` "9007199254740993 has no exact double" at its member.
    The nine `rotation`s of `timestamp_wedge_rotation.yaml` (90, −135, −45,
    0, 45, 135, 180, −45, 45, in rule order) read as doubles, and spelled
    `90.0`, `-135.0`, … read equal to the fixture and save to its text. A
    card rule's `elision-proportion` `1.0` reads as the double 1, `0.05` as
    0.05, and the word `auto` as itself, the rule's other elision
    properties unchanged.
18. **An unorderable value** (a region `start` of `"later"`) is refused with
    the schema's first problem at that value.
19. **Elisions are carried through unchanged.** Core holds what the
    manifest states. `bare.yaml` (root
    `bare`, 8 quarters, fraction) given `graphical.elisions` holding
    `{id: "elision_1", timeline: "bare", start: [1, 2], end: [3, 1], width:
    {ratio: 0.25}}` (no `display`) reads with exactly that elision plus the
    default `display: ["ellipsis", "name"]` (the schema's default), the
    values kept as
    the Fraction pairs they are; the complete form written by
    `saveManifest` reads back equal. Added as a block, renamed by a `set`
    of the root's `name`, the block's manifest still holds the same
    elision, and core's element list (`manifestElements`) names one element
    of type `elision`, at `{id: "elision_1"}`, and one of type `ellipsis`,
    at `{id: "elision_1", part: ["ellipsis"]}` (the root's card draws it;
    "Elisions", item 9).

## A manifest file written back as it came (`manifest-file.test.ts`)

A manifest read from a file is written back in the form, styling and
serialization it came in, each inferred when the file is read
(`readManifestFile`), and `saveManifest(manifest, file)` writes exactly
that. The oracle is the file's own text: a text a TimeToShare writer wrote
must come back byte for byte, so any inference that is wrong, or any member
of the file description `saveManifest` ignores, changes bytes. The texts
are the schema package's fixtures and twins, and the same values written
by its `dumps` in the other two serializations.

1. **Inference.** For every manifest fixture, `readManifestFile(text)`
   gives the manifest `loadManifest(text)` gives and the file `{minimal:
   false, styling: s, serialization: "yaml"}`, `s` whether the value holds
   a top-level `graphical` key; its twin gives `{minimal: true, styling: s,
   serialization: "yaml"}` with the same `s`. The same values written by
   `dumps(value, {serialization: "json"})` give `"json"` and by
   `dumps(value, {serialization: "jcs"})` give `"jcs"`, each with the same
   `minimal` and `styling`. `bare.yaml` holds `graphical` (`s` true), and
   `bare.yaml` and its twin without their `graphical` give `s` false.
2. **Written back as it came.** For each of these texts, `saveManifest(
   manifest, file)` of what `readManifestFile` gave equals the text byte for
   byte: every fixture and every twin, in canonical YAML, pretty JSON and
   RFC 8785 JSON, and `bare.yaml` and its twin without `graphical`. A value
   that RFC 8785 JSON cannot write (an integer beyond ±(2^53 − 1)) has no
   RFC 8785 text and would be left out of that serialization only; no
   fixture holds one, and the test fails if one does, so that the list is
   reconsidered.
3. **Styling left out.** `saveManifest(load("bare.yaml"), {styling:
   false})` holds no `graphical` key and reads back to the manifest
   without its `graphical`; with `styling: true` it holds the manifest's.
4. **Defaults.** `saveManifest(manifest)` writes as `NEW_MANIFEST_FILE`
   says, `{minimal: true, styling: true, serialization: "yaml"}`: for
   `bare.yaml` exactly its twin's text.
5. **Texts no writer wrote** come back in the form they are read as, so
   not as they came; the schema package's shared cases
   (`fixtures/file_forms/`) and one byte order mark prove it exactly.
   `neither.yaml` states some defaults (`groups: []`, a timeline's `locked:
   false`) and leaves out others: it is neither minimal nor complete, reads
   as `{minimal: false, styling: true, serialization: "yaml"}` and comes
   back complete, the bytes of `neither.expected.yaml`. `one_line.json`,
   pretty JSON's value on one line in another key order, reads as
   `{minimal: true, styling: false, serialization: "json"}` and comes back
   in the canonical layout, the bytes of `one_line.expected.json`.
   `bare.yaml`'s RFC 8785 JSON after a byte order mark reads as `{minimal:
   false, styling: true, serialization: "json"}` (a text with the mark is
   never RFC 8785 JSON) and comes back as `bare.yaml`'s pretty JSON, without
   the mark.
6. **The file's value.** `manifestFileValue(manifest)` is the value every
   file of the manifest writes before its form and serialization apply:
   for every manifest fixture (each a complete file, IDs `#id`, its full
   `@context`), the value of the manifest `loadManifest` reads from the
   fixture's text and the one it reads from its twin's, written by
   `dumps`, is the fixture's text byte for byte, and the held manifest is
   left as it was. `bare.yaml` held has no `@context` member; its file
   value has one.
7. **Refusals keep their code.** A text `readManifestFile` cannot read is
   refused exactly as `loadManifest` refuses it: `{"timetoshare": `
   (`invalid_json`), `timelines: [` (`invalid_yaml`) and `bare.yaml` with
   its version `0.6.0` (`schema_violation` at `["timetoshare"]`).

## IDs in a file and in memory (`ids.test.ts`)

A manifest file writes every ID and every reference to one `#id`; core
holds every ID bare, in the manifests it reads, its commands, its
addresses and the workspace file alike. The conversion is the schema
package's (`withFileIds`, `withBareIds`, proven in its suite); these tests
prove that core converts at its boundary and only there: what a file says
reaches the store bare, what the store holds reaches a file as `#id`, and
the schema checks of what core holds read the file form while their
problems point into the manifest core holds. The oracles are the fixture
texts (written `#id` by the schema package's emitter), the bare IDs the
commands address, and paths pinned by hand.

1. **Read bare.** `groups/group_styled.yaml` loads with every ID bare: its
   root and child IDs, the group's `id` and `members`, the keys of
   `graphical.order`, each rule's `addresses` `id`, each named
   timestamp's `id` and `timeline`, exactly as listed in the test, and
   none starting with `#`. Its file round trip (item 1 of "Manifest load
   and save") proves the way back.
2. **Commands address bare IDs.** In a block of that fixture, a `set` of
   the root's `name` at `{block, id: <bare root ID>}` is accepted, and at
   `{block, id: "#" + <root ID>}` refused `unknown_target`.
3. **A file must write IDs `#id`.** `bare.yaml` with its root's `id`
   written bare is refused by `loadManifest` with exactly one
   `schema_violation` at `["timelines", 0, "id"]`; with a `graphical.order`
   key written bare, at `["graphical", "order"]`, the object whose key the
   schema refuses.
4. **What core holds is checked in its file form.** A manifest held with
   bare IDs whose `graphical.order` entry for its root holds a word that is
   no band (`"x"`) is refused by `normalizeManifest` with exactly one
   `schema_violation` at `["graphical", "order", <bare root ID>, i]`: the key
   loses the `#` of the file form the schema read. `idFormPath` gives
   `["graphical", "order", "#a", 0]` for `["graphical", "order", "a", 0]`
   and back, and leaves `["timelines", 0, "id"]` as it is.
5. **An ID that starts with `#`.** A held manifest whose root ID is `#x`
   is saved as `##x` and the saved text loads back to the root ID `#x`.
6. **Unknown keys are found in the file form, at held paths.** Core's
   `unknownKeys` of a held manifest is the schema package's of its file
   form; an unknown key on the root of
   `bare.yaml` is listed at `["timelines", 0]`.
7. **The workspace file keeps bare IDs.** A workspace holding a block of
   `bare.yaml` is written with the root's `"id": "bare"` (no `#` in the
   block's manifest), and reads back equal.
8. **A manifest value from outside** (`withHeldIds`): `bare.yaml`'s value
   loses every `#`; with its root's `id` written bare it is refused with
   exactly one `schema_violation` at `["timelines", 0, "id"]`.

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
   restores the earlier view object. A command's Fraction is read as a
   manifest's is: on the root of 16, `length: [25, 2.0]` (the denominator a
   `JsonFloat`) stores `[25, 2]`, and `[25, 2.5]` is `invalid_coordinate` at
   `[key, "length"]` with the message `invalid JSON Fraction [25,2.5]:
   components must be integers`.
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

On `nested.yaml`, both children unlocked:

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

On `segment_line.yaml` (`form` unlocked; segments read unlocked):

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
naming timelines of the manifest, the `to` of a jump's destination naming a
jump target, a region or a child of its timeline or the timeline itself, a
measure view's `measure_map` naming a measure map
of the manifest, a child sharing its parent's unit (`ChildrenMixin.validate_child`
in the library), a conversion map's non-null `source_unit` being its
timeline's unit (a held map's, its holder's), segment contiguity and the
representation of every
own-axis value are TimeToShare's rules, checked by its `validate`; names
may repeat.

Rules the library does **not** enforce and this package therefore does not
invent: a child may have another number type than its parent; a region may
lie outside its timeline (negative start, end past the length); a locked
timeline still accepts children within its length, regions, flow control
and maps. Flow control has rules of the format's own, which its `validate`
checks and core does not repeat: an element's coordinate, and the place a
destination reaches by its `by`, lie from 0 to the timeline's length; one
coordinate holds one jump that is not rejected, and any number of other
elements. Measure maps and conversion-map
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

1. **The enumeration of `map.yaml`**: twenty-two keys. The block (`block`,
   address `{}`, every other member null, holding nothing), the root's card
   `{id: "melody", part: ["card"]}` beside its line `{id: "melody"}`, then
   per timeline in pre-order its line and name (`{id, part: ["name"]}`) and
   its five bands (`{id, facet}`) in `FACETS` order, each band followed by
   what it holds (children by offset then ID, maps, the wedges and
   coordinate labels of the root's named timestamps `origin` and `length`,
   `{id: "timestamp_1"}`, `{id: "timestamp_1", part: ["coordinate"]}`,
   `{id: "timestamp_2"}`, `{id: "timestamp_2", part: ["coordinate"]}`, each
   label held by the markers band and not by its wedge, regions, breaks,
   section breaks and barlines, then jumps, with their labels). No timeline's start or end
   is an element of its own line. The maps are `{id: "ticks"}` and
   `{id: "tempo"}`. Every timeline lists all five bands. A band has no
   domain, modality or class, and its facet.
2. **Timeline classes.** The six classes are written out with their units:
   each unit belongs to exactly one class, and the units are exactly the
   schema's (the `const` of every entry of `TimeUnit`'s `oneOf`);
   `css_pixels` and `user_units` are `ContinuousGraphicalTimeline`, beside
   `points`. A map takes its `target_unit`'s domain and modality, `number`
   included.
3. **Regions, breaks and jumps** of `with_region.yaml` and
   `flow_control.yaml` are addressed by their IDs, a region with a label
   (`{id, part: ["label"]}`), and held by their bands (the whole (type,
   address) list of `flow_control.yaml` is pinned: the `break`
   `{id: "break_1"}` with the labels of its stack, `name`, `id` and
   `label`, and its symbol `{id, part: ["symbol"]}` (`fine`), then the
   `jump`s `jump_1` and `jump_2`, each with its `id` and `label` labels
   (a destination has a label) and its symbol, the IDs minted by role,
   then the symbols of the jump targets `jump_target_1` (`repeat_start`)
   and `jump_target_2` (`segno`), held by the band); a jump target is no
   element; in every one-root manifest fixture every
   address is distinct on the timeline it belongs to (compared by
   `addressKey` beside the timeline's ID: a secondary coordinate's wedge
   and labels carry its timestamp's addresses on the timeline they mark,
   drawing.md §2.2, and a root's card draws each timeline once). A named timestamp
   (`timestamps.yaml`) lists exactly the elements its `display` names, in
   the order `wedge` `{id: "timestamp_N"}`, the `label`s `{id, part:
   ["name"]}`, `{id, part: ["id"]}`, `{id, part: ["coordinate"]}`, then
   the `cross_section` `{id, part: ["line"]}`: the wedge and the labels
   held by its own timeline's markers band (a label beside the wedge, not
   held by it), the line by its own timeline's line (the `timeline` or
   `child` element) and not by the band, so that hiding the band leaves
   the line; each belongs to that timeline, each band's in canonical order,
   in tree order: `timestamp_3` of the child `clt_2` first (all five: wedge,
   three labels, line), its wedge and labels inside `[block, timeline, band,
   child, band]` and its line inside `[block, timeline, band, child]` (the
   root's children band, holding `clt_2`, precedes its markers band), then
   `timestamp_1` (the default: wedge, name label, line) and `timestamp_2`
   (wedge, name label) of `clt_1`, wedges and labels inside `[block,
   timeline, band]`, the line inside `[block, timeline]`. Each markers band
   lists its own timeline's timestamps, then the secondary coordinates on
   it (11): `clt_2` (2 to 6 on `clt_1`'s axis) holds `timestamp_2` (6, its
   end included) by its wedge and name label, `clt_1` holds `timestamp_3`
   (2 + 1 = 3) by its wedge and three labels, and `timestamp_1` (3/2) lies
   on `clt_1` alone; the `coordinates` member of each wedge and label says
   `primary` or `secondary`, and no line is listed for a secondary
   coordinate. `{inside: wedge}` matches nothing in `map.yaml`.
4. **The title** `{part: ["name"]}` follows the block for a manifest with a
   `name` or an `id`, and is absent for an anonymous one.
5. **Matching** over `map.yaml`, one selector per member (`element`,
   `domain`, `modality`, `class`, `facet`, `addresses`, `within`), bands
   included: a band belongs to its timeline (`within`), `facet` matches the
   bands of that facet in tree order (`{facet: "markers"}` the markers band
   of `phrase`, then `melody`'s), a band has no class (`{class: "regions"}`
   matches nothing), and no selector naming a domain or modality matches
   it; a map's class is its type (`{class: "LinearMap"}` matches both maps
   of `map.yaml`, `ticks` then `tempo` in tree order). `addresses` matches
   whole addresses: `[{id: "melody", part: ["end", "label"]}, {id:
   "ticks"}]` matches `ticks` and then that label, `[{id: "melody", part:
   ["label", "end"]}]` nothing, `[{id: "phrase", facet: "regions"}]` the
   band, `[{id: "melody", part: ["card"]}]` the card and `[{part:
   ["name"]}]` nothing (the manifest is anonymous). The empty selector
   matches every key. On `bundles/bundle_free_ids.yaml` its rule's
   selector `{addresses: [{id: "take 2/intro"}]}` matches exactly the region
   `take 2/intro` of `perf/take 2`: an ID is matched whole, never split.
6. **`inside`** matches what an element of the named type holds at any
   depth, never the holder: inside the block every key but the block, inside
   the line every key after it; a hand-built chain (`[block, frame,
   timeline, ancestor]`) proves the matcher reads the chain and nothing
   else.
7. **Segment lines** of `segment_line.yaml`: a segment that is a segment
   line is a `child` without a name, one that is not has type `null` (no
   selector naming `element` matches it, and it adds nothing to the chains
   below it); boundaries (`{id: "b", part: ["start"]}`) and labels are held
   by the segment line directly, in no band. A segment without a line of
   its own lists the secondary coordinates on it in its own markers band:
   `origin` (0) on `a` and `a1`, `length` (32) on `c` and `c1`, each a
   wedge and a coordinate label, none on `b` (8 to 20). The full (type, address) list,
   the boundary of `b`'s whole key and the chains of `b`'s label, `b2`'s
   marks and `a1` with its bands are pinned, and so are the matches of
   `{element: "boundary"}`, `{element: "child"}`, `{addresses: [{id:
   "b"}]}` and `{within: "b"}`.
8. **Bands of a root, a child and a segment**: `{element: "band", facet:
   "regions"}` matches every regions band, and the default rule
   `{element: "band", facet: "regions", inside: "band"}` every one but the
   root's; `{inside: "band"}` matches everything but the block, the root's
   card, line, name and bands, and its segments' parts.
9. **Alignment anchors** of `bundles/bundle_matchstamps.yaml` (drawing.md
   sections 2.1, 2.2 and 8.7): the last three keys, after every member
   drawing, are `anchor_1`'s line, its label and `anchor_2`'s line, written
   out whole. A line is `{type: "alignment_anchor", address: {id: A},
   inside: ["block"]}`, a label `{type: "label", address: {id: A, part:
   ["name"]}, inside: ["block", "alignment_anchor"]}` (held by its line);
   both belong to no timeline (`timeline`, `domain`, `modality`, `class`,
   `facet` null). `anchor_1` (`display` `["line", "name"]`) lists both,
   `anchor_2` (`["line"]`) its line only: a label is listed only where the
   anchor's `display` names it, the line always, as the holder whose style
   the label inherits. `{element: "alignment_anchor"}` matches `{id:
   "anchor_1"}` then `{id: "anchor_2"}`, `{inside: "alignment_anchor"}` the
   label alone, `{within: "score"}` neither.
10. **Groupstamp lines across their frames** (drawing.md section 6.6):
    every drawn line has an address, so a groupstamp's line is listed
    again for each frame that draws it, after every member drawing and
    before the alignment anchors, as `{type: "cross_section", address:
    {id: X, part: ["line"]}, timeline: T, class: T's, inside: ["block",
    "frame"]}` (held by the frame, belonging to the timestamp's timeline
    `T`). The keys at the line's address are written out whole, in order:
    `groups/group_groupstamp.yaml` (`timestamp_1` on the member `score`,
    quarters): the primary held by `score`'s line (`["block", "frame",
    "timeline"]`), then `group_1`'s; `groups/group_groupstamp_child_member.yaml`
    (`timestamp_1` on `second-half`, a child of the member `score`): the
    primary held by the child (`["block", "frame", "timeline", "band",
    "child"]`), then `group_1`'s, of `second-half`; and
    `bundles/bundle_groupstamp_shared_member.yaml` (`timestamp_1` on `t`,
    a member of `g1` and `g2`): the primary in `g1`'s card and in `g2`'s
    (each `["block", "frame", "timeline"]`), then `g1`'s and `g2`'s lines.
    In each, the group lines are the keys just before the first
    alignment anchor's (none there), that is the last ones. With
    `display` not listing `cross_section` (`["wedge", "name"]`), or with
    `groupstamp: false`, no key at the address remains. `{element:
    "cross_section", inside: "frame"}` matches both keys of
    `group_groupstamp`'s `timestamp_1`.
11. **Secondary coordinates** (drawing.md §2, §6.4 Markers, §6.6, §8.3):
    a named timestamp has a coordinate on every timeline its card draws
    whose span holds its position, ends included (an ancestor line within
    the member's span, a timeline of unknown length up to where it is
    drawn, drawing.md §3.4), its primary on its own timeline and a
    secondary one on every other; in a frame a groupstamp's line crosses
    every other member's card at the same proportion of that member's drawn
    length (§6.6), so it has secondary coordinates there too. Each
    secondary coordinate carries its value on the timeline it lies on, the
    one its `coordinate` label shows (§2, "read on that timeline's axis"),
    as timetoalign maps a position across a group (`p · len_B / len_A`,
    computed exactly, a float entering as its exact binary value) and
    within a tree (the offsets subtracted exactly), then written in that
    timeline's number type by `express_as`: a float axis the double nearest
    the exact value, a fraction axis the exact value, an int axis the exact
    value rounded half to even. The coordinate flag reads the same rows the
    same way, so drawing and flag agree. What proves the set: positions and
    values derived by hand on each axis and compared exactly as values, an
    exact value written `n/d` and a float as the number (so a float where an
    exact value is due, or the reverse, fails), and the keys listed in a
    card are exactly those, no other. `cardStamps` (`window`, the positions
    and sources of `stamps`, the `secondaries` by timeline with position and
    value) and the secondary keys of `manifestElements` (type, address,
    timeline, `inside`, `coordinates`) are written out for:
    `groups/group_groupstamp.yaml`: `timestamp_1` at 4 of `score`'s 8
    quarters, a half, so on `performance` (4.0 seconds) at 2, its value
    the float 2.0, a secondary coordinate held by `performance`'s markers
    band in `group_1` (wedge and name label, as its `display` lists); and
    none in `score`'s card. `groups/group_groupstamp_child_member.yaml`:
    `timestamp_1` at 2 on `second-half` (4 to 8 on `score`): in `score`'s
    card secondary on `score` at 6 (value 6), and `score`'s own `length`
    (8) secondary on `second-half` (its end, value 8 − 4 = 4; `origin` at 0
    lies before its start); in `performance`'s card at 6/8 × 4.0, the float
    3.0. `bundles/bundle_groupstamp_shared_member.yaml`: `timestamp_1` at 4
    on `t` (8): on `u` (4.0, `g1`) at the float 2.0, on `v` (800 pixels,
    int, `g2`) at the exact 400, value the integer 400, each only in its
    own frame's card, and none in `t`'s cards. The same card drawn outside
    a frame (`cardStamps` without one) holds no groupstamp of another
    member. A card in the frame of a group lists no groupstamp of its own
    member twice. **Across number types**, the same bundle with three more
    groupstamps: `a` on `u` at the float 1.0, `b` and `c` on `t` at 1/200
    and 1/40. On `t` in `g1`, `a` lies at 1.0 / 4.0 × 8 = 2, the exact 2
    and not the float 2.0 (a float member's position read exactly). On `u`
    in `g1`, `b` and `c` lie at 1/200 / 8 × 4.0 = 1/400 and 1/80, a float
    member's positions and values the floats nearest them, 0.0025 and
    0.0125. On `v` in `g2`, `b`
    and `c` lie at 1/200 / 8 × 800 = 1/2 and 1/40 / 8 × 800 = 5/2, exact
    positions, their values rounded half to even: 0 and 2 (half up would
    give 1 and 3). **A length not known** (§6.6): a group maps a position
    by the proportion of its members' lengths and never carries one
    member's length to another, so a groupstamp's secondary coordinate on
    another member's card has no value (`null`) where that member's length
    or the length of the member the groupstamp lies on is not known; its
    position stays at the proportion of the drawn lengths (a reach), where
    its line is drawn, and its keys lose the `coordinate` label alone.
    `group_groupstamp.yaml` with `timestamp_1`'s `display` `[wedge, name,
    coordinate, cross_section]`: with `performance`'s length `null` (its
    reach the float 4.0, its `length` timestamp's 4.0), `performance`'s
    card holds `timestamp_1` at 2 with the value `null`, its secondary keys
    the wedge and the name label, no coordinate label; with `score`'s
    length `null` instead (its reach the exact 8, its `length` timestamp's),
    `timestamp_1` lies on a member of unknown length, and `performance`'s
    card holds it at 2 with the value `null` likewise. With both lengths
    known the same display lists the coordinate label with the value 2.0,
    so the label's absence follows from the unknown length alone. **Every
    timeline of the card**, its ancestor lines included: in
    `group_child_member_stamps.yaml` a groupstamp `Half` (`timestamp_8`) on
    `recording` at the float 5.0, a half of its 10.0, lies at a half of the
    member `middle`'s 8 quarters, 4 on `middle`, and so at 4 + 4 = 8 on its
    ancestor `piece`, whose line `middle`'s card draws; the card's
    secondaries hold it on `piece` at 8 with the value 8 and on `middle` at
    8 with the value 4 (the oracle, both lengths known). With `recording`'s
    length `null` (its reach its `length` timestamp's 10.0, so the
    positions stay) both hold it at 8 with the value `null`: the unknown
    length takes the value from the ancestor line as from the member's.
12. **The selector member `coordinates`** (drawing.md §2.3): it matches
    the wedges of named timestamps and the labels of their stacks (parts
    `name`, `id`, `coordinate`), primary or secondary, and nothing else.
    The oracle is read off the addresses alone: over the enumerations of
    every fixture (roots, groups, bundles), a key matches `{coordinates:
    "primary"}` exactly when it is a `wedge` at `{id: X}` or a `label` at
    `{id: X, part: [name|id|coordinate]}`, `X` a named timestamp's ID, and
    it belongs to `X`'s timeline, and `{coordinates: "secondary"}` exactly
    when it is such a key on another timeline; so a cross-section line, an
    alignment anchor and its label, and every key of no named timestamp
    match neither; both selectors match at least one key of some fixture
    each, so neither side is vacuous. Combined with `element`, `{element:
    "label", coordinates: "secondary"}` over `timestamps.yaml` matches
    exactly `timestamp_2`'s name label on `clt_2` and `timestamp_3`'s three
    labels on `clt_1`.

13. **The selector member `class` on regions** (drawing.md §2.3): a
    region also has the classes its `type` statement names. A stated
    class stands for the IRI it expands to under the manifest's
    `@context`, else for itself; a selector's `class` holding `:` stands
    for the format's namespace `https://timetoalign.github.io/timetoshare/ns#`
    followed by its rest when its prefix is `tts`, whatever the context
    declares (the default layer has no context), else for its expansion
    under the context, else for itself; they match when the IRIs are
    equal. The oracle is that reading applied by hand to
    `flow/sonata_exposition.yaml`, whose regions `region_1`, `region_2`,
    `region_3` (A, B, C) each state `type: ["tts:AtomicSection"]` under a
    context declaring `tts`: the keys of the three regions carry the
    spellings `["https://timetoalign.github.io/timetoshare/ns#AtomicSection",
    "tts:AtomicSection"]`, their labels none, and every other key of the
    fixture none (the member is absent where no type is stated);
    `{element: "region", class: "tts:AtomicSection"}` and the same with the
    absolute IRI each match the three regions in that order and nothing
    else, `{class: "tts:AtomicSection"}` alone the same three (a label is
    not its region), `{class: "tts:Other"}` and `{class: "AtomicSection"}`
    nothing, and the region's timeline class still matches it
    (`{element: "region", class: "ContinuousLogicalTimeline"}`, all
    three). The same fixture with `tts` removed from its context, `ex`
    declared for the format's namespace, `region_2` stating
    `ex:AtomicSection` and the other two the absolute IRI (their provenance
    dropped): every region's spellings are the IRI, `tts:AtomicSection` and
    `ex:AtomicSection`, and the three selectors `tts:AtomicSection`,
    `ex:AtomicSection` and the IRI each match the three regions.

The elements of manifests with several roots and groups are in "Several
roots and groups".

## Flow control, FlowMaps and virtual timelines (`flow.test.ts`)

The oracle is TimeToShare's schema and its ten `flow/` fixtures, which
core's fixture list holds beside the others (so every suite that iterates
the manifest fixtures reads them: the round trips of
`manifest.test.ts` and `manifest-file.test.ts` in three serializations, the
drawn elements of `address.test.ts`, the properties and the budgets). The
ten are `da_capo_al_fine`, `dal_segno_al_coda`, `flow_map_by_hand`, `loop`,
`ossia`, `repairs`, `repeat_end_and_dal_segno`, `sections`,
`sonata_exposition` and `volta_passes`.

1. **Kept through an edit of something else.** Each of the ten, held in a
   block whose manifest's `name` is set to `Edited`, is saved in the
   complete form as TimeToShare's `dumps` writes the fixture's own value
   with that one member changed, byte for byte: the five roles with their
   members, every key of every destination, `ends`, `provenance`,
   `flow_maps`, `virtual_timelines` and the statements of the atomic-section
   regions are neither reordered nor respelled nor dropped. Named back, it
   is saved as the fixture's text, and in the minimal form as its twin.
2. **The drawn elements.** The roles drawn as lines are `break`,
   `section_break` and `barline`. A flow control band lists them together
   in canonical order (coordinate, then ID), then its jumps, each element's
   type its role, then the symbols of its jump targets (a jump target is no
   element): `flow/sections` (break `break_1` at
   8, jump `jump_1` and section break `section_break_1` at 16, jump
   `jump_2` at 32) lists `break_1`, `section_break_1`, `jump_1`, `jump_2`;
   `flow/repairs` `barline_1`, then `jump_1` and `jump_2` (the rejected
   jump is drawn, and so listed); `flow/sonata_exposition` `break_1`,
   `jump_1`, `jump_2`. Each holds the labels of its **stack** that may be
   drawn (drawing.md §6.4, Flow labels): `{id, part: ["name"]}` where its
   `name` is not null, `{id, part: ["id"]}` always, `{id, part:
   ["label"]}` where its own `label` or, for a jump, a destination's label
   is not null (one address, however many arcs a jump draws): in
   `flow/sections` `break_1` its ID and its label (`Fine`),
   `section_break_1` its ID, `jump_1` and `jump_2` their IDs and their own
   labels (`D.C. al Fine`, `D.C.`), in that order. Each holds its
   **symbol** `{id, part: ["symbol"]}` where its manifestation has one (a
   section break always), a jump target's held by the band; a jump holds
   its **fork** `{id, part: ["fork"]}` where a destination's
   manifestation is `volta`: `flow/sections` the symbols of `break_1` (`fine`),
   `section_break_1`, `jump_1` (`da_capo_al_fine`) and `jump_2`
   (`da_capo`); `flow/sonata_exposition` the fork of `jump_1` (two volta
   destinations), then the symbol of `jump_2` (`repeat_end`), and none of
   `break_1` or `jump_target_1` (both `volta`); `flow/repairs` the symbols
   of `barline_1`, `jump_1`, `jump_2`, then of `jump_target_1`
   (`repeat_start`), held by the band.
3. **Words.** In a workspace of one block an element is worded by its role
   and its ID: "break 'break_1'", "section break 'section_break_1'", "jump
   'jump_1'", "barline 'barline_1'", "jump target 'jump_target_1'".
4. **FlowMaps and virtual timelines** are neither drawn nor addressed:
   `flow/sonata_exposition`'s `flow_map_1`, `flow_map_2`, `flow_map_3` and
   `virtual_1` are IDs of the manifest (`manifestIds`) that `resolveElement`
   gives nothing for, and adding a region under one of them is
   `duplicate_id` at the region's `id`. They go with the root timeline
   they belong to: `removedBy` of `score` is the twelve IDs `score`, its
   three regions, its four flow-control elements, the three FlowMaps and
   `virtual_1`, and removing `score` leaves `timelines`, `flow_maps` and
   `virtual_timelines` empty; a manifest stating neither list
   (`flow/sections`) gains neither. Anything else left dangling is
   refused, never followed: removing `region_2`, which `flow_map_1` lists
   second, is a `schema_violation` at `[A, "manifest", "flow_maps", 0,
   "chunks", 1]`. A virtual timeline is held to the FlowMap it applies as
   the format holds it, and the refusal is shown as every rule of the
   format is, a `schema_violation` with the format's sentence at the
   format's path: `virtual_1` states the length 36, the sum of
   `flow_map_1`'s chunks A, B, A, C (12 + 4 + 12 + 8). Setting `region_3`'s
   `start` to 20 (C then 4 long, the sum 32) is refused at `[A,
   "manifest", "virtual_timelines", 0, "length"]`, "length [36, 1] of
   'virtual_1' is not the sum of the chunks and gaps of 'flow_map_1', [32,
   1]"; the fixture's text with that length written `[30, 1]` is refused
   on reading with the one problem at `["virtual_timelines", 0,
   "length"]`, "length [30, 1] of 'virtual_1' is not the sum of the chunks
   and gaps of 'flow_map_1', [36, 1]".
5. **Rejected** is TimeToShare's reading: an entry of the element's
   `provenance` holds a belief `false`, whoever holds it. Of
   `flow/repairs`' `barline_1`, `jump_target_1`, `jump_1` and `jump_2`
   only `jump_1` is; an element without provenance is not, nor one whose
   beliefs are `true` and `unlikely`; one actor's `false` beside another's
   `true` rejects.
6. **A belief recorded** (`withElementBelief`), for the actor
   `https://example.org/people/editor`, `false` on 2026-11-26: an element
   without provenance gains the one entry `{beliefs: [that belief]}`;
   where no entry holds a belief of the actor it joins the first entry
   (after that entry's own beliefs), the other entries untouched; where an
   entry holds one (`ex:editor` under the prefix `ex:
   https://example.org/people/`, compared as the IRI it stands for), it
   replaces that belief in place, the earlier note going with it, and
   without the prefix `ex:editor` is another actor, so the belief joins
   the first entry.
7. **A belief is the one thing a command changes of an element's
   provenance.** A `set` of a flow-control element's `belief`, `{actor,
   belief, date}`, records that belief as item 6 says and reads the
   element again by the format's rules; `provenance` is no property a
   `set` gives. On `flow/repairs` (`jump_1` imported and rejected by the
   editor on 2026-11-25 with a note, `jump_2` added by the editor at the
   same coordinate, `jump_target_1` named by `jump_2`, `barline_1`
   imported without a belief):
   - the editor believing the rejected `jump_1` `true` while `jump_2`
     stands at the same coordinate is a `schema_violation` at
     `flow_control` index 3 (two jumps at one coordinate, the second in
     canonical order); after believing `jump_2` `false` it is accepted,
     `jump_1`'s one entry then `{method: "imported", beliefs: [{actor,
     belief: "true", date: "2026-11-26"}]}` (the note gone with the
     earlier belief), and of the four elements only `jump_2` is rejected;
   - nothing is erased and nobody is spoken for: another actor
     (`https://example.org/people/other`) believing `jump_1` `true` leaves
     the editor's `false` with its note in place and appends the other's,
     so the jump stays rejected; the same actor believing `barline_1`
     `unlikely` gives its one entry `{method: "imported", beliefs: [that
     belief]}`; a belief the element holds already (the editor's `true` of
     2026-11-25 in `jump_2`) is a command that changes nothing
     (`invalid_value` at `[address, "belief"]`);
   - `provenance` set to `null`, to `[]`, to another list of entries or
     to the very list the element holds is `wrong_target_kind` at
     `[address, "provenance"]` (a property of other kinds of target, not
     of this one);
   - a value that is no belief is refused before anything is read:
     `null` and a belief without its `date` are `invalid_value` at
     `[address, "belief"]`, a `belief` `"maybe"`, an empty `actor` and a
     `date` `7` `invalid_value` at that member, a fourth member `note`
     `unknown_property` at `[address, "belief", "note"]`; a `date` that is
     no calendar date (`2026-13-40`) is the schema's refusal, at the
     belief's `date` in the element's provenance (`flow_control` index 3,
     `provenance` 0, `beliefs` 1, `date`);
   - rejecting `jump_target_1`, which `jump_2` names, is refused where it
     would dangle: `schema_violation` at `jump_2`'s `to` (`flow_control`
     index 3, `targets` 0, `to`).

8. **Where a destination leads** (`destinationPlace`): what the place of
   a destination of a jump names on the own axis of the timeline listing
   the jump, and the coordinate it reaches there, exact in the axis's
   number type. `flow/sonata_exposition` (quarters, fraction): `jump_1`
   at 12, its `by` 0 is `by` at 12, its `to` `jump_target_1` the jump
   target `jump_target_1` at 16; `jump_2` at 16, which states no place,
   the start of its section, no section break before it, so 0 with no
   start element. `flow/sections`: `jump_2` at 32 starts its section at
   the section break `section_break_1` of `score` at 16; `jump_1` at 16
   stands at that section break, which is not before it, so 0 with none.
   A destination without a place lands at the nearest section break before
   its jump among those of the whole tree of its root, on the root's axis,
   never before the start of the timeline listing the jump (TimeToShare's
   README, "Destinations"). In `child_flow_control` (`piece` 16, `verse` at
   4) with a jump `jump_x` of `verse` at 6 (10 on `piece`'s axis) and a jump
   `jump_y` of `piece` at 14, each with one destination without a place,
   added by commands: a section break `section_break_a` of `piece` at 2
   lies before `verse`'s start 4, so `jump_x` lands at `verse`'s start, 0
   with no start element, and `jump_y` at `section_break_a`, 2; adding
   `section_break_b` of `piece` at 7 (4 ≤ 7 < 10) moves `jump_x` there, 7 −
   4 = 3 on `verse`'s axis, held by `piece`; adding `section_break_c` of
   `verse` at 5, 9 on `piece`'s axis, moves `jump_x` to it, 5, and `jump_y`
   too, 9 on `piece`'s axis, held by `verse`.
   `flow/ossia`: `jump_1`'s `to` `ossia` is the child timeline `ossia`
   at its offset 16. `flow/repairs`: `jump_2`'s `to` `jump_target_1` is
   that jump target at 8. A jump added to
   `flow/sonata_exposition` at 20 (one `add` of `flow_control` into
   `score`) with the destinations `to` `region_2`, `to` `score` and `by`
   −8 holds them in canonical order, `by` first, and gives `by` at 12,
   the region `region_2` at its start 12 and the timeline `score` at 0. A `to` naming none of these (`nothing`, given to
   the function directly; a valid manifest never holds one) is `nowhere`
   with that `to`.

9. **What an element draws besides its line** (drawing.md §6.4,
   Symbols and Forks). `flowSymbols`: a jump target's `repeat_start`
   𝄆 U+1D106, `segno` 𝄋 U+1D10B, `coda` 𝄌 U+1D10C, `volta` none; a break's
   `fine` the text `Fine`, `volta` none; a barline's `double_barline` 𝄁
   U+1D101, `final_barline` 𝄂 U+1D102, none without a manifestation; a
   section break 𝄂 always; a jump one per destination, in the order of its
   `targets`: `repeat_end` 𝄇 U+1D107, the three `dal_segno*` 𝄉 U+1D109, the
   three `da_capo*` 𝄊 U+1D10A, `to_coda` 𝄌, and none for `volta`, `ossia`
   or a word outside the vocabulary. `passesText`: `[1]` is `1.`, `[1, 3]`
   `1., 3.`, `{from: 4}` `4.–` (U+2013).
10. **A child member's flow** (drawing.md §6.4, Flow control): the card of
   a member that is a child timeline draws the elements of its root's whole
   tree lying on `[0, λ]` of its own axis. `groups/group_child_member`
   (`piece` 16 long, its child `second-half` at 8, 8 long, a member of
   `group_1` with `recording`), given barlines at 4, 8 and 16 and a
   section break at 12 on `piece` and a barline at 2 on `second-half`:
   `memberFlow` of `second-half` is `barline_2` at 0, `section_break_1` at
   4, `barline_3` at 8 (all of `piece`, which starts at −8 on the member's
   axis; the barline at 4 lies outside) and `barline_4` at 2 (its own,
   `second-half` starting at 0), in the root's traversal order; of the root
   `recording` nothing. The elements core lists are the five lines of
   `piece`'s ancestor card in the order of its tree (`barline_4` in
   `second-half`'s child band, held by `piece`'s children band, before
   `piece`'s four in `piece`'s own flow control band), then in `second-half`'s member card its own
   `barline_4`, then the three of `piece` on its stretch, held by the
   member's own flow control band.

## Bands and band orders (`bands.test.ts`)

The band facts (drawing.md §2.2, §4, §6.4; TimeToShare's README,
"Identity" and "Groups and the `graphical` block") and the orders that stack
them. Every expected value is read from those texts. A band is addressed
`{id: T, facet: F}` (see "Addresses and containers"); a band order lists
`line` and any of the five facets, the same words for every timeline, and a
facet a stated order leaves out takes its place from the order the timeline
follows without an entry. The band order cases are built so that each
timeline's expected
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
3. **Effective and inherited band orders** on `nested.yaml` under three
   pairwise different orders (the default `D`, the README's example `R` =
   `["children", "markers", "line", "conversion_maps", "regions",
   "flow_control"]`, a third `K` = `["flow_control", "line", "children",
   "conversion_maps", "markers", "regions"]`): a root without an entry
   takes `D`, a descendant its parent's order verbatim (with `clt_1: R`,
   `clt_3` and `clt_2` draw `R`; with `clt_3: K` too, `clt_2` draws `K`), an
   entry wins for its own timeline only; a member that is a child follows
   its parent (`second-half` of `group_child_member.yaml` under `piece: R`
   draws `R`, the root member `recording` `D`); an unknown ID gets `D`.
4. **Completed subsets** (TimeToShare's README, "Groups and the
   `graphical` block"): let *I* be the order a timeline follows without an
   entry (its parent's completed order, the default for a root). A stated
   order keeps its entries in their order; every facet it leaves out keeps
   the side of `line` it has in *I* and lies beyond the stated entries on
   that side, in *I*'s sequence: omitted upper facets before the stated
   ones, omitted lower facets after. The five cases are worked out by hand
   from that sentence and compared whole, each drawn order differing from
   the stated value, from `D` and from the parent's order. On the root
   `clt_1` of `nested.yaml`: `["markers", "line"]` draws `["children",
   "conversion_maps", "markers", "line", "regions", "flow_control"]`;
   `["line", "flow_control"]` draws `["children", "conversion_maps",
   "line", "flow_control", "markers", "regions"]`; `["regions", "line"]`
   draws `["children", "conversion_maps", "regions", "line", "markers",
   "flow_control"]`; `["line"]` draws `D`. With `clt_1: ["markers",
   "line"]` and its child `clt_3: ["line", "children"]`, `clt_3` draws
   `["conversion_maps", "markers", "line", "children", "regions",
   "flow_control"]` (its *I* is `clt_1`'s completed order, not `D`), and the
   grandchild `clt_2`, without an entry, draws and inherits that same
   completed order. TimeToShare's validator accepts every one of these
   stated values.
5. **Band order problems**, each the first in the README's order (shape,
   repeat, unknown ID, stranger, missing), with the exact message, IDs and
   entries in single quotes: `"line"`, `null`, `{}` and `["line", 1]` give
   `the band order of 'clt_3' is not an array of strings`; `D` with `line`
   appended `'line' is repeated in the band order of 'clt_3'`; `D` as the
   order of `nothing` `'nothing' names no group or timeline of this
   manifest`; `D` with `region` appended `'region' is not 'line' or a
   facet, in the band order of 'clt_3'`, and so for the timeline's own ID
   in place of `line` and for the former band address `clt_3/regions_1` in
   place of `regions` (a stranger comes before what is missing); `D`
   without `line` `'line' is missing from the band order of 'clt_3'`, and
   `[]` and `["markers", "regions"]` the same: `line` is the one entry an
   order must list. `D` without `markers`, `["line"]` and `["regions",
   "line"]` are accepted. The stranger and missing messages are also what
   TimeToShare's identity check reports first for the same value.
6. **Entries the schema refuses** (an empty string, an entry holding a
   control character) are refused by both: core as a stranger, the schema
   at the entry (`["graphical", "order", "clt_3", 6]`), code
   `schema`, the empty string by its `minLength`, the control
   character by its `not` over control characters (the tests assert code and
   path, not the validator's wording); every value core accepts the schema accepts and every value it refuses
   the schema refuses.

## One walk to find timelines (`tree.test.ts`)

Every reader of a timeline by ID (`locateTimeline`, `findTimeline`,
`isSegment`, the band orders, the cross-section's ancestors, the
catalogue behind `resolveAddress`) reads one walk of the manifest's tree,
made once per manifest object. What proves it is the number of times a
walk opens a timeline's `children`, counted by a getter on each timeline,
which no result depends on: a lookup-heavy operation counts its reads, and
a walk repeated per lookup would read far more.

The manifest is `bare.yaml`'s root `bare` with 99 children `child_0` to
`child_98`, copies of the root without `children` of their own, added in
that order: 100 timelines.

1. **One walk for every lookup.** `bandOrderOf` of each of the 100 IDs in
   tree order opens 100 `children`: the first lookup walks every timeline
   once, every later one reads the walk. A walk per lookup, stopping at the
   timeline found, would open 0 for `bare` and 1 + j for `child_j` (the
   root's and those of `child_0` to `child_(j-1)`), 4,950 in all. Every
   result is the default band order.
2. **The walk is kept.** Asking all 100 again, then `findTimeline` of
   `nothing` (no timeline), opens no `children` more: the count stays 100.
   `findTimeline` gives for `child_42` the very object at `children[42]`.
3. **Another manifest object walks again.** A copy of the manifest
   (`{...manifest}`, the same timeline objects) opens exactly 100 more on
   its first lookup: the walk belongs to the object asked, so a manifest a
   command builds is never read through another's walk.

## Closed switches (`switches.test.ts`)

A switch over the kinds of a union (a resolved address, a target, what an
ID names) lists every kind and ends with `assertNever`, so a kind added to
the union fails to compile until each switch takes it. The proof is the
compiler's, read by the test project's `tsc`: a call on a value whose type
still admits a kind is marked `@ts-expect-error`, so the check passes only
while `tsc` refuses that call; and a call on a value that has run out of
kinds compiles. At run time `assertNever` is reached only through a value
its type does not admit: given `{kind: "stranger"}` it throws "a closed
switch has no case for stranger", given `7` "a closed switch has no case
for 7", and the switch leaving `card` out, given a card, "a closed switch
has no case for card".

## Workspace view, ids and order (`workspace.test.ts`, `workspace-ids-order.test.ts`)

The view is `{meta, name, settings, graphical, blocks}`; an empty one
carries the format marker `{format: "tilie-workspace", version: 7}`, the
name `untitled`, the workspace's `graphical` `{}` (its default rules,
the cascade's layer between the built-in defaults and each manifest's own)
and the default settings `{grid: {size: 8, snap: true}, blockDefaults:
{scale: 1, length: 400, spacing: 8, margin: 0, width: null, height: null},
granularity: {denominator: 2520, decimals: 3}, manifests: {},
matchClaimFilters: {}}`, the drawing
specification's placement defaults plus the block's scale (the block's
`spacing` 8 is the gap between its items, its `margin` 0 the empty space
above its first item and below its last, drawing.md §8.4, §8.6) and the
granularity: positions on a fraction axis no finer than 1/2520 (2520 =
lcm(1, …, 10), so every tuplet up to tens is reached), on a float axis no
finer than three decimal places, floats shown with three. Settings are how the
editor is used, not what the workspace holds: no command changes them
("Workspace settings", under the store). A
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
   `nextId("group", taken)` is the smallest `group_N` not taken: `group_1`
   for no IDs, `group_3` for `{group_1, group_2, group_4}`, and `group_1`
   for `{group_2, clt_1}`.
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
   band has no part: the test type-checks only with that call refused); `PART_WORDS` is `start`, `end`, `name`, `label`, `card`, `line`, `id`, `coordinate`, `elision`, `ellipsis`, `symbol`, `fork`, `leader`, the schema's order.
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
4. **Every kind resolves.** On a block of `bundles/bundle_mixed.yaml` (and
   one of `map.yaml`), one address per kind with its expected resolution
   written by hand: the workspace `{}`, a block `{block: A}`, the title
   `{part: ["name"]}`, a frame `{id: "group_1"}` (its place key `{item:
   "group_1"}`) and its title `{id: "group_1", part: ["name"]}`, a timeline
   drawn in a card (the root member `score`, its one card keyed `{item:
   "group_1", member: "score"}`, and the child member `excerpt`) and one
   drawn in no card of its own (`recording`, whose one card is its ancestor
   card keyed `{item: "group_2", member: "recording"}`, which `{id:
   "recording", part: ["card"]}` resolves to), the cards of a member `{id:
   "score", part: ["card"]}` and of an ungrouped root `{id: "annotations",
   part: ["card"]}` (keyed `{item: "annotations"}`), a band `{id: "score",
   facet: "regions"}` with the card holding it, an entry of each list by its
   ID alone (`region_2`, index 1 of `annotations`' regions; `cmap_6`, the
   map of the child `excerpt`; `jump_1`), and parts nested two deep
   (`{id: "recording", part: ["elision", "coordinate"]}`, the coordinate
   label of an elision the ancestor card of `recording` may derive on its
   root, section 8.9). Each part carries its owner,
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
   "recording", facet: "regions"}`; an ancestor card holds no band), a facet
   of a group or a map, a group's card, a part an owner does not have (a card's label, a frame's
   label, the title's label `{part: ["name", "label"]}`, a label without an
   owner `{part: ["label"]}`, a start's end, a region's start), the title
   of an unnamed manifest (`{block: B, part: ["name"]}` on `map.yaml`'s
   block): a title exists only for a named manifest, and every part nothing
   draws (drawing.md §2.2): the start and end of `recording`, drawn only as
   an ancestor line (`{id: "recording", part: ["start"]}`, `["end",
   "label"]`; no line marks its own start or end), and of the child member
   `excerpt` (`{id: "excerpt", part: ["end"]}`: no mark of a member's start
   or end is drawn on its ancestor lines), a label of a timeline that is no segment (`{id: "score",
   part: ["label"]}`), the name of a region and of a jump, and a
   map's label and name. A malformed address is
   `invalid_address` at `[address]` with the reader's message (`{block:
   "short"}`, a facet beside a part, an element without its block).
6. **Free IDs.** On a block of `bundles/bundle_free_ids.yaml`, `{id:
   "https://example.org/piece/score"}` and `{id: "perf/take 2"}` resolve to
   their timelines, each with its one card in the frame of `group_1`; `{id:
   "https://example.org/piece/score#exposition"}` to the first region of
   the former; `{id: "take 2/intro", part: ["label"]}` to the label of the
   region of `perf/take 2`, and `{id: "perf/take 2", part: ["name"]}` to
   its name. Pieces of these IDs (`perf`, `take
   2`, `https:`, `intro`, the URI with an empty fragment) name nothing.
7. **Every drawn element resolves to its kind.** For every manifest
   fixture, every address the enumeration gives but the block's resolves
   with `resolveElement`, and to the kind its element type says (a card or
   an ancestor card the cards, a band a band, except a band of a timeline
   drawn in no card but an ancestor card, which has no container and
   resolves to nothing, a frame a frame, a map, region, break, section
   break, barline or jump an entry, a label, wedge or boundary a part, the title the title,
   an alignment anchor's line its anchor, a stored elision's gap its
   elision (in a card, across a frame and carried into an ancestor card
   alike), its ellipsis and labels a part, every other line a timeline;
   `bundles/bundle_matchstamps.yaml` gives the anchors' lines and the
   label `{id: "anchor_1", part: ["name"]}`): the cross-check between the resolver and the
   elements. The bundle's address `{}` resolves to nothing there (the
   workspace resolver reads it as the block). The other way round, **every
   resolvable part is drawn**: for every manifest fixture, every address
   built from no ID or one of `manifestIds` with a part of one or two part
   words that `resolveElement` resolves is exactly, as a set of
   `addressKey`s, the addresses with a part of the drawing's elements
   (`indexOf(manifest).elements`), but the derived elisions' addresses
   (`part` beginning with `elision`), which the drawing derives from the
   view and core's elements do not list: those are exactly `{id: T, part:
   ["elision"]}`, `["elision", "ellipsis"]`, `["elision", "name"]` and
   `["elision", "coordinate"]` (a derived elision has no ID, so no `id`
   label) for every `T` the drawing specification lets an ancestor card
   derive one on under some `elision-mode` (section 8.9: the card's root
   and the children of its member's ancestors above the member's parent,
   whatever elisions are stored, since a rule stating `proportional`
   derives them beside stored ones and core reads no cascade). The
   candidates are built without the resolver, so a part the resolver names
   that nothing draws fails here.
8. **The registry** (`CONTAINERS`, `CONTAINER_KINDS` `block`, `frame`,
   `card`, `band`) states each container kind exactly: the block at the
   bundle level, styled as `block`, with no place; the frame at the group
   level, styled as `frame`, stating a whole place on the block; the card at
   the timeline level, styled as `card`, stating a whole place on the block
   and its size, spacing and margin in a frame, and nothing as an ancestor
   card; the band at the facet level, styled as `band`, with no place.
9. **The containers of `bundle_mixed.yaml`** in drawing order, each with
   its holder: first the ancestor card of `recording` (the root of the
   member `excerpt`) keyed `{item: "group_2", member: "recording"}` on the
   block, then frames by group ID, each followed by its members' cards in
   display order, then the ungrouped roots' cards on the block;
   `recording` has no card of its own and so no bands. A frame is addressed `{id: G}`
   and keyed `{item: G}`, a member's card addressed `{id: T, part:
   ["card"]}` and keyed `{item: G, member: T}`, an ungrouped root's card
   keyed `{item: T}`; `byKey` holds exactly the seven frames and cards
   that have a place under their `placeKeyText` (`["group_1"]`,
   `["group_1","score"]`, …, `["annotations"]`), never the ancestor card,
   `ancestorCards` that one card beside its group `group_2`, its member
   `excerpt` and its root `recording`, `frames` the two groups, `cards` the six
   timelines with a card, `recording` first. A card is followed by its timeline's five bands, addressed
   `{id: T, facet}`, held by it and keyed by nothing. The block's container
   is exactly `{kind: "block", key: null, address: {}, holder: null,
   timeline: null, facet: null}`.
10. **A timeline in several groups** (drawing.md §2.2, §8.1): on
    `bundles/bundle_shared_member.yaml` (`g1` with `t`, `u`; `g2` with `t`,
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
    one**: on `bundles/bundle_shared_parent.yaml`, where the root `score`
    holds two members and is drawn in no card of its own, the bands of
    segments lie in their member's card, `score` has none, and the count of
    containers is derived by hand (two ancestor cards of `score`, one behind
    each frame, two frames, five cards, fifteen timelines' bands).
12. **Place members by holding**: a frame and a block-held card state a
    whole place, a frame-held card only its size, spacing and margin, an
    ancestor card (holding `ancestor`), a band and the block nothing; a place is cut to what its container may state (kept
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
    "page"}, {height: 80}]]`. On `bundle_mixed.yaml`, `placedContainer`
    gives `score`'s card for `{item: "group_1", member: "score"}`, and
    `placedElement` gives `group_1`, `score` and `annotations` for the keys
    of the frame, a member's card and an ungrouped root's card, and nothing
    for `{item: "score"}` (a member's bare ID), `{item: "recording"}`,
    `{item: "group_2", member: "score"}` and the ancestor card's key
    `{item: "group_2", member: "recording"}`, which names no place.
14. **Memoised by identity**: the listing and the index of a manifest are
    the same objects when asked twice; the index maps every timeline to
    itself and every entry to the timeline holding it (`region_1` to
    `annotations`, `cmap_6` to `excerpt`, `cmap_5` to `recording`, each
    named timestamp to the timeline it lies on (`timestamp_3` to
    `excerpt`), a group to nothing; 25 IDs: 6 timelines, 9 entries, 10
    timestamps), and its elements equal the drawing's
    own.

15. **The words of an address** (`addressWords`) name it to a reader in
    messages: on the view of block `A` holding `bundles/bundle_mixed.yaml`
    (named `Mixed`) and block `B` holding `map.yaml` (no name, no id),
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
    'Mixed'", `jump_1` "jump 'jump_1' in bundle 'Mixed'",
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
16. **Ancestor cards** (drawing.md §8.8): a root that contains a group
    member has one card behind the frame of each group having a member
    below it, held by the block, holding `ancestor`, keyed `{item: G,
    member: R}`, addressed `{id: R, part: ["card"]}` and listed before every
    frame, with no band and no place (`placeMembersOf` gives nothing). On
    `groups/group_parents_mixed.yaml` (one group `group_1`, display order
    `exposition`, `take`, `system`, `audio`) `memberDrawings` gives three,
    in display order: `sonata` aligned to `exposition`, `session` to `take`,
    `page` to `system` (`audio` is a root member and has none), and the
    container registry's `ancestorCards` lists the three containers, each
    beside exactly the card `memberDrawings` gives in the same place, so
    the layout reads one list; on
    `bundle_shared_parent.yaml`, `score` behind `group_1` aligned to
    `exposition` and behind `group_2` aligned to `recapitulation`. `placedCards`
    leaves them out: `set {place: {x: 1}}` on `recording` of
    `bundle_mixed.yaml` stays `not_an_item` "'recording' is not drawn in a
    card of its own" at `[{block, id: "recording"}, "place"]`, as before the
    root had an ancestor card (`places.test.ts`).

## Commands (`commands.test.ts`)

There are four commands, each aimed at **addresses**, objects read by
`readAddress` ("Addresses and containers"): `add {into, <kind>:
value}` with exactly one kind member; `set {changes: [{target, values}, …]}`,
at least one change and one property in each `values`, the properties a
member of their own so that none (a member named `target`) collides with the
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
   manifest: <bare.yaml>}`; a second block `B` given `scale: 2` has index
   `a1` and scale 2; one given `index: "Zz"` keeps it.
2. Blocks and the workspace: one `set` moving `A` to (128, 64) and `B` to
   (1, 2) changes nothing else; `scale: 2, width: 120, height: null,
   length: 800, spacing: 2, margin: 12` on `A` gives exactly those, and
   `spacing: 0` and `margin: 0` are stored as given; on the workspace,
   `graphical` replaces the workspace's `graphical` whole and leaves the
   settings the same object; `manifest` replaces a
   block's manifest whole, several roots and groups for one root alike.
   The workspace's `graphical` and a `style`'s `set` store a declaration's
   `2.0` as `2`, as loading does (item 17 of the manifest section).
3. Timelines, on `nested.yaml`: `name`, `meta` and the root's `length`
   `[12, 1]` (the end of `clt_3`) are stored as given; `clt_3`'s `offset`
   `[6, 1]` leaves the root at `[16, 1]`, `[10, 1]` grows the unlocked root
   to exactly `[18, 1]`. `add` the minimal child `{id: "clt_1", offset: [2,
   4], unit: "quarters", length: [8, 1], locked: true}` into `bare` (8):
   exactly that child complete, offset `[1, 2]`, the root grown to `[17,
   2]`.
4. Entries: the maps `tempo` and `ticks` of `map.yaml` added into `bare` are
   kept verbatim in id order whichever comes first; an entry may be added
   into a segment line too, as the entry is validated alone (`tempo` into
   `b` of `segment_line.yaml` is kept, the line's length and segments
   unchanged); `set` of `tempo`'s payload with `scalar: [1, 4]` stores
   exactly that payload. Into `bare`, the region `{id: "region_1", name:
   "A", start: [2, 1], end: [4, 1]}` is stored with `meta: {}`, and `end`
   `[6, 1]` with `name` null exactly so. On `flow_control.yaml`, whose
   elements in canonical order are the jump targets `jump_target_1` at 2 and
   `jump_target_2` (segno) at 4, the jump `jump_1` at 8 with one
   destination to `jump_target_1`, the break `break_1` (a Fine) at 12 and
   the jump `jump_2` at 16 with one destination to `jump_target_2`, each
   list compared whole in canonical order (coordinate, then id): adding the
   jump target `{id: "coda_1", role: "jump_target", manifestation: "coda",
   coordinate: [12, 1]}` (stored with `name` and `label` null, `meta: {}`,
   after `break_1`, which shares its coordinate and precedes it by
   id) and the jump `volta_1` at `[6, 1]` with the destinations `{to:
   "coda_1", passes: [2], manifestation: "volta"}` and `{by: [0, 1],
   passes: [1], manifestation: "volta"}`, given in that order and stored
   in the canonical one (the `by` before the `to`), each complete
   (`determined: true`, `reset: true`, `label: null`); `jump_1` named
   `repeat` and its `label` set to null in one `set`; its `belief` set to
   `{actor: "https://example.org/people/editor", belief: "false", date:
   "2026-11-25"}`, which gives the element, stating no provenance, the one
   entry `{beliefs: [that belief]}`, and set again to the same actor's
   `true` of 2026-11-26, which replaces it in that entry (a belief is
   replaced, never taken away); `jump_1` removed together with its timeline
   `flow:quarters`, which leaves no timeline. A flow-control element is
   never changed in place and never removed alone: a repair rejects it by
   a belief and adds another.
5. Measure maps, a block's manifest's top-level list, their IDs unique
   across the manifest as every ID: `add {into: {block: A}, measure_map:
   {id: "bars", rows: [{count: 1, qstamp: [0, 1]}]}}` into a block of
   `bare.yaml` stores it with `name: null, meta: {}`; `set bars {name:
   "Bars", rows: <a second row {count: 2, qstamp: [4, 1]} appended>}`
   stores exactly both; the `MeasureRecordMap` `{id: "record",
   source_unit: "quarters", target_unit: null, measure_map: "bars"}` added
   into `bare` is stored with `name: null`; removing `{block: A, id:
   "record"}` and `{block: A, id: "bars"}` together leaves both lists
   empty.
6. `remove` on `map.yaml`: a child takes its map; a map goes alone; the last
   root leaves `timelines: []` and the block; two blocks go together, and a
   block goes with every block whose `parent` chain reaches it.
7. `style` over `A` (`map.yaml`) and `B` (`bare.yaml`) without `blocks`:
   `{element: "map"}` `stroke` goes into `A` only, as `{order: {}, styles:
   {}, rules: [{select: {element: "map"}, set: {stroke:
   "#C00000"}}]}`; a second property merges into that rule, a selector
   equal in canonical JSON merges, another selector is another rule;
   `null` removes a property and the last one the rule. With `blocks:
   [B]` and `name: "green"`, the declaration becomes the style `green` and
   the rule's `set` its name, `A` untouched; without `name`, a merge
   into a named rule turns it into a declaration, the style unchanged;
   a style emptied by `null` goes with every rule naming it.
8. A command keeps an integral float a float: `x: JsonFloat(2)` is read as
   given, except in a declaration (item 2).

### Where a timeline lies

A timeline is placed by one rule wherever it comes from. `add timeline`
adds a root read like a manifest's (completed, locked as its place decides,
its id free); `add group` adds a group, each member joining it as `set
groups` joins one.
`set parent` moves a timeline with its subtree: `null` makes it a root,
dropping a child's offset; `{timeline, offset}` a child there, growing the
new parent as adding a child would. `set groups` gives the groups a
timeline is a member of, a list of distinct group IDs in any order: it joins
each listed group it was no member of and leaves each it was a member of and
the list leaves out, so a timeline may be a member of several groups;
members are held in canonical order, and a stated display order lists a new
member last and drops one that leaves.
IDs never change, and so no address does; a moved timeline keeps its
drawn band order and its card's stated size, and the places are fitted to
the new drawing (a card a frame now holds keeps its size, spacing and margin, moved
from `places[T]` to `places[G].cards[T]`; a place naming no frame or card
goes).

What proves it, on `bundles/bundle_mixed.yaml` in block `A`:

1. **A root added.** `add timeline` of `bare.yaml`'s root in its minimal form
   adds exactly `bare.yaml`'s complete root.
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
5. **Groups joined and left.** `groups: ["group_1"]` on `annotations`
   makes `group_1`'s members `[annotations, performance, score]` and its
   display order `[score, performance, annotations]`; `groups: []` on
   `performance` leaves `[score]` and `[score]`.
   **A second group.** `groups: ["group_2", "group_1"]` on `score` keeps
   `group_1` as it was and makes `group_2`'s members `[excerpt, page,
   score]` and its display order `[page, excerpt, score]`; on that view
   `groups: ["group_1", "group_2"]` on `score` changes nothing (refused
   with `invalid_value`, "the command changes nothing"), and `groups:
   ["group_2"]` leaves `group_1` with the members and display order
   `[performance]`, `group_2` unchanged. `add group {id: "group_3", members:
   ["score"]}` adds `group_3` and keeps `score` in `group_1`.
6. **Refusals**, each at `[<address>, <property>]` unless stated:
   `duplicate_id` at `[{block: A}, "timeline", "id"]` for a root added as
   `score`; `nested_member` at `[{block: A, id: "recording"}, "groups", 0]`
   for `groups: ["group_2"]` on `recording`, as `group_2` holds `excerpt`,
   at `[{block: A}, "group", "members", 1]` for a group of `recording` and
   `excerpt`, and, once a root `extra` of 4 quarters has joined
   `group_1`, for a move of `score` under `extra` or of `extra` under
   `score` (at `[{block: A, id: "score"}, "parent"]` and `[{block: A, id:
   "extra"}, "parent"]`); `schema_violation` at `[{block: A}, "group",
   "name"]` for a group named `3`; `unknown_target` at `[{block: A, id:
   "score"}, "groups", 0]` for `groups: ["ghost"]`; `invalid_value` at
   `[{block: A, id: "score"}, "groups"]` for `groups: "group_1"`, at
   `[…, "groups", 0]` for `[3]` and at `[…, "groups", 1]` for `["group_1",
   "group_1"]`, at `[{block: A}, "group", "members", 1]` for a group of
   `annotations` twice, and for a `parent` of `"score"`;
   `unit_mismatch` for `annotations` under `recording`; `cycle` for
   `recording` under `excerpt`; `unknown_target` at `[{block: A, id:
   "annotations"}, "parent", "timeline"]` for a parent named `ghost`; and,
   after a root `extra` of 4 samples is added, `child_exceeds_parent` for it
   under the locked `excerpt` (of 88,200) at 88,200. On `segment_line.yaml`,
   `segment_structure` for `parent: null` on the segment `b1` and on the
   segment line `b` and, after a root `extra` of 4 quarters is added, for
   `extra` under the segment line `form`.

### Previews

A gesture shows `preview(view, command)`: the command as `apply` applies
it, without the schema check, the invariants and the no-op refusal. What
proves it: on
`bundle_mixed.yaml`, for a move under a new parent, a group joined, a group
added and a block moved, `preview` equals `apply`; on `nested.yaml`, for
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
  (`[{block: A}, "colour"]`, and `[{}, "grid"]` and `[{}, "blockDefaults"]`:
  settings are no property of any target); `wrong_target_kind` for a property of
  another kind (`[{}, "x"]`, `[{block: A}, "graphical"]`, a root's `offset`, a
  map's `start`, a region's `coordinate`); `invalid_value`,
  `non_finite_number`, `non_positive_number`, `invalid_index` and
  `duplicate_index` for block values (a block's `spacing` −1
  is `invalid_value` at `[{block: A}, "spacing"]`); `invalid_coordinate` for an own-axis value its number type
  does not read (`0.5` and `8` on a `fraction` axis, a coordinate dict);
  `locked`, `length_below_content` (`[23, 2]` on `clt_1`) and
  `child_exceeds_parent` (`clt_2` at `[7, 1]` under the locked `clt_3`);
  `schema_violation` below `[{}, "graphical"]`, at `[A,
  "manifest", "timetoshare"]` for a manifest declaring `0.6.0`, and for
  the earlier form of a flow-control element (`{id: "old", type:
  "jump_to", …}` added at 8, at `flow_control` index 3, where canonical
  order puts it), for a second jump at the coordinate of one that is not
  rejected (`again` at 8 sorts before `jump_1`, which is then the
  second, index 3) and
  for rejecting `jump_2` by a belief `false`, which the Fine's `ends` names (at
  `flow_control` index 3, `ends`, `after`, `jump`); `not_removable` at
  the element's address for each of `jump_target_1`, `jump_1` and
  `break_1` removed alone; `unknown_property` for a `set` of
  `flow_control`, `role`, `targets`, `manifestation` or `ends` on
  `jump_1`, and `wrong_target_kind` for `coordinate`, `meta` and
  `provenance`, which other kinds of target have: what decides the flow,
  where the element lies and how it was made is no property a `set`
  gives. Manifest locations:
  `negative_child_offset`
  (`clt_2` at `[-1, 1]`), `region_end_before_start` (`with_region.yaml`): a
  removal that leaves a reference dangling is refused, never followed by
  removing the referrer. A measure map is held to the same rule: on a
  block of `bare.yaml` holding `bars`, removing `{block: A, id: "bars"}` while the view
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
- Changes nothing, on every kind of target (blocks `A` of `nested.yaml` and
  `B` of `bare.yaml`): the workspace's own `graphical`; `A`'s `x`, `index`,
  `width` and its manifest as loaded; `clt_1`'s `name: null`, `meta: {}` and
  `length: [32, 2]`; `clt_3`'s own offset; on `map.yaml` `tempo`'s own
  payload; on `flow_control.yaml` `jump_target_1` named `repeat-start`. Judging the whole
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

1. **`set locked` on a segment.** In a block of `segment_line.yaml`,
   `locked: true` on `b1` is `segment_never_locked` at `[{block: A, id: "b1"},
   "locked"]`, message `A segment is never locked: lock its segment line
   'b' instead.`; `locked: false` on `b1` changes nothing (refused as such
   at the same path).
2. **`set locked` on a segment line placed inside something.** In the
   same block, `locked: false` on `b` (a segment that is a segment line) is
   `unlocking_not_supported` at `[{block: A, id: "b"}, "locked"]`, message `Unlocking
   a segment line that is a child, a segment or a group member is not
   supported yet.`. The same refusal for `intro` of `segment_children.yaml`
   (a segment line that is a child of `piece`, no segment) and for the root
   `original_score:dgt_1` of `bundles/corpus_ieee1599.yaml` (a segment line
   that is a group member). Each of the three holds `locked: true`, so
   `locked: true` on it changes nothing (refused as such at `[{block: A, id: "<id>"},
   "locked"]`).
3. **`set locked` to the value a timeline has.** In a block of
   `segment_line.yaml` whose file states `locked: false` on `b` (kept on
   reading), `locked: false` on `b` alone changes nothing and is refused as
   such at `[{block: A, id: "b"}, "locked"]`, never as `unlocking_not_supported`;
   `{locked: false, name: "Bridge"}` on `b` is accepted and leaves `b`
   `false` and named `Bridge`, the manifest otherwise equal to the one
   before; `locked: true` on `b` is accepted and leaves it `true`.
   Unlocking it again is then `unlocking_not_supported` at `[{block: A, id: "b"},
   "locked"]`, as in case 2, so the acceptance is the no-op's and no lifted
   rule's.
4. **`set locked` elsewhere.** On the root `form` of `segment_line.yaml`
   (a segment line, neither a child nor a member) `locked: true` and then
   `locked: false` are both accepted, leaving `true` and then `false`.
5. **`add child` into a segment line.** Neither value stating `locked`:
   into the root `form` of `unknown_length_segments.yaml` (its length
   unknown), a child `d` of 4 at 20 holds `locked: false`; into the root
   `form` of `segment_line.yaml`, a child `e` of unknown length at 32 that
   is a segment line holding no segment holds `locked: true`. The same `d`
   stating `locked: true` is `segment_never_locked` at `[{block: A, id: "form"},
   "child"]`, message `A segment is never locked: lock its segment line
   'form' instead.`; the same `e` stating `locked: false` is
   `unlocking_not_supported` at the same path.
6. **`add child` of a subtree.** Into the root `bare` of `bare.yaml` (not
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

1. **Blocks hold any manifest.** A workspace holding blocks of `bare.yaml`,
   `group_child_member.yaml` and `bundle_mixed.yaml` writes and reads back
   deep-equal, and writes again to the same bytes; its file format is
   version 7.
2. **Invariants root by root.** `group_child_member.yaml` with
   `second-half`'s unit changed to `seconds` (its length written `8.0`, as
   the `float` axis of seconds represents it, its timestamps on the
   quarters axis left out) is refused with exactly
   `schema_violation` at `["timelines", 0, "children", 0, "unit"]`, message
   `child 'second-half' has unit 'seconds', its parent 'piece' has
   'quarters'`: the path counts the roots of a manifest with a group.
3. **Elements of a group manifest.** The enumeration of
   `group_child_member.yaml` is written out whole, every member of every
   key, and compared exactly. Its order: the block; the ancestor card of
   `piece`, the root of the member `second-half` (drawing.md §8.8): its
   `ancestor_card` `{id: "piece", part: ["card"]}` (`[block]`), then
   `piece`'s member drawing as an ungrouped root's, held by the block: its
   line `timeline` `{id: "piece"}` (`[block]`), its name, its children band
   holding `second-half` as a `child` row with its name and five bands
   (`[block, timeline, band]` for the row, `[…, band, child]` for its
   bands), the markers band of the row holding the wedges and coordinate
   labels of `timestamp_3` and `timestamp_4`, each followed by its line `{id:
   X, part: ["line"]}` held by the row itself (both are groupstamps, the
   `origin` and `length` a child member is given, so each draws its
   `cross_section`), then `piece`'s four other bands; then the frame `{id:
   "group_1"}` (type `frame`, chain `[block]`) and its title `{id:
   "group_1", part: ["name"]}` (`[block, frame]`), both belonging to no
   timeline, so timeline, domain, modality, class and facet are null; then
   each member in display order, `second-half` first: its card `{id:
   "second-half", part: ["card"]}` (`[block, frame]`), its ancestor line
   `piece` (type `ancestor`, `[block, frame, timeline]`) with its name and
   no mark of the member's start or end (drawing.md §8.3 draws none); then
   the member's own line as a root's: `timeline` `{id: "second-half"}`
   (`[block, frame]`), its name and its five bands (`[block, frame,
   timeline]`), the markers band holding the wedges and coordinate labels
   of its named timestamps `origin` and `length` (`timestamp_3`,
   `timestamp_4`; both `[…, timeline, band]`), each followed by its line
   (`[…, timeline]`); then `recording` the same way without ancestors
   (`timestamp_1`, `timestamp_2`), its markers band also holding the
   secondary coordinates of the groupstamps `timestamp_3` and
   `timestamp_4`, which cross its card; last, after every item, the lines
   of `timestamp_3` and `timestamp_4` across the frame, held by it
   (`[block, frame]`) and belonging to `second-half`. A timeline's
   keys carry its domain, modality and class (`second-half` and `piece`
   logical, continuous, `ContinuousLogicalTimeline`; `recording` physical,
   continuous, `ContinuousPhysicalTimeline`), a band its timeline, null
   domain, modality and class, and its facet. So an ancestor line holds no
   band, and a member that is a child in `timelines` is a `timeline`
   element in its drawing whose bands are held by no band. `{within:
   "piece"}` matches exactly the card of `second-half`, the `piece`
   ancestor, its name and every element of the line `second-half`, its
   timestamps' included, and their two lines across the frame (twenty-two
   keys), after every key of the ancestor card's twenty-five; four of each
   list are the secondary coordinates of `origin` and `length`
   (`timestamp_3` 0 and `timestamp_4` 8 on `second-half`, 8 and 16 on
   `piece`, which spans 0 to 16) on `piece`, each a wedge and a coordinate
   label, held by `piece`'s markers band in the ancestor card and by the
   ancestor line in the member card (forty-seven keys in all); `{element:
   "frame"}` only the frame; `{element: "card"}` exactly the cards of
   `second-half` and `recording`, `{element: "ancestor_card"}` exactly the
   card of `piece`; `{inside: "ancestor"}` exactly the name of `piece` and
   the four keys of the secondary coordinates on it; `{element: "wedge",
   inside: "ancestor"}` the wedges of `timestamp_3` and `timestamp_4`;
   `{element: "name", inside: "ancestor"}` only the name of `piece`;
   `{inside: "frame"}` every key after the frame and its title's holder,
   the frame itself excepted.
4. **Elements of a named manifest with two groups.** The addresses of
   `bundle_mixed.yaml`'s enumeration are written out whole: the block `{}`;
   the title `{part: ["name"]}` (whether the manifest is named, as here, or
   has an id); the ancestor card of `recording` behind `group_2` (its card,
   then `recording`'s line, name and five bands, the children band holding
   `excerpt` as a child row with its name and bands, the conversion maps
   band holding `cmap_5`); per frame in group order the frame, its title and its
   members' cards in display order (`group_1`: `score`, `performance`;
   `group_2`: `page`, `excerpt`), each card followed by the member's
   ancestor lines (for `excerpt`, `{id: "recording"}` and its name, no
   mark of `excerpt`'s start or end) and its line with
   its name and five bands, the bands holding its maps (`cmap_1`, `cmap_2`
   in `score`'s; `cmap_3` in `performance`'s; `cmap_4` in `page`'s;
   `cmap_6` in `excerpt`'s), the wedges and coordinate labels of its
   `origin` and `length` (`annotations` `timestamp_1`, `timestamp_2`,
   `excerpt` 3, 4, `page` 5, 6, `performance` 7, 8, `score` 9, 10), and
   on `recording`, in the ancestor card's markers band and on `excerpt`'s
   ancestor line, the secondary coordinates of `excerpt`'s `timestamp_3`
   and `timestamp_4` (`excerpt` lies at 44100 for 88200 samples of
   441000: both within), which are groupstamps, so each is followed by its
   line on `excerpt` (in the ancestor card's row and in its member card)
   and they cross `page`'s card in `group_2`'s frame, secondary
   coordinates in its markers band after its own, and its jump with
   its stack's ID and label and its symbol (`{id: "jump_1"}`, `{id:
   "jump_1", part: ["id"]}`, `["label"]`, `["symbol"]`); then the ungrouped root `annotations` with its card, name
   and five bands, the regions band holding `region_1`, its label,
   `region_2`, its label; last the lines of `timestamp_3` and
   `timestamp_4` across `group_2`'s frame. Nothing of `recording`'s own is drawn on an
   ancestor line (its map `cmap_5` is drawn only in the ancestor card,
   drawing.md §8.3); the first key at `{id: "recording"}` is the ancestor
   card's `timeline`, the second the ancestor line. A line's
   elements come in the order of "Elements and selectors" 1. The title, the
   card of `annotations` and the line `annotations` are held by the block
   alone (chain `[block]`), the line's name by the block and the line
   (`[block, timeline]`). `memberDrawings` gives the frames `group_1`
   (`score`, `performance`) and `group_2` (`page`, `excerpt`, the latter
   with the one ancestor `recording`, offset its offset there), the
   ungrouped roots `["annotations"]` and the one ancestor card, `recording`
   behind `group_2` aligned to `excerpt`.
5. **Addresses, one root and several.** In a block of `map.yaml`:
   `manifestIds` is exactly `melody`, `phrase`, `tempo`, `ticks` and the
   root's two timestamps `timestamp_1`, `timestamp_2`; `set`
   reaches the map `ticks` of the child `phrase` by `{block: A, id:
   "ticks"}`, and `{id: "melody/ticks"}` and `{id: "phrase/ticks"}` are
   `unknown_target`: no ID is composed. In a block of
   `group_number_types.yaml`, adding the region `region_1` (`[2, 1]` to
   `[4, 1]`) into `{block: A, id: "score"}` stores it in
   `timelines[2].regions`; `manifestIds` then holds exactly `group_1`,
   `page`, `performance`, `region_1`, `score` and the three roots'
   timestamps `timestamp_1` to `timestamp_6`. IDs are free: a region
   with the ID `start` or `card` (part words) added into `score` is
   accepted, listed before `region_1`, and `set` of its `name` on `{block:
   A, id: "start"}` names that region, while `{block: A, id: "score", part:
   ["start"]}` names nothing drawn (`score`'s start is its `origin`
   timestamp) and is no target: `unknown_target` at that address. `unknown_target` also for `{id:
   "page/region_1"}`, `{id: "score/region_1"}`, and the parts `start` and
   `label` of `region_1` (a region has a label, but no command aims at a
   part); `{block: A, id: "group_1"}` is a group, which `set` refuses by
   kind (`wrong_target_kind` for `length`). `findTimeline`, the one reader
   of a timeline by id, searches every root's tree: in `bundle_mixed.yaml`
   it gives for `annotations` the object at `timelines[0]` and for
   `excerpt` the object at `timelines[3].children[0]` (the very objects,
   not copies), and `undefined` for `group_1`, `name`, `recording/excerpt`,
   `cmap_6` (a map) and `nothing`. `resolveElement` reads a map, region or
   flow-control element by its ID alone and gives its kind and the very
   object: in `map.yaml` `{id: "tempo"}` the map
   `timelines[0].conversion_maps[0]` and `{id: "ticks"}` the map
   `timelines[0].children[0].conversion_maps[0]`, both kind `map`; in
   `flow_control.yaml` `break_1`, `jump_1` and `jump_target_1` the
   elements of `timelines[0].flow_control` with those ids (a break, a
   jump, a jump target), each kind `flow_control`; in
   `group_number_types.yaml` with `region_1`, `{id: "region_1"}` the object
   `timelines[2].regions[0]`, kind `region`. It gives no entry for `{id:
   "score"}` (a timeline), `{id: "group_1"}` (a group), `{part: ["name"]}`
   (the title), `{id: "score/region_1"}`, `{id: "region_1", part:
   ["label"]}` (a part) and `{id: "nothing"}`.
6. **Commands.** `set` reaches a timeline at any depth: `name: "Late"` on
   `{block: A, id: "second-half"}` of `group_child_member.yaml` changes
   exactly `timelines[0].children[0].name`, and `name: "Intro"` on `{block:
   A, id: "region_1"}` that region's name. `add` the child `clt_1` (bare's
   root, locked, offset `[0, 1]`) into `score` of
   `group_number_types.yaml`: it is stored in `timelines[2].children`.
   `duplicate_id` is manifest-wide: a child carrying `page` (a timeline of
   another root) at `[{block: A, id: "score"}, "child", "id"]`; a second
   `region_1` into `score` and one into `page`, another root, at `[{block:
   A, id: "score"}, "region", "id"]` and `[{block: A, id: "page"}, "region",
   "id"]`. `style` with `blocks: [A]` on `group_styled.yaml`,
   `{select: {element: "ancestor"}, set: {opacity: 0.5}}`, adds that
   rule after the manifest's three and keeps `styles` and `order`,
   written out literally: `order` exactly `{group_1: ["score", "page",
   "performance"]}`, `styles` exactly `{"frame-highlight": {stroke:
   "#7F00FF"}}`, and `rules` exactly `{select: {element: "frame"},
   set: "frame-highlight"}`, `{select: {addresses: [{id: "group_1", part:
   ["name"]}], element: "name"}, set: {fill: "#7F00FF"}}`, `{select:
   {element: "card", inside: "frame"}, set: {rx: 2, shadow: "#C4B5FD"}}`,
   then the new one. Rules cascade (a later one wins), so a
   reordered, merged or rewritten rule would draw differently, and the
   string `set` names a style that must still resolve. Without `blocks`,
   `{select: {element: "frame"}, set: {stroke: "#C00000"}}` reaches the two
   blocks holding a group and not the one-root block beside them.
7. **Delete deletes.** `remove` takes any element, timelines and groups
   included, and `removedBy(manifest, ids)` names, by ID, exactly what
   goes, which the arranger's Delete preview reads. Each effect on its own
   case:
   - **A subtree, its ids in groups and orders.** `bundle_mixed.yaml`,
     removing `recording`: the roots are `annotations`, `page`,
     `performance`, `score`; `group_2`'s members are `["page"]` and its
     order `["page"]`; `group_1` and its order are unchanged. `removedBy`
     of `["recording"]` is exactly `{recording, excerpt, cmap_5, cmap_6,
     timestamp_3, timestamp_4}` (the timestamps lie on `excerpt`).
   - **A child.** `group_child_member.yaml`, removing `second-half`:
     `piece` has no children; `group_1`'s members and order are
     `["recording"]`.
   - **A map belongs to its timeline only.** `group_number_types.yaml`
     with the `TableMap` `{id: "warp", source_unit: "quarters",
     target_unit: "seconds", x_values: [0, 12], y_values: [0, 12.5]}`
     added into `score` (stored with `name: null`, `kind: "linear"`,
     `extrapolate: "none"`), removing `performance` leaves `score`'s
     `conversion_maps` exactly `[warp]`; `removedBy` of `["performance"]`
     is exactly `{performance, timestamp_3, timestamp_4}`, its own
     timestamps and no map.
   - **A measure map goes alone.** The same manifest given the measure map
     `{id: "bars", rows: [{count: 1, qstamp: [0, 1]}]}` (added into
     `{block: A}`): `removedBy` of `["bars"]` is exactly `{bars}`, and
     removing `bars` leaves `measure_maps: []` and every timeline as it
     was.
   - **`addresses` entries naming a removed element.** `group_styled.yaml`
     with the rules `{select: {addresses: [{id: "page"}, {id: "score",
     part: ["card"]}]}, set: {opacity: 0.5}}` and `{select: {addresses:
     [{id: "page", part: ["name"]}, {id: "page", facet: "regions"}]}, set:
     {opacity: 0.4}}` styled in, removing `page`: the first keeps
     `addresses: [{id: "score", part: ["card"]}]`, the second goes (its
     part and band of `page` go with `page`), the manifest's own three
     rules are unchanged.
   - **A group left without members stays; the last root leaves an empty
     array.** `group_number_types.yaml`, removing `page`, `performance` and
     `score` in one command: `timelines` is `[]`, `groups` is exactly
     `[{id: "group_1", name: "Edition", meta: {}, members: []}]`, the order
     `{group_1: []}`.
   - **Deleting a group keeps its members.** `bundle_mixed.yaml`, removing
     `group_1`: the roots are unchanged, `groups` is `[group_2]`, the order
     holds `group_2` alone, and `memberDrawings` draws `annotations`,
     `performance` and `score` as ungrouped roots.
   - **Targets that go with another are not refused**: removing
     `recording` and `excerpt` gives the same manifest as removing
     `recording`.
8. **IDs of new elements** are unique across the manifest. On
   `bundle_mixed.yaml` given the id `edition`, a region and a child
   carrying `group_1`, `edition` (the manifest's own id) or `cmap_5` (a map
   of another root) added into `score` are each `duplicate_id` at
   `[{block: A, id: "score"}, "region", "id"]` and `[…, "child", "id"]`.
   On `conversion_maps__maps_quarters.yaml`, whose maps hold maps two
   deep, `manifestIds` is exactly `cmap_1` to `cmap_8`, `lmap_1` to
   `lmap_5`, `maps:quarters`, `measuremap_1`, `pmap_1`, `timestamp_1`,
   `timestamp_2` and `tmap_1` to `tmap_4`: the maps a `ChainMap`, `CombinationMap` or `PiecewiseMap`
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

Block `bundle0001` holds `bundles/bundle_mixed.yaml`; where a case names
`groups/group_child_member.yaml` (whose root `piece` holds the member
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
2a. **-0 is stored as 0.** A JSON file has no -0 for a canvas number, so
   a stored -0 would read back as a different number. An `add` of the
   block at `x: -0, y: -0`; from a block at `x: 5, y: 5`, `set bundle0001
   {x: -0, y: -0}`, `set group_1 place {y: -0, spacing: -0, margin: -0}`
   and `set score place {spacing: -0}`: the added block's `x` and `y`
   and each of these six numbers are stored as 0 (`Object.is(…, 0)`,
   which tells 0 from -0), and the workspace written and read back equals
   the view.
3. **Scale.** `set group_1 place {scale: 1.5}`: exactly `{group_1: {scale:
   1.5}}`; then `place {scale: null}`: `{}`. `set annotations place
   {scale: 1.5}`: exactly `{annotations: {scale: 1.5}}`.
4. **A member's card size.** `set score place {width: 650, height: 120}`
   (a member that is a root): exactly `{group_1: {cards: {score: {width:
   650, height: 120}}}}`; then `place {width: null}`: `{group_1: {cards:
   {score: {height: 120}}}}`. In `group_child_member.yaml`, `set
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
   A subset of the facets with `line` is stored as stated and drawn
   completed against what `excerpt` inherits (`D`, the fixture stating no
   order for `recording`): `E` without `regions` draws `[line, children,
   conversion_maps, markers, flow_control, regions]`, and `[line,
   conversion_maps, regions, flow_control]` draws `[children, line,
   conversion_maps, regions, flow_control, markers]`.
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
    is not drawn in a card of its own"; in `group_child_member.yaml`, `set
    piece place {width: 650}` the same at `[piece, "place"]`. A member's
    card states only its size: `set score place {x: 1}` is `not_an_item` at
    `[score, "place", "x"]`, message "'score' is a member: its card
    takes only width, height, spacing and margin"; `{width: 650, length: 300}` at `[…,
    "place", "length"]`, `{scale: 2}` at `[…, "place", "scale"]`, and in
    `group_child_member.yaml` `set second-half place {x: 10}` at
    `[second-half, "place", "x"]`. Both refusals come before the value is
    read: `set recording place {x: "a"}` is `not_an_item` at `[…, "place"]`
    and `set score place {x: "a"}` at `[…, "place", "x"]`. On
    `bundles/bundle_shared_member.yaml` (`t` a member of `g1` and `g2`),
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
    the band order of 'excerpt'`; `E` without `line`, `'line' is missing
    from the band order of 'excerpt'` (a facet left out is no problem, item
    7); `E` with
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
    `map.yaml`, whose `graphical` states no order, `set melody order null`
    and `set phrase order null`. In a store holding `map.yaml` as block
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
    bundle0001 manifest` to `bundle_mixed.yaml` with `annotations` added to
    `group_1`'s `members` and display order: `places` is `{}`. The same
    with `annotations` placed `{x: 1, scale: 2, spacing: 1.5, width: 700}`:
    `places` is exactly `{group_1: {cards: {annotations: {spacing: 1.5,
    width: 700}}}}`.
18. **The card's place moves both ways.** With `annotations` placed `{x:
    1, width: 700, spacing: 2}`, `set annotations groups ["group_1"]`
    leaves `places` exactly `{group_1: {cards: {annotations: {width: 700,
    spacing: 2}}}}`, and `set annotations groups []` then exactly
    `{annotations: {width: 700, spacing: 2}}`. With `group_1` placed `{x:
    10}` and `score`'s card `{width: 650}`, `set score groups []` leaves
    exactly `{group_1: {x: 10}, score: {width: 650}}`: the frame keeps its
    own place. A card in a second frame: with `score`'s card `{width:
    650}` in `group_1`, `set score groups ["group_1", "group_2"]` leaves
    `places` exactly `{group_1: {cards: {score: {width: 650}}}}` (the new
    card states nothing), and `set score groups ["group_2"]` then exactly
    `{group_2: {cards: {score: {width: 650}}}}`, the place moving to the
    one card left.
19. `remove annotations` with `annotations` placed: `places` loses its
    entry.

**Band orders go with their timelines.** Removing a timeline removes the
entries of `graphical.order` keyed by it and by each of its descendants (as
for a group's display order), and a rule's `addresses` naming one of
its bands (`{id: T, facet}`) go with it as those naming its cards (`{id: T,
part: ["card"]}`) do: the address goes with its timeline, and a rule
left without `addresses` goes.

20. With `recording: R`, `excerpt: E` and `annotations: D` set: `remove
    excerpt` leaves `graphical.order` exactly `{group_1: ["score",
    "performance"], group_2: ["page"], recording: R, annotations: D}`;
    `remove recording` instead leaves exactly `{group_1: ["score",
    "performance"], group_2: ["page"], annotations: D}` (its descendant's
    entry goes with its own).
21. With the rules `{select: {addresses: [{id: "excerpt", facet:
    "regions"}, {id: "annotations", facet: "regions"}]}, set: {display:
    "inline"}}` and `{select: {addresses: [{id: "excerpt", facet:
    "markers"}]}, set: {display: "inline"}}`, `remove excerpt` leaves
    exactly `[{select: {addresses: [{id: "annotations", facet:
    "regions"}]}, set: {display: "inline"}}]`.
22. **No command renames.** IDs are never settable, and core renames
    neither an entry of `graphical.order` nor an address in a rule. A
    timeline's ID changes only with a whole manifest (`set bundle0001
    manifest`), which brings its own `graphical`. With `excerpt: E` and the
    rule `{select: {addresses: [{id: "excerpt", facet: "regions"}]},
    set: {display: "inline"}}`, the manifest with `excerpt` renamed
    `fragment` in `recording`'s children, in `group_2`'s members and in its
    display order, its band order still keyed `excerpt`, is refused:
    `schema_violation` at `["bundle0001", "manifest", "graphical", "order",
    "excerpt"]`, message `'excerpt' names no group or timeline of this
    manifest`. The same with the entry rekeyed `fragment: E` is accepted
    (a band order names no ID, so it moves unchanged), and the rule is
    kept exactly as written, still addressing `{id: "excerpt", facet:
    "regions"}`.

**Member cards placed through their group** (on
`bundles/bundle_shared_member.yaml`: `t` a member of `g1` and `g2`, `u` of
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

A segment is a child of a segment line: on `segment_children.yaml`
exactly `i1`, `i2`, `t1`, `t2`, `t3`, `c1` and `c2`. It is not removed on
its own: removing
it would leave a gap in its segment line, and the editor offers no way to
close it yet. On `segment_children.yaml`, removing `{block: A, id: "t2"}`
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
(`segment_children.yaml`, `theme` unlocked) and to one whose lengths are
not (`unknown_length_segments.yaml`), and the resulting offsets and lengths
are compared with values worked out by hand from the rule above, written
out literally; what each way moves on the root's axis is written out too.
The ways come in the order of preference (left extend, right extend, left
shift, right shift), each with the reason it is refused or none: a locked
line refuses both shifts (`its segment line 'theme' is locked`), the first
and last segments lack a neighbour (`no segment precedes it`, `no segment
follows it`), a root has no offset to move (`its segment line 'form' is
a root and has no offset to move`), and a result the manifest's rules refuse
is refused with that rule's message (on `segment_line.yaml`, `segment 'b'
of segment line 'form' does not start where the one before it ends`). A
timeline that is no segment has no ways. A segment's neighbours are
segments, which are never locked, so they may always extend.

Rules naming a removed timeline in `within` go with it, for any
removal: on `segment_children.yaml` styled with three boundary rules
`within` `theme`, `t1` and `coda`, removing `theme` leaves exactly the
`coda` rule.

## Named timestamps (`timestamps.test.ts`)

A named timestamp is `{id, timeline, coordinate, name, display}` in its
manifest's `graphical.timestamps`, in canonical order (by timeline, then
coordinate, then ID); it is an element of the manifest's one ID space,
addressed `{id}`, with the drawing parts `["name"]`, `["id"]`,
`["coordinate"]`, `["label"]` and `["line"]` (its cross-section line).
`display` lists what of it is drawn, a subset of the schema package's words
`wedge`, `name`, `id`, `coordinate`, `cross_section`, held in that
canonical order (the package's `TIMESTAMP_DISPLAY`, never restated here)
and always present in memory: a file leaving it out reads as the default
`["wedge", "name", "cross_section"]`. What must hold: the four commands
reach it like any other element and never through a command of its own;
what a command leaves is the exact `graphical` a reader of the manifest
would hold (settled: canonical order, `display` complete and canonical,
coordinates spelled as their axis's number type selects); every refusal
lies at the value at fault; and what goes with a timeline, a length or an
editor goes with its timestamps too. Every case starts from block `A`
holding `timestamps.yaml` (TimeToShare's fixture): root `clt_1` (quarters,
fraction, length 8) holding the child `clt_2` at 2 of length 4 (locked);
`timestamp_1` "Downbeat" on `clt_1` at 3/2 with the default `display`,
`timestamp_2` "Climax" on `clt_1` at 6 with `["wedge", "name"]` and
`timestamp_3` "Entry" on `clt_2` at 1 with all five words; no rule.
Below, `T1`, `T2` and `T3` are those three objects as the fixture holds
them, `DEFAULT` is `["wedge", "name", "cross_section"]`, `{block: A, id:
"x"}` is written `x`, and its part `{block: A, id: "x", part: ["line"]}`
is written `x line`.

**Reading and writing `display`.** The proof that the in-memory form is
complete and canonical whatever the file states is that differently
spelled files read to one value:

1. `timestamps.minimal.yaml` (the fixture's minimal twin, `timestamp_1`
   without `display`) reads to the same `graphical` as `timestamps.yaml`,
   `T1.display` being `DEFAULT`; the fixture with `timestamp_3`'s
   `display` reversed reads to the fixture's `graphical` exactly. Writing
   is the schema package's: the round trips of every fixture
   (`manifest.test.ts`) write the complete form with `display` and the
   minimal form without the default, byte-equal to the fixture and its
   twin.

**Resolving.** `timestamp_1` resolves (`resolveAddress`) to the kind
`timestamp` with the timeline `clt_1`, index 0 and `T1`; `timestamp_3` to
`clt_2`, index 2 and `T3`; their words are `timestamp 'Downbeat'` and
`timestamp 'Entry'`. A part resolves only where its `display` draws it:
`timestamp_1 line` (`the line of timestamp 'Downbeat'`) and its `name`
part resolve to parts of it; `timestamp_2 line` (no `cross_section`) and
`timestamp_1`'s `id` part (no `id`) name nothing (`unknown_target`). `timestamp_9`, and `timestamp_1` with the facet `markers`,
name nothing (`unknown_target` at their key). `manifestIds` holds the
three timestamp IDs beside the timelines'. `clt_1` contains (`contains`)
`timestamp_1`, `timestamp_3` and `timestamp_1 line`; `clt_2` contains
`timestamp_3` only.

**add** `{into: <timeline>, timestamp: {name, coordinate, display?}}`:

2. Into `clt_1`, `{name: "Coda", coordinate: [15, 2]}`: the timestamps
   are exactly `T1`, `T2`, `CODA` = `{id: "timestamp_4", timeline:
   "clt_1", coordinate: [15, 2], name: "Coda", display: DEFAULT}`, `T3`
   (the smallest free `timestamp_N`; ordered by timeline before
   coordinate, so `clt_2`'s comes last).
3. Into `clt_2`, `{name: "Exit", coordinate: [8, 2]}`: the new
   `timestamp_4` holds `[4, 1]` (the value normalised on its axis, at the
   timeline's end, which is inside it), after `T3`.
4. After removing `timestamp_1`, an add into `clt_1` at `[1, 1]` mints
   `timestamp_1` again and lists it first.
5. Into `bare` of `bare.yaml` with its `graphical` object left out before
   reading, `{name: "Mid", coordinate: [5, 2]}`: the manifest's
   `graphical` is exactly `{order: {},
   rules: [], styles: {}, timestamps: [{id: "timestamp_1", timeline:
   "bare", coordinate: [5, 2], name: "Mid", display: DEFAULT}]}`.
6. A given `display` is stored canonically: `["cross_section", "id",
   "wedge"]` is stored `["wedge", "id", "cross_section"]`; `[]` is stored
   `[]` (nothing drawn is a state of its own, not the default).
7. Refusals, at `[<into>, "timestamp", …]`: name `""` is `invalid_value` at
   `name` ("a name is a non-empty string"); `[17, 2]` is `invalid_value`
   at `coordinate` ("the coordinate lies after the end of timeline
   'clt_1'"), `[-1, 2]` likewise ("the coordinate lies before the start of
   timeline 'clt_1'"); a bare `3` on the fraction axis is
   `invalid_coordinate` at `coordinate`; a value without `coordinate` is
   `invalid_value` at `coordinate` ("a new timestamp needs coordinate");
   an `id` given is `unknown_property` at `id`; at `display`, each
   `invalid_value`: `["wedge", "flag"]` ("'flag' is no display word"),
   `["name", "wedge", "name"]` ("'name' is given twice"), `"wedge"` and
   `[1]` ("a display is a list of display words"); into the block
   `{block: A}` or into `timestamp_1` it is `wrong_target_kind` at
   `[<into>, "timestamp"]`.

**set** on a timestamp takes `name`, `coordinate` and `display`:

8. `timestamp_1 {name: "One"}` changes that name only; `timestamp_1
   {coordinate: [7, 1]}` moves it after `T2`, the list being `T2`, `T1`
   at `[7, 1]`, `T3`; `timestamp_3 {coordinate: [4, 1]}` (its timeline's
   end) is accepted; `timestamp_2 {display: ["cross_section", "wedge",
   "name"]}` stores `DEFAULT`, `timestamp_3 {display: []}` stores `[]`.
9. Refusals at `[<timestamp>, <property>]`: `name: ""` `invalid_value`;
   `timestamp_3 {coordinate: [9, 2]}` `invalid_value` ("the coordinate
   lies after the end of timeline 'clt_2'"); `display` refused with the
   values and messages of item 7; `name: "Downbeat"`, `coordinate: [3,
   2]`, `coordinate: [6, 4]` (the stored value once normalised) and
   `timestamp_2 {display: ["name", "wedge"]}` (the stored list in another
   order) are each "the command changes nothing" (`invalid_value`);
   `timeline` is `unknown_property` ("timestamp has no property
   timeline"), `start` `wrong_target_kind`, `id` `id_not_settable`. The
   parts are drawing addresses, no target: `set` on `timestamp_1 line`
   and `remove` of it are `unknown_target` at its key.

**remove**:

10. After a `style` of `{addresses: [{id: "timestamp_2", part:
    ["label"]}]}` setting `display: "none"`, removing `timestamp_2` leaves the timestamps `T1`, `T3`
    and no rule (its one address named the removed timestamp's
    label).
11. Removing `clt_2` removes `T3` with it (`T1`, `T2` left); removing
    `clt_1` leaves no timeline and no timestamp.

**Default timestamps.** A root a command adds, and every root of a
manifest the editor imports without a `graphical` object, are given two
timestamps (a child joining a group is given them as groupstamps, item
25), `origin` at the zero of the root's number type and `length` at
its length when the length is known, each with `display: ["wedge",
"coordinate"]`, its ID the next free `timestamp_N`. What proves it: the
exact timestamps, per number type and with an unknown length; their
absence for a timeline below a new root and for a manifest that has a
`graphical` object; and one journal entry undone as one step.

12. `add {into: A, timeline: {id: "late", unit: "quarters", number_type:
    "fraction", length: [4, 1], children: [{id: "inner", unit: "quarters",
    number_type: "fraction", length: [1, 1], offset: [1, 1]}]}}` leaves
    `T1`, `T2`, `T3`, then `{id: "timestamp_4", timeline: "late",
    coordinate: [0, 1], name: "origin", display: ["wedge",
    "coordinate"]}` and `{id: "timestamp_5", timeline: "late", coordinate:
    [4, 1], name: "length", display: ["wedge", "coordinate"]}`; `inner`
    has none. In a store this is one journal entry: one `undo` gives back
    the view before it, timestamps included.
13. An `int` root (`ticks`, length 960) is given `origin` at `0` and
    `length` at `960`; a `float` root (`seconds`) of unknown length only
    `origin`, at the float `0.0` (a `JsonFloat`, as a reader returns it).
14. Importing (`importedManifest`), each fixture read with its
    `graphical` object left out: `bare.yaml` gains exactly the `graphical`
    `{order: {}, rules: [], styles: {}, timestamps: [{id:
    "timestamp_1", timeline: "bare", coordinate: [0, 1], name: "origin",
    display: ["wedge", "coordinate"]}, {id: "timestamp_2", timeline:
    "bare", coordinate: [8, 1], name: "length", display: ["wedge",
    "coordinate"]}]}`; `nested.yaml` gains them for its root `clt_1` only
    (`[0, 1]`, `[16, 1]`), none for `clt_3` or `clt_2`;
    `unknown_length.yaml`'s root `score` of unknown length gains `origin`
    alone, its child `coda` none; `timestamps.yaml`, read as it is (it has
    a `graphical` object), is returned as the same object. Adding the
    imported `bare.yaml` as a block is one journal entry, the block's
    manifest holding the two timestamps.

**Lengths.** A new length never leaves a timestamp of its timeline beyond
it, and a timestamp at exactly the old end follows the end:

15. After the add of item 2, `clt_1 {length: [7, 1]}` is
    `timestamp_exceeds_length` at `[clt_1, "length"]`, message `timestamp
    'timestamp_4' lies after the end of its timeline 'clt_1'`; `[15, 2]`
    (the timestamp's own place) and `null` are accepted. With `clt_2`
    unlocked (`unlockedView`), `clt_2 {length: [1, 2]}` is refused the same
    way for `timestamp_3`, and `[1, 1]` is accepted. Where the timeline's
    children reach further, `length_below_content` still comes first:
    `clt_1 {length: [11, 2]}` is that.
16. With `End` added on `clt_1` at `[8, 1]` (its end, as `timestamp_4`):
    `clt_1 {length: [10, 1]}` moves `End` to `[10, 1]`, every other
    timestamp kept; `{length: [7, 1]}` moves `End` to `[7, 1]` (the
    timestamp at the old end is no refusal); `{length: null}` moves
    nothing. Growing `clt_1` by placing a child past its end (`add child
    {id: "tail", …, offset: [6, 1], length: [4, 1]}`, `clt_1` grows to
    `[10, 1]`) moves `End` to `[10, 1]` too: every length change follows
    one rule.
17. One `set` of two changes, `clt_1 {length: [6, 1]}` then `clt_1
    {length: [8, 1]}`, is accepted although the length ends where it
    began: `End` followed to `[6, 1]` and back, but `Climax` (at `[6, 1]`)
    followed the second change, so both end at `[8, 1]`. In a store the
    length change of item 16 is one journal entry, undone in one step.

**The guard** (`sideEffect`, with the command's change set and without,
the same result):

18. In the editor of `clt_2`: `timestamp_3 {name: "In"}`, `timestamp_3
    {display: []}` and an add into `clt_2` are accepted; `timestamp_1
    {name: "One"}` is `side_effect` at `[timestamp_1]`, message `timestamp
    'Downbeat' lies outside timeline 'clt_2': an editor changes only what
    it edits`; an add into `clt_1` of `Coda` is refused at `[timestamp_4]`
    (`timestamp 'Coda' …`); removing `timestamp_2` is refused at
    `[timestamp_2]` (`timestamp 'Climax' …`).
19. In the editor of `clt_1`: removing `timestamp_2`, removing `clt_2`
    (with `timestamp_3`) and every case of item 18 are accepted.

**Groupstamps.** A timestamp on a group's member may be a groupstamp
(`groupstamp: true`): its line extends across every member of each group
having its timeline as a member, their coordinates and lines derived from
the group, never stored. A timeline is a group's member when the group's
`members` list it or one of its ancestors (a member's descendants are
drawn inside the member's card in the group's frame); an ancestor of a
listed member is none. What proves it: `add` and `set` store the flag
exactly where the schema allows it and refuse it, each with its own
message, where it does not (anything but a boolean, a timeline no group
has as a member, a match timestamp); its default follows the editor a
timestamp is made in; and a command ending a membership is never refused
for the groupstamps it leaves, which become ordinary timestamps. The
cases read TimeToShare's `groups/group_groupstamp.yaml`: `group_1`
holding `performance` (seconds, 4.0) and `score` (quarters, 8), and the
groupstamp `timestamp_1` "Bar 2" on `score` at `[4, 1]`; every other
timestamp there and in `timestamps.yaml` states `groupstamp: false` (the
complete form).

20. `add` into `performance` `{name: "Cue", coordinate: 1.0, groupstamp:
    true}` stores exactly `{id: "timestamp_6", timeline: "performance",
    coordinate: JsonFloat(1), name: "Cue", display: ["wedge", "name",
    "cross_section"], matchstamp: false, groupstamp: true}`; without
    `groupstamp` it stores `false`. Refused, `invalid_value` at
    `[<into>, "timestamp", "groupstamp"]`: `"yes"` ("a groupstamp is true
    or false"); into `clt_1` of `timestamps.yaml` (no groups) `true`
    ("'clt_1' is a member of no group, so no timestamp on it is a
    groupstamp"); `false` there is accepted.
21. `set` on `timestamp_1 {groupstamp: false}` stores `false`, then
    `{groupstamp: true}` gives it back; `timestamp_1 {groupstamp: true}`
    as stored is "the command changes nothing"; on `timestamp_1` of
    `timestamps.yaml` `{groupstamp: true}` is refused as in item 20 at
    `[timestamp_1, "groupstamp"]`. A match timestamp is a timestamp like
    any other here: on the match timestamp `timestamp_1` of
    `bundles/bundle_matchstamp_cards.yaml` (on `score`, a member of both
    groups, `groupstamp: false`) `{groupstamp: true}` is stored, the
    timestamp otherwise equal to the one before, `matchstamp` kept `true`; on
    the match timestamp `timestamp_1` of `bundles/bundle_matchstamps.yaml`
    (on `score`, a bundle without groups) it is refused as in item 20:
    "'score' is a member of no group, so no timestamp on it is a
    groupstamp".
22. Ending the membership: removing `group_1` leaves `timestamp_1` an
    ordinary timestamp (`groupstamp: false`, every other member as it
    was), accepted by the schema check; undo gives `true` back.
23. The default (`groupstampByDefault(manifest, timeline, editor)`): on
    `score` `true` with no editor open, in a bundle editor and in a group
    editor, `false` in a timeline editor; on `clt_1` of `timestamps.yaml`
    `false` with none. `isGroupMember` is true for `score` and
    `performance`, false for `clt_1` and for an ID no timeline carries.
24. A member's descendant: with a child `motif` (quarters, offset `[2,
    1]`, length `[4, 1]`) added into `score`, `isGroupMember` is true for
    `motif`, its default is `true` with no editor open, and `add` into
    `motif` `{name: "Motif", coordinate: [1, 1], groupstamp: true}`
    stores exactly `{id: "timestamp_6", timeline: "motif", coordinate: [1,
    1], name: "Motif", display: ["wedge", "name", "cross_section"],
    matchstamp: false, groupstamp: true}`, accepted by the schema
    check. In `groups/group_child_member.yaml` (`group_1` listing
    `recording` and `second-half`, the child of `piece`) it is true for
    `second-half` and `recording`, false for `piece`, the ancestor of a
    listed member. `groupsHolding` gives the groups themselves: `group_1`
    for `motif` and for `second-half`, none for `piece` and for an ID no
    timeline carries.
25. A child joining a group is given its `origin` and `length` as
    groupstamps (drawing.md §6.6 draws their lines across the frame, so
    the frame marks the member's start and end): on `nested.yaml` (`clt_1`
    16 quarters ⊃ `clt_3` 8 at 4 ⊃ `clt_2` 2 at 3/2; `clt_1`'s
    `timestamp_1`, `timestamp_2`), `add {into: clt_2, timestamp: {name:
    "origin", coordinate: [0, 1], display: ["wedge"]}}` gives
    `timestamp_3`; then `add {into: {block: A}, group: {id: "group_1",
    members: ["clt_3"]}}` adds exactly `{id: "timestamp_4", timeline:
    "clt_3", coordinate: [0, 1], name: "origin", display: ["wedge",
    "coordinate", "cross_section"], matchstamp: false, groupstamp: true}`
    and `{id: "timestamp_5", …, coordinate: [8, 1], name: "length", …}`,
    in one journal entry, which one `undo` takes back whole. An empty
    group `group_2` added, `set {clt_2: {groups: ["group_2"]}}` makes
    `timestamp_3`, already named `origin` at `clt_2`'s zero, a groupstamp
    with `display: ["wedge", "cross_section"]` and adds only `length`,
    `timestamp_6` at `[2, 1]`. Removing `timestamp_4`, then `set {clt_3:
    {name: "Inner"}}` gives it no new `origin`: only joining gives them. A
    root joining a group is given nothing: on
    `groups/group_grandchild.yaml`, `add` of `group_2` with the member
    `recording` (already a member of `group_1`) leaves the timestamps as
    they were.

## Elisions (`elisions.test.ts`)

An elision is `{id, timeline, start, end, name?, width?, display}` in its
manifest's `graphical.elisions`: a stretch of one timeline's own axis, the
timeline it lies on, with an ID unique across the manifest, its `display`
words `ellipsis`, `name`, `id`, `coordinate`, `continuation` (default
`[ellipsis, name]`, the schema's: one ellipsis and the name label, which
shows the elision's `name`, else its timeline's name). TimeToShare's validators refuse one naming no timeline
(`elision_timeline`) and one whose stretch leaves its timeline or does not
run forwards (`elision_stretch`); core must refuse what it is given with
those codes and TimeToShare's messages itself, so a command never reaches
the schema check at settle with a broken elision (a `schema_violation`
there would mean core let it through). An elision on a timeline that lies
in a group (the timeline or an ancestor is a member, the groupstamp's
rule) is a **group elision** of each such group, drawn across its frame
and carried into the ancestor cards behind it; every other one is a
**card elision** of its root's cards (drawing.md section 8.9). What proves
each part:

- **Commands** are proven by the outcome of each command: the exact
  `graphical.elisions` a command leaves (complete, in canonical order: by
  timeline, then start, then ID), or the exact code, path and message of
  its refusal. The paths follow core's one rule: a value `add` puts in at
  `[<address key of into>, "elision", …]`, a `set` at `[<address key of the
  elision>, <property>]`, a length at `[<address key of the timeline>,
  "length"]`.
- **Card and group elisions** are proven by `elisionsUnder` and
  `groupElisions` over manifests whose elisions lie on each kind of
  timeline (an ungrouped root, an ancestor's child in no group, a member
  root, a member's descendant, a member of two groups), the expected lists
  read off the specification's rule (a timeline lies in a group when it or
  an ancestor is a member), never off the code.
- **Addresses** are proven by `resolveAddress`: what each address of the
  drawing specification (section 2.2) resolves to, and which name nothing.
  The oracle for a derived elision is the specification's rule of where an
  ancestor card may derive one under some `elision-mode` (section 8.9: its
  root and the children of the member's ancestors above its parent; a
  rule stating `proportional` derives them whatever is stored, and core
  reads no cascade), never a list derived from the code.
- **Elements** are proven by `manifestElements`: the exact keys listed for
  stored elisions, read against the specification's tree (section 2.1: a
  card elision's gap held by its timeline's line, a group elision's by the
  frame, each gap holding its ellipsis and its labels) and its rule of
  where elisions are drawn (section 8.9: a card elision in its root's
  ungrouped card and ancestor cards, never in a member's card; a group
  elision across each frame of a group its timeline lies in, with its
  labels, and carried into each ancestor card behind that frame, without
  them), and the selectors of the specification's examples matched over
  them (`selectorMatches`). A gap draws one ellipsis, centred in it
  (drawing.md section 6.6), so one `ellipsis` key per listed gap; where the
  gap is drawn and how wide is the drawing's geometry.
- **One journal entry** is proven by the store: the journal grows by
  exactly one entry for a list of elisions added, and one for all of a
  root's card elisions removed.

The manifests are fixtures given `graphical.elisions` before they are read
(those that state elisions of their own, `group_elided_members.yaml`,
`bundle_elisions_stored.yaml`, `bundle_groupstamp_shared_member.yaml`, are
read as they are), each elision stated without `display`, so read with
the default `[ellipsis, name]`. Fraction pairs are written `[n, d]`; a message
spells a value as canonical YAML does.

1. **Minting skips an elision's ID.** `bare.yaml` (root `bare`, 8
   quarters; timestamps `timestamp_1`, `timestamp_2`) with `elision_1` on
   `bare` from 1 to 2 and a second elision `timestamp_3` (IDs are free) from
   3 to 4: the manifest's IDs hold both, so the next `elision_N` is
   `elision_2`; `add {into: bare, timestamp: {name: "Bar 2", coordinate: [2,
   1]}}` mints `timestamp_4` and is accepted with both elisions kept; `add
   {into: bare, region: {id: "elision_1", …}}` is core's own `duplicate_id`
   at `[bare's key, "region", "id"]`, "'elision_1' is already an ID of the
   manifest", never a schema violation at settle.
2. **A removed timeline takes its elisions along.** `nested.yaml`
   (`clt_1` 16 quarters ⊃ `clt_3` 8 at 4 ⊃ `clt_2` 2 at 3/2) with
   `elision_1` on `clt_1` from 13 to 15, `elision_2` on `clt_3` from 1 to 2
   and `elision_3` on `clt_2` from 1/2 to 1: removing `clt_3` in one `remove`
   leaves exactly `elision_1`, and `removedBy` names `clt_3`, `clt_2` and
   both their elisions. Inside the timeline editor of `clt_3`, removing
   `clt_2` (taking `elision_3`) is no side effect (the guard returns
   `null`): an elision on a timeline inside the edited one lies inside it,
   as a named timestamp there does.
3. **A length change treats an elision as a named timestamp.** A named
   timestamp at the old end follows the end; one elsewhere keeps its place
   and refuses a length leaving it beyond (`timestamp_exceeds_length`). So
   an elision ending elsewhere keeps its values and refuses a length below
   its end, and one ending exactly at the old end follows the end while the
   new length lies after its start; both refusals are core's
   `elision_exceeds_length` at `[clt_1's key, "length"]`, "elision
   'elision_1' reaches beyond the end of its timeline 'clt_1'". On the
   manifest of 2 (`elision_1` from 13 to 15): `clt_1 {length: [29, 2]}` is
   that refusal; `[15, 1]` is accepted, the elision unchanged and the
   `length` timestamp moved to 15; `null` is accepted, every elision
   unchanged. With `elision_1` from 13 to 16 instead (at the end): `[15,
   1]` is accepted, `elision_1` then from 13 to 15 beside the `length`
   timestamp at 15; `[20, 1]` gives `elision_1` from 13 to 20; `[13, 1]`
   (its start) is the refusal; `null` leaves it from 13 to 16.
4. **`add` kind `elision` into a timeline.** On `bare.yaml` with
   `elision_1` from 1 to 2: `add {into: bare, elision: {start: [3, 1], end:
   [5, 1]}}` adds `{id: "elision_2", timeline: "bare", start: [3, 1], end:
   [5, 1], display: [ellipsis, name]}` after `elision_1`; with `name:
   "Development"`, `width: {ratio: 0.25}` and `display: [coordinate, name,
   ellipsis]` the new elision holds that name and width and `display:
   [ellipsis, name, coordinate]`. Each refusal, at `[bare's key, "elision",
   …]` with `elision_2` the ID it would be given:
   - no `end`: `invalid_value` at `end`, "a new elision needs end";
   - a `timeline` member: `unknown_property` at `timeline`, "unknown
     member timeline" (the target names the timeline);
   - start `[-1, 1]`: `elision_stretch` at `start`, "start [-1, 1] of
     'elision_2' lies before the start of its timeline 'bare'";
   - end `[9, 1]`: `elision_stretch` at `end`, "end [9, 1] of 'elision_2'
     is beyond the length [8, 1] of its timeline 'bare'";
   - start and end `[2, 1]`: `elision_stretch` at `end`, "end [2, 1] of
     'elision_2' does not lie after its start [2, 1]";
   - name `""`: `invalid_value` at `name`, "a name is a non-empty string",
     and `3` the same;
   - width `{ratio: 0.5, canvas: 10}`: `invalid_value` at `width`, "a width
     is exactly one of ratio, span and canvas", and `{}` the same;
   - width `{ratio: 0}` and `{ratio: 1.5}`: `invalid_value` at `width`,
     `ratio`, "a ratio lies above 0 and at most 1"; `{ratio: 1}` is
     accepted;
   - width `{span: [0, 1]}`: `non_positive_number` at `width`, `span`, "the
     span must be positive";
   - width `{canvas: -3}`: `non_positive_number` at `width`, `canvas`, "the
     number must be positive";
   - width `{ratio: 0.5, x: 1}`: `unknown_property` at `width`, `x`,
     "unknown member x";
   - display `[ellipsis, ellipsis]`: `invalid_value` at `display`,
     "'ellipsis' is given twice"; `[strip]` (a word elisions no longer
     have) `invalid_value` at `display`, "'strip' is no display word".
5. **`set` and `remove` on a stored elision.** On `bare.yaml` with
   `elision_1` from 1 to 2, at `{block: A, id: "elision_1"}`:
   - `{start: [3, 1], end: [5, 1]}` in one change is accepted (both ends
     move past the other's old value: the stretch is checked once the change
     is made), giving 3 to 5;
   - `{start: [3, 1]}` alone is `elision_stretch` at `start`, "end [2, 1]
     of 'elision_1' does not lie after its start [3, 1]"; `{end: [1, 1]}`
     alone the same at `end`, "end [1, 1] of 'elision_1' does not lie after
     its start [1, 1]";
   - `{end: [9, 1]}` is `elision_stretch` at `end`, "end [9, 1] of
     'elision_1' is beyond the length [8, 1] of its timeline 'bare'";
     `{start: [-1, 1]}` at `start`, "start [-1, 1] of 'elision_1' lies
     before the start of its timeline 'bare'";
   - `name: "Development"` is stored, after which the elision is worded
     "elision 'Development'"; `null` deletes it again, the elision then
     equal to the one before; `null` on an elision without one and the
     stored name again change nothing (`invalid_value` "the command
     changes nothing" at `name`); `""` is `invalid_value` "a name is a
     non-empty string" at `name`;
   - `width` takes each of its forms, `{ratio: 0.25}`, `{span: [1, 2]}`,
     `{canvas: 160}`, stored as given, and `null` deletes it again; `null`
     on an elision without one changes nothing (`invalid_value` "the
     command changes nothing" at `width`);
   - `display: [coordinate, ellipsis]` is stored `[ellipsis, coordinate]`;
     the stored display in another order changes nothing;
   - `timeline` is `unknown_property` "elision has no property timeline";
     `id` is `id_not_settable`;
   - `remove {targets: [elision_1]}` leaves no elision.
6. **Many elisions in one journal entry.** `groups/group_grandchild.yaml`
   (`score` 64 quarters ⊃ `movement` 16 at 16 ⊃ `theme` 8 at 8; `group_1`
   of the member `theme` and the root `recording`, 12 seconds), elisions as
   a card derives them (drawing.md section 8.9): `add {into: {block: A},
   elision: [{timeline: "movement", start: [0, 1], end: [8, 1]}, {timeline:
   "score", start: [0, 1], end: [16, 1]}, {timeline: "score", start: [32,
   1], end: [64, 1]}]}` through the store adds `elision_1`, `elision_2`,
   `elision_3` in that order (so stored `movement`'s, then `score`'s two by
   start) and grows the journal by one entry. With `elision_4` on
   `recording` from 1 to 2 seconds and `elision_5` on `theme` from 1 to 2
   added (both group elisions of `group_1`), `elisionsUnder(manifest,
   "score")` is `elision_1` to `elision_3`, and one `remove` of their three
   addresses grows the journal by one entry and leaves `elision_4` and
   `elision_5` alone. Refusals at `[A's key, "elision", …]`: an object, not
   a list, `invalid_value` "a block takes a list of elisions"; `[]`
   `invalid_value` "a list of elisions holds at least one"; an item without
   `timeline` `invalid_value` at `0, timeline`, "a new elision needs
   timeline"; an item on `nowhere` `elision_timeline` at `0, timeline`,
   "'nowhere' names no timeline of this manifest"; a second item from 4 to 2
   on `movement` `elision_stretch` at `1, end`, "end [2, 1] of 'elision_2'
   does not lie after its start [4, 1]" (the first item took `elision_1`);
   an item with `name: "Exposition"` stores it.
7. **Card and group elisions.** `bundles/bundle_elisions_stored.yaml`
   (`group_1` of the root `recording`, of `take`, the child of `session`,
   and of `theme`, a child of `score`; `coda` the other child of `score`;
   `page` an ungrouped root), elisions
   `elision_1` on `coda`, `elision_2` on `page`, `elision_3` on
   `recording`, `elision_4`, `elision_5`, `elision_6` on `score`,
   `elision_7` on `session`: `elisionsUnder` gives `score` `elision_1`,
   `elision_4`, `elision_5`, `elision_6` (its tree's elisions on
   timelines in no group), `page` `elision_2`, `session` `elision_7`,
   `recording` none (a member: `elision_3` is a group elision) and
   `nowhere` none; `groupElisions(manifest, "group_1")` is `elision_3`
   alone, `groupElisions(manifest, "nowhere")` none. With `elision_8` on
   `theme` from 1 to 2 added, `groupElisions` gives `elision_3`,
   `elision_8` and `elisionsUnder("score")` is unchanged.
   `bundles/bundle_groupstamp_shared_member.yaml` (`g1` of `t`, `u`; `g2`
   of `t`, `v`; `elision_1` on `t`): `groupElisions` gives `elision_1` for
   `g1` and for `g2`, `elisionsUnder("t")` none.
8. **Addresses.** On `group_grandchild.yaml`, the ancestor card of `score`
   is aligned to `theme`, whose ancestors are `score` and `movement`, so
   derived elisions may lie on `score` and on the children of `score`:
   `{id: "score", part: ["elision"]}` resolves to the part `elision` of the
   timeline `score`, `{id: "movement", part: ["elision", "coordinate"]}`
   to the part `coordinate` of the part `elision` of `movement`, and
   `["elision", "name"]` and `["elision", "ellipsis"]` likewise; `{id:
   "theme", part: ["elision"]}` (the member), `{id: "recording", part:
   ["elision"]}` (a root with no ancestor card) and `{id: "score", part:
   ["elision", "id"]}` (a derived elision has no ID) name nothing
   (`unknown_target`); `addressWords` says "the elision of timeline
   'Score'". A part is no target: `set` on `{id: "score", part:
   ["elision"]}` is `unknown_target`. With a stored card elision on
   `movement` (from 0 to 8), `{id: "score", part: ["elision"]}` still
   resolves (a rule may state `proportional`); the stored one, `{id:
   "elision_1"}`, resolves to kind `elision` with its timeline `movement`
   and index 0, its `ellipsis`, `name` and `coordinate` parts resolve
   (the ancestor card draws it; its display then `[ellipsis, name,
   coordinate]`), its `id` part does not (its display lacks the word), it
   is worded "elision 'elision_1'", has no editor (`no_editor`), and lies
   inside the timeline editor of `movement` and of `score`, not of `theme`
   (`contains`); the derived address of `movement` lies inside `movement`.
   A stored group elision on `recording` stated without `display` (so
   `[ellipsis, name]`) resolves itself, its ellipsis (drawn across
   `group_1`'s frame and carried into `score`'s ancestor card) and its
   `name` label (the frame draws its labels); stated with `display:
   [ellipsis]`, its `name` part names nothing. On `bare.yaml`
   an elision with `display: []` resolves, its `ellipsis` and `name`
   parts name nothing; `{id: "bare", part: ["elision"]}` names nothing (an
   ungrouped root's card derives no elision).
9. **Elements.** On `bundles/bundle_elisions_stored.yaml`, the `elision`
   and `ellipsis` keys and the labels held by a gap are, in order (each
   gap followed by what it holds): in the ancestor card of `score` (behind
   `group_1`), the gap of `elision_1` with its ellipsis and its `name`
   label (its display the default `[ellipsis, name]`), held by `coda`'s
   line inside `score`'s children band, then the gaps of `elision_4` (with
   its ellipsis and its `id` label), `elision_5` (its `name` label) and
   `elision_6` (nothing), held by `score`'s line after its five bands; then
   the gap carried into that card of `elision_3` with its ellipsis and no
   label, keyed as in the frame; in the ancestor card of `session`,
   `elision_7` with its ellipsis and its `name` label (the default display
   again; listed whatever the card's
   `elision-mode`, here `full`, which the cascade reads as it reads
   `display`), then `elision_3` carried; in `page`'s ungrouped card
   `elision_2` with its ellipsis and its `name` and `coordinate` labels;
   then, after every item, `group_1`'s frame's gap of `elision_3` with its
   ellipsis and its `coordinate` label. The card elision `elision_4`'s gap
   is `{type: "elision", timeline: "score", domain: "logical", modality:
   "continuous", class: "ContinuousLogicalTimeline", facet: null, inside:
   [block, timeline]}`, its ellipsis `{id: "elision_4", part:
   ["ellipsis"]}` of type `ellipsis` inside `[block, timeline, elision]`;
   the group elision `elision_3`'s gap belongs to `recording` (physical,
   continuous, `ContinuousPhysicalTimeline`) inside `[block, frame]`, all
   three times it is listed. No member card lists a gap. The selector
   `{element: "elision", within: "score"}` matches the gaps of
   `elision_1`, `elision_4`, `elision_5` and `elision_6`; `{element:
   "elision", inside: "frame"}` the three keys of `elision_3`; `{element:
   "ellipsis"}` one key per listed gap whose display lists `ellipsis`;
   `{element: "label", inside: "elision"}` exactly the labels listed. On
   `bundle_groupstamp_shared_member.yaml` `elision_1` on the shared member
   `t` (display `[ellipsis, name]`) is listed once per frame, held by
   `g1`'s and then `g2`'s, each with its ellipsis and its `name` label. On `bare.yaml` an elision `elision_1` on `bare` is listed
   with `inside: [block, timeline]` (the ungrouped root's card draws it).

## Arrangements (`arrangement.test.ts`)

An arrangement places a bundle's items, its groups and ungrouped roots, in
an order instead of at their places: one under another (`vertical`) or
side by side (`horizontal`), where every root the groups hang on is drawn
once behind the row. Core owns the rules that decide whether and how the
items stand side by side (TimeToShare's drawing specification, "Drawn
once"), the two placement states (a block's `arrangement` and the
workspace's), the commands that set them and the file that holds them;
where things lie on the canvas is layout's. What proves each part:

- **The rules** are proven by `rowOf` on manifests built for the case: the
  exact row, the exact roots top to bottom and the exact anchors (group,
  root, member, start and end on the root's own axis), or the exact
  conflict (its groups, its roots and its reason, word for word). The
  oracle is the specification's four sentences applied by hand to each
  case: a group hangs on a root when one of its members lies inside it, its
  first such member in display order anchors it there, its stretch runs
  from the offsets summed down to that member to the member's drawn end
  (section 3.4); along a root the stretches follow the row without
  overlapping (touching allowed); in a group the anchors lie in the order of
  their roots. Where the rules leave the row free it keeps the stored order;
  roots no group orders follow by ID. A conflict is reported as the first
  of: two stretches overlapping on a root (the first such root by ID, the
  first pair in the stored order), the stretches ordering the groups in a
  cycle, the groups ordering the roots in a cycle; a cycle is named from
  its first group (or root) in the stored order (or by ID). A group or root
  that only follows a cycle, which it lies after, takes no part in it: the
  conflict is the cycle's alone, whatever comes first in the stored order
  or by ID.
- **The commands** are proven by the block or workspace a `set` leaves
  (the exact `arrangement` member, or its absence), the exact code, path
  and message of a refusal, and the journal of the store (one entry per
  `set`).
- **The file** is proven by a round trip byte for byte and by the text
  written: a workspace or block without an arrangement writes no
  `arrangement` key, so every file written before keeps its bytes.
- **The guard** is proven by `sideEffect` through the store: the codes,
  paths and messages of what an element's editor refuses.

Items 23 and 24 read the bundle fixtures `bundle_arranged_roots` and
`bundle_arranged_conflict`, so the rules are proven on the manifests the
drawing specification's arranged figures draw. Every other manifest here
is built by a small builder in the test file, read through core's
manifest reader like any file (`loadText`), since those cases need shapes
no fixture has. The builder writes the one manifest
`Arranged` (`name: "Arranged"`); every root is a quarters timeline of
`fraction` number type and length 200 unless stated; groups and timelines
have no name unless stated, so a reason names them by ID. Notation: roots
`R`, `S`, `T`; `r1[0,10]` a child `r1` of `R` at offset 0 of length 10 (of
`S` for `s…`, of `T` for `t…`); `p1`, `q1`, `x1` roots without children
used as members; `G1 [r1, p1]` a group and its members in display order,
which the builder states in `graphical.order` (the reader holds a group's
`members` by ID);
"stored" the order given to `rowOf` or stored in the block. Values
written `5` are exact fractions `5/1`; a reason spells them as the pretty
text does (`5–10 ♩`).

1. **Items and their order.** `G1 [p1, q1]`, `G2 [r1[0,10]]`, ungrouped
   root `U`: the items are `G1`, `G2`, `U` (groups by ID, then ungrouped
   roots by ID; `R`, `p1`, `q1` hold or are members and are no items).
   `itemOrder` of `[U, nope, G2, U]` is `[U, G2, G1]` (an unknown ID
   passed over, a repeated one taken at its first mention, a left-out item
   appended in drawing order); of `[]` it is `[G1, G2, U]`.
2. **The first member inside a root anchors.** `G1 [r1[0,10], r2[5,15]]`,
   `G2 [r3[20,30]]`: `anchorsOf` is exactly `{G1, R, r1, 0, 10}`,
   `{G2, R, r3, 20, 30}` (`r2` anchors nothing, its overlap with nothing
   counts); `rowOf` of `[]` gives the row `[G1, G2]`, the roots `[R]` and
   those two anchors.
3. **Depth.** `R` holds `P` at 100 (length 50), `P` holds `m` at 5
   (length 10); `G1 [m]`, `G2 [r2[50,60]]`: `G1` anchors `m` on `R` from
   105 to 115 (the offsets summed); `rowOf` of `[]` gives `[G2, G1]`, roots
   `[R]`, anchors `{G2, R, r2, 50, 60}` then `{G1, R, m, 105, 115}`.
4. **A root member is no anchor.** `G1 [R]` (the root itself a member) and
   `G2 [r1[0,10]]` (the schema refuses a member inside another of the same
   group, so the root and its child stand in two groups): the one anchor
   is `{G2, R, r1, 0, 10}`; `rowOf` of `[]` gives `[G1, G2]`, roots `[R]`.
5. **An unknown end is the drawn end.** `G1 [r1[0, unknown]]`, `r1`
   holding one region from 0 to 10 (its reach 10), `G2 [r2[10,20]]`,
   stored `[G2, G1]`: `G1` anchors `r1` from 0 to 10, and the row is `[G1,
   G2]` (touching at 10 allowed).
6. **The stretches order the row.** `G1 [r1[0,10], p1]`, `G2 [r2[40,50],
   p2]`, `G3 [r3[80,90], p3]`, stored `[G3, G1, G2]`: row `[G1, G2, G3]`,
   roots `[R]`, anchors `{G1, R, r1, 0, 10}`, `{G2, R, r2, 40, 50}`,
   `{G3, R, r3, 80, 90}`.
7. **Touching is allowed.** `G1 [r1[0,10]]`, `G2 [r2[10,20]]`, stored
   `[G2, G1]`: row `[G1, G2]`, roots `[R]`.
8. **Two roots.** `G1 [r1[0,10], x1, s1[0,5]]`, `G2 [r2[20,30], s2[10,15]]`,
   stored `[G2, G1]`: row `[G1, G2]`, roots `[R, S]`, anchors `{G1, R, r1,
   0, 10}`, `{G1, S, s1, 0, 5}`, `{G2, R, r2, 20, 30}`, `{G2, S, s2, 10,
   15}`. `G1 [r1[0,10], s1[0,5]]`, `G2 [r2[10,20], s2[30,40]]`, stored
   `[G2, G1]`: row `[G1, G2]`, roots `[R, S]` (touching on one root, apart
   on the other).
9. **The order kept where free.** `G1 [r1[20,30], s1[20,30]]`, `G2
   [r2[0,10]]`, `G3 [s2[50,60]]`, stored `[G1, G2, G3]`: row `[G2, G1, G3]`
   (`G2` before `G1` on `R`, `G1` before `G3` on `S`), roots `[R, S]`.
10. **A subsequence of roots suffices.** `G1 [r1[0,10], t1[0,10]]`, `G2
    [r2[20,30], s1[0,10], t2[20,30]]`, stored `[G2, G1]`: row `[G1, G2]`,
    roots `[R, S, T]` (`S` passes behind `G1`).
11. **Items hanging on nothing keep the stored order.** `G1 [p1, q1]`,
    `G2 [r1[0,10]]`, ungrouped `U`, stored `[U, G2, G1]`: row `[U, G2,
    G1]`, roots `[R]`, the one anchor `{G2, R, r1, 0, 10}`.
12. **Roots no group orders follow by ID.** `G1 [s1[0,10]]`, `G2
    [r1[0,10]]`, stored `[G1, G2]`: row `[G1, G2]`, roots `[R, S]`.
13. **An overlap refuses.** `G1 [r1[0,10]]`, `G2 [r2[5,15]]`: the conflict
    `{groups: [G1, G2], roots: [R], reason: "\"G1\" and \"G2\" overlap on
    \"R\" (5–10 ♩)"}`. With the groups named "Theme A" and "Theme B", the
    root named "Score", `r1[0,8]` and `r2[4,12]`: the reason is `"Theme
    A" and "Theme B" overlap on "Score" (4–8 ♩)`.
14. **The stretches order the groups in a cycle.** `G1 [r1[0,10],
    s1[20,30]]`, `G2 [r2[20,30], s2[0,10]]`: `{groups: [G1, G2], roots:
    [R, S], reason: "on \"R\" \"G1\" comes first, on \"S\" \"G2\""}`;
    stored `[G2, G1]`, the cycle is named from `G2`: `{groups: [G2, G1],
    roots: [S, R], reason: "on \"S\" \"G2\" comes first, on \"R\"
    \"G1\""}`. Three groups: `G1 [r1[0,10], t2[20,30]]`, `G2 [r2[20,30],
    s1[0,10]]`, `G3 [s2[20,30], t1[0,10]]`: `{groups: [G1, G2, G3], roots:
    [R, S, T], reason: "on \"R\" \"G1\" comes before \"G2\", on \"S\"
    \"G2\" before \"G3\", on \"T\" \"G3\" before \"G1\""}`.
    A group after the cycle: the two-group case plus `G3 [r3[50,60]]`
    (after `G1` and `G2` on `R`), stored `[G3, G1, G2]`: exactly the
    two-group conflict named from `G1`, `{groups: [G1, G2], roots: [R, S],
    reason: "on \"R\" \"G1\" comes first, on \"S\" \"G2\""}`.
15. **The groups order the roots in a cycle.** `G1 [r1[0,10], s1[0,10]]`,
    `G2 [s2[20,30], r2[20,30]]`: `{groups: [G1, G2], roots: [R, S],
    reason: "\"G1\" holds \"R\" above \"S\", \"G2\" holds \"S\" above
    \"R\""}`. A root below the cycle that comes first by ID: the same plus
    the root `A` (its children `a…`) and `G3 [r3[40,50], a1[0,10]]`, which
    holds `R` above `A`: exactly the same conflict, `{groups: [G1, G2],
    roots: [R, S], reason: "\"G1\" holds \"R\" above \"S\", \"G2\" holds
    \"S\" above \"R\""}`.
16. **A drop that changes an anchor.** On case 2's manifest,
    `anchorChange(manifest, G1, [r2, r1])` is `would anchor "r2" on "R"
    instead of "r1"`; `[r1, r2]` gives `null`. On case 8's first manifest,
    `G1`'s order `[x1, r1, s1]` gives `null` (a card that anchors nothing
    moves freely).
17. **Setting a block's arrangement.** Block `A` holds case 6's manifest.
    `set {block: A} {arrangement: {direction: "horizontal", order: [G3, G1,
    G2]}}` leaves `arrangement` exactly `{direction: "horizontal", order:
    [G1, G2, G3]}` (the row stored, in the same `set`) and the store's
    journal one entry longer by exactly that command. `{direction:
    "vertical", order: [G2, nope]}` is stored as given, and so is
    `{direction: "vertical", order: [G2, G1, G2]}`: an order may repeat an
    ID, which `itemOrder` takes at its first mention (`[G2, G1, G3]`). `arrangement: null`
    then leaves the block without the member (`Object.hasOwn` false), and
    another `null` is `invalid_value` at `[{block: A}, "arrangement"]`,
    "the command changes nothing". On
    case 13's manifest a horizontal `set` is `arrangement_conflict` at
    `[{block: A}, "arrangement"]` with case 13's reason as its message, the
    view unchanged. Shapes: `{direction: "diagonal", order: []}` is
    `invalid_value` at `[…, "arrangement", "direction"]`, `expected
    "vertical" or "horizontal"`; `{direction: "vertical"}` `missing_member`
    at `[…, "order"]`, "missing member order"; `{direction: "vertical",
    order: [], columns: 2}`
    `unknown_member` at `[…, "columns"]`, "unknown member columns"; `order:
    [1]` `invalid_value` at `[…, "order"]`, "expected a list of item IDs".
18. **A later edit breaks side by side; the state is kept.** After the
    horizontal `set` of item 17, `set {block: A, id: r2} {offset: [5, 1]}`
    is accepted, the block's `arrangement` is unchanged, and `rowOf` of the
    new manifest and the stored order is case 13's conflict, `"G1" and "G2"
    overlap on "R" (5–10 ♩)` with groups `[G1, G2]` and roots `[R]`.
19. **Setting the workspace's arrangement.** `set {} {arrangement:
    {direction: "matrix", columns: 3}}` stores it whole, `{direction:
    "matrix"}` without `columns`, `{direction: "horizontal"}` as given;
    `null` removes the member. `columnsOf` gives 3 for a matrix of 5
    blocks without `columns`, 1 for 0 blocks, 2 where `columns: 2` is
    stated. Refused: `{direction: "vertical", columns: 2}` `invalid_value`
    at `[{}, "arrangement", "columns"]`, "only a matrix has columns";
    `{direction: "matrix", columns: 0}` `non_positive_number`, "the number
    must be positive"; `columns: 2.5` `invalid_value`, "expected a positive
    safe integer"; `{direction: "diagonal"}` `invalid_value` at `[…,
    "direction"]`, `expected "vertical", "horizontal" or "matrix"`.
20. **The file.** A workspace whose block `A` is arranged `{direction:
    "horizontal", order: [G1, G2, G3]}` and whose view is arranged
    `{direction: "matrix", columns: 2}`, built by the store, is written and
    read back equal, and written again byte for byte; its text holds
    `arrangement` at the top and in the block. A workspace without either
    writes no `"arrangement"` anywhere in its text. A file stating
    `"arrangement": null` at the top and in a block reads as a view and a
    block without the member. A block arranged `{direction: "vertical",
    order: [G2, G1, G2]}` is read back with that order as written and
    written again byte for byte (a repeated ID is valid; a reader refuses
    none). A block's `{direction: "vertical", order: [1]}` in a file is
    refused with `invalid_value` at `["blocks", A, "arrangement",
    "order"]`, "expected a list of item IDs".
21. **The journal is the authority.** A file whose view states an
    arrangement its journal never set is refused by `createStore` with
    `JournalMismatchError` at `["arrangement"]`.
22. **An element's editor never arranges.** With the group editor of `G1`
    open on block `A` (case 6's manifest, named "Arranged"), a `set` of the
    block's `arrangement` is `side_effect` at `[{block: A}, "arrangement"]`,
    "the arrangement of bundle 'Arranged' lies outside group 'G1': an
    editor changes only what it edits", and a `set {}` of the workspace's
    at `[{}, "arrangement"]`, "the workspace's arrangement lies outside
    group 'G1': an editor changes only what it edits". In the bundle editor
    of `A` the block's `set` is accepted.
23. **Side by side on the fixture `bundle_arranged_roots`.** The score
    `score` (fraction quarters) holds `exposition`, `development`,
    `recapitulation` at 0, 16, 32 (16 each), the session `session` (float
    seconds) `take_a` at 0.0 and `take_b` at 100.0 (30.0 each); `group_1
    [exposition, take_a]`, `group_2 [development, notes]`, `group_3
    [recapitulation, annotations, take_b]`, `notes` and `annotations`
    roots without children, `page` an ungrouped root. Applied by hand: on
    the score `group_1` anchors 0–16, `group_2` 16–32, `group_3` 32–48;
    on the session `group_1` 0.0–30.0 and `group_3` 100.0–130.0;
    `group_2` hangs on the session not at all (`notes` is a root). `rowOf`
    of the stored `[page, group_3, group_1, group_2]` is exactly the row
    `[page, group_1, group_2, group_3]`, the roots `[score, session]` and
    the anchors in row order, then display order: `{group_1, score,
    exposition, 0, 16}`, `{group_1, session, take_a, 0.0, 30.0}`,
    `{group_2, score, development, 16, 32}`, `{group_3, score,
    recapitulation, 32, 48}`, `{group_3, session, take_b, 100.0, 130.0}`;
    the score's values exact fractions, the session's binary64 numbers
    (the number type of the root's axis; a float on the score or an exact
    value on the session fails the equality). What each part proves, and
    how it fails if its rule broke:
    - the three stretches on the score touch at 16 and 32 (the seams):
      a rule refusing touching stretches returns a conflict instead of a
      row;
    - `group_1` and `group_3` stand apart on the session while touching
      nothing there (a gap, the session passing behind `group_2`) and
      both order `group_1` before `group_3`, as the score does: one root
      touching and another apart give one row, and a rule ordering only
      by the first root, or reading a gap as a conflict, gives another
      result;
    - the stored order puts `group_3` before `group_1` and `group_2`: the
      row reorders them by their stretches, so a row that kept the stored
      order of anchored groups is caught;
    - `page` hangs on nothing and stays first, where it was stored: an
      item hanging on nothing that the row moved (to the end, its drawing
      order) is caught;
    - both groups on two roots hold the score above the session in their
      display order (`annotations` between `recapitulation` and
      `take_b` anchors nothing), so the roots are `[score, session]`;
      their IDs give the same order, so this fixture alone does not tell
      the group rule from the ID order (item 8 does);
    - an anchor is the first member inside the root, its stretch the
      offsets summed and the drawn end: a wrong member, a stretch taken
      from the root, or a root member (`notes`, `annotations`) taken as an
      anchor changes the anchors.
24. **An overlap on the fixture `bundle_arranged_conflict`.** The score
    `score` holds `theme_a` (16 at 0) and `theme_b` (16 at 8), each alone
    in a group named as it, "Theme A" (`group_1`) and "Theme B"
    (`group_2`), the score named "Score": the stretches 0–16 and 8–24
    overlap from the later start 8 to the earlier end 16. `rowOf` of `[]`
    is exactly the conflict `{groups: [group_1, group_2], roots: [score],
    reason: "\"Theme A\" and \"Theme B\" overlap on \"Score\" (8–16 ♩)"}`,
    the reason word for word the drawing specification's example and the
    fixture README's; of the stored `[group_2, group_1]` it is the
    conflict of the pair in that order, `{groups: [group_2, group_1],
    roots: [score], reason: "\"Theme B\" and \"Theme A\" overlap on
    \"Score\" (8–16 ♩)"}`, since an overlap refuses whichever order is
    stored. A rule
    allowing overlaps returns a row; a stretch measured other than from
    the later start to the earlier end, or a reason naming IDs where
    names are given, changes the reason.

## Named MatchStamps (`matchstamps.test.ts`)

A named MatchStamp is `{id, name, alignment_anchors, match_claims}` in its
manifest's `graphical.matchstamps`, each alignment anchor `{id, timestamps,
display}` naming two **match timestamps** (named timestamps with
`matchstamp: true`, at most one per coordinate, a name optional, `display`
by default `["cross_section"]`). Every ID is one of the manifest's. What
must hold: the four commands reach MatchStamps like any other element,
never through a command of their own; naming one writes the match
timestamps it needs, reusing the one a coordinate already has, and turns
`name` on for the middle anchor in the screen order the command gives;
an Update rewrites its anchors, timestamps and claims and keeps what did
not change; removing one takes along exactly the match timestamps no
MatchStamp left names; each is one journal entry that one undo takes back;
and every rule of the manifest's MatchStamps is the schema package's
refusal, never core's own. Every case starts from block `A` holding
`bundles/bundle_matchstamps.yaml` (TimeToShare's fixture): roots `score`
(quarters, fraction, 8), `take_1` (samples, 352800) and `take_2` (samples,
396900); the match timestamps `timestamp_1` (`score` 4), `timestamp_2`
(`take_1` 88200) and `timestamp_3` (`take_2` 99225, "Take 2, bar 2",
`["name", "cross_section"]`); the roots' `origin` and `length`
timestamps `timestamp_4` … `timestamp_9`; `matchstamp_1` "Bar 2,
downbeat (take 1)" with `anchor_1` (`timestamp_1`, `timestamp_2`, `["line",
"name"]`) and the claims `claim_1`, `claim_2`; `matchstamp_2` "Bar 2,
downbeat (take 2)" with `anchor_2` (`timestamp_1`, `timestamp_3`,
`["line"]`) and the claim `claim_3`. Below, `{block: A, id: "x"}` is
written `x`, `TS` is the fixture's timestamps in canonical order, `M1` and
`M2` its two MatchStamps, a coordinate `{timeline, coordinate}` is written
`timeline@value`, and a new match timestamp `match(id, timeline, value)`
is `{id, timeline, coordinate: value, display: ["cross_section"],
matchstamp: true, groupstamp: false}` (no timeline of the fixture lies in
a group).

**Reading.** The fixture holds `M2`'s anchor with its default `display`
`["line"]` stated, `resources` `[]`; `matchstamp_1` resolves to kind
`matchstamp` (index 0, `M1`) and `anchor_2` to kind `anchor` (index 1,
position 0, `M2`'s anchor); their words are `MatchStamp 'Bar 2, downbeat
(take 1)'` and `alignment anchor 'anchor_2'`, and a match timestamp
without a name is worded by its ID (`timestamp 'timestamp_1'`). A part
of a MatchStamp names nothing (`unknown_target`). The label of an
anchor whose `display` lists `name` is drawn and resolves:
`{block: A, id: "anchor_1", part: ["name"]}` is kind `part`, word
`name`, its owner `anchor_1` (index 0, position 0); `anchor_2`'s
`{part: ["name"]}` is not drawn and names nothing (`unknown_target`). A
`style` command selecting `{addresses: [{id: "anchor_1", part:
["name"]}]}` without `blocks` embeds its rule in block `A`, the one block
whose drawing has that label. `manifestIds` holds
`matchstamp_1`, `matchstamp_2`, `anchor_1` and `anchor_2`; of
TimeToShare's table fixture `tables/<version>/manifest.yaml` it holds
`resource_1` and `resource_2`, which resolve to nothing.

**Naming** (`add {into: A, matchstamp: {name, anchors, match_claims}}`):

1. `name` "Bar 4", anchors `[score@[6, 1], take_1@176400]`, `[take_1@176400,
   take_2@198450]`, claims `claim_7`, `claim_8`: one journal entry; the
   timestamps are `TS` with `match("timestamp_10", "score", [6, 1])`,
   `match("timestamp_11", "take_1", 176400)`, `match("timestamp_12",
   "take_2", 198450)` in canonical order (each after the fixture's match
   timestamp of its timeline); the MatchStamps `M1`, `M2` and
   `{id: "matchstamp_3", name: "Bar 4", alignment_anchors: [{id:
   "anchor_3", timestamps: ["timestamp_10", "timestamp_11"], display:
   ["line", "name"]}, {id: "anchor_4", timestamps: ["timestamp_11",
   "timestamp_12"], display: ["line"]}], match_claims: ["claim_7",
   "claim_8"]}`: the middle of two anchors in screen order is the first.
   One undo gives back the view before it.
2. **Reuse.** Anchors `[score@[8, 2], take_2@99225]`: no new timestamp
   (the timestamps are `TS`), the anchor `anchor_3` names `timestamp_1`
   and `timestamp_3`; the value `[8, 2]` is 4 on `score`'s axis. Anchors
   `[score@[0, 1], take_1@0]`, where only the ordinary `origin` timestamps
   lie, give two new match timestamps, `timestamp_10` and `timestamp_11`,
   beside them.
3. **The middle in screen order.** Three anchors `[score@[6, 1],
   take_1@176400]`, `[take_1@176400, take_2@198450]`, `[score@[6, 1],
   take_2@198450]`: the second (`anchor_4`) alone shows the name; with a
   fourth `[score@[6, 1], take_1@200000]` too, the second still.
4. **Refusals of the value**, at `[A, "matchstamp", …]` (the address key
   of `A` first): a member `colour` → `unknown_property` at `["colour"]`;
   no `name`, `anchors` or `match_claims` → `invalid_value` `a new
   MatchStamp needs <member>` at that member; `name` `""` → `invalid_value`
   `a name is a non-empty string` at `["name"]`; `anchors` `[]` →
   `invalid_value` `anchors is a non-empty list of anchors` at
   `["anchors"]`; an anchor of one coordinate → `an anchor is a pair of
   coordinates` at `["anchors", 0]`; a coordinate naming `nope` → `'nope'
   names no timeline of this manifest` at `["anchors", 0, 1, "timeline"]`;
   one without `coordinate` → `a coordinate needs coordinate` at
   `["anchors", 0, 0, "coordinate"]`; `score@[9, 1]` → `invalid_value`
   `the coordinate lies after the end of timeline 'score'` at `["anchors",
   0, 0, "coordinate"]`; `score@6` (a bare number on a fraction axis) →
   `invalid_coordinate` there; the second anchor the first reversed →
   `the anchor is given twice` at `["anchors", 1]`; `match_claims` `["",
   "claim_1"]` → `match_claims is a list of MatchClaim IDs` at
   `["match_claims"]`. Into a timeline: `wrong_target_kind` `nothing of
   kind matchstamp goes into root` at `[score, "matchstamp"]`.
5. **The schema package's refusals**, `schema_violation` with its message
   at `[A, "manifest", …]`: an anchor `[take_1@0, take_1@88200]` →
   `the timestamps of 'anchor_3' both lie on the timeline 'take_1'` at
   `["graphical", "matchstamps", 2, "alignment_anchors", 0, "timestamps",
   1]`; anchors `[score@[6, 1], take_1@176400]`, `[score@[7, 1],
   take_2@198450]` → `the alignment anchors of 'matchstamp_3' are not one
   connected set` at `["graphical", "matchstamps", 2,
   "alignment_anchors"]`; claims `claim_1`, `claim_1` → the schema's
   refusal of a repeated item at `["graphical", "matchstamps", 2,
   "match_claims"]`.

**Update and the other properties** (`set` on `matchstamp_N`; `anchors`
takes pairs in screen order as naming does, `match_claims` a list):

6. `matchstamp_1` given anchors `[take_1@88200, score@[4, 1]]` (anchor_1
   reversed), `[take_1@88200, take_2@99225]` and claims `claim_1`,
   `claim_2`, `claim_4` in one `set`: one journal entry; `anchor_1` kept
   as it was (its order of timestamps, `["line", "name"]`), `anchor_3`
   `["timestamp_2", "timestamp_3"]` with `["line"]`; the timestamps are
   `TS`; the claims as given. Undo gives back the view before it.
7. **An anchor gone takes the name along**: `matchstamp_1` given anchors
   `[score@[4, 1], take_2@99225]`: its one anchor is `anchor_3`
   (`timestamp_1`, `timestamp_3`, `["line", "name"]`), `timestamp_2`,
   which no MatchStamp names any more, is gone; `M2` is unchanged.
8. **A new coordinate**: `matchstamp_2` given anchors `[score@[4, 1],
   take_2@110250]`: `timestamp_3` goes (its name with it), and
   `match("timestamp_10", "take_2", 110250)` comes; the one anchor
   `anchor_3` shows `["line"]` only, as `anchor_2` did not show the name.
9. **No change**: `matchstamp_1` given its own anchor reversed,
   `[take_1@88200, score@[8, 2]]`, is `invalid_value` `the command
   changes nothing` at `[matchstamp_1, "anchors"]`; its own claims at
   `[matchstamp_1, "match_claims"]`.
10. `name` "Downbeat" is stored; `""` is `invalid_value` `a name is a
    non-empty string` at `[matchstamp_1, "name"]`. `id` is
    `id_not_settable`; `colour` `unknown_property` `matchstamp has no
    property colour`; `display` `wrong_target_kind` `display is a property
    of timestamp, elision, anchor, not of matchstamp`.
11. **An anchor's `display`** (`set` on `anchor_N`): `["name", "line"]` on
    `anchor_2` is stored `["line", "name"]`; `[]` is stored; `["flag"]` is
    `invalid_value` `'flag' is no display word` at `[anchor_2,
    "display"]`; `anchor_1`'s own words reordered change nothing.
12. **A match timestamp's name deleted** (`set name` on `timestamp_N`):
    `null` on `timestamp_3` is one journal entry, and the manifest is the
    fixture's with `timestamp_3` `{id: "timestamp_3", timeline: "take_2",
    coordinate: 99225, display: ["name", "cross_section"], matchstamp:
    true}`, no `name` member left (compared strictly, so a member stated
    as absent fails); one undo gives back the view before it, whose
    `timestamp_3` is named "Take 2, bar 2" again. `null` on `timestamp_1`,
    a match timestamp without a name, is `invalid_value` `the command
    changes nothing` at `[timestamp_1, "name"]`; on `timestamp_4`, an
    ordinary timestamp, whose name the schema requires, `invalid_value` `a
    name is a non-empty string` at `[timestamp_4, "name"]`.

**Removing** (`remove`):

13. `matchstamp_1`: the MatchStamps are `M2`; the timestamps `TS` without
    `timestamp_2` (`timestamp_1` stays: `M2` names it). A rule addressing
    `anchor_1` goes with it. One journal entry; undo gives the fixture's
    manifest back.
14. Both MatchStamps: none is left, and neither are `timestamp_1`,
    `timestamp_2`, `timestamp_3`; the six `origin` and `length` timestamps
    stay.
15. **With what they name**: removing the timeline `take_1` removes
    `matchstamp_1` (its anchor named `timestamp_2`) and `anchor_1`, keeps
    `M2` and `timestamp_1`; removing `timestamp_3` removes `matchstamp_2`
    and keeps `M1`.
16. An anchor alone, `anchor_1`, is `not_removable` `an alignment anchor
    goes with its MatchStamp` at `[anchor_1]`.
17. **Resources follow**: of the table fixture's manifest, removing the
    child `clt_2` leaves `resource_1` naming `clt_1`, `dpt_1`, `cpt_1` in
    its order, and `resource_2` (Projections) naming `dpt_1`, `cpt_1` in its order.

**A length leaves match timestamps where they are** (18): after naming
`[score@[8, 1], take_1@352800]` (`timestamp_10`, `timestamp_11`, at both
ends), `set` of `score`'s length to `[10, 1]` moves the `length`
timestamp `timestamp_5` to 10 and leaves `timestamp_10` at 8.

**From a MatchStamp to the comparison** (19): for `M1`,
`matchStampSpec` gives `{anchors: [{coordinates: [score 4, take_1
88200n], carriesName: true}], claims: ["claim_1", "claim_2"]}`, the score
value an exact `Rational` 4.

**A match timestamp on a grouped timeline is a GroupStamp** (20): a new
match timestamp is a groupstamp exactly where its timeline lies in a
group, as any timestamp made above a timeline editor; naming closes the
editors in the way first, so no editor scope applies. On block `A` holding
`bundles/bundle_mixed.yaml` (`group_1` "Performance" holds `score` and
`performance`), naming `{name: "Turn", anchors: [[score@[6, 1],
performance@3.0]], match_claims: ["claim_1"]}` adds exactly, in
canonical order, `match("timestamp_12", "performance", 3.0)` and
`match("timestamp_11", "score", [6, 1])`, each with `groupstamp: true`;
naming "Bar 4" (item 1) in `bundle_matchstamps.yaml`, which has no
groups, adds `timestamp_10`, `timestamp_11`, `timestamp_12`, each with
`groupstamp: false`. A match timestamp a MatchStamp reuses keeps its own
`groupstamp` (the Update and reuse cases above, all `false`).

## Statements (`statements.test.ts`)

TimeToShare puts `statements` (property–value pairs about the thing an
element stands for) and `provenance` (the annotations of those pairs, and
the candidates, pairs annotated but not stated, with who believes each) on the manifest,
on every timeline at any depth and on every region; a manifest file
carrying either holds the JSON-LD `@context` that names the format's terms
and the prefixes its statements use. Core holds no term of the format: of a
manifest's `@context` it keeps only the prefixes the manifest declares
itself (no format term, no catalogue prefix with the same namespace), and
only while its statements use them, and no `@context` where none is left;
the full context is written where a manifest leaves core, for a file or
the schema check. Core keeps both members as given, edits them
only whole, by `set` on the element holding them (the block for the
manifest's own, as `name` is the manifest's), and leaves every rule of them
to the schema package's check of the settled manifest: a refusal is
`schema_violation` with that package's message, at `[<block id>,
"manifest", …]`, the path of the offending value in the manifest. What core
owns, and these tests prove, is the walk of the holders in subject order,
the skeleton the schema package's statement functions run on, the
context core holds and the one a file is given, the pruning of references a
removal leaves, the reading of statements given with an added timeline
where they will lie, the guard's view of what an element outside an editor
states, the warnings, and the user's identity as `stated_by` names it.
Building and changing a pair is the schema package's (`withPair`,
`withCandidate`, `withBelief`, …); these tests give whole members as values.

`L` is the schema package's fixture `statements/layerit_recording.yaml`
(read from the installed package's `fixtures/<version>/statements/`), added
as block `0000000000`. Its roots in canonical order are `clt_6`, `cpt_1`,
`dpt_1` (indices 0, 1, 2); `cpt_2` is `cpt_1`'s child (`["timelines", 1,
"children", 0]`); `group_1` has the members `cpt_2` and `dpt_1`. `cpt_1`'s
provenance entry 3 is the candidate `wdt:P2550` `wd:Q29117946` with
`basis: ["#clt_6", "#dpt_1"]`, believed by nobody; `dpt_1`'s one entry is the candidate
`dcterms:source` `{id: "#cpt_1"}`. `P` below is `["0000000000",
"manifest"]`, `K(x)` the address key of `{block: "0000000000", id: x}`.
`C` is the `@context` of `L`'s file, read from its text: the format's terms
and the catalogue's prefixes its statements use, each with the catalogue's
namespace. `F(view)` is the `@context` of the text `saveManifest` writes of
the block's manifest.

- **(a) The walk.** `statementHolders(L)` yields, in this order, kind, ID
  and path: manifest `null` `[]`; timeline `clt_6` `["timelines", 0]`;
  timeline `cpt_1` `["timelines", 1]`; timeline `cpt_2` `["timelines", 1,
  "children", 0]`; timeline `dpt_1` `["timelines", 2]` (no region in `L`).
  Each holder's `statements` and `provenance` are the element's own
  objects, `undefined` for `cpt_2`, which states nothing; `statementHolder(L,
  "cpt_2")` is that holder, `statementHolder(L, "nope")` `undefined`.
- **(b) The skeleton** of `L` equals one written by hand from the fixture:
  `{"@context": C, id: "layerit_clair_de_lune", statements: L's,
  timelines: [{id: "clt_6", statements, provenance, regions: [], children:
  []}, {id: "cpt_1", statements, provenance, regions: [], children: [{id:
  "cpt_2", regions: [], children: []}]}, {id: "dpt_1", statements,
  provenance, regions: [], children: []}]}`, each member the element's own;
  a second call returns the same object. Its context is the file's, though
  core holds none for `L`: the statement functions expand prefixes with it.
  The schema package's
  `subjectPath(skeleton, "cpt_2")` is `["timelines", 1, "children", 0]`, a
  path of `L`.
- **(c) A statement accepted.** `set` of `cpt_2`'s `statements` to
  `{"wdt:P31": [{id: "wd:Q98069877"}]}` is accepted, stores exactly that,
  holds no `@context` (both prefixes are the catalogue's), `F` is `C`, and
  it adds one journal entry; `undo` gives back the view before it.
- **(d) A value naming no element.** `cpt_2`'s statements
  `{"dcterms:source": [{id: "#nope"}]}` are refused `schema_violation`
  "'#nope' names no element of this manifest" at `[...P, "timelines", 1,
  "children", 0, "statements", "dcterms:source", 0, "id"]`.
- **(e) A prefix neither declared nor catalogued.** `{"foaf:maker": [{id:
  "wd:Q1"}]}` is refused "'foaf:maker': the prefix 'foaf' is not declared in
  @context" at `[...P, "timelines", 1, "children", 0, "statements",
  "foaf:maker"]`: the context the check is given leaves the prefix out, and
  the check refuses the IRI using it.
- **(f) The context follows the statements.** `add` of the region `{id:
  "region_1", start: 0.0, end: 10.0}` into `cpt_1`, then `set` of its
  statements to `{"bf:instanceOf": [{id: "wd:Q29117946"}]}`: the manifest
  holds no `@context` (`bf` is the catalogue's), and `F` is `C` with
  `"bf": "http://id.loc.gov/ontologies/bibframe/"` added; `set` of its
  `statements` to `null`: still no `@context`, `F` is `C` again, and the
  region has no `statements` member.
- **(g) A candidate stated, one belief per actor.** `cpt_1`'s provenance
  with entry 3 (a candidate: its pair is not stated) given the beliefs
  `{actor: "https://orcid.org/0000-0002-1825-0097", belief: "true", date:
  "2026-11-20"}` and the same actor's `"false"` is refused "'<the ORCID
  iD>' already holds belief 0 of this entry; an actor holds one belief" at
  `[...P, "timelines", 1, "provenance", 3, "beliefs", 1, "actor"]`. Both
  members in one change, the candidate's pair stated and entry 3 given the
  one belief `"true"`, are accepted, and so stored.
- **(h) Shapes core reads.** `statements: []` on `cpt_2` is `invalid_value`
  "statements is an object of property–value pairs, or null" at `[K(cpt_2),
  "statements"]`; `provenance: {}` is `invalid_value` "provenance is a list
  of annotations, or null" at `[K(cpt_2), "provenance"]`. `statements: null`
  on `cpt_2`, which states none, is `invalid_value` "the command changes
  nothing". No refusal changes the view.
- **(i) Removal prunes references.** `remove dpt_1`: `cpt_1`'s entry 3 has
  `basis: ["#clt_6"]`, every other member as it was; `group_1`'s members
  are `["cpt_2"]`. `remove cpt_1` (and so `cpt_2`): `dpt_1` has no
  `provenance` member (its one entry's value named `#cpt_1`), its
  `statements` unchanged; `group_1`'s members are `["dpt_1"]`.
- **(j) An editor changes only what its element states.** In `group_1`'s
  editor, `remove dpt_1` is refused `side_effect` "the statements of
  timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin
  Musical' lie outside group 'recording': an editor changes only what it
  edits" at `[K(cpt_1), "statements"]`: the removal would prune `cpt_1`'s
  entry 3, which lies outside the group. In `cpt_2`'s editor, `set` of the
  bundle's `statements` is refused `side_effect` at `[...P, "statements"]`.
  Each refusal leaves the store as it was.
- **(k) An added timeline's statements are read where they will lie.**
  `add` into the block of the root `{id: "cpt_9", unit: "seconds", length:
  null, statements: {"dcterms:source": [{id: "#dpt_1"}]}}` is accepted, the
  root stating exactly that. With `#nope` instead it is refused
  "'#nope' names no element of this manifest" at `[...P, "timelines", 3,
  "statements", "dcterms:source", 0, "id"]`: as every problem of an added
  root, below the place the root takes when it is appended to the block's
  three roots.
- **(l) The user.** `readOrcid` of `"0000-0002-1825-0097"`, of
  `"https://orcid.org/0000-0002-1825-0097"`, of `" orcid.org/0000-0002-1825-0097 "`
  and of `"http://orcid.org/0000-0002-1825-0097"` is
  `"0000-0002-1825-0097"`; of `"0000-0002-1694-233X"` itself; of
  `"0000-0002-1825-0098"` (a wrong check digit) and of `"Clara Wieck"`
  `null`. `statedBy(DEFAULT_USER)` is
  `"tag:timetoalign.github.io,2026:tilie:user:Gerhardt"`, `statedBy({name:
  "Clara Wieck", orcid: null})` `"tag:timetoalign.github.io,2026:tilie:user:Clara%20Wieck"`,
  and with the iD `"https://orcid.org/0000-0002-1825-0097"`.
- **(m) Warnings.** `manifestWarnings(L)` is `[]`: they are read with the
  context a file writes, so a held manifest, which has none, is never
  "without `@context`". The schema package's
  warning case `bundle_blank_statements`, loaded with `loadManifest`, gives
  `[{code: "bundle_blank", path: ["statements"], message: "the manifest has
  statements but no ID; its subject is a blank node"}]`.
- **(n) The context core holds, and a file's back.** `L` loaded has no
  `@context` member, and `saveManifest` of it with the form its file was
  read in (`readManifestFile`) gives the fixture's text back byte for byte,
  `C` included. The fixture `statements/op106_work.yaml` declares the
  prefix `mbw` (`http://musicbrainz.org/work/`), which the catalogue lacks,
  and uses it: core holds exactly `{"mbw": "http://musicbrainz.org/work/"}`
  as its `@context`, and `saveManifest` gives its text back byte for byte.
- **(o) An own prefix, kept while used.** `set` of the block's `manifest` to
  `L` with `@context` `{"@version": 1.1, "wd":
  "http://www.wikidata.org/entity/", "mbw": "http://musicbrainz.org/work/"}`
  and the bundle's statements given `"schema:about": [{id:
  "mbw:4a622b0d-b0c0-405e-b49e-05b70c108284"}]`: core holds `{"mbw":
  "http://musicbrainz.org/work/"}` (the format term and the catalogue's
  `wd` with the catalogue's namespace dropped), and `F` is `C` with `mbw`
  added. `set` of the bundle's `statements` back to `L`'s: no statement uses
  `mbw`, the manifest holds no `@context`, and `F` is `C`.

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
   of entries replayed and the first differing path: the name, then the
   workspace's `graphical`, then blocks by id, then a block's members: a
   block moved to 99 is entry 3 at `["blocks", A, "x"]`; a `graphical`
   with one rule the journal never set is entry 3 at
   `["graphical"]`; the same view with an empty journal is entry 0 at
   `["blocks", A]`. The settings are never compared: the same view with a
   grid of 16 opens, and its store holds that grid. A journal entry the commands refuse (a move of a block that does
   not exist) is that entry, 1, at `["journal", 1]`.

## Workspace settings (`settings.test.ts`)

The settings (`grid`, `blockDefaults`, `granularity`, `manifests`,
`matchClaimFilters`) say how the editor is used, not what the workspace
holds, so they live outside the journal: `store.configure(change)` changes
them, where `change` names any of the five members. The first three are
merged member by member: `change` names any of their own members
(`{blockDefaults: {length: 600}}` keeps the other placement defaults,
`{granularity: {decimals: 6}}` keeps the denominator). `manifests` and
`matchClaimFilters` are merged block by block, each entry a change names
replacing that block's entry whole (items 7 and 8). The proof is that the journal and the undo history
cannot see them, and that nothing the journal replays depends on them. The
store under test holds three journalled commands (the `add` of block `A`
holding `bare.yaml`, two moves of `A`) and an injected clock.

1. **Outside the journal.** `configure({grid: {size: 16, snap: false}})`
   returns `null`; the journal still holds 3 entries (the same objects),
   `view.settings.grid` is exactly `{size: 16, snap: false}`, the view is a
   new object (the editor's dirty mark is `view !== savedView`), the
   listener hears it once, and the clock is not read. `undo()` then undoes
   the third journalled command (`A` back at its first move's `x`) and
   leaves `grid` at `{size: 16, snap: false}`; so does `redo()`, and so
   does Cancel of an editor opened before the change: a setting is never
   undone.
2. **Identity says what changed.** A member the change leaves as it was
   stays the same object: `configure({grid: {size: 16}})` gives a new
   `grid` and keeps `blockDefaults` and `granularity`; a following
   `configure({granularity: {decimals: 6}})` keeps that `grid` and gives a
   new `granularity`, exactly `{denominator: 2520, decimals: 6}` (a reader
   holding a value read under one granularity tells by identity alone that
   it changed).
3. **The workspace's `graphical` is journalled.** A `set` of the workspace
   `graphical` with one rule adds a 4th entry and leaves the settings
   the same object; `undo()` restores the previous `graphical` exactly
   (`{}`), `redo()` the rule.
4. **Replay reads no setting.** `add` of block `a` under
   `blockDefaults.length` 400, `configure({blockDefaults: {length: 600}})`,
   `add` of block `b`: the journal's two `add` entries carry every
   placement member explicitly, `a` `{scale: 1, length: 400, spacing: 8,
   margin: 0, width: null, height: null}`, `b` the same with `length` 600;
   replaying the journal from the empty workspace (whose defaults are 400)
   reproduces both blocks exactly, and `createStore` over the snapshot
   opens. The journalled `add` of `a` applied to a view whose block
   defaults are all different (`{scale: 3, length: 999, spacing: 1,
   margin: 5, width: 50, height: 60}`) gives exactly the store's `a`, so a
   replay reads no setting whatever the defaults; the same `add` leaving
   its placement out, applied outside the store (as a preview of where a
   new block will lie is), takes those defaults. A member the command
   states is kept (`scale: 2` stays 2).
5. **Refused changes.** `configure` checks the merged settings as the file
   reader does and refuses the first problem, leaving the settings, the
   view and the listeners untouched: `grid.size` 0 → `non_positive_number`
   at `["settings", "grid", "size"]`; `granularity.denominator` 1.5 and
   2^53 → `invalid_value` (a positive safe integer), 0 →
   `non_positive_number`, each at `["settings", "granularity",
   "denominator"]`; `granularity.decimals` −1, 16 and 1.5 →
   `invalid_value` at `["settings", "granularity", "decimals"]` (an
   integer from 0 to 15); 0 and 15 are accepted. A
   change to the values already held returns `null`, keeps the view the
   same object and calls no listener.
6. **Inside an editor.** With an editor open, `configure` is accepted
   (no side effect on any element is possible) and the session's entries
   are unchanged.
7. **How each block's manifest is written** (`manifests`, by block ID,
   each entry `{minimal, styling, serialization}` whole). A new workspace
   holds `{}`, and `manifestFileOf(settings, A)` for a block without an
   entry is `NEW_MANIFEST_FILE`, `{minimal: true, styling: true,
   serialization: "yaml"}`. `configure({manifests: {[A]: {minimal: false,
   styling: false, serialization: "json"}}})` returns `null`, journals
   nothing, and `manifestFileOf` then gives that entry for `A` and still
   `NEW_MANIFEST_FILE` for `B`; a second `configure` naming only `B` keeps
   `A`'s entry as it was. Undo of the `add` of `A` keeps `A`'s
   entry (the journal may bring the block back, as redo does). Refused,
   leaving the settings as they were: an entry's `serialization` `"toml"`
   → `invalid_value` at `["settings", "manifests", A, "serialization"]`;
   `minimal` `"yes"` → `invalid_value` at `["settings", "manifests", A,
   "minimal"]`; a key that is no block ID, `"A"` → `invalid_block_id` at
   `["settings", "manifests", "A"]`.
   **Where the manifest's file lies** (`location`, optional): the path of
   the file, POSIX and relative to the workspace file's folder (a setting
   of the workspace, never a manifest key). The entry `{"minimal": true,
   "serialization": "yaml", "styling": true, "location":
   "../story/step1.yaml"}` configured for `A` is held exactly so,
   `manifestFileOf` gives it, and the workspace file written from it holds
   exactly that object under `settings.manifests[A]` and reads back equal,
   writing the same text again; an entry without `location` is held and
   written without the member (no `null`, no empty string). A workspace
   file the editor wrote before locations, `data/before-locations.tle.json`
   (one block `block00001`, whose manifest holds no timeline, its `add`
   in the journal, and its entry
   `{minimal: true, serialization: "yaml", styling: true}`), reads with no
   problem and keeps its entry unchanged. Refused, leaving the settings
   as they were, `invalid_value` at `["settings", "manifests", A,
   "location"]`: `""` (a location is never empty), `"/home/x.yaml"` (no
   absolute path), `"file:x.yaml"` and `"C:\\x.yaml"` (no scheme or drive),
   `"a\\b.yaml"` (a POSIX path, so no backslash) and `5` (a string).
8. **Which MatchClaims a block shows** (`matchClaimFilters`, by block ID,
   each entry `{timelines, beliefs}` whole; the MatchClaim table itself is
   never a setting). A new workspace holds `{}`, and
   `matchClaimFilterOf(settings, A)` for a block without an entry is
   `DEFAULT_MATCH_CLAIM_FILTER`, `{timelines: null, beliefs: ["true",
   "undecided", "unlikely"]}` (every timeline; every belief state but
   false). `configure({matchClaimFilters: {[A]: {timelines: ["take_1",
   "score"], beliefs: ["false", "true"]}}})` returns `null`, journals
   nothing, and `matchClaimFilterOf` then gives `{timelines: ["score",
   "take_1"], beliefs: ["true", "false"]}` for `A` (the timelines held by
   code point, the states in the order of `BELIEF_STATES`) and still the
   default for `B`; a second `configure` naming only `B` keeps `A`'s entry
   as it was, and one giving `A`'s timelines as `["score", "take_1"]` and
   its states as `["true", "false"]` keeps the settings the same object
   (no change); `beliefs` `[]` is accepted (no state kept). Refused,
   leaving the settings as they were: `beliefs` `["maybe"]` →
   `invalid_value` `expected a belief state ("true", "undecided",
   "unlikely", "false")` at `["settings", "matchClaimFilters", A,
   "beliefs", 0]`; `beliefs` `"true"` → `invalid_value` `expected a list of
   belief states` at `[…, A, "beliefs"]`; `beliefs` `["true", "true"]` →
   `invalid_value` `'true' is listed twice` at `[…, A, "beliefs", 1]`;
   `timelines` `"score"` → `invalid_value` `expected null or a list of
   timeline IDs` at `[…, A, "timelines"]`; `timelines` `["score",
   "score"]` → `invalid_value` `'score' is listed twice` at `[…, A,
   "timelines", 1]`; an entry without `beliefs` → `missing_member` at
   `[…, A, "beliefs"]`; a key `"A"` → `invalid_block_id` at `["settings",
   "matchClaimFilters", "A"]`.

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

The cases run on block `bundle0001` holding `bundles/bundle_mixed.yaml`,
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
   (`map.yaml`) → `no_editor` "<address> has no editor" at `[<address>]`;
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
edits` ("lie" where `<what>` names several things: the statements of an
element, the manifest's `statements`, the graphical `rules` or `styles`),
or nothing. Its rules are checked in a fixed order and the first hit
decides the path, so each rule is proved once by its path, and the order by
changes that hit several rules at once. The manifest is compared on a
projection that hides the edited element's own object (a group's object and
each member's), the entries of `graphical.order` keyed by what it contains
(the group's display order, the band orders of the timelines it holds), and
the rules and styles that reach only inside; a test that changes
exactly one hidden thing must be accepted and one that changes exactly one
visible thing must be refused at that thing's address. An element the
target contains before and that no longer exists after is removed inside
the target, never a difference. A refusal and an acceptance are asserted
as the whole result. Given the command's change set, the guard compares
only the workspace's own members and the blocks it touched, and projects no manifest whose
written paths all lie inside the target with none reaching past it, or
that is the same object. A table of commands (the workspace's
`graphical`, other blocks,
renames, band and display orders, a group's place from a member's editor,
an offset, each inside and outside) gives the same result with the change
set and without it; a `NaN` in an outside `meta`, which only a projection
reads, is accepted with it and throws without it.

Block `bundle0001` holds `bundles/bundle_mixed.yaml`; `R`, `E` and `D`
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

1. **A group.** Over `bundle_mixed.yaml`'s enumeration, `group_2` contains
   exactly, in enumeration order: its frame `{id: "group_2"}` and title
   `{id: "group_2", part: ["name"]}`; for each member in display order its
   card (`{id, part: ["card"]}`), its line, name and five bands with
   everything they hold (`cmap_4` in `page`'s, `cmap_6` in `excerpt`'s, the
   wedges and coordinate labels of its `origin` and `length` in each
   markers band, `timestamp_5`, `timestamp_6` of `page` and `timestamp_3`,
   `timestamp_4` of `excerpt`, the latter two groupstamps, each followed by
   its line, and in `page`'s markers band also their secondary
   coordinates, which carry their timestamps' addresses and so belong to
   `excerpt`), and for `excerpt` no mark of its start or end on its
   ancestor line, never that line `{id: "recording"}` or its name, but the
   secondary coordinates of `excerpt`'s `timestamp_3` and `timestamp_4` on
   it (wedge and coordinate label each, and in the ancestor card's
   `recording` markers band after `excerpt`'s row, which `group_2`
   contains too); last the lines of `timestamp_3` and `timestamp_4` across
   the frame. A band belongs to its timeline, so a member's five bands are
   in, empty ones too. `group_1` contains neither `{id: "group_2"}` nor
   `{id: "annotations", part: ["card"]}`.
2. **A root holding a member.** `recording` contains exactly the elements
   of the ancestor card, the secondary coordinates of `excerpt`'s
   groupstamps on `page`, and the elements of `excerpt`'s card: its card,
   `{id: "recording"}`, its name, the secondary coordinates on that line,
   `{id: "excerpt"}`, its name, and the bands of `excerpt` with what they
   hold, then the groupstamps' lines across the frame, as in 1.
3. **A child.** `excerpt` contains exactly 2's list without `recording`'s
   own elements (its card, both its lines, their names, its bands, its map
   `cmap_5`). The ancestor's own map `cmap_5` and its band `{id:
   "recording", facet: "regions"}` lie outside it: `excerpt` contains
   neither and `recording` both. That map is not drawn in `excerpt`'s card
   (drawing.md §8.3), so the enumeration cannot show it; the second answer
   proves that the first is the boundary's, not that of an address
   `contains` does not know.
4. **Entries belong to the timeline holding them.** In `map.yaml`,
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
    `["bundle0001", "manifest", "graphical", "rules"]`; the same with
    `select: {addresses: [{id: "score"}]}` → nothing.

**Each rule's path, once:**

12. **The workspace's own members.** Its `graphical` replaced by one with
    a rule `{select: {element: "timeline"}, set: {stroke:
    "#FF0000"}}` → at `[{}, "graphical"]`, message `the workspace's
    graphical lies outside …`, in `G1`'s editor and in the bundle editor
    alike. The settings are no part of a view a command changes, so an
    `after` differing from `before` only in its `grid` → nothing.
13. **Another block.** With a second block `0000000000` holding
    `bare.yaml`: `set {block: "0000000000"} x 50`, `add` of block
    `0000000001` (`bare.yaml`) and `remove {block: "0000000000"}` → at the
    blocks' addresses `[{block: "0000000000"}]`, `[{block: "0000000001"}]`,
    `[{block: "0000000000"}]`, message `the anonymous bundle lies outside
    …` (`bare.yaml` has neither name nor id);
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
    "#00FF00"` (the rule unchanged) → at `["bundle0001", "manifest",
    "graphical", "styles"]`; with `select: {addresses: [{id: "score"}]}` for both, the
    style is used only by an inside rule → nothing.
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
    not at the rules (the manifest).
20. One `after` with the workspace's `graphical` replaced (12), the
    block's `length` 500, `places` `{group_2: {x: 10}}` and the name of
    `annotations` "A" → at `[{}, "graphical"]`; without the `graphical` →
    at `["bundle0001",
    "length"]`; without the length too → at `[group_2]`; with
    the name alone → at `[annotations]`.

**Rules, inside and outside:**

21. **Inside in both manifests.** A rule lies inside a container when
    every element it matches in each manifest compared is contained there.
    With `after`'s manifest built with `group_1`'s members `[performance]`
    (its display order removed), `{select: {addresses: [{id: "score"}]}}` is inside
    `group_1` judged on `before` alone and outside judged on both;
    `{select: {element: "timeline"}}` is outside on `before`; `{select:
    {addresses: [{id: "nothing"}]}}` matches nothing and is inside. The guard refuses
    such an `after` already at `[score]`, since `score`'s
    object is hidden only while it is a member: a rule can move across
    the boundary only with a change the projection shows, so this rule is
    tested on its own, without a command.
22. **Rules selecting bands.** A band belongs to its timeline, so a
    rule lies inside when every band it matches belongs to a timeline
    the editor holds. `style {select: {addresses: [{id: "excerpt", facet:
    "regions"}]}, set: {display: "inline"}}` → nothing in the editors of `excerpt`
    and `recording`, and at `["bundle0001", "manifest",
    "graphical", "rules"]` in the editor of `score`; `style
    {select: {element: "band", facet: "regions"}, set: {display:
    "inline"}}`, which matches the regions band of every timeline, → at the
    rules in `G1`'s editor and nothing in the bundle editor.

**Editors of a timeline and of the bundle:**

23. **A child's editor.** In the editor of `excerpt`, `set
    recording name "R"` → at `[recording]`; `set excerpt name
    "E"` → nothing.
24. **The bundle editor.** In the editor of `bundle0001`, `set annotations
    name "A"`, `set bundle0001 length 500`, the `style` of 11, and `places`
    replaced by `{group_2: {x: 10}}` each → nothing; only the workspace
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

`writeWorkspace(workspace)` is TimeToShare's `dumps` in pretty JSON (keys sorted) of
`{meta, name, settings, graphical, blocks, journal, sessions}`, format
version 7 (since the settings left the journal and the workspace's default
rules left the settings for the top-level `graphical`, which a
version-6 file lacks);
`readWorkspace(text)` reads with TimeToShare's `parseJson` (lossless) and
returns a `Workspace` or a `LoadError`. An entry is exactly `{command,
author, time}` or `{session, author, time}` (chosen by the presence of
`session`); a session is exactly `{target, entries}`, its target an
address object as `readAddress` reads it (so are the addresses of the
commands its entries and the journal's hold), its entries entries, at least one (Done never closes a session
without entries); a session id is ten characters of `0-9a-z`, as a key of
`sessions` and in an entry. Every session is reached exactly once from
`journal` through session entries.

1. **Round trip.** A workspace built by a store (blocks of `bare.yaml` and
   `map.yaml`, a move, a style, an undone command excluded, the workspace's
   `graphical` set to one rule, the grid configured to `{size: 16,
   snap: false}`, the granularity's denominator to 5 and the manifest file
   of block `A` to `{minimal: false, styling: false, serialization:
   "json"}`, its MatchClaim filter to `{timelines: ["melody"], beliefs:
   ["true"]}`) is written; the text read back deep-equals the workspace, and writing it
   again gives the same bytes. Its members are exactly `blocks`,
   `graphical`, `journal`, `meta`, `name`, `sessions`, `settings`;
   `settings`' members are exactly `blockDefaults`, `granularity`, `grid`,
   `manifests`, `matchClaimFilters`, the granularity exactly `{denominator: 5, decimals: 3}`,
   `manifests` exactly `{[A]: {minimal: false, serialization: "json",
   styling: false}}`, `matchClaimFilters` exactly `{[A]: {beliefs: ["true"],
   timelines: ["melody"]}}`;
   `meta` is exactly `{format: "tilie-workspace", version: 7}`; `name` is
   `untitled`; `sessions` is `{}`.
2. **Replay.** Replaying the read journal from `createView()` gives exactly
   the read `graphical` and `blocks`; its settings are the defaults, the
   read ones are the file's.
3. **Refusals**, each exactly one problem `{code, path}`: text `{` →
   `invalid_json` at `[]`; `format: "other"` → `unsupported_format` at
   `["meta", "format"]`; `version: 8` → `unsupported_version` at `["meta",
   "version"]`; no top-level `graphical` → `missing_member` at
   `["graphical"]`; `settings.graphical` → `unknown_member` at
   `["settings", "graphical"]`; a block without `margin` → `missing_member` at `["blocks",
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
4. **A granularity of another shape reads as the default.** One of the two
   lenient members (`granularity`, `manifests`, `matchClaimFilters`): settings lie outside the
   journal, so a granularity the reader cannot read loses nothing a replay
   needs. The round trip's text
   with `settings.granularity` removed, replaced by the shape an earlier
   editor wrote (`{fraction: {denominator: 5, refine: true}, float: {step:
   "1", refine: true}, int: {step: 1, refine: true}}`), by `{denominator:
   0, decimals: 3}`, by `{denominator: 5, decimals: 16}`, by `{denominator:
   5}` or by `{denominator: 5, decimals: 3, refine: true}` each reads
   without a problem, its granularity exactly `{denominator: 2520,
   decimals: 3}` and every other member as in the round trip; writing it
   again writes that granularity. **The manifest files likewise**: the
   text with `settings.manifests` removed (a file written before the editor
   kept them), or replaced by `[]` or by `{[A]: {minimal: "yes"}}`, reads
   without a problem, with `manifests` exactly `{}`. Only the entries that
   do not read are left out: `{[A]: <A's entry>, [B]: {minimal: "yes"},
   "A": <A's entry>}` reads with `manifests` exactly `{[A]: <A's entry>}`.
   **The MatchClaim filters likewise**: the text with
   `settings.matchClaimFilters` removed (a file written before the editor
   kept them), or replaced by `[]`, reads with `matchClaimFilters` exactly
   `{}`; `{[A]: <A's entry>, [B]: {timelines: null, beliefs: ["maybe"]}}`
   reads with exactly `{[A]: <A's entry>}`, and so does an entry written
   in the filter's former shape, `{timelines: null, belief: "not_false"}`
   (left out, so the block takes the default filter).
   The reader is lenient on these three members only: a `grid.size` of 0 in
   the same file is still `non_positive_number` at `["settings", "grid",
   "size"]`.
5. **Version 4.** A version-4 file (the round trip's text with `version:
   4` and its commands' addresses written as that format wrote them,
   strings: the `add`s `into: "workspace"`, each `set` aimed at the bare
   block id, or at `"workspace"`) is refused for its version alone: exactly one problem,
   `unsupported_version` at `["meta", "version"]`, message `workspace
   version 4 is not supported; this editor reads version 7 only`. There is
   no migration. **Version 5** likewise: the round trip's text with
   `version: 5` and every block's and the block defaults' `margin` removed,
   as that format wrote them, is refused with exactly one problem,
   `unsupported_version` at `["meta", "version"]`, message `workspace
   version 5 is not supported; this editor reads version 7 only`. **Version
   6** likewise: the round trip's text written as that format wrote it
   (`version: 6`, no `granularity`, the workspace's `graphical` inside
   `settings`) is refused for its version alone, message `workspace version
   6 is not supported; this editor reads version 7 only`.
6. **Sessions in the file.** On the text of a workspace whose journal is
   the `add` of block `A` holding `bundles/bundle_mixed.yaml` and one entry
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
   `bundles/bundle_mixed.yaml` with `set {block: A, id: "group_1"} place
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
   bundle: an editor changes only what it edits` (`bare.yaml` has neither
   name nor id).
4. **Names in a manifest**, on `bundles/bundle_mixed.yaml` in block `A`
   (the manifest named `Mixed`): `set {target: {block: A}, values: {name:
   "Op. 35"}}` leaves the manifest's `name` `Op. 35`, the rest of the
   manifest equal; `null` leaves it `null`. `set {block: A, id: "group_1"}
   {name: "Duo"}` leaves `group_1` named `Duo` and every other member of it
   and of the manifest equal; `null` leaves it `null`; `3` is
   `invalid_value` at `[{block: A, id: "group_1"}, "name"]`. On
   `map.yaml`, `set {block: A, id: "tempo"} {name: "Beat"}` stores
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

1. **Apply.** On `bundles/bundle_mixed.yaml` in block `A`, the manifest
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
3. **The id is free in the manifest.** On `bundle_mixed.yaml` with a root
   `dgt_1` (pixels, 10) added first, the segment of `page` is `dgt_2`. An
   `id` under `meta` is no ID of the manifest: `page` applied as a segment
   line with `meta: {id: "dgt_1", note: {id: "dgt_2"}}` gains `dgt_1`.
4. **Unknown length.** On a root `open` of unknown length (quarters)
   added to `bare.yaml`'s block, `set {block: A, id: "open"} {is_segment_line: true}`
   leaves `open` a segment line without children, its length `null`.
5. **Turning it off.** The schema lets a timeline that is no segment line
   hold any children within its length, so turning the flag off keeps the
   segments as children. On `segment_line.yaml`, `set {block: A, id: "form"}
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
   `bundle_mixed.yaml`, the member `performance` (unlocked) turned on holds
   `locked: true`, turned off again `locked: false`, its segment `cpt_1`
   unlocked; the same for a child `c` (quarters, `[0, 1]`, `[4, 1]`, no
   `locked` stated) added into `bare.yaml`'s root. The root `form`, no
   child and no member, set `locked: true` and then turned off keeps
   `locked: true`.
6. **Adding a segment line.** `add {into: {block: A, id: "bare"}, child: {id: "sl", unit:
   "quarters", offset: [0, 1], length: [4, 1], is_segment_line: true}}`
   into `bare.yaml`'s root adds `sl` holding the segment `clt_1` from `[0,
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
itself, an unknown id), `groups` (one group, every group, none, an unknown
id, an id twice, a number, a bare id)
and `add` of a root timeline or a group (fresh or taken ids, members
existing or not), so a reshaped manifest still saves, reloads and replays;
and the named timestamps: an `add` of one into a timeline or elsewhere
(its coordinate drawn like any other, an empty name, a missing coordinate,
an `id` given, a `display` in any order, with an unknown or repeated
word), a `set` of its `name`, `coordinate`, `display` or `timeline`, and
its `remove`, on the manifest's timestamps and an unknown one.
Each manifest fixture starts as block `A` beside a block `B` of
`bare.yaml`, in a store with an injected clock, for ten sequences.

1. After every accepted command the view check finds nothing, and every
   block's manifest saves and reloads deep-equal with identical text.
2. A refused command leaves the view the same object.
3. Undoing every entry restores every intermediate view (the same objects),
   and redoing every entry restores them again.
4. Replaying the journal from `createView()` gives `graphical` and `blocks`
   deep-equal to the store's.
5. Every entry carries the author and the injected clock's time.
6. `writeWorkspace(readWorkspace(text))` equals `text` byte for byte, and the
   read workspace deep-equals the store's.
7. The generator reaches every refusal the commands produce on these
   targets: over a fixed sample (seed `20261011`, 150 sequences per fixture)
   the set of codes observed is exactly `child_exceeds_parent`, `cycle`, `duplicate_id`, `duplicate_index`,
   `elision_exceeds_length`, `id_not_settable`, `invalid_address`, `invalid_coordinate`,
   `invalid_index`, `invalid_order`, `invalid_value`,
   `length_below_content`, `locked`, `negative_child_offset`,
   `nested_member`, `non_finite_number`, `non_positive_number`, `not_an_item`, `not_removable`,
   `region_end_before_start`, `schema_violation` (which also covers a unit
   given a number type it does not admit),
   `segment_end_fixed`, `segment_never_locked`, `segment_not_removable`,
   `segment_structure`, `timestamp_exceeds_length`, `unit_mismatch`, `unknown_property`,
   `unknown_target`, `unlocking_not_supported`, `wrong_target_kind`.
   `unlocking_not_supported` is reached in
   `bundles/bundle_shared_parent.yaml`, whose `exposition` and
   `recapitulation` are segment lines that are children of `score` and
   group members, locked by their place. The sample runs in one test,
   measured at 9.8 to 10.7 s at a load average of 6, with an explicit
   timeout of 32 s, about three times the slowest measurement (10.6 s with
   the named timestamps' commands among the kinds). The refusals
   of the store's editors (`no_editor`, `not_inside`, `side_effect`) are
   pinned by the session and guard tests. `timestamp_exceeds_length` is
   reached since the fixtures' roots carry their `origin` and `length`
   timestamps: a length set below a timestamp that is not at the end.
   `elision_exceeds_length` is reached over
   `bundles/bundle_elisions_stored.yaml`, whose stored elisions end inside
   their timelines: a length set below an elision's end that is not at the
   old end.

**Editing sequences.** The same fixtures, in the same store, run sequences
of up to 30 steps, ten per fixture, each step a seed with an operation: a
command, opening an editor, a reopen (the target of the latest session of
the innermost level, so the reopen rule unfolds it), a whole session (open,
one or two commands, Done), an unfold (reopen, undo until nothing is left to
undo or one step, Done), Done, Cancel, undo and redo. A command in an open
editor is mostly one that stays inside it (a name or a band order of a
timeline it holds, its place's `x`, `scale`, `spacing`, `margin` or `width`, a group's
display order, for a member its group's `length` and `scale`, the block's
width, the name of a named timestamp lying on a timeline it holds, or a
named timestamp added to such a timeline), sometimes any generated command, so the guard both accepts and
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

## Conversion maps (`maps.test.ts`)

`compileMap(map, {knots?})` turns one conversion map of a manifest into a
function of a position on its source axis; `express(result, targetUnit)`
writes a result on the map's target axis. The contract is parity with
timetoalign: for every map and every input, the value timetoalign gives
when the map is called on that input, with the same number type. A
position is passed as Python holds it: a `bigint` is an int, a `Rational`
a Fraction, a `number` a float.

1. **Parity table, generated by the library.** `parity/emit_maps.py` (run
   with a Python where timetoalign is installed, then formatted by Biome:
   `pnpm exec biome format --write packages/core/tests/parity/maps.json` in
   `app/`) writes `parity/maps.json`: one manifest whose roots (a quarters,
   a ticks and a seconds timeline) carry maps of all ten types, its
   MeasureMap's expanded rows in the form the server's measure-maps route
   answers, and for each map a list of inputs, each with timetoalign's
   result: the map read by `ConversionMap.from_dict`, then called on the
   input, which writes a number on its target axis in the unit's number
   type. A result is recorded as its kind and value: `int` (the integer),
   `float` (the double, written as Python's `repr`, so it reads back
   bit for bit), `fraction` (the `[numerator, denominator]` pair), `string`,
   `record` (the measure's `ID` and `count`), `outputs` (each named output,
   recorded the same way), or `null` where timetoalign raises. The test
   loads the manifest through `loadManifest`, compiles every map with the
   recorded rows as `knots`, and requires for every input the same kind and
   the same value (`Object.is` for a double), `undefined` for `null`. The
   cases are chosen so that each proves one rule:
   - **Parameters read by their JSON form**: an integer is an int, `0.5`
     and `2.0` are floats, a pair is a Fraction.
   - **Python's numeric tower**: `165375/8·x + 507150` stays exact on exact
     input and is rounded once, half to even, onto `samples`; a float
     scalar or a float input makes the whole result a float.
   - **TableMap's two paths**: with an exact input and exact anchors,
     `linear` interpolates and extrapolates in Fractions (`[0, 4] → [0, 2]`
     gives 1/6 at 1/3, 5/2 at 5); every other combination runs on doubles,
     as numpy's `interp`, including an input whose double equals an exact
     anchor's double (`0.3333333333333333` against the anchor 1/3 reads
     that anchor's value); `previous` answers the stored anchor value;
     `extrapolate` `none` (undefined), `constant` (the end anchor's stored
     value) and `linear` (the end segment on doubles outside the anchors
     for `previous`). A TableMap whose distinct exact anchors share one
     double is refused by timetoalign, so every input is undefined.
   - **PiecewiseMap**: the intervals are half-open and chosen on doubles,
     as timetoalign chooses them; the piece is evaluated on the input as
     given; below the first or at and beyond the last break is undefined.
   - **ChainMap** passes each raw result on, never rounded between maps:
     1/960 quarters through ticks (480 per quarter) and back is 1/960.
   - **CombinationMap** answers each output raw, keyed by its name.
   - **ConstantMap**: a string, an exact number expressed on its target
     unit, a number without a target unit as written.
   - **The measure views** over a MeasureMap with an anacrusis (rows: 3/4
     with an actual length of 1/2 at an offset of 5/2, then 3/4, 2/4,
     2/4): the measure holding a position is the last whose qstamp is at
     or before it, the first before them all; `MeasureNumberMap` answers an
     int, `MeasureBeatMap` the number and the exact beat (a float position
     read as its exact value), `FloatingMeasureMap` the floating measure
     truncated to three decimals (0.833 at 0, 50.25 at 100).
2. **Hand values** (the parity table's arithmetic, stated without the
   library): the PiecewiseMap with breaks 0, 4, 16 and the pieces `1/2·x`
   and `3/5·x − 2/5` (both exact LinearMaps, quarters to seconds) gives at
   6 the exact 16/5, expressed on seconds as the float `3.2`; at 31/8 the
   float `1.9375`; at 16 `undefined`. The LinearMap `165375/8·x + 507150`
   (quarters to samples) gives at 1/3 the exact 4112325/8, expressed as the
   int 514041. Half to even onto `samples`: 5/2 → 2, 7/2 → 4, −5/2 → −2,
   the float 2.5 → 2.
3. **Expressing a result.** Onto a `fraction` unit a float becomes its
   exact binary value (0.1 is 3602879701896397/36028797018963968), onto a
   `float` unit an exact value the nearest double (1/3 is
   0.3333333333333333); an infinite float onto an int or fraction unit is
   `undefined`, as timetoalign raises. A result without a target unit keeps
   its kind (an int, a Fraction, a float), and so does each named output; a
   string and a record pass unchanged whatever the target unit.
4. **Compiled once per map object.** Compiling one map object twice with
   the same rows gives the same evaluator (`toBe`); a copy equal in every
   member gives another evaluator, as do the same map with another rows
   list: the memo is keyed by objects, never by values.
5. **Without the rows.** A measure view compiled without `knots`, or with
   rows that lack its MeasureMap, says it is missing them (`missingKnots`
   true) and is `undefined` at every position, as is a ChainMap holding
   one; a LinearMap misses nothing. With the rows it evaluates.
6. **Outputs one by one.** A CombinationMap's evaluator lists one
   evaluator per output, in the manifest's key order, each with its own
   target unit, so each output can be expressed on its own axis.

## Picking a value (`grid.test.ts`)

`snapValue(value, reach, numberType, granularity)` is the one rule by
which a pointer picks a value on any axis, a position on a line or the
value of a map there: `value` is where the pointer is, `reach` half a
device pixel measured on the same axis, both exact (a pointer's doubles
enter by their exact values). It is the simplest value within `reach` of
`value`, never finer than the granularity: a fraction axis tries `k/d` for
each divisor `d` of the denominator in ascending order (`k` the nearest
integer to `value·d`, a tie going up), a float axis `value` rounded to 0,
1, …, `decimals` places (a tie going up), an int axis the nearest multiple
of `10^m` from the largest power of ten not above `2·reach` (at least 1)
down to 1; the first candidate within reach wins, and where none is, the
finest (the nearest multiple of `1/denominator`, `decimals` places, the
nearest integer). Holding a value to a span is a separate step,
`clampValue(value, start, end)`. Below, `value` and `reach` are the exact
values of the doubles written, so the expected values follow by hand from
the decimals (none lies near a boundary, where the double's exact value
would decide). Granularity `{denominator: 2520, decimals: 3}` unless
stated.

1. **The worked example (fraction).** `value = 0.7499`, `reach = 0.01`:
   `d = 1` gives 1 (|1 − 0.7499| = 0.2501 > reach), `d = 2` gives 1/2
   (0.2499), `d = 3` gives 2/3 (2.2497 rounds to 2; 0.08323), `d = 4`
   gives 3/4 (2.9996 rounds to 3; 0.0001 ≤ reach): **3/4**. With `reach =
   0.00001` every divisor misses: every candidate is a multiple of 1/2520,
   and the nearest of them, 1890/2520 = 3/4, lies 0.0001 away; so the
   fallback, 1890/2520 = **3/4**.
2. **Divisors in ascending order.** `value = 0.1`, `reach = 0.02`: `d` =
   1, 2, 3, 4 give 0 (0.1 away), `d = 5` gives 1/5 (0.5 ties up; 0.1), `d
   = 6` 1/6 (0.0667), `d = 7` 1/7 (0.0429), `d = 8` 1/8 (0.025), `d = 9`
   1/9 (0.0111 ≤ reach): **1/9**, before 1/10. With `reach = 0.00001` the
   first within reach is `d = 10`: **1/10** (the double 0.1 lies 5.6·10⁻¹⁸
   from it).
3. **Fallback to the finest.** `value = 0.123456`, `reach = 0.000001`: the
   nearest multiple of 1/2520 is 311/2520 (311.109 rounds to 311),
   0.0000434 away, so nothing is within reach and the result is
   **311/2520**.
4. **Ties go up.** With denominator 2, `value = 0.25`, `reach = 0.1`: `d =
   1` gives 0 (0.75 floors to 0; 0.25 away), `d = 2` gives 1/2 (0.5 ties
   up; 0.25 away); the fallback is the nearest multiple of 1/2, the tie
   going up: **1/2**.
5. **Floats.** `value = 1.23456`, `reach = 0.004`: 0 places 1 (0.23456
   away), 1 place 1.2 (0.03456), 2 places 1.23 (0.00456 > reach), 3 places
   1.235 (1234.56 rounds to 1235; 0.00044 ≤ reach): **247/200**. With
   `reach = 0.005`, 2 places are within reach: **123/100**. With `reach =
   0.0001` none is, and the fallback is 3 places: **247/200**. A tie goes
   up, unlike Python's `round`: decimals 2, `value = 0.125`, `reach =
   0.001`: 0 (0.125 away), 1/10 (1.25 rounds to 1; 0.025), 13/100 (12.5
   ties up; 0.005 > reach), so the fallback **13/100**.
6. **Ints.** `value = 12345.6`, `reach = 600`: 2·reach = 1200, the
   largest power of ten not above it 1000; the nearest multiple 12000 is
   345.6 away ≤ reach: **12000**. `reach = 300`: 2·reach = 600, from 100:
   12300 (45.6 away): **12300**. `reach = 40`: from 10: 12350 (4.4 away):
   **12350**. `reach = 0.2`: 2·reach = 0.4 < 1, so only 1: 12346 is 0.4
   away > reach, and the fallback is the nearest integer, **12346**. The
   int axis ignores the granularity.
7. **Clamping** (`clampValue`). A value below the start is the start (the
   snapped −3/10 of `value = −0.3`, `reach = 0.01`, held to `[0, 32]` →
   **0**; 3 held to `[4, 8]` → **4**); one beyond the end is the end (the
   snapped 9 of `value = 9`, `reach = 0.01`, held to `[0, 8]` → **8**; the
   snapped 8 of `value = 7.9`, `reach = 0.5`, held to `[0, 7.5]`, the float
   end read as its exact value → **15/2**); an unknown end (`null`) holds
   only below (the snapped 100 of `value = 100.2`, `reach = 0.5` on an int
   axis → **100**).
8. **Refusals.** A reach of 0 or −1 is a `RangeError`.

## The texts of a coordinate (`display.test.ts`)

A coordinate has two texts. The **raw** text (`rawText(value, numberType,
unit)`) is the exact value and its unit's schema name spelled out; the
**pretty** text (`prettyText(value, numberType, unit, decimals?)`) is
written with symbols and abbreviations (`prettyUnit(unit)`), exact without
`decimals` (the Timestamp tab's pretty Copy) and rounded with them (the
coordinate flag at the granularity's `decimals`, the drawing's labels at
3). `copyValue` is what Copy puts on the clipboard, `coordinateDict(value,
unit, numberType)` the coordinate dict `{unit, number_type, value}` of the
Timestamp tab's JSON. The oracles: a float expectation is what CPython 3
prints for `repr(x)` or `repr(round(x, decimals))`; the seconds' split is
the integer arithmetic of the exact value, `h = ⌊m / 3600⌋`, `min = ⌊(m
mod 3600) / 60⌋`, the seconds the rest, `m` the magnitude, taken for a
float from the decimal digits of its spelling, never from float arithmetic
(75.1, whose double lies below 75.1, must still give `15.1` seconds).

1. **Copy** carries the whole value: a fraction `n/d` (`219/16`) or its
   integer (`3`); a float the shortest text that reads back as the same
   double, as TimeToShare's manifest writers spell it, which is Python's
   `repr` with a fractional digit given to a mantissa in exponent form
   (0.1 → `0.1`, 1e-07 → `1.0e-07`, 3.0 → `3.0`, 6.71875 → `6.71875`,
   1e+16 → `1.0e+16`); an int its plain digits (`514041`).
2. **Raw text** is the copy text, a space and the unit's schema name, for
   every unit: 219/16 → `219/16 number`, `219/16 floating_measures`,
   `219/16 whole_notes`, `219/16 quarters`, `219/16 ticks`, `219/16
   milliseconds`, `219/16 seconds`, `219/16 minutes`, `219/16 samples`,
   `219/16 frames`, `219/16 pixels`, `219/16 meters`, `219/16
   centimeters`, `219/16 millimeters`, `219/16 inches`, `219/16 points`,
   `219/16 css_pixels`, `219/16 user_units`; and 0.1 on seconds → `0.1
   seconds`, 3 on whole notes → `3 whole_notes`, 514041 on samples →
   `514041 samples`.
3. **Pretty units** are the table the editor and the drawing share:
   `number` → `number`, `floating_measures` → `floating_measures`,
   `whole_notes` → `𝅝` (U+1D15D), `quarters` → `♩` (U+2669), `ticks` →
   `ticks`, `milliseconds` → `ms`, `seconds` → `s`, `minutes` → `min`,
   `samples` → `smp`, `frames` → `frames`, `pixels` → `px`, `meters` →
   `m`, `centimeters` → `cm`, `millimeters` → `mm`, `inches` → `in`,
   `points` → `pt`, `css_pixels` → `css_pixels`, `user_units` → `uu`
   (`css_pixels` has no abbreviation, so it is shown by its name; `px` is
   the discrete `pixels`). The **pretty text** of 219/16 in every
   unit but seconds is `13 11/16`, a space and that unit (`13 11/16 ♩`, `13 11/16
   𝅝`, `13 11/16 ms`, …); in seconds it is `13 11/16″`; a value without a
   unit (`null`) is its number alone (`13 11/16`).
4. **Exact pretty numbers.** A fraction is mixed, its integer part shown
   when not zero, whatever its denominator and never digit-grouped:
   219/16 → `13 11/16`, −219/16 → `-13 11/16`, −3/8 → `-3/8`, 3 → `3`,
   1/2521 → `1/2521`, 5043/2521 → `2 1/2521`, 1/4096 → `1/4096`, 123457/2
   → `61728 1/2`. An int is grouped by three with single spaces: 514041 →
   `514 041 smp`, −1234567 → `-1 234 567`, 1000 → `1 000`, 999 → `999`,
   0 → `0`. A float is its full spelling: 0.1 → `0.1`, 6.71875 →
   `6.71875`, 1e-07 → `1.0e-07`, 1e+16 → `1.0e+16`, the double of 0.1 +
   0.2 → `0.30000000000000004`.
5. **Seconds, exact.** Hours `h` only when not 0; minutes `′` (U+2032)
   when not 0 or after hours; seconds `″` (U+2033) always; a part after a
   shown one padded to two digits; the seconds' decimals only when not
   zero; no unit after. Floats: 42.5 → `42.5″`, 5.241 → `5.241″`, 75.5 →
   `1′15.5″`, 3725.0 → `1h02′05″`, 3605.25 → `1h00′05.25″`, 60.0 →
   `1′00″`, 0.0 → `0″`, −75.5 → `-1′15.5″`, 75.1 → `1′15.1″`, 0.1 + 0.2 →
   `0.30000000000000004″`, 1e-05 → `0.00001″` (the spelling's digits
   written out), 1e+16 → `2777777777777h46′40″` (10^16 = 2777777777777 ×
   3600 + 2800, 2800 = 46 × 60 + 40). Fractions: 151/2 → `1′15 1/2″`,
   121/2 → `1′00 1/2″` (the padded integer part is written even when 0),
   1/2 → `1/2″`, 7201/2 → `1h00′00 1/2″`. Ints: 3725 → `1h02′05″`, 59 →
   `59″`, −3600 → `-1h00′00″`.
6. **Rounded.** With `decimals` a float is Python's `round(x, decimals)`
   spelled as Copy spells it, for `decimals` 0, 3 and 6: 6.71875 → `7.0`,
   `6.719`, `6.71875`; 312.48979591836735 → `312.0`, `312.49`,
   `312.489796`; 1e-05 → `0.0`, `0.0`, `1.0e-05`; 2.5 → `2.0` (a true tie,
   to even), `2.5`, `2.5`; 6.0 → `6.0` at 3. A fraction is mixed while its
   denominator is at most 2520 = lcm(1, …, 10), whatever `decimals`
   (219/16 → `13 11/16`, 1/2520 → `1/2520`, 2521/2520 → `1 1/2520`,
   27/2048 → `27/2048`), else its exact decimal where it terminates
   (1/4096 → `0.000244140625`), else `≈` and the decimal rounded to 12
   places, half to even (1/2521 → `≈ 0.000396667989`, 1/5040 → `≈
   0.000198412698`, the denominator 2550 = 2 × 3 × 5² × 17: 1/2550 → `≈
   0.000392156863`, −1/2550 → `≈ -0.000392156863`). An int is grouped at
   any `decimals` (514041 → `514 041` at 0 and at 6). **Seconds are split
   after rounding**: 59.9996 at 3 → round gives 60.0 → `1′00″`, 3599.9996
   at 3 → `1h00′00″`, 3725.0004 at 3 → `1h02′05″`, 75.1 at 0 → `1′15″`;
   151/2 at 3 → `1′15 1/2″`, 1/4096 → `0.000244140625″`, 153001/2550 (60 +
   1/2550) → `≈ 1′00.000392156863″` (rounded to 60.000392156863 first,
   then split).
7. **Coordinate dicts** write the value as a manifest writes a bare value
   of its number type: 219/16 on quarters → `{unit: "quarters",
   number_type: "fraction", value: [219, 16]}`, 6.0 on seconds the
   integral float (`JsonFloat` 6), 514041 on samples the integer 514041.
8. A value whose kind is not the number type's (a `bigint` shown as a
   float, a float copied as a fraction, a Fraction written raw as an int,
   a Fraction in a coordinate dict of an int axis) is a `TypeError`.
9. **No pretty text is signed zero.** A float −0.0 and a value that
   rounds to zero are written unsigned: −0.0 → `0″` in seconds, `0.0 ♩`
   in quarters, `0.0` without a unit; −0.0004 at 3 places → `0″` and
   `0.0 ♩` (Python's `round(-0.0004, 3)` is −0.0); −1/(3 × 10^13), a
   fraction of no terminating decimal, at 3 → `≈ 0.000000000000 ♩` (its
   magnitude rounds to 0 at 12 places). Copy and the raw text keep the
   float's `repr` exactly: −0.0 → `-0.0` and `-0.0 seconds`.

## Reading a typed value (`parse.test.ts`)

`parseAxisValue(text, numberType)` reads what is typed into an editable
value as the exact value its text spells, never through a JavaScript
float, or refuses it. White space around the text is ignored; every form
takes an optional sign (whether a negative value is allowed is the
caller's to say). The oracle is the arithmetic of the text itself.

1. **Fraction axis** accepts an integer, `n/d`, a mixed fraction `a b/c`
   and a decimal: `3` → 3, `-3` → −3, ` 3/4 ` → 3/4, `6/8` → 3/4, `-3/4` →
   −3/4, `13 11/16` → 219/16, `-13 11/16` → −219/16, `1 3/2` → 5/2,
   `0.75` → 3/4, `.5` → 1/2, `2.` → 2, `0.1` → 1/10, `1e-3` → 1/1000,
   `-2.5E2` → −250.
2. **Float axis** accepts a decimal, with an optional exponent (Copy's
   text reads back): `0.1` → 1/10 exactly, `1e-07` → 1/10000000, `3.0` →
   3, `-2.5` → −5/2, `3` → 3.
3. **Int axis** accepts digits, plain or in groups of three separated by
   single spaces (the shown text reads back): `514041` and `514 041` →
   514041, `-1 234 567` → −1234567, `+7` → 7.
4. **Refusals** are `invalid_value` at `[]`, the message naming the text
   and what the axis accepts. Fraction: `""`, `abc`, `1/0`, `1 1/0`,
   `1/-2`, `3/4/5`, `1,5`, `0x10`, `Infinity`, `1e1001` (an exponent
   beyond ±1000); the message of `1/0` is exactly `"1/0" is no fraction
   value; write an integer, n/d, a b/c or a decimal`. Float: `3/4`, `1
   1/2`, `inf`, `nan`, `1e`, `""`; the message of `inf` is `"inf" is no
   float value; write a decimal number`. Int: `1.0`, `1e3`, `51 4041`,
   `1/1`, `""`; the message of `1.0` is `"1.0" is no int value; write an
   integer`.

## Inverting a map (`invert.test.ts`)

`invertible(map, context)` says whether a map is strictly monotone over
the span `context.span` (`{start, end}`, `end` `null` for an unknown
length); `invert(map, value, context)` is the position at which it gives
`value`, exact (a Rational) on exact operands, a float where a float takes
part, `null` where the map is not invertible or gives the value nowhere it
reaches. The oracle is the forward evaluation: every inverse below is
checked by hand against the map's own arithmetic ("Conversion maps"), and
for the exact ones the test also evaluates the map (`compileMap`) at the
inverse and gets the value back exactly. Span [0, 32] unless stated.

1. **LinearMap.** `165375/8·x + 507150` (quarters to samples): invertible;
   4112325/8 → exactly 1/3 (its value at 1/3); the int 514041 → (514041 −
   507150)·8/165375 = **18376/55125**. `−2·x + 10`: 4 → 3. The float
   scalar `0.5`: 1.5 → the float 3.0, and the exact 3/2 → the float 3.0
   too (a float takes part). Scalar 0: not invertible, `null`.
2. **TableMap** (`linear`), anchors `[0, 4, 8] → [0, 2, 10]`, extrapolate
   `none`, span [0, 8]: invertible; 1 → 2, 2 → 4, 6 → 4 + (6 − 2)·4/8 =
   6, 1/3 → 2/3, 11 → `null` (beyond the last anchor, nothing there).
   Extrapolate `linear`, span [0, 12]: 14 → 8 + (14 − 10)·4/8 = 10.
   Extrapolate `constant`: over [0, 12] not invertible (flat beyond 8),
   over [0, 8] invertible. Falling anchors `[0, 4] → [10, 2]`: 6 → 2.
   Anchors `[0, 4, 8] → [0, 2, 1]` rise then fall: not invertible over [0,
   8], invertible over [0, 4] (the falling interval is not reached),
   where 1 → 2. Kind `previous`: never invertible. Float anchors `[0.0,
   4.0] → [0.0, 2.0]`: 1 → the float 2.0.
3. **PiecewiseMap**, breaks 0, 4, 16, pieces `1/2·x` and `3/5·x − 2/5`
   (both 2 at 4, so it rises without a step), span [0, 16]: invertible; 1
   → 2; 16/5 → (16/5 + 2/5)·5/3 = 6; 2 → 4 (the first piece's 4 lies
   outside its half-open interval, the second's does not). Pieces `1/2·x`
   and `−x + 10` (rising, then falling): not invertible. Pieces `1/2·x`
   and `x − 4` (2 before 4, 0 at it: a step back): not invertible.
4. **ChainMap** of `480·x` (quarters to ticks) and the TableMap `[0,
   1920] → [0, 2]` (ticks to seconds, extrapolate `none`): every link is
   invertible over the span the links before give ([0, 15360] for the
   table), so the chain is; 1 → 960 ticks → **2** quarters, exactly. A
   chain of `480·x` and a ConstantMap is not invertible.
5. **Never invertible**: a ConstantMap, a CombinationMap of one LinearMap
   output and a MeasureNumberMap; `invert` gives `null` for each.
6. **Decided once per map and span.** Whether a map is invertible depends
   only on the map object, the MeasureMap rows it is compiled with and the
   span, so it is decided once for each: a hovered row asks it at every
   pointer move, and deciding a PiecewiseMap reads every break. What proves
   it is the number of times `breaks` is read, counted by a getter on item
   3's rising PiecewiseMap, which no result depends on. One decision reads
   `breaks` exactly twice, once for their floats (whether they rise) and
   once for their exact values (the pieces the span reaches), so the count
   is twice the number of decisions. The first `invertible` over [0, 16]
   reads `breaks` 2 times and says `true`; asking again over an equal span
   made of other objects reads it 0 more times (2 in all) and says `true`.
   A copy of the map, another object equal in value, is decided anew: its
   first `invertible` over [0, 16] reads its own `breaks` 2 times. Over the
   other span [0, 4] the first map is decided anew too, 2 more reads (4 in
   all), `true`. Without the memo the repeated call reads 2 more (4 after
   it, 6 after the other span) and the second equality fails.

## Timestamps (`timestamp.test.ts`)

A timestamp is the cross-section of a timeline, the **anchor**, at a
position exact on the anchor's axis: the anchor, then every **member** the
caller lists (the anchor's segments and displayed descendants, each with
its offset from the anchor's zero) whose closed span `[offset, offset +
length]` holds the position (`[offset, offset + reach]` for an unknown
length with a `reach`, where the caller's drawing ends it; `[offset, ∞)`
without one), each
with its coordinate (the position minus its offset, in its number type)
and the value of each of its maps. A **row** is one value of it: a
timeline's own coordinate or one of its maps' values. One row abstraction
reads a row forward from a position and back from a value to a position;
the shown values, the position a pointer picks on a row (`snapOnRow`), the
position an edited value gives (`positionFor`), the listed rows
(`timestampRows`) and the JSON value (`timestampJson`) all go through it.
The spec names only primitive facts (the anchor's and each member's
timeline, name, unit, number type, length, maps and, for a member, its
offset), which the test reads off a fixture's tree, an offset summed down
the path from the anchor; so every expected value follows by hand from the
maps' own arithmetic ("Conversion maps") and needs no drawing. Granularity
`{denominator: 2520, decimals: 3}` unless stated; `knots` `no_server`
unless stated. The manifests: `bundles/bundle_mixed.yaml` (`score`:
quarters, fraction, length 12, `cmap_1` 480·x onto ticks (int), `cmap_2`
1/2·x onto seconds (float); `recording`: samples, int, length 441000,
`cmap_5` x/44100 onto seconds; its child `excerpt` at 44100, length 88200,
`cmap_6` x/44100 onto seconds; `performance`: seconds, float, `cmap_3`
44100·x onto samples), `segment_line.yaml`,
`conversion_maps__maps_quarters.yaml` (`maps:quarters`, quarters,
fraction, length 16, twelve maps of every kind) and `timestamps.yaml`, and
the parity table's manifest with its MeasureMap's expanded rows
(`parity/maps.json`, "Conversion maps").

1. **The anchor alone.** `score` at 16/5, no members: one part, `score` at
   the Fraction 16/5, `cmap_1` the int 1536 on ticks (16/5·480) and
   `cmap_2` the float 1.6 on seconds (16/5·1/2 = 8/5), in the order of the
   manifest. The timestamp names the block, the anchor and the granularity
   it was given (the same object). `performance` at 2: its coordinate is
   the float 2.0 and `cmap_3` the int 88200 (the float 88200.0 onto
   samples).
2. **Membership.** `recording` with the member `excerpt` (offset 44100):
   at 100000 two parts, `recording` at the int 100000 with `cmap_5` the
   float 2.2675736961451247 (100000/44100 = 1000/441), then `excerpt` at
   55900 (100000 − 44100) with `cmap_6` the float 1.2675736961451247
   (559/441); at 200000 `excerpt` is not crossed (155900 > 88200) and the
   timestamp is `recording`'s alone; the span is closed, so at 44100
   `excerpt` is crossed at 0 and at 132300 at 88200. With the member's
   length unknown (`null`), 200000 crosses it at 155900. With its length
   unknown and a `reach` of 100000 (the drawing ending it there), the span
   ends at the reach, ends included: 144100 crosses it at 100000, 144101
   does not (`recording` alone), and 200000 does not either. What would be
   wrong: a member of unknown length listed past where its line ends
   (the flag naming a timeline its drawn line does not reach). The reach
   bounds only which positions cross a member: `positionFor` still takes
   a value past it.
3. **Ancestors** (`ancestorMembers(manifest, timeline)`): a timestamp
   carries its ancestors' coordinates, a parent's coordinate being its
   child's plus the child's offset, exactly, up to the root. Of
   `segment_line.yaml`'s segment `b2` (offset 6 in `b`, which lies at 8 in
   `form`): `b` at offset −6 (length 12), then `form` at −14 (length 32),
   each with its name, unit and number type and no map; of the root `form`
   and of an ID no timeline carries, none. Anchored on `b2` with these
   members, the timestamp at 1 is `b2` 1, `b` 7, `form` 15, in that order
   (an ancestor's span holds its descendant's, so it is crossed wherever
   the anchor lies). Of `bundle_mixed`'s `excerpt` (at 44100 in
   `recording`): `recording` at −44100, 441000 long; at 44100 the parts
   are `excerpt` 44100, `recording` 88200 (ints).
4. **A group's member, read by the group** (a groupstamp's): its
   coordinate is the anchor's position, less its offset, times its
   `scale` (its drawn length over the anchor's). `groups/group_groupstamp.yaml`:
   anchor `score` (quarters, 8) with the member `performance` (seconds,
   float, 4.0) at offset 0, scale 1/2: at 4 the parts are `score` 4,
   `performance` the float 2.0; at 8, 4.0 (the closed span `[0, 8]` on
   `score`'s axis). `positionFor` on `performance`'s coordinate: 3 → 6;
   5 → `5 lies outside 'performance' (0 to 4)`. `snapOnRow` on its row at
   `p = 3.13`, `h = 0.004`: 1.565 on its axis, the reach scaled to 0.002;
   0 places 2, 1 place 1.6, 2 places 1.57 miss, 3 places 1.565 is it:
   **313/100** on `score`'s axis.
   **A member the group gives no value** (`valueless`: its length, or the
   anchor member's, is not known, and a group never carries one member's
   length to another, drawing.md §6.6): the same spec with `performance`
   `valueless` lists the same parts in the same order (the scale still says
   where its drawing is crossed), but every row of `performance` (its
   coordinate and `cmap_2`) has the value `null`, says `VALUELESS_TEXT`
   instead and is not editable, while `score`'s rows equal those of the
   valued spec; `timestampJson`'s `mapping` equals the valued one with
   `performance` and `cmap_2` `null`; `positionFor` on either row is
   refused, `'performance' has no value here`. What proves it: the valued
   spec read alongside as the oracle, so only the member's own rows change.
5. **Contiguous members are both crossed; the caller's order stands.**
   `form` of `segment_line.yaml` with its descendants in traversal order
   (`a` at 0 of 8, `a1` at 0 of 8, `b` at 8 of 12, `b1` at 8 of 6, `b2` at
   14 of 6, `c` at 20 of 12, `c1` at 20 of 12, offsets from `form`'s
   zero): at 8 the parts are `form` 8, `a` 8, `a1` 8, `b` 0, `b1` 0 (the
   boundary of `a` and `b` is crossed by both, no tie-break); at 27/2
   `form` 27/2, `b` 11/2, `b1` 11/2 (`b2` starts at 14); at 32 `form` 32,
   `c` 12, `c1` 12. Given `b`, then `a`, at 8 the parts are `form`, `b`,
   `a`.
6. **Rows.** `timestampRows` lists the parts top to bottom where the
   reading crosses each timeline (the `ordinate` the caller gives the
   anchor and each member, canvas units growing downwards; the rows of
   one part by `mapOrdinates` too, below), stably (parts
   at one ordinate in the timestamp's order), every part without an
   ordinate after those with one, in the timestamp's order; the
   timestamp's own parts keep the anchor first. `recording` at 100000
   with `recording` at 50 and `excerpt` at 20 lists `excerpt`'s rows, then
   `recording`'s; with only `recording` at 50, `recording`'s then
   `excerpt`'s; `form` of `segment_line.yaml` at 8 with `form` at 40, `a`
   and `a1` at 10, `b` and `b1` absent lists `a`, `a1`, `form`, `b`, `b1`
   (the parts `form`, `a`, `a1`, `b`, `b1`); without ordinates, the
   timestamp's order. **Within a part the rows lie top to bottom as
   drawn**: the coordinate at its timeline's `ordinate`, each map at its
   own entry of the timeline's `mapOrdinates` (the ordinate of the map's
   drawing in the card the reading crosses), stably (rows at one
   ordinate keep coordinate-then-maps order), every row without an
   ordinate after those with one. `recording` at 100000 with `recording`
   at 50 and `cmap_5` at 40, `excerpt` at 20 and `cmap_6` at 30 lists
   `{recording, cmap_5}` before `{recording, null}` and `{excerpt, null}`
   before `{excerpt, cmap_6}` (the parts `excerpt`, then `recording`, as
   before); with `cmap_5` at 40 and no ordinate for `recording` itself,
   `cmap_5` first; with `recording` at 50 and `cmap_5` at 50 (a tie),
   coordinate first; with ordinates for the parts only, per part its
   coordinate, then its maps in drawing order, and so without any
   ordinate. `timestampJson` of the pin with map ordinates equals the
   one without, byte for byte (`mapping` keeps the parts' own order).
   Without ordinates, per part its coordinate, then its maps:
   `recording` at 100000 gives six rows, `{recording, null}` labelled
   `Recording` with the int 100000, `{recording, cmap_5}` labelled `cmap_5`
   (the map has no name), `{excerpt, null}` `Excerpt` 55900, `{excerpt,
   cmap_6}`; all editable, no missing text. On `maps:quarters` at 2 a
   coordinate is editable and a map is editable exactly when it is
   invertible over its timeline's span [0, 16] ("Inverting a map"): the
   ChainMap `cmap_4`, the LinearMap `lmap_5`, the PiecewiseMap `pmap_1`
   (`x + 1` before 8, `x + 2` after, stepping up at 8) and the TableMap
   `tmap_4` (rising, extrapolated linearly) are; the measure views `cmap_1`,
   `cmap_2`, `cmap_3`, `tmap_1`, the CombinationMap `cmap_5`, the
   ConstantMap `cmap_8`, `tmap_2` (flat by its `constant` extrapolation
   beyond 4) and the `previous` TableMap `tmap_3` are not. A map without a
   value has the missing text: `cmap_1`, `cmap_2`, `cmap_3`, `cmap_5` (its
   `measure` output reads the MeasureMap) and `tmap_1` `needs a server to
   expand its measure map`; given `pending`, `waiting for the server`;
   given rows lacking the MeasureMap, `the server did not expand its
   measure map`. The texts: `missingValueText` for a map with no value at
   the position → `no value here`, `unsupported` → `the server cannot
   expand measure maps`, `unreachable` → `no server answered, so its
   measure map is not expanded`; `measureText` of a measure by its name, else its
   number, else its count (`m. 3`; `""` with number 7 → `7`; `""` with no
   number and count 9 → `9`).
7. **Snapping on a row** (`snapOnRow(spec, row, p, h)`, `p` the pointer in
   the anchor's units from its zero, `h` half a device pixel there):
   - `score`'s own coordinate, `p = 3.13`, `h = 0.004`: `snapValue` on the
     fraction axis, the divisors of 2520 ascending: 1 to 7 miss (3, 3, 3,
     13/4, 16/5, 19/6, 22/7 lie 0.13, 0.13, 0.13, 0.12, 0.07, 0.0367,
     0.0129 away), 8 gives 25/8 = 3.125 at 0.005 > h, 9 gives 28/9
     (0.0189), 10 31/10 (0.03), 12 19/6, 14 22/7, 15 gives 47/15 =
     3.13333 at 0.00333 ≤ h: **47/15**.
   - `score`'s `cmap_2` (target seconds, float), decimals 1, same `p`, `h`:
     v = 3.13/2 = 1.565, hv = |3.134/2 − 3.126/2|/2 = 0.002; 0 places give
     2 (0.435 away), 1 place 1.6 (0.035 away): both miss, so the finest,
     1.6 = 8/5, inverted exactly: (8/5)/(1/2) = **16/5**; the timestamp
     there has `cmap_2` the float 1.6 and `cmap_1` the int 1536.
   - `score`'s `cmap_1` (target ticks, int): v = 3.13·480 = 1502.4, hv =
     0.008·480/2 = 1.92; 2·hv = 3.84 < 10, so only 1: 1502 lies 0.4 away
     ≤ hv; 1502/480 = **751/240**.
   - **A timeline of an int axis steps by 1**, on its coordinate's row and
     on every map's row alike, whatever the granularity and however wide a
     device pixel is: the integer nearest to the pointer on the member's
     own axis (a tie going up), the offset added. `excerpt`, `p =
     100012.3`, `h = 3000`: 55912.3 on `excerpt`'s axis, the nearest
     integer 55912, plus 44100: **100012** (a snap to the simplest value
     within the pixel would give 56000, plus 44100 = 100100); on
     `recording`'s axis the same pointer gives **100012** (not 100000).
     `excerpt`'s `cmap_6` (onto seconds, float) at `p = 100000.4`, `h =
     100`: the seconds value is not snapped (to three places it would be
     1.268, inverted to 55919 and so 100019), the pointer lies at 55900.4
     on `excerpt`, the nearest integer 55900, plus 44100: **100000**; with
     decimals 1 the same **100000**.
     The result is held to the member's span: `p = 140000`, `h = 0.5` →
     95900 on `excerpt`, plus 44100 = 140000, held to [44100, 132300]:
     **132300**.
   - A map without an inverse falls back to its timeline's coordinate:
     `maps:quarters`'s ConstantMap `cmap_8` at `p = 3.13`, `h = 0.004`
     gives **47/15**, as its coordinate row does.
   - Refused with a `RangeError`: `p` NaN or infinite, `h` 0, −1, NaN or
     infinite, a row of a timeline the spec lacks or a map its timeline
     lacks.
8. **A pin moves.** A pin `{spec, knots, timestamp, named}` of `score` at
   16/5 (`named` `null`): `pinAt(pin, 8)` keeps `spec`, `knots` and
   `named` (the same objects) and holds exactly `timestampAt(spec, 8)`.
9. **An edited value gives a position** (`positionFor(pin, row, value)`,
   exact on the anchor's axis, never snapped):
   - `score`'s coordinate: 10 → 10; 1/7 → 1/7. `cmap_1` 1536 → 16/5;
     `cmap_2` 8/5 (the text `1.6`) → 16/5.
   - `recording` at 100000: `excerpt`'s coordinate 55900 → 100000;
     `cmap_6` 317/250 (the text `1.268`) → 100019 (1.268·44100 = 55918.8, settled
     on `excerpt`'s int axis to 55919, plus 44100);
     `cmap_5` 2 → 88200.
   - A float inverse on a fraction axis: `maps:quarters`'s `tmap_4` (float
     anchors) 1 → 8/4.25 = the float 1.8823529411764706, settled to the
     nearest multiple of 1/2520 (4743.53 rounds to 4744): **593/315**.
   - **Refused**, each `invalid_value` at `[]` with the message given:
     `score`'s 13 → `13 lies outside 'score' (0 to 12)`; −1 → `-1 lies
     outside 'score' (0 to 12)`; `cmap_1` 6240 → 13, `13 lies outside
     'score' (0 to 12)`; `excerpt`'s 90000 → `90000 lies outside 'excerpt'
     (0 to 88200)`; `maps:quarters`'s `cmap_8` 3 → `no position on
     'maps:quarters' gives 3`; `score`'s map `nope` → `'score' shows no map
     'nope'`; `excerpt`'s coordinate on `recording`'s pin at 200000 → `the
     timestamp shows no 'excerpt'`. An ancestor's value is held to the
     anchor's span too: on `b2`'s pin at 1 (anchor `b2`, its ancestors as
     members), `form` 16 → **2**; `form` 40 → `40 lies outside 'form' (0
     to 32)`; `form` 25 → 11 on `b2`, `11 lies outside 'b2' (0 to 6)`.
10. **The JSON value** (`timestampJson`): unnamed, `{timeline, coordinate,
   mapping}`, the coordinate the anchor's bare value as a manifest writes
   it; named, the named timestamp's members as the manifest holds them
   (whatever members it has, in its order), then `mapping`. `mapping` is keyed by ID in part
   order: each crossed timeline but the anchor its coordinate dict, each
   map its value: a number with a unit its coordinate dict, one without
   `{number_type, value}`, a label its string, a measure its record as the
   rows give it, named outputs an object of their values, no value
   `null`.
   - `score` at 16/5: `{timeline: "score", coordinate: [16, 5], mapping:
     {cmap_1: {unit: "ticks", number_type: "int", value: 1536}, cmap_2:
     {unit: "seconds", number_type: "float", value: 1.6}}}`.
   - `recording` at 100000: coordinate 100000, `mapping` keys `cmap_5`,
     `excerpt`, `cmap_6` in that order, `excerpt` `{unit: "samples",
     number_type: "int", value: 55900}`.
   - `performance` at 2: coordinate the integral float 2.0, `cmap_3`
     `{unit: "samples", number_type: "int", value: 88200}`.
   - `maps:quarters` at 2: `cmap_1`, `cmap_2`, `cmap_3`, `cmap_5`, `tmap_1`
     `null`; `cmap_4` 2·1/2·1/60 = 1/60 onto minutes, the float
     0.016666666666666666; `cmap_8` `"section-a"`; `lmap_5` 3/2·2 + 1/3 =
     10/3, the float 3.3333333333333335 on seconds; `pmap_1` 2 + 1 = 3, the
     float 3.0; `tmap_2` 2.5·2/4 = 1.25; `tmap_3` (`previous`, no target
     unit) `{number_type: "int", value: 60}`; `tmap_4` 4.25·2/8 = 1.0625.
   - The parity manifest's `quarters_root` at 2 with its rows: `q_record`
     the record of measure `2` (qstamp 1/2, the last at or before 2), as
     the rows give it; `q_combination` `{seconds: {number_type: "float",
     value: 1.0}, file: "a.png", count: {number_type: "int", value: 3}}`;
     `q_constant_label` `"intro"`.
   - Named: `timestamps.yaml`'s `timestamp_2` (`clt_1` at 6) with the
     member `clt_2` (offset 2, length 4): the named timestamp's members, then
     `mapping` `{clt_2: {unit: "quarters", number_type: "fraction", value:
     [4, 1]}}` (6 − 2 = 4, the end of `clt_2`'s closed span).
   - A segment's named timestamp: `segment_line.yaml` with `b2_ticks`
     (`map.yaml`'s `ticks`, 480·x onto ticks, under another ID) and a
     timestamp "Mark" at 1 added to `b`'s segment `b2` (offset 6, length
     6, no children), both through `add`. Its pin is read with `b2` as the
     anchor (a named timestamp's timeline is always its pin's anchor; the
     segment line `b` and the sibling `b1` are no members): one part, `b2`
     at 1; the JSON is the entry's members, then `mapping` `{b2_ticks:
     {unit: "ticks", number_type: "int", value: 480}}` (1·480), with no
     key `b2`: the anchor is never repeated in `mapping`.

## MatchClaims, anchors and potential MatchStamps (`matches.test.ts`)

The MatchClaim table reaches core as typed columns (the repository's
`decisions/0029-match-claim-columns.md` states the encoding): per row a
claim ID, a timeline number per side into the list of timelines (each with
its number type), and four value columns (side A and B, start and end),
each a float position, an int64 numerator and an int64 denominator; one
presence mask per anchor (start, end), and the caller's row mask of the
belief filter. From them core builds the anchor index and compares a named
MatchStamp with it. The format's rules (TimeToShare's README, "From
MatchClaims to anchors") are the oracle: a row passing the mask with a
start anchor gives the anchor of its two start values, with an end anchor
also that of its two end values, and is then an interval claim bounding a
matched span; a NOMATCH row and a masked row give nothing; two anchors are
the same when both coordinates are equal, exactly on their timeline's axis,
whichever side states which; a potential MatchStamp is one connected set of
coordinates under the unique anchors. Every expected value below follows
from these rules by hand; the float position only orders and is never
compared for equality on an exact axis.

**The case.** Timelines `clt_1` (fraction), `dpt_1` (int), `cpt_1`
(float), numbered 0, 1, 2. Rows (`claim_N` is row N − 1; A ↔ B):

| Row | Claim | A | B | |
|---|---|---|---|---|
| 0 | `claim_1` | `clt_1` 1/2 | `dpt_1` 22050 | instant |
| 1 | `claim_2` | `clt_1` 1 → 2 | `dpt_1` 44100 → 88200 | interval |
| 2 | `claim_3` | `clt_1` 3/2 | `dpt_1` 66150 | inside `claim_2`'s span |
| 3 | `claim_4` | `clt_1` 3 | `dpt_1` 132300 | one anchor, two claims |
| 4 | `claim_5` | `dpt_1` 132300 | `clt_1` 3 | the same anchor, sides swapped |
| 5 | `claim_6` | `dpt_1` 132300 | `cpt_1` 3.0 | chain over three timelines |
| 6 | `claim_7` | `clt_1` 4 | `dpt_1` 176400 | `clt_1` 4 shared by two anchors |
| 7 | `claim_8` | `clt_1` 4 | `cpt_1` 4.0 | |
| 8 | `claim_9` | `clt_1` | `dpt_1` | NOMATCH, no anchor |
| 9 | `claim_10` | `clt_1` 5 | `dpt_1` 220500 | masked (believed false) |
| 10 | `claim_11` | `clt_1` 1/2 | `dpt_1` 22050 | masked, an anchor row 0 states |
| 11 | `claim_12` | `clt_1` 1/3 | `dpt_1` 14700 | |
| 12 | `claim_13` | `clt_1` d | `dpt_1` 14701 | d = 6004799503160661/2^54, the double nearest 1/3 |
| 13 | `claim_14` | `clt_1` 6 | `dpt_1` 2^53 | |
| 14 | `claim_15` | `clt_1` 7 | `dpt_1` 2^53 + 1 | the same double as 2^53 |

1. **Coordinates**: 22, numbered by timeline, then position, then exact
   value: `clt_1` d, 1/3, 1/2, 1, 3/2, 2, 3, 4, 6, 7 (0–9; d and 1/3 share
   the position 0.3333333333333333, and d < 1/3), `dpt_1` 14700, 14701,
   22050, 44100, 66150, 88200, 132300, 176400, 2^53, 2^53 + 1 (10–19; the
   last two share the position 2^53), `cpt_1` 3.0, 4.0 (20, 21); the
   timeline offsets `[0, 10, 20, 22]`. Each value reads back exactly in
   its number type (a Rational, a bigint, a float). Masked values (5,
   220500) are no coordinates.
2. **Anchors**: 12 from 13 stating rows' anchors, ordered by their lower,
   then higher coordinate: (0, 11) row 12, (1, 10) 11, (2, 12) 0, (3, 13)
   1, (4, 14) 2, (5, 15) 1, (6, 16) rows 3 and 4, (7, 17) 6, (7, 21) 7,
   (8, 18) 13, (9, 19) 14, (16, 20) 5. Each row's start anchor (row 1's end
   anchor 5), −1 for rows 8, 9, 10.
3. **Neighbours**: per coordinate its joined coordinates ascending, with
   the anchor joining each: 7 → 17, 21 (anchors 7, 8), 16 → 6, 20 (6, 11),
   every other coordinate one.
4. **Potential MatchStamps**: 10, numbered by their first coordinate:
   {0, 11}, {1, 10}, {2, 12}, {3, 13}, {4, 14}, {5, 15}, {6, 16, 20}, {7,
   17, 21}, {8, 18}, {9, 19}; the anchors of {6, 16, 20} are 6 and 11, its
   claim rows 3, 4, 5.
5. **Matched spans**: one, row 1, from anchor 3 to anchor 5.
6. **Segments** of `clt_1` and `dpt_1`: anchors 0, 1, 2, 3, 4, 5, 6, 7, 9,
   10 in `clt_1`'s order, the gaps from anchor 3 to 4 and 4 to 5 covered by
   row 1's span, no other; of `dpt_1` and `clt_1` the anchors 1, 0, 2, …
   in `dpt_1`'s order with the same gaps covered; of `clt_1` and `cpt_1`
   anchor 8 alone, no gap. A timeline paired with itself is refused.
7. **Order and hit testing**: on `clt_1` at 1.4 within 0.2 the coordinate
   4 (3/2); at 2.5 within 0.25 none; at 2.5 within 0.5 the tie goes to the
   lower coordinate, 5; at 0.3333333333333333 within 0 the first of the
   two, 0. `dpt_1` from 44100 to 88200 (both ends included) holds
   coordinates 13 to 15. Looking a value up exactly: `clt_1` 1/3 → 1, d →
   0, `dpt_1` 2^53 + 1 → 19, `cpt_1` 3.0 → 20; `cpt_1` the bigint 3, `clt_1`
   5 (masked) and an unknown timeline → none.
8. **Without a mask** every row counts: 24 coordinates, 13 anchors, 11
   potential MatchStamps, anchor (2, 12) stated by rows 0 and 10.
9. **Float axes**: −0.0 and 0.0 on `cpt_1` are one coordinate.
10. **Refusals** (`RangeError`, exact message): a column whose length is
    not the row count; a claim ID given to a second row (`claim_1` in rows
    0 and 2: "row 2: the claim ID 'claim_1' names row 0 already"); a
    timeline number beyond the list; an end anchor without a start anchor;
    on an int axis a denominator other than 1; on a fraction axis a
    denominator below 1 or a fraction not in lowest terms; a position that
    is not finite; on an exact axis a position other than the double
    nearest the value, ties to even, since equality is decided only among
    equal positions and a wrong one would split a coordinate: 1/2 with the
    position 0.75 (the double is 0.5), 2^53 + 1 with the position 2^53 + 2
    (halfway between 2^53 and 2^53 + 2, the even one is 2^53), and 1/3 with
    the position of 1/3 plus one unit in the last place (0.33333333333333337;
    the double is 0.3333333333333333); a mask of another length.
11. **The oracle.** fast-check builds columns over small value domains
    (so values, anchors and sets collide often), with random masks; a
    reference written in the test with string keys of exact values, plain
    maps and a breadth-first search gives the coordinates, anchors with
    their rows, and connected sets, which the index must equal.

**The belief filter** (`beliefs.ts`, timetoalign's `belief_mask`): four
states, `BELIEF_STATES` `["true", "undecided", "unlikely", "false"]`, the
state of a row for a believer being the believer's belief in it, the most
critical of several (`believedBy` below), `undecided` where the believer
holds none. `beliefMask(beliefs, believer, kept, context)` is 1 for every
row whose state is one of `kept`, which by default is `DEFAULT_BELIEFS`,
every state but `false`; it is `null` (nothing filtered) without a
believer and for a `kept` holding all four states; a belief's word is its
number in TimeToShare's `BELIEFS` (`true` 0, `false` 1, `unlikely` 2),
which core re-exports. The case is the beliefs of TimeToShare's table fixture
`tables/0.2.0` as the client decodes them from the server's recorded
answer (the client's tests README pins those arrays): 15 rows, actors
`[B, A]` (B `…0001-5109-3700`, A `…0002-1825-0097`), offsets `[0, 1, 1,
1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 5, 6, 6]`, actor numbers `[1, 1, 1, 1, 0,
0]`, words `[0, 2, 0, 1, 0, 0]`: A believes row 0 true, row 5 unlikely,
row 10 true, row 12 false; B rows 12 and 13 true. So, by the rule: A by
default every row but 12; A `["true"]` rows 0 and 10; A `["undecided"]`
every row but 0, 5, 10 and 12; A `["unlikely"]` row 5; A `["false"]` row
12; A `["false", "true"]` (any order) rows 0, 10 and 12; A `[]` no row;
A with all four states `null`; B `["true"]` rows 12 and 13; B by default
every row; an actor holding no belief every row by default, none for
`["true"]`. A word that is no state throws TimeToShare's error "'maybe' is
no belief state: write 'true', 'undecided', 'unlikely' or 'false'" (for
`maybe`): the states, the default and the check are TimeToShare's
(`BELIEF_STATES`, `DEFAULT_BELIEFS`, `checkBeliefFilter`), which
timetoalign's `check_belief_filter` matches word for word.
`DEFAULT_BELIEFS` is `["true", "undecided", "unlikely"]`, the workspace's
MatchClaim filter's default.

Actors compare as the IRIs they stand for under the manifest's `@context`
(`actorIri(context, actor)`: TimeToShare's `expandIri`, else the actor as
written), the believer and every actor alike, as the library compares them.
The case is the fixture's beliefs with A written compact, `orcid:0000-0002-1825-0097`,
under the context `{orcid: "https://orcid.org/"}`: the believer A written
absolute gives the rows above (not false every row but 12, true rows 0
and 10), and so does A written compact; without the context the compact
actor is no IRI of A (`actorIri(null, "orcid:0000-0002-1825-0097")` is the
text as written), so A holds no belief: not false every row, true none.
`actorIri` itself: under that context the compact actor is
`https://orcid.org/0000-0002-1825-0097`; an absolute IRI, a `tag:` IRI and
a text without a colon (`someone`) are themselves. A believer named by
two actors of one IRI has every belief counted and the row takes the most
critical: two rows, row 0 believed false by A compact and true by A
absolute, row 1 without beliefs, give under the context row 1 alone by
default, no row for `["true"]` and row 0 alone for `["false"]` (row 0's
state is `false`).

**The colour of an anchor** (`beliefs.ts`): an alignment anchor of a shown
MatchStamp is drawn by the editor user's belief in the MatchClaims stating
it. `believedBy(beliefs, believer, context)` gives per row the believer's
belief as its number in `ANCHOR_BELIEFS`, the beliefs ordered by how
critical they are: `["false", "unlikely", "undecided", "true"]`;
`undecided` where the believer states none, the most critical where the
believer (two actors of one IRI) states several; actors compare as
`beliefMask` compares them. `anchorBelief(believed, rows)` is the most
critical belief among the rows stating an anchor, `undecided` for none.
On the fixture's beliefs above: for A, row 0 `true`, row 5 `unlikely`,
row 10 `true`, row 12 `false`, every other row `undecided` (numbers `[3,
2, 2, 2, 2, 1, 2, 2, 2, 2, 3, 2, 0, 2, 2]`); for B rows 12 and 13 `true`,
every other `undecided`; for an actor holding no belief every row
`undecided`; A written compact under `{orcid: "https://orcid.org/"}` as
A absolute; the two-actor case (row 0 false by A compact, true by A
absolute) row 0 `false`, row 1 `undecided`. For A, the rows `[0, 10]`
give `true`, `[0, 5]` `unlikely`, `[0, 5, 12]` `false`, `[1, 2]`
`undecided`, `[]` `undecided`. The same beliefs object, believer and
context give the same array object.

**Spans that overlap and run backwards.** Matched spans and segments are
checked on a second case of their own, between `clt_1` (fraction) and
`dpt_1` (int), every `dpt_1` value ten times its `clt_1` value so both
timelines order the anchors alike. Rows: `claim_1` `clt_1` 0 → 4 ↔ `dpt_1`
0 → 40 (interval); `claim_2` `dpt_1` 20 → 60 ↔ `clt_1` 2 → 6 (interval,
sides swapped, overlapping `claim_1`'s span); `claim_3` 5 ↔ 50 (instant);
`claim_4` 9 → 7 ↔ 90 → 70 (interval whose end precedes its start);
`claim_5` 8 ↔ 80 (instant). By the rules:

1. **Coordinates**: 16, `clt_1` 0, 2, 4, 5, 6, 7, 8, 9 (0–7), `dpt_1` 0,
   20, 40, 50, 60, 70, 80, 90 (8–15).
2. **Anchors**: 8, anchor k = (k, k + 8), so the anchors follow `clt_1`'s
   values 0, 2, 4, 5, 6, 7, 8, 9; their rows `[0], [1], [0], [2], [1],
   [3], [4], [3]`; start anchors per row `[0, 1, 3, 7, 6]`, end anchors
   `[2, 4, −1, 5, −1]`.
3. **Neighbours**: coordinate k is joined to k + 8 by anchor k, and k + 8
   to k.
4. **Potential MatchStamps**: 8, {k, k + 8}.
5. **Matched spans**: 3, rows 0, 1, 3, from anchors 0, 1, 7 to anchors 2,
   4, 5.
6. **Segments** of `clt_1` and `dpt_1`: anchors 0 to 7 in order, 7 gaps:
   `claim_1` covers the gaps from 0 to 4 (gaps 0, 1), `claim_2` those from
   2 to 6 (gaps 1, 2, 3; gap 1 covered twice is covered once), `claim_4`
   those from 7 to 9 (gaps 5, 6), whichever end comes first; the gap from 6
   to 7 (gap 4) lies under no span: covered `[1, 1, 1, 1, 0, 1, 1]`. Of
   `dpt_1` and `clt_1` the same anchors and the same gaps.

**A named MatchStamp against the index.** The input is a named
MatchStamp's alignment anchors (each two coordinates given by timeline ID
and value, and whether it carries the name) and the claim IDs it records.
An alignment anchor is stated when the index holds an anchor of its two
coordinates. The current potential MatchStamps are those holding any of
its coordinates. The differences: anchors gone (named, not stated),
anchors new (in the current MatchStamps, not named), claims missing
(recorded, not in the table), claims filtered out (recorded, in the
table, masked: the belief filter does not keep their state), claims elsewhere (recorded, passing the mask, behind none
of the current MatchStamps), claims new (behind the current MatchStamps,
not recorded). Out of date exactly when one of the six is not empty. The
Update result is the current potential MatchStamp holding the stated
anchor that carries the name, else the largest of the current ones, whether
or not it holds a stated anchor (most coordinates, then most stated
anchors, then the first stated anchor in the named order, then the lowest
number), none when no anchor is stated. Per named anchor the comparison gives the
rows of the MatchClaims stating it (`statedBy`, those passing the mask,
ascending), empty where it is not stated, which the anchor's colour is
read from. On the case's index:

1. Anchors (`clt_1` 3, `dpt_1` 132300) and (`dpt_1` 132300, `cpt_1` 3.0,
   name), claims `claim_4`, `claim_5`, `claim_6`: stated as anchors 6 and
   11, up to date, every difference empty; Update the MatchStamp {6, 16,
   20} with anchors 6, 11, claims `claim_4`, `claim_5`, `claim_6`, the
   name on anchor 11. Recording `claim_1` and `claim_9` besides: out of
   date, both claims elsewhere. Stated by rows `[3, 4]` and `[5]`.
2. (`clt_1` 4, `dpt_1` 176400, name) and (`clt_1` 5, `dpt_1` 220500),
   claims `claim_7`, `claim_10`, `claim_99`: stated 7 and none, by rows
   `[6]` and `[]`; anchors
   gone [1], new [8]; `claim_99` missing, `claim_10` filtered out,
   `claim_8` new; Update {7, 17, 21}, anchors 7, 8, claims `claim_7`,
   `claim_8`, the name on 7.
3. A MatchStamp now split in two: (`clt_1` 4, `dpt_1` 176400), (`clt_1` 3,
   `dpt_1` 132300), (`dpt_1` 132300, `cpt_1` 3.0), (`dpt_1` 176400,
   `cpt_1` 3.0, name), claims `claim_4` … `claim_7`, `claim_17`: stated 7,
   6, 11, none; gone [3], new [8], `claim_17` missing, `claim_8` new; the
   name's anchor is not stated and both MatchStamps have three
   coordinates, so Update takes {6, 16, 20}, which holds two stated
   anchors, with no name anchor.
4. (`clt_1` 1/2, `dpt_1` 22050) and (`clt_1` 4, `dpt_1` 176400), no name:
   Update the larger, {7, 17, 21}.
5. (`clt_1` 5, `dpt_1` 220500, name), claim `claim_10`: nothing stated,
   no current MatchStamp, gone [0], `claim_10` filtered out, no Update.
6. (`clt_1` 1/2, `dpt_1` 44100): both coordinates exist, the anchor does
   not; the current MatchStamps are {2, 12} and {3, 13}: new [2, 3],
   claims `claim_1`, `claim_2` new, no Update.
7. The third key: (`clt_1` 1, `dpt_1` 44100) and (`clt_1` 1/2, `dpt_1`
   22050), no name, state anchors 3 and 2 of MatchStamps {3, 13} and {2,
   12}, two coordinates and one stated anchor each, so the first stated
   anchor in the named order decides: Update {3, 13}, anchors 3, claims
   `claim_2`. Named the other way round: Update {2, 12}, anchors 2, claims
   `claim_1` (row 10, stating the same anchor, is masked). Neither follows
   the lower number.
8. The largest current MatchStamp, though it holds no stated anchor:
   (`clt_1` 1/2, `dpt_1` 22050) and (`dpt_1` 176400, `cpt_1` 3.0, name)
   state anchor 2 and none; the current MatchStamps are {2, 12}, {6, 16,
   20} and {7, 17, 21}. The name's anchor is not stated; {6, 16, 20} and
   {7, 17, 21} have three coordinates each and no stated anchor, more than
   {2, 12}, which holds the one stated anchor, so Update takes the lower
   number of the two, {6, 16, 20}, anchors 6, 11, claims `claim_4`,
   `claim_5`, `claim_6`, no name anchor.

## Budgets (`budget.test.ts`, `matches-budget.test.ts`)

The budgets time the code, so they do not run with the default suite, whose
files run in parallel: `pnpm test` excludes this file and `pnpm
test:budget` (in `app/`) runs it with the other budget files, one file at a
time; a failing budget stops none of the others, and every figure that
misses its budget is reported. Each figure is the minimum of 5 runs
after one warm-up run, so it measures the code rather than the load of the
machine. A budget that fails is reported; it is raised only where the cost
is inherent to what the code now does, never to hide an accidental one.

The workspace is generated: 300 blocks (the package's one-root fixtures in
turn) with a journal of 1,000 entries (300 `add`, 700 `set` moves).
`readWorkspace` of its text, validation included, takes at most 300 ms,
`writeWorkspace` at most 250 ms, one `dispatch` of a move at most 1 ms (the
limits and the figures behind them are in the repository's
`decisions/0019-workspace-store-and-journal.md`). Reading was held to 250
ms until TimeToShare's 0.2.0 manifests gained `resources`, named
MatchStamps, provenance beliefs and a context of 35 terms: every block's
manifest carries them and its validation reads them, which took the
figure from about 235 ms to about 260 ms on a quiet machine with no change
in this package (the same TimeToShare build read 300 blocks equally fast
with this package before and after it gained MatchStamps). The budget is
that figure with the margin the anchor index's budget keeps, about 15 %. Opening it,
`readWorkspace` and `createStore` with the journal's verification, is
measured and printed, not held to a budget: 497 to 501 ms over three runs,
each the minimum of 5, at a load average of 4. With `TILIE_MEASURE=<file>`
the test also builds 10,000 blocks (10,000 entries) and writes the figures
of both sizes into that file.

A conversion map is evaluated once per animation frame for every map the
coordinate flag shows, so its evaluation is held to the frame: 1,000
evaluations of a PiecewiseMap of 10^5 breaks (each piece an exact
LinearMap) at exact positions spread over its whole domain take at most 50
ms after compiling it once. The interval is found by a binary search over
the breaks, so the cost grows with the logarithm of the breaks, not their
number.

The MatchClaim table's anchor index (`matches-budget.test.ts`) is built
when a table arrives and read on every hover: a generator writes 250,000
claims over three timelines (instants, intervals, NOMATCH rows; values from
small grids so coordinates are shared). The columns' check (once per
table; it builds the map from claim ID to row that refuses a repeated ID
and that every comparison of a named MatchStamp reads) and the index's
build take at most 250 ms together, and a hover (the hit test, the
potential MatchStamp's members and anchors), the mean of 1,000, at most 1
ms. The figures are printed. The budget was 200 ms, set on a measurement
of 173 to 177 ms (the check 57 to 59 ms, the map from IDs about 40 ms of
it, the build 116 to 118 ms) that the same machine no longer reproduces:
the commit that set it measures 200 ms today (the median of five runs,
the check 63 ms, the build 139 ms), and so does every later commit, the
code it times unchanged since and TimeToShare reaching it only through
types. The cost is the check's map from claim IDs and the build's sort,
inherent to what the index does, so the budget is the figure measured by
`pnpm test:budget` on a quiet machine, a median of 212 to 218 ms (the
check 66 to 69 ms, the build 141 to 152 ms; single runs from 193 to 237
ms), with the margin of about 15 % the other budgets keep. A hover takes
about 1 µs.

## External gates

Strict type checking, Biome, dependency-cruiser and the whole Vitest suite
pass.
