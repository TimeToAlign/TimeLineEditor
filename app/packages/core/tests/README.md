# `@timetoalign/tilie-core` tests

`core` holds exact coordinates, one TimeSkeleton manifest of
timeskeleton's `SCHEMA_VERSION` in each of its three file kinds (a timeline
file `{meta, timeline, graphical?}`, a group file `{meta, timelines, group,
graphical?}`, a bundle file `{meta, timelines, bundle, graphical?}`), the
elements a selector can match, the
immutable workspace view of blocks, the four commands `add`, `set`, `remove`
and `style` over addresses, the store with its command journal, and the
workspace file. This file states what proves each part works; a test that
cannot be traced to a paragraph here does not belong in the suite.

General rules: exact values only (`toEqual`/`toBe` against literal expectations
or against a value reached by another path); no thresholds except the budgets,
which are stated as the requirement they test; no network; nothing written
outside temporary state. Manifests come from the fixtures shipped by the
installed `@timetoalign/timeskeleton` package (`fixtures/<SCHEMA_VERSION>/`: 29
timeline files directly in it, 9 group files in `groups/`, 9 bundle files in
`bundles/`; the timeline files of the earlier versions in
`fixtures/<version>/`) or are built through commands; a manifest literal appears only where a rejection
is asserted. Block ids in examples are `A = "0000000000"`, `B = "0000000001"`,
`C = "0000000002"`.

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

1. **Fixture round trip.** There are exactly 29 timeline files in
   `fixtures/<SCHEMA_VERSION>/`, 9 group files in its `groups/` and 9 bundle
   files in its `bundles/`. For each of the 47,
   `saveManifest(loadManifest(text))` equals `text` byte for byte. No skip,
   no normalization in the comparison.
2. **Shared rejections.** For every case in every `fixtures/rejections/<version>/`, the
   rejected manifest, written as JSON text, is refused by `loadManifest` with
   exactly one problem whose `path` equals the case's `path`. These include
   timeskeleton's identity rules: an id repeated across kinds and a jump
   target naming no marker are `schema_violation`s from its `validate`, so
   `core` checks neither again.
3. **Schema version.** `bare.json` with its `"schema_version"` replaced
   by `"0.0.0"` is refused with exactly one problem
   `{code: "schema_violation", path: ["meta", "schema_version"]}`. Every
   version in timeskeleton's `SUPPORTED_VERSIONS` is read by migrating it
   to `SCHEMA_VERSION` through timeskeleton's `migrate`; core has no
   migration of its own. For each earlier supported version and each of its
   23 timeline fixtures (`fixtures/<version>/`), the loaded manifest
   declares `SCHEMA_VERSION` and `saveManifest` writes exactly
   `dumps(migrate(parseJson(text)))`, the text timeskeleton's migration
   gives (the fixtures are in canonical order). The migration pair
   `fixtures/migrations/0.6.0-to-0.7.0/` pins the step with values
   timeskeleton wrote by hand: its `before.json` loads and saves as its
   `after.json` byte for byte; the pair `0.5.0-to-0.6.0` loads its
   `before.json` and its `after.json` to equal texts. `readManifestValue`
   leaves the value it is given unchanged: each earlier version's
   `bare.json` still declares that version afterwards.
4. **Missing styles are completed.** A graphical statement naming each of
   two absent styles produces exactly one warning naming both, the one
   timeskeleton's `completeStyles` issues (`Missing graphical styles: 'a',
   'z'`, names sorted by code point); core adds none of its own. The loaded
   manifest contains an empty declaration for each. The input object is not
   mutated and a declaration already present is preserved.
5. **Exact integers.** `discrete_logical.json` with its length value `480`
   replaced by `9007199254740993` (2^53 + 1) loads as the `bigint` and saves
   byte-identically; `continuous_logical.json` with its length Fraction
   numerator `12` replaced by `9007199254740993` loads as
   `[9007199254740993n, 2]` and saves byte-identically.
6. **Save goes through the canonical order.** `bare.json` given two markers
   at the same coordinate with the ids `"\u{1F3B5}"` (a surrogate pair in
   UTF-16) and `"～"`, in that order, is written with `"～"` first: markers
   by coordinate, then id in code-point order, the reverse of JavaScript's
   default sort.
7. **A child of another number type** (a float child of a Fraction parent,
   length `4.0`) loads and saves byte for byte.
8. **Invariant refusal lists every violation.** `with_region.json` changed to
   break three invariants at once (an unlocked child, a conversion map whose
   `source_unit` is `seconds` on a `quarters` timeline, a region ending
   before it starts) is refused with exactly `child_not_locked`,
   `map_source_unit_mismatch` and `region_end_before_start`, in traversal
   order, each at its exact path, and
   `saveManifest` of the same value throws `InvalidManifestError`.
8. **Each invariant at load.** For each of `unit_not_allowed`,
   `number_type_not_allowed`, `invalid_coordinate`, `off_axis`,
   `child_unit_mismatch`, `negative_offset`, `child_exceeds_parent`,
   `region_end_before_start` and `metric_hierarchy_without_measure_map`, one
   copy
   of `with_region.json` changed in exactly that respect is refused with
   exactly one problem: that code at the exact path.
9. **A child's key is its id.** `nested.json` holds its first child under the
   key `clt_3`. With that child's `id` changed to `clt_9`, both
   `checkManifest` and `loadManifest` report exactly one problem,
   `{code: "key_mismatch", path: ["timeline", "children", "clt_3", "timeline",
   "id"]}`.
10. **Malformed text** is refused with code `invalid_json` at path `[]`.

`checkManifest` reports all invariant violations in traversal order with paths
starting at `timeline`, in a group or bundle file root by root with paths
starting at `["timelines", <index>]` (`files.test.ts`). `saveManifest` throws `InvalidManifestError` carrying
the complete exact problem list. Canonical member order is checked in text as
well as by deep equality.

## Invariants (the catalogue)

Every invariant below is checked twice: by `checkManifest` over a whole loaded
manifest, and by every command over the manifest it would leave. The `Source`
column names the public timetoalign API that enforces the same rule. Four rows
are marked **Editor's own rule**: where the library accepts a manifest and
normalizes it on load (or never meets the case), the editor refuses, because
every manifest the library writes already satisfies the rule and an editor
manifest must save as it was read:

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
| `child_exceeds_parent` | A child ends within its parent (offset + child length ≤ parent length, compared across number types as in section 1.6). A command placing a child past the end of an unlocked parent lengthens the parent to the child's end; a locked parent refuses. The parent grows only to a value its own number type holds exactly (an int parent cannot grow to 9/2, a float parent cannot grow to 1/3); otherwise the command is refused with this code, since a stored value is never re-expressed. The library is inconsistent in that case: with timetoalign at the time of writing, an unlocked int parent of length 4 given a Fraction child of length 3/2 at offset 3 (ending at 9/2) kept its length 4, and setting the length of an int parent below a Fraction child's end of 5/2 raised `ValueError` instead of the length refusal | **Editor's own rule.** `ChildrenMixin.add_child` through `EventsMixin._ensure_capacity` (`timetoalign.timelines.engines.events`); adding a child and setting a child's `offset` both apply this rule (the library has no offset setter; moving a child is re-adding it) |
| `child_not_locked` | Every child is locked | **Editor's own rule.** `add_child` locks every child it embeds, so the library writes every child locked; its `from_dict` locks an unlocked child silently, the editor refuses it |
| `locked` | A locked timeline's length cannot be set (a rule of `set`; a manifest cannot break it) | `timetoalign.timelines.base.Timeline._check_not_locked`, called by the `length` setter |
| `length_below_content` | A length is not set below the end of any child (and so never negative; a rule of `set`) | `Timeline.length` setter with `ChildrenMixin._get_max_content_coordinate` |
| `region_end_before_start` | A region's end is not before its start | `timetoalign.timelines.regions.Region.__post_init__` |
| `map_source_unit_mismatch` | A conversion map's `source_unit`, when not null, is the timeline's unit | `add_conversion_map` |
| `metric_hierarchy_without_measure_map` | A metric hierarchy requires a measure map | `Timeline.add_metric_hierarchy`, `Timeline.from_dict` |
| `key_mismatch` | A timeline stored under a key of `children` has that key as its `id` | **Editor's own rule.** `Timeline.to_dict` keys `children` by the child's id; the library's `from_dict` re-keys silently; the editor refuses, as a manifest that differs from its own re-emission |

Ids unique across the whole manifest, whatever the kinds of the elements
carrying them, and a jump's `target` naming a marker of its timeline, are
timeskeleton's identity rules, checked by its `validate` as part of the
schema check; region names, now display names, may repeat.

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
(`timelineAncestry`). `inside` is the key's **holder chain**: the types of
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
   `melody/name`, the same, `[block, timeline]`; `map`, `tempo`, `melody`,
   physical, continuous, `ScalarMap`, `[block, timeline]`; `wedge`,
   `melody/start`, `[block, timeline]`, then its `label`,
   `melody/start/label`, `[block, timeline, wedge]`; `wedge`, `melody/end`
   and its `label` `melody/end/label` the same way (all four `melody`,
   logical, continuous, CLT); `child`, `phrase`, `phrase`, logical,
   continuous, CLT, `[block, timeline]`; `name`, `phrase/name`, the same,
   `[block, timeline, child]`; `map`, `ticks`, `phrase`, logical, discrete,
   `QuartersToTicks`, `[block, timeline, child]`. The order is: the block,
   the root's card (a card has its timeline's domain, modality and class,
   and is held by the block beside the root's line, holding nothing), then
   per timeline in pre-order (children by offset, then id, never by key
   order) its line, its name, its maps, its regions, breaks and jumps each
   followed by its label, and after the root's own elements its two wedges
   with their labels. A map has no name and no label; a map whose
   `target_unit` is null has domain and modality `null`. Addresses are flat
   (the drawing specification, section 2.2): an element's own id, a part as
   `<address>/<word>`.
2. **Regions, breaks and jumps** are addressed by their ids:
   `with_region.json` has exactly the region `region_1`; `flow_control.json`
   the break `break_1` and the jump `jump_1`, and its labels are exactly
   `break_1/label`, `jump_1/label`, `flow:quarters/start/label`,
   `flow:quarters/end/label`. Markers are not drawn and are not elements.
   Every address of a timeline fixture's enumeration is distinct (a timeline
   file draws every element once).
3. **Matching.** Over `map.json`: `{}` matches all twelve keys; `{element:
   "map", domain: "physical"}` only `tempo`; `{within: "phrase"}` exactly
   `phrase`, `phrase/name`, `ticks`; `{ids: ["tempo"]}` only that map;
   `{class: "QuartersToTicks"}` only `ticks`; `{modality: "discrete"}` only
   `ticks`; `{element: "card"}` only `melody/card`, and `{element: "card",
   domain: "logical"}` the same; a selector naming the block's address never
   matches (the block has none).
4. **`inside`** matches an element held at any depth by an element of the
   named type, never the holder itself. Over `map.json`: `{inside: "child"}`
   exactly `phrase/name`, `ticks`; `{inside: "timeline"}` exactly
   `melody/name`, `tempo`, `melody/start`, `melody/start/label`,
   `melody/end`, `melody/end/label`, `phrase`, `phrase/name`, `ticks`;
   `{inside: "wedge"}` exactly the two wedge labels; `{inside: "block"}`
   every key but the block; `{inside: "card"}` and `{inside: "map"}`
   nothing (a card and a map hold nothing); `{element: "name", inside:
   "child"}` only `phrase/name`. A key built by hand with `inside:
   ["block", "group", "timeline", "ancestor"]` matches `{inside: "group"}`
   and `{inside: "ancestor"}` and not `{inside: "child"}`: the matcher reads
   the chain and nothing else.
5. **Segment lines** (`segment_line.json`: root `form`, segments `a`, `b`,
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

The elements of group and bundle files are in `files.test.ts`.

## Workspace view, ids, addresses and order (`workspace.test.ts`, `workspace-ids-order.test.ts`)

The view is `{meta, settings, blocks}`. `createView()` returns exactly
`{meta: {format: "tilie-workspace", version: 1}, settings: DEFAULT_SETTINGS,
blocks: {}}` and `createView(settings)` the same with those settings.
`DEFAULT_SETTINGS` is exactly `{grid: {size: 8, snap: true}, blockDefaults:
{scale: 1, length: 400, spacing: 1, width: null, height: null, order:
["children", "regions", "flow"]}, graphical: {}}`: the drawing
specification's placement defaults plus the block's scale.

A block has exactly the members `id`, `blockKind`, `parent`, `index`, `x`,
`y`, `scale`, `length`, `spacing`, `width`, `height`, `order` and `manifest`;
the test lists the keys of an added block.

`checkWorkspace` runs by block id and pins exact codes and paths, each under
`["blocks", <id>, …]`: `parent_cycle` at `parent` and `invalid_index` at
`index` for two blocks naming each other as parent; `key_mismatch` and
`invalid_block_id` at `id` for a block `bad` stored under `C`;
`unknown_parent` at `parent`; a later `duplicate_index` at `index`;
`non_finite_number` at `x`; `non_positive_number` at `scale`, `length`,
`spacing` and `width` (a block's `width` and `height` are positive or null;
`height: null` passes); `invalid_order` at `order` for `["children",
"children", "flow"]`; `block_kind_mismatch` at `blockKind` for a block of
kind `"group"` holding a timeline manifest; a block-manifest problem
prefixed, `region_end_before_start` at `["blocks", A, "manifest",
"timeline", "regions", 0, "end"]` for `with_region.json` with its region's
end set to 0.

`mintBlockId` consumes one byte per attempt, rejects bytes 252 through 255,
and maps accepted bytes through `0123456789abcdefghijklmnopqrstuvwxyz`; fixed
byte streams pin the exact ten-character result. Block ids match
`^[0-9a-z]{10}$` (`BLOCK_ID`).

Timeline prefixes (`TIMELINE_PREFIX`) are exactly `clt`, `dlt`, `cpt`, `dpt`,
`cgt` and `dgt`. `nextId(view, block, prefix, into?)` on a timeline block
returns the smallest `{prefix}_{N}`, `N` from 1, that no id in that block's
manifest carries, whatever the kind of the element carrying it and whatever
`into` names: on a block of `bare.json` it is `clt_1`; after children `clt_1`
and `clt_3` are added it is `clt_2`; after a conversion map `map_1` is added,
`nextId(view, A, "map")` is `map_2`. On a block that does not exist it is
`{prefix}_1`. Its scoping in group and bundle blocks is in `files.test.ts`.

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
- `remove {targets: [address, …]}`, at least one target;
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
| timeline, the root | `<block>/<id>` | `name` (string or null); `length` (a coordinate); `locked` (boolean); `meta` (an object) | `child`, `map`, `region`, `break`, `jump`, `marker` | `not_removable` (remove the block) |
| timeline, a child | `<block>/<id>` | as the root, and `offset` (a coordinate) | as the root | yes, with its subtree |
| conversion map | `<block>/<id>` | `map` (the payload, whole, its `id` unchanged) | none | yes |
| region | `<block>/<id>` | `name` (string or null); `start`, `end` (coordinates); `meta` (an object) | none | yes |
| break | `<block>/<id>` | `coordinate` (a coordinate); `control_type`, `condition` (strings the schema checks); `repeat_count` (an integer); `label`, `name` (string or null); `meta` (an object) | none | yes |
| jump | `<block>/<id>` | `from_coordinate`, `to_coordinate` (coordinates); `control_type`, `condition`, `repeat_count`, `label`, `meta` as a break's; `target` (a marker id of the same timeline, or null) | none | yes |
| marker | `<block>/<id>` | `name` (string or null); `coordinate` (a coordinate) | none | yes |

A coordinate is read on the axis of the timeline holding the element
(`invalid_coordinate`, `off_axis` at `[address, property, …]`) and stored
normalized.

In a group or bundle block the same tables apply with the element addresses
of that file kind (`files.test.ts`): a timeline at any depth is
`<block>/<timeline id>`, every map, region, break, jump and marker
`<block>/<root id>/<id>`; a group or the bundle is no target; and `remove`
refuses every timeline, root or child, with `unsupported_target`.

The values of an `add`: a `block` is `{id, manifest, x, y}` plus any of
`index`, `scale`, `length`, `spacing`, `width` `height` and `order`, the
others taken from `settings.blockDefaults`, `blockKind` from the manifest's
top-level member, `parent` null, and `index` after the greatest index among
the blocks without parent unless given. A `child` is a manifest's child entry
`{offset, timeline}`, the timeline whole; a `map`, `region`, `break`,
`jump` or `marker` is the element as its timeline stores it. The value
carries its id (a block's `id`, a child's `timeline.id`, any other's `id`);
the caller mints it (`mintBlockId`, `nextId`).

### What every accept path must leave (exact, against an expectation built from the fixture by hand)

1. `add` a block `{id: A, manifest: bare, x: 0, y: 0}` to `createView()`:
   the block is exactly `{id: A, blockKind: "timeline", parent: null, index:
   "a0", x: 0, y: 0, scale: 1, length: 400, spacing: 1, width: null, height:
   null, order: ["children", "regions", "flow"], manifest: <bare.json>}`; a
   second block `B` given `scale: 2` has index `a1` and scale 2; a block
   given `index: "Zz"` keeps it.
2. One `set` with the changes `{target: A, values: {x: 128, y: 64}}` and
   `{target: B, values: {x: 1, y: 2}}` moves both and changes nothing else.
3. One `set` change on `A` with `scale: 2, width: 120, height: null, length:
   800, spacing: 2, order: ["flow", "regions", "children"]` gives exactly
   those values; `x`, `y` and the manifest are unchanged.
4. `set` on `workspace`: `blockDefaults: {length: 640}` changes that default
   only; `grid: {snap: false}` changes `snap` only; `graphical` replaces the
   settings' block whole.
5. `set` on `A` with `manifest: <nested.json>` makes `A`'s manifest equal the
   loaded `nested.json`.
6. Timelines, on a block of `nested.json` (root `clt_1` of length 16, child
   `clt_3` at 4 of length 8, its child `clt_2` at 3/2 of length 2):
   `name: "Score"` on the root; `meta: {composer: "Anon"}` on the root;
   root `length` 12 (the end of `clt_3`) is accepted; `clt_3`'s `offset` 6
   gives offset 6 and leaves the root at 16; `offset` 10 grows the unlocked
   root to exactly 18.
7. `add` a child into the root `bare` of `bare.json` (length 8): the entry
   `{offset: [2, 4], timeline: <bare's root with id "clt_1" and locked true>}` is stored
   under `clt_1` with the offset normalized to `[1, 2]`, and the root grows to
   exactly `[17, 2]`.
8. `add` the map `tempo` of `map.json` into the root of `bare.json`, then its
   map `ticks`: the root's `conversion_maps` are exactly `[tempo, ticks]`
   verbatim, kept in id order whichever is added first.
9. `set` on the map `tempo` (block of `map.json`) with its payload changed to
   `scalar: [1, 4]` stores exactly that payload.
10. `remove` on a block of `map.json`: `A/phrase` removes the child with its
    map; `A/tempo` removes that map; `[A, B]` removes both blocks; a block
    whose `parent` is a removed block goes with it.
11. Regions, breaks, jumps and markers. Into the root of `bare.json`, `add`
    the region `{id: "region_1", name: "A", start: 2, end: 4, meta: {}}`:
    the root's regions are exactly that one; `set` it `end` 6 and `name`
    null: exactly those values. On a block of `flow_control.json` (root
    `flow:quarters`; break `break_1` at 12; jump `jump_1` from 8 to 2
    targeting the marker `marker_1` at 2): `add` the marker `{id:
    "marker_2", name: "fine", coordinate: 12}`, then `set` `jump_1`'s
    `target` to `marker_2`: the jump targets `marker_2` and the markers are
    exactly `[marker_1, marker_2]`; `add` a copy of `break_1` with the id
    `break_2` at 3 and `remove` `break_1`: the breaks are exactly that copy;
    `remove` `jump_1`: no jump remains; `set` `marker_1`'s `coordinate` to 1
    stores `[1, 1]`.
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
  `["0000000009"]` and at `[A + "/nothing"]`.
- `set`: `id_not_settable` at `[A + "/clt_1", "id"]`; `unknown_property`
  at `[A, "colour"]`; `wrong_target_kind` at `["workspace", "x"]`, at `[A,
  "grid"]`, at `[A + "/clt_1", "offset"]` (the root has no offset), at
  `[A + "/tempo", "name"]` and at `[A + "/region_1", "coordinate"]`; value refusals at `[address, property, …]`:
  `invalid_value` for `x: "1"`, `non_finite_number` for `x: Infinity`,
  `non_positive_number` for `scale: 0` and for `width: -5`, `invalid_order`
  for `["children", "children", "flow"]`, `invalid_index` for `a00`,
  `duplicate_index` for `B`'s index given to `A`, `non_positive_number` at
  `["workspace", "grid", "size"]` for size 0, `invalid_coordinate` at `[A +
  "/clt_1", "length", "value"]` for a fraction value `0.5`, `off_axis` at
  `[A + "/clt_1", "length"]` for a length in seconds and at `[A +
  "/break_1", "coordinate"]` for a break in seconds, `locked` at `[A +
  "/clt_3", "length"]`, `length_below_content` at `[A + "/clt_1",
  "length"]` for 23/2, `schema_violation` at `["workspace", "graphical", …]`
  and `[A, "manifest", "meta", "schema_version"]` for a manifest declaring
  `0.0.0` (the latest fixture written as an older supported version
  declares it, without `is_segment_line`, is accepted and stored at
  `SCHEMA_VERSION`, equal to the latest fixture), `id_not_settable` at `[A + "/tempo", "map", "id"]` for a payload
  with another id. Manifest locations: `child_not_locked` at `[A,
  "manifest", "timeline", "children", "clt_3", "timeline", "locked"]` for
  `locked: false` on `clt_3`; `child_exceeds_parent` at `[A, "manifest",
  "timeline", "children", "clt_3", "timeline", "children", "clt_2",
  "offset"]` for `clt_2`'s offset 7 (its parent is locked);
  `region_end_before_start` at `[A, "manifest", "timeline", "regions", 0,
  "end"]` for `region_1`'s end 0 (`with_region.json`); `schema_violation` at
  `[A, "manifest", "timeline", "flow_control", "jumps", 0, "target"]` for
  `jump_1`'s target `nothing` and when `marker_1`, which `jump_1` targets,
  is removed (`flow_control.json`).
- `add`: `wrong_target_kind` at `[A + "/tempo", "child"]` (a map holds no
  child) and at `["workspace", "child"]`; `invalid_block_id` at
  `["workspace", "block", "id"]` for `BAD`; `duplicate_id` at `[A]` for an
  existing block and at `[A + "/bare"]` for a child, map or region carrying
  the root's id; `schema_violation` at `[A, "manifest", "timeline",
  "regions", 0, "id"]` for a region id holding `/`; `unknown_property` at `[B, "overrides"]` for a block value with
  that member; `invalid_value` at `[B, "x"]` when `x` is missing;
  `map_source_unit_mismatch` at `[A, "manifest", "timeline",
  "conversion_maps", 0, "source_unit"]` for a map from seconds.
- `remove`: `not_removable` at `["workspace"]` and at `[A + "/melody"]`;
  `unknown_target` at `[B]`.
- `style`: `unknown_target` at `[C]` for `blocks: [C]`.
- Atomicity: `set` with `{target: A, values: {x: 1}}` and `{target:
  "0000000009", values: {x: 2}}` is refused with `unknown_target` at `["0000000009"]`; `remove [A,
  C]` with `C` absent is refused; in both the frozen input is unchanged.

## Group and bundle files (`files.test.ts`)

A group or bundle file holds several root timelines (`timelines`), so what
core does for one root it does for each, and its element addresses are
those of the drawing specification, section 2.2: a timeline, a group or the
bundle by its bare id (timeline ids are unique across the file), every other
element (map, region, break, jump, marker) by `<root id>/<element id>`
(those ids are unique only within a root's tree), parts appended. Fixtures:
`groups/group_child_member.json` (group `group_1` "Second half", display
order `second-half`, `recording`; root `piece` holds the member
`second-half` at offset 8; root `recording`), `groups/group_number_types.json`
(group `group_1` "Edition", roots `page`, `performance`, `score`, display
order `score`, `page`, `performance`), `groups/group_styled.json` (the same
with `graphical` styles and statements beside its `order`) and
`bundles/bundle_mixed.json` (bundle `bundle_1`; groups `group_1`
"Performance", order `score`, `performance`, and `group_2` "Facsimile",
order `page`, `excerpt`; `excerpt` a child of root `recording`; root
`annotations` ungrouped).

1. **The file kind.** `manifestKind` is `timeline` for `bare.json`, `group`
   for `group_child_member.json` and `bundle` for `bundle_mixed.json`;
   `manifestRoots` gives the ids `["bare"]`, `["piece", "recording"]` and
   `["annotations", "page", "performance", "recording", "score"]`.
2. **Blocks.** Adding a block of each kind gives `blockKind` `group` and
   `bundle`; `set` of `manifest: <bare.json>` on the group block is refused
   with `block_kind_mismatch` at `[A, "manifest"]`; a view whose block of
   `group_child_member.json` claims `blockKind: "timeline"` gives
   `checkWorkspace` exactly one problem, `block_kind_mismatch` at
   `["blocks", A, "blockKind"]`. A workspace holding blocks of all three
   kinds writes and reads back deep-equal, and writes again to the same
   bytes; its file format stays version 1.
3. **Invariants root by root.** `group_child_member.json` with
   `second-half` unlocked is refused with exactly `child_not_locked` at
   `["timelines", 0, "children", "second-half", "timeline", "locked"]`.
4. **Elements of a group file.** `manifestElements(group_child_member)` is
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
5. **Elements of a bundle file.** The addresses of
   `manifestElements(bundle_mixed)` are exactly: the block (null);
   `bundle_1/name`; `group_1`, `group_1/name`; `score/card`, then `score`
   with its name, wedges and wedge labels; `performance` the same;
   `group_2`, `group_2/name`; `page` the same; `excerpt/card`, `recording`
   (type `ancestor`), `recording/name`, the marks `excerpt/start`,
   `excerpt/start/label`, `excerpt/end`, `excerpt/end/label`, then `excerpt`
   with its name, wedges and wedge labels; then the ungrouped root
   `annotations` with its card, name, wedges and wedge labels. The bundle's
   title, `annotations/card` and the line `annotations` are held by the
   block alone (chain `[block]`), the line's name by the block and the line
   (`[block, timeline]`). `memberDrawings`
   gives the frames `group_1` (`score`, `performance`) and `group_2`
   (`page`, `excerpt`, the latter with the one ancestor `recording`, offset
   its offset there) and the ungrouped roots `["annotations"]`.
6. **Addresses.** In a block of `group_number_types.json`, adding the region
   `region_1` (2 to 4 quarters) into `A/score` stores it in
   `timelines[2].regions`; `manifestIds` then holds exactly `group_1`,
   `page`, `performance`, `score` and `score/region_1`. `elementOf` of
   `score/region_1/label` is `score/region_1`, of `score/end/label`,
   `score/start` and `score/card` is `score`, of `group_1/name` is
   `group_1`. `score/start` is never an element: adding a region with the
   id `start` into `A/score` is refused, `schema_violation` at `[A,
   "manifest", "timelines", 2, "regions", 0, "id"]` (timeskeleton reserves
   the part words there), and so is a region with the id `card`, at the
   same path; and a
   `set` aimed at `A/score/start` is refused with `unknown_target` at `[A +
   "/score/start"]`, as a part is in a timeline block. `unknown_target` also
   for `A/region_1` (an entry needs its root), `A/page/region_1` (not in
   page's tree), `A/group_1` (a group is no target) and `A/score/region_1/x`.
7. **Commands.** `set` reaches a timeline at any depth: `name: "Late"` on
   `A/second-half` of `group_child_member.json` changes exactly
   `timelines[0].children["second-half"].timeline.name`, and `name: "Intro"`
   on `A/score/region_1` that region's name. `add` a child `clt_1` (bare's
   root, locked, length 8 quarters, offset 0) into `A/score` of
   `group_number_types.json`: it is stored under `timelines[2].children`.
   `duplicate_id` is scoped like the ids: a child carrying `page` (a
   timeline of another root) at `[A + "/page"]`; a second `region_1` into
   `A/score` at `[A + "/score/region_1"]`; but `region_1` into `A/page`,
   another tree, is accepted. `remove` refuses `A/score` (a root) and
   `A/second-half` (a child) with `unsupported_target` at the address and
   removes `A/score/region_1`. `style` with `blocks: [A]` on
   `group_styled.json`, `{select: {element: "ancestor"}, set: {opacity:
   0.5}}`, adds that statement after the file's three and keeps `styles` and
   `order`. The expected block is written out literally, copied from the
   fixture, so the test does not read what it checks: `order` exactly
   `["score", "page", "performance"]`, `styles` exactly
   `{"frame-highlight": {stroke: "#7F00FF"}}`, and `statements` exactly
   `{select: {element: "group"}, set: "frame-highlight"}`,
   `{select: {element: "name", ids: ["group_1/name"]}, set: {fill:
   "#7F00FF"}}`, `{select: {element: "card", inside: "group"}, set: {rx: 2,
   shadow: "#C4B5FD"}}`, then the new one. The three must come out unchanged
   and in this order: statements cascade (a later one wins), so a reordered,
   merged or rewritten statement would draw differently, and the string `set`
   names a style that must still resolve. Without `blocks`,
   `{select: {element: "group"}, set: {stroke: "#C00000"}}` reaches a group
   and a bundle block and not a timeline block beside them.
8. **Ids for new elements** (`nextId(view, block, prefix, into?)`), on a
   block of `group_number_types.json` with `region_1` in `score`: `region`
   into `score` is `region_2`, into `page` `region_1`, without `into`
   `region_2`; after adding a region `clt_1` into `page`, `clt` into
   `score` is `clt_1` (a region of another tree does not count) and into
   `page` `clt_2`; after adding the child `clt_1` into `score`, `clt` into
   `page` is `clt_2` and into `performance` `clt_2` (timeline ids are unique
   across the file); `group` without `into` is `group_2` (group and bundle
   ids are always taken).
9. **What can be removed** (`isRemovable(manifest, element)`, the one rule
   `remove` refuses through, which the arranger's delete preview and
   refusal hint read too). Exact cases, each with what `remove` of
   `A/<element>` gives:
   - `nested.json` (timeline file): `clt_1` is not removable, and `remove`
     refuses it with `not_removable`, message `root cannot be removed`;
     `clt_3` and `clt_2` are removable, and `remove` accepts them.
   - `group_child_member.json`: `piece`, `second-half` and `recording` (a
     root, a member that is a child timeline, a member that is a root) are
     not removable, and `remove` refuses each with `unsupported_target`,
     message `removing a timeline from a group or bundle file is not
     supported yet`; `group_1` is not removable, and `remove` finds nothing
     (`unknown_target`, message `<address> names nothing`).
   - `group_number_types.json` with `region_1` in `score`: `score`, `page`
     and `performance` as above (`unsupported_target`), `group_1` as above
     (`unknown_target`); `score/region_1` is removable, and `remove`
     accepts it.
   - `bundle_mixed.json`: `annotations`, `page`, `performance`,
     `recording`, `excerpt` and `score` as above (`unsupported_target`);
     `bundle_1`, `group_1` and `group_2` as above (`unknown_target`).
   - `nobody`, in each of the four, is removable: the rule refuses by kind,
     and `remove` refuses it as naming nothing (`unknown_target`).

   `isRemovableIn(manifest)` and `elementOfIn(manifest)` give the same
   answers as `isRemovable` and `elementOf` for every case above and every
   path of item 6; they read the file's kind and ids once for many calls.

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
   `settings`; `meta` is exactly `{format: "tilie-workspace", version: 1}`.
2. **Replay.** Replaying the read journal from `createView()` gives exactly
   the read `settings` and `blocks`.
3. **Refusals**, each exactly one problem `{code, path}`: text `{` →
   `invalid_json` at `[]`; `format: "other"` → `unsupported_format` at
   `["meta", "format"]`; `version: 2` → `unsupported_version` at `["meta",
   "version"]`; a top-level member `extra` → `unknown_member` at
   `["extra"]`; `meta.created` → `unknown_member` at `["meta", "created"]`;
   `settings.styles` → `unknown_member` at `["settings", "styles"]`; a
   block's `overrides` → `unknown_member` at `["blocks", A, "overrides"]`; a
   journal entry's `note` → `unknown_member` at `["journal", 0, "note"]`; no
   `journal` → `missing_member` at `["journal"]`; a block's `x` given as
   `"0"` → `invalid_value` at `["blocks", A, "x"]`; a block manifest
   declaring `0.0.0` → `schema_violation` at `["blocks", A, "manifest",
   "meta", "schema_version"]`; a block manifest with an unlocked child →
   `child_not_locked` at its path below `["blocks", A, "manifest"]`; an
   entry time `yesterday` → `invalid_value` at `["journal", 0, "time"]`; an
   entry command of type `move` → `invalid_command` at `["journal", 0,
   "command", "type"]`.
4. **Older manifests are migrated.** The round-trip workspace's text with
   every block manifest written as an older version of `SUPPORTED_VERSIONS`
   declares it (the declaration changed, `is_segment_line` removed) reads as
   a workspace deep-equal to the one read from the original text: its
   manifests declare `SCHEMA_VERSION`.

## Properties (`properties.test.ts`, fast-check)

Commands of every kind, over every target kind (regions, breaks, jumps and
markers included), are generated against the current view from seeds (a
command kind and natural numbers), so a sequence stays valid input whatever the earlier
commands did. Targets are drawn from what the view holds plus unknown and
malformed addresses; properties from the target's table, another kind's
table and unknown names; coordinates on the axis, off it, negative and past
the end; payloads include ones the schema refuses. Each fixture starts as
block `A` beside a block `B` of `bare.json`, in a store with an injected
clock. The fixtures are every timeline, group and bundle file; in a group
or bundle block the generator draws timelines by their bare ids and the
other elements by `<root id>/<id>`, and adds into the tree of the timeline
it targets.

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
   `child_not_locked`, `child_unit_mismatch`, `duplicate_id`,
   `duplicate_index`, `id_not_settable`, `invalid_address`,
   `invalid_coordinate`, `invalid_index`, `invalid_order`, `invalid_value`,
   `length_below_content`, `locked`, `map_source_unit_mismatch`,
   `negative_offset`, `non_finite_number`, `non_positive_number`,
   `not_removable`, `number_type_not_allowed`, `off_axis`,
   `region_end_before_start`, `schema_violation`, `unit_not_allowed`,
   `unknown_property`, `unknown_target`, `unsupported_target`,
   `wrong_target_kind`.

## Budgets (`budget.test.ts`)

The budgets time the code, so they do not run with the default suite, whose
files run in parallel with each other: `pnpm test` excludes this file and
`pnpm test:budget` (in `app/`) runs it alone, one file at a time
(`packages/core/vitest.budget.config.ts`).

A generated workspace of 300 blocks (the 29 timeline fixtures in turn) with a journal
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
