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
