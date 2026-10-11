# `@timetoalign/tilie-core` tests

`core` holds exact coordinates, one TimeSkeleton manifest (`{meta, timeline,
graphical?}`, timeskeleton 0.4.0), the command vocabulary as pure reducers,
an immutable workspace view of records, and the Yjs binding of one manifest
(`@timetoalign/tilie-core/yjs`). This file states what proves each part
works; a test that cannot be traced to a paragraph here does not belong in the
suite.

General rules: exact values only (`toEqual`/`toBe` against literal expectations
or against a value reached by another path); no thresholds; no network;
nothing written outside temporary state. Manifests come from the fixtures
shipped by the installed `@timetoalign/timeskeleton` package
(`fixtures/0.4.0/`, 34 files) or are built through commands; a manifest
literal appears only where a rejection is asserted.

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
   stored coordinate.
4. **Coordinates mirror the library.** `coordinateFromDict` and
   `coordinateToDict` follow `timetoalign.core.retrieval.coordinate_from_dict`
   / `coordinate_to_dict` and `timetoalign.core.time.number_from_json` /
   `number_to_json`: an `int` value reads a JSON integer, or an integral JSON
   number as that integer; a `float` value reads a JSON number, or an integer
   as the float it equals exactly; a `fraction` value reads only a pair of
   integers with a positive denominator; every integer is int64-bounded. One
   accepted and one refused example per rule, refused ones carrying the
   `CoordinateError` code `invalid_coordinate`. `coordinateToDict` writes
   numbers as `parse` reads them: an `int` value as a plain number (a
   `bigint` beyond 2^53), a `float` value as a plain number or, when
   integral, a `JsonFloat` (so 3 is written `3.0`), a `fraction` value as a
   normalized `[numerator, denominator]` pair.
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

Reading, writing and the canonical member order are
`@timetoalign/timeskeleton`'s (`parse`, `dumps`, `canonicalOrder`) and are
proven in its own suite; these tests prove that `core` uses them so that
nothing is lost. In a loaded manifest every number is a `JsonNumber`: a plain
number for a safe integer or a float with a fractional part, a `bigint` beyond
2^53, a `JsonFloat` for an integral float (`600.0`).

1. **Fixture round trip.** There are exactly 34 files in `fixtures/0.4.0/`.
   For each, `saveManifest(loadManifest(text))` equals `text` byte for byte.
   No skip, no normalization in the comparison.
2. **Shared rejections.** For every case in `fixtures/rejections/*/`, the
   rejected manifest, written as JSON text, is refused by `loadManifest` with
   exactly one problem whose `path` equals the case's `path`.
3. **Migration.** The only migration pair ending at 0.4.0 is `0.3.0-to-0.4.0`;
   its `before.json` loads and saves as its `after.json` byte for byte. The
   `split` fixture, a 0.3.0 envelope with two top-level timelines, is refused
   with exactly `{code: "migration_failed", path: ["manifest", "timelines"]}`
   and a message containing `split`. A 0.2.0 file whose measure has the class
   `Bar` instead of `RegularMeasure` is refused with `migration_failed` at the
   path of that class, `["manifest", "timelines", <id>, "measure_map",
   "measures", 1, "class"]`.
4. **Exact integers.** `discrete_logical.json` with its length value `480`
   replaced by `9007199254740993` (2^53 + 1) loads as the `bigint` and saves
   byte-identically; `continuous_logical.json` with its length Fraction
   numerator `12` replaced by `9007199254740993` loads as
   `[9007199254740993n, 2]` and saves byte-identically.
5. **Save goes through the canonical order.** Markers named `"\u{1F3B5}"` (a
   surrogate pair in UTF-16) and `"～"`, set in that order by commands, are
   written with `"～"` first: code-point order, the reverse of JavaScript's
   default sort.
6. **A child of another number type** (a float child of a Fraction parent,
   length `4.0`) loads and saves byte for byte.
7. **Invariant refusal lists every violation.** `with_region.json` changed to
   break three invariants at once (an unlocked child, a conversion map whose
   `source_unit` is `seconds` on a `quarters` timeline, a duplicated region)
   is refused with exactly `child_not_locked`, `map_source_unit_mismatch` and
   `duplicate_region`, in traversal order, each at its exact path, and
   `saveManifest` of the same value throws `InvalidManifestError`.
8. **Each invariant at load.** For each of `unit_not_allowed`,
   `number_type_not_allowed`, `invalid_coordinate`, `off_axis`,
   `child_unit_mismatch`, `negative_offset`, `child_exceeds_parent`,
   `region_end_before_start`, `duplicate_map`,
   `metric_hierarchy_without_measure_map` and `duplicate_timeline`, one copy
   of `with_region.json` changed in exactly that respect is refused with
   exactly one problem: that code at the exact path.
9. **A child's key is its id.** `nested.json` holds its first child under the
   key `tl:23`. With that child's `id` changed to `tl:99`, both
   `checkManifest` and `loadManifest` report exactly one problem,
   `{code: "key_mismatch", path: ["timeline", "children", "tl:23", "timeline",
   "id"]}`.
10. **Malformed text** is refused with code `invalid_json` at path `[]`.

`checkManifest` reports all invariant violations in traversal order with paths
starting at `timeline`. `saveManifest` throws `InvalidManifestError` carrying
the complete exact problem list. Canonical member order is checked in text as
well as by deep equality.

## Invariants (the catalogue)

Every invariant below is checked twice: by `checkManifest` over a whole loaded
manifest, and by the command reducer before an edit applies. The `Source`
column names the public timetoalign API that enforces the same rule. Five rows
are marked **Editor's own rule**: where the library accepts a manifest and
normalizes it on load (or never meets the case), the editor refuses, because
every manifest the library writes already satisfies the rule and an editor
manifest must save as it was read:

- timeline ids unique across the whole manifest (commands address a timeline
  by id);
- a child stored under its own id as key;
- every loaded child locked (the library writes every child locked);
- region and flow-control coordinates already on the axis's number type;
- a parent grows only to a child's end that its number type holds exactly.

| Code | Invariant | Source in timetoalign |
|---|---|---|
| `unit_not_allowed` | A timeline's class admits its unit (logical: `whole_note`, `quarters`, `floating_measures`, `number` continuous, `ticks` discrete; physical: `seconds`, `milliseconds`, `minutes` continuous, `samples`, `frames` discrete; graphical: `meters`, `centimeters`, `millimeters`, `inches`, `points` continuous, `pixels` discrete) | `timetoalign.timelines.base.Timeline._validate_unit` with each class's `_allowed_units` (`timetoalign.timelines.types`) |
| `number_type_not_allowed` | A timeline's unit admits its number type (discrete units `int` only; `number` all three; other continuous units `float` or `fraction`) | `timetoalign.core.enums.TimeUnit.resolve_number_type` / `allowed_number_types` |
| `invalid_coordinate` | Every coordinate reads under its declared number type, every integer is int64-bounded | `timetoalign.core.retrieval.coordinate_from_dict`, `timetoalign.core.time.number_from_json` |
| `off_axis` | The length, every child offset, every region start and end, every break, jump and marker coordinate carries the timeline's unit and number type | **Editor's own rule.** length and offsets: `Timeline.from_dict`; flow-control units: `timetoalign.timelines.flowcontrol.FlowControlRegistry._on_axis`; region units: `timetoalign.timelines.engines.regions.RegionsMixin._add_existing_region` and `create_region`. Number type of regions and flow coordinates: the library stores every coordinate on its axis, so its manifests never carry an off-axis one; its re-expression of a coordinate given to `add_break` or `create_region` is a convenience of its API, not a manifest form, and is refused here |
| `child_unit_mismatch` | A child has its parent's unit | `timetoalign.timelines.engines.children.ChildrenMixin.validate_child` |
| `negative_offset` | A child offset is not negative | `validate_child` |
| `child_exceeds_parent` | A child ends within its parent (offset + child length ≤ parent length, compared across number types as in section 1.6). A command placing a child past the end of an unlocked parent lengthens the parent to the child's end; a locked parent refuses. The parent grows only to a value its own number type holds exactly (an int parent cannot grow to 9/2, a float parent cannot grow to 1/3); otherwise the command is refused with this code, since a stored value is never re-expressed. The library is inconsistent in that case: with timetoalign at the time of writing, an unlocked int parent of length 4 given a Fraction child of length 3/2 at offset 3 (ending at 9/2) kept its length 4, and setting the length of an int parent below a Fraction child's end of 5/2 raised `ValueError` instead of the length refusal | **Editor's own rule.** `ChildrenMixin.add_child` through `EventsMixin._ensure_capacity` (`timetoalign.timelines.engines.events`); `addChild` and `setChildOffset` both apply this rule (the library has no offset setter; moving a child is re-adding it) |
| `child_not_locked` | Every child is locked | **Editor's own rule.** `add_child` locks every child it embeds, so the library writes every child locked; its `from_dict` locks an unlocked child silently, the editor refuses it |
| `locked` | A locked timeline's length cannot be set | `timetoalign.timelines.base.Timeline._check_not_locked`, called by the `length` setter |
| `length_below_content` | A length is not below the end of any child (and so never negative when set) | `Timeline.length` setter with `ChildrenMixin._get_max_content_coordinate` |
| `negative_length` | A new timeline's length is not negative | the schema's `CoordinateNonnegative` (the library constructor accepts it; its output would not validate) |
| `duplicate_region` | Region names are unique on a timeline | `RegionsMixin.create_region`, `_add_existing_region` |
| `region_end_before_start` | A region's end is not before its start | `timetoalign.timelines.regions.Region.__post_init__` |
| `duplicate_map` | Conversion-map ids are unique on a timeline | `timetoalign.timelines.engines.conversion.ConversionMapsMixin.add_conversion_map` |
| `map_source_unit_mismatch` | A conversion map's `source_unit`, when not null, is the timeline's unit | `add_conversion_map` |
| `metric_hierarchy_without_measure_map` | A metric hierarchy requires a measure map | `Timeline.add_metric_hierarchy`, `Timeline.from_dict` |
| `duplicate_timeline` | Timeline ids are unique across the whole manifest | **Editor's own rule.** per parent: `validate_child`; per group: `timetoalign.timelines.groups.TimelineGroup.add_timeline`; across a manifest: the editor's addressing rule, which every library manifest satisfies |
| `key_mismatch` | A timeline stored under a key of `children` has that key as its `id` | **Editor's own rule.** `Timeline.to_dict` keys `children` by the child's id; the library's `from_dict` re-keys silently; the editor refuses, as a manifest that differs from its own re-emission |

Rules the library does **not** enforce and this package therefore does not
invent: a child may have another number type than its parent; a region may
lie outside its timeline (negative start, end past the length); breaks,
jumps and markers may lie outside it too; a locked timeline still accepts
children within its length, regions, flow control and maps; any number of
breaks or jumps may share a coordinate. Measure maps, metric hierarchies and
conversion-map payloads are carried verbatim: their rules beyond the schema
(`MeasureMap.from_dict`, `ConversionMap.from_dict`) are the server's to
check, not the editor's.

## Manifest commands (`commands.test.ts`)

The 16 manifest commands are `setName`, `setLength`, `addChild`,
`setChildOffset`, `removeChild`, `addRegion`, `setRegion`, `removeRegion`,
`addBreak`, `removeBreak`, `addJump`, `removeJump`, `setMarker`,
`removeMarker`, `addConversionMap`, and `removeConversionMap`. Every command
carries a valid ten-character `block` id. `applyToManifest(manifest, command)`
is pure: the input is never mutated (every test deep-freezes its input first,
so a mutation throws), and a refusal returns a `CommandError`
`{code, message, path}` and nothing else. `parseCommand(unknown)` refuses
malformed input with code `invalid_command` at the path of the offending
member.

For every command there is one exact example per accept path, asserting the
complete resulting timeline against an expectation built by hand from the
command's specified effect, and one example per refusal code the command can
produce, asserting the exact `{code, path}`. The accept paths:

- `setName`: a string, and `null`.
- `setLength`: lengthening, shortening down to the end of the last child.
- `addChild`: a new child, locked, at an exact offset (`[2, 4]` is stored as
  `1/2`); a child ending past an unlocked parent lengthens it to the child's
  end exactly (offset `15/2` plus length 1 gives `17/2`); a child of another
  number type (int, Fraction, float parents) is compared and grows its parent
  as Python does. `addChild` accepts only a new timeline.
- `setChildOffset`, `removeChild` (the subtree disappears).
- `addRegion`, `setRegion` (each of start, end, meta; a `setRegion` naming
  none of them is malformed), `removeRegion`.
- `addBreak`, `removeBreak` (of two equal entries the first is removed and one
  remains), `addJump`, `removeJump`.
- `setMarker` (new and replaced), `removeMarker`.
- `addConversionMap` (payload carried verbatim, kept in id order),
  `removeConversionMap`.

The refusal codes the commands produce are the manifest invariants above plus
`invalid_coordinate`, `schema_violation`, `not_a_child` and the addressing
codes `unknown_timeline`, `unknown_region`, `unknown_break`, `unknown_jump`,
`unknown_marker` and `unknown_map`.

Edits keep member order: renaming the deepest timeline of `nested.json` and
renaming it back saves to the fixture's exact bytes (an edit that moved a
replaced member to the end of its object would change them), and after a
rename and after a `removeChild` every timeline has exactly the members of
`TIMELINE_KEYS` in that order.

Coordinates in commands are normalized as the library normalizes them; a
coordinate on another unit or number type is refused with `off_axis`, never
converted. `parseCommand` rejects malformed block ids, unknown or extra
members, non-finite canvas numbers, unsafe numeric integers, and a plain
fractional JS number in a coordinate's `value`; a safe integer stays an
integer and a float coordinate stays a float.

## Properties (`properties.test.ts`, fast-check)

Manifest commands are generated from the whole vocabulary against the current
manifest: addresses are drawn from the ids, names and entries present plus
unknown ones; coordinates are drawn on the axis, off the axis (another unit or
number type), negative and past the end; payloads include invalid ones. So
every refusal code is reachable and sequences mix accepted and refused
commands.

1. From every manifest fixture, every sequence of up to 50 generated commands
   leaves a manifest with no problem from `manifestProblems`, whose
   `saveManifest` text equals the text read back through the Yjs binding, and
   that `loadManifest` reads back deep-equal. Deep equality ignores the order
   of an object's members, so after every accepted command every timeline, at
   every depth, is also checked to have exactly the members of `TIMELINE_KEYS`
   in that order.
2. Every refused command leaves the manifest deep-equal to the one before.
3. The generator reaches every refusal: over a fixed sample (seed `20261010`,
   40 sequences per fixture) the set of refusal codes observed is exactly
   these 23: `child_exceeds_parent`, `child_unit_mismatch`, `duplicate_map`,
   `duplicate_region`, `duplicate_timeline`, `invalid_coordinate`,
   `length_below_content`, `locked`, `map_source_unit_mismatch`,
   `negative_length`, `negative_offset`, `not_a_child`,
   `number_type_not_allowed`, `off_axis`, `region_end_before_start`,
   `schema_violation`, `unit_not_allowed`, `unknown_break`, `unknown_jump`,
   `unknown_map`, `unknown_marker`, `unknown_region`, `unknown_timeline`.

## Workspace ids, addresses and order (`workspace-ids-order.test.ts`)

`mintRecordId` consumes one byte per attempt, rejects bytes 252 through 255,
and maps accepted bytes through `0123456789abcdefghijklmnopqrstuvwxyz`; fixed
byte streams pin the exact ten-character result. Record ids match
`^[0-9a-z]{10}$`.

Timeline prefixes are exactly `clt`, `dlt`, `cpt`, `dpt`, `cgt`, and `dgt`.
`mintTimelineId` returns the smallest free positive suffix across the root and
all descendants. Addresses split at the first slash; pinned cases cover a
record alone, a record plus element, further slashes in the element, malformed
record ids (`short`) and empty elements (`0123456789/`). Formatting reverses
every accepted parse.

Fractional indices (`indexBetween`, `indicesBetween`, `isIndex`) are
compatible with `fractional-indexing` 4.0.0 on the fixed base-62 alphabet:
the four published vectors give `a0`, `a1`, `Zz`, and `a0V`. Invalid keys and
unordered bounds are refused. Generated keys are valid and strictly between
valid bounds; generated batches have exactly the requested length and are
strictly increasing.

## Workspace view and commands (`workspace.test.ts`, `workspace-properties.test.ts`)

`createView` returns exactly the supplied metadata, `DEFAULT_SETTINGS`, and an
empty record map. `checkWorkspace` runs by record id and pins exact codes and
paths: `parent_cycle` and `invalid_index` at `["records", A, "parent"]` and
`["records", A, "index"]`, `key_mismatch` and `invalid_record_id` at
`["records", C, "id"]`, `unknown_parent`, a later `duplicate_index` at
`["records", C, "index"]`, `non_finite_number` at `["records", A, "x"]`,
`non_positive_number` at `["records", A, "scale"]` and `["records", A,
"zoom"]`, and a block-manifest problem prefixed as `["records", A, "manifest",
"timeline", "regions", 1, "name"]`.

The eight record commands are `createBlock`, `moveRecords`, `resizeRecord`,
`setRecordProperties`, `setIndex`, `deleteRecords`, `setSettings`, and
`setBlockManifest`. Together with the 16 manifest commands, `COMMAND_TYPES`
has exactly 24 entries in the exported order.

Every command is checked for purity by deep-freezing the input view. Accepted
commands pin the complete resulting records and settings: `createBlock` takes
its defaults from `settings.blockDefaults` and an index after the greatest
root index; a 0.3.0 single-root manifest is accepted through `createBlock` and
stored with `meta.schema_version` `"0.4.0"`. Deleting a parent deletes every descendant and
no unrelated record. Refusals pin exact codes and paths: a malformed id
(`invalid_record_id`), a non-finite `x` (`non_finite_number`), a zero `scale`
(`non_positive_number`), a malformed index, an invalid member of
`setRecordProperties` (`invalid_command` at `["properties", "x"]`), a
non-finite grid size (`non_finite_number` at `["settings", "grid", "size"]`),
and an unknown record against a non-block record (`unknown_record` against
`not_a_block`).

**A command error's path points into the view the command was applied to.**
A record command reports `["records", <id>, ...]`: `moveRecords` of an absent
record `B` is refused with `unknown_record` at `["records", B]`, and `setIndex`
of an absent record `B` likewise. A manifest command reports
`["records", <block id>, "manifest", ...]` followed by the member of the
command at fault: `removeRegion` of a missing region on block `A` is refused
with `unknown_region` at `["records", A, "manifest", "name"]`. A command that
`parseCommand` rejects as malformed has no view location; its path names the
malformed member of the rejected value (`invalid_index` at `["index"]` for the key `a00`).

Generated command sequences from every 0.4.0 fixture prove that accepted
commands leave `checkWorkspace` empty, block manifests save and reload to deep
equality and identical text, and refused commands leave the view unchanged.

## Yjs manifest binding (`yjs.test.ts`)

`manifestMap`, `readManifest`, and `syncManifest` are the whole binding: one
manifest in one `Y.Map`. The caller owns undo.

1. **Round trip.** For every 0.4.0 fixture, `readManifest(manifestMap(m))`
   deep-equals `m` and saves to the fixture's exact bytes: deep equality
   ignores the order of an object's members, the text does not, so this proves
   that a value keeps its members' order through Yjs. The fixtures carrying a
   `graphical` member prove the same for that member, held as one atom.
2. **Same result as the reducer.** For every generated sequence from every
   fixture, after each accepted command `syncManifest` makes `readManifest`
   deep-equal `applyToManifest`'s result and save to the same text.
3. **Granularity.** Updates touch only changed nested maps: after a
   `setName`, the `timeline` map and its `children` map of `nested.json` are
   the same objects as before. Graphical values, coordinates, map payloads,
   regions, measure maps and metric hierarchies are atomic; breaks and jumps
   are keyed maps.
4. **Undo and redo over every intermediate manifest.** With a
   `Y.UndoManager` the caller owns, tracking one origin with
   `captureTimeout: 0`, each accepted command that changes the manifest is one
   undo step. After n steps, undoing k times restores the (n − k)-th
   manifest, and redoing k times restores the n-th; each restored manifest is
   compared by deep equality and by its saved text, for every fixture.
5. **Redo removes only the selected break.** Add breaks at 1, 2 and 3, then
   remove the one at 2; after undoing all five steps and redoing them the
   breaks are exactly `[]`, `[1]`, `[1, 2]`, `[1, 2, 3]`, `[1, 3]`. (Yjs 13.6
   redoes the removal of an item of a `Y.Array` whose parent was re-created by
   an earlier redo by deleting the merged neighbour too; the binding therefore
   keys breaks and jumps in a `Y.Map`.)
6. **Replicas converge.** Two replicas created from the same fixture, each
   given its own generated sequence, exchange their updates in both
   directions and then materialize to deep-equal manifests. Merged edits
   bypass the reducer, so the merged manifest may break an invariant; that is
   reported by `checkManifest` and on save, and is not asserted here.
7. **The root export is isolated from Yjs.** `src/index.ts` and everything it
   imports never import `yjs`; `.dependency-cruiser.cjs` encodes this and
   `tests/ladder.test.ts` at the workspace root proves the rule fires.

## External gates

Strict type checking, Biome, dependency-cruiser and the whole Vitest suite
pass.
