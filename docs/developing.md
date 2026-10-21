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
packages, Svelte 5 and Vite) and the local server (`server/`, FastAPI,
installed from PyPI as `tilie-server`, whose wheel ships the built editor).
The manifest format the editor reads and writes is specified by the
`timeskeleton` repository: the JSON Schema, the generated TypeScript types
and validator, the Python validator, the fixtures, the drawing
specification `docs/drawing.md` and the font metrics. Setting up both
checkouts is described in [`CONTRIBUTING.md`](../CONTRIBUTING.md#setup). The editor never
specifies the manifest; where the editor needs a word the schema does not
have, the schema is changed first.

## The three layers, named by one word each

- A **manifest** is one TimeSkeleton manifest: root timelines with exact
  coordinates, children at exact offsets, conversion maps, regions, flow
  control; optionally groups, measure maps, an `id`, a `name`, and
  `graphical`, the styling of its own drawing with the display orders of
  its groups and the band orders of its timelines. A manifest knows nothing
  about a canvas.
- A **block** is one manifest placed on the canvas with its placement: `x`,
  `y`, `scale`, `length`, `spacing` (the gap between its box's items), the
  requested `width` and `height`, and `places`, the stated places of its
  items and the stated sizes and spacings of its cards. A block's styling is its manifest's `graphical`; the block has no
  style layer of its own.
- The **workspace** is the canvas: its name, its blocks, the settings, and
  the command journal that produced them with the sessions of its editors.
  It is one canonical JSON file, by default `<name>.tle.json` after its
  name, format version 4.

No other noun names any of these. "Document", "record" and "envelope" name
nothing here.

## The containers of a drawing

A block's drawing is one **box** (the manifest's box). Inside it, every
group is a **frame**, every timeline drawn as a root is a **card** (held by
the box when the root belongs to no group, else one in the frame of each
group that has it as a member),
and every timeline has five **bands**, one per feature it can hold:
`children`, `conversion_maps`, `markers`, `regions`, `flow_control`. A band
draws nothing; it is the unit that holds and orders what the timeline has
of that kind, placed by the timeline's band order in `graphical.order`.

These four kinds are one hierarchy, and the code treats them through one
model:

- core's registry (`manifest/containers.ts`) says what each kind is, how it
  is addressed, what holds it, which place members it may state in a block's
  `places`, and the schema element type it is styled as; `containersOf`
  lists every container of a manifest with its holder;
- layout records every container of a drawing as one `DrawnBox` in
  `Drawing.boxes`, with its kind, key, address, holder, rectangle and the
  range of elements it drew; the arranger and the editor read that list and
  derive nothing from element order;
- the arranger's level table (`containers.ts`) says, per level of the
  canvas (the arranger, the bundle editor, the group editor, the timeline
  editor), what may be moved, reordered, resized, removed and opened, and
  how each box kind resizes.

The semantic levels the style selectors will name are bundle, group,
timeline and feature; the registry maps each container kind to its level.
"Item" is a role (a frame or a box-held card is placed freely in the box);
"member" is a fact about a timeline (it is in a group); neither is a kind.

## Addresses

An address names anything a command can target: `workspace`, a block id, or
`<block id>/<element address>`. Inside a manifest one rule holds: a
timeline, a group, a measure map or the manifest's title (`name`) by its
bare id; an ungrouped root's card `<timeline>/card` and a member's card
`<group id>/<timeline>/card`, one for each group that has the timeline as
a member; a band `<timeline>/<kind>_1`; every other element (a conversion
map, region or flow-control element) `<root id>/<element id>`; a part of
an element appends a reserved part word (`start`, `end`, `name`,
`label`), and `card` is reserved too. Every other element drawn more than
once keeps one address in every drawing of it; only a card's names its
group. Core's `resolveAddress(view, address)`
is the one place that decides what an address names, returning a
discriminated record (workspace, block, title, frame, timeline, card,
band, entry, measure map, part). Nothing else parses an address; the four
builders `qualify`, `cardAddress`, `partAddress` and `elementAddress` are
the only ones that build one.

## How a change travels

1. **A gesture or a form edit** in the arranger or the inspector builds one
   command: `add`, `set`, `remove` or `style`, aimed at addresses. One
   completed gesture is one command; a preview shows
   `drawingOf(preview(view, command))`, the command applied without the
   schema check, so a preview can never differ from what the release stores.
2. **The store** parses the command, applies it through the pure reducer
   (`apply` in core), refuses it with a typed `{code, message, path}` when a
   rule is broken, runs the side-effect guard when an editor is open, and
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
  writers, a hand-derived fixture beside the emitted ones.
- **A new gesture**: a strategy in the arranger's `gestures/` for its
  `pointerGesture` engine (what a press takes, the value a point gives, the
  preview, the command on release) and a row property in the level table saying where it is
  offered; never a fifth pointer machinery.
- **A new inspector panel**: a Svelte component over a plain state module
  (`<name>.svelte.ts`) with the logic unit-tested without the component, a
  tab in `tabs.ts`, words in `words.ts`.
- **A new schema rule**: the rule in both validators (`js/src/validate/*`,
  `python/src/timeskeleton/validation/*`, the same module and the same
  order), a stable code in both `diagnostics` modules' `ValidationCode`, a shared rejection fixture that pins the path and
  message in both languages, and the README's rule table.
- **A new dependency**: an ADR first, always weighing "write it ourselves"
  (`AGENTS.md`, Design Rules).

## Testing

Every package carries `tests/README.md`, written before its tests. It
states what proves each behaviour, which values the package owns and
derives, and where the oracle is: the drawing fixtures of `timeskeleton`
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
(`{url, token}` or none), the storage slot (or none), the shortcut scope
(`"editor"` or `"window"`), the notices URL, and `onchange` and `onselect`
callbacks. It styles only its own root, names its ids per instance and
reaches the page only through those options. `App.svelte` is the one page
that owns a document: it writes the title, styles `html` and `body`, takes
the server's token from the URL fragment and binds the window shortcuts.
`embed.ts` exports `mount(element, options)`, a framework-free entry over
Svelte's `mount`/`unmount`, built by `pnpm build:embed` into `dist-embed/`
(`tilie.js`, `tilie.css`, the fonts). A host page loads the stylesheet,
imports `mount`, and hands it one element with a definite height.

## Releasing

A `timeskeleton` version is a schema version, released by release-please on
`main` and published to npm and PyPI by trusted publishing. TimeLineEditor
is released as `tilie-server` to PyPI, by release-please and trusted
publishing as well; while the editor builds against an unreleased schema
version it links the sibling checkout and is not published.
`scripts/check_versions.py` checks a tag against the declared versions.
