# `@timetoalign/tilie-editor` tests

The editor is the shell: a header with the title and a status area, three
fixed panes, and a footer listing the workspace packages it links to. It
shows the server's health on mount. The component test (`App.test.ts`) mounts
`App.svelte` into a jsdom document with Svelte's own `mount` and proves five
things, each with exact values:

1. **The shell renders.** The header's `h1` reads `TimeLineEditor`, and the
   three pane headings, in document order, are exactly `Arranger`,
   `Inspector`, `Diagnostics`.
2. **The workspace is linked.** The footer reads exactly
   `packages: @timetoalign/tilie-core, @timetoalign/tilie-layout,
   @timetoalign/tilie-writers, @timetoalign/tilie-arranger,
   @timetoalign/tilie-client`. Because the names are imported from the five
   library packages, a broken workspace link fails this test at import time.
3. **The token is taken from the fragment, and the fragment is cleared.**
   `tilie` opens the editor as `/#token=<token>`. With the page at
   `/?view=a#token=abc`, `fetch` (stubbed) is called exactly once with
   `/api/health` and the header `Authorization: Bearer abc`, and by then the
   location is exactly `/?view=a` with an empty `location.hash`: path and
   query survive, the token is gone from the address bar, and the history
   entry is replaced rather than added (`history.length` is unchanged). Once
   the stub resolves with `{"name": "tilie-server", "version": "0.1.0",
   "timetoalign": "1.2.0"}` the status reads exactly
   `tilie-server 0.1.0 (timetoalign 1.2.0)`.
4. **Without a fragment token, no token is sent and the URL is untouched.**
   With the page at `/?token=abc` (the query, which no longer carries the
   token), `fetch` is called exactly once with `/api/health` and the header
   `Authorization: Bearer ` (an empty token, which the server refuses), and
   the location is still exactly `/?token=abc`. This proves the query is not
   read as a second source of the token.
5. **An HTTP error is shown as such.** When the stub resolves with status
   401 and status text `Unauthorized`, the status reads exactly
   `HTTP 401 Unauthorized`.

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

## Autosave (`autosave.test.ts`)

`src/autosave.ts` keeps the text of each open workspace in IndexedDB: the
database `tilie-autosave` (version 1) with one object store, `workspaces`,
holding one slot per workspace key. The text is whatever the caller passes,
normally the output of `writeWorkspace`; the module stores and returns it
unchanged and never parses it. Every test installs its own empty
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
3. **Recovery returns the last written text byte for byte.** A text mixing
   ASCII, `C♯`, the astral `𝄞` (a surrogate pair), a CRLF line end, a lone
   surrogate `\uD800`, and trailing spaces is scheduled and flushed after an
   earlier text was flushed under the same key; `recoverWorkspace("w")`
   returns a string `===` to it (equal UTF-16 code units). A key never
   written recovers `null`.
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
   - with `globalThis.indexedDB` undefined, `recoverWorkspace("w")` rejects
     with an `AutosaveError` of `code` `indexeddb_unavailable` and `key` `w`.

## The test hook (`hook.test.ts`)

`src/testHook.ts` defines `window.__tilie`, through which the end-to-end
tests open workspaces and read the viewer's state: `load(text)`, `store()`,
`selection()`, `select(addresses)`, `viewport()`, `setViewport(v)`,
`locked()` and `mode()`. `App.svelte` installs it only when
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
   byte. The selection is `[]`, since it addressed the previous workspace.
3. **A refused file throws and changes nothing.** After loading the file,
   `load("{")` throws a `WorkspaceRefusedError` whose problems' codes are
   exactly `["invalid_json"]`, and `store()` is still the open store.
4. **The header offers the end-to-end workspaces.** In the same builds the
   header carries a select labelled "Fixture" (`fixture-select`) whose
   options are exactly `grid-300`, `grid-900`, `small` (the base names of
   `app/e2e/fixtures/*.tle.json`, sorted), and a Load button
   (`fixture-load`). Choosing `small` and pressing Load opens it the way
   `load` does: the store's view and journal equal `readWorkspace` of that
   file's text, and the selection is `[]`. A production build contains
   neither the menu nor the files (checked on `pnpm build`'s output, not
   here).
5. **The hook leaves with the editor.** Unmounting `App.svelte` removes
   `window.__tilie`.

The viewport functions talk to Svelte Flow, which needs a laid-out page;
they and everything the canvas does are proven by the Playwright suite.
