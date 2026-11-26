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
   `version` and `timetoalign`, compared whole, and to `timetoshare` where
   the answer has one, a version string or `null` (the server imports no
   timetoshare), kept as it is, and to `files` where the answer has one,
   `true` or `false` (whether the server offers its file routes), kept as
   it is: `"files": false` resolves with `files` `false`, `"files": true`
   with `true`, and an answer without the member resolves without it
   (`files` undefined, which the editor reads as `true`, the answer of a
   server that does not name it); an extra member is dropped. The server's
   recorded answer (item 9) resolves to exactly its five members, four
   strings and `files` a boolean; its values are the versions of the server
   that recorded it, so the test compares the answer with the recording and
   the members' types, never a version written out.
3. **The two failures.** A `fetch` that rejects rejects with a
   `ServerError` of code `unreachable`, status `null`, the cause's message
   and the cause itself; an answer outside 2xx rejects with code `status`,
   the HTTP status and the message `<status> <status text>` (`502 Bad
   Gateway`, or `401` when the text is empty). A 2xx body that is not those
   three strings (a member missing or no string, a list, `null`, text that
   is no JSON), whose `timetoshare` is neither a string nor `null`, or
   whose `files` is not a boolean (the string `"false"`, `null`) (2),
   rejects with code `status`, its status and the message "the health
   answer is not a name, a version and a timetoalign version".

4. **Measure maps.** `measureMaps(manifest)` takes a manifest's JSON text,
   as the schema package's writer spells it, and sends it unchanged as the
   body of one `POST` to the base URL with `measure-maps` appended, with
   `Content-Type: application/json` and the same `Authorization` rule as
   `health()`; the client never parses or rewrites a manifest. Each call
   sends exactly one request: asking once per version of a manifest is the
   caller's, and nothing is kept between calls. A 2xx answer of the route's
   form (the server's tests README, "Measure maps") resolves to its
   `measure_maps` list compared whole, rows included (the answer to the
   TimeToShare fixture `group_measure_map`, four rows, is the case, and
   the server's recorded answer to that fixture resolves to the same
   list); an
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
   accepts holds exact integers only. A row's `volta` is what the format
   lets a measure map write: `null`, the number of a pass from 1 on, or a
   non-empty list of distinct such numbers, and it resolves as the answer
   wrote it: `2` stays `2`, `[1]` stays `[1]`, `[3, 1]` stays `[3, 1]`. A
   `volta` that is none of these (`0`, `1.5`, `"1"`, `[]`, `[0]`,
   `[1, 1]`, `[1, 1.5]`, `[[1]]`) makes the answer malformed.

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
   server's recorded answer to it (item 9). Decoded, it resolves to `rows` 15, the claim IDs
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

   **The belief filter** is core's (`beliefMask`, tested there on these
   beliefs): for each of `expected.yaml`'s cases (nothing filtered, then
   `…0002-1825-0097` not false and true, `…0001-5109-3700` true) the
   anchor index built from the decoded columns under core's mask of the
   decoded beliefs has the case's count of unique anchors and potential
   MatchStamps (14 and 11, 13 and 11, 2 and 2, 1 and 1).

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

6. **Provenance and beliefs** (`decisions/0031-match-claim-provenance.md`).
   `matchClaimProvenance(manifest, table, claims)` sends one `POST` to the
   base URL with `match-claims/provenance` appended, and
   `believeMatchClaim(manifest, table, belief)` one to
   `match-claims/belief`, both with `Content-Type:
   application/octet-stream` and the `Authorization` rule above. Each body
   is compared byte for byte: the parameters' UTF-8 length as a
   little-endian 32-bit integer, the parameters as JSON (`{"claims":
   [...]}` in the order given; `{"claim", "actor", "belief", "date"}` in
   that order), then exactly the body `matchClaims` sends for the same
   manifest and file.

   The provenance answer's oracle is the server's (its tests README,
   "MatchClaim provenance and beliefs"): the answer to `claim_6`,
   `claim_15`, `claim_1` of TimeToShare's table fixture, the server's
   recorded answer (item 9), resolves to the three entries written in the
   test as that README lists them, compared whole,
   `claim_15`'s `null`, absent members absent. A 2xx body not of the
   route's form rejects with code `status` and the message "the provenance
   answer is not the provenance of the MatchClaims asked for": an answer
   for other IDs or in another order, one entry too few, a provenance that
   is neither `null` nor an object, a member of an unknown name, a
   `stated_by` that is no list of strings, a belief word that is none of
   the three, a belief's `note` that is no string. A refusal (422,
   `["claims", 1]`) rejects with the server's message and path.

   The belief answer is a Parquet file, which the client checks only for
   the four bytes `PAR1` at its start and at its end and hands on
   unchanged: the answer's bytes come back as a `Blob` of type
   `application/vnd.apache.parquet` holding exactly those bytes, the
   server's recorded answer (A's `false` in `claim_6`, item 9) among them. Fewer
   than eight bytes, or bytes without `PAR1` at either end, reject with
   code `status` and the message "the belief answer is not a Parquet
   file"; a refusal rejects with the server's message, path and problems
   (a succession problem listed).

7. **Events** (`decisions/0032-match-claim-events.md`).
   `matchClaimEvents(manifest, table, claims)` sends one `POST` to the base
   URL with `match-claims/events` appended, with `Content-Type:
   application/octet-stream` and the `Authorization` rule above. Its body
   is compared byte for byte: the parameters `{"claims": [...]}` behind
   their length (a little-endian 32-bit integer) as for the provenance
   route, then exactly the body `matchClaims` sends for the same manifest
   and file, nothing between them.

   The answer's oracle is the server's (its tests README, "MatchClaim
   events"): the answer to `claim_1`, `claim_11`, `claim_12` of
   TimeToShare's table fixture, the server's recorded answer (item 9),
   resolves to the three MatchClaims written in the test from that README,
   compared whole, each of exactly the
   nine members `id`, the two sides' `timeline_*_id`, `event_*_id`,
   `event_*_name`, `certainty`, `is_synchronous`: `claim_1` `clt_1`
   `note_1` "C4" against `dpt_1` `projection_1` without a name,
   `claim_11` `dpt_1` `projection_6` against `cpt_1` `projection_7`,
   `claim_12`'s side B `dpt_1` `NOMATCH_SENTINEL` (the MatchClaim table's
   reserved string for the NOMATCH sentinel), no name, and not
   synchronous. An event ID is always a string: a side naming no event
   holds one of the table's two reserved strings, `NOMATCH_SENTINEL` or
   `CHUNK_SENTINEL`, which the client passes on as it reads them, and
   `is_synchronous` is always a boolean, since the table's checks refuse
   a null in either. A 2xx body not of the route's form
   rejects with code `status` and the message "the events answer is not
   the events of the MatchClaims asked for": an answer for other IDs or in
   another order, one MatchClaim too few, a member missing or of an
   unknown name (`is_explicit`, and `event_a_projection`, which the route
   no longer answers), an event ID that is a number or `null`, an
   `is_synchronous` that is `null`, a certainty that is no number. A refusal (422, `["claims", 1]`) rejects
   with the server's message and path.

8. **Files** (`decisions/0033-server-file-access.md`). `fileCalls(transport)`
   gives the three calls of the server's file routes over `connect`'s
   transport: its headers, its request (which resolves a 2xx answer and
   rejects anything else with a `ServerError`, the server's refusal as its
   `refusal`, as items 3 to 7 prove) and its error for an answer not of a
   route's form. The tests stand a transport over the stubbed `fetch` in for
   `connect`'s, recording every request it is given, so what is proved is
   the calls' own part: the exact route, method, headers and body, that
   every call asks for the server's explained refusal, and how each answer
   is read.

   - `listFolder("sub dir/ä")` asks `folders?path=sub+dir%2F%C3%A4`, the
     path as one form-encoded query parameter, with the transport's headers
     and no other member of the request; `listFolder("")` asks
     `folders?path=`. The answer `{"path": "sub dir/ä", "entries":
     [{"name": "d", "kind": "folder"}, {"name": "a.yaml", "kind": "file"}]}`,
     the server's recorded answer (item 9), resolves to exactly that
     listing.
   - `readFile("a.yaml")` asks `files?path=a.yaml` and resolves to a `Blob`
     holding exactly the answer's bytes (`x: 1\n`, the recorded answer).
   - `writeFile("sub/new.tle.json", "y: ä\n")` asks
     `files?path=sub%2Fnew.tle.json` with method `PUT`, the transport's
     headers and `Content-Type: application/octet-stream`, and the string
     as its body, sent as UTF-8
     (six bytes); a `Blob` is sent unchanged. The answer `{"path":
     "sub/new.tle.json", "size": 6}`, the recorded answer, resolves to
     exactly that. The calls
     check no kind: the server reads only workspace, manifest and table
     files and writes only workspace files (`.tle.json`), which is why the
     cases name those.
   - Every call passes `explained` true, so a refusal (400 `path outside the
     root`, 403 `hidden files are not served`, 403 for a foreign kind, here
     "TimeLineEditor writes only workspace files", 404 `no such file`)
     reaches the caller with the server's message, and an answer outside
     2xx is never read.
   - A 2xx answer not of the route's form rejects with the transport's error
     for its status and the message "the folder answer is not a listing of
     the folder asked for" (another `path` than the one asked, an entry of
     another `kind`, an entry with a member more, `entries` no list, text
     that is no JSON) or "the write answer is not the file written" (another
     `path`, a `size` that is negative, fractional or a string).
   - `connect` gives its `Server` these calls over its own transport:
     `connect({url: "api/", token: "t"}).listFolder("sub")` asks
     `api/folders?path=sub` with exactly `{headers: {Authorization: "Bearer
     t"}}`, and a 400 answer `{"detail": {"path": ["path"], "message": "path
     outside the root"}}` rejects with a `ServerError` whose code, status and
     message are `status`, 400 and "path outside the root" and whose
     `refusal.path` is `["path"]`.

9. **Recorded answers.** The recorded answer an item above names is
   `data/<name>.answer.bin`, the body of the route's answer to one fixed
   request, byte for byte, written by the server's
   `scripts/record_answers.py`: `health`, `measure-maps`, `match-claims`,
   `match-claims-provenance`, `match-claims-belief`, `match-claims-events`,
   `folders`, `files-get`, `files-put`, `flows`, `flows-findings` and
   `flows-flow-maps`, the requests being the cases of items 2, 4 to 8 and
   10. The server's tests prove that each recording is
   still its route's answer and that every route the client calls has one
   (its tests README, "Recorded answers"); these tests prove the client
   reads each into the value its item writes out. A recorded answer the
   client's type disagrees with fails here, never quietly: no recording is
   edited by hand, and none is read through anything but the call it
   answers.

10. **Flows.** `flows(manifest, timeline, options?)` asks for the flows of
    one timeline of a manifest and `withFlowMaps(manifest, timeline,
    options?)` for the manifest with those flows written. Each sends one
    `POST`, to the base URL with `flows` and with `flows/flow-maps`
    appended, with `Content-Type: application/octet-stream` and the
    `Authorization` rule above. Each
    body is compared byte for byte: the parameters' UTF-8 length as a
    little-endian 32-bit integer, the parameters as JSON, then the
    manifest's text as UTF-8, unchanged (a manifest with a non-ASCII
    character is the case). The parameters are `{"timeline"}`, then
    `"convention"`, then the reading's `"believer"` and `"beliefs"` (core's
    reading: the editor's user and the states read, here `true` and
    `unlikely`, sent as the list it holds), in that order where the
    options give them; `withFlowMaps` takes no `convention` and, after the
    reading, `"actor"` and `"date"` (who asks for the flows to be written
    again, and on which day). An option not given is not sent.

    The answers' oracle is the server's (its tests README, "Flows"), whose
    own oracle is the flows TimeToShare states for its flow fixtures; the
    values below are copied from those expected-flows files by hand, their
    runs joined as the server joins them.

    - The recorded answer `flows` (the fixture `flow/sonata_exposition`,
      timeline `score`, no convention) resolves to: `timeline` `score`,
      `number_type` `fraction`; the atomic sections A `[0, 1]`–`[12, 1]`,
      B `[12, 1]`–`[16, 1]`, C `[16, 1]`–`[24, 1]`; `default` with the
      runs `[0, 16]`, `[0, 12]`, `[16, 24]` (each a pair of pairs over 1),
      the sections A, B, A, C and no finding; `single` with the runs
      `[0, 12]`, `[16, 24]`, the sections A, C and one finding,
      `never_played` at `[12, 1]` with `end` `[16, 1]` and the cause
      `single_playback` (going through once leaves B out, the `default`
      flow plays it) and timetoalign's sentence; `printed` with the run
      `[0, 24]`, the sections A, B, C and no finding. Compared whole.
    - The recorded answer `flows-findings` (`flow/ossia`, `score`, asked
      with the convention `default`) resolves to four atomic sections (A
      to 4, B to 12, C to 16, D to 24) and `default` alone: the run
      `[0, 16]`, the sections A, B, C and three findings, compared whole
      but for their sentences: `undetermined_target` at `[4, 1]`,
      `flow_ends_at_break` at `[16, 1]`, neither with an `end`, and
      `never_played` at `[16, 1]` with `end` `[24, 1]`. A finding's
      `message` is timetoalign's sentence: each is a string naming what
      it is about (`'jump_1'`, `'break_1'`, `[16, 24)`).
    - A value is read as the answer's `number_type` says. An answer of
      `int` (a timeline of 100 samples: sections A 0–60, B 60–100, the
      runs `[0, 60]`, `[0, 100]`, no finding in any flow) resolves with its
      integers; an answer of `float` (sections A 0–2.5, B 2.5–10) with its
      numbers.
    - A 2xx body not of the route's form rejects with code `status` and
      the message "the flows answer is not the flows of the timeline asked
      for": another `timeline` than the one asked; a `number_type` that is
      none of the three; conventions other than those asked (all three
      for no convention, a missing one, another one than the one asked);
      a value not of the number type (under `fraction` a bare number, a
      pair with denominator 0, a pair holding 2^53; under `int` 1.5 or a
      pair; under `float` a pair); a run of three values; a section of a
      flow that names no atomic section; a flow without `findings` (every
      flow has them, `printed`'s empty); a finding of an unknown `kind` or
      an unknown `cause`, with an unknown member or without its
      `message`; an unknown member of the
      answer or of a section; text that is no JSON.
    - `withFlowMaps` resolves to the answer's text, unchanged: the
      recorded answer `flows-flow-maps` (`flow/da_capo_al_fine`, `score`)
      resolves to exactly the recording's text, which, parsed in the test,
      is the manifest written: the timeline's Regions are named A and B,
      and the FlowMaps, their chunks read as the names of the Regions they
      name, are `default` A, B, A, `single` A, B and `printed` A, B, each
      read by its convention (the manifest lists them by the IDs the
      server mints, so their order is not the test's to fix). The
      client reads the text only to check that it is JSON holding an
      object with a `timelines` list; anything else (a list, an object
      without `timelines`, text that is no JSON) rejects with code
      `status` and the message "the flow-maps answer is not a manifest".
    - A refusal of either route (422 at `["timeline"]`, `the manifest has
      no timeline 'nothing'`) rejects with the server's message and path.

`pnpm typecheck` runs `tsc` under the workspace's strict settings, and the
ladder (this package depends on `core` at most, and on no Svelte, layout or
rendering code) is enforced by `.dependency-cruiser.cjs` and proven by
`tests/ladder.test.ts` at the workspace root.
