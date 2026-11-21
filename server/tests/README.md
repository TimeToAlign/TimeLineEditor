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

## MatchClaims

`POST /api/match-claims` takes a manifest file's text together with the
package's `match_claims.parquet` (the request's bytes: the manifest's
length as a little-endian 32-bit integer, the manifest, the Parquet file;
`decisions/0030-match-claims-answer.md`) and answers the columns of
decision 0029 and every row's beliefs as aligned little-endian arrays
behind a JSON header (decision 0030). What proves the route is the table
read off by hand: the TimeToShare fixture `tables/0.2.0`
(`timetoshare.tables.fixture_path`, never copied) has fifteen MatchClaims,
few enough to write every array out from its rows, so the expected arrays
are the fixture's coordinates in the encoding of decision 0029, written in
the test, never the route's output. The tests decode the answer with
their own reader of decision 0030's layout, so the layout is proved as
well: the first four bytes are the header's length; the header is compact
JSON; the arrays start at the first multiple of eight after it, each
array's offset from there is the previous one's plus its byte length
rounded up to eight (the first 0), in the order of decision 0030's table,
and every byte between the header and an array or between two arrays is
zero.

**The fixture.** Posted with its `manifest.yaml` as it is (canonical YAML,
`#` IDs), the answer is 200 `application/octet-stream`, and its header,
without `arrays`, is exactly `{"format": "tilie-match-claims", "version":
1, "rows": 15, "timelines": [clt_1 fraction, clt_2 fraction, cpt_1 float,
dpt_1 int], "actors": ["https://orcid.org/0000-0001-5109-3700",
"https://orcid.org/0000-0002-1825-0097"], "beliefs": ["true", "false",
"unlikely"]}` (`clt_2` is a child of `clt_1`, found at its depth; the
number types are the units' defaults the manifest leaves unstated). The
arrays, row by row (`claim_1` to `claim_15`):

| Array | Values |
| --- | --- |
| `claim_ids` | `claim_1` … `claim_15` joined by a line feed |
| `a.timeline` | 0 0 0 3 0 3 0 0 0 0 3 0 0 0 1 |
| `b.timeline` | 3 3 3 0 3 2 2 2 2 2 2 3 3 2 3 |
| `start_present` | 1 everywhere but rows 11 (`claim_12`, a NOMATCH) and 13 (`claim_14`, conceptual) |
| `end_present` | 1 in rows 1 (`claim_2`) and 8 (`claim_9`), the interval claims |
| `a.start` | 0/1, 1, 3, 132300, 4, 176400, 5, 5, 6, 15/2, 441000, –, 10, –, 1 |
| `b.start` | 0, 44100, 132300, 3, 176400, 4.0, 5.0, 5.25, 6.0, 7.5, 10.0, –, 441000, –, 396900 |
| `a.end` | row 1: 2; row 8: 8 |
| `b.end` | row 1: 88200; row 8: 8.0 |
| `belief_offsets` | 0 1 1 1 1 1 2 2 2 2 2 3 3 5 6 6 |
| `belief_actors` | 1 1 1 1 0 0 |
| `belief_words` | 0 2 0 1 0 0 (row 0 true, row 5 unlikely, row 10 true, row 12 false and true, row 13 true) |

A value on a quarters (`fraction`) or samples (`int`) axis is its integer
or lowest terms with the double nearest it as `position`; one on the
seconds (`float`) axis is its double over `0/0`; the cells of a missing
anchor are zero.

| Request | Answer |
| --- | --- |
| the fixture's manifest written as pretty JSON | the same bytes as for the YAML |
| the fixture's table with one more column, `note` | the same bytes: a column the table type does not declare is kept by the checks and no part of a MatchClaim |
| the fixture's table without row provenance, the file's metadata `timetoshare:provenance` stating `{"method": "imported", "date": "2026-11-20", "beliefs": [A false, B true]}` (A, B the two actors) | `actors` `[B, A]`, `belief_offsets` 0, 2, … 30, `belief_actors` `1 0` per row and `belief_words` `1 0` per row: every row holds the file's beliefs |
| the fixture's table with A in `claim_1`'s belief written compactly, `orcid:0000-0002-1825-0097`, against the fixture's manifest, whose `@context` declares `orcid` as `https://orcid.org/`, a prefix no statement uses (timetoalign compares actors under every prefix a manifest declares) | the fixture's bytes: actors are answered as timetoalign compares them, expanded under the manifest's `@context`, so the compact and the full spelling are one actor, A |
| the same table against the fixture's manifest with `orcid` left out of its `@context` | `actors` `[B, A, "orcid:0000-0002-1825-0097"]` and `belief_actors` `2 1 1 1 0 0`: a prefix the context does not declare expands to nothing, and the actor is compared as written |
| a table built in the test on a samples, a quarters and a seconds timeline: 2^53 + 1 samples, the unreduced `[2, 4]` quarters, `[2^62 + 1, 3]` quarters and −0.0 seconds, each cell in the package form (its number once, in the member its number type names) | numerator 9007199254740993 with position 2^53 (the double nearest it, ties to even); the stated `[2, 4]` read by value and answered reduced as `1/2` with 0.5; the pair unchanged with Python's `float` of the fraction, the correctly rounded quotient; 0.0 with its sign bit clear |
| the fixture against its manifest without the child `clt_2` | 422 `{"detail": {"path": [], "message": "the manifest has no timeline 'clt_2'", "problems": [{"code": "unknown_timeline", "row": 14, "column": ["timeline_a_id"], "message": "the manifest has no timeline 'clt_2'"}]}}`: TimeToShare's check, every problem, as its own `match_claim_problems` lists them |
| the fixture's table without its `certainty` column | 422, `problems` `[{"code": "schema_violation", "row": null, "column": ["certainty"], "message": "the table has no column 'certainty'"}]` |
| two bytes | 422 `{"detail": {"path": [], "message": "the body does not start with the manifest's length"}}` |
| a prefix stating 100 bytes before 10 | 422 message `the body states a manifest of 100 bytes and holds 10` |
| a manifest that is no UTF-8 (`0xff`) | 422 message `the manifest is not UTF-8 text` |
| a manifest whose first timeline's ID is bare (`clt_1`) | 422 `{"detail": {"path": ["timelines", 0, "id"], "message": "'clt_1' is not written as an ID: it does not start with '#'"}}`, timetoshare's |
| table bytes that are no Parquet file (`not parquet`, or none) | 422 message `the MatchClaim table is no Parquet file` |
| without the bearer token | 401 `{"detail": "missing or invalid token"}` |

**A timetoshare or timetoalign that cannot.** With `timetoshare.tables`
made unimportable, the app built anew answers `GET /api/health` 200 and
the route 501 `{"detail": {"path": [], "message": "the installed
timetoshare <version> cannot check MatchClaim tables"}}`; with
`timetoalign.alignment.claims` made unimportable, 501 `the installed
timetoalign <version> cannot read MatchClaim tables`; both whatever the
body, each version the installed package's.

**The recording.** `scripts/record_match_claims.py <file>` writes the
answer to the fixture, which the client package's tests decode; the
script calls the route's own function, so the recording is this answer
byte for byte, proved by a test that runs the script into a temporary
directory and compares the file with the route's answer.

## MatchClaim provenance and beliefs

`POST /api/match-claims/provenance` answers the provenance of the
MatchClaims it is asked for, and `POST /api/match-claims/belief` answers
the posted table with one actor's belief recorded
(`decisions/0031-match-claim-provenance.md`). Both bodies are the
parameters' length (a little-endian 32-bit integer), the parameters as a
JSON object, then the body of `POST /api/match-claims` unchanged; the
table is checked against the manifest as that route checks it. The oracle
is again TimeToShare's table fixture, whose rows' provenance is few enough
to write out by hand (A is `…0002-1825-0097`, B `…0001-5109-3700`):
`claim_1` and `claim_11` stated by A on 2026-11-20 `manual` with A's
`true` of that day; `claim_14` stated by B, the same date, `manual`, the
note "the same gesture, not the same moment", B's `true` of 2026-11-21;
`claim_15` without provenance; every other row `imported` on 2026-11-20
from the service `https://example.org/aligner`, `claim_6` with A's
`unlikely` of 2026-11-21 noted "the onset is blurred", `claim_13` with A's
`false` of 2026-11-21 noted "a grace note, played late" and then B's
`true` of 2026-11-21. Every expected value is written in the test from
this list, never read off an answer.

**Provenance.** An entry is answered as TimeToShare's provenance entry,
its absent members left out, each belief's actor as the MatchClaims route
answers it: expanded under the manifest's `@context` as timetoalign
compares actors (`stated_by` is answered as written).

| Request | Answer |
| --- | --- |
| `claims` `["claim_6", "claim_15", "claim_1"]` | 200 `{"claims": [{"id": "claim_6", "provenance": {"date": "2026-11-20", "method": "imported", "service": "https://example.org/aligner", "beliefs": [{"actor": A, "belief": "unlikely", "date": "2026-11-21", "note": "the onset is blurred"}]}}, {"id": "claim_15", "provenance": null}, {"id": "claim_1", "provenance": {"stated_by": [A], "date": "2026-11-20", "method": "manual", "beliefs": [{"actor": A, "belief": "true", "date": "2026-11-20"}]}}]}`: in the order asked, never more than asked |
| `claims` `[]` | 200 `{"claims": []}` |
| the fixture's table without row provenance, the file stating `{"method": "imported", "date": "2026-11-20", "beliefs": [A false, B true]}`, both beliefs of 2026-11-21; `claims` `["claim_4"]` | the file's entry as `claim_4`'s |
| `claims` `["claim_1", "claim_99"]` | 422 `{"detail": {"path": ["claims", 1], "message": "the MatchClaim table has no MatchClaim 'claim_99'"}}` |
| `claims` `"claim_1"` | 422 at `["claims"]`, `the parameter 'claims' is no list of MatchClaim IDs` |
| the fixture against its manifest without `clt_2` | 422 with the table route's problems (`unknown_timeline`, row 14) |
| the fixture's table with A in `claim_13`'s belief written `orcid:0000-0002-1825-0097`, against the fixture's manifest, which declares `orcid` (as for the MatchClaims route); `claims` `["claim_13"]` | `claim_13`'s entry with its beliefs `[A false 2026-11-21 "a grace note, played late", B true 2026-11-21]`: A expanded |
| the same against the fixture's manifest with `orcid` left out of its `@context` | the actor `orcid:0000-0002-1825-0097` as written |

**A belief.** The belief is recorded by timetoalign: the server reads the
manifest as an `AlignmentBundle`, adds the table's MatchClaims and calls
its `add_match_claim_belief`, so the belief replaces the earlier one of the same actor
as timetoalign compares actors, expanded under the manifest's `@context`. The answer is 200 `application/vnd.apache.parquet`, a
Parquet file read back in the test. Every column but `provenance` equals
the fixture's, compared whole; so do the provenance cells of every row but
the believed one; the believed row's cell is written in the test:

| Belief | The believed row's `beliefs` |
| --- | --- |
| A `false` in `claim_6` on 2026-11-22 | `[A false 2026-11-22]`: A's earlier `unlikely` replaced in its place, the note gone with it; the paradata kept |
| B `unlikely` in `claim_13` | `[A false 2026-11-21 "a grace note, played late", B unlikely 2026-11-22]`: A's stands |
| A `unlikely` in `claim_2` (no beliefs) | `[A unlikely 2026-11-22]`, the paradata kept |
| B `true` in `claim_15` (no provenance) | an entry holding `[B true 2026-11-22]` alone, every other member null |

A table whose file states the provenance of every row (as above) and B's
`false` in `claim_3`: the answer's schema metadata no longer holds
`timetoshare:provenance`, every row holds the file's entry as its own, and
row 2 holds `[A false 2026-11-21, B false 2026-11-22]`. A column the table
type does not declare (`note`) is kept with its values. The answer posted
to `POST /api/match-claims` is accepted, and its beliefs are the
fixture's but in row 5: A's `false` (`belief_words` `0 1 0 1 0 0`).

**One actor, two spellings.** Against the fixture's manifest, which
declares `orcid` (as above), with C the compact `orcid:0000-0002-1825-0097`, each table compared
whole before and after (every column, every row, the believed cell written
in the test):

| Posted | Belief | The believed row's `beliefs` |
| --- | --- | --- |
| the fixture's table | C `false` in `claim_6` | `[C false 2026-11-22]`: A's `unlikely` replaced, the actor recorded as the request names it |
| the fixture's table, `claim_6`'s belief by C | A `false` in `claim_6` | `[A false 2026-11-22]`: C's replaced |
| the fixture's table, against the fixture's manifest with `orcid` left out of its `@context` | C `false` in `claim_6` | `[A unlikely 2026-11-21 "the onset is blurred", C false 2026-11-22]`: undeclared, C is another actor beside A |

Refusals, each 422 at the parameter's name with this message: `claim`
`claim_99`, `the MatchClaim table has no MatchClaim 'claim_99'`; `actor`
`""` or `3`, `an actor is named by a non-empty string`; `belief` `maybe`
or the JSON `true`, `a belief is one of the strings 'true', 'false',
'unlikely'`; `date` `2026-02-30`, timetoshare's `'2026-02-30' is no
Gregorian calendar date written YYYY-MM-DD`; `date` `20261122`, the same
words for that text; `date` 20261122 (a number), `a date is a string
written YYYY-MM-DD`; a parameter `note`, `'note' is no parameter of this
route`; without `date`, `the parameter 'date' is missing`. An actor that is
no IRI reference (`not an iri`) passes these and makes a table that
TimeToShare's checks refuse: 422 with the one problem `invalid_provenance`
at row 5, column `["provenance"]`, the check's message, which points at
`#/beliefs/1/actor`: the new actor's belief follows A's.

**The parameters**, for both routes: two bytes, `the body does not start
with the parameters' length`; a prefix stating 100 bytes before 10, `the
body states parameters of 100 bytes and holds 10`; parameters `[1]`, `the
parameters are no JSON object`; `{` or bytes that are no UTF-8, `the
parameters are no JSON text`; each 422 at `[]`. Both routes answer 401
without the token, and 501 `the installed timetoalign <version> cannot
record provenance` with `timetoalign.core.provenance` made unimportable.

**The succession rule.** The belief route cannot make a table that breaks
it, so the rule's check is proved on its own: written over the fixture, the
fixture without its last row is refused 422 `{"path": [], "message": "the
MatchClaim 'claim_15' is missing", "problems": [{"code":
"succession_missing", "row": null, "column": ["id"], "message": …}]}`; the
fixture with `claim_1`'s certainty 0.5 with `succession_changed` at row 0,
column `["certainty"]`, `the MatchClaim 'claim_1' changed its
'certainty'`; the fixture with A's `false` recorded in `claim_6` is
accepted.

## MatchClaim events

`POST /api/match-claims/events` answers, for the MatchClaims it is asked
for, the events on their two sides (`decisions/0032-match-claim-events.md`).
Its body is the parameters' length and the parameters (`{"claims": […]}`)
as the provenance routes take them, then the body of `POST
/api/match-claims` unchanged; nothing lies between the two. The oracle is
again TimeToShare's table fixture and its MatchClaim table, whose rows are
written out by hand in the test, never read off an answer:

| MatchClaim | Side A: timeline, event, name | Side B: timeline, event, name | Synchronous |
| --- | --- | --- | --- |
| `claim_1` | `clt_1` `note_1` `C4` | `dpt_1` `projection_1` – | yes |
| `claim_4` | `dpt_1` `projection_4` – | `clt_1` `note_4` `G4` | yes |
| `claim_7` | `clt_1` `note_6` `A4` | `cpt_1` `onset_2` – | yes |
| `claim_11` | `dpt_1` `projection_6` – | `cpt_1` `projection_7` – | yes |
| `claim_12` | `clt_1` `note_10` `E5` | `dpt_1`, no event | no |
| `claim_15` | `clt_2` `note_13` `A5` | `dpt_1` `projection_9` – | yes |

Every certainty is 1.0. Each answered MatchClaim has exactly the members
`{"id", "timeline_a_id", "event_a_id", "event_a_name", "timeline_b_id",
"event_b_id", "event_b_name", "certainty", "is_synchronous"}`, a null cell
`null`. The route reads no table but the MatchClaim table: the request
leaves no place for another, so a body that once carried a second table
between the parameters and the manifest's length is read as the
manifest's length and refused by the table route's own split.

| Request | Answer |
| --- | --- |
| `claims` `["claim_1", "claim_4", "claim_7", "claim_11", "claim_12", "claim_15"]` | 200, the six rows above in that order, each of exactly the nine members |
| `claims` `[]` | 200 `{"claims": []}` |
| `claims` `["claim_1", "claim_99"]` | 422 `{"detail": {"path": ["claims", 1], "message": "the MatchClaim table has no MatchClaim 'claim_99'"}}` |
| `claims` `"claim_1"` | 422 at `["claims"]`, `the parameter 'claims' is no list of MatchClaim IDs` |
| a parameter `note` | 422 at `["note"]`, `'note' is no parameter of this route` |
| the parameters, then a length 0 and the table route's body (the former empty Projections part) | 422 at `[]`, `the manifest is not an object`: the table route's refusal of a manifest of length 0 |
| the fixture against its manifest without `clt_2` | 422 with the table route's problems (`unknown_timeline`, row 14) |
| without the bearer token | 401 |

## Files

`GET /api/folders`, `GET /api/files` and `PUT /api/files` serve the user's
files below the server's root folder (`decisions/0033-server-file-access.md`):
the user's home folder unless `tilie --root <folder>` names another. A path
is the query parameter `path`, POSIX and relative to the root, `""` the root
itself. What these tests prove first is the boundary: no request reaches a
file outside the root, and no request writes a file that is not one of
TimeLineEditor's own kinds (`.tle.json`, `.yaml`, `.yml`, `.json`,
`.parquet`, by the end of the name in any case). The oracle is the
temporary folder the test builds and then inspects on disk, never the
route's own answer: a refusal is proved by its exact answer and by the
folder being unchanged beside it, a write by the bytes the test reads back.

Each test's root is a fresh temporary folder `R` holding:

- `a.yaml` holding `b"x: 1\n"`,
- `sub/b.tle.json` holding `b"{}"` and `sub/c.txt`,
- `.hidden.yaml`,
- the empty folder `d/`,
- `out`, a symbolic link to `R`'s parent folder, which lies outside the root.

| Request | Answer |
| --- | --- |
| `GET folders` `path=""` | 200 `{"path": "", "entries": [{"name": "d", "kind": "folder"}, {"name": "sub", "kind": "folder"}, {"name": "a.yaml", "kind": "file"}]}`: folders first, then files; `.hidden.yaml` left out (a name starting with `.`), `out` left out (its target lies outside the root) |
| `GET folders` `path="sub"` | `{"path": "sub", "entries": [{"name": "b.tle.json", "kind": "file"}]}`: `c.txt` is none of the five kinds |
| `GET folders` `path="d"` | `{"path": "d", "entries": []}` |
| `GET folders` on a folder holding the folders `y` and `Z`, the files `b.yaml`, `B.json`, `a.PARQUET` and `n.txt`, a link `inner` to `R/sub`, a link `alias.yaml` to `R/a.yaml` and a link `gone.yaml` to nothing | folders `Z`, `inner`, `y`, then files `B.json`, `a.PARQUET`, `alias.yaml`, `b.yaml`: each group sorted by code point (upper case before lower), a link inside the root listed as what it leads to, a link leading nowhere left out |
| `GET folders` `path="a.yaml"` (a file) or `path="nope"` | 404 `{"detail": {"path": ["path"], "message": "no such folder"}}` |
| `GET files` `path="a.yaml"` | 200, `Content-Type: application/octet-stream`, the bytes `b"x: 1\n"` |
| `GET files` `path="sub/../a.yaml"` | the same: `..` that stays inside the root is allowed |
| `GET files` `path=".hidden.yaml"` | 200 with its bytes: a hidden file is left out of listings only |
| `GET files` `path="sub/c.txt"` | 200 with its bytes: any file below the root is read |
| `GET files` `path="sub"` (a folder) or `path="nope.yaml"` | 404 `{"detail": {"path": ["path"], "message": "no such file"}}` |
| `PUT files` `path="sub/new.yaml"`, body `b"y: 2\n"` | 200 `{"path": "sub/new.yaml", "size": 5}`; `R/sub/new.yaml` holds exactly the body, and `R/sub` holds exactly `b.tle.json`, `c.txt`, `new.yaml` (no temporary file left behind) |
| `PUT files` `path="a.yaml"`, body `b"z: 3\n"`, after `R/a.yaml` was given the mode `0o640` | 200 `{"path": "a.yaml", "size": 5}`; the file holds the new bytes and keeps the mode `0o640` |
| `PUT files` `path="sub/X.TLE.JSON"`, body `b"{}"` | 200 `{"path": "sub/X.TLE.JSON", "size": 2}`: the kinds are matched in any case |
| `PUT files` `path="sub/c.txt"` and `path="a.yaml.txt"` | 403 `{"detail": {"path": ["path"], "message": "TimeLineEditor writes only workspace, manifest and table files"}}`; `c.txt` unchanged, no `a.yaml.txt` |
| `PUT files` `path="sub/alias.yaml"`, a link inside the root to `R/sub/c.txt` | 403 with the same message, `c.txt` unchanged: the kind of the file written is checked, not only the name asked for |
| `PUT files` `path="nope/x.yaml"` | 404 `{"detail": {"path": ["path"], "message": "no such folder"}}`, nothing created |
| `PUT files` `path="d.json"` where `R/d.json` is a folder | 409 `{"detail": {"path": ["path"], "message": "a folder lies at the path"}}`, the folder unchanged |

**Outside the root.** Each of `path="../x.yaml"`, `"/etc/passwd"`,
`"out/anything.yaml"`, `"out"`, `"sub/../../x.yaml"` and `"a\u0000.yaml"`
(a NUL character names no file) is refused by all three routes with 400
`{"detail": {"path": ["path"], "message": "path outside the root"}}`, before
anything else is looked at: a `PUT` of `"../x.yaml"` or `"out/x.yaml"`
creates no `x.yaml` in `R`'s parent folder, and one of `"../x.txt"` is
refused as outside, not as a foreign kind. A path is outside when the
absolute path it resolves to, every symbolic link followed, does not lie in
the root's resolved path; a root given through a symbolic link is resolved
once, so `a.yaml` is read through it.

**The guard.** Without the bearer token every route answers 401
`{"detail": "missing or invalid token"}`, and a `PUT` with a foreign
`Origin` 403 `{"detail": "forbidden origin"}`, neither writing anything, as
for every `/api/` path.

**The root.** `ServerSettings` holds the root, the user's home folder
unless one is given. `tilie` without `--root` takes the home folder,
`--root <R>` takes `R`; `--root` naming a missing folder or a file exits
with code 2 and the message `tilie: error: argument --root: '<given>' is
no existing folder` on stderr, after argparse's usage line.

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
