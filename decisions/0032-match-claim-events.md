---
status: accepted
date: 2026-11-21
---

# Read a MatchClaim's events on demand, the Projections table beside the MatchClaim table

## Context

The Matchstamp tab shows, for each MatchClaim of the MatchStamp it shows,
the events on its two sides: each side's timeline, the event's ID and
name, and where an event is a Projection (an event standing on a timeline
for an event not held there), which event it stands for. The MatchClaim
table states the timelines, event IDs and names, the certainty and whether
the MatchClaim states synchrony; the package's Projections table
(`projections.parquet`, named by the manifest's `resources` as type
`Projection`) states for each Projection, by its timeline and ID, the event
it stands for (`projection_of`), or none. The answer of decision 0030 holds
neither the names nor the Projections, and the editor has no Parquet
reader.

A manifest names both tables in its `resources`, by locations relative to
the manifest. The editor loads them when the user asks to see matches:
from where the manifest came from where they can be reached there (a
fixture served beside its tables), otherwise from a file the user chooses
or a URL the user enters.

The requirements:

1. **Only what is shown travels**, as for provenance (decision 0031): the
   events of one MatchStamp's MatchClaims at a time, never every row's.
2. **The format's own readers**: the tables are checked by TimeToShare's
   table checks against the manifest and read by timetoalign, as the other
   routes read them.
3. **No new dependency** and **a stateless server**, as for decisions 0030
   and 0031: the editor holds both tables for its session only.

## Considered options

- **Names and Projections in the answer of decision 0030**: every row's
  strings, sent whether shown or not, and a Projections table read on every
  load (requirement 1).
- **The provenance route answering the events too**: one request for two
  things the tab shows at different times (the events when a MatchClaim is
  expanded, the provenance when the user asks for it), and a route whose
  answer depends on a second table it does not otherwise need.
- **A route of its own** taking the request of decision 0031 with the
  Projections table between the parameters and the MatchClaim table's
  request.

## Decision

The last option. **`POST /api/match-claims/events`** takes:

| Bytes | Holds |
| --- | --- |
| 0 to 3 | the parameters' length `P` in bytes, an unsigned little-endian 32-bit integer |
| 4 to 4 + `P` | the parameters `{"claims": [<MatchClaim ID>, …]}`, a JSON object in UTF-8 |
| the next 4 | the Projections table's length `Q` in bytes, the same kind of integer; 0 when none is sent |
| the next `Q` | the Projections table's Parquet file, unchanged |
| the rest | the body of `POST /api/match-claims` unchanged: the manifest's length, the manifest file, the MatchClaim table's Parquet file |

Both tables are checked against the manifest by TimeToShare's table checks
(`match_claim_problems`, `projection_problems`); timetoalign reads the
MatchClaim table (`MatchClaimField.from_table`) and each Projection asked
about (`Projection.from_row`).

The answer is JSON `{"claims": [...]}`, one entry per MatchClaim asked,
in the order asked: `{"id", "timeline_a_id", "event_a_id", "event_a_name",
"event_a_projection", "timeline_b_id", "event_b_id", "event_b_name",
"event_b_projection", "certainty", "is_synchronous"}`, a null cell `null`
(a side without an event, an event without a name). A side's
`event_*_projection` is `{"projection_of": {"timeline_id", "event_id"}}`
where its event is a Projection of the posted table standing for an event,
`{"projection_of": null}` for a Projection standing for none, and `null`
where the event is no Projection of the table, the side has no event, or
no Projections table was sent: the presence of the object, not its
`projection_of`, says that the side's event is a Projection.

**Refusals** answer as decisions 0030 and 0031: 422 `{"detail": {"path",
"message", "problems"?}}`, a parameter's at its name (`["claims", 1]`, a
MatchClaim the table lacks), a Projections table that cannot be split
off or is no Parquet file at `[]`, a table the checks refuse with every
problem; 501 when the installed timetoalign has no `Projection`.

The client (`@timetoalign/tilie-client`'s `matchClaimEvents(manifest,
table, projections, claims)`) refuses an answer for other MatchClaims, in
another order, or with a member missing, unknown or of another type. The
editor (`MatchClaimTables.events(block, manifest, claims)`) asks for the
MatchClaims it shows with the manifest as its file writes it, the
MatchClaim table it holds and the Projections table it holds (`null`
without one), once per table, Projections table and list of MatchClaims.

**Where the editor takes the tables from.** A block remembers where its
manifest came from for the session (`ManifestSource`), never in the
workspace file. Today the Fixture menu's table fixture is the one source
whose files can be read: they are served beside it. A manifest picked from
the user's system, or read from a workspace file, has no source the
browser may read beside it; for it the editor asks the user, in one
dialog per manifest, for each table's file or URL. A URL is fetched by the
browser, at the user's request, as any page would; one the browser may not
read (no CORS permission) is reported as not loaded.

## Maintenance and dependencies

No dependency enters: `struct`, `json`, pyarrow (which timetoalign
requires) on the server; `Blob`, `TextEncoder` and `fetch` in the browser.
The server's tests write out the fixture's MatchClaims and Projections by
hand and compare the answer whole; the client's tests compare the request
byte for byte and the answer's reader against a written answer.

Primary sources: <https://parquet.apache.org/docs/file-format/>,
<https://www.rfc-editor.org/rfc/rfc8259> (JSON),
<https://fetch.spec.whatwg.org/#http-cors-protocol> (what a browser may
read from another origin).

## Consequences

Each request sends both tables again (on the loopback interface), and the
server checks the whole Projections table each time, as it checks the
MatchClaim table. A held MatchClaim table without its Projections table
answers every side as no Projection; the editor then asks for the
Projections table through the manual route (Load MatchClaims…), which asks
for every table the manifest names. The exit cost is local: the route,
the client's call and the editor's accessor.

## Review date

2027-05-21, or when packages open as folders through the server.
