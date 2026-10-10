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
