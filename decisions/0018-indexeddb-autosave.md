---
status: accepted
date: 2026-10-11
---

# Autosave to IndexedDB written in `editor`, tested with fake-indexeddb

## Context

The editor keeps the last state of every open workspace in the browser so
that a crashed or closed tab can be recovered. The stored value is the text
`writeWorkspace` returns; the autosave never parses it. The required surface
is small: one object store, one slot per workspace key, and three operations
(put, get, delete) plus a debounce in front of the put. Failures must reach
the caller as rejected promises.

The unit tests run under Vitest in Node with jsdom, which provides no
IndexedDB. They need a real implementation of the IndexedDB API in Node, or a
browser test runner.

The npm registry was checked on 2026-10-11.

## Considered options

Storage access:

- `idb-keyval` 6.3.0 (released 2026-07-08, Apache-2.0, no runtime
  dependencies, 55,849 bytes unpacked, maintained by Jake Archibald): a
  promise-based key-value store over one object store.
- Write it ourselves in `editor/src/autosave.ts`: open the database, run one
  request in one transaction, wrap the request's `success`/`error` events in
  a promise. About forty lines.

IndexedDB in tests:

- `fake-indexeddb` 6.2.5 (released 2025-11-07, Apache-2.0, no runtime
  dependencies, 340,358 bytes unpacked, maintained by Jeremy Scheff, 696
  stars and 7 open issues on 2026-10-11, last push 2026-05-13): a pure
  JavaScript, in-memory implementation of IndexedDB that passes most of the
  W3C web-platform tests, usable as a fresh `IDBFactory` per test.
- A browser runner (Vitest browser mode with Playwright): real IndexedDB,
  but a browser download, a second test configuration, and slower runs for a
  module of three operations.

Scores run from 1 (least suitable) to 5 (most suitable). For maintenance and
size, a higher score means less code or package surface to carry.

| Criterion | `idb-keyval` | Own code |
| --- | ---: | ---: |
| Maintenance cost | 4 | 4 |
| Size | 4 | 5 |
| Transitive dependencies | 5 | 5 |
| Licence | 5 | 5 |
| Fit (one store, errors as rejections) | 4 | 5 |
| **Total** | **22** | **24** |

| Criterion | `fake-indexeddb` | Browser runner |
| --- | ---: | ---: |
| Maintenance cost | 4 | 3 |
| Size | 4 | 2 |
| Transitive dependencies | 5 | 2 |
| Licence | 5 | 5 |
| Fit (hermetic, per-test factory, fake timers) | 5 | 3 |
| **Total** | **23** | **15** |

`idb-keyval` fits well but adds a runtime dependency whose store naming and
connection caching we would have to work around to give each test a fresh
factory; the three requests it would wrap are shorter than the wrapper
around it. `fake-indexeddb` keeps the tests in the existing jsdom
configuration and lets each test install its own empty `IDBFactory`.

Primary sources:
<https://registry.npmjs.org/idb-keyval>,
<https://github.com/jakearchibald/idb-keyval>,
<https://registry.npmjs.org/fake-indexeddb>,
<https://github.com/dumbmatter/fakeIndexedDB>,
<https://github.com/dumbmatter/fakeIndexedDB/blob/master/LICENSE>.

## Decision

Write the IndexedDB access in `editor/src/autosave.ts`, reading
`globalThis.indexedDB` at each call. Test it with `fake-indexeddb` 6.2.5, a
development dependency of `@timetoalign/tilie-editor` only: nothing ships to
users.

`fake-indexeddb` schedules its events with `setImmediate`, so tests that use
Vitest's fake timers fake only `setTimeout` and `clearTimeout`.

## Consequences

No runtime dependency is added. The exit cost is small in both directions:
replacing the three requests with `idb-keyval` keeps the module's exported
functions and tests unchanged, and moving the tests to a browser runner
removes one development dependency and the per-test factory.

## Review date

2027-04-10.
