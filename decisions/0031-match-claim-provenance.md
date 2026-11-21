---
status: accepted
date: 2026-11-21
---

# Read a MatchClaim's provenance on demand and answer a belief with the new table

## Context

The editor reads a package's MatchClaim table through `POST
/api/match-claims` (decision 0030), whose answer holds the anchor index's
columns and every row's beliefs, but not how a MatchClaim was made (its
paradata: who stated it, when, how, by which service, on what basis). The
Matchstamp tab shows, for the MatchStamp it shows, each MatchClaim's
provenance and beliefs, and lets the user state their own belief (`true`,
`false` or `unlikely`). TimeToShare keeps one belief per actor, a later one
replacing the earlier, and its succession rule binds whoever writes a table
over an existing one: every MatchClaim stays, with the same timelines,
events and anchors; only its provenance may change.

The requirements:

1. **The table is the user's file.** The server is stateless and writes
   nothing; the editor holds the table for its session only and never in
   the workspace file. A changed table goes back to the user, who saves it
   in the place of the old one.
2. **Only what is shown travels.** The paradata of 250,000 MatchClaims
   would multiply the answer of decision 0030; the tab needs that of one
   MatchStamp's MatchClaims at a time.
3. **The format's own rules**: the belief is recorded by the libraries that
   define it (timetoalign's `AlignmentBundle.add_match_claim_belief`), the
   new table is checked by TimeToShare's table checks and succession rule
   before it leaves the server.
4. **No new dependency**, as for decision 0030.

## Considered options

- **Paradata in the answer of decision 0030**: every row's paradata, sent
  whether shown or not (requirement 2).
- **The editor writes the Parquet file itself**: it has no Parquet writer
  and would need one (requirement 4), and the checks and the belief rule
  would exist twice (requirement 3).
- **The server keeps the table between requests** and answers what changed:
  state on the server that outlives a request, a session to tie it to, and
  a table that could differ from the user's file (requirement 1).
- **Two routes that take the request of decision 0030 again**, with a small
  JSON object of parameters in front: one answers the provenance of the
  MatchClaims named, the other the new Parquet file.

## Decision

The last option. Both routes take the body of `POST /api/match-claims`
(decision 0030) behind the parameters:

| Bytes | Holds |
| --- | --- |
| 0 to 3 | the parameters' length `P` in bytes, an unsigned little-endian 32-bit integer |
| 4 to 4 + `P` | the parameters, a JSON object in UTF-8 |
| the rest | the body of `POST /api/match-claims` unchanged: the manifest's length, the manifest file, the Parquet file |

The table is checked against the manifest as that route checks it.

**`POST /api/match-claims/provenance`** takes `{"claims": [<MatchClaim
ID>, …]}` and answers JSON `{"claims": [{"id", "provenance"}]}`, in the
order asked, `provenance` the entry the MatchClaim is read with (its row's
own, else the one the file states for every row) as TimeToShare's
provenance entry with its absent members left out, each belief's actor
the IRI timetoalign compares it as (as the actors of decision 0030's
answer), or `null`. The editor asks for the MatchClaims of the MatchStamp
it shows, never for every row.

**`POST /api/match-claims/belief`** takes `{"claim", "actor", "belief",
"date"}` (the actor an IRI, the belief one of TimeToShare's words, the date
`YYYY-MM-DD`) and answers 200 `application/vnd.apache.parquet`, the new
`match_claims.parquet`. The server reads the manifest as timetoalign's
`AlignmentBundle`, adds the table's MatchClaims to it and records the
belief by `AlignmentBundle.add_match_claim_belief` (an actor's earlier
belief replaced in its place, actors compared as IRIs under the
manifest's `@context`, every other actor's left standing; a MatchClaim
without provenance gets an entry holding the belief alone; the actor
stored as the request spells it); it builds no provenance itself. The
posted table takes the provenance column timetoalign wrote: where the file
states one provenance for every row, every row states it as its own in
the new file, which no longer does, since one row's differs. Every other
column and row is kept, columns the table type does not declare and the
file's other metadata included. The new table passes TimeToShare's table checks against
the manifest and `succession_problems` against the posted table before it
is written; nothing is stored on the server.

**Refusals** answer as decision 0030's: 422 `{"detail": {"path",
"message", "problems"?}}`, a parameter's at its name (`["claims", 1]`, a
MatchClaim the table lacks; `["belief"]`, a word that is no belief), a
table the checks or the succession rule refuse with every problem, a
manifest or a belief timetoalign refuses with its message; 501 when the
installed timetoalign cannot record provenance.

The editor (`@timetoalign/tilie-client`'s `matchClaimProvenance` and
`believeMatchClaim`) sends the manifest as its file writes it and the
`Blob` of the table it holds; after a belief it reads the new file through
`POST /api/match-claims` again, holds it as the block's table, marks it
changed and offers to save it.

## Maintenance and dependencies

No dependency enters: `struct`, `json`, pyarrow (which timetoalign
requires) on the server; `Blob`, `TextEncoder` and `fetch` in the browser.
The server's tests write out every row's provenance of TimeToShare's table
fixture by hand and compare the answers and the new tables with it, column
by column; the succession check is proved on tables that break it.

Primary sources: <https://parquet.apache.org/docs/file-format/> (a Parquet
file starts and ends with `PAR1`, which the client checks),
<https://www.rfc-editor.org/rfc/rfc8259> (JSON),
<https://www.iana.org/assignments/media-types/application/vnd.apache.parquet>.

## Consequences

Each request sends the whole table again: the editor holds the user's
file and the server none, so the price of a stateless server is the
upload, on the loopback interface, and one check of the table per request.
Each request also reads the manifest as timetoalign's bundle, so that
actors compare as the library compares them: measured warm, 4.5 ms for
TimeToShare's table fixture's manifest and about 200 ms for a manifest
with many statements, most of it their validation.
A belief costs two requests (the new file, then its columns). The file the
editor offers to save is the server's answer byte for byte. The exit cost
is local: the two routes and the client's two calls.

Decision 0032 adds the route that reads the events of given MatchClaims;
it takes this request unchanged.

## Review date

2027-05-21, or when packages open as folders through the server.
