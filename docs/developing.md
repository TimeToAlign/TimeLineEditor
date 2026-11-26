# Developing TimeLineEditor

This guide is for people who change the code. It says how the repository is
laid out, what the words mean, how a change travels through the layers, and
where a new thing goes. The rules every contributor holds are in
[`AGENTS.md`](../AGENTS.md); the public code model is in
[`architecture.md`](architecture.md); each decision that brought a dependency
in is an ADR under [`decisions/`](../decisions/). The commands to install,
test, build and run are the table in `AGENTS.md`; this guide does not repeat
them.

## Two repositories, one wall

TimeLineEditor holds the editor (`app/`, a pnpm workspace of TypeScript
packages, Svelte 5 and Vite) and the server (`server/`, FastAPI,
installed from PyPI as `tilie-server`, whose wheel ships the built editor),
run by its user on their own computer or as a
[public instance](../README.md#a-public-instance).
The manifest format the editor reads and writes is specified by the
TimeToShare repository: the JSON Schema, the generated TypeScript types
and validator, the Python validator, the fixtures, the drawing
specification `docs/drawing.md` and the two drawing fonts with their
metrics table. Setting up both
checkouts is described in [`CONTRIBUTING.md`](../CONTRIBUTING.md#setup). The editor never
specifies the manifest; where the editor needs a word the schema does not
have, the schema is changed first.

## The three layers, named by one word each

- A **manifest** is one TimeToShare manifest: root timelines with exact
  coordinates, children at exact offsets, conversion maps, regions, flow
  control; optionally groups, measure maps, an `id`, a `name`, statements
  (the manifest, every timeline and every region state what they stand
  for in property–value pairs with their provenance, under an inline
  JSON-LD `@context`), `resources` (the files that come with it, such as
  its MatchClaim table), and `graphical`, the
  styling of its own drawing with the display orders of its groups, the
  band orders of its timelines, its named timestamps (groupstamps among
  them), its named MatchStamps and its elisions, the stretches of
  timelines its drawing leaves out. A manifest knows nothing about a canvas.
- A **block** is one manifest placed on the canvas with its placement: `x`,
  `y`, `scale`, `length`, `spacing` (the gap between the items of its
  drawing), `margin` (the empty space above its first item and below its
  last), the requested `width` and `height`, and `places`, the stated
  places of its items and the stated sizes, spacings and margins of its
  members' cards, a member's card set through its group, and, where it
  has one, its `arrangement`, which places its items in an order instead
  of at their places. A block's styling is its manifest's `graphical`;
  the block has no style layer of its own.
- The **workspace** is the canvas: its name, its blocks (and, where it
  has one, how they are arranged), its default style rules, the settings (outside the journal), and
  the command journal that produced them with the sessions of its editors.
  It is one pretty JSON file, written as TimeToShare's schema package
  writes JSON, by default `<name>.tle.json` after its name, format
  version 8; the manifests it holds are written there in their complete
  form with bare IDs, whatever file form each is exported in.

No other noun names any of these. "Document", "record" and "envelope" name
nothing here.

## The containers of a drawing

A manifest and its drawing nest the same four containers, each drawn by a
container of its own (TimeToShare's README, "Containers", states the
format's side):

| Semantic level | Graphical container | What it draws |
| --- | --- | --- |
| bundle | **block** | the manifest; a block's whole drawing |
| group | **frame** | a group, with its title and its members' cards |
| timeline | **card** | a timeline drawn as a root: an ungrouped root's card lies in the block, a member has one in the frame of each group that has it as a member; a virtual timeline is drawn the same way, in its groups' frames or, placed by the block, in the block |
| facet | **band** | one of a timeline's five facets, `markers`, `conversion_maps`, `children`, `regions` and `flow_control`, at the timeline's line |

All four are **boxes**, drawn as rectangles with rounded corners; "box" is
the generic word and names none of them. A child timeline is content of
its parent's `children` facet, drawn as a line in the children band, never
in a card of its own unless a group has it as a member. A band draws
nothing of its own; it is the unit that holds and orders what its timeline
has of its facet, placed by the timeline's band order in
`graphical.order`. Manifest content and addresses take the semantic words,
the drawing's containers the graphical ones.

One card stands apart: a root that contains a group member is drawn
whole as an **ancestor card** behind the frame of that member's group
(TimeToShare's drawing specification, section 8.8; shown by default,
hidden by a style rule). It is a card held by the block with no place (its
key `{item: G, member: R}`, core's holding `"ancestor"`), no bands and no
`places` entry; layout records it only when displayed, with axes for its
lines marked `ancestor`. The arranger tells it apart with `isAncestorCard`
and raises it over the frames while a timeline editor is open on its root
or on a descendant of it that no member card below the root draws, where
the root is in no group or is a member drawing an ancestor card itself
(`raisedRoot`, the one decision that the drawn order, the pointer, the
places of coordinates, the marquee and the focus all read, through one
stacking, `stackingOf`). The Elisions tab's timeline block hides it
(the mode Hidden, a `display` of `none` on the root's cards) or chooses
which elisions it draws.

Elisions follow the containers. A **card elision**, on a timeline in no
group, is drawn by the cards that draw its root whole, the root's own card
where it is ungrouped and its ancestor cards; a **group elision**, on a
timeline that lies in a group, is drawn across that group's frame, held by
the frame, and carried into the ancestor cards behind it. Which elisions a
card or a frame draws is a style property of that container
(`elision-mode` and its companions, in one rule on the root's card address
or on the frame's), never a setting of the workspace, so an export draws
what the canvas shows ([`decisions/0035`](../decisions/0035-elision-modes-are-style-properties.md)).
Layout records what each such container decides in `Drawing.elisions`,
and the arranger's `cardAxis.ts` is the one map between its abscissas and
the coordinates of its timelines.

Arrangements are placement, never part of the manifest
([`decisions/0036`](../decisions/0036-arrangements-are-placement.md)). A
block's `arrangement` takes its items, frames and ungrouped roots' cards,
in an order: one under another, or side by side in one row, where every
root that a group hangs on (a member of the group lying inside it) is
drawn once, by one ancestor card, the **once card**, behind every group
hanging on it. Core owns the rules (`manifest/arrangement.ts`: the
anchors, `rowOf`, the refusal and its reason), layout places what they
give (`block/arrangement.ts`, and `packed`, the one packing function),
and the arranger reorders: the workspace's `arrangement` packs the
blocks, an arranged level turns `move` into a drag that reorders, and
`orderAt` is the one rule of where a content drops. The once card's
line changes scale only between two groups, in a gap of origin
`arrangement` or at a **seam**, a jump of its axis that leaves out
nothing and is no element; seams also lie where an ancestor card's
member meets its frame's borders.

The code treats the four kinds through one model:

- core's registry (`manifest/containers.ts`) says what each kind is, the
  level it draws, what holds it, which place members it may state in a
  block's `places`, and the schema element type it is styled as (`block`,
  `frame`, `card`, `band`); `containersOf` lists every container of a
  manifest with its holder;
- layout records every container of a drawing as one `DrawnBox` in
  `Drawing.boxes`, with its kind, its place in `places`, address, holder,
  rectangle and the range of elements it drew; the arranger and the editor
  read that list and derive nothing from element order;
- the arranger's level table (`containers.ts`) says, per level of the
  canvas (the arranger, the bundle editor, the group editor, the timeline
  editor, the flow editor), what may be moved, reordered, resized, removed and opened, and
  how each kind of box resizes.

"Item" is a role (a frame or a block-held card is placed freely in the
block); "member" is a fact about a timeline (a group names it); neither is
a kind.

## IDs and addresses

Every element of a manifest has an ID, unique across the manifest and kept
verbatim: any non-empty string without control characters, with no
reserved word (TimeToShare's README, "Identity"). TiLiE never parses an ID,
and names a timeline, group or manifest without a `name` by its whole ID.
Where core creates an element itself (the first segment of an empty
segment line, the default timestamps, a named timestamp, an elision, a
named MatchStamp with its anchors, and a group, region, conversion map,
flow-control element, FlowMap or virtual timeline added without an ID), it mints
the ID as timetoalign does: the type prefix, `_` and 13 random base-36
characters (`timestamp_3b7gu4iwqkg9i`). `dispatch` mints these IDs before
the command is applied and journals them in the command's `ids`, so a
replay reads them and mints nothing; a minted ID is never renamed or
reissued. Any other element a command adds (a timeline, a child, a
measure map) carries its ID.

An address names anything a command can target, and it is an object,
never a string composed from IDs: `{}` the workspace, `{block}` a block,
and `{block, id?, facet?, part?}` an element of the block's manifest, its
members those of the manifest's own address (TimeToShare's drawing
specification, section 2.2): `{block, id: X}` a timeline, group, measure
map, conversion map, region, flow-control element, FlowMap, virtual
timeline, named timestamp (its wedge), named MatchStamp, alignment anchor
(its line) or stored elision (every gap drawn of it); `{block, id: T, part: ["elision"]}` the gaps a
card derives on `T`, which have no ID; `{block, id: T,
facet: F}` the band drawing facet `F` of timeline `T`; `{block, id: T,
part: ["card"]}` every card of `T`, a virtual timeline's too; `{block,
id: V, facet: "regions", part: [k]}` the chunk `k` (from 0) that the
virtual card of `V` draws, or the switched card of `T` with `T` in place
of `V`, the one address where `facet` stands with `part`, its part
beginning with the chunk index; `{block, part: ["name"]}` the manifest's
title; and a part of an element its address with `start`,
`name`, `label`, `id`, `coordinate`, `line` or `ellipsis` appended to `part`
(a named timestamp's line, a groupstamp's across every frame drawing it
included, is `{block, id: X, part: ["line"]}`). An element drawn more than
once, a member's cards in several frames among them, keeps one address in
every drawing of it, so a rule or a selection reaches every drawing.
Two addresses are equal when they are equal as whole objects, and
`addressKey(address)` is an address's one string form, the only key a map
or a Svelte keyed block takes for it. Core's `resolveAddress(view,
address)` is the one place that decides what an address names, returning
a discriminated record (workspace, block, title, frame, timeline, card,
band, entry, measure map, timestamp, elision, MatchStamp, anchor, FlowMap,
virtual timeline, virtual card, virtual band, chunk, part); a part
names something only where it is drawn. Nothing reads an ID or an address out of
a string. A statement has neither an ID nor an address: it is changed
through the element holding it, by one `set` of that element's whole
`statements` or `provenance`.

## How a change travels

1. **A gesture or a form edit** in the arranger or the inspector builds one
   command: `add`, `set`, `remove` or `style`, aimed at addresses. One
   completed gesture is one command; a preview shows
   `drawingOf(preview(view, command))`, the command applied without the
   schema check, so a preview can never differ from what the release stores.
2. **The store** parses the command, applies it through the pure reducer
   (`apply` in core), refuses it with a typed `{code, message, path}` when a
   rule is broken (the path starts with the `addressKey` of the target at
   fault, an added value's problems under the address it goes into, never
   with a bare block id), runs the side-effect guard when an editor is open, and
   journals it with its author and time. Undo and redo move by steps over
   the journal; a closed editor session undoes by runs.
3. **The view** is an immutable value; every component reads it through the
   arranger's `liveStore` adapter, never through a copy.
4. **The projection** turns the view into one Svelte Flow node per block;
   each node renders its block's drawing, `draw(manifest, placement, layers,
   metrics)` from layout, memoised by the identity of its inputs, as the
   element descriptors the writers produce. The same descriptors become the
   SVG and TikZ exports, so the screen and the file agree element for
   element.
5. **Saving** writes the store's snapshot (every open editor folded as Done
   would fold it) through core's canonical writer; opening reads the file,
   checks its structure, and `createStore` replays the journal to verify
   that it reproduces the snapshot, refusing a file whose journal does not.

## Where a new thing goes

- **A new settable property** of an existing target: a row in the capability
  table `commands/set.ts` with its reader in `values.ts`; a test case per
  accepted and refused value; the README section of the commands.
- **A new command kind** does not exist: the four commands are the whole
  vocabulary (`AGENTS.md`). A new editable thing is a new target kind or a
  new property.
- **A new target kind** (something addressable): the resolver
  (`workspace/address.ts`) learns to name it, the registry learns its
  container facts if it is a container, `commands/set.ts` gets its table,
  `commands/add.ts` and `commands/remove.ts` their branches, and
  `manifest/contains.ts` what it contains, which the side-effect guard reads.
- **A new container kind**: a row of core's registry `CONTAINERS` (its level,
  its element type, the place members it may state by holder); layout's
  `DrawnBox` records for it; the arranger's `RESIZING` row and its rules in
  the level table, which `fieldsOf` turns into the inspector's Properties
  fields. The drawing specification names it first.
- **A new element of the drawing**: `drawing.md` first (the specification
  and its fixtures pin the drawing; a rule the code applies that the
  specification does not state is a defect), then layout's element type,
  its band or module, its bounds in `geometry.ts`, its descriptors in the
  writers, a hand-derived fixture beside the emitted ones. `pnpm draw`
  (the writers' script, `AGENTS.md`) draws any manifest file to SVG and
  TikZ as the fixtures are drawn, to look at a case before it becomes one.
- **A new gesture**: a strategy in the arranger's `gestures/` for its
  `pointerGesture` engine (what a press takes, the value a point gives, the
  preview, the command on release) and a row property in the level table saying where it is
  offered; never a fifth pointer machinery.
- **A new inspector panel**: a Svelte component over a plain state module
  (`<name>.svelte.ts`) with the logic unit-tested without the component, a
  tab in `tabs.ts`, words in `words.ts`.
- **A new area of a stamp tab** (Timestamp, Matchstamp): a section
  component in the editor's `inspector/stamps/`, beside the name header
  (`StampName`), the Coordinates both tabs share (`StampCoordinates`), the
  display toggles (`DisplayToggles`), the wedge's rotation
  (`WedgeRotation`), the Timestamp tab's Properties
  (`TimestampProperties`), a MatchStamp's Lines, MatchClaims, Update and
  Remove and MatchClaim filter (`MatchstampLines`, `MatchClaimList`,
  `MatchstampActions`, `MatchClaimFilter`) and the coordinate granularity
  (`CoordinateGranularity`), all inside `StampPane`, which holds their
  shared look. The section reads what its tab hands it and builds its
  commands with the tab's readers (`timestamp.ts`, `matchstamps.ts`,
  `matchstampLines.ts`); what both tabs show is one section, never two.
- **A new schema rule**: the rule in both validators (`js/src/validate/*`,
  `python/src/timetoshare/validation/*`, the same module and the same
  order), a stable code in both `diagnostics` modules' `ValidationCode`, a shared rejection fixture that pins the path and
  message in both languages, and the README's rule table.
- **A new lookup system**: an ADR on its access rules first (where it is
  asked from, its rate limit and identification, what leaves the browser);
  a module in the editor's `src/lookup/` behind the one `Lookup`, its
  kinds in `kinds.ts`, and answers recorded once for its tests. A service
  whose rules of use a browser cannot keep is asked only through the
  server, which keeps them for every request of the run.
- **A new viewer setting** (who the user is, type profiles): the
  browser's `localStorage` under a key the host passes in `storage`,
  never a workspace setting, a command or a manifest member.
- **A new dependency**: an ADR first, always weighing "write it ourselves"
  (`AGENTS.md`, Design Rules).

## Testing

Every package carries `tests/README.md`, written before its tests. It
states what proves each behaviour, which values the package owns and
derives, and where the oracle is: the drawing fixtures of TimeToShare
(byte-equal SVG and TikZ), the specification's arithmetic, or another
package. It names no internal function. Values are exact; no thresholds,
no approximate matchers. Tests reach a package through its public
behaviour: what a press at a point hits, which command a drop produces,
what a drawing contains. Small runs (one package's `vitest --project`, one
Playwright spec, one package's `tsc`) run freely and in parallel; the whole
suite, `e2e:all`, the build, the budgets and the screenshots are heavy and
run one at a time. The end-to-end specs read state through the test hook
`window.__tilie`, present only in development and test builds, never
through pixels, except the screenshot project.

## Embedding

`Editor.svelte` is the whole editor as a component with options: the server
(`{url, token}` or none), the storage slot and keys (or none: the
user and the type profiles are kept under `userKey` and `profilesKey`
only where the host names them), whether the Metadata tab may look values
up (`lookup`), the shortcut scope (`"editor"` or `"window"`), the notices
URL, and `onchange` and `onselect` callbacks. It styles only its own root, names its ids per instance and
reaches the page only through those options. `App.svelte` is the one page
that owns a document: it writes the title, styles `html` and `body`, takes
the server's token from the URL fragment and binds the window shortcuts.
`embed.ts` exports `mount(element, options)`, a framework-free entry over
Svelte's `mount`/`unmount`, built by `pnpm build:embed` into `dist-embed/`
(`tilie.js`, `tilie.css`, the fonts). A host page loads the stylesheet,
imports `mount`, and hands it one element with a definite height.

## Releasing

A TimeToShare version is a schema version, released by release-please on
`main` and published to npm and PyPI by trusted publishing. TimeLineEditor
is released as `tilie-server` to PyPI, by release-please and trusted
publishing as well; while the editor builds against an unreleased schema
version it links the sibling checkout and is not published.
`scripts/check_versions.py` checks a tag against the declared versions.
