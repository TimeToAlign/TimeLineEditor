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
   "/b2", "length"]`; `[6, 1]` (its own) is accepted; `null` is accepted
   and leaves `b` at `[12, 1]`.
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
discrete, a null unit has none. Manifests carry no class. `inside` is the key's **holder chain**: the types of
the elements holding it in the tree, outermost first. A key is made by
`elementKey`, `textKey` or `unownedKey` from its holder's key, never written
by hand, so the chain is the holder's chain followed by the holder's own
type; a segment that is not a segment line (type `null`) adds nothing to
the chains of what it holds. Two drawings of one address are two keys with
the same address and different chains, so `inside` is the only member that
can tell them apart.

1. **The enumeration of `map.json`** is exactly, in this order (type,
   address, timeline, domain, modality, class, inside; `CLT` stands for
   `ContinuousLogicalTimeline`): `block`, every other member `null`, inside
   `[]`; `card`, `melody/card`, `melody`, logical, continuous, CLT,
   `[block]`; `timeline`, `melody`, the same, `[block]`; `name`,
   `melody/name`, the same, `[block, timeline]`; `map`, `melody/tempo`, `melody`,
   physical, continuous, `ScalarMap`, `[block, timeline]`; `wedge`,
   `melody/start`, `[block, timeline]`, then its `label`,
   `melody/start/label`, `[block, timeline, wedge]`; `wedge`, `melody/end`
   and its `label` `melody/end/label` the same way (all four `melody`,
   logical, continuous, CLT); `child`, `phrase`, `phrase`, logical,
   continuous, CLT, `[block, timeline]`; `name`, `phrase/name`, the same,
   `[block, timeline, child]`; `map`, `melody/ticks`, `phrase`, logical, discrete,
   `QuartersToTicks`, `[block, timeline, child]`. The order is: the block,
   the root's card (a card has its timeline's domain, modality and class,
   and is held by the block beside the root's line, holding nothing), then
   per timeline in pre-order (children by offset, then id, never by key
   order) its line, its name, its maps, its regions, breaks and jumps each
   followed by its label, and after the root's own elements its two wedges
   with their labels. A map has no name and no label; a map whose
   `target_unit` is null has domain and modality `null`. Addresses follow
   the drawing specification, section 2.2: a timeline by its id, a map,
   region, break, jump or marker by `<root id>/<id>`, a part as
   `<address>/<word>`; an anonymous bundle has no title.
2. **Regions, breaks and jumps** are addressed below their root:
   `with_region.json` has exactly the region `clt_1/region_1`;
   `flow_control.json` the break `flow:quarters/break_1` and the jump
   `flow:quarters/jump_1`, and its labels are exactly
   `flow:quarters/break_1/label`, `flow:quarters/jump_1/label`,
   `flow:quarters/start/label`, `flow:quarters/end/label`. Markers are not
   drawn and are not elements. Every address of a one-root manifest's
   enumeration is distinct (it draws every element once).
3. **The title.** `bare.json` given a `name` "Piece" (no `id`) lists the
   key `{type: "name", address: "name", inside: ["block"]}`, every other
   member null, right after the block; given an `id` "edition" and no name
   the same key; given neither, no `name` key at the top.
4. **Matching.** Over `map.json`: `{}` matches all twelve keys; `{element:
   "map", domain: "physical"}` only `melody/tempo`; `{within: "phrase"}`
   exactly `phrase`, `phrase/name`, `melody/ticks`; `{ids: ["melody/tempo"]}`
   only that map; `{class: "QuartersToTicks"}` only `melody/ticks`;
   `{modality: "discrete"}` only `melody/ticks`; `{element: "card"}` only `melody/card`, and `{element: "card",
   domain: "logical"}` the same; a selector naming the block's address never
   matches (the block has none).
5. **`inside`** matches an element held at any depth by an element of the
   named type, never the holder itself. Over `map.json`: `{inside: "child"}`
   exactly `phrase/name`, `melody/ticks`; `{inside: "timeline"}` exactly
   `melody/name`, `melody/tempo`, `melody/start`, `melody/start/label`,
   `melody/end`, `melody/end/label`, `phrase`, `phrase/name`,
   `melody/ticks`;
   `{inside: "wedge"}` exactly the two wedge labels; `{inside: "block"}`
   every key but the block; `{inside: "card"}` and `{inside: "map"}`
   nothing (a card and a map hold nothing); `{element: "name", inside:
   "child"}` only `phrase/name`. A key built by hand with `inside:
   ["block", "group", "timeline", "ancestor"]` matches `{inside: "group"}`
   and `{inside: "ancestor"}` and not `{inside: "child"}`: the matcher reads
   the chain and nothing else.
6. **Segment lines** (`segment_line.json`: root `form`, segments `a`, `b`,
   `c`, each a segment line; `a` holds `a1`, `b` holds `b1` and `b2`, `c`
   holds `c1`, none of these a segment line). A segment that is a segment
   line is drawn as a child line without a name (its name is its label), so
   its node has type `child`; a segment that is not a segment line has no
   line and no name, its node has type `null`, so no selector naming
   `element` matches it. A segment that is not the first of its segment line
   (canonical order) has a `boundary` `<id>/start`, and every segment a
   `label` `<id>/label`, all three belonging to the segment, and boundary and
   label are held by the segment. The (type, address) list is exactly:
   `block`; `card form/card`; `timeline form`, `name form/name`, the wedges
   `form/start`, `form/start/label`, `form/end`, `form/end/label`; then in
   pre-order `child a`, `label a/label`; `null a1`, `label a1/label`; `child
   b`, `boundary b/start`, `label b/label`; `null b1`, `label b1/label`;
   `null b2`, `boundary b2/start`, `label b2/label`; `child c`, `boundary
   c/start`, `label c/label`; `null c1`, `label c1/label`. The boundary
   `b/start` is exactly `{type: "boundary", address: "b/start", timeline:
   "b", domain: "logical", modality: "continuous", class: CLT, inside:
   ["block", "timeline", "child"]}`, and `b2/start` has the same chain (the
   `null` node `b2` adds nothing). `{element: "boundary"}` matches exactly
   `b/start`, `b2/start`, `c/start`; `{element: "child"}` exactly `a`, `b`,
   `c`; `{ids: ["b"]}` the node `b`; `{within: "b"}` exactly `b`,
   `b/start`, `b/label`, `b1`, `b1/label`, `b2`, `b2/start`, `b2/label`.

The elements of manifests with several roots and groups are in `files.test.ts`.

## Workspace view, ids, addresses and order (`workspace.test.ts`, `workspace-ids-order.test.ts`)

The view is `{meta, settings, blocks}`. `createView()` returns exactly
`{meta: {format: "tilie-workspace", version: 2}, settings: DEFAULT_SETTINGS,
blocks: {}}` and `createView(settings)` the same with those settings.
`DEFAULT_SETTINGS` is exactly `{grid: {size: 8, snap: true}, blockDefaults:
{scale: 1, length: 400, spacing: 1, width: null, height: null, order:
["children", "regions", "flow"]}, graphical: {}}`: the drawing
specification's placement defaults plus the block's scale.

A block has exactly the members `id`, `parent`, `index`, `x`, `y`, `scale`,
`length`, `spacing`, `width`, `height`, `order` and `manifest`; the test
lists the keys of an added block. A block holds a manifest of the one shape
and records no kind of its own.

`checkWorkspace` runs by block id and pins exact codes and paths, each under
`["blocks", <id>, …]`: `parent_cycle` at `parent` and `invalid_index` at
`index` for two blocks naming each other as parent; `key_mismatch` and
`invalid_block_id` at `id` for a block `bad` stored under `C`;
`unknown_parent` at `parent`; a later `duplicate_index` at `index`;
`non_finite_number` at `x`; `non_positive_number` at `scale`, `length`,
`spacing` and `width` (a block's `width` and `height` are positive or null;
`height: null` passes); `invalid_order` at `order` for `["children",
"children", "flow"]`; a block-manifest problem prefixed,
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

### The targets, one table per kind

| Kind | Address | `set` (value) | `add` into it | `remove` |
|---|---|---|---|---|
| workspace | `workspace` | `grid`: an object of `size` (positive, finite) and `snap` (boolean), the members given replacing those members; `blockDefaults`: an object of any of `scale`, `length`, `spacing` (positive, finite), `width`, `height` (positive, finite, or null), `order` (the three band groups once each), the members given replacing those members; `graphical`: a `graphical` block, whole | `block` | `not_removable` |
| block | `<block>` | `x`, `y` (finite); `index` (a fractional index no sibling of the same `parent` holds); `scale`, `length`, `spacing` (positive, finite); `width`, `height` (positive, finite, or null); `order`; `manifest` (a manifest, whole) | none | yes, with every block whose `parent` chain reaches it |
| group | `<block>/<group id>` | nothing | none | yes, the group only (see `files.test.ts`) |
| timeline, a root | `<block>/<id>` | `name` (string or null); `length` (a bare value on its axis, or null: not known); `locked` (boolean); `meta` (an object) | `child`, `map`, `region`, `break`, `jump`, `marker` | yes, with its subtree and what goes with it (see `files.test.ts`) |
| timeline, a child | `<block>/<id>` | as a root, and `offset` (a bare value on its parent's axis) | as a root | as a root |
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
`index`, `scale`, `length`, `spacing`, `width` `height` and `order`, the
others taken from `settings.blockDefaults`, `parent` null, and `index` after
the greatest index among the blocks without parent unless given. A `child`
is a timeline carrying its `offset`; a `map`, `region`, `break`, `jump` or
`marker` is the element as its timeline stores it. Each may leave out what
has a default: the edited manifest is put in its complete form. The value
carries its id; the caller mints it (`mintBlockId`, `nextId`).

### What every accept path must leave (exact, against an expectation built from the fixture by hand)

1. `add` a block `{id: A, manifest: bare, x: 0, y: 0}` to `createView()`:
   the block is exactly `{id: A, parent: null, index: "a0", x: 0, y: 0,
   scale: 1, length: 400, spacing: 1, width: null, height: null, order:
   ["children", "regions", "flow"], manifest: <bare.json>}`; a second block
   `B` given `scale: 2` has index `a1` and scale 2; a block given `index:
   "Zz"` keeps it.
2. One `set` with the changes `{target: A, values: {x: 128, y: 64}}` and
   `{target: B, values: {x: 1, y: 2}}` moves both and changes nothing else.
3. One `set` change on `A` with `scale: 2, width: 120, height: null, length:
   800, spacing: 2, order: ["flow", "regions", "children"]` gives exactly
   those values; `x`, `y` and the manifest are unchanged.
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
  `invalid_order` for `["children", "children", "flow"]`, `invalid_index`
  for `a00`, `duplicate_index` for `B`'s index given to `A`,
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

### Locks by place

A timeline's place decides its lock where it is a segment or a segment
line placed inside something: a segment (a child of a segment line that is
no segment line itself) is never locked, its segment line's lock governing
it; a segment line that is a child, a segment or a group member is locked,
and lifting that lock is not supported yet. Every other timeline keeps its
own `locked`. `set locked` and `add child` follow the one rule: a value that
contradicts the place is refused, and an `add` places each timeline of the
value it adds with the lock its place decides. A `set locked` to the value
the timeline already has changes nothing and is accepted, even where the
opposite value would be refused. What proves it: each case
names a timeline whose place is one of these, and checks the exact `locked`
afterwards, or the exact code, path and message of the refusal, the view
unchanged (deep-frozen, so a mutation would throw).

1. **`set locked` on a segment.** In a block of `segment_line.json`,
   `locked: true` on `b1` is `segment_never_locked` at `[A + "/b1",
   "locked"]`, message `A segment is never locked: lock its segment line
   'b' instead.`; `locked: false` on `b1` is accepted and leaves it
   `false`.
2. **`set locked` on a segment line placed inside something.** In the
   same block, `locked: false` on `b` (a segment that is a segment line) is
   `unlocking_not_supported` at `[A + "/b", "locked"]`, message `Unlocking
   a segment line that is a child, a segment or a group member is not
   supported yet.`; `locked: true` on `b` is accepted. The same refusal for
   `intro` of `segment_children.json` (a segment line that is a child of
   `piece`, no segment) and for the root `original_score:dgt_1` of
   `bundles/corpus_ieee1599.json` (a segment line that is a group member),
   whose `locked: true` is accepted and leaves it `true`.
3. **`set locked` to the value a timeline has.** In a block of
   `segment_line.json` whose file states `locked: false` on `b` (kept on
   reading, as only segments are unlocked), `locked: false` on `b` is
   accepted and leaves `b` `false` and the manifest equal to the one before;
   `locked: true` on `b` is accepted and leaves it `true`. Unlocking it again
   is then `unlocking_not_supported` at `[A + "/b", "locked"]`, as in case 2,
   so the acceptance is the no-op's and no lifted rule's.
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
`recording`; root `annotations` ungrouped).

1. **Blocks hold any manifest.** A workspace holding blocks of `bare.json`,
   `group_child_member.json` and `bundle_mixed.json` writes and reads back
   deep-equal, and writes again to the same bytes; its file format is
   version 2.
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
   the chains): `block`, all null, `[]`; `group group_1`, `[B]`, and `name
   group_1/name`, `[B, G]`, the timeline, domain, modality and class null (a
   frame and a title belong to no timeline); then the member `second-half`
   (display order first): `card second-half/card` (`second-half`, logical,
   continuous, CLT), `[B, G]`; its ancestor line `ancestor piece`, `[B, G,
   T]`, and `name piece/name`, `[B, G, T, A]` (`piece`, logical,
   continuous, CLT); the marks on it, `wedge second-half/start`, `[B, G, T,
   A]`, `label second-half/start/label`, `[B, G, T, A, W]`, `wedge
   second-half/end` and `label second-half/end/label` the same; then
   `timeline second-half`, `[B, G]`, `name second-half/name`, `wedge
   second-half/start`, `wedge second-half/end`, `[B, G, T]`, each wedge
   followed by its label, `[B, G, T, W]` (all `second-half`, logical,
   continuous, CLT); then `recording` the same way without ancestors
   (`recording`, physical, continuous, CPT). So a member's drawing lists its
   card, its ancestor lines, each with its name and its two marks, each
   mark with its label, and then its own line as a root's. A member that is
   a child in `timelines` is a `timeline` element in its drawing. The
   addresses `second-half/start`, `second-half/end` and their labels occur
   twice, once on the ancestor line and once on the member's own line.
   `{within: "piece"}` matches exactly `second-half/card`, the `piece`
   ancestor, its name, the four mark keys and every element of the line
   `second-half` (thirteen keys); `{element: "group"}` only the frame;
   `{element: "card"}` exactly `second-half/card`, `recording/card`;
   `{inside: "ancestor"}` exactly `piece/name` and the four mark keys, each
   with the chain above (so the wedges on the member's own line are not
   among them); `{element: "wedge", inside: "ancestor"}` the two marks;
   `{element: "name", inside: "ancestor"}` only `piece/name`; `{inside:
   "group"}` every key but the block and the frame.
4. **Elements of a named manifest with two groups.** The addresses of
   `manifestElements(bundle_mixed)` are exactly: the block (null); the
   title `name` (the manifest is named "Mixed" and has no id; a title is
   addressed `name` either way); `group_1`, `group_1/name`; `score/card`, then `score`
   with its name, wedges and wedge labels; `performance` the same;
   `group_2`, `group_2/name`; `page` the same; `excerpt/card`, `recording`
   (type `ancestor`), `recording/name`, the marks `excerpt/start`,
   `excerpt/start/label`, `excerpt/end`, `excerpt/end/label`, then `excerpt`
   with its name, wedges and wedge labels; then the ungrouped root
   `annotations` with its card, name, wedges and wedge labels. The
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
     of `["recording"]` is exactly `{recording, excerpt}`.
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
journal}`. Every `Entry` is `{command, author, time}`: the command as
`parseCommand` normalizes it, the author (default `"Gerhardt"`, changed by
`setAuthor`), and `clock().toISOString()` (ISO 8601 UTC with milliseconds).
The tests inject a clock returning `2026-10-11T14:03:12.418Z` plus one second
per call.

1. **Stamping.** Three accepted dispatches give exactly three entries with
   authors `Gerhardt`, `Gerhardt`, `Ada` (after `setAuthor("Ada")`) and
   times `…12.418Z`, `…13.418Z`, `…14.418Z`; `dispatch` returns `null`.
2. **Refusal.** A refused dispatch returns its `CommandError`, consumes no
   clock tick, leaves `view` the same object and `journal` unchanged, and
   calls no listener.
3. **Undo and redo.** After n dispatches, undoing k times gives views that
   are the same objects as after the (n − k)-th dispatch, the journal's
   first n − k entries, and the undone entries on the redo stack; `redo`
   restores the same objects and entries; `canUndo` and `canRedo` follow
   exactly; undo and redo with nothing to do change nothing. A new dispatch
   after an undo clears the redo stack (`canRedo` false).
4. **Undo past the session's start.** A store created from a workspace whose
   journal holds three entries (written by another store) undoes three
   times; each view deep-equals the other store's view after the same
   prefix, and the last equals `createView()`; redo then restores the
   original view, deep-equal.
5. **Listeners.** `subscribe(listener)` calls the listener once with the new
   view after every accepted dispatch, undo and redo; the returned function
   unsubscribes.

## The workspace file (`file.test.ts`)

`writeWorkspace(workspace)` is timeskeleton's `dumps` of `{meta, settings,
blocks, journal}`; `readWorkspace(text)` reads with timeskeleton's
`parseJson` (lossless; `parse` validates a manifest and does not apply to the
workspace) and returns a `Workspace` or a `LoadError`.

1. **Round trip.** A workspace built by a store (blocks of `bare.json` and
   `map.json`, a move, a style, an undone command excluded) is written; the
   text read back deep-equals the workspace, and writing it again gives the
   same bytes. Its members are exactly `blocks`, `journal`, `meta`,
   `settings`; `meta` is exactly `{format: "tilie-workspace", version: 2}`.
2. **Replay.** Replaying the read journal from `createView()` gives exactly
   the read `settings` and `blocks`.
3. **Refusals**, each exactly one problem `{code, path}`: text `{` →
   `invalid_json` at `[]`; `format: "other"` → `unsupported_format` at
   `["meta", "format"]`; `version: 1` (with the blocks of that version's
   form, each carrying a `blockKind`) → exactly one problem,
   `unsupported_version` at `["meta", "version"]`, message `workspace
   version 1 is not supported; this editor reads version 2 only`, nothing
   else of the file read; `version: 3` the same; a top-level member `extra` → `unknown_member` at
   `["extra"]`; `meta.created` → `unknown_member` at `["meta", "created"]`;
   `settings.styles` → `unknown_member` at `["settings", "styles"]`; a
   block's `overrides` → `unknown_member` at `["blocks", A, "overrides"]`; a
   journal entry's `note` → `unknown_member` at `["journal", 0, "note"]`; no
   `journal` → `missing_member` at `["journal"]`; a block's `x` given as
   `"0"` → `invalid_value` at `["blocks", A, "x"]`; a block's `blockKind`
   → `unknown_member` at `["blocks", A, "blockKind"]`; a block manifest
   declaring `0.6.0` → `schema_violation` at `["blocks", A, "manifest",
   "timeskeleton"]`; a block manifest with a region ending before it starts
   → `region_end_before_start` at its path below `["blocks", A,
   "manifest"]`; an
   entry time `yesterday` → `invalid_value` at `["journal", 0, "time"]`; an
   entry command of type `move` → `invalid_command` at `["journal", 0,
   "command", "type"]`.
4. **Block manifests in either form.** The round-trip workspace's text with
   every block manifest written in its minimal form reads as a workspace
   deep-equal to the one read from the original text: a block holds the
   complete form.

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
of the timeline it targets.

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
   `not_removable`, `number_type_not_allowed`, `region_end_before_start`,
   `schema_violation`, `segment_end_fixed`, `segment_never_locked`,
   `unknown_property`, `unknown_target`, `wrong_target_kind`.
   `unlocking_not_supported` is not among them: the sample never sets
   `locked: false` on a segment line that is a child, a segment or a group
   member, and the command tests pin that code instead. The sample runs every fixture's 100 sequences in
   one test, measured at 3.5 to 6.4 s with the load averages of 3 to 8 of
   a full suite run beside other work, above Vitest's default 5 s; the test
   therefore carries an explicit timeout of 20 s, about three times the
   slowest measurement. The sample is kept whole rather than cut down: a
   smaller one would reach the catalogue only by the luck of the seed.

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
