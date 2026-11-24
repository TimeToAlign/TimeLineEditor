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

Vitest leaves components' stylesheets out of jsdom, and jsdom computes no
contrast. Where a test proves how text looks (`dom.ts` `addStylesOf`), it
adds the component's own `<style>` to the document, unscoped, and reads
`getComputedStyle`: jsdom resolves which of the component's rules apply
and inherits the colour, so the test pins the colour a rule gives the text
(`rgb(89, 89, 89)`, the editor's muted `#595959`, 7.0:1 on the panels'
white; jsdom's black where the component sets none) and that no `opacity`
below 1 applies to it or to an ancestor (`fadingsOf`, empty). The ratio
itself is the end-to-end suite's (axe-core's `color-contrast`, 4.5:1).

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
level-2 headings of the drawer, the tables dialog (closed, so naming no
manifest: "Load the MatchClaim table of "), the file dialog ("Open"), the
"Your name" dialog, the "Type profiles" dialog and About, no
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
Ctrl+Shift+S, Import manifest…, Export manifest…, Your name…, Type
profiles…), the export disabled
without a selected block, and every key
of the pattern, each checked by the focused item and `aria-expanded`. A
refused file leaves the open workspace as it is and shows one dismissible
message, "bad.tle.json is not a workspace file", with each problem's code
and place. The header's title (the workspace's name, `WorkspaceTitle`,
"untitled") and the document title ("untitled.tle.json –
TimeLineEditor") gain "• " after a command, lose it when undo returns to
the opened view and regain it on redo. New workspace, Open… and a
workspace example on unsaved changes ask one question, "untitled.tle.json
has unsaved changes. Save them?", with Save, Discard and Cancel in that
order, the focus on Cancel: Cancel and Escape keep the workspace, Discard
replaces it, Save saves it first (a download, as Save without a file
handle writes in jsdom) and then replaces it; a save that writes nothing
(a picker cancelled) keeps it. Without unsaved changes nothing is asked.
A MatchClaim table changed by a belief joins the same question (the
Matchstamp tab's item 12).
Save writes core's writer's text of the
store under the workspace's file name, takes Ctrl+S from the browser and
clears the mark; a workspace with no file yet is offered the file its name
gives (renamed "Eroica sketches", `Eroica sketches.tle.json`). **A renamed
workspace's next Save is Save as**: renamed in the header (a click on the
title, "Variations", Enter), Ctrl+S offers `Variations.tle.json` (with
the save picker: `showSaveFilePicker` called once with that suggested
name, the opened handle not written); the rename undone, Ctrl+S writes
into the file again without asking. Saved without a rename, a workspace
keeps its file's name (restored from autosave as `score.tle.json`, saved
as `score.tle.json`). The first save that downloads (no save picker, no
server) informs once "Saved as a download: this browser cannot write
files; start TiLiE with tilie-server to save in place."; a second
download says nothing more. A save requested while one is under way is
ignored.
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

**Open… takes a manifest, and Save writes in place** (`open-save.test.ts`,
the App mounted as above). Open… offers a workspace (`.tle.json`), manifest
files (`.yaml`, `.yml`, `.json`) and MatchClaim tables (`.parquet`) at
once, the fallback input accepting `.tle.json,.json,.yaml,.yml,.parquet`;
a picked file is a workspace file by its name ending `.tle.json`, any
case. A manifest (`bare`'s fixture, `bare.yaml`) opened into an empty
workspace is imported as Import imports it, nothing asked: one block, its
journal one `add`. Opened into a workspace holding a block, one question
is asked, "Add bare.yaml to the open workspace, or open it in a new,
empty workspace?", answers Add, New workspace and Cancel, the focus on
Add: Cancel (and Escape) changes nothing; Add imports it beside the block
(two blocks); New workspace on a saved workspace replaces it at once by a
new one holding the manifest's block alone, named `untitled`, under
`untitled.tle.json`; on an unsaved one it first saves it (the download
of exactly its text under its file name, as Save writes without a
handle) and then does the same; a save that writes nothing (the save
picker cancelled) keeps the open workspace and imports nothing. Ctrl+S on
a workspace opened through the File System Access picker writes its text
into the opened file's handle and asks for no file
(`showSaveFilePicker` not called), clearing the mark, when the handle's
permission is granted, or granted when requested; when the browser
refuses writing (`requestPermission` answers `denied`, or the write
throws `NotAllowedError`), Ctrl+S picks a file as Save as does, and the
workspace then belongs to the picked one. Ctrl+Shift+S always picks. A
workspace restored from an autosave that kept its file's handle saves
back into that handle on Ctrl+S.

**Through the server** (`open-save.test.ts`, the session alone, its
`FileHost` stubbed: a server holding files by path from its root, which
records every `readFile` and `writeFile`, and a file dialog answering the
paths the test queues, recording each `open` and `save` with its kinds,
start folder and suggested name). The server holds
`story/step1.yaml` (the table fixture's manifest named "LayerIt", naming
`step1.match_claims.parquet`), `story/step1.match_claims.parquet` and the
folder `work/`. Each value below is derived from the paths alone: a
location is the manifest's path relative to the workspace file's folder.
- Import manifest… answered `story/step1.yaml` into an unsaved workspace
  (no file: the root is its folder) reads that path once and gives the
  block the location `"story/step1.yaml"` (its form as `readManifestFile`
  infers it, nothing journalled but the `add`).
- Save (no file yet) asks the dialog once, in the root, offering
  `untitled.tle.json`; answered `work/layerit.tle.json`, it writes there
  exactly once, and the written text's `settings.manifests[block]` holds
  `location` `"../story/step1.yaml"`; the session's `path` is
  `work/layerit.tle.json`, its file name `layerit.tle.json`, the mark gone.
- That text opened anew (`openPath`), Show matches (`loadNamedTables`)
  reads exactly one file, `story/step1.match_claims.parquet`, asks no
  question, and the messages are exactly `{informed: ["Loaded the
  MatchClaims of step1.match_claims.parquet."], warned: []}`.
- With the Parquet file removed from the server, the same asks exactly one
  question, of kind `table`, its `missing` the manifest's path
  `story/step1.yaml`; the dialog shows it titled
  "step1.match_claims.parquet is not beside LayerIt, at story/step1.yaml"
  (item 9b).
- Renamed "LayerIt" (`rename`), Save opens the save dialog offering
  `LayerIt.tle.json`, in `work`, and writes nothing while it is
  cancelled; with the rename undone, Save writes `work/layerit.tle.json`
  without opening the dialog.
- A snapshot restored as `{text, name: "layerit.tle.json", path:
  "work/layerit.tle.json"}` (`replace` with that path, unsaved) saves on
  Save into `work/layerit.tle.json`, no dialog.
- Save as into the root (`layerit.tle.json`) rewrites the location to
  `"story/step1.yaml"` before writing, and the written text holds it; a
  write the server refuses leaves the locations as they were
  (`"../story/step1.yaml"`), the mark and the path unchanged, and warns
  "The workspace could not be saved: <the server's message>".
- Open… through the dialog offers workspaces and manifests (the kinds
  `WORKSPACE_FILE`, `MANIFEST_FILE`); a workspace path opens it under its
  base name with that `path`.

## The editor's file dialog (`file-dialog.test.ts`)

The dialog is mounted alone over a stubbed `listFolder` holding, at the
root, the folders `archive.tle.json`, `story` and `work` and the files
`a.tle.json`, `b.yaml`, `c.parquet`, `d.json` (in that order, as the
server lists them), and in `story` the file `step1.yaml`; every call is
recorded. It
is read by role and name, and driven by keys as a keyboard user would:
- `open([MANIFEST_FILE], "")` lists the root once (`listFolder("")`),
  titled "Open"; its list box "Contents of the root folder" shows
  `archive.tle.json/`, `story/`, `work/`, `b.yaml`, `d.json` (folders,
  then the manifests;
  no workspace, since workspaces were not asked for, no table); the
  breadcrumb holds "Root" alone, `aria-current="location"`.
- In the list box, ArrowDown twice chooses `story/` (`aria-selected`, the list's
  `aria-activedescendant` its option), Enter opens it (`listFolder("story")`;
  breadcrumb "Root", "story"), ArrowDown and Enter take `step1.yaml`: the
  dialog resolves `"story/step1.yaml"`. Backspace in a folder goes up;
  "Root" in the breadcrumb lists the root again.
- A double-click on `b.yaml` resolves `"b.yaml"`; Cancel resolves `null`.
- `open(…, "gone")` on a folder the server refuses (404 "no such folder")
  shows the root instead and says "The folder gone could not be shown:
  no such folder".
- `save(WORKSPACE_FILE, "", "untitled.tle.json")` titled "Save as" shows
  `archive.tle.json/`, `story/`, `work/`, `a.tle.json` and the name field
  "File name" holding
  `untitled.tle.json`; Save resolves `"untitled.tle.json"`. The name
  `layerit` resolves `"layerit.tle.json"` (the kind's extension added).
  The name `a.tle.json` asks "Replace a.tle.json?" (Replace, Cancel, the
  focus on Cancel): Cancel keeps the dialog open, Replace resolves
  `"a.tle.json"`. A click on `a.tle.json` in the list fills the field. The
  name `archive` refuses "archive.tle.json is a folder." and a name
  holding `/` "A file name holds no /.", the dialog staying open.
- The list box owns options only (`aria-required-children`): what stands
  in for its entries is a note beside it, a polite status (`role="status"`)
  that describes the list after the hint. `open(…, "work")` (an empty
  folder) shows while it is asked for a list box with no child,
  `aria-busy="true"`, the note "Loading…"; then no child, not busy, the
  note "Nothing to show here.", described by the hint ("TimeToShare
  manifest: the files on the server.") and the note. ArrowDown, ArrowUp,
  Home, End and Enter there choose and open nothing (no
  `aria-activedescendant`, no other listing); Backspace goes up, and the
  root's five entries are five options with the note empty.

## The workspace's title (`workspace-title.test.ts`)

The title is a component of its own, given the workspace's name, its
file's name, whether it is dirty and `onrename`, the caller's renaming,
which answers a refusal's message or `null`. The tests mount it alone,
read it by role and accessible name, and count the calls of a recording
`onrename`: what a name may be is the store's to decide, never the
title's, so the refusal is a string the test hands in. The page's whole
text is compared, so a mark, a separator or a file name too many fails.

- `untitled`, file `untitled.tle.json`, dirty: the text is "• untitled",
  one button named "Workspace name untitled, unsaved changes, click to
  rename" (the name replaces the button's text for a screen reader, so it
  says what the mark "•" shows), and no file name, since the file is the
  one the name gives (`workspaceFileName` of the file module, whose own
  tests own its spelling).
- `LayerIt`, file `untitled.tle.json`, clean: the text is
  "LayerIt — untitled.tle.json", the file's name after the name because it
  is not `LayerIt.tle.json`, and the button is named "Workspace name
  LayerIt, click to rename".
- A click on the button swaps in one text field labelled "Workspace name",
  holding `untitled`, focused, all its text selected (selection 0 to 8).
  Replacing the text by `LayerIt` and pressing Enter calls `onrename`
  exactly once, with `"LayerIt"`; the button is back, focused, and the
  Enter key's event is prevented (the browser would otherwise press the
  button that now holds the focus, which opens the field again). F2 on the
  button opens the field as the click does; Enter on a button is the
  browser's click, so it needs no test of its own. Leaving the field
  (blur) commits as Enter does: one call; spaces around the text are
  trimmed (`"  Op. 35 "` → `"Op. 35"`).
- Escape in the field brings the button back, focused, with no call.
- A refusal: `onrename` answering "the workspace's name is never empty"
  keeps the field, marked `aria-invalid="true"`, its description the
  message, which the page shows; typing again removes the mark.
- Ctrl+S in the field: a keydown listener on the element the title is
  mounted in, added before the title, records the order; the calls are
  `["rename LayerIt", "parent"]` and the parent sees the event not
  prevented, so the editor's own Save shortcut runs after the rename and
  saves the new name. The listener on the mount target is the hardest
  case: a handler delegated to that target would run after it.

## Autosave (`autosave.test.ts`, `shell.test.ts`)

The storage alone: a snapshot is written once after the delay, the latest
of a burst only (a text given as a function is called once, when due); a
flush writes at once; a discard empties the slot, also after a write has
started; each key has its own slot, which recovers the last text byte for
byte. A failing IndexedDB rejects with `indexeddb_failed`, a failed timed
write once at the next flush or to the error callback; no IndexedDB is
`indexeddb_unavailable`. A snapshot with its file's handle recovers it
(a value the browser could store: a plain `{kind: "file", name}` object in
these tests); one whose handle IndexedDB cannot store (a `DataCloneError`:
an object holding a function) is written without it and recovers
`{text, name}` exactly; the autosave of an editor whose workspace has a
handle writes it beside the text. A snapshot with its file's path on the
server (`{text, name, path: "work/w.tle.json"}`) recovers exactly that,
and the autosave of an editor whose workspace has a path writes it beside
the text.

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
`fixtures/warnings/<SCHEMA_VERSION>/` as `warnings/<name>`, the table
fixture's manifest (`fixtures/tables/<SCHEMA_VERSION>/manifest.yaml`) as
`tables/manifest`, the one option carrying a source of the files served
beside it, which serves its MatchClaim table alone (reading
`projections.parquet` from it gives `null`, nothing fetched), and every
end-to-end workspace as `e2e/<name>`; no label
repeats and the list is in code-unit order. For the installed package that
is 184 manifest fixtures (92 and their minimal twins: 51 at the top
level, 17 in `groups/`, 20 in `bundles/`, 4 in `statements/`, as the
schema package's fixture README counts them: 2 × (51 + 17 + 20 + 4) =
184), 16 warning cases, the table fixture and 5 workspaces, 184 + 16 + 1
+ 5 = 206 options, from `bare` (then `bare.minimal`,
`bundles/bundle_arranged_conflict`, its twin, `bundles/bundle_arranged_roots`)
to `with_region.minimal`; no option starts with `drawings/` or `rejections/`,
which hold drawing inputs and outputs and refused manifests. Each option
is an entry of the Examples menu's shape, and Open opens it as the
Examples menu opens an example, through the same routine: every manifest
fixture and every warning case is of kind `manifest`, its text the
fixture's or the warning case's `manifest`, which core's `loadManifest`
accepts, so each option imports (`fixtures.test.ts`, one case per fixture
named by its label, so that a failure names the fixture); every end-to-end
workspace is of kind `workspace`, its text the file's, which the reader
accepts; 184 + 16 + 1 = 201 entries of kind `manifest` and 5 of kind
`workspace`. A
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

The Manifest panel shows the selected block's manifest as YAML (first, and
the format shown until another is chosen), JSON or TOML and writes an edited text back as one `set` of the block's
`manifest`. A text written fresh is the manifest file's text, every ID
`#id` and the full `@context` (the format's terms and every prefix the
statements use) added where the manifest leaves core, as Export adds them,
under the block's Include styling and Minimal: JSON is
TimeToShare's pretty JSON and YAML its canonical YAML (`dumps` with
`"json"` and `"yaml"`), so with a block's manifest file in that
serialization the shown text equals what Export writes. The oracles are the
fixtures (their bytes), TimeToShare's `dumps` (a canonical text that sorts
keys, so only a changed value fails a comparison) and the store (what it
accepts and refuses).

1. **Every manifest round-trips through every format, byte for byte.**
   Each manifest fixture of the installed schema version (the 51 of the
   top level, the 17 of `groups/` and the 20 of `bundles/`, the schema
   package's counts; a minimal twin reads back as its complete fixture,
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
   pinned whole, written from the manifest as core holds it (IDs bare, no
   `@context`: core holds none of the format's terms, and the manifest
   declares no prefix of its own), and reads back with all seven nulls. A measure-map row with
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
   `"locked": "yes"` is `schema_violation` at `/timelines/0/locked`,
   `"unit": "parsecs"` `schema_violation` at `/timelines/0/unit`; the message
   is TimeToShare's: the tests read it from the validator at test time
   (`validatorDetail`) and never state its wording, so a change of the
   validator's phrasing breaks no test here. A syntax error carries the
   reader's 1-based line and column: JSON `"locked": ,` at 110:17 (after
   `@context`, the default timestamps' `graphical` and `resources`, which
   sort first), YAML `locked: [false` at 94:5 (the line after the
   unclosed sequence, after `@context`, `graphical` and `resources`).
   Schema 0.2.0's resources, MatchStamps and beliefs moved both by the
   lines they add before the timeline: `resources: []`, `graphical`'s
   `matchstamps: []`, each default timestamp's `matchstamp: false`, and the
   context's belief terms in place of the status terms (five lines more
   in pretty JSON, four in YAML); its `groupstamp` key, written `false` on
   each of the two default timestamps, moves both by two lines more, and
   `graphical`'s `elisions: []` by one more.
   TOML `locked = ` at 17:1 (the line after the missing value; the
   top-level keys, `resources = []` among them, `[meta]` and the
   timeline's keys before it,
   `graphical`'s tables and then `@context`'s after the timelines). YAML is read by TimeToShare's `parseYaml`, the
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
   `bare.minimal.yaml` with its `@context` (the full context a file
   writes; `bare` declares no prefix of its own, so it is the format's
   terms), whose `graphical` holds its root's default timestamps, without
   that `graphical`, or with the rule added to its `rules`. In each mode
   the JSON and the YAML text are exactly what Export writes of the block
   (`saveManifest` with that mode's `minimal` and `styling` and the
   serialization `"json"` or `"yaml"`). In every mode
   and format an applied edit stores the complete manifest with that edit
   (the styling kept when the text leaves it out) and shows the text
   written from it; the shown text, its JSON reflowed or with keys
   reversed, or a minimal text spelling a default, applies nothing; a typed
   colour replaces the styling; without the styling a typed `graphical` is
   refused `hidden_member` at `["graphical"]`, "the styling is excluded;
   check Include styling to edit graphical".
8. **The codecs load on demand, once, and a failure is shown.** The formats
   are listed YAML, JSON, TOML. In a fresh
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

- a new text state is in YAML and shows the block's canonical YAML;
- a clean text shows the selected block's manifest, another block's when
  the selection changes, nothing without a block (these rules are proven
  in JSON, chosen first);
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
   "bars"}`). In the MatchStamps store (see "Words"): `matchstamp_1` its
   name "Bar 2, downbeat (take 1)", target `{block, id: "matchstamp_1"}`,
   not nullable (the schema requires a MatchStamp's name); the match
   timestamp `timestamp_3` "Take 2, bar 2", nullable (a match timestamp's
   name is optional), and the ordinary `timestamp_4` "origin", not
   nullable; no field for the alignment anchor `anchor_1`. Emptying
   `timestamp_3`'s field gives `{name: null}`, which the store applies in
   one entry, leaving `timestamp_3` without a `name` member; emptying
   `matchstamp_1`'s gives `{name: ""}`. No field for a band or two things, in one
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
10. **No elision control.** The Properties panel holds none of the
    elisions' blocks: mounted for the card of `excerpt` in
    `group_elided_inside`, a group member in `bundle_elisions_stored` and
    a selected elision, no element of the Elisions tab's test IDs
    (`elisions`, `group-elisions`, `elision-form`) is rendered; they live
    in the Elisions tab alone ("The Elisions tab" below,
    `inspector-elision.test.ts`).

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

## The Elisions tab (`inspector-elision.test.ts`)

Eliding is a property of what lies under a root and of a group's frame
(drawing.md §§2.4, 8.8, 8.9). The last tab of the inspector, Elisions,
holds up to three parts, each a block of its own: the **root's block**, wherever every inspected
thing is a timeline, a card, a part of either or an elision, all under one
root `R` drawn in an ancestor card or as an ungrouped root; the **group's
block**, wherever every inspected thing lies in one group `G`'s frame (the
frame or its title, a member card, a timeline lying in `G`, a group
elision), and in `G`'s group editor with nothing selected; and the **form**
of one selected elision. What a mode resolves to, the proportion `r`, the
depths and every gap's coordinates and widths are read from the exposure
the drawing gives of the card or frame (`Drawing.elisions`, layout's,
which derives its numbers from drawing.md §8.9); the tab never lays
anything out and never draws a trial. A root's mode and its settings are
one `style` of the root's rule `{addresses: [{id: R, part: [card]}]}` in
block `B`, a frame's mode one `style` of `{addresses: [{id: G}]}`; every
action sends one command, so one journal entry, the one exception named
below.

The oracles are three fixtures, every one drawn in block `B` =
`0000000000`:

- `groups/group_elided_inside`: the root `piece` (64 ♩, children `first`
  32 at 0 and `second` 32 at 32), the member `excerpt` (8 at 8 in
  `first`), drawn Proportional by `auto` with nothing stored: `r = 1/7`
  (binary64 `0.14285714285714285`, the field "0.142857", six decimals),
  chain `piece`, `first`, both depths chosen, its default gaps `first` 0–8
  (a whole piece, drawn `400 r`), `first` 16–32 (`800 r`) and `second`
  1–31 (`1600 r − 100`, its ends 1 ♩ = 50 each kept), in binary64
  57.14285714285714, 114.28571428571428 and 128.57142857142856 (§8.9's
  worked numbers, 50 canvas units per quarter).
- `bundles/bundle_elisions_stored`: `score` (64 ♩) behind `group_1`'s
  frame, protected span 16–24 (the member `theme`), Custom by `auto` with
  its card elisions in canonical order `elision_1` (on the hidden `coda`,
  drawn nowhere), `elision_4` 0–20 `{ratio: 0.5}` (clipped to 0–16,
  natural 800, drawn 400), `elision_5` "Development" 32–48 `{span: 4}`
  (natural 800, drawn 200, display `[name]`) and `elision_6` 40–56
  `{canvas: 30}` (clipped to 48–56, natural 400, drawn 30); `session`
  drawn Full by its rule `elision-mode: full`, its card elision
  `elision_7`; the ungrouped `page` (1754 px, int) with `elision_2`
  "Appendix" 600–1754; the group `group_1` "Theme" (members `theme`,
  `take`, `recording`) with its one group elision `elision_3` on
  `recording` (seconds, float) 0.0–2.0, standard gap, display `[ellipsis,
  coordinate]`, which the frame elides on every member: `theme` 0–8/5,
  `score` 16–88/5, `take` 0–5.1, `session` 30–35.1 (layout's `members`).
- `groups/group_elided_members`: group `group_1` "Theme", members in
  display order `excerpt` (16 ♩ at 16 in `piece`), `voice`, `sketch`; its
  group elisions `elision_1` "Development" on `excerpt` 2–8 (standard gap,
  natural `400 × 6/16 = 150`) and `elision_2` on `phrase` 2–6; `piece`
  drawn Proportional, `r` 0.31083333333333335 ("0.310833"), chain
  `piece` alone. The frame is 400 long; `elision_1` elides `piece` 18–24,
  `voice` 3–12 and `sketch` (unknown length) nothing.

**Where.** In `group_elided_inside` the root's block is offered for the
card `{id: excerpt, part: [card]}`, the child `{id: first}`, the root
`{id: piece}` and the default elision `{id: second, part: [elision]}`,
always titled `Parent timeline "Piece"` with the options Hidden, Full,
Proportional, Custom; not for `recording` (a root member: no ancestor
card), the block, `group_1`, or `excerpt` with `recording` (two roots).
The ungrouped `page` is titled `Elisions of "Page"` with Full and Custom.
The group's block, `Elisions in group "Theme"` with Full and Custom, is
offered in `bundle_elisions_stored` for `{id: theme}` (a member),
`{id: group_1}` (the frame), `{id: elision_3}` (a group elision) and,
with nothing selected, `group_1`'s editor; not for `score` (an ancestor
lies in no group through its member), `page`, nor with nothing selected
outside an editor. `elision_3` offers no root's block (`recording` is a
member: no ancestor card).

**Blocks, collapsed.** What proves the presentation is the accessibility
tree and the open state, never the look: each part is a tile (a
`section` labelled by its heading) whose heading holds one disclosure
button, `aria-expanded` and `aria-controls` naming the region that
follows it, `hidden` while collapsed. The button's accessible name is the
kind word, the title and one line of essentials, so a timeline's block and
a group's are told apart by their names alone: `Timeline`, the title, the
mode, and in Custom the count ("Custom, 3 elisions"); `Group`, the title,
the mode and the count; `Elision`, the title, the stretch From–To with the
unit, a default elision's followed by ", automatic". Mounted for
`{id: excerpt}` of `group_elided_members` (a member of `group_1` whose root
`piece` draws an ancestor card), the tab shows two blocks, named
`Timeline Parent timeline "Piece" Proportional` and `Group Elisions in
group "Theme" Custom, 2 elisions`. Collapsed at first: for `{id: piece}`
of `group_elided_inside` the one block's button reads `aria-expanded`
"false" and its region is hidden. Open without a click where a block holds
the selected elision: `elision_5` (a card elision of `score` in
`bundle_elisions_stored`) opens the timeline's block and the form's;
`elision_3` (a group elision) the group's block and the form's, no
timeline's block being offered; the default `{id: second, part: [elision]}`
(inside) the timeline's block and the form's. A click toggles one block
and no other. What is opened is kept per block in the inspector's
`PropertyDrafts`: mounted in the inspector, the timeline's block of
`piece` opened, then Properties chosen and Elisions again, it is still
open; mounted again with the same drafts (the drawer closed and opened),
still open. A block holding the selected elision keeps its own state for
that selection: with `elision_5` selected, the timeline's block closed by a
click stays closed while `elision_5` stays selected, and `score` selected
alone then shows its block collapsed, the state of the block holding no
selection.

**A block worked in stays open.** What proves it is the open state the
user meets after the selection has left the block, read with the same
drafts in a panel mounted again for the block's timeline (deleting the
selected elision empties the selection, so the tab shows nothing until
something is selected again). With `elision_5` selected, its timeline's
block open by the selection alone, each of the form's Delete elision, the
`×` of `elision_5`'s row and the timeline's Remove all sends its one
`remove` and leaves the block open: `score` selected afterwards shows
`Timeline Parent timeline "Score" Custom, 2 elisions` (after Remove all,
which leaves nothing stored, `… Proportional`, the mode the card falls
back to) with `aria-expanded` "true" and its region shown, where without
the action it shows collapsed. A block never acted in stays as its own
key says: in `group_elided_members`, `elision_1` (a group elision of
`excerpt`) selected, its group's Remove all sent, then `excerpt` selected
shows the group's block open and the timeline's block, which was never
touched and holds no selection, collapsed. The other handlers keep it
open alike, with `elision_5` selected: the mode Full (one `style` of
`{elision-mode: full, display: null}` on `score`'s card, summary
`Full`), Add elision (one `add` into `score` of `[112, 3]`–`[152, 3]`,
as under "Read", summary `Custom, 4 elisions`) and the click on the
first row (no command, `elision_4` handed to the selection, summary
`Custom, 3 elisions`) each leave `score`'s block expanded with its
region shown. An explicit close wins over an
earlier action: after the Delete above, the timeline's block of `score`
closed by a click stays closed when `score` is selected again. So does
a close made while the block still holds the selected elision, where
its button writes the block's own key besides the pair: with
`elision_5` selected, the `×` of `elision_4`'s row (one `remove`,
summary `Custom, 2 elisions`) or the mode Full, then the block closed
by its button, `score` selected alone shows the block with
`aria-expanded` "false" and its region hidden; without that write it
reopens. The group's block alike: `elision_3` selected, the frame's
mode Full (one `style` of `{elision-mode: full}` on `group_1`), the
group's block closed, `theme` selected shows `Group Elisions in group
"Theme" Full, 1 elision` collapsed, and the timeline's block of `score`
collapsed, never touched.

**Nothing to configure.** With nothing to configure (nothing selected
outside an editor, or the block alone selected) the tab shows only
"Select one timeline, card or group frame to edit its elisions.", which is
also true of a selection lying in several roots or blocks.

**Read.** `piece` (inside): mode Proportional; Proportion Automatic,
"0.142857" (held beside it exactly, `0.14285714285714285`); Rows Automatic, the depths deepest first `2` "First, Second"
and `1` "Piece", both chosen; Show exactly the `elision-display` layout
resolves for the card (its initial value is the specification's and
layout's, never the editor's), its words pressed; no list. `score`:
mode Custom; three rows, name, timeline, stretch: "—" Score "0–16 ♩",
"Development" Score "32–48 ♩", "—" Score "48–56 ♩" (the pieces drawn,
`elision_1` none); Remove all one `remove` of `elision_1`, `elision_4`,
`elision_5`, `elision_6` (every card elision of `score`, drawn or not);
Add elision one `add {into: {B, score}, elision: {start: [112, 3], end:
[152, 3]}}`: the middle third of the longest stretch outside the
protected span, 24–64. `session`: mode Full. `page`: mode Custom, one row
"Appendix" Page "600–1 754 px", Add `{start: 585, end: 1169}` (the middle
third of 0–1754, 584 2/3–1169 1/3, inside to whole pixels on an int
axis). The group's block of `bundle_elisions_stored`: mode Custom, "1
elision", one row "—" Recording "0″–2″", Remove all one `remove` of
`elision_3`; Add from the member `theme` `{into: {B, theme}, elision:
{start: [8, 3], end: [16, 3]}}`, from `recording` `{start:
3.3333333333333335, end: 6.666666666666667}` (doubles on a float axis);
of `group_elided_members` from the frame: "2 elisions", rows
"Development" Excerpt "2–8 ♩" and "—" Phrase "2–6 ♩", Add into the first
member `excerpt` `{start: [16, 3], end: [32, 3]}`.

**Switch** (drawing.md §8.9, Modes; each one command, one entry,
mounted). On `piece` (inside): Full sends `{type: style, select:
{addresses: [{id: piece, part: [card]}]}, set: {elision-mode: full,
display: null}, blocks: [B]}`, after which the mode reads Full; undo
gives Proportional back. Hidden sends `set: {display: none}` (the mode
then Hidden: the drawing records no ancestor card of `piece`), and from
Hidden Proportional sends `{elision-mode: null, display: null}` (nothing
stored), which leaves the rule empty, so the manifest holds no rule.
Proportional → Custom with nothing stored is one `add {into: {block:
B}, elision: [...]}` of the three default gaps as drawn: `first` `[0,
1]`–`[8, 1]` `{canvas: 57.14285714285714}`, `first` `[16, 1]`–`[32, 1]`
`{canvas: 114.28571428571428}`, `second` `[1, 1]`–`[31, 1]` `{canvas:
128.57142857142856}`, each `display` the card's resolved
`elision-display` as layout exposes it); the mode then reads Custom
(`auto`) with those three
rows, and Remove all, one `remove` of the three, gives Proportional back.
With stored elisions (`score`) Full sends `{elision-mode: full, display:
null}` and Custom then `{elision-mode: null, display: null}`, the stored
ones back; Proportional sends `{elision-mode: proportional, display:
null}`. With nothing stored and Full, Custom sends `{elision-mode: custom,
display: null}` (starting from full timelines). The frame: Full sends
`{select: {addresses: [{id: group_1}]}, set: {elision-mode: full}}`,
Custom then `{elision-mode: null}`. A root that is a member of one group
(`piece` made the one member of a new group `group_2` "Whole" by one
`add`) offers Custom with `aria-disabled="true"` and the visible hint
`Custom: its elisions belong to group "Whole"`; choosing it sends nothing.
The one exception to one entry: Proportional → Custom where the root's
rule states `elision-mode: proportional` with nothing stored adds the
defaults and then deletes the mode (two entries; no fixture states it,
`elisions.ts` says so).

**Settings** (Proportional, each one `style` of the root's rule).
Unticking Proportion's Automatic sends `{elision-proportion:
0.14285714285714285}`: the proportion the drawing takes, exactly, never
the field's six decimals, so the derived gaps stay where they were drawn
(every gap of the card's exposure has the same `x1` and `x2` before and
after); Automatic then reads unticked and the field holds "0.142857";
typing `0.5` and Enter sends `{elision-proportion:
0.5}`; `2` is refused with "2 is no proportion: write a number above 0
and at most 1", the field `aria-invalid`, nothing sent; ticking Automatic
sends `{elision-proportion: null}`. Unticking Rows' Automatic sends
`{elision-depths: "1 2"}`; then unchecking depth 2 sends
`{elision-depths: "1"}`, after which depth 1, the last chosen, is
disabled. Show's Lines (`continuation`, in no initial display) sends
`{elision-display: "<the resolved words> continuation"}`, in canonical
order; with the rule stating `elision-display: ellipsis`, Ellipsis alone
is pressed and sends `{elision-display: none}`.

**At the canvas's pane.** The automatic proportion depends on the pane
the canvas is drawn at (drawing.md §8.9, `B`), and the editor shares the
canvas's pane with the inspector's tabs through component context. Mounted
with a `Pane` measured at 1100 × 800 on `group_elided_inside`
(`elision-proportion: auto` on `piece`'s ancestor card), the panel's
Proportion shows the six-decimal text of the proportion of the drawing the
canvas shows at that pane (the arranger's `drawingOf` with that pane, the
oracle), which differs from the paneless drawing's 1/7; unticking
Automatic states that drawn proportion exactly.

**A selected elision.** The form reads the gap the drawing draws of it and
converts widths through layout's `widthAs`, with the card's or frame's
length `L`, the root's length (a card elision) or the holding member's (a
group elision) as `λ`, exact on an exact axis.
- `elision_5`: title `Elision on "Score"`, From "32", To "48", unit ♩,
  form As wide as; the fields Proportional "0.25" (200 / 800), As wide as
  "4" (stored), Fixed "200"; no Also elides. `elision_4`: form
  Proportional, "0.5", "8" (`400 × 64 / 3200`), "400". `elision_6`: form
  Fixed, "0.075", "3/5" (`30 × 64 / 3200`), "30".
- `elision_1` of `group_elided_members`: title `Elision on "Excerpt"`,
  form Standard, "0.21333333333333335" (32 / 150), "32/25" (`32 × 16 /
  400`), "32"; Also elides Piece "18–24 ♩", Voice "3–12 ♩", Sketch "—".
  `elision_3`: From "0.0", To "2.0", unit s; Also elides Theme "0–1 3/5 ♩",
  Score "16–17 3/5 ♩", Take "0″–5.1″", Session "30″–35.1″".
- Commands (mounted, each one entry, each on `elision_5` as the fixture
  stores it): From `33.5` and Enter
  is one `set` of `start: [67, 2]` (a decimal on a fraction axis means the
  value it denotes); `x` is refused, kept with "\"x\" is no fraction value;
  write an integer, n/d, a b/c or a decimal", `aria-invalid`; From
  `9007199254740993/2` gives `start: [9007199254740993n, 2]`, the
  numerator past 2^53 kept whole (it was rounded through `Number` before);
  choosing Fixed is one `set` of `width: {canvas: 200}`, Proportional of
  `width: {ratio: 0.25}`, Standard of `width: null`; Show's Ellipsis is one
  `set` of `display: [ellipsis, name]` (the canonical order); Delete one
  `remove`.
- The Name field at the top names a stored elision: `elision_5`'s is
  "Development", `elision_4`'s empty, an empty text unstating it; a
  default elision has none.
- The default `{id: second, part: [elision]}` (inside): title `Elision on
  "Second"`, From "1", To "31", both fields disabled, the hint "Choose
  Custom to edit", no width, Show or Delete.

**Side by side** (drawing.md §8.8, Drawn once). A fourth fixture,
`bundles/bundle_arranged_roots`, drawn in `B` by layout with the placement
`arrangement: {direction: horizontal, order: [page, group_3, group_1,
group_2]}` (the pure readings are given that drawing, drawn by the test
itself, and the selection resolved as the canvas does): the row
`page`, `group_1` "Exposition", `group_2` "Development", `group_3`
"Recapitulation"; `score` (48 ♩, the anchors `exposition`
0–16, `development` 16–32, `recapitulation` 32–48) and `session` (130.0
s, `take_a` 0.0–30.0 in `group_1`, `take_b` 100.0–130.0 in `group_3`)
each drawn once. The drawing records ONE ancestor card per root, under the
key of the first group of the row hanging on it, `{item: group_1, member:
R}`, its `ancestor.groups` every group it lies behind, left to right. What
proves the reading:
- **One card, found from any group.** The root's block reads that card for
  a subject in any of the groups: `{id: development}` (`group_2`'s member,
  whose own card is not recorded) and `{id: recapitulation}` show `score`
  drawn Proportional, as `{id: exposition}` does, not Hidden (which is what
  reading the card `{item: group_2, member: score}` would give: nothing
  recorded there). `{id: take_b}` shows `session` the same way.
- **The arrangement's gaps, read-only.** `score`'s block lists nothing
  under "Side by side": its anchors' stretches touch at 16 and 32 ♩, so its
  axis has seams there and no gap, and a seam leaves out nothing, is no gap
  and is not exposed (drawing.md section 3.2, Seams); `session`'s lists
  `between "Exposition" and "Recapitulation"` with its elided stretch as
  layout exposes it, "33″–44″". They are not card elisions: in Custom the
  count and the rows hold none of them; the default elision `{id: score,
  part: [elision]}`, which is their address, has no form (only a gap of
  origin `default` has), and Proportional → Custom stores none of them. In
  the free drawing the block lists none.
- **A gap is named by its stretch.** `score` made 56 ♩ long and
  `recapitulation` moved to 40 (one `set`): the anchors now lie 0–16,
  16–32 and 40–56, so the axis has a seam at 16 and one gap, between
  Development's anchor (ending at 32) and Recapitulation's (starting at
  40). The block lists exactly one item, `between "Development" and
  "Recapitulation"`, with the stretch of the one `arrangement` gap layout
  exposes; reading the gaps by their place in the list would have named
  "Exposition" and "Development", the pair across the seam.
- **Stored elisions between two anchors.** `session` given a card
  elision 50.0–80.0 (one `add`), which lies between `take_a` and `take_b`:
  the free drawing draws it and lists it plainly; side by side the card
  draws it not (the stretch between two anchors is the arrangement's gap
  whatever the mode), yet it is kept: Custom lists it "—" Session
  "50″–1′20″" with the note "not drawn while arranged side by side", counts
  it, and its `[×]` and Remove all remove it. Mounted (the tab, the
  block's `arrangement` stated by one `set` so that the arranger's drawing
  is the side-by-side one): "Side by side" holds the one item `between
  "Exposition" and "Recapitulation" 33″–44″`, the count reads "1 elision",
  and the row carries the note.
- **The least proportion.** With a group elision on `development`
  4–12 the free drawing exposes the proportions 0.5 (behind `group_1`),
  0.29 (`group_2`) and 0.34211419677734367 (`group_3`) for `score`. Behind
  `group_3` (`recapitulation` 32–48, so `EL` 32, `ER` 0, `λ` 16, `uL`
  2) section 8.9's (b) binds: the frame is `Fw = 567.39013671875` wide,
  `c = Fw / 2`, and `score` laid out alone has `σ = K + N' + G' = 8 +
  143.41357421875 + 8 = 159.41357421875` (its widest row name
  `Exposition, Recapitulation`), so
  `dl = c + σ = 443.108642578125` and `r = (716.8 − dl) / (400 × 2)`,
  below (a)'s `λ / E = 0.5` (the card reaches `σ` left of the frame's
  edge, its seam putting what lies left of `recapitulation` outside the
  frame); side by side the once
  card's Proportion shows "0.29", Automatic ticked: the least, read from the
  exposure, equal to the least of the free cards' (an oracle the editor
  never computes).

**The display command** is one (`stamps/commands.ts`): a named timestamp's,
an anchor's and a stored elision's `display` toggle through it, taking a
word out where shown and putting it in its canonical place otherwise;
the Timestamp and Matchstamp tabs' tests run through it unchanged.

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

**The tab rule** is proven as a table on the rule alone. The eight tabs are
always present, in this order: the level tab, Properties, Metadata,
Manifest, Journal, Timestamp, Matchstamp, Elisions (last, so End reaches
it and ArrowRight from it wraps to the level tab). The level tab is labelled by the level's word: "Arranger" with no
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

**A selected elision selects the Elisions tab** (`inspector-tabs.test.ts`,
"a selected elision"), on `bundle_elisions_stored`, whose stored
elisions include `elision_5` (on `score`) and `elision_3` (a group
elision of `group_1`), and whose roots `score` and `session` draw ancestor
cards (behind the child members `theme` and `take`), so each may carry an
automatic elision, addressed `{id: T, part: ["elision"]}`; `recording`, a
root member, and `theme`, a child of the root, carry none (core's
`defaultElisionTimelines`: an ancestor card's root and the children of
its ancestors but the member's parent). As a rule: the two stored
elisions' addresses and the automatic elision's of `score` and of
`session` name an elision; `score`, `elision_5`'s ellipsis, the
automatic elision's ellipsis and name label of `score`, `{id: recording,
part: [elision]}`, `{id: theme, part: [elision]}`, the block and an
unknown ID do not. A selection of exactly one elision, stored or
automatic, gives the Elisions tab, recorded with the openings given, and
no pin, exactly as a choice of that tab; nothing, a timeline, the block,
two elisions, a stored and an automatic elision together, an elision
with its timeline, or an elision's ellipsis alone give the state passed
in, the same object. The rule remembers no tab: a pin held before
(Timestamp shown) is cleared, so clearing a pin afterwards changes
nothing. A pin or a MatchStamp arriving afterwards takes the tab as
always, remembering Elisions, and letting it go shows Elisions again.
With the drawer hidden, Journal chosen at 1 opening: an editor opened (2
openings) and then an elision selected at 2 gives Elisions when shown
again (`toggled` at 2 keeps the tab: the choice came after the editor);
an elision selected at 1 and then an editor opened gives the level tab
when shown at 2. In the drawer, told
of every change of the selection as the editor tells it: open, with
Properties chosen, `elision_5` selected shows Elisions with the form's
block expanded (`aria-expanded` "true"); Properties chosen then stays;
`elision_3` selected shows Elisions again; nothing selected leaves
Elisions (no form block); both elisions selected leave it; with Journal
chosen, an elision with `score` and then `score` alone leave Journal.
Closed, with Journal chosen, `elision_5` selected leaves the drawer
closed (no tab list rendered); `score` then selected, the drawer opened
shows Elisions. On `group_grandchild`, whose ancestor card of `score`
draws `score`'s automatic elision by default (no elision stored), the
drawer open with Properties chosen: `{id: score, part: [elision]}`
selected shows Elisions with the form's block expanded.

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
   Mixed"). The Group and Timeline panels hold the title line and nothing
   else; the Arranger panel holds it and the Arrangement area (two
   elements), the Bundle panel it, the Arrangement area and the Manifest
   file area (three), as "The level tab's settings" derives.
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
5. **The keys** move over the eight tabs, wrapping, at the top level and in
   an editor, the focus with the selection; the block's fields follow the
   editing level as in "The Properties form".
6. **The Manifest panel**, with `bare` and `styled__score`: it opens on
   YAML, chosen, and before its codec is loaded shows "Loading YAML…" and
   no text area, then the YAML text; the cases that type JSON choose it
   first; while the text holds an edit the format radios and both
   options are disabled and "Apply or Revert to switch" is shown and named
   by their `aria-describedby`; Ctrl+Enter applies; an external `set` under
   an edit shows "The manifest changed; Revert to see it" and Revert the
   newer text; a refusal lists its code, message and pointer, code and
   pointer each in a `code` element. The panel's controls follow one
   another in reading order: the radios (YAML, JSON, TOML), Include styling, Minimal, the text
   area "Manifest (YAML)", Apply, Revert, the problem list, the warning
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
   list "Warnings"; `context_absent` is never listed, since warnings are
   read with the full `@context` added where a manifest leaves core, as a
   file writes it, and a case left with nothing shows no list. No problem is listed, and an applied edit keeps the warnings.
   `bare` shows no warning list.
10. **The Properties panel** commits on Enter (the block's `x` to 25 is one
   `set` of `x`), steps from the stored value, never the shown one (10.123
   shown as 10.12 steps to 11.123 and back), steps a draft instead when
   there is one, and shows a gesture's values without replacing a draft.

**The Journal panel** lists the rows of "Words" in an ordered list
"Journal", each item with its time, author and text, newest first; an
undone item carries `data-undone` and a hidden word "undone" and is
shown muted (time, author and sentence `rgb(89, 89, 89)`) with its
sentence struck through (`line-through`), none of them faded (no opacity
below 1), so the undone state is told by more than colour; a new change
clears it (the sentence in its own colour, not struck); the earlier
session's items `data-earlier`; an item stays the same element when rows
are added around it; an empty level reads "No changes yet."; a session row
has a disclosure button labelled by its text that lists its changes,
newest first (one undo greys a session's whole run: "Edited bundle Mixed (3
changes, 2 undone)"), and nothing of the expansion reaches the store.

## The level tab's settings (`level-panel.test.ts`)

The level tab's panel (`LevelPanel`) holds the settings of the level
shown. Two controls stand on each setting and neither holds a copy of it:
the arrangement is the canvas's Arrange menu itself (the arranger's
`ArrangeMenu` over `arrangeMenuOf`, whose own tests are the arranger's,
"The Arrange menu's model"), and the manifest file's switches are the
Manifest tab's own component (`ManifestFileSwitches`). So what proves the
panel is that each control shows the stored value it is mounted over, a
press changes exactly that stored value (read back from the store, never
from the control), and a change made elsewhere (a command dispatched or
undone, a `configure`) shows at once. The panel is mounted alone over a
real store (`storeOf`), its editors opened through the store.

1. **Arranger** (no editor; `bare` and `bundles/bundle_arranged_roots`,
   two blocks): the title line, then the area "Arrangement" holding the
   toolbar "Arrange the blocks" of Free, Vertical, Horizontal and Matrix,
   Free pressed, no columns and no reason; no "Manifest file" area. Vertical
   pressed stores `{direction: "vertical"}` as one journalled `set` of `{}`
   (the journal one entry longer) and shows Vertical pressed; Matrix stores
   `{direction: "matrix", columns: 2}` (⌈√2⌉) and shows "Columns 2"; More
   columns stores 3 and shows "Columns 3"; the store's undo shows "Columns
   2" again, Matrix still pressed; a press of the pressed Matrix stores
   nothing (the journal keeps its length); Free deletes the arrangement.
2. **Bundle** (the bundle editor of `bundles/bundle_arranged_conflict`, its
   items' stretches overlapping): the title line, the area "Arrangement"
   holding the toolbar "Arrange the items" of Free, Vertical and Horizontal,
   Horizontal disabled with the reason `Horizontal: "Theme A" and "Theme B"
   overlap on "Score" (8–16 ♩)` (core's), then the area "Manifest file"
   with Include styling and Minimal, both checked: a block no file wrote is
   written minimal with its styling. Vertical pressed adds one entry to the
   editor's session and gives the block `{direction: "vertical", order:
   [group_1, group_2]}` (its items in drawing order); unticking Minimal
   gives the block's manifest file `{minimal: false, styling: true,
   serialization: "yaml"}` and leaves the session and the journal as they
   were (settings are never journalled, so no undo touches them); a
   `configure` ticking it again shows it ticked. While the Manifest tab's
   text holds an edit (its `ManifestText` with a typed text), both switches
   are disabled and described by "Apply or Revert the Manifest tab's text to
   switch".
3. **Group and Timeline**: in the group editor of `group_1` and the
   timeline editor of `score` of `bundle_mixed` the panel holds the title
   line alone.
4. **The canvas lock.** The panel's arrangement follows the canvas's lock,
   as the canvas's Arrange menu does: one setting, two controls, one rule.
   Mounted with `locked` true over `bundles/bundle_arranged_roots` with
   Matrix stored, every button of the toolbar "Arrange the blocks" and both
   column buttons are disabled; a click on Vertical stores nothing (the
   journal keeps its length, the arrangement stays matrix). Mounted with
   `locked` false over the same store, the four buttons and More columns are
   enabled (Fewer too: two columns). That the editor hands the canvas's
   lock to the panel is proven end to end (`e2e/level-tab.spec.ts`).
5. **A refused choice is a message.** The panel shows no refusal of its
   own: a choice the store refuses is posted as information through the
   editor's one `post` (ADR 0037), as the canvas's Arrange menu's refusals
   are. Proven by mounting the Arranger tab with the message context
   (`posting`) over a store whose `dispatch` answers every command with
   the refusal `{code: "invalid_value", message: "Refused here.", path:
   []}`: pressing Vertical posts exactly `[["info", "Refused here."]]`
   (nothing as a warning or an error), the panel holds no
   `role=status` element and no text "Refused here.", and pressing Matrix
   then posts the second refusal beside the first. Mounted without the
   message context the panel throws "no component above this one provides
   post".

## The Timestamp tab (`timestamp.test.ts`, `shell.test.ts`)

The Timestamp tab is always present. While a timestamp is shown its
first area is the **name header** (`data-testid="timestamp-name"`, no
heading: the field "Name", its label bold), and below it three areas, one
below the other, each a `section` named by its heading: **Coordinates** (a
bordered panel), **Properties** (a key/value grid, present only while a
timestamp is shown) and **Coordinate granularity** (the workspace's two
settings on one line at the pane's bottom). Each area is a component of its
own under `src/inspector/stamps/`; the name header and the Coordinates are
the Matchstamp tab's too (one component each). A timestamp's rows, values, copy texts, the
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
`length` (`timestamp_10`); bundle_mixed holds ten timestamps. `score` is a
member of `group_1` "Performance" with `performance` (12.5 seconds, float,
`cmap_3` ×44100 to samples), whose card below `score`'s spans the same
width. An unnamed pin is the arranger's `timelinePin` of `score`, read as a
click on its line on the arranger reads it: by its group, so `performance`
is read with it at the position × 12.5/12 (its drawn length over
`score`'s). Unnamed at 16/5 its rows are Score `cmap_2` `1.6` s, `cmap_1`
`1536` ticks, `16/5` ♩ (both maps drawn above `score`'s line, the first in
the manifest nearest it), then Performance `cmap_3` `147000` smp and
`3.3333333333333335` s (16/5 × 12.5/12 = 10/3, the nearest double; × 44100
on the samples axis, an int). **The example workspace "Timestamps"**
(the file the Examples menu opens, block `timestamps`): `score` (16
quarters, fraction) with `bars` (×1/4 to whole notes, fraction), `tempo`
(×1/2 to seconds, float), `ticks` (×480, int), in this canonical order,
the children `phrase` (offset
4, length 6, its map `phrase_ticks`) and `coda` (offset 12, length 4); the
named `Theme` (`timestamp_5`, at 4, the default display), `Climax`
(`timestamp_6`, at 21/2, all five words), `Silent` (`timestamp_7`, at 14,
none). Theme crosses `score` and `phrase` at its start, listed top to
bottom as their lines lie (`phrase`'s above `score`'s, in its children
band), each timeline's rows top to bottom as drawn (its maps' band above
its line, the first map nearest the line): Phrase ticks `0`, Phrase `0` ♩;
Ticks `1920`, Tempo `2.0` s, Bars `1`, Score `4` ♩. **The primary
coordinate** is set apart as the coordinate flag sets it apart: exactly
one group, the timestamp's own timeline's (its pin's anchor), is marked
(`tbody[data-primary]`, barred on its left) and in it exactly its
coordinate row (`tr.primary`, bold), never a map row: Score's
"coordinate" for Theme (not Phrase's, which the line crosses too), and
Score's for the unnamed pin on `score` at 16/5 read with its group (not
Performance's, a member the group reads). What would be wrong: no row
or several set apart, or the group's other member set apart. **The end
of `annotations`** of `bundle_mixed` (12 quarters, in no group), given by
commands a MeasureMap `measures` and maps that give no value there (the
PiecewiseMap "Tempo", breaks 0, 4, 12, at its last break), need a
MeasureMap's rows (the MeasureNumberMap `bars`, read without a server) or
name their outputs (the CombinationMap "Both", ×1/2 to seconds and ×480 to
ticks, which no position solves), pinned as a click on its line reads it.
Its rows lie top to bottom as the maps' slots lie above the line (drawing
specification, Conversion maps: keys by name, "Both" then "Tempo", the
unnamed `bars` last, slot 1 nearest the line): `bars` "needs a server to
expand its measure map", Tempo "no value here", Both · seconds `6.0`, Both ·
ticks `5760`, coordinate `12` ♩.

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
   in the Coordinates area, no name header, no Properties area and no
   table. With
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
   **Selecting a timeline's start or end mark pins that position**:
   selecting exactly `{block, id: T, part: ["start"]}` or `["end"]` (a
   member's marks on its ancestor lines, a segment's boundary) opens the
   drawer on Timestamp with an unnamed pin of `T` at its zero or at its
   length, read as any position on `T` is (the arranger's `timelinePin`),
   no name given, and by the group exactly where a fresh reading there
   reads one (core's `groupstampByDefault`: on a group member above a
   timeline editor), so the pin never depends on which editors were open
   before. In `groups/group_parent_both` (`middle`, offset 4, length 8, in
   `piece` of 16, a member of `group_1` with `recording`, 10.0 seconds), on
   the arranger the start of `middle` shows the groups Middle [coordinate
   `0` ♩], Piece [coordinate `4` ♩], Recording [coordinate `0.0` s], top
   to bottom as `middle`'s line lies above `piece`'s ancestor line (the
   default band order puts `piece`'s children above its line, so its
   line lies below the member) and `recording`'s card below `middle`'s,
   `shownPin()` the arranger's `timelinePin` of `middle` at 0 read by the
   group; its end Middle `8` ♩, Piece `12` ♩, Recording `10.0` s. With
   `middle`'s own timeline editor open its start shows Middle and Piece
   alone, `shownPin()` that pin read
   without the group, as a reading in that editor reads it. Selecting the
   block afterwards keeps that pin, as any unnamed pin is kept. What would
   be wrong: the start of a member pinned without its group on the
   arranger, which it gained only once an editor raising a card opened. The end of `unknown_length`'s root `score` (length not
   known), a mark's label (`["start", "label"]`) and two addresses pin
   nothing: the tab stays as it was.
   **The tab reads the lines the canvas shows**: a named timestamp is
   read on the line of its first place under the innermost open editor
   (the arranger's `namedPin` with `raisedRoot` of its block and that
   editor), the one place rule the canvas's marks and Show matches read.
   In `groups/group_parent_both` a named timestamp `At 8` on `piece` at 8
   quarters lies, on the arranger, on `piece`'s ancestor line in
   `middle`'s card (`piece`'s ancestor card is covered there by
   `group_1`'s frame): Middle [`4` ♩], Piece [`8` ♩], top to bottom as
   `middle`'s line (47.20703125, its pin's member ordinate) lies above that
   ancestor line (85.18359375). With `piece`'s timeline editor open
   (`store.open`), its ancestor card is raised over the frame and the
   timestamp lies on the card's line, where the card draws `middle`'s row
   (51.20703125, the ordinate read) above `piece`'s line: Middle [`4` ♩],
   Piece [`8` ♩]. Closing the editor gives the arranger's reading back,
   `middle` at 47.20703125. Both drawings list the rows in one order
   (the member's card puts the ancestor line where the ancestor's own
   drawing puts it), so the pin's ordinate of `middle` tells them apart.
   What would be wrong: the tab reading the covered card's line on the
   arranger, or the ancestor line the raised card hides while the editor
   is open.
   **A pin keeps the line it was read on** (the canvas hands the line
   over with the pin, `pinTimestamp(pin, line)`), and so does the
   timestamp named from it, while that line is a place of its position;
   a timestamp selected otherwise is read at its first place (a
   selection names addresses, never the line a wedge was pressed on). In
   `bundles/bundle_shared_parent` with nothing open, in the Full view
   (`support.ts` `withFullCards`, the workspace rule `{"select":
   {"element": "elision"}, "set": {"display": "none"}}`: the defaults
   elide `score`'s ancestor cards, and the subject here is the line read,
   not the elision, so the cards are drawn whole and the values derived on
   them stand), a pin of `score` at
   9 read on the line of `score`'s card behind `group_2`'s frame, left of
   that frame (the second of its places; the first is `score`'s ancestor
   line in `exposition`'s card, which the arranger's README lists in "A
   reading belongs to the line it was read on") shows Exposition
   [`cmap_2` `4320` ticks, `9` ♩], Second theme [`cmap_3` `1.5` s, `3`
   ♩], Score [`cmap_1` `4320` ticks, `9` ♩], the card's line drawing
   `score`'s map `cmap_1`; naming it "Nine" shows the same groups, and
   selecting it again while shown keeps them; selected afresh (the block
   first, then it) it is read on the ancestor line, which draws no map:
   Score [`9` ♩] after the same two groups. What would be wrong: the tab
   of the named timestamp built from the first place's line while the
   flag showed the second's rows. (With the ancestor rows below the member
   a raised card covers every ancestor line of the member's card, so no
   ancestor line is a second place beside a raised card any more.)
   **The editor hands the line over** (`shell.test.ts`, the whole page
   with its canvas): in the same workspace, in the Full view as above
   (one `set` of the workspace's rules after loading), the viewport at (0, 0) and
   zoom 1 and Show coordinates on, a press released on `score` 9 on that
   card's line (its abscissa and ordinate from layout's `lineAxes` and
   `abscissaOf` on the drawing, moved by the drawing's origin to the
   canvas) shows Exposition [`cmap_2` `4320`, `9`], Second theme
   [`cmap_3` `1.5`, `3`], Score [`cmap_1` `4320`, `9`]; naming it "Nine"
   stores a timestamp on `score` and shows the same groups. What would be
   wrong: the canvas's line lost between the canvas and the drawer (the
   named timestamp read at its first place: Score without `cmap_1`),
   which a callback taking the pin alone would still typecheck.
   **A held unnamed pin is read again when an editor raises or lowers a
   card**, as a fresh reading at its mark reads it under the root raised
   then: by the group exactly where naming it would store a groupstamp
   (never inside a timeline editor), so its rows, the GroupStamp toggle
   and the tab after naming agree. In `groups/group_parent_both`, a pin of
   `middle` at 4 read on its own line with nothing open (a group read, as
   on the arranger: Middle [`4` ♩], Piece [`8` ♩], Recording [`5.0` s])
   shows, once `piece`'s timeline editor is open, the pin read again at
   `middle` 4 under the raised card and without the group: Middle [`4` ♩]
   (the card's row), Piece [`8` ♩], the GroupStamp toggle not pressed; a
   new unnamed pin, read once per pin, manifest, raised root, group reading and line
   (`heldPinOf` asked twice gives the same object, so a change of the view
   elsewhere shows the same pin); after Done the pin held is shown again,
   the same object. The other way round, a pin of `middle` at 4 read on
   the raised card's row of `middle` with `piece`'s editor open (no group:
   Middle [`4` ♩], Piece [`8` ♩], the toggle not pressed) is read again
   after Done on `middle`'s own line, by the group: Middle [`4` ♩], Piece
   [`8` ♩], Recording [`5.0` s], a new pin, the toggle pressed. **A held
   pin read with its group is read again without it inside the member's
   own timeline editor**, which raises no card: the pin of `middle` at 4
   read on its own line with nothing open (Middle, Piece, Recording, the
   toggle pressed) shows, once `middle`'s timeline editor is open, exactly
   the arranger's `timelinePin` of `middle` at 4 on that line without the
   group (Middle [`4` ♩], Piece [`8` ♩], the toggle not pressed), and after
   Done the pin held again, the same object. What would be wrong: rows
   that no fresh reading at the mark gives and that naming the pin does
   not store (the group read kept in a timeline editor, the member's own
   included, or left out after it), or the rows read before while the
   canvas marks the pin on the card's row.
3. **Coordinates, Editor** (the default). One `tbody` per timeline crossed,
   in core's order, headed by its name; its rows in core's order too, top
   to bottom as drawn: the row "coordinate" at its line and one row per map
   labelled by its name, else its ID, at its drawing (a map drawn above the
   line before "coordinate", one drawn below after it; a timeline drawn
   nowhere lists "coordinate", then its maps). A number is a text field
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
   without a unit (the CombinationMap's outputs `Both · seconds`, 6.0, and
   `Both · ticks`, 5760) has neither a `value + unit` button nor a `pretty`
   one, whose text would be the value's again, only the value's button,
   writing `6.0` and `5760`; their cells stay, empty. A missing value has
   none.
6. **The format switch** is one component in both tabs: a radio group of
   segments, "Manifest format" with YAML, JSON, TOML, YAML chosen first, and "Timestamp
   format" with Editor, YAML, JSON, TOML, Editor chosen first. JSON, YAML and TOML show core's
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
   depth; JSON and YAML keep the null. The named timestamp's members are
   its complete form, so every text states `matchstamp` (`false` for these
   timestamps, which no MatchStamp names) beside `display`. The editor's own rule is proven on
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
7. **The name header and Properties.** The name header holds "Name" (a
   text field labelled by it); Properties is a two-column grid of keys and
   controls: "Display" (a group of five toggle buttons Wedge, Name, ID,
   Coordinate, Line, in that order, each `aria-pressed` by whether its word
   is in the timestamp's `display`; Line is the word `cross_section`, whose
   stored key is unchanged), on a group member "Group" (one toggle
   GroupStamp, item 7a), and Delete.
   - *Unnamed.* The name field is empty and enabled, with the placeholder
     "Type a name to keep it" (hidden by the panel's style while the field
     has focus) and described by the hint under it in the name header; the
     toggles show the default (Wedge, Name, Line pressed) and, with Delete,
     are disabled and the Properties area greyed (class `unnamed`), each
     described by the hint "Naming the timestamp stores it; then its
     display can be set and it can be deleted."; a click on them journals
     nothing. The Coordinates stay editable and copyable: an unnamed pin is
     moved by them before it is named. Typing "Upbeat" and Enter on the
     unnamed pin at 16/5 journals exactly `{type: "add", into: {block:
     "0000000000", id: "score"}, timestamp: {name: "Upbeat", coordinate:
     [16, 5], groupstamp: true}}` (`score` is a member of the group
     Performance and no editor is open, item 7a); the pane then shows the named `timestamp_11` (the
     smallest free ID): Name "Upbeat", the toggles and Delete enabled,
     `shownPin().named.id` `timestamp_11`. An emptied name journals
     nothing.
   - *Named.* Theme shows Name "Theme" and no placeholder; "Subject" and Enter journals
     `{type: "set", changes: [{target: {block: "timestamps", id:
     "timestamp_5"}, values: {name: "Subject"}}]}`; an emptied name and
     Enter journals nothing, shows "Theme" again and, at the field, "A
     named timestamp keeps a name; Delete removes it."; leaving the field
     unchanged journals nothing.
   - *Display.* Pressed: Theme Wedge, Name, Line; Climax all five;
     Silent none. A toggle sends one `set` of `display` on the timestamp,
     the words in canonical order: ID on Theme `["wedge", "name", "id",
     "cross_section"]`, Wedge on Theme `["name", "cross_section"]`,
     Coordinate on Silent `["coordinate"]`, Line on Climax
     `["wedge", "name", "id", "coordinate"]`; each shows pressed as stored
     afterwards. The toggles are buttons, reached with Tab and pressed with
     Enter or Space.
   - *Delete* journals `{type: "remove", targets: [{block: "timestamps",
     id: "timestamp_5"}]}`; the pane then shows the hint and no Properties.
7a. **GroupStamp.** The toggle is offered exactly where core's
   `isGroupMember` holds for the timestamp's timeline, a match timestamp's
   included; whether it is pressed, and what naming stores, is
   core's `groupstampByDefault` for an unnamed timestamp (the innermost
   editor open, `null` for none) and the stored `groupstamp` for a named
   one. Specimens: `bundle_mixed`'s `score`, a member of the group
   `group_1` "Performance" alone; the example "Timestamps", which holds no
   group; the table fixture (MatchClaims below) with a group {`clt_1`,
   `cpt_1`} added by one `add {into: {block}, group}`.
   - *Unnamed, no editor open.* The unnamed pin on `score` at 16/5 shows
     "Group" with GroupStamp pressed and disabled, described by "A
     GroupStamp's line crosses every member of 'Performance'." and by the
     naming hint; naming it journals `groupstamp: true` (item 7).
   - *Unnamed, in a timeline editor of `score`.* GroupStamp is shown not
     pressed; "Upbeat" journals exactly `{type: "add", into: {block:
     "0000000000", id: "score"}, timestamp: {name: "Upbeat", coordinate:
     [16, 5]}}`, no `groupstamp` (the command's default, `false`).
   - *Named.* The named `timestamp_11` (stored a groupstamp) shows
     GroupStamp pressed and enabled; a press journals exactly `{type:
     "set", changes: [{target: {block: "0000000000", id: "timestamp_11"},
     values: {groupstamp: false}}]}` and shows it not pressed, a second
     press `groupstamp: true`.
   - *A member's descendant.* On `bundle_mixed` with the child
     `second-half` "Second half" (4 quarters at offset 4) added to
     `score`, a member of `group_1` "Performance", by one `add {into:
     score, child}`, and the timestamp "Bar 4" added at 2 on `second-half`
     by one `add {into: second-half, timestamp}` (an ordinary timestamp:
     no `groupstamp` given): selected, it shows GroupStamp not pressed and
     enabled, described by "A GroupStamp's line crosses every member of
     'Performance'." (core's `groupsHolding`: a group holds a timeline when
     it or one of its ancestors is a member, so the group is named
     although `second-half` itself is listed in no group).
   - *Not offered.* Theme of the example ("Timestamps" holds no group)
     shows no "Group" key and no GroupStamp toggle.
   - *A match timestamp.* The match timestamp `timestamp_1` on `clt_1` of
     the MatchStamp "Downbeat" named after the group was added (a member,
     so naming stored it a GroupStamp) shows "Group" with GroupStamp
     pressed and enabled, described by "A GroupStamp's line crosses every
     member of 'group_1'." (the group has no name); a press journals
     exactly `{type: "set", changes: [{target: {block, id:
     "timestamp_1"}, values: {groupstamp: false}}]}`.
7b. **The wedge's rotation** (key "Wedge", right after Display). What
   proves it: the value shown is the rotation the drawing gives the
   timestamp's wedge (layout's cascade, read off the block's drawing, not
   recomputed), so a rule reaching the wedge by any selector shows; each
   gesture sends exactly one `style` of one rule addressed to that wedge
   alone, `{type: "style", select: {element: "wedge", addresses: [{id:
   X}]}, set: {rotation: v}, blocks: [block]}`, and Default the same with
   `rotation: null`, which leaves the manifest's rules as they were before
   the first rotation (the rule removed when nothing else is left in it,
   core's `style`). A drag journals nothing until the slider changes. The
   control is a native range input (role `slider`, min −180, max 180, step
   1, its name "Wedge rotation", `aria-valuetext` "<n> degrees" with a
   minus sign U+2212 for a negative value), its value shown beside it as
   "<n>°", and seven stop buttons −180, −135, −45, 0, 45, 135, 180, each
   named "<n> degrees" and pressed exactly while the value is its stop.
   Disabled, the slider is faded (opacity 0.5) but the value beside it is
   text, not a control: it is muted (`rgb(89, 89, 89)`) and faded by no
   opacity; enabled, it keeps its own colour, unfaded. Specimens: the example "Timestamps" (no rule sets a rotation; Theme
   `timestamp_5` displays its wedge, Silent `timestamp_7` displays
   nothing); `bundle_mixed`'s `score`, a member of "Performance" (item
   7a).
   - *Theme, unrotated.* Value 0, "0 degrees", "0°"; the stop 0 pressed,
     no other; no Default; enabled. The stop −135 journals the rotation
     −135 and then shows −135, the stop −135 pressed and Default. PageUp
     on the slider journals −45 (the next stop above −135), PageDown then
     −135 (the next below). A drag: the input's value set to 42 with an
     `input` event shows "42°" and journals nothing; its `change` journals
     42. PageUp at 180 journals nothing (no stop above). Default journals
     `rotation: null`; the manifest's `graphical.rules` then equal the
     rules before the first rotation, the value is 0 and Default is gone.
   - *A drag shown live.* The drawer is mounted under a context
     recording what it hands the canvas (`transient.ts`, the editor's
     `Canvas` `transient`); what proves a drag is shown and stored once:
     every step hands the canvas the very `style` the release journals, at
     the step's value and for the timestamp's block, and the store
     journals exactly one entry per drag, whichever of the release and
     `change` comes first. On Theme (0): a press on the slider, `input` at
     30 and at 31 hand `{block: "timestamps", command: <the style at
     30>}` and then 31, the value shown "31°" and nothing journalled; an
     `input` at 31 again hands nothing more; an `input` at 0 (the stored
     value) hands `null`; an `input` at 42 hands 42; its `change` hands
     `null` and journals 42; the release that follows journals nothing
     more. A second drag to 50 released before its `change`: the release
     journals 50 and hands `null`; an `input` at 55 and a `change` after
     the release (Firefox ends a native range drag on the release by
     setting the value at the pointer and firing both) hand and journal
     nothing, the slider staying "50", "50°".
     *Escape.* Theme turned 45 by its stop, a drag to 60, then Escape on
     the slider: it hands `null`, prevents the key's default, and the
     slider shows the stored 45 again (value "45", "45°"); a further
     `input` at 70 in that drag hands nothing and leaves the slider at
     "45"; the release and a `change` journal nothing, nor do an `input`
     at 75 and a `change` coming after the release (Firefox ends a native
     range drag on the release by setting the value at the pointer and
     firing both): the slider stays "45", "45°", nothing handed; PageUp
     then commits 135, the next stop, so the ended drag holds no key back,
     and a new drag to 100 is shown and released as one entry. *A
     cancelled pointer.* Theme turned 45, a drag to 80 ended by a
     `pointercancel` on the window: it hands `null`, shows 45, and an
     `input` at 85 and a `change` after it hand and journal nothing. *Removed mid-drag.* A drag to 90,
     then the drawer unmounted: the last thing handed is `null`. Escape
     with no drag under way is left to the page (not prevented).
   - *A rule by another selector.* `{type: "style", select: {element:
     "wedge", within: "score"}, set: {rotation: 90}, blocks:
     ["timestamps"]}` (every wedge of `score`) makes Theme show 90, the
     stop buttons none pressed, and no Default (no rule addressed to the
     wedge alone states it).
   - *Wedge not displayed.* Silent shows 0, the slider, the stops and
     Default disabled, described by "Turn the Wedge on to rotate it.".
     Theme rotated to 45 and its Wedge toggled off keeps 45 (the stated
     value, its wedge not drawn), disabled, Default shown and disabled.
   - *Unnamed.* The unnamed pin on `score` at 16/5 (naming would store a
     groupstamp, item 7a) shows 0, "0 degrees", disabled, described by
     the naming hint alone: a groupstamp's wedge marks its primary
     coordinate and stands at 0 like any timestamp's (drawing
     specification section 4; only a secondary coordinate's wedge turns
     −45), so no hint names another initial value.
   - *Named groupstamp.* Named "Upbeat" (`timestamp_11`, a groupstamp
     displaying its wedge): 0 read from the drawing, no Default,
     enabled. The stop 45 journals `rotation: 45` on `timestamp_11` and
     shows 45 with Default; Default journals `rotation: null` and shows 0
     again.
   - *In a timeline editor.* With the timeline editor of `score` open in
     the example, the stop 45 on Theme is accepted and the editor's
     session holds the `style` as its last entry (the rule is addressed to
     an element of the edited timeline).
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
   MeasureMaps) becomes `unsupported`; a request no server answered
   (code `unreachable`, or a proxy's 502 or 504, as the development
   server's proxy answers while no server runs behind it) becomes
   `unreachable`; any other failure (a 500, a 422, an error that is no
   `ServerError`) stays a rejection with the same error.
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
    shown pin equals, part for part, the arranger's `namedPin` read with
    those rows. An unnamed pin there, the arranger's `timelinePin` of
    `score` at 6 read with the same rows as a click on the arranger reads
    it (by the group `Edition`), shows the same rows and below them MIDI's,
    read with the same rows: `cmap_3` (`ppq` then the MeasureMap) `2` and
    coordinate `2880` ticks (6 × 7680/16, `midi`'s 7680 ticks drawn as
    `score`'s 16 quarters). Without
    `knotsOf` the row reads "needs a server to expand its measure map".
    The drawer gives the same `knotsOf` to the Matchstamp tab, whose
    Coordinates read their conversion-map rows with it: the MatchStamp
    "Bar two" named by one `add {into: {block}, matchstamp: {name: "Bar
    two", anchors: [[{timeline: "score", coordinate: [6, 1]}, {timeline:
    "midi", coordinate: 2880}]], match_claims: ["claim_1"]}}` and selected
    shows the row `cmap_1` of `score` and the row `cmap_3` of `midi` (2880
    ticks = 6 quarters through its `ppq`) as "waiting for the server"
    while `knotsOf` answers `pending`, then both "2" once it answers the
    rows; without `knotsOf` both read "needs a server to expand its
    measure map".
11. **The inspector's top stays put.** The editing bar and the tab list lie
    outside the element that scrolls the panels (`.panels`), so they never
    scroll; in the Timestamp and the Matchstamp tab the name header is the
    first element of the pane, before Coordinates. That it stays visible
    while the pane scrolls (`position: sticky`, `top: 0`) and that its
    label is bold (`font-weight` 700) is a matter of computed style, which
    jsdom does not compute: the end-to-end spec `coordinates.spec.ts`
    proves it in the browser (e2e README, "Show coordinates").

## How IRIs are shown (`iris.test.ts`)

Wherever the editor shows an IRI it shows a slug, `prefix:local`, as it
shows every other ID, and keeps the full IRI for the hover (the title) and
for copies; an IRI it knows nothing of is shown as written. What it knows
is the schema package's: the shipped catalogue's identifier systems
(`recognize` over each thing's URL patterns, the thing's `prefix`), the
catalogue's namespaces and aliases (`compactIri`) and the namespaces a
manifest's `@context` declares; the editor adds one table, the slug word of
a system whose things have no prefix (`mbid` for MusicBrainz, whose
identifiers are MBIDs), and otherwise writes the system's catalogue ID. So
the oracles are the catalogue's patterns and prefixes and the IRIs below,
each written in the test; `shownIri(names, written)` with `names` =
`iriNames(defaultCatalogue(), C)`, `C` = `{ex: "https://example.org/",
tilie: USER_TAG}`, gives `{text, iri}`:

1. **A thing of a system.**
   `http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96` →
   `mbid:8d331505-4d88-39ae-81c7-bec5da77af96`, and so does its `https:`
   form with `www.`, each carrying its own IRI as written;
   `https://musicbrainz.org/recording/7A0C7C3B-…` → `mbid:` with the value
   lowered (the thing writes it lower case); `http://www.wikidata.org/entity/Q235650`
   and the page `https://www.wikidata.org/wiki/Q235650` → `wd:Q235650`
   (the thing's prefix); `https://d-nb.info/gnd/124927521` →
   `gnd:124927521`; `https://www.youtube.com/watch?v=Ch2mrPm1JnM` →
   `youtube:Ch2mrPm1JnM` (the system's ID); `https://doi.org/10.1000/182`
   → `doi:10.1000/182`.
2. **A namespace.** `http://schema.org/VideoObject` and, through the
   catalogue's alias, `https://schema.org/VideoObject` →
   `schema:VideoObject`; `https://example.org/thing` → `ex:thing` (the
   context's namespace); `https://example.org/people/editor` as written
   with no IRI (a rest holding `/` is no local name).
3. **As written.** A compact IRI keeps its text and carries the IRI it
   stands for: `wd:Q1` → `{wd:Q1, http://www.wikidata.org/entity/Q1}`,
   `ex:sources/a` → `{ex:sources/a, https://example.org/sources/a}`. An
   IRI nothing knows (`https://example.com/a`, `urn:isbn:0451450523`), a
   name ("Clair de lune") and a reference within the manifest (`#clt_6`)
   are shown as written with no IRI.
4. **The namespaces.** `prefixesOf(catalogue, C)` is the catalogue's
   prefixes with `ex` added; `tilie` (a namespace ending in neither `/`
   nor `#`) and a key beginning with `@` are left out, and a context
   prefix overrides the catalogue's of the same name.

## A provenance entry (`provenance.test.ts`, `matchstamps.test.ts`)

One data shape and one component show a provenance entry in both tabs, a
Metadata pair's and a MatchClaim's: `lineOf` reads an entry into an
`EntryLine`, `paradataRows` lists its paradata, `Provenance` shows it
behind a Provenance button (the panel tests of both tabs read it). The
oracles are the entries written in the test.

1. **Who.** `whoOf`: `G` → "Gerhardt"; `https://orcid.org/0000-0002-1825-0097`
   → its iD; `…:user:Clara%20Wieck` → "Clara Wieck"; `TILIE` → "TiLiE";
   any other IRI as written, or, given names, as shown
   (`http://www.wikidata.org/entity/Q1` → `wd:Q1`).
2. **An entry** (`lineOf`) reads every actor and every IRI of `stated_by`
   as the IRI it stands for under the manifest's context (core's
   `actorIri`, as the belief filter does), the service and the basis as
   shown. The entry `stated_by` [`ex:people/editor`, `tilie:Gerhardt`],
   date 2026-11-18, method `manual`, service
   `http://www.wikidata.org/entity/Q2`, basis [`ex:sources/a`,
   `http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96`],
   beliefs `tilie:Gerhardt` true (2026-11-19) and `ex:people/editor`
   unlikely (2026-11-18, note "check"), under the names of `C` for the
   user Gerhardt (no ORCID): `statedBy` [{`P`, no IRI}, {"Gerhardt",
   `G`}]; service {`wd:Q2`, its IRI}; basis [{`ex:sources/a`,
   `https://example.org/sources/a`}, {`mbid:8d331505-…`, its IRI}];
   beliefs `[actor as written, iri, who, belief]` [`tilie:Gerhardt`, `G`,
   "Gerhardt", true], [`ex:people/editor`, `P`, `P`, unlikely];
   `beliefOf` `"true"`. Without a context the actors are the texts as
   written and `beliefOf` is `null`.
3. **Paradata.** `paradataRows` lists `{key, label, items}` in the one
   order and words of both tabs: statedBy "stated by", method "method",
   service "service", basis "basis", match "match", note "note", date
   "date", only those the entry states, each item as its line holds it (a
   word with no IRI): here stated by (two items), method, service, basis
   (two items), date; an empty entry none.
4. **A MatchClaim's entry** (`claimEntryLine`, in `matchstamps.test.ts`
   on its MatchClaim table; the shipped catalogue and the manifest's
   context): `null` for an entry the table does not state;
   while unread, the table's beliefs (`claim.beliefs`) and no paradata;
   once read (`stated_by` the user, 2026-11-20, `imported`, the service
   `https://example.org/aligner`, the other actor believing it true on
   2026-11-21 with the note "seen in the score"), the entry's line:
   `statedBy` the user's name with the user's IRI, the service as written
   with no IRI, the belief with its date and note.

## MatchClaims and the Matchstamp tab (`matchstamps.test.ts`, `matchstamp-panel.test.ts`, `matchclaims-loading.test.ts`, `matchclaim-beliefs.test.ts`, `tables-dialog.test.ts`)

The anchor index, the belief mask, the comparison of a named MatchStamp
with the table and every MatchStamp command are core's, the answer's
decoding the client's; the tests read them from their owner and prove what
the editor adds: which index it builds for which filter, the order it puts
coordinates and anchors in, what it shows and in which words, the commands
it sends, and how a table reaches a block. The table is built with core's
`matchClaimColumns` over the manifest of TimeToShare's table fixture
(`fixtures/tables/<version>/manifest.yaml`: roots `clt_1` (quarters,
fraction, child `clt_2`), `cpt_1` (seconds, float), `dpt_1` (samples,
int), no `graphical`), its timelines numbered by ID (`clt_1` 0, `clt_2` 1,
`cpt_1` 2, `dpt_1` 3), five instant MatchClaims:

| Claim | A | B | Beliefs |
|---|---|---|---|
| `claim_1` | `clt_1` 0 | `dpt_1` 0 | none |
| `claim_2` | `clt_1` 0 | `cpt_1` 0.0 | none |
| `claim_3` | `clt_1` 4 | `dpt_1` 176400 | the user `false` |
| `claim_4` | `clt_1` 4 | `dpt_1` 176400 | another actor `true` |
| `claim_5` | `cpt_1` 8.0 | `dpt_1` 352800 | the user `true` |

The user is the default user (`statedBy(DEFAULT_USER)`), the other actor
`tag:example.org,2026:other`.

1. **The indexes.** Under the default filter (every timeline, the belief
   states true, undecided and unlikely: everything the user does not
   believe false) the compared and the shown index are one object, with 4
   unique anchors (`claim_3` left out, `claim_4` still stating its anchor)
   and 3 potential MatchStamps: {`clt_1` 0, `cpt_1` 0.0, `dpt_1` 0},
   {`clt_1` 4, `dpt_1` 176400}, {`cpt_1` 8.0, `dpt_1` 352800}. Under the
   states `["true"]` 1 anchor (`claim_5`'s); under `["false"]` 1 anchor
   (`claim_3`'s, `clt_1` 4 – `dpt_1` 176400); under `["undecided"]` 3
   anchors (`claim_1`'s, `claim_2`'s, `claim_4`'s); under all four states
   the 4 anchors of the default (`claim_3` and `claim_4` state one).
   The indexes carry the user's belief per row (core's `believedBy`, its
   numbers in `ANCHOR_BELIEFS`, false 0 … true 3): `[2, 2, 0, 2, 3]`, the
   same array object for every filter. With
   the timelines `[clt_1, dpt_1]` the compared index keeps 4 anchors and
   the shown one has 2 (`claim_1`'s and `claim_4`'s): the timelines narrow
   what is shown, never what a named MatchStamp is compared with. The same
   table, filter and context give the same index objects again.
2. **Screen order** is the arranger's one screen order (`screenPlace`,
   `screenOrder`, `inScreenOrder` over the block's drawing, which its own
   tests prove), the flag's too; the editor keeps no order of its own.
   The block draws `clt_1` above `cpt_1` above `dpt_1`.
   The potential MatchStamp of `clt_1` 0 lists its timestamps `clt_1` 0,
   `cpt_1` 0.0, `dpt_1` 0 and its anchors [`clt_1` 0, `cpt_1` 0.0], then
   [`clt_1` 0, `dpt_1` 0] (each anchor upper coordinate first, the anchors
   by their first, then their second coordinate), its MatchClaims
   `claim_1`, `claim_2`.
   **Its Coordinates are the Timestamp tab's** (one component): one
   `tbody` per timestamp in that order, headed by its timeline's name, its
   row "coordinate" a text field holding the exact value (`clt_1` `0`,
   `cpt_1` `0.0`, `dpt_1` `0`) with the pretty unit (`♩`, `s`, `smp`),
   **disabled** (a MatchStamp's coordinates are not edited), and the three
   Copy columns `value`, `value + unit`, `pretty` with the Timestamp tab's
   buttons and texts, copied in that order: `clt_1` `0`, `0 quarters`,
   `0 ♩`; `cpt_1` `0.0`, `0.0 seconds`, `0″`; `dpt_1` `0`, `0 samples`,
   `0 smp`. **Each timestamp's groups are exactly the Timestamp tab's for
   a timestamp at that coordinate** (core's `timestampRows` of the
   arranger's `timelinePin`, the cross-section `namedPin` reads a named
   timestamp with, so both tabs share one spec builder): the timeline's
   group, its coordinate row and the rows of the conversion maps drawn for
   it, top to bottom as drawn, then one group per ancestor, parent first, then one per timeline of
   its subtree its line crosses, with the maps drawn for each: with the
   LinearMap `rate` "Rate" (seconds → samples,
   scalar 44100, offset 0) added to `cpt_1` by one `add {into: cpt_1,
   map}`, the potential MatchStamp of `cpt_1` 8.0 shows the groups `cpt_1`
   [Rate `352800` smp, drawn above `cpt_1`'s line, disabled, copied
   `352800`, `352800 samples`, `352 800 smp` (8.0 × 44100 written on the
   samples axis, an int); coordinate `8.0` s] and `dpt_1` [coordinate `352800` smp]. **Ancestors of
   the MatchStamp's timelines are listed exactly as the Timestamp tab
   lists them** (one component, one row builder). Both cases below are
   about the timelines of a match timestamp's own subtree and ancestry:
   their match timestamps lie on members of `group_1` and are therefore
   GroupStamps when named (item 2b), so each case first turns both
   GroupStamps off through their toggles in the Lines (two journal
   entries), and the groups are read as of an ordinary timestamp. On `bundle_mixed`
   with the child `second-half` "Second half" (4 quarters at offset 4)
   added to `score` (12 quarters, maps `cmap_1`, `cmap_2`) by one `add
   {into: score, child}`, the MatchStamp "Climax" named by one `add {into:
   {block}, matchstamp: {name: "Climax", anchors: [[{timeline:
   "second-half", coordinate: [2, 1]}, {timeline: "performance",
   coordinate: 3.0}]], match_claims: ["claim_1"]}}` shows, without a
   table, the groups "Second half" [coordinate `2` ♩], "Score"
   [`cmap_2` `3.0` s, `cmap_1` `2880` ticks, coordinate `6` ♩: 2 + the
   offset 4, its maps drawn above its line in the card the coordinate's
   line crosses (6 quarters at 120 to a minute, 6 × 480 ticks), as in the
   Timestamp tab], "Performance" [`cmap_3` `132300` smp,
   3.0 × 44100, drawn above its line; coordinate `3.0` s], every field
   disabled; and the
   groups of its match timestamp on `second-half` (the first two) equal,
   heading for heading and row for row ([label, text, unit]), what the
   Timestamp tab shows for that match timestamp's own pin
   (`namedPinOf`). Before the ancestors were added the "Score" group was
   missing, and before the coordinates followed the whole card its map
   rows, which this case fails on. **Crossed descendants and hidden
   maps follow the drawing as in the Timestamp tab**: on the same manifest,
   with the conversion-maps band of `score` hidden by one `style` (`select
   {addresses: [{id: score, facet: conversion_maps}]}`, `set {display:
   none}`, block A), the MatchStamp "Turn" named by one `add` with the
   anchor [`score` `[6, 1]`, `performance` `3.0`] shows the groups "Second
   half" [coordinate `2` ♩: 6 − the offset 4, the child its line crosses,
   drawn above `score`'s line, so listed first], "Score" [coordinate `6` ♩;
   no `cmap_1`, `cmap_2` row: their band is not drawn], "Performance"
   [`cmap_3` `132300` smp; coordinate `3.0` s];
   the groups of its match timestamp on `score` (the first two) equal what
   the Timestamp tab shows for that match timestamp's own pin. A builder
   anchoring on the timeline with all its maps and its ancestors alone
   lists the two map rows and no "Second half", which this case fails on.
   The tab has no
   "Properties" heading: under the name header come the areas Coordinates,
   Lines, MatchClaims and the MatchClaim filter, each a `section` named by
   its heading. While the MatchStamp is potential (unnamed) the name field
   is described by "Naming the MatchStamp stores it; then its lines'
   display can be set." and every toggle of its lines is disabled (3
   timestamps × 5 + 2 anchors × 2 = 19).
2a. **Lines** list every dashed line of the MatchStamp in the one screen
   order (`inScreenOrder`, the arranger's, which its tests prove): each
   timestamp line at its coordinate's place, each anchor line just before
   the line of its lower coordinate (an anchor's second, its coordinates
   being in screen order), anchors meeting one coordinate by their upper
   one; so a chain alternates. The potential MatchStamp of `clt_1` 0 lists,
   as `[kind, label]`: timestamp `clt_1 0 ♩`, anchor `clt_1 – cpt_1`,
   timestamp `cpt_1 0″`, anchor `clt_1 – dpt_1`, timestamp `dpt_1 0 smp` (a
   timestamp labelled by its timeline's name and its pretty coordinate, an
   anchor by its two timelines' names, no ID while potential). A timestamp
   line carries the Timestamp tab's toggles (one component, its words
   Wedge, Name, ID, Coordinate, Line), showing what naming stores
   (TimeToShare's default of a match timestamp: Line alone pressed); an
   anchor line Line and Name, none pressed while potential. Named
   "Downbeat" (item 3) the lines are `timestamp_1`, `anchor_1`,
   `timestamp_2`, `anchor_2`, `timestamp_3`, each label followed by its ID;
   the timestamps show Line pressed alone, `anchor_1` Line and Name,
   `anchor_2` Line. Wedge on `timestamp_2`'s line journals exactly one
   `{type: "set", changes: [{target: {block, id: "timestamp_2"}, values:
   {display: ["wedge", "cross_section"]}}]}` and shows Wedge and Line
   pressed; Name on `anchor_2`'s journals the anchor's `display` `["line",
   "name"]`. **A shared match timestamp**: after a second MatchStamp
   "Other" is added by one `add {into: {block}, matchstamp: {name: "Other",
   anchors: [[clt_1 [0, 1], dpt_1 176400]], match_claims: ["claim_3"]}}`,
   which reuses `timestamp_1` (core reuses a match timestamp per timeline
   and exact value), Downbeat's `timestamp_1` line alone says "Also a line
   of MatchStamp 'Other': a change shows there too."; the other lines say
   nothing of the kind.
2b. **GroupStamps and the coordinates the MatchClaims state.** A new
   match timestamp on a timeline lying in a group is a GroupStamp (core's;
   naming closes the editors in the way, so it is the block's scope), and
   a named MatchStamp's Coordinates read each match timestamp through its
   own pin, so a GroupStamp lists the other members of its groups exactly
   as the Timestamp tab does for that timestamp. Every group of the
   Matchstamp tab's Coordinates says how its timeline takes part: its
   `tbody` carries `data-through` (`claimed`, `ancestor`, `crossed`,
   `group`), and a caption row `tr.through` under the heading says it in
   words: "stated by MatchClaims", "ancestor", "crossed by its line",
   "through group 'G'". Only the row "coordinate" of a `claimed` group is
   the value the MatchClaims state: it alone is set apart (`tr.claimed`,
   bold), its maps' rows and every other group stay plain. The Timestamp
   tab's groups carry none of this. Each timestamp line of the Lines whose
   timeline lies in a group carries the Timestamp tab's GroupStamp toggle
   in `.groupstamp`, described by the same words ("A GroupStamp's line
   crosses every member of 'G'."); a press journals the match timestamp's
   `set {groupstamp}` and nothing else. Specimen "Turn": `bundle_mixed` (its
   `group_1` "Performance" holds `score`, 12 quarters, and `performance`,
   12.5 seconds with `cmap_3` seconds → samples × 44100), the child
   "Second half" added to `score` (4 quarters at offset 4, `SECOND_HALF`),
   `score`'s conversion-maps band hidden (as in item 2), and "Turn" named
   by one `add` with the anchor [`score` `[6, 1]`, `performance` `3.0`],
   claim `claim_1`: core writes `timestamp_11` on `score` and
   `timestamp_12` on `performance`, both `groupstamp: true`.
   - *Lines*, as [label, display toggles pressed, GroupStamp pressed]:
     "Score 6 ♩ timestamp_11" [Line] pressed; the anchor "Score –
     Performance anchor_1" [Line, Name] with no GroupStamp toggle;
     "Performance 3″ timestamp_12" [Line] pressed; every toggle enabled.
   - *Coordinates with both GroupStamps on*, the coordinates in screen
     order (`score` above `performance`), each coordinate's groups top to
     bottom as core's `timestampRows` lists them, as [heading, through,
     caption, rows (label, text, disabled, unit)]. The coordinate on
     `score`, read from `timestamp_11`'s pin: "Second half" crossed [2 ♩,
     6 − its offset 4; drawn above `score`'s line]; "Score" claimed [6 ♩;
     no map row, the band is hidden]; "Performance" group "through group
     'Performance'" [`cmap_3` 275625 smp = 6.25 × 44100, drawn above its
     line; 6.25 s = 6 × 12.5/12, the members' drawn ends]. The coordinate on `performance`, read
     from `timestamp_12`'s pin: "Score" group "through group 'Performance'"
     [72/25 ♩ = 3.0 × 12/12.5; "Second half" is not listed, since 72/25
     lies before its offset 4, outside its span]; "Performance" claimed
     [`cmap_3` 132300 smp; 3.0 s]. Bold: exactly the "coordinate" rows of
     "Score" in the first and of "Performance" in the second coordinate.
   - *The toggle.* Pressing `timestamp_12`'s GroupStamp journals exactly
     `{type: "set", changes: [{target: {block, id: "timestamp_12"},
     values: {groupstamp: false}}]}`; its toggle then shows not pressed,
     and the coordinate on `performance` lists "Performance" claimed alone
     [`cmap_3` 132300 smp; 3.0 s], the first coordinate's groups unchanged.
   - *Both tabs alike.* The Timestamp tab showing `timestamp_11` lists, heading for
     heading and row for row ([label, text, unit]), the first coordinate's
     three groups.
   - *Potential.* One rule: a potential MatchStamp's timestamp line and
     its Coordinates both show the match timestamp naming will store
     there (core's `namedAsGroupstamp`): where the manifest holds a match
     timestamp on that timeline at that exact value, naming takes it and
     it keeps its own `groupstamp`; else naming adds one, a GroupStamp
     exactly where the timeline lies in a group. The toggle shows that,
     disabled until the MatchStamp is named, and the Coordinates read the
     group through the arranger's `timelinePin` exactly where it is on,
     nothing stored, so they equal the named MatchStamp's before and after
     naming. On the same manifest, unnamed, with a table of one MatchClaim
     `score` 6 – `performance` 3.0 (timelines `performance` float, `score`
     fraction), the potential MatchStamp shows both timestamp lines'
     GroupStamp pressed and disabled (naming adds two GroupStamps), and its
     Coordinates are exactly those of the named "Turn" with both
     GroupStamps on (above): "Second half" crossed, "Score" claimed,
     "Performance" through group 'Performance', then "Score" through group
     'Performance' [72/25 ♩], "Performance" claimed. Nothing is stored yet,
     and the potential overlay draws no frame line.
   - *Potential, reusing a match timestamp that is no GroupStamp.* With
     "Turn" named and `timestamp_12`'s GroupStamp turned off, a table of
     one MatchClaim `claim_2`, `score` 5 – `performance` 3.0, shows the
     potential MatchStamp whose coordinate on `performance` lies on
     `timestamp_12`: its line "Performance 3″" shows GroupStamp not
     pressed (naming takes `timestamp_12` as it is), the line "Score 5 ♩"
     pressed (naming adds a GroupStamp on `score` at 5), both disabled;
     the coordinate on `performance`, read without its group, lists
     "Performance" claimed alone [`cmap_3` 132300 smp; 3.0 s], the last
     group of the Coordinates, after the coordinate on `score`, read
     through the group: "Second half" crossed [1 ♩, 5 − its offset 4],
     "Score" claimed [5 ♩], "Performance" through group 'Performance'
     [`cmap_3` 229688 smp: the float below times 44100 is 229687.5 in
     binary64, a tie, which an int axis rounds to the even integer; 125/24
     s = 5 × 12.5/12, written as the float nearest it,
     5.208333333333333]. Naming it then stores
     `timestamp_12` unchanged (`groupstamp: false`) and a new
     `timestamp_13` on `score` at 5 with `groupstamp: true`, and the named
     MatchStamp's lines show exactly the states the potential one
     showed.
   **Screen order follows the raised card.** The tab reads every place
   it shows under the innermost open editor (the arranger's `raisedRoot`
   of the shown block and that editor, passed to `potentialStamp`,
   `namedStamp`, `stampGroups` and `stampLines`), as the canvas draws the
   matches. On `groups/group_parent_both` with a table of
   one MatchClaim `p_1`, `middle` 1 ↔ `piece` 3 (both fractions), the
   potential MatchStamp of `middle` 1: on the arranger `middle` 1 lies at
   (414.0390625, 47.20703125) and `piece` 3 on `piece`'s ancestor card
   left of the frame, at (210.33544921875, 85.18359375) (the card's line
   from 60.33544921875 at 50 per quarter; the seam at `middle`'s start
   puts what lies left of `middle`'s span outside the frame's left edge,
   drawing.md section 8.8, step 2), so the Coordinates are the groups of
   `middle` 1 (Middle [`1` ♩] at its line, 47.20703125; Piece [`5` ♩],
   its ancestor, at the ancestor line below it, 85.18359375; Recording
   [`1.25` s], through `group_1`, since naming stores a GroupStamp on a
   group member, at 122.5859375), then Piece [`3` ♩]. With `piece`'s
   timeline editor open the card is raised (from (8, 36.20703125),
   1013.0390625 × 63.37890625, its bottom at 99.5859375; the arranger's
   README, "A member in the raised card"): `middle`'s own line at
   47.20703125 lies inside it and is not seen, and a member drawn in the
   raised card is placed on the card's row that holds it, so `middle` 1
   lies on the card's `middle` row at (414.0390625, 51.20703125) and
   `piece` 3 stays on the card's `piece` line at (210.33544921875,
   85.18359375). Topmost first, `middle` 1 comes first, and its pin is
   read on that row: Middle [`1` ♩] at 51.20703125, its ancestor Piece
   [`5` ♩] at the card's `piece` line (85.18359375), Recording [`1.25` s]
   at its member card's line (122.5859375, outside the card); then Piece
   [`3` ♩]: the
   order the arranger shows, since the member's card puts `piece`'s
   ancestor line where `piece`'s own drawing puts its line, below its
   children. Closing the editor (Done) gives the same order. What would
   be wrong: Piece [`3` ♩] ordered by a place the raised card covers.
   **What is stored never follows it.** Naming (`stampToName`, read from
   the potential MatchStamp with nothing raised) and Update
   (`updateCommand`) store each anchor's coordinates, and the anchors, in
   the screen order of nothing raised, whichever editor is open, so one
   MatchStamp is stored one way. On `groups/group_parent_both` the places
   are (the drawing read with nothing raised | with `piece`'s card
   raised): `piece` 3 (210.34, 85.18) | the same, `recording` 2.5
   (464.04, 122.59) | the same, `middle` 1 (414.04, 47.21) | (414.04,
   51.21), the card's `middle` row.
   - Naming "Pickup" the potential MatchStamp of a table of one MatchClaim
     `p_1`, `piece` 3 ↔ `recording` 2.5 (the group partner of `piece`'s
     child `middle`): `piece` 3 lies above `recording` 2.5, so the one
     `add` stores the anchor [`piece` [3, 1], `recording` 2.5],
     MatchClaims `["p_1"]`; the tab shows Piece [`3` ♩]
     first (the card's `piece` line left of the frame, 85.18359375, above
     `recording` 2.5 at 122.5859375), then `recording` 2.5's groups
     (naming stores a GroupStamp on a group member, so its pin reads
     `group_1`'s other member `middle` and its ancestor `piece`) Middle
     [`2` ♩] (its member card's line, 47.20703125), Piece [`6` ♩]
     (`piece`'s ancestor line, 85.18359375), Recording [`2.5` s]. `middle` 2 is `recording` 2.5 scaled by the
     group, 2.5 × 4/5 (`middle` 4 ♩ ↔ `recording` 5 s at the frame's
     common abscissa 460.33544921875), and `piece` 6 is `middle` 2 plus
     `middle`'s offset 4. With `piece`'s timeline editor open the tab
     shows Piece [`3` ♩] first as well (the card's `piece` line,
     85.18359375, above `recording` 2.5 at 122.5859375), then the GroupStamp's groups read
     where the raised card draws them: a member of the group that the
     raised card draws is read on the card's row of it, as its own
     reading is placed there (the arranger's README, "A member in the
     raised card"), so Middle [`2` ♩] (the card's `middle` row,
     51.20703125), Piece [`6` ♩] (the card's `piece` line, 85.18359375),
     Recording [`2.5` s]; naming stores the same command byte for byte
     (`JSON.stringify` of the journal's last command equal to the one
     stored with no editor open). Since the seams of the frame's room put
     `piece` 3 left of the frame, the raised order and the order of
     nothing raised agree here: this case no longer tells the two apart,
     nor does the Update case below, and a manifest whose raised order
     differs is owed to keep the proof.
   - Update of that named MatchStamp against a second table holding `p_1`
     and `p_2`, `middle` 1 ↔ `piece` 3 (out of date: the anchor of `p_2`
     is not in it): with nothing raised each pair's placed coordinate comes
     first and the anchors sort by it, `middle` 1 (y 47.21) above `piece`
     3 (y 85.18), which lies above `recording` 2.5 (y 122.59), so the
     `set` stores the anchors [[`middle` [1, 1], `piece` [3, 1]], [`piece`
     [3, 1], `recording` 2.5]] and `match_claims` `["p_1", "p_2"]`
     (core's update, in row order); raised, `middle` 1 is read on the
     card's row (y 51.21), yet Update with `piece`'s editor open stores
     the command of no editor open byte for byte.
   What would be wrong: the same MatchStamp stored in another orientation
   because an editor happened to be open.
3. **Naming** that potential MatchStamp "Downbeat" through the tab is one
   journal entry, `add` into the block: match timestamps `timestamp_1`
   (`clt_1` [0, 1]), `timestamp_2` (`cpt_1` 0.0), `timestamp_3` (`dpt_1`
   0), each `matchstamp: true` with the display `["cross_section"]`; the
   MatchStamp `matchstamp_1` "Downbeat" with `anchor_1` [`timestamp_1`,
   `timestamp_2`] showing `["line", "name"]` (the middle anchor of two is
   the upper one), `anchor_2` [`timestamp_1`, `timestamp_3`] showing
   `["line"]`, MatchClaims `["claim_1", "claim_2"]`; the tab then shows the
   named MatchStamp. Opened in a timeline editor of `cpt_1`, naming first
   closes the editor (the editing path is empty after) and is accepted;
   in a bundle editor of the block it stays open.
   **Under a timelines filter** naming stores the MatchStamp the table
   states, never the part the filter shows: the timelines filter limits
   what is shown, never what is stated. With the timelines `[clt_1,
   dpt_1]` the shown potential MatchStamp of `clt_1` 0 is {`clt_1` 0,
   `dpt_1` 0}, MatchClaim `claim_1`; what naming stores
   (`stampToName`) is the compared index's MatchStamp holding its first
   coordinate, {`clt_1` 0, `cpt_1` 0.0, `dpt_1` 0}, MatchClaims `claim_1`,
   `claim_2`, and the tab says so before the name is typed: "Naming also
   stores 1 anchor on timelines the MatchClaim filter hides." Named
   "Downbeat", it is the MatchStamp above (`anchor_1` [`timestamp_1`,
   `timestamp_2`], `anchor_2` [`timestamp_1`, `timestamp_3`], MatchClaims
   `["claim_1", "claim_2"]`), and compared with the compared index it is
   not out of date: no difference. Without a timelines filter what naming
   stores is the shown MatchStamp itself (the same object) and the tab
   says nothing.
4. **A named MatchStamp against the table.** With that MatchStamp named
   and the user's belief in `claim_1` changed to `false` (a second table),
   the comparison marks `anchor_2` not stated (its line red, the words "not
   stated by the table"), and the tab lists exactly "MatchClaims the belief
   filter leaves out: claim_1" and "Anchors gone: anchor_2" (the label
   holds under every filter: under the states `["true"]` it also names
   MatchClaims nobody believes either way, core's `claimsFilteredOut`);
   Update is enabled and sends
   one `set` of `anchors` [[`clt_1` [0, 1], `cpt_1` 0.0]] and `match_claims`
   `["claim_2"]` (one journal entry, `anchor_1` kept with its display,
   `timestamp_3` gone); Remove deletes the MatchStamp and its three match
   timestamps in one entry, leaving the tab on the hint. Without a table
   nothing is compared: no anchor is marked, no difference listed, no
   Update shown, Remove offered.
5. **MatchClaims and beliefs.** Each MatchClaim is a disclosure button
   named by its ID, collapsed (`aria-expanded` false, its region
   `hidden`); pressing it expands that MatchClaim alone, pressing it again
   collapses it. Expanded it shows, in this order: its events (item 5a),
   the beliefs with the user's buttons, and a button "Provenance"
   (accessible name "Provenance of <claim>") that alone opens the
   provenance: the paradata, as a Metadata pair's is shown (one data
   shape, one reader: `claimEntryLine` gives the `EntryLine`,
   `paradataRows` its rows, the same words and order as a pair's
   provenance; "A provenance entry" above), never the beliefs again.
   Before its entry is read, each MatchClaim lists the beliefs the table
   states, every actor worded by `whoOf` with the shipped catalogue's and
   the context's names (`claim_4`: "tag:example.org,2026:other believes it
   true"; the user's own by the user's name; an actor that is a
   MusicBrainz IRI by its slug, `https://musicbrainz.org/work/<mbid>` as
   `mbid:<mbid>`, its title the IRI), with no date, no note and no
   paradata; an entry the table does not state reads, behind Provenance,
   "No provenance entry: the table states none for it."; a MatchClaim
   without beliefs "No one has stated a belief.". The buttons True,
   Unlikely, False, the user's own belief pressed (`claim_5`: True); while
   no server can read a table (the tables' `unavailable`, 9e) every button
   is disabled with that text as its title: without a server, and with one
   whose health check is pending, the whole `HOW_TO_START_A_SERVER`, with
   a server whose health check failed (`The server did not answer the
   health check (Failed to fetch).`) that failure followed by it, and the
   server's provenance, events and belief routes are never called; a recorded MatchClaim the table lacks reads "not in the
   MatchClaim table", and without a table "no table loaded".
   **Actors compare as the IRIs they stand for** under the manifest's
   `@context` (core's `actorIri`, the library's rule), in the belief
   filter, in the user's own belief and in the words: the table with the
   user written compact, `tilie:<the default user's name, URI-encoded>`,
   under the context `{tilie: USER_TAG}` gives `claim_5` the belief
   `{actor: the compact text, iri: the user's IRI, who: the user's name,
   belief: "true"}` and the user's own belief `true`; the filter "only what
   I believe true" keeps 1 anchor (`claim_5`'s). Without the context the
   compact actor is no IRI of the user: no belief of the user, 0 anchors.
   `claimEntryLine` is "A provenance entry", item 4.
5a. **A MatchClaim's events** (`claimDetails`, and the tab with the
   server's events route stubbed). Nothing is asked while every MatchClaim
   is collapsed; expanding the first asks the events of every MatchClaim
   the table holds of the MatchStamp, once (`["claim_1", "claim_2"]` for
   the MatchStamp of `clt_1` 0; expanding the second asks nothing more);
   while pending the MatchClaims' one status line (one `role="status"`
   element under the heading, always present, empty while no MatchClaim
   the table holds is expanded or nothing is read) reads "Reading the
   events…", and is empty once the answer arrives; a refusal reads
   `eventsFailure`'s words there; while no server can read a table
   (without a server, and with one whose health check is pending or
   failed) the expanded MatchClaim says `unavailable`'s text and the events
   route is never called. The answer written in the
   test: `claim_1` `clt_1` event `note_1` named "C4" ↔ `dpt_1` event
   `onset_1` without a name, certainty 0.75; `claim_2` `clt_1` `note_1`
   "C4" ↔ `cpt_1` no event (the sentinel), no certainty. Shown, each side
   is one row of a list headed by its timeline's name, else its ID (the
   fixture's timelines have no name), the ID as the title: `claim_1`
   `clt_1` "note_1 “C4”", `dpt_1` "onset_1", "certainty 0.75"; `claim_2`
   `clt_1` "note_1 “C4”", `cpt_1` "no event", no certainty row. A side
   is its timeline, event and name, nothing more (`claimDetails` gives
   exactly `{timeline, timelineName, event, name}`). `claimDetails` of an
   ID the answer lacks is `null`.
6. **The filter** lists the manifest's timelines (`clt_1`, `clt_2`,
   `cpt_1`, `dpt_1`) checked and, in a group named "Beliefs", four toggle
   buttons True, Undecided, Unlikely, False (the Timestamp tab's display
   toggles), the first three pressed; unchecking `cpt_1` configures
   `{timelines: ["clt_1", "clt_2", "dpt_1"], beliefs: ["true",
   "undecided", "unlikely"]}` for the block (outside the journal),
   checking it again `timelines: null`; pressing False adds `false`
   (`["true", "undecided", "unlikely", "false"]`, the states always in
   that order), pressing Undecided then leaves it out (`["true",
   "unlikely", "false"]`), and each pressed state is `aria-pressed`.
   "Load MatchClaims…" is the manual route of the session's tables
   (`choose`, item 9a): it asks the tables dialog for the MatchClaim table
   the manifest names, and for nothing else (the table manifest, which has
   no name and names a Projections table too: `{manifest: "The manifest",
   table: {url: "match_claims.parquet"}, question: {kind: "table",
   missing: null}}`, the tables given the server's files as an answered
   health check gives them), opens no file picker of its own, and posts
   what the load says: a file located on the server (`{path:
   "m.parquet"}`) is loaded ("Loaded the MatchClaims of m.parquet." posted as
   information), a cancelled question says nothing. While no server can read a table "Load MatchClaims…" is
   disabled and described by `unavailable`'s text (9e): without a server,
   and with one whose health check is pending, `HOW_TO_START_A_SERVER`,
   with one whose health check failed the failure first.
7. **The tab rule.** Showing a MatchStamp selects the Matchstamp tab and
   remembers the tab before, letting it go shows that tab again; a named
   MatchStamp is named by its own address and by an anchor's, by nothing
   else; a potential one is shown only while its block's index is the
   object it was read from, a named one only while its address names it
   (`matchOutlived`, which the drawer derives what it shows from).
8. **The overlay** the canvas is given, in the arranger's types: without
   a table `matches` is empty; with the block's table, one entry `{block,
   index, named}` with the block's shown index and every named MatchStamp
   compared against its compared index (the cached comparisons, the same
   object); a block listed as holding a table that the view no longer
   holds, or whose table is gone, gives no entry. Each entry carries the
   indexes' `beliefs` (the same array object), which the canvas colours
   anchors by. Each comparison's
   `stated` follows its MatchStamp's `alignment_anchors`: with "Downbeat"
   named and the user believing `claim_1` false, `stated` of
   `matchstamp_1` is [an index anchor, `null`] for [`anchor_1`, `anchor_2`],
   the order the canvas reads to draw `anchor_2` red. The pinned
   MatchStamp is `{block, matchStamp}` only for a potential MatchStamp
   read from its block's shown index as it is now; read from another
   index, a named one, or none, it is `null`.
9. **Loading** (`matchclaims-loading.test.ts`, the server stubbed as an
   object with `matchClaims`): the pickers offer the MatchClaim table
   beside a manifest or a workspace (`application/vnd.apache.parquet`
   `.parquet`); a table picked with one manifest becomes that block's, its
   request carrying the manifest as its file writes it and the file
   unchanged; with two manifests it goes to the block whose manifest names
   a resource of its file name; every picked Parquet file is a MatchClaim
   table, so with one manifest a file named as its Projections table
   (`projections.parquet`) goes to the table route too, and the route's
   refusal is the warning. A manifest naming a table that is not loaded
   says nothing on import, with or without a server: Show matches loads
   it. A refused
   table lists each problem with its row; an unreachable server, 501 and
   any other failure each have their message. Opening another workspace
   drops every table; the workspace file never holds one (its text equals
   the text without the table).

9a. **The table a manifest names** (`matchclaims-loading.test.ts`, the
   server stubbed as above, the user's answer to the dialog stubbed as a
   function recording each question, the server's files given as
   `ManifestPlaces` over an in-memory server, the way they are given once
   the health check answered: 9e). The table fixture's manifest names
   `match_claims.parquet` (MatchClaim) and `projections.parquet`
   (Projection); the table it names is the first resource of type
   MatchClaim, `match_claims.parquet` (`namedTable`), and a manifest naming
   none names `null`. Loading it for a block (`loadNamed`, what Show
   matches asks):
   - from a source that reaches every file (`ManifestSource` answering
     each location with a `Blob` of its own and recording each location
     read), exactly one file is read, `match_claims.parquet`, without a
     question: the table route gets the manifest as its file writes it and
     exactly that file, and the messages are exactly `{informed: ["Loaded
     the MatchClaims of match_claims.parquet."], warned: []}`;
   - from a source that reaches nothing, the user is asked once, for the
     MatchClaim table (`{manifest: "Tables", table: {url:
     "match_claims.parquet"}, question: {kind: "table", missing: null,
     locate}}`, the manifest named by its name; its source is known, the
     path of its file is not, so no path is missing it); a file located on
     the server (`{path: "mine.parquet"}`) is read through the places and
     loaded as `mine.parquet`; the URL `https://example.org/p/m.parquet` is fetched
     (`fetch` stubbed, called once with that URL) and loaded under
     `m.parquet`; a URL answered 404 warns "The MatchClaim table was not
     loaded: https://example.org/p/m.parquet could not be read: 404 Not
     Found" and loads nothing; text that is no URL (`http://`) warns "The
     MatchClaim table was not loaded: 'http://' is no URL";
   - cancelled, nothing is loaded, nothing is said, and the table route is
     not called; a source that rejects warns "match_claims.parquet could
     not be read from where the manifest came from: <its message>" and
     asks for it as if unreached;
   - a block already holding a MatchClaim table, a manifest naming no
     MatchClaim table and a session without a server ask nothing and say
     nothing (what no server reading a table says instead is 9e's).
   **The manifest is never touched**: the table fixture's manifest,
   imported with its MatchClaim table picked beside it, keeps its
   `resources` exactly as read (both entries, the Projections one
   included), and once its table is loaded `saveManifest` of the block's
   manifest equals, byte for byte, `saveManifest` of the fixture's
   manifest as import takes it (`importedManifest`, which only adds the
   default timestamps of a manifest without `graphical`).
   The session's `loadNamedTables` runs it for every block in the
   canvas's one order of blocks (the arranger's `blocksInOrder`: by
   parent, then index, which its own tests prove; three blocks added in
   the order A, B, C, at `y` 200, then `y` 0 and `x` 300, then `y` 0 and
   `x` 0, with the indexes `a2`, `a0`, `a1`, are asked for as B, C, A:
   neither the order they were added in nor where they lie), and posts
   the information
   through `post` as information, the failures as errors (the session given the
   server's files, a block's manifest file unstated, so it asks where the
   manifest lies; a URL answered, fetched and loaded). Turning Show matches
   on, by its key or its button, is what calls it
   (`e2e/matchclaim-loading.spec.ts`). The manual route (`choose`, Load
   MatchClaims…) always asks, for the MatchClaim table (with `url` `null`
   where the manifest names none; `{kind: "table", missing: null}`), and
   loads what is chosen the same way; while no server can read a
   table it asks nothing and returns `unavailable` as its failure (9e). The Fixture menu's
   `tables/manifest` entry carries a source reading the files served
   beside the fixture (`servedSource`): `match_claims.parquet` is served,
   `projections.parquet` and `other.parquet` are not (`null`).

9d. **Beside the manifest's file on the server** (`matchclaims-loading.test.ts`,
   the tables given `ManifestPlaces` over an in-memory server holding
   files by path, recording each `readFile`, the manifest's path per block
   and a stubbed file dialog recording each call and answering a queued
   path). The paths: `resolvedPath("story", "step1.match_claims.parquet")`
   is `story/step1.match_claims.parquet`, `resolvedPath("work",
   "../story/a.yaml")` `story/a.yaml`, `resolvedPath("", "./a/../b.yaml")`
   `b.yaml`; `null` for `../x` from the root, `/x` and `https://h/x`;
   `relativePath("work", "story/step1.yaml")` is `../story/step1.yaml`,
   `relativePath("", "story/step1.yaml")` `story/step1.yaml`,
   `relativePath("story", "story/step1.yaml")` `step1.yaml`;
   `folderOf("story/step1.yaml")` `story`, of `w.tle.json` `""`.
   `serverSource(server, "story").read(url)` reads `story/<url>` (a query
   or fragment dropped), answers `null` where the server answers 404 and
   for a URL or a path above the root (nothing read), and rejects with
   any other failure.
   - A block whose manifest lies at `story/step1.yaml` loads
     `story/step1.match_claims.parquet` with no question, its messages
     exactly `{informed: ["Loaded the MatchClaims of
     step1.match_claims.parquet."], warned: []}`.
   - Where that file is missing: one question `{kind: "table", missing:
     "story/step1.yaml"}`; Locate… (the question's `locate`) opens the
     file dialog on MatchClaim tables near `story/step1.yaml`; answered
     `{path: "other/claims.parquet"}`, that file is read and loaded as
     `claims.parquet`.
   - A block whose manifest's file is not stated: one question `{kind:
     "manifest"}`, whose `locate` asks the dialog for manifests; answered
     `{path: "story/step1.yaml"}`, the place records that path for the
     block (`located`, once) and the table is read beside it,
     `story/step1.match_claims.parquet`, loaded; located where the folder
     holds no such table, nothing is loaded and the warning is
     "step1.match_claims.parquet is not beside step1.yaml.".
   - A path the server refuses (`{path: "gone.parquet"}`, 404 "no such
     file") warns "gone.parquet could not be read: no such file".
   - A manifest naming its MatchClaim table by an absolute URL
     (`https://example.org/p/step1.match_claims.parquet`, and the same
     with `http://`), its file located at `story/step1.yaml`: the URL is
     fetched (`fetch` stubbed, called once with exactly that URL), the
     server reads nothing, nothing is asked, and the table is loaded under
     `step1.match_claims.parquet`, the messages exactly `{informed:
     ["Loaded the MatchClaims of step1.match_claims.parquet."], warned:
     []}`. The URL is fetched whatever the block's source: a block located
     with a source (an example's) reads nothing from it either. A URL
     answered 404 warns
     "https://example.org/p/step1.match_claims.parquet could not be read:
     404 Not Found" and asks once, as Load MatchClaims… asks (`{kind:
     "table", missing: null}`, so the dialog's title is the plain "Load
     the MatchClaim table of LayerIt", never "… is not beside …"); the
     server still reads nothing, and cancelled, nothing is loaded. A
     relative location is read beside the manifest as above.

9e. **No server can read a table** (`matchclaims-loading.test.ts`, the
   server stubbed as above, the user's answer stubbed as a function
   counting every question, the manifest the table fixture's, its
   source reaching nothing, so with a reachable server it would be asked
   for). Two sentences, both plain text (no markup, since the message bar,
   hints and titles all show text): the short one,
   `MATCHES_NEED_A_SERVER`, exactly "Matches need a running tilie-server.",
   and `HOW_TO_START_A_SERVER`, exactly "Matches need a running
   tilie-server. To start it, run uv run tilie --static-dir
   ../app/packages/editor/dist in the repository's server folder (or tilie,
   once installed with pip install tilie-server), then open the editor at
   the address it prints." (the command is the one the repository's README
   starts the server from the source tree with); the longer is built from
   the shorter, so the first sentence is written once. The tables know four
   states of the server: none given (no `matchClaims` option); given, its
   health check not answered yet; given, its health check failed (the
   failure the editor's offline mark reads, here "The server did not answer
   the health check (Failed to fetch)."); given and answered. Answered is
   the one state with the server's files (`ManifestPlaces`): the editor
   reaches them only once the check answered, and the tables take that as
   the answer, so no test (and no editor) can state "answered" without the
   places every question needs.
   - In the first three, `unavailable` is `HOW_TO_START_A_SERVER`, the
     failed check's failure first ("The server did not answer the health
     check (Failed to fetch). Matches need a running tilie-server. To start
     it, …" with the sentence whole); `waiting` is true in the second state
     alone; `loadNamed` asks nothing, reads nothing through the server and
     says nothing; `choose` (Load MatchClaims…) asks nothing, reads nothing
     and returns exactly `{informed: [], failed: [unavailable]}`. Proof that nothing was asked: the
     question count stays 0, the table route's request count 0.
   - Everything else read through the server is gated by the same rule,
     in the tables themselves, so no caller can reach a route without a
     server that reads tables: in those three states, with a table held,
     `provenance` and `events` are `null` and `believe` resolves exactly
     `unavailable`, and the server stub (whose provenance and belief
     routes throw if called, whose events route records each call) is
     never called.
   - The session's `loadNamedTables` (what turning Show matches on calls)
     in those states asks nothing and reads nothing. With no server given
     and with a failed check it says, as information, exactly
     `HOW_TO_START_A_SERVER` (`["info", "Matches need a running
     tilie-server. To start it, …"]` with the sentence whole, never a
     warning, never prefixed by the check's failure, which the offline
     mark and the disabled controls name) once per turning on
     whenever no block holds a table or a block names a table it does not
     hold: over a workspace without blocks, then with one block whose
     manifest (`bare`) names no table, then with two more blocks each
     naming a table, again, then with one of the two holding a table, the
     messages posted so far are exactly one, two, three, four and five
     times that information (once per turning on, never once per block);
     with both holding theirs, still five. While the check has not
     answered yet it says nothing at all, in the same steps: the server
     may be slow rather than missing.
   - The check failing later (Show matches turned on while it was pending,
     over the two blocks naming a table): the call while pending says
     nothing; the same call once the failure is given (what the editor
     makes itself when the check fails while Show matches is on) posts
     exactly that information, once, and asks and reads nothing.
   - The check answering later (the places given from then on): the same
     tables ask once, `unavailable` is `null` and `waiting` false; the
     session's call then asks once per block naming a table; both questions
     cancelled, no block holds a table, so it posts exactly the
     information `NO_MATCHES`, "No MatchClaim table loaded." (what the
     canvas's grey status said before ADR 0037). The editor makes that
     call itself when the check answers while Show matches is on, and
     when it fails then (`e2e/matchclaim-loading.spec.ts`).
   The end-to-end proof is `e2e/matchclaim-loading.spec.ts`: on the
   built page, whose health check is refused (503 Service Unavailable),
   pressing M with a manifest naming its table opens no dialog, the message
   bar shows the information `HOW_TO_START_A_SERVER` alone, and Load
   MatchClaims… is disabled, described by the failed check's failure and
   `HOW_TO_START_A_SERVER`; beside a warning already shown the information
   is drawn in its own card and style and leaves after its reading time
   (`infoDurationOf`) while the warning stays ("The message bar"); with the check held
   unanswered, M posts nothing, and once it answers the table is loaded
   without M being pressed again; once it is refused instead, the message
   bar gets exactly one message, that information, without M being
   pressed again, no dialog opens and no table is requested.

9b. **The dialog** (`tables-dialog.test.ts`, the component mounted in
   jsdom with `showModal` stubbed). It asks only where the server's files
   are reached, so every question locates a file in the editor's file
   dialog. Asked for the MatchClaim table of "Tables" with the question
   `{kind: "table", missing: null, locate}`, it is titled "Load the
   MatchClaim table of Tables" and shows "Locate…" and one group,
   "MatchClaim table match_claims.parquet", holding one URL field labelled
   "URL of the MatchClaim table" and nothing else to choose (no file of the
   user's system); Load is disabled until a URL is given. A URL resolves
   `{url}`, trimmed. Cancel and Escape (the dialog's `close`) resolve
   `null`. A question asked while one is open resolves the open one
   `null`; a `close` event arriving while the new one is open (the first
   one's, which a browser fires a task after closing) dismisses nothing:
   the new question answers as chosen. The dialog is the editor's one
   dialog shell, the question dialog's too. The URL field is a text field
   (`inputmode="url"`), so a relative URL (`match_claims.parquet`) is taken
   as entered. Asked `{kind: "manifest", locate}` it is titled "Where is
   Tables?"; asked `{kind: "table", missing: "story/step1.yaml", locate}`
   "match_claims.parquet is not beside Tables, at story/step1.yaml".
   Locate… calls `locate` once; a path answered resolves `{path}` at once,
   `null` (the file dialog cancelled) keeps the dialog open, a rejection
   shows "The file could not be located: <its message>".

9c. **Events on demand** (`matchclaims-loading.test.ts`). `events(block,
   manifest, claims)` asks the server's events route once per table and
   list of claims, with the manifest as its file writes it and the held
   MatchClaim file: asking the same again returns the same promise; a
   refused request is let go, so the next call asks again; without a
   table it is `null`, as it is while no server reads tables (9e). `eventsFailure` words a refusal "The
   MatchClaims' events could not be read: <problems>", 501 "…: this
   server cannot read MatchClaim tables.".

10. **Provenance on demand** (`matchclaim-beliefs.test.ts`, the server
    stubbed as an object answering the three calls and recording each
    call). The provenance answers are written in the test: `claim_1` made
    by the service `https://example.org/aligner`, `imported`, on
    2026-11-20; `claim_2` without provenance. Showing the potential
    MatchStamp of `clt_1` 0 asks for the provenance of exactly
    `["claim_1", "claim_2"]` (its MatchClaims, never another row), with
    the manifest as its file writes it and the file the block holds; while
    the answer is pending the list's one status line (item 5a) is empty as
    long as every MatchClaim is collapsed and, `claim_1` expanded (its
    events answered at once), reads "Reading the provenance…", as the
    Provenance region of `claim_1` opened then does; that region **stays
    open** when the answer arrives (the same button, still expanded: the
    MatchClaim's entry is rendered once, the settled read filling it), and
    then `claim_1` lists, behind its Provenance button, "method imported", "service
    https://example.org/aligner", "date 2026-11-20" in that order (the
    Metadata tab's order and words) and `claim_2` "No provenance
    entry: the table states none for it."; the other actor's belief in
    `claim_4`, recorded with the date 2026-11-21 and the note "seen in the
    score", reads "tag:example.org,2026:other believes it true
    (2026-11-21): seen in the score". Showing the same MatchStamp again from the same table asks
    nothing more; a refused request reads "The provenance could not be
    read: <the server's message>", and the next showing asks again. Without
    a server nothing is asked, nor through a server whose health check is
    pending or failed (9e; the tab then says `unavailable` where the
    provenance would be, item 5).
11. **A belief.** With a server the buttons are enabled. Pressing False on
    `claim_2` sends exactly one belief, `{claim: "claim_2", actor: the
    user's IRI, belief: "false", date: today as YYYY-MM-DD}`, with the
    manifest's text and the held file, then reads the answered file through
    the table route (the same manifest text, the answered `Blob`); the block
    then holds that table and file, marked changed: the status reads
    "match_claims.parquet: 5 MatchClaims, changed" and "Save MatchClaims…"
    is offered; the journal is as long as before (nothing is written into
    the workspace). The tab follows the MatchStamp into the new table: the
    stub answers the table with the user's `false` in `claim_2`, so under
    the default filter the MatchStamp of `clt_1` 0 is {`clt_1` 0, `dpt_1`
    0}, the potential MatchStamp reported is that one of the new table's
    shown index, and the message says "Recorded your belief false in
    claim_2; Save MatchClaims… keeps it.". Pressing the user's own belief
    (True on `claim_5`) sends nothing. A refused belief warns "Your belief
    in claim_2 was not recorded: <the problems, each with its row>" and the
    block keeps its table unchanged. "Save MatchClaims…" downloads the held
    file under the table's name (`match_claims.parquet`, its bytes
    unchanged, the Parquet media type) where the browser has no save
    picker; the table is then no longer changed and the button is gone.
12. **A changed table is never dropped unasked** (`matchclaim-beliefs.test.ts`,
    the session built directly, the tab mounted, downloads intercepted).
    What replaces the session's tables asks the one question of the Files
    section, naming everything unsaved: the workspace alone keeps
    "untitled.tle.json has unsaved changes. Save them?"; a changed table
    alone reads "The MatchClaim table match_claims.parquet has unsaved
    changes. Save them?"; both read "untitled.tle.json and the MatchClaim
    table match_claims.parquet have unsaved changes. Save them?"; two
    changed tables "The MatchClaim tables a.parquet and b.parquet have
    unsaved changes. Save them?", in the order they were loaded. A held
    table that is not changed asks nothing (no question). Save saves the
    workspace first and then each changed table, as downloads in exactly
    that order (`untitled.tle.json` with the workspace's text, then
    `match_claims.parquet` with the held file's bytes), after which nothing
    is unsaved and replacing may go on; a cancelled workspace save stops
    before any table (one download attempt, no table written, the table
    still changed, replacing refused); a cancelled table save refuses
    replacing and leaves the table changed; a failed one also warns "The
    MatchClaims were not saved: <the failure>". Load MatchClaims… on a
    changed table asks the table's question below the button first:
    Cancel asks for no table and keeps the table changed; Discard asks
    the tables dialog. The editor's own question before New is proved end to end
    (`e2e/matchclaim-beliefs.spec.ts`): after the belief, New asks the
    combined question; Cancel keeps the table changed; Save writes the
    workspace through the server's "Save as" dialog (the page's health
    check answered once the table was imported, so the workspace is saved
    on the server) and then downloads the table (the answered bytes
    unchanged) and opens
    the empty workspace; with the workspace saved and only the table
    changed, New asks the table's question and Discard opens the empty
    workspace without asking again.

The Timestamp tab lists, for a match timestamp, the MatchStamps naming it
in a list "MatchStamps" ("Downbeat matchstamp_1" for `timestamp_1`); an
ordinary timestamp ("Theme" on `clt_1` at 1) has no such list.

## How a read settled (`settlements.test.ts`)

The MatchClaims list reads the events and the provenance of the shown
MatchStamp's claims from promises, and keeps its DOM when one settles
(an open Provenance stays open; `matchclaim-beliefs.test.ts`). What is
proved here is what the holder of those settlements keeps, with promises
the test settles by hand:

- a promise asked for reads as pending (nothing) until it settles, then as
  fulfilled with its value, or as rejected with its failure, the same
  object at every later read;
- only the promise asked for last is held: one asked for after another
  that is still pending reads as pending, and the first one's settling,
  late, shows nowhere; a promise that settled and was then left for
  another is let go, so asked for again it reads as pending until it
  settles anew (one microtask), never from a kept settlement. So the
  holder keeps at most one promise and its value, however many reads the
  list makes while it stays mounted.

## The Metadata tab (`metadata-frame.test.ts`, `metadata-edits.test.ts`, `metadata-panel.test.ts`)

The tab shows and edits the statements of TimeToShare's description
layer: property–value pairs about the thing a bundle, a timeline or a
region stands for, each pair optionally carrying a provenance entry: how
it was made (its paradata: `stated_by`, `method`, `service`, `basis`,
`match`, `note`, `date`) and who believes it (`beliefs`, one `{actor,
belief, date}` per actor, the belief one of the strings `"true"`,
`"unlikely"`, `"false"`). A pair held only in provenance is a
**candidate**; a candidate an actor believes `"false"` is not offered to
that actor again. There is no status: nothing in the tab derives one, and
no text shows one. What a pair means is the schema package's: its statement
functions (`rectangles`, `entries`, `candidates`, `verbOf`, `withPair`,
`withoutPair`, `withBelief`, `withCandidate`, `instantiate`, `recognize`)
and its shipped catalogue, read on core's statement skeleton
(`skeletonOf`); the editor only chooses what to show, in which order and
words, and which one `set` an action dispatches. So the oracles are the
fixture as written, the shipped catalogue's labels and types, and core's
store; every heading below is a catalogue label, and a verb the catalogue
lacks prints the property as written. Two rules the tests hold the editor
to: believing a stated pair `false` records the belief and never removes
the pair (Remove is its own action), and the person who states a pair
through the tab is recorded believing it `"true"`, while TiLiE, writing a
candidate or a tie, holds no belief.

`L` is TimeToShare's `fixtures/0.2.0/statements/layerit_recording.yaml`,
the one block `A` = `0000000000` of a store (`storeOf`), its roots in
canonical order `clt_6`, `cpt_1`, `dpt_1` (paths `["timelines", 0]`, `1`,
`2`), `cpt_2` at `["timelines", 1, "children", 0]`. The user is core's
default, Gerhardt, who states and believes as `G` =
`tag:timetoalign.github.io,2026:tilie:user:Gerhardt`; `T` =
`https://example.org/agents/tilie`, `P` = `https://example.org/people/editor`
(the fixture's annotators, printed as written); `TILIE` =
`https://github.com/TimeToAlign/TimeLineEditor`, TiLiE's own IRI.

**The frame** (`metadata-frame.test.ts`, pure, on `L`'s view):

1. **What is shown.** `cpt_1` selected: a timeline frame, `target`
   `{block: A, id: "cpt_1"}`, words `timeline 'C.Debussy - Clair de Lune,
   Maria João Pires live at Jardin Musical'`, name `C.Debussy - Clair de
   Lune, Maria João Pires live at Jardin Musical`, path `["timelines",
   1]`, key `{"block":"0000000000","id":"cpt_1"}`. The block selected, or
   nothing selected with `A` the only block: the bundle, words `bundle
   'LayerIt, Clair de lune mm. 1–6 (Pires)'`, name `LayerIt, Clair de lune
   mm. 1–6 (Pires)`, path `[]`. `cpt_2`, which has no name, is named by
   its ID `cpt_2`. `group_1` selected: "Group 'recording' has no
   statements: a bundle, a timeline or a region has. Select its block, a
   timeline or a region." Two subjects selected: `SELECT_HINT`.
2. **`cpt_1`'s rectangles**, headings `["is a", "performed by", "same
   as"]` (`rectangles`' order: "is a" first, then by first pair, the pairs
   by property in code-point order). A row's property and value are
   shown as "How IRIs are shown" says (a compact IRI as written with the
   IRI it stands for, an absolute one as its slug); below, a row is
   written by its texts. Each pair's line is its provenance entry,
   whatever beliefs it holds, else `null`:
   - "is a", keyed by its first pair `["type","schema:VideoObject"]`, no
     label, rows `type schema:VideoObject` (to `http://schema.org/VideoObject`),
     `type melod:Manifestation` (to
     `https://lod.academy/melod/vocab/ontology#Manifestation`), `wdt:P31
     wd:Q98069877` (to `http://www.wikidata.org/entity/Q98069877`), no
     entry each.
   - "performed by", label "Maria João Pires", rows `rel:prf
     viaf:113931950` (to `http://viaf.org/viaf/113931950`) and `wdt:P175
     wd:Q235650` (to `http://www.wikidata.org/entity/Q235650`): one
     rectangle, the two values sharing the VIAF cluster through the
     Wikidata node's `schema:sameAs`. Its things, first seen first, are
     the VIAF, Wikidata and GND IRIs, recognised as `viaf`, `wikidata`,
     `gnd`. Lines: `reconciled · T · 2026-11-18` with basis `wd:Q235650`
     and `gnd:124927521` (each with its IRI) and no belief, then `reconciled · P · 2026-11-18` with
     service `https://www.wikidata.org/w/api.php` and the one belief `P`
     `"true"` on 2026-11-18. `addable` is `[musicbrainz, gnd, melody]`:
     the verb's vocabularies in catalogue order (those with a pattern of
     their own, and those whose lookup searches agents where the fallback
     states it with a thing slot) without Wikidata (`wdt:P175` with a
     Wikidata value), VIAF and the fallback (`rel:prf`, the fallback's
     property; the fallback holds no things, the value is VIAF's).
   - "same as", no label, row `schema:sameAs youtube:Ch2mrPm1JnM`, the
     value carrying and linking to
     `https://www.youtube.com/watch?v=Ch2mrPm1JnM`, line `manual · P ·
     2026-11-18`, belief `P` `"true"`. `T` and `P` are shown as written
     (no namespace holds them as a local name) with no IRI.
   The user's own belief (`beliefOf`) in every line is `null`: `G` holds
   none.
2a. **One thumbnail per tile, from whichever thing has one.** A tile
   joins values that are one thing, or carry one label (TimeToShare's
   `rectangles`), so its things may come from several vocabularies of
   which only some give an image. The tile resolves each of its things the
   lookup resolves, each IRI once, and shows the image of the first thing,
   in the tile's thing order, whose answer has one; a tile none of whose
   answers has an image shows none. With a stub lookup resolving
   `wikidata` and `gnd` alone, its Wikidata answer without an image and
   its GND answer with `https://example.org/pires.jpg`: the "performed by"
   tile (things VIAF, Wikidata, GND) shows exactly one `img`, its `src`
   that URL, and `resolve` was called exactly with, in this order,
   `(wikidata, http://www.wikidata.org/entity/Q98069877)` (the "is a"
   tile's one resolvable thing), `(wikidata,
   http://www.wikidata.org/entity/Q235650)` and `(gnd,
   https://d-nb.info/gnd/124927521)` (VIAF is not resolvable), once each.
   With both images `null` its thumbnail holds no `img`. Before, the tile
   resolved only its first resolvable thing (Wikidata) and showed no image,
   which this case fails on.
3. **What the element is.** The first tile's sentence (`typeSentence`)
   names the element and the catalogue types its "is a" states, as few as
   name every pair (`typeLabels`: the types `typesOf` finds, most
   vocabularies agreeing first, each kept only where it names a pair no
   earlier one did; a pair no type names follows as written), each with
   its article: `cpt_1` "C.Debussy - Clair de Lune, Maria João Pires live
   at Jardin Musical is a video." (`video` names all three pairs: fallback
   `schema:VideoObject`, MeLODy `melod:Manifestation`, Wikidata
   `wd:Q98069877`); `clt_6` "Clair de lune, mm. 1–6 (MEI) is a printed or
   scanned edition." (two vocabularies agree on it and on `score_encoding`;
   the first in catalogue order names both pairs); `dpt_1`
   "ClairDeLune_MariaJoaoPires_untilM6.wav is a recorded performance and a
   release." (each type names one pair, `schema:AudioObject` and
   `melod:Manifestation`, the first of each in catalogue order); `cpt_2`
   "Nothing states yet what cpt_2 is.". `typeLabels` of `type
   schema:VideoObject` and `type schema:Painting` is `["video",
   "schema:Painting"]`.
4. **`cpt_1`'s candidates.** Offered: one row, subject `["timelines", 1]`,
   heading "is a recording of", label "Clair de lune" (the label `clt_6`'s
   node gives `wd:Q29117946`), pair `["wdt:P2550", {"id":
   "wd:Q29117946"}]`, line method `inferred`, who `T`, basis `#clt_6`,
   `#dpt_1`, no belief, key the canonical text of
   `[["timelines",1],"wdt:P2550",{"id":"wd:Q29117946"}]`, the label a
   name with no IRI. Believed false by the user: none.
5. **`clt_6`**: headings `["is a", "dcterms:created", "is a version or
   edition of"]`; `dcterms:created` (no verb) labelled by its literal
   "2025-12-05", its line `imported`; "is a version or edition of"
   labelled "Clair de lune", rows `schema:exampleOfWork
   mbid:8d331505-4d88-39ae-81c7-bec5da77af96` (the value carrying and
   linking to `http://musicbrainz.org/work/8d331505-…`) and `wdt:P629
   wd:Q29117946` (one thing shared through the node's `schema:sameAs`),
   its two lines `manual` by `P` with match `broad` (belief `P` `"true"`)
   and `reconciled` by `T` with service Wikidata and basis `mbid:8d331505-…`.
   Its candidate "is a version or edition of" `gnd:1156628156` (no label
   known, so its ID as written, carrying `https://d-nb.info/gnd/1156628156`), method `reconciled`, its note kept, is believed `"false"` by
   `P`, not by the user: it is offered to `G`, its line holding `P`'s
   belief. Believed false by the user: none. The value node's own entry is
   about a pair the node states, so no candidate.
6. **`dpt_1`**: headings `["is a"]`; one candidate offered, "is derived
   from, is based on" naming the element `#cpt_1` by its name.
7. **`cpt_2` and the bundle.** `cpt_2` states nothing: one rectangle, the
   empty "is a", keyed `is_a`, no rows, in words "is a". The bundle: the
   empty "is a", `rdfs:seeAlso` and `schema:about` (`wd:Q29117946`), which
   no verb reads.
   A rectangle in words is its heading and its label, else its first value
   as shown: `cpt_1`'s read "is a schema:VideoObject", "performed by
   Maria João Pires", "same as youtube:Ch2mrPm1JnM".
8. **Who and the entries.** Read by `lineOf` and `whoOf` ("A provenance
   entry").
9. **Choices.** `systemChoices` of "performed by": Wikidata, MusicBrainz,
   GND, "MeLODy / LRMoo", "Other vocabularies", "An element of this
   manifest". `verbChoices` for the types `cpt_1`'s "is a" states begin
   "is a", then the usual verbs of `video` (the type three of its
   vocabularies agree on: fallback, MeLODy and Wikidata) and end with
   "Other property…"; with the system `wikidata` no reading Wikidata cannot
   state is offered.

**The edits** (`metadata-edits.test.ts`, pure, exact commands, the clock
at `2026-11-20T12:00:00Z`):

1. **Stating `cpt_1`'s candidate** by `G` is one `set` with one change on
   `{block: A, id: "cpt_1"}`: `statements` as before plus `"wdt:P2550":
   [{"id": "wd:Q29117946"}]`, `provenance` as before with entry 3 kept as
   made (`stated_by: [T]`, `date: "2026-11-18"`, method, basis and note)
   and given `beliefs: [{actor: G, belief: "true", date: "2026-11-20"}]`.
2. **Believing `dpt_1`'s candidate false** changes only `dpt_1`'s
   `provenance`: its one entry as made plus `beliefs: [{actor: G, belief:
   "false", date: "2026-11-20"}]`; no `statements` member. The frame over
   that skeleton offers no candidate and sets that row apart as believed
   false by the user, its line holding `G`'s belief, `beliefOf` `"false"`.
3. **Believing a stated pair.** `G` believing `cpt_1`'s "same as" pair
   `"false"` changes `provenance` alone (the pair stays stated): entry 0's
   beliefs become `[{actor: P, belief: "true", date: "2026-11-18"},
   {actor: G, belief: "false", date: "2026-11-20"}]`. Believing it then
   `"unlikely"` replaces `G`'s belief in place: two beliefs, `G`'s
   `"unlikely"`.
4. **Removing a pair.** Removing `cpt_1`'s "same as" pair drops it and
   its entry: `statements` without `schema:sameAs`, `provenance` without
   entry 0.
5. **Adding.** `added` on `cpt_2` with the pair `wdt:P175 {id:
   "wd:Q235650", label: "Maria João Pires"}` and fields `manual` by `G`
   states it with one entry `{date: "2026-11-20", method: "manual",
   property: "wdt:P175", stated_by: [G], value: {"id": "wd:Q235650"},
   beliefs: [{actor: G, belief: "true", date: "2026-11-20"}]}`; the
   command changes `cpt_2` alone, both members.
6. **Tying.** `tied` on the pair `rel:prf {id: "gnd:124927521"}` with the
   thing `http://www.wikidata.org/entity/Q235650`, the catalogue's
   prefixes and the day `2026-11-20` gives `{id: "gnd:124927521",
   "schema:sameAs": [{id: "wd:Q235650"}], provenance: [{basis:
   ["http://www.wikidata.org/entity/Q235650"], date: "2026-11-20", method:
   "inferred", note: TIE_NOTE, property: "schema:sameAs", stated_by:
   [TILIE], value: {id: "wd:Q235650"}}]}`: the tie is never silent, and
   TiLiE holds no belief in it. A node naming the thing itself is left
   alone.
7. **Nothing changed.** `commandOf` of the frame's own skeleton is
   `null`. A TimeToShare refusal reaches the caller as the function's
   `Error` (removing from `cpt_2` a pair it does not state throws
   "'schema:sameAs' does not have this value").

**The panel** (`metadata-panel.test.ts`: the Inspector mounted on a store
of `L` inside a wrapper that provides the user (Gerhardt; a `UserDialog`
answering "Change…") and a stub lookup; the Metadata tab chosen; the clock
fixed at `2026-11-20T12:00:00Z`). The stub resolves `wd:Q235650` to
"Maria João Pires" with the cross-reference GND `124927521`, that GND
record to "Pires, Maria João", and searches nothing. A tile's heading is
its sentence: the first tile's says what the element is (frame item 3),
every other one's is its verb and its label.

1. **Collapsed tiles.** `cpt_1` shows the user line "You state as
   Gerhardt.", a list "Statements of timeline 'C.Debussy - …'" of three
   tiles headed "C.Debussy - Clair de Lune, Maria João Pires live at
   Jardin Musical is a video.", "performed by Maria João Pires", "same
   as"; each tile's expand button has `aria-expanded="false"` and its
   pairs are hidden. No "Status" text and no Reject button anywhere. The
   candidates read "Candidates (1)" and "Believed false by you (0)", the
   offered row "is a recording of Clair de lune". The bundle's first tile
   reads "Nothing states yet what LayerIt, Clair de lune mm. 1–6 (Pires)
   is." and offers "State what it is".
2. **Expanded.** One click on "performed by"'s expand button: expanded,
   its pairs shown, each its own row whose pair reads `rel:prf
   viaf:113931950 ↗` and `wdt:P175 wd:Q235650 ↗` (two anchors with
   `rel="noreferrer"`, `target="_blank"`, titled with the IRI each value
   stands for), each row with a button reading "Provenance", named
   "Provenance of rel:prf viaf:113931950" and "Provenance of wdt:P175
   wd:Q235650", collapsed (`aria-expanded="false"`), and one "＋ Add
   vocabulary". A row is its pair and its button, so the pair is read from
   its own span. "same as" reads `schema:sameAs youtube:Ch2mrPm1JnM ↗`,
   the anchor titled and linking to
   `https://www.youtube.com/watch?v=Ch2mrPm1JnM`; on `clt_6` "is a version
   or edition of" reads `schema:exampleOfWork
   mbid:8d331505-4d88-39ae-81c7-bec5da77af96 ↗`, titled with its
   MusicBrainz IRI, and its Wikidata line's basis reads the same slug
   with the same title.
3. **Provenance.** The provenance of `wdt:P175`: the paradata "stated by" `P`,
   "method" reconciled, "service" Wikidata's API, "note" "Portuguese
   pianist; the video's title names her", "date" 2026-11-18; the belief
   "https://example.org/people/editor believes it true (2026-11-18)"; the
   buttons True, Unlikely, False (none pressed) and Remove. The provenance of
   `rel:prf`: "No one has stated a belief.". The provenance of a pair of "is a":
   "No provenance entry: the manifest states it." (a pair listed in
   `statements` is stated by the manifest; no other actor is named).
4. **Believing a stated pair.** False in `wdt:P175`'s provenance: one
   journal entry whose `set` changes `cpt_1`'s `provenance` alone, entry 1
   holding `P`'s and `G`'s beliefs; the tiles unchanged (the pair stays
   stated); False pressed; two beliefs listed. Unlikely then: one more
   entry, Unlikely pressed and False not, still two beliefs.
5. **Remove.** Remove in `rel:prf`'s provenance: the "performed by" tile
   keeps `wdt:P175`, now after "same as" (tiles follow their first pair in
   code-point order), and takes the focus. On `dpt_1`, Remove on both pairs
   of "is a" (the tile expanded again after the first): the empty "is a"
   is left, keyed `is_a`, and the focus is on "＋ Add statement".
6. **Candidates.** On `cpt_1`, True in the candidate's provenance (which
   adds "Believing a candidate true states it."): one
   journal entry, a fourth tile "is a recording of Clair de lune" that has
   the focus, "Candidates (0)". On `dpt_1`, False in its candidate's
   provenance: one entry, "Candidates (0)", "Believed false by you (1)", the
   focus on the Candidates summary; Unlikely in the set-apart row's
   provenance: one entry, "Candidates (1)", "Believed false by you (0)", the
   focus on that list's summary.
7. **Paste.** On `cpt_2`, "＋ Add statement", a paste of
   `https://www.wikidata.org/wiki/Q235650` into Value: Vocabulary reads
   "Wikidata", the Verb field has the focus; "performed by" picked and
   Add: one journal entry, the change on `cpt_2` holding `"wdt:P175":
   [{"id": "wd:Q235650", "label": "Maria João Pires"}]` and one entry
   `manual` by `G` on 2026-11-20 with `G`'s belief `"true"`; the new tile
   has the focus. A paste of `https://example.org/x` posts "The address is
   no identifier the catalogue knows; choose “Other property…” to state
   it."
8. **An element.** On `cpt_2`, verb "is derived from, is based on",
   vocabulary "An element of this manifest", the Value options list the
   other timelines (`clt_6`, `cpt_1`, `dpt_1`), not `cpt_2`; `#clt_6`
   picked and Add states `"dcterms:source": [{"id": "#clt_6"}]`.
9. **Other property.** "Other property…" with `dcterms:subject`, a text
   in a language, "Nocturne" in `fr`: Add states `"dcterms:subject":
   [{"@value": "Nocturne", "@language": "fr"}]`; a property `foo` keeps
   Add disabled with "Write the property as a compact IRI with a known
   prefix or in full."
10. **＋ Add vocabulary.** On `cpt_1`'s "performed by", expanded, "＋ Add
    vocabulary": the Verb field is disabled on "performed by", the
    Vocabulary options are MusicBrainz, GND, "MeLODy / LRMoo"; GND picked,
    the Value options offer "Pires, Maria João" (Wikidata's
    cross-reference resolved in the GND); Add states it in the same
    rectangle (now labelled "Pires, Maria João", the first node label in
    file order) as `rel:prf {id: "gnd:124927521", label: "Pires, Maria
    João", "schema:sameAs": [{id: "wd:Q235650"}], provenance: [the tie of
    edit 6]}` with the entry `reconciled`, service
    `https://www.wikidata.org/w/api.php`, basis
    `http://www.wikidata.org/entity/Q235650`, match `exact`, `G`'s belief
    `"true"`. Cancel instead closes the composer and gives the focus back
    to "＋ Add vocabulary". With a lookup whose Wikidata entity names no
    GND record (so nothing is offered) and which searches the GND,
    finding "Pires, Maria João" for "Pires" after the search's 250 ms:
    picked and added, the value is tied the same way (the user chose it
    for the same thing), but its entry is `manual` by `G` on 2026-11-20
    with no `basis`, `service` or `match`: no service reconciled it with
    the rectangle's thing.
11. **The user.** "Change…" opens the dialog "Your name"; an empty name
    shows "A name is required."; "Clara Wieck" with
    `https://orcid.org/0000-0002-1825-0097` saved reads "You state as
    Clara Wieck (ORCID iD 0000-0002-1825-0097).", and stating the
    candidate then records the belief `"true"` of the actor
    `https://orcid.org/0000-0002-1825-0097`.
12. **Refusals.** A store refusal is posted as information (as every
    refusal of a change to what is open, ADR 0037) with its message, and
    as nothing else; a throw of the statement functions is posted as the
    error "The statement could not be changed: …" and as nothing else;
    neither journals anything.
13. **State belongs to the element.** The composer opened on `cpt_2` is
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

## Proposed matches and picking on the canvas (`metadata-proposals.test.ts`)

A name stated without an identifier is a value node with a `label` and no
`id`. Bulk proposals look such names up and write the best match as
TiLiE's candidate, never stated; believing it true states the identified
thing in place of the one name it can be for, found by structure (a name
under a property of the same IRI on the candidate's subject), never by
reading the entry's `note`, which is words. What
proves it is the exact `set` each step builds on the LayerIt store (`L`,
block `A`, the date fixed at 2026-11-20), with `cpt_2` (`["timelines", 1,
"children", 0]`, no statements in the fixture) first given by one accepted
`set` the statements `N` = `{"dcterms:subject": [{"label": "Nocturne"}],
"rel:prf": [{"label": "Maria João Pires"}], "wdt:P2550": [{"label": "Clair de
lune"}]}`. The candidates come from the recorded answers ("Looking values
up"), the lookup created over the replaying `fetch`, so every value below is
read from a recording, never typed from the implementation; `T` is
`https://github.com/TimeToAlign/TimeLineEditor`, `G` the default user's tag.

- **Which names.** Pairs are read in code-point key order. For `cpt_2`'s
  frame the names are `rel:prf` "Maria João Pires" (performed by: kind
  agent) and `wdt:P2550` "Clair de lune" (recording of: kind work), each at
  subject `cpt_2` and held by `cpt_2` (the element whose statements hold
  it), each offered in `["wikidata", "gnd"]` without a server
  and `["wikidata", "gnd", "musicbrainz"]` with one; `dcterms:subject`
  "Nocturne" is no catalogue verb's and is left out. `cpt_1`'s frame finds
  the same two (`cpt_2` lies below it; every node of `cpt_1` has an `id`),
  `clt_6`'s none, and the lookup `NO_LOOKUP` none anywhere. A name inside
  a value node is found at that node: `cpt_2` given `{"rel:prf": [{"label":
  "Maria João Pires"}], "wdt:P2550": [{"id": "wd:Q29117946", "wdt:P175":
  [{"label": "Maria João Pires"}]}]}` yields `rel:prf` at `cpt_2` and
  `wdt:P175` at `[…cpt_2, "statements", "wdt:P2550", 0]`, both held by
  `cpt_2`.
- **One call per system and kind**, systems in the order Wikidata, GND,
  MusicBrainz, each name once: for `N` without a server `[wikidata agent
  ["Maria João Pires"]], [wikidata work ["Clair de lune"]], [gnd agent
  ["Maria João Pires"]], [gnd work ["Clair de lune"]]`; the nested case
  asks "Maria João Pires" once per system.
- **Answers.** Asked over the recordings, Wikidata's first agent is
  `http://www.wikidata.org/entity/Q235650` "Maria João Pires" and its first
  work `…/Q29117946` "Clair de lune"; the GND's first work is
  `https://d-nb.info/gnd/1173441581` and its first agent for "Maria João
  Pires" `https://d-nb.info/gnd/1057057150` (the recording
  `gnd-search-agent-maria-joao-pires.json`); every system answers, so no
  failure is named. A system that fails is named among the failures while
  the other answers stand: with Wikidata unrecorded for "Pires, Maria
  João" (below), the failures are `["wikidata"]`.
- **Proposals.** On `cpt_2`'s frame they become one `set` on `{block: A,
  id: "cpt_2"}` holding `provenance` alone (the statements unchanged): the
  candidates `{property: "rel:prf", value: {id: "wd:Q235650"}, stated_by:
  [T], date: "2026-11-20", method: "reconciled", service:
  "https://www.wikidata.org/w/api.php", note: "found for the name “Maria
  João Pires”"}` and the same for `wdt:P2550` with `wd:Q29117946` and
  "found for the name “Clair de lune”": Wikidata's candidate is preferred
  though the GND answered both too, and Wikidata's search says nothing of
  a match, so the entry states no `match`; TiLiE holds no belief, so none
  is written. Both went to `cpt_2`: `placed` is `[{holder: "cpt_2",
  count: 2}]`. Proposing again proposes nothing (count 0, no command), nor
  after the user believes the first candidate false. With Wikidata
  unreachable, `rel:prf` "Pires, Maria João" gets the GND's first,
  `gnd:1057057150` (lobid ranks "Pires, Maria João Marques" first, not the
  pianist's 124927521: the reason these are candidates), service
  `https://lobid.org/gnd/search`, no `match`. A candidate whose service
  says it matches (MusicBrainz's `match: true` for
  `http://musicbrainz.org/work/199ec7b6-ce07-34e9-85ca-fcf89fe808c9`
  "Clair de Lune", given as the only answer) is written with `match:
  "exact"`, its IRI kept absolute.
- **What the panel says** (`proposedText`, words given by hand). All on
  the element shown (`placed` `[{holder: "cpt_2", count: 2}]`, here
  `cpt_2`): "Proposed 2 matches: they are listed under Candidates.", one:
  "Proposed 1 match: they are listed under Candidates.". Some elsewhere
  (`[{holder: "cpt_1", count: 2}, {holder: "clt_6", count: 1}]`, here
  `cpt_1`, the words of an ID `x` "timeline 'x'"): "Proposed 3 matches: 2
  here, 1 on timeline 'clt_6'; each is listed under Candidates of the
  element it is proposed for."; none here (`[{holder: "cpt_2", count:
  1}]`, here the bundle, `null`): "Proposed 1 match: 0 here, 1 on
  timeline 'cpt_2'; each is listed under Candidates of the element it is
  proposed for.".
- **Stating for a name.** With the two candidates stored, `statedForName`
  of the `rel:prf` row by `G` gives one change on `cpt_2`: `rel:prf`
  becomes `[{id: "wd:Q235650", label: "Maria João Pires"}]` (the name's
  node with the thing's `id`: the label-only node is gone), `wdt:P2550`
  and `dcterms:subject` stay, and its entry is kept as made (`stated_by:
  [T]`, method, service and note) with `beliefs: [{actor: G, belief:
  "true", date: "2026-11-20"}]`. `cpt_1`'s own candidate (no name under
  `wdt:P2550` there) is no such candidate (`null`), nor is the `rel:prf`
  row where `cpt_2` states two names under `rel:prf` ("Maria João Pires"
  and "Clara Wieck"): which one it is for, the structure does not say.
- **The element as it stands.** `frameIn` gives the frame over the
  store's current manifest; after `remove cpt_2`, `null`.
- **The tab** (the Inspector mounted with a stub lookup whose `reconcile`
  answers Wikidata's candidates above and nothing elsewhere, and a
  `Picking`): on `cpt_2` with `N` the Candidates list offers "Propose
  matches for unreconciled names" with "2 names without an identifier
  here and below"; pressed, one journal entry, "Candidates (2)" and the
  information "Proposed 2 matches: they are listed under Candidates.";
  the names stay without an identifier until a candidate is stated, so
  the offer stays. Pressed again, nothing is journalled and "No new match
  was found for the 2 names." is posted. True in the `rel:prf` row's
  provenance: one journal entry whose `set` states `cpt_2`'s statements as
  under Stating for a name, "Candidates (1)", "1 name without an
  identifier here and below". On `cpt_1` (its names all lie on `cpt_2`
  below it; it has one candidate of its own), the count reads "2 names
  without an identifier here and below"; pressed, one journal entry,
  `cpt_1`'s list still "Candidates (1)", and the information "Proposed 2
  matches: 0 here, 2 on timeline 'cpt_2'; each is listed under Candidates
  of the element it is proposed for."; `cpt_2` then shows "Candidates
  (2)".
- **One lookup, the panel's.** With a stub lookup whose `reconcile` waits
  until the test releases it: pressed on `cpt_2`, its count reads "Looking
  them up…" and the button is `aria-busy="true"`; `cpt_1` selected
  meanwhile shows "2 names without an identifier here and below" and
  `aria-busy="false"`; `cpt_2` selected again reads "Looking them up…";
  released, the candidates land on `cpt_2` ("Candidates (2)") and its count
  reads "2 names without an identifier here and below".
- **Picking an element.** On `cpt_2`, "derived from" in the vocabulary "An
  element of this manifest": "Pick on the canvas" shows (and not for
  another vocabulary, and not without a `Picking`). Pressed, the picking
  is active, the button pressed, the status line reads "Pick a timeline or
  a region on the canvas; Escape cancels."; the canvas's answer `{block:
  A, id: "clt_6"}` fills Value with "Clair de lune, mm. 1–6 (MEI)
  (timeline)", gives it the focus and ends the picking; Add states
  `"dcterms:source": [{"id": "#clt_6"}]`. Escape (on the window, wherever
  the focus is) ends a picking with nothing chosen, the composer open and
  the focus on the button. An answer in another block posts "That element
  lies in another block; pick a timeline or a region of this one."; `cpt_2`
  itself "The element shown cannot be its own value; pick another timeline
  or region."; Value stays empty. Closing the composer ends the picking.

## The message bar (`messages.test.ts`, `shell.test.ts`)

The editor has one message system (ADR 0037): one store (`Messages`), one
bar, three levels. What proves it:

- **Levels and order.** Posting a warning, then information, then an error
  shows exactly `[["warning", "Refused."], ["info", "Copied 2.0."],
  ["error", "Not saved."]]` as `[level, text]`, in the order posted.
- **Information leaves, nothing else does** (fake timers): `INFO_DURATION_MS`
  is 3000; at 2999 ms all three are shown, at 3000 ms exactly
  `[["warning", "Refused."], ["error", "Not saved."]]`, and still exactly
  that 60 000 ms later; dismissing each by its id empties the list.
- **Information stays long enough to be read.** One rule gives the time:
  `INFO_MS_PER_WORD` is 300 (200 words a minute), and information stays
  `INFO_DURATION_MS` or `INFO_MS_PER_WORD` for each of its words (parts of
  the text apart by white space), whichever is longer
  (`infoDurationOf`). A text of ten words stays exactly 3000 ms, one of
  eleven 3300 ms; empty or all white space, 3000 ms; words apart by
  several spaces or a line break count once each. `HOW_TO_START_A_SERVER`
  holds 36 words, so it stays `36 × INFO_MS_PER_WORD`, and posted it is
  still shown 1 ms before that time and gone at it; every test of that
  message, end to end too, reads its time from `infoDurationOf`, never
  from a number of its own.
- **The same information shows once.** Information posted while
  information of the same text is shown replaces it: posted at 0 ms and
  again at 2000 ms (a warning of the same text between them), the list is
  `[["warning", "Again."], ["info", "Again."]]` at 2000 ms, the information
  is still shown at 4999 ms and gone at 5000 ms, the warning kept; one
  timer is pending in between. A warning or an error posted twice is shown
  twice.
- **Timers.** Information dismissed before its time leaves no timer
  pending; disposing the store with two pieces of information shown leaves
  none.
- **The bar.** One card (`data-testid="message"`) per message, in the
  store's order, its `data-level` the level, no `role` (no card is a live
  region), its level word ("Info", "Warning", "Error") in `.level`, its
  text alone in the `p`, its problems listed, and a Dismiss button that
  dismisses that card alone. With a warning, information and an error
  shown, the cards read exactly `[["warning", null, "Warning",
  "Refused."], ["info", null, "Info", "Copied."], ["error", null, "Error",
  "Not saved."]]`; the cards are siblings in one column, so none is drawn
  over another (the end-to-end test checks the boxes in the browser). No
  card takes the focus: the focused element before the messages are
  posted is the focused element after.
- **The announcers.** A screen reader announces a live region reliably
  only when the region was in the document before its content changed, so
  the bar holds two regions from its first drawing on, whatever it shows:
  one `role="status"` (`data-testid="messages-status"`) and one
  `role="alert"` (`data-testid="messages-alert"`), both visually hidden
  and in the accessibility tree. Mounted with no message, both exist and
  are empty. Each holds one line per message shown of its levels, the
  level word and the text ("Info: Copied."), so a message posted adds
  exactly its line and a message leaving removes only its own: after a
  warning, information and an error are posted, the status region reads
  exactly `["Info: Copied."]` and the alert region `["Warning: Refused.",
  "Error: Not saved."]`; after the information is dismissed the status
  region is empty and the alert region unchanged. The two are the only
  `role=status` and `role=alert` elements of the bar.
- **One way to post.** The editor gives its components one function,
  `post(level, text, problems?)`, through the component context; a
  component mounted without it throws "no component above this one
  provides post". In the editor, a Copy in the Timestamp tab (a named
  timestamp selected through the hook: `bundle_mixed`'s `timestamp_9`,
  `score`'s origin; the Copy of the value of its row "coordinate", picked
  by its label, since the rows of `score`'s maps lie above its line and
  come first) posts "Copied 0." as information, and a refused workspace
  file an error.
- **The canvas's refusals are information.** The editor passes the
  arranger's `onrefuse` to the store as information (`shell.test.ts`: in
  the group editor of `bundle_mixed`'s `group_1`, the group selected,
  Delete on the arranger posts exactly `[["info", "Close its editor to
  delete the edited element."]]`); no element of the canvas shows a
  refusal itself.
- **Information beside a warning, end to end** (`e2e/matchclaim-loading.spec.ts`): with the
  health check refused and a warning shown (an address the hook could not
  select), pressing M shows `HOW_TO_START_A_SERVER` as
  information beside the warning: both visible, their boxes not
  overlapping, the information's card `data-level="info"` with the
  information's colours (border `rgb(122, 167, 217)`, background
  `rgb(238, 245, 253)`), the warning's amber (`rgb(201, 162, 39)`,
  `rgb(255, 248, 225)`). 1 ms before `infoDurationOf` its text (the page's
  clock run forward) the information is still shown, at that time it is
  gone, and the warning stays.

The level of every message the editor posts follows ADR 0037's one rule:
every refusal of a change to what is open (a gesture, a key or a pick on
the canvas, a filter, a statement or an arrangement the store refused), a
value copied, a size replaced by its minimum, a table loaded or saved, a
copy that failed, a lookup that could not be searched and
`HOW_TO_START_A_SERVER` / "No MatchClaim table loaded." are information;
a file not opened because of what was picked with it, a table not loaded
for lack of a manifest naming it, addresses a host asked for that could
not be selected and autosave active elsewhere are warnings; a workspace,
manifest, example or table that could not be opened, imported, loaded,
restored, exported or saved, a belief not recorded, a statement that could
not be built and autosave not working are errors.

## Words (`inspector-subject.test.ts`, `journal.test.ts`)

The words are the editor's; what they name is core's resolver's. The
oracles are the committed end-to-end workspaces, a store of
`bundle_mixed` three times (as it is; without its title, with the id
`mixed` and two names dropped; without its title), and a store of the
schema package's `bundles/bundle_matchstamps` as block `0000000000`
(the bundle "MatchStamps": `matchstamp_1` "Bar 2, downbeat (take 1)" with
`anchor_1`, whose `display` lists `name`; `matchstamp_2` "Bar 2, downbeat
(take 2)" with `anchor_2`; the match timestamps `timestamp_1`, without a
name, and `timestamp_3` "Take 2, bar 2"; the ordinary timestamp
`timestamp_4` "origin").

1. **The subject beside the heading.** One address gives the words of what
   it names, then its name, or its id without one: `bmixed0000` "Bundle"
   "Mixed"; its title "Title of bundle"; `group_1` "Group" "Performance"
   and its title "Title of group"; `score` "Timeline" "Score", its card
   "Card of timeline", its name "Name of timeline"; the timestamp `timestamp_9`
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
   the start of the member `excerpt`, whose marks on its ancestor lines
   are gone (its `origin` groupstamp crosses them instead);
   a part of a card; a band with a part; a band of a group or of a jump;
   the card of a timeline drawn in no card, `{block: "styled0000", id: "a",
   part: ["card"]}`). In the MatchStamps store: `matchstamp_1`
   "MatchStamp" "Bar 2, downbeat (take 1)"; a stored elision
   `elision_1` of `score` (added by `add {into: score, elision: {start: [1,
   1], end: [2, 1]}}`) "Elision" with its id `elision_1`, as an anchor,
   since an elision has no name; `anchor_2` "Alignment anchor"
   with its id `anchor_2` (an anchor has no name); `anchor_1`'s drawn
   label `{part: ["name"]}` "Name of alignment anchor" with the id
   `anchor_1`; the match timestamp `timestamp_1` "Timestamp" with its id,
   `timestamp_3` "Timestamp" "Take 2, bar 2". Mounted, the words stand beside the
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
   new name, and one that is gone by its ID): on the three-block store,
   "Added bundle 'mixed'" for a block the view holds; a block the view
   does not hold (its import undone, or the block removed since) by the
   manifest the `add` itself carries, worded as a held block's bundle, so
   an undone import still says what was undone: the three-block store with
   its three `add`s undone holds no block, and its rows still read, newest
   first and each undone, "Added the anonymous bundle", "Added bundle
   'mixed'", "Added bundle 'Mixed'", the sentences they read before the
   undo; only a command carrying no manifest is worded by the block's ID
   ("Added block '0000000003'"); "Added timeline 'Viola' to bundle 'Mixed'"
   (an added element by its name, else its id), "Added region 'region_1'
   to timeline 'Score' in bundle 'Mixed'", "Added a region to timeline
   'Score' in bundle 'Mixed'" for a value without either, "Added
   timestamp 'Upbeat' to timeline 'Score' in bundle 'Mixed'", "Set display
   of timestamp 'origin' in bundle 'Mixed'" (and `name` alike), "Removed
   timestamp 'origin' in bundle 'Mixed'", "Added MatchStamp 'Bar 4' to
   bundle 'Mixed'" (an `add` of a `matchstamp` into the block, by the
   value's name); in the MatchStamps store's view, whose one block needs
   no bundle words, "Set name of MatchStamp 'Bar 2, downbeat (take 1)'",
   "Set display of alignment anchor 'anchor_2'", "Removed MatchStamp
   'Bar 2, downbeat (take 2)'"; an `add` of an elision into `score`, whose value
   states no id, "Added an elision to timeline 'Score' in bundle 'Mixed'"
   (the article is "an" before a vowel); "Set x, y of
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
active one, each expected state written out, every open state's list
shown (open with options, a search running or content for no results):

| Key | Closed | Open |
|---|---|---|
| ArrowDown | open; the first option active (none for 0 options) | the next option; after the last, the first; none for 0 options |
| ArrowUp | open; the last option active (none for 0 options) | the previous option; before the first (or from none), the last |
| Alt+ArrowDown | open; still none active | unchanged, handled |
| Alt+ArrowUp | unchanged, not handled | closed, none active, the text kept |
| Enter | the text entered, unchanged | with an active option: closed, that option picked; without: closed, the text entered |
| Escape | with text: the text cleared; without: unchanged, not handled | list shown: closed, none active; no list shown, with text: closed, the text cleared; without: unchanged, not handled |
| Home, End, ArrowLeft, ArrowRight | not handled; none active | not handled; none active, still open |
| Tab | unchanged, not handled | closed, none active, not handled (the focus moves on) |
| any other key ("a", Shift) | unchanged, not handled | unchanged, not handled |

Alt changes only the two arrows: Alt+Enter is Enter, Alt+Escape is
Escape. An open state whose list is not shown (text, no option, no search,
no content for no results) takes Escape as a closed one: with "Clr" it
clears the text and closes, handled, so one press does it; with no text it
is not handled. An active option outside the options (a list that shrank) counts as
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
   the focus stays in the field; so are `pointerdown` and `mousedown` on the
   `empty` snippet's content (item 6), the focus staying in the field. A primary-button `pointerup` on option 2
   picks "Clara Haskil" and closes; a secondary-button one picks nothing.
5. **Leaving.** Focus moving to a button outside the combobox closes it; a
   `focusout` whose related target lies inside it does not.
6. **When the list shows.** With text and no options: the listbox stays
   hidden without the `empty` snippet, and one Escape clears "Clr" (the
   text recorded "", the key consumed, not seen by the parent); with it, the list shows and holds
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

## Type profiles (`profiles.test.ts`, `profiles-dialog.test.ts`)

Type profiles are the viewer's application settings: types of thing with
their "is a" patterns per catalogue system, the verbs usually stated of
such a thing and their preferred lookup systems, and the viewer's lookup
services (Reconciliation Service API endpoints). They are one state per
editor (`ProfilesState`), given to its parts through context, kept in the
browser's `localStorage` only under the key the host names
(`StorageOptions.profilesKey`; the page's `tilie.profiles`), never in a
workspace or a manifest, and travel as a YAML file of the shape `{profiles: [{id, label,
is_a: {<system>: [{pattern}]}, verbs, lookup}], services: [{id, name,
endpoint}]}`. What proves them is that a file is read exactly or refused
with the first problem's path, written back byte for byte, kept across a
page, and that the Metadata tab's choices and the lookup follow the
profiles in force; the expected texts are written out here by hand from
the shipped catalogue (its systems, verbs and types), never produced by
running the code. The tests' profile `lecture_recording` is `{id:
lecture_recording, label: "lecture recording", is_a: {fallback: [{pattern:
{type: ["schema:AudioObject"]}}]}, verbs: [performed_by, recorded_at_on],
lookup: [wikidata]}`, the test service `{id: mb, name: "MusicBrainz route",
endpoint: "http://127.0.0.1:8000/api/reconcile/musicbrainz"}`.

**The file** (`profiles.test.ts`). The file of `lecture_recording` and no
service is, in canonical YAML, the 13 lines `profiles:`, `  -`, `    id:
lecture_recording`, `    is_a:`, `      fallback:`, `        -`, `
pattern:`, `            type: ["schema:AudioObject"]`, `    label: "lecture
recording"`, `    lookup: [wikidata]`, `    verbs: [performed_by,
recorded_at_on]`, `services: []` and an empty line (keys by code point,
scalar lists on one line); reading it and writing it again gives the same
bytes. JSON text with the same value reads alike. Each rule is refused
alone, with the message `<path>: <reason>` (the path's members joined by
`/`, none for the root): a text that is no YAML begins "The file is no
YAML or JSON: "; `[]` → "a profile file is an object"; a root member
`types` → "'types' is no member here"; no `services` → "'services' is
missing"; a service id `m b` → "services/0/id: 'm b' is no service id: use
A–Z, a–z, 0–9, _ and - only"; an endpoint `ftp://x.org/` →
"services/0/endpoint: 'ftp://x.org/' is no http or https URL"; two services
`mb` → "services/1/id: 'mb' is given twice"; a profile id `Lecture` →
"profiles/0/id: 'Lecture' is no profile id: use a–z, 0–9 and _ only"; an
empty label → "profiles/0/label: a label is a non-empty text"; an "is a"
system `discogs` → "profiles/0/is_a/discogs: 'discogs' is no system of the
catalogue"; a type `foo:Bar` → "profiles/0/is_a/fallback/0/pattern/type/0:
'foo:Bar' is no IRI: write it absolute or with a prefix the catalogue
declares"; a pattern `{}` → "profiles/0/is_a/fallback/0/pattern: a pattern
states at least one pair"; a verb `recorded` →
"profiles/0/verbs/0: 'recorded' is no verb of the catalogue"; `performed_by`
twice → "profiles/0/verbs/1: 'performed_by' is given twice"; a lookup
system `service:x` without that service → "profiles/0/lookup/0:
'service:x' is no system of the catalogue and no service of the file",
while `service:mb` with the service `mb` is read; two profiles
`lecture_recording` → "profiles/1/id: 'lecture_recording' is given twice".

**The catalogue offered** (`profiles.test.ts`). With no profile and no
service, the catalogue offered is the shipped one itself. With
`lecture_recording`, the types begin `lecture_recording` and then hold the
shipped seven in their order; a profile `video` (label "film") replaces the
shipped `video` and comes first, the other six following in their order.
The service `mb` is the system `service:mb` named "MusicBrainz route",
after the shipped ten. Through the Metadata tab's own functions, over a
state's `catalogue` (an editor's without storage, the profiles `set` on
it): the "is a" pairs `[["type", "schema:AudioObject"]]` give
the types `lecture_recording`, `recorded_performance`, `dj_set` (each
states it once, the profile first), so the Verb options begin "is a",
"performed by", "recorded at, recorded on", "is a recording of"; without
profiles they begin "is a", "is a recording of", "performed by". The type
options of "Other vocabularies" are "lecture recording", "recorded
performance", "video", "printed or scanned edition", "score encoding",
"DJ set". "performed by"
offers the vocabularies Wikidata, MusicBrainz, GND, MeLODy / LRMoo,
Other vocabularies, MusicBrainz route, An element of this manifest (the
service after the catalogue's systems, since the fallback pattern takes a
thing); "is a", whose fallback takes no thing, offers no service. A change
of the profiles is seen at the next read: a `$derived` over the state's
catalogue's first type, followed outside a component (`follow.svelte.ts`),
gives `musical_work`, then `lecture_recording` after `set`.

**The vocabularies a subject prefers** (`profiles.test.ts`). The
vocabularies of a verb lead with the lookup systems of the subject's types,
the first type's first (each type's `lookup`, profile or catalogue type
alike), the others following in catalogue order. "performed by" offers,
in catalogue order, Wikidata, MusicBrainz, GND, MeLODy / LRMoo, Other
vocabularies, An element of this manifest; for a subject of the shipped
type `release` (lookup `[musicbrainz, wikidata]`) MusicBrainz, Wikidata,
GND, MeLODy / LRMoo, Other vocabularies, An element of this manifest; for
one of `lecture_recording` (lookup `[wikidata]`) and then
`recorded_performance` and `dj_set`, as the "is a" `type
schema:AudioObject` gives them, Wikidata first: Wikidata, MusicBrainz,
GND, MeLODy / LRMoo, Other vocabularies, An element of this manifest; for
one of a profile `lookup: [gnd, wikidata]` GND, Wikidata, MusicBrainz,
MeLODy / LRMoo, Other vocabularies, An element of this manifest. The
element choice stays last whatever the types.

**Kept where the host says** (`profiles.test.ts`, `shell.test.ts`,
`embed.test.ts`). With the key `tilie.profiles`: nothing stored gives no
profiles; `set` stores the file's canonical YAML under the key and a new
state reads it back equal; a stored text that is no profile file (not
YAML, `[]`, a profile naming an unknown verb) gives no profiles; storage
throwing on read or write leaves the profiles set in memory. Without a key
a state reads and writes no storage at all (`getItem` and `setItem` spied:
not called) and holds what is `set`. An embedded editor with `storage:
null` whose "Type profiles…" dialog adds a profile and saves calls neither
`getItem` nor `setItem` and leaves `localStorage` empty; the page (`App`)
reads a profile file stored under `tilie.profiles` at mount (its dialog
lists it) and stores the saved profiles there.

**The services' lookup** (`profiles.test.ts`), through `createLookup` with
the services given and the replaying `fetch` of "Looking values up",
answering requests without a type by hand from the route's recordings. The
service searches every kind and resolves nothing; a system `service:x` no
service names is neither. Searching "Pires" reads the manifest (which
offers suggestions) and asks `…/suggest/entity?prefix=Pires`, without a
type: 10 candidates from `musicbrainz-search-agent-pires.json`, the first
`{system: "service:mb", iri:
"http://musicbrainz.org/artist/7f3a2f7e-6277-4d72-b673-f3a8128a6aa0",
label: "Alexandre Pires", description: "Person · Brazil", image: null,
crossReferences: [], service:
"http://127.0.0.1:8000/api/reconcile/musicbrainz", match: false}`, and no
`Authorization` header. A service whose manifest (written by hand:
identifier space `https://example.org/entity/`) offers no suggestions is
searched by one reconciliation query `{q0: {query, limit: 10}}`.
Reconciling "Clair de lune" and "" sends one request `{q0: {query: "Clair
de lune", limit: 3}}`, answered from
`musicbrainz-reconcile-work-clair-de-lune.json`: the best candidate
`work/199ec7b6-…` "Clair de Lune" with `match` true, and `null` for the
blank text. Without services given, a lookup has none: `service:mb` is
not searchable.

**Editing helpers** (`profiles.test.ts`). The "is a" choices are the
systems the catalogue's "is a" has a pattern in, in catalogue order:
Wikidata, MusicBrainz, GND, MeLODy / LRMoo, Other vocabularies; the
choices of "Other vocabularies" are `type schema:AudioObject` (recorded
performance, DJ set), `type schema:VideoObject` (video), `type
schema:SheetMusic` (printed or scanned edition, score encoding). Stating a
pattern appends it to its system, unstating removes it and a system left
without one; moving the first verb up, or the last down, changes nothing.
Lookup systems are kept in the order of the choices (the catalogue's
systems but the fallback, then the services). A new profile from nothing
is `type_1` "new type" (`type_2` when `type_1` is taken); from the
catalogue type `video` it is `video` with video's patterns (notes
dropped), verbs and lookup, and `video_2` when `video` is taken.

**The dialogue** (`profiles-dialog.test.ts`), mounted alone in jsdom with
an editor's profiles kept under `tilie.profiles` in its context and
`files.ts` replaced by a stub that answers the file picker with a given
text and records saved texts. Opening shows the editor's profiles, the first
selected and focused. Add profile with "an empty profile" adds `type_1`,
selects it and focuses its ID; its label and ID edit the draft; ticking
`type schema:AudioObject` under "Other vocabularies", adding the verbs
"performed by" and "recorded at, recorded on", moving the second up (the
focus stays on its Move up, now disabled, so on its Move down), ticking
Wikidata under lookup, then Save stores exactly the profile so built; the
dialog closes. Cancel and Escape (the dialog's `close`) drop the draft and
store nothing. Delete removes a profile and focuses the next. Save of a
draft with an empty label shows "profiles/0/label: a label is a non-empty
text" as an alert and stores nothing. Import YAML… replaces the draft with
the file's profiles; a file that is no profile file shows "<name> holds no
type profiles: <problem>" and keeps the draft. Export YAML… saves the
draft's canonical YAML as `profiles.yaml`, and refuses a draft with a
problem without saving. Services are added (`service_1`, "service 1",
`https://`), edited and deleted, and a saved service appears among the
lookup choices of the next opening. A service's lookup system follows the
service in every profile: with `lecture_recording` looking up `[wikidata,
service:mb]` and the service `mb`, changing the service's ID to `mbz`
makes the lookup `[wikidata, service:mbz]` (its place kept) and Save
stores it; deleting the service makes it `[wikidata]` and Save stores it.
A helper alone (`withServiceLookup`): renaming or removing a service the
profile does not look up in gives the profile itself.
