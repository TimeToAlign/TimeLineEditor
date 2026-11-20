# `tilie-server` test strategy

HTTP status, JSON bodies, headers, process output and exit codes are exact.
Application tests use an in-process client at the configured loopback
origin; command tests run the installed `tilie` script on a free loopback
port. Installed package metadata is the oracle for versions, uvicorn's own
log lines for the access log and a graceful shutdown, and temporary
directories stand in for built and missing editors.

## Security and routes

| Request | Answer |
| --- | --- |
| `/api/` path without exactly `Authorization: Bearer <run token>` (missing, wrong, `Basic`, `bearer`, a doubled space, a trailing space, an unknown path) | 401 `{"detail": "missing or invalid token"}`, before routing |
| foreign `Host` (also absent, sent through raw ASGI since the test client always supplies one) | 403 `{"detail": "forbidden host"}` |
| foreign `Origin` | 403 `{"detail": "forbidden origin"}` |
| authorized `GET /api/health` | 200 `{"name": "tilie-server", "version": …, "timetoalign": …}`, the installed versions |
| authorized `GET /api/openapi.json` | 404 `{"detail": "Not Found"}`; a generated document is no part of the interface |
| `GET /` without a built editor | 503 `{"detail": "app not built"}` |
| `GET /` and assets of a built editor | 200, byte for byte, `index.html` as `text/html; charset=utf-8` |

The configured host and its `localhost` alias are accepted as `Host` and as
`Origin`, and the host and origin checks hold for the editor's files as for
the API. Every answer above, success or rejection, carries exactly one
`Referrer-Policy: no-referrer` header.

## Measure maps

`POST /api/measure-maps` takes the text of a manifest file in any of its
serializations (canonical YAML, as the editor posts it, pretty JSON or RFC
8785 JSON), read by timetoshare's `loads`, and answers, for each entry of
its `measure_maps` in the manifest's order, the entry's ID and its rows
expanded by timetoalign (`MeasureMap.expand_rows`): every measure the
compressed rows imply, with every member of its decompressed form. What
proves the route is the expansion read off the Measure Map standard by
hand, not the library's output: a compressed map is short enough to expand
on paper, and an answer equal to that expansion cannot be a restatement of
the code. The library's own expansion of the same rows is checked as well,
to show the route adds or drops nothing beyond the stated serialization.

The answer's form is fixed: `{"measure_maps": [{"id", "rows"}]}`; each row
holds `ID`, `count`, `qstamp`, `number`, `name`, `time_signature`,
`nominal_length`, `actual_length`, `start_repeat`, `end_repeat`, `next`,
`volta` and `offset_within_measure`, in that order. The four quarter-note
values (`qstamp`, the two lengths, `offset_within_measure`) are Fraction
pairs `[numerator, denominator]`, `null` where the map gives none; `next`
lists the successors' counts. A row's keys outside the row form are kept by
the expansion and left out of the answer: they are no member of a measure.

**IDs.** A manifest file writes every ID as `#id`; the answer is the
editor's own interface, no manifest file, and names each map by its bare
ID, the one the editor matches a measure view's `measure_map` against. The
whole manifest is read into bare IDs (timetoshare's `with_bare_ids`), so a
file whose IDs are not in the file form is refused at the first such ID,
with timetoshare's path and message, before any map is expanded.

| Manifest | Answer |
| --- | --- |
| TimeToShare 0.2.0's fixture `groups/group_measure_map.minimal.yaml`, copied byte for byte into `data/` and posted as it is, canonical YAML in the minimal form with `#` IDs, as the editor posts a manifest (rows count 1 and count 4, both 4/4 and four quarters long, row 1 naming `next` `["2"]`, row 4 stating qstamp 12; the map's ID `"#measuremap_1"`) | 200, one map `measuremap_1` (bare) with four rows, compared whole with `data/group_measure_map.answer.json`: counts and numbers 1 to 4, IDs and names `"1"` to `"4"`, qstamps `[0, 1]`, `[4, 1]`, `[8, 1]`, `[12, 1]`, both lengths `[4, 1]`, `next` `[2]`, `[3]`, `[4]`, `[]`, `volta` `null`, `offset_within_measure` `[0, 1]`, no repeats |
| two rows of 3/4 in a map `"#bars"`: count 1 with `actual_length` 0.5 and `offset_within_measure` 2.5 (floats), count 2 with `volta` 1 and an unknown key `"extra"`; posted once as pretty JSON and once as canonical YAML | 200, both alike: one map `bars` of two rows: row 1 qstamp `[0, 1]`, number 0 and name `"0"` (a first row shorter than its nominal length is the anacrusis), lengths `[3, 1]` and `[1, 2]`, offset `[5, 2]` (each float read as its exact binary value), `next` `[2]`; row 2 qstamp `[1, 2]`, number and name 2, lengths `[3, 1]`, `next` `[]`, `volta` 1, offset `[0, 1]`; no `"extra"` |
| a map `"#measuremap_1"` of three 9/8 rows written as a score importer writes them, each stating its own `ID` (`qhghzyb`, `t1ajik95`, `l1lqnom3`), `count` and `number` 1 to 3, `name` `"1"` to `"3"`, qstamps `[0, 1]`, `[9, 2]`, `[9, 1]`, both lengths `[9, 2]`, no repeats, `next` naming the following row's `ID` (`["t1ajik95"]`, `["l1lqnom3"]`, `[]`), read by a quarters timeline's `MeasureRecordMap` with `target_unit: null`; posted as canonical YAML under the editor's `Content-Type: application/json` | 200, one map `measuremap_1` of three rows: each row's `ID`, count, number, name, qstamp, lengths and time signature as written, `next` the following row's count (`[2]`, `[3]`, `[]`), `volta` `null`, `offset_within_measure` `[0, 1]` |
| no `measure_maps`, or an empty list | 200 `{"measure_maps": []}` |
| a body that is no UTF-8 (the byte `0xff`) | 422 `{"detail": {"path": [], "message": "the body is not UTF-8 text"}}` |
| a body neither serialization reads (`{not json`) | 422 `{"detail": {"path": [], "message": "the body is neither JSON nor YAML: expected a key at line 1, column 2"}}`, timetoshare's message after the colon |
| a body that is no object (the JSON list `[]`, the YAML list `- 1`) | 422 `{"detail": {"path": [], "message": "the body is not an object"}}` |
| `measure_maps` that is no list (an object) | 422 `{"detail": {"path": ["measure_maps"], "message": "measure_maps is not a list"}}` |
| a map whose ID is bare (`"bars"`) | 422 `{"detail": {"path": ["measure_maps", 0, "id"], "message": "'bars' is not written as an ID: it does not start with '#'"}}` |
| the fixture with a second entry `"#broken"` whose rows state count 2, then count 1 | 422 `{"detail": {"path": ["measure_maps", 1], "message": "Measure Map count 1 does not increase after count 2"}}`, the library's message, nothing for the valid first entry |
| without the bearer token | 401 `{"detail": "missing or invalid token"}`, as every `/api/` path |

The route reads nothing of the manifest but `measure_maps`; checking the
rest of a manifest is the editor's, which sends only manifests it holds. It
keeps nothing between requests: the editor asks once per version of a
manifest, and two requests with one manifest answer the same.

**A timetoalign without the expansion.** The expansion is in timetoalign's
`timetoalign.timelines.structure`, which a released timetoalign may lack;
the server is still started then, and only this route says so. With that
module made unimportable, the server's modules import and the app is built
anew from them: `GET /api/health` still answers 200 with its three
versions, and every authorized `POST /api/measure-maps`, whatever its body,
answers 501 `{"detail": {"path": [], "message": "the installed timetoalign
<version> cannot expand measure maps"}}`, the version being the installed
package's. The table's other cases are never skipped: they run against
the timetoalign the server is locked to, and a timetoalign without the
expansion fails them.

**A timetoshare without the manifest reader.** The route reads the body
through timetoshare's `loads` and `with_bare_ids`, which timetoshare 0.2.0
holds and timetoalign brings in (the server requires timetoshare only
through timetoalign); a released timetoshare may lack them, and the server
is still started then. With `timetoshare` made unimportable, the app built
anew answers `GET /api/health` 200 and every authorized `POST
/api/measure-maps`, whatever its body, 501 `{"detail": {"path": [],
"message": "the installed timetoshare <version> cannot read manifest
files"}}`, the version being the installed package's; when no timetoshare
is installed at all, the message is `timetoshare is not installed, so
manifest files cannot be read`.

## MusicBrainz lookup

`/api/reconcile/musicbrainz` is a Reconciliation Service API 0.2 endpoint
(W3C Entity Reconciliation Community Group) over MusicBrainz's web
service. What proves it is MusicBrainz's own answers, recorded once and
replayed: every expected answer is written out by hand from the recorded
JSON, by the mapping below, never read off the route's output. The tests
never reach the network. A replaying fetch serves the URLs of
`data/musicbrainz/index.json`, each mapped to the recorded answer in its
file, records every call's URL and headers, and fails the test on any other
URL; so the URLs the route builds are proved exactly as well, and a request
the route refuses is proved to send none. `scripts/record_musicbrainz.py`
(not packaged) wrote the recordings on 2026-11-19 with the server's own URL
functions and User-Agent, one request a second; it records exactly these
four URLs under `https://musicbrainz.org/ws/2/`:

| URL | Used by |
| --- | --- |
| `work?query=Clair+de+lune&limit=5&offset=0&fmt=json` | the work query |
| `artist?query=Maria+Jo%C3%A3o+Pires&limit=5&offset=0&fmt=json` | the artist query |
| `artist?query=Pires&limit=10&offset=0&fmt=json` | the suggestion |
| `work/8d331505-4d88-39ae-81c7-bec5da77af96?inc=url-rels&fmt=json` | data extension |

**The mapping.** An identifier is `<type>/<mbid>`, so the identifier space
`http://musicbrainz.org/` followed by it is the entity's IRI. A candidate is
`{id, name, description?, score, match, type}` in that order: `name` the
title (an artist's name); `description` the non-empty parts joined with
` · `: a work's type and disambiguation, an artist's type, disambiguation
and area name, a recording's artist credit (each credited name followed by
its join phrase) and disambiguation, a release group's primary type and
artist credit, and absent when no part is left; `score` MusicBrainz's;
`match` true only for a score of 100 that no other candidate reaches (so the
first candidate, the next one scoring below 100, or none following); `type` `[{id, name}]` of the
queried type. Search text is escaped for MusicBrainz's search syntax (each
of `+ - & | ! ( ) { } [ ] ^ " ~ * ? : \ /` preceded by `\`), so
`'AC/DC: "Live" (1+1)'` searched for 10 artists from 20 is the URL
`artist?query=AC%5C%2FDC%5C%3A+%5C%22Live%5C%22+%5C%281%5C%2B1%5C%29&limit=10&offset=20&fmt=json`.

| Request | Answer |
| --- | --- |
| `GET /api/reconcile/musicbrainz` | 200, the service manifest compared whole with the one written in the test: versions `["0.2"]`, name `MusicBrainz through tilie-server`, identifier space `http://musicbrainz.org/`, schema space `http://schema.org/`, the four default types work, artist, recording and release-group (named "release group"), view `https://musicbrainz.org/{{id}}`, suggest and property proposal at the root-relative `/api/reconcile/musicbrainz` with `/suggest/entity` and `/properties`, `property_settings` `[]`; no upstream request |
| `POST` form `queries` `{"q0": {"query": "Clair de lune", "type": "work"}, "q1": {"query": "Maria João Pires", "type": "artist"}}` | 200 `{"q0": {"result": […]}, "q1": {"result": […]}}`, five candidates each. q0: `work/199ec7b6-…` "Clair de Lune" score 100, the one match (the next scores 99), no description; then three "Song" works and one "for organ, Anna Lapwood" at 99, 99, 98, 98. q1: `artist/64cf3646-fde3-4f5e-8741-8b4d21917785` "Maria João Pires" "Person · pianist · Portugal" 100, a match (the next scores 50); then 50, 48, 44 and "Maria Cándida Pires" at 41 without a description. Two upstream requests, the first two URLs |
| `GET` with `queries` `{"q0": {"query": "Clair de lune", "limit": 5}}` | 200, q0 as above: a query without a type searches works |
| `GET /api/reconcile/musicbrainz/suggest/entity?prefix=Pires&type=artist` | 200 `{"result": [ten {id, name, description?}]}`, from "Alexandre Pires" "Person · Brazil" to "Barbara Pires" "Person · Gospel singer · New Bedford"; "Djalma Pires" without a description; no score, match or type |
| `GET …/properties?type=artist` (and without a type) | 200 `{"type": "artist" (`"work"`), "properties": [{"id": "name", "name": "name"}, {"id": "sameAs", "name": "same as"}]}`; no upstream request |
| `POST` form `extend` `{"ids": ["work/8d331505-4d88-39ae-81c7-bec5da77af96"], "properties": [{"id": "name"}, {"id": "sameAs"}]}` | 200 `{"meta": [{"id": "name", "name": "name"}, {"id": "sameAs", "name": "same as"}], "rows": {"work/8d331505-…": {"name": [{"str": "Suite bergamasque, L. 75, CD 82 : III. Clair de lune"}], "sameAs": [{"str": "http://www.wikidata.org/entity/Q29117946"}]}}}`: the work's one URL relationship, `https://www.wikidata.org/wiki/Q29117946`, recognised by timetoshare's catalogue as that IRI. The properties asked in the other order answer `meta` and each row in that order |

Recording and release-group candidates are proved against two search
answers written in the test in MusicBrainz's JSON form (no recording of
these types is needed for the editor): a recording credited to "Maria João
Pires" with the join phrase " & " and "Augustin Dumay", disambiguation
"live", is described "Maria João Pires & Augustin Dumay · live", one with
neither credit nor disambiguation has no description; a release group of
primary type "Album" credited to "Maria João Pires" is "Album · Maria João
Pires", and of two release groups both scoring 100 neither is a match.

**The rules of use.** MusicBrainz asks for one request a second and a
User-Agent naming the application. Every upstream request carries exactly
`User-Agent: tilie-server/<installed version> (
https://github.com/TimeToAlign/TimeLineEditor )` and `Accept:
application/json`, and no personal data. The pacing is proved with an
injected clock and an injected sleep that advances it, never by waiting:
three requests for three different URLs, the clock standing still, sleep
exactly `[1.0, 1.0]`; with the clock moved 0.25 s after the first request,
the second sleeps exactly `[0.75]`; moved 1 s, it sleeps not at all. Two
equal queries (the second through `GET`, the first through `POST`) make one
upstream request and answer alike; a suggestion is cached by its own URL.
The cache keeps the least recently used answers: with room for two, after
`a`, `b`, `a` and `c`, asking `a` again makes no request and asking `b` does.
A failure is not cached.

**Refusals and failures.** Each refusal below answers 422 `{"detail":
<message>}` and makes no upstream request:

| Request | Message |
| --- | --- |
| `queries` that is no JSON, a JSON list, an object holding a string, or a `POST` with neither `queries` nor `extend` | `queries is no JSON object of queries` |
| a query without `query`, or with blank text | `query 'q0' has no text` |
| a query, suggestion or property proposal of type `place` | `'place' is no type of this service; the types are work, artist, recording and release-group` |
| `limit` 0, 26, `"5"` or `true` | `limit is an integer from 1 to 25` |
| a suggestion without `prefix`, or with an empty one | `prefix is required` |
| a suggestion with `cursor` `-1` or `x` | `cursor is an integer from 0` |
| `extend` that is no JSON, lacks `properties`, or whose `ids` is no list of strings | `extend is no JSON object with ids and properties` |
| the property `title` | `'title' is no property of this service; the properties are name and sameAs` |
| the identifiers `work/8D331505-…` (upper case), `place/8d331505-…` and the bare `8d331505-…` | `'<id>' is no identifier of this service` |

An upstream answer 503 is answered 502 `{"detail": "MusicBrainz answered
503"}`, and the same request asked again reaches MusicBrainz again; a fetch
that raises `TimeoutError` or `urllib`'s `URLError` is answered 502
`{"detail": "MusicBrainz could not be reached"}`; an answer 200 that is no
JSON 502 `{"detail": "MusicBrainz answered no JSON"}`. With
`timetoshare.catalogue` made unimportable, data extension asking `sameAs`
answers 501 `{"detail": "the installed timetoshare has no catalogue"}`
without an upstream request, and asking only `name` still answers 200.
Every route answers 401 without the token, and a `POST` with a foreign
`Origin` 403 `{"detail": "forbidden origin"}`, as every `/api/` path.

**The fetch.** The standard library's fetch is proved on the loopback
interface against a server the test runs: an answer 200 and an answer 503
are returned with their status and body, the request carries the given
User-Agent, and a port nothing listens on raises `OSError`. The app built
without a client holds a `MusicBrainz` of its own.

## The command

**The port.** Without `--port`, `tilie` listens on port 8000, so that the
editor keeps one address from run to run and the browser keeps what it
remembers for that address (the identity that asserts the viewer's links,
for one); when 8000 cannot be bound, it listens on a free port instead and
says so on stderr: `tilie: port 8000 is in use, so the server runs on port
<port>; the browser remembers the editor's settings, your identity among
them, for each port apart`. A port is free when it can be bound as the
server binds it, with `SO_REUSEADDR` outside Windows, so that the
connections of a run just stopped do not hold it. The choice is proved on
its own with a default the test controls: a port the test found free is
chosen as it is, without a notice; a port the test holds listening gives
another port, one the test can then bind, and that notice exactly; a port
given with `--port` is kept even while it is held, without a notice (the
server then fails to start, as below). The command itself, run with
`--check` and no `--port` while port 8000 is held (by the test, or by
another process already), exits 0, prints the health JSON and on stderr
exactly the notice, naming a port other than 8000.

`tilie --check` against a built editor prints the health JSON and nothing
on stderr, exit code 0; without a built editor it prints `tilie --check
failed: GET / answered 503: {"detail":"app not built"}` with exit code 1; on
an occupied port it ends with `tilie: could not start the server on
127.0.0.1:<port>`, exit code 1.

The long-running command prints `http://127.0.0.1:<port>/#token=<token>`,
the token 43 URL-safe characters. Requesting that URL, as a browser would,
sends no fragment, and an authorized health request with the token as the
bearer succeeds; the complete output then holds exactly the access lines
`GET / HTTP/1.1` 200 and `GET /api/health HTTP/1.1` 200, and the token
only once, in the printed URL.

SIGINT, SIGINT to a command started as a background job (which inherits
SIGINT as ignored, as every background job of a non-interactive shell
does), and SIGTERM each end the run within five seconds with exit code 0,
nothing more on stdout and exactly uvicorn's startup and graceful-shutdown
lines on stderr. Whatever the outcome, every test stops the process it
started before it ends: one that outlives the deadline, or one the signal
cannot be sent to, is killed, so a failure can neither stall the suite nor
leave a server running after it. These signals are POSIX ones: Windows
cannot send SIGINT to another process, nor start one with SIGINT ignored,
and ends one at SIGTERM without a graceful shutdown, so the tests that stop
the long-running command with a signal (this one and the access log's
above) run only on POSIX systems (CI runs them on Linux).

## Release version check

`scripts/check_versions.py --tag vX.Y.Z` succeeds only when the tag equals
the versions of `server/pyproject.toml` and `app/package.json`; a mismatch
names both files with their declared and expected versions, and a tag that
is not strictly `vX.Y.Z` (no `v`, a leading zero, a prerelease suffix, two
parts) is refused with `invalid release tag: <tag>; expected vX.Y.Z`, both
with exit code 1.
