# `@timetoalign/tilie-editor` tests

The package holds the editor (header, canvas, inspector drawer and dialogs
for one workspace), the standalone page that mounts it, and `mount`, the
framework-free entry a host page calls. The Vitest tests mount components
into jsdom, read them by role, label and accessible name (every id is made
per instance) and compare exact values; the canvas's drawing and gestures
are proven in a browser by the Playwright suite. `fetch` is stubbed,
IndexedDB is a fresh fake per test, and after each test every component is
unmounted and its pending autosaves awaited. `pnpm typecheck` runs
`svelte-check --fail-on-warnings`, which also fails on the compiler's
accessibility warnings. Workspaces hold the installed timeskeleton
fixtures, one block per manifest journalled as one `add` (blocks
`0000000000`, `0000000001`, … side by side), or are the committed
end-to-end workspaces.

The editor owns what it shows, when, and in which words; the rest is read
from its owner, never re-derived: what a command, an opening, Done and
Cancel do, and whether a command is accepted, from core's store; a written
file from core's snapshot and writer; what an address names from core's
resolver through the arranger's resolved selection; a geometry edit's
command, stretches included, from the arranger's edit for the same
addresses, property, value and level (the edit a gesture makes); every
drawn value (a frame's place, a card's size, a band's level and count) from
the drawing's record, read in the test itself.

## The page (`App.test.ts`)

The page is one caller of the editor: the page's one level-1 heading
"TimeLineEditor", given to the editor's header as its title, the drawer
and About, no footer, and the focused canvas (`application`
"Arranger"). With `#token=abc` in the address, the one health request is
`api/health` with `Authorization: Bearer abc`, the fragment is gone from
the address before that request and the history gains no entry; without a
fragment token (a `?token=` query is none) the request carries `Bearer `
and the address is untouched. A healthy server shows nothing; an answer
outside 2xx or an unreachable server shows one "offline" mark in a polite
live region, whose title and screen-reader text read "The server did not
answer the health check (`<reason>`)." with `502 Bad Gateway` or the
fetch's message as the reason. The drawer is closed by default, toggled by
"Open inspector" and "Close inspector", and its state is written under
`tilie.inspector.open` and read at the next mount (`"true"` opens, anything
else closes); a storage that throws leaves it closed and working.

## Editing (`EditingBar.test.ts`, `editing.test.ts`)

The store holds `bundle_mixed` in block `A`, `nested` in block `B` (no id,
no name) and in block `C` `bundle_mixed` known only by its id `mixed` (its
own and its group `group_2`'s names deleted). The bar renders nothing while
no editor is open. With editors open it is one group "Editing" holding Done
and Cancel, in that order, then "Editing:" and an ordered list "Editing
path" whose items are the open editors' names alone, outermost first, as
"Words" defines them: `["Mixed", "Performance", "Score"]` for block `A`'s
three editors, `["Anonymous bundle", "clt_1", "clt_3"]` for block `B`'s,
`["mixed", "group_2"]` for block `C`'s. A renaming shows at once.

Done closes the innermost editor, one per click. Cancel without changes
closes at once and opens no dialog. Cancel with changes asks "Are you sure
you want to discard 1 change?" ("2 changes" with two) in a modal dialog
with Yes and No, the focus on No. No, Escape and a click on the backdrop
close the dialog and keep the editor and its change; a click on the
question keeps the dialog open; Yes closes the editor and leaves the view
and the journal exactly as they were before it opened.

The page follows the editing path. The drawer opens when the first editor
opens, without taking the focus from the canvas; an inner editor does not
reopen it once the viewer closed it. Save and the autosave write the open
editor folded (the `add`, then one session entry whose session holds the
editor's changes), as the hook's `text()` does, and leave it open. Opening
an editor, a reopening included, makes the selection its edited element,
whatever was selected: `A` for the bundle editor of `A`, `A/group_1` for
`group_1`'s, `A/group_1/score/card` for `score`'s (a member's card is
addressed by its group). Closing an editor, and every
other change of the store, prunes the selection by the arranger's one
rule: other timelines' bands go and a part stays, so closing `score`'s
editor over its band, `performance`'s band and `score/start` keeps
`score/start`; with `score`'s editor open inside `group_1`'s, a rename
keeps `score/start` and `score` itself and drops `performance`.

## Files (`shell.test.ts`, `files.test.ts`)

The File menu follows the WAI-ARIA menu button pattern: its items and
shortcut labels (New workspace, Open… Ctrl+O, Save Ctrl+S, Save as…
Ctrl+Shift+S, Import manifest…, Export manifest…, Export minimal
manifest…), the exports disabled without a selected block, and every key
of the pattern, each checked by the focused item and `aria-expanded`. A
refused file leaves the open workspace as it is and shows one dismissible
message, "bad.tle.json is not a workspace file", with each problem's code
and place. The file name and the document title ("untitled.tle.json –
TimeLineEditor") gain "• " after a command, lose it when undo returns to
the opened view and regain it on redo; New workspace on unsaved changes
asks "untitled.tle.json has unsaved changes. Discard them?" and only
Discard replaces the workspace. Save writes core's writer's text of the
store under the workspace's file name, takes Ctrl+S from the browser and
clears the mark; a workspace with no file yet is offered the file its name
gives (renamed "Eroica sketches", `Eroica sketches.tle.json`), and a
workspace with a file keeps that file's name when renamed (renamed again
"Variations", saved again as `Eroica sketches.tle.json`; restored from
autosave as `score.tle.json`, saved as `score.tle.json`); a save requested while one is under way is ignored.
A workspace file stating no name opens named `untitled`, whatever the
file's name (`Op. 35 sketches.tle.json`), and one stating a name its
journal gave opens under it (`Eroica sketches` from `other.tle.json`); a
new workspace stays `untitled`. In a text
field the browser keeps Ctrl+Z; elsewhere Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z
step the journal and drop selected addresses that no longer exist. Import
adds one `add` of the manifest at the view's centre, the new block
selected; a refused manifest ("bad.json is not a manifest") adds nothing.
Export writes the selected block's manifest, complete or minimal, as core's
writer gives it, under its manifest file name, and is disabled while the
selection spans two blocks.

A workspace's file name is its name and `.tle.json`, every character a
file name cannot hold on Windows, macOS or Linux (the control characters
and `/ \ : * ? " < > |`) written `_`: `untitled` gives `untitled.tle.json`,
`Eroica sketches` `Eroica sketches.tle.json`, `a/b\c:d*e?f"g<h>i|j` and a
tab `a_b_c_d_e_f_g_h_i_j_.tle.json`.

A manifest's file name is its id, else its name, else `bundle`, characters
outside `[A-Za-z0-9_-]` replaced by `_` (`flow_quarters.json`,
`Eroica__II.json`, `bundle.json`); the last-change time is the last entry's
local time to the minute (`2026-10-12 09:05` in UTC). The fallback file
input opens the chosen file's exact text and leaves no input behind, a
download writes exactly the given text; with File System Access a file is
saved back into its handle, a save without one picks one, a cancelled
picker gives nothing and any other failure is thrown. About shows
"TimeLineEditor `<version>`" from the app's `package.json`, "tilie-server
0.1.0 (timetoalign 1.2.0)" from the health, the installed timeskeleton's
version and schema version, the workspace packages and the link to
`THIRD_PARTY_NOTICES.txt`; offline, "offline: " and the reason.

## Autosave (`autosave.test.ts`, `shell.test.ts`)

The storage alone: a snapshot is written once after the delay, the latest
of a burst only (a text given as a function is called once, when due); a
flush writes at once; a discard empties the slot, also after a write has
started; each key has its own slot, which recovers the last text byte for
byte. A failing IndexedDB rejects with `indexeddb_failed`, a failed timed
write once at the next flush or to the error callback; no IndexedDB is
`indexeddb_unavailable`.

The editor uses the slot `current`. A slot holding more than an empty
workspace is offered with "Restore the unsaved workspace from 2026-10-12
09:05?" (its last entry's time, in UTC); Restore opens it unsaved under its
file's name, Discard empties the slot. An empty, saved or untouched
workspace is never offered, and undo back to the saved view empties the
slot. Hiding the page and unmounting write the pending snapshot at once.
The editor autosaves only while it holds the Web Lock
`tilie-autosave/current`, says once "Autosave of this workspace is active
elsewhere, so changes here are not autosaved." when it does not, gives back
a lock granted after it went, and writes nothing when it went during its
recovery read. A failing storage is shown once and editing goes on.

## Attributions and the build (`attributions.test.ts`)

This test builds the production page with source maps, so it runs under
`pnpm test:build`, outside `pnpm test`. The oracles are the source maps and
each bundled package's own files: the attributions name exactly the npm
packages found in the bundle, each with the licence of its `package.json`
and every copyright line of its licence file; the icons and both fonts are
backed by their licence files, the drawing font (DejaVu Sans) by the schema
package's and the title font (IBM Plex Mono, vendored in `fonts/`) by its
own, whose every copyright line the attribution gives; the build emits each
font once as an asset, the title font byte-equal to the vendored file
(SHA-256 `ba204497…b350`, 49,248 bytes); `THIRD_PARTY_NOTICES.txt` holds
every full licence text in order, the two fonts last. No chunk reaches 500 kB, neither the YAML nor the
TOML codec is preloaded, and no shipped file holds a fixture's generator
string or "Fixture Generator". The development server may read the app
workspace and the resolved schema package.

## The test hook (`hook.test.ts`)

`window.__tilie` exists in a test build and goes with the editor. At start
it reports the empty workspace, no selection, `locked()` false and `mode()`
`"scale"`. Its `load` replaces the store with exactly the file's workspace
(`text()` equal byte for byte) and clears the selection; a refused file
throws with the reader's problem codes and keeps the store. Its `open`,
`done` and `cancel` drive the editing path as the store does, without the
bar's question (`unknown_target` for an unknown target). The fixture menu
offers every end-to-end workspace and every group and bundle fixture of the
schema version but `corpus_*` and the minimal twins, sorted; a manifest
fixture loads as one block `fixture000` at the origin, journalled once by
"Fixture Generator", and Delete on the canvas removes a selected timeline
of it as one `remove`.

Its `bands` maps each band record of a block's drawing into client pixels
through the drawing's `<svg>` rectangle: the rectangle's offset plus the
drawing's value times the rectangle's size over the drawing's. A hand-made
drawing of 400 × 200 (a box, a card and three bands, the line at 30.5) in a
rectangle at (100, 50) of 800 × 400 puts the line at 111, and partly off
screen is computed alike; on two real blocks the values are the arranger's
drawing mapped the same way. A block whose drawing is not on the page
cannot be placed, and an unknown block throws a `RangeError`. Its `boxes`
lists a block's container records as the drawing has them (kind, address,
holder, displayed), in box order, and throws the same `RangeError`.

## Embedding (`embed.test.ts`)

`mount` is proven against a host page. The host stays untouched: its body
margin, title, address and history length are unchanged, no request is
made and no IndexedDB opened (no `server` and no `storage` given),
`localStorage` stays empty, there is no test hook, no fixture menu and no
level-1 heading, and About says "no server". `text()` gives back the given `workspace` byte for
byte. `onchange` reports `{fileName: "untitled.tle.json", dirty: false}`
for it and exactly one `{…, dirty: true}` after a Delete on the canvas.
Ctrl+S on a host input or the body is not prevented; on the canvas it is.
Two editors on one page share no id, and a `select` in one leaves the
other's `selection` empty and reaches only the first's `onselect`. `load`
of a refused text returns its problem codes and leaves `text()` as it was;
so does a workspace whose journal does not reproduce its view
(`journal_mismatch` at the block no entry adds). Mounting on an element
that holds an editor or anything else throws. With `shortcuts: "window"`
the body's Ctrl+S is the editor's until `destroy()`, which empties the
element, removes every window listener the editor added (counted per event
type) and lets the element take an editor again; with `storage` given, it
writes the pending autosave before it unmounts.

## The manifest as text (`inspector-text.test.ts`, `inspector-codecs.test.ts`, `Inspector-load.test.ts`)

The Manifest panel shows the selected block's manifest as JSON, YAML or
TOML and writes an edited text back as one `set` of the block's
`manifest`. The oracles are the fixtures (their bytes), timeskeleton's
`dumps` (a canonical text that sorts keys, so only a changed value fails a
comparison) and the store (what it accepts and refuses).

1. **Every manifest round-trips through every format, byte for byte.**
   Each manifest fixture of the installed schema version (top level,
   `groups/`, `bundles/`; a minimal twin reads back as its complete fixture,
   a case already) is written in each format and read back, and `dumps` of
   the value read equals the fixture's bytes.
2. **Numbers stay exact.** Through `set`, an integer length of
   9007199254740993 ticks (2^53 + 1), a float of 12.500000000000002 seconds
   and an integral float of 1e16 seconds survive all three formats as
   exactly `9007199254740993n`, `12.500000000000002` and a `JsonFloat` of
   `1e16`; the YAML text carries `length: 9007199254740993` and
   `length: 10000000000000000.0`.
3. **TOML's missing null follows the schema.** A key whose value is null
   is left out exactly when the schema requires it and admits null or gives
   it the default null, and reading puts it back; the walk over the
   schema's definitions lists exactly the `name` of the manifest, a group,
   a measure map and a region; a timeline's `length`, `name`; a
   flow-control element's `label`, `name`; and `name`, `source_unit`,
   `target_unit` of `MapBase`, the base every conversion map type takes
   through its `allOf`, which the walk along a value follows. A manifest of
   two roots (one of unknown length, one holding a `LinearMap` whose
   `target_unit` is null), a group and a measure map has its TOML text
   pinned whole, and reads back with all seven nulls. A measure-map row with
   `nominal_length: null` (optional, no default null) is refused
   `not_representable` at its path, "TOML has no null, and the schema
   neither requires this member nor defaults it to null", and goes through
   JSON and YAML; a TOML text without a required key (`bare` without its
   `id`) is the store's to refuse (`schema_violation` at
   `["timelines", 0]`).
4. **Apply dispatches exactly one `set`, or none.** A changed text adds one
   journal entry, the `set` of the block's `manifest` to the value read. A
   text whose complete form is the stored manifest (compared by `dumps`)
   dispatches nothing and is no refusal: the store refuses a `set` that
   changes nothing (`invalid_value`, "the command changes nothing"), so the
   comparison is the inspector's.
5. **A refusal points into the text.** The store's path loses its
   `[<block>, "manifest"]` prefix and is shown as a JSON pointer:
   `"locked": "yes"` is `schema_violation` "must be boolean" at
   `/timelines/0/locked`, `"unit": "parsecs"` "must be equal to constant"
   (the first `const` of the units' `oneOf`) at `/timelines/0/unit`. A syntax error carries the
   reader's 1-based line and column: JSON `"locked": ,` at 19:17, YAML
   `locked: [false` at 14:5, TOML `locked = ` at 16:1. No refusal adds a
   journal entry.
6. **Comments survive.** In each of the four modes, a YAML or TOML text
   with a comment line and an inline comment, applied, is exactly the typed
   text; after the store renames the timeline, the text followed in the
   same mode is the same text with the new name, both comments in place.
7. **The four modes.** A text is complete or minimal, with or without the
   styling (`graphical`). With `bare` styled by one `style` command, each
   mode's JSON text is pinned whole: the fixture `bare.json` or
   `bare.minimal.json`, with the styling `graphical` first. In every mode
   and format an applied edit stores the complete manifest with that edit
   (the styling kept when the text leaves it out) and shows the text
   written from it; the shown text, its JSON reflowed or with keys
   reversed, or a minimal text spelling a default, applies nothing; a typed
   colour replaces the styling; without the styling a typed `graphical` is
   refused `hidden_member` at `["graphical"]`, "the styling is excluded;
   check Include styling to edit graphical".
8. **The codecs load on demand, once, and a failure is shown.** In a fresh
   module graph JSON is loaded and YAML and TOML are not; writing YAML
   before loading throws "the yaml codec is not loaded; await loadCodec";
   two concurrent loads of YAML give one codec; then TOML loads. With
   TOML's import failing, choosing TOML shows one alert, exactly `TOML
   could not be loaded (<reason>).`, and no text area; choosing JSON again
   shows the JSON text and no alert.

**The text state.** The panel's text outlives the panel, so its rules are
proven on the state alone, then through the component ("The tabs and
panels"):

- a clean text shows the selected block's manifest, another block's when
  the selection changes, nothing without a block;
- an edited text is never replaced: a change of its manifest or of the
  selection marks it stale, and Apply writes it to the block it was written
  for, after which it shows the stored manifest, clean and not stale;
- a text typed back to the shown text follows at once (the newer manifest,
  not stale);
- a refused Apply's problems go with the refused text once it is typed
  back; a problem of writing the manifest (the `nominal_length` null in
  TOML) stays while that manifest is shown, the text area empty;
- Revert shows the selected block's stored manifest, or nothing;
- a change of format or option writes the text again.

## The Properties form (`inspector-properties.test.ts`, `inspector-bands.test.ts`, `inspector-fields.test.ts`)

The form edits the geometry of what is selected, never the block's when
something inside it is. A selected container has a role: the **box** (the
block's placement), an **item** (a frame, or a card the box holds: its
place in the box) or a **held** card (a card a frame holds: its frame's
shared scale and length, its own spacing and size). The form is right when
for each role it names exactly the selected containers, shows their values
as the drawing records them (stated, else drawn), offers what the level
edits, and dispatches exactly the arranger's command.

The workspace is the end-to-end `bundles` workspace, block `bmixed0000`
("Mixed", length 400, scale 1, nothing in `places`; `group_1` holding
`performance` and `score`, `group_2` holding `excerpt` and `page`; the
ungrouped root `annotations`; `recording`, drawn only as `excerpt`'s
ancestor, has no card).

1. **Roles.** The block names the box, "Block properties", `{x: 0, y: 0,
   scale: 1, length: 400, spacing: 8, width: null, height: null}`.
   `group_1` and its title name the frame, "Frame properties", with its
   record's values (its spacing the frame's default 8). `annotations` and `annotations/card` name the card the
   box holds, "Card properties". `group_1/score/card` and
   `group_2/excerpt/card` name cards
   their frames hold, "Card properties", with their frame's scale and length
   and their own spacing and size. Two frames are edited together in
   selection order; a frame with a card the box holds is "Frame and card
   properties"; two addresses of one card are one card. None for no
   selection, mixed roles, the box with a frame, the title, `recording`, a
   map, or two blocks.
2. **Stated values win**, and a held card's spacing is its own: after
   stating `group_1` `{length: 300, scale: 1.5, spacing: 2}` and `score`
   `{width: 650, spacing: 1.25}`, the frame shows 300, 1.5, 2 and the card
   1.5, 300, 650, 1.25.
3. **During a gesture the values are the gesture's drawing's**: with a
   placement whose drawing states `group_1` `{length: 460}`, the frame and
   its held card show that record (length 460, its width); a placement's
   `x` is the box's. A gesture on another block, or none, leaves the stored
   values.
4. **Fields per role and level** are the arranger's field table, in
   core's place order: the box and an item offer `x`, `y`, `length`,
   `scale`, `spacing`, `width`, `height`; a held card `length`, `scale`
   (labelled "group length", "group scale"), `spacing`, `width`, `height`.
   The size is the container's: `width` and `height` are labelled
   "container width" and "container height" in every role.
   Withheld, and disabled in the form: the box's `length`, `scale`,
   `spacing` in a group or timeline editor (the store refuses them there,
   `side_effect`); an item's `x`, `y` everywhere but the bundle editor;
   nothing of a held card.
5. **One edit, the arranger's command.** For the box's `x`, a frame's
   `length`, a held card's `scale`, and its `spacing` and `length` in the
   group editor, two frames, two held cards' `width` in the timeline editor
   and a frame's `scale` in the bundle editor, the command built from the
   typed text equals the arranger's edit of the same addresses, property,
   value and level. An emptied `width` sends `null`; a value every selected
   container stores already (`650.0` for a stated 650, the block's `400`)
   gives no command. Text that is no decimal number is refused before
   dispatch, `invalid_value` at `[<first address>, property]`: an empty
   `length` or `spacing` ("… needs a number"), `abc`, `0x10` ("… is not a
   number"). A step is the arranger's edit with the step applied to each
   container's own value. A size below its minimum is item 7's.
6. **Numbers a field shows and steps.** A step adds or subtracts 1 for `x`,
   `y`, `length`, `spacing` (a gap in canvas units), `width`, `height` and
   0.1 for `scale`,
   rounded to the decimals of value and step: 10.123 + 1 is 11.123, 1 − 0.1
   is 0.9, 0.9 − 0.1 is 0.8, 0.7 + 0.1 is 0.8, 1e-7 + 0.1 is 0.1000001,
   −0.05 + 0.1 is 0.05, an empty value + 1 is 1. A field shows at most two
   decimals as `toFixed(2)` rounds the double: 12.5, 12.34 (12.3449), 7,
   10.12, 3 (2.999), 478.58 (478.5771484375), 1.5 (1.49951171875), 0.13
   (0.125), 1 (1.005, whose double lies below the half), 0 (−0.001), and
   empty for null. Decimal text only: `12.5`, ` 300.0 `, `-.5`, `1e3`, `+7`
   read; `0x10`, `Infinity`, `1e400`, `abc` and the empty text do not.

7. **A size at or below its minimum** (`inspector-fields.test.ts`). A
   container's minimum `width` or `height` is its content's own extent:
   what its drawing records when nothing states that size. The oracle is
   the stored drawing of `bmixed0000`, which states no size anywhere, so
   the drawn sizes are the minimums: the box's height is the drawing's
   height, `group_1`'s and `group_2`'s width and height their frame
   records'. Each container is held to its own minimum, never to another
   selected container's. The block, whose unstated size the field shows as
   "auto", is given its minimum as a number: `1` for its `height` is one
   command equal to the arranger's edit of the block to that minimum. A
   frame or a card states no size at or below its minimum, as the Box
   gesture leaves it, and is drawn at the minimum: with `group_1` first
   stated 10 above its minimum, `1` for its `height` (and, alike, its
   `width`) is one command equal to the arranger's edit of `group_1` to
   `null`, and the field then shows the drawn value, the minimum; on the
   frame stating no size, `1` dispatches nothing. A value below a minimum
   sets the status line to exactly `To decrease the height below <m> px,
   decrease the size of the contained elements first.` (`width` for the
   width), `<m>` the largest minimum a typed value fell below, as a field
   shows it (at most two decimals). With `group_1` and `group_2` selected,
   their minimum heights `a < b`, the height `a + 1` (one more than the
   smaller minimum, below the larger) is one command: the arranger's edit
   of both frames to `a + 1`, less the change of the frame whose minimum is
   `b` (it states no height already); the notice names `b`. A size above
   every minimum, a size equal to a frame's minimum, or an empty one gives
   no notice. The next typed text clears the notice.
8. **The name field** (`inspector-fields.test.ts`). The tab's first field
   is a text field "Name". With nothing selected it is the workspace's name
   at the top level (`untitled` for this workspace, its target
   `workspace`, never empty) and, in an editor, the edited element's: the
   name of what the editor's opening selects, read through core's
   resolver (the group editor of `group_1` gives `Performance`, target
   `<block>/group_1`; the bundle editor the manifest's `Mixed`; every
   edited element has the schema's nullable `name`, so a null one shows an
   empty field). For one inspected thing its name
   where the schema gives it one, read through core's resolver, a part
   standing for its element: the block and its title the manifest's
   (`Mixed`, target the block), `group_1` (`Performance`), `score` and
   `group_1/score/card` and `score/start` the timeline's (`Score`), the conversion
   map `page/cmap_1` (empty, its name null; target `<block>/page/cmap_1`),
   the jump origin `score/jump_from_1` likewise (every flow-control element has
   the schema's nullable `name`), and a measure map `bars` added to the
   block (empty; target `<block>/bars`, its bare id). No field for a band or two things, in one
   block or in two; mounted, two blocks selected show no field and the
   geometry hint. The command: a text equal to the stored name is none; an
   empty text unstates a nullable name (`{name: null}`) and is sent as
   `""` for the workspace, which the store refuses. Mounted, `Op. 35` and
   Enter rename the manifest in one entry; `Eroica` and blur rename the
   workspace; an emptied workspace name keeps the draft, marks the field
   `aria-invalid` and shows the store's message `a name is a non-empty
   string`; Escape drops both. Mounted in the group editor of `group_1`
   with nothing selected, the field shows `Performance`, and `Duo` with
   Enter renames the group in one entry of the editor's session.
9. **The Locked checkbox** (`inspector-fields.test.ts`). Right of the
   container height, in the row of the container size, a disabled
   checkbox labelled "Locked" shows the stored `locked` of the inspected
   timelines: present only when every inspected thing is a timeline, its
   card or a part of one. `group_2/excerpt/card` (locked) checked,
   `group_1/score/card`
   unchecked, both together indeterminate; `recording`, drawn in no card,
   shows it after the geometry hint; the block, `group_1` and a band show
   none. It never dispatches: a click leaves the journal as it is.

Mounted, the form shows each role's fields with those values and states;
`300` and Enter on a frame's `length` add one entry, exactly the arranger's
command, the block's own length staying 400; Enter on the value just
stored (`300`, then `300.0`) dispatches nothing. A refusal (`0` for the
block's `scale`) keeps the draft, marks the field `aria-invalid` and shows
the store's message beside it; Escape drops both; an emptied `scale` shows
"scale needs a number". A draft shows only for the containers and the
manifest it was typed for. Two frames of different lengths show an empty
field with the placeholder "mixed", and ArrowUp dispatches the arranger's
step. Mixed roles show only "Select a block, a frame or a card to edit its
geometry."; the title shows its manifest's name field, then that hint.

**A selected band** (`inspector-bands.test.ts`). A band alone shows three
read-only rows instead of a form, read from the band's record in the
drawing shown: "Band" its kind's word, "Level" signed (a negative level
with U+2212 MINUS SIGN), "Elements" its count; the store holds `map` and
`map_child_band_order`. No rows for no selection, a block, a map, a card,
a band the drawing does not record, two bands, a band with a card, or a
block the workspace does not hold. A gesture's drawing is read: with three
band records written for the test the rows are Markers 1 3, Regions −2 4,
Flow control −12 1. The form leaves bands out: a band with the card gives
the card's geometry exactly, with the block the block's; the band's block
is the selected block, and a second block makes none. In the component the
band's panel holds one description list and nothing that edits, and the
Manifest tab shows the block's text; with the card the form is exactly
the card's, without the card's name field and Locked checkbox (two things
are inspected, one of them no timeline); two bands show the geometry hint. A band's id is reserved: a
map renamed `conversion_maps_1` in the text is refused, listed as
`schema_violation` `id "conversion_maps_1" is reserved for the bands of a
timeline` at `/timelines/0/conversion_maps/0/id`, the text and the journal
kept.

## The tabs and panels (`Inspector.test.ts`, `inspector-tabs.test.ts`)

**The tab rule** is proven as a table on the rule alone. The four tabs are
always present, in this order: the level tab, Properties, Manifest,
Journal. The level tab is labelled by the level's word: "Arranger" with no
editor open, else "Bundle", "Group" or "Timeline" for the innermost
editor's kind. The tab chosen is recorded with the store's count of editor
openings when it was chosen or when the inspector was last shown or
hidden. While the inspector is shown the tab shown is the tab chosen,
whatever editors open or close. Hiding the inspector records the count;
showing it again shows the level tab when the count differs from the
recorded one (an editor was entered while it was hidden), else the tab
chosen. At mount the
level tab is chosen while an editor is open, else Properties. On a focused
tab the arrows move to the next or previous tab, wrapping, Home and End to
the first and last; a key held with Alt, Ctrl or Meta is the browser's and
is not prevented.

**The component** reads the editing path from the real store (open, Done,
sessions) or from a store whose levels the test sets and announces. The
drawer renders it only while open: closed, no tab list and no panel
exist, and a typed, unapplied text, its tab and an enabled Apply survive
closing and reopening, nothing journalled.

1. **The tab list.** A `tablist` "Inspector sections" of buttons with
   `role="tab"`, each naming by `aria-controls` a `tabpanel` labelled back
   by `aria-labelledby` and without a `tabindex`; every id is unique. The
   selected tab has `aria-selected="true"` and `tabindex` 0, the others
   `false` and −1; only its panel is shown, and a hidden panel renders
   nothing. With nothing selected the tab list stays, Properties shows the
   properties panel without a block (no hint) and Manifest reads only
   "Select a block to inspect its manifest."
2. **The level panel's title line** is one line, the level's word in one
   element and the name in another, read together as "<word> <name>": at
   the top level "Arranger" and the workspace's name ("Arranger untitled"
   for the store of `bundle_mixed`, whose workspace has the default name),
   in an editor the editor's word and the edited element's name as
   "Words" gives it ("Group Performance", "Timeline Score", "Bundle
   Mixed"). The panel holds the title line and nothing else.
3. **Following the editing path while shown.** With Properties shown,
   opening a group editor keeps Properties and relabels the level tab
   "Group"; an inner timeline editor opened with Journal chosen keeps
   Journal, the level tab "Timeline"; closing it gives "Group" again;
   closing the last gives "Arranger", Journal still shown. With the level
   tab shown, the same path keeps the level tab, its title line following
   the innermost editor ("Group Performance", "Timeline Score", "Group
   Performance", "Arranger untitled"). Mounted while a bundle editor is
   open it shows the level tab, "Bundle Mixed". The editing bar precedes
   the tab list while an editor is open. Through the real store, opening
   the group editor, renaming `score` and Done keep Properties and give a
   Journal of "Edited group Performance (1 change)" above the three `add`s.
4. **Following the editing path while hidden** (the drawer): with Journal
   chosen, a group editor opened while the drawer is closed shows the level
   tab "Group" when it opens; closed and opened again with no editor opened
   meanwhile, Journal chosen, it shows Journal; with Journal chosen, a
   group editor opened while the drawer is open, the open drawer opened
   again, then closed and opened, it still shows Journal.
5. **The keys** move over the four tabs, wrapping, at the top level and in
   an editor, the focus with the selection; the block's fields follow the
   editing level as in "The Properties form".
6. **The Manifest panel**, with `bare` and `styled__score`: choosing YAML
   before its codec is loaded shows "Loading YAML…" and no text area, then
   the YAML text; while the text holds an edit the format radios and both
   options are disabled and "Apply or Revert to switch" is shown and named
   by their `aria-describedby`; Ctrl+Enter applies; an external `set` under
   an edit shows "The manifest changed; Revert to see it" and Revert the
   newer text; a refusal lists its code, message and pointer, code and
   pointer each in a `code` element. The panel's controls follow one
   another in reading order: the radios, Include styling, Minimal, the text
   area "Manifest (JSON)", Apply, Revert, the problem list, the warning
   list. The chosen tab is kept while the selection changes, and an
   unapplied text survives a visit to Properties.
7. **Apply and Revert are enabled exactly while the text differs from the
   shown text,** in each of the four modes: disabled when shown, enabled by
   one typed character, disabled when it is deleted again or after Revert;
   a syntax error keeps both enabled; an accepted Apply disables both. The
   text state's rules hold through the component, a problem of writing
   kept even through Ctrl+Enter.
8. **An applied manifest drops the property drafts** of its block (the
   refused `scale` of `0` and its problem) and keeps the Manifest tab.
9. **Warnings.** Each shared warning case of the installed timeskeleton
   (`fixtures/warnings/<SCHEMA_VERSION>/`) loads in core and, selected,
   lists exactly its expected unknown keys, each with its pointer or "at
   the top level", in a list "Warnings"; no problem is listed, and an
   applied edit keeps the warnings. `bare` shows no warning list.
10. **The Properties panel** commits on Enter (the box's `x` to 25 is one
   `set` of `x`), steps from the stored value, never the shown one (10.123
   shown as 10.12 steps to 11.123 and back), steps a draft instead when
   there is one, and shows a gesture's values without replacing a draft.

**The Journal panel** lists the rows of "Words" in an ordered list
"Journal", each item with its time, author and text, newest first; an
undone item carries `data-undone` and a hidden word "undone", the earlier
session's items `data-earlier`; an item stays the same element when rows
are added around it; an empty level reads "No changes yet."; a session row
has a disclosure button labelled by its text that lists its changes,
newest first (one undo greys a session's whole run: "Edited bundle Mixed (3
changes, 2 undone)"), and nothing of the expansion reaches the store.

## Words (`inspector-subject.test.ts`, `journal.test.ts`)

The words are the editor's; what they name is core's resolver's. The
oracles are the committed end-to-end workspaces and a store of
`bundle_mixed` three times (as it is; without its title, with the id
`mixed` and two names dropped; without its title).

1. **The subject beside the heading.** One address gives the words of what
   it names, then its name, or its id without one: `bmixed0000` "Bundle"
   "Mixed"; its title "Title of bundle"; `group_1` "Group" "Performance"
   and its title "Title of group"; `score` "Timeline" "Score", its card
   "Card of timeline", its start, end and name "Start of timeline", "End of
   timeline", "Name of timeline", its end's label "Label of end of
   timeline"; a segment line and a segment "Timeline"; an anonymous bundle
   "Anonymous bundle" with neither; a bundle given the id `takes` "Bundle"
   with that id; maps, regions and flow-control elements by their kind, a
   flow-control element's by its type ("Conversion map", "Region", "Flow
   marker", "Jump origin" with its id, "Jump target") and their parts the
   same way; a measure map added to a block "Measure map" with its id; a band "<Kind> band of timeline" (Markers,
   Conversion maps, Children, Regions, Flow control). Several addresses give
   "N selected". Nothing for no selection or an address naming nothing (no
   such part, entry, band or block; a member's card written without its
   group, `score/card`; `card` after a timeline drawn in no card,
   `styled0000/a/card`). Mounted, the words stand beside the
   drawer's heading and describe the drawer while shown; an id shows in a
   `code` element; the name follows an applied text without a change of
   selection.
2. **Editor names.** A bundle by its `name`, else its `id`, else "Anonymous
   bundle"; a group or timeline by its `name`, else its id; anything the
   view does not hold by its address. The editing bar, the level panel's
   title line and the Journal use them. The level's word is "Arranger" at
   the top level, else the editor's: "Bundle", "Group", "Timeline".
3. **Each journal entry is one sentence**, with the entry's UTC time as
   `HH:MM:SS` and its author: "Added block 0000000003 to workspace", "Added
   region region_1 to 0000000000/score", "Set x, y of 0000000000" (" and 1
   more" for more changes), a block's size by the Properties form's words
   ("Set container width, container height of 0000000000"), "Removed
   0000000000/group_2, 0000000001",
   `Styled {"ids":["score"]}`, and a session "Edited <kind> <name> (n
   changes)", counting changes at every depth ("Edited bundle Mixed (3
   changes)" for a bundle session holding a group session of two), ", k
   undone" while partly undone, and without a kind word once its target is
   gone ("Edited 0000000000/group_1 (1 change)").
4. **Order.** Rows run newest first at every depth, undone ones at the top;
   in an editor its own rows, then the earlier session of the same target
   read only; with two editors open, the inner level only; a session's rows
   hold its changes as rows; nothing gives no row.
