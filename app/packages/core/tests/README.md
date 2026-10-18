# `@timetoalign/tilie-core` tests

`core` holds exact coordinates, one TimeSkeleton manifest of timeskeleton's
`SCHEMA_VERSION` in its one shape (`{timeskeleton, timelines, id?, name?,
meta?, groups?, graphical?}`: root timelines, optionally named, optionally
grouped), the elements a selector can match, the immutable workspace view
of blocks, the four commands `add`, `set`, `remove` and `style` over
addresses, the store with its command journal, and the workspace file. This
file states what proves each part works; a test that cannot be traced to a
paragraph here does not belong in the suite.

General rules: exact values only (`toEqual`/`toBe` against literal expectations
or against a value reached by another path); no thresholds except the budgets,
which are stated as the requirement they test; no network; nothing written
outside temporary state. Block ids in examples are `A = "0000000000"`, `B =
"0000000001"`, `C = "0000000002"`.

**Where manifests come from.** The installed package's fixtures
(`fixtures/<SCHEMA_VERSION>/`, its `groups/` and `bundles/`, each in the
complete form with its minimal twin, and `fixtures/rejections/<SCHEMA_VERSION>/`),
read by `support.ts`: `fixture(name)`, `fixtureText(name)`, `load(name)`,
`manifestValue(name)` and `unlockedView(name, ...ids)` (block `A` holding
the fixture whose timelines `ids` state `locked: false` before it is read)
by the path below `fixtures/<SCHEMA_VERSION>/`, and
`allFixtures` for the suites iterating every fixture (the round trip, the
properties and the budgets). Tests that need a particular manifest name one:
`bare.json` (root `bare` "Bare", 8 quarters), `nested.json` (root `clt_1` of
16, child `clt_3` at 4 of 8, its child `clt_2` at 3/2 of 2, both locked),
`map.json` (root `melody` with the map `tempo`, child `phrase` at 2 with the
map `ticks`), `with_region.json`, `flow_control.json`, `segment_line.json`,
`discrete_logical.json`, `continuous_logical.json`,
`groups/group_child_member.json`, `groups/group_number_types.json`,
`groups/group_styled.json` and `bundles/bundle_mixed.json` (named "Mixed",
no id). A variant is built from one of them through commands, or by
changing its value before loading it. Core holds no manifest literal of
its own except where a rejection or a single rule is asserted, and then
built by a local helper in that test file (`length.test.ts`'s `manifestOf`),
never named like a fixture. These prove core against whatever timeskeleton
ships, so they follow its fixtures' state.

## Package name (`name.test.ts`)

The package exports its name, `"@timetoalign/tilie-core"`, as every workspace
package does; the editor shell lists the names it links.

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
   given (`[]` by default). `toAxisValue` writes numbers as `parse` reads
   them: an `int` value as a plain number (a `bigint` beyond 2^53), a
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
   the comparisons against it follow Python's numeric tower, through one
   helper (`src/number/real.ts`): an int or a Fraction is exact, a sum with
   a float is a float with each exact operand correctly rounded first, and a
   float compares with an exact value exactly. Pinned cases: int parent and
   Fraction child (3 + 3/2 = 9/2, above 4, below 5); Fraction parent and int
   child (7/2 + 2 = 11/2); float parent and int child (3.5 + 2 = 5.5);
   0.1 > 1/10; the rounding of 1/3, of (2^62 + 1)/3 and its negative, and of
   6402900570728149493/7435617913856420575 (0.8611121019002628, where
   dividing the two doubles gives 0.8611121019002627). A value is expressed
   on an axis only when its number type holds it exactly: 9/2 not as an int,
   1/3 not as a float, 1e-300 not as an int64 Fraction.

## Manifest load and save (`manifest.test.ts`)

Reading, writing, the canonical member order and the defaults are
`@timetoalign/timeskeleton`'s (`parseJson`, `validate`, `complete`,
`minimal`, `dumps`, `canonicalOrder`) and are proven in its own suite; these
tests prove that `core` uses them so that nothing is lost. In a loaded
manifest every number is a `JsonNumber`: a plain number for a safe integer or
a float with a fractional part, a `bigint` beyond 2^53, a `JsonFloat` for an
integral float (`600.0`). A loaded manifest is held in its complete form:
every key with a default is present.

1. **Fixture round trip.** For every fixture of the installed package
   (`fixtures/<SCHEMA_VERSION>/` and its `groups/` and `bundles/`, written in
   the complete form), `saveManifest(loadManifest(text))` equals `text` byte
   for byte. No skip, no normalization in the comparison. Each fixture's
   minimal twin (`<name>.minimal.json`) reads to the same manifest: for the
   twin's text, `saveManifest(loadManifest(twin))` equals the fixture's text
   and `saveManifest(loadManifest(twin), {minimal: true})` equals the twin's
   text. The twins are paired with their fixtures here and are no fixture
   of their own in the suites that iterate every fixture (the properties
   and the budgets), which would only run each manifest twice.
2. **Shared rejections.** For every case in
   `fixtures/rejections/<SCHEMA_VERSION>/`, the rejected manifest, written as
   JSON text, is refused by `loadManifest` with exactly one problem whose
   `path` equals the case's `path`. These include timeskeleton's identity
   and representation rules (an id repeated where it must be unique, a part
   word as an id, a jump target naming no marker, an `int` on a `fraction`
   axis), all `schema_violation`s from its `validate`, so `core` checks none
   of them again.
3. **The version marker.** `bare.json` with `"timeskeleton": "0.6.0"` is
   refused with exactly one problem `{code: "schema_violation", path:
   ["timeskeleton"]}`; without the marker it is refused with exactly one
   `schema_violation` at `[]`. Core reads the current version only and
   migrates nothing.
4. **The minimal form in, either form out.** The round trip above reads
   every twin into the complete form and writes both forms back. Pinned by
   hand for the twin of `bare.json` (its `meta` left out): the complete
   root is exactly `{id: "bare", name: "Bare",
   unit: "quarters", number_type: "fraction", length: [8, 1], locked: false,
   is_segment_line: false, meta: {}, children: [], conversion_maps: [],
   regions: [], flow_control: {breaks: [], jumps: [], markers: []},
   measure_map: null, metric_hierarchy: null}` and the manifest around it
   `{timeskeleton, name: null, meta: {}, groups: [], timelines: [root]}`: no
   `id` and no `graphical`, whose default is "absent".
5. **Unknown keys survive.** `bare.json` with an unknown key at the top
   (`"x-top": 1`), on the root (`"x-root": {"a": [1, 2]}`) and on a region it
   is given (`"x-region": "kept"`) loads with all three in place; after a
   `set` of the root's `name` and an `add` of a marker through commands, all
   three are still there with their values, and `saveManifest` writes them.
   `unknownKeys`, re-exported by core from timeskeleton, lists exactly the
   three `{path, key}` pairs, sorted by path then key.
6. **Missing styles are completed.** A graphical statement naming each of
   two absent styles produces exactly one warning naming both, the one
   timeskeleton's `completeStyles` issues (`Missing graphical styles: 'a',
   'z'`, names sorted by code point); core adds none of its own. The loaded
   manifest contains an empty declaration for each. The input object is not
   mutated and a declaration already present is preserved.
7. **Exact integers.** `discrete_logical.json` with its length value `480`
   replaced by `9007199254740993` (2^53 + 1) loads as the `bigint` and saves
   it as written; `continuous_logical.json` with its length Fraction
   numerator `12` replaced by `9007199254740993` loads as
   `[9007199254740993n, 1]` and saves it as written.
8. **Save goes through the canonical order.** `bare.json` given two markers
   at the same coordinate with the ids `"\u{1F3B5}"` (a surrogate pair in
   UTF-16) and `"～"`, in that order, is written with `"～"` first: markers
   by coordinate, then id in code-point order, the reverse of JavaScript's
   default sort.
9. **A child of another number type** (a float child of a Fraction parent,
   length `4.0`) loads and saves byte for byte.
10. **Invariant refusal lists every violation.** `with_region.json` changed
    to break three invariants at once (`clt_2` given a metric hierarchy
    without a measure map, a conversion map whose `source_unit` is
    `seconds` on a `quarters` timeline, a region ending before it starts)
    is refused with exactly `metric_hierarchy_without_measure_map` (at
    `clt_2`'s `metric_hierarchy`, a child checked before its parent's maps),
    `map_source_unit_mismatch` and `region_end_before_start`, in traversal
    order, each at its exact path below `["timelines", 0]`, and
    `saveManifest` of the same value throws `InvalidManifestError`.
11. **Each invariant at load.** For each of `number_type_not_allowed`,
    `region_end_before_start` and `metric_hierarchy_without_measure_map`,
    one copy of `with_region.json` changed in exactly that respect is
    refused with exactly one problem: that code at the exact path.
    `invalid_coordinate` is reached through commands only (a value the
    schema's representation check would refuse at load).
12. **A child's unit and extent are the schema's.** timeskeleton's
    `validate` refuses a child whose unit differs from its parent's and a
    child reaching past its parent's known length, so core holds no check
    of its own for either. One copy of `with_region.json` with `clt_2`'s
    unit `whole_note` is refused with exactly one problem,
    `schema_violation` at `["timelines", 0, "children", 0, "unit"]` with
    the validator's message `child 'clt_2' has unit 'whole_note', its
    parent 'clt_1' has 'quarters'`; one with `clt_2`'s offset `[9, 1]`
    (length 4, in a parent of 12) with exactly `schema_violation` at
    `["timelines", 0, "children", 1, "length"]` (placed at 9, it comes
    after its sibling at 2 in canonical order), message `child 'clt_2' ends
    at [13, 1], beyond the length [12, 1] of its parent 'clt_1'`. The
    message is the validator's text, passed on unchanged, so a test pinning
    it fails if core rewrites or replaces it.
13. **A negative child offset is core's to refuse.** The schema accepts a
    child starting before its parent's origin; core does not support it
    yet. One copy of `with_region.json` with `clt_2`'s offset `[-1, 3]` is
    refused with exactly one problem, `negative_child_offset` at
    `["timelines", 0, "children", 0, "offset"]`, message `A negative child
    offset is not supported yet: child 'clt_2' has offset [-1, 3].` (the
    offset spelled as timeskeleton's writer writes the number: a pair as
    `[n, d]`, an int as an integer, a float with its fraction digits). The
    same refusal on an `int` and on a `float` axis: a root `take` of 10
    `ticks` whose child `part` of 2 lies at `-1` gives `... child 'part'
    has offset -1.`, and a root `take` of `10.0` `seconds` whose child
    `part` of `2.0` lies at `-1.0` gives `... child 'part' has offset
    -1.0.`, each at `["timelines", 0, "children", 0, "offset"]`. A root's offset may be
    negative: `negative_offset.json` (root `recording` at `-2.5`) is in the
    round trip of item 1.
14. **Segments read unlocked.** A segment (a child of a segment line that
    is no segment line itself) is never locked: its segment line's lock
    governs it, so reading a manifest unlocks every segment whatever the
    file states. `segment_line.json` with `b1`'s `locked` stated `true`
    and `b2`'s stated `false` loads with `locked: false` on each of `a1`,
    `b1`, `b2` and `c1`, and with the stated value on every other
    timeline: `true` on `a`, `b` and `c` (segments that are segment lines
    themselves), `false` on the root `form`. A segment line that is a
    child, a segment or a group member is locked when it is placed there,
    but a file stating otherwise is kept on reading: the same file with
    `b`'s `locked` stated `false` loads with `b` at `false`. The loaded
    manifest saves with `"locked": false` on each segment, and its
    minimal form leaves `locked` out of each segment. Nothing else of
    the manifest changes: it deep-equals the manifest read from the same
    file with the four segments all stating `false`.
15. **Malformed text** is refused with code `invalid_json` at path `[]`.

`checkManifest` reports all invariant violations in traversal order, root by
root, with paths starting at `["timelines", <index>]` and a child at
`[…, "children", <index>]`. `saveManifest` throws `InvalidManifestError`
carrying the complete exact problem list.

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
   the length [16, 1] of its parent 'score'` (its start lies past the
   parent's known end); a child of length null at
   −1 is refused by core whatever the parent's length (a root of 16
   and a root of length null both refuse it): exactly `negative_child_offset`
   at the same path, message `A negative child offset is not supported
   yet: child 'part' has offset [-1, 1].` The sign check needs no end, so a
   length of null cannot switch it off.
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
child grew, locked or not. Content or a child added into an unlocked
timeline grows that timeline only. A segment ends where its successor
starts, and the last one where its line ends while the line's length is
known, so a segment's length moves neither. What proves it: each case
starts from a fixture whose locks are lifted, so the only rule in play is
the one under test: by a `set locked` command where a command may lift
them, and, for a segment line that is a segment, by the fixture's value
stating `locked: false` before it is read (no command lifts that lock yet;
segments themselves read unlocked). Each case checks the exact length of
the edited timeline and of its parent afterwards, or the exact code and
path of the refusal. A refusal the command sees coming carries its own
code; none of these cases reaches `schema_violation`.

On `nested.json` (root `clt_1` of 16, unlocked; `clt_3` at 4 of 8 and
`clt_2` at 3/2 of 2 in it, both unlocked first):

1. **Set.** `clt_3` length `[12, 1]` is accepted, `clt_1` stays `[16, 1]`;
   `[13, 1]` (end 17) is `child_exceeds_parent` at `[A + "/clt_3",
   "length"]`, the same with `clt_1` locked.
2. **Add.** A child `g` of 6 at 5 into `clt_3` grows `clt_3` to exactly
   `[11, 1]` and leaves `clt_1` at `[16, 1]`; a child of 8 at 5 would grow
   it to 13 (end 17) and is `child_exceeds_parent` at `[A + "/clt_3",
   "child"]`.
3. **Move.** `clt_2`'s offset `[7, 1]` grows `clt_3` to exactly `[9, 1]`,
   `clt_1` stays `[16, 1]`; `[11, 1]` would grow it to 13 and is
   `child_exceeds_parent` at `[A + "/clt_2", "offset"]`.
4. **A root has no parent.** A child of 4 at 14 into `clt_1` grows it to
   exactly `[18, 1]`.

On `segment_line.json` (root `form` of 32, unlocked; segments `a` 0–8, `b`
8–20, `c` 20–32, each a locked segment line; `b` holds `b1` 0–6 and `b2`
6–12, `c` holds `c1` 0–12, segments read unlocked):

5. **The last segment of a line of known length.** On `b2`,
   its length `[8, 1]` and `[4, 1]` are each `segment_end_fixed` at `[A +
   "/b2", "length"]`; `[6, 1]`, its own, passes the rule and so changes
   nothing: `invalid_value` at the same path, message "the command
   changes nothing" (Commands), never `segment_end_fixed`; `null` is
   accepted and leaves `b` at `[12, 1]`.
6. **A segment with a successor.** On `b1`, `[4, 1]` is
   `segment_end_fixed` at `[A + "/b1", "length"]` (`b2` starts at 6);
   `null` is accepted.
7. **A line of unknown length.** With `b` stating `locked: false` and `b`'s
   length set to null, `b2` length `[8, 1]` is accepted and `b` stays null.
   The other way round, a segment line ends where its last segment of
   known length ends: with `c` stating `locked: false` and `form`'s length
   set to null, `c` length `[14, 1]` is `segment_end_fixed` at `[A + "/c",
   "length"]` (`c1` ends at 12).
8. **A segment grown by what is added.** With `c` stating `locked: false`,
   adding `c2` of 4 at 12 into `c` would grow it to 16 and is
   `segment_end_fixed` at `[A + "/c", "child"]`; after `form`'s length is
   set to null the same `add` grows `c` to exactly `[16, 1]` and `form`
   stays null.

## Invariants (the catalogue)

Every invariant below is checked twice: by `checkManifest` over a whole loaded
manifest, and by every command over the manifest it would leave. The `Source`
column names the public timetoalign API that enforces the same rule. Two rows
are marked **Editor's own rule**: where the library accepts a manifest and
normalizes it on load (or never meets the case), the editor refuses, because
every manifest the library writes already satisfies the rule and an editor
manifest must save as it was read:

- region and flow-control coordinates already on the axis's number type;
- a parent grows only to a point its number type holds exactly.

A length of null bounds nothing (section "Unknown length"); `locked` states
whether a timeline's length is fixed and binds no child to it.

| Code | Invariant | Source in timetoalign |
|---|---|---|
| `number_type_not_allowed` | A timeline's unit admits its number type (discrete units `int` only; `number` all three; other continuous units `float` or `fraction`) | `timetoalign.core.enums.TimeUnit.resolve_number_type` / `allowed_number_types` |
| `invalid_coordinate` | Every own-axis value (a length, an offset, a region's start and end, a break, jump or marker coordinate) reads under its axis's number type, every integer is int64-bounded; a child has an offset | `timetoalign.core.time.number_from_json`. **Editor's own rule** for the number type of regions and flow coordinates: the library stores every coordinate on its axis, so its manifests never carry another |
| `child_exceeds_parent` | A command never leaves a child starting past its parent's known length (offset ≤ parent length) or, where its own length is known too, ending past it (offset + child length ≤ parent length, compared across number types as in section 1.6). A command placing a child past the known end of an unlocked parent lengthens the parent to the child's end (to its offset when the child's length is not known); a locked parent refuses. The parent grows only to a value its own number type holds exactly (an int parent cannot grow to 9/2, a float parent cannot grow to 1/3); otherwise the command is refused with this code, since a stored value is never re-expressed. The grown parent stays within its own parent's known length, and a child's length set past its parent's known end is refused, locked parent or not: a parent never grows because a child grew. Refused at the command's own path (`[address, "length"]`, `[address, "offset"]`, `[into, "child"]`); a manifest cannot break it (timeskeleton's `validate` refuses such a child) | **Editor's own rule** for the growth. `ChildrenMixin.add_child` through `EventsMixin._ensure_capacity` (`timetoalign.timelines.engines.events`); adding a child and setting a child's `offset` both apply this rule |
| `segment_end_fixed` | A segment's new length, set or grown to hold a child added into it, keeps its end where its successor starts, or, for the last segment, where its line ends while the line's length is known; a segment line's new length keeps its end where its last segment ends while that segment's length is known; a length of null is always accepted (a rule of `set` and `add`, checked before the schema's segment contiguity would refuse the manifest) | the segment line's contiguity in `timetoalign.timelines.types` |
| `locked` | A locked timeline's length cannot be set, to a value or to null (a rule of `set`; a manifest cannot break it) | `timetoalign.timelines.base.Timeline._check_not_locked`, called by the `length` setter |
| `negative_child_offset` | A child's offset is not negative. The schema accepts a child starting before its parent's origin, but neither the editor nor the library supports it yet; a root's offset may be negative | `ChildrenMixin.validate_child`, called by `add_child` |
| `segment_never_locked` | A segment (a child of a segment line that is no segment line itself) is never locked: its segment line's lock governs it. Reading a manifest unlocks every segment; `set locked: true` on a segment, and an `add` whose value states `locked: true` on a timeline it places as a segment, are refused (a rule of `set` and `add`; a manifest cannot break it) | `Timeline.lock` and `ChildrenMixin.add_child` refuse to lock a segment |
| `unlocking_not_supported` | A segment line that is a child, a segment or a group member is locked: an `add` placing one locks it, and `set locked: false` on one, or an `add` whose value states `locked: false` on one, is refused, since lifting that lock is not supported yet. Reading a manifest keeps a lock its file states on such a line (a rule of `set` and `add`) | a lock cannot be lifted (`Timeline.lock`); `ChildrenMixin.add_child` and `TimelineGroup.add_timeline` lock a segment line that joins |
| `length_below_content` | A length is not set below the farthest point a child reaches: its end, or its offset when its length is not known (and so never negative; a rule of `set`) | `Timeline.length` setter with `ChildrenMixin._get_max_content_coordinate` |
| `region_end_before_start` | A region's end is not before its start | `timetoalign.timelines.regions.Region.__post_init__` |
| `map_source_unit_mismatch` | A conversion map's `source_unit`, when not null, is the timeline's unit | `add_conversion_map` |
| `metric_hierarchy_without_measure_map` | A metric hierarchy requires a measure map | `Timeline.add_metric_hierarchy`, `Timeline.from_dict` |

Id uniqueness in its scopes, part words refused as ids, a group's members
naming timelines of the manifest, a jump's `target` naming a marker of its
timeline, a child sharing its parent's unit
(`timetoalign.timelines.engines.children.ChildrenMixin.validate_child` in the
library), segment contiguity and the representation of every own-axis value
are timeskeleton's rules, checked by its `validate` as part of the schema
check; names may repeat.

Rules the library does **not** enforce and this package therefore does not
invent: a child may have another number type than its parent; a region may
lie outside its timeline (negative start, end past the length); breaks,
jumps and markers may lie outside it too; a locked timeline still accepts
children within its length, regions, flow control and maps; any number of
breaks or jumps may share a coordinate. Measure maps, metric hierarchies and
conversion-map payloads are carried verbatim: their rules beyond the schema
(`MeasureMap.from_dict`, `ConversionMap.from_dict`) are the server's to
check, not the editor's.

## Elements and selectors (`elements.test.ts`)

A `style` command needs to know which blocks hold an element a selector
matches, and `layout` resolves the cascade with the same test, so both use
one enumeration and one matcher in `core`: `manifestElements(manifest)` lists
every element of the drawing specification's tree (sections 2.1 and 8.1) as
an `ElementKey` `{type, address, timeline, domain, modality, class,
inside}`, and `selectorMatches(select, key, ancestry)` tests one key,
`ancestry` mapping each timeline id to the ids from the root down to it
(`timelineAncestry`). A timeline's class is the class its unit decides
(`timelineClass`: `Continuous` or `Discrete` for the unit's modality,
`Logical`, `Physical` or `Graphical` for its domain, then `Timeline`, read
from the one unit table `unitDomain` reads too). The test writes the six
classes out with their units (`number`, `floating_measures`, `whole_note`,
`quarters` continuous logical; `ticks` discrete logical; `milliseconds`,
`seconds`, `minutes` continuous physical; `samples`, `frames` discrete
physical; `meters`, `centimeters`, `millimeters`, `inches`, `points`
continuous graphical; `pixels` discrete graphical), requires those units to
be exactly the schema's `TimeUnit` enum, and every unit to map to its
class. A map takes the domain and modality of its `target_unit`
(`unitDomain`): `number` is logical and continuous, `samples` physical and
discrete, a null unit has none. Manifests carry no class. Every timeline,
root, child or segment, has five **bands**, and each is an element
(drawing.md §2.1): type `band`, address `<timeline id>/<kind>_1`
(`bandAddress`), timeline its timeline, domain and modality `null` (so no
selector naming either matches a band), class its kind (`children`,
`conversion_maps`, `markers`, `regions` or `flow_control`), which a
selector's `class` matches as it matches a timeline class or a map's type.
`inside` is the key's **holder chain**: the types of
the elements holding it in the tree, outermost first. A key is made by
`elementKey`, `textKey`, `bandKey` or `unownedKey` from its holder's key,
never written by hand, so the chain is the holder's chain followed by the
holder's own type; a segment that is not a segment line (type `null`) adds
nothing to the chains of what it holds. Two drawings of one address are two
keys with the same address and different chains, so `inside` is the only
member that can tell them apart. What the tree must get right is who holds
what: a timeline's line or node holds its name and its five bands, each
band what it holds of the timeline (the children band its children, the
conversion maps band its maps, the markers band the root's wedges, the
regions band its regions, the flow control band its breaks and jumps), and
a segment line holds its segments' boundaries and labels directly, in no
band. The chains below are derived from that rule alone, so a key held by
the wrong element shows as a wrong chain.

1. **The enumeration of `map.json`** is exactly, in this order (type,
   address, timeline, domain, modality, class, inside; `CLT` stands for
   `ContinuousLogicalTimeline`, and `B`, `T`, `N`, `C`, `W` for `block`,
   `timeline`, `band`, `child`, `wedge` in the chains): `block`, every
   other member `null`, inside `[]`; `card`, `melody/card`, `melody`,
   logical, continuous, CLT, `[B]`; `timeline`, `melody`, the same, `[B]`;
   `name`, `melody/name`, the same, `[B, T]`; `band`, `melody/children_1`,
   `melody`, `null`, `null`, `children`, `[B, T]`; `child`, `phrase`,
   `phrase`, logical, continuous, CLT, `[B, T, N]`; `name`, `phrase/name`,
   the same, `[B, T, N, C]`; `band`, `phrase/children_1`, `phrase`, `null`,
   `null`, `children`, `[B, T, N, C]`, and `band`,
   `phrase/conversion_maps_1`, the same with the class `conversion_maps`;
   `map`, `melody/ticks`, `phrase`, logical, discrete, `QuartersToTicks`,
   `[B, T, N, C, N]`; `band` `phrase/markers_1`, `phrase/regions_1` and
   `phrase/flow_control_1`, each with its kind as class, `[B, T, N, C]`;
   `band`, `melody/conversion_maps_1`, `melody`, `null`, `null`,
   `conversion_maps`, `[B, T]`; `map`, `melody/tempo`, `melody`, physical,
   continuous, `ScalarMap`, `[B, T, N]`; `band`, `melody/markers_1`, class
   `markers`, `[B, T]`; `wedge`, `melody/start`, `[B, T, N]`, then its
   `label`, `melody/start/label`, `[B, T, N, W]`; `wedge`, `melody/end` and
   its `label` `melody/end/label` the same way (all four `melody`,
   logical, continuous, CLT); `band` `melody/regions_1` and
   `melody/flow_control_1`, `[B, T]`: twenty-two keys. The order is: the
   block, the root's card (a card has its timeline's domain, modality and
   class, and is held by the block beside the root's line, holding
   nothing), then per timeline in pre-order its line and its name, then its
   five bands in the order of `BAND_KINDS` (children, conversion maps,
   markers, regions, flow control), each followed by what it holds: the
   children band the timeline's children (by offset, then id, never by key
   order), each with its name and its own bands; the conversion maps band
   its maps; the markers band the root's two wedges, each followed by its
   label; the regions band its regions; the flow control band its breaks,
   then its jumps, each region, break and jump followed by its label. Every
   timeline lists its five bands, whether they hold anything or not. A map
   and a band have no name and no label; a map whose `target_unit` is null
   has domain and modality `null`. Addresses follow the drawing
   specification, section 2.2: a timeline by its id, a map, region, break,
   jump or marker by `<root id>/<id>`, a band by `<timeline id>/<kind>_1`,
   a part as `<address>/<word>`; an anonymous bundle has no title.
2. **Regions, breaks and jumps** are addressed below their root and held
   by their bands: `with_region.json` has exactly the region
   `clt_1/region_1`, inside `[block, timeline, band]`; the (type, address)
   list of `flow_control.json` (root `flow:quarters`, a break `break_1`, a
   jump `jump_1`, a marker `marker_1`, nothing else) is exactly `block`;
   `card flow:quarters/card`; `timeline flow:quarters`, `name
   flow:quarters/name`; `band flow:quarters/children_1`, `band
   flow:quarters/conversion_maps_1`, `band flow:quarters/markers_1`,
   `wedge flow:quarters/start`, `label flow:quarters/start/label`, `wedge
   flow:quarters/end`, `label flow:quarters/end/label`; `band
   flow:quarters/regions_1`; `band flow:quarters/flow_control_1`, `break
   flow:quarters/break_1`, `label flow:quarters/break_1/label`, `jump
   flow:quarters/jump_1`, `label flow:quarters/jump_1/label`. Markers are
   not drawn and are not elements. Every address of a one-root manifest's
   enumeration is distinct (it draws every element once).
3. **The title.** `bare.json` given a `name` "Piece" (no `id`) lists the
   key `{type: "name", address: "name", inside: ["block"]}`, every other
   member null, right after the block; given an `id` "edition" and no name
   the same key; given neither, no `name` key at the top.
4. **Matching.** Over `map.json`: `{}` matches all twenty-two keys;
   `{element: "map", domain: "physical"}` only `melody/tempo`; `{within:
   "phrase"}` exactly `phrase`, `phrase/name`, `phrase/children_1`,
   `phrase/conversion_maps_1`, `melody/ticks`, `phrase/markers_1`,
   `phrase/regions_1`, `phrase/flow_control_1` (a band belongs to its
   timeline); `{ids: ["melody/tempo"]}` only that map; `{class:
   "QuartersToTicks"}` only `melody/ticks`; `{modality: "discrete"}` only
   `melody/ticks`; `{element: "card"}` only `melody/card`, and `{element:
   "card", domain: "logical"}` the same; a selector naming the block's
   address never matches (the block has none). Bands: `{element: "band"}`
   exactly the ten bands, in the order of item 1; `{element: "band",
   class: "regions"}` exactly `phrase/regions_1`, `melody/regions_1` (in
   tree order the child's bands lie inside the root's children band, which
   comes first);
   `{class: "children"}` exactly `melody/children_1`, `phrase/children_1`
   (a band's kind is its class, and nothing else has it); `{ids:
   ["phrase/regions_1"]}` only that band; `{element: "band", domain:
   "logical"}` and `{element: "band", modality: "continuous"}` nothing.
5. **`inside`** matches an element held at any depth by an element of the
   named type, never the holder itself. Over `map.json`: `{inside: "child"}`
   exactly `phrase/name`, `phrase/children_1`, `phrase/conversion_maps_1`,
   `melody/ticks`, `phrase/markers_1`, `phrase/regions_1`,
   `phrase/flow_control_1`; `{inside: "timeline"}` every key after the
   line `melody` (the line holds everything of its drawing but the card);
   `{inside: "band"}` exactly what bands hold: `phrase`, `phrase/name`,
   `phrase/children_1`, `phrase/conversion_maps_1`, `melody/ticks`,
   `phrase/markers_1`, `phrase/regions_1`, `phrase/flow_control_1`,
   `melody/tempo`, `melody/start`, `melody/start/label`, `melody/end`,
   `melody/end/label`; `{element: "band", inside: "band"}` exactly the five
   bands of `phrase` (a child is held by its parent's children band, the
   root by no band); `{inside: "wedge"}` exactly the two wedge labels;
   `{inside: "block"}` every key but the block; `{inside: "card"}` and
   `{inside: "map"}` nothing (a card and a map hold nothing); `{element:
   "name", inside: "child"}` only `phrase/name`. A key built by hand with
   `inside: ["block", "group", "timeline", "ancestor"]` matches `{inside:
   "group"}` and `{inside: "ancestor"}` and not `{inside: "child"}`: the
   matcher reads the chain and nothing else.
6. **Segment lines** (`segment_line.json`: root `form`, segments `a`, `b`,
   `c`, each a segment line; `a` holds `a1`, `b` holds `b1` and `b2`, `c`
   holds `c1`, none of these a segment line). A segment that is a segment
   line is drawn as a child line without a name (its name is its label), so
   its node has type `child`; a segment that is not a segment line has no
   line and no name, its node has type `null`, so no selector naming
   `element` matches it, and it holds its five bands as a line does. Every
   segment is held by its segment line's children band. A segment that is
   not the first of its segment line (canonical order) has a `boundary`
   `<id>/start`, and every segment a `label` `<id>/label`, both belonging
   to the segment and held by its segment line directly, in no band, each
   listed after the segment's node. With "the five bands of `X`" for `X`'s
   children, conversion maps, markers, regions and flow control bands in
   this order, and "the other four bands of `X`" for the last four, the
   (type, address) list is exactly: `block`; `card form/card`; `timeline
   form`, `name form/name`; `band form/children_1`; then in pre-order
   `child a`, `label a/label`, `band a/children_1`, `null a1`, `label
   a1/label`, the five bands of `a1`, the other four bands of `a`; `child
   b`, `boundary b/start`, `label b/label`, `band b/children_1`, `null b1`,
   `label b1/label`, the five bands of `b1`, `null b2`, `boundary
   b2/start`, `label b2/label`, the five bands of `b2`, the other four
   bands of `b`; `child c`, `boundary c/start`, `label c/label`, `band
   c/children_1`, `null c1`, `label c1/label`, the five bands of `c1`, the
   other four bands of `c`; then `band form/conversion_maps_1`, `band
   form/markers_1`, the wedges `form/start`, `form/start/label`,
   `form/end`, `form/end/label`, `band form/regions_1`, `band
   form/flow_control_1`. The boundary `b/start` is exactly `{type:
   "boundary", address: "b/start", timeline: "b", domain: "logical",
   modality: "continuous", class: CLT, inside: ["block", "timeline"]}` (held
   by `form` itself), and the label `b/label` has the same chain;
   `b2/start` and `b2/label` have the chain `["block", "timeline", "band",
   "child"]` (held by the segment line `b`, which `form`'s children band
   holds); the node `a1` and each of its bands have `["block", "timeline",
   "band", "child", "band"]` (the `null` node adds nothing). `{element:
   "boundary"}` matches exactly `b/start`, `b2/start`, `c/start`;
   `{element: "child"}` exactly `a`, `b`, `c`; `{ids: ["b"]}` the node
   `b`; `{within: "b"}` exactly `b`, `b/start`, `b/label`, `b/children_1`,
   `b1`, `b1/label`, the five bands of `b1`, `b2`, `b2/start`, `b2/label`,
   the five bands of `b2`, the other four bands of `b`.
7. **Bands of a root, a child and a segment without a line** (drawing.md
   §2.3), over `segment_line.json`: `{element: "band", class: "regions"}`
   matches exactly, in tree order, `a1/regions_1`, `a/regions_1`,
   `b1/regions_1`, `b2/regions_1`, `b/regions_1`, `c1/regions_1`,
   `c/regions_1`, `form/regions_1`; `{element: "band", class: "regions",
   inside: "band"}` (a default statement of drawing.md §4) the same list
   without `form/regions_1`, the root's; `{inside: "band"}` every key but
   exactly `block`, `form/card`, `form`, `form/name`, the five bands of
   `form`, and the boundaries and labels `form` holds directly, `a/label`,
   `b/start`, `b/label`, `c/start`, `c/label`, so the bands of the
   segments that are segment lines (`a`) and of those that are not (`a1`)
   are inside a band, and the root's are not.

The elements of manifests with several roots and groups are in `files.test.ts`.

## Bands (`bands.test.ts`)

`bands.ts` is the one module of band facts (drawing.md §2.2, §4 and §6.4,
timeskeleton's README "Groups and the `graphical` block" and "Identity"),
and `files.ts` holds the one predicate of reserved ids, `isReservedId`.
Every expected value below is read from those texts; the band order cases
are built so that each timeline's expected order differs from every other
candidate rule (the default, the root's entry, its parent's entry), so a
wrong rule cannot pass by coincidence. Variants carry their `graphical.order`
entries in their value before they are loaded (`loadText(dumps(…))`).

1. **Kinds and addresses.** `BAND_KINDS` is exactly `children`,
   `conversion_maps`, `markers`, `regions`, `flow_control`, the bands of
   the default band order in its order. `bandAddress("score", kind)` is
   `score/<kind>_1` for every kind, and `parseBand` of it gives back
   `{timeline: "score", kind}`; `parseBand("b/flow_control_1")` is
   `{timeline: "b", kind: "flow_control"}`. `parseBand` gives `null` for
   `score/regions_2` (every band is numbered 1), `score/region_1` (an
   element's id), `score/card` (a part), `score/regions_1/label` (a band
   has no parts), `regions_1` (no timeline), `/regions_1` (an empty one)
   and `score`.
2. **The reserved pattern.** `BAND_ID_PATTERN` is drawing.md §2.2's
   `^(markers|conversion_maps|children|regions|flow_control)_[1-9][0-9]*$`:
   it matches `regions_1`, `markers_1`, `conversion_maps_1`, `children_1`,
   `flow_control_1` and `regions_10`, and not `regions_0` (numbers start at
   1), `regions_01` (no leading zero), `regions` (no number), `region_1`
   (no kind), `regions_1x`, `x_regions_1` or `card`. `isReservedId` is
   true for every id the pattern matches and for the five part words
   `start`, `end`, `name`, `label`, `card`, and false for `regions_0`,
   `regions_01`, `regions`, `region_1`, `regions_1x` and `x_regions_1`.
3. **A band address is a part of its timeline.** In `map.json`, `elementOf`
   and `elementOfIn` give `melody` for `melody/regions_1` and
   `melody/children_1` (a root's band; read as an element id, it would be
   `melody/regions_1`), `phrase` for `phrase/conversion_maps_1` (a child's
   band follows the child's own id), and `melody/tempo` for `melody/tempo`
   (a map is still an element). `parseAddress` of
   `0000000000/melody/regions_1` is `{block: A, element:
   "melody/regions_1"}`, as it is for `0000000000/melody/card`, and
   `formatAddress` gives each text back.
4. **The default band order.** `defaultBandOrder("score")` is exactly
   `["score/children_1", "score/conversion_maps_1", "score",
   "score/markers_1", "score/regions_1", "score/flow_control_1"]`
   (drawing.md §4).
5. **Effective and inherited band orders** on `nested.json` (root `clt_1`,
   its child `clt_3`, its grandchild `clt_2`). Write `D(T)` for
   `defaultBandOrder(T)`, `R(T)` for `[T/children_1, T/markers_1, T,
   T/conversion_maps_1, T/regions_1, T/flow_control_1]` (the README's
   example: the marks above the line, the maps below it) and `K(T)` for
   `[T/flow_control_1, T, T/children_1, T/conversion_maps_1, T/markers_1,
   T/regions_1]`; the three are pairwise different.
   - Without `graphical.order`, `bandOrderOf` and `inheritedBandOrder` of
     each timeline `T` are `D(T)`: a root without an entry takes the
     default, and each descendant its parent's, band by band id.
   - With `{clt_1: R(clt_1)}` (a root with an entry): `bandOrderOf(clt_1)`
     is `R(clt_1)`, `inheritedBandOrder(clt_1)` is `D(clt_1)`; `clt_3` (a
     child following its parent band by band id) and `clt_2` both give
     `R(clt_3)` and `R(clt_2)` for both functions.
   - With `{clt_1: R(clt_1), clt_3: K(clt_3)}` (a grandchild under a child
     with an entry): `clt_1` as before; `bandOrderOf(clt_3)` is `K(clt_3)`,
     `inheritedBandOrder(clt_3)` is `R(clt_3)`; `clt_2` gives `K(clt_2)` for
     both, its parent's own entry and not the root's.
   - A member that is a child timeline: `group_child_member.json` (member
     `second-half`, a child of the root `piece`; member `recording`, a
     root) with `{piece: R(piece)}`: `bandOrderOf` and `inheritedBandOrder`
     of `second-half` are `R(second-half)`, its parent's and not the
     default of a root; `recording` gives `D(recording)`.
   - An id no timeline carries, `nothing`, gives `D(nothing)` for both.
6. **Band order problems.** `bandOrderProblem(manifest, id, value)` gives
   `null` for a band order and otherwise the message of the first problem,
   in the README's terms, ids quoted as JSON as timeskeleton's TypeScript
   validator quotes them: first the value's shape (not an array of
   strings), then a repeated entry (both refused by the schema before the
   identity rules run), then, in the README's order, an id naming no
   timeline, the entries that are neither the timeline's id nor one of its
   bands, in the value's order, and the id and bands missing from it, in
   the default band order's order. On `nested.json`, for `clt_3`:
   - `D(clt_3)`, `R(clt_3)`, `K(clt_3)` and `D(clt_3)` reversed give `null`;
   - `"clt_3"`, `null`, `{}` and `["clt_3", 1]` give `the band order of
     "clt_3" is not an array of strings`;
   - `D(clt_3)` followed by `clt_3` again gives `"clt_3" is repeated in the
     band order of "clt_3"`;
   - `D(clt_3)` followed by `clt_3/regions_2` gives `"clt_3/regions_2" is
     not "clt_3" or one of its bands`, and `D(clt_3)` with `clt_3/regions_1`
     replaced by `clt_1/regions_1` gives `"clt_1/regions_1" is not "clt_3"
     or one of its bands` (the stranger comes before the band it displaces,
     missing);
   - `D(clt_3)` without `clt_3/markers_1` gives `"clt_3/markers_1" is
     missing from the band order of "clt_3"`, and `[]` gives
     `"clt_3/children_1" is missing from the band order of "clt_3"`;
   - for the id `nothing`, `D(nothing)` gives `"nothing" names no group or
     timeline of this manifest`.
   The messages about strangers and missing entries are also the first
   problem timeskeleton's `identityProblems` reports for `nested.json`
   carrying that value under `graphical.order` (its `detail`), so core and
   the validators agree by construction, not only by transcription.
7. **Entries the schema's pattern refuses.** The schema document shapes
   each entry of an order (`Order`'s `items`): an id, or an id, `/` and a
   band's id. An entry outside that shape never reaches the identity
   rules: the validators refuse it at the entry, `["graphical", "order",
   "clt_3", <its index>]`, while `bandOrderProblem` checks no pattern and
   reports it as a stranger (its message is item 6's). What must hold is
   that both refuse exactly the same values. On `nested.json`, for
   `clt_3`, `D(clt_3)` followed by each of `clt_3/foo` (no band id),
   `clt_3/regions_0` (numbers start at 1), `clt_3/region_1` (`region` is no
   kind) and `clt_3/start` (a part word) gives `"<entry>" is not "clt_3" or
   one of its bands`, and timeskeleton's `validate` of `nested.json` carrying
   that value under `graphical.order` throws `SchemaValidationError` at
   `["graphical", "order", "clt_3", 6]`, the appended entry, with the
   schema's pattern as its `detail` (`must match pattern "<P>"`, `P` read
   from the schema document's `Order`), not the stranger's message: the
   schema step refused it before the identity rules ran. Conversely,
   every value item 6 accepts for `clt_3` (`D(clt_3)`, `R(clt_3)`,
   `K(clt_3)` and `D(clt_3)` reversed) passes `validate`, and every value
   it refuses for `clt_3` fails it. The pattern refuses no band order the
   identity rules accept: the six strings a band order permutes each match
   it, since a timeline's id is an `Id` (no `/`, no control character).

## Workspace view, ids, addresses and order (`workspace.test.ts`, `workspace-ids-order.test.ts`)

The view is `{meta, settings, blocks}`. `createView()` returns exactly
`{meta: {format: "tilie-workspace", version: 4}, settings: DEFAULT_SETTINGS,
blocks: {}}` and `createView(settings)` the same with those settings.
`DEFAULT_SETTINGS` is exactly `{grid: {size: 8, snap: true}, blockDefaults:
{scale: 1, length: 400, spacing: 1, width: null, height: null}, graphical:
{}}`: the drawing specification's placement defaults plus the block's
scale. A band order is no placement: it lies in the manifest's
`graphical.order` (its own section below).

A block has exactly the twelve members `id`, `parent`, `index`, `x`, `y`,
`scale`, `length`, `spacing`, `width`, `height`, `places` and `manifest`;
the test lists the keys of an added block. Its `places` are checked in
their own section below. A block holds a manifest of the one shape and
records no kind of its own.

`checkWorkspace` runs by block id and pins exact codes and paths, each under
`["blocks", <id>, …]`: `parent_cycle` at `parent` and `invalid_index` at
`index` for two blocks naming each other as parent; `key_mismatch` and
`invalid_block_id` at `id` for a block `bad` stored under `C`;
`unknown_parent` at `parent`; a later `duplicate_index` at `index`;
`non_finite_number` at `x`; `non_positive_number` at `scale`, `length`,
`spacing` and `width` (a block's `width` and `height` are positive or null;
`height: null` passes); a block-manifest problem prefixed,
`region_end_before_start` at `["blocks", A, "manifest", "timelines", 0,
"regions", 0, "end"]` for `with_region.json` with its region's end set to 0.

`mintBlockId` consumes one byte per attempt, rejects bytes 252 through 255,
and maps accepted bytes through `0123456789abcdefghijklmnopqrstuvwxyz`; fixed
byte streams pin the exact ten-character result. Block ids match
`^[0-9a-z]{10}$` (`BLOCK_ID`).

Timeline prefixes (`TIMELINE_PREFIX`) are exactly `clt`, `dlt`, `cpt`, `dpt`,
`cgt` and `dgt`. `nextId(view, block, prefix, into?)` on a block of one root
returns the smallest `{prefix}_{N}`, `N` from 1, that no id in that block's
manifest carries, whatever the kind of the element carrying it and whatever
`into` names: on a block of `bare.json` it is `clt_1`; after children `clt_1`
and `clt_3` are added it is `clt_2`; after a conversion map `map_1` is added,
`nextId(view, A, "map")` is `map_2`. On a block that does not exist it is
`{prefix}_1`. Its scoping across several roots is in `files.test.ts`.

Addresses (`parseAddress`, `formatAddress`): `workspace` is `{block: null,
element: null}`; `0000000000` is `{block: A, element: null}`;
`0000000000/clt_1` is `{block: A, element: "clt_1"}`;
`0000000000/clt_1/start` splits at the first slash only, element
`clt_1/start`; `short` and `0000000000/` are refused with `invalid_address`
at `[<the text>]`. Formatting reverses every accepted parse.

Fractional indices (`indexBetween`, `indicesBetween`, `isIndex`) are
compatible with `fractional-indexing` 4.0.0 on the fixed base-62 alphabet:
the four published vectors give `a0`, `a1`, `Zz`, and `a0V`. Invalid keys and
unordered bounds are refused. Generated keys are valid and strictly between
valid bounds; generated batches have exactly the requested length and are
strictly increasing.

## Commands (`commands.test.ts`)

There are four commands. Each is aimed at **addresses**, and what it does is
decided by the **kind of its target**, resolved from the address alone, never
by the shape of its other members:

- `add {into, <kind>: value}` with exactly one kind member;
- `set {changes: [{target, values: {…properties}}, …]}`, one change per
  target, at least one change, at least one property in each `values`; the
  properties are a member of their own, so no property (a jump's `target`
  among them) can collide with the change's `target`;
- `remove {targets: [address, …], gap?: {side, verb}}`, at least one
  target; with `gap` (`side` `left` or `right`, `verb` `extend` or
  `shift`, nothing else) exactly one;
- `style {select, set, name?, blocks?}`.

`apply(view, command)` is pure (every test deep-freezes its input view, so a
mutation throws) and returns the new view or a `CommandError` `{code,
message, path}`. A command is **atomic**: a refusal of any change, target or
block refuses the whole command. Ids are never settable. There is no resize
command: scaling, sizing the box and stretching are gestures that `set`
different block properties.

**A `set` that changes nothing writes nothing.** The store journals every
command it accepts, and Cancel counts every journaled command as a change,
so a `set` whose view, its edited manifests settled, holds exactly what the
view before holds is refused: `invalid_value` at its first value's
`[target, property]`, message "the command changes nothing". The two views
are compared as JSON, member by member, so a value written another way but
stored the same (`[4, 2]` for `[2, 1]`) changes nothing too, and so does a
`set` whose changes undo each other. The rule judges the whole command, never
one value: a `set` in which some values change nothing and others change
something is accepted, since gestures state values beside the ones they
change (a stretch states the place of every item it stretches, the
Properties form one value on every selected element). The other three
commands are not judged by it.

### The targets, one table per kind

| Kind | Address | `set` (value) | `add` into it | `remove` |
|---|---|---|---|---|
| workspace | `workspace` | `grid`: an object of `size` (positive, finite) and `snap` (boolean), the members given replacing those members; `blockDefaults`: an object of any of `scale`, `length`, `spacing` (positive, finite), `width`, `height` (positive, finite, or null), the members given replacing those members; `graphical`: a `graphical` block, whole | `block` | `not_removable` |
| block | `<block>` | `x`, `y` (finite); `index` (a fractional index no sibling of the same `parent` holds); `scale`, `length`, `spacing` (positive, finite); `width`, `height` (positive, finite, or null); `manifest` (a manifest, whole) | none | yes, with every block whose `parent` chain reaches it |
| group | `<block>/<group id>` | `order` (its display order, or null); `place` (see `places.test.ts`) | none | yes, the group only (see `files.test.ts`) |
| timeline, a root | `<block>/<id>` | `name` (string or null); `length` (a bare value on its axis, or null: not known); `locked` (boolean); `meta` (an object); `place` (an ungrouped root's place, a member's card size); `order` (its band order, or null; see `places.test.ts`) | `child`, `map`, `region`, `break`, `jump`, `marker` | yes, with its subtree and what goes with it (see `files.test.ts`) |
| timeline, a child | `<block>/<id>` | as a root (`place` a member's card size only), and `offset` (a bare value on its parent's axis) | as a root | as a root |
| conversion map | `<block>/<root>/<id>` | `map` (the payload, whole, its `id` unchanged) | none | yes |
| region | `<block>/<root>/<id>` | `name` (string or null); `start`, `end` (bare values); `meta` (an object) | none | yes |
| break | `<block>/<root>/<id>` | `coordinate` (a bare value); `control_type`, `condition` (strings the schema checks); `repeat_count` (an integer); `label`, `name` (string or null); `meta` (an object) | none | yes |
| jump | `<block>/<root>/<id>` | `from_coordinate`, `to_coordinate` (bare values); `control_type`, `condition`, `repeat_count`, `label`, `meta` as a break's; `target` (a marker id of the same timeline, or null) | none | yes |
| marker | `<block>/<root>/<id>` | `name` (string or null); `coordinate` (a bare value) | none | yes |

`<root>` is the id of the root whose tree holds the element. An own-axis
value is bare and read under the number type of the axis it lies on (the
timeline holding the element; a child's offset on its parent's):
`invalid_coordinate` at `[address, property]` for what that number type does
not read, and stored normalized (`[2, 4]` as `[1, 2]`, an integer on a
`float` axis as that float).

The values of an `add`: a `block` is `{id, manifest, x, y}` plus any of
`index`, `scale`, `length`, `spacing`, `width` and `height`, the
others taken from `settings.blockDefaults`, `parent` null, `places`
given or `{}`, and `index` after the greatest index among the blocks
without parent unless given. A `child`
is a timeline carrying its `offset`; a `map`, `region`, `break`, `jump` or
`marker` is the element as its timeline stores it. Each may leave out what
has a default: the edited manifest is put in its complete form. The value
carries its id; the caller mints it (`mintBlockId`, `nextId`).

### What every accept path must leave (exact, against an expectation built from the fixture by hand)

1. `add` a block `{id: A, manifest: bare, x: 0, y: 0}` to `createView()`:
   the block is exactly `{id: A, parent: null, index: "a0", x: 0, y: 0,
   scale: 1, length: 400, spacing: 1, width: null, height: null, places:
   {}, manifest: <bare.json>}`; a second block
   `B` given `scale: 2` has index `a1` and scale 2; a block given `index:
   "Zz"` keeps it.
2. One `set` with the changes `{target: A, values: {x: 128, y: 64}}` and
   `{target: B, values: {x: 1, y: 2}}` moves both and changes nothing else.
3. One `set` change on `A` with `scale: 2, width: 120, height: null, length:
   800, spacing: 2` gives exactly those values; `x`, `y` and the manifest
   are unchanged.
4. `set` on `workspace`: `blockDefaults: {length: 640}` changes that default
   only; `grid: {snap: false}` changes `snap` only; `graphical` replaces the
   settings' block whole.
5. `set` on `A` with `manifest: <nested.json>` makes `A`'s manifest equal the
   loaded `nested.json`; a manifest with several roots and groups replaces a
   one-root manifest the same way (a block has no kind).
6. Timelines, on a block of `nested.json`: `name: "Score"` on the root;
   `meta: {composer: "Anon"}` on the root; root `length` `[12, 1]` (the end
   of `clt_3`) is accepted; `clt_3`'s `offset` `[6, 1]` gives offset `[6, 1]`
   and leaves the root at `[16, 1]`; `offset` `[10, 1]` grows the unlocked
   root to exactly `[18, 1]`.
7. `add` the child `{id: "clt_1", offset: [2, 4], unit: "quarters", length:
   [8, 1], locked: true}` (minimal) into the root `bare` of `bare.json`
   (length 8): the root's `children` are exactly that child in its complete
   form with the offset normalized to `[1, 2]`, and the root grows to exactly
   `[17, 2]`.
8. `add` the map `tempo` of `map.json` into the root of `bare.json`, then its
   map `ticks`: the root's `conversion_maps` are exactly `[tempo, ticks]`
   verbatim, kept in id order whichever is added first.
9. `set` on the map `melody/tempo` (block of `map.json`) with its payload
   changed to `scalar: [1, 4]` stores exactly that payload.
10. `remove` on a block of `map.json`: `A/phrase` removes the child with its
    map; `A/melody/tempo` removes that map; `A/melody` removes the root and
    leaves `timelines: []` (the block stays); `[A, B]` removes both blocks; a
    block whose `parent` is a removed block goes with it.
11. Regions, breaks, jumps and markers. Into the root of `bare.json`, `add`
    the region `{id: "region_1", name: "A", start: [2, 1], end: [4, 1]}`:
    the root's regions are exactly that one with `meta: {}`; `set`
    `bare/region_1` `end` `[6, 1]` and `name` null: exactly those values. On
    a block of `flow_control.json` (root `flow:quarters`; break `break_1` at
    12; jump `jump_1` from 8 to 2 targeting the marker `marker_1` at 2):
    `add` the marker `{id: "marker_2", name: "fine", coordinate: [12, 1]}`,
    then `set` `flow:quarters/jump_1`'s `target` to `marker_2`: the jump
    targets `marker_2` and the markers are exactly `[marker_1, marker_2]`;
    `add` a copy of `break_1` with the id `break_2` at `[3, 1]` and `remove`
    `flow:quarters/break_1`: the breaks are exactly that copy; `remove`
    `flow:quarters/jump_1`: no jump remains; `set` `marker_1`'s
    `coordinate` to `[2, 2]` stores `[1, 1]`.
12. `style` over blocks `A` (`map.json`) and `B` (`bare.json`), no `blocks`:
    `{select: {element: "map"}, set: {stroke: "#C00000"}}` gives `A` exactly
    `graphical: {styles: {}, statements: [{select: {element: "map"}, set:
    {stroke: "#C00000"}}]}` and leaves `B` unchanged (it has no map). Then
    `{select: {element: "map"}, set: {"stroke-width": 2}}` merges into that
    statement, `set: {stroke: "#C00000", "stroke-width": 2}`; the selector
    `{domain: "physical", element: "map"}` is a different statement, and a
    selector equal in canonical JSON (members in another order) merges. `set:
    {stroke: null}` removes `stroke`; removing the last property drops the
    statement (`statements: []`). With `blocks: [B]` and `name: "green"`,
    `{select: {element: "timeline"}, set: {stroke: "#00CC00"}}` gives `B`
    `graphical: {styles: {green: {stroke: "#00CC00"}}, statements: [{select:
    {element: "timeline"}, set: "green"}]}`. Without `name`, a merge into a
    statement whose `set` names a style turns it into a declaration: the
    style's properties with the new ones over them; the style itself is
    unchanged. With `name`, the properties are merged into that style (`null`
    removes) and the statement's `set` becomes the name; a style emptied by
    `null` is deleted with every statement naming it.

(The `graphical` blocks above are as the command leaves them; the settled
manifest holds them in their complete form, `order: {}` included.)

### Refusals: exact code and path

A refusal's path points at an **address** followed by the property or kind
at fault, or at a **manifest location** below a block: `[<block id>,
"manifest", …]`, after the block's manifest as the command would leave it
fails the schema or an invariant (the first problem). It never names a member
of the command, except where a command is malformed and so has no target.

- Malformed (`parseCommand`, `invalid_command` at the malformed member): an
  unknown `type` at `["type"]`; an `add` with no kind or two kinds at `[]`; an
  empty `changes` at `["changes"]`; a change whose `target` is not a string at
  `["changes", 0, "target"]`; a change without `values`, or with empty
  `values`, at `["changes", 0, "values"]`; a property outside `values` at
  `["changes", 0, "x"]`;
  an empty `targets` at `["targets"]`; a `style` without `select` at
  `["select"]`; a `blocks` entry that is not a string at `["blocks", 0]`. A
  `select` or a `set` (with `null` values removed) that the schema's
  `Selector` or `Declaration` refuses: `schema_violation` at `["select", …]`
  or `["set", …]`, e.g. `["set", "stroke"]` for `stroke: "red"`.
- Addresses: `invalid_address` at `["short"]`; `unknown_target` at
  `["0000000009"]`, at `[A + "/nothing"]` and at `[A + "/region_1"]` (an
  element other than a timeline or group needs its root).
- `set`: `id_not_settable` at `[A + "/clt_1", "id"]`; `unknown_property`
  at `[A, "colour"]`; `wrong_target_kind` at `["workspace", "x"]`, at `[A,
  "grid"]`, at `[A + "/clt_1", "offset"]` (a root's offset is not set by a
  command), at `[A + "/melody/tempo", "name"]` and at `[A +
  "/clt_1/region_1", "coordinate"]`; value refusals at `[address,
  property, …]`: `invalid_value` for `x: "1"`, `non_finite_number` for `x:
  Infinity`, `non_positive_number` for `scale: 0` and for `width: -5`,
  `invalid_index` for `a00`, `duplicate_index` for `B`'s index given to `A`,
  `non_positive_number` at `["workspace", "grid", "size"]` for size 0,
  `invalid_coordinate` at `[A + "/clt_1", "length"]` for the value `0.5` on
  the `fraction` axis and for `8` (an integer is no `fraction`), and at `[A
  + "/flow:quarters/break_1", "coordinate"]` for a coordinate dict (an
  own-axis value is bare), `locked` at `[A + "/clt_3", "length"]`,
  `length_below_content` at `[A + "/clt_1", "length"]` for `[23, 2]`,
  `child_exceeds_parent` at `[A + "/clt_2", "offset"]` for `clt_2`'s offset
  `[7, 1]` (its parent `clt_3` is locked, so it cannot grow to 17/2),
  `schema_violation` at `["workspace", "graphical", …]` and `[A, "manifest",
  "timeskeleton"]` for a manifest declaring `0.6.0`, `id_not_settable` at
  `[A + "/melody/tempo", "map", "id"]` for a payload with another id.
  Manifest locations: `negative_child_offset` at `[A, "manifest",
  "timelines", 0, "children", 0, "children", 0, "offset"]` for `clt_2`'s
  offset `[-1, 1]` (no command checks the sign itself; the invariant check
  of the manifest it would leave refuses it);
  `region_end_before_start`
  at `[A, "manifest", "timelines", 0, "regions", 0, "end"]` for
  `clt_1/region_1`'s end `[0, 1]` (`with_region.json`); `schema_violation`
  at `[A, "manifest", "timelines", 0, "flow_control", "jumps", 0, "target"]`
  for `jump_1`'s target `nothing` and when `marker_1`, which `jump_1`
  targets, is removed (`flow_control.json`).
- `add`: `wrong_target_kind` at `[A + "/melody/tempo", "child"]` (a map
  holds no child), at `[A + "/group_1", "region"]` (a group holds nothing;
  `group_number_types.json`) and at `["workspace", "child"]`;
  `invalid_block_id` at `["workspace", "block", "id"]` for `BAD`;
  `duplicate_id` at `[A]` for an existing block, at `[A + "/bare"]` for a
  child carrying the root's id and at `[A + "/bare/bare"]` for a map
  carrying it; `schema_violation` at `[A, "manifest", "timelines", 0,
  "regions", 0, "id"]` for a region id holding `/` and at `[A, "manifest",
  "timelines", 0, "children", 0, "unit"]` for a child in `seconds` added to
  the `quarters` root of `bare.json`; `schema_violation` at `[A,
  "manifest", "timelines", 0, "children", 0, "children"]`, at `[…,
  "children", 0, "children", 0]` and at `[…, "children", 0,
  "flow_control"]` for a child whose `children` is `5`, whose `children` is
  `[5]` and whose `flow_control` is `5` (the invariants read only a
  manifest the schema accepts, so a malformed value is refused, never
  thrown); `unknown_property` at
  `[B, "overrides"]` for a block value with that member; `invalid_value` at
  `[B, "x"]` when `x` is missing; `map_source_unit_mismatch` at `[A,
  "manifest", "timelines", 0, "conversion_maps", 0, "source_unit"]` for a
  map from seconds; `negative_child_offset` at `[A, "manifest",
  "timelines", 0, "children", 0, "offset"]` for a child of 4 at `[-1, 1]`
  added to the root of `bare.json`.
- `remove`: `not_removable` at `["workspace"]`; `unknown_target` at `[B]`.
- `style`: `unknown_target` at `[C]` for `blocks: [C]`.
- Atomicity: `set` with `{target: A, values: {x: 1}}` and `{target:
  "0000000009", values: {x: 2}}` is refused with `unknown_target` at `["0000000009"]`; `remove [A,
  C]` with `C` absent is refused; in both the frozen input is unchanged.
- A `set` that changes nothing, on every kind of target: each command one
  value, refused with `invalid_value` at `[address, property]`, message
  "the command changes nothing", the frozen input unchanged. Blocks `A` of
  `nested.json` and `B` of `bare.json` (added at `x: 0`, indices `a0` and
  `a1`, `width` null): `workspace` `grid: {size: 8}` and `blockDefaults:
  {length: 400}` (the defaults' own values) and `graphical: {}` (the
  default block); `A` `x: 0`, `index: "a0"`, `width: null` and `manifest`
  `nested.json` as loaded; the root `A/clt_1` (no name, `meta` `{}`,
  length `[16, 1]`) `name: null`, `meta: {}` and `length: [32, 2]`
  (stored `[16, 1]`: written another way, stored the same); its child
  `A/clt_3` `offset: [4, 1]`, its own; on `map.json`, the map
  `A/melody/tempo` `map` with its own payload; on `flow_control.json`, the
  marker `A/flow:quarters/marker_1` `coordinate: [4, 2]` (stored `[2, 1]`).
  Then three that judge the whole command, on `A` and `B`:
  - `{target: A, values: {x: 0}}` and `{target: B, values: {x: 7}}` is
    accepted: `B` at 7, `A` exactly as it was;
  - `{target: A, values: {x: 0}}` and `{target: B, values: {x: 0}}`, each
    value its block's own, is refused at `[A, "x"]`, the first value;
  - `{target: A, values: {manifest: <nested.json with clt_1 named
    "Score">}}` and `{target: A + "/clt_1", values: {name: null}}`, two
    changes undoing each other, is refused at `[A, "manifest"]`, the first
    value, though neither value is `A`'s as it stands.

### Locks by place

A timeline's place decides its lock where it is a segment or a segment
line placed inside something: a segment (a child of a segment line that is
no segment line itself) is never locked, its segment line's lock governing
it; a segment line that is a child, a segment or a group member is locked,
and lifting that lock is not supported yet. Every other timeline keeps its
own `locked`. `set locked` and `add child` follow the one rule: a value that
contradicts the place is refused, and an `add` places each timeline of the
value it adds with the lock its place decides. The rule never refuses a
`set locked` to the value the timeline already has, even where the
opposite value would be refused: alone, such a `set` changes nothing and
is refused as every such `set` is (`invalid_value`, message "the command
changes nothing", Commands); beside a value that changes something, it is
accepted. What proves it: each case
names a timeline whose place is one of these, and checks the exact `locked`
afterwards, or the exact code, path and message of the refusal, the view
unchanged (deep-frozen, so a mutation would throw).

1. **`set locked` on a segment.** In a block of `segment_line.json`,
   `locked: true` on `b1` is `segment_never_locked` at `[A + "/b1",
   "locked"]`, message `A segment is never locked: lock its segment line
   'b' instead.`; `locked: false` on `b1`, the lock every segment holds,
   changes nothing (refused as such at `[A + "/b1", "locked"]`).
2. **`set locked` on a segment line placed inside something.** In the
   same block, `locked: false` on `b` (a segment that is a segment line) is
   `unlocking_not_supported` at `[A + "/b", "locked"]`, message `Unlocking
   a segment line that is a child, a segment or a group member is not
   supported yet.`. The same refusal for
   `intro` of `segment_children.json` (a segment line that is a child of
   `piece`, no segment) and for the root `original_score:dgt_1` of
   `bundles/corpus_ieee1599.json` (a segment line that is a group member).
   Each of the three holds `locked: true`, so `locked: true` on it changes
   nothing (refused as such at `[A + "/<id>", "locked"]`).
3. **`set locked` to the value a timeline has.** In a block of
   `segment_line.json` whose file states `locked: false` on `b` (kept on
   reading, as only segments are unlocked), `locked: false` on `b` alone
   changes nothing and is refused as such at `[A + "/b", "locked"]`, never
   as `unlocking_not_supported`; `{locked: false, name: "Bridge"}` on `b`
   is accepted and leaves `b` `false` and named `Bridge`, the manifest
   otherwise equal to the one before; `locked: true` on `b` is accepted
   and leaves it `true`. Unlocking it again is then
   `unlocking_not_supported` at `[A + "/b", "locked"]`, as in case 2, so
   the acceptance is the no-op's and no lifted rule's.
4. **`set locked` elsewhere.** On the root `form` of `segment_line.json`
   (a segment line, neither a child nor a member) `locked: true` and then
   `locked: false` are both accepted, leaving `true` and then `false`.
5. **`add child` into a segment line.** Neither value stating `locked`
   (a segment line's segments are all segment lines or none): into the
   root `form` of `unknown_length_segments.json` (its length unknown), a
   child `d` of 4 at 20 holds `locked: false`; into the root `form` of
   `segment_line.json`, a child `e` of unknown length at 32 that is a
   segment line holding no segment holds `locked: true`. The same `d` stating `locked:
   true` is `segment_never_locked` at `[A + "/form", "child"]`, message `A
   segment is never locked: lock its segment line 'form' instead.`; the
   same `e` stating `locked: false` is `unlocking_not_supported` at the
   same path.
6. **`add child` of a subtree.** Into the root `bare` of `bare.json` (not
   a segment line), a child `sl` of 4 at 0 that is a segment line holding
   the segment `s1` of 4 at 0, neither stating `locked`, is added with
   `sl` locked and `s1` unlocked. The same value with `s1` stating `locked:
   true` is `segment_never_locked` at `[A + "/bare", "child"]`, message
   naming the line `sl`. A child that is no segment line added into a
   timeline that is no segment line keeps the lock it states (the accept
   paths above add `bare`'s root, locked, as a child).

## Several roots and groups (`files.test.ts`)

A manifest holds several root timelines (`timelines`) and groups, so what
core does for one root it does for each, and its element addresses are those
of the drawing specification, section 2.2, in every manifest alike: a
timeline, a group or the manifest by its bare id (unique together), every
other element (map, region, break, jump, marker) by `<root id>/<element id>`
(those ids are unique only within a root's tree), parts appended, the
manifest's title `name`. Test manifests: `groups/group_child_member.json`
(group `group_1` "Second half", display order `second-half`, `recording`;
root `piece` holds the member `second-half` at offset 8; root `recording`),
`groups/group_number_types.json` (group `group_1` "Edition", roots `page`,
`performance`, `score`, display order `score`, `page`, `performance`),
`groups/group_styled.json` (the same with `graphical` styles and statements
beside its `order`) and `bundles/bundle_mixed.json` (no id, name
"Mixed"; groups `group_1` "Performance", order `score`, `performance`, and
`group_2` "Facsimile", order `page`, `excerpt`; `excerpt` a child of root
`recording`; root `annotations` ungrouped; `score` holds the maps `cmap_1`,
`cmap_2` and the jump `jump_1` labelled "Repeat", `performance`, `page`
and `recording` the map `cmap_1` each, `excerpt` the map `cmap_2` (an id
of `recording`'s tree), and `annotations` the regions `region_1` "Verse"
and `region_2` "Chorus").

1. **Blocks hold any manifest.** A workspace holding blocks of `bare.json`,
   `group_child_member.json` and `bundle_mixed.json` writes and reads back
   deep-equal, and writes again to the same bytes; its file format is
   version 4.
2. **Invariants root by root.** `group_child_member.json` with
   `second-half`'s unit changed to `seconds` (its length written `8.0`, as
   the `float` axis of seconds represents it) is refused with exactly
   `schema_violation` at `["timelines", 0, "children", 0, "unit"]`, message
   `child 'second-half' has unit 'seconds', its parent 'piece' has
   'quarters'`: the path counts the roots of a manifest with a group.
3. **Elements of a group manifest.** `manifestElements(group_child_member)` is
   exactly (type, address, timeline, domain, modality, class, inside; `CLT`
   and `CPT` the continuous logical and physical classes; `B`, `G`, `T`,
   `A`, `W` stand for `block`, `group`, `timeline`, `ancestor`, `wedge` in
   the chains, `N` for `band`): `block`, all null, `[]`; `group group_1`,
   `[B]`, and `name group_1/name`, `[B, G]`, the timeline, domain, modality
   and class null (a frame and a title belong to no timeline); then the
   member `second-half` (display order first): `card second-half/card`
   (`second-half`, logical, continuous, CLT), `[B, G]`; its ancestor line
   `ancestor piece`, `[B, G, T]`, and `name piece/name`, `[B, G, T, A]`
   (`piece`, logical, continuous, CLT); the marks on it, `wedge
   second-half/start`, `[B, G, T, A]`, `label second-half/start/label`,
   `[B, G, T, A, W]`, `wedge second-half/end` and `label
   second-half/end/label` the same; then `timeline second-half`, `[B, G]`,
   `name second-half/name`, `[B, G, T]`, its bands `band
   second-half/children_1`, `band second-half/conversion_maps_1` and `band
   second-half/markers_1`, `[B, G, T]` (`second-half`, `null`, `null`, the
   kind), the markers band holding `wedge second-half/start` and `wedge
   second-half/end`, `[B, G, T, N]`, each followed by its label, `[B, G, T,
   N, W]` (all four `second-half`, logical, continuous, CLT), then `band
   second-half/regions_1` and `band second-half/flow_control_1`, `[B, G,
   T]`; then `recording` the same way without ancestors (`recording`,
   physical, continuous, CPT, its bands `recording`, `null`, `null`, the
   kind). So a member's drawing lists its card, its ancestor lines, each
   with its name and its two marks, each mark with its label, and then its
   own line as a root's: an ancestor line holds no band. A member that is a
   child in `timelines` is a `timeline` element in its drawing, and its
   bands are held by no band. The addresses `second-half/start`,
   `second-half/end` and their labels occur twice, once on the ancestor
   line and once on the member's own line. `{within: "piece"}` matches
   exactly `second-half/card`, the `piece` ancestor, its name, the four
   mark keys and every element of the line `second-half` (eighteen keys);
   `{element: "group"}` only the frame;
   `{element: "card"}` exactly `second-half/card`, `recording/card`;
   `{inside: "ancestor"}` exactly `piece/name` and the four mark keys, each
   with the chain above (so the wedges on the member's own line are not
   among them); `{element: "wedge", inside: "ancestor"}` the two marks;
   `{element: "name", inside: "ancestor"}` only `piece/name`; `{inside:
   "group"}` every key but the block and the frame.
4. **Elements of a named manifest with two groups.** The addresses of
   `manifestElements(bundle_mixed)` are exactly: the block (null); the
   title `name` (the manifest is named "Mixed" and has no id; a title is
   addressed `name` either way); `group_1`, `group_1/name`; `score/card`,
   then `score` with its name and its five bands, its conversion maps band
   holding its maps `score/cmap_1`, `score/cmap_2`, its markers band its
   wedges and wedge labels, and its flow control band its jump
   `score/jump_1` and the jump's label `score/jump_1/label`;
   `performance/card`, `performance` the same with the one map
   `performance/cmap_1` and no jump; `group_2`, `group_2/name`;
   `page/card`, `page` the same with `page/cmap_1`; `excerpt/card`,
   `recording` (type `ancestor`), `recording/name`, the marks
   `excerpt/start`, `excerpt/start/label`, `excerpt/end`,
   `excerpt/end/label`, then `excerpt` with its name and its five bands,
   holding its map `recording/cmap_2` (addressed by the root whose tree
   holds it) and its wedges and wedge labels, and nothing of `recording`'s
   own (`recording/cmap_1` is not drawn on an ancestor line, drawing.md
   §8.3, and an ancestor line has no bands); then the ungrouped root
   `annotations` with its card, name and five bands, its regions band
   holding the regions `annotations/region_1`,
   `annotations/region_1/label`, `annotations/region_2`,
   `annotations/region_2/label`, its markers band its wedges and wedge
   labels. A line's elements come in the order of item 1 of "Elements and
   selectors": its name, then its children, conversion maps, markers,
   regions and flow control bands, each followed by what it holds. The
   title, `annotations/card` and the line `annotations` are held by the
   block alone (chain `[block]`), the line's name by the block and the line
   (`[block, timeline]`). `memberDrawings`
   gives the frames `group_1` (`score`, `performance`) and `group_2`
   (`page`, `excerpt`, the latter with the one ancestor `recording`, offset
   its offset there) and the ungrouped roots `["annotations"]`.
5. **Addresses, one root and several.** In a block of `map.json` (one
   root): `manifestIds` is exactly `melody`, `phrase`, `melody/tempo`,
   `melody/ticks`; `elementOf` gives `melody/ticks` for `melody/ticks`,
   `phrase` for `phrase/name`, `melody` for `melody/end/label` and
   `melody/card`, and `name` for `name`; `set` reaches `A/melody/ticks` (a
   map of the child `phrase`, qualified by the root), and `A/ticks` and
   `A/phrase/ticks` are `unknown_target`. In a block of
   `group_number_types.json`, adding the region `region_1` (`[2, 1]` to
   `[4, 1]`) into `A/score` stores it in `timelines[2].regions`;
   `manifestIds` then holds exactly `group_1`, `page`, `performance`,
   `score` and `score/region_1`. `elementOf` of `score/region_1/label` is
   `score/region_1`, of `score/end/label`, `score/start` and `score/card`
   is `score`, of `group_1/name` is `group_1`; `elementOfIn(manifest)`
   gives the same answers, its root ids read once. `score/start` is never
   an element: adding a region with the id `start` into `A/score` is
   refused, `schema_violation` at `[A, "manifest", "timelines", 2,
   "regions", 0, "id"]` (timeskeleton reserves the part words), and so is
   a region with the id `card`, at the same path; and a `set` aimed at
   `A/score/start` is refused with `unknown_target` at `[A +
   "/score/start"]`. `unknown_target` also for `A/region_1` (an entry needs
   its root), `A/page/region_1` (not in page's tree) and
   `A/score/region_1/x`; `A/group_1` is a target, a group, which `set`
   refuses by kind (`wrong_target_kind` for `name`). `findTimeline`, the
   one reader of a timeline by id, searches every root's tree: in
   `bundle_mixed.json` it gives for `annotations` the object at
   `timelines[0]` and for `excerpt` the object at `timelines[3].children[0]`
   (the child of `recording`; the very objects, not copies), and
   `undefined` for `group_1` (a group), `name` (the title), `recording/excerpt`
   (an element address, not an id) and `nothing` (no element).
   `findEntry`, the one reader of a map, region, break, jump or marker by
   its address `<root>/<id>`, gives the kind and the very object: in
   `map.json` `melody/tempo` the map `timelines[0].conversion_maps[0]` and
   `melody/ticks` the map `timelines[0].children[0].conversion_maps[0]`
   (the child `phrase`'s, qualified by the root), both kind `map`; in
   `flow_control.json` `flow:quarters/break_1`, `…/jump_1` and
   `…/marker_1` the objects `flow_control.breaks[0]`, `jumps[0]` and
   `markers[0]` of `timelines[0]`, kinds `break`, `jump`, `marker`; in the
   view of `group_number_types.json` with `region_1`, `score/region_1` the
   object `timelines[2].regions[0]`, kind `region`. It gives `undefined`
   for `score` (a timeline), `group_1` (a group), `name` (the title),
   `region_1` (no root), `page/region_1` (not in page's tree),
   `score/region_1/label` (a part) and `score/nothing`.
6. **Commands.** `set` reaches a timeline at any depth: `name: "Late"` on
   `A/second-half` of `group_child_member.json` changes exactly
   `timelines[0].children[0].name`, and `name: "Intro"` on `A/score/region_1`
   that region's name. `add` the child `clt_1` (bare's root, locked, offset
   `[0, 1]`) into `A/score` of `group_number_types.json`: it is stored in
   `timelines[2].children`. `duplicate_id` is scoped like the ids: a child
   carrying `page` (a timeline of another root) at `[A + "/page"]`; a second
   `region_1` into `A/score` at `[A + "/score/region_1"]`; but `region_1`
   into `A/page`, another tree, is accepted. `style` with `blocks: [A]` on
   `group_styled.json`, `{select: {element: "ancestor"}, set: {opacity:
   0.5}}`, adds that statement after the manifest's three and keeps
   `styles` and `order`. The expected block is written out literally, so
   the test does not read what it checks: `order` exactly `{group_1:
   ["score", "page", "performance"]}`, `styles` exactly `{"frame-highlight":
   {stroke: "#7F00FF"}}`, and `statements` exactly `{select: {element:
   "group"}, set: "frame-highlight"}`, `{select: {element: "name", ids:
   ["group_1/name"]}, set: {fill: "#7F00FF"}}`, `{select: {element: "card",
   inside: "group"}, set: {rx: 2, shadow: "#C4B5FD"}}`, then the new one.
   The three must come out unchanged and in this order: statements cascade
   (a later one wins), so a reordered, merged or rewritten statement would
   draw differently, and the string `set` names a style that must still
   resolve. Without `blocks`, `{select: {element: "group"}, set: {stroke:
   "#C00000"}}` reaches the two blocks holding a group and not the one-root
   block beside them.
7. **Delete deletes.** `remove` takes any element, timelines and groups
   included, in every manifest, and `removedBy(manifest, elements)` names
   exactly what goes, which the arranger's Delete preview reads. Each effect
   on its own case, the expected values written out:
   - **A subtree, its ids in groups and orders.** `bundle_mixed.json`,
     `remove A/recording`: the roots are `annotations`, `page`,
     `performance`, `score`; `group_2`'s members are `["page"]` and its
     order `["page"]`; `group_1` and its order are unchanged. `removedBy`
     of `["recording"]` is exactly `{recording, excerpt,
     recording/cmap_1, recording/cmap_2}`: the subtree and the maps it
     holds, `recording`'s and `excerpt`'s.
   - **A child.** `group_child_member.json`, `remove A/second-half`:
     `piece` has no children; `group_1`'s members and order are
     `["recording"]`.
   - **Conversion maps naming a removed timeline.**
     `group_number_types.json` with the `InterpolationMap` `{id: "warp",
     source_id: "score", target_id: "performance", source_unit:
     "quarters", target_unit: "seconds", source_coords: [0.0, 12.0],
     target_coords: [0.0, 12.5]}` added into `A/score`, `remove
     A/performance`: `score`'s `conversion_maps` are `[]`. `removedBy` of
     `["performance"]` is exactly `{performance, score/warp}`.
   - **`ids` entries addressing a removed element.** `group_styled.json`
     with the statements `{select: {ids: ["page", "score/card"]}, set:
     {opacity: 0.5}}` and `{select: {ids: ["page/name"]}, set: {opacity:
     0.4}}` styled in, `remove A/page`: the first keeps `ids:
     ["score/card"]`, the second goes, the manifest's own three statements
     are unchanged.
   - **A group left without members stays; the last root leaves an empty
     array.** `group_number_types.json`, `remove` `A/page`,
     `A/performance` and `A/score` in one command: `timelines` is `[]`,
     `groups` is exactly `[{id: "group_1", name: "Edition", meta: {},
     members: []}]`, the order `{group_1: []}`.
   - **Deleting a group keeps its members.** `bundle_mixed.json`, `remove
     A/group_1`: the roots are unchanged, `groups` is `[group_2]`, the
     order holds `group_2` alone, and `memberDrawings` draws `annotations`,
     `performance` and `score` as ungrouped roots.
   - **Targets that go with another are not refused**: `remove
     [A/recording, A/excerpt]` gives the same manifest as `remove
     [A/recording]`.
8. **Ids for new elements** (`nextId(view, block, prefix, into?)`), on a
   block of `group_number_types.json` with `region_1` in `score`: `region`
   into `score` is `region_2`, into `page` `region_1`, without `into`
   `region_2`; after adding a region `clt_1` into `page`, `clt` into
   `score` is `clt_1` (a region of another tree does not count) and into
   `page` `clt_2`; after adding the child `clt_1` into `score`, `clt` into
   `page` is `clt_2` and into `performance` `clt_2` (timeline ids are unique
   across the manifest). The scopes are the validator's: a map, region,
   break, jump or marker id is unique within its root's tree only, so it
   may equal a group's id or the manifest's; a timeline id may equal
   neither. On `bundle_mixed.json` given the id `edition`, `nextId` of
   `group` into `score` is `group_1`; a region `group_1` and a region
   `edition` added into `score` are each accepted, and a child `group_1`
   or `edition` added into `score` is `duplicate_id` at `[A + "/group_1"]`
   and `[A + "/edition"]`.

## Places, display orders and band orders (`places.test.ts`)

A block stores one drawing input beside its placement (drawing.md §1):
`places`, the stated places of its box's **items** and the stated sizes
and vertical stretches of its members' **cards**. An item is a group's frame or an ungrouped root's card
(drawing.md §8.1: a root no group names as a member and that contains no
member); a card key is the id of a group member, a root or a child
timeline. So a key of `places` is a group id, an ungrouped root's id or a
member's id. What a group or a timeline stacks is no placement: a group's
**display order** and a timeline's **band order** lie in the block's
manifest, as the entries of `graphical.order` keyed by the group's or the
timeline's id (timeskeleton's README, "graphical"), and each is set by
the property `order` of its group or timeline, both through one writer of
that entry. A place is `{x?, y?, length?, scale?, spacing?, width?, height?}`, `x`
and `y` finite, `length`, `scale`, `spacing` and the sizes positive, at
least one member stated and none null: a place without members is no
place, so it is never stored. A card's place states only `width`, `height`
and `spacing` (drawing.md §8.6: the length and scale a member is drawn
with are its group's, stated in the group's place, while its vertical
stretch is its own). These are proved by what a stored block holds after
commands and by what `checkWorkspace` reports for a view built as a read
file would be (a stale or invented key, or a card stating more than its
size and vertical stretch, must never reach a saved file, or the file would be refused on
reading).

Block `bundle0001` holds `bundles/bundle_mixed.json` (groups `group_1`
[performance, score], display order score, performance, and `group_2`
[excerpt, page], display order page, excerpt; ungrouped root
`annotations`; root `recording` holds the member `excerpt`, so it is no
item; `page`, `performance` and `score` are members, and so is the child
`excerpt`). The items are exactly `group_1`, `group_2` and `annotations`;
the card keys exactly `excerpt`, `page`, `performance` and `score`. Where a
case names `groups/group_child_member.json` (group `group_1` [recording,
second-half], `second-half` a child of the root `piece`, which is so no
item), its block is `bundle0001` too. Every view is deep-frozen. The band
orders below are `R` for the root `recording`, `["recording/markers_1",
"recording/children_1", "recording", "recording/conversion_maps_1",
"recording/regions_1", "recording/flow_control_1"]` (the default band
order with the markers band moved to the top and the conversion maps band
below the line), and `E` for its child `excerpt`, `["excerpt",
"excerpt/children_1", "excerpt/conversion_maps_1", "excerpt/markers_1",
"excerpt/regions_1", "excerpt/flow_control_1"]` (every band below the
line); `D(T)` is the default band order of `T`, `["T/children_1",
"T/conversion_maps_1", "T", "T/markers_1", "T/regions_1",
"T/flow_control_1"]`.

**The three properties, accepted** (expected values exact):

1. `set group_1 place {length: 300}`: `places` is `{group_1: {length:
   300}}`, and nothing else in the block changes (the block equals the one
   before with only `places` replaced).
2. Then `place {length: null, x: 12}`: `{group_1: {x: 12}}`: a value states
   a member, `null` unstates it, unnamed members are kept.
3. Then `place {x: null}`: `places` is `{}`: the emptied place is deleted,
   never stored as `{}`.
4. `set annotations place {x: -30, y: 4.5, width: 700, height: 120}`
   (an ungrouped root, negative and fractional positions allowed): exactly
   that place under `annotations`.
4a. **Scale.** `set group_1 place {scale: 1.5}`: `places` is exactly
   `{group_1: {scale: 1.5}}`; then `place {scale: null}`: `{}`. `set
   annotations place {scale: 1.5}`: exactly `{annotations: {scale: 1.5}}`.
4b. **A member's card size.** `set score place {width: 650, height: 120}`
   (a member that is a root): exactly `{score: {width: 650, height:
   120}}`; then `place {width: null}`: `{score: {height: 120}}`. In
   `group_child_member.json`, `set second-half place {width: 650, height:
   120}` (a member that is a child timeline): exactly `{"second-half":
   {width: 650, height: 120}}`.
4c. **Spacing, on every kind of key.** `set group_1 place {spacing:
   1.5}` (a group): exactly `{group_1: {spacing: 1.5}}`; `set annotations
   place {spacing: 1.5}` (an ungrouped root): exactly `{annotations:
   {spacing: 1.5}}`; `set score place {spacing: 1.5}` (a member's card):
   exactly `{score: {spacing: 1.5}}`, then `place {width: 650}`: `{score:
   {spacing: 1.5, width: 650}}`, then `place {spacing: null}`: `{score:
   {width: 650}}`.
5. `set group_1 order ["performance", "score"]`: `graphical.order` of the
   manifest is `{group_1: ["performance", "score"], group_2: ["page",
   "excerpt"]}`;
   `order: null` deletes the entry, `graphical.order` becoming exactly
   `{group_2: ["page", "excerpt"]}`, so `memberDrawings` then lists
   `group_1`'s members as `members` states them, `performance`, `score`.
6. **A band order.** `set recording order R` (a root): `graphical.order`
   is exactly the fixture's two display orders and `recording: R`, and the
   block equals the one before with only that member of its manifest
   replaced; then `set excerpt order E` (a child): those three entries and
   `excerpt: E`; then `set recording order null`: the two display orders
   and `excerpt: E` (the child keeps its own entry while its parent's goes,
   so it inherits nothing); then `set excerpt order null`: exactly the
   fixture's `graphical.order`. `set annotations order D(annotations)`
   stores `annotations: D(annotations)`: a value equal to what the timeline
   inherits is an entry like any other, deleted only by null. One `set` of
   `group_1`'s display order `["performance", "score"]` and `recording`'s
   order `R` writes both entries beside `group_2`'s; one `set` of
   `group_1`'s display order the fixture states, `["score",
   "performance"]`, and `recording`'s order `R` is accepted and writes
   exactly `recording: R` beside the fixture's two display orders (the
   command changes something, so its value that changes nothing is no
   refusal; Commands, "A `set` that changes nothing writes nothing").
6a. **One change, one journal entry, one undo step.** In a store (the
   injected clock) holding block `bundle0001` added by `add`, `dispatch` of
   `set excerpt order E` returns `null` and appends exactly one entry, `{command:
   <that set>, author: "Gerhardt", time: "2026-10-11T14:03:13.418Z"}`;
   `undo()` gives back the view before (the same object) and `redo()` the
   view after it (the same object), whose `graphical.order.excerpt` is
   `E`.

**Refusals** (exact code, path and, where one is fixed, message):

7. `set recording place {x: 1}` (holds a member, so neither an item nor
   a member): `not_an_item` at `["bundle0001/recording", "place"]`,
   message "recording is not drawn in a card of its own"; in
   `group_child_member.json`, `set piece place {width: 650}` the same at
   `["bundle0001/piece", "place"]`. A member's card states only its size:
   `set score place {x: 1}` is `not_an_item` at `["bundle0001/score",
   "place", "x"]`, message "score is a member: its card takes only width,
   height and spacing"; `{width: 650, length: 300}` at `[…, "place", "length"]`,
   `{scale: 2}` at `[…, "place", "scale"]`, and in
   `group_child_member.json` `set second-half place {x: 10}` at
   `["bundle0001/second-half", "place", "x"]`. Both refusals come before
   the value is read: `set recording place {x: "a"}` is `not_an_item` at
   `[…, "place"]` and `set score place {x: "a"}` at `[…, "place", "x"]`.
8. `set group_1 order ["score"]` (a member missing), `["score", "score"]`
   (a duplicate id), `["score", "performance", "score"]`, `["score",
   "annotations"]` and `"score"`: each `invalid_order` at
   `["bundle0001/group_1", "order"]`, message "order must list every
   member of group_1 once".
9. Place values at `[address, "place", member]`: `{x: "1"}` `invalid_value`,
   `{y: Infinity}` `non_finite_number`, `{length: 0}`, `{width: -1}`,
   `{scale: 0}`, `{scale: -1}`, `{spacing: 0}` and `{spacing: -1}`
   `non_positive_number`, `{depth: 1}` `unknown_property` (as every `set`
   object value names an unknown member); `place: 5` `invalid_value` at
   `[address, "place"]`; `place: {}` `invalid_value` at `[address,
   "place"]`, message "a place value states at least one member" (an empty
   value would journal a command that changes nothing, which Cancel would
   then count as a change).
10. **A band order that is none**, each refused whole with `invalid_order`
    at `["bundle0001/excerpt", "order"]` and, as message, the first problem
    in the terms of timeskeleton's README (`bandOrderProblem`, so core and
    the validators agree; ids quoted as JSON): `E` with
    `excerpt/flow_control_1` replaced by `recording/flow_control_1` (another
    timeline's band), `"recording/flow_control_1" is not "excerpt" or one
    of its bands`; `E` without `excerpt/regions_1`, `"excerpt/regions_1"
    is missing from the band order of "excerpt"`; `E` without `excerpt`
    itself, `"excerpt" is missing from the band order of "excerpt"`; `E`
    without `excerpt/markers_1` and `excerpt/children_1`, the first missing
    in the default band order's order, `"excerpt/children_1" is missing
    from the band order of "excerpt"`; `E` with `"excerpt/regions_2"`
    appended (a stranger before anything missing), `"excerpt/regions_2"
    is not "excerpt" or one of its bands`; a group's display order
    `["score", "performance"]`, `"score" is not "excerpt" or one of its
    bands`; `E` with `excerpt` appended again, `"excerpt" is repeated in
    the band order of "excerpt"` (a repetition comes before a stranger, as
    the schema's rule comes before the identity rules); `"excerpt"` and
    `[1, 2]`, which are no array of strings, `the band order of "excerpt"
    is not an array of strings`. On the root,
    `R` without `recording`: `"recording" is missing from the band order
    of "recording"` at `["bundle0001/recording", "order"]`.
10a. **A place or an order that changes nothing**, each refused as every
    `set` that changes nothing is (Commands): `invalid_value` at
    `["bundle0001/<id>", <property>]`, message "the command changes
    nothing".
    - `place {x: null}` on `annotations`, which has no place: unstating
      a member nothing states leaves `places` as it is. `place {width:
      650}` on `score` once `score`'s card states `{width: 650}`.
    - `set group_1 order ["score", "performance"]`, the display order the
      fixture states.
    - `set excerpt order E` once `excerpt: E` is stored: a band order
      equal to the timeline's own entry.
    - `order: null` where the group or timeline has no entry, so that it
      deletes nothing: the fixture states the display orders of `group_1`
      and `group_2` and no band order, so `set recording order null` (a
      root) and `set excerpt order null` (a child), and `set group_1
      order null` once a first `set group_1 order null` has deleted its
      entry (a group; the first is accepted, item 5). On `map.json`, which
      has no `graphical` at all (its complete form has none), `set melody
      order null` and `set phrase order null`: deleting an entry that is
      not there leaves the manifest as it is, never with an empty
      `graphical` added.

    In a store (the injected clock) holding `map.json` as block
    `bundle0001` added by `add`, `dispatch` of `set phrase order null`
    returns exactly that refusal, the view stays the same object and the
    journal keeps its one entry, the `add`.
11. The target's kind: `place` and `order` on the block,
    `wrong_target_kind` at `["bundle0001", "place"]` / `["bundle0001",
    "order"]`; a group keeps refusing every other property: `locked` on
    `group_1`, `wrong_target_kind` at `["bundle0001/group_1", "locked"]`.

**Pruning.** After every command, the blocks it touched keep only the
`places` keys that still name an item or a member, a member's place cut to
its `width`, `height` and `spacing` (dropped when nothing is left);
nothing else is dropped.

12. With `group_2` placed (`{x: 10}`) and the cards of `page` and
    `excerpt` sized `{width: 650}`, `remove group_2`: `places` is exactly
    `{page: {width: 650}}` (`page` is now an ungrouped root, an item, and
    keeps its size; `excerpt` is neither item nor member). `recording` now
    holds no member, so it is an item: `set recording place {x: 1}` is
    accepted.
13. A root becoming a member: with `annotations` placed (`{x: 1}`), `set
    bundle0001 manifest` to `bundle_mixed.json` with `annotations` added
    to `group_1`'s `members` and display order: `places` is `{}`. The same
    with `annotations` placed `{x: 1, scale: 2, spacing: 1.5, width:
    700}`: `places` is exactly `{annotations: {spacing: 1.5, width:
    700}}`, the card keeping its requested size and vertical stretch and
    nothing else.
14. `remove annotations` with `annotations` placed: `places` loses the
    key.

**Band orders go with their timelines.** A band order is an entry of the
manifest, so removing a timeline removes the entries keyed by it and by
each of its descendants (core's `withoutElements`, as for a group's
display order), and a statement's `ids` naming a band address follow the
removal as they follow a part address (`T/card`): the address goes with
its timeline, and a statement left without `ids` goes.

14a. With `recording: R`, `excerpt: E` and `annotations:
    D(annotations)` set: `remove excerpt` leaves `graphical.order`
    exactly `{group_1: ["score", "performance"], group_2: ["page"],
    recording: R, annotations: D(annotations)}` (its entry and its place in
    `group_2`'s display order go, its parent's entry stays); `remove
    recording` instead leaves exactly `{group_1: ["score", "performance"],
    group_2: ["page"], annotations: D(annotations)}` (the entry of its
    descendant `excerpt` goes with its own).
14b. With the statements `{select: {ids: ["excerpt/regions_1",
    "annotations/regions_1"]}, set: {display: "inline"}}` and `{select:
    {ids: ["excerpt/markers_1"]}, set: {display: "inline"}}` (each a
    `style` on `bundle0001`), `remove excerpt` leaves exactly the
    statements `[{select: {ids: ["annotations/regions_1"]}, set:
    {display: "inline"}}]`.
14c. **No id changes by a command.** Ids are never settable, so no
    command renames a timeline, and core renames neither an entry of
    `graphical.order` nor a band address in a statement (as it renames no
    `T/card`). A timeline's id changes only with a whole manifest (`set
    bundle0001 manifest`), which brings its own `graphical`. With
    `excerpt: E` and the statement `{select: {ids: ["excerpt/regions_1"]},
    set: {display: "inline"}}`, the stored manifest with `excerpt`
    renamed `fragment` in `recording`'s children, in `group_2`'s members
    and in its display order, its band order still keyed `excerpt`, is
    refused: `schema_violation` at `["bundle0001", "manifest",
    "graphical", "order", "excerpt"]`, message `"excerpt" names no group
    or timeline of this manifest`. The same with the entry rekeyed
    `fragment` and its entries renamed is accepted, and the statement is
    kept exactly as written, still naming `excerpt/regions_1`.

**A block's `places` as stored** (`checkWorkspace`, on a view
built as a file is, codes and paths under `["blocks", "bundle0001", …]`):

15. Readers: `places: []` `invalid_value` at `[…, "places"]`; a place
    `{}` and a place `null` `invalid_value` at `[…, "places", "group_1"]`;
    `{x: null}` `invalid_value` at `[…, "places", "group_1", "x"]`;
    `{x: Infinity}` `non_finite_number`, `{height: 0}`, `{scale: 0}` and
    `{spacing: 0}` `non_positive_number` at the member; `{depth: 1}` `unknown_member` at
    `[…, "places", "group_1", "depth"]`.
16. Keys, in code-point order: places `{score: {x: 1}, nowhere: …,
    group_1: …, recording: {x: 4}, page: {width: 650}}` give exactly
    `unknown_place` at `[…, "places", "nowhere"]` ("nowhere is no group,
    no ungrouped root and no member of block bundle0001"),
    `unknown_place` at `[…, "places", "recording"]` and `unknown_member` at
    `[…, "places", "score", "x"]` ("score is a member: its card takes only
    width, height and spacing", the code and path of a member a place does
    not know); `page`'s card size is no problem, and neither is a card
    place `{spacing: 1.5}`. A card place `{height: 2, scale: 1}` is refused
    at its `scale` and `{length: 3, width: 2}` at its `length`: the first
    member in place order. Keys are checked only once `places` read.
17. `add` a block with `places: {annotations: {y: 8}, score: {width:
    650}}` stores them as given; without them, `places` is `{}`; with
    `places: {score: {x: 1}}`, `unknown_member` at `["bundle0001",
    "places", "score", "x"]`, with `places: {recording: {x: 1}}`
    `unknown_place` at `["bundle0001", "places", "recording"]`, with
    `places: {group_1: {}}` `invalid_value` at `["bundle0001", "places",
    "group_1"]`: an `add` states its keys, so a key it gets wrong is
    refused, never dropped.

## Deleting a segment (`segments.test.ts`)

Removing a segment S from its segment line Λ leaves a gap, and the `remove`
names how it closes (`gap {side, verb}`). With l the length of S: **left
extend**, the segment before S grows by l; **right extend**, the segment
after S starts where S started and grows by l; **right shift**, every later
segment moves back by l and Λ shortens by l; **left shift**, Λ's offset in
its parent grows by l, the later segments move back by l and Λ shortens by
l, so the earlier segments move on by l in the parent while the later ones
keep their place there. A segment of unknown length ends at its successor's
offset (the last one at Λ's end); a length that is not known stays unknown.

What proves it: each way is applied to a line whose every number is known
and to one whose lengths are not, and the resulting offsets and lengths are
compared with values worked out by hand from the rule above, written out
literally; the permitted ways (`segmentGaps`) are compared with the reasons
the rule gives for each refusal, so the command and the list the menu reads
cannot disagree; the command is undone through the store. A test computing
its expectation from `withoutSegment` would restate the code, so none does.

Manifests: `segment_children.json` (root `piece`, 32 quarters, not a segment
line; its child segment line `theme` at 6 of length 12 holds `t1` at 0, `t2`
at 4 and `t3` at 8, each of length 4; every segment line is locked) and
`unknown_length_segments.json` (root segment line `form` of unknown length,
not locked; `a` at 0 of unknown length, `b` at 8 of length 6, `c` at 14 of
unknown length), each in block `A`. Their segments are no segment lines
and read unlocked (a segment's own lock has no meaning: its line's governs
it), so no neighbour's lock refuses an extend. A segment line that is a child is unlocked where a case
says so by its value stating `locked: false` before it is read: no command
lifts that lock yet, and these cases prove the gap rules for when one does.

1. **Known lengths**, `theme` unlocked, `remove A/t2` (l = 4)
   with each gap; `theme`'s children are then exactly `t1` and `t3`:
   - left extend: `t1` at `[0, 1]` of `[8, 1]`, `t3` at `[8, 1]` of
     `[4, 1]`, `theme` at `[6, 1]` of `[12, 1]`;
   - right extend: `t1` at `[0, 1]` of `[4, 1]`, `t3` at `[4, 1]` of
     `[8, 1]`, `theme` at `[6, 1]` of `[12, 1]`;
   - right shift: `t3` at `[4, 1]` of `[4, 1]`, `theme` at `[6, 1]` of
     `[8, 1]`;
   - left shift: `t1` at `[0, 1]`, `t3` at `[4, 1]`, `theme` at `[10, 1]`
     of `[8, 1]`.
   `movedBy` (what a way moves or resizes on its root's axis) is exactly
   `{t1}`, `{t3}`, `{theme, t3}` and `{theme, t1}` in that order: under
   left shift `t3` keeps its place in `piece` (14) although its offset
   changes.
2. **Unknown lengths**, `unknown_length_segments.json`,
   `remove A/b` (l = 6): left extend leaves `a` at `[0, 1]` of `null` and
   `c` at `[14, 1]` of `null`; right extend gives `c` at `[8, 1]` of
   `null`; right shift gives `c` at `[8, 1]` of `null`; `form`'s length
   stays `null` in all three. `remove A/c` (the last
   segment, its length not known, nor its line's): left extend gives `b` a
   length of `null`; right shift leaves `b` at `[8, 1]` of `[6, 1]`.
   `remove A/a` (its length is `b`'s offset, 8) right shift gives `b` at
   `[0, 1]` and `c` at `[6, 1]`.
3. **The permitted ways** (`segmentGaps`, in the order left extend, right
   extend, left shift, right shift, `null` where permitted):
   - `t2` with `theme` locked: `null`, `null` (its neighbours are
     segments, never locked), `its segment line theme is locked`, `its
     segment line theme is locked`;
   - `t1`, the first segment: `no segment precedes it` first; `t3`, the last:
     `no segment follows it` second;
   - `b` of `form`: `null`, `null`, `its segment line form is a root and has
     no offset to move`, `null` (neighbours of unknown length extend);
   - a refusal by the manifest's rules: `segment_line.json` with `b`
     stating `locked: false`, `b1` (a segment of `b`, itself a segment of
     `form`): left shift `segment "b" of segment line "form" does not start where the one
     before it ends`, right shift `segment "c" of segment line "form" does
     not start where the one before it ends` (the segment line cannot change
     its length inside `form`);
   - `segmentGaps` of `theme` in `segment_children.json` (no segment) is
     `undefined`.
4. **Refusals**, each exact code and path, the view unchanged:
   `remove A/t2` without a gap → `gap_required` at `[A/t2]`; `remove
   [A/t2, A/t3]` → `gap_required` at `[A/t2]`; with `theme` locked, left
   shift → `gap_not_permitted` at `[A/t2, "gap"]`; a gap on `A/intro`
   (a child of `piece`, no segment) and on `A/piece` (a root) →
   `wrong_target_kind` at `[<address>, "gap"]`; a gap with two targets →
   `invalid_command` at `["targets"]`; side `up` → `invalid_command` at
   `["gap", "side"]`; verb `grow` → at `["gap", "verb"]`; a member `by` → at
   `["gap", "by"]`; `segment_line.json` with `b` stating `locked: false`,
   `remove A/b1` right shift → `schema_violation` at `[A, "manifest", "timelines", 0,
   "children", 2, "offset"]`.
5. **What needs no gap**: a segment that goes with another target. `remove
   [A/theme, A/t2]` removes `theme` with its segments, and `remove [A,
   A/t2]` removes the block.
6. **Undo**: through a store, `remove A/t2` right shift is journalled as
   exactly `{type: "remove", targets: [A/t2], gap: {side: "right", verb:
   "shift"}}`; undo gives back the very view before it, redo the very view
   after it.
7. **Statements naming a removed timeline in `within`** go with it, for any
   removal: on `segment_children.json` styled with `{select: {element:
   "boundary", within: "theme"}, set: {opacity: 0.5}}`, `{select: {element:
   "boundary", within: "t1"}, set: {opacity: 0.4}}` and `{select: {element:
   "boundary", within: "coda"}, set: {opacity: 0.3}}`, `remove A/theme`
   leaves exactly the `coda` statement (`t1` goes with `theme`).

## The store and the journal (`store.test.ts`)

`createStore(workspace, {author?, clock?})` holds a `Workspace = {view,
journal, sessions}`. An `Entry` of a journal is a `CommandEntry` `{command,
author, time}` (the command as `parseCommand` normalizes it) or a
`SessionEntry` `{session, author, time}` (a closed editor session, below);
the author is `"Gerhardt"` by default, changed by `setAuthor`, and the time
`clock().toISOString()` (ISO 8601 UTC with milliseconds). The tests inject a
clock returning `2026-10-11T14:03:12.418Z` plus one second per call.

1. **Stamping.** Three accepted dispatches give exactly three entries with
   authors `Gerhardt`, `Gerhardt`, `Ada` (after `setAuthor("Ada")`) and
   times `…12.418Z`, `…13.418Z`, `…14.418Z`; `dispatch` returns `null`.
2. **Refusal.** A refused dispatch returns its `CommandError`, consumes no
   clock tick, leaves `view` the same object and `journal` unchanged, and
   calls no listener.
3. **Undo and redo.** After n dispatches, undoing k times gives views that
   are the same objects as after the (n − k)-th dispatch and the journal's
   first n − k entries, while `listed` still lists all n, the last k with
   no applied change; `redo` restores the same objects and entries; `canUndo`
   and `canRedo` follow exactly; undo and redo with nothing to do change
   nothing. A new dispatch after an undo discards the undone entries
   (`canRedo` false).
4. **Undo past the loaded view.** A store created from a workspace whose
   journal holds three entries (written by another store) undoes three
   times; each view deep-equals the other store's view after the same
   prefix, and the last equals `createView()`; redo then restores the
   original view, deep-equal.
5. **Listeners.** `subscribe(listener)` calls the listener once with the new
   view after every accepted dispatch, undo and redo; the returned function
   unsubscribes.

## Editor sessions (`sessions.test.ts`)

An editor is opened on an element with `store.open(target)`; the commands
made in it until `done()` or `cancel()` are its **session**. Opening, Done
and Cancel are store operations, never commands. The open editors are the
store's `editing` path, outermost first, each `{session, target, kind,
earlier}`. Every level (the main journal, then one per open editor) keeps
its own entries and undo state; `entries`, `listed`, `canUndo` and
`canRedo` show the innermost level only. A closed session is stored once,
`sessions[id] = {target, entries}`, and journalled on the level below as
one `SessionEntry` naming it: the target is never repeated in the entry.

A **change** is one command entry at any depth: an entry of a level, or an
entry of a session that a level's session entry names, recursively. A
session entry is never itself a change. A change's **owner** is the
innermost session whose own entries hold it. Undo and redo move by
**steps**: a change the level owns itself (a command of the open editor's
session, or of the main journal on the arranger) is a step of its own; a
change inside a closed session, at any depth, goes with the changes next
to it that the same session owns, a step being a maximal run of
consecutive changes owned by one closed session. Undo reverts the latest
applied step of the innermost level, redo re-applies its earliest undone
one, so redo mirrors undo step for step and on any level the undone
changes are the last ones in order. `entries` (and
`journal`, the main level's) are the entries holding at least one applied
change, a partly undone session by its unchanged entry; `listed` is every
entry of the level, undone ones included, each as `{entry, changes,
applied, children}`: how many changes it holds, how many of them are
applied, and for a session entry its own entries listed the same way. A
session entry is applied, partly undone or undone as `applied` equals
`changes`, lies between, or is 0. What would prove step-wise undo works
is that each undo restores the very view object the store held before the
step's first change was made (never a replay's copy), that the view between
two changes of one run is never shown while the view between two of the
open level's own changes is, that a session's own changes split by an
embedded session give one step per run, newest first, that a new command
keeps exactly the applied changes at every depth under the same ids, and
that the file then replays to the view.

The cases run on block `bundle0001` holding `bundles/bundle_mixed.json`
(groups `group_1` [performance, score] and `group_2` [excerpt, page], the
ungrouped root `annotations`), added by the store's first dispatch. "A
`set`" in an editor of `group_1` is `set bundle0001/score name` or
`set bundle0001/performance name`, both inside the group.

1. **Ids and kinds.** `mintSessionId(fill)` draws bytes from `fill` exactly
   as `mintBlockId` does (a byte below 252 gives the digit `byte % 36` of
   `0-9a-z`, others are skipped): bytes 0, 1, 35, 36, 252, 255, 71, 2, 3,
   4, 5, 6 give exactly `01z0z23456`; without `fill` the id matches
   `^[0-9a-z]{10}$`. `editorKindOf(view, address)`:
   `bundle0001` → `bundle`; `bundle0001/group_1` → `group`;
   `bundle0001/annotations` (a root) and `bundle0001/excerpt` (a child) →
   `timeline`; `workspace`, `bundle0001/name` (the title),
   `bundle0001/group_1/name`, `bundle0001/score/card` and an entry address
   of the manifest → `no_editor` "<address> has no editor" at
   `[<address>]`; `bundle0001/nothing` and `0000000009` → `unknown_target`
   at `[<address>]`.
2. **Done.** `open bundle0001/group_1` gives `editing` exactly one
   editor `{session: <ten characters>, target: "bundle0001/group_1", kind:
   "group", earlier: null}`, `entries` `[]`, `canUndo` false, the view
   unchanged (the same object). Two `set`s give `entries.length` 2 and an
   unchanged `journal` (the `add` only). `done()` leaves `editing` empty;
   the journal is the `add` plus `{session: <that id>, author: "Gerhardt",
   time: <the clock's next tick>}`; `sessions` is exactly `{<id>: {target:
   "bundle0001/group_1", entries: <the two command entries>}}`; the view is
   the one after both sets (the same object). The two `set`s are
   consecutive changes owned by the closed session, one run: `undo()`
   reverts both at once, giving the view at opening (the same object;
   the view after the first `set` is never shown), `journal` the `add`
   alone, `canUndo` true (the `add` precedes), and `listed` the `add`
   `{changes: 1, applied: 1}` and the session `{changes: 2, applied: 0}`
   whose children are both `set`s undone (0 of 1 each). `redo()` re-applies
   both: the view after both sets (the same object), the session listed 2
   of 2, `canRedo` false.
3. **Undo inside a session stops at its start.** In 2's editor after one
   `set`, two `undo`s leave `entries` `[]`, `listed` that one entry
   undone (`{changes: 1, applied: 0, children: []}`), the view at opening
   and the main journal untouched (the `add` alone).
4. **Cancel and its count.** Open, two `set`s, one `undo`:
   `changes` is 1 (a fresh session: `o = []`, `c` one entry). `cancel()`:
   `editing` empty, the view the object at opening, the journal and
   `sessions` deep-equal to those at opening, `listed` and `canRedo` as at
   opening. With no editor open `changes` is 0.
5. **Reopen while it is the latest entry: unfolded.** After 2's
   Done, `open bundle0001/group_1` again: `editing[0]` has 2's session id
   and `earlier` null; `entries` are 2's two entries (the same objects),
   `canUndo` true, `changes` 0, the journal is the `add` alone and
   `sessions` is `{}` (the open session is not closed). The reopened
   session's own changes are again the open level's, one step each: the
   first `undo` gives the view after 2's first `set` (the same object 2
   held) and `changes` 1, the second the view after the `add` (the same
   object) and `changes` 2, where on the arranger one `undo` reverted both
   (case 2); `done()` records nothing: the journal is the `add` alone, one
   entry shorter than after 2, and `sessions` is `{}`.
6. **Unfolded, then cancelled.** After 2's Done, reopening and one `undo`
   give `changes` 1 (`o` two entries, `c` the first of them, common prefix
   1); `cancel()` restores the journal (the `add` and the very same
   `SessionEntry` object), `sessions` deep-equal to after 2, and the view
   after both sets (the same object).
7. **Changes by common prefix.** In 5's unfolded editor, one `undo` and a
   new `set` give `changes` 2 (`o` two entries, `c` the first and a new
   one, common prefix 1: one discarded, one added).
8. **Reopen after a later entry: fresh.** After 2's Done, a
   main-level `set bundle0001 x 40`, then `open bundle0001/group_1`: a new
   session id (not 2's), `earlier` 2's id, `entries` `[]`, `canUndo` false,
   the journal three entries (the `add`, the session, the `set`). Opening
   `bundle0001/group_2` after 2's Done gives `earlier` null (no session of
   that target).
9. **Nested sessions.** `open bundle0001` (the bundle editor, kind
   `bundle`), one `set bundle0001/annotations name "A"`, `open
   bundle0001/group_1`, one `set`, `done()`: the bundle editor's `entries`
   are the command and one `SessionEntry` of the inner session; `done()`
   again: the journal is the `add` and one `SessionEntry` of the bundle
   session, whose `entries` are the command and the inner `SessionEntry`;
   `sessions` holds both. `replay(journal, sessions).at(-1)` deep-equals
   the store's view, and `replay` gives one view per entry of `journal`
   (length 3). On the main level the first `undo()` reverts the inner
   `set` only (the view after `set annotations`, the same object the
   bundle editor held before it opened the inner editor), the second the
   bundle's `set`, giving the view after the `add`: the two are owned by
   different sessions, so each is a run of its own.
10. **Cancel of a nested editor.** In 9, after the inner `set`, `cancel()`
    closes only the inner editor: `editing` is the bundle editor alone,
    `entries` its one command, the view the one after it (the same object);
    `done()` then journals a session of one entry.
11. **Opening refusals.** `open workspace` → `no_editor`; `open
    bundle0001/nothing` → `unknown_target`; inside `open bundle0001/group_1`:
    `open bundle0001/group_1` (the target itself) → `not_inside`
    "bundle0001/group_1 does not lie inside bundle0001/group_1" at
    `["bundle0001/group_1"]`; inside `open bundle0001`: `open bundle0001`
    → `not_inside`; a refused open changes neither `editing` nor the
    listeners' count. Done and Cancel with no editor open change nothing.
12. **Snapshot.** Open `bundle0001/group_1`, one `set`;
    `snapshot()` gives the view, a journal ending with a `SessionEntry`
    whose session (in the snapshot's `sessions`) is `{target:
    "bundle0001/group_1", entries: [<the set>]}`; `editing` still has one
    editor and `entries` still one. `readWorkspace(writeWorkspace(snapshot))`
    gives the same journal and sessions (deep-equal). Nested: in 9 before
    either Done, `snapshot()` folds the inner editor into the bundle
    session first; its journal is the `add` and one `SessionEntry`
    (`isSessionEntry` holds for its second entry) naming the bundle
    editor's session, whose entries end with a `SessionEntry` naming the
    inner editor's session, and `replay` of its journal and sessions
    deep-equals the view. With no
    editor open, `snapshot()` writes only applied changes: after 2's Done
    and one `undo` (the session's one run) its journal is the `add` alone
    and its `sessions` `{}`, while the store's `sessions` still holds the
    session, to redo; a partly undone session is written with its applied
    changes only (case 24).
13. **Listeners.** Each of `open`, a dispatch inside an editor, `undo`,
    `redo`, `done` and `cancel` calls the listener exactly once.
14. **The side-effect guard through the store.** In the editor
    of `bundle0001/group_1`: `set group_1 place {length: 300}` accepted;
    `set group_2 place {x: 10}` → `side_effect` at
    `["bundle0001/group_2"]`; `set score name "S"` accepted; `set
    annotations name "A"` → `side_effect` at `["bundle0001/annotations"]`;
    `set bundle0001 length 500` → `side_effect` at `["bundle0001",
    "length"]`, `width 900` accepted; `style {select: {element:
    "timeline"}, set: {stroke: "#FF0000"}}` → `side_effect` at
    `["bundle0001", "manifest", "graphical", "statements"]`, with `select:
    {ids: ["score"]}` accepted; `open bundle0001/group_2` → `not_inside`.
    A refused command journals nothing in the editor. In the editor of
    `bundle0001/group_2`, `remove excerpt` → `side_effect` at
    `["bundle0001/recording"]`, message "bundle0001/recording lies
    outside bundle0001/group_2: an editor changes only what it edits"
    (the member's parent, never the member, guard case 24), and the
    editor's `entries` stay `[]`; `remove page`, a root member, is
    accepted (guard case 26): the editor's `entries` hold that one
    `remove`, and the view's manifest has no timeline `page`, `group_2`'s
    `members` are `["excerpt"]` and `graphical.order.group_2` is
    `["excerpt"]`. In the bundle editor
    (`open bundle0001`), `remove bundle0001` → `side_effect` at
    `["bundle0001"]`, message "the removal of bundle0001 lies outside
    bundle0001: an editor changes only what it edits"; `editing` is still
    that one editor and its `entries` still `[]`.
15. **Done on an emptied unfolded session clears the redo stack below.**
    After the `add`, `open bundle0001/group_1`, `set score name "S"`,
    `done()` (the journal is the `add` and the session); a main-level `set
    bundle0001 x 40` and its `undo` (the redo stack holds that `set`,
    whose view was computed with the session applied); `open
    bundle0001/group_1` unfolds the session, `undo` empties it and `done()`
    records nothing. Taking the session off the main level changed that
    level, so `canRedo` is false, and `redo()` changes nothing: the journal
    is the `add` alone, the view deep-equals the view after the `add`
    (score named "Score"), and `replay(snapshot().journal,
    snapshot().sessions).at(-1)` deep-equals `snapshot().view`. Were the
    stale `set` redone, the view would keep score named "S" while its
    journal replays to "Score".

**Three nested sessions.** Cases 16 to 22 run the scenario of
three nested editors: `A` is the bundle editor of `bundle0001`, `B` the
group editor of `bundle0001/group_1`, `C` the timeline editor of
`bundle0001/score` (a member of `group_1`). Open `A`, `B`, `C`; in `C` the
change `c` = `set score name "c-name"`, Done; in `B` the change `b` = `set
performance name "b-name"`, Done; in `A` the change `a` = `set annotations
name "a-name"`, Done. The views right after `c`, `b` and `a` are kept as
`Vc`, `Vb`, `Va`, the view after the `add` as `V0`. The main journal is
then the `add` and one session entry `SA`, `sessions[SA].entries` `[SB,
a]`, `sessions[SB].entries` `[SC, b]`, `sessions[SC].entries` `[c]` (`SB`,
`SC` the session entries of `B`'s and `C`'s sessions), three changes in
all, each the one change its session owns, so each run is one change. "A
new command" on the arranger is `set bundle0001 x 40`.

16. **Three undos, the latest session first.** On the arranger, `listed`
    is the `add` (1 of 1) and `SA` `{changes: 3, applied: 3}`. `undo()`
    reverts `a`: the view is `Vb` (the same object), the journal still
    `[add, SA]`, `SA` listed `{changes: 3, applied: 2}` with children `SB`
    (2 of 2: `SC` 1 of 1, `b` 1 of 1) and `a` (0 of 1); the next `undo()`
    gives `Vc` (`SA` 1 of 3, `SB` 1 of 2, `b` 0 of 1), the next `V0` (`SA`
    0 of 3, `journal` the `add` alone), every one the same object.
    `canUndo` is still true there, since the `add` precedes; a fourth
    `undo()` reverts the `add` and `canUndo` is false. Four `redo()`s give
    `V0`, then `Vc`, `Vb`, `Va` (the same objects; `c` first, then `b`,
    then `a`), `canRedo` false.
17. **A new command keeps the applied changes, at every depth, under the
    same ids.** After one `undo()` (`a` undone), a new command: the
    journal is `[add, SA, <the set>]` with `SA` the same entry object;
    `sessions` has exactly the keys of `SA`, `SB`, `SC`;
    `sessions[SA].entries` is `[SB]`, `sessions[SB].entries` `[SC, b]`
    and `sessions[SC].entries` `[c]` (the same entry objects); `canRedo`
    is false. `replay` of the snapshot's journal and sessions deep-equals
    the view, the written file does not contain `a-name`, and it reads
    back deep-equal.
18. After two `undo()`s (`a`, `b`), a new command: `sessions[SA].entries`
    is `[SB]`, `sessions[SB].entries` `[SC]`, `sessions[SC].entries`
    `[c]`; the snapshot replays to the view.
19. After three `undo()`s, a new command: the journal is `[add, <the
    set>]` and `sessions` is `{}`.
20. **Reopening a partly undone session hands its undone changes to the
    editor.** After one `undo()` (`a` undone, `SA` the last entry holding
    an applied change), `open bundle0001` unfolds `SA`: `editing` is one
    editor with `SA`'s session id and `earlier` null, `entries` `[SB]`,
    `listed` `SB` (2 of 2) and `a` (0 of 1), `canRedo` true, `changes` 0,
    the view still `Vb` (the same object), the main journal the `add`
    alone. `redo()` gives `Va` (the same object) and `changes` 1 (the
    opening's applied changes `[c, b]`, now `[c, b, a]`). `cancel()`
    restores the main level exactly: the journal `[add, SA]` with the very
    same entry, `SA` listed 2 of 3, `canRedo` true, `sessions` deep-equal
    to before `open`, the view `Vb` (the same object); a `redo()` then
    gives `Va`.
21. **Inside an editor a closed sub-session undoes by its run and undo
    stops at the opening.** `open bundle0001`, `open bundle0001/group_1`,
    `set score name "S"`, `set performance name "P"`, Done: the bundle
    editor's `entries` are `[SB]`, whose two `set`s are one run of the
    closed `SB`. `undo()` reverts both: the view at the bundle editor's
    opening (the same object), `entries` `[]`, `SB` listed 0 of 2,
    `canUndo` false; a second `undo()` changes nothing (the same view, the
    main journal the `add` alone); `redo()` gives the view after both
    `set`s (the same object the group editor held), `SB` 2 of 2, `canRedo`
    false.
22. **Cancel's count counts changes.** The scenario without `a` (`A`
    closed with Done holding only `SB`): reopening `A` unfolds it with
    `changes` 0; one `undo()` reverts the nested `b` (the run `[b]` of
    `SB`; `c` is `SC`'s) and gives `changes` 1 (`[c, b]` at opening, `[c]`
    now); a new command in `A` (`set annotations name "z"`) discards `b`,
    rebuilds `SB`'s session as `[SC]` under the same id and gives
    `changes` 2 (`[c, b]` against `[c, z]`, common prefix 1): the
    comparison is by the command entries, which the rebuilt session keeps,
    never by the session objects. The bundle session's journal text counts
    nested changes: on the arranger the full scenario's `SA` is listed
    `{changes: 3}`.

**The interleaved scenario.** Cases 23 to 27 split a session's own changes
by an embedded session. With the editors `A`, `B` and `C` above: open `A`,
`a1` = `set annotations name "name-a1"`; open `B`, `b1` = `set performance
name "name-b1"`; open `C`, `c1` = `set score name "name-c1"`, `c2` = `set
score name "name-c2"`, Done; `b2` = `set performance name "name-b2"`,
Done; `a2` = `set annotations name "name-a2"`, then Done unless a case
keeps `A` open. The views right after each change are `Va1`, `Vb1`, `Vc1`,
`Vc2`, `Vb2` and `Va2`; `V0`, the view after the `add`, is also `A`'s
opening view. The six changes in order, `a1 b1 c1 c2 b2 a2`, are owned by
`SA SB SC SC SB SA`, so the runs are `[a1] [b1] [c1 c2] [b2] [a2]`. With
`A` closed the main journal is `[add, SA]`, `sessions[SA].entries` `[a1,
SB, a2]`, `sessions[SB].entries` `[b1, SC, b2]` and `sessions[SC].entries`
`[c1, c2]`. The names hold a hyphen, so a search of a file's text for one
never matches a session id (`[0-9a-z]` only).

23. **Five undos on the arranger: `a2`, `b2`, `c1 c2`, `b1`, `a1`.**
    `listed` is the `add` (1 of 1) and `SA` 6 of 6, its children `a1`,
    `SB` (4 of 4: `b1`, `SC` 2 of 2 holding `c1` and `c2`, `b2`) and `a2`.
    Each `undo()` gives, every view the same object: `Vb2` (`SA` 5 of 6,
    `a2` 0 of 1); `Vc2` (`SA` 4 of 6, `SB` 3 of 4, `b2` 0 of 1); `Vb1`
    (`SA` 2 of 6, `SB` 1 of 4, `SC` 0 of 2: `c1` and `c2` undone by the
    one undo, `Vc1` never shown); `Va1` (`SA` 1 of 6, `SB` 0 of 4); `V0`
    (`SA` 0 of 6). The journal is `[add, SA]` until the fifth, then the
    `add` alone; `canUndo` is still true (the `add` precedes) and a sixth
    `undo()` reverts the `add`. Redo mirrors undo: six `redo()`s give `V0`,
    `Va1`, `Vb1`, `Vc2`, `Vb2`, `Va2` (the same objects), `listed` after
    each deep-equal to `listed` before the matching undo, and then
    `canRedo` is false.
24. **A new command after undoing a run discards the whole run.** After
    three `undo()`s (`a2`, `b2`, then `c1` and `c2` together),
    `snapshot()` writes only the applied changes: its journal `[add,
    SA]`, its `sessions` exactly `SA` `[a1, SB]` and `SB` `[b1]`, no `SC`,
    replaying to the view, while the store's `sessions` still holds all
    three, to redo. A new command: the journal is `[add, SA, <the set>]`
    with `SA` the same entry object; `sessions` has exactly the keys of
    `SA` and `SB`, `sessions[SA].entries` `[a1, SB]` and
    `sessions[SB].entries` `[b1]` (the same entry objects); `canRedo` is
    false. The snapshot replays to the view, its written file contains
    `name-a1` and `name-b1` and none of `name-c1`, `name-c2`, `name-b2` and
    `name-a2`, and it reads back deep-equal. Loaded into a new store
    (`createStore` of the workspace read back), it keeps the owners: the
    next `undo()`s revert the move, then `b1` alone (`SB`'s run), then
    `a1` alone (`SA`'s), giving views deep-equal to `Vb1`, `Va1` and `V0`
    (the new store builds its own views, so not the same objects), with
    `canUndo` still true, since the `add` precedes. A load that gave a
    nested change the outermost session as its owner, rather than the
    innermost, would merge `a1` and `b1` into one step.
25. **In the open editor its own changes undo one at a time, a closed
    sub-session by its runs.** The scenario with `A` kept open and `a3` =
    `set annotations name "name-a3"` made after `a2` (view `Va3`): `A`'s
    `entries` are `[a1, SB, a2, a3]`; `a2` and `a3` are consecutive like
    `c1` and `c2`, but owned by the open level. Each `undo()` gives, the
    same objects: `Va2` (`a3`), `Vb2` (`a2`), `Vc2` (`b2`), `Vb1` (`c1`
    and `c2`), `Va1` (`b1`), then `V0` (`a1`) with `entries` `[]` and
    `canUndo` false; a seventh `undo()` changes nothing, and the main
    journal is the `add` alone throughout. Six `redo()`s mirror them:
    `Va1`, `Vb1`, `Vc2`, `Vb2`, `Va2`, `Va3`. Cancel is unchanged: after
    two more `undo()`s (`a3`, `a2`), `changes` is 5 (a fresh
    session: `o` none, `c` `[a1, b1, c1, c2, b2]`), and `cancel()` leaves
    `editing` `[]`, the view `V0` (the same object), the journal `[add]`,
    `sessions` `{}` and `listed` deep-equal to those before `A` opened.
26. **Reopened, a session's own changes are the open level's again; its
    closed sub-sessions keep their runs.** After the scenario (`A` closed)
    and one `undo()` on the arranger (`a2`), `open bundle0001` unfolds
    `SA`: `editing` is one editor with `SA`'s id and `earlier` null,
    `entries` `[a1, SB]`, `listed` `a1` (1 of 1), `SB` (4 of 4) and `a2`
    (0 of 1), `canRedo` true, `changes` 0, the view `Vb2` (the same
    object), the main journal the `add` alone. `redo()` re-applies `a2`
    alone (`Va2`, `changes` 1); each `undo()` then gives, the same
    objects, `Vb2` (`a2`), `Vc2` (`b2`), `Vb1` (`c1` and `c2`), `Va1`
    (`b1`) and `V0` (`a1`), `canUndo` false and `changes` 5 (`o` `[a1, b1,
    c1, c2, b2]`, `c` none). `cancel()` restores the main level exactly:
    the journal `[add, SA]` with the very same entry, `SA` listed 5 of 6,
    `canRedo` true, `sessions` deep-equal to before `open`, the view `Vb2`
    (the same object); a `redo()` then gives `Va2`.
27. **Loaded from its file, the scenario keeps its runs.** The scenario's
    written file (`A` closed, nothing undone), read back deep-equal to the
    snapshot and loaded into a new store (`createStore`), shows a view
    deep-equal to `Va2`. Each `undo()` then gives a view deep-equal to
    `Vb2` (`a2`), `Vc2` (`b2`), `Vb1` (`c1` and `c2` together, `Vc1`
    never shown), `Va1` (`b1`) and `V0` (`a1`); the new store builds its
    own views, so they are not the same objects. `canUndo` is still true
    there, since the `add` precedes. The file states no owner: the load
    derives each change's owner from the sessions, the innermost one
    whose own entries hold it. A load that gave every change no owner
    (`null`, as a command of the main journal has) would make each change
    a step of its own, and the third `undo()` would show `Vc1`. A load
    that gave a nested change the outermost session `SA` would revert all
    six at the first `undo()`. Case 24's reload catches only the second,
    since no run of two changes is left in the file it loads.

## Containment and the side-effect guard (`contains.test.ts`, `guard.test.ts`)

An editor changes only the element it edits and what that element holds;
the block's box adapting to it is no side effect. Two pure functions
decide it, and the store calls the second on every command made in an
editor, with the innermost editor's target.

`contains(manifest, container, element)` says whether an element address
(a part allowed) lies inside a timeline or a group. What it must get right
is the boundary drawing.md §2.2 draws with "Belongs to": a timeline holds
everything belonging to it or to a descendant, parts included, while an
ancestor line, drawn inside a member's card, carries the ancestor's
address and so belongs to the ancestor; a group holds its frame, its title
and what its members hold, never what their ancestors hold. The proof is
the exact list of contained addresses over a whole enumeration, which
catches an element wrongly in as well as one wrongly out.

`sideEffect(before, after, target)` returns the first change outside the
target as `side_effect`, message `<what> lies outside <target>: an editor
changes only what it edits`, or `null`. The rules are checked in a fixed
order and the first hit decides the path, so each rule is proved once by
its path, and the order by changes that hit several rules at once. The
manifest is compared on a projection that hides the edited element's own
object (a group's object and each member's), the entries of
`graphical.order` keyed by what it contains (the group's display order,
the band orders of the timelines it holds), and the statements and styles
that reach only inside elements; a test
that changes exactly one hidden thing must be accepted and a test that
changes exactly one visible thing must be refused at that thing's
address. An element the target contains in `before` and that no longer
exists in `after` is removed inside the target, never a difference. A
refusal and an acceptance are asserted as the whole result (`toEqual` on
the problem, `toBeNull`).

Block `bundle0001` holds `bundles/bundle_mixed.json` (groups `group_1`
[performance, score], display order score, performance, and `group_2`
[excerpt, page], display order page, excerpt; ungrouped root
`annotations`; root `recording` holds the member `excerpt` and is drawn
only as its ancestor line; the conversion maps `score/cmap_1`,
`score/cmap_2`, `performance/cmap_1`, `page/cmap_1`, `recording/cmap_1`
on `recording` and `recording/cmap_2` on `excerpt`, which the root's tree
addresses, the jump `score/jump_1` "Repeat" and the regions
`annotations/region_1` "Verse" and `annotations/region_2` "Chorus").
`R`, `E` and `D(T)` are the band orders of `places.test.ts`.
`before` is the view of that block alone,
added by `add`; `after` is reached by `apply` where the command exists,
otherwise built by replacing one member of `before`'s block (each case
says which). `G1` is `bundle0001/group_1`.

**`contains`** (`contains.test.ts`):

1. **A group.** Of the addresses of `manifestElements(bundle_mixed)`, in
   that order, `group_2` contains exactly `group_2`, `group_2/name`,
   `page/card`, `page`, `page/name`, the bands of `page` with what they
   hold (`page/children_1`, `page/conversion_maps_1`, `page/cmap_1`,
   `page/markers_1`, `page/start`, `page/start/label`, `page/end`,
   `page/end/label`, `page/regions_1`, `page/flow_control_1`),
   `excerpt/card`, `excerpt/start`, `excerpt/start/label`, `excerpt/end`,
   `excerpt/end/label`, `excerpt`, `excerpt/name`, the bands of `excerpt`
   with what they hold (`excerpt/children_1`, `excerpt/conversion_maps_1`,
   `recording/cmap_2`, `excerpt/markers_1`, `excerpt/start`,
   `excerpt/start/label`, `excerpt/end`, `excerpt/end/label`,
   `excerpt/regions_1`, `excerpt/flow_control_1`): never the ancestor
   line `recording` or its name. A band belongs to its timeline (drawing.md
   §2.2), so a member's five bands are in, empty ones too.
   `recording/cmap_2` is in although its address names `recording`: an
   address names the root whose tree holds a map, and the map belongs to
   `excerpt` (drawing.md §2.2); `recording`'s own map is not drawn on an
   ancestor line (§8.3) and so is not in the enumeration. `group_1`
   contains neither `group_2` nor `annotations/card`.
2. **A root holding a member.** `recording` contains exactly the elements
   of `excerpt`'s card: `excerpt/card`, `recording`, `recording/name`,
   `excerpt/start`, `excerpt/start/label`, `excerpt/end`,
   `excerpt/end/label`, `excerpt`, `excerpt/name`, and the bands of
   `excerpt` with what they hold, as in 1.
3. **A child.** `excerpt` contains exactly 2's list without `recording`
   and `recording/name`, its own map `recording/cmap_2` included. The
   ancestor's own map `recording/cmap_1` lies outside it too: `excerpt`
   does not contain it and `recording` does. The map belongs to
   `recording` (§2.2) but is not drawn in `excerpt`'s card (§8.3), so the
   enumeration lists above cannot show it; the second answer proves that
   the first is the boundary's, not that of an address `contains` does
   not know.
4. **Entries belong to the timeline holding them.** In `map.json`,
   `phrase` contains `melody/ticks` (its map) and not `melody/tempo`;
   `melody` contains both and `phrase/name`.
5. **Anything else contains nothing.** The title `name`, the map
   `melody/tempo`, the card `melody/card` and the unknown `nothing`
   contain not even themselves; no container contains the title or an
   unknown address; `group_1` does not contain `group_2` (an editor of
   `group_1` cannot open `group_2`'s).

**`sideEffect`, the exact cases** (`guard.test.ts`), each in the editor of
`G1` unless named:

6. `set group_1 place {length: 300}` (`places` replaced) → `null`.
7. `set group_2 place {x: 10}` (`places` replaced) → `side_effect` at
   `["bundle0001/group_2"]`, message `the place of bundle0001/group_2 lies
   outside bundle0001/group_1: an editor changes only what it edits`.
8. `set score name "S"` (`apply`) → `null`.
9. `set annotations name "A"` (`apply`) → `side_effect` at
   `["bundle0001/annotations"]`, message `bundle0001/annotations lies
   outside bundle0001/group_1: …`: the first element of the enumeration
   that differs is `annotations/card`, reported as its element.
10. `set bundle0001 length 500` (`apply`) → at `["bundle0001", "length"]`;
    `set bundle0001 {x: 40, y: -8, width: 900, height: 300}` (`apply`) →
    `null`.
11. `style {select: {element: "timeline"}, set: {stroke: "#FF0000"}}`
    (`apply`) → at `["bundle0001", "manifest", "graphical",
    "statements"]`; the same with `select: {ids: ["score"]}` → `null`.

**Each rule's path, once:**

12. **Settings.** `grid` replaced by `{size: 16, snap: true}` → at
    `["workspace", "grid"]`, message `the workspace setting grid lies
    outside …`, in `G1`'s editor and in the bundle editor `bundle0001`
    alike.
13. **Another block.** With a second block `0000000000` holding
    `bare.json`: `set 0000000000 x 50`, `add` of block `0000000001`
    (`bare.json`) and `remove 0000000000` (all `apply`) → at
    `["0000000000"]`, `["0000000001"]`, `["0000000000"]`, message `block
    0000000000 lies outside …`; the bundle editor refuses the move alike.
14. **Band orders.** A timeline's band order lies inside every editor
    that holds the timeline, and outside one that does not; outside, it
    is refused where a display order is, at `["bundle0001", "manifest",
    "graphical", "order"]`, message `the graphical order of block
    bundle0001 lies outside …` (each `after` by `apply`). `set excerpt
    order E` → `null` in the editors of `bundle0001/excerpt` (its own),
    `bundle0001/recording` (its parent's) and `bundle0001/group_2` (its
    group's); from there, `set excerpt order null` → `null` in the
    editor of `bundle0001/excerpt`. `set recording order R` → refused in
    the editor of `bundle0001/excerpt` (a descendant's: the parent's
    order changes the child's drawing, but the child's editor does not
    hold the parent) and in the editor of `bundle0001/group_2` (`recording`
    is the ancestor of a member, outside the group). In `G1`'s editor,
    `set score order ["score", "score/children_1",
    "score/conversion_maps_1", "score/markers_1", "score/regions_1",
    "score/flow_control_1"]` → `null` (a member) and `set annotations
    order D(annotations)` (an entry the fixture lacks) → refused.
15. **A top-level member.** The manifest's `name` replaced by `"Other"` →
    at `["bundle0001", "manifest", "name"]`.
16. **A named style.** After `style {select: {element: "timeline"}, set:
    {stroke: "#FF0000"}, name: "accent"}`, the same with `stroke:
    "#00FF00"` (`apply`, the statement unchanged) → at `["bundle0001",
    "manifest", "graphical", "styles"]`; with `select: {ids: ["score"]}`
    for both, the style is used only by an inside statement → `null`.
17. **A display order.** `graphical.order.group_1` replaced by
    `["performance", "score"]` → `null` in `G1`'s editor; at
    `["bundle0001", "manifest", "graphical", "order"]` in the editor of
    `bundle0001/score`.
18. **The edited element removed.** `remove G1` (`apply`) → at
    `["bundle0001/group_1"]`, message `the removal of bundle0001/group_1
    lies outside …`; the block removed (`remove bundle0001`) → the same.
    In the editor of the root `bundle0001/annotations`, `remove annotations`
    → at `["bundle0001/annotations"]`, message `the removal of
    bundle0001/annotations lies outside bundle0001/annotations: …`. In
    the bundle editor `bundle0001`, `remove bundle0001` → at
    `["bundle0001"]`, message `the removal of bundle0001 lies outside
    bundle0001: …`: an editor never removes the element it edits, whatever
    its kind.

**The order of the rules:**

19. With the second block of 13, the `style` of 11 without `blocks`
    touches both blocks and is refused at `["0000000000"]` (another
    block), not at the statements (the manifest).
20. One `after` with `grid` replaced, the block's `length` 500, `places`
    `{group_2: {x: 10}}` and the name of `annotations` "A" → at
    `["workspace", "grid"]`; without the grid → at `["bundle0001",
    "length"]`; without the length too → at `["bundle0001/group_2"]`;
    with the name alone → at `["bundle0001/annotations"]`.

**Statements, inside and outside:**

21. **Inside in both manifests.** `statementInside(manifests, element)`
    (from `workspace/guard.ts`) holds for a statement when every element
    it matches in each manifest is contained there. With `after`'s
    manifest built with `group_1`'s members `[performance]` (its display
    order removed), `{select: {ids: ["score"]}}` is inside `group_1` over
    `[before]` and outside over `[before, after]`; `{select: {element:
    "timeline"}}` is outside over `[before]`; `{select: {ids:
    ["nothing"]}}` matches nothing and is inside. Through `sideEffect`
    such an `after` is refused already at `["bundle0001/score"]`, since
    `score`'s object stands as `{id}` only while it is a member: a
    statement can move across the boundary only with a change the
    projection shows, so the rule is pinned on the helper.
21a. **Statements selecting bands.** A band belongs to its timeline
    (drawing.md §2.2), so a statement lies inside when every band it
    matches belongs to a timeline the editor holds. `style {select: {ids:
    ["excerpt/regions_1"]}, set: {display: "inline"}}` → `null` in the
    editors of `bundle0001/excerpt` and `bundle0001/recording`, and at
    `["bundle0001", "manifest", "graphical", "statements"]` in the
    editor of `bundle0001/score`; `style {select: {element: "band", class:
    "regions"}, set: {display: "inline"}}`, which matches the regions band
    of every timeline, → at the statements in `G1`'s editor and `null` in
    the bundle editor `bundle0001`.

**Editors of a timeline and of the bundle:**

22. **A child's editor.** In the editor of `bundle0001/excerpt`, `set
    recording name "R"` (`apply`) → at `["bundle0001/recording"]`; `set
    excerpt name "E"` → `null`.
23. **The bundle editor.** In the editor of `bundle0001`, `set
    annotations name "A"`, `set bundle0001 length 500`, the `style` of
    11, and `places` replaced by `{group_2: {x: 10}}` each → `null`; only
    rules 1 and 2 and its own removal (18) apply to it.

**The element a manifest refusal names:**

A refusal names a change outside the target, so of the differing
elements it names the first, in the enumeration's order, that the target
contains neither in `before` nor in `after`. A differing element the
target contains on one side only (a member joining or leaving its group)
is named only when nothing outside differs, as in 21.

24. **A member removed in its group's editor.** In the editor of
    `bundle0001/group_2`, `remove excerpt` (`apply`) → `side_effect` at
    `["bundle0001/recording"]`, message `bundle0001/recording lies
    outside bundle0001/group_2: an editor changes only what it edits`.
    The enumeration meets `excerpt/card` first, and `excerpt`'s stand-in
    does disappear, but that is a removal inside `group_2`; what lies
    outside is its parent `recording`, whose `children` lose it.
25. **A timeline's editor.** In the editor of `bundle0001/recording`,
    `set excerpt name "E"` (`apply`) differs only inside its subtree →
    `null`, while `remove excerpt` reaches `group_2`, which names it as a
    member → at `["bundle0001/group_2"]`, message `bundle0001/group_2
    lies outside bundle0001/recording: …`. In the editor of
    `bundle0001/excerpt`, one `set` naming `excerpt` "E" and `recording`
    "R" (`apply`) → at `["bundle0001/recording"]`, message
    `bundle0001/recording lies outside bundle0001/excerpt: …`: the
    change reaching the parent names the parent.

**Removals inside the target:**

A group's editor may remove a member that is a root: the member's
object and the group's `members` and display order all lie inside the
group, and nothing outside it names the member. A timeline's editor
hides its whole subtree, so removing a descendant shows nothing at all
in its projection; only what names the descendant from outside (a
group, 25) is refused. The proof is the manifest after the removal,
which must have lost the member everywhere the group held it, next to
the two removals that do reach outside.

26. **A root member removed in its group's editor.** In the editor of
    `bundle0001/group_2`, `remove page` (`apply`) → `null`; the manifest
    after has no timeline `page`, `group_2`'s `members` are
    `["excerpt"]` and `graphical.order.group_2` is `["excerpt"]`.
27. **Removals that reach outside stay refused.** In the same editor,
    `remove excerpt` → at `["bundle0001/recording"]` (24); `page` leaving
    `group_2` while it stays an ungrouped root (`after` built with
    `group_2`'s `members` `["excerpt"]` and its display order
    `["excerpt"]`) → `side_effect` at `["bundle0001/page"]`, message
    `bundle0001/page lies outside bundle0001/group_2: an editor changes
    only what it edits`: `page` then lies outside, its whole object
    standing where its stand-in stood.

**Geometry in the editors** (each `after` reached by `apply`):

A box's geometry inside an editor is what the editor edits. A member is
drawn with its group's length and scale (drawing.md §8.6), so these two
members of the group's place are the member's own, and its card's place
(size and vertical stretch) is its own. A horizontal stretch of the group
from a member's card keeps every requested width of the frame and of its
members' cards in proportion to its content (drawing.md §1), so the
group's `width` and every sibling card's `width` are the member's too. A
vertical stretch of the member's card keeps the frame's requested height in
proportion in the same way, so the group's `height` is the member's; the
group's `spacing`, and a sibling's `height` and `spacing`, are not. A group's editor holds its
frame's place and its members' card places; an ungrouped root's editor its
whole place. What proves the exception is narrow is a refusal beside every
acceptance: another member of the group's place, another member of a
sibling's card, another group's place, and the group's place in the editor
of a timeline that holds a member without being one.

28. **A member's editor.** In the editor of `bundle0001/score` (a member
    of `group_1`): `set group_1 place {length: 500}`, `set group_1 place
    {scale: 1.5}`, `set score place {width: 650}`, `set score place
    {spacing: 1.5, height: 120}` and one `set` of the first three → `null`
    each; with `group_1` placed `{x: 10}` before, `set group_1 place
    {length: 500}` → `null` (the members it may not change are
    unchanged). One `set` of `group_1` `place {length: 500, width: 900}`
    and `performance` `place {width: 650}` (the stretch with its
    proportional widths) → `null`; `set group_1 place {height: 300}` and
    one `set` of `group_1` `place {height: 300}` and `score` `place
    {spacing: 2}` (the card's vertical stretch with the frame's
    proportional height) → `null` each; with `performance` placed `{width: 650,
    height: 120, spacing: 1.5}` before, `set performance place {width:
    null}` → `null`. `set group_1 place {x: 10}` → `side_effect` at
    `["bundle0001/group_1"]`, message `the place of bundle0001/group_1
    lies outside bundle0001/score: an editor changes only what it edits`;
    `set group_1 place {spacing: 1.5}` → the same; `set performance place
    {spacing: 1.5}` and `set performance place {height: 120}` (another
    member of a sibling's card), and either beside the stretch's `set` of
    `group_1` `{length: 500}` in one command → at
    `["bundle0001/performance"]`, message `the place of
    bundle0001/performance lies outside bundle0001/score: …`; `set group_2
    place {length: 500}` and `set group_2 place {width: 900}` → at
    `["bundle0001/group_2"]`; `set page place {width: 650}` (a card of
    another group) → at `["bundle0001/page"]`.
29. **A child member's editor.** In the editor of `bundle0001/excerpt` (a
    child, a member of `group_2`): `set group_2 place {length: 500}` →
    `null`. In the editor of `bundle0001/recording`, which holds `excerpt`
    but is no member: the same `set` → at `["bundle0001/group_2"]`.
30. **A group's editor.** In `G1`'s editor, `set score place {width: 650,
    height: 120, spacing: 1.5}` and `set group_1 place {spacing: 1.5}` →
    `null` each.
31. **An ungrouped root's editor.** In the editor of
    `bundle0001/annotations`, `set annotations place {scale: 1.5, width:
    700}` → `null`.
32. **The bundle editor.** In the editor of `bundle0001`, `set bundle0001
    scale 2` → `null`: the bundle itself resizes.

## The workspace file (`file.test.ts`)

`writeWorkspace(workspace)` is timeskeleton's `dumps` (keys sorted) of
`{meta, settings, blocks, journal, sessions}`, format version 4;
`readWorkspace(text)` reads with timeskeleton's `parseJson` (lossless;
`parse` validates a manifest and does not apply to the workspace) and
returns a `Workspace` or a `LoadError`. An entry is exactly `{command,
author, time}` or `{session, author, time}` (chosen by the presence of
`session`); a session is exactly `{target, entries}`, its target an
address, its entries entries, at least one (Done never closes a session
without entries); a session id is ten characters of `0-9a-z`, as a key of
`sessions` and in an entry. Every session is reached exactly once from
`journal` through session entries.

1. **Round trip.** A workspace built by a store (blocks of `bare.json` and
   `map.json`, a move, a style, an undone command excluded) is written; the
   text read back deep-equals the workspace, and writing it again gives the
   same bytes. Its members are exactly `blocks`, `journal`, `meta`,
   `sessions`, `settings`; `meta` is exactly `{format: "tilie-workspace",
   version: 4}`; `sessions` is `{}`.
2. **Replay.** Replaying the read journal from `createView()` gives exactly
   the read `settings` and `blocks`.
3. **Refusals**, each exactly one problem `{code, path}`: text `{` →
   `invalid_json` at `[]`; `format: "other"` → `unsupported_format` at
   `["meta", "format"]`; `version: 5` → `unsupported_version` at `["meta",
   "version"]`; a top-level member `extra` → `unknown_member` at
   `["extra"]`; `meta.created` → `unknown_member` at `["meta", "created"]`;
   `settings.styles` → `unknown_member` at `["settings", "styles"]`; a
   block's `overrides` → `unknown_member` at `["blocks", A, "overrides"]`; a
   journal entry's `note` → `unknown_member` at `["journal", 0, "note"]`; no
   `journal` → `missing_member` at `["journal"]`; no `sessions` →
   `missing_member` at `["sessions"]`; a block's `x` given as `"0"` →
   `invalid_value` at `["blocks", A, "x"]`; a block's `blockKind` →
   `unknown_member` at `["blocks", A, "blockKind"]`; a block manifest
   declaring `0.6.0` → `schema_violation` at `["blocks", A, "manifest",
   "timeskeleton"]`; a block manifest with a region ending before it starts
   → `region_end_before_start` at its path below `["blocks", A,
   "manifest"]`; an entry time `yesterday` → `invalid_value` at
   `["journal", 0, "time"]`; an entry command of type `move` →
   `invalid_command` at `["journal", 0, "command", "type"]`.
4. **Version 3.** A version-3 file (the round trip's text with
   `version: 3`, each block given `order: ["children", "regions", "flow"]`
   and `bands: {}`, and `settings.blockDefaults` given the same `order`,
   as that format wrote them) is refused for its version alone: exactly
   one problem, `unsupported_version` at `["meta", "version"]`, message
   `workspace version 3 is not supported; this editor reads version 4
   only`. There is no migration.
5. **Sessions in the file.** On the text of a workspace whose journal is
   the `add` of block `A` holding `bundles/bundle_mixed.json` and one entry
   naming session `s = "session001"`, `{target: "<A>/group_1", entries:
   [<set A/score name "S">]}` (a store's two entries written, the second
   then moved into the session by editing the text, so the file is read
   without any editor), each change gives exactly the problems listed, `{code,
   path}` in this order (first every session entry in turn, the journal's,
   then each session's in key order: one naming no session is
   `unknown_session`, one naming a session an earlier entry named is
   `session_referenced_twice`; then every session not reached from the
   journal, in key order, `unreferenced_session`; nothing of this is
   checked while another problem stands): the journal entry naming
   `0000000099` instead of `s` → `unknown_session` at `["journal", 1,
   "session"]` and `unreferenced_session` at `["sessions", s]`; an extra session
   `0000000098` (holding `s`'s entries) that nothing names →
   `unreferenced_session` at `["sessions", "0000000098"]`; two sessions `0000000097` and
   `0000000098` naming each other and nothing else naming them →
   `unreferenced_session` at `["sessions", "0000000097"]` and at
   `["sessions", "0000000098"]` (exactly these two); `s`'s entries gaining
   a second entry naming `s` itself → `session_referenced_twice` at
   `["sessions", s, "entries", 1, "session"]`; an entry with both
   `command` and `session` → `unknown_member` at `["journal", 1,
   "command"]`; a session's `note` → `unknown_member` at `["sessions", s,
   "note"]`; a session without `target` → `missing_member` at
   `["sessions", s, "target"]`; a session target `nowhere` →
   `invalid_address` at `["sessions", s, "target"]`; the entry naming
   `Session001` (upper case)
   → `invalid_value` at `["journal", 1, "session"]`; a key `bad` of
   `sessions` → `invalid_value` at `["sessions", "bad"]`; `s`'s entries
   `[]` → `invalid_value` at `["sessions", s, "entries"]`, message "a
   session holds at least one entry". The unchanged
   text reads back to a workspace whose `replay(journal, sessions).at(-1)`
   deep-equals its view.
6. **Block manifests in either form.** The round-trip workspace's text with
   every block manifest written in its minimal form reads as a workspace
   deep-equal to the one read from the original text: a block holds the
   complete form.
7. **Places in the file.** A store's workspace of block `A` holding
   `bundles/bundle_mixed.json` with `set A/group_1 place {length: 300,
   scale: 1.25, spacing: 2}` and `set A/score place {width: 650, spacing:
   1.5}` is written; the text reads back deep-equal and writes the same
   bytes, `places` exactly `{group_1: {length: 300, scale: 1.25, spacing:
   2}, score: {width: 650, spacing: 1.5}}`. That text with `length: 300`
   added to `score`'s place is refused with exactly one problem,
   `unknown_member` at `["blocks", A, "places", "score", "length"]` (the
   code and path of a member a place does not know), message `score is a
   member: its card takes only width, height and spacing`; with `score`'s
   `spacing` `0`, `non_positive_number` at `["blocks", A, "places",
   "score", "spacing"]`;
   with `group_1`'s `scale` `0`, `non_positive_number` at `["blocks", A,
   "places", "group_1", "scale"]`.

## Properties (`properties.test.ts`, fast-check)

Commands of every kind, over every target kind (regions, breaks, jumps and
markers included), are generated against the current view from seeds (a
command kind and natural numbers), so a sequence stays valid input whatever the earlier
commands did. Targets are drawn from what the view holds plus unknown and
malformed addresses; properties from the target's table, another kind's
table and unknown names; coordinates on the axis, off it, negative and past
the end, and lengths of null; payloads include ones the schema refuses.
Each fixture starts as block `A` beside a block `B` of `bare.json`, in a
store with an injected clock. The fixtures are every manifest fixture of
the installed package; the generator draws timelines and groups by their
bare ids and the other elements by `<root id>/<id>`, and adds into the tree
of the timeline it targets. Among the commands are a group's or timeline's
`place` (members stated, a scale, a lone width and a lone spacing among
them, so a member's card size and vertical stretch too, unstated with
null, empty, unknown) and `order`: a group's display order (its members
turned, null, one missing) and a timeline's band order (its default band
order turned, null, one entry missing, another timeline's band in place
of its own, not an array), on groups, timelines, the block and unknown
targets, so every saved file also proves that no stale `places` key and
no stale entry of `graphical.order` survives a command.

1. After every accepted command `checkWorkspace` is empty, and every block's
   manifest saves and reloads deep-equal with identical text.
2. A refused command leaves the view the same object.
3. Undoing every entry restores every intermediate view (the same objects),
   and redoing every entry restores them again.
4. Replaying the journal from `createView()` gives `settings` and `blocks`
   deep-equal to the store's.
5. Every entry carries the author and the injected clock's time.
6. `writeWorkspace(readWorkspace(text))` equals `text` byte for byte, and the
   read workspace deep-equals the store's.
7. The generator reaches every refusal the commands produce on these
   targets: over a fixed sample (seed `20261011`, 100 sequences per fixture)
   the set of codes observed is exactly `child_exceeds_parent`,
   `duplicate_id`, `duplicate_index`, `gap_required`,
   `id_not_settable`, `invalid_address`, `invalid_coordinate`,
   `invalid_index`, `invalid_order`, `invalid_value`,
   `length_below_content`, `locked`, `map_source_unit_mismatch`,
   `negative_child_offset`, `non_finite_number`, `non_positive_number`,
   `not_an_item`, `not_removable`, `number_type_not_allowed`, `region_end_before_start`,
   `schema_violation`, `segment_end_fixed`, `segment_never_locked`,
   `unknown_property`, `unknown_target`, `unlocking_not_supported`,
   `wrong_target_kind`. `unlocking_not_supported` is reached in
   `bundles/bundle_shared_parent.json`, whose `exposition` and
   `recapitulation` are segment lines that are children of `score` and
   group members, locked by their place: the sample's `set {locked:
   false}` on each is refused, as the locks by place require (a value
   contradicting a segment line's place is refused, never its current
   one). The sample runs every fixture's 100 sequences in
   one test, measured at 3.5 to 6.4 s with the load averages of 3 to 8 of
   a full suite run beside other work, above Vitest's default 5 s; the test
   therefore carries an explicit timeout of 20 s, about three times the
   slowest measurement. The sample is kept whole rather than cut down: a
   smaller one would reach the catalogue only by the luck of the seed.
   The catalogue holds the codes of commands applied to a view; the
   refusals of the store's editors (`no_editor`, `not_inside`,
   `side_effect`) are pinned by the session and guard tests.

**Editing sequences.** The same fixtures, in the same store, run sequences
of up to 30 steps, each a seed with an operation: a command, opening an
editor, a reopen (the target of the latest session of the innermost
level, so the reopen rule unfolds it), a whole session (open, one or two
commands, Done), an unfold (reopen, undo until nothing is left to undo or
one step, Done), Done, Cancel, undo and redo. A command in an open editor is
mostly one that stays inside it (a name or a band order of a timeline it
holds, its place's `x`, `scale`, `spacing` or `width`, a group's display
order, for a member its group's `length` and `scale`, the box's width),
sometimes any generated command,
so the guard both accepts and refuses; a target to open is mostly one the
innermost editor holds, so editors nest, sometimes one outside it, one
without an editor or one naming nothing. Ten sequences per fixture.

8. A step that changes nothing (a refused command or opening, undo or redo
   with nothing to do, Done or Cancel with no editor open) leaves the view
   and the editing path the same objects.
9. After every other step, `replay(snapshot().journal,
   snapshot().sessions).at(-1)` deep-equals `snapshot().view`, and
   `readWorkspace(writeWorkspace(snapshot()))` deep-equals the snapshot
   (view, journal and sessions).
10. After every such step, redoing step by step on the innermost level as
    long as `canRedo` holds gives a snapshot whose journal replays to its
    view too; as many undos as there were redos then undo them again.
    Undone changes kept across a change of the level below them (a Done
    that took a session off it), or a partly undone session written with
    its undone changes, fail here. Once undone again, the view is the very
    object (`toBe`) the step left: undo returns to the level's recorded
    views, never to a rebuilt copy, and redo mirrors undo step for step, so
    a redo step other than the undo step it mirrors would stop elsewhere.
11. Cancel is exact. At every opening (an `open` or a `reopen` that opens
    an editor) the store's `view`, `journal`, `sessions` and `listed` are
    recorded, and a Done that closes an editor forgets the innermost
    record. A Cancel that closes an editor gives back that record: `view`
    the same object (`toBe`), `journal`, `sessions` and `listed`
    deep-equal, after any nesting, unfold or partial undo in between. A
    Cancel that left behind the undone changes of an unfolded session, or a
    Done's fold of a nested editor, fails here.
12. Undo and redo never split a run. After every step, in `listed` (the
    innermost level's entries), no session entry at any depth holds two
    adjacent command entries of which one is applied and the other undone:
    the consecutive changes one closed session owns are applied or undone
    together. The level's own entries are not checked, since they undo one
    at a time. An undo or redo moving by one change inside a closed session
    fails here as soon as it stops between two commands of one session.

Steps that change nothing are not checked again, since 8 proves they
leave the store as it was. The two property tests take about the same
time per fixture: measured in one run with a load average of 15, the
command sequences 18.4 s and the editing sequences 18.5 s over all
fixtures (about 33 ms per sequence each).

## Budgets (`budget.test.ts`)

The budgets time the code, so they do not run with the default suite, whose
files run in parallel with each other: `pnpm test` excludes this file and
`pnpm test:budget` (in `app/`) runs it alone, one file at a time
(`packages/core/vitest.budget.config.ts`).

A generated workspace of 300 blocks (the package's fixtures of one root in turn) with a journal
of 1,000 entries (300 `add`, 700 `set` moves): `readWorkspace` of its text,
validation included, takes at most 250 ms; `writeWorkspace` at most 250 ms;
one `dispatch` of a move at most 1 ms (the limits and the figures behind them
are in `decisions/0019-workspace-store-and-journal.md`). Each figure is the minimum of 5 runs after
one warm-up run, so it measures the code rather than the load of the
machine (the suite runs test files in parallel). A budget that
fails is reported, never loosened. With `TILIE_MEASURE=<file>` the test also
builds 10,000 blocks (10,000 entries) and writes the figures of both sizes,
with the text's size, into that file; the store's decision
(`decisions/0019-workspace-store-and-journal.md`) cites them.

## External gates

Strict type checking, Biome, dependency-cruiser and the whole Vitest suite
pass.
