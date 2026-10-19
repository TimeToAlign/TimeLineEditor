# `@timetoalign/tilie-client` tests

The package is the editor's port to `tilie-server`: `connect({ url, token })`
returns a `Server` whose `health()` asks the server for its `Health`. The
oracle is the server's documented contract (the `GET /api/health` route and
the bearer rule of `AGENTS.md`); `fetch` is stubbed, so no request leaves
the process, and each test compares the exact arguments of the one `fetch`
call or the exact result.

1. **The request.** `health()` sends one request to the base URL with
   `health` appended: the page's relative base `api/` asks `api/health`, an
   absolute base asks below it. The `Authorization` header is
   `Bearer <token>` for a token, `Bearer ` for the empty token, and absent
   for `null`.
2. **The answer.** A 2xx answer resolves to its three members, `name`,
   `version` and `timetoalign`, compared whole; an extra member is
   dropped.
3. **The two failures.** A `fetch` that rejects rejects with a
   `ServerError` of code `unreachable`, status `null`, the cause's message
   and the cause itself; an answer outside 2xx rejects with code `status`,
   the HTTP status and the message `<status> <status text>` (`502 Bad
   Gateway`, or `401` when the text is empty). A 2xx body that is not those
   three strings (a member missing or no string, a list, `null`, text that
   is no JSON) rejects with code `status`, its status and the message "the
   health answer is not a name, a version and a timetoalign version".

`pnpm typecheck` runs `tsc` under the workspace's strict settings, and the
ladder (this package depends on `core` at most, and on no Svelte, layout or
rendering code) is enforced by `.dependency-cruiser.cjs` and proven by
`tests/ladder.test.ts` at the workspace root.
