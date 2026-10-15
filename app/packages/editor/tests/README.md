# `@timetoalign/tilie-editor` tests

The editor is the shell: a thin header line (the title, the File menu, the
open file's name, a quiet "offline" mark when the server does not answer,
in development and test builds the fixture menu, and the About button), the arranger filling the window, and the inspector, a
drawer on the right that is closed until the viewer opens it. It checks the
server's health on mount. The component test (`App.test.ts`) mounts
`App.svelte` into a jsdom document with Svelte's own `mount` and proves the
following, each with exact values:

1. **The shell renders and nothing else.** The header's `h1` reads
   `TimeLineEditor`; the page's `h2` headings are exactly the drawer's
   `Inspector` and the closed About dialog's `About TimeLineEditor` (no
   "Arranger", no "Diagnostics"), and there is no `footer` element. The
   arranger (`role="application"`, `aria-label` `Arranger`, `tabindex` 0)
   holds the focus once the editor is mounted, so the canvas keys work
   without a click first.
2. **The token is taken from the fragment, and the fragment is cleared.**
   `tilie` opens the editor as `/#token=<token>`. With the page at
   `/?view=a#token=abc`, `fetch` (stubbed) is called exactly once with
   `/api/health` and the header `Authorization: Bearer abc`, and by then the
   location is exactly `/?view=a` with an empty `location.hash`: path and
   query survive, the token is gone from the address bar, and the history
   entry is replaced rather than added (`history.length` is unchanged).
3. **Without a fragment token, no token is sent and the URL is untouched.**
   With the page at `/?token=abc` (the query, which no longer carries the
   token), `fetch` is called exactly once with `/api/health` and the header
   `Authorization: Bearer ` (an empty token, which the server refuses), and
   the location is still exactly `/?token=abc`. This proves the query is not
   read as a second source of the token.
4. **A healthy server shows nothing.** Once the stub resolves with
   `{"name": "tilie-server", "version": "0.1.0", "timetoalign": "1.2.0"}`,
   the test hook's `health()` returns exactly that object (the value the
   About pane shows), the header holds no `.offline` element, and no text
   on the page outside the closed About dialog contains `tilie-server`,
   `0.1.0` or `1.2.0`.
5. **A failed health check shows the offline mark, never the raw error.**
   With the stub resolving to status 502, status text `Bad Gateway` (what
   Vite's proxy answers when no server runs), the header shows exactly one
   `.offline` mark reading `offline`, inside a region with
   `aria-live="polite"`. Its reason reaches every user: the `title` is
   `The server did not answer the health check (502 Bad Gateway).` for a
   pointer, the mark holds the visually hidden text `: The server did not
   answer the health check (502 Bad Gateway).` for assistive technology
   (keyboard and touch users read it in the About pane, item 15 below).
   With the stub rejecting with `TypeError("Failed to fetch")` the same
   holds with `(Failed to fetch)`. In both cases `health()` is `null`, and
   the shown text of the page (outside the closed About dialog and the
   visually hidden text) contains no `HTTP 502` and no `502`.
6. **The inspector drawer is closed by default.** With empty
   `localStorage`, the drawer (`#inspector`) is `hidden`, and the only
   inspector control is the tab, a button labelled `Open inspector` with
   text `«` and `aria-expanded="false"`, `aria-controls="inspector"`.
   Clicking it shows the drawer (not `hidden`), removes the tab and offers
   a button labelled `Close inspector` with text `»`, `aria-expanded="true"`
   and `aria-controls="inspector"`; `localStorage["tilie.inspector.open"]`
   is then exactly `"true"`. Clicking the close button hides the drawer,
   brings the tab back and stores exactly `"false"`.
7. **The open state is read back per browser.** With
   `localStorage["tilie.inspector.open"]` set to `"true"` before mounting,
   the drawer starts open; set to any other value (`"false"`, `"yes"`), it
   starts closed.
8. **Storage that throws is no crash.** With a `localStorage` whose
   `getItem` and `setItem` throw, the editor mounts with the drawer closed,
   and opening and closing it still work (the state is then simply not
   remembered).

The network is never touched: `fetch` is replaced by a stub for the duration
of each test and restored afterwards, and the mounted component is unmounted
and the document emptied after each test.
The arranger pane mounts the canvas, which needs two browser interfaces
jsdom lacks; `dom.ts` stubs them for each test: `matchMedia` (no query
matches) and a `ResizeObserver` that never reports, since jsdom lays nothing
out. What the canvas shows is proven in a browser by the Playwright suite.

Type-checking of the component and the test is done by `svelte-check` with
`--fail-on-warnings` under `pnpm typecheck`; that gate also catches the
compiler's accessibility warnings.

## Files, history and About (`shell.test.ts`, `files.test.ts`)

These mount `App.svelte` as above. jsdom has neither IndexedDB nor a modal
`<dialog>`: `dom.ts`'s `stubEditor` installs a fresh `fake-indexeddb`
factory per test and gives `HTMLDialogElement` a minimal `showModal` (sets
`open`) and `close` (removes it, fires `close`). Opening and saving go
through the fallback path unless a test installs stub pickers: a file input
whose `files` the test sets before dispatching `change`, and a download
link whose `click` the test intercepts (recording `download` and the
blob's text). Workspaces and manifests come from the installed
timeskeleton fixtures through `writeWorkspace` and `loadManifest`, never
hand-written, except the refused texts.

`files.ts` alone:

1. **`manifestFileName`** names a file after the manifest's `id`, else
   its `name`, else `manifest`, every character outside `[A-Za-z0-9_-]`
   written `_`, then `.json`: a manifest of one root with the id
   `flow:quarters` and the name "Flow" gives `flow_quarters.json`, one with
   only the name "Eroica: II" `Eroica__II.json`, an anonymous one
   `manifest.json`.
2. **`lastChanged`** is `null` for `[]`; with `TZ=UTC` an entry at
   `2026-10-12T09:05:07.000Z` gives `2026-10-12 09:05` (the last entry's
   time, local, minutes truncated).
3. **The fallback open** resolves `{name, text, handle: null}` with the
   chosen file's exact text after `change`, and `null` after `cancel`; the
   input it adds is gone afterwards and accepted `.tle.json` (a workspace)
   or `.json` (a manifest).
4. **The fallback save** downloads exactly the text under the given name
   and resolves `{name, handle: null}`.
5. **With File System Access**, open returns the picked handle; a save with
   that handle writes the text into it without a picker (the save picker
   stub is never called); a save without a handle calls the picker once
   with `suggestedName` and returns the picked handle's name. A picker
   rejecting with an `AbortError` resolves `null`; any other rejection is
   thrown.

The shell:

6. **The File menu follows the menu button pattern.** The button `File`
   has `aria-haspopup="menu"` and `aria-expanded="false"`; the menu
   (`role="menu"`) is hidden and holds exactly the items `New workspace`,
   `Open…`, `Save`, `Save as…`, `Import manifest…`, `Export manifest…`,
   `Export minimal manifest…`, with shortcuts `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S` on the second to
   fourth (jsdom's user agent is not a Mac). ArrowDown on the button opens
   it (`aria-expanded="true"`) with the focus on `New workspace`; ArrowUp
   from there wraps to `Export minimal manifest…`, ArrowDown wraps back,
   End focuses `Export minimal manifest…`, Home `New workspace`; Escape
   hides the menu and returns the focus to the button. ArrowUp on the
   closed button opens it on `Export minimal manifest…`. Both export items
   are `aria-disabled="true"` while nothing is selected.
7. **A refused workspace file leaves the open workspace.** After the hook
   loads a written workspace, choosing `Open…` and the file `{` shows one
   message whose text starts `bad.tle.json is not a workspace file` and
   whose problem reads `invalid_json at the top level: …` (an empty path is
   named in words; any other is the JSON pointer the inspector shows, `~`
   and `/` escaped as `~0` and `~1`); the store is the same object, and
   dismissing the message removes it.
8. **Unsaved changes are marked and guarded.** On a new editor the file
   name reads `untitled.tle.json` and `document.title` is
   `untitled.tle.json – TimeLineEditor`. After one accepted command both
   start with `• `. Undo (Ctrl+Z on the page) removes the mark again (the
   view is the saved one); redo (Ctrl+Y) brings it back. `New workspace`
   then opens the dialog `untitled.tle.json has unsaved changes. Discard
   them?` with `Discard` and `Cancel`; Cancel keeps the store; Discard
   gives a new empty store with no mark.
9. **Save writes `writeWorkspace` of the store and clears the mark.** A
   save requested while one is under way is ignored: with a save picker
   whose file only closes when the test lets it, a second Ctrl+S and a
   Ctrl+Shift+S meanwhile call the picker no second time and write once,
   and the name becomes the picked `w.tle.json`.
   Ctrl+S (fallback path) downloads `untitled.tle.json` whose text equals
   `writeWorkspace` of the store's view and journal, and the mark is gone.
10. **Undo keys belong to text inputs there.** With the focus in a
    `<textarea>` on the page, Ctrl+Z dispatches no undo (the journal keeps
    its length) and the event's default is not prevented; on the page body
    Ctrl+Shift+Z redoes. After an undo removes a selected block, the
    selection is `[]`.
11. **Import adds one block at the centre of the view, selected.** jsdom
    lays nothing out, so the canvas reports a 0 × 0 pane at the viewport
    `{0, 0, 1}`, whose centre is `(0, 0)`: importing the manifest fixture
    `nested` journals exactly one `add` whose block has a ten-character id,
    `x` 0, `y` 0 and the fixture's manifest, and the selection is exactly
    that id. The centre arithmetic itself is `addCommand`'s, tested with
    exact values in the arranger. A refused manifest (`{"meta": {}}`)
    shows a message and journals nothing.
12. **Export writes the selected block's manifest, complete or minimal.**
    With `{block}/clt_3` of a `nested` block selected, `Export manifest…`
    downloads a file named `manifestFileName` of the block's manifest whose
    text equals `saveManifest` of it (the complete form), and `Export
    minimal manifest…` one of the same name whose text equals
    `saveManifest(manifest, {minimal: true})`; with two blocks selected
    both items are `aria-disabled`.
13. **Recovery is offered and honoured.** The slot `current` holds a
    snapshot `{text, name}` while, and only while, the open workspace is
    unsaved: it is emptied after a successful save, after Open (and the
    hook's `load`), after New and when undo returns to the saved view, so
    a saved workspace is never offered again. With the slot holding the
    text of a workspace whose last entry is at `2026-10-12T09:05:07.000Z`
    (`TZ=UTC`) and the name `score.tle.json`, mounting asks `Restore the
    unsaved workspace from 2026-10-12 09:05?` with `Restore` and
    `Discard`. Restore opens it (the store's view and journal equal
    `readWorkspace` of the text) as unsaved under its name (`• score.tle.json`);
    no file handle survives, so Ctrl+S then saves through the save picker,
    or, here, downloads `score.tle.json` with exactly the text. Discard
    leaves the empty workspace and empties the slot. A slot holding exactly
    `writeWorkspace` of an empty workspace offers nothing. After one command
    the slot holds, once the 1,000 ms delay has run (real timers, waited
    on), exactly `{text: writeWorkspace of the store, name:
    "untitled.tle.json"}`. The pending snapshot is written at once, well
    within the delay (waited on for at most 500 ms), when the page turns
    hidden (`visibilitychange` with `visibilityState` `hidden`) and when the
    editor is unmounted. Then:
    - **Saved, then reopened: nothing offered.** One command, the page
      hidden (the slot fills), Ctrl+S: the slot is `null`; after unmounting
      it is still `null`, and a new editor asks nothing.
    - **Opened, untouched, reopened: nothing offered.** One command, the
      page hidden (the slot fills), the hook loads a written workspace: the
      slot is `null`, still after unmounting, and a new editor asks nothing.
    - **Undo to the saved view** after the slot filled empties it.
    - **One tab autosaves.** The editor asks `navigator.locks` for the
      exclusive lock `tilie-autosave/current` if available. Refused (another
      tab holds it), it shows exactly one message, `Autosave is active in
      another TimeLineEditor tab, so changes in this tab are not
      autosaved.`, and after a command, the page hidden and the editor
      unmounted the slot is still `null`. Granted, a command and the page
      hidden fill the slot and no message is shown. Without
      `navigator.locks` (jsdom) the editor autosaves, as above.
14. **An autosave failure is shown once, and editing goes on.** With
    IndexedDB missing, the page shows exactly one message, starting
    `Autosave is not working`, however many commands follow.
15. **The About pane.** `About` opens a modal dialog headed `About
    TimeLineEditor` showing `TimeLineEditor <app version>` (the version in
    `app/package.json`), the server line `tilie-server 0.1.0 (timetoalign
    1.2.0)` from the health response (or `offline: The server did not
    answer the health check (502 Bad Gateway).`), the packages exactly
    `@timetoalign/tilie-core`, `-layout`, `-writers`, `-arranger`,
    `-client`, and `timeskeleton <installed version>, schema version
    <SCHEMA_VERSION>`, and a link to `THIRD_PARTY_NOTICES.txt` (relative
   `href`, opening in a new tab). Close closes it.

## Attributions and notices (`attributions.test.ts`)

The About pane lists what the bundle ships from others, and the build
writes their full licence texts into `THIRD_PARTY_NOTICES.txt` beside
`index.html` (`notices.ts`, a Vite plugin of ours), so the wheel ships it.
The test builds the editor with Vite into a temporary directory, with
source maps, as a production build (`NODE_ENV` set to `production` for the
build, since Vitest's `test` would make it a development build carrying the
test hook and the end-to-end fixture files), and collects the package of every bundled source: the nearest
`package.json` with a `name` above the source's real path, so an installed
package and one linked from outside `node_modules` are found alike, and the
workspace's own `@timetoalign/tilie-*` packages are left out (`packageOf`,
shared with the plugin); this set is the reference.

1. **The list names exactly the bundled packages.** The packages of
   `ATTRIBUTIONS` equal the reference set; for each, the licence equals the
   installed package's `license` field and the recorded copyright lines
   equal, in order, the licence file's lines that start with `Copyright`
   (trimmed): both of `@decimalturn/toml-patch`'s, both of `fast-uri`'s and
   of `d3-ease`'s, and timeskeleton's `Copyright (c) 2026 Time to Align!`.
2. **The other entries are backed.** They are exactly the canvas control
   icons (MIT, the `webkid GmbH` line of `@xyflow/svelte`'s licence file)
   and `DejaVu Sans 2.37`, backed by one bundled `DejaVuSans-*.ttf`, both
   copyright lines occurring in timeskeleton's `fonts/LICENSE`.
3. **The notices file holds every full text.** Split at its 72-character
   `=` rules, each section is a heading line, `License: <licence>`, a
   72-character `-` rule and the text. The package sections' headings are
   exactly `<name> <version>` for each package of the reference set, the
   version and licence being the installed `package.json`'s, and each text
   equals the package's licence file byte for byte (a package without a
   licence file fails the build). The two last
   sections are the icons (`Icons of the canvas controls, copied from
   @xyflow/svelte <version>`, MIT, the text of `@xyflow/svelte`'s licence
   file) and the font (licence `FONT_LICENCE`, the text of timeskeleton's
   `fonts/LICENSE`).
4. **No chunk reaches Vite's warning limit.** Every `.js` file the build
   writes into `assets/` is smaller than 500,000 bytes (Vite warns above
   500 kB, counted in thousands of bytes); the limit itself is never
   raised, so the vendor split is what keeps the chunks below it.
5. **The codecs stay lazy.** `index.html` preloads chunks with `<link
   rel="modulepreload">`, and no such link names a file whose name starts
   with `yaml-` or `toml-`: a vendor group that took the YAML or TOML
   package would make the main chunk import it at start.
6. **The development server may read the schema package.** The config's
   `server.fs.allow` holds the real directory (symbolic links resolved) of
   the installed `@timetoalign/timeskeleton/package.json`, where its font
   lies. Installed from npm that directory is inside `app/node_modules`;
   with a local checkout linked in to try a schema change it lies outside
   the workspace, and without the entry `pnpm dev` refuses the font with
   403. Its other entry is the workspace root found from the
   config file's own directory, `app/` (whose `pnpm-workspace.yaml` marks
   it), not from the directory the server was started in.
7. **No fixture reaches a production build.** Every manifest fixture the
   fixture menu offers, and so every end-to-end workspace built from them,
   carries the `meta.generator` of the installed package's fixtures (read
   from its `bare.json`, e.g. `timetoalign 1.2.0 (98a6bb36)`), and the
   workspaces the menu builds name the author `Fixture Generator`; no file
   the production build writes contains either string, so neither the
   fixture texts nor the code building workspaces from them is bundled.

## Autosave (`autosave.test.ts`)

`src/autosave.ts` keeps a snapshot of the open workspace in IndexedDB: the
database `tilie-autosave` (version 1) with one object store, `workspaces`,
holding one slot per workspace key. A snapshot is `{text, name}`: the text
is whatever the caller passes, normally the output of `writeWorkspace`,
stored and returned unchanged and never parsed, and the name is the file's.
Below, a text `t` stands for the snapshot `{text: t, name: "n.tle.json"}`.
Every test installs its own empty
`IDBFactory` from `fake-indexeddb` as `globalThis.indexedDB`, so no test sees
another's database. Writes are counted by a spy on the factory's
`IDBObjectStore.prototype.put`, which records each written value and key.
Vitest's fake timers replace only `setTimeout` and `clearTimeout`, because
`fake-indexeddb` delivers its events through `setImmediate`.

1. **Only the last text within the delay is written.** With
   `createAutosave({key: "w", delayMs: 100})`: `flush()` before anything was
   scheduled writes nothing (0 puts). Then `schedule("a")` at 0 ms,
   `schedule("b")` at 50 ms and `schedule("c")` at 120 ms; each call restarts
   the delay, so nothing is due before 220 ms. The clock is advanced to
   219 ms and then by 1 ms; `flush()` (nothing is pending any more, it only
   waits for the write) leaves exactly one put, `("c", "w")`. If any earlier
   call had fired, the count would be higher at this point or below.
2. **`flush()` writes the pending text at once and cancels its timer.**
   Continuing: `schedule("d")`, the clock advanced by 99 ms, `flush()`: the
   puts are exactly `[("c", "w"), ("d", "w")]`. Advancing the clock by
   1,000 ms and flushing again adds no put, so the cancelled timer never
   fires.
   A function may stand for the text: `schedule(first)` then
   `schedule(second)` (functions returning `"first"` and `"second"`) at
   delay 100; at 99 ms neither was called; at 100 ms and after `flush()`
   `first` was never called, `second` exactly once, and the only put is
   `("second", "w")`. So the editor writes the workspace out once per
   pause, not once per change.
3. **Recovery returns the last written text byte for byte.** A text mixing
   ASCII, `C♯`, the astral `𝄞` (a surrogate pair), a CRLF line end, a lone
   surrogate `\uD800`, and trailing spaces is scheduled and flushed after an
   earlier text was flushed under the same key; `recoverWorkspace("w")`
   returns a string `===` to it (equal UTF-16 code units). A key never
   written recovers `null`.
3b. **`discard` drops the pending snapshot and empties the slot.** After
   `a` was flushed, `b` is scheduled and `discard()` called: with the
   clock advanced by 1,000 ms and a flush, the puts are still only
   `("a", "w")` and the slot recovers `null`. A `discard()` after a flush
   that has not finished yet still runs after its write: the slot is
   `null`. A slot holding anything but a snapshot (the bare string `bare
   text`, written directly) recovers `null`.
4. **Slots are isolated by key.** Two autosaves, keys `w1` and `w2`, flush
   `one` and `two`; each key recovers its own text. After `clear("w1")`,
   `w1` recovers `null` and `w2` still recovers `two`.
5. **A failure of IndexedDB is a rejected promise, never swallowed.** The
   database `tilie-autosave` is first created at version 2 directly through
   the factory, so the module's open at version 1 fails with the
   IndexedDB `VersionError`. Then:
   - `schedule("x")` and `flush()` reject with an `AutosaveError` whose
     `code` is `indexeddb_failed`, `key` is `w` and `cause.name` is
     `VersionError`; `recoverWorkspace("w")` and `clear("w")` reject with
     the same `code`, `key` and cause name.
   - a write started by the timer (schedule, then the clock advanced past
     the delay) has no caller to reject; its failure rejects the next
     `flush()` with that same error shape, and a further `flush()` with
     nothing pending resolves, so each failure is reported exactly once.
   - with an `onError` option, a failure no caller waits for (the timer's
     write, a `discard`) goes to it instead:
     the next `flush()` resolves, `onError` was called exactly once with
     that error shape; a failure of a write `flush()` itself starts still
     rejects that `flush()` and is not passed to `onError` (one call in
     all).
   - with `globalThis.indexedDB` undefined, `recoverWorkspace("w")` rejects
     with an `AutosaveError` of `code` `indexeddb_unavailable` and `key` `w`.

## The test hook (`hook.test.ts`)

`src/testHook.ts` defines `window.__tilie`, through which the end-to-end
tests open workspaces and read the viewer's state: `load(text)`, `store()`,
`selection()`, `select(addresses)`, `viewport()`, `setViewport(v)`,
`locked()`, `mode()`, `health()` (the parsed health response, or
`null`) and `text()` (`writeWorkspace` of the store's view and journal, what
Save writes). `App.svelte` installs it only when
`import.meta.env.DEV` is true or the build sets `VITE_TILIE_TEST_HOOK=1`;
both are constants of the build, so a production build carries none of the
hook. Vitest runs
in development mode, so the hook is installed in these tests. Each test
mounts `App.svelte` with `fetch` and the layout interfaces stubbed, as
`App.test.ts` does.

The workspace file used below is written, never hand-made: an empty
`createStore` receives two `add` commands placing the manifest fixtures
`bare` (block `0000000000` at x 0) and `nested` (block `0000000001` at
x 800) of the installed `@timetoalign/timeskeleton`, and `writeWorkspace`
writes its view and journal.

1. **The editor starts empty.** Before any load, `store().view` equals
   `createView()`, the journal is `[]`, `selection()` is `[]`, `locked()`
   is `false` and `mode()` is `"scale"`.
2. **`load` opens the file in a new store.** After `select` of two
   addresses (read back exactly by `selection()`), `load(text)` replaces the
   store: the new store is not the old one, its view and journal equal
   `readWorkspace(text)`'s, and writing them again gives `text` byte for
   byte, and `text()` returns `text` too. The selection is `[]`, since it
   addressed the previous workspace.
3. **A refused file throws and changes nothing.** After loading the file,
   `load("{")` throws a `WorkspaceRefusedError` whose problems' codes are
   exactly `["invalid_json"]`, and `store()` is still the open store.
4. **The header offers the end-to-end workspaces and one workspace per
   synthetic group and bundle fixture.** In the same builds the header
   carries a select labelled "Fixture" (`fixture-select`) and a Load
   button (`fixture-load`). Its options are the base names of
   `app/e2e/fixtures/*.tle.json` and of the installed timeskeleton's
   `fixtures/<SCHEMA_VERSION>/groups/*.json` and `bundles/*.json` except
   those starting `corpus_` (loader output, not drawings made to be
   looked at) and the minimal twins `*.minimal.json`, all in one list
   sorted by code point. The end-to-end
   workspaces are the generator's output, pinned byte for byte by `pnpm
   e2e:fixtures:check`, so the test lists that directory (and requires
   `small` among them); the manifest entries are pinned exactly:
   `bundle_mixed`, `bundle_shared_parent`, `bundle_ungrouped`,
   `group_child_member`, `group_grandchild`, `group_number_types`,
   `group_parent_both`, `group_parent_exact`, `group_parent_right`,
   `group_parents_mixed`, `group_styled`, `group_unknown_length` (12; the
   installed 0.7.0 package has 10 group and 9 bundle fixtures, one and six
   of them `corpus_`, and each its minimal twin, which the menu leaves
   out).
   Choosing `small` and pressing Load opens it the way `load` does: the store's view and journal equal `readWorkspace`
   of that file's text, and the selection is `[]`. Choosing
   `group_number_types` and pressing Load opens a workspace of one block
   `fixture000` at x 0, y 0 whose manifest equals `loadManifest` of the
   fixture file, journalled as exactly one `add` of that block by `Fixture
   Generator` at `2026-10-12T09:00:00.000Z` (the end-to-end generator's
   author and first time); `bundle_mixed` likewise gives one block. A
   production build carries none of these workspaces (attributions case
   7).
5. **Delete removes a timeline of a group or bundle block.** Core removes
   any element, timelines included. After the menu's `group_child_member`
   is loaded and `fixture000/second-half` (a child timeline that the group
   names as a member) is selected, Delete on the canvas
   (`role="application"`, where the canvas reads its keys) journals exactly
   one more entry, `{type: "remove", targets: ["fixture000/second-half"]}`;
   the block's manifest no longer carries `second-half` (`manifestIds`) and
   the selection is `[]`. After `bundle_mixed`, the ungrouped root
   `fixture000/annotations` goes the same way.
6. **The hook leaves with the editor.** Unmounting `App.svelte` removes
   `window.__tilie`.

The viewport functions talk to Svelte Flow, which needs a laid-out page;
they and everything the canvas does are proven by the Playwright suite.

## The inspector (`inspector-text.test.ts`, `inspector-codecs.test.ts`, `Inspector.test.ts`, `Inspector-load.test.ts`)

The inspector shows the manifest of the block the selection lies in as JSON,
YAML or TOML text and writes an edited text back as one `set` command
replacing that block's `manifest`. Its logic is plain TypeScript in
`src/inspector/` (`formats.ts` reads and writes the three formats,
`nulls.ts` the TOML null rule, `lossless.ts` the numbers, `edit.ts` the
commands); `Inspector.svelte` only wires it to the store and the selection.
JSON is always available; the YAML (`yaml.ts`) and TOML (`toml.ts`) codecs
are dynamic imports, loaded by `loadCodec` the first time their format is
needed, so their libraries stay out of the main chunk. `inspector-text`
loads both before its cases.
What would prove it works, and the exact values each test pins:

1. **Every manifest round-trips through every format, byte for byte.** For
   each manifest fixture of the installed timeskeleton's `SCHEMA_VERSION`
   and each format, the fixture's lossless value (`parseJson`) is written
   as text and read back, and `dumps` of what was read equals the fixture
   file's bytes. `dumps` sorts keys and arrays, so only a lost or changed
   value, a changed number kind (an integer that became a float or the
   reverse) or a dropped or added member can make a case fail. The cases
   are enumerated from the package's directories, so a first case pins
   the set they come from: the installed 0.7.0 package holds 36 manifests
   directly in `fixtures/<SCHEMA_VERSION>/`, 10 sorted into `groups/` and 9
   into `bundles/`, the counts `ls` gives there without the minimal twins
   (`*.minimal.json`); 55 fixtures in three formats are 165 cases. A
   fixture added to or removed from the package fails that first case
   until this file and the count are updated together. Every fixture is
   written in the complete form, the form the inspector always shows (it
   writes the held manifest, which is complete), so every TOML case
   exercises the null rule of case 3. The twins are no case: the TOML null
   rule restores what a minimal twin leaves out, so a twin reads back as
   its complete fixture, which is the case already there.
2. **Numbers stay exact.** A store holds `discrete_logical` (an unlocked
   root of integer ticks) and `continuous_physical` (an unlocked root of
   float seconds). Through `set` commands the integer root's `length`
   becomes 9007199254740993 ticks (2^53 + 1, a `bigint`), and the float
   root's `length` first 12.500000000000002 seconds (the double after 12.5,
   whose shortest spelling has 17 digits), then 1e16 seconds (an integral
   float beyond 2^53, a `JsonFloat`). Each manifest round-trips through all
   three formats with `dumps` equal to `dumps` of the manifest, and the
   value read back is exactly `9007199254740993n`, `12.500000000000002`
   (a plain number) and a `JsonFloat` of `1e16`; the YAML text carries
   `length: 9007199254740993` and `length: 10000000000000000.0` (a length
   is a bare value on its axis). A JavaScript
   number would round the integer to …992, and a float written as `1e16`
   without a point would read back as the integer.
3. **The TOML null rule is the schema's.** The schema is one document;
   its `$ref`s point into its own `$defs`. A member is left out of the TOML
   text when it is null and the schema either requires it and admits null,
   or declares the default null; reading the text puts it back as null.
   `omissibleNulls` over every `$defs` entry of the document lists exactly:
   `TimeSkeleton` `name`; `Timeline` `length`, `measure_map`,
   `metric_hierarchy`, `name`; each of the 21 conversion-map definitions
   `name`, `source_unit`, `target_unit`; `Region` `name`; `Break` `label`,
   `name`; `Jump` `label`, `target`; `Marker` `name`; `Group` `name`; and
   no other definition has any.

   **A manifest of two roots and a group**, written out in its complete
   form (`loadManifest` of `{timeskeleton, timelines: [score (quarters,
   [12, 1]), page (pixels, length null)], groups: [group_1 of both]}`):
   its TOML text is pinned whole and holds no `name` (of the manifest,
   the group or a timeline), no `measure_map`, no `metric_hierarchy` and
   no `length` for `page`; reading it back in each of the three formats
   gives `dumps` equal to `dumps` of the manifest and those members null.
   Two refusals:
   - writing a manifest whose measure-map row has `nominal_length: null`
     (optional, no default null: absent and null mean different things) is
     refused `not_representable` at `["timelines", 0, "measure_map", 0,
     "nominal_length"]`, message `TOML has no null, and the schema neither
     requires this member nor defaults it to null`; this refusal is final,
     not a gap: such a manifest is shown and edited as JSON or YAML, and
     the same value writes and reads back through both (`dumps` equal);
   - applying the TOML text of `bare` with its `id = "bare"` line removed
     (`id` is required and may not be null, so nothing restores it) is
     refused by the store: `schema_violation` at `["timelines", 0]`, and
     the journal is unchanged.
4. **Apply dispatches exactly one `set`.** With `bare` in block
   `0000000000`, the JSON text with `"name": "Bare"` changed to
   `"name": "Renamed"` is applied: the journal grows by exactly one entry,
   whose command is `{type: "set", changes: [{target: "0000000000",
   values: {manifest: <the parsed value>}}]}`, and `dumps` of the block's
   manifest equals `dumps` of the parsed value. Applying the unchanged text
   dispatches nothing (the journal stays at that length).
5. **A refusal is shown with its exact path, and the text is kept.** From
   the same JSON text, `"locked": false` changed to `"locked": "yes"` is
   refused `schema_violation` "must be boolean" at `["timelines", 0,
   "locked"]` (the store's path `["0000000000", "manifest", "timelines", 0,
   "locked"]` loses its block prefix, so it points into the text), and
   `problemPointer` renders it as `/timelines/0/locked`; `"unit":
   "quarters"` of the root changed to `"parsecs"` is refused "must be equal
   to one of the allowed values" at `/timelines/0/unit`. Syntax errors
   carry 1-based positions: the JSON text with `"locked": ,` gives
   `syntax_error` at line 22, column 17; the YAML text with `locked:
   [false` gives line 16, column 5 (the line after `locked`, where the
   flow sequence is found unclosed); the TOML text with `locked = ` gives
   line 14, column 1 (likewise the line after it). No refusal adds a journal entry.
6. **Comments survive Apply and an external change.** With `bare`
   selected, the YAML text gets a comment line `    # shown on the canvas`
   above `name` and an inline comment `# was Bare` after the name changed to
   `Hello`; after Apply the text is exactly the written text with those two
   edits (the document is patched, not rewritten). Then the store changes
   the root's `name` to `Bye` through a `set` on `0000000000/bare`, and
   following the manifest gives exactly the same text with `Hello` replaced
   by `Bye`, both comments in place. The same for TOML with `# shown on
   the canvas` and `# was Bare`.
7. **The styling toggle hides `graphical` and keeps it.** With
   `styled__score` in a block, the text written with the styling hidden has
   no `graphical` key in any format; applying it with the root's name
   changed leaves `dumps` of the block's `graphical` equal to what it was. A
   hidden text that names `graphical` is refused `hidden_member` at
   `["graphical"]`, journal unchanged. With the styling shown, the text
   carries `graphical` and round-trips as in case 1.
8. **The selection decides the block.** `selectedBlock` gives `null` for an
   empty selection, the block for its id or for `<id>/<element>`, the same
   block for several addresses in it, and `null` for addresses in two
   blocks.
9. **The properties form builds one `set` per field.** `propertyCommand`
   gives `{type: "set", changes: [{target, values: {x: 12.5}}]}` for `x`
   and `"12.5"`, `{width: null}` for `width` and an empty field, and refuses
   `invalid_value` for `x` with an empty field and for `abc`. Dispatching
   `scale` `0` is refused by the store (`non_positive_number`).
   A step (`stepValue(value, direction, step)`) is computed exactly: the
   sum is rounded to as many decimals as the value and the step have
   (shortest spellings), so float noise never reaches the store; an empty
   (null) value counts as 0. `STEPS` is 1 for `x`, `y`, `width`, `height`
   and `length`, 0.1 for `scale` and `spacing`. Pinned: `10.123` up by 1 →
   `11.123`; `1` down by 0.1 → `0.9` (plain arithmetic gives the same here,
   and `0.9` down → `0.8`); `0.7` up by 0.1 → `0.8` (plain arithmetic:
   0.7999999999999999); `1e-7` up by 0.1 → `0.1000001` (plain:
   0.10000010000000001); `-0.05` up by 0.1 → `0.05`; `null` up by 1 → `1`.
   `shownValue` is what a field shows: at most two decimals, the exact
   double rounded as `toFixed(2)` rounds it, trailing zeros trimmed, an
   empty text for null. Pinned: `12.5` → `12.5`, `12.3449` → `12.34`, `7` →
   `7`, `10.123` → `10.12`, `2.999` → `3`, `478.5771484375` → `478.58`,
   `1.49951171875` → `1.5`, `0.125` → `0.13` (exactly halfway, the larger
   neighbour), `1.005` → `1` (the double is 1.00499999999999989…, below
   the half), `-0.001` → `0` (no negative zero), `null` → empty. The value
   is only shown: no command is built from the shown text.

10. **The codecs load on demand, once.** In a fresh module graph
   (`inspector-codecs.test.ts`) `isLoaded` is `[true, false, false]` for
   JSON, YAML, TOML; `writeText("yaml", …)` throws "the yaml codec is not
   loaded; await loadCodec"; two concurrent `loadCodec("yaml")` resolve to
   the same codec and leave `[true, true, false]`; after
   `loadCodec("toml")` all three are loaded.

The component test mounts `Inspector.svelte` with a store holding `bare`
(block `0000000000`) and `styled__score` (block `0000000001`), and proves
the wiring: choosing YAML before its codec is loaded shows exactly
"Loading YAML…" and no textarea, and once `loadCodec("yaml")` resolves the
YAML text; with nothing selected and with both blocks selected it shows
exactly the hint "Select a block to inspect its manifest."; with
`0000000000` selected the textarea holds `saveManifest` of its manifest;
choosing YAML shows exactly `writeText("yaml", manifest)`; while the text holds an unapplied edit
the three format radios and "Show styling" are disabled and a hint reading
exactly "Apply or Revert to switch" (`#inspector-switch-hint`) is shown and
named by `aria-describedby` on the radio group and the checkbox; without an
edit there is no hint; the edited text applied with Ctrl+Enter in the
textarea adds one journal entry and removes the hint; an edited, unapplied
text survives an external `set` and shows exactly "The manifest changed;
Revert to see it", and Revert shows the new manifest; the refused text of
case 5 lists one problem reading `schema_violation`, `must be boolean`,
`/timelines/0/locked` and keeps the edit; typing `25` into `x` and pressing
Enter adds one journal entry whose command is `{type: "set", changes:
[{target: "0000000000", values: {x: 25}}]}`. A step steps from the stored value,
not from the shown one: after a `set` of `x` to `10.123` the field shows
`10.12`; ArrowUp in it adds exactly one journal entry `{type: "set",
changes: [{target: "0000000000", values: {x: 11.123}}]}` and the field
shows `11.12`; ArrowDown adds one more entry with `x` `10.123` (a step from
the shown `10.12` would store `11.12` and `9.12`). ArrowDown in `scale`
(stored 1) adds one entry with `scale` `0.9` (the step there is 0.1). A typed draft is
stepped instead: with `20` typed and not committed, ArrowUp commits `x`
`21`. A live value given to the component (`live`, the block as a canvas
gesture shows it) is shown instead of the stored one for that block,
rounded the same way, but never over a draft: with `live` holding `x`
`5.556` the field shows `5.56`, and with `33` typed it keeps `33`; with
`live` back to `null` the field shows the stored value again. Live values
of another block are ignored.

**Unknown keys are warnings.** A manifest may carry keys the schema does
not declare; they are kept and reported by core's `unknownKeys` (the
timeskeleton validator's), never refused, because a misspelt optional key
would otherwise silently become its default. What proves the inspector
shows them is the shared warning cases of the installed timeskeleton
(`fixtures/warnings/<SCHEMA_VERSION>/*.json`, each a manifest with its
expected `unknown_keys` list, one key at a depth of its own): each case's
manifest is loaded into a block and selected, and the warning list
(`#inspector-warnings`, labelled "Warnings") holds exactly one item per
expected key, in the expected order, each showing the key and its path as
a JSON pointer into the manifest (the case's `path` rendered as
`problemPointer` renders a problem's, `the top level` for the empty path),
for example `order` at `/groups/0` for `group_unknown_key`. The list is
driven by the files' own expectations, so a case added to the package is
covered without a change here. Warnings never stop editing: with the
warnings shown, the textarea holds the manifest's text, the problem list
is empty, and Apply of an edited text (its first `meta` given a member,
which `meta` admits freely) adds one journal entry, after which the same warnings are still listed, since the
unknown keys were kept. `bare`, which has no unknown key, shows no warning
list at all. Every case loads in core: the validator refuses whatever
core's invariants refuse, so a warning case carries only unknown keys, and
a case core refused (listed with the code of its first problem) fails the
test instead of dropping out of it. `several_depths.json`, with its
sixteen keys from the manifest down to a declaration, is among the cases
listed.
`Inspector-load.test.ts` replaces `toml.ts` with a module whose import
fails (`vi.mock` with a throwing factory): choosing TOML shows one
`role="alert"` paragraph reading exactly `TOML could not be loaded (<the
rejection's message>).` and no textarea; choosing JSON again removes the
alert and shows the JSON text.
