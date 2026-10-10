# `tilie-server` tests

The server does three things at this stage: it answers `GET /api/health`,
it serves the built editor, and it refuses everything that does not come from
its own origin with its own token. The `tilie` command starts it, opens the
browser, and can verify itself with `--check`. Every test below asserts exact
status codes and exact bodies; nothing is approximate, and the network is
never used beyond the loopback interface.

## The application (`test_app.py`)

Each test builds the app with `create_app(token=..., host="127.0.0.1",
port=...)` and talks to it through Starlette's `TestClient` with the base URL
`http://127.0.0.1:<port>`, so the `Host` header is the server's own unless a
test overrides it. What proves the behaviour:

1. **Health.** With the correct bearer token, `GET /api/health` answers 200
   with a JSON body whose keys are exactly `name`, `version`, `timetoalign`;
   `name` is `tilie-server`, `version` equals the installed distribution's
   version (`importlib.metadata.version("tilie-server")`) and `timetoalign`
   equals the installed `timetoalign` version. The three values are compared
   against the package metadata, not hard-coded, so the test holds across
   releases without being weaker.
2. **Token required.** Without an `Authorization` header the same request
   answers 401 `{"detail": "missing or invalid token"}`. With a wrong token
   (the right token with one character changed) it answers the same 401.
   A different scheme, lowercase scheme, or extra whitespace also answers
   401: the entire header must match, not just contain the token.
   A path under `/api/` that does not exist is also refused with 401 before
   routing, so an unknown route never leaks whether it exists.
3. **Foreign origin.** With the correct token but `Origin:
   http://evil.example` the request answers 403 `{"detail": "forbidden
   origin"}`. The server's own origin (`http://127.0.0.1:<port>`) and the
   `localhost` alias are accepted (200).
4. **Foreign host.** With the correct token but `Host: evil.example:80` the
   request answers 403 `{"detail": "forbidden host"}`; a missing `Host`
   is treated the same. `Host: localhost:<port>` is accepted when the server
   host is `127.0.0.1`.
5. **Editor not built.** With `static_dir` pointing at an empty temporary
   directory, `GET /` answers 503 `{"detail": "app not built"}`.
6. **Editor served.** With `static_dir` pointing at a temporary directory
   holding an `index.html`, `GET /` answers 200 with exactly that file's
   content and a `text/html` content type, and the Host and Origin checks
   apply to it as well (a foreign Host still gets 403).

7. **No referrer leaves the server.** Every HTTP response carries
   `Referrer-Policy: no-referrer`, so the browser never sends one of the
   server's URLs as a `Referer` to another site. "Every" is proven over each
   kind of response the server produces: the built editor at `/`, a static
   asset, an authorized API route (`/api/health`, 200), and the three
   refusals produced before routing (401 without a token, 403 for a foreign
   Origin, 403 for a foreign Host) as well as the 503 of an unbuilt editor.
   The header value is compared exactly and must occur exactly once.

## The command (`test_cli.py`)

The installed `tilie` console script beside the current interpreter is
exercised as a subprocess. CI also runs it from a clean wheel installation. What proves it:

1. **`--check` succeeds on a working installation.** With `--port <a free
   port>` and `--static-dir <a temporary directory holding index.html>` the
   process exits 0 and its standard output is one JSON document whose keys
   are exactly `name`, `version`, `timetoalign` with the values of (1) above.
   Standard error carries no uvicorn access log.
2. **`--check` fails when the editor is missing.** With an empty
   `--static-dir` the process exits 1 and standard error names the 503 from
   `GET /`.
3. **`--check` fails when the port is taken.** A socket is bound to a free
   port for the duration of the test; `--check --port <that port>` exits 1
   with `could not start the server on 127.0.0.1:<port>` on standard error.
4. **The token never reaches the access log.** `tilie --no-browser --port
   <a free port> --static-dir <a temporary directory holding index.html>` is
   started as a long-running process. Its first line of standard output is
   the URL it would open, and it must be exactly
   `http://127.0.0.1:<port>/#token=<token>` where `<token>` is 43 characters
   of the URL-safe base64 alphabet (32 random bytes); in particular it holds
   no `?token=`. That URL is then requested exactly as printed, the way a
   browser opening it does: the HTTP client sends the request target without
   the fragment, so the server sees `GET /`. `/api/health` is requested with
   the token as a bearer header, as the editor does. After the process is
   interrupted (SIGINT, the Ctrl+C path) it exits 0, and its whole output is
   inspected:
   uvicorn's access log holds exactly one line for `"GET / HTTP/1.1" 200`
   and exactly one for `"GET /api/health HTTP/1.1" 200`, and the token
   occurs nowhere in standard output or standard error except in the printed
   URL itself. Because the request is the one a browser makes from the printed
   URL, this proves the property end to end rather than for a hand-written
   request.
5. **The server never binds anything but the loopback interface.** `HOST`
   is the constant `127.0.0.1` and `free_port()` binds to it; the test for
   (1) connects to `127.0.0.1` only. (This is a property of the code, stated
   here so that a future option to bind elsewhere is a deliberate change.)

## The release version check (`test_check_versions.py`)

`scripts/check_versions.py` at the repository root is the gate of the release
workflow. Run as a subprocess with `--tag` and the tag that matches both declared
versions (`v` plus the version in `server/pyproject.toml`, which the test
reads) it exits 0; with a tag that matches neither it exits 1 and prints both
mismatches, one per line, naming the file, the declared and the expected
version.

Tags without `v`, with leading zeroes, or with prerelease suffixes are rejected.
The CLI tests pass `--no-browser` and invoke the installed console script.
Static asset bytes and the Origin guard on the editor are checked independently.
