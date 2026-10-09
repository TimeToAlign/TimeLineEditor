# `@timetoalign/tilie-editor` tests

The editor is the shell: a header with the title and a status area, three
fixed panes, and a footer listing the workspace packages it links to. It
shows the server's health on mount. The component test (`App.test.ts`) mounts
`App.svelte` into a jsdom document with Svelte's own `mount` and proves four
things, each with exact values:

1. **The shell renders.** The header's `h1` reads `TimeLineEditor`, and the
   three pane headings, in document order, are exactly `Arranger`,
   `Inspector`, `Diagnostics`.
2. **The workspace is linked.** The footer reads exactly
   `packages: @timetoalign/tilie-core, @timetoalign/tilie-layout,
   @timetoalign/tilie-writers, @timetoalign/tilie-arranger,
   @timetoalign/tilie-client`. Because the names are imported from the five
   library packages, a broken workspace link fails this test at import time.
3. **The health check is called correctly and shown.** With the page opened
   as `/?token=abc`, `fetch` (stubbed) is called exactly once with
   `/api/health` and the header `Authorization: Bearer abc`, and once the
   stub resolves with `{"name": "tilie-server", "version": "0.1.0",
   "timetoalign": "1.2.0"}` the status reads exactly
   `tilie-server 0.1.0 (timetoalign 1.2.0)`.
4. **An HTTP error is shown as such.** When the stub resolves with status
   401 and status text `Unauthorized`, the status reads exactly
   `HTTP 401 Unauthorized`.

The network is never touched: `fetch` is replaced by a stub for the duration
of each test and restored afterwards, and the mounted component is unmounted
and the document emptied after each test.

Type-checking of the component and the test is done by `svelte-check` with
`--fail-on-warnings` under `pnpm typecheck`; that gate also catches the
compiler's accessibility warnings.
