---
status: accepted
date: 2026-11-21
---

# The server reads and writes the user's files by path below a root folder

## Context

A browser page never learns a file's path: a picked `File` carries a name
only. Chromium's File System Access pickers give handles that can be kept
in IndexedDB, but a later visit must ask permission again, a file handle
reaches no file beside it, and a handle can neither be written into a
workspace file nor move to another machine. Firefox and Safari have no
pickers at all (decision 0023): opening is a one-off read, saving is a
download.

So an editor in those browsers cannot save a workspace back into its file,
cannot reopen a workspace and find the manifests it was made from, and
cannot find the tables a manifest's `resources` name beside it: every
MatchClaim table is picked again by hand, in every session. Decision 0030
already routes the tables through the server, and its plan named the way
out: packages open as folders through the server.

The server runs as the user, bound to `127.0.0.1`, behind the run's bearer
token and the origin guard (decision 0008, `AGENTS.md`). It can do what a
desktop program does: read and write files by path, in every browser.

## Considered options

- **Browser handles only.** Keep folder handles in IndexedDB and ask for
  permission once per visit. Chromium only: nothing in Firefox or Safari,
  nothing that moves between machines, no path to write into a workspace.
- **The server searches for a picked file.** It would look below a folder
  for a file of the name, size and SHA-256 a manifest's `resources` state.
  It guesses, and searching a home folder is slow.
- **The server serves files by path below a root folder**, three routes
  under `/api/`, the paths plain strings an editor can keep in a workspace.

## Decision

The last option.

- **The root.** `tilie --root <folder>` names the folder whose files the
  editor may open and save; the user's home folder by default. A root that
  is no existing folder ends the command with exit code 2. The root is
  resolved once, when the app is built.
- **`GET /api/folders?path=<p>`** answers `{"path": p, "entries": [{"name",
  "kind": "folder" | "file"}]}`: the folders, then the files ending (in any
  case) in `.tle.json`, `.yaml`, `.yml`, `.json` or `.parquet`, each group
  sorted by code point. Names starting with `.` are left out, and so is a
  symbolic link leading out of the root or to nothing; a link inside the
  root is listed as what it leads to.
- **`GET /api/files?path=<p>`** answers the file's bytes,
  `application/octet-stream`. Any file below the root is read.
- **`PUT /api/files?path=<p>`** writes the request's body into the file,
  only one of those five kinds, and answers `{"path": p, "size": n}`. The
  bytes go to a new file in the same folder, which then takes the file's
  place by `os.replace`, so no reader sees a half-written file; a file
  replaced keeps its mode. The folder must exist.
- **Paths** are POSIX and relative to the root, `""` the root itself.
- **Refusals** answer as the server's other routes do, `{"detail": {"path":
  ["path"], "message"}}`, the query parameter being what is refused:
  400 `path outside the root`, 404 `no such file` or `no such folder`,
  403 `TimeLineEditor writes only workspace, manifest and table files`,
  409 `a folder lies at the path`.

The client (`@timetoalign/tilie-client`'s `listFolder`, `readFile`,
`writeFile`) holds no paths of its own; what the editor keeps is its own.

## Security

The routes widen what a request can reach from what the editor posts to
every file below the root, so each guard is stated and tested with exact
answers:

- **Who may ask.** The routes lie under `/api/`, so the existing guard
  applies unchanged: the run's bearer token, handed to the page only in
  the URL fragment (401 without it), the server's own `Host` (403,
  against DNS rebinding) and no foreign `Origin` (403, against other
  pages). Nothing else listens: the server binds `127.0.0.1` only.
- **Where.** A path is refused before anything is read or written when it
  is absolute, holds a NUL character, or resolves (`..` applied, every
  symbolic link followed) to a place that does not lie in the resolved
  root. A link inside the root leading out is refused, and a listing never
  shows one.
- **What is written.** Only TimeLineEditor's own kinds, checked on the name
  asked for and on the file a link leads to, so no request writes a
  script, a shell profile or a key, even below the root. A folder is never
  replaced.
- **How far.** `--root` narrows the reach to one folder; the home folder is
  the default because that is where a user keeps their scores and
  packages.

A file swapped for a symbolic link between the check and the write is not
guarded against: the server is a single user's, on their own machine,
reachable only with the run's token.

## Maintenance and dependencies

No dependency enters: `pathlib`, `os` and FastAPI's routing on the server,
`fetch` and `URLSearchParams` in the client. The server's tests build a
temporary root holding a link leading out and prove every refusal on all
three routes with its exact status and message, and with the folder
inspected on disk after it.

## Consequences

In every browser, with the server running, the editor can open and save
files in place and keep where a workspace's manifests lie as paths. Without
a server, the browser's pickers and downloads stay (decision 0023). An
editor page loaded with the run's token can read any file below the root;
that is the trust the token already carried for the tables it posts. The
exit cost is local: three routes, one option and the client's three calls.

## Review date

2027-05-21, or when the server serves anyone but the user who started it.
