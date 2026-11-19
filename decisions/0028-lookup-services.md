---
status: accepted
date: 2026-11-19
---

# Look values up in Wikidata, the GND and YouTube from the browser, and in MusicBrainz through the server

## Context

A statement's value is a thing another system names: a person in Wikidata
or the GND, a work in MusicBrainz, a video on YouTube. Typing an IRI by
hand is error-prone, so the editor's value fields search the systems the
catalogue knows and resolve a pasted address to its label, thumbnail and
the things other systems say it is the same as. The editor runs as the
page `tilie-server` serves and embedded in a host page that has no server.

The requirements:

1. **Search and resolve** in the systems with a public lookup: one
   interface over all of them, returning candidates with an IRI, a label,
   a description, a thumbnail and cross-references.
2. **No server where none is needed**: an embedded editor has none.
3. **The services' rules of use**: MusicBrainz asks every client for at
   most one request a second and a User-Agent naming the application,
   which a browser cannot set.
4. **No new dependency**: the requests are plain `fetch` calls in the
   editor and the standard library in the server.
5. **Privacy**: text the user types leaves the browser only from a value
   field of a searchable system, and an editor can turn every request off.

Checked on 2026-11-19 with requests sending an `Origin`:

| Service | Request | Answer to any origin |
| --- | --- | --- |
| Wikidata Action API | `api.php?…&origin=*` (search with `haswbstatement:` filters; `wbgetentities`) | `access-control-allow-origin: *` |
| lobid-gnd | `gnd/search?…&format=json:suggest`, `gnd/<id>.json` | `Access-Control-Allow-Origin: *` |
| YouTube oEmbed | `oembed?url=…&format=json` | the request's origin echoed |
| MusicBrainz web service | `ws/2/<type>?query=…` | answered, but under the rate limit and User-Agent rule above |

The statement filters were checked against the same answers: Q5 is
"human", Q215380 "musical group", Q42998 "orchestra", Q482994 "album",
P86 "composer", P175 "performer", P279 "subclass of"; `haswbstatement:`
takes `|` for "any of", and lobid's `filter=type:Person OR
type:CorporateBody` returns persons and corporate bodies and nothing else.

## Considered options

- **Every lookup through `tilie-server`.** One place for rate limits,
  User-Agents and caches, but an embedded editor, which has no server,
  could look nothing up, and every search would cross two hops.
- **Every lookup from the browser.** No server needed, but MusicBrainz's
  rules cannot be kept from a browser: no User-Agent can be set, and every
  open editor would count against the limit on its own.
- **Browser where the service allows it, the server for MusicBrainz.**
  Wikidata, the GND and YouTube are asked directly; MusicBrainz through
  the server, which paces, identifies and caches its requests. The server
  speaks the Reconciliation Service API 0.2 (W3C Entity Reconciliation
  Community Group), so the editor reaches it with one generic client that
  serves any conforming service too.
- **A local index of the services' data dumps.** Fast and private, but
  gigabytes to download and refresh; possible later beside the services.

## Decision

The third option. The editor's `src/lookup/` holds one `Lookup`
(`createLookup({fetch, server, language, catalogue, services})`): Wikidata, the GND
through lobid and YouTube's oEmbed are fetched from the browser,
MusicBrainz through `ReconciliationClient` at the server's
`api/reconcile/musicbrainz` with the run's token. A candidate's `service`
names the upstream endpoint (`https://www.wikidata.org/w/api.php`,
`https://lobid.org/gnd/search`, `https://www.youtube.com/oembed`,
`https://musicbrainz.org/ws/2/`), never the local server. `NO_LOOKUP`
supports nothing and sends nothing; an editor without lookup is given it.

## Maintenance and dependencies

No dependency enters: the editor uses `fetch`, `URL` and
`URLSearchParams`; the server uses `urllib.request` and reads form bodies
with `urllib.parse`. What is maintained is the services' answer formats,
read member by member so that a changed format fails as `malformed` rather
than silently. The tests replay answers recorded once
(`scripts/record-lookup.ts`), so a format change shows only when they are
recorded again; recording them again is the check. Wikidata's statement
filters, lobid's type filters and the MusicBrainz types per kind are one
table in `src/lookup/kinds.ts`.

Primary sources: <https://www.mediawiki.org/wiki/API:Search>,
<https://www.mediawiki.org/wiki/Help:Extension:WikibaseCirrusSearch>,
<https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities>,
<https://lobid.org/gnd/api>, <https://oembed.com/>,
<https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting>,
<https://www.w3.org/community/reports/reconciliation/CG-FINAL-specs-0.2-20230410/>.

## Consequences

Searching Wikidata, the GND and YouTube works in an embedded editor;
MusicBrainz is searchable only where a server runs. Text typed into a
value field reaches the service of the chosen system. Requests are made
without typing too: viewing the Metadata tab resolves the first thing each
rectangle names, for its thumbnail, and "＋ vocabulary" resolves a
rectangle's thing for its cross-references, so the IRIs of the things a
manifest states reach Wikidata, the GND, YouTube or the server (and
through it MusicBrainz) as soon as the tab shows them; proposing matches
sends the names stated without an identifier. The services see the user's
address and the page's origin, as with any link the user follows. With
the option `lookup: false` none of these requests is made. A service that changes its answer format or withdraws its open
access fails as an error the value field shows, and the other services go
on. Exit cost: the modules of `src/lookup/` and the server's endpoint.

## Review date

2027-05-20, or when a service changes its access rules.
