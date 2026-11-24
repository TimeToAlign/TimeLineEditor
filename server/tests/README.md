# `tilie-server` test strategy

HTTP status, JSON bodies, headers, process output and exit codes are exact.
Application tests use an in-process client at the configured loopback
origin; command tests run the installed `tilie` script on a free loopback
port. Installed package metadata is the oracle for the server's and
timetoalign's versions; the `timetoshare` member is the schema version, the
version marker its bundled schema demands of a manifest (`$defs.Manifest.properties.timetoshare.const`),
since an editable install keeps the metadata of the version it was
installed at. uvicorn's own log lines are the oracle for the access log and
a graceful shutdown, and temporary directories stand in for built and
missing editors.

**Words that are timetoshare's.** A refusal worded by timetoshare (its
manifest validator, its MatchClaim table checks, its date reader) is proved
by what the server owns and what is stable: the status, the `path`, each
problem's `code`, `row` and `column`, that each problem's message is the
answer's message, and the substrings that name what is refused (the ID, the
date or the offending text). The sentence around them is timetoshare's to
rephrase, and a test that pinned it would fail on every rewording there
while no behaviour of the server changed. The words the server itself
words stay exact.

## Security and routes

| Request | Answer |
| --- | --- |
| `/api/` path without exactly `Authorization: Bearer <run token>` (missing, wrong, `Basic`, `bearer`, a doubled space, a trailing space, an unknown path) | 401 `{"detail": "missing or invalid token"}`, before routing |
| foreign `Host` (also absent, sent through raw ASGI since the test client always supplies one) | 403 `{"detail": "forbidden host"}` |
| foreign `Origin` | 403 `{"detail": "forbidden origin"}` |
| authorized `GET /api/health` | 200 `{"name": "tilie-server", "version": …, "timetoalign": …, "timetoshare": …, "files": true}`, the server's and timetoalign's installed versions and the schema version of the timetoshare imported (`SCHEMA_VERSION`, not the installed package's metadata), and `files` true, since this server serves the file routes; `"timetoshare": null` where timetoshare cannot be imported, whatever the import raises: an `ImportError`, or any other exception, proven by an import that raises `RuntimeError` |
| authorized `GET /api/openapi.json` | 404 `{"detail": "Not Found"}`; a generated document is no part of the interface |
| `GET /` without a built editor | 503 `{"detail": "app not built"}` |
| `GET /` and assets of a built editor | 200, byte for byte, `index.html` as `text/html; charset=utf-8` |

The configured host and its `localhost` alias are accepted as `Host` and as
`Origin`, and the host and origin checks hold for the editor's files as for
the API. Every answer above, success or rejection, carries exactly one
`Referrer-Policy: no-referrer` header.

**A long computation holds no other route.** The routes that compute their
answer from a posted body (measure maps, the four MatchClaim routes, the
file write) run on the framework's thread pool, so that the event loop
stays free while they compute. Proved without a clock: through one client
whose requests share one event loop, a request to each of those routes is
held inside its computation (the manifest reader, or the file writer,
replaced by one that announces it was entered and then waits for a
release), and while it is held `GET /api/health` answers 200; then the held
request is released and answers. Run inside the event loop, the held
request would keep the health request from ever being read, and the test
fails at its safety timeout instead of hanging.

## Public mode

`tilie --public-host <host>` (the option repeatable) serves the editor to
anyone who reaches the host: no token, no file routes, a bounded request
body, and the host and origin checks kept against the given host names in
place of the loopback address. The application is proved in process
(`test_public.py`), with the two public hosts `tilie.example.org` and
`localhost:8000` and the settings a public run uses (`ServerSettings` with
those `public_hosts`, no token, `files` false), and a body limit of 8 bytes
in place of the real one, so that no test allocates 16 MiB. Each case
holds the same request against a local-mode app as its control where the
answer differs there, so a case cannot pass because the request never
reached what it tests.

**No token.** `GET /api/health` without any `Authorization` header, and
with `Authorization: Bearer wrong`, both answer 200 with the installation's
health and `"files": false` (a local app answers both 401). The other
members are the local answer's, so a host reading `files` learns from the
one answer which file access the editor has.

**Hosts.** The `Host` header must equal one of the given hosts as given,
character for character:

| `Host` | Answer |
| --- | --- |
| `tilie.example.org`, `localhost:8000` | 200 |
| `127.0.0.1:8000` (the loopback origin a local run answers to), `tilie.example.org:443` (a given host with a port appended), `localhost`, `evil.example` | 403 `{"detail": "forbidden host"}` |
| none (raw ASGI, as for the local guard) | 403 `{"detail": "forbidden host"}` |

**Origins.** An `Origin`, when sent, must be `https://<host>` or
`http://<host>` for a given host: the four origins `https://tilie.example.org`,
`http://tilie.example.org`, `https://localhost:8000` and
`http://localhost:8000` answer 200; `https://evil.example`,
`http://127.0.0.1:8000`, `https://tilie.example.org:443` and `null` answer
403 `{"detail": "forbidden origin"}`. The settings state the same sets:
`allowed_hosts()` is exactly the two hosts, `allowed_origins()` exactly the
four origins; in local mode `allowed_origins()` is `http://` before each
allowed host (`http://127.0.0.1:8765` and `http://localhost:8765` for the
test's port), the origins the guard accepted before it took them from the
settings.

**No files.** A root holding `a.yaml` (`x: 1`) is given, so a routed file
request would answer 200, as the local control does for `GET
/api/folders?path=` and `GET /api/files?path=a.yaml`. In public mode `GET
/api/folders?path=`, `GET /api/files?path=a.yaml` and `PUT
/api/files?path=b.tle.json` (body `{}`) answer 404 `{"detail": "Not
Found"}`, without a built editor and with one, and `b.tle.json` is never
written. With a built editor mounted at `/`, a `PUT` to a path the editor's
files do not hold would be the mount's 405 `Method Not Allowed`; in public
mode every `/api/` path that no route serves answers 404 `{"detail": "Not
Found"}` whatever the method, which the `PUT` case with a built editor
proves, so the API never falls through to the editor's files.

**Body limit.** A request body longer than the limit is refused with 413
before the route runs. The route proving it is `POST /api/measure-maps`,
its manifest reader replaced by one that records the body it is given and
refuses it (422 `{"detail": {"path": [], "message": "seen"}}`), so the
record shows whether the route ran and with which bytes. The message names
the limit: `body larger than <n> MiB` when the limit is a whole number of
MiB (so the real limit, `16 * 1024 * 1024`, gives exactly `body larger
than 16 MiB`), else `body larger than <n> bytes` (`1 byte` for one); the
test limit of 8 gives `body larger than 8 bytes`, and the rule itself is
pinned for 16 MiB, 1 MiB, 8 bytes and 1 byte.

| Request (limit 8) | Answer | Route |
| --- | --- | --- |
| 9 bytes with `Content-Length: 9` | 413 `{"detail": "body larger than 8 bytes"}` | not run |
| `Content-Length: 9` through raw ASGI, whose `receive` records every call | 413 as above | not run, and `receive` never called: the length alone refuses |
| 9 bytes sent chunked by the test client (no `Content-Length`) | 413 as above | not run |
| three chunks of 4 bytes through raw ASGI, no `Content-Length` | 413 as above, once the third chunk passes 8 | not run |
| exactly 8 bytes, with `Content-Length` and as two chunks of 4 | 422 `seen` | run once, with exactly those 8 bytes |
| an empty `GET /api/health` | 200 | |

A local app takes the 9 bytes to the route (the middleware is not added
without a limit). The CLI sets the real limit: the settings a public
command line builds carry `body_limit` exactly `16 * 1024 * 1024` (below).

**Table bounds.** The body limit bounds the bytes received, not what a
Parquet file decodes to: a column of zeros, or one long string repeated,
compresses a thousandfold and more. So a public server also bounds a posted
MatchClaim table by its rows and by its size uncompressed, on each of the
four routes that read one (`POST /api/match-claims`, `…/events`,
`…/provenance` and `…/belief`), all of which read the table through one
function. Two measures are taken against the bounds:

1. **The footer, before any row is decoded.** The rows are the larger of
   the file's row count and the sum of its row groups' row counts (a reader
   follows the row groups', so a file whose file-level count says fewer is
   caught); the size is the sum of the row groups' `total_byte_size`.
2. **The decoded table, batch by batch.** The footer is the sender's
   statement, and even an honest one measures the encoded pages: a string
   repeated through dictionary encoding is stated once, however many rows
   repeat it. So the table is decoded in batches of 1,024 rows, the bytes
   of each batch's Arrow buffers are added up, and the read stops at the
   batch that passes the size bound, decoding no further batch.

A table within both bounds answers exactly as on a local server. The
refusal is 413 in the routes' own form, `{"detail": {"path": [], "message":
…}}`, at the path of their other table refusals (`[]`), worded from the
bounds: `table of more than <n> rows` (`n` with a comma between thousands,
`1 row` for one) and `table larger than <size> uncompressed` (`<size>` named
as the body limit names its limit: `<n> MiB` for a whole number of MiB,
else `<n> bytes`, `1 byte` for one, `n` with a comma between thousands in
both). The public bounds give exactly `table
of more than 1,000,000 rows` and `table larger than 128 MiB uncompressed`;
the rule is pinned for those and for 1 row, 1,234 rows, 1,234 bytes, 8 bytes
and 1 byte, and the body limit's message names 1,234 bytes alike (`body
larger than 1,234 bytes`).
A local server has neither bound and reads the table as it always did.

The cases post TimeToShare's MatchClaim table fixture (15 rows) and its
manifest, the table written by pyarrow in the test, with small bounds
injected into the settings. The facts the cases rest on are read from the
file by pyarrow in the test and asserted as preconditions, so each case
shows which measure refuses: the footer's size and rows from its metadata,
and the decoded size as the buffers of the whole table read at once, which
for a table of at most 1,024 rows is the one batch. "Not decoded" is proved
by replacing pyarrow's batch reader and its whole-table reader with ones
that fail the test when called.

| Table | Bounds | Answer |
| --- | --- | --- |
| the fixture | 15 rows, the decoded size | 200, byte for byte the local answer, on each of the four routes (the events and provenance of `claim_1`, the belief `claim_6`, `false`) |
| the fixture | 14 rows | 413 `table of more than 14 rows`, on each of the four routes; not decoded |
| the fixture, its footer's file-level row count rewritten from 15 to 14 in the test (its row group still says 15) | 14 rows | 413 `table of more than 14 rows`; not decoded |
| the fixture | the decoded size less one (the footer states less) | 413 `table larger than <n> bytes uncompressed` (`n` that bound), by the decoded count |
| the fixture with a column `note` of 100,000 `a` per row, plain encoding, zstd: the file under 16 KiB, its footer stating more than 1 MiB | 1 MiB | 413 `table larger than 1 MiB uncompressed`; not decoded |
| the same column dictionary-encoded: the footer states under 1 MiB, the decoded table holds more | 1 MiB | 413 `table larger than 1 MiB uncompressed`, by the decoded count |
| one column of 5,000 strings of 100 `a`, dictionary-encoded | 150,000 bytes | 413 `table larger than 150,000 bytes uncompressed` once the second batch is decoded: each batch of 1,024 rows holds 1,024 × 100 bytes of text and 1,025 four-byte offsets, 106,500 bytes, so the sum passes the bound at the second (213,000); the batch reader yields 2 of the file's 5 batches |

Each of these tables reaches the route on a local app: the fixture's
answers 200, the fixture with a `note` column answers 200 with the
fixture's own answer (a column the table type does not declare changes
nothing), and the table of one column reaches the table checks, which
refuse it with 422 at `[]`.

What the two measures leave open: one batch is decoded before it is
counted, so a single batch can pass the bound by its own size, at most
1,024 rows times the longest value in it. A value's length is bounded only
by the page that holds it, whose decoded size the page's own header states
(up to 2 GiB) and which pyarrow decodes without exposing that header first;
dictionary and `DELTA_BYTE_ARRAY` encoding repeat one such value in every
row at the cost of a few bytes each. No test can bound that without a
reader of page headers, which the server does not have.

**Computations and connections.** A public run lets at most two posted-body
computations run at once (measure maps and the four MatchClaim routes; the
file write is not served there); further ones wait their turn, they are
not refused, and they wait on the event loop, holding no worker thread.
`GET /api/health`, the 404 of an unserved `/api/` path and the editor's
files never wait: only the routes taking a posted body pass the gate. A
local app has no gate. Proved without a clock, through one client whose
requests share one event loop, on a public app whose gate admits one
computation and a built editor:

- `POST /api/measure-maps`, its manifest reader replaced by one that
  records `enter`, waits for a release and records `leave`, is sent twice.
  The app's gate is observed by a wrapper that records, for each
  computation arriving at it, whether the gate was full, and signals the
  arrival. Once the first request has entered and the second has arrived,
  the arrivals are exactly `[not full, full]` and the record is exactly
  `[enter]`: the second waits at the gate, not on its way to it.
- While it waits, `GET /api/health` answers 200, `GET /api/nothing` 404
  `{"detail": "Not Found"}` and `GET /` 200 with the editor's
  `index.html`.
- Released, the record is exactly `[enter, leave, enter, leave]`: the
  second entered only after the first had left. Both answer 422
  `{"detail": {"path": [], "message": "held"}}`.

As the control, a local app takes the same two requests into the reader at
once: both have entered before either is released. A gate admitting more
than one would fail the arrivals (`[not full, not full]`), and none would
fail at the safety timeout waiting for the second arrival.

The number of connections a public run serves at once is uvicorn's
`limit_concurrency`, beyond which uvicorn answers 503 itself (uvicorn's
behaviour, not tested here): the uvicorn configuration the command builds
from public settings carries `limit_concurrency` exactly 32, from local
settings none.

**Referrer policy.** The 403 (host and origin), the 404 of a file route and
the 413 each carry exactly one `Referrer-Policy: no-referrer` header.

**The command.** `--public-host` together with `--check`, `--root` or
`--no-browser` is refused by the option parser: exit code 2, nothing on
stdout, and stderr ending in `tilie: error: argument <option>: not allowed
with argument --public-host` (argparse's own wording for options that
exclude each other), naming both options. An empty `--public-host ""`
is refused the same way, `argument --public-host: a host name is not
empty`, since an empty name would admit a request with an empty `Host`
header. The settings a command line builds are compared whole: `tilie
--public-host tilie.example.org --public-host localhost:8000 --port 8001`
builds `ServerSettings(host="0.0.0.0", port=8001, token=None, static_dir=None,
root=<home folder>, public_hosts=("tilie.example.org", "localhost:8000"),
files=False, body_limit=16 * 1024 * 1024, table_rows=1_000_000,
table_bytes=128 * 1024 * 1024, computations=2, connections=32)`, the
numbers written out in the test, so that the constants they come from are
pinned too; without `--public-host` the settings are the local ones
(`127.0.0.1`, a token of 43 URL-safe characters, no public hosts, `files`
true, no body limit, no table bounds, no limit of computations or
connections). The notice line
for those two hosts is exactly `tilie: public mode on port 8001, answering
as tilie.example.org, localhost:8000; no token, no file access`.

Started as a process with `--public-host localhost:<p> --port <p>` (a free
port) and a built editor, the command prints that line for its one host on
stderr once uvicorn listens; then `GET /api/health` with `Host:
localhost:<p>` and no `Authorization` answers 200, its `files` false;
SIGTERM ends it with exit code 0 and stderr exactly uvicorn's startup lines,
`Uvicorn running on http://0.0.0.0:<p>` among them (the address bound),
the notice line, and uvicorn's graceful-shutdown lines; stdout holds only
the access line of the health request, no URL. **No browser opens**: the
`BROWSER` variable names a command that writes the URL it is given into a
marker file; the public run leaves no marker, and as the control the local
command started with the same variable and without `--no-browser` writes
its printed URL into the marker. The marker is looked for once the public
process has ended; an opener started at the notice line would have run
while the test's health request and the shutdown took place.

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
| a body neither serialization reads (`{not json`) | 422 at path `[]`; the server's words `the body is neither JSON nor YAML: ` exact, then timetoshare's message, of which `line 1, column 2` is asserted |
| a body that is no object (the JSON list `[]`, the YAML list `- 1`) | 422 `{"detail": {"path": [], "message": "the body is not an object"}}` |
| `measure_maps` that is no list (an object) | 422 `{"detail": {"path": ["measure_maps"], "message": "measure_maps is not a list"}}` |
| a map whose ID is bare (`"bars"`) | 422 at path `["measure_maps", 0, "id"]`, timetoshare's words, of which `'bars'` and `'#'` are asserted |
| the fixture with a second entry `"#broken"` whose rows state count 2, then count 1 | 422 at path `["measure_maps", 1]`, the library's words, of which `count 1`, `does not increase` and `count 2` are asserted, nothing for the valid first entry |
| without the bearer token | 401 `{"detail": "missing or invalid token"}`, as every `/api/` path |

The route reads nothing of the manifest but `measure_maps`; checking the
rest of a manifest is the editor's, which sends only manifests it holds. It
keeps nothing between requests: the editor asks once per version of a
manifest, and two requests with one manifest answer the same.

**A timetoalign without the expansion.** The expansion is in timetoalign's
`timetoalign.timelines.structure`, which a released timetoalign may lack;
the server is still started then, and only this route says so. With that
module made unimportable, the server's modules import and the app is built
anew from them: `GET /api/health` still answers 200 with its four
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
anew answers `GET /api/health` 200, its `timetoshare` `null`, and every authorized `POST
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
| the fixture's table with one more column, `scope`, holding `bundle_1` in the even rows and `bundle_2` in the odd ones | the same bytes: a MatchClaim is its ID alone, so a `scope` column is a further column like `note`, kept and never checked |
| the fixture's table with `claim_2`'s ID written `claim_1` and the same `scope` column, which gives the two rows two scopes | 422 at path `[]` with the one problem `duplicate_id` at row 1, column `["id"]`, whose message is the answer's and quotes `'claim_1'`: a scope tells no two MatchClaims apart, TimeToShare's check |
| the fixture's table without row provenance, the file's metadata `timetoshare:provenance` stating `{"method": "imported", "date": "2026-11-20", "beliefs": [A false, B true]}` (A, B the two actors) | `actors` `[B, A]`, `belief_offsets` 0, 2, … 30, `belief_actors` `1 0` per row and `belief_words` `1 0` per row: every row holds the file's beliefs |
| the fixture's table with A in `claim_1`'s belief written compactly, `orcid:0000-0002-1825-0097`, against the fixture's manifest, whose `@context` declares `orcid` as `https://orcid.org/`, a prefix no statement uses (timetoalign compares actors under every prefix a manifest declares) | the fixture's bytes: actors are answered as timetoalign compares them, expanded under the manifest's `@context`, so the compact and the full spelling are one actor, A |
| the same table against the fixture's manifest with `orcid` left out of its `@context` | `actors` `[B, A, "orcid:0000-0002-1825-0097"]` and `belief_actors` `2 1 1 1 0 0`: a prefix the context does not declare expands to nothing, and the actor is compared as written |
| a table built in the test on a samples, a quarters and a seconds timeline: 2^53 + 1 samples, the unreduced `[2, 4]` quarters, `[2^62 + 1, 3]` quarters and −0.0 seconds, each cell in the package form (its number once, in the member its number type names) | numerator 9007199254740993 with position 2^53 (the double nearest it, ties to even); the stated `[2, 4]` read by value and answered reduced as `1/2` with 0.5; the pair unchanged with Python's `float` of the fraction, the correctly rounded quotient; 0.0 with its sign bit clear |
| the fixture against its manifest without the child `clt_2` | 422 at path `[]` with the one problem `unknown_timeline` at row 14, column `["timeline_a_id"]`, whose message is the answer's and quotes `'clt_2'`: TimeToShare's check, every problem, as its own `match_claim_problems` lists them |
| the fixture's table without its `certainty` column | 422, the one problem `schema_violation` at row `null`, column `["certainty"]`, whose message is the answer's and quotes `'certainty'` |
| two bytes | 422 `{"detail": {"path": [], "message": "the body does not start with the manifest's length"}}` |
| a prefix stating 100 bytes before 10 | 422 message `the body states a manifest of 100 bytes and holds 10` |
| a manifest that is no UTF-8 (`0xff`) | 422 message `the manifest is not UTF-8 text` |
| a manifest whose first timeline's ID is bare (`clt_1`) | 422 at path `["timelines", 0, "id"]`, timetoshare's words, of which `'clt_1'` and `'#'` are asserted |
| the fixture with its manifest naming itself `5`, which TimeToShare's checks of the table accept and timetoalign's reading of the manifest refuses through TimeToShare's validator | 422 at path `["name"]`, the validator's words, of which `#/name` and `5` are asserted: the refusal keeps the validator's path; the provenance and the belief routes answer the same |
| table bytes that are no Parquet file (`not parquet`, or none) | 422 message `the MatchClaim table is no Parquet file` |
| without the bearer token | 401 `{"detail": "missing or invalid token"}` |

**A timetoshare or timetoalign that cannot.** With `timetoshare.tables`
made unimportable, the app built anew answers `GET /api/health` 200 and
the route 501 `{"detail": {"path": [], "message": "the installed
timetoshare <version> cannot check MatchClaim tables"}}`; with
`timetoalign.alignment.claims` made unimportable, 501 `the installed
timetoalign <version> cannot read MatchClaim tables`; both whatever the
body, each version the installed package's.


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
type does not declare (`note`, and so `scope`, two scopes over the rows)
is kept with its values. The answer posted
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
'unlikely'`; `date` `2026-02-30` or `20261122` (path `["date"]`), timetoshare's
words, of which the text quoted in single quotes is asserted; `date` 20261122 (a number), `a date is a string
written YYYY-MM-DD`; a parameter `note`, `'note' is no parameter of this
route`; without `date`, `the parameter 'date' is missing`. An actor that is
no IRI reference (`not an iri`) passes these and makes a table that
TimeToShare's checks refuse: 422 with the one problem `invalid_provenance`
at row 5, column `["provenance"]`, whose message (timetoshare's, equal to
the answer's) points at `#/beliefs/1/actor` and quotes `'not an iri'`: the
new actor's belief follows A's.

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
itself. What these tests prove first is the boundary, for a holder of the
run's token: no request reaches a file outside the root; no request reaches
a hidden file or folder (a segment starting with `.`) below it, whether
named or reached through a link; a read answers only the files the editor
opens, workspace, manifest and table files (`.tle.json`, `.yaml`, `.yml`,
`.json`, `.parquet`, by the end of the name in any case); and a write
writes only workspace files (`.tle.json`), the one file the editor saves
through the server. Kinds are checked on the name asked for and on the
file a link leads to. The oracle is the temporary folder the test builds
and then inspects on disk, never the route's own answer: a refusal is
proved by its exact answer and by the whole tree below the root being
unchanged beside it (every folder, every file's bytes and mode, every
link's target, read without following links), a write by the bytes the
test reads back.

Each test's root is a fresh temporary folder `R` holding:

- `a.yaml` holding `b"x: 1\n"` and `notes.txt`,
- `sub/b.tle.json` holding `b"{}"` and `sub/c.txt`,
- the hidden files and folders a home folder holds: `.hidden.yaml`,
  `.ssh/id_rsa`, `.claude.json`, `.claude/settings.json`, `.config/x.yaml`,
  and `sub/.hidden/a.yaml`,
- links inside the root leading into hidden places: `sub/key.yaml` to
  `R/.config/x.yaml`, `sub/conf` to the folder `R/.config`, and
  `sub/hid.tle.json` to `R/.config/hid.tle.json`, which does not exist,
- the empty folder `d/`,
- `out`, a symbolic link to `R`'s parent folder, which lies outside the root.

**Listing.**

| Request | Answer |
| --- | --- |
| `GET folders` `path=""` | 200 `{"path": "", "entries": [{"name": "d", "kind": "folder"}, {"name": "sub", "kind": "folder"}, {"name": "a.yaml", "kind": "file"}]}`: folders first, then files; the hidden names left out, `notes.txt` left out (none of the readable kinds), `out` left out (its target lies outside the root) |
| `GET folders` `path="sub"` | `{"path": "sub", "entries": [{"name": "b.tle.json", "kind": "file"}]}`: `c.txt` is none of the readable kinds, `.hidden` is hidden, and `key.yaml`, `conf` and `hid.tle.json` lead into a hidden place |
| `GET folders` `path="d"` | `{"path": "d", "entries": []}` |
| `GET folders` on a folder holding the folders `y` and `Z`, the files `b.yaml`, `B.json`, `a.PARQUET` and `n.txt`, a link `inner` to `R/sub`, a link `alias.yaml` to `R/a.yaml`, a link `text.yaml` to `R/notes.txt`, a link `gone.yaml` to nothing and a link `loop.yaml` to itself | folders `Z`, `inner`, `y`, then files `B.json`, `a.PARQUET`, `alias.yaml`, `b.yaml`: each group sorted by code point (upper case before lower), a link inside the root listed as what it leads to, a link leading to a file of another kind, to nothing or into a loop left out |
| `GET folders` `path="a.yaml"` (a file) or `path="nope"` | 404 `{"detail": {"path": ["path"], "message": "no such folder"}}` |

**Reading.**

| Request | Answer |
| --- | --- |
| `GET files` `path="a.yaml"` | 200, `Content-Type: application/octet-stream`, the bytes `b"x: 1\n"` |
| `GET files` `path="sub/../a.yaml"` | the same: `..` that stays inside the root is allowed |
| `GET files` `path="sub/b.tle.json"` | 200, `b"{}"` |
| `GET files` `path="nope.yaml"` | 404 `{"detail": {"path": ["path"], "message": "no such file"}}` |
| `GET files` `path="notes.txt"`, `path="sub/c.txt"` and `path="sub"` (a folder: its name is none of the kinds) | 403 `{"detail": {"path": ["path"], "message": "TimeLineEditor reads only workspace, manifest and table files"}}` |
| `GET files` `path="sub/text.yaml"`, a link to `R/notes.txt` | 403 with the same message: the kind of the file read is checked, not only the name asked for |

**Writing.**

| Request | Answer |
| --- | --- |
| `PUT files` `path="sub/new.tle.json"`, body `b"{\"a\": 1}"` | 200 `{"path": "sub/new.tle.json", "size": 8}`; `R/sub/new.tle.json` holds exactly the body, and `R/sub` holds exactly what it held and `new.tle.json` (no temporary file left behind) |
| `PUT files` `path="sub/b.tle.json"`, body `b"{\"b\": 2}"`, after `R/sub/b.tle.json` was given the mode `0o640` | 200 `{"path": "sub/b.tle.json", "size": 8}`; the file holds the new bytes and keeps the mode `0o640` |
| `PUT files` `path="sub/X.TLE.JSON"`, body `b"{}"` | 200 `{"path": "sub/X.TLE.JSON", "size": 2}`: the kind is matched in any case |
| `PUT files` `path="a.yaml"`, `"x.yaml"`, `"package.json"`, `"m.parquet"`, `"sub/c.txt"` and `"a.yaml.txt"` | 403 `{"detail": {"path": ["path"], "message": "TimeLineEditor writes only workspace files"}}`: a manifest, a table or any other file is never written, an existing one (`a.yaml`) never replaced |
| `PUT files` `path="sub/alias.tle.json"`, a link inside the root to `R/sub/c.txt`, and `path="sub/m.tle.json"`, a link to `R/a.yaml` | 403 with the same message: the kind of the file written is checked, not only the name asked for |
| `PUT files` `path="nope/x.tle.json"` | 404 `{"detail": {"path": ["path"], "message": "no such folder"}}`, nothing created |
| `PUT files` `path="d.tle.json"` where `R/d.tle.json` is a folder | 409 `{"detail": {"path": ["path"], "message": "a folder lies at the path"}}`, the folder unchanged |
| `GET files` `path="a.yaml/"` and `PUT files` `path="w.tle.json/"` | 400 `{"detail": {"path": ["path"], "message": "a file's path does not end in /"}}`: the slash is not dropped, so `a.yaml` is not read and no `w.tle.json` written |

**Links in a loop.** The answers below are the same on every Python the
server supports: `Path.resolve` raises on a loop up to Python 3.12 and
leaves the looping link in the path it returns from 3.13 on, so the
routes resolve a path as the latter does on every version. A path whose
last segment is a link in a loop is refused as one; a path that leads
through such a link to a further segment names nothing, as a path through
a missing folder does. Each request is made with two loops below `R`:
`loop.tle.json`, a link to itself, and `ring.tle.json` and `ring2`, two
links leading to each other.

| Request | Answer |
| --- | --- |
| `PUT files` (body `b"{}"`) and `GET files`, each on `path="loop.tle.json"` and on `path="ring.tle.json"` | 400 `{"detail": {"path": ["path"], "message": "the links at the path form a loop"}}` |
| `GET folders` `path="loop.tle.json"` and `path="ring2"` | 400 with the same message |
| `GET files` `path="ring2/x.yaml"` | 404 `{"detail": {"path": ["path"], "message": "no such file"}}` |
| `PUT files` `path="ring2/x.tle.json"` | 404 `{"detail": {"path": ["path"], "message": "no such folder"}}` |
| `GET folders` `path="ring2/d"` | 404 with the same message |

Every refusal of this section and the next two leaves the tree below `R`
exactly as it was.

**Hidden files.** A path is refused with 403 `{"detail": {"path":
["path"], "message": "hidden files are not served"}}` when one of its
segments starts with `.` and is not `..` (checked on the path as asked,
before anything is resolved: `.ssh/../a.yaml` is refused though it resolves
to `a.yaml`), or when the place it resolves to, every link followed, has
such a segment below the root (a link leading into `.config`). A hidden
folder above the root is no concern: only segments below the root are
looked at, so a root inside a hidden folder serves its files.

| Request | Paths |
| --- | --- |
| `GET files` | `.ssh/id_rsa`, `.claude.json`, `.claude/settings.json`, `.config/x.yaml`, `.hidden.yaml`, `sub/.hidden/a.yaml`, `.ssh/../a.yaml`, and `sub/key.yaml` (a link into `.config`) |
| `PUT files` | `.claude.json`, `.claude/settings.json`, `.config/x.yaml`, `sub/.hidden/a.yaml`, `.ssh/w.tle.json`, `.w.tle.json`, `sub/key.yaml`, and `sub/hid.tle.json` (a link to the missing `R/.config/hid.tle.json`, which is not created): a hidden path is refused as hidden, before its kind is looked at |
| `GET folders` | `.ssh`, `.claude`, `sub/.hidden`, and `sub/conf` (a link to `R/.config`) |

The refusal holds under a root that is itself inside a hidden folder:
with `--root` naming `R/.config`, `GET files` `path="x.yaml"` answers 200.

**Permissions.** A file or folder the user running the server may not read
or write answers 403 `{"detail": {"path": ["path"], "message": "permission
denied"}}`, never a server error. In `R`, the file `locked.yaml` (bytes
`b"l: 1\n"`), the workspace `locked.tle.json` (bytes `b"{}"`), both mode
`0o000`, and the folder `shut/` holding `in.yaml`, mode `0o000`, and the
folder `ro/`, mode `0o555`:

| Request | Answer |
| --- | --- |
| `GET files` `path="locked.yaml"` | 403 `permission denied` |
| `GET files` `path="shut/in.yaml"` | 403 `permission denied` |
| `GET folders` `path="shut"` and `path="shut/x"` | 403 `permission denied` |
| `PUT files` `path="shut/new.tle.json"` | 403 `permission denied`, nothing created |
| `PUT files` `path="ro/new.tle.json"` | 403 `permission denied`, nothing created, no temporary file left |
| `PUT files` `path="locked.tle.json"` | 403 `permission denied`: a file the user may not write is not replaced, though its folder would let a new file take its place |

Each answer leaves the tree unchanged (inspected after the modes are given
back). These tests are skipped when the tests run as the superuser, whom no
mode stops, and on Windows, which has no POSIX modes.

**Outside the root.** Each of `path="../x.yaml"`, `"/etc/passwd"`,
`"out/anything.yaml"`, `"out"`, `"sub/../../x.yaml"` and `"a\u0000.yaml"`
(a NUL character names no file) is refused by all three routes with 400
`{"detail": {"path": ["path"], "message": "path outside the root"}}`, before
anything else is looked at: a `PUT` of `"../x.tle.json"` or
`"out/x.tle.json"` creates no `x.tle.json` in `R`'s parent folder, and one
of `"../x.txt"` is refused as outside, not as a foreign kind. A path is
outside when the absolute path it resolves to, every symbolic link
followed, does not lie in the root's resolved path; a root given through a
symbolic link is resolved once, so `a.yaml` is read through it.

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

## Recorded answers

The client package's tests replay the server's answers instead of a
running server: `scripts/record_answers.py [folder]` sends every route the
client calls one fixed request through the application, in process, and
writes each answer's body byte for byte to
`app/packages/client/tests/data/<name>.answer.bin` (or into the folder
given). The requests are the cases the client's tests README derives:
`GET /api/health`; `POST /api/measure-maps` with `data/`'s copy of
`group_measure_map.minimal.yaml`; with TimeToShare's table fixture as it
is, `POST /api/match-claims`, the provenance of `claim_6`, `claim_15`,
`claim_1`, A's belief `false` in `claim_6` on 2026-11-22, the events of
`claim_1`, `claim_11`, `claim_12`; and below a root made for the run, the
listing of `sub dir/ä` (a folder `d`, a file `a.yaml`), the file `a.yaml`
holding `x: 1` and the write of `y: ä` into `sub/new.tle.json`. A route that
does not answer 200 stops the script. The MusicBrainz routes are the
editor's lookup, not the client's, and replay their own recordings.

Two facts are proved. **Every recording is the route's answer:** the test
runs the script into a temporary folder and compares each file with the
committed one byte for byte, so a change of an answer fails until it is
recorded again. Two exceptions: the health answer, whose values are the
installed versions, is compared by its member names and the JSON type of
each value (a string each, `files` a boolean), since a version moves with every release
and the answer's form does not; and a Parquet answer (the belief route's)
is compared as a table, with its columns, values, schema and field metadata
and the footer's key/value metadata, since its footer also names the
writing library's version (`parquet-cpp-arrow version …`), and a pyarrow
upgrade must not fail a test while no answer changed. The folder holds exactly the recordings
the script writes, no stale file. **Every route the client calls is
recorded:** the methods and paths of the application's routes below
`/api/`, the MusicBrainz ones aside, are exactly the recordings' methods
and paths, so a new route without a recording fails.

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
