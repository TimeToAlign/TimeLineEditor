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

## The command

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
lines on stderr. A process that outlives the deadline is killed, so a
failure cannot stall the suite.

## Release version check

`scripts/check_versions.py --tag vX.Y.Z` succeeds only when the tag equals
the versions of `server/pyproject.toml` and `app/package.json`; a mismatch
names both files with their declared and expected versions, and a tag that
is not strictly `vX.Y.Z` (no `v`, a leading zero, a prerelease suffix, two
parts) is refused with `invalid release tag: <tag>; expected vX.Y.Z`, both
with exit code 1.
