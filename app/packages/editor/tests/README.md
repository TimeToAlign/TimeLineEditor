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
accessibility warnings. Workspaces hold the installed TimeToShare
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
"TimeLineEditor", given to the editor's header as its title, the
level-2 headings of the drawer, the "Your name" dialog and About, no
footer, and the focused canvas (`application`
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
editor's changes), as the hook's `text()` does, and leave it open.
Addresses are objects, compared whole. Opening an editor, a reopening
included, makes the selection its edited element, whatever was selected:
`{block: A}` for the bundle editor of `A`, `{block: A, id: "group_1"}` for
`group_1`'s, `{block: A, id: "score", part: ["card"]}` for `score`'s (the
address of every card of `score`). Closing an editor, and every other
change of the store, prunes the selection by the arranger's one rule:
other timelines' bands go and a part stays, so closing `score`'s editor
over its `conversion_maps` band, `performance`'s `conversion_maps` band and
`score`'s name `{block: A, id: "score", part: ["name"]}` keeps that
name; with `score`'s editor open inside `group_1`'s, a rename keeps
`score`'s name and `score` itself and drops `performance`.

## Files (`shell.test.ts`, `files.test.ts`)

The File menu follows the WAI-ARIA menu button pattern: its items and
shortcut labels (New workspace, Open… Ctrl+O, Save Ctrl+S, Save as…
Ctrl+Shift+S, Import manifest…, Export manifest…, Your name…), the export disabled
without a selected block, and every key
of the pattern, each checked by the focused item and `aria-expanded`. A
refused file leaves the open workspace as it is and shows one dismissible
message, "bad.tle.json is not a workspace file", with each problem's code
and place. The file name and the document title ("untitled.tle.json –
TimeLineEditor") gain "• " after a command, lose it when undo returns to
the opened view and regain it on redo. New workspace, Open… and a
workspace example on unsaved changes ask one question, "untitled.tle.json
has unsaved changes. Save them?", with Save, Discard and Cancel in that
order, the focus on Cancel: Cancel and Escape keep the workspace, Discard
replaces it, Save saves it first (a download, as Save without a file
handle writes in jsdom) and then replaces it; a save that writes nothing
(a picker cancelled) keeps it. Without unsaved changes nothing is asked.
Save writes core's writer's text of the
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
selected (in jsdom's empty, zero-sized view `(0, 0)`; where it goes beside
existing blocks is the arranger's to prove); a refused manifest ("bad.json
is not a manifest") adds nothing. A manifest with a `graphical` object is
added as read (`nested`); one without (`nested` with its `graphical`
removed) is added as core's `importedManifest` gives it, its root `clt_1`
holding `origin` and `length`. No menu item is ever disabled for an open
editor: an editor changes only what it edits, so with the editor of block
A open Import manifest… is enabled. On the session, with the editors of
block A and of its timeline open, a manifest it reads leaves every open
editor first (Done: none open afterwards) and is then added as one more
`add`, selected, placed in the view shown before leaving; a refused one
leaves both editors open, adds nothing and says so once.
**A manifest file is written back as it came.** Import reads a manifest
in any of TimeToShare's serializations by its content, and records in the
workspace's settings how its file wrote it (core's `readManifestFile`, whose
inference core's tests prove): the new block's manifest file is exactly what
core infers from the text, and nothing is journalled for it. Export writes
the selected block's manifest as the block's manifest file says
(`manifestFileOf`), under its manifest file name, and is disabled while the
selection spans two blocks. The oracle is the imported text itself: for
each of the four texts `bare`'s complete fixture (canonical YAML), its
minimal twin, `nested` written in pretty JSON and `nested` without its
`graphical` written in RFC 8785 JSON, imported through the picker and
exported unchanged, the download is exactly the imported text, under
`bundle.yaml`, `bundle.yaml`, `bundle.json` and `bundle.json` (neither
manifest has an id or a name); the settings
hold `{minimal: false, styling: true, serialization: "yaml"}`, `{minimal:
true, styling: true, serialization: "yaml"}`, `{minimal: false, styling:
true, serialization: "json"}` and `{minimal: false, styling: false,
serialization: "jcs"}` for the four blocks, though the last holds its
roots' default timestamps in a `graphical` of its own. A block no file
wrote (added by a command) is exported as a new manifest: minimal, with
its styling, in canonical YAML, under `.yaml`.

The Examples menu, beside File on the standalone page, offers five
examples in this order, each declaring how it is read: four manifest
fixtures of the installed schema version, "Score, performance and
facsimile" (`bundles/bundle_mixed`), "Sonata in two takes"
(`bundles/bundle_shared_parent`), "Styled edition" (`groups/group_styled`)
and "Repeats and jumps" (`flow_control`), each of kind `manifest`; then
"Timestamps", of kind `workspace`, the file `examples/timestamps.tle.json`.
The list is built from the files two globs found; fixtures of another
schema version are ignored, and a missing example is an error naming its
file (`fixtures/0.2.0/flow_control.yaml`, `examples/timestamps.tle.json`).
No item is ever disabled. Choosing a manifest example adds what Import adds
for that fixture's text: one `add` of the fixture's manifest at the view's
centre (`(0, 0)` in jsdom), the new block selected, leaving an open editor
first. Choosing "Timestamps" asks the one question on unsaved changes and,
unless cancelled, opens the file as the workspace: the store's view and
journal are the file's, the file name `untitled.tle.json` without "• ",
the workspace named "Timestamps".

**The example "Timestamps"** is written by the end-to-end fixture
generator (`pnpm e2e:fixtures`) through the store's commands and checked
byte for byte (`pnpm e2e:fixtures:check`); `files.test.ts` holds the
committed file equal to the generator's output (`exampleFiles()`). Read
back, its workspace is named "Timestamps", journalled by "TimeLineEditor",
and its one block `timestamps` holds the roots `performance` (8 seconds,
float, a segment line of `take_1` at 0 and `take_2` at 3.5, the map
`samples` to samples) and `score` (16 quarters, fraction, maps `bars`,
`tempo` and `ticks` to whole notes, seconds and ticks; children `phrase`
with `phrase_ticks` and `coda`); its timestamps, as `[id, timeline, name,
display]`: `timestamp_1` `score` origin, `timestamp_2` `score` length,
`timestamp_3` `performance` origin, `timestamp_4` `performance` length
(each `["wedge", "coordinate"]`), `timestamp_5` `score` Theme (the
default), `timestamp_6` `score` Climax (all five), `timestamp_7` `score`
Silent (`[]`), `timestamp_8` `phrase` Cadence (`["wedge", "id"]`),
`timestamp_9` `performance` Entry (`["wedge", "coordinate",
"cross_section"]`).

A workspace's file name is its name and `.tle.json`, every character a
file name cannot hold on Windows, macOS or Linux (the control characters
and `/ \ : * ? " < > |`) written `_`: `untitled` gives `untitled.tle.json`,
`Eroica sketches` `Eroica sketches.tle.json`, `a/b\c:d*e?f"g<h>i|j` and a
tab `a_b_c_d_e_f_g_h_i_j_.tle.json`.

A manifest's file name is its id, else its name, else `bundle`, characters
outside `[A-Za-z0-9_-]` replaced by `_`, then `.yaml` for canonical YAML
and `.json` for either JSON form (`flow_quarters.yaml`, `Eroica__II.yaml`,
`bundle.yaml`; `bundle.json` for `"json"` and `"jcs"`); the last-change
time is the last entry's local time to the minute (`2026-10-12 09:05` in
UTC). Import offers manifest files by their media types and extensions,
`application/yaml` `.yaml` and `.yml`, `application/json` `.json`, the
fallback input accepting `.yaml,.yml,.json`. The fallback file
input opens the chosen file's exact text and leaves no input behind, a
download writes exactly the given text; with File System Access a file is
saved back into its handle, a save without one picks one, a cancelled
picker gives nothing and any other failure is thrown. About shows
"TimeLineEditor `<version>`" from the app's `package.json`, "tilie-server
0.1.0 (timetoalign 1.2.0)" from the health, the installed TimeToShare's
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
slot. Hiding the page and unmounting write the pending snapshot at once:
with `setTimeout` faked the delay never passes, so only a write made at
once can fill the slot. No case waits a fixed time for the editor: it is
settled once its recovery read and what it does next are done, and gone
once its last write is.
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
and every copyright line of its licence file; the icons and the three fonts
are backed by their licence files, the drawing's two fonts by the schema
package's (DejaVu Sans by `fonts/DejaVuSans-LICENSE`, which holds both of
its copyright lines; Noto Music, OFL-1.1, by `fonts/NotoMusic-LICENSE`,
whose every copyright line, a line starting "Copyright" and a year, the
attribution gives) and the title font (IBM
Plex Mono, vendored in `fonts/`) by its own, whose every copyright line the
attribution gives; the build emits each font once as an asset, the title
font byte-equal to the vendored file (SHA-256 `ba204497…b350`, 49,248
bytes); `THIRD_PARTY_NOTICES.txt` holds every full licence text in order,
the icons and the three fonts last (DejaVu Sans, Noto Music, IBM Plex
Mono). No chunk reaches 500 kB. What a chunk holds is read from its source
map, what the page loads at start from `index.html` (its module script and
its `modulepreload` links): the `yaml` package is bundled once, from one
directory, in the chunk of the schema package, which reads YAML and is
loaded at start; the inspector's YAML codec (`src/inspector/yaml.ts`) is
in a chunk of its own that holds no npm package, and its TOML codec
(`src/inspector/toml.ts`) in a chunk of its own with the TOML library
(`@decimalturn/toml-patch`), which no other chunk holds; neither codec's
chunk is loaded at start. A fixture's generator string occurs in the
shipped files exactly four times, once in each example of the Examples
menu, while no shipped file holds "Fixture Generator", the fixture menu's
`fixture-select` or the test hook's `__tilie`. The development server may read the app
workspace and the resolved schema package.

## The development proxy (`proxy.test.ts`)

`pnpm dev` serves the page from Vite's own origin and proxies `/api` to the
locally running server, which refuses every origin but its own. The test
builds the configuration for `development` with `TILIE_PORT` set to `8123`:
the one proxied path is `/api` and its target is `http://127.0.0.1:8123`.
It then drives the real wiring: the `configure` hook is called with a Node
event emitter standing in for the proxy, and a `proxyReq` event is emitted
with a real Node outgoing message carrying `Authorization: Bearer abc` and
an incoming request whose `Host` is `localhost:5173`, the development page
as the browser addressed it. The development page's own origin, `Origin:
http://localhost:5173`, leaves as `Origin: http://127.0.0.1:8123`, the proxy
target; a foreign one, `Origin: https://example.org`, leaves unchanged, so
that the server still refuses it; a request without an `Origin` leaves
without one. In every case `Authorization` leaves as `Bearer abc`.

## The test hook and the fixture menu (`hook.test.ts`, `fixtures.test.ts`)

`window.__tilie` exists in a test build and goes with the editor. At start
it reports the empty workspace, no selection, `locked()` false and `mode()`
`"scale"`. Its `load` replaces the store with exactly the file's workspace
(`text()` equal byte for byte) and clears the selection; `select` and
`selection` take and give address objects; a refused file throws with the
reader's problem codes and keeps the store. Its `open`,
`done` and `cancel` drive the editing path as the store does, without the
bar's question (`unknown_target` for an unknown target). The fixture menu
offers every fixture there is, and the test proves it against the files on
disk rather than against a list kept beside the code: its options are
exactly, each once, every `*.yaml` below the installed schema package's
`fixtures/<SCHEMA_VERSION>/` outside `drawings/` (the top level, `groups/`
and `bundles/`, `corpus_*` and the minimal twins included) labelled by its
path below that directory without `.yaml` (`bare`, `bare.minimal`,
`groups/corpus_tilia`, `bundles/corpus_tilia`), every warning case of
`fixtures/warnings/<SCHEMA_VERSION>/` as `warnings/<name>`, and every
end-to-end workspace as `e2e/<name>`; no label repeats and the list is in
code-unit order. For the installed package that is 146 manifest fixtures,
17 warning cases and 5 workspaces, 168 options, from `bare` to
`with_region.minimal`; no option starts with `drawings/` or `rejections/`,
which hold drawing inputs and outputs and refused manifests. Each option
is an entry of the Examples menu's shape, and Open opens it as the
Examples menu opens an example, through the same routine: every manifest
fixture and every warning case is of kind `manifest`, its text the
fixture's or the warning case's `manifest`, which core's `loadManifest`
accepts, so each option imports (`fixtures.test.ts`, one case per fixture
named by its label, so that a failure names the fixture); every end-to-end
workspace is of kind `workspace`, its text the file's, which the reader
accepts; 163 entries of kind `manifest` and 5 of kind `workspace`. A
manifest fixture is imported, never replacing the workspace and asking
nothing, even with unsaved changes: chosen on a workspace holding one
block (`bare` as `0000000000`), it adds one `add` of core's
`importedManifest` of the fixture's manifest (`groups/group_number_types`,
`bundles/bundle_mixed`), placed as Import manifest… places a file, the new
block selected; the
workspace then holds exactly two blocks, the first one equal to itself
before (its manifest and place), no question was asked and the journal
grew by exactly that one `add`. A warning case is imported the same way,
and its warnings surface as for Import manifest…: the block's manifest
keeps the unknown key, so core's `unknownKeys` of it, what the Manifest
tab lists, is the case's `unknown_keys` (`warnings/timeline_class`:
`[{key: "class", path: ["timelines", 0]}]`). Delete on the canvas removes
a selected timeline of an imported block as one `remove`. An end-to-end
workspace replaces the open one only after the one question on unsaved
changes: with unsaved changes, Cancel keeps the store, Discard opens the
file as the workspace, its view and journal the file's, under
`untitled.tle.json` without "• "; without unsaved changes it opens at once
(`e2e/small`) and clears the selection.

Its `bands` maps each band record of a block's drawing into client pixels
through the drawing's `<svg>` rectangle: the rectangle's offset plus the
drawing's value times the rectangle's size over the drawing's. Each band
is reported with its address `{id: T, facet}`, its timeline and facet. A
hand-made drawing of 400 × 200 (the block, a card and three bands, the line
at 30.5) in a
rectangle at (100, 50) of 800 × 400 puts the line at 111, and partly off
screen is computed alike; on two real blocks the values are the arranger's
drawing mapped the same way. A block whose drawing is not on the page
cannot be placed, and an unknown block throws a `RangeError`. Its `boxes`
lists a block's container records as the drawing has them (kind, address,
place key, holder, displayed), in box order: for `map` the block `{}`, the
card `{id: "melody", part: ["card"]}`, the bands `children`,
`conversion_maps`, `markers` of `melody` and `conversion_maps` of `phrase`;
an unknown block throws the same `RangeError`.

## Embedding (`embed.test.ts`)

`mount` is proven against a host page. The host stays untouched: its body
margin, title, address and history length are unchanged, no request is
made and no IndexedDB opened (no `server` and no `storage` given),
`localStorage` stays empty, there is no test hook, no fixture menu, no Examples menu and no
level-1 heading, and About says "no server". `text()` gives back the given `workspace` byte for
byte. `onchange` reports `{fileName: "untitled.tle.json", dirty: false}`
for it and exactly one `{…, dirty: true}` after a Delete on the canvas.
Ctrl+S on a host input or the body is not prevented; on the canvas it is.
Two editors on one page share no id, and a `select` of `[{block: A}]` in
one leaves the other's `selection` empty and reaches only the first's
`onselect`, with `[{block: A}]`. `select` reads each address at the
boundary (core's `readAddress`): of `[{block: A}, {block: A, facet:
"markers"}, {block: "B"}]` it selects `[{block: A}]` alone, and one message
says "Some addresses could not be selected." with the two `invalid_address`
problems at `/addresses/1` and `/addresses/2`, in that order. `load`
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
`manifest`. A text written fresh is the manifest file's text: JSON is
TimeToShare's pretty JSON and YAML its canonical YAML (`dumps` with
`"json"` and `"yaml"`), so with a block's manifest file in that
serialization the shown text equals what Export writes. The oracles are the
fixtures (their bytes), TimeToShare's `dumps` (a canonical text that sorts
keys, so only a changed value fails a comparison) and the store (what it
accepts and refuses).

1. **Every manifest round-trips through every format, byte for byte.**
   Each manifest fixture of the installed schema version (top level,
   `groups/`, `bundles/`; a minimal twin reads back as its complete fixture,
   a case already) is written in each format and read back, and `dumps` of
   the value read equals the fixture's bytes; the YAML text written is the
   fixture's bytes themselves.
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
   flow-control element's `label`, `name`; `name`, `source_unit`,
   `target_unit` of `MapBase`, the base every conversion map type takes
   through its `allOf`, which the walk along a value follows; statements
   and provenance have no nullable member. A manifest of
   two roots (one of unknown length, one holding a `LinearMap` whose
   `target_unit` is null), a group and a measure map has its TOML text
   pinned whole, the format's `@context` that core gives every manifest
   it holds written as the table `["@context"]` after the timelines, its
   nine object terms as subtables, and reads back with all seven nulls. A measure-map row with
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
   changes nothing (`invalid_value`, "the command changes nothing", at
   `['{"block":"0000000000"}', "manifest"]`, the target's `addressKey`
   first), so the comparison is the inspector's.
5. **A refusal points into the text.** The store's path loses its
   `[<block>, "manifest"]` prefix and is shown as a JSON pointer:
   `"locked": "yes"` is `schema_violation` "must be boolean" at
   `/timelines/0/locked`, `"unit": "parsecs"` "must be equal to constant"
   (the first `const` of the units' `oneOf`) at `/timelines/0/unit`. A syntax error carries the
   reader's 1-based line and column: JSON `"locked": ,` at 98:17 (after
   the format's `@context` and the default timestamps' `graphical`, which
   sort first), YAML `locked: [false` at 83:5, TOML `locked = ` at 77:1
   (the `@context` table and its subtables before the timelines' array of
   tables). YAML is read by TimeToShare's `parseYaml`, the
   reader Import uses, so the panel refuses what Import refuses:
   `a: &x 1\nb: *x\n` is refused by Import (`invalid_yaml`) and by Apply
   (`syntax_error` at 1:4, the anchor's `&`) with one message, "an anchor
   at line 1, column 4 of the YAML text". No refusal adds a journal entry.
6. **Comments survive.** In each of the four modes, a YAML or TOML text
   with a comment line and an inline comment that renames the timeline,
   applied, adds one journal entry and is exactly the typed text: the store
   holds the value the text states (the same `dumps`), so nothing in the
   text changes. After the store renames the timeline again, the text
   followed in the same mode is the TOML text with the new name, and the
   YAML text with the new name in the `yaml` library's layout, both
   comments in place. A YAML text whose value changes is written from its
   patched document: with a comment, in the library's layout, which
   differs from canonical YAML in one way, a mapping in a sequence begins
   on its dash's line (`  - children: []` where canonical YAML writes `  -`
   and the key on the next line); without one, as canonical YAML. So with
   `regions: []` deleted from the timeline of a commented text, Apply
   stores the completed manifest and shows the typed text in the library's
   layout with `regions: []` appended after the timeline's last key,
   `unit`; without the comment it shows the canonical YAML of the stored
   manifest.
7. **The four modes.** A text is complete or minimal, with or without the
   styling (`graphical`). With `bare` styled by one `style` command, each
   mode's JSON text is pinned whole: the fixture `bare.yaml` or
   `bare.minimal.yaml`, whose `graphical` holds its root's default
   timestamps, without that `graphical`, or with the rule added to
   its `rules`. In every mode
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
9. **The text writes IDs `#id`; the store holds them bare.** The text is
   a manifest file's, so every ID and reference in it is written `#id`
   (item 1 shows the fixtures' bytes, written so); the store holds them
   bare. With `bare` in block A: its JSON text with the root renamed
   `Renamed` applies, and the store's root is `{id: "bare", name:
   "Renamed", …}`; the text with the root's `id` written `bare` (no `#`) is
   refused `schema_violation` at `/timelines/0/id` and adds no journal
   entry; a text whose `graphical.order` gives `#bare` a band order whose
   first word is `x` is refused by the store at its bare key and shown at
   the text's, `/graphical/order/#bare/0`.

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

**The options are the block's.** Include styling and Minimal show how the
selected block's manifest is written to a file, the workspace's setting
(`manifestFileOf`), and a change of either is `configure` of that block's
entry, journalling nothing. With `bare` in block A and `styled__score` in
block B, no entry stated: both boxes are checked (a new manifest is minimal
and styled) and the text is the minimal, styled one. Unchecking Minimal on
A gives A's entry exactly `{minimal: false, styling: true, serialization:
"yaml"}`, leaves the journal as it was, shows the complete text and makes
the workspace unsaved; selecting B shows both boxes checked again, and A
again Minimal unchecked. The entry survives a save and an open of the
workspace file.

## The Properties form (`inspector-properties.test.ts`, `inspector-bands.test.ts`, `inspector-fields.test.ts`)

The form edits the geometry of what is selected, never the block's when
something inside it is. A selected container has a role: the **block**
(its placement), an **item** (a frame, or a card the block holds: its
place in the block) or a **held** card (a card a frame holds: its frame's
shared scale and length, its own spacing, margin and size). Each edited container
carries its selected address and its place key (`null` for the block,
`{item: G}` for a frame, `{item: T}` for a card the block holds, `{item:
G, member: T}` for a card a frame holds). The form is right when
for each role it names exactly the selected containers, shows their values
as the drawing records them (stated, else drawn), offers what the level
edits, and dispatches exactly the arranger's command.

The workspace is the end-to-end `bundles` workspace, block `bmixed0000`
("Mixed", length 400, scale 1, nothing in `places`; `group_1` holding
`performance` and `score`, `group_2` holding `excerpt` and `page`; the
ungrouped root `annotations`; `recording`, drawn only as `excerpt`'s
ancestor, has no card).

1. **Roles.** The block `{block}` names itself, "Block properties", `{x:
   0, y: 0, scale: 1, length: 400, spacing: 8, margin: 0, width: null,
   height: null}`.
   `group_1` and its title `{id: "group_1", part: ["name"]}` name the
   frame, "Frame properties", with its record's values (its spacing the
   frame's default 8). `annotations` and its card `{id: "annotations",
   part: ["card"]}` name the card the block holds, "Card properties". The
   cards of `score` and `excerpt` (`{id: T, part: ["card"]}`, each drawn
   once) name cards their frames hold, "Card properties", with their
   frame's scale and length and their own spacing and size. Two frames are
   edited together in selection order; a frame with a card the block holds
   is "Frame and card properties"; two addresses of one card are one card.
   None for no selection, mixed roles, the block with a frame, the title,
   `recording`, a map (`cmap_1`), or two blocks.
2. **Stated values win**, and a held card's spacing is its own: after
   stating `group_1` `{length: 300, scale: 1.5, spacing: 2}` and `score`
   `{width: 650, spacing: 1.25}`, the frame shows 300, 1.5, 2 and the card
   1.5, 300, 650, 1.25.
3. **During a gesture the values are the gesture's drawing's**: with a
   placement whose drawing states `group_1` `{length: 460}`, the frame and
   its held card show that record (length 460, its width); a placement's
   `x` is the block's. A gesture on another block, or none, leaves the stored
   values.
4. **Fields per role and level** are the arranger's field table, in
   core's place order: the block and an item offer `x`, `y`, `length`,
   `scale`, `spacing`, `margin`, `width`, `height`; a held card `length`,
   `scale` (labelled "group length", "group scale"), `spacing`, `margin`,
   `width`, `height`.
   The size is the container's: `width` and `height` are labelled
   "container width" and "container height" in every role.
   Withheld, and disabled in the form: the block's `length`, `scale`,
   `spacing`, `margin` in a group or timeline editor (the store refuses them there,
   `side_effect`); an item's `x`, `y` everywhere but the bundle editor;
   nothing of a held card.
5. **One edit, the arranger's command.** For the block's `x`, a frame's
   `length`, a held card's `scale`, and its `spacing` and `length` in the
   group editor, two frames, two held cards' `width` in the timeline editor
   and a frame's `scale` in the bundle editor, the command built from the
   typed text equals the arranger's edit of the same addresses, property,
   value and level; so does a frame's `margin` 12 in the bundle editor,
   which states `{group_1: {margin: 12}}` and the drawn position of every
   other item. An emptied `width` sends `null`; a value every selected
   container stores already (`650.0` for a stated 650, the block's `400`)
   gives no command. Text that is no decimal number is refused before
   dispatch, `invalid_value` at `[<first address's key>, property]`
   (`'{"block":"bmixed0000","id":"group_1"}'` for `group_1`): an empty
   `length` or `spacing` ("… needs a number"), `abc`, `0x10` ("… is not a
   number"). A step is the arranger's edit with the step applied to each
   container's own value. A size below its minimum is item 7's.
6. **Numbers a field shows and steps.** A step adds or subtracts 1 for `x`,
   `y`, `length`, `spacing` (a gap in canvas units), `margin`, `width`, `height` and
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
   the drawn sizes are the minimums: the block's height is the drawing's
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
   posts to the message bar, as information, exactly `To decrease the
   height below <m> px, decrease the size of the contained elements
   first.` (`width` for the
   width), `<m>` the largest minimum a typed value fell below, as a field
   shows it (at most two decimals). With `group_1` and `group_2` selected,
   their minimum heights `a < b`, the height `a + 1` (one more than the
   smaller minimum, below the larger) is one command: the arranger's edit
   of both frames to `a + 1`, less the change of the frame whose minimum is
   `b` (it states no height already); the notice names `b`. Each commit
   below a minimum posts it once (a second `1` on the frame, which
   dispatches nothing, posts it again); a size above every minimum, a size
   equal to a frame's minimum, an empty one, or typing posts nothing.
8. **The name field** (`inspector-fields.test.ts`). The tab's first field
   is a text field "Name". With nothing selected it is the workspace's name
   at the top level (`untitled` for this workspace, its target the
   workspace `{}`, never empty) and, in an editor, the edited element's:
   the name of what the editor's opening selects, read through core's
   resolver (the group editor of `group_1` gives `Performance`, target
   `{block, id: "group_1"}`; the bundle editor the manifest's `Mixed`; every
   edited element has the schema's nullable `name`, so a null one shows an
   empty field). For one inspected thing its name
   where the schema gives it one, read through core's resolver, a part
   standing for its element: the block and its title the manifest's
   (`Mixed`, target the block `{block}`), `group_1` (`Performance`),
   `score`, its card and its start the timeline's (`Score`, target `{block,
   id: "score"}`), the conversion map `cmap_4` of `page` (empty, its name
   null; target `{block, id: "cmap_4"}`), the jump origin `jump_from_1`
   likewise (every flow-control element has the schema's nullable `name`),
   and a measure map `bars` added to the block (empty; target `{block, id:
   "bars"}`). No field for a band or two things, in one
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
   card or a part of one. The card of `excerpt` (locked) checked, the card
   of `score` unchecked, both together indeterminate; `recording`, drawn in no card,
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
drawing shown: "Band" its facet's word, "Level" signed (a negative level
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
are inspected, one of them no timeline); two bands show the geometry
hint. A band is addressed `{block, id: T, facet}`, so a facet word is no
reserved ID; an ID is unique across the manifest: the map `tempo` renamed
`phrase` in the text is refused, listed as `schema_violation` `'phrase' is
not unique in the manifest, first at #/timelines/0/conversion_maps/0/id`
at `/timelines/0/children/0/id`, the text and the journal kept.

## Group memberships (`inspector-groups.test.ts`)

Below the geometry, the Properties tab offers the group memberships of
what is selected and a New group button; each click is one command, the
very command core takes, and a checkbox or button core refuses is disabled
with core's message as its tooltip. The workspace is the `bundles`
workspace of "The Properties form": in `bmixed0000`, `group_1`
"Performance" holds `performance` and `score`, `group_2` "Facsimile"
holds `excerpt` and `page`; the timelines in the manifest's order are
`annotations`, `page`, `performance`, `recording` with its child
`excerpt`, and `score`. Commands are compared whole; a refusal's text is
core's message, so the oracle is core's own nesting rule written out:
`recording` holds `excerpt`, so neither can join a group that has the other.

1. **The Groups of selected timelines** (`groupsOf`). For `score`'s card:
   legend "Groups", the rows `group_1` "Performance" checked and `group_2`
   "Facsimile" unchecked, neither mixed, depth 0; `group_1`'s command is
   `set {block: M, id: "score"} groups []`, `group_2`'s `set … groups
   ["group_1", "group_2"]`, neither refused. For `score` and `annotations`
   (timeline addresses): `group_1` unchecked and mixed, its command putting
   in only `annotations` (`groups ["group_1"]`); `group_2` unchecked and not
   mixed, its command `score` `["group_1", "group_2"]` then `annotations`
   `["group_2"]`, in selection order. For `recording`, `group_2` is refused
   with exactly `'recording' and 'excerpt', a member of group 'group_2',
   would hold one another`, `group_1` not. The same rows in the bundle
   editor; none (`null`) for the block, `group_1`, a band of `performance`,
   the map `cmap_1`, for `score`'s card in the group editor of `group_1` or
   the timeline editor of `score`, and for `score` once `group_1` and
   `group_2` are removed (a manifest without groups).
2. **The Members of a selected group** (`membersOf`). For `group_1`, and
   alike for its title: legend "Members", the rows `annotations`,
   `page`, `performance`, `recording`, `excerpt`, `score`, labelled by name
   ("Annotations", …), at depths 0, 0, 0, 0, 1, 0, checked exactly for
   `performance` and `score`; `annotations`' command is `set … groups
   ["group_1"]`, `performance`'s `groups []`. For `group_2`, `recording` is
   refused with the message of item 1 and `score`'s command is `groups
   ["group_1", "group_2"]`. None for two groups, a timeline or the block,
   nor in the group editor of `group_1`.
3. **New group** (`newGroupOf`). For the block: `add {into: {block: M},
   group: {id: "group_3", members: []}}`, not refused (`group_1` and
   `group_2` taken, `group_3` the smallest free `group_N`). For `score`'s
   card and `annotations`: members `["score", "annotations"]`. For
   `recording` and `excerpt`: refused with exactly `'excerpt' and
   'recording', a member of group 'group_3', would hold one another`. None
   for `group_1`, the block with a timeline, nothing selected, and in the
   group editor of `group_1`.
4. **Mounted.** For `score`'s card a fieldset "Groups" holds the checkboxes
   "Performance" (checked) and "Facsimile"; a click on "Facsimile" adds one
   journal entry whose command is item 1's, and the box is then checked; a
   click on "Performance" then takes `score` out of `group_1` in one more
   entry. For `recording`, "Facsimile" is disabled, its label's title item
   1's message. For `group_1` the fieldset "Members" lists the six labels of
   item 2, "Excerpt" indented by 1.25rem. For the block the button "New
   group" adds `group_3` in one entry, and the manifest then holds three
   groups. A command the store refuses although core takes it (the store
   has the group editor of `group_1` open while the panel shows the
   arranger, so `score` joining `group_2` is a side effect) leaves the
   journal as it was, the box unchecked, and the status line holds exactly
   the message of the store's refusal of that command; another selection
   clears it.

## The tabs and panels (`Inspector.test.ts`, `inspector-tabs.test.ts`)

**The tab rule** is proven as a table on the rule alone. The six tabs are
always present, in this order: the level tab, Properties, Metadata,
Manifest, Journal, Timestamp. The level tab is labelled by the level's word: "Arranger" with no
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
5. **The keys** move over the six tabs, wrapping, at the top level and in
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
9. **Warnings.** Each shared warning case of the installed TimeToShare
   (`fixtures/warnings/<SCHEMA_VERSION>/`) loads in core and, selected,
   lists exactly its expected unknown keys, each with its pointer or "at
   the top level", then its expected warnings (core's `manifestWarnings`),
   each message capitalised with its pointer or "at the top level", in a
   list "Warnings"; `context_absent` is never listed, since core gives every
   manifest it holds its `@context`, and a case left with nothing shows no
   list. No problem is listed, and an applied edit keeps the warnings.
   `bare` shows no warning list.
10. **The Properties panel** commits on Enter (the block's `x` to 25 is one
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

## The Timestamp tab (`timestamp.test.ts`)

The Timestamp tab is always present and holds three areas, one below the
other, each a `section` named by its heading: **Coordinates** (a bordered
panel), **Properties** (a key/value grid, present only while a timestamp is
shown) and **Coordinate granularity** (the workspace's two settings on one
line at the pane's bottom). A timestamp's rows, values, copy texts, the
missing-value texts, whether a row can be edited, the position an edited
value gives (`parseAxisValue`, `positionFor`, `pinAt`) and its JSON
(`timestampJson`) are core's; a named timestamp's pin is the arranger's
(`namedPin`), read from the block's drawing. A test reads those from their
owner and proves only what the editor adds: which tab and which pane state
are shown, how the rows are grouped and labelled, that every number shows
its exact text, which are editable, what each Copy carries and posts,
which command each control sends, exactly, and which pin is shown after it.

Specimens. **`bundle_mixed`** (block `0000000000`): `score` (12 quarters,
fraction) with the LinearMaps `cmap_1` (×480 to ticks) and `cmap_2` (×1/2
to seconds), crossing nothing, its named `origin` (`timestamp_9`) and
`length` (`timestamp_10`); bundle_mixed holds ten timestamps. An unnamed
pin is the arranger's pin of `timestamp_9`, moved with `pinAt` and without
its named timestamp: unnamed at 16/5 its rows are Score `16/5` ♩, `cmap_1`
`1536` ticks, `cmap_2` `1.6` s. **The example workspace "Timestamps"**
(the file the Examples menu opens, block `timestamps`): `score` (16
quarters, fraction) with `bars` (×1/4 to whole notes, fraction), `tempo`
(×1/2 to seconds, float), `ticks` (×480, int), in this canonical order,
the children `phrase` (offset
4, length 6, its map `phrase_ticks`) and `coda` (offset 12, length 4); the
named `Theme` (`timestamp_5`, at 4, the default display), `Climax`
(`timestamp_6`, at 21/2, all five words), `Silent` (`timestamp_7`, at 14,
none). Theme crosses `score` and `phrase` at its start: Score `4` ♩, Bars
`1`, Tempo `2.0` s, Ticks `1920`; Phrase `0` ♩, Phrase ticks `0`. **A
hand-built cross-section** of a line `score` (16 quarters) at 16 whose maps
give no value (a PiecewiseMap at its last break), need a MeasureMap's rows
(a MeasureNumberMap without them) or name their outputs (a CombinationMap,
which no position solves).

1. **Pinning, as a rule** (pure, a table). A pin selects Timestamp and
   remembers the tab shown before it; a second pin moves the pin and keeps
   that tab; clearing the pin shows that tab again and forgets it; clearing
   without a pin changes nothing. Choosing a tab other than Timestamp
   clears the pin and shows the chosen tab; choosing Timestamp keeps it. A
   pin is held with its block's manifest, the object the view held when it
   was pinned (a pin of a block the view does not hold is held nothing).
   An unnamed pin is outlived exactly when the view's block is gone, its
   manifest is another object or the view's granularity is another object
   than its spec's; an unrelated change (another block's move) leaves it. A
   named timestamp's pin is outlived exactly when its address names no
   timestamp (after `remove` of `timestamp_9`), not by a change of its
   manifest (a `set` of its name).
2. **Pinning, in the drawer.** With Journal chosen in an open drawer,
   `pinTimestamp(pin)` selects Timestamp and shows the pinned rows; a
   second pin keeps them pinned; a click inside the tab's panel keeps the
   pin; a click anywhere else (`clickedAt` with an element outside the
   inspector) clears it and shows Journal, and choosing Timestamp then
   shows the hint "Turn on Show coordinates (C) and click a timeline to pin
   a timestamp. With Show coordinates off, click a timestamp to edit it."
   in the Coordinates area, no Properties area and no table. With
   Properties chosen and the drawer closed, a pin opens it on Timestamp;
   choosing Manifest clears the pin. An unnamed pin is dropped, Timestamp
   staying selected with the hint, when its block's manifest changes, when
   the granularity changes and when its block is deleted; a move of another
   block keeps it. `shownPin()` is the pin the canvas marks: the unnamed
   pin itself, `null` without one. Selecting exactly one named timestamp
   (the drawer's `selected`, as the session reports a selection) opens a
   closed drawer on Timestamp showing it, `shownPin()` the arranger's
   `namedPin` of it; selecting anything else (the block) clears it and
   shows the tab chosen before; two addresses at once show nothing.
3. **Coordinates, Editor** (the default). One `tbody` per timeline crossed,
   in core's order, headed by its name; its first row "coordinate", then one
   row per map labelled by its name, else its ID. A number is a text field
   holding its **exact** text (core's copy text, never rounded by
   `decimals`: `cmap_2` `1.6`, `tempo` `2.0`), its pretty unit beside it
   (core's `prettyUnit`: `♩`, `ticks`, `s` for seconds, `𝅝` for whole
   notes); a label, a measure or
   a missing value is text (`no value here`, `needs a server to expand its
   measure map`). A map with named outputs gives one row per output,
   "<label> · <output>", without a unit. Every coordinate and every invertible map's value
   is editable; a number no position solves (the CombinationMap's outputs)
   is a read-only field, greyed, with the title "This value cannot be
   solved for a position, so it cannot be edited." on the field and its
   cell, the same text, held once in the panel, among the field's
   descriptions. The rows of `bundle_mixed` at 16/5 and of Theme are those
   of the specimens.
4. **Editing values.** Enter or leaving a field commits. On the unnamed
   pin at 16/5, `7/2` in "coordinate of Score" shows the pin at 7/2: the
   drawer's `shownPin()` equals `pinAt(pin, 7/2)`, the field shows `7/2`,
   nothing journalled; `1920` in "cmap_1 of Score" gives the pin at 4 and
   `2.5` in "cmap_2 of Score" the pin at 5 (the maps' inverses). On Theme,
   `9/2` in "coordinate of Score" journals exactly `{type: "set", changes:
   [{target: {block: "timestamps", id: "timestamp_5"}, values: {coordinate:
   [9, 2]}}]}`, and `shownPin()` is the named pin read at 9/2; `4`, its
   own coordinate, journals nothing. Text core refuses (`abc`, refused by
   `parseAxisValue`) or a position outside the timeline (`13` on `score`
   of `bundle_mixed`, refused by `positionFor`) keeps the draft, marks the
   field invalid and shows core's message beside it; Escape shows the
   stored value again, valid.
5. **Copy.** Three columns of icon buttons under the headings `value`,
   `value + unit` and `pretty`, titled "Copy the value", "Copy the value
   with its unit written out" and "Copy the value with symbols"; each
   button's label is its title followed by the row's field label ("Copy
   the value of tempo of Theme"), so no two rows' buttons share a label.
   They write core's three texts of the value, its copy text, its raw text
   and its exact pretty text (Theme's `tempo`, 2.0 seconds: `2.0`, `2.0
   seconds`, `2″`), each button its own, and post "Copied 2.0.", "Copied
   2.0 seconds." and "Copied 2″." to the message bar as information. A
   button is shown only where it writes a text of its own: a number
   without a unit (the CombinationMap's outputs `Both · seconds`, 8.0, and
   `Both · ticks`, 7680) has neither a `value + unit` button nor a `pretty`
   one, whose text would be the value's again, only the value's button,
   writing `8.0` and `7680`; their cells stay, empty. A missing value has
   none.
6. **The format switch** is one component in both tabs: a radio group of
   segments, "Manifest format" with JSON, YAML, TOML and "Timestamp
   format" with Editor, JSON, YAML, TOML, Editor chosen first. JSON, YAML and TOML show core's
   `timestampJson` of the pin through the Manifest tab's codecs: the JSON
   text is TimeToShare's pretty JSON (`dumps`) of that value (for Theme its
   manifest entry and `mapping`), the YAML text its canonical YAML, keys
   sorted as in JSON; YAML and TOML read "Loading …" until their
   codec is loaded, then the codec's text of the same value. One Copy
   writes the text shown and posts "Copied the JSON." (the format's word).
   **A timestamp's text is a readout, not a manifest**, so the Manifest
   tab's null rule does not apply to it: in TOML, which has no null, every
   object member whose value is null (a map without a value at the
   position; a measure's missing number or length) is left out, at any
   depth; JSON and YAML keep the null. The editor's own rule is proven on
   two specimens and one regression, each text written out in full in the
   test, never derived from the code under test:
   - *A map without a value.* `conversion_maps__maps_whole_notes` (block
     `0000000000`) pinned at its named `origin` (`timestamp_1`, at 0 on
     `maps:whole_notes`) without a server: its ChainMap `cmap_1` reaches a
     MeasureRecordMap whose MeasureMap has no rows, so `cmap_1` has no
     value. The JSON text carries `"mapping": {"cmap_1": null}`; the TOML
     text shown in the pane is exactly the named timestamp's members and
     an empty `[mapping]` table, no line for `cmap_1`, and no refusal
     shows.
   - *Every map with a value* (regression). Theme (`timestamp_5` of the
     example "Timestamps", at 4 on `score`, its rows all valued) gives the
     same TOML text as before the rule: the codec's text of
     `timestampJson` unchanged, written out in the test.
   - *A null inside a value.* "Bar two" of `group_measure_map` (item 10)
     read with the four measures, measure "2" given with `number` and
     `nominal_length` null: `cmap_1`'s value is that measure's record, and
     its TOML text has a `[mapping.cmap_1]` table without `number` and
     `nominal_length`, while its JSON and its YAML keep both as null
     (`"number": null`, `number: null`).
   The Manifest tab's TOML (`nulls.ts`, `toml.ts`) is untouched: its tests
   in `inspector-text.test.ts` and `inspector-codecs.test.ts` stay as they
   are.
7. **Properties.** A two-column grid of keys and controls: "Name" (a text
   field labelled by it), "Display" (a group of five toggle buttons Wedge,
   Name, ID, Coordinate, Cross-section, in that order, each `aria-pressed`
   by whether its word is in the timestamp's `display`), and Delete.
   - *Unnamed.* The name field is empty and enabled, with the placeholder
     "Type a name to keep it" (hidden by the panel's style while the field
     has focus) and still described by the hint below; the toggles show the
     default (Wedge, Name, Cross-section pressed) and, with Delete, are
     disabled and greyed, each described by the hint "Naming the timestamp
     stores it; then its display can be set and it can be deleted."; a
     click on them journals nothing. Typing "Upbeat" and Enter on the
     unnamed pin at 16/5 journals exactly `{type: "add", into: {block:
     "0000000000", id: "score"}, timestamp: {name: "Upbeat", coordinate:
     [16, 5]}}`; the pane then shows the named `timestamp_11` (the
     smallest free ID): Name "Upbeat", the toggles and Delete enabled,
     `shownPin().named.id` `timestamp_11`. An emptied name journals
     nothing.
   - *Named.* Theme shows Name "Theme" and no placeholder; "Subject" and Enter journals
     `{type: "set", changes: [{target: {block: "timestamps", id:
     "timestamp_5"}, values: {name: "Subject"}}]}`; an emptied name and
     Enter journals nothing, shows "Theme" again and, at the field, "A
     named timestamp keeps a name; Delete removes it."; leaving the field
     unchanged journals nothing.
   - *Display.* Pressed: Theme Wedge, Name, Cross-section; Climax all five;
     Silent none. A toggle sends one `set` of `display` on the timestamp,
     the words in canonical order: ID on Theme `["wedge", "name", "id",
     "cross_section"]`, Wedge on Theme `["name", "cross_section"]`,
     Coordinate on Silent `["coordinate"]`, Cross-section on Climax
     `["wedge", "name", "id", "coordinate"]`; each shows pressed as stored
     afterwards. The toggles are buttons, reached with Tab and pressed with
     Enter or Space.
   - *Delete* journals `{type: "remove", targets: [{block: "timestamps",
     id: "timestamp_5"}]}`; the pane then shows the hint and no Properties.
8. **Coordinate granularity** shows the workspace's two settings, fields
   "Denominator" and "Decimals" (the defaults 2520 and 3), each with its
   hover hint as `title`, with or without a timestamp, in one line below
   the heading. Typing 5 as the denominator and 6 as the decimals sets
   `settings.granularity` to `{denominator: 5, decimals: 6}`, with no
   journal entry and no undo step. Typing 0 as the denominator or 16 as the
   decimals marks the field invalid with core's problem message beside it
   and changes no setting; leaving the field shows the stored value again,
   valid.
9. **The server's MeasureMaps** reach the canvas through one adapter of
   the client: the rows a server answers pass as they are (the same
   array); a `ServerError` with status 501 (the server cannot expand
   MeasureMaps) becomes `unsupported`; any other failure (a 500, an
   unreachable server) stays a rejection with the same error.
10. **A named timestamp's MeasureMaps** are the canvas's: the drawer reads
    a named timestamp with the rows the canvas's `knotsOf` gives for its
    block's manifest, asked anew whenever its pin is read, so a pin is
    read again when they arrive; without `knotsOf` it reads them as
    `no_server`. Specimen: `group_measure_map` (block `0000000000`), its
    `score` (16 quarters) with the `MeasureRecordMap` `cmap_1`, and the
    timestamp "Bar two" added at 6 on `score`; the rows of `measuremap_1`
    are four 4/4 measures named "1" to "4" at qstamps 0, 4, 8 and 12, so 6
    lies in measure "2". Selected while `knotsOf` answers `pending`, the row
    `cmap_1` reads "waiting for the server"; once it answers the rows (a
    reactive source changing, no new selection) the row reads "2", and the
    shown pin equals, part for part, that pin moved to 6 without its named
    timestamp and pinned as an unnamed pin: the same rows in the pane. Without
    `knotsOf` the row reads "needs a server to expand its measure map".

## The Metadata tab (`metadata-frame.test.ts`, `metadata-edits.test.ts`, `metadata-panel.test.ts`)

The tab shows and edits the statements of TimeToShare's description
layer: property–value pairs about the thing a bundle, a timeline or a
region stands for, each pair optionally annotated in `provenance`. What a
pair means is the schema package's: its statement functions (`rectangles`,
`entries`, `verbOf`, `withPair`, `withoutPair`, `withConfirmation`,
`withRejection`, `instantiate`, `recognize`) and its shipped catalogue,
read on core's statement skeleton (`skeletonOf`); the editor only chooses
what to show, in which order and words, and which one `set` an action
dispatches. So the oracles are the fixture as written, the shipped
catalogue's labels, and core's store; every heading below is a catalogue
label, and a verb the catalogue lacks prints the property as written.

`L` is TimeToShare's `fixtures/0.2.0/statements/layerit_recording.yaml`,
the one block `A` = `0000000000` of a store (`storeOf`), its roots in
canonical order `clt_6`, `cpt_1`, `dpt_1` (paths `["timelines", 0]`, `1`,
`2`), `cpt_2` at `["timelines", 1, "children", 0]`. The user is core's
default, Gerhardt, who states as `G` =
`tag:timetoalign.github.io,2026:tilie:user:Gerhardt`; `T` =
`https://example.org/agents/tilie`, `P` = `https://example.org/people/editor`
(the fixture's annotators, printed as written).

**The frame** (`metadata-frame.test.ts`, pure, on `L`'s view):

1. **What is shown.** `cpt_1` selected: a timeline frame, `target`
   `{block: A, id: "cpt_1"}`, words `timeline 'C.Debussy - Clair de Lune,
   Maria João Pires live at Jardin Musical'`, path `["timelines", 1]`,
   key `{"block":"0000000000","id":"cpt_1"}`. The block selected, or
   nothing selected with `A` the only block: the bundle, words `bundle
   'LayerIt, Clair de lune mm. 1–6 (Pires)'`, path `[]`. `group_1`
   selected: "Group 'recording' has no statements: a bundle, a timeline or
   a region has. Select its block, a timeline or a region." Two subjects
   selected: `SELECT_HINT`.
2. **`cpt_1`'s rectangles**, headings `["is a", "performed by", "same
   as"]` (`rectangles`' order: "is a" first, then by first pair, the pairs
   by property in code-point order):
   - "is a", keyed by its first pair `["type","schema:VideoObject"]`, no
     label, rows `type schema:VideoObject` (to `http://schema.org/VideoObject`),
     `type melod:Manifestation` (to
     `https://lod.academy/melod/vocab/ontology#Manifestation`), `wdt:P31
     wd:Q98069877` (to `http://www.wikidata.org/entity/Q98069877`), no
     annotation each.
   - "performed by", label "Maria João Pires", rows `rel:prf
     viaf:113931950` (to `http://viaf.org/viaf/113931950`) and `wdt:P175
     wd:Q235650` (to `http://www.wikidata.org/entity/Q235650`): one
     rectangle, the two values sharing the VIAF cluster through the
     Wikidata node's `schema:sameAs`. Its things, first seen first, are
     the VIAF, Wikidata and GND IRIs, recognised as `viaf`, `wikidata`,
     `gnd`. Annotations: `reconciled · T · 2026-11-18` with basis the
     Wikidata and GND IRIs, then `reconciled · P · 2026-11-18` with
     service `https://www.wikidata.org/w/api.php`. `addable` is
     `[musicbrainz, gnd, melody]`: the verb's vocabularies in catalogue
     order (those with a pattern of their own, and those whose lookup
     searches agents where the fallback states it with a thing slot)
     without Wikidata (`wdt:P175` with a Wikidata value), VIAF and the
     fallback (`rel:prf`, the fallback's property; the fallback holds no
     things, the value is VIAF's).
   - "same as", no label, row `schema:sameAs
     https://www.youtube.com/watch?v=Ch2mrPm1JnM` linking to itself,
     annotation `manual · P · 2026-11-18`.
3. **`cpt_1`'s drawers.** Stated higher up: one group, the bundle, with
   its two rectangles `rdfs:seeAlso` and `schema:about` (`wd:Q29117946`),
   which no verb reads. Proposed: one row,
   subject `["timelines", 1]`, heading "is a recording of", label "Clair
   de lune" (the label `clt_6`'s node gives `wd:Q29117946`), line method
   `inferred`, who `T`, basis `#clt_6`, `#dpt_1`, status `proposed`, key
   the canonical text of `[["timelines",1],"wdt:P2550",{"id":"wd:Q29117946"}]`.
   Rejected: none.
4. **`clt_6`**: headings `["is a", "dcterms:created", "is a version or
   edition of"]`; `dcterms:created` (no verb) labelled by its literal
   "2025-12-05", annotated `imported`; "is a version or edition of"
   labelled "Clair de lune", rows `schema:exampleOfWork
   http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96` and
   `wdt:P629 wd:Q29117946` (one thing shared through the node's
   `schema:sameAs`), its two annotations `manual` by `P` with match
   `broad` and `reconciled` by `T` with service Wikidata. Rejected: one
   row, "is a version or edition of" `gnd:1156628156` (no label known),
   method `reconciled`, its note kept. Proposed: none (the value node's
   own annotation is confirmed).
5. **`dpt_1`**: headings `["is a"]`; proposed one row "is derived from, is
   based on" naming the element `#cpt_1` by its name.
6. **`cpt_2` and the bundle.** `cpt_2` states nothing: one rectangle, the
   empty "is a", keyed `is_a`, no rows; stated higher up the bundle's two
   rectangles, then `cpt_1`'s three. The bundle: the empty "is a",
   `rdfs:seeAlso` and `schema:about`; nothing higher up.
7. **Who.** `whoOf`: `G` → "Gerhardt"; `https://orcid.org/0000-0002-1825-0097`
   → its iD; `…:user:Clara%20Wieck` → "Clara Wieck";
   `https://github.com/TimeToAlign/TimeLineEditor` → "TiLiE"; any other
   IRI as written.
8. **Choices.** `systemChoices` of "performed by": Wikidata, MusicBrainz,
   GND, "MeLODy / LRMoo", "Other vocabularies", "An element of this
   manifest". `verbChoices` for the types `cpt_1`'s "is a" states begin
   "is a", then the usual verbs of `video` (the type three of its
   vocabularies agree on: fallback, MeLODy and Wikidata) and end with
   "Other property…"; with the system `wikidata` no reading Wikidata cannot
   state is offered. `compactIri` writes
   `http://www.wikidata.org/entity/Q235650` as `wd:Q235650` and keeps
   `http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96`
   absolute (no prefix holds it).

**The edits** (`metadata-edits.test.ts`, pure, exact commands, the clock
at `2026-11-20T12:00:00Z`):

1. **Confirming `cpt_1`'s proposal** is one `set` with one change on
   `{block: A, id: "cpt_1"}`: `statements` as before plus `"wdt:P2550":
   [{"id": "wd:Q29117946"}]`, `provenance` as before with entry 3 replaced
   in place by `{basis: ["#clt_6", "#dpt_1"], date: "2026-11-20", method:
   "inferred", note: <kept>, property: "wdt:P2550", stated_by: [G],
   status: "confirmed", value: {"id": "wd:Q29117946"}}`.
2. **Rejecting `dpt_1`'s proposal** changes only `dpt_1`'s `provenance`:
   its one entry `rejected` by `G` on 2026-11-20, method and note kept; no
   `statements` member.
3. **Removing and rejecting a rectangle.** Removing `cpt_1`'s "same as"
   drops the YouTube pair and its confirmed annotation: `statements`
   without `schema:sameAs`, `provenance` without entry 0. Rejecting it
   instead drops the pair and turns entry 0 into `rejected` by `G`.
4. **Adding.** `added` on `cpt_2` with the pair `wdt:P175 {id:
   "wd:Q235650", label: "Maria João Pires"}` and fields `manual` by `G`
   states it with one confirmed annotation `{date: "2026-11-20", method:
   "manual", property: "wdt:P175", stated_by: [G], status: "confirmed",
   value: {"id": "wd:Q235650"}}`; the command changes `cpt_2` alone, both
   members.
5. **Tying.** `tied` on the pair `rel:prf {id: "gnd:124927521"}` with the
   thing `http://www.wikidata.org/entity/Q235650` and the catalogue's
   prefixes gives `{id: "gnd:124927521", "schema:sameAs": [{id:
   "wd:Q235650"}]}`; a node naming the thing itself is left alone.
6. **Nothing changed.** `commandOf` of the frame's own skeleton is
   `null`. A TimeToShare refusal reaches the caller as the function's
   `Error` (removing a pair not stated throws "'schema:sameAs' does not
   have this value").

**The panel** (`metadata-panel.test.ts`: the Inspector mounted on a store
of `L` inside a wrapper that provides the user (Gerhardt; a `UserDialog`
answering "Change…") and a stub lookup; the Metadata tab chosen; the clock
fixed at `2026-11-20T12:00:00Z`). The stub resolves `wd:Q235650` to
"Maria João Pires" with the cross-reference GND `124927521`, that GND
record to "Pires, Maria João", and searches nothing.

1. **Rectangles and drawers.** `cpt_1` shows "This timeline 'C.Debussy -
   …'.", the user line "You state as Gerhardt.", a list "Statements" of
   three groups headed as in frame item 2, the "performed by" one with the
   label "Maria João Pires", two vocabulary rows (two anchors with
   `rel="noreferrer"`, `target="_blank"`), the provenance line
   "reconciled · https://example.org/agents/tilie · 2026-11-18", and a
   "＋ vocabulary" button; the drawers read "Stated higher up (2)",
   "Proposed (1)", "Rejected (0)". The bundle shows "Not stated yet." and
   "State what it is".
2. **Confirm and Reject.** Confirm on `cpt_1`'s proposed row adds one
   journal entry, the "is a recording of" rectangle appears last and
   takes the focus. Reject on `dpt_1`'s row adds one entry, the drawer
   reads "Proposed (0)" and "Rejected (1)", the focus on the proposed
   drawer's summary.
3. **Remove.** Remove on `cpt_1`'s "performed by" leaves "is a" and "same
   as", the focus on "same as"; Remove on the last rectangle of a timeline
   gives the focus to "＋ Add statement".
4. **Paste.** On `cpt_2`, "＋ Add statement", a paste of
   `https://www.wikidata.org/wiki/Q235650` into Value: Vocabulary reads
   "Wikidata", the Verb field has the focus, its options begin "is a";
   "performed by" picked and Add: one journal entry, the change on `cpt_2`
   holding `"wdt:P175": [{"id": "wd:Q235650", "label": "Maria João
   Pires"}]` and one annotation `manual` by `G` on 2026-11-20; the new
   rectangle has the focus. A paste of `https://example.org/x` posts "The
   address is no identifier the catalogue knows; choose “Other property…”
   to state it."
5. **An element.** On `cpt_2`, verb "is derived from, is based on",
   vocabulary "An element of this manifest", the Value options list the
   other timelines (`clt_6`, `cpt_1`, `dpt_1`), not `cpt_2`; `#clt_6`
   picked and Add states `"dcterms:source": [{"id": "#clt_6"}]`.
6. **Other property.** "Other property…" with `dcterms:subject`, a text
   in a language, "Nocturne" in `fr`: Add states `"dcterms:subject":
   [{"@value": "Nocturne", "@language": "fr"}]`; a property `foo` keeps
   Add disabled with "Write the property as a compact IRI with a known
   prefix or in full."
7. **＋ vocabulary.** On `cpt_1`'s "performed by", "＋ vocabulary": the
   Verb field is disabled on "performed by", the Vocabulary options are
   MusicBrainz, GND, "MeLODy / LRMoo"; GND picked, the Value options offer
   "Pires, Maria João" (Wikidata's cross-reference resolved in the GND);
   Add states it in the same rectangle as `rel:prf {id:
   "gnd:124927521", label: "Pires, Maria João", "schema:sameAs": [{id:
   "wd:Q235650"}]}` with the annotation `reconciled`, service
   `https://www.wikidata.org/w/api.php`, basis
   `http://www.wikidata.org/entity/Q235650`, match `exact`. Cancel instead
   closes the composer and gives the focus back to "＋ vocabulary".
8. **The user.** "Change…" opens the dialog "Your name"; an empty name
   shows "A name is required."; "Clara Wieck" with
   `https://orcid.org/0000-0002-1825-0097` saved reads "You state as Clara
   Wieck (ORCID iD 0000-0002-1825-0097).", and a confirmation then states
   `stated_by: ["https://orcid.org/0000-0002-1825-0097"]`.
9. **Refusals.** A store refusal is posted with its message; a throw of
   the statement functions as "The statement could not be changed: …";
   neither journals anything.
10. **State belongs to the element.** The composer opened on `cpt_2` is
    hidden on selecting `cpt_1` and not shown again there.

**The user** (`user.test.ts`): a `UserState` under key `K` with nothing
stored is Gerhardt without iD, `statedBy` `G`; `set({name: "Clara
Wieck", orcid: "0000-0002-1825-0097"})` stores `{"name":"Clara
Wieck","orcid":"0000-0002-1825-0097"}` under `K`, and a new `UserState`
from `K` reads it back, `statedBy` `https://orcid.org/0000-0002-1825-0097`.
Stored texts that are no user (`not json`, `[]`, `{"name": ""}`, `{"name":
"A", "orcid": "0000-0002-1825-0098"}`, a wrong check digit) give the
default. Without a key, and with a `localStorage` whose every access
throws, the default is read, `set` holds the user in memory and nothing
throws.

## The message bar (`messages.test.ts`, `shell.test.ts`)

The message bar over the canvas lists messages in the order posted, each
with its text, its problems and a Dismiss button, marked `data-kind`
`warning` or `info`. A warning stays until dismissed. Information is
dismissed by itself after 3000 ms (fake timers: still shown at 2999 ms,
gone at 3000 ms); dismissed earlier, its timer is cleared (no timer
pending); disposed with information shown (the editor unmounting), no timer
is left pending. The editor gives its components one function posting
information, through the component context; a component mounted without it
throws "no component above this one provides inform". In the editor, a
Copy in the Timestamp tab (a named timestamp selected through the hook)
posts "Copied …" as information, and a refused file a warning.

## Words (`inspector-subject.test.ts`, `journal.test.ts`)

The words are the editor's; what they name is core's resolver's. The
oracles are the committed end-to-end workspaces and a store of
`bundle_mixed` three times (as it is; without its title, with the id
`mixed` and two names dropped; without its title).

1. **The subject beside the heading.** One address gives the words of what
   it names, then its name, or its id without one: `bmixed0000` "Bundle"
   "Mixed"; its title "Title of bundle"; `group_1` "Group" "Performance"
   and its title "Title of group"; `score` "Timeline" "Score", its card
   "Card of timeline", its name "Name of timeline"; the child `excerpt`'s
   start and end marks "Start of timeline", "End of timeline" and its end's
   label "Label of end of timeline", "Excerpt"; the timestamp `timestamp_9`
   "Timestamp" "origin" and its coordinate label "Coordinate of timestamp"
   "origin"; a segment line and a segment "Timeline"; an anonymous bundle
   "Anonymous bundle" with neither; a bundle given the id `takes` "Bundle"
   with that id, its title "Title of bundle" (the manifest's own id
   addresses nothing, so `{block, id: "takes"}` gives nothing); maps, regions and flow-control elements by their kind, a
   flow-control element's by its type ("Conversion map", "Region", "Flow
   marker", "Jump origin" with its id, "Jump target") and their parts the
   same way; a measure map added to a block "Measure map" with its id; a
   band `{block, id: T, facet}` "<Facet> band of timeline" (Markers,
   Conversion maps, Children, Regions, Flow control). Several addresses give
   "N selected". Nothing for no selection or an address naming nothing (no
   such ID or block; a part its element does not have, `start` of a region;
   a part of a card; a band with a part; a band of a group or of a jump;
   the card of a timeline drawn in no card, `{block: "styled0000", id: "a",
   part: ["card"]}`). Mounted, the words stand beside the
   drawer's heading and describe the drawer while shown; an id shows in a
   `code` element; the name follows an applied text without a change of
   selection.
2. **Editor names.** A bundle by its `name`, else its `id`, else "Anonymous
   bundle"; a group or timeline by its `name`, else its id; anything the
   view does not hold by its address's words (core's `addressWords`):
   `{block: A, id: "gone"}` "'gone' in bundle 'Mixed'", `{block:
   "0000000009", id: "score"}` "'score' in block '0000000009'", `{block:
   "0000000009"}` "block '0000000009'". The editing bar, the level panel's
   title line and the Journal use them. The level's word is "Arranger" at
   the top level, else the editor's: "Bundle", "Group", "Timeline".
3. **Each journal entry is one sentence**, with the entry's UTC time as
   `HH:MM:SS` and its author, every address written as its words in the
   view the panel shows (`addressWords`; so a renamed element goes by its
   new name, and one that is gone by its ID): on the three-block store, "Added
   block '0000000003'" for a block the view does not hold, "Added bundle
   'mixed'" for one it holds, "Added timeline 'Viola' to bundle 'Mixed'"
   (an added element by its name, else its id), "Added region 'region_1'
   to timeline 'Score' in bundle 'Mixed'", "Added a region to timeline
   'Score' in bundle 'Mixed'" for a value without either, "Added
   timestamp 'Upbeat' to timeline 'Score' in bundle 'Mixed'", "Set display
   of timestamp 'origin' in bundle 'Mixed'" (and `name` alike), "Removed
   timestamp 'origin' in bundle 'Mixed'", "Set x, y of
   bundle 'Mixed'" (" and 1 more" for more changes), a block's size by the
   Properties form's words ("Set container width, container height of
   bundle 'Mixed'"), "Set place of group 'Performance' in bundle 'Mixed'
   and 2 more", "Removed group 'Facsimile' in bundle 'Mixed', bundle
   'mixed'", a style by its properties and the addresses it lists ("Styled
   stroke of 'score'"; with one block given, "Styled stroke of timeline
   'Score' in bundle 'Mixed'") or else "Styled stroke of matching
   elements", and a session "Edited <kind> <name> (n changes)", counting
   changes at every depth ("Edited bundle Mixed (3 changes)" for a bundle
   session holding a group session of two), ", k undone" while partly
   undone, and without a kind word once its target is gone ("Removed
   'group_1' in bundle 'Mixed'", then "Edited 'group_1' in bundle 'Mixed'
   (1 change)").
4. **Order.** Rows run newest first at every depth, undone ones at the top;
   in an editor its own rows, then the earlier session of the same target
   read only; with two editors open, the inner level only; a session's rows
   hold its changes as rows; nothing gives no row.

## The combobox (`combobox-keys.test.ts`, `combobox.test.ts`)

The editor's combobox follows the WAI-ARIA Authoring Practices "Combobox
Pattern" in the form of its example "Editable Combobox With List
Autocomplete": the options are given by the component's user, typing never
selects one, and the focus never leaves the text field, which names the
active option through `aria-activedescendant`. The oracles are that pattern
and the key table below; nothing is read off the implementation.

**The key table** (`combobox-keys.test.ts`, pure). A state is closed or
open, with an active option or none; a key arrives with or without Alt,
over a count of options and the field's text. The answer is the next
state, an action (none, pick the active option, enter the text, clear the
text) and whether the key was handled (handled keys are consumed, all
others keep their native meaning). Every row is checked for 0, 1 and 3
options, from closed and from open with no active option and with each
active one, each expected state written out:

| Key | Closed | Open |
|---|---|---|
| ArrowDown | open; the first option active (none for 0 options) | the next option; after the last, the first; none for 0 options |
| ArrowUp | open; the last option active (none for 0 options) | the previous option; before the first (or from none), the last |
| Alt+ArrowDown | open; still none active | unchanged, handled |
| Alt+ArrowUp | unchanged, not handled | closed, none active, the text kept |
| Enter | the text entered, unchanged | with an active option: closed, that option picked; without: closed, the text entered |
| Escape | with text: the text cleared; without: unchanged, not handled | closed, none active |
| Home, End, ArrowLeft, ArrowRight | not handled; none active | not handled; none active, still open |
| Tab | unchanged, not handled | closed, none active, not handled (the focus moves on) |
| any other key ("a", Shift) | unchanged, not handled | unchanged, not handled |

Alt changes only the two arrows: Alt+Enter is Enter, Alt+Escape is
Escape. An active option outside the options (a list that shrank) counts as
none: from open with option 5 of 3 active, ArrowDown makes the first
active, ArrowUp the last, Enter enters the text. Typing makes the next
state from the new text alone: open with text, closed without, none active
either way. The announcement of the options is "Searching…" while
loading, else "No results", "1 result", "2 results", "3 results".

**The component** (`combobox.test.ts`) mounts `ComboboxHarness.svelte`,
which gives the combobox three options ("Clara Schumann", "Clara Wieck",
"Clara Haskil", keys `c1`, `c2`, `c3`; a snippet draws each, marking the
active one), holds the text through a function binding that records every
text the combobox writes, and records every pick, Enter and paste. Keys are
dispatched on the text field as `keydown` events, and each assertion reads
the DOM by role and attribute:

1. **Attributes.** The field has role `combobox`, `aria-autocomplete`
   `list`, `aria-controls` the listbox's id, and the label "Performer" as
   `aria-label`, as does the listbox; ids end in `-input`, `-listbox` and
   `-option-0`, `-option-1`, `-option-2` after one shared prefix. Closed:
   `aria-expanded` `false`, the listbox hidden, no `aria-activedescendant`.
   Typing "Clara" records the text "Clara" and opens it (`aria-expanded`
   `true`, the listbox shown) with none active. ArrowDown makes option 0
   active: `aria-activedescendant` is its id, it alone has `aria-selected`
   `true`, the snippet marks it, and it was scrolled into view
   (`scrollIntoView({block: "nearest"})` on it). Two more ArrowDowns make
   option 2 active, one more option 0 again, ArrowUp option 2. Each
   handled key's event is default-prevented and does not reach the
   field's parent; ArrowLeft is neither and leaves no option active. The
   focus stays on the field throughout.
2. **Enter.** With option 1 active, Enter picks "Clara Wieck" (no Enter
   recorded) and closes. Without an active option (typing "Cl", then
   Enter) it records the Enter of "Cl" and closes, picking nothing.
3. **Escape twice.** Open with option 0 active: the first Escape closes and
   keeps the text, the second records the text "" (cleared); both are
   consumed (not seen by the parent). A third, on the empty closed field,
   is not handled: the parent sees it, and nothing is recorded.
4. **The pointer.** On the listbox, `pointerdown` is default-prevented, so
   the focus stays in the field. A primary-button `pointerup` on option 2
   picks "Clara Haskil" and closes; a secondary-button one picks nothing.
5. **Leaving.** Focus moving to a button outside the combobox closes it; a
   `focusout` whose related target lies inside it does not.
6. **When the list shows.** With text and no options: the listbox stays
   hidden without the `empty` snippet; with it, the list shows and holds
   the snippet's text "Nothing for 'Clr'", outside the listbox itself
   (a listbox may own options alone). Loading with no options: shown,
   `aria-busy` `true`. With the text cleared and no options, the `empty`
   snippet does not show and the listbox stays hidden. Disabled, the field
   is disabled and the listbox stays hidden.
7. **Announcements.** The status region holds "3 results" while open with
   three options and text, "1 result" with one, "No results" with none
   (and the `empty` snippet), "Searching…" while loading, and nothing while
   closed or without text; a given `announce` replaces the words
   ("3 performers").
8. **Naming.** With `labelledby` and `describedby`, the field and the
   listbox take `aria-labelledby` and no `aria-label`, the field
   `aria-describedby`.
9. **Paste.** A paste whose handler answers `true` is default-prevented
   and the handler got the clipboard's text; one answering `false` is not.
   Without a handler, a paste is not prevented.
10. **Focus.** The component's `focus()` focuses the field.

## Looking values up (`lookup.test.ts`, `lookup-wikidata.test.ts`, `lookup-gnd.test.ts`, `lookup-reconciliation.test.ts`)

The lookup (`src/lookup/`) asks Wikidata, lobid-gnd and YouTube's oEmbed
endpoint from the browser and MusicBrainz through `tilie-server`'s
Reconciliation Service API endpoint, and turns their answers into
candidates. What proves it is the requests it sends and the candidates it
reads from real answers, so no test reaches a network: the services'
answers are recorded once in `tests/lookup/` by `scripts/record-lookup.ts`
(the live services, one request a second under a User-Agent naming the
repository; the server's endpoint answered by `tilie-server`'s own test
application replaying the MusicBrainz answers recorded for the server's
tests, a 3-candidate search served the first 3 entities of the recorded
5-candidate one), and `index.json` maps each request to its file: a GET
by its URL, a POST by `POST <url> <form body>`. The replaying `fetch`
(`lookup-replay.ts`) serves those files, records every call's method, URL,
headers and body, and rejects any other request, so a request the code
was not meant to send fails the test that sent it, and a test asserting
"no request" reads an empty call list. The end-to-end suite fulfils
browser requests from the same index.

Every candidate list below is written out whole, by hand, from the
recorded file named; none is produced by running the code. A candidate is
`{system, iri, label, description, image, crossReferences, service,
match}`; `match` is false and `crossReferences` empty unless stated.

**The support table** (`lookup.test.ts`). With a server, `searchable`
holds for `wikidata` and every kind; for `gnd` and `work`, `agent` only;
for `musicbrainz` and `work`, `agent`, `recording`, `release`; for no
other pair of the catalogue's systems and the six kinds. Without a server
`musicbrainz` searches nothing. `resolvable` holds for `wikidata`, `gnd`,
`youtube`, and `musicbrainz` with a server only. Asking what is not
supported answers `[]`, `null`, or a `null` per text, with no request.
`NO_LOOKUP` supports nothing and answers the same without a request.
Blank text sends no request either.

**Errors** (`lookup.test.ts`), each a `LookupError` with `system`, `code`,
`status` and the exact message, which completes "<System> could not be
searched: …": a fetch rejecting with "Failed to fetch" → `unreachable`,
`null`, "it could not be reached (Failed to fetch)"; 503 Service
Unavailable → `status`, 503, "it answered 503 Service Unavailable"; a JSON
error body with a `detail` (the server's 502) appends it, "it answered 502
Bad Gateway: MusicBrainz could not be reached"; a body that is no JSON →
`malformed`, "its answer is no JSON"; JSON of another form →
`malformed` naming what was expected ("its answer is no list of found
items" for Wikidata pages that are no list, "its answer is no list of
suggestions" for a lobid answer that is no list, "its answer is an error:
<info>" for the Action API's error object). An aborted request rejects
with the signal's reason, never a `LookupError`, so a superseded search is
told from a failed one. YouTube is the exception: a failed oEmbed request
(404) resolves to `null`.

**Wikidata** (`lookup-wikidata.test.ts`). The search request is pinned as
a string: the Action API with `action=query, format=json,
formatversion=2, origin=*, generator=search, gsrnamespace=0, gsrlimit=10,
gsrsearch=<text filter>, prop=entityterms|pageimages,
wbetterms=label|description, wbetlanguage=en, piprop=thumbnail,
pithumbsize=80` in that order; the kind `any` adds no filter. Results are
read from `query.pages` by their `index` (the recordings list them out of
order): iri `http://www.wikidata.org/entity/` + title, the first label
else the title, the first description else `null`, the thumbnail's
`source` else `null`, service `https://www.wikidata.org/w/api.php`.
Searches: agent "Maria João Pires" (3 candidates, Q235650 first), work
"Clair de lune" (10, Q29117946 first, Q25395619 without terms labelled by
its title), class "video" (10). Resolving reads `wbgetentities` (labels,
descriptions, claims in `en` with fallback): the image is P18's file at
`https://commons.wikimedia.org/wiki/Special:FilePath/<file, spaces as
underscores, URI-encoded>?width=80`; cross-references are read from P214,
P227, P435, P4404, P5813, P436, P434, P1651, P839 in that order, each
string through the catalogue thing whose `scheme_uri` is the property
(lower case where the thing says so), the system the one holding it.
Q235650 gives VIAF 113931950, GND 124927521 and the MusicBrainz artist
`64cf3646-…`; Q29117946 gives VIAF 265616918 and the MusicBrainz work
`8d331505-…` (the recorded item states no GND number); Q98069877 gives
none and no image. A wiki page URL (`https://www.wikidata.org/wiki/Q235650`)
resolves as the entity IRI; an IRI of another system resolves to `null`
without a request.

**The GND** (`lookup-gnd.test.ts`). The search request is lobid's
`search?q=<text>&filter=<filter>&format=json:suggest&size=10`, the filter
`type:MusicalWork` for works and `type:Person OR type:CorporateBody` for
agents; a hit's label is cut at the first " | " into label and
description, its `image` kept, service `https://lobid.org/gnd/search`.
Searches: agent "Pires, Maria João" (4), work "Clair de lune" (10).
Resolving reads `https://lobid.org/gnd/<id>.json`: label `preferredName`,
image the first depiction's thumbnail, cross-references every `sameAs`
link the catalogue recognises with an IRI, in order, once: 124927521 gives
VIAF 113931950 and Wikidata Q235650, 300042558 gives GND 7601249-9 and
VIAF 265616918, 1156628156 gives VIAF 180635085.

**YouTube** (`lookup.test.ts`). Resolving
`https://www.youtube.com/watch?v=Ch2mrPm1JnM` asks the oEmbed endpoint for
that URL: label the title, description the channel, image the thumbnail,
service `https://www.youtube.com/oembed`.

**Reconciliation and MusicBrainz** (`lookup-reconciliation.test.ts`), at
the server `http://127.0.0.1:8000/api/` with the token `recorded-token`.
The client reads the manifest once for any number of calls, and asks
again after a failed read; a relative endpoint resolves against the given
base. Suggestions go to the manifest's `service_url` + `service_path`
resolved against the endpoint, with `prefix` and `type`; reconciliation
and extension are POST forms holding one JSON text each. Every request
carries `Authorization: Bearer recorded-token`. Through the lookup: agent
"Pires" (10 artists, iri `http://musicbrainz.org/` + the service's ID,
service `https://musicbrainz.org/ws/2/`, no image); reconcile work "Clair
de lune" and agent "Maria João Pires" in one request each with `limit` 3,
the best candidate each with `match` true; resolving the work
`8d331505-…` gives its MusicBrainz title and the cross-reference Wikidata
Q29117946.
