# `@timetoalign/tilie-core` tests

`core` holds the editable TimeSkeleton document: exact numbers, validated
load and save, the command vocabulary as pure reducers, and the Yjs binding
(`@timetoalign/tilie-core/yjs`). This file states what proves each part
works. The tests follow it; a test that cannot be traced to a paragraph here
does not belong in the suite.

General rules: exact values only (`toEqual`/`toBe` against literal
expectations or against a document reached by another path); no
thresholds; no network; nothing written outside temporary state; documents
used by tests come from the fixtures shipped by the installed
`@timetoalign/timeskeleton` package or are built through commands. A
manifest literal appears only where a rejection is asserted.

## 0. Package name (`name.test.ts`)

The package exports its name, `"@timetoalign/tilie-core"`, as every
workspace package does; the editor shell lists the names it links.

## 1. Numbers (`number.test.ts`)

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

## 2. Load and save (`document.test.ts`)

Reading, writing and the canonical order are `@timetoalign/timeskeleton`'s
(`parse`, `dumps`, `canonicalOrder`) and are proven in its own suite; these
tests prove that `core` uses them so that nothing is lost. In the document
`core` holds, every number is a `JsonNumber`: a plain number for a safe
integer or a float with a fractional part, a `bigint` beyond 2^53, a
`JsonFloat` for an integral float (`600.0`).

1. **Golden round trip.** For every file in `fixtures/<SCHEMA_VERSION>/` of
   the installed package, `saveDocument(loadDocument(text))` equals `text`
   byte for byte. No skip, no normalization in the comparison.
2. **Shared rejections.** For every case in `fixtures/rejections/*/`, the
   `document` member written as JSON text is refused by `loadDocument` with
   exactly one problem whose `path` equals the case's `path`.
3. **Migration.** For every pair in `fixtures/migrations/`,
   `loadDocument(before)` saves as the migration chain itself writes it:
   `dumps(migrate(parse(before)))`. The pair whose target is the installed
   `SCHEMA_VERSION` also saves as its `after.json`.
4. **Exact integers.** A document built from a fixture by replacing one
   `int` coordinate value with `9007199254740993` (2^53 + 1) and one
   Fraction pair with `[9007199254740993, 2]` loads, keeps the exact
   bigints, and saves byte-identically.
5. **Save goes through the canonical order.** Markers named `"\u{1F3B5}"`
   (a surrogate pair in UTF-16) and `"～"`, set in that order by commands,
   are written with `"～"` first: code-point order, the reverse of
   JavaScript's default sort.
6. **A child of another number type** (a float child of a Fraction
   parent, length `4.0`) loads and saves byte for byte.
7. **Invariant refusal lists every violation.** A schema-valid document
   breaking three invariants at once (a duplicated region name, an unlocked
   child, a conversion map on the wrong unit) is refused with exactly those
   three problems, each with its code and path.
8. **Each invariant at load.** For every invariant code of section 3 that a
   document can break, one copy of `with_region.json` changed in exactly
   that respect is refused with exactly one problem: that code at the exact
   path. A 0.1.0 document whose measure carries an unknown class is
   refused with `migration_failed` at the path of that class.
9. **Malformed text** is refused with code `invalid_json` at path `[]`.

## 3. Invariants (the catalogue)

Every invariant below is checked twice: by `checkDocument` over a whole
loaded document, and by the command reducer before an edit applies. The
`Source` column names the public timetoalign API that enforces the same
rule. Five rows are marked **Editor's own rule**: where the library
accepts a document and normalizes it on load (or never meets the case),
the editor refuses, because every document the library writes already
satisfies the rule and an editor document must save as it was read:

- timeline ids unique across the whole document (commands address a
  timeline by id);
- a timeline stored under its own id as key;
- every loaded child locked (the library writes every child locked);
- region and flow-control coordinates already on the axis's number type;
- a parent grows only to a child's end that its number type holds exactly.

| Code | Invariant | Source in timetoalign |
|---|---|---|
| `unit_not_allowed` | A timeline's class admits its unit (logical: `whole_note`, `quarters`, `floating_measures`, `number` continuous, `ticks` discrete; physical: `seconds`, `milliseconds`, `minutes` continuous, `samples`, `frames` discrete; graphical: `meters`, `centimeters`, `millimeters`, `inches`, `points` continuous, `pixels` discrete) | `timetoalign.timelines.base.Timeline._validate_unit` with each class's `_allowed_units` (`timetoalign.timelines.types`) |
| `number_type_not_allowed` | A timeline's unit admits its number type (discrete units `int` only; `number` all three; other continuous units `float` or `fraction`) | `timetoalign.core.enums.TimeUnit.resolve_number_type` / `allowed_number_types` |
| `invalid_coordinate` | Every coordinate reads under its declared number type, every integer is int64-bounded | `timetoalign.core.retrieval.coordinate_from_dict`, `timetoalign.core.time.number_from_json` |
| `off_axis` | The length, every child offset, every region start and end, every break, jump and marker coordinate carries the timeline's unit and number type | **Editor's own rule.** length and offsets: `Timeline.from_dict`; flow-control units: `timetoalign.timelines.flowcontrol.FlowControlRegistry._on_axis`; region units: `timetoalign.timelines.engines.regions.RegionsMixin._add_existing_region` and `create_region`. Number type of regions and flow coordinates: the library stores every coordinate on its axis, so its documents never carry an off-axis one; its re-expression of a coordinate given to `add_break` or `create_region` is a convenience of its API, not a document form, and is refused here |
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
| `duplicate_timeline` | Timeline ids are unique across the whole document | **Editor's own rule.** per parent: `validate_child`; per group: `timetoalign.timelines.groups.TimelineGroup.add_timeline`; across a document: the editor's addressing rule, which every library document satisfies |
| `key_mismatch` | A timeline stored under a key of `manifest.timelines` or of `children` has that key as its `id` | **Editor's own rule.** `Timeline.to_dict` keys `children` by the child's id; the library's `from_dict` re-keys silently; the editor refuses, as a document that differs from its own re-emission |

Rules the library does **not** enforce and this package therefore does not
invent: a child may have another number type than its parent; a region may
lie outside its timeline (negative start, end past the length); breaks,
jumps and markers may lie outside it too; a locked timeline still accepts
children within its length, regions, flow control and maps; any number of
breaks or jumps may share a coordinate. Measure maps, metric hierarchies and
conversion-map payloads are carried verbatim: their rules beyond the schema
(`MeasureMap.from_dict`, `ConversionMap.from_dict`) are the server's to
check, not the editor's.

## 4. Commands (`commands.test.ts`)

`apply(document, command)` is pure: the input is never mutated (every test
deep-freezes its input document first, so a mutation throws), and a refusal
returns a `CommandError` `{code, message, path}` and nothing else.
`parseCommand(unknown)` refuses malformed input with code `invalid_command`
at the path of the offending member.

For every command of the vocabulary there is one exact example per accept
path, asserting the complete resulting timeline (or document) against an
expectation built by hand from the command's documented effect, and one
example per refusal code the command can produce, asserting the exact
`{code, path}`. The document is built from a fixture or through earlier
commands. The accept paths:

- `createTimeline`: a root with the library's defaults (`name` null when
  omitted, unlocked, empty `meta`, `children`, `conversion_maps`,
  `regions`, empty flow control, null `measure_map` and
  `metric_hierarchy`).
- `removeTimeline`: a root and its subtree disappear.
- `setName`: a string, and `null`.
- `setLength`: lengthening, shortening down to the end of the last child.
- `addChild`: a new child; an existing root moved under a parent (it
  disappears from the roots and is locked); a child ending past an unlocked
  parent lengthens it to the child's end exactly; a child of another number
  type (int, Fraction, float parents) is compared and grows its parent as
  Python does.
- `setChildOffset`, `removeChild` (the subtree disappears).
- `addRegion`, `setRegion` (each of start, end, meta; a `setRegion`
  naming none of them is malformed), `removeRegion`.
- `addBreak`, `removeBreak` (of two equal entries the first is removed and
  one remains), `addJump`, `removeJump`.
- `setMarker` (new and replaced), `removeMarker`.
- `addConversionMap` (payload carried verbatim), `removeConversionMap`.

Edits keep member order: renaming the deepest timeline of `nested.json`
and renaming it back saves to the fixture's exact bytes (an edit that moved
a replaced member to the end of its object would change them).

Coordinates in commands are normalized as the library normalizes them
(`[2, 4]` is stored as `[1, 2]`); a coordinate on another unit or number
type is refused with `off_axis`, never converted.

## 5. Properties (`properties.test.ts`, fast-check)

Commands are generated from the whole vocabulary against the current
document: addresses are drawn from the ids, names and entries present plus
unknown ones; coordinates are drawn on the axis, off the axis (another unit
or number type), negative and past the end; payloads include invalid ones.
So every refusal code is reachable and sequences mix accepted and refused
commands.

1. From every golden fixture, every sequence of up to 50 generated commands
   leaves a document that passes the schema validator and `checkDocument`
   with no problem, and that `saveDocument` writes and `loadDocument` reads
   back deep-equal.
   Deep equality ignores the order of an object's members, so after every
   accepted command the text is checked too: every timeline manifest, at
   every depth, has exactly the members of `TIMELINE_KEYS` in that order, and
   `saveDocument(result)` equals `saveDocument(toDocument(createYDoc(result)))`.
2. Every refused command leaves the document deep-equal to the one before.
3. The generator does reach every refusal: over a fixed sample (seed
   `20261010`, 40 sequences per golden fixture) the set of refusal codes
   observed is exactly the 25 codes a reducer can produce (every code of
   section 3 that a command can trigger, plus `invalid_coordinate`,
   `schema_violation` and the addressing codes `unknown_*`, `not_a_root`,
   `not_a_child`, `child_is_ancestor`).

## 6. Yjs binding (`yjs.test.ts`)

1. **Same result as the reducer.** For every generated sequence from every
   fixture, after each command `applyCommand(ydoc, command)` returns the
   same refusal as `apply` (or none), and `toDocument(ydoc)` deep-equals the
   reducer's document, and both save to the same text.
   `toDocument(createYDoc(document))` deep-equals
   `document` for every fixture, and saves to the fixture's exact bytes:
   deep equality ignores the order of an object's members, the text does
   not, so this proves that an atom keeps its members' order through Yjs.
   The `styled` fixture carries a `graphical` block, so the same comparisons
   prove that the block, held as one atom, survives the binding and every
   command, which leaves it untouched.
2. **Undo and redo.** One command that changes the document is one undo
   step; a command that changes nothing (a refusal, or setting a value to
   itself) writes nothing and adds no step. After n changing commands,
   undoing k times restores the (n − k)-th document exactly, and redoing
   k times restores the n-th; each restored document is compared by deep
   equality and by its saved text.
   A fixed regression case: create a timeline, add three breaks, remove
   the middle one, undo all five commands and redo them; the breaks after
   each redo are exactly `[]`, `[1]`, `[1, 2]`, `[1, 2, 3]`, `[1, 3]`. (Yjs
   13.6 redoes the removal of an item of a `Y.Array` whose parent was
   re-created by an earlier redo by deleting the merged neighbour too; the
   binding therefore keys breaks and jumps in a `Y.Map`.)
3. **Convergence.** Two replicas created from the same fixture, each given
   its own generated sequence, exchange their updates in both directions
   and then materialize to deep-equal documents. Merged edits bypass the
   reducer, so the merged document may break an invariant; that is
   reported by `checkDocument` and on save, and is not asserted here.
4. **Isolation of the root export.** `src/index.ts` and everything it
   imports never import `yjs`; `.dependency-cruiser.cjs` encodes this and
   `tests/ladder.test.ts` at the workspace root proves the rule fires.
