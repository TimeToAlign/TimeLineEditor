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

## Editing (`EditingBar.test.ts`, `editing.test.ts`)

An editor is a mode of the arranger on one element: the bundle editor on a
block, the group editor on a group, the timeline editor on a root or child
timeline. The store opens and closes them (`open`, `done`, `cancel`) and
lists the open ones, outermost first, as `editing`, the editing path; its
own tests prove what opening, Done and Cancel do to the view, the journal
and the sessions. These tests prove the shell's part: the bar that shows
the path and closes the innermost editor, the drawer opening on entering,
and that Save and autosave write the workspace with every open editor
folded.

The store holds blocks written through `add` commands from the installed
timeskeleton fixtures: `bundle_mixed` in block `A` (`0000000000`; the
manifest's `name` `Mixed`, its group `group_1` named `Performance` with the
member `score` named `Score`), `nested` in block `B` (`0000000001`; no `id`
and no `name`, the root `clt_1` holding the child `clt_3`, neither named),
and in block `C` (`0000000002`) `bundle_mixed` loaded after deleting its
`name` and its group `group_2`'s `name` and setting its `id` to `mixed`, the
one manifest no fixture provides (a bundle and a group known only by id).
`dom.ts`'s `showModal` stub stands in for the browser's modal dialog.

`EditingBar.svelte` alone (mounted with the arranger's `liveStore` of a
store, which follows the store's `subscribe`; the inspector and the canvas
read the same one, made once by the shell):

1. **Nothing is shown while no editor is open.** With `editing` empty the
   component renders no element.
2. **The bar's controls, in order.** After `open(A)` there is exactly one
   element with `role="group"` and `aria-label="Editing"`; its buttons'
   texts are exactly `["Done", "Cancel"]` in that order (`Done` carries the
   class `done`, `Cancel` the class `cancel`: green and red), followed by
   the text `Editing:` and an `<ol aria-label="Editing path">`.
3. **The path names each open editor, outermost first.** The list items'
   texts are exactly:
   - after `open(A)`: `["Mixed"]` (the manifest's `name`); after
     `open(A/group_1)`: `["Mixed", "Performance"]` (the group's `name`);
     after `open(A/score)`: `["Mixed", "Performance", "Score"]` (the
     timeline's `name`);
   - after `set A/score name "S"` in that editor: `["Mixed", "Performance",
     "S"]`: the names follow the view;
   - after `open(B)`, `open(B/clt_1)`, `open(B/clt_3)`: `["Anonymous
     bundle", "clt_1", "clt_3"]` (no name and no id; timelines known only
     by id);
   - after `open(C)`, `open(C/group_2)`: `["mixed", "group_2"]` (a bundle
     and a group known only by id).
   The " > " between the names is drawn by CSS (`li + li::before`), which
   jsdom does not render; the list items hold the names alone, so the path
   reads as a list to assistive technology. The names are
   `editorName(view, target)` of `inspector/journal.ts`, which the Editor
   tab and the Journal tab use too (tested with the journal).
4. **Done closes the innermost editor.** With the three editors of `A`
   open, each click on `Done` leaves `editing` one shorter (2, 1, 0), and
   after the last no element is rendered.
5. **Cancel without changes closes at once.** After `open(A/score)` and no
   command, `Cancel` closes the editor (`editing` empty) and no dialog was
   opened (`showModal` never called).
6. **Cancel with changes asks first.** After `open(A/score)` and `set
   A/score name "S"`, `Cancel` opens the modal dialog: `open` is true, its
   question reads exactly `Are you sure you want to discard 1 change?`, its
   buttons are exactly `["Yes", "No"]`, and `No` holds the focus. Each of
   these keeps the editor: `No`; Escape (as the browser handles it: a
   cancelable `cancel` event on the dialog, then `close()`, since jsdom
   implements no Escape); a click whose target is the dialog element itself
   (the backdrop: the dialog has no padding, its content fills it). After
   each the dialog is closed, `editing` still has one editor, `changes` is
   still 1 and the timeline is still named `S`. A click on the question
   text leaves the dialog open. `Yes` closes the dialog and the editor:
   `editing` is empty, the view is the very object it was before `open`
   and the journal is as long as it was then.
7. **The count is the store's.** After a second `set` (`A/score name
   "T"`), the question reads exactly `Are you sure you want to discard 2
   changes?`.

`App.svelte` (`editing.test.ts`, mounted as in `hook.test.ts`, the
workspace of block `A` loaded through the hook):

8. **The drawer opens on entering an editor.** With nothing remembered
   (the drawer closed), `open(A)` shows the drawer, stores exactly `"true"`
   in `localStorage["tilie.inspector.open"]`, and leaves the focus on the
   arranger. Closing the drawer while editing is allowed: the drawer is
   hidden and the editor stays open. Opening a further editor inside
   (`A/score`) leaves the closed drawer closed: the drawer opens when the
   editing path becomes non-empty, not on every opening. After Done twice
   and `open(A)` again, the drawer opens again.
9. **Save and autosave write the open editors folded.** After
   `open(A/score)` and `set A/score name "S"`, Ctrl+S downloads
   `untitled.tle.json` whose text, read by `readWorkspace`, has a journal
   of exactly two entries, the `add` of `A` and a session entry naming the
   open editor's session id, and a `sessions` member holding exactly that
   session, with target `0000000000/score` and one entry whose command is
   that `set`. The editor is still open afterwards (`editing` has one
   editor) and the unsaved mark is gone. The autosave slot, filled when the
   page turns hidden after a second `set`, holds a text of the same form:
   two journal entries, the session holding two entries. The hook's
   `text()` is what Save writes; each folding stamps its session entry
   with the time of the folding, so texts written at different moments
   are compared by their content, not byte for byte.

## Files, history and About (`shell.test.ts`, `files.test.ts`)

These mount `App.svelte` as above. jsdom has neither IndexedDB nor a modal
`<dialog>`: `dom.ts`'s `stubEditor` installs a fresh `fake-indexeddb`
factory per test and gives `HTMLDialogElement` a minimal `showModal` (sets
`open`) and `close` (removes it, fires `close`). Opening and saving go
through the fallback path unless a test installs stub pickers: a file input
whose `files` the test sets before dispatching `change`, and a download
link whose `click` the test intercepts (recording `download` and the
blob's text). After each test the autosave each mounted editor created
is flushed and its writes are waited for before the next test installs
its own IndexedDB, since a write reaches whichever factory is installed
when it runs. Workspaces and manifests come from the installed
timeskeleton fixtures through `writeWorkspace` and `loadManifest`, never
hand-written, except the refused texts.

`files.ts` alone:

1. **`manifestFileName`** names a file after the manifest's `id`, else
   its `name`, else `bundle` (a manifest without either is an anonymous
   bundle), every character outside `[A-Za-z0-9_-]` written `_`, then
   `.json`: a manifest of one root with the id `flow:quarters` and the name
   "Flow" gives `flow_quarters.json`, one with only the name "Eroica: II"
   `Eroica__II.json`, an anonymous one `bundle.json`.
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
9. **Save writes `writeWorkspace` of the store's snapshot and clears the mark.** A
   save requested while one is under way is ignored: with a save picker
   whose file only closes when the test lets it, a second Ctrl+S and a
   Ctrl+Shift+S meanwhile call the picker no second time and write once,
   and the name becomes the picked `w.tle.json`.
   Ctrl+S (fallback path) downloads `untitled.tle.json` whose text equals
   `writeWorkspace` of the store's view, journal and sessions (with no editor
   open, the snapshot is exactly these), and the mark is gone. With an editor
   open, Save writes it folded (case 9 of "Editing").
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
    - **Unmounted while it starts: nothing written.** The editor looks for
      a recoverable workspace only once it holds the lock, so an editor
      unmounted before either has settled must never write afterwards. The
      slot holds exactly `writeWorkspace` of an empty workspace (offered
      nothing, so no dialog intervenes) under `untitled.tle.json`; the
      editor is mounted, one command changes its store, and the editor is
      unmounted the moment its recovery read opens the database. Past the
      1,000 ms delay (1,300 ms, real timers) the slot still holds exactly
      that snapshot: a snapshot scheduled by the destroyed editor would
      have replaced it with the changed store's text. With a lock that is
      granted only after the editor was unmounted, the editor gives the
      lock back (the promise its lock callback returned resolves) and,
      past the delay, the slot is still `null`.
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
`null`), `text()` (`writeWorkspace` of the store's snapshot, what
Save writes: every open editor folded as Done would fold it), and the
editing path: `editing()` (a copy of the store's `editing`), `open(address)`
(the store's `open`, returning its refusal or `null`), `done()` and
`cancel()` (the store's, without the bar's question). `App.svelte` installs it only when
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
writes its snapshot.

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
7. **The editing path through the hook.** After `load(text)`, `editing()`
   is `[]`; `open("0000000001/nope")` returns a refusal with the code
   `unknown_target` and `editing()` is still `[]`.
   `open("0000000001/clt_1")` returns `null`, and `editing()` is then
   exactly one editor `{session, target: "0000000001/clt_1", kind:
   "timeline", earlier: null}` whose `session` is ten characters of
   `0-9a-z`; it equals the store's `editing` but is not the same array.
   After `set
   0000000001/clt_1 name "N"`, `cancel()` closes the editor without asking
   (no dialog opens): `editing()` is `[]` and the view is the one before
   `open`. Opening it again, the same `set` and `done()` leave `editing()`
   empty and the journal one entry longer, its last entry a session entry.

The viewport functions talk to Svelte Flow, which needs a laid-out page;
they and everything the canvas does are proven by the Playwright suite.

## The inspector (`inspector-text.test.ts`, `inspector-codecs.test.ts`, `Inspector.test.ts`, `Inspector-load.test.ts`, `inspector-locked.test.ts`, `inspector-subject.test.ts`)

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
   dispatches nothing (the journal stays at that length). That comparison
   is the inspector's to make, because the store journals every accepted
   command: the `set` of the block's `manifest` to the very value it holds,
   dispatched to the store directly, is accepted and adds one entry (the
   journal grows from 2 to 3) while `dumps` of the manifest stays the same.
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
6. **Comments survive Apply and an external change, in every mode.** With
   the styled `bare` of case 7 selected, in each of the four modes, the
   YAML text gets a comment line `    # shown on the canvas` above `name`
   and an inline comment `# was Bare` after the name changed to `Hello`;
   after Apply the text is exactly the written text with those two edits
   (the document is patched with the value the mode shows, not rewritten).
   Then the store changes the root's `name` to `Bye` through a `set` on
   `0000000000/bare`, and following the manifest in the same mode gives
   exactly the same text with `Hello` replaced by `Bye`, both comments in
   place. The same for TOML with `# shown on the canvas` and `# was Bare`.
7. **The four text modes.** A text is written in one of four modes, the
   `TextOptions` `{includeStyling, minimal}`: the complete or the minimal
   form, each with the styling excluded or included. `visibleManifest`
   leaves `graphical` out unless `includeStyling`, then takes
   timeskeleton's `minimal` of the rest when `minimal`. Cases 1 to 5 write
   and apply in the complete mode with the styling included, the form of a
   fixture file. What proves the modes is one manifest whose complete and
   minimal forms differ and which has a `graphical`: `bare` in block
   `0000000000`, styled by one `style` command `{select: {element:
   "timeline"}, set: {stroke: "#800000"}, blocks: ["0000000000"]}` (the
   journal then holds 2 entries). The store holds the complete form, whose
   `graphical` is `{order: {}, statements: [{select: {element:
   "timeline"}, set: {stroke: "#800000"}}], styles: {}}`; its minimal form
   leaves out `groups`, `name`, the timeline's `children`,
   `conversion_maps`, `flow_control`, `is_segment_line`, `locked`,
   `measure_map`, `meta`, `metric_hierarchy`, `number_type` and `regions`,
   and the `graphical`'s `order` and `styles`.
   - *The shown text.* The JSON text of each mode is pinned whole. Without
     the styling, the complete text is byte for byte the fixture file
     `bare.json` and the minimal text `bare.minimal.json` (the `style`
     command changed nothing but `graphical`); with the styling, each is
     that text with the `graphical` member first (keys are sorted), the
     complete one with `order` and `styles`, the minimal one with
     `statements` only. The YAML and TOML texts of each mode read back to
     the JSON text's value (`dumps` equal), with the one difference the
     TOML null rule (case 3) makes: a minimal TOML text reads back with
     the null members it leaves out restored, here the manifest's `name`
     and the timeline's `measure_map` and `metric_hierarchy`, and the
     minimal form of that value is the shown one. No text without the
     styling contains `graphical`.
   - *Apply of one edit.* In each mode and format, the timeline's name
     changed from `Bare` to `Renamed` (`"name": "Bare"`, `name: Bare`,
     `name = "Bare"`) and applied adds one journal entry (2 to 3), and
     `dumps` of the whole stored manifest equals `dumps` of the complete
     JSON text with the styling and that one edit: `graphical` is kept when
     the text leaves it out, and every default a minimal text leaves out is
     completed. The text returned equals the text `manifestText` writes
     from the stored manifest in the same mode and format, so nothing in it
     is left unapplied.
   - *A no-op Apply.* Applying is decided by `dumps` of the complete form:
     `complete` of the value read, with the stored `graphical` put back
     when the styling is excluded, against the stored manifest. In each
     mode and format the shown text, applied, dispatches nothing (the
     journal stays at 2) and returns the shown text. Nor do, in each mode,
     the JSON text with every line break and the indentation after it
     removed, and the compact JSON text (`compactJson`) of the shown value
     with the keys of every object in reverse order: `dumps` sorts keys
     and ignores layout. In both minimal modes the JSON text that spells
     out the timeline's default `"locked": false` dispatches nothing either
     and returns the shown text, without it.
   - *The styling replaced.* In both modes with the styling, the JSON
     text with `"#800000"` replaced by `"#008000"` and applied adds one
     journal entry (2 to 3), and the stored `graphical` is, by `dumps`,
     exactly `{order: {}, statements: [{select: {element: "timeline"},
     set: {stroke: "#008000"}}], styles: {}}`: the typed `graphical` is
     dispatched rather than the stored one, and the minimal one (without
     `order` and `styles`) is completed.
   - *Styling typed into a text that excludes it.* In the complete and in
     the minimal mode without the styling, the YAML text with `graphical:
     {}` appended is refused `hidden_member` at `["graphical"]`, message
     exactly "the styling is excluded; check Include styling to edit
     graphical", and the journal is unchanged.
8. **The selection decides the block.** `selectedBlock` gives `null` for an
   empty selection, the block for its id or for `<id>/<element>`, the same
   block for several addresses in it, and `null` for addresses in two
   blocks.
9. **The properties form builds one `set` per field.** For the geometry
   of a selected block (`geometryOf`, `src/inspector/properties.ts`, case
   11) `propertyCommand`
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

11. **The Properties form edits the selected element's own geometry**
   (`inspector-properties.test.ts`). The defect it guards against: the form
   showed the block's `length` (400) whatever was selected, and a typed
   value rescaled the whole block. What proves it fixed is that for every
   kind of box the form shows that element's value and an edit dispatches a
   `set` aimed at that element's place, the block's fields untouched. The
   kinds (`geometryOf(view, selection)` in `src/inspector/properties.ts`)
   come from the block's drawing, the same memoized drawing the canvas
   shows (arranger's `drawingOf` with the schema package's font metrics),
   never from the form of an address: the block id names the block, a
   group (or its title) the group's frame, a timeline drawn in a card (by
   its line, its card or any other part) that card. Drawn values (x, y,
   width, height of a frame, a card's size) are compared with that drawing's
   `items[].place` and `cards[].size`, since the claim is "shows what is
   drawn"; stated values, the block's length and the default scale are
   pinned as numbers. The workspace is the end-to-end `bundles`
   workspace, block `bmixed0000` ("Mixed": length 400, scale 1, nothing in
   `places`; groups `group_1` with members `performance`, `score` and
   `group_2` with `excerpt` (a child of `recording`) and `page`; the
   ungrouped root `annotations`; `recording`, which holds a member, is drawn
   only as `excerpt`'s ancestor and has no card of its own). Its items are
   drawn at `group_1` (8, 28.8046875), `group_2` (8, 176.3671875) and
   `annotations` (8, 358.50390625), each 562.484619140625 wide, `group_1`
   139.5625 high, every member's card 546.484619140625 wide, and a width
   grows by exactly the length added (the arranger's tests README, sections
   "Fixture facts" and "Items").
   - *Kinds.* `bmixed0000` gives kind `block`, label "Block properties",
     one element `{target: "bmixed0000", group: null, values: {x: 0, y: 0,
     scale: 1, length: 400, spacing: 1, width: null, height: null}}`.
     `bmixed0000/group_1` and its title `bmixed0000/group_1/name` each give
     kind `item`, label "Frame properties", one element with target
     `bmixed0000/group_1`, group `null`, `length` 400 and `scale` 1, and
     `x`, `y`, `width`, `height` the drawn place's. `bmixed0000/annotations/card`
     and the line `bmixed0000/annotations` each give kind `item`, label "Card
     properties", target `bmixed0000/annotations`. `bmixed0000/score/card`
     gives kind `card`, label "Card properties", target `bmixed0000/score`,
     group `bmixed0000/group_1`, `scale` 1, `length` 400 (the group's) and
     `width`, `height` the drawn card's size; `bmixed0000/excerpt/card`
     gives group `bmixed0000/group_2` (a child member has a card). Two
     frames give one `item` geometry with the elements `group_1`, `group_2`
     in selection order; a frame with an ungrouped card gives kind `item`,
     label "Frame and card properties"; `annotations` with
     `annotations/card` gives one element. `null`: no selection,
     `group_1` with `score/card` (two kinds), `bmixed0000` with
     `group_1`, the title `bmixed0000/name`, `bmixed0000/recording`, and
     `bmixed0000/group_1` with `bshared000/group_1` (two blocks).
   - *Stated values win.* After `set` of `bmixed0000/group_1` `place
     {length: 300, scale: 1.5}` and of `bmixed0000/score` `place {width:
     650}`, `group_1` shows `length` 300 and `scale` 1.5, and the card of
     `score` `scale` 1.5, `length` 300, `width` 650.
   - *Commands.* An edit of a place follows the rule of the canvas's
     gestures at the same level (the arranger's `keepsItems` and
     `placeCommand`, one helper for both): on the arranger and in the
     bundle editor the one `set` also states, after the edited places and
     once each, the drawn `x`, `y` of every other item that states none
     (the drawing's `items` order: `group_1`, `group_2`, `annotations`), so
     nothing else moves; in the group and timeline editors it states only
     the edited places. Below, `G2` is the change `{target:
     "bmixed0000/group_2", values: {place: {x: 8, y: 176.3671875}}}` and
     `AN` `{target: "bmixed0000/annotations", values: {place: {x: 8, y:
     358.50390625}}}`; every geometry is taken on the
     arranger (`geometryOf(view, selection)`, the level's default) unless
     stated. For `group_1`, `length` `"300"` gives exactly `{type: "set",
     changes: [{target: "bmixed0000/group_1", values: {place: {length:
     300}}}, G2, AN]}`. For `score/card`, `scale` `"1.5"` gives the changes
     `[{target: "bmixed0000/group_1", values: {place: {scale: 1.5}}}, G2,
     AN]` (the members share their group's scale and length; the frame
     whose place is edited states no position), `width` `"650"` the changes
     `[{target: "bmixed0000/score", values: {place: {width: 650}}}, G2,
     AN]` (the frame holding the card states no position either: a card's
     size never moves its frame's top left corner) and `width`
     `""` the same with `{place: {width: null}}` there
     (unstated); `length` `""` is refused `invalid_value` "length needs a
     number" at `["bmixed0000/score", "length"]`. Two frames and `length`
     `"350"` give one `set`, `group_1` then `group_2`, then `AN`. Two cards
     of one group (`performance/card`, `score/card`) and `scale` `"2"` give
     one change on `bmixed0000/group_1`, then `G2`, `AN`; `width` `"500"`
     gives `bmixed0000/performance`, `bmixed0000/score`, then `G2`, `AN`. With `group_1`'s length stated 300, a step up of `length` on
     both frames gives one `set` with `group_1` 301, `group_2` 401 (each
     element steps from its own exact value; `group_2` draws the block's
     length, 400), then `AN`.
   - *The gestures' rule, level by level.* A frame's `scale` `"1.5"` on
     the arranger gives exactly `[{target: "bmixed0000/group_1", values:
     {place: {scale: 1.5}}}, G2, AN]`; with `group_2` stating `{y: 200}`
     first, `G2` becomes `{place: {x: 8}}` (an item stating one member gets
     only the other) and `annotations`, drawn below `group_2`'s bottom edge,
     states `{x: 8, y: 382.13671875}` (`200 + 174.13671875 + 8`). In the bundle editor (`level` `"bundle"`) the same
     edit gives the same three changes. In the group editor (`"group"`) the
     `scale` `"1.5"` of `score/card` gives only `[{target:
     "bmixed0000/group_1", values: {place: {scale: 1.5}}}]`, and in the
     timeline editor (`"timeline"`) its `width` `"650"` only `[{target:
     "bmixed0000/score", values: {place: {width: 650}}}]`.
   - *The group editor's length.* In the group editor the frame does not
     adapt, so a typed or stepped `length` of the edited frame or of a
     member's card gives the group editor's stretch values, through the one
     helper the stretch uses (arranger's `cappedLength`, whose values the
     arranger's tests README derives in "The group editor's stretch"): the
     length capped where the cards would pass the frame and `width` pinned
     at the frame's drawn width quantized to 1/2048, `562.48486328125`
     (562.484619140625 rounds up). At level `"group"`: `group_1` `length`
     `"500"` gives exactly `[{target: "bmixed0000/group_1", values: {place:
     {length: 400, width: 562.48486328125}}}]` (`W(400)` already fills the
     frame); `score/card` `length` `"300"` gives `[{target:
     "bmixed0000/group_1", values: {place: {length: 300, width:
     562.48486328125}}}]`; a step up of `group_1`'s `length` (401) gives
     the capped `{length: 400, width: 562.48486328125}`; with `group_1`
     stating `{width: 600}` first, `group_1` `length` `"500"` gives
     `{length: 437.51513671875, width: 600}` (`600 − 162.484619140625`
     floored to the lattice). On the arranger the same `"500"` is the
     uncapped `{length: 500}` with `G2`, `AN`.
   - *Positions are the bundle editor's.* `offered(geometry, property)`
     (the predicate the form's `disabled` reads) withholds what the level
     does not edit: for a block, `scale`, `length` and `spacing` in a group
     or timeline editor; for an item (a frame or an ungrouped card), `x`
     and `y` everywhere but the bundle editor, where items are moved, so a
     typed value never moves an item where no gesture moves it. For
     `group_1`: on the arranger, in the group editor (`"group"`) and, for
     `annotations/card`, in the timeline editor (`"timeline"`), `x` and `y`
     are not offered and `scale`, `length`, `width`, `height` are; in the
     bundle editor all six are. A member's card has no `x`, `y` and offers
     its four fields at every level; for the block the rule is unchanged
     (`x`, `y`, `width`, `height` offered at every level).
   - *Live values.* `geometryOf(view, selection, level, placement)` with a
     `placement` of `bmixed0000` whose drawing is the block's drawing with
     `places` `{group_1: {length: 460}}` (a Stretch preview) reads the items
     and cards from that drawing: `group_1`'s `length` 460 and `width`
     622.484619140625 (562.484619140625 + 60), `score/card`'s `length` 460
     and `width` 606.484619140625; a placement of another block, or none,
     gives the stored 400 and 562.484619140625.
   - *Shown values.* `commonValue` gives the value every element shares,
     `undefined` when they differ (300 and 400). `fieldLabel` names a
     card's `scale` and `length` "group scale" and "group length" and every
     other field by its property.

   The component (same file) is mounted with a store reading the
   `bundles` workspace:
   - `bmixed0000/group_1`: the Properties panel holds one form, "Frame
     properties", whose fields are exactly `x`, `y`, `scale`, `length`,
     `width`, `height` (no `spacing`); `length` shows `400` and `scale`
     `1`. `300` typed into `length` and Enter adds one journal entry whose
     command is exactly the one above (with `G2` and `AN`); the block's own
     `length` stays 400 and the field shows `300`.
   - `bmixed0000/score/card`: one form, "Card properties", fields exactly
     `scale`, `length`, `width`, `height`, labelled "group scale", "group
     length", "width", "height". `1.5` typed into `scale` and Enter
     dispatches `[{target: "bmixed0000/group_1", values: {place: {scale:
     1.5}}}, G2, AN]`; `650` into `width` then only `[{target:
     "bmixed0000/score", values: {place: {width: 650}}}]` (`group_2` and
     `annotations` state their positions now, and the frame holding the
     card is given none); the field then emptied
     and Enter, only `[{target: "bmixed0000/score", values: {place:
     {width: null}}}]`, after which the block's `places` hold no `score`.
   - `group_1` and `group_2`: `350` typed into `length` and Enter adds one
     entry with the two frames' changes and `AN`; both frames' places then
     state `length` 350. With `group_1`'s length stated 300 first, `length`
     shows nothing with the placeholder "mixed", and ArrowUp adds one entry
     setting 301 and 401, then `AN`.
   - In the group editor of `bmixed0000/group_1` (opened before mounting;
     the Properties tab chosen), `score/card` with `1.5` typed into
     `scale` and Enter adds one entry to the editor's session whose command
     is exactly `{type: "set", changes: [{target: "bmixed0000/group_1",
     values: {place: {scale: 1.5}}}]}`; `500` typed into "group length"
     then adds one entry whose command is exactly `{type: "set", changes:
     [{target: "bmixed0000/group_1", values: {place: {length: 400, width:
     562.48486328125}}}]}`. In the bundle editor of `bmixed0000`, `group_1`
     with `1.5` typed into `scale` dispatches the three changes of the
     arranger.
   - `group_1` on the arranger: its `x` and `y` fields are `disabled` and
     its other four enabled; in the bundle editor of `bmixed0000` all six
     are enabled; in the group editor of `bmixed0000/group_1`, `x` and `y`
     are disabled again.
   - *Following a gesture live.* In the bundle editor of `bmixed0000`,
     `group_1` selected and the `placement` prop (held reactive) set to a
     placement of `bmixed0000` whose drawing has `places` `{group_1:
     {length: 460}, group_2: {x: 8, y: 176.3671875}, annotations: {x: 8,
     y: 358.50390625}}` (what a Stretch by 60 previews): `length` shows
     `460` and `width` `622.48` while nothing is dispatched; `placement`
     `null` again (the release refused, nothing stored): `400` and
     `562.48`. With `score/card` selected and the same placement, "group
     length" shows `460` and `width` `606.48`.
   - `bmixed0000`: one form, "Block properties", with the seven block
     fields.
   - `group_1` with `score/card`, and the title `bmixed0000/name`: the
     Properties panel reads exactly "Select a block, a frame or a card to
     edit its geometry." and holds no form.

The component test mounts `Inspector.svelte` with a store holding `bare`
(block `0000000000`) and `styled__score` (block `0000000001`), and proves
the wiring. Every case that reads or edits the manifest text opens the
Manifest tab first, as a user must. Choosing YAML before its codec is loaded shows exactly
"Loading YAML…" and no textarea, and once `loadCodec("yaml")` resolves the
YAML text; with nothing selected and with both blocks selected the
Properties panel and the Manifest panel each read exactly the hint "Select
a block to inspect its manifest." and hold no form and no textarea (the
tab list stays, since the Journal tab is always there); with
`0000000000` selected the textarea holds `saveManifest` of its manifest;
choosing YAML shows exactly `writeText("yaml", manifest)`; while the text holds an unapplied edit
the three format radios and the checkboxes "Include styling" and "Minimal"
are disabled and a hint reading
exactly "Apply or Revert to switch" (`#inspector-switch-hint`) is shown and
named by `aria-describedby` on the radio group and both checkboxes; without an
edit there is no hint; the edited text applied with Ctrl+Enter in the
textarea adds one journal entry and removes the hint; an edited, unapplied
text survives an external `set` and shows exactly "The manifest changed;
Revert to see it", and Revert shows exactly the newer manifest
(`writeText("yaml", …)` of the stored manifest, written afresh, with
`name: Bye`), removes the notice and disables both Apply and Revert; the refused text of
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
`21`. A live value given to the component (`placement`, the block as a
canvas gesture shows it) is shown instead of the stored one for that block,
rounded the same way, but never over a draft: with `placement` holding `x`
`5.556` the field shows `5.56`, and with `33` typed it keeps `33`; with
`placement` back to `null` the field shows the stored value again. Live values
of another block are ignored.

**The Properties and Manifest tabs** (`Inspector.test.ts`). With a block
selected and no editor open it shows a tab list (`role="tablist"`,
`aria-label` "Inspector sections") of three `button`s with `role="tab"`,
"Properties" (`#inspector-tab-properties`), "Manifest"
(`#inspector-tab-manifest`) and "Journal" (`#inspector-tab-journal`, below),
each naming its panel by `aria-controls` (`inspector-panel-properties`,
`inspector-panel-manifest`, `inspector-panel-journal`), and `role="tabpanel"`
elements with those ids, each `aria-labelledby` its tab and without a
`tabindex`: the panels hold focusable controls, so a panel is no tab stop of
its own. What proves the
pattern is the state after each action, read as `aria-selected` and
`tabindex` of the first two tabs and `hidden` of their panels: at mount "Properties"
is selected (`true`, `0`; `false`, `-1`; the Properties panel shown, the
Manifest panel hidden); the form "Block properties" lies in the Properties
panel, and the format radio group, both checkboxes and the textarea in the
Manifest panel; a click on "Manifest" swaps all of it. On a focused tab
ArrowRight and ArrowLeft select the next and the previous tab, wrapping,
Home selects the first tab and End the last, and the selected tab has the
focus after each key: from "Properties", ArrowRight gives Manifest,
ArrowLeft Properties, Home Properties, ArrowRight Manifest, ArrowLeft
Properties (the Journal tab's place among them is pinned below). A key held with a modifier is left to the browser (Alt+ArrowLeft
goes back): ArrowRight with Alt, with Ctrl and with Meta on the focused
"Properties" each leaves "Properties" selected and focused, and the event
is not prevented. The Manifest panel holds the manifest's parts in the
order the user reads them: with a shared warning case
(`timeline_class.json`) in `0000000000`, its JSON text edited (the first
`meta` given a member) and the root renamed `Bye` by a `set`, so the hint
and the stale notice are shown, the panel's controls are exactly, in
document order, the radios JSON, YAML and TOML, the checkboxes "Include
styling" and "Minimal", the textarea "Manifest (JSON)", and the buttons
Apply and Revert; the radio group, both checkboxes, the textarea, Apply,
Revert, the problem list `#inspector-problems` and the warning list
`#inspector-warnings` follow one another in that document order; those
eight, the hint `#inspector-switch-hint` and the stale notice all lie in
the Manifest panel and none in the Properties panel. The tab is the component's own state: with "Manifest" chosen,
the `selection` prop changed from `0000000000` to `0000000001`, then to
nothing (both panels read the hint, the tab list stays) and back to `0000000001`
keeps "Manifest" selected; mounted again, the inspector selects
"Properties". Both panels stay mounted, so an unapplied text survives a
visit to Properties: with the JSON text edited (`"Bare"` → `"Bared"`),
clicking Properties and then Manifest shows the same edited text, Apply
and Revert still enabled.

**Apply and Revert are enabled exactly while the text is edited, in each
of the four modes** (`Inspector.test.ts`). A mode is complete or minimal,
with the styling excluded or included. The case runs once per mode on
`styled__score` (block `0000000001`), whose minimal and complete forms
differ and which carries `graphical`, after checking "Minimal" and
"Include styling" as the mode asks (both are unchecked at mount). Each step
pins the text and both buttons' `disabled`:

1. Shown: the textarea holds exactly `manifestText(manifest, "json",
   {includeStyling, minimal})` of the stored manifest; it contains
   `"graphical"` exactly when the styling is included and
   `"is_segment_line"` exactly in the complete form (the minimal form drops
   it at its default `false`), so the component passes both options; both
   buttons disabled.
2. One character typed (`"name": "Score"` becomes `"name": "Scores"`): both
   enabled.
3. That character deleted again, so the text equals the shown text
   character for character: both disabled.
4. The character typed again, then Revert: the text is exactly the shown
   text, both disabled, and the journal still holds only its two `add`s.
5. The shown text without its final `}` (invalid JSON), then Apply:
   refused with exactly one problem, `syntax_error`; the text is kept, both
   enabled, the journal unchanged.
6. The edit of step 2 written over it, then Apply: the journal grows to
   three entries, the root's stored `name` is "Scores", the text is exactly
   `manifestText` of the stored manifest in the same options, no problem is
   listed, both disabled.

**A clean text always follows the store** (`Inspector.test.ts`), so
nothing the inspector lists asks for a button that is disabled. The listed
problems come from one of two sources, kept apart by the component rather
than read from the texts: a refused Apply (they belong to the text applied,
and go once the text is clean) or writing the manifest (they belong to the
manifest, and stay while it is shown).
- Stale, typed back: with `0000000000` selected, the JSON text edited
  (`"Bare"` → `"Bared"`) and the root renamed `Bye` by a `set` on
  `0000000000/bare`, the notice "The manifest changed; Revert to see it"
  is shown and the edit kept; typing the text back to the shown text
  removes the notice at once, the textarea holds exactly `manifestText` of
  the stored manifest (JSON, both options off, with `"name": "Bye"`), both
  buttons are disabled, and the journal holds the two `add`s and that
  `set` only.
- Refused, typed back: with `0000000000` selected, the shown JSON text
  without its final `}` applied is refused with exactly one problem,
  `syntax_error`, both buttons enabled; typing the text back to the shown
  text leaves no problem listed, the textarea `aria-invalid` `false`, both
  buttons disabled, and the journal at its two `add`s.
- A writing problem stays: a store holding, in block `0000000000`,
  `loadManifest` of one `quarters` timeline `score` (length `[4, 1]`)
  whose measure-map row has `nominal_length: null` (case 3's refusal),
  with TOML chosen, shows an empty textarea and exactly one problem,
  `not_representable` at
  `/timelines/0/measure_map/0/nominal_length`, both buttons disabled;
  typing `x` enables both, and deleting it again (the text and the shown
  text both empty) disables both and still lists exactly that one problem.
  Ctrl+Enter in that clean, empty textarea applies nothing: the problem
  list is still exactly that one `not_representable`, and the journal
  still holds only its `add` (an Apply of the empty text would replace it
  with the problems of reading that text).

**Apply reloads the properties.** After an accepted Apply the Properties
panel shows the stored manifest, and the tab stays "Manifest".
- Drafts are discarded (`Inspector.test.ts`): with `0000000000` selected,
  `0` typed into `scale` and Enter is refused by the store
  (`non_positive_number`), so the field keeps `0` and
  `#property-problem-scale` is shown; on the Manifest tab the name edited
  (`"Bare"` → `"Bared"`) and applied grows the journal to three entries,
  "Manifest" stays selected, and on Properties `scale` shows `1` and no
  problem is shown.
- The Locked checkbox follows (`inspector-locked.test.ts`, below).
- The inspected name follows (`inspector-subject.test.ts`, below).

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

**A selected timeline shows its `locked` as a disabled checkbox**
(`inspector-locked.test.ts`). Only timelines carry `locked`. When the
selection is exactly one address and that address names a timeline, or a
part of one such as its card `<block>/T/card` (the element is read with
core's `elementOf`, as the arranger reads it), the inspector shows a
checkbox labelled "Locked" holding that timeline's own `locked` (the
store holds the complete form, so an absent key reads `false`). It is one
more cell of the block properties form, the one right after `height`
(right of height, under width), a plain label around the input: there is
no fieldset, no legend and no hint text in the inspector. Anything
else shows no checkbox: no selection, a block, several addresses (even two
naming one timeline), a group, a region or any other non-timeline element,
an address naming nothing. A timeline drawn in no card of its own (a
child that is no group member) has no geometry: the Properties panel shows
the geometry hint of case 11, and the checkbox is the only cell of a form
"Timeline properties". Locking and unlocking is not available yet, so
the checkbox is disabled for every timeline, with the `title` "Locking and
unlocking is not available yet." on the input. What proves it is a manifest
written for the test, in block `0000000000`, whose `locked` values follow
the rules a writer obeys, so that reading the manifest can never change
them: a plain segment is unlocked, and a segment line that is a segment
is locked. All its timelines are on `pixels`:

- root `fixed`, length 300, locked, member of the group `group_1`, with the
  child `take` (offset 20, length 100, unlocked);
- root `free`, length 300, unlocked, with the region `region_1` (0 to 100);
- root `pages`, length 300, a segment line, unlocked, with the segments
  `page_1` (offset 0, length 100) and `page_2` (offset 100, length 200),
  both locked and both segment lines (a segment line's segments share one
  flag value), holding the plain segments `part_1` (offset 0, length 100)
  and `part_2` (offset 0, length 200), both unlocked.

`selectedTimeline(view, selection)` (`edit.ts`) gives the block, the
command target `<block>/<timeline id>` and the timeline value: for
`0000000000/fixed` the timeline `fixed` (locked `true`), for `…/free`
`false`, for `…/take` `false` (the child's own value, not its locked
parent's), for `…/pages` `false`, for `…/page_1` and `…/page_2` `true`,
for `…/part_1` `false`; for the card `…/fixed/card` the timeline `fixed`
with target `0000000000/fixed`, and for `…/take/card` the child `take`;
any other part names its timeline the same way: `…/fixed/name` gives
`fixed` (locked `true`) and `…/page_1/start` gives `page_1` (locked
`true`), each with the target `<block>/<timeline id>`. It
gives `null` for an empty selection, for `0000000000`, for `…/group_1`,
for `…/free/region_1`, for `…/free/nothing`, for an address in a block
that does not exist (`0000000001/fixed`), and for the two addresses
`…/fixed` and `…/fixed/card` together.

The component, mounted with that store, shows the checkbox for
`…/fixed` (checked), `…/free`, `…/take`, `…/pages` (not checked),
`…/page_1` (checked), `…/part_1` (not checked) and `…/fixed/card`
(checked), each disabled, with that `title`; there is exactly one
checkbox labelled "Locked" then, its label is a cell of the panel's one
form: for `…/fixed` and `…/fixed/card` (a member's card) and for `…/free`
and `…/pages` (ungrouped roots' cards) the form "Card properties",
directly after the label holding the field `height` (the next element
sibling); for `…/take`, `…/page_1` and `…/part_1` (children drawn in no
card of their own) the form "Timeline properties", whose only cell it is.
The inspector holds no `fieldset`, `legend` or `.locked-hint`, and no
element whose text is the `title`'s. For `0000000000` and `…/group_1`
there is none, and the last cell of the form ("Block properties", "Frame
properties") is the label of `height`; for `…/free/region_1` (no geometry)
and for `…/fixed` with `…/free` (a member's card and an ungrouped root's
card, two kinds) there is none and no form. The checkbox follows the store: with
`…/free` shown, a `set` of `locked` `true` on `0000000000/free`
dispatched to the store checks it. It follows an applied manifest text the
same way, without a change of selection: with `…/free` selected and the
Manifest tab open, the text replaced by `manifestText` (JSON, both options
off) of the stored manifest with `free`'s `locked` set to `true`, and
applied, the journal grows by one entry, "Manifest" stays selected, and
the Locked checkbox in the Properties panel is checked, before and after
clicking "Properties". `free` is chosen because the store accepts that
value through a manifest as through `set locked`: a root that is no
segment and no group member keeps its own `locked`.

**The editor names what the selection names beside the drawer's heading**
(`inspector-subject.test.ts`). Next to the `h2` "Inspector" (whose
accessible name stays exactly "Inspector") an element `#inspector-subject`
shows `inspectedSubject(view, selection)` (`edit.ts`): the words for the
kind of element, then the element's name as text when it has one, else its
id in a `code` element; the drawer's `aria-describedby` names the element
while it is shown. The kind word comes from what the address resolves to
in the block's manifest, through core's `parseAddress`, `elementOf`,
`findTimeline` and `findEntry`, never from the address's shape: the block
and the manifest's own id name the manifest, every manifest being an
alignment bundle ("Bundle", or "Anonymous bundle" without `id` and
`name`); `name` its title; a group's id the group; a timeline's id the
timeline (a segment line and a segment too); `<root>/<id>` the conversion
map, region, break, jump or marker it names. Each part the address appends
comes before the kind as "<Part> of", innermost first, the part `name`
reading "Title" on the bundle and a group and "Name" on a timeline. The
function gives `{words, name, id}`, `id` only when `name` is `null`. What
proves it is the committed end-to-end workspaces (the generator's output,
read with `readWorkspace`), whose blocks hold every kind:

- `bundles.tle.json`, block `bmixed0000` (named "Mixed", no id; groups
  `group_1` "Performance" and `group_2` "Facsimile"; the child `excerpt`
  "Excerpt" of `recording`): `bmixed0000` gives "Bundle" with name
  "Mixed"; `…/name` "Title of bundle", "Mixed"; `…/group_1` "Group",
  "Performance"; `…/group_1/name` "Title of group", "Performance";
  `…/score` "Timeline", "Score"; `…/score/card` "Card of timeline",
  "Score"; `…/score/start` "Start of timeline", `…/score/end` "End of
  timeline", `…/score/name` "Name of timeline", each "Score";
  `…/score/end/label` "Label of end of timeline", "Score"; `…/excerpt`
  "Timeline", "Excerpt". Block `bungroup00`: the segment line `…/pages`
  "Timeline", "Pages"; its segment `…/page_1` "Timeline", "Page 1";
  `…/page_2/label` "Label of timeline", "Page 2".
- `groups.tle.json`, block `gchild0000` (no id, no name; group `group_1`
  "Second half"): `gchild0000` gives "Anonymous bundle" with neither name
  nor id; `…/name` "Title of anonymous bundle"; `…/group_1` "Group",
  "Second half"; `…/second-half` "Timeline", "Second half". The same
  block's manifest given the id `takes` by one `set` of the block's
  `manifest` (the loaded manifest spread with `id: "takes"`) gives
  "Bundle" with id `takes` for `gchild0000` and for `…/takes`, and
  "Title of bundle" with id `takes` for `…/name`; `bmixed0000`'s manifest
  given the id `mixed` the same way still gives "Bundle" with name "Mixed"
  and no id.
- `small.tle.json`: in `map0000000`, `…/melody/tempo` "Conversion map",
  "Tempo", and `…/melody/ticks` (a map of the child `phrase`, addressed by
  its root) "Conversion map", "Ticks"; in `flow000000`,
  `…/flow:quarters/break_1` "Break", "fine", `…/flow:quarters/break_1/label`
  "Label of break", "fine", `…/flow:quarters/jump_1` "Jump" with id
  `jump_1` (a jump has no name), `…/flow:quarters/marker_1` "Marker",
  "repeat-start"; in `styled0000`, `…/score/intro` "Region", "intro",
  `…/score/intro/label` "Label of region", "intro", `…/score/da-capo`
  "Jump" with id `da-capo`, `…/a` (a child without a name) "Timeline"
  with id `a` and `…/a/card` "Card of timeline" with id `a`.
- Several addresses give their count with neither name nor id:
  `bmixed0000` with `…/score` "2 selected", and with `…/group_1` as well
  "3 selected". `null` for an empty selection, for `…/nothing`, for
  `…/score/x` (no part `x`), for `…/score/region_x` (no such entry) and for
  a block that does not exist (`0000000009`).

The editor, mounted, with a workspace loaded through the test hook shows
it: with `bundles.tle.json`, selecting `bmixed0000` gives
`#inspector-subject` the text exactly "Bundle Mixed" and no `code`, a
sibling of the `h2` in the drawer's head, the drawer `#inspector` has
`aria-describedby` `inspector-subject`, and its `h2` reads exactly
"Inspector"; `bmixed0000/group_1` "Group Performance"; `bmixed0000/score`
"Timeline Score"; `bmixed0000/score/card` "Card of timeline Score". With
`groups.tle.json`, `gchild0000` gives exactly "Anonymous bundle" and no
`code`. With `small.tle.json`, `styled0000/a` gives "Timeline a" with
`code` "a". Selecting nothing removes the element and the drawer's
`aria-describedby`. The name follows an applied manifest text: with
`bundles.tle.json` loaded and `bmixed0000/score` selected ("Timeline
Score"), the inspector's Manifest tab opened and its JSON text edited from
`"name": "Score"` to `"name": "Scores"`, Apply makes `#inspector-subject`
read exactly "Timeline Scores" with no change of selection.

## The Editor and Journal tabs (`journal.test.ts`, `inspector-tabs.test.ts`)

While an editor is open the inspector gains a first tab, "Editor", naming
the innermost editor; the "Journal" tab, last, is always there and lists
the entries of the level the user works on, newest first. The rows are
read from the store's `listed` alone (every entry of the level with its
undo state, a session's entries nested) and are plain TypeScript
(`src/inspector/journal.ts`), so their texts are pinned without a DOM; the
component only places them. What would prove it works, and the exact
values each test pins:

1. **Names follow the manifest, never the address's shape alone**
   (`journal.test.ts`). The view holds the bundle fixture `bundle_mixed`
   three times, through the store's `add`: `0000000000` as it is (title
   "Mixed", no id; group `group_1` "Performance"; root `score` "Score";
   child `excerpt` "Excerpt"), `0000000001` with the title dropped, the id
   `mixed` given, `group_2`'s name and `score`'s name dropped, and
   `0000000002` with the title dropped and no id. `editorName(view,
   target)` gives: `0000000000` "Mixed"; `0000000001` "mixed" (the id when
   there is no title); `0000000002` "Anonymous bundle"; `0000000000/group_1`
   "Performance"; `0000000001/group_2` "group_2"; `0000000000/excerpt`
   "Excerpt" (a child timeline); `0000000001/score` "score"; and, for what
   the view does not hold, the address itself: `0000000000/gone`
   "0000000000/gone", `0000000009/score` "0000000009/score", `0000000009`
   "0000000009". The editing bar names the editing path with the same
   function.
2. **Each command reads as one sentence** (`journal.test.ts`). On the
   arranger (`editing` empty) each entry below, alone in `listed` and
   applied, gives exactly one row `{entry, time, author, text, undone:
   false, earlier: false, children: []}`, `entry` being the entry itself
   (the panel keeps one item per entry, case 6),
   `time` being characters 11 to 19 of the entry's UTC time
   (`2026-10-17T08:05:09.123Z` gives `08:05:09`, `2026-10-17T23:59:58.999Z`
   gives `23:59:58`) and `author` the entry's:
   - `add` of the block `0000000003` into `workspace`: "Added block
     0000000003 to workspace"; `add` of the region `region_1` into
     `0000000000/score`: "Added region region_1 to 0000000000/score";
   - `set` of `x` and `y` of `0000000000`: "Set x, y of 0000000000"; with a
     second change on `0000000001`: "Set x, y of 0000000000 and 1 more";
     `place` on `0000000000/group_1`, `0000000000/group_2` and
     `0000000000/annotations`: "Set place of 0000000000/group_1 and 2
     more";
   - `remove` of `0000000000/group_2` and `0000000001`: "Removed
     0000000000/group_2, 0000000001";
   - `style` selecting `{ids: ["score"]}`: `Styled {"ids":["score"]}`;
     selecting `{element: "timeline"}`: `Styled {"element":"timeline"}`;
   - a session entry, its session in `sessions`: of `0000000000/group_1`
     with one entry, "Edited group Performance (1 change)"; of
     `0000000001/score` with two, "Edited timeline score (2 changes)"; of
     `0000000000/excerpt` with one, "Edited timeline Excerpt (1 change)";
     of `0000000002` with three, "Edited bundle Anonymous bundle (3
     changes)"; of `0000000000` holding one command and the session of
     `0000000000/group_1` holding two, "Edited bundle Mixed (3 changes)":
     the count is of changes (commands at every depth), never of entries,
     so a bundle session holding a group session reads like the user's
     three changes. The kind word is the editor kind of the target in the
     view (`editorKindOf`): a block a bundle, a group a group, a root or
     child timeline a timeline. A target the view no longer holds has no
     kind word, because what it was is not read back from earlier views:
     through a real store (case 1's three blocks), `open` of
     `0000000000/group_1`, a `set` of `score`'s name, Done, and then a
     `remove` of `0000000000/group_1` on the arranger give, before the
     remove, the session row "Edited group Performance (1 change)" and,
     after it, "Edited 0000000000/group_1 (1 change)" (the name falls back
     to the address, as in case 1), below the newer "Removed
     0000000000/group_1". The word "timeline" for the removed group would
     be a guess.
3. **Rows run newest first, and a session holds its changes as rows**
   (`journal.test.ts`). The user reads the latest change at the top, the
   one the next undo reverts or the next redo re-applies. `listed` runs
   oldest first with the undone changes last, so the rows are `listed`
   reversed at every depth. With four distinct `set` entries `e1`, `e2`,
   `u1`, `u2` (texts "Set x of 0000000000" … told apart by their targets),
   rows read as `[text, undone, earlier]`:
   - on the arranger with `e1`, `e2` applied and `u1`, `u2` undone, the
     rows are `u2`, `u1`, `e2`, `e1`, `undone` exactly `[true, true,
     false, false]`, `earlier` all `false`;
   - in an editor whose `earlier` is `null`, with `e1` applied and `u1`
     undone: `u1`, `e1` (`undone` `[true, false]`);
   - in an editor whose `earlier` is `s0`, a session holding `[u2, e2]`:
     `u1`, `e1`, `e2`, `u2`, `earlier` exactly `[false, false, true,
     true]` and `undone` `[true, false, false, false]` (the earlier
     session's rows last, below the open level's);
   - with two editors open, the outer one with `earlier` `s0` and the inner
     one with `earlier` `null`: only the inner level's rows (the earlier
     session belongs to the outer level);
   - a partly undone session: on the arranger the entries are `e1` and
     the session `s5` of `0000000000` holding `[e2, s6]`, where `s6` is
     the session of `0000000000/group_1` holding `[u1, u2]`: four changes
     in order `e1`, `e2`, `u1`, `u2`, the first three applied (`listed`
     built by core's `listEntries` with 3 applied). The rows are `s5`
     "Edited bundle Mixed (3 changes, 1 undone)" (`undone` false), then
     `e1`; `s5`'s children are `s6` "Edited group Performance (2 changes,
     1 undone)" and then `e2` (newest first), and `s6`'s children `u2`
     (`undone` true) and then `u1` (`undone` false). With nothing
     applied, `s5` reads "Edited bundle Mixed (3 changes)" with `undone`
     true, and so does every row below it at every depth;
   - in an editor with `e1` applied whose `earlier` is `s0` holding
     `[s7]`, `s7` the session of `0000000000/score` holding `[e2]`: the
     rows are `e1` (`earlier` false) and `s7` "Edited timeline Score (1
     change)" (`earlier` true), whose one child `e2` has `earlier` true
     too;
   - nothing anywhere: no row.
4. **The tab set follows the editing path** (`inspector-tabs.test.ts`).
   The component reads the editing path from the store whenever the store
   reports a change, so the cases drive a store whose `editing` (and, for
   case 6, `listed` and `sessions`) are set by the test and
   announced through `subscribe`, over a real store holding the three
   blocks of case 1; this pins the inspector's part independently of how
   the store opens and closes editors. The tabs are read as `[id, text,
   aria-selected, tabindex]` and the panels as `[id, hidden]`:
   - no editor, `0000000000` selected: the tabs Properties, Manifest,
     Journal, "Properties" selected; no `#inspector-tab-editor` and no
     `#inspector-panel-editor`;
   - nothing selected: the same three tabs; the Properties and Manifest
     panels each read exactly the hint; a click on "Journal" shows the
     Journal panel with one row per `add`;
   - an editor opened on `0000000000/group_1` (kind group) while
     "Properties" is selected: the tabs Editor, Properties, Manifest,
     Journal, "Editor" selected (`true`, `0`, every other `false`, `-1`),
     its panel `#inspector-panel-editor` (`aria-labelledby`
     `inspector-tab-editor`) shown, reading exactly "Group editor:
     Performance", every other panel hidden;
   - with "Journal" then selected, a second editor opened inside it on
     `0000000000/score` (kind timeline): "Editor" selected again, reading
     "Timeline editor: Score";
   - that inner editor closed with "Editor" selected: "Editor" stays
     selected and reads "Group editor: Performance";
   - the last editor closed with "Editor" selected: the Editor tab and its
     panel are gone and "Properties" is selected and shown; closed with
     "Manifest" selected instead: "Manifest" stays selected;
   - the inspector mounted while an editor on `0000000000` (kind bundle)
     is open: "Editor" selected, reading "Bundle editor: Mixed";
   - the editing bar (`role="group"`, "Editing") is absent without an
     editor and precedes the tab list with one;
   - through the real store, end to end: `open` of `0000000000/group_1`
     selects "Editor" reading "Group editor: Performance"; a `set` of
     `score`'s name and Done select "Properties", and the Journal panel's
     texts are exactly "Edited group Performance (1 change)" and then the
     three `add`s, newest first.
5. **The keys move over the tabs present** (`inspector-tabs.test.ts`).
   The selected tab has the focus after each key. With an editor open,
   from "Editor": ArrowRight Properties, ArrowRight Manifest, ArrowRight
   Journal, ArrowRight Editor (wrapping), ArrowLeft Journal (wrapping),
   Home Editor, End Journal. Without one, from "Properties": ArrowLeft
   Journal (wrapping), ArrowRight Properties, End Journal, Home Properties.
6. **The Journal panel lists the rows** (`inspector-tabs.test.ts`). With a
   real store whose clock is fixed at `2026-10-17T08:05:09.123Z`, holding
   the three `add`s of case 1, a `set` of `x` 25 on `0000000000` and then an
   undo, the Journal panel holds an ordered list (`ol`, `aria-label`
   "Journal") of four items, each with its time, author and text in
   elements of their own (`08:05:09`, `Gerhardt`, the row's text), newest
   first: the first, "Set x of 0000000000", carries `data-undone` and a
   visually hidden word "undone", the three `add`s after it (block
   `0000000002`, `0000000001`, `0000000000`) neither. The list follows the
   store: a `set` of `y` 7 on `0000000000` replaces the undone item (four
   items, the first "Set y of 0000000000", none `data-undone`). With the
   earlier session of case 3 (the store of case 4 set to an editor whose
   `earlier` is `s0`, its session holding one `set` of `order` on
   `0000000000/group_1` by "Ada" at `07:00:01`, and `listed` the three
   `add`s applied), its item comes last and carries `data-earlier`, the
   three `add`s before it without.
   The items are kept per entry, never per position (an entry is listed
   once: in the earlier session or on the open level): with the same
   editor first open without an earlier session and the Journal tab
   selected, the three `add`s' items are the very same elements after the
   earlier session's item has been put behind them, and after a fourth
   entry has been put in front of them, which items kept per position
   would not be.
   A level with no rows says so instead of showing an empty list, which
   would have no size and so not be seen at all: with the store of case 4
   set to an editor on `0000000000/group_1` whose `earlier` is `null`,
   `listed` empty (a fresh editor), and the Journal tab selected, the
   panel's text is exactly "No changes yet." and it holds no `ol`; with
   `listed` then one applied `set` of `x` on `0000000000`, it holds the
   list of exactly one item, "Set x of 0000000000", and the text "No
   changes yet." is gone.
   **A session row discloses its changes.** Through the real store, `open
   0000000000`, `open 0000000000/group_1`, `set score name "S"`, `set
   performance name "P"`, Done, Done, then one undo on the arranger: the
   first item reads "Edited bundle Mixed (2 changes, 1 undone)" and holds
   a native `button` (`type="button"`) before its time, with
   `aria-expanded` `"false"`, no `aria-controls` and no nested list in the
   item (a collapsed row's changes are not in the page, so neither the
   eye nor a query finds them); the button's accessible name is the row's
   text (`aria-labelledby` the text's element). A click sets
   `aria-expanded` `"true"`, puts the nested `ol` into the item and
   `aria-controls` names it: one item "Edited
   group Performance (2 changes, 1 undone)", itself holding a collapsed
   button; expanding it shows "Set name of 0000000000/performance" with
   `data-undone` and the hidden word "undone", then "Set name of
   0000000000/score" without (newest first). A second click on the outer
   button sets `aria-expanded` back to `"false"` and takes the nested
   list out again. A command row has no button. Expansion is view state of the
   panel: nothing of it reaches the store (the journal and `listed` are
   the same objects before and after the clicks).
7. **A group or timeline editor offers no block field it would refuse**
   (`inspector-tabs.test.ts`). Inside a group or timeline editor the store
   refuses every change of the block's `scale`, `length` and `spacing` (a
   change of the whole block is a side effect of editing one element), so
   the Properties form disables exactly these three fields there and
   leaves `x`, `y`, `width` and `height` as they are. Through the real
   store of case 1 with `0000000000/group_1`'s editor open, a `set` of
   `scale` 2 on `0000000000` is refused (`side_effect`), which is why the
   fields go. With the store of case 4 and `0000000000` selected, the
   fields read as `[name, disabled]` in form order:
   - no editor: all seven enabled;
   - an editor on `0000000000` (kind bundle): all seven enabled (the
     bundle editor changes the block itself);
   - an editor on `0000000000/group_1` (kind group): `scale`, `length`,
     `spacing` disabled, `x`, `y`, `width`, `height` enabled;
   - a timeline editor on `0000000000/score` inside it: the same;
   - both closed: all seven enabled again.
