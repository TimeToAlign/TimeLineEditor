---
status: accepted
date: 2026-10-12
---

# Opening and saving files written in `editor`

## Context

The editor opens and saves workspace files (`.tle.json`), imports manifest
files and exports them. Where the browser has the File System Access API
(`showOpenFilePicker`, `showSaveFilePicker`), Save must write back into the
file that was opened or last saved, without asking again. Where it does not
(Firefox and Safari as of this writing), opening falls back to an
`<input type="file">` and saving to a download. A cancelled picker is no
error. The texts are read and written only through core's
`readWorkspace`, `writeWorkspace`, `loadManifest` and `saveManifest`.

The required surface is two functions: open one file of one kind as text
(with its handle when there is one) and save one text (into a handle, or to
a picked or downloaded file).

The npm registry and the repository were checked on 2026-10-12.

## Considered options

- `browser-fs-access` 0.38.0 (released 2025-06-18, Apache-2.0, no runtime
  dependencies, 43,232 bytes unpacked, one maintainer on the registry,
  repository `GoogleChromeLabs/browser-fs-access` with 1,590 stars, 10 open
  issues, last push 2026-06-22): `fileOpen` and `fileSave` with the same
  fallbacks, plus directory opening, multiple files, MIME and extension
  lists, and legacy cancel detection through focus events.
- Write it ourselves in `editor/src/files.ts`: feature-detect the two
  pickers, otherwise click a hidden file input and resolve on its `change`
  or `cancel` event, or click a download link. About a hundred lines with
  the comments.

Scores run from 1 (least suitable) to 5 (most suitable). For maintenance and
size, a higher score means less code or package surface to carry.

| Criterion | `browser-fs-access` | Own code |
| --- | ---: | ---: |
| Maintenance cost (bus factor, churn) | 3 | 4 |
| Size | 4 | 5 |
| Transitive dependencies | 5 | 5 |
| Licence | 5 | 5 |
| Fit (two kinds, write-back handle, cancel as `null`) | 4 | 5 |
| **Total** | **21** | **24** |

`browser-fs-access` covers much more than the editor uses (directories,
multiple files, legacy cancel detection that the `cancel` event of the file
input now replaces in every engine the editor supports), carries a single
maintainer, and its interface would still need a wrapper to return the
handle and text together and to map cancellation to `null`. The two picker
calls and the two fallbacks are shorter than that wrapper.

Primary sources:
<https://registry.npmjs.org/browser-fs-access>,
<https://github.com/GoogleChromeLabs/browser-fs-access>,
<https://github.com/GoogleChromeLabs/browser-fs-access/blob/main/LICENSE>,
<https://wicg.github.io/file-system-access/>,
<https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)>.

## Decision

Write the file access in `editor/src/files.ts`: `openFile(kind)` and
`saveFile(text, kind, name, handle?)`, both resolving `null` when the
viewer cancels and rethrowing any other failure. The editor shows such a
failure, like a refused file, in its message area.

## Consequences

No runtime dependency is added. The unit tests stub the pickers and the
fallback input and link in jsdom; the end-to-end tests drive the fallback
path (the file chooser and the download event), which every engine offers,
by removing the pickers from the page in Chromium. The exit cost is small:
the two functions keep their signatures if their bodies are replaced by
`browser-fs-access` calls.

## Review date

2027-04-12.
