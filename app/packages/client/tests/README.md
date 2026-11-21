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

4. **Measure maps.** `measureMaps(manifest)` takes a manifest's JSON text,
   as the schema package's writer spells it, and sends it unchanged as the
   body of one `POST` to the base URL with `measure-maps` appended, with
   `Content-Type: application/json` and the same `Authorization` rule as
   `health()`; the client never parses or rewrites a manifest. Each call
   sends exactly one request: asking once per version of a manifest is the
   caller's, and nothing is kept between calls. A 2xx answer of the route's
   form (the server's tests README, "Measure maps") resolves to its
   `measure_maps` list compared whole, rows included (the answer to the
   TimeToShare fixture `group_measure_map`, four rows, is the case); an
   answer outside 2xx rejects as for `health()`, so a server whose
   timetoalign cannot expand measure maps (501) rejects with code `status`
   and status 501, which the editor tells apart from an unreachable server;
   a 2xx body not of that
   form (no `measure_maps` list, an entry without a string `id` or a `rows`
   list, a row whose `qstamp` is not a pair of safe integers or `null`, a
   row whose `count` is no safe integer, a number beyond 2^53 that JSON
   parsing would round) rejects with code `status`, its status and the
   message "the measure-maps answer is not a list of expanded measure
   maps". A row is checked member by member, so an answer the client
   accepts holds exact integers only.

5. **MatchClaims.** `matchClaims(manifest, table)` takes a manifest's
   text and the picked `match_claims.parquet` (a `Blob`) and sends one
   `POST` to the base URL with `match-claims` appended, with
   `Content-Type: application/octet-stream` and the `Authorization` rule
   above. Its body is the request of `decisions/0030-match-claims-answer.md`,
   compared byte for byte: the manifest's UTF-8 length as a little-endian
   32-bit integer (a manifest with a non-ASCII character counts bytes, not
   characters), the manifest's bytes, then the file's bytes unchanged.

   The oracle of the answer is TimeToShare's table fixture `tables/0.2.0`,
   fifteen MatchClaims read off by hand (the server's tests README,
   "MatchClaims", has the table): `data/match-claims.answer.bin` is the
   server's answer to it, written by the server's
   `scripts/record_match_claims.py`, whose own test proves the recording
   is the route's answer. Decoded, it resolves to `rows` 15, the claim IDs
   `claim_1` to `claim_15`, the timelines `clt_1` (fraction), `clt_2`
   (fraction), `cpt_1` (float), `dpt_1` (int), and every array compared
   whole with the values written in the test: the timeline numbers, the
   presence flags, each value column's positions, numerators and
   denominators (`15/2` on `clt_1` as 7.5, 15n, 2n; `5.25` seconds on
   `cpt_1` as 5.25, 0n, 0n), and the beliefs (actors
   `…0001-5109-3700`, `…0002-1825-0097`; offsets, actor and word numbers
   per belief). The arrays are views into the answer's one buffer, never
   copies: each one's `buffer` is the same object. The decoded columns
   are what core's anchor index takes: `anchorIndexOf` builds from them
   (it checks them against decision 0029 first) and gives the fixture's
   `expected.yaml` count of unique anchors (14 with nothing filtered).

   **The belief filter.** `beliefMask(beliefs, believer, belief)` is the
   row mask of TimeToShare's belief filter: `null` (nothing filtered)
   without a believer; for a believer, 1 for every row the believer does
   not believe `"false"` (`"not_false"`, the default) or only for the rows
   the believer believes `"true"` (`"true"`). On the fixture: `…0002-1825-0097`
   not false is every row but 12 (`claim_13`, believed false); true, rows
   0 and 10; `…0001-5109-3700` true, rows 12 and 13; an actor holding no
   belief not false is every row, true none. These are the rows of
   `expected.yaml`'s cases for the same believer and filter. Any other
   filter word throws a `RangeError` naming it, as TimeToShare's
   `believed_rows` refuses it.

   **Refusals.** An answer outside 2xx rejects with code `status` and its
   status; a 422 whose body is `{"detail": {"path", "message",
   problems?}}` rejects with the server's message and that detail as the
   error's `refusal` (the check's problems listed), so the editor can say
   what is wrong with the table. A 2xx answer that is not of decision
   0030's layout rejects with code `status` and the message "the
   match-claims answer is not of the tilie-match-claims layout": fewer
   than four bytes, a header length beyond the answer, a header that is no
   JSON object, another `format` or `version` (2), other belief words, an
   array missing, out of bounds, at an offset that is not a multiple of
   eight, or of another length than its name requires (`a.timeline` of 14
   entries for 15 rows), claim IDs that are not `rows` lines, and a belief
   naming no actor of the header.

`pnpm typecheck` runs `tsc` under the workspace's strict settings, and the
ladder (this package depends on `core` at most, and on no Svelte, layout or
rendering code) is enforced by `.dependency-cruiser.cjs` and proven by
`tests/ladder.test.ts` at the workspace root.
