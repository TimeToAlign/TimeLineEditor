---
status: accepted
date: 2026-11-24
---

# A public mode serves the editor without a token and without files

## Context

`tilie` is built for one user on their own machine: it binds `127.0.0.1`,
generates a bearer token for each run and hands it to the page in the URL
fragment, refuses every `Host` and `Origin` but its own, and serves the
files below a root folder to whoever holds the token (decisions 0008 and
0033, `AGENTS.md`).

The editor is also to be tried without installing anything: one address on
the web, opened by anyone, with the server's routes behind it (measure
maps, the MatchClaim routes, the MusicBrainz lookup), run from a container
image on a hosting service that puts HTTPS in front of it and routes a
public host name to the container's port.

None of the local guards survives that setting as it is. The page of a
visitor has no token, since nobody started the run for them and no URL can
carry a secret to every visitor; the requests arrive on the container's
interface, not on the loopback one; the `Host` is the public name. And the
file routes must not be reachable by anyone at all: below the root of a
public server lie no visitor's files, and whatever lies there is not theirs
to read or replace.

## Considered options

- **An `--allow-origin` option**, widening the accepted origins of a local
  run, as an embedding of the editor on another page would need. It keeps
  the token, which a public visitor cannot have, and keeps the file routes;
  each deployment would have to switch the remaining guards off one by one,
  and a forgotten one leaves the home folder of the server's user readable
  by the public.
- **Separate options** for the bind address, the token and the file routes.
  Every combination becomes a supported state, most of them unsafe (a token
  check switched off on a server that still serves files), and tests would
  have to cover each.
- **One mode**, chosen by naming the public host: `tilie --public-host
  <host>`. Everything that differs from a local run follows from that one
  switch, and nothing in a local run changes.

## Decision

The last option. `tilie --public-host <host>` (repeatable, for a server
reached under several names) starts the server in public mode:

- **Network.** It binds `0.0.0.0` on `--port` (8000 by default, with the
  same fall-back to a free port as a local run), opens no browser and prints
  `tilie: public mode on port <port>, answering as <hosts>; no token, no
  file access` on stderr. `--check`, `--root` and `--no-browser` are refused
  with it (exit code 2): there is no local origin to check, no folder to
  serve and no browser to open.
- **Guard.** The `Host` header must equal one of the given hosts exactly, as
  given (`tilie.example.org`, or `localhost:8000` for a trial on one's own
  machine); otherwise 403 `forbidden host`, which keeps the defence against
  DNS rebinding. An `Origin`, when sent, must be `https://<host>` or
  `http://<host>` for one of them; otherwise 403 `forbidden origin`, which
  keeps other pages from driving the server through a visitor's browser.
  No token is checked: an `/api/` route answers with any `Authorization`
  header or none, so the editor's page, which sends the empty token it
  has, works unchanged. `Referrer-Policy: no-referrer` is sent with every
  answer, as in a local run.
- **No files.** The file routes are not routed: `GET /api/folders`, `GET
  /api/files` and `PUT /api/files` answer 404 `{"detail": "Not Found"}`, as
  does every other `/api/` path no route serves, whatever its method, so
  that no request to the API falls through to the editor's files.
  `GET /api/health` says which kind of server answers: its member `files`
  is `true` in a local run and `false` in public mode, and the editor offers
  its own file dialog only where the answer does not say `false`, using the
  browser's pickers and downloads otherwise, as without a server.
- **Body limit.** A request body over 16 MiB is refused with 413
  `{"detail": "body larger than 16 MiB"}`: at once when `Content-Length`
  says so, without reading the body, and as soon as the bytes received pass
  the limit for a body sent without one, before the route runs. A local
  run has no limit: its only client is its own user.
- **Table bounds.** A posted MatchClaim table of more than 1,000,000 rows,
  or of more than 128 MiB uncompressed, is refused with 413 `{"detail":
  {"path": [], "message": "table of more than 1,000,000 rows"}}` or
  `"table larger than 128 MiB uncompressed"`, on each of the four routes
  that read one. The bounds are checked first from the Parquet footer,
  before any row is decoded (the larger of the file's and the row groups'
  row counts, and the row groups' summed uncompressed size), then on the
  decoded table, 1,024 rows at a time, stopping at the batch that passes
  the size bound: a footer is the sender's statement, and even an honest
  one states a value repeated by dictionary encoding only once. A local run
  has no bounds.
- **Work at once.** At most two computations on a posted body (measure maps
  and the MatchClaim routes) run at once; further ones wait their turn on
  the event loop, holding no worker thread, and are not refused. Health,
  the answers to unserved paths and the editor's files never wait. Uvicorn
  serves at most 32 connections at once and answers 503 beyond them. A
  local run has neither limit.
- **Settings.** `ServerSettings` carries the mode as data: `token` (`None`
  for no token check), `public_hosts`, `files`, `body_limit`, `table_rows`,
  `table_bytes`, `computations` and `connections`, from which
  the guard takes its hosts (`allowed_hosts()`) and origins
  (`allowed_origins()`). The guard, `OriginGuard`, checks a token only where
  the settings hold one.

## The container image

The image (`Dockerfile` and `.dockerignore` at the repository root, the
repository the build context) runs `tilie --public-host … --port …
--static-dir <the built editor>` as a non-root user and exposes port 8000;
the public host comes from `TILIE_PUBLIC_HOST`, or from the host name a
hosting service sets (`RENDER_EXTERNAL_HOSTNAME`), and the image refuses to
start with neither. It is built in two stages from official base images:
Node.js 22 with pnpm (the version `app/package.json` names) builds the
editor against a TimeToShare checkout, as CI does; Python 3.12 slim with uv
0.11.28 installs the server from `server/uv.lock` beside checkouts of
timetoalign and TimeToShare, whose commits the build arguments
`TIMETOALIGN_REF` and `TIMETOSHARE_REF` select. uv is the project's build
tool already (decision 0009); no Python or npm dependency enters.

## Security

What a public server gives up, and what it keeps:

- **No token.** Anyone who reaches the host can call every route the server
  keeps. Those routes compute an answer from what the request posts (a
  manifest, a MatchClaim table) and keep nothing between requests, or ask
  MusicBrainz through the server's paced client; none reads or writes
  anything on the server's machine.
- **No files.** The routes that read and write files by path are absent,
  not guarded: no token, header or path reaches them.
- **Hosts and origins** stay checked as in a local run, against the given
  names in place of the loopback address.
- **Bodies** are bounded: the bytes one request makes the server receive
  and hold are at most 16 MiB; the routes read whole bodies before
  computing.
- **Tables** are bounded in their rows and in their decoded size, as above,
  since 16 MiB of Parquet can decode to many gigabytes. The decoded size is
  counted after each batch of 1,024 rows, so one batch can pass the bound
  by its own size before it is counted.

What stays open:

- **One batch of a table.** A batch's size is at most 1,024 rows times its
  longest value, and a value is bounded only by the Parquet page that holds
  it, whose decoded size (up to 2 GiB) the page's own header states and
  pyarrow decodes without exposing first. Dictionary and `DELTA_BYTE_ARRAY`
  encoding repeat one long value in every row for a few bytes each, so a
  crafted file of a few kilobytes can still make one batch large. Bounding
  it needs a reader of page headers, or a memory limit on the process.

- **No rate limit.** A visitor can send as many requests as the host lets
  through, each up to 16 MiB. The server bounds how many it serves and
  computes at once, so memory and threads stay bounded, but not how many it
  takes in a minute: one visitor's stream of computations makes every
  other visitor's wait, and one visitor holding the 32 connections makes
  others answered 503. A hosting service's own limits, or a proxy in front,
  bound that.
- **The shared MusicBrainz queue.** The server keeps MusicBrainz's rule of
  one request a second for the whole run (decision 0028), so one visitor's
  many lookups make every other visitor's lookups wait, and a request may
  name many queries at once. The answers are cached for everyone.

## Consequences

The editor can be tried at a public address with measure maps, Show matches
and the MusicBrainz lookup working, opening and saving files through the
browser. A local run is unchanged except that its health answer gains
`"files": true`. A deployment names its host once, and a mistake in it
leaves the server refusing every request (403), never open to a host it
was not given. The exit cost is local: one option, the settings' members,
one middleware, the bounded table reader and the health member.

## Review date

2027-05-24, or earlier when a public server is to keep anything between
requests, to serve files of any kind, or when its load calls for a rate
limit of its own.
