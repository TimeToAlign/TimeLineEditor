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
