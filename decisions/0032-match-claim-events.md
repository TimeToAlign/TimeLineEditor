---
status: accepted
date: 2026-11-21
---

# Read a MatchClaim's events on demand from the MatchClaim table

## Context

The Matchstamp tab shows, for each MatchClaim of the MatchStamp it shows,
the events on its two sides: each side's timeline, the event's ID and
name. The MatchClaim table states the timelines, event IDs and names, the
certainty and whether the MatchClaim states synchrony. The answer of
decision 0030 holds none of the names, and the editor has no Parquet
reader.

A manifest names its tables in its `resources`, by locations relative to
the manifest: the MatchClaim table (type `MatchClaim`) and, in a package
that has one, the Projections table (type `Projection`), which states for
each Projection (an event standing on a timeline for an event not held
there) the event it stands for. The editor implements no event resource:
it draws no event and reads no event table. What the match display needs
(the anchors, the MatchStamps, the beliefs, the provenance and the events'
IDs and names) the MatchClaim table alone carries.

The requirements:

1. **Only what is shown travels**, as for provenance (decision 0031): the
   events of one MatchStamp's MatchClaims at a time, never every row's.
2. **The format's own readers**: the table is checked by TimeToShare's
   table checks against the manifest and read by timetoalign, as the other
   routes read it.
3. **No new dependency** and **a stateless server**, as for decisions 0030
   and 0031: the editor holds the table for its session only.

## Considered options

- **Names in the answer of decision 0030**: every row's strings, sent
  whether shown or not (requirement 1).
- **The provenance route answering the events too**: one request for two
  things the tab shows at different times (the events when a MatchClaim is
  expanded, the provenance when the user asks for it).
- **A route of its own** taking the request of decision 0031.

## Decision

The last option. **`POST /api/match-claims/events`** takes:

| Bytes | Holds |
| --- | --- |
| 0 to 3 | the parameters' length `P` in bytes, an unsigned little-endian 32-bit integer |
| 4 to 4 + `P` | the parameters `{"claims": [<MatchClaim ID>, …]}`, a JSON object in UTF-8 |
| the rest | the body of `POST /api/match-claims` unchanged: the manifest's length, the manifest file, the MatchClaim table's Parquet file |

The table is checked against the manifest by TimeToShare's table checks
(`match_claim_problems`); timetoalign reads it in the package form
(`MatchClaimField.from_package_table`).

The answer is JSON `{"claims": [...]}`, one entry per MatchClaim asked,
in the order asked: `{"id", "timeline_a_id", "event_a_id", "event_a_name",
"timeline_b_id", "event_b_id", "event_b_name", "certainty",
"is_synchronous"}`, a null cell `null` (a side without an event, an event
without a name).

**Refusals** answer as decisions 0030 and 0031: 422 `{"detail": {"path",
"message", "problems"?}}`, a parameter's at its name (`["claims", 1]`, a
MatchClaim the table lacks), a table the checks refuse with every problem;
501 as the table route answers it.

The client (`@timetoalign/tilie-client`'s `matchClaimEvents(manifest,
table, claims)`) refuses an answer for other MatchClaims, in another
order, or with a member missing, unknown or of another type. The editor
(`MatchClaimTables.events(block, manifest, claims)`) asks for the
MatchClaims it shows with the manifest as its file writes it and the
MatchClaim table it holds, once per table and list of MatchClaims.

**Where the editor takes the table from.** A table the manifest names by
an absolute `http` or `https` URL is fetched from there. One named by a
location relative to the manifest is read beside the manifest's file:
the workspace keeps where each block's manifest lies (its location
relative to the workspace file), and the editor reads the table through
the server's file route (decision 0033); an example's manifest is read
beside the files served with it. Where the table cannot be found so (no
server, a manifest whose file the workspace does not locate, a table
missing beside it, a URL that cannot be fetched), the editor asks the
user, in one dialog per manifest, for the manifest's file, the table's
file or its URL; a manifest's file located in the dialog is kept in the
workspace. A URL is fetched by the browser as any page would; one the
browser may not read (no CORS permission) is reported as not loaded.

Amended 2026-11-21: the route took, between the parameters and the table
route's body, the Projections table behind its length (0 for none), and
answered for each side `event_*_projection`, the event a side's Projection
stands for. The editor no longer loads the Projections table: it
implements no event resource, and the MatchClaim table alone carries what
the match display needs. The request lost that part and the answer those
two members; the editor's dialog asks for the MatchClaim table alone. A
manifest naming a Projections table keeps its `resources` entry unchanged:
the editor neither reads nor drops it.

Amended again 2026-11-21: the editor took the table only from where a
block's manifest came from in the session, never remembered, or else from
the dialog. Since the server opens the user's files by path (decision
0033), the workspace keeps where each manifest lies and the table is read
beside it through the server in every session; a table named by an
absolute URL is fetched without a question.

Amended 2026-11-26: the MatchClaim table no longer writes a side without
an event as a null cell. Each event ID cell holds an event's ID or one of
the two reserved strings of the sentinels, `NOMATCH_SENTINEL` (no
counterpart on that timeline) and `CHUNK_SENTINEL` (a position on a
timeline that holds no event for it, the anchors stating its coordinate),
and the route answers them as written. In the answer `null` therefore
stands only for an event without a name; the client refuses a `null`
event ID or synchrony as malformed. The Matchstamp tab reads a reserved
string as its sentinel, never as an event, and shows CHUNK or NOMATCH with
its meaning as a tooltip, where it showed "no event".

## Maintenance and dependencies

No dependency enters: `struct`, `json`, pyarrow (which timetoalign
requires) on the server; `Blob`, `TextEncoder` and `fetch` in the browser.
The server's tests write out the fixture's MatchClaims by hand and compare
the answer whole; the client's tests compare the request byte for byte and
the answer's reader against a written answer.

Primary sources: <https://parquet.apache.org/docs/file-format/>,
<https://www.rfc-editor.org/rfc/rfc8259> (JSON),
<https://fetch.spec.whatwg.org/#http-cors-protocol> (what a browser may
read from another origin).

## Consequences

Each request sends the MatchClaim table again (on the loopback interface),
and the server checks it each time. No Projection is shown: a side whose
event is a Projection shows its ID and name as the MatchClaim table states
them. A Projections table a package holds is checked only by the tools
that read it (TimeToShare, timetoalign), never by the editor. The exit
cost is local: the route, the client's call and the editor's accessor.

## Review date

2027-05-21, or when the editor saves MatchClaim tables through the server.
Reviewed 2026-11-21, when packages came to open as folders through the
server (decision 0033), the condition this date first named: the route
stands, since the editor still sends the table it holds, which after a
belief differs from the file until the user saves it.
